import type { Request, RequestHandler } from 'express';
import { Db, ObjectId, MongoServerError } from 'mongodb';
import { z } from 'zod';
import type { Config } from '../common/config.js';
import { httpError, objectId } from '../common/http.js';
import {
  aiExamRequest,
  aiExamPlanSchema,
  allocateCounts,
  examStrategy,
} from '../common/ai-exam.validation.js';
import { examOwner, expireAIExamLeases, selectExamBank } from '../common/ai-exam-runtime.js';
import { normalizedText } from '../common/ai.validation.js';
import { parseQuestion } from '../common/question.validation.js';
import { collections } from '../database/collections.js';
import { aiExamDto, type AIExamJob } from '../models/ai-exam.model.js';
import { questionContent, type Question } from '../models/question.model.js';
import { examDto, type Exam, type ExamQuestion } from '../models/exam.model.js';

const versionSchema = z.object({ version: z.number().int().positive() }).strict();
export function createAIExamController(db: Db, config: Config) {
  const c = collections(db);
  const scope = (req: Request) => (req.user!.role === 'ADMIN' ? {} : { ownerId: req.user!._id });
  const owned = async (req: Request) => {
    const job = await c.aiExams.findOne({ _id: objectId(req.params.id), ...scope(req) });
    if (!job) httpError(404, 'Không tìm thấy đề AI.');
    return job;
  };
  const ready = () => {
    if (!config.deepseekApiKey) httpError(503, 'Chưa cấu hình DEEPSEEK_API_KEY trên backend.');
  };
  const editable = (job: AIExamJob, version: number) => {
    if (['QUEUED', 'WORKING', 'SAVED'].includes(job.status))
      httpError(409, 'Đề đang xử lý hoặc đã lưu. Hãy tải lại.');
    if (job.version !== version) httpError(409, 'Đề đã thay đổi. Tải lại trước khi thao tác.');
  };
  const update = async (job: AIExamJob, patch: Partial<AIExamJob>) => {
    if (patch.items && Buffer.byteLength(JSON.stringify(patch.items)) > 10 * 1024 * 1024)
      httpError(400, 'Đề vượt giới hạn 10 MB.');
    try {
      const next = await c.aiExams.findOneAndUpdate(
        { _id: job._id, version: job.version, status: job.status },
        {
          $set: { ...patch, updatedAt: new Date() },
          $inc: { version: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!next) httpError(409, 'Đề đã thay đổi. Hãy tải lại.');
      return next;
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000)
        httpError(409, 'Bạn đang có một đề AI khác đang xử lý.');
      throw error;
    }
  };
  const create: RequestHandler = async (req, res) => {
    const input = aiExamRequest.parse(req.body);
    const same = await c.aiExams.findOne({ ownerId: req.user!._id, requestId: input.requestId });
    if (same) {
      res.json(aiExamDto(same));
      return;
    }
    ready();
    await expireAIExamLeases(db);
    if (
      (await c.aiExams.countDocuments({
        ownerId: req.user!._id,
        createdAt: { $gt: new Date(Date.now() - 86400000) },
      })) >= 20
    )
      httpError(429, 'Mỗi tài khoản tạo tối đa 20 đề AI/ngày.');
    const job: AIExamJob = {
      ...input,
      _id: new ObjectId(),
      ownerId: req.user!._id,
      model: config.deepseekModel || 'deepseek-flash',
      status: 'QUEUED',
      phase: 'PLAN',
      plan: null,
      items: [],
      replaceId: null,
      feedback: '',
      examId: null,
      version: 1,
      error: '',
      leaseId: null,
      leaseUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    try {
      await c.aiExams.insertOne(job);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const existing = await c.aiExams.findOne({
          ownerId: job.ownerId,
          requestId: job.requestId,
        });
        if (existing) {
          res.json(aiExamDto(existing));
          return;
        }
        httpError(409, 'Bạn đang có một đề AI đang xử lý. Mở lịch sử để theo dõi.');
      }
      throw error;
    }
    res.status(202).json(aiExamDto(job));
  };
  const list: RequestHandler = async (req, res) => {
    await expireAIExamLeases(db);
    const page = z.coerce.number().int().min(1).max(10000).default(1).parse(req.query.page);
    const [jobs, total] = await Promise.all([
      c.aiExams
        .find(scope(req), { projection: { 'items.content': 0 } })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * 10)
        .limit(10)
        .toArray(),
      c.aiExams.countDocuments(scope(req)),
    ]);
    res.json({
      jobs: jobs.map((j) => aiExamDto(j, false)),
      total,
      pages: Math.max(1, Math.ceil(total / 10)),
    });
  };
  const get: RequestHandler = async (req, res) => {
    await expireAIExamLeases(db);
    res.json(aiExamDto(await owned(req)));
  };
  const plan: RequestHandler = async (req, res) => {
    const body = z
      .object({
        version: z.number().int().positive(),
        plan: aiExamPlanSchema,
        strategy: examStrategy,
      })
      .strict()
      .parse(req.body);
    const job = await owned(req);
    editable(job, body.version);
    if (job.items.length || !job.plan) httpError(409, 'Chỉ sửa cấu trúc trước khi ghép câu hỏi.');
    if (allocateCounts(body.plan).some((n) => !n))
      httpError(400, 'Mỗi chủ đề cần ít nhất một câu. Tăng tỷ lệ hoặc số câu.');
    res.json(
      aiExamDto(
        await update(job, {
          plan: body.plan,
          strategy: body.strategy,
          status: 'PLANNED',
          phase: 'PLAN',
          error: '',
        }),
      ),
    );
  };
  const coverage: RequestHandler = async (req, res) => {
    const job = await owned(req);
    if (!job.plan) httpError(409, 'Chưa có cấu trúc đề.');
    const counts = allocateCounts(job.plan);
    const bank =
      job.strategy === 'AI_ONLY'
        ? job.plan.sections.map(() => [])
        : await selectExamBank(db, job.ownerId, job.plan);
    res.json({
      sections: bank.map((items, i) => ({
        required: counts[i],
        fromBank: items.length,
        toGenerate: counts[i] - items.length,
      })),
    });
  };
  const build: RequestHandler = async (req, res) => {
    const { version } = versionSchema.parse(req.body),
      job = await owned(req);
    editable(job, version);
    if (job.status !== 'PLANNED') httpError(409, 'Duyệt cấu trúc đề trước khi tạo câu hỏi.');
    if (job.strategy !== 'BANK_ONLY') ready();
    res
      .status(202)
      .json(aiExamDto(await update(job, { phase: 'BUILD', status: 'QUEUED', error: '' })));
  };
  const retry: RequestHandler = async (req, res) => {
    const { version, strategy } = z
      .object({ version: z.number().int().positive(), strategy: examStrategy.optional() })
      .strict()
      .parse(req.body);
    const job = await owned(req);
    editable(job, version);
    if (job.status !== 'FAILED') httpError(409, 'Chỉ thử lại yêu cầu bị gián đoạn.');
    // Once questions exist, retain the source strategy so its meaning stays accurate.
    if (strategy && strategy !== job.strategy && job.items.length)
      httpError(409, 'Không đổi nguồn sau khi đã ghép câu hỏi.');
    if (job.phase !== 'BUILD' || (strategy || job.strategy) !== 'BANK_ONLY') ready();
    res
      .status(202)
      .json(
        aiExamDto(
          await update(job, { strategy: strategy || job.strategy, status: 'QUEUED', error: '' }),
        ),
      );
  };
  const edit: RequestHandler = async (req, res) => {
    const { version, content } = z
      .object({ version: z.number().int().positive(), content: z.unknown() })
      .strict()
      .parse(req.body);
    const job = await owned(req);
    editable(job, version);
    if (job.status !== 'REVIEW') httpError(409, 'Chờ tạo đủ câu trước khi chỉnh sửa.');
    const id = z.uuid().parse(req.params.itemId),
      item = job.items.find((i) => i.id === id);
    if (!item) httpError(404, 'Không tìm thấy câu hỏi.');
    const parsed = await parseQuestion(content),
      section = job.plan!.sections[item.section];
    if (
      parsed.subject !== job.plan!.subject ||
      parsed.type !== section.type ||
      parsed.difficulty !== section.difficulty ||
      parsed.topicPath[0] !== section.topic
    )
      httpError(400, 'Giữ môn học, chủ đề đầu tiên, độ khó và dạng câu theo cấu trúc đề.');
    if (!parsed.explanation) httpError(400, 'Cần giải thích đáp án trước khi lưu.');
    if (
      job.items.some(
        (i) =>
          i.id !== id &&
          normalizedText(i.content.question).toLowerCase() ===
            normalizedText(parsed.question).toLowerCase(),
      )
    )
      httpError(400, 'Câu hỏi bị trùng trong đề.');
    res.json(
      aiExamDto(
        await update(job, {
          items: job.items.map((i) =>
            i.id === id
              ? {
                  ...i,
                  content: { ...parsed, status: 'DRAFT' },
                  origin: 'EDITED',
                  questionId: null,
                  questionVersion: null,
                }
              : i,
          ),
        }),
      ),
    );
  };
  const replace: RequestHandler = async (req, res) => {
    const { version, feedback } = z
      .object({
        version: z.number().int().positive(),
        feedback: z.string().trim().max(1000).default(''),
      })
      .strict()
      .parse(req.body);
    const job = await owned(req);
    editable(job, version);
    ready();
    if (job.status !== 'REVIEW') httpError(409, 'Chờ tạo đủ câu trước khi thay câu.');
    const id = z.uuid().parse(req.params.itemId);
    if (!job.items.some((i) => i.id === id)) httpError(404, 'Không tìm thấy câu hỏi.');
    if (job.strategy === 'BANK_ONLY')
      httpError(400, 'Chế độ chỉ ngân hàng không sinh câu bằng AI. Bạn có thể sửa câu thủ công.');
    res.status(202).json(
      aiExamDto(
        await update(job, {
          phase: 'REPLACE',
          status: 'QUEUED',
          replaceId: id,
          feedback,
          error: '',
        }),
      ),
    );
  };
  const save: RequestHandler = async (req, res) => {
    const { version } = versionSchema.parse(req.body),
      job = await owned(req);
    if (job.status === 'SAVED') {
      res.json({
        job: aiExamDto(job),
        exam: examDto((await c.exams.findOne({ _id: job.examId! }))!),
      });
      return;
    }
    editable(job, version);
    const plan = job.plan;
    if (
      job.status !== 'REVIEW' ||
      !plan ||
      job.items.length !== plan.count ||
      allocateCounts(plan).some((n, i) => job.items.filter((q) => q.section === i).length !== n)
    )
      httpError(409, 'Đề cần đủ câu theo cấu trúc trước khi lưu.');
    const owner = await examOwner(db, job.ownerId);
    const now = new Date(),
      examId = new ObjectId(),
      questions: ExamQuestion[] = [],
      added: Question[] = [];
    for (const item of [...job.items].sort((a, b) => a.section - b.section)) {
      if (item.origin === 'BANK') {
        questions.push({
          questionId: item.questionId!,
          version: item.questionVersion!,
          points: 1,
          content: item.content,
        });
      } else {
        const q: Question = {
          ...(await parseQuestion(item.content)),
          status: 'READY',
          _id: new ObjectId(),
          ownerId: job.ownerId,
          version: 1,
          createdAt: now,
          updatedAt: now,
        };
        added.push(q);
        questions.push({ questionId: q._id, version: 1, points: 1, content: questionContent(q) });
      }
    }
    const blueprint = { EASY: 0, MEDIUM: 0, HARD: 0, VERY_HARD: 0 };
    questions.forEach((q) => blueprint[q.content.difficulty]++);
    const exam: Exam = {
      _id: examId,
      ownerId: job.ownerId,
      title: plan.title,
      subject: plan.subject,
      description: `${plan.description}\n\nCấu trúc: ${plan.sections.map((s, i) => `${s.topic}: ${allocateCounts(plan)[i]} câu (${s.percentage}%)`).join(' · ')}`,
      mode: 'MANUAL',
      topic: '',
      blueprint,
      questions,
      passwordHash: '',
      status: 'DRAFT',
      version: 1,
      admissionRevision: 0,
      settings: {
        startsAt: null,
        endsAt: null,
        durationMinutes: plan.durationMinutes,
        maxAttempts: 1,
        passScore: plan.passScore,
        randomQuestions: true,
        randomAnswers: true,
        showAnswers: false,
        allowBack: true,
        autoSubmit: true,
        access: 'RESTRICTED',
        classIds: [],
        studentIds: [],
      },
      createdAt: now,
      updatedAt: now,
    };
    const session = db.client.startSession();
    try {
      await session.withTransaction(async () => {
        const changed = await c.aiExams.updateOne(
          { _id: job._id, status: 'REVIEW', version },
          {
            $set: { status: 'SAVED', examId, updatedAt: now },
            $inc: { version: 1 },
          },
          { session },
        );
        if (!changed.matchedCount)
          httpError(409, 'Đề đã được lưu hoặc thay đổi. Tải lại trước khi tiếp tục.');
        for (const item of job.items.filter((i) => i.origin === 'BANK')) {
          const q = await c.questions.findOne(
            {
              _id: item.questionId!,
              version: item.questionVersion!,
              status: 'READY',
              ...(owner.role === 'ADMIN' ? {} : { ownerId: job.ownerId }),
            },
            { session },
          );
          if (!q)
            httpError(
              409,
              `Câu ngân hàng “${item.content.question.slice(0, 100)}” đã thay đổi hoặc bị lưu trữ. Sửa hoặc tạo lại câu này trước khi lưu đề.`,
            );
        }
        if (added.length) {
          await c.questions.insertMany(added, { session });
          await c.questionVersions.insertMany(
            added.map((q) => ({
              _id: new ObjectId(),
              questionId: q._id,
              version: 1,
              content: questionContent(q),
              editorId: req.user!._id,
              editorName: req.user!.name,
              note: `Duyệt từ AI Exam Generator · ${job._id.toHexString()}`,
              createdAt: now,
            })),
            { session },
          );
        }
        await c.exams.insertOne(exam, { session });
      });
    } finally {
      await session.endSession();
    }
    res.status(201).json({
      job: aiExamDto({ ...job, status: 'SAVED', examId, version: version + 1, updatedAt: now }),
      exam: examDto(exam),
    });
  };
  return { create, list, get, plan, coverage, build, retry, edit, replace, save };
}
