import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { collections } from '../src/database/collections.js';
import { ensureIndexes } from '../src/database/indexes.js';
import { deviceLabel } from '../src/common/exam-activity.js';
import { sampleQuestions } from '../src/common/question-transfer.js';
import type { Config } from '../src/common/config.js';
import type { Exam } from '../src/models/exam.model.js';

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

test('device labels stay short and do not invent an operating system', () => {
  assert.equal(
    deviceLabel('Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0').device,
    'Chrome · Windows',
  );
  assert.equal(deviceLabel('').device, 'Trình duyệt khác');
});

test('exam activity records facts and does not accuse a student', async (t) => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const client = new MongoClient(memory.getUri());
  await client.connect();
  t.after(async () => {
    await client.close();
    await memory.stop();
  });
  const db = client.db('exam_activity_test');
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
  const teacher = (
    await send('/auth/register')
      .send({ name: 'Teacher', email: 'teacher@example.com', password, role: 'TEACHER' })
      .expect(201)
  ).body;
  const student = (
    await send('/auth/register')
      .send({ name: 'An Minh', email: 'an@example.com', password, role: 'STUDENT' })
      .expect(201)
  ).body;
  const outsider = (
    await send('/auth/register')
      .send({ name: 'Other', email: 'other@example.com', password, role: 'TEACHER' })
      .expect(201)
  ).body;
  const stranger = (
    await send('/auth/register')
      .send({ name: 'Stranger', email: 'stranger@example.com', password, role: 'STUDENT' })
      .expect(201)
  ).body;
  const examFor = async (secure: boolean, leaveLimit = 3) => {
    const exam: Exam = {
      _id: new ObjectId(),
      ownerId: new ObjectId(teacher.user.id),
      title: secure ? 'Phòng thi' : 'Luyện tập',
      description: '',
      subject: 'Java',
      mode: 'MANUAL',
      topic: '',
      blueprint: { EASY: 1, MEDIUM: 0, HARD: 0, VERY_HARD: 0 },
      questions: [
        { questionId: new ObjectId(), version: 1, points: 1, content: sampleQuestions()[0] },
      ],
      settings: {
        startsAt: null,
        endsAt: null,
        durationMinutes: 30,
        maxAttempts: 2,
        passScore: 50,
        randomQuestions: true,
        randomAnswers: true,
        secure,
        leaveLimit,
        showAnswers: false,
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
    };
    await c.exams.insertOne(exam);
    return exam;
  };
  const secure = await examFor(true);
  const agent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0.0.0';
  const started = await send(`/exams/student/${secure._id}/start`, student.accessToken)
    .set('User-Agent', agent)
    .send({})
    .expect(201);
  assert.equal(started.body.settings.secure, true);
  const runId = started.body.id as string;
  await send(`/exams/runs/${runId}/activity`, student.accessToken)
    .send({ type: 'exam_started' })
    .expect(400);
  const warned = await send(`/exams/runs/${runId}/activity`, student.accessToken)
    .send({ type: 'tab_changed' })
    .expect(200);
  assert.equal(warned.body.accepted, true);
  assert.equal(warned.body.warning, true);
  assert.equal(warned.body.violations, 1);
  assert.equal(warned.body.limit, 3);
  assert.equal(warned.body.terminated, false);
  await send(`/exams/runs/${runId}/activity`, student.accessToken)
    .send({ type: 'returned' })
    .expect(200);
  await send(`/exams/runs/${runId}/activity`, student.accessToken)
    .send({ type: 'fullscreen_exited' })
    .expect(200);
  await send(`/exams/runs/${runId}/activity`, stranger.accessToken)
    .send({ type: 'tab_changed' })
    .expect(404);
  await read(`/exams/${secure._id}/submissions/${runId}/activity`, student.accessToken).expect(403);
  await read(`/exams/${secure._id}/submissions/${runId}/activity`, outsider.accessToken).expect(
    404,
  );

  const open = await send(`/exams/runs/${runId}/submit`, student.accessToken).send({}).expect(200);
  assert.equal(open.body.status === 'SUBMITTED' || open.body.status === 'PENDING_REVIEW', true);
  const log = await read(
    `/exams/${secure._id}/submissions/${runId}/activity`,
    teacher.accessToken,
  ).expect(200);
  assert.equal(log.body.cheating, undefined);
  assert.match(log.body.note, /chưa đủ để kết luận/);
  assert.deepEqual(
    log.body.events.map((event: { type: string }) => event.type),
    ['exam_started', 'tab_changed', 'returned', 'fullscreen_exited', 'exam_submitted'],
  );
  assert.equal(log.body.events[1].label, 'Rời tab');
  assert.equal(log.body.events[3].label, 'Thoát toàn màn hình');
  assert.equal(log.body.session.device, 'Chrome · Windows');
  assert.equal(log.body.counts.tab_changed, 1);
  assert.equal(log.body.secure, true);

  const practice = await examFor(false);
  const casual = await send(`/exams/student/${practice._id}/start`, student.accessToken)
    .send({})
    .expect(201);
  const ignored = await send(`/exams/runs/${casual.body.id}/activity`, student.accessToken)
    .send({ type: 'tab_changed' })
    .expect(200);
  assert.equal(ignored.body.accepted, false);
  const quiet = await read(
    `/exams/${practice._id}/submissions/${casual.body.id}/activity`,
    teacher.accessToken,
  ).expect(200);
  assert.deepEqual(
    quiet.body.events.map((event: { type: string }) => event.type),
    ['exam_started'],
  );
  assert.equal(quiet.body.secure, false);

  const strict = await examFor(true, 1);
  const second = await send(`/exams/student/${strict._id}/start`, student.accessToken)
    .send({})
    .expect(201);
  const secondId = second.body.id as string;
  assert.equal(second.body.settings.leaveLimit, 1);
  const watched = await send(`/exams/runs/${secondId}/activity`, student.accessToken)
    .send({ type: 'fullscreen_exited' })
    .expect(200);
  assert.equal(watched.body.terminated, false);
  assert.equal(watched.body.warning, false);
  const firstLeave = await send(`/exams/runs/${secondId}/activity`, student.accessToken)
    .send({ type: 'tab_changed' })
    .expect(200);
  assert.equal(firstLeave.body.violations, 1);
  assert.equal(firstLeave.body.terminated, false);
  const lastLeave = await send(`/exams/runs/${secondId}/activity`, student.accessToken)
    .send({ type: 'window_blur' })
    .expect(200);
  assert.equal(lastLeave.body.violations, 2);
  assert.equal(lastLeave.body.terminated, true);
  assert.equal(lastLeave.body.warning, false);
  const ended = await read(`/exams/runs/${secondId}`, student.accessToken).expect(200);
  assert.equal(ended.body.status, 'CANCELLED');
  assert.equal(ended.body.scorePercent, null);
  assert.equal(ended.body.passed, null);
  const again = await send(`/exams/runs/${secondId}/activity`, student.accessToken)
    .send({ type: 'tab_changed' })
    .expect(200);
  assert.equal(again.body.accepted, false);
  assert.equal(again.body.terminated, true);
  const revived = await send(`/exams/runs/${secondId}/submit`, student.accessToken)
    .send({})
    .expect(200);
  assert.equal(revived.body.status, 'CANCELLED');
  assert.equal(await c.attempts.countDocuments({ _id: new ObjectId(secondId) }), 0);
  const cancelledLog = await read(
    `/exams/${strict._id}/submissions/${secondId}/activity`,
    teacher.accessToken,
  ).expect(200);
  assert.equal(cancelledLog.body.cheating, undefined);
  assert.equal(cancelledLog.body.leave.count, 2);
  assert.equal(cancelledLog.body.leave.limit, 1);
  assert.equal(cancelledLog.body.leave.cancelled, true);
  assert.deepEqual(
    cancelledLog.body.events.map((event: { type: string }) => event.type),
    ['exam_started', 'fullscreen_exited', 'tab_changed', 'window_blur', 'exam_cancelled'],
  );
  assert.equal(cancelledLog.body.events.at(-1).label, 'Kết thúc vì rời trang quá số lần');
});
