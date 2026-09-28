import type { Request, RequestHandler } from 'express';
import { Db, ObjectId, type Filter } from 'mongodb';
import { z } from 'zod';
import { collections } from '../database/collections.js';
import { examSchema, blueprintSchema } from '../common/exam.validation.js';
import { httpError, objectId, escapeRegex } from '../common/http.js';
import { hashPassword } from '../common/security.js';
import {
  difficulties,
  questionContent,
  questionDto,
  type Question,
} from '../models/question.model.js';
import { examDto, type Exam, type ExamQuestion } from '../models/exam.model.js';
import { runDto } from '../common/exam-runtime.js';

export function createExamController(db: Db) {
  const c = collections(db);
  const scope = (req: Request): Filter<Exam> =>
    req.user!.role === 'ADMIN' ? {} : { ownerId: req.user!._id };
  const bankScope = (req: Request): Filter<Question> =>
    req.user!.role === 'ADMIN' ? {} : { ownerId: req.user!._id };
  const owned = async (req: Request) => {
    const exam = await c.exams.findOne({ _id: objectId(req.params.id), ...scope(req) });
    if (!exam) httpError(404, 'Không tìm thấy đề thi.');
    return exam;
  };
  const generate: RequestHandler = async (req, res) => {
    const body = z
      .object({
        subject: z.string().trim().min(1).max(100),
        topic: z.string().max(520).default(''),
        counts: blueprintSchema,
      })
      .strict()
      .parse(req.body);
    const total = Object.values(body.counts).reduce((s, n) => s + n, 0);
    if (!total || total > 100) httpError(400, 'Chọn từ 1 đến 100 câu hỏi.');
    const questions: Question[] = [];
    for (const difficulty of difficulties) {
      const count = body.counts[difficulty];
      if (!count) continue;
      const filter: Filter<Question> = {
        ...bankScope(req),
        status: 'READY',
        subject: body.subject,
        difficulty,
      };
      if (body.topic)
        body.topic.split(' / ').forEach((v, i) => Object.assign(filter, { [`topicPath.${i}`]: v }));
      const found = await c.questions
        .aggregate<Question>([{ $match: filter }, { $sample: { size: count } }])
        .toArray();
      if (found.length < count)
        httpError(
          400,
          `Không đủ câu hỏi ${{ EASY: 'Dễ', MEDIUM: 'Trung bình', HARD: 'Khó', VERY_HARD: 'Rất khó' }[difficulty]}: cần ${count}, có ${found.length}. Chỉ dùng câu hỏi Sẵn sàng.`,
        );
      questions.push(...found);
    }
    if (Buffer.byteLength(JSON.stringify(questions)) > 10 * 1024 * 1024)
      httpError(400, 'Đề chứa quá nhiều dữ liệu ảnh (tối đa 10 MB).');
    res.json({ questions: questions.map(questionDto) });
  };
  const audience: RequestHandler = async (req, res) => {
    const classes = await c.classes
      .find(req.user!.role === 'ADMIN' ? {} : { teacherId: req.user!._id })
      .sort({ name: 1 })
      .toArray();
    const students = await c.users
      .find(
        {
          role: 'STUDENT',
          status: 'ACTIVE',
          ...(req.user!.role === 'ADMIN'
            ? {}
            : { _id: { $in: classes.flatMap((cl) => cl.studentIds) } }),
        },
        { projection: { name: 1, email: 1 } },
      )
      .sort({ name: 1 })
      .toArray();
    res.json({
      classes: classes.map((cl) => ({
        id: cl._id.toHexString(),
        name: cl.name,
        subject: cl.subject,
        count: cl.studentIds.length,
      })),
      students: students.map((u) => ({ id: u._id.toHexString(), name: u.name, email: u.email })),
    });
  };
  async function content(req: Request, initial?: Exam) {
    const body = examSchema.parse(req.body);
    const ownerId = initial?.ownerId || req.user!._id;
    const classes = await c.classes
      .find(req.user!.role === 'ADMIN' ? {} : { teacherId: ownerId })
      .toArray();
    if (body.settings.classIds.some((id) => !classes.some((cl) => cl._id.toHexString() === id)))
      httpError(400, 'Bạn chỉ được giao đề cho lớp mình quản lý.');
    const ids = body.settings.studentIds.map(objectId);
    const students = await c.users
      .find({ _id: { $in: ids }, role: 'STUDENT', status: 'ACTIVE' })
      .toArray();
    if (
      students.length !== new Set(body.settings.studentIds).size ||
      (req.user!.role !== 'ADMIN' &&
        ids.some((id) => !classes.some((cl) => cl.studentIds.some((sid) => sid.equals(id)))))
    )
      httpError(400, 'Chỉ chọn học sinh đang hoạt động thuộc lớp của bạn.');
    const questions: ExamQuestion[] = [];
    for (const selected of body.selections) {
      const snapshot = initial?.questions.find(
        (q) => q.questionId.toHexString() === selected.questionId && q.version === selected.version,
      );
      if (snapshot) questions.push({ ...snapshot, points: selected.points });
      else {
        const q = await c.questions.findOne({
          _id: objectId(selected.questionId),
          version: selected.version,
          status: 'READY',
          ...bankScope(req),
        });
        if (!q)
          httpError(
            409,
            'Câu hỏi đã thay đổi, chưa Sẵn sàng hoặc không thuộc quyền quản lý. Chọn lại câu hỏi.',
          );
        questions.push({
          questionId: q._id,
          version: q.version,
          points: selected.points,
          content: questionContent(q),
        });
      }
    }
    if (questions.some((q) => q.content.subject !== body.subject))
      httpError(400, 'Các câu hỏi phải thuộc môn học của đề.');
    if (
      body.mode === 'AUTO' &&
      questions.length &&
      difficulties.some(
        (d) => questions.filter((q) => q.content.difficulty === d).length !== body.blueprint[d],
      )
    )
      httpError(
        400,
        'Số câu hỏi không khớp ma trận độ khó. Hãy random lại hoặc chuyển sang thủ công.',
      );
    if (Buffer.byteLength(JSON.stringify(questions)) > 10 * 1024 * 1024)
      httpError(400, 'Đề chứa quá nhiều ảnh. Tối đa 10 MB.');
    const { selections: _selections, passwordAction, password, settings, ...fields } = body;
    return {
      ...fields,
      questions,
      settings: {
        ...settings,
        classIds: settings.access === 'ALL' ? [] : [...new Set(settings.classIds)].map(objectId),
        studentIds:
          settings.access === 'ALL' ? [] : [...new Set(settings.studentIds)].map(objectId),
      },
      passwordHash:
        passwordAction === 'SET'
          ? await hashPassword(password)
          : passwordAction === 'REMOVE'
            ? ''
            : initial?.passwordHash || '',
    };
  }
  const list: RequestHandler = async (req, res) => {
    const { search, page, status } = z
      .object({
        search: z.string().max(200).default(''),
        page: z.coerce.number().int().min(1).max(10000).default(1),
        status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
      })
      .parse(req.query);
    const filter: Filter<Exam> = {
      ...scope(req),
      ...(status ? { status } : {}),
      ...(search ? { title: { $regex: escapeRegex(search), $options: 'i' } } : {}),
    };
    const [rows, total] = await Promise.all([
      c.exams
        .find(filter, { projection: { 'questions.content': 0 } })
        .sort({ updatedAt: -1, _id: -1 })
        .skip((page - 1) * 12)
        .limit(12)
        .toArray(),
      c.exams.countDocuments(filter),
    ]);
    res.json({
      exams: rows.map((e) => examDto(e, false)),
      total,
      pages: Math.max(1, Math.ceil(total / 12)),
    });
  };
  const get: RequestHandler = async (req, res) => {
    res.json(examDto(await owned(req)));
  };
  const create: RequestHandler = async (req, res) => {
    const exam: Exam = {
      ...(await content(req)),
      _id: new ObjectId(),
      ownerId: req.user!._id,
      status: 'DRAFT',
      version: 1,
      admissionRevision: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await c.exams.insertOne(exam);
    res.status(201).json(examDto(exam));
  };
  const update: RequestHandler = async (req, res) => {
    const exam = await owned(req);
    const { version, content: input } = z
      .object({ version: z.number().int().positive(), content: z.unknown() })
      .strict()
      .parse(req.body);
    if (exam.status !== 'DRAFT')
      httpError(409, 'Đề đã phát hành không thể sửa. Hãy nhân bản để tạo đề mới.');
    req.body = input;
    const fields = await content(req, exam);
    const updated = await c.exams.findOneAndUpdate(
      { _id: exam._id, version, status: 'DRAFT' },
      { $set: { ...fields, updatedAt: new Date() }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated) httpError(409, 'Đề đã được sửa ở nơi khác. Vui lòng tải lại.');
    res.json(examDto(updated));
  };
  const publish: RequestHandler = async (req, res) => {
    const exam = await owned(req);
    const { version } = z.object({ version: z.number().int().positive() }).strict().parse(req.body);
    if (
      exam.settings.access === 'RESTRICTED' &&
      !exam.settings.classIds.length &&
      !exam.settings.studentIds.length
    )
      httpError(400, 'Chọn đối tượng được thi trước khi phát hành.');
    if (!exam.questions.length || (exam.settings.endsAt && exam.settings.endsAt <= new Date()))
      httpError(400, 'Cần ít nhất một câu hỏi và lịch thi chưa kết thúc.');
    const updated = await c.exams.findOneAndUpdate(
      { _id: exam._id, status: 'DRAFT', version },
      { $set: { status: 'PUBLISHED', updatedAt: new Date() }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated) httpError(409, 'Đề không còn là bản nháp hoặc đã thay đổi.');
    res.json(examDto(updated));
  };
  const archive: RequestHandler = async (req, res) => {
    const exam = await owned(req);
    const { version } = z.object({ version: z.number().int().positive() }).strict().parse(req.body);
    const updated = await c.exams.findOneAndUpdate(
      { _id: exam._id, version },
      { $set: { status: 'ARCHIVED', updatedAt: new Date() }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!updated) httpError(409, 'Đề đã thay đổi.');
    res.json(examDto(updated));
  };
  const duplicate: RequestHandler = async (req, res) => {
    const exam = await owned(req);
    const copy: Exam = {
      ...exam,
      _id: new ObjectId(),
      ownerId: req.user!._id,
      title: `${exam.title.slice(0, 145)} (bản sao)`,
      status: 'DRAFT',
      version: 1,
      admissionRevision: 0,
      passwordHash: '',
      settings: {
        ...exam.settings,
        startsAt: null,
        endsAt: null,
        access: 'RESTRICTED',
        classIds: [],
        studentIds: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    // The copy needs an explicit audience before it can be saved/published.
    await c.exams.insertOne(copy);
    res.status(201).json(examDto(copy));
  };
  const submissions: RequestHandler = async (req, res) => {
    const exam = await owned(req);
    const page = z.coerce.number().int().min(1).default(1).parse(req.query.page);
    const filter = { examId: exam._id };
    const [rows, total] = await Promise.all([
      c.examRuns
        .find(filter, { projection: { questions: 0, responses: 0 } })
        .sort({ startedAt: -1 })
        .skip((page - 1) * 20)
        .limit(20)
        .toArray(),
      c.examRuns.countDocuments(filter),
    ]);
    res.json({
      runs: rows.map((r) => ({
        id: r._id.toHexString(),
        studentName: r.studentName,
        status: r.status,
        attemptNo: r.attemptNo,
        scorePercent: r.scorePercent,
        passed: r.passed,
        submittedAt: r.submittedAt,
      })),
      total,
      pages: Math.max(1, Math.ceil(total / 20)),
    });
  };
  const review: RequestHandler = async (req, res) => {
    const exam = await owned(req);
    const run = await c.examRuns.findOne({ _id: objectId(req.params.runId), examId: exam._id });
    if (!run) httpError(404, 'Không tìm thấy bài làm.');
    res.json(runDto(run, true));
  };
  return {
    list,
    get,
    create,
    update,
    publish,
    archive,
    duplicate,
    generate,
    audience,
    submissions,
    review,
  };
}
