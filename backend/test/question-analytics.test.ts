import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { collections } from '../src/database/collections.js';
import { ensureIndexes } from '../src/database/indexes.js';
import { nextDwell } from '../src/common/exam-runtime.js';
import {
  analyzeQuestion,
  attributeQuestion,
  examQuestionKeys,
  type ItemObservation,
} from '../src/common/question-analytics.js';
import type { Config } from '../src/common/config.js';
import type { ExamRun } from '../src/models/exam.model.js';
import type { Question, QuestionContent } from '../src/models/question.model.js';

const config: Config = {
  jwtSecret: 'test-secret-that-is-long-enough-for-local-tests',
  frontendUrl: 'http://localhost:3000',
  production: false,
  googleClientId: '',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  mailDirectory: '',
};

const choice = (
  correct: boolean,
  scorePercent: number,
  dwellMs: number | null = 48000,
): ItemObservation => ({
  points: 1,
  awarded: correct ? 1 : 0,
  scorePercent,
  dwellMs,
  type: 'SINGLE_CHOICE',
  options: [
    { id: 'a', text: 'AOF' },
    { id: 'b', text: 'RDB' },
    { id: 'c', text: 'Sentinel' },
    { id: 'd', text: 'Cluster' },
  ],
  left: [],
  correct: ['a'],
  response: [correct ? 'a' : 'b'],
});

test('question quality compares expected difficulty with the real correct rate', () => {
  const easyButHard = analyzeQuestion(
    'EASY',
    Array.from({ length: 100 }, (_, index) => choice(index < 21, index < 21 ? 90 : 20)),
  );
  assert.equal(easyButHard.correctRate, 21);
  assert.equal(easyButHard.difficultyIndex, 0.21);
  assert.equal(easyButHard.actual, 'HARD');
  assert.equal(easyButHard.averageSeconds, 48);
  assert.ok(
    easyButHard.warnings.some((warning) =>
      warning.includes('đặt độ khó Dễ nhưng chỉ 21% thí sinh trả lời đúng'),
    ),
  );

  const medium = analyzeQuestion(
    'MEDIUM',
    Array.from({ length: 100 }, (_, index) => choice(index < 32, 50)),
  );
  assert.equal(medium.actual, 'HARD');
  assert.equal(medium.correctRate, 32);

  const tooEasy = analyzeQuestion(
    'HARD',
    Array.from({ length: 10 }, () => choice(true, 95)),
  );
  assert.equal(tooEasy.actual, 'EASY');
  assert.ok(tooEasy.flags.includes('too_easy'));
  assert.ok(tooEasy.warnings.some((warning) => warning.includes('đặt độ khó Khó nhưng 100%')));

  const small = analyzeQuestion(
    'EASY',
    Array.from({ length: 9 }, () => choice(false, 10)),
  );
  assert.equal(small.actual, null);
  assert.equal(small.discrimination, null);
  assert.deepEqual(small.flags, []);
  assert.match(small.warnings[0], /ít nhất 10/);
});

test('discrimination uses the upper and lower 27 percent and distractors are flagged', () => {
  const scores = [90, 80, 70, 40, 30, 20, 15, 10, 5, 0];
  const separated = analyzeQuestion(
    'MEDIUM',
    scores.map((score) => choice(score >= 80, score)),
  );
  assert.equal(separated.discrimination, 0.67);
  assert.equal(separated.discriminationLabel, 'Rất tốt');

  const reversed = analyzeQuestion(
    'MEDIUM',
    scores.map((score) => choice(score <= 10, score)),
  );
  assert.equal(reversed.discrimination, -1);
  assert.match(reversed.warnings.join(' '), /Chỉ số phân biệt âm/);

  const distractors = analyzeQuestion(
    'MEDIUM',
    Array.from({ length: 20 }, (_, index) => {
      const picked = index < 4 ? 'a' : index < 16 ? 'b' : 'c';
      return {
        ...choice(picked === 'a', 50, null),
        response: [picked],
      };
    }),
  );
  assert.equal(distractors.choices.find((item) => item.text === 'RDB')?.flag, 'attractive');
  assert.equal(distractors.choices.find((item) => item.text === 'Cluster')?.flag, 'unused');
  assert.match(distractors.warnings.join(' '), /RDB/);
});

