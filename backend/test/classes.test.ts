import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { collections } from '../src/database/collections.js';
import { ensureIndexes } from '../src/database/indexes.js';
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

test('teacher runs a class: course, invite code, lessons, assignments with deadline, results', async (t) => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const client = new MongoClient(memory.getUri());
  await client.connect();
  t.after(async () => {
    await client.close();
    await memory.stop();
  });
  const db = client.db('classes_test');
  await ensureIndexes(db);
  const c = collections(db);
  const app = createApp(db, config, { rateLimits: false, requireEmailVerification: false });
  const call = (method: 'get' | 'post' | 'patch' | 'delete', path: string, token: string) =>
    request(app)
      [method](`/api${path}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' });
  const register = async (email: string, role: 'TEACHER' | 'STUDENT') =>
    (
      await request(app)
        .post('/api/auth/register')
        .set('X-Requested-With', 'QuizSpace')
        .send({ name: email.split('@')[0], email, password: 'Password123!', role })
        .expect(201)
    ).body as { accessToken: string; user: { id: string } };
  const teacher = await register('teacher@example.com', 'TEACHER');
  const other = await register('other@example.com', 'TEACHER');
  const an = await register('an@example.com', 'STUDENT');
  const binh = await register('binh@example.com', 'STUDENT');
  const outsider = await register('out@example.com', 'STUDENT');

  const foreignCourse = await call('post', '/teacher/courses', other.accessToken)
    .send({ title: 'Khóa khác' })
    .expect(201);
  const course = await call('post', '/teacher/courses', teacher.accessToken)
    .send({ title: 'Java cơ bản', description: 'Học kỳ 1' })
    .expect(201);
  await call('post', '/teacher/classes', teacher.accessToken)
    .send({ name: 'Java 12A1', subject: 'Java', courseId: foreignCourse.body.id })
    .expect(404);
  const created = await call('post', '/teacher/classes', teacher.accessToken)
    .send({ name: 'Java 12A1', subject: 'Java', courseId: course.body.id })
    .expect(201);
  const classId = created.body.id as string;
  assert.equal(created.body.courseId, course.body.id);
  const courses = await call('get', '/teacher/courses', teacher.accessToken).expect(200);
  assert.equal(courses.body.courses[0].classCount, 1);

  const joined = await call('post', '/student/classes/join', an.accessToken)
    .send({ code: created.body.code.toLowerCase() })
    .expect(200);
  assert.equal(joined.body.classId, classId);
  const reset = await call('post', `/teacher/classes/${classId}/code`, teacher.accessToken).expect(
    200,
  );
  assert.notEqual(reset.body.code, created.body.code);
  await call('post', '/student/classes/join', binh.accessToken)
    .send({ code: created.body.code })
    .expect(404);
  await call('post', '/student/classes/join', binh.accessToken)
    .send({ code: reset.body.code })
    .expect(200);
  await call('post', `/teacher/classes/${classId}/code`, other.accessToken).expect(404);

  await call('post', `/teacher/classes/${classId}/lessons`, teacher.accessToken)
    .send({ title: 'Bài 1', link: 'javascript:alert(1)' })
    .expect(400);
  await call('post', `/teacher/classes/${classId}/lessons`, teacher.accessToken)
    .send({
      title: 'Bài 1: Lớp và đối tượng',
      content: 'Đọc chương 1.',
      link: 'https://example.com',
    })
    .expect(201);

  const examOf = async (ownerId: string, title: string, status: Exam['status'] = 'PUBLISHED') => {
    const exam: Exam = {
      _id: new ObjectId(),
      ownerId: new ObjectId(ownerId),
      title,
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
        maxAttempts: 1,
        passScore: 50,
        randomQuestions: true,
        randomAnswers: true,
        secure: false,
        leaveLimit: 3,
        showAnswers: false,
        allowBack: true,
        autoSubmit: true,
        access: 'RESTRICTED',
        classIds: [],
        studentIds: [],
      },
      passwordHash: '',
      status,
      version: 1,
      admissionRevision: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    await c.exams.insertOne(exam);
    return exam._id.toHexString();
  };
  const quiz = await examOf(teacher.user.id, 'Kiểm tra 15 phút');
  const draft = await examOf(teacher.user.id, 'Bản nháp', 'DRAFT');
  const foreign = await examOf(other.user.id, 'Đề của người khác');
  const final = await examOf(teacher.user.id, 'Thi cuối kỳ');

  await call('post', `/exams/student/${quiz}/start`, an.accessToken).send({}).expect(404);
  const soon = new Date(Date.now() + 10 * 60000).toISOString();
  await call('post', `/teacher/classes/${classId}/assignments`, teacher.accessToken)
    .send({ examId: quiz, kind: 'QUIZ', dueAt: new Date(Date.now() - 60000).toISOString() })
    .expect(400);
  for (const examId of [draft, foreign])
    await call('post', `/teacher/classes/${classId}/assignments`, teacher.accessToken)
      .send({ examId, kind: 'QUIZ', dueAt: soon })
      .expect(404);
  const assigned = await call(
    'post',
    `/teacher/classes/${classId}/assignments`,
    teacher.accessToken,
  )
    .send({ examId: quiz, kind: 'QUIZ', dueAt: soon })
    .expect(201);
  assert.equal(assigned.body.exam.title, 'Kiểm tra 15 phút');
  await call('post', `/teacher/classes/${classId}/assignments`, teacher.accessToken)
    .send({ examId: quiz, kind: 'EXAM', dueAt: soon })
    .expect(409);
  const later = await call('post', `/teacher/classes/${classId}/assignments`, teacher.accessToken)
    .send({ examId: final, kind: 'EXAM', dueAt: soon })
    .expect(201);

  const list = await call('get', '/exams/student', an.accessToken).expect(200);
  const listed = list.body.exams.find((exam: { id: string }) => exam.id === quiz);
  assert.equal(listed.dueAt, soon);
  const hidden = await call('get', '/exams/student', outsider.accessToken).expect(200);
  assert.equal(hidden.body.exams.length, 0);
  await call('post', `/exams/student/${quiz}/start`, outsider.accessToken).send({}).expect(404);

  const run = await call('post', `/exams/student/${quiz}/start`, an.accessToken)
    .send({})
    .expect(201);
  assert.ok(Date.parse(run.body.expiresAt) <= Date.parse(soon));
  await call('post', `/exams/runs/${run.body.id}/submit`, an.accessToken).send({}).expect(200);

  await c.assignments.updateOne(
    { _id: new ObjectId(later.body.id) },
    { $set: { dueAt: new Date(Date.now() - 1000) } },
  );
  const late = await call('post', `/exams/student/${final}/start`, an.accessToken)
    .send({})
    .expect(403);
  assert.match(late.body.message, /quá hạn/);

  const mine = await call('get', `/student/classes/${classId}`, an.accessToken).expect(200);
  assert.equal(mine.body.classroom.courseTitle, 'Java cơ bản');
  assert.equal(mine.body.lessons[0].link, 'https://example.com');
  const states = Object.fromEntries(
    mine.body.assignments.map((row: { exam: { title: string }; state: string }) => [
      row.exam.title,
      row.state,
    ]),
  );
  assert.deepEqual(states, { 'Thi cuối kỳ': 'OVERDUE', 'Kiểm tra 15 phút': 'EXHAUSTED' });
  await call('get', `/student/classes/${classId}`, outsider.accessToken).expect(404);

  const results = await call(
    'get',
    `/teacher/classes/${classId}/results`,
    teacher.accessToken,
  ).expect(200);
  assert.equal(results.body.studentCount, 2);
  const quizResult = results.body.assignments.find(
    (row: { exam: { title: string } }) => row.exam.title === 'Kiểm tra 15 phút',
  );
  assert.equal(quizResult.summary.submitted, 1);
  const anRow = quizResult.students.find(
    (row: { email: string }) => row.email === 'an@example.com',
  );
  const binhRow = quizResult.students.find(
    (row: { email: string }) => row.email === 'binh@example.com',
  );
  assert.equal(anRow.status, 'SUBMITTED');
  assert.equal(typeof anRow.bestScore, 'number');
  assert.equal(binhRow.status, 'NOT_STARTED');
  await call('get', `/teacher/classes/${classId}/results`, other.accessToken).expect(404);

  await call('delete', `/teacher/courses/${course.body.id}`, teacher.accessToken).expect(200);
  assert.equal((await c.classes.findOne({ _id: new ObjectId(classId) }))?.courseId, null);
  await call('delete', `/teacher/classes/${classId}`, teacher.accessToken).expect(200);
  assert.equal(await c.lessons.countDocuments({ classId: new ObjectId(classId) }), 0);
  assert.equal(await c.assignments.countDocuments({ classId: new ObjectId(classId) }), 0);
  assert.equal(await c.examRuns.countDocuments({ _id: new ObjectId(run.body.id) }), 1);
});
