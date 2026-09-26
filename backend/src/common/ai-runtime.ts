import { randomUUID } from 'node:crypto';
import type { Db } from 'mongodb';
import { collections } from '../database/collections.js';
import type { AIGenerator } from './ai-provider.js';
import { httpError } from './http.js';
import { validateAIOutput } from './ai.validation.js';
import type { AIGeneration } from '../models/ai-generation.model.js';

export async function expireAILeases(db: Db) {
  await collections(db).aiGenerations.updateMany(
    { status: 'GENERATING', leaseUntil: { $lt: new Date() } },
    {
      $set: {
        status: 'FAILED',
        leaseId: null,
        leaseUntil: null,
        error:
          'Quá trình tạo đã bị gián đoạn. Những câu đã tạo được giữ lại; bấm Thử lại để tiếp tục.',
        updatedAt: new Date(),
      },
      $inc: { version: 1 },
    },
  );
}

// A persisted lease prevents two workers from completing the same job, even after restart.
export async function processNextAIJob(db: Db, generate: AIGenerator) {
  const c = collections(db);
  const leaseId = randomUUID();
  const claimed = await c.aiGenerations.findOneAndUpdate(
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
  if (!claimed) return false;
  let job: AIGeneration = claimed;
  try {
    do {
      const owner = await c.users.findOne({
        _id: job.ownerId,
        status: 'ACTIVE',
        role: { $in: ['ADMIN', 'TEACHER'] },
      });
      if (!owner) httpError(403, 'Tài khoản tạo yêu cầu không còn quyền sử dụng AI.');
      const replacing = job.regenerateId
        ? job.items.find((item) => item.id === job!.regenerateId)
        : null;
      if (job.regenerateId && (!replacing || replacing.status === 'APPROVED'))
        httpError(409, 'Câu hỏi này không thể tạo lại.');
      const count = replacing ? 1 : Math.min(5, job.settings.count - job.items.length);
      if (count <= 0) break;
      const settings = replacing
        ? {
            ...job.settings,
            subject: replacing.content.subject,
            topicPath: replacing.content.topicPath,
            difficulty: replacing.content.difficulty,
            type: replacing.content.type,
          }
        : job.settings;
      const request = {
        settings: { ...settings, count },
        source: job.source,
        count,
        previous: job.items.map((item) => item.content.question),
        feedback: job.feedback,
        model: job.model,
      };
      const generated = await generate(request);
      // Always validate at the storage boundary, including alternative/test provider implementations.
      const result = validateAIOutput(
        {
          questions: generated.map(({ content, evidence }) => ({
            question: content.question,
            options: content.options,
            answers: content.answers,
            pairs: content.pairs,
            rubric: content.rubric,
            explanation: content.explanation,
            tags: content.tags,
            evidence,
          })),
        },
        settings,
        job.source,
        count,
        request.previous,
      );
      const items = replacing
        ? job.items.map((item) =>
            item.id === replacing.id
              ? {
                  ...item,
                  ...result[0],
                  status: 'PENDING' as const,
                  revision: item.revision + 1,
                }
              : item,
          )
        : [
            ...job.items,
            ...result.map((item) => ({
              ...item,
              id: randomUUID(),
              status: 'PENDING' as const,
              revision: 1,
              questionId: null,
            })),
          ];
      if (Buffer.byteLength(JSON.stringify(items)) > 10 * 1024 * 1024)
        httpError(400, 'Đợt câu hỏi vượt giới hạn 10 MB.');
      const done = !!replacing || items.length >= job.settings.count;
      const incomplete = done && items.length < job.settings.count;
      const updated = await c.aiGenerations.findOneAndUpdate(
        { _id: job._id, status: 'GENERATING', leaseId },
        {
          $set: {
            items,
            status: incomplete ? 'FAILED' : done ? 'REVIEW' : 'GENERATING',
            updatedAt: new Date(),
            error: incomplete
              ? 'Đã tạo lại câu hỏi. Bấm Thử lại để tiếp tục tạo các câu còn thiếu.'
              : '',
            leaseUntil: done ? null : new Date(Date.now() + 180000),
            leaseId: done ? null : leaseId,
            regenerateId: done ? null : job.regenerateId,
            feedback: done ? '' : job.feedback,
          },
          $inc: { version: 1 },
        },
        { returnDocument: 'after' },
      );
      if (!updated || done) return true;
      job = updated;
    } while (job.status === 'GENERATING');
    await c.aiGenerations.updateOne(
      { _id: job._id, status: 'GENERATING', leaseId },
      {
        $set: { status: 'REVIEW', leaseId: null, leaseUntil: null, updatedAt: new Date() },
        $inc: { version: 1 },
      },
    );
  } catch (error) {
    const safe = (error as { status?: number }).status;
    await c.aiGenerations.updateOne(
      { _id: job._id, status: 'GENERATING', leaseId },
      {
        $set: {
          status: 'FAILED',
          leaseId: null,
          leaseUntil: null,
          updatedAt: new Date(),
          error: safe
            ? (error as Error).message
            : 'Không thể hoàn tất yêu cầu AI. Hãy thử lại; các câu đã tạo vẫn được giữ.',
        },
        $inc: { version: 1 },
      },
    );
  }
  return true;
}

export function startAIWorker(db: Db, generate: AIGenerator) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await expireAILeases(db);
      await processNextAIJob(db, generate);
    } catch {
      console.error('AI worker temporarily unavailable; retrying on next tick.');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 1000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