test('older attempts can be attributed by exam text when the bank id was not stored', () => {
  const id = new ObjectId();
  const keys = examQuestionKeys([
    {
      questionId: id,
      content: { question: 'SQL join', type: 'SINGLE_CHOICE' },
    },
    {
      questionId: new ObjectId(),
      content: { question: 'SQL join', type: 'SINGLE_CHOICE' },
    },
  ]);
  assert.equal(attributeQuestion({ question: 'SQL join', type: 'SINGLE_CHOICE' }, keys), null);
  const unique = examQuestionKeys([
    { questionId: id, content: { question: 'SQL join', type: 'SINGLE_CHOICE' } },
  ]);
  assert.equal(
    attributeQuestion({ question: '  SQL   join ', type: 'SINGLE_CHOICE' }, unique),
    id.toHexString(),
  );
  assert.equal(
    attributeQuestion({ bankQuestionId: id.toHexString(), question: 'other', type: 'ESSAY' }),
    id.toHexString(),
  );
});

test('dwell time is capped and is not invented for attempts that never recorded focus', () => {
  const questions = [{ id: 'q' }] as ExamRun['questions'];
  const now = new Date('2026-09-28T08:00:00Z');
  const idle = nextDwell(
    { questions, currentIndex: 0, focusIndex: 0, focusedAt: new Date(now.getTime() - 20 * 60000) },
    now,
    1,
  );
  assert.equal(idle.dwellMs[0], 15 * 60000);
  assert.equal(idle.focusIndex, 1);
  const legacy = nextDwell({ questions, currentIndex: 0 }, now, 0);
  assert.deepEqual(legacy.dwellMs, [0]);
});

