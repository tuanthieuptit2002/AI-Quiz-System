import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import sharp from 'sharp';
import { createApp } from '../src/app.js';
import { ensureIndexes } from '../src/database/indexes.js';
import { collections } from '../src/database/collections.js';
import type { User } from '../src/models/user.model.js';
import { accessToken, digest, hashPassword, randomToken } from '../src/common/security.js';
import type { Config } from '../src/common/config.js';

test('Accounts, RBAC and classroom integration on isolated MongoDB', async (t) => {
  const memory = await MongoMemoryServer.create();
  const client = new MongoClient(memory.getUri());
  await client.connect();
  t.after(async () => {
    await client.close();
    await memory.stop();
  });
  const db = client.db('accounts_test');
  await ensureIndexes(db);
  const c = collections(db);
  const emails: { email: string; link: string; kind: string }[] = [];
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
  const app = createApp(db, config, {
    rateLimits: false,
    mailer: async (email, link, _config, kind = 'reset') => {
      emails.push({ email, link, kind });
    },
  });
  const post = (path: string) =>
    request(app).post(`/api${path}`).set('X-Requested-With', 'QuizSpace');
  const patch = (path: string, token: string) =>
    request(app)
      .patch(`/api${path}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' });
  const get = (path: string, token: string) =>
    request(app).get(`/api${path}`).auth(token, { type: 'bearer' });
  const cookie = (response: request.Response) =>
    String(response.headers['set-cookie']?.[0]).split(';')[0];
  const password = 'Password123!';
  const admin: User = {
    _id: new ObjectId(),
    email: 'admin@example.com',
    name: 'Admin',
    role: 'ADMIN',
    status: 'ACTIVE',
    passwordHash: await hashPassword(password),
    avatar: '',
    phone: '',
    bio: '',
    weeklyGoal: 3,
    tokenVersion: 0,
    emailVerifiedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  await c.users.insertOne(admin);
  let adminToken: string;
  let teacherToken: string;
  let otherTeacherToken: string;
  let studentToken: string;
  let studentId: string;
  let studentCookie: string;
  let teacherId: string;
  let classId: string;
  let classCode: string;

  await t.test(
    'registration requires a matching password and a one-time email link before a session',
    async () => {
      await post('/auth/register')
        .send({
          name: 'Hacker',
          email: 'bad@example.com',
          password,
          confirmPassword: password,
          role: 'ADMIN',
        })
        .expect(400);
      await post('/auth/register')
        .send({ name: 'Weak', email: 'weak@example.com', password: '123', confirmPassword: '123' })
        .expect(400);
      await post('/auth/register')
        .send({
          name: 'Mismatch',
          email: 'mismatch@example.com',
          password,
          confirmPassword: 'OtherPass123!',
          role: 'STUDENT',
        })
        .expect(400);
      assert.equal(await c.users.countDocuments({ email: 'mismatch@example.com' }), 0);
      const pending = await post('/auth/register')
        .send({
          name: 'Pending',
          email: 'pending@example.com',
          password,
          confirmPassword: password,
          role: 'STUDENT',
        })
        .expect(201);
      assert.equal(pending.body.accessToken, undefined);
      assert.equal(pending.headers['set-cookie'], undefined);
      await post('/auth/login').send({ email: 'pending@example.com', password }).expect(403);
      const pendingMail = emails.find((item) => item.email === 'pending@example.com');
      assert.equal(pendingMail?.kind, 'verify');
      const pendingToken = new URL(pendingMail!.link).searchParams.get('token');
      await c.users.updateOne(
        { email: 'pending@example.com' },
        { $set: { verifyExpiresAt: new Date(0) } },
      );
      await post('/auth/verify-email').send({ token: pendingToken }).expect(400);
      const known = await post('/auth/resend-verification')
        .send({ email: 'pending@example.com' })
        .expect(200);
      const unknown = await post('/auth/resend-verification')
        .send({ email: 'unknown@example.com' })
        .expect(200);
      assert.deepEqual(known.body, unknown.body);
      assert.equal(known.body.token, undefined);
      const resent = emails.filter((item) => item.email === 'pending@example.com').at(-1)!;
      const freshToken = new URL(resent.link).searchParams.get('token');
      const verifiedPending = await post('/auth/verify-email')
        .send({ token: freshToken })
        .expect(200);
      assert.equal(verifiedPending.body.user.email, 'pending@example.com');
      await post('/auth/verify-email').send({ token: freshToken }).expect(400);
      await post('/auth/login').send({ email: 'pending@example.com', password }).expect(200);

      const openAccount = async (body: {
        name: string;
        email: string;
        role: 'TEACHER' | 'STUDENT';
      }) => {
        const created = await post('/auth/register')
          .send({ ...body, password, confirmPassword: password })
          .expect(201);
        assert.equal(created.body.accessToken, undefined);
        const sent = emails.filter((item) => item.email === body.email.toLowerCase()).at(-1)!;
        const token = new URL(sent.link).searchParams.get('token');
        return post('/auth/verify-email').send({ token }).expect(200);
      };
      const teacher = await openAccount({
        name: 'Teacher One',
        email: 'Teacher@example.com',
        role: 'TEACHER',
      });
      teacherToken = teacher.body.accessToken;
      teacherId = teacher.body.user.id;
      assert.equal(teacher.body.user.email, 'teacher@example.com');
      assert.equal(teacher.body.user.passwordHash, undefined);
      const other = await openAccount({
        name: 'Teacher Two',
        email: 'other@example.com',
        role: 'TEACHER',
      });
      otherTeacherToken = other.body.accessToken;
      const student = await openAccount({
        name: 'Student One',
        email: 'student@example.com',
        role: 'STUDENT',
      });
      studentToken = student.body.accessToken;
      studentId = student.body.user.id;
      studentCookie = cookie(student);
      assert.match(student.headers['set-cookie'][0], /HttpOnly/);
      assert.match(student.headers['set-cookie'][0], /SameSite=Strict/);
      const stored = await c.users.findOne({ email: 'student@example.com' });
      assert.ok(stored?.passwordHash?.startsWith('$2b$'));
      assert.notEqual(stored.passwordHash, password);
      assert.ok(stored?.emailVerifiedAt instanceof Date);
      await post('/auth/register')
        .send({
          name: 'Duplicate',
          email: 'STUDENT@example.com',
          password,
          confirmPassword: password,
          role: 'STUDENT',
        })
        .expect(409);
    },
  );
  await t.test(
    'password accounts created before verification stay signed out until the email link is opened',
    async () => {
      const legacy: User = {
        _id: new ObjectId(),
        email: 'legacy@example.com',
        name: 'Legacy User',
        role: 'STUDENT',
        status: 'ACTIVE',
        passwordHash: await hashPassword(password),
        avatar: '',
        phone: '',
        bio: '',
        weeklyGoal: 3,
        tokenVersion: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      await c.users.insertOne(legacy);
      const refresh = randomToken();
      const sessionId = new ObjectId();
      await c.sessions.insertOne({
        _id: sessionId,
        userId: legacy._id,
        tokenHash: digest(refresh),
        usedHashes: [],
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000),
        revoked: false,
        tokenVersion: 0,
      });
      const bearer = accessToken(legacy, sessionId, config);
      await get('/me', bearer).expect(403);
      await post('/auth/refresh').set('Cookie', `qs_refresh=${refresh}`).expect(401);
      await post('/auth/login').send({ email: legacy.email, password }).expect(403);
      const known = await post('/auth/resend-verification')
        .send({ email: legacy.email })
        .expect(200);
      const unknown = await post('/auth/resend-verification')
        .send({ email: 'nobody-legacy@example.com' })
        .expect(200);
      assert.deepEqual(known.body, unknown.body);
      assert.equal(known.body.token, undefined);
      const sent = emails
        .filter((item) => item.email === legacy.email && item.kind === 'verify')
        .at(-1);
      assert.ok(sent);
      const verified = await post('/auth/verify-email')
        .send({ token: new URL(sent.link).searchParams.get('token') })
        .expect(200);
      assert.equal(verified.body.user.email, legacy.email);
      await get('/me', verified.body.accessToken).expect(200);
      await post('/auth/login').send({ email: legacy.email, password }).expect(200);
    },
  );
  await t.test(
    'login checks credentials; CSRF, unauthenticated requests and wrong roles are blocked',
    async () => {
      await post('/auth/login')
        .send({ email: 'student@example.com', password: 'wrong-password' })
        .expect(401);
      const login = await post('/auth/login').send({ email: admin.email, password }).expect(200);
      adminToken = login.body.accessToken;
      await request(app).get('/api/admin/users').expect(401);
      await get('/admin/users', studentToken).expect(403);
      await get('/admin/users', teacherToken).expect(403);
      await get('/teacher/classes', studentToken).expect(403);
      await get('/student/history', teacherToken).expect(403);
      await request(app).post('/api/auth/refresh').set('Cookie', studentCookie).expect(403);
      await post('/auth/refresh')
        .set('Origin', 'https://evil.example')
        .set('Cookie', studentCookie)
        .expect(403);
      await get('/admin/users', adminToken).expect(200);
    },
  );
  await t.test(
    'class ownership, idempotent enrollment and student directory are enforced',
    async () => {
      const created = await post('/teacher/classes')
        .auth(teacherToken, { type: 'bearer' })
        .send({ name: 'Toán lớp 12', subject: 'Toán' })
        .expect(201);
      classId = created.body.id;
      classCode = created.body.code;
      await get(`/teacher/classes/${classId}/students`, otherTeacherToken).expect(404);
      await patch(`/teacher/classes/${classId}`, otherTeacherToken)
        .send({ name: 'Stolen' })
        .expect(404);
      await post(`/teacher/classes/${classId}/students`)
        .auth(otherTeacherToken, { type: 'bearer' })
        .send({ email: 'student@example.com' })
        .expect(404);
      await post('/student/classes/join')
        .auth(studentToken, { type: 'bearer' })
        .send({ code: classCode })
        .expect(200);
      await post(`/teacher/classes/${classId}/students`)
        .auth(teacherToken, { type: 'bearer' })
        .send({ email: 'student@example.com' })
        .expect(200);
      assert.equal(
        (await get(`/teacher/classes/${classId}/students`, teacherToken)).body.students.length,
        1,
      );
      assert.equal((await get('/teacher/students', teacherToken)).body.students[0].id, studentId);
      assert.equal((await get('/teacher/students', otherTeacherToken)).body.students.length, 0);
      assert.equal(
        (await get('/student/classes', studentToken)).body.classes[0].teacherName,
        'Teacher One',
      );
      await post(`/teacher/classes/${classId}/students`)
        .auth(teacherToken, { type: 'bearer' })
        .send({ email: admin.email })
        .expect(404);
    },
  );
  await t.test(
    'profile cannot change role/email; uploaded avatars are validated and re-encoded',
    async () => {
      await patch('/me', studentToken).send({ role: 'ADMIN' }).expect(400);
      await patch('/me', studentToken).send({ email: 'stolen@example.com' }).expect(400);
      const profile = await patch('/me', studentToken)
        .send({
          name: 'Student Updated',
          bio: 'Learning every day',
          phone: '0900000000',
          weeklyGoal: 5,
        })
        .expect(200);
      assert.equal(profile.body.name, 'Student Updated');
      assert.equal(profile.body.weeklyGoal, 5);
      assert.equal(profile.body.onboarded, false);
      await patch('/me', studentToken).send({ onboarded: true }).expect(400);
      const toured = await request(app)
        .post('/api/me/onboarding')
        .set('X-Requested-With', 'QuizSpace')
        .auth(studentToken, { type: 'bearer' })
        .expect(200);
      assert.equal(toured.body.onboarded, true);
      assert.equal((await get('/me', studentToken)).body.onboarded, true);
      const avatar = (image: string) =>
        request(app)
          .put('/api/me/avatar')
          .set('X-Requested-With', 'QuizSpace')
          .auth(studentToken, { type: 'bearer' })
          .send({ image });
      await avatar('data:image/svg+xml;base64,PHN2Zz4=').expect(400);
      await avatar('data:image/png;base64,bm90IGFuIGltYWdl').expect(400);
      const png = await sharp({
        create: { width: 8, height: 8, channels: 3, background: '#19aa88' },
      })
        .png()
        .toBuffer();
      const updated = await avatar(`data:image/png;base64,${png.toString('base64')}`).expect(200);
      assert.match(updated.body.avatar, /^data:image\/webp;base64,/);
      const removed = await request(app)
        .delete('/api/me/avatar')
        .set('X-Requested-With', 'QuizSpace')
        .auth(studentToken, { type: 'bearer' })
        .expect(200);
      assert.equal(removed.body.avatar, '');
    },
  );
  await t.test('class edits and member removal are owned by the teacher', async () => {
    await patch(`/teacher/classes/${classId}`, teacherToken)
      .send({ name: 'Toán nâng cao' })
      .expect(200);
    await request(app)
      .delete(`/api/teacher/classes/${classId}/students/${studentId}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(otherTeacherToken, { type: 'bearer' })
      .expect(404);
    await request(app)
      .delete(`/api/teacher/classes/${classId}/students/${studentId}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(teacherToken, { type: 'bearer' })
      .expect(200);
    assert.equal((await get('/student/classes', studentToken)).body.classes.length, 0);
    await post('/student/classes/join')
      .auth(studentToken, { type: 'bearer' })
      .send({ code: classCode })
      .expect(200);
    assert.equal(
      (await get('/student/classes', studentToken)).body.classes[0].name,
      'Toán nâng cao',
    );
  });
  await t.test(
    'student history/progress are scoped to authenticated user and use real scores',
    async () => {
      await c.attempts.insertMany([
        {
          _id: new ObjectId(),
          studentId: new ObjectId(studentId),
          title: 'Toán 1',
          subject: 'Toán',
          score: 8,
          durationSeconds: 120,
          submittedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          studentId: new ObjectId(studentId),
          title: 'Toán 2',
          subject: 'Toán',
          score: 10,
          durationSeconds: 180,
          submittedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          studentId: new ObjectId(),
          title: 'Private exam',
          subject: 'Private',
          score: 1,
          durationSeconds: 600,
          submittedAt: new Date(),
        },
      ]);
      const history = await get('/student/history', studentToken).expect(200);
      assert.equal(history.body.total, 2);
      assert.ok(
        history.body.items.every((item: { title: string }) => item.title !== 'Private exam'),
      );
      const progress = await get('/student/progress', studentToken).expect(200);
      assert.equal(progress.body.average, 9);
      assert.equal(progress.body.minutes, 5);
      assert.equal(progress.body.best, 10);
      assert.equal(progress.body.weeklyGoal, 5);
    },
  );
  await t.test(
    'refresh rotates tokens, detects replay and invalidates the session immediately',
    async () => {
      const refreshed = await post('/auth/refresh').set('Cookie', studentCookie).expect(200);
      const newCookie = cookie(refreshed);
      assert.notEqual(newCookie, studentCookie);
      await get('/me', refreshed.body.accessToken).expect(200);
      await post('/auth/refresh').set('Cookie', studentCookie).expect(401);
      await post('/auth/refresh').set('Cookie', newCookie).expect(401);
      await get('/me', refreshed.body.accessToken).expect(401);
      const login = await post('/auth/login')
        .send({ email: 'student@example.com', password })
        .expect(200);
      studentToken = login.body.accessToken;
      studentCookie = cookie(login);
    },
  );
  await t.test(
    'admin lock/unlock and role updates revoke access; admin cannot lock self',
    async () => {
      await patch(`/admin/users/${admin._id}`, adminToken).send({ status: 'LOCKED' }).expect(400);
      await patch(`/admin/users/${studentId}`, adminToken).send({ status: 'LOCKED' }).expect(200);
      await get('/me', studentToken).expect(401);
      await post('/auth/login').send({ email: 'student@example.com', password }).expect(403);
      await post('/auth/refresh').set('Cookie', studentCookie).expect(401);
      await patch(`/admin/users/${studentId}`, adminToken).send({ status: 'ACTIVE' }).expect(200);
      const login = await post('/auth/login')
        .send({ email: 'student@example.com', password })
        .expect(200);
      studentToken = login.body.accessToken;
      studentCookie = cookie(login);
      const list = await get('/admin/users?role=STUDENT&q=Student', adminToken).expect(200);
      assert.equal(list.body.total, 1);
      assert.equal(list.body.users[0].passwordHash, undefined);
      await patch(`/admin/users/${teacherId}`, adminToken).send({ role: 'STUDENT' }).expect(200);
      await get('/teacher/classes', teacherToken).expect(401);
    },
  );
  await t.test(
    'reset links are private, single-use, expiring, and revoke all previous sessions',
    async () => {
      const known = await post('/auth/forgot-password')
        .send({ email: 'student@example.com' })
        .expect(200);
      const unknown = await post('/auth/forgot-password')
        .send({ email: 'unknown@example.com' })
        .expect(200);
      assert.deepEqual(known.body, unknown.body);
      assert.equal(known.body.token, undefined);
      const resets = emails.filter((item) => item.kind === 'reset');
      assert.equal(resets.length, 1);
      const token = new URL(resets[0].link).searchParams.get('token');
      assert.ok(token);
      const stored = await c.users.findOne({ email: 'student@example.com' });
      assert.notEqual(stored?.resetHash, token);
      await post('/auth/reset-password')
        .send({ token: 'invalid-token-123456789', password: 'UpdatedPass123!' })
        .expect(400);
      await post('/auth/reset-password').send({ token, password: 'UpdatedPass123!' }).expect(200);
      await post('/auth/reset-password').send({ token, password: 'UpdatedAgain123!' }).expect(400);
      await get('/me', studentToken).expect(401);
      await post('/auth/login').send({ email: 'student@example.com', password }).expect(401);
      const login = await post('/auth/login')
        .send({ email: 'student@example.com', password: 'UpdatedPass123!' })
        .expect(200);
      studentToken = login.body.accessToken;
      studentCookie = cookie(login);
      await post('/auth/forgot-password').send({ email: 'student@example.com' }).expect(200);
      await c.users.updateOne(
        { email: 'student@example.com' },
        { $set: { resetExpiresAt: new Date(0) } },
      );
      await post('/auth/reset-password')
        .send({
          token: new URL(
            emails.filter((item) => item.kind === 'reset').at(-1)!.link,
          ).searchParams.get('token'),
          password: 'ExpiredPass123!',
        })
        .expect(400);
    },
  );
  await t.test(
    'logout invalidates both access and refresh tokens; Google is conditional',
    async () => {
      await post('/auth/logout').set('Cookie', studentCookie).expect(200);
      await get('/me', studentToken).expect(401);
      await post('/auth/refresh').set('Cookie', studentCookie).expect(401);
      await post('/auth/google').send({ credential: 'invalid' }).expect(503);
      assert.equal((await request(app).get('/api/auth/config')).body.googleClientId, '');
      await request(app).get('/health').expect(200);
    },
  );
  await t.test(
    'changing a password requires the old password and revokes existing sessions',
    async () => {
      const login = await post('/auth/login')
        .send({ email: 'student@example.com', password: 'UpdatedPass123!' })
        .expect(200);
      const change = (currentPassword: string) =>
        request(app)
          .put('/api/me/password')
          .set('X-Requested-With', 'QuizSpace')
          .auth(login.body.accessToken, { type: 'bearer' })
          .send({ currentPassword, password: 'ChangedPass123!' });
      await change('wrong').expect(400);
      await change('UpdatedPass123!').expect(200);
      await get('/me', login.body.accessToken).expect(401);
      await post('/auth/refresh').set('Cookie', cookie(login)).expect(401);
      await post('/auth/login')
        .send({ email: 'student@example.com', password: 'UpdatedPass123!' })
        .expect(401);
      await post('/auth/login')
        .send({ email: 'student@example.com', password: 'ChangedPass123!' })
        .expect(200);
    },
  );
});
