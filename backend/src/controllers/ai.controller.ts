import type { Request, RequestHandler } from 'express';
import { Db, ObjectId, MongoServerError } from 'mongodb';
import { z } from 'zod';
import type { Config } from '../common/config.js';
import { httpError, objectId } from '../common/http.js';
import { generationSchema } from '../common/ai.validation.js';
import { extractDocument, readPublicURL } from '../common/ai-source.js';
import { expireAILeases } from '../common/ai-runtime.js';
import { parseQuestion } from '../common/question.validation.js';
import { collections } from '../database/collections.js';
import {
  generationDto,
  type AIGeneration,
  type AICandidate,
} from '../models/ai-generation.model.js';
import { questionContent, type Question } from '../models/question.model.js';

const revision = z.object({ version: z.number().int().positive() }).strict();
const selection = z
  .object({
    version: z.number().int().positive(),
    ids: z
      .array(z.uuid())
      .min(1)
      .max(50)
      .refine((ids) => new Set(ids).size === ids.length),
  })
  .strict();
const active = (job: AIGeneration) => ['QUEUED', 'GENERATING'].includes(job.status);

export function createAIController(db: Db, config: Config) {
  const c = collections(db);
  const scope = (req: Request) => (req.user!.role === 'ADMIN' ? {} : { ownerId: req.user!._id });
  const owned = async (req: Request) => {
    const job = await c.aiGenerations.findOne({ _id: objectId(req.params.id), ...scope(req) });
    if (!job) httpError(404, 'Không tìm thấy đợt câu hỏi AI.');
    return job;
  };
  const editable = (job: AIGeneration, version: number) => {
    if (active(job))
      httpError(409, 'AI đang tạo câu hỏi. Vui lòng chờ hoàn tất trước khi duyệt hoặc sửa.');
    if (job.version !== version)
      httpError(409, 'Đợt câu hỏi đã thay đổi. Tải lại trước khi thao tác.');
  };
  const ensureReady = () => {
    if (!config.deepseekApiKey) httpError(503, 'Chưa cấu hình DEEPSEEK_API_KEY trên backend.');
  };
  const replaceItems = async (job: AIGeneration, items: AICandidate[]) => {
    if (Buffer.byteLength(JSON.stringify(items)) > 10 * 1024 * 1024)
      httpError(400, 'Đợt câu hỏi vượt 10 MB. Hãy giảm ảnh hoặc nội dung.');
    const next = await c.aiGenerations.findOneAndUpdate(
      { _id: job._id, version: job.version, status: job.status },
      { $set: { items, updatedAt: new Date() }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!next) httpError(409, 'Dữ liệu đã thay đổi. Tải lại để tiếp tục.');
    return next;
  };
  const enqueue = async (job: AIGeneration, regenerateId: string | null, feedback: string) => {
    ensureReady();
    try {
      const next = await c.aiGenerations.findOneAndUpdate(
        { _id: job._id, version: job.version, status: job.status },
        {
          $set: { status: 'QUEUED', error: '', regenerateId, feedback, updatedAt: new Date() },
          $inc: { version: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!next) httpError(409, 'Dữ liệu đã thay đổi. Tải lại để tiếp tục.');
      return next;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000)
        httpError(409, 'Bạn đang có một đợt AI khác đang chạy.');
      throw error;
    }
  };
  const status: RequestHandler = (_req, res) =>
    res.json({
      configured: !!config.deepseekApiKey,
      provider: 'DeepSeek',
      model: config.deepseekModel || 'deepseek-flash',
      maxCount: 50,
      maxSourceChars: 60000,
      maxFileMB: 8,
    });
  const extract: RequestHandler = async (req, res) => {
    const filename = z.string().min(1).max(250).parse(req.query.filename);
    if (!Buffer.isBuffer(req.body)) httpError(400, 'Vui lòng tải lên file nhị phân.');
    res.json(await extractDocument(req.body, filename));
  };
  const fromURL: RequestHandler = async (req, res) => {
    const { url } = z
      .object({ url: z.string().url().max(2000) })
      .strict()
      .parse(req.body);
    res.json(await readPublicURL(url));
  };
  const list: RequestHandler = async (req, res) => {
    await expireAILeases(db);
    const page = z.coerce.number().int().min(1).max(10000).default(1).parse(req.query.page);
    const [jobs, total] = await Promise.all([
      c.aiGenerations
        .find(scope(req), {
          projection: { 'items.content': 0, 'items.evidence': 0, 'source.text': 0 },
        })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * 10)
        .limit(10)
        .toArray(),
      c.aiGenerations.countDocuments(scope(req)),
    ]);
    res.json({
      jobs: jobs.map((job) => generationDto(job, false)),
      page,
      pages: Math.max(1, Math.ceil(total / 10)),
      total,
    });
  };
  const get: RequestHandler = async (req, res) => {
    await expireAILeases(db);
    res.json(generationDto(await owned(req)));
  };
  const create: RequestHandler = async (req, res) => {
    const input = generationSchema.parse(req.body);
    const existing = await c.aiGenerations.findOne({
      ownerId: req.user!._id,
      requestId: input.requestId,
    });
    if (existing) {
      res.json(generationDto(existing));
      return;
    }
    ensureReady();
    await expireAILeases(db);
    const recent = await c.aiGenerations.countDocuments({
      ownerId: req.user!._id,
      createdAt: { $gt: new Date(Date.now() - 86400000) },
    });
    if (recent >= 30) httpError(429, 'Mỗi tài khoản tạo tối đa 30 đợt AI/ngày.');
    const job: AIGeneration = {
      ...input,
      _id: new ObjectId(),
      ownerId: req.user!._id,
      model: config.deepseekModel || 'deepseek-flash',
      status: 'QUEUED',
      items: [],
      version: 1,
      error: '',
      regenerateId: null,
      feedback: '',
      leaseId: null,
      leaseUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    try {
      await c.aiGenerations.insertOne(job);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const same = await c.aiGenerations.findOne({
          ownerId: job.ownerId,
          requestId: job.requestId,
        });
        if (same) {
          res.json(generationDto(same));
          return;
        }
        httpError(409, 'Bạn đang có một đợt AI đang chạy. Mở lịch sử để theo dõi.');
      }
      throw error;
    }
    res.status(202).json(generationDto(job));
  };
  const edit: RequestHandler = async (req, res) => {
    const { version, content } = z
      .object({ version: z.number().int().positive(), content: z.unknown() })
      .strict()
      .parse(req.body);
    const job = await owned(req);
    editable(job, version);
    const id = z.uuid().parse(req.params.itemId);
    const item = job.items.find((item) => item.id === id);
    if (!item) httpError(404, 'Không tìm thấy câu hỏi.');
    if (item.status !== 'PENDING') httpError(409, 'Chỉ có thể sửa câu hỏi đang chờ duyệt.');
    const parsed = await parseQuestion(content);
    parsed.status = 'DRAFT';
    if (!parsed.explanation) httpError(400, 'Cần có giải thích trước khi duyệt câu hỏi AI.');
    const next = await replaceItems(
      job,
      job.items.map((item) =>
        item.id === id ? { ...item, content: parsed, revision: item.revision + 1 } : item,
      ),
    );
    res.json(generationDto(next));
  };
  const reject: RequestHandler = async (req, res) => {
    const { version, ids } = selection.parse(req.body);
    const job = await owned(req);
    editable(job, version);
    if (ids.some((id) => !job.items.some((item) => item.id === id && item.status === 'PENDING')))
      httpError(409, 'Chỉ từ chối các câu đang chờ duyệt.');
    const next = await replaceItems(
      job,
      job.items.map((item) => (ids.includes(item.id) ? { ...item, status: 'REJECTED' } : item)),
    );
    res.json(generationDto(next));
  };
  const approve: RequestHandler = async (req, res) => {
    const { version, ids } = selection.parse(req.body);
    const job = await owned(req);
    editable(job, version);
    const chosen = ids.map((id) => job.items.find((item) => item.id === id));
    if (chosen.some((item) => !item || item.status !== 'PENDING'))
      httpError(409, 'Chỉ duyệt các câu đang chờ duyệt.');
    const now = new Date();
    const questions: Question[] = await Promise.all(
      chosen.map(async (item) => ({
        ...(await parseQuestion(item!.content)),
        status: 'READY',
        _id: new ObjectId(),
        ownerId: job.ownerId,
        version: 1,
        createdAt: now,
        updatedAt: now,
      })),
    );
    const items = job.items.map((item) => {
      const index = ids.indexOf(item.id);
      return index < 0
        ? item
        : { ...item, status: 'APPROVED' as const, questionId: questions[index]._id.toHexString() };
    });
    const resolvedRegeneration =
      job.regenerateId && ids.includes(job.regenerateId)
        ? {
            regenerateId: null,
            feedback: '',
            error:
              items.length < job.settings.count
                ? 'Bấm Thử lại để tiếp tục tạo các câu còn thiếu.'
                : '',
            status: items.length < job.settings.count ? ('FAILED' as const) : ('REVIEW' as const),
          }
        : {};
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        const changed = await c.aiGenerations.updateOne(
          { _id: job._id, version, status: job.status },
          { $set: { items, updatedAt: now, ...resolvedRegeneration }, $inc: { version: 1 } },
          { session },
        );
        if (!changed.matchedCount) httpError(409, 'Dữ liệu đã thay đổi. Tải lại để tiếp tục.');
        await c.questions.insertMany(questions, { session });
        await c.questionVersions.insertMany(
          questions.map((q) => ({
            _id: new ObjectId(),
            questionId: q._id,
            version: 1,
            content: questionContent(q),
            editorId: req.user!._id,
            editorName: req.user!.name,
            note: `Duyệt câu hỏi AI DeepSeek · ${job._id.toHexString()}`,
            createdAt: now,
          })),
          { session },
        );
      });
    } finally {
      await session.endSession();
    }
    res.json(
      generationDto({
        ...job,
        ...resolvedRegeneration,
        items,
        version: version + 1,
        updatedAt: now,
      }),
    );
  };
  const regenerate: RequestHandler = async (req, res) => {
    const { version, feedback } = z
      .object({
        version: z.number().int().positive(),
        feedback: z.string().trim().max(1000).default(''),
      })
      .strict()
      .parse(req.body);
    const job = await owned(req);
    editable(job, version);
    const id = z.uuid().parse(req.params.itemId);
    const item = job.items.find((item) => item.id === id);
    if (!item) httpError(404, 'Không tìm thấy câu hỏi.');
    if (item.status === 'APPROVED')
      httpError(409, 'Câu đã duyệt cần chỉnh sửa trong ngân hàng câu hỏi.');
    res.status(202).json(generationDto(await enqueue(job, id, feedback)));
  };
  const retry: RequestHandler = async (req, res) => {
    const { version } = revision.parse(req.body);
    const job = await owned(req);
    editable(job, version);
    if (job.status !== 'FAILED') httpError(409, 'Chỉ thử lại đợt tạo bị lỗi.');
    res.status(202).json(generationDto(await enqueue(job, job.regenerateId, job.feedback)));
  };
  return { status, extract, fromURL, list, get, create, edit, reject, approve, regenerate, retry };
}