test('question analytics stay inside the teacher’s submitted exams', async (t) => {
  const memory = await MongoMemoryServer.create();
  const client = new MongoClient(memory.getUri());
  await client.connect();
  t.after(async () => {
    await client.close();
    await memory.stop();
  });
  const db = client.db('question_analytics_test');
  await ensureIndexes(db);
  const c = collections(db);
  const app = createApp(db, config, { rateLimits: false, requireEmailVerification: false });
  const send = (path: string) =>
    request(app).post(`/api${path}`).set('X-Requested-With', 'QuizSpace');
  const read = (path: string, token: string) =>
    request(app)
      .get(`/api${path}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' });
  const password = 'Password123!';
  const teacher = await send('/auth/register')
    .send({ name: 'Teacher', email: 'teacher@example.com', password, role: 'TEACHER' })
    .expect(201);
  const student = await send('/auth/register')
    .send({ name: 'An Minh', email: 'an@example.com', password, role: 'STUDENT' })
    .expect(201);
  const teacherId = new ObjectId(teacher.body.user.id);
  const content = (text: string, difficulty: QuestionContent['difficulty']): QuestionContent => ({
    type: 'SINGLE_CHOICE',
    subject: 'Java',
    topicPath: ['Redis'],
    difficulty,
    status: 'READY',
    question: text,
    options: [
      { id: 'a', text: 'AOF' },
      { id: 'b', text: 'RDB' },
    ],
    answers: ['a'],
    pairs: [],
    rubric: '',
    explanation: '',
    tags: [],
    image: '',
    imageAlt: '',
  });
  const bank = (text: string, difficulty: QuestionContent['difficulty'], owner = teacherId) => {
    const question: Question = {
      ...content(text, difficulty),
      _id: new ObjectId(),
      ownerId: owner,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    return question;
  };
  const redis = bank('Redis persistence', 'EASY');
  const sql = bank('SQL join', 'HARD');
  sql.topicPath = ['SQL'];
  const hidden = bank('Hidden prompt', 'EASY', new ObjectId());
  await c.questions.insertMany([redis, sql, hidden]);
  const examId = new ObjectId();
  await c.exams.insertOne({
    _id: examId,
    ownerId: teacherId,
    title: 'Backend',
    description: '',
    subject: 'Java',
    mode: 'MANUAL',
    blueprint: { EASY: 0, MEDIUM: 0, HARD: 0, VERY_HARD: 0 },
    topic: '',
    questions: [
      { questionId: sql._id, version: 1, points: 1, content: content('SQL join', 'HARD') },
    ],
    settings: {
      startsAt: null,
      endsAt: null,
      durationMinutes: 30,
      maxAttempts: 1,
      passScore: 50,
      randomQuestions: false,
      randomAnswers: false,
      showAnswers: true,
      allowBack: true,
      autoSubmit: true,
      access: 'ALL',
      classIds: [],
      studentIds: [],
    },
    passwordHash: '',
    status: 'PUBLISHED',
    version: 1,
    admissionRevision: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const delivered = (text: string, bankQuestionId?: string) => ({
    id: new ObjectId().toHexString(),
    ...(bankQuestionId ? { bankQuestionId } : {}),
    type: 'SINGLE_CHOICE' as const,
    question: text,
    image: '',
    imageAlt: '',
    points: 1,
    options: [
      { id: 'a', text: 'AOF' },
      { id: 'b', text: 'RDB' },
    ],
    left: [],
    blankCount: 0,
    correct: ['a'],
    explanation: '',
    rubric: '',
  });
  let attemptNo = 0;
  const attempt = (
    ownerId: ObjectId,
    questionId: string | undefined,
    text: string,
    correct: boolean,
    score: number | null,
    status: ExamRun['status'] = 'SUBMITTED',
  ) =>
    ({
      _id: new ObjectId(),
      examId,
      ownerId,
      studentId: new ObjectId(student.body.user.id),
      studentName: 'An Minh',
      title: 'Backend',
      subject: 'Java',
      attemptNo: ++attemptNo,
      status,
      settings: { showAnswers: true, allowBack: true, autoSubmit: true, passScore: 50 },
      questions: [delivered(text, questionId)],
      responses: [[correct ? 'a' : 'b']],
      awarded: status === 'PENDING_REVIEW' ? [null] : [correct ? 1 : 0],
      feedback: [''],
      currentIndex: 0,
      revision: 1,
      startedAt: new Date(),
      expiresAt: new Date(),
      submittedAt: new Date(),
      scorePercent: score,
      passed: score === null ? null : score >= 50,
      dwellMs: status === 'PENDING_REVIEW' ? undefined : [48000],
    }) as ExamRun;
  const scores = [90, 80, 70, 40, 30, 20, 15, 10, 5, 0];
  await c.examRuns.insertMany([
    ...scores.map((score) =>
      attempt(teacherId, redis._id.toHexString(), 'Redis persistence', score >= 80, score),
    ),
    attempt(teacherId, redis._id.toHexString(), 'Redis persistence', false, null, 'PENDING_REVIEW'),
    attempt(new ObjectId(), redis._id.toHexString(), 'Redis persistence', true, 100),
    ...scores.map((score) => attempt(teacherId, undefined, 'SQL join', true, score)),
  ]);

  await read('/questions/analytics', student.body.accessToken).expect(403);
  await read(`/questions/${redis._id.toHexString()}/analytics`, student.body.accessToken).expect(
    403,
  );
  await read(`/questions/${hidden._id.toHexString()}/analytics`, teacher.body.accessToken).expect(
    404,
  );
  const list = await read('/questions/analytics', teacher.body.accessToken).expect(200);
  assert.equal(list.body.summary.analyzed, 2);
  assert.equal(list.body.questions[0].id, redis._id.toHexString());
  assert.equal(list.body.questions[0].attempts, 11);
  assert.equal(list.body.questions[0].correctRate, 20);
  assert.equal(list.body.questions[0].averageSeconds, 48);
  assert.equal(list.body.questions[0].actual, 'HARD');
  assert.ok(list.body.questions[0].flags.includes('mismatch'));
  assert.ok(list.body.questions[0].flags.includes('too_hard'));
  const sqlRow = list.body.questions.find(
    (item: { id: string }) => item.id === sql._id.toHexString(),
  );
  assert.equal(sqlRow.attempts, 10);
  assert.ok(sqlRow.flags.includes('too_easy'));
  assert.equal(
    list.body.questions.some((item: { id: string }) => item.id === hidden._id.toHexString()),
    false,
  );

  const detail = await read(
    `/questions/${redis._id.toHexString()}/analytics`,
    teacher.body.accessToken,
  ).expect(200);
  assert.match(detail.body.warnings[0], /Dễ nhưng chỉ 20%/);
  assert.equal(
    detail.body.choices.find((item: { text: string }) => item.text === 'RDB').flag,
    'attractive',
  );
  assert.equal(detail.body.difficultyIndex, 0.2);
});
