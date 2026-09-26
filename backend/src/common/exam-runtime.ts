import { randomInt, randomUUID } from 'node:crypto';
import type { Db, ObjectId, ClientSession } from 'mongodb';
import { collections } from '../database/collections.js';
import type { DeliveredQuestion, Exam, ExamRun } from '../models/exam.model.js';

export function shuffle<T>(values: T[]): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
export function deliverQuestions(exam: Exam): DeliveredQuestion[] {
  const items = exam.questions.map(({ content: q, points }) => {
    let options: DeliveredQuestion['options'] = q.options.map((o) => ({
      id: randomUUID(),
      text: o.text,
    }));
    let correct = q.answers.map((a) => options[q.options.findIndex((o) => o.id === a)]?.id || a);
    let left: DeliveredQuestion['left'] = [];
    if (q.type === 'MATCHING') {
      left = q.pairs.map((p) => ({ id: randomUUID(), text: p.left }));
      options = q.pairs.map((p) => ({ id: randomUUID(), text: p.right }));
      correct = options.map((o) => o.id);
    }
    if (q.type === 'TRUE_FALSE')
      options = [
        { id: 'true', text: 'Đúng' },
        { id: 'false', text: 'Sai' },
      ];
    if (exam.settings.randomAnswers || ['ORDERING', 'MATCHING'].includes(q.type))
      options = shuffle(options);
    return {
      id: randomUUID(),
      type: q.type,
      question: q.question,
      image: q.image,
      imageAlt: q.imageAlt,
      points,
      options,
      left,
      blankCount: q.type === 'FILL_BLANK' ? q.answers.length : 0,
      correct,
      explanation: q.explanation,
      rubric: q.rubric,
    };
  });
  return exam.settings.randomQuestions ? shuffle(items) : items;
}
const normalize = (s: string) =>
  s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
export function gradeQuestion(q: DeliveredQuestion, response: string[]): number | null {
  if (q.type === 'ESSAY') return response.some((s) => s.trim()) ? null : 0;
  if (q.type === 'SHORT_ANSWER')
    return response.length === 1 && q.correct.some((s) => normalize(s) === normalize(response[0]))
      ? q.points
      : 0;
  const answers = q.type === 'FILL_BLANK' ? response.map(normalize) : [...response];
  const expected = q.type === 'FILL_BLANK' ? q.correct.map(normalize) : [...q.correct];
  if (q.type === 'MULTIPLE_CHOICE') {
    answers.sort();
    expected.sort();
  }
  return answers.length === expected.length && answers.every((v, i) => v === expected[i])
    ? q.points
    : 0;
}
export function resultOf(run: ExamRun) {
  const total = run.questions.reduce((sum, q) => sum + q.points, 0);
  const pending = run.awarded.some((n) => n === null);
  const earned = run.awarded.reduce<number>((sum, n) => sum + (n || 0), 0);
  const percent = total ? (earned / total) * 100 : 0;
  return {
    scorePercent: pending ? null : Math.round(percent * 100) / 100,
    passed: pending ? null : percent >= run.settings.passScore,
    status: pending ? ('PENDING_REVIEW' as const) : ('SUBMITTED' as const),
  };
}
export async function transaction<T>(db: Db, fn: (session: ClientSession) => Promise<T>) {
  const session = db.client.startSession();
  try {
    return await session.withTransaction(() => fn(session));
  } finally {
    await session.endSession();
  }
}
export async function writeResult(db: Db, run: ExamRun, session: ClientSession) {
  if (run.status !== 'SUBMITTED' || run.scorePercent === null || !run.submittedAt) return;
  await collections(db).attempts.replaceOne(
    { _id: run._id },
    {
      studentId: run.studentId,
      title: run.title,
      subject: run.subject,
      score: Math.round((run.scorePercent / 10) * 100) / 100,
      durationSeconds: Math.max(
        0,
        Math.floor((run.submittedAt.getTime() - run.startedAt.getTime()) / 1000),
      ),
      submittedAt: run.submittedAt,
    },
    { session, upsert: true },
  );
}
export async function finishRun(db: Db, id: ObjectId, submit = false, now = new Date()) {
  const c = collections(db);
  return transaction(db, async (session) => {
    const run = await c.examRuns.findOne({ _id: id }, { session });
    if (!run || run.status !== 'RUNNING' || (!submit && now < run.expiresAt)) return run;
    const expired = now >= run.expiresAt;
    if (expired && !run.settings.autoSubmit) {
      run.status = 'EXPIRED';
      run.submittedAt = null;
    } else {
      run.awarded = run.questions.map((q, i) => gradeQuestion(q, run.responses[i]));
      run.submittedAt = expired ? run.expiresAt : now;
      Object.assign(run, resultOf(run));
    }
    run.revision++;
    await c.examRuns.replaceOne({ _id: id }, run, { session });
    await writeResult(db, run, session);
    return run;
  });
}
export async function expireRuns(db: Db) {
  const due = await collections(db)
    .examRuns.find(
      { status: 'RUNNING', expiresAt: { $lte: new Date() } },
      { projection: { _id: 1 } },
    )
    .limit(100)
    .toArray();
  for (const run of due) await finishRun(db, run._id);
}
export function startExamClock(db: Db) {
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await expireRuns(db);
    } catch {
      console.error('Exam deadline processing failed; retrying on next tick.');
    } finally {
      busy = false;
    }
  };
  void tick();
  const interval = setInterval(() => {
    void tick();
  }, 5000).unref();
  return () => clearInterval(interval);
}
export function runDto(run: ExamRun, teacher = false) {
  const show =
    teacher || (run.settings.showAnswers && ['SUBMITTED', 'PENDING_REVIEW'].includes(run.status));
  return {
    id: run._id.toHexString(),
    examId: run.examId.toHexString(),
    title: run.title,
    subject: run.subject,
    studentName: run.studentName,
    status: run.status,
    attemptNo: run.attemptNo,
    settings: run.settings,
    startedAt: run.startedAt,
    expiresAt: run.expiresAt,
    submittedAt: run.submittedAt,
    currentIndex: run.currentIndex,
    revision: run.revision,
    scorePercent: run.scorePercent,
    passed: run.passed,
    serverTime: new Date(),
    questionCount: run.questions.length,
    answered: run.responses.map((r) => r.some(Boolean)),
    questions: run.questions.map(({ correct, explanation, rubric, ...q }, i) => {
      if (!teacher && run.status === 'RUNNING' && !run.settings.allowBack && i !== run.currentIndex)
        return { id: q.id, locked: true, points: q.points };
      return { ...q, ...(show ? { correct, explanation, rubric } : {}) };
    }),
    responses: run.responses.map((r, i) =>
      !teacher && run.status === 'RUNNING' && !run.settings.allowBack && i !== run.currentIndex
        ? []
        : r,
    ),
    awarded: run.status === 'RUNNING' || run.status === 'EXPIRED' || !show ? [] : run.awarded,
    feedback: run.status === 'RUNNING' || !show ? [] : run.feedback,
  };
}
