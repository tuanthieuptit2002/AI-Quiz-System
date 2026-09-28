import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import { collections } from '../database/collections.js';
import { httpError } from './http.js';
import { learningSnapshot } from './learning-analysis.js';
import {
  learningInput,
  validateLearningAdvice,
  type LearningAnalyst,
} from './learning-provider.js';

export async function expireLearningLeases(db: Db) {
  await collections(db).learningReports.updateMany(
    { status: 'GENERATING', leaseUntil: { $lt: new Date() } },
    {
      $set: {
        status: 'FAILED',
        error: 'Phân tích bị gián đoạn. Bạn có thể thử lại.',
        leaseId: null,
        leaseUntil: null,
        updatedAt: new Date(),
      },
    },
  );
}
export async function processNextLearningReport(db: Db, analyze: LearningAnalyst) {
  const c = collections(db),
    leaseId = randomUUID();
  const job = await c.learningReports.findOneAndUpdate(
    { status: 'QUEUED' },
    {
      $set: {
        status: 'GENERATING',
        leaseId,
        leaseUntil: new Date(Date.now() + 180000),
        updatedAt: new Date(),
      },
    },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  );
  if (!job) return false;
  const valid = async () => {
    const student = await c.users.findOne({
      _id: job.studentId,
      role: 'STUDENT',
      status: 'ACTIVE',
    });
    if (!student) httpError(403, 'Bạn không còn quyền sử dụng báo cáo này.');
    const current = await learningSnapshot(db, job.studentId, job.range);
    if (current.sourceKey !== job.sourceKey)
      httpError(409, 'Kết quả đã thay đổi. Tải lại để phân tích dữ liệu mới.');
  };
  try {
    await valid();
    const input = learningInput(job.snapshot, job.model);
    if (!input.topics.length) httpError(400, 'Chưa đủ dữ liệu theo chủ đề để phân tích.');
    const advice = validateLearningAdvice(await analyze(input), input);
    await valid();
    await c.learningReports.updateOne(
      { _id: job._id, status: 'GENERATING', leaseId },
      {
        $set: {
          status: 'READY',
          advice,
          error: '',
          leaseId: null,
          leaseUntil: null,
          updatedAt: new Date(),
        },
      },
    );
  } catch (error) {
    await c.learningReports.updateOne(
      { _id: job._id, status: 'GENERATING', leaseId },
      {
        $set: {
          status: 'FAILED',
          error: (error as { status?: number }).status
            ? (error as Error).message
            : 'Chưa phân tích được dữ liệu. Hãy thử lại sau.',
          leaseId: null,
          leaseUntil: null,
          updatedAt: new Date(),
        },
      },
    );
  }
  return true;
}
export function startLearningWorker(db: Db, analyze: LearningAnalyst) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await expireLearningLeases(db);
      await processNextLearningReport(db, analyze);
    } catch {
      console.error('Learning analysis worker unavailable; retrying on next tick.');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 1000).unref();
  void tick();
  return () => clearInterval(timer);
}
