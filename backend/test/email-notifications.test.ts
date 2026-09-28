import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { collections } from '../src/database/collections.js';
import { ensureIndexes } from '../src/database/indexes.js';
import { sampleQuestions } from '../src/common/question-transfer.js';
import { notify, notifyRunFinished } from '../src/common/notifications.js';
import { processNextEmail, retryDelaysMs } from '../src/common/email-runtime.js';
import type { MailMessage } from '../src/common/mail.js';
import type { Config } from '../src/common/config.js';
import type { Exam, ExamRun } from '../src/models/exam.model.js';

const config: Config = {
  jwtSecret: 'test-secret-that-is-long-enough-for-local-tests',
  frontendUrl: 'https://quiz.example.com',
  production: false,
  googleClientId: '',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  mailDirectory: '',
};

test('student notifications are queued and delivered by email', async (t) => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const client = new MongoClient(memory.getUri());
  await client.connect();
  t.after(async () => {
    await client.close();
    await memory.stop();
  });
  const db = client.db('email_notifications_test');
  await ensureIndexes(db);
  const c = collections(db);
  const app = createApp(db, config, { rateLimits: false, requireEmailVerification: false });
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
  const idOf = (user: { user: { id: string } }) => new ObjectId(user.user.id);

  const sent: MailMessage[] = [];
  const mailer = async (mail: MailMessage) => {
    sent.push(mail);
  };
  const drain = async (send = mailer) => {
    while (await processNextEmail(db, config, send));
  };

  await t.test('assigning an exam to a class emails every class member once', async () => {
    const created = await request(app)
      .post('/api/teacher/classes')
      .set('X-Requested-With', 'QuizSpace')
      .auth(teacher.accessToken, { type: 'bearer' })
      .send({ name: 'Java 12A1', subject: 'Java' })
      .expect(201);
    for (const student of [an, binh])
      await request(app)
        .post('/api/student/classes/join')
        .set('X-Requested-With', 'QuizSpace')
        .auth(student.accessToken, { type: 'bearer' })
        .send({ code: created.body.code })
        .expect(200);
    const exam: Exam = {
      _id: new ObjectId(),
      ownerId: idOf(teacher),
      title: 'Giữa kỳ',
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
        showAnswers: false,
        allowBack: true,
        autoSubmit: true,
        access: 'RESTRICTED',
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
    await request(app)
      .post(`/api/teacher/classes/${created.body.id}/assignments`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(teacher.accessToken, { type: 'bearer' })
      .send({
        examId: exam._id.toHexString(),
        kind: 'EXAM',
        dueAt: new Date(Date.now() + 3 * 86400000).toISOString(),
      })
      .expect(201);

    assert.equal(await c.emailJobs.countDocuments({ status: 'QUEUED' }), 2);
    await drain();
    assert.deepEqual(sent.map((m) => m.to).sort(), ['an@example.com', 'binh@example.com']);
    const mail = sent[0];
    assert.equal(mail.subject, '[QuizSpace] Có bài mới trong lớp');
    assert.match(mail.text, /Giữa kỳ/);
    assert.match(mail.text, new RegExp(`https://quiz\\.example\\.com/classes/${created.body.id}`));
    assert.equal(await c.emailJobs.countDocuments({ status: 'SENT' }), 2);
    await drain();
    assert.equal(sent.length, 2);
  });

  await t.test('repeated events and teacher-only notifications are not emailed', async () => {
    sent.length = 0;
    const message = {
      type: 'EXAM_STARTING' as const,
      key: 'starting:test',
      title: 'Bài thi sắp bắt đầu',
      body: '"Cuối kỳ" bắt đầu lúc 08:00.',
      link: '/exams',
    };
    await notify(c, [idOf(an)], message);
    await notify(c, [idOf(an), idOf(binh)], message);
    assert.equal(await c.emailJobs.countDocuments({ key: 'starting:test' }), 2);

    await notifyRunFinished(
      c,
      {
        _id: new ObjectId(),
        examId: new ObjectId(),
        ownerId: idOf(teacher),
        studentId: idOf(an),
        studentName: 'an',
        title: 'Cuối kỳ',
        status: 'PENDING_REVIEW',
      } as ExamRun,
      false,
    );
    assert.equal(await c.emailJobs.countDocuments({ userId: idOf(teacher) }), 0);
    await drain();
    assert.deepEqual(sent.map((m) => m.to).sort(), ['an@example.com', 'binh@example.com']);
  });

  await t.test('locked or unverified students are skipped', async () => {
    sent.length = 0;
    await c.users.updateOne({ _id: idOf(binh) }, { $set: { status: 'LOCKED' } });
    await c.users.updateOne({ _id: idOf(an) }, { $set: { emailVerifiedAt: null } });
    await notify(c, [idOf(an), idOf(binh)], {
      type: 'RESULT_READY',
      key: 'result:skipped',
      title: 'Đã có kết quả',
      body: 'Bài đã được chấm.',
      link: '/exams',
    });
    await drain();
    assert.equal(sent.length, 0);
    assert.equal(await c.emailJobs.countDocuments({ key: 'result:skipped', status: 'SKIPPED' }), 2);
    await c.users.updateOne({ _id: idOf(binh) }, { $set: { status: 'ACTIVE' } });
    await c.users.updateOne({ _id: idOf(an) }, { $set: { emailVerifiedAt: new Date() } });
  });

  await t.test('SMTP failures retry with backoff and stop after the last attempt', async () => {
    await notify(c, [idOf(an)], {
      type: 'DEADLINE_SOON',
      key: 'deadline:retry',
      title: 'Sắp hết hạn',
      body: 'Bạn chưa nộp bài.',
      link: '/exams',
    });
    const failing = async () => {
      throw new Error('SMTP down');
    };
    for (let attempt = 1; attempt <= retryDelaysMs.length + 1; attempt++) {
      assert.equal(await processNextEmail(db, config, failing), true);
      const job = await c.emailJobs.findOne({ key: 'deadline:retry' });
      assert.equal(job?.attempts, attempt);
      assert.equal(job?.error, 'SMTP down');
      if (attempt <= retryDelaysMs.length) {
        assert.equal(job?.status, 'QUEUED');
        assert.ok(job!.nextAttemptAt.getTime() > Date.now());
        assert.equal(await processNextEmail(db, config, failing), false);
        await c.emailJobs.updateOne({ _id: job!._id }, { $set: { nextAttemptAt: new Date() } });
      } else assert.equal(job?.status, 'FAILED');
    }
  });

  await t.test('an interrupted send is picked up again after its lease expires', async () => {
    sent.length = 0;
    await notify(c, [idOf(binh)], {
      type: 'TEACHER_FEEDBACK',
      key: 'feedback:lease',
      title: 'Giáo viên đã nhận xét',
      body: 'Có nhận xét mới.',
      link: '/exams',
    });
    await c.emailJobs.updateOne(
      { key: 'feedback:lease' },
      {
        $set: { status: 'SENDING', leaseUntil: new Date(Date.now() - 1000) },
        $inc: { attempts: 1 },
      },
    );
    await drain();
    assert.deepEqual(
      sent.map((m) => m.to),
      ['binh@example.com'],
    );
    assert.equal((await c.emailJobs.findOne({ key: 'feedback:lease' }))?.status, 'SENT');
  });
});
