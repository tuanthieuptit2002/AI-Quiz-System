import type { Request, RequestHandler } from 'express';
import { Db, ObjectId, type Filter, type ClientSession } from 'mongodb';
import { z } from 'zod';
import { collections } from '../database/collections.js';
import { httpError, objectId, escapeRegex } from '../common/http.js';
import { parseQuestion } from '../common/question.validation.js';
import {
  readQuestionFile,
  writeQuestionFile,
  sampleQuestions,
  transferLimit,
} from '../common/question-transfer.js';
import {
  questionContent,
  questionDto,
  difficulties,
  questionTypes,
  questionStatuses,
  type Question,
  type QuestionContent,
} from '../models/question.model.js';

const querySchema = z.object({
  search: z.string().trim().max(200).default(''),
  subject: z.string().max(100).default(''),
  topic: z.string().max(520).default(''),
  difficulty: z.enum(difficulties).optional(),
  type: z.enum(questionTypes).optional(),
  status: z.enum(questionStatuses).optional(),
  tag: z.string().max(40).default(''),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});
const revisionSchema = z.object({
  version: z.number().int().positive(),
  note: z.string().trim().max(300).default(''),
});
const formatSchema = z.enum(['csv', 'xlsx']);

export function createQuestionController(db: Db) {
  const c = collections(db);
  const scope = (req: Request): Filter<Question> =>
    req.user!.role === 'ADMIN' ? {} : { ownerId: req.user!._id };
  const filterFor = (req: Request) => {
    const query = querySchema.parse(req.query);
    const filter: Filter<Question> = { ...scope(req) };
    if (query.subject) filter.subject = query.subject;
    if (query.topic)
      query.topic.split(' / ').forEach((part, i) => {
        Object.assign(filter, { [`topicPath.${i}`]: part });
      });
    if (query.type) filter.type = query.type;
    if (query.status) filter.status = query.status;
    if (query.difficulty) filter.difficulty = query.difficulty;
    if (query.tag) filter.tags = query.tag;
    if (query.search) {
      const regex = { $regex: escapeRegex(query.search), $options: 'i' };
      filter.$or = [{ question: regex }, { subject: regex }, { topicPath: regex }, { tags: regex }];
    }
    return { filter, page: query.page };
  };
  const owned = async (req: Request) => {
    const question = await c.questions.findOne({ _id: objectId(req.params.id), ...scope(req) });
    if (!question) httpError(404, 'Không tìm thấy câu hỏi.');
    return question;
  };
  const transaction = async <T>(callback: (session: ClientSession) => Promise<T>) => {
    const session = db.client.startSession();
    try {
      return await session.withTransaction(() => callback(session));
    } finally {
      await session.endSession();
    }
  };
  const recordVersion = async (q: Question, req: Request, note: string, session: ClientSession) => {
    await c.questionVersions.insertOne(
      {
        _id: new ObjectId(),
        questionId: q._id,
        version: q.version,
        content: questionContent(q),
        editorId: req.user!._id,
        editorName: req.user!.name,
        note,
        createdAt: q.updatedAt,
      },
      { session },
    );
  };
  const newQuestion = (content: QuestionContent, req: Request): Question => ({
    ...content,
    _id: new ObjectId(),
    ownerId: req.user!._id,
    version: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const revise = async (
    req: Request,
    current: Question,
    content: QuestionContent,
    expected: number,
    note: string,
  ) => {
    const next = { ...current, ...content, version: current.version + 1, updatedAt: new Date() };
    await transaction(async (session) => {
      const result = await c.questions.replaceOne(
        { _id: current._id, version: expected, ...scope(req) },
        next,
        { session },
      );
      if (!result.matchedCount || expected !== current.version)
        httpError(409, 'Câu hỏi đã được sửa ở nơi khác. Tải lại trước khi lưu.');
      await recordVersion(next, req, note, session);
    });
    return next;
  };

  const list: RequestHandler = async (req, res) => {
    const { filter, page } = filterFor(req);
    const [questions, total] = await Promise.all([
      c.questions
        .find(filter, {
          projection: { image: 0, options: 0, answers: 0, pairs: 0, rubric: 0, explanation: 0 },
        })
        .sort({ updatedAt: -1, _id: -1 })
        .skip((page - 1) * 12)
        .limit(12)
        .toArray(),
      c.questions.countDocuments(filter),
    ]);
    res.json({
      questions: questions.map(questionDto),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / 12)),
    });
  };
  const metadata: RequestHandler = async (req, res) => {
    const [result] = await c.questions
      .aggregate([
        { $match: scope(req) },
        {
          $facet: {
            counts: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
            types: [{ $group: { _id: '$type', count: { $sum: 1 } } }],
            taxonomy: [
              {
                $group: {
                  _id: { subject: '$subject', topicPath: '$topicPath' },
                  count: { $sum: 1 },
                },
              },
              { $sort: { '_id.subject': 1, '_id.topicPath': 1 } },
            ],
            tags: [
              { $unwind: '$tags' },
              { $group: { _id: '$tags' } },
              { $sort: { _id: 1 } },
              { $limit: 200 },
            ],
          },
        },
      ])
      .toArray();
    res.json(result);
  };
  const get: RequestHandler = async (req, res) => {
    res.json(questionDto(await owned(req)));
  };
  const create: RequestHandler = async (req, res) => {
    const question = newQuestion(await parseQuestion(req.body), req);
    await transaction(async (session) => {
      await c.questions.insertOne(question, { session });
      await recordVersion(question, req, 'Tạo câu hỏi', session);
    });
    res.status(201).json(questionDto(question));
  };
  const update: RequestHandler = async (req, res) => {
    const current = await owned(req);
    const { content, ...revision } = z
      .object({ content: z.unknown(), version: z.number(), note: z.string().optional() })
      .strict()
      .parse(req.body);
    const { version, note } = revisionSchema.parse(revision);
    res.json(
      questionDto(
        await revise(
          req,
          current,
          await parseQuestion(content),
          version,
          note || 'Cập nhật câu hỏi',
        ),
      ),
    );
  };
  const archive: RequestHandler = async (req, res) => {
    const current = await owned(req);
    const { version } = revisionSchema.parse(req.body);
    res.json(
      questionDto(
        await revise(
          req,
          current,
          { ...questionContent(current), status: 'ARCHIVED' },
          version,
          'Lưu trữ câu hỏi',
        ),
      ),
    );
  };
  const duplicate: RequestHandler = async (req, res) => {
    const source = await owned(req);
    const question = newQuestion({ ...questionContent(source), status: 'DRAFT' }, req);
    await transaction(async (session) => {
      await c.questions.insertOne(question, { session });
      await recordVersion(question, req, `Nhân bản từ ${source._id.toHexString()}`, session);
    });
    res.status(201).json(questionDto(question));
  };
  const history: RequestHandler = async (req, res) => {
    const question = await owned(req);
    const page = z.coerce.number().int().min(1).default(1).parse(req.query.page);
    const versions = await c.questionVersions
      .find({ questionId: question._id }, { projection: { content: 0 } })
      .sort({ version: -1 })
      .skip((page - 1) * 20)
      .limit(20)
      .toArray();
    res.json({ versions, total: question.version, page });
  };
  const getVersion: RequestHandler = async (req, res) => {
    const question = await owned(req);
    const version = z.coerce.number().int().positive().parse(req.params.version);
    const snapshot = await c.questionVersions.findOne({ questionId: question._id, version });
    if (!snapshot) httpError(404, 'Không tìm thấy phiên bản.');
    res.json(snapshot);
  };
  const restore: RequestHandler = async (req, res) => {
    const current = await owned(req);
    const { version } = revisionSchema.parse(req.body);
    const target = z.coerce.number().int().positive().parse(req.params.version);
    const snapshot = await c.questionVersions.findOne({ questionId: current._id, version: target });
    if (!snapshot) httpError(404, 'Không tìm thấy phiên bản.');
    res.json(
      questionDto(
        await revise(req, current, snapshot.content, version, `Khôi phục từ phiên bản ${target}`),
      ),
    );
  };
  const download: RequestHandler = async (req, res) => {
    const format = formatSchema.parse(req.query.format || 'xlsx');
    const template = req.path === '/template';
    const questions = template
      ? sampleQuestions()
      : await c.questions
          .find(filterFor(req).filter)
          .sort({ updatedAt: -1, _id: -1 })
          .limit(transferLimit + 1)
          .toArray();
    if (questions.length > transferLimit)
      httpError(400, 'Mỗi lần xuất tối đa 100 câu hỏi. Hãy thu hẹp bộ lọc.');
    const buffer = await writeQuestionFile(questions, format);
    res.setHeader(
      'Content-Type',
      format === 'csv'
        ? 'text/csv; charset=utf-8'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="quizspace-${template ? 'template' : 'questions'}.${format}"`,
    );
    res.send(buffer);
  };
  const previewImport: RequestHandler = async (req, res) => {
    if (!Buffer.isBuffer(req.body)) httpError(400, 'Gửi file dạng application/octet-stream.');
    const rows = await readQuestionFile(req.body, formatSchema.parse(req.query.format));
    const questions: QuestionContent[] = [];
    const errors: { row: number; message: string }[] = [];
    for (const row of rows) {
      try {
        if (row.error) throw new Error(row.error);
        questions.push(await parseQuestion(row.data));
      } catch (error) {
        errors.push({
          row: row.row,
          message:
            error instanceof z.ZodError
              ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
              : (error as Error).message,
        });
      }
    }
    if (errors.length) {
      res.json({
        total: rows.length,
        valid: questions.length,
        errors,
        importId: null,
        preview: [],
      });
      return;
    }
    if (Buffer.byteLength(JSON.stringify(questions)) > 6 * 1024 * 1024)
      httpError(400, 'Dữ liệu sau xử lý vượt 6 MB. Hãy chia thành nhiều file.');
    // Only one pending preview per user; a new upload invalidates the previous one.
    await c.questionImports.deleteMany({ ownerId: req.user!._id });
    const job = {
      _id: new ObjectId(),
      ownerId: req.user!._id,
      questions,
      expiresAt: new Date(Date.now() + 15 * 60000),
    };
    await c.questionImports.insertOne(job);
    res.json({
      total: rows.length,
      valid: questions.length,
      errors: [],
      importId: job._id.toHexString(),
      preview: questions.map(({ type, question, subject, topicPath }) => ({
        type,
        question,
        subject,
        topicPath,
      })),
    });
  };
  const commitImport: RequestHandler = async (req, res) => {
    const id = objectId(req.params.importId);
    const count = await transaction(async (session) => {
      const job = await c.questionImports.findOneAndDelete(
        { _id: id, ownerId: req.user!._id, expiresAt: { $gt: new Date() } },
        { session },
      );
      if (!job) httpError(409, 'Bản xem trước đã hết hạn hoặc đã nhập. Hãy tải lại file.');
      const questions = job.questions.map((content) => newQuestion(content, req));
      await c.questions.insertMany(questions, { session });
      for (const question of questions) await recordVersion(question, req, 'Nhập từ file', session);
      return questions.length;
    });
    res.status(201).json({ count });
  };
  return {
    list,
    metadata,
    get,
    create,
    update,
    archive,
    duplicate,
    history,
    getVersion,
    restore,
    download,
    previewImport,
    commitImport,
  };
}
