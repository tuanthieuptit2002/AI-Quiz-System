import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { collections } from '../src/database/collections.js';
import { ensureIndexes } from '../src/database/indexes.js';
import { sampleQuestions } from '../src/common/question-transfer.js';
import { expireRuns } from '../src/common/exam-runtime.js';
import { sendReminders } from '../src/common/notifications.js';
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

test('notifications: new exams, reminders, completions, results and teacher feedback', async (t) => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const client = new MongoClient(memory.getUri());
  await client.connect();
  t.after(async () => {
    await client.close();
    await memory.stop();
  });
  const db = client.db('notifications_test');
  await ensureIndexes(db);
  const c = collections(db);
  const app = createApp(db, config, { rateLimits: false, requireEmailVerification: false });
  const call = (method: 'get' | 'post', path: string, token: string) =>
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
  const an = await register('an@example.com', 'STUDENT');
  const binh = await register('binh@example.com', 'STUDENT');
  const outsider = await register('out@example.com', 'STUDENT');
  const userId = (user: { user: { id: string } }) => new ObjectId(user.user.id);
  const inbox = async (user: { user: { id: string } }, type?: string) =>
    c.notifications
      .find({ userId: userId(user), ...(type ? { type: type as never } : {}) })
      .sort({ createdAt: 1, _id: 1 })
      .toArray();

  const created = await call('post', '/teacher/classes', teacher.accessToken)
    .send({ name: 'Java 12A1', subject: 'Java' })
    .expect(201);
  const classId = created.body.id as string;
  for (const student of [an, binh])
    await call('post', '/student/classes/join', student.accessToken)
      .send({ code: created.body.code })
      .expect(200);

  const examOf = async (title: string, patch: Partial<Exam['settings']> = {}, extra = {}) => {
    const exam: Exam = {
      _id: new ObjectId(),
      ownerId: userId(teacher),
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
        randomQuestions: false,
        randomAnswers: false,
        secure: false,
        leaveLimit: 3,
        showAnswers: false,
        allowBack: true,
        autoSubmit: true,
        access: 'RESTRICTED',
        classIds: [],
        studentIds: [],
        ...patch,
      },
      passwordHash: '',
      status: 'PUBLISHED',
      version: 1,
      admissionRevision: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...extra,
    };
    await c.exams.insertOne(exam);
    return exam;
  };

  // Publishing notifies the direct students and every member of the audience classes.
  const midterm = await examOf(
    'Giữa kỳ',
    { classIds: [new ObjectId(classId)], studentIds: [userId(outsider)] },
    { status: 'DRAFT' },
  );
  await call('post', `/exams/${midterm._id}/publish`, teacher.accessToken)
    .send({ version: 1 })
    .expect(200);
  for (const student of [an, binh, outsider]) {
    const [note] = await inbox(student, 'NEW_EXAM');
    assert.equal(note.link, `/exams?exam=${midterm._id}`);
    assert.match(note.body, /"Giữa kỳ" đã được phát hành/);
  }
  assert.equal((await inbox(teacher)).length, 0);

  // Assigning a class exam notifies class members only, with the deadline in the message.
  const quiz = await examOf('Kiểm tra 15 phút');
  const dueAt = new Date(Date.now() + 2 * 86400000);
  const assigned = await call(
    'post',
    `/teacher/classes/${classId}/assignments`,
    teacher.accessToken,
  )
    .send({ examId: quiz._id.toHexString(), kind: 'QUIZ', dueAt: dueAt.toISOString() })
    .expect(201);
  await c.assignments.updateOne(
    { _id: new ObjectId(assigned.body.id) },
    { $set: { createdAt: new Date(Date.now() - 3600000) } },
  );
  assert.equal((await inbox(an, 'NEW_EXAM')).length, 2);
  assert.match((await inbox(binh, 'NEW_EXAM'))[1].body, /Lớp "Java 12A1" vừa giao bài kiểm tra/);
  assert.equal((await inbox(outsider, 'NEW_EXAM')).length, 1);

  // A manual submission tells the teacher; the student already sees the result on screen.
  const anRun = await call('post', `/exams/student/${quiz._id}/start`, an.accessToken)
    .send({})
    .expect(201);
  await call('post', `/exams/runs/${anRun.body.id}/submit`, an.accessToken).send({}).expect(200);
  let [completed] = await inbox(teacher, 'EXAM_COMPLETED');
  assert.equal(completed.body, 'an đã nộp bài "Kiểm tra 15 phút".');
  assert.equal(completed.link, `/exams?submissions=${quiz._id}`);
  assert.equal((await inbox(an, 'RESULT_READY')).length, 0);

  // Deadline reminder goes only to members who have not submitted yet, exactly once.
  const dayBefore = new Date(dueAt.getTime() - 12 * 3600000);
  await sendReminders(c, dayBefore);
  await sendReminders(c, dayBefore);
  assert.equal((await inbox(an, 'DEADLINE_SOON')).length, 0);
  const deadline = await inbox(binh, 'DEADLINE_SOON');
  assert.equal(deadline.length, 1);
  assert.equal(deadline[0].link, `/classes/${classId}`);

  // The clock auto-submits: the student gets the result and the teacher card is grouped.
  const binhRun = await call('post', `/exams/student/${quiz._id}/start`, binh.accessToken)
    .send({})
    .expect(201);
  await c.examRuns.updateOne(
    { _id: new ObjectId(binhRun.body.id) },
    { $set: { expiresAt: new Date(Date.now() - 1000) } },
  );
  await expireRuns(db);
  const [result] = await inbox(binh, 'RESULT_READY');
  assert.match(result.body, /tự động nộp khi hết giờ/);
  assert.equal(result.link, `/exam/${binhRun.body.id}`);
  const grouped = await inbox(teacher, 'EXAM_COMPLETED');
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].body, 'binh và 1 học sinh khác đã nộp bài "Kiểm tra 15 phút".');

  // Starting-soon reminders skip exams published after the reminder window opened.
  const now = new Date();
  const scheduled = await examOf(
    'Thi thử',
    { startsAt: new Date(now.getTime() + 20 * 60000), studentIds: [userId(an)] },
    { updatedAt: new Date(now.getTime() - 2 * 3600000) },
  );
  await examOf('Thi gấp', {
    startsAt: new Date(now.getTime() + 10 * 60000),
    studentIds: [userId(an)],
  });
  await sendReminders(c, now);
  await sendReminders(c, now);
  const starting = await inbox(an, 'EXAM_STARTING');
  assert.equal(starting.length, 1);
  assert.match(starting[0].body, /"Thi thử" bắt đầu lúc/);
  assert.equal(starting[0].link, `/exams?exam=${scheduled._id}`);

  // Written answers: grading finalises the result, later comments notify separately.
  const essay = await examOf(
    'Tự luận',
    { access: 'ALL', showAnswers: true },
    {
      status: 'DRAFT',
      questions: [
        {
          questionId: new ObjectId(),
          version: 1,
          points: 2,
          content: sampleQuestions().find((q) => q.type === 'ESSAY')!,
        },
      ],
    },
  );
  await call('post', `/exams/${essay._id}/publish`, teacher.accessToken)
    .send({ version: 1 })
    .expect(200);
  assert.equal((await inbox(outsider, 'NEW_EXAM')).length, 2);
  const essayRun = await call('post', `/exams/student/${essay._id}/start`, an.accessToken)
    .send({})
    .expect(201);
  await c.examRuns.updateOne(
    { _id: new ObjectId(essayRun.body.id) },
    { $set: { responses: [['Java là ngôn ngữ hướng đối tượng.']] } },
  );
  await call('post', `/exams/runs/${essayRun.body.id}/submit`, an.accessToken).send({}).expect(200);
  const grade = async (feedback: string) => {
    const run = await c.examRuns.findOne({ _id: new ObjectId(essayRun.body.id) });
    await call(
      'post',
      `/exams/${essay._id}/submissions/${essayRun.body.id}/grade`,
      teacher.accessToken,
    )
      .send({ revision: run!.revision, grades: [{ index: 0, points: 1.5, feedback }] })
      .expect(200);
  };
  await grade('Cần thêm ví dụ.');
  const [graded] = await inbox(an, 'RESULT_READY');
  assert.equal(
    graded.body,
    'Bài "Tự luận" đã được chấm xong, đạt 75%. Giáo viên có nhận xét cho bài làm.',
  );
  assert.equal((await inbox(an, 'TEACHER_FEEDBACK')).length, 0);
  await grade('Cần thêm ví dụ.');
  assert.equal((await inbox(an, 'TEACHER_FEEDBACK')).length, 0);
  await grade('Đã tốt hơn, thêm phần kết luận.');
  const [comment] = await inbox(an, 'TEACHER_FEEDBACK');
  assert.equal(comment.body, 'teacher vừa nhận xét bài "Tự luận".');

  // API: newest first, cursor paging, unread count and per-user isolation.
  const total = (await inbox(an)).length;
  const first = await call('get', '/notifications?limit=2', an.accessToken).expect(200);
  assert.equal(first.body.unread, total);
  assert.equal(first.body.notifications.length, 2);
  assert.equal(first.body.hasMore, true);
  assert.equal(first.body.notifications[0].type, 'TEACHER_FEEDBACK');
  const next = await call(
    'get',
    `/notifications?limit=50&before=${first.body.notifications[1].id}`,
    an.accessToken,
  ).expect(200);
  assert.equal(next.body.notifications.length, total - 2);
  assert.equal(next.body.hasMore, false);
  const id = first.body.notifications[0].id;
  await call('post', `/notifications/${id}/read`, binh.accessToken).expect(404);
  const read = await call('post', `/notifications/${id}/read`, an.accessToken).expect(200);
  assert.equal(read.body.unread, total - 1);
  await call('post', '/notifications/read-all', an.accessToken).expect(200);
  const after = await call('get', '/notifications', an.accessToken).expect(200);
  assert.equal(after.body.unread, 0);
  assert.ok(after.body.notifications.every((n: { read: boolean }) => n.read));
  assert.equal((await call('get', '/notifications', binh.accessToken)).body.unread > 0, true);

  // A new submission after the teacher read the grouped card starts a fresh count.
  const anMidterm = await call('post', `/exams/student/${midterm._id}/start`, an.accessToken)
    .send({})
    .expect(201);
  await call('post', `/exams/runs/${anMidterm.body.id}/submit`, an.accessToken)
    .send({})
    .expect(200);
  await c.notifications.updateMany({ userId: userId(teacher) }, { $set: { readAt: new Date() } });
  const outRun = await call('post', `/exams/student/${midterm._id}/start`, outsider.accessToken)
    .send({})
    .expect(201);
  await call('post', `/exams/runs/${outRun.body.id}/submit`, outsider.accessToken)
    .send({})
    .expect(200);
  [completed] = (await inbox(teacher, 'EXAM_COMPLETED')).filter((n) =>
    n.link.endsWith(midterm._id.toHexString()),
  );
  assert.equal(completed.body, 'out đã nộp bài "Giữa kỳ".');
  assert.equal(completed.readAt, null);
});
