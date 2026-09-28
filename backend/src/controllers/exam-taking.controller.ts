import type { Request, RequestHandler } from 'express';
import { Db, ObjectId, type ClientSession } from 'mongodb';
import { z } from 'zod';
import { collections } from '../database/collections.js';
import { httpError, objectId } from '../common/http.js';
import { verifyPassword } from '../common/security.js';
import {
  deliverQuestions,
  finishRun,
  nextDwell,
  recordLeave,
  runDto,
  transaction,
} from '../common/exam-runtime.js';
import { clientActivityTypes } from '../models/exam-activity.model.js';
import { clientContext, recordExamActivity } from '../common/exam-activity.js';
import { assignedDue } from '../common/classroom.js';
import type { Exam, ExamRun } from '../models/exam.model.js';

export function createExamTakingController(db: Db) {
  const c = collections(db);
  const canAccess = async (exam: Exam, studentId: ObjectId, session?: ClientSession) =>
    exam.settings.access === 'ALL' ||
    exam.settings.studentIds.some((id) => id.equals(studentId)) ||
    !!(await c.classes.findOne(
      { _id: { $in: exam.settings.classIds }, studentIds: studentId },
      { session },
    ));
  const ownedRun = async (req: Request) => {
    const run = await c.examRuns.findOne({
      _id: objectId(req.params.runId),
      studentId: req.user!._id,
    });
    if (!run) httpError(404, 'Không tìm thấy lượt thi.');
    return (await finishRun(db, run._id, false, new Date(), undefined, clientContext(req))) || run;
  };
  const list: RequestHandler = async (req, res) => {
    const classes = await c.classes
      .find({ studentIds: req.user!._id }, { projection: { _id: 1 } })
      .toArray();
    const assigned = await c.assignments
      .find(
        { classId: { $in: classes.map((cl) => cl._id) } },
        { projection: { examId: 1, dueAt: 1 } },
      )
      .toArray();
    const dueOf = (examId: ObjectId) => {
      const times = assigned
        .filter((row) => row.examId.equals(examId))
        .map((row) => row.dueAt.getTime());
      return times.length ? new Date(Math.max(...times)) : null;
    };
    const runs = await c.examRuns
      .find({ studentId: req.user!._id }, { projection: { questions: 0, responses: 0 } })
      .sort({ startedAt: -1 })
      .toArray();
    const exams = await c.exams
      .find({
        $or: [
          {
            status: 'PUBLISHED',
            $or: [
              { 'settings.access': 'ALL' },
              { 'settings.studentIds': req.user!._id },
              { 'settings.classIds': { $in: classes.map((cl) => cl._id) } },
              { _id: { $in: assigned.map((row) => row.examId) } },
            ],
          },
          { _id: { $in: runs.map((r) => r.examId) } },
        ],
      })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({
      exams: exams.map((e) => ({
        id: e._id.toHexString(),
        title: e.title,
        description: e.description,
        subject: e.subject,
        status: e.status,
        questionCount: e.questions.length,
        totalPoints: e.questions.reduce((s, q) => s + q.points, 0),
        hasPassword: !!e.passwordHash,
        dueAt: dueOf(e._id),
        settings: {
          durationMinutes: e.settings.durationMinutes,
          maxAttempts: e.settings.maxAttempts,
          passScore: e.settings.passScore,
          startsAt: e.settings.startsAt,
          endsAt: e.settings.endsAt,
          showAnswers: e.settings.showAnswers,
          allowBack: e.settings.allowBack,
          autoSubmit: e.settings.autoSubmit,
          randomQuestions: e.settings.randomQuestions,
          randomAnswers: e.settings.randomAnswers,
          secure: e.settings.secure === true,
          leaveLimit: e.settings.leaveLimit ?? 3,
        },
        runs: runs
          .filter((r) => r.examId.equals(e._id))
          .map((r) => ({
            id: r._id.toHexString(),
            status: r.status,
            scorePercent: r.scorePercent,
            attemptNo: r.attemptNo,
            passed: r.passed,
          })),
      })),
      serverTime: new Date(),
    });
  };
  const start: RequestHandler = async (req, res) => {
    const id = objectId(req.params.id);
    const { password } = z
      .object({ password: z.string().max(72).default('') })
      .strict()
      .parse(req.body || {});
    const existing = await c.examRuns.findOne({
      examId: id,
      studentId: req.user!._id,
      status: 'RUNNING',
    });
    if (existing) {
      const current = await finishRun(db, existing._id);
      if (current?.status === 'RUNNING') {
        res.json(runDto(current));
        return;
      }
    }
    const exam = await c.exams.findOne({ _id: id, status: 'PUBLISHED' });
    if (
      !exam ||
      !((await assignedDue(c, id, req.user!._id)) || (await canAccess(exam, req.user!._id)))
    )
      httpError(404, 'Đề thi không khả dụng cho tài khoản này.');
    if (exam.passwordHash && !(await verifyPassword(password, exam.passwordHash)))
      httpError(403, 'Mã truy cập không chính xác.');
    const run = await transaction(db, async (session) => {
      // Serialize admissions against publication/archive and concurrent starts.
      const latest = await c.exams.findOneAndUpdate(
        { _id: id, status: 'PUBLISHED', version: exam.version },
        { $inc: { admissionRevision: 1 } },
        { session, returnDocument: 'after' },
      );
      const due = await assignedDue(c, id, req.user!._id, session);
      if (!latest || !(due || (await canAccess(latest, req.user!._id, session))))
        httpError(403, 'Đề thi hiện không khả dụng.');
      const now = new Date();
      if (due && now >= due) httpError(403, 'Đã quá hạn nộp bài của lớp.');
      if (latest.settings.startsAt && now < latest.settings.startsAt)
        httpError(403, 'Chưa đến giờ bắt đầu thi.');
      if (latest.settings.endsAt && now >= latest.settings.endsAt)
        httpError(403, 'Đã hết thời gian mở đề.');
      const active = await c.examRuns.findOne(
        { examId: id, studentId: req.user!._id, status: 'RUNNING' },
        { session },
      );
      if (active) return active;
      const count = await c.examRuns.countDocuments(
        { examId: id, studentId: req.user!._id },
        { session },
      );
      if (count >= latest.settings.maxAttempts) httpError(403, 'Bạn đã sử dụng hết số lượt thi.');
      const questions = deliverQuestions(latest);
      const expiresAt = new Date(
        Math.min(
          now.getTime() + latest.settings.durationMinutes * 60000,
          latest.settings.endsAt?.getTime() || Infinity,
          due?.getTime() || Infinity,
        ),
      );
      const run: ExamRun = {
        _id: new ObjectId(),
        examId: id,
        ownerId: latest.ownerId,
        studentId: req.user!._id,
        studentName: req.user!.name,
        title: latest.title,
        subject: latest.subject,
        attemptNo: count + 1,
        status: 'RUNNING',
        settings: {
          showAnswers: latest.settings.showAnswers,
          allowBack: latest.settings.allowBack,
          autoSubmit: latest.settings.autoSubmit,
          passScore: latest.settings.passScore,
          secure: latest.settings.secure === true,
          leaveLimit: latest.settings.leaveLimit ?? 3,
        },
        questions,
        responses: questions.map(() => []),
        flagged: questions.map(() => false),
        dwellMs: questions.map(() => 0),
        focusIndex: 0,
        focusedAt: now,
        awarded: questions.map(() => null),
        feedback: questions.map(() => ''),
        currentIndex: 0,
        revision: 0,
        startedAt: now,
        expiresAt,
        submittedAt: null,
        scorePercent: null,
        passed: null,
      };
      await c.examRuns.insertOne(run, { session });
      await recordExamActivity(db, run, 'exam_started', clientContext(req), session);
      return run;
    });
    res.status(201).json(runDto(run!));
  };
  const getRun: RequestHandler = async (req, res) => {
    const run = await ownedRun(req),
      dto = runDto(run);
    if (req.query.lean === '1' && run.settings.allowBack && run.status === 'RUNNING') {
      const { questions: _questions, ...state } = dto;
      res.json(state);
    } else res.json(dto);
  };
  const save: RequestHandler = async (req, res) => {
    const run = await ownedRun(req);
    if (run.status !== 'RUNNING') {
      res.json(runDto(run));
      return;
    }
    const body = z
      .object({
        revision: z.number().int().min(0),
        index: z.number().int().min(0),
        response: z.array(z.string().max(20000)).max(30),
        nextIndex: z.number().int().min(0).optional(),
        flagged: z.boolean().optional(),
        mutationId: z.uuid().optional(),
      })
      .strict()
      .parse(req.body);
    if (body.mutationId && body.mutationId === run.lastMutationId) {
      res.json(runDto(run));
      return;
    }
    const q = run.questions[body.index];
    const next = body.nextIndex ?? body.index;
    if (!q || next >= run.questions.length) httpError(400, 'Câu hỏi không hợp lệ.');
    if (
      !run.settings.allowBack &&
      (body.index !== run.currentIndex || (next !== body.index && next !== body.index + 1))
    )
      httpError(403, 'Đề không cho phép quay lại câu trước hoặc bỏ qua câu.');
    const r = body.response;
    if (q.type !== 'ESSAY' && r.some((s) => s.length > 1000))
      httpError(400, 'Mỗi câu trả lời tối đa 1.000 ký tự.');
    if (['SINGLE_CHOICE', 'TRUE_FALSE', 'SHORT_ANSWER', 'ESSAY'].includes(q.type) && r.length > 1)
      httpError(400, 'Câu hỏi chỉ nhận một câu trả lời.');
    if (
      ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE', 'ORDERING'].includes(q.type) &&
      (new Set(r).size !== r.length || r.some((id) => !q.options.some((o) => o.id === id)))
    )
      httpError(400, 'Lựa chọn không hợp lệ.');
    if (
      q.type === 'MATCHING' &&
      (r.length > q.left.length ||
        new Set(r.filter(Boolean)).size !== r.filter(Boolean).length ||
        r.some((id) => id && !q.options.some((o) => o.id === id)))
    )
      httpError(400, 'Các cặp trả lời không hợp lệ hoặc bị trùng.');
    if (q.type === 'FILL_BLANK' && r.length > q.blankCount)
      httpError(400, 'Số chỗ trống không hợp lệ.');
    const candidate = [...run.responses];
    candidate[body.index] = r;
    if (Buffer.byteLength(JSON.stringify({ ...run, responses: candidate })) > 13 * 1024 * 1024)
      httpError(400, 'Bài làm vượt giới hạn dữ liệu. Rút gọn phần trả lời tự luận.');
    const flagged = run.questions.map((_, i) =>
      i === body.index ? (body.flagged ?? run.flagged?.[i] ?? false) : (run.flagged?.[i] ?? false),
    );
    const timing = nextDwell(run, new Date(), next);
    const saved = await c.examRuns.findOneAndUpdate(
      { _id: run._id, status: 'RUNNING', revision: body.revision, expiresAt: { $gt: new Date() } },
      {
        $set: {
          [`responses.${body.index}`]: body.response,
          currentIndex: next,
          flagged,
          dwellMs: timing.dwellMs,
          focusIndex: timing.focusIndex,
          focusedAt: timing.focusedAt,
          ...(body.mutationId ? { lastMutationId: body.mutationId } : { lastMutationId: '' }),
        },
        $inc: { revision: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!saved) {
      const fresh = await finishRun(db, run._id, false, new Date(), undefined, clientContext(req));
      if (fresh && fresh.status !== 'RUNNING') {
        res.json(runDto(fresh));
        return;
      }
      httpError(409, 'Bài làm đã được cập nhật ở tab khác. Tải lại trước khi tiếp tục.');
    }
    const dto = runDto(saved);
    if (req.query.lean === '1' && saved.settings.allowBack && saved.status === 'RUNNING') {
      const { questions: _questions, ...state } = dto;
      res.json(state);
    } else res.json(dto);
  };
  const submit: RequestHandler = async (req, res) => {
    const run = await ownedRun(req);
    const { revision } = z
      .object({ revision: z.number().int().min(0).optional() })
      .parse(req.body || {});
    res.json(
      runDto((await finishRun(db, run._id, true, new Date(), revision, clientContext(req)))!),
    );
  };
  const report: RequestHandler = async (req, res) => {
    const run = await ownedRun(req);
    const limit = run.settings.leaveLimit ?? 3;
    if (run.status !== 'RUNNING' || run.settings.secure !== true) {
      res.json({
        accepted: false,
        violations: 0,
        limit,
        terminated: run.status === 'CANCELLED',
        warning: false,
      });
      return;
    }
    const body = z
      .object({ type: z.enum(clientActivityTypes) })
      .strict()
      .parse(req.body);
    if (body.type === 'tab_changed' || body.type === 'window_blur') {
      res.json(await recordLeave(db, run._id, body.type, clientContext(req)));
      return;
    }
    const accepted = await recordExamActivity(db, run, body.type, clientContext(req));
    res.json({ accepted, violations: 0, limit, terminated: false, warning: false });
  };
  return { list, start, getRun, save, report, submit };
}
