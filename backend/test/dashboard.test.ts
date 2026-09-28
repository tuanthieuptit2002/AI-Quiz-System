import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { collections } from '../src/database/collections.js';
import { ensureIndexes } from '../src/database/indexes.js';
import { topicLists } from '../src/common/dashboard.js';
import type { Config } from '../src/common/config.js';
import type { ExamRun } from '../src/models/exam.model.js';
import type { LearningMetric } from '../src/models/learning.model.js';

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

test('topic lists keep the learning-analysis strong and weak cutoffs', () => {
  const topic = (name: string, level: LearningMetric['level'], score: number): LearningMetric => ({
    id: name,
    subject: 'Java',
    topicPath: ['Backend', name],
    questions: 6,
    exams: 2,
    earned: score,
    possible: 100,
    score,
    level,
  });
  const lists = topicLists([
    topic('SQL', 'STRONG', 92),
    topic('Java Core', 'STRONG', 88),
    topic('Kafka', 'WEAK', 40),
    topic('Redis', 'WEAK', 30),
    topic('Docker', 'DEVELOPING', 70),
    topic('HTTP', 'INSUFFICIENT', 100),
  ]);
  assert.deepEqual(
    lists.strong.map((item) => item.topic),
    ['SQL', 'Java Core'],
  );
  assert.deepEqual(
    lists.weak.map((item) => item.topic),
    ['Redis', 'Kafka'],
  );
});

