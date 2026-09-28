import { randomUUID } from 'node:crypto';
import type { Db, ObjectId } from 'mongodb';
import { collections } from '../database/collections.js';
import { questionContent } from '../models/question.model.js';
import type { AIExamItem, AIExamJob } from '../models/ai-exam.model.js';
import type { AIGenerator } from './ai-provider.js';
import type { ExamPlanner } from './ai-exam-provider.js';
import { allocateCounts, validateExamPlan, type AIExamPlan } from './ai-exam.validation.js';
import { normalizedText, validateAIOutput } from './ai.validation.js';
import { escapeRegex, httpError } from './http.js';

const key = (text: string) => normalizedText(text).toLowerCase();
const leaseMs = 180000;
export async function examOwner(db: Db, ownerId: ObjectId) {
  const owner = await collections(db).users.findOne({
    _id: ownerId,
    status: 'ACTIVE',
    role: { $in: ['ADMIN', 'TEACHER'] },
  });
  if (!owner) httpError(403, 'Tài khoản tạo đề không còn quyền sử dụng AI.');
  return owner;
}

// Match only READY questions in the owner's permitted bank, using exact taxonomy synonyms.
// Allocate sequentially to avoid counting the same question toward two sections.
export async function selectExamBank(
  db: Db,
  ownerId: ObjectId,
  plan: AIExamPlan,
  existing: AIExamItem[] = [],
) {
  const c = collections(db),
    owner = await examOwner(db, ownerId);
  const counts = allocateCounts(plan);
  const seen = new Set(existing.map((i) => key(i.content.question)));
  const used = new Set(existing.flatMap((i) => (i.questionId ? [i.questionId.toHexString()] : [])));
  const sections: AIExamItem[][] = [];
  for (const [index, section] of plan.sections.entries()) {
    const remaining = counts[index] - existing.filter((i) => i.section === index).length;
    const items: AIExamItem[] = [];
    if (remaining > 0) {
      const labels = [...new Set([section.topic, ...section.keywords])].map(
        (v) => new RegExp(`^${escapeRegex(v)}$`, 'i'),
      );
      const cursor = c.questions
        .find({
          ...(owner.role === 'ADMIN' ? {} : { ownerId }),
          status: 'READY',
          subject: new RegExp(`^${escapeRegex(plan.subject)}$`, 'i'),
          difficulty: section.difficulty,
          type: section.type,
          $or: [{ topicPath: { $in: labels } }, { tags: { $in: labels } }],
        })
        .sort({ updatedAt: -1, _id: 1 });
      try {
        for await (const q of cursor) {
          if (used.has(q._id.toHexString()) || seen.has(key(q.question))) continue;
          used.add(q._id.toHexString());
          seen.add(key(q.question));
          items.push({
            id: randomUUID(),
            section: index,
            origin: 'BANK',
            questionId: q._id,
            questionVersion: q.version,
            content: { ...questionContent(q), subject: plan.subject },
          });
          if (items.length >= remaining) break;
        }
      } finally {
        await cursor.close();
      }
    }
    sections.push(items);
  }
  return sections;
}

export async function expireAIExamLeases(db: Db) {
  await collections(db).aiExams.updateMany(
    { status: 'WORKING', leaseUntil: { $lt: new Date() } },
    {
      $set: {
        status: 'FAILED',
        leaseId: null,
        leaseUntil: null,
        updatedAt: new Date(),
        error:
          'Quá trình tạo đề bị gián đoạn. Bấm Thử lại để tiếp tục; các câu đã tạo được giữ lại.',
      },
      $inc: { version: 1 },
    },
  );
}

