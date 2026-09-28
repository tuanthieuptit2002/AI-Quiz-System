import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import { collections } from '../database/collections.js';
import { httpError } from './http.js';
import {
  gradingHash,
  gradingInput,
  validateGradeProposal,
  type AIGrader,
} from './grading-provider.js';

export async function expireGradingLeases(db: Db) {
  await collections(db).gradingSuggestions.updateMany(
    { status: 'GENERATING', leaseUntil: { $lt: new Date() } },
    {
      $set: {
        status: 'FAILED',
        leaseId: null,
        leaseUntil: null,
        updatedAt: new Date(),
        error: 'Đề xuất bị gián đoạn. Có thể yêu cầu lại hoặc tiếp tục chấm thủ công.',
      },
      $inc: { version: 1 },
    },
  );
}
export async function processNextGradingJob(db: Db, grade: AIGrader) {
  const c = collections(db),
    leaseId = randomUUID();
  const job = await c.gradingSuggestions.findOneAndUpdate(
    { status: 'QUEUED' },
    {
      $set: {
        status: 'GENERATING',
        leaseId,
        leaseUntil: new Date(Date.now() + 180000),
        updatedAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  );
  if (!job) return false;
  const validSource = async () => {
    const [user, run, exam] = await Promise.all([
      c.users.findOne({ _id: job.ownerId, role: { $in: ['ADMIN', 'TEACHER'] }, status: 'ACTIVE' }),
      c.examRuns.findOne({
        _id: job.runId,
        examId: job.examId,
        status: { $in: ['PENDING_REVIEW', 'SUBMITTED'] },
      }),
      c.exams.findOne({ _id: job.examId }),
    ]);
    if (!user || !exam || (user.role !== 'ADMIN' && !exam.ownerId.equals(user._id)))
      httpError(403, 'Tài khoản yêu cầu không còn quyền chấm bài này.');
    const q = run?.questions[job.index];
    if (!run || !q || gradingHash(q, run.responses[job.index]) !== job.sourceHash)
      httpError(409, 'Nội dung bài làm đã thay đổi; cần tạo đề xuất mới.');
    return gradingInput(q, run.responses[job.index], job.model);
  };
  try {
    const input = await validSource();
    const proposal = validateGradeProposal(await grade(input), input);
    await validSource();
    await c.gradingSuggestions.updateOne(
      { _id: job._id, status: 'GENERATING', leaseId },
      {
        $set: {
          status: 'READY',
          proposal,
          error: '',
          leaseId: null,
          leaseUntil: null,
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      },
    );
    // Deliberately never writes examRuns, points or student progress.
  } catch (error) {
    await c.gradingSuggestions.updateOne(
      { _id: job._id, status: 'GENERATING', leaseId },
      {
        $set: {
          status: 'FAILED',
          leaseId: null,
          leaseUntil: null,
          updatedAt: new Date(),
          error: (error as { status?: number }).status
            ? (error as Error).message
            : 'Không tạo được đề xuất. Thử lại hoặc chấm thủ công.',
        },
        $inc: { version: 1 },
      },
    );
  }
  return true;
}
export function startGradingWorker(db: Db, grade: AIGrader) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await expireGradingLeases(db);
      await processNextGradingJob(db, grade);
    } catch {
      console.error('Grading assistant temporarily unavailable; retrying on next tick.');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 1000).unref();
  void tick();
  return () => clearInterval(timer);
}