test('teacher and student dashboards use owned graded work only', async (t) => {
  const memory = await MongoMemoryServer.create();
  const client = new MongoClient(memory.getUri());
  await client.connect();
  t.after(async () => {
    await client.close();
    await memory.stop();
  });
  const db = client.db('dashboard_test');
  await ensureIndexes(db);
  const c = collections(db);
  const app = createApp(db, config, { rateLimits: false, requireEmailVerification: false });
  const send = (path: string, token = '') =>
    request(app)
      .post(`/api${path}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' });
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
  const studentId = new ObjectId(student.body.user.id);
  const outsider = new ObjectId();
  const now = new Date();
  const run = (
    ownerId: ObjectId,
    learner: ObjectId,
    name: string,
    subject: string,
    score: number,
    passed: boolean,
    seconds: number,
    status: ExamRun['status'] = 'SUBMITTED',
  ) => {
    const submittedAt = new Date(now.getTime() - 86400000);
    return {
      _id: new ObjectId(),
      examId: new ObjectId(),
      ownerId,
      studentId: learner,
      studentName: name,
      title: subject,
      subject,
      attemptNo: 1,
      status,
      settings: { showAnswers: true, allowBack: true, autoSubmit: true, passScore: 50 },
      questions: [
        {
          id: 'sql',
          type: 'SINGLE_CHOICE',
          question: 'SQL join',
          image: '',
          imageAlt: '',
          points: 1,
          options: [],
          left: [],
          blankCount: 0,
          correct: [],
          explanation: '',
          rubric: '',
          classification: { subject, topicPath: ['SQL'], difficulty: 'EASY' },
        },
        {
          id: 'redis',
          type: 'SINGLE_CHOICE',
          question: 'Redis persistence',
          image: '',
          imageAlt: '',
          points: 1,
          options: [],
          left: [],
          blankCount: 0,
          correct: [],
          explanation: '',
          rubric: '',
          classification: { subject, topicPath: ['Redis'], difficulty: 'HARD' },
        },
      ],
      responses: [],
      awarded: status === 'SUBMITTED' ? [1, 0] : [null, null],
      feedback: [],
      currentIndex: 0,
      revision: 1,
      startedAt: new Date(submittedAt.getTime() - seconds * 1000),
      expiresAt: new Date(submittedAt.getTime() + 3600000),
      submittedAt: status === 'SUBMITTED' ? submittedAt : null,
      scorePercent: status === 'SUBMITTED' ? score : null,
      passed: status === 'SUBMITTED' ? passed : null,
    } satisfies ExamRun;
  };
  await c.classes.insertOne({
    _id: new ObjectId(),
    teacherId,
    name: 'Java',
    subject: 'Java',
    description: '',
    code: 'ABCDE12345',
    color: 'mint',
    studentIds: [studentId],
    createdAt: now,
    updatedAt: now,
  });
  await c.exams.insertMany([
    { _id: new ObjectId(), ownerId: teacherId, status: 'PUBLISHED' } as never,
    { _id: new ObjectId(), ownerId: teacherId, status: 'ARCHIVED' } as never,
  ]);
  await c.questions.insertMany([
    { _id: new ObjectId(), ownerId: teacherId, status: 'READY' } as never,
    { _id: new ObjectId(), ownerId: teacherId, status: 'DRAFT' } as never,
    { _id: new ObjectId(), ownerId: teacherId, status: 'ARCHIVED' } as never,
  ]);
  await c.examRuns.insertMany([
    run(teacherId, studentId, 'An Minh', 'Java', 80, true, 600),
    run(teacherId, studentId, 'An Minh', 'Java', 60, true, 1200),
    run(teacherId, outsider, 'Binh', 'Kafka', 40, false, 1800),
    run(teacherId, studentId, 'An Minh', 'Java', 0, false, 60, 'PENDING_REVIEW'),
    run(new ObjectId(), studentId, 'An Minh', 'Java', 0, false, 60),
  ]);
  await c.attempts.insertMany([
    {
      _id: new ObjectId(),
      studentId,
      title: 'Java 1',
      subject: 'Java',
      score: 7.8,
      durationSeconds: 3600,
      submittedAt: now,
    },
    {
      _id: new ObjectId(),
      studentId,
      title: 'Java 2',
      subject: 'Java',
      score: 9.6,
      durationSeconds: 3600,
      submittedAt: now,
    },
  ]);
  const examA = new ObjectId();
  const examB = new ObjectId();
  const learningRun = (examId: ObjectId) =>
    ({
      ...run(new ObjectId(), studentId, 'An Minh', 'Java', 70, true, 600),
      examId,
      questions: [
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `sql-${index}`,
          type: 'SINGLE_CHOICE' as const,
          question: 'SQL',
          image: '',
          imageAlt: '',
          points: 1,
          options: [],
          left: [],
          blankCount: 0,
          correct: [],
          explanation: '',
          rubric: '',
          classification: { subject: 'Java', topicPath: ['SQL'], difficulty: 'EASY' as const },
        })),
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `kafka-${index}`,
          type: 'SINGLE_CHOICE' as const,
          question: 'Kafka',
          image: '',
          imageAlt: '',
          points: 1,
          options: [],
          left: [],
          blankCount: 0,
          correct: [],
          explanation: '',
          rubric: '',
          classification: { subject: 'Java', topicPath: ['Kafka'], difficulty: 'HARD' as const },
        })),
      ],
      awarded: [...Array(5).fill(1), ...Array(5).fill(0)],
      submittedAt: now,
    }) satisfies ExamRun;
  await c.examRuns.insertMany([learningRun(examA), learningRun(examB)]);

  await read('/teacher/dashboard', student.body.accessToken).expect(403);
  const teacherView = await read('/teacher/dashboard', teacher.body.accessToken).expect(200);
  assert.equal(teacherView.body.students, 1);
  assert.equal(teacherView.body.exams, 1);
  assert.equal(teacherView.body.questions, 2);
  assert.equal(teacherView.body.attempts, 4);
  assert.equal(teacherView.body.averageScore, 60);
  assert.equal(teacherView.body.passRate, 66.7);
  assert.equal(teacherView.body.averageMinutes, 20);
  assert.equal(
    teacherView.body.distribution.find((band: { label: string }) => band.label === 'Dưới 50').count,
    1,
  );
  assert.equal(
    teacherView.body.distribution.find((band: { label: string }) => band.label === '60–69').count,
    1,
  );
  assert.equal(
    teacherView.body.distribution.find((band: { label: string }) => band.label === '80–89').count,
    1,
  );
  assert.deepEqual(teacherView.body.passFail, { passed: 2, failed: 1 });
  assert.equal(teacherView.body.missed[0].question, 'Redis persistence');
  assert.equal(teacherView.body.missed[0].misses, 3);
  assert.equal(
    teacherView.body.topics.find((topic: { topic: string }) => topic.topic === 'SQL').score,
    100,
  );
  assert.equal(teacherView.body.studentPerformance[0].name, 'An Minh');
  assert.equal(teacherView.body.studentPerformance[0].score, 70);

  await read('/student/dashboard', teacher.body.accessToken).expect(403);
  const studentView = await read('/student/dashboard', student.body.accessToken).expect(200);
  assert.equal(studentView.body.completed, 2);
  assert.equal(studentView.body.averageScore, 87);
  assert.equal(studentView.body.bestScore, 96);
  assert.equal(studentView.body.studyMinutes, 120);
  assert.deepEqual(
    studentView.body.strong.map((item: { topic: string }) => item.topic),
    ['SQL'],
  );
  assert.deepEqual(
    studentView.body.weak.map((item: { topic: string }) => item.topic),
    ['Kafka'],
  );
});
