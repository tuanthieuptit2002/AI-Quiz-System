import type { RequestHandler } from 'express';
import { Db, MongoServerError, ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Config } from '../common/config.js';
import { collections } from '../database/collections.js';
import { learningSnapshot } from '../common/learning-analysis.js';
import { learningInput } from '../common/learning-provider.js';
import { expireLearningLeases } from '../common/learning-runtime.js';
import { httpError } from '../common/http.js';
import {
  learningLimits,
  learningReportDto,
  type LearningReport,
  type LearningSnapshot,
} from '../models/learning.model.js';

const rangeSchema = z.enum(['30', '90', 'all']).default('90');
export function createLearningController(db: Db, config: Config) {
  const c = collections(db);
  const model = config.deepseekModel || 'deepseek-flash';
  const response = (snapshot: LearningSnapshot, report: LearningReport | null) => ({
    snapshot,
    configured: !!config.deepseekApiKey,
    eligible: learningInput(snapshot, model).topics.length > 0,
    limits: learningLimits,
    report: report ? learningReportDto(report) : null,
  });
  const get: RequestHandler = async (req, res) => {
    const { range } = z.object({ range: rangeSchema }).strict().parse(req.query);
    const snapshot = await learningSnapshot(db, req.user!._id, range);
    await expireLearningLeases(db);
    const report = await c.learningReports.findOne({
      studentId: req.user!._id,
      range,
      sourceKey: snapshot.sourceKey,
    });
    res.json(response(snapshot, report));
  };
  const generate: RequestHandler = async (req, res) => {
    const body = z
      .object({
        range: rangeSchema,
        sourceKey: z.string().regex(/^[a-f\d]{64}$/),
        requestId: z.uuid(),
        retry: z.boolean().default(false),
      })
      .strict()
      .parse(req.body);
    const studentId = req.user!._id;
    const snapshot = await learningSnapshot(db, studentId, body.range);
    if (snapshot.sourceKey !== body.sourceKey)
      httpError(409, 'Kết quả đã thay đổi. Tải lại trước khi tạo phân tích.');
    await expireLearningLeases(db);
    const scope = { studentId, range: body.range, sourceKey: snapshot.sourceKey };
    const existing = await c.learningReports.findOne(scope);
    const reusedRequest = await c.learningReports.findOne({
      studentId,
      'requests.id': body.requestId,
    });
    if (reusedRequest && !reusedRequest._id.equals(existing?._id))
      httpError(409, 'Mã yêu cầu đã dùng cho phân tích khác.');
    if (
      existing &&
      (existing.status !== 'FAILED' ||
        existing.requests.some((r) => r.id === body.requestId) ||
        !body.retry)
    ) {
      res.json(response(snapshot, existing));
      return;
    }
    if (!config.deepseekApiKey) httpError(503, 'Chưa cấu hình DEEPSEEK_API_KEY trên backend.');
    if (!learningInput(snapshot, model).topics.length)
      httpError(400, 'Cần ít nhất một chủ đề có 5 câu đã chấm từ 2 đề thi khác nhau.');
    if (existing && existing.requests.length >= learningLimits.maxAttempts)
      httpError(429, 'Đã hết 3 lần thử cho dữ liệu này.');
    const usage = await c.learningReports
      .aggregate<{ count: number }>([
        { $match: { studentId } },
        { $unwind: '$requests' },
        { $match: { 'requests.createdAt': { $gte: new Date(Date.now() - 86400000) } } },
        { $count: 'count' },
      ])
      .next();
    if ((usage?.count || 0) >= learningLimits.dailyRequests)
      httpError(429, 'Tối đa 10 yêu cầu phân tích trong 24 giờ.');
    const now = new Date(),
      record = { id: body.requestId, createdAt: now };
    try {
      if (existing) {
        const updated = await c.learningReports.findOneAndUpdate(
          { _id: existing._id, status: 'FAILED', requests: { $size: existing.requests.length } },
          {
            $set: { status: 'QUEUED', error: '', advice: null, updatedAt: now, model, snapshot },
            $push: { requests: record },
          },
          { returnDocument: 'after' },
        );
        if (!updated) httpError(409, 'Báo cáo đang được cập nhật. Hãy tải lại.');
        res.status(202).json(response(snapshot, updated));
      } else {
        const job: LearningReport = {
          _id: new ObjectId(),
          ...scope,
          snapshot,
          status: 'QUEUED',
          requests: [record],
          advice: null,
          error: '',
          model,
          leaseId: null,
          leaseUntil: null,
          createdAt: now,
          updatedAt: now,
        };
        await c.learningReports.insertOne(job);
        res.status(202).json(response(snapshot, job));
      }
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const same = await c.learningReports.findOne(scope);
        if (same && same.status !== 'FAILED') {
          res.json(response(snapshot, same));
          return;
        }
        httpError(409, 'Bạn đang có một phân tích khác được xử lý. Hãy chờ hoàn tất.');
      }
      throw error;
    }
  };
  return { get, generate };
}
