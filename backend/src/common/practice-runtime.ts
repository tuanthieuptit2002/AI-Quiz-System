import { randomInt, randomUUID } from 'node:crypto';
import type { Db, ObjectId } from 'mongodb';
import { collections } from '../database/collections.js';
import { deliverQuestions, gradeQuestion } from './exam-runtime.js';
import { escapeRegex, httpError } from './http.js';
import { questionContent, difficulties, type QuestionContent } from '../models/question.model.js';
import type { Exam } from '../models/exam.model.js';
import type { AIGenerator } from './ai-provider.js';
import {
  nextDifficulty,
  nextPracticeTopic,
  practiceLimits,
  type Difficulty,
  type PracticeHistory,
} from './practice-plan.js';
import type { PracticeItem, PracticeSession } from '../models/practice.model.js';

const objectiveTypes = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'FILL_BLANK',
  'MATCHING',
  'ORDERING',
] as const;
const norm = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');
const sameTopic = (
  question: Pick<QuestionContent, 'subject' | 'topicPath'>,
  topic: { subject: string; topicPath: string[] },
) =>
  norm(question.subject) === norm(topic.subject) &&
  question.topicPath.length === topic.topicPath.length &&
  question.topicPath.every((part, index) => norm(part) === norm(topic.topicPath[index]));