export async function processNextAIExamJob(db: Db, planner: ExamPlanner, generate: AIGenerator) {
  const c = collections(db),
    leaseId = randomUUID();
  const claimed = await c.aiExams.findOneAndUpdate(
    { status: 'QUEUED' },
    {
      $set: {
        status: 'WORKING',
        leaseId,
        leaseUntil: new Date(Date.now() + leaseMs),
        updatedAt: new Date(),
      },
      $inc: { version: 1 },
    },
    { sort: { createdAt: 1 }, returnDocument: 'after' },
  );
  if (!claimed) return false;
  let job: AIExamJob = claimed;
  const persist = async (patch: Partial<AIExamJob>) => {
    if (patch.items && Buffer.byteLength(JSON.stringify(patch.items)) > 10 * 1024 * 1024)
      httpError(400, 'Đề thi vượt giới hạn 10 MB. Hãy giảm ảnh hoặc số câu.');
    const done = patch.status && patch.status !== 'WORKING';
    const updated = await c.aiExams.findOneAndUpdate(
      { _id: job._id, status: 'WORKING', leaseId },
      {
        $set: {
          ...patch,
          leaseId: done ? null : leaseId,
          leaseUntil: done ? null : new Date(Date.now() + leaseMs),
          updatedAt: new Date(),
        },
        $inc: { version: 1 },
      },
      { returnDocument: 'after' },
    );
    if (!updated) httpError(409, 'Tác vụ đã được tiếp quản. Hãy tải lại tiến độ.');
    job = updated;
  };
  try {
    await examOwner(db, job.ownerId);
    if (job.phase === 'PLAN') {
      const plan = validateExamPlan(
        await planner({ prompt: job.prompt, language: job.language, model: job.model }),
      );
      await persist({ plan, status: 'PLANNED', error: '' });
      return true;
    }
    const plan = validateExamPlan(job.plan),
      counts = allocateCounts(plan);
    if (job.phase === 'BUILD' && job.strategy !== 'AI_ONLY') {
      const bank = await selectExamBank(db, job.ownerId, plan, job.items);
      if (job.strategy === 'BANK_ONLY') {
        const shortage = bank
          .map((items, index) => ({
            topic: plan.sections[index].topic,
            missing:
              counts[index] - job.items.filter((i) => i.section === index).length - items.length,
          }))
          .filter((s) => s.missing > 0);
        if (shortage.length)
          httpError(
            400,
            `Ngân hàng thiếu câu: ${shortage.map((s) => `${s.topic} (${s.missing})`).join(', ')}. Đổi sang kết hợp AI hoặc bổ sung ngân hàng rồi thử lại.`,
          );
      }
      await persist({ items: [...job.items, ...bank.flat()] });
    }
    const replacing =
      job.phase === 'REPLACE' ? job.items.find((i) => i.id === job.replaceId) : null;
    if (job.phase === 'REPLACE' && !replacing) httpError(409, 'Không tìm thấy câu cần thay thế.');
    for (const [index, section] of plan.sections.entries()) {
      if (replacing && replacing.section !== index) continue;
      let remaining = replacing
        ? 1
        : counts[index] - job.items.filter((i) => i.section === index).length;
      while (remaining > 0) {
        await examOwner(db, job.ownerId);
        const count = Math.min(5, remaining);
        const settings = {
          subject: plan.subject,
          topicPath: [section.topic],
          difficulty: section.difficulty,
          type: section.type,
          count,
          language: job.language,
          instructions:
            `Assess these objectives: ${section.objectives}\nExam: ${plan.title}. ${plan.description}`.slice(
              0,
              2000,
            ),
        };
        const source = { kind: 'PROMPT' as const, name: plan.title, text: '' };
        const previous = job.items.map((i) => i.content.question);
        const output = await generate({
          settings,
          source,
          count,
          previous,
          feedback: job.feedback,
          model: job.model,
        });
        const validated = validateAIOutput(
          {
            questions: output.map(({ content: q, evidence }) => ({
              question: q.question,
              options: q.options,
              answers: q.answers,
              pairs: q.pairs,
              rubric: q.rubric,
              explanation: q.explanation,
              tags: q.tags,
              evidence,
            })),
          },
          settings,
          source,
          count,
          previous,
        );
        const added: AIExamItem[] = validated.map(({ content }) => ({
          id: replacing?.id || randomUUID(),
          section: index,
          origin: 'AI',
          questionId: null,
          questionVersion: null,
          content,
        }));
        await persist({
          items: replacing
            ? job.items.map((i) => (i.id === replacing.id ? added[0] : i))
            : [...job.items, ...added],
        });
        remaining -= added.length;
      }
    }
    await persist({ status: 'REVIEW', replaceId: null, feedback: '', error: '' });
  } catch (error) {
    await c.aiExams.updateOne(
      { _id: job._id, status: 'WORKING', leaseId },
      {
        $set: {
          status: 'FAILED',
          leaseId: null,
          leaseUntil: null,
          updatedAt: new Date(),
          error: (error as { status?: number }).status
            ? (error as Error).message
            : 'Chưa hoàn tất đề thi. Thử lại để tiếp tục phần còn thiếu.',
        },
        $inc: { version: 1 },
      },
    );
  }
  return true;
}

export function startAIExamWorker(db: Db, planner: ExamPlanner, generate: AIGenerator) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await expireAIExamLeases(db);
      await processNextAIExamJob(db, planner, generate);
    } catch {
      console.error('AI exam worker temporarily unavailable.');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), 1000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
