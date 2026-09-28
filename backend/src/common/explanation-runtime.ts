import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import { collections } from '../database/collections.js';
import { httpError } from './http.js';
import { explanationInput, validateExplanation, type AIExplainer } from './explanation-provider.js';

export async function expireExplanationLeases(db: Db) {
  await collections(db).explanationThreads.updateMany(
    { status: 'GENERATING', leaseUntil: { $lt: new Date() } },
    {
      $set: {
        status: 'FAILED',
        leaseId: null,
        leaseUntil: null,
        updatedAt: new Date(),
        'turns.$[turn].status': 'FAILED',
        'turns.$[turn].error': 'Giải thích bị gián đoạn. Bạn có thể thử lại.',
      },
      $inc: { version: 1 },
    },
    { arrayFilters: [{ 'turn.status': 'PENDING' }] },
  );
}
export async function processNextExplanation(db: Db, explain: AIExplainer) {
  const c = collections(db),
    leaseId = randomUUID();
  const thread = await c.explanationThreads.findOneAndUpdate(
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
    { sort: { updatedAt: 1 }, returnDocument: 'after' },
  );
  if (!thread) return false;
  const validInput = async () => {
    const [student, run] = await Promise.all([
      c.users.findOne({ _id: thread.studentId, status: 'ACTIVE', role: 'STUDENT' }),
      c.examRuns.findOne({ _id: thread.runId, studentId: thread.studentId }),
    ]);
    if (!student || !run) httpError(403, 'Bạn không còn quyền xem giải thích này.');
    return explanationInput(run, thread);
  };
  const turnIndex = thread.turns.length - 1;
  try {
    const input = await validInput();
    const reply = validateExplanation(await explain(input));
    await validInput();
    await c.explanationThreads.updateOne(
      { _id: thread._id, status: 'GENERATING', leaseId },
      {
        $set: {
          status: 'READY',
          leaseId: null,
          leaseUntil: null,
          updatedAt: new Date(),
          [`turns.${turnIndex}.reply`]: reply,
          [`turns.${turnIndex}.status`]: 'READY',
          [`turns.${turnIndex}.error`]: '',
          [`turns.${turnIndex}.answeredAt`]: new Date(),
        },
        $inc: { version: 1 },
      },
    );
    // No writes to examRuns, gradingEvents or student progress.
  } catch (error) {
    await c.explanationThreads.updateOne(
      { _id: thread._id, status: 'GENERATING', leaseId },
      {
        $set: {
          status: 'FAILED',
          leaseId: null,
          leaseUntil: null,
          updatedAt: new Date(),
          [`turns.${turnIndex}.status`]: 'FAILED',
          [`turns.${turnIndex}.error`]: (error as { status?: number }).status
            ? (error as Error).message
            : 'Chưa tạo được giải thích. Hãy thử lại sau.',
        },
        $inc: { version: 1 },
      },
    );
  }
  return true;
}
export function startExplanationWorker(db: Db, explain: AIExplainer) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await expireExplanationLeases(db);
      await processNextExplanation(db, explain);
    } catch {
      console.error('Explanation worker temporarily unavailable; retrying on next tick.');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 1000).unref();
  void tick();
  return () => clearInterval(timer);
}
