import type { Request, RequestHandler } from 'express';
import { Db, MongoServerError, ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Config } from '../common/config.js';
import { httpError, objectId } from '../common/http.js';
import { resultOf, runDto, transaction, writeResult } from '../common/exam-runtime.js';
import { gradingHash, gradingInput, isWrittenQuestion } from '../common/grading-provider.js';
import { expireGradingLeases } from '../common/grading-runtime.js';
import { collections } from '../database/collections.js';
import {
  gradingEventDto,
  suggestionDto,
  type GradingEvent,
  type GradingSuggestion,
} from '../models/grading.model.js';

export function createGradingController(db: Db, config: Config) {
  const c = collections(db);
  const owned = async (req: Request) => {
    const exam = await c.exams.findOne({
      _id: objectId(req.params.id),
      ...(req.user!.role === 'ADMIN' ? {} : { ownerId: req.user!._id }),
    });
    if (!exam) httpError(404, 'Không tìm thấy đề thi.');
    const run = await c.examRuns.findOne({ _id: objectId(req.params.runId), examId: exam._id });
    if (!run) httpError(404, 'Không tìm thấy bài làm.');
    return run;
  };
  const overview: RequestHandler = async (req, res) => {
    const run = await owned(req);
    await expireGradingLeases(db);
    const page = z.coerce.number().int().min(1).max(10000).default(1).parse(req.query.page);
    const [suggestions, history, total] = await Promise.all([
      c.gradingSuggestions
        .aggregate<GradingSuggestion>([
          { $match: { runId: run._id } },
          { $sort: { createdAt: -1, _id: -1 } },
          { $group: { _id: '$index', latest: { $first: '$$ROOT' } } },
          { $replaceRoot: { newRoot: '$latest' } },
          { $sort: { index: 1 } },
        ])
        .toArray(),
      c.gradingEvents
        .find({ runId: run._id })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * 20)
        .limit(20)
        .toArray(),
      c.gradingEvents.countDocuments({ runId: run._id }),
    ]);
    res.json({
      configured: !!config.deepseekApiKey,
      model: config.deepseekModel || 'deepseek-flash',
      suggestions: suggestions.map(suggestionDto),
      history: history.map(gradingEventDto),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / 20)),
    });
  };
  const suggest: RequestHandler = async (req, res) => {
    const run = await owned(req);
    const { index, requestId } = z
      .object({ index: z.number().int().min(0), requestId: z.uuid() })
      .strict()
      .parse(req.body);
    if (!['SUBMITTED', 'PENDING_REVIEW'].includes(run.status))
      httpError(409, 'Chỉ hỗ trợ bài đã nộp.');
    const q = run.questions[index];
    if (!q) httpError(400, 'Câu hỏi không hợp lệ.');
    const existing = await c.gradingSuggestions.findOne({ ownerId: req.user!._id, requestId });
    if (existing) {
      if (!existing.runId.equals(run._id) || existing.index !== index)
        httpError(409, 'Mã yêu cầu đã được dùng cho câu khác.');
      res.json(suggestionDto(existing));
      return;
    }
    const model = config.deepseekModel || 'deepseek-flash';
    gradingInput(q, run.responses[index], model);
    if (!config.deepseekApiKey)
      httpError(503, 'Chưa cấu hình DEEPSEEK_API_KEY. Bạn vẫn có thể chấm thủ công.');
    await expireGradingLeases(db);
    const count = await c.gradingSuggestions.countDocuments({
      ownerId: req.user!._id,
      createdAt: { $gt: new Date(Date.now() - 86400000) },
    });
    if (count >= 100)
      httpError(429, 'Mỗi tài khoản yêu cầu tối đa 100 đề xuất chấm điểm trong 24 giờ.');
    const job: GradingSuggestion = {
      _id: new ObjectId(),
      ownerId: req.user!._id,
      examId: run.examId,
      runId: run._id,
      index,
      requestId,
      sourceHash: gradingHash(q, run.responses[index]),
      model,
      status: 'QUEUED',
      proposal: null,
      error: '',
      version: 1,
      leaseId: null,
      leaseUntil: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    try {
      await c.gradingSuggestions.insertOne(job);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const same = await c.gradingSuggestions.findOne({ ownerId: job.ownerId, requestId });
        if (same && same.runId.equals(run._id) && same.index === index) {
          res.json(suggestionDto(same));
          return;
        }
        httpError(409, 'Đang có đề xuất AI được xử lý. Chờ hoàn tất rồi thử lại.');
      }
      throw error;
    }
    res.status(202).json(suggestionDto(job));
  };
  const dismiss: RequestHandler = async (req, res) => {
    const run = await owned(req);
    const { version } = z.object({ version: z.number().int().positive() }).strict().parse(req.body);
    const job = await c.gradingSuggestions.findOneAndUpdate(
      { _id: objectId(req.params.suggestionId), runId: run._id, version, status: 'READY' },
      { $set: { status: 'DISMISSED', updatedAt: new Date() }, $inc: { version: 1 } },
      { returnDocument: 'after' },
    );
    if (!job) httpError(409, 'Đề xuất đã thay đổi hoặc không thể bỏ qua. Tải lại để tiếp tục.');
    res.json(suggestionDto(job));
  };
  const grade: RequestHandler = async (req, res) => {
    const initial = await owned(req);
    const body = z
      .object({
        revision: z.number().int().min(0),
        grades: z
          .array(
            z
              .object({
                index: z.number().int().min(0),
                points: z
                  .number()
                  .min(0)
                  .max(100)
                  .refine(
                    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-7,
                    'Điểm có tối đa 2 chữ số thập phân.',
                  ),
                feedback: z.string().trim().max(2000).default(''),
                suggestionId: z
                  .string()
                  .regex(/^[a-f\d]{24}$/i)
                  .nullable()
                  .optional(),
              })
              .strict(),
          )
          .min(1)
          .max(100)
          .refine(
            (values) => new Set(values.map((v) => v.index)).size === values.length,
            'Mỗi câu chỉ chấm một lần trong một yêu cầu.',
          ),
      })
      .strict()
      .parse(req.body);
    const run = await transaction(db, async (session) => {
      const run = await c.examRuns.findOne({ _id: initial._id }, { session });
      if (
        !run ||
        !['SUBMITTED', 'PENDING_REVIEW'].includes(run.status) ||
        run.revision !== body.revision
      )
        httpError(409, 'Bài làm chưa nộp hoặc đã được cập nhật. Tải lại trước khi xác nhận điểm.');
      const events: GradingEvent[] = [];
      for (const g of body.grades) {
        const q = run.questions[g.index];
        if (!q || !isWrittenQuestion(q.type) || g.points > q.points)
          httpError(400, 'Chỉ chấm tự luận hoặc trả lời ngắn, điểm không vượt điểm tối đa.');
        const suggestion = g.suggestionId
          ? await c.gradingSuggestions.findOne(
              {
                _id: objectId(g.suggestionId),
                runId: run._id,
                index: g.index,
                status: 'READY',
                sourceHash: gradingHash(q, run.responses[g.index]),
              },
              { session },
            )
          : null;
        if (g.suggestionId && !suggestion?.proposal)
          httpError(409, 'Đề xuất đã thay đổi hoặc không thuộc câu này.');
        events.push({
          _id: new ObjectId(),
          examId: run.examId,
          runId: run._id,
          index: g.index,
          revision: run.revision + 1,
          reviewerId: req.user!._id,
          reviewerName: req.user!.name,
          previousPoints: run.awarded[g.index],
          points: g.points,
          previousFeedback: run.feedback[g.index],
          feedback: g.feedback,
          suggestionId: suggestion?._id || null,
          suggestedPoints: suggestion?.proposal?.points ?? null,
          createdAt: new Date(),
        });
        run.awarded[g.index] = g.points;
        run.feedback[g.index] = g.feedback;
      }
      Object.assign(run, resultOf(run));
      run.revision++;
      await c.examRuns.replaceOne({ _id: run._id }, run, { session });
      await c.gradingEvents.insertMany(events, { session });
      await writeResult(db, run, session);
      return run;
    });
    res.json(runDto(run!, true));
  };
  return { overview, suggest, dismiss, grade };
}
