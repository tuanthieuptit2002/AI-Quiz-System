import type { Request, RequestHandler } from 'express';
import { Db, MongoServerError, ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Config } from '../common/config.js';
import { collections } from '../database/collections.js';
import { httpError, objectId } from '../common/http.js';
import { explanationSource } from '../common/explanation-provider.js';
import { expireExplanationLeases } from '../common/explanation-runtime.js';
import {
  defaultExplanationQuestion,
  explanationDto,
  explanationLimits,
  type ExplanationThread,
} from '../models/explanation.model.js';

export function createExplanationController(db: Db, config: Config) {
  const c = collections(db);
  const owned = async (req: Request) => {
    const run = await c.examRuns.findOne({
      _id: objectId(req.params.runId),
      studentId: req.user!._id,
    });
    if (!run) httpError(404, 'Không tìm thấy lượt thi.');
    const index = z.coerce.number().int().min(0).max(99).parse(req.params.index);
    const { sourceKey } = explanationSource(run, index);
    return { studentId: req.user!._id, runId: run._id, index, sourceKey };
  };
  const response = (sourceKey: string, thread: ExplanationThread | null) => ({
    configured: !!config.deepseekApiKey,
    sourceKey,
    limits: explanationLimits,
    thread: thread ? explanationDto(thread) : null,
  });
  const get: RequestHandler = async (req, res) => {
    const scope = await owned(req);
    await expireExplanationLeases(db);
    res.json(response(scope.sourceKey, await c.explanationThreads.findOne(scope)));
  };
  const send: RequestHandler = async (req, res) => {
    const scope = await owned(req);
    const body = z
      .object({
        sourceKey: z.string().regex(/^[a-f\d]{64}$/),
        version: z.number().int().min(0),
        requestId: z.uuid(),
        question: z.string().trim().min(1).max(explanationLimits.maxQuestionChars).optional(),
        retry: z.boolean().default(false),
      })
      .strict()
      .refine((v) => !v.retry || !v.question, 'Thử lại không nhận câu hỏi thay thế.')
      .parse(req.body);
    if (body.sourceKey !== scope.sourceKey)
      httpError(409, 'Kết quả đã được Teacher cập nhật. Tải lại giải thích trước khi hỏi tiếp.');
    await expireExplanationLeases(db);
    const thread = await c.explanationThreads.findOne(scope);
    const question = body.question || defaultExplanationQuestion;
    const duplicate = (value: ExplanationThread | null) => {
      const record = value?.requests.find((r) => r.id === body.requestId);
      if (!record) return false;
      const turn = value!.turns.find((t) => t.id === record.turnId)!;
      if (
        record.kind !== (body.retry ? 'RETRY' : 'MESSAGE') ||
        (!body.retry && turn.question !== question)
      )
        httpError(409, 'Mã yêu cầu đã dùng cho nội dung khác.');
      res.json(response(scope.sourceKey, value));
      return true;
    };
    if (duplicate(thread)) return;
    if (!config.deepseekApiKey)
      httpError(503, 'Trợ lý AI chưa được cấu hình. Bạn vẫn có thể xem giải thích từ Teacher.');
    if (
      (thread?.version || 0) !== body.version ||
      (thread && ['QUEUED', 'GENERATING'].includes(thread.status))
    )
      httpError(409, 'Hội thoại đã thay đổi hoặc AI đang trả lời. Tải lại để tiếp tục.');
    if (!body.retry && (thread?.turns.length || 0) >= explanationLimits.maxTurns)
      httpError(400, 'Đã đạt giới hạn 8 lượt trao đổi cho câu hỏi này.');
    const latest = thread?.turns.at(-1);
    if (
      body.retry &&
      (!latest || latest.status !== 'FAILED' || latest.attempts >= explanationLimits.maxAttempts)
    )
      httpError(400, 'Chỉ thử lại câu hỏi bị lỗi, tối đa 3 lần xử lý mỗi lượt.');
    const since = new Date(Date.now() - 86400000);
    const [quota] = await c.explanationThreads
      .aggregate<{ total: number }>([
        { $match: { studentId: scope.studentId, 'requests.createdAt': { $gt: since } } },
        { $unwind: '$requests' },
        { $match: { 'requests.createdAt': { $gt: since } } },
        { $count: 'total' },
      ])
      .toArray();
    if ((quota?.total || 0) >= explanationLimits.dailyRequests)
      httpError(429, 'Bạn đã dùng 50 yêu cầu giải thích trong 24 giờ. Vui lòng quay lại sau.');
    const now = new Date(),
      model = config.deepseekModel || 'deepseek-flash';
    const turnId = body.retry ? latest!.id : body.requestId;
    const turns = body.retry
      ? thread!.turns.map((t) =>
          t.id === turnId
            ? { ...t, status: 'PENDING' as const, error: '', attempts: t.attempts + 1, model }
            : t,
        )
      : [
          ...(thread?.turns || []),
          {
            id: turnId,
            question,
            reply: null,
            status: 'PENDING' as const,
            error: '',
            attempts: 1,
            model,
            createdAt: now,
            answeredAt: null,
          },
        ];
    const requests = [
      ...(thread?.requests || []),
      {
        id: body.requestId,
        turnId,
        kind: body.retry ? ('RETRY' as const) : ('MESSAGE' as const),
        createdAt: now,
      },
    ];
    try {
      let next: ExplanationThread;
      if (thread) {
        const updated = await c.explanationThreads.findOneAndUpdate(
          { _id: thread._id, version: body.version, status: { $in: ['READY', 'FAILED'] } },
          {
            $set: {
              status: 'QUEUED',
              turns,
              requests,
              leaseId: null,
              leaseUntil: null,
              updatedAt: now,
            },
            $inc: { version: 1 },
          },
          { returnDocument: 'after' },
        );
        if (!updated) {
          if (duplicate(await c.explanationThreads.findOne(scope))) return;
          httpError(409, 'Hội thoại đã thay đổi. Tải lại trước khi hỏi tiếp.');
        }
        next = updated;
      } else {
        next = {
          ...scope,
          _id: new ObjectId(),
          version: 1,
          status: 'QUEUED',
          turns,
          requests,
          leaseId: null,
          leaseUntil: null,
          createdAt: now,
          updatedAt: now,
        };
        await c.explanationThreads.insertOne(next);
      }
      res.status(202).json(response(scope.sourceKey, next));
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        if (duplicate(await c.explanationThreads.findOne(scope))) return;
        httpError(
          409,
          'Bạn đang có câu hỏi AI khác được xử lý hoặc mã yêu cầu đã được dùng. Chờ hoàn tất rồi thử lại.',
        );
      }
      throw error;
    }
  };
  return { get, send };
}