function difficultyLadder(target: Difficulty): Difficulty[] {
  const index = difficulties.indexOf(target);
  const order: Difficulty[] = [target];
  for (let step = 1; step < difficulties.length; step++) {
    if (index - step >= 0) order.push(difficulties[index - step]);
    if (index + step < difficulties.length) order.push(difficulties[index + step]);
  }
  return order;
}
function deliver(content: QuestionContent): PracticeItem['delivered'] {
  const [question] = deliverQuestions({
    questions: [{ content, points: 1 }],
    settings: { randomAnswers: true, randomQuestions: false },
  } as Exam);
  return question;
}
export async function practiceHistory(db: Db, studentId: ObjectId): Promise<PracticeHistory[]> {
  const rows = await collections(db)
    .practiceSessions.aggregate<{
      _id: string;
      questions: number;
      earned: number;
      possible: number;
      sessions: unknown[];
    }>([
      { $match: { studentId, status: 'SUBMITTED' } },
      { $unwind: '$items' },
      { $match: { 'items.awarded': { $type: 'number' } } },
      {
        $group: {
          _id: '$items.topicId',
          questions: { $sum: 1 },
          earned: { $sum: '$items.awarded' },
          possible: { $sum: '$items.points' },
          sessions: { $addToSet: '$_id' },
        },
      },
    ])
    .toArray();
  return rows.map((row) => ({
    topicId: row._id,
    questions: row.questions,
    earned: row.earned,
    possible: row.possible,
    sessions: row.sessions.length,
  }));
}
async function excludedQuestionIds(db: Db, studentId: ObjectId) {
  const sessions = await collections(db)
    .practiceSessions.find({ studentId }, { projection: { 'items.questionId': 1 } })
    .sort({ createdAt: -1 })
    .limit(30)
    .toArray();
  return new Set(
    sessions.flatMap((session) =>
      session.items.map((item) => item.questionId).filter((id): id is string => !!id),
    ),
  );
}
async function aiQuestionsToday(db: Db, studentId: ObjectId) {
  const since = new Date(Date.now() - 86400000);
  const rows = await collections(db)
    .practiceSessions.aggregate<{ count: number }>([
      { $match: { studentId, createdAt: { $gte: since } } },
      { $unwind: '$items' },
      { $match: { 'items.source': 'AI' } },
      { $count: 'count' },
    ])
    .toArray();
  return rows[0]?.count || 0;
}
async function pickBankQuestion(
  db: Db,
  topic: { subject: string; topicPath: string[] },
  target: Difficulty,
  excluded: Set<string>,
) {
  const rows = await collections(db)
    .questions.find({
      status: 'READY',
      type: { $in: [...objectiveTypes] },
      subject: { $regex: `^${escapeRegex(topic.subject.trim())}$`, $options: 'i' },
    })
    .limit(300)
    .toArray();
  const matches = rows.filter(
    (question) => sameTopic(question, topic) && !excluded.has(question._id.toHexString()),
  );
  for (const difficulty of difficultyLadder(target)) {
    const pool = matches.filter((question) => question.difficulty === difficulty);
    if (pool.length) return pool[randomInt(pool.length)];
  }
  return null;
}
function toItem(
  topicId: string,
  source: PracticeItem['source'],
  questionId: string | null,
  content: QuestionContent,
): PracticeItem {
  const delivered = deliver(content);
  return {
    id: randomUUID(),
    topicId,
    source,
    questionId,
    difficulty: content.difficulty,
    points: 1,
    delivered,
    response: null,
    awarded: null,
    answeredAt: null,
  };
}
async function saveItem(db: Db, session: PracticeSession, item: PracticeItem) {
  const c = collections(db);
  const updated = await c.practiceSessions.findOneAndUpdate(
    {
      _id: session._id,
      studentId: session.studentId,
      status: 'ACTIVE',
      revision: session.revision,
      items: { $not: { $elemMatch: { awarded: null } } },
    },
    {
      $push: { items: item },
      $inc: { revision: 1, aiCount: item.source === 'AI' ? 1 : 0 },
      $set: { updatedAt: new Date() },
    },
    { returnDocument: 'after' },
  );
  if (updated) return updated;
  const fresh = await c.practiceSessions.findOne({
    _id: session._id,
    studentId: session.studentId,
  });
  if (!fresh) httpError(404, 'Không tìm thấy phiên luyện tập.');
  return fresh;
}
export async function ensureNextQuestion(
  db: Db,
  session: PracticeSession,
  generate: AIGenerator | null,
  model: string,
) {
  if (session.status !== 'ACTIVE') return session;
  if (session.items.some((item) => item.awarded === null)) return session;
  const topic = nextPracticeTopic(session.plan, session.items);
  if (!topic) return finishPractice(db, session);
  const cursor = session.cursors.find((row) => row.topicId === topic.topicId);
  if (!cursor) httpError(500, 'Phiên luyện tập thiếu độ khó của chủ đề.');
  const excluded = await excludedQuestionIds(db, session.studentId);
  const bank = await pickBankQuestion(db, topic, cursor.difficulty, excluded);
  if (bank) {
    const content = questionContent(bank);
    content.difficulty = bank.difficulty;
    return saveItem(db, session, toItem(topic.topicId, 'BANK', bank._id.toHexString(), content));
  }
  if (!generate) {
    httpError(
      409,
      `Chưa có câu Sẵn sàng cho ${topic.topicPath.at(-1) || topic.subject}. Teacher cần bổ sung ngân hàng hoặc bật DeepSeek.`,
    );
  }
  if ((await aiQuestionsToday(db, session.studentId)) >= practiceLimits.dailyAiQuestions)
    httpError(
      429,
      'Đã dùng 40 câu AI trong 24 giờ. Hãy luyện lại sau hoặc dùng câu có sẵn trong ngân hàng.',
    );
  const generated = await generate({
    settings: {
      subject: topic.subject,
      topicPath: topic.topicPath,
      difficulty: cursor.difficulty,
      type: 'SINGLE_CHOICE',
      count: 1,
      language: 'vi',
      instructions:
        'One practice question for a student reviewing this topic. Test a single idea with a clear correct answer.',
    },
    source: { kind: 'PROMPT', name: topic.topicPath.join(' / '), text: '' },
    count: 1,
    previous: session.items
      .filter((item) => item.topicId === topic.topicId)
      .map((item) => item.delivered.question),
    feedback: '',
    model,
  });
  const content = generated[0]?.content;
  if (!content) httpError(502, 'AI chưa tạo được câu luyện tập. Hãy thử lại.');
  return saveItem(db, session, toItem(topic.topicId, 'AI', null, content));
}
export async function answerPracticeItem(
  db: Db,
  session: PracticeSession,
  itemId: string,
  response: string[],
) {
  const item = session.items.find((row) => row.id === itemId);
  if (!item) httpError(404, 'Không tìm thấy câu hỏi trong phiên này.');
  if (item.awarded !== null) return session;
  const open = session.items.find((row) => row.awarded === null);
  if (!open || open.id !== itemId) httpError(409, 'Hãy trả lời câu đang mở.');
  const awarded = gradeQuestion(item.delivered, response);
  if (awarded === null) httpError(400, 'Câu luyện tập cần dạng chấm được ngay.');
  const correct = awarded >= item.points;
  const cursors = session.cursors.map((cursor) =>
    cursor.topicId === item.topicId
      ? { ...cursor, difficulty: nextDifficulty(item.difficulty, correct) }
      : cursor,
  );
  const answeredCount = session.items.filter((row) => row.awarded !== null).length + 1;
  const total = session.plan.reduce((sum, topic) => sum + topic.count, 0);
  const done = answeredCount >= total;
  const now = new Date();
  const updated = await collections(db).practiceSessions.findOneAndUpdate(
    {
      _id: session._id,
      studentId: session.studentId,
      status: 'ACTIVE',
      revision: session.revision,
    },
    {
      $set: {
        'items.$[item].response': response,
        'items.$[item].awarded': awarded,
        'items.$[item].answeredAt': now,
        cursors,
        status: done ? 'SUBMITTED' : 'ACTIVE',
        submittedAt: done ? now : null,
        updatedAt: now,
        revision: session.revision + 1,
      },
    },
    { arrayFilters: [{ 'item.id': itemId, 'item.awarded': null }], returnDocument: 'after' },
  );
  if (!updated) httpError(409, 'Câu này vừa được ghi nhận. Hãy tải lại phiên luyện.');
  return updated;
}
export async function finishPractice(db: Db, session: PracticeSession) {
  if (session.status === 'SUBMITTED') return session;
  const now = new Date();
  const updated = await collections(db).practiceSessions.findOneAndUpdate(
    {
      _id: session._id,
      studentId: session.studentId,
      status: 'ACTIVE',
      revision: session.revision,
    },
    {
      $pull: { items: { awarded: null } },
      $set: { status: 'SUBMITTED', submittedAt: now, updatedAt: now },
      $inc: { revision: 1 },
    },
    { returnDocument: 'after' },
  );
  if (!updated) httpError(409, 'Phiên luyện vừa thay đổi. Hãy tải lại.');
  return updated;
}
