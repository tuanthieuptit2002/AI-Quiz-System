import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { collections } from '../src/database/collections.js';
import { ensureIndexes } from '../src/database/indexes.js';
import { sampleQuestions } from '../src/common/question-transfer.js';
import {
  finishRun,
  expireRuns,
  deliverQuestions,
  gradeQuestion,
} from '../src/common/exam-runtime.js';
import type { Config } from '../src/common/config.js';
import type { Exam, ExamSettings } from '../src/models/exam.model.js';
import type { Question } from '../src/models/question.model.js';

test('Exam builder and delivery enforce access, timing, randomization and grading', async (t) => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const client = new MongoClient(memory.getUri());
  await client.connect();
  t.after(async () => {
    await client.close();
    await memory.stop();
  });
  const db = client.db('exams_test');
  await ensureIndexes(db);
  const c = collections(db);
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
  const app = createApp(db, config, { rateLimits: false });
  const post = (path: string, token = '') =>
    request(app)
      .post(`/api${path}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' });
  const get = (path: string, token: string) =>
    request(app).get(`/api${path}`).auth(token, { type: 'bearer' });
  const patch = (id: string, token: string, body: unknown) =>
    request(app)
      .patch(`/api/exams/runs/${id}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' })
      .send(body);
  const put = (id: string, token: string, body: unknown) =>
    request(app)
      .put(`/api/exams/${id}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' })
      .send(body);
  async function register(name: string, role: string) {
    return (
      await post('/auth/register')
        .send({ name, email: `${name}@example.com`, password: 'Password123!', role })
        .expect(201)
    ).body;
  }
  const teacher = await register('teacher', 'TEACHER');
  const other = await register('other', 'TEACHER');
  const student = await register('student', 'STUDENT');
  const outsider = await register('outsider', 'STUDENT');
  const admin = await register('admin', 'TEACHER');
  await c.users.updateOne({ _id: new ObjectId(admin.user.id) }, { $set: { role: 'ADMIN' } });
  const token = teacher.accessToken;
  const st = student.accessToken;
  const cl = (
    await post('/teacher/classes', token)
      .send({ name: 'Java A', subject: 'Java', description: '', color: 'mint' })
      .expect(201)
  ).body;
  await post(`/teacher/classes/${cl.id}/students`, token)
    .send({ email: 'student@example.com' })
    .expect(200);
  const samples = sampleQuestions();
  const bank: Question[] = [];
  for (const [difficulty, count] of Object.entries({
    EASY: 20,
    MEDIUM: 15,
    HARD: 10,
    VERY_HARD: 5,
  }))
    for (let i = 0; i < count; i++)
      bank.push({
        ...samples[i % 8],
        difficulty: difficulty as Question['difficulty'],
        status: 'READY',
        _id: new ObjectId(),
        ownerId: new ObjectId(teacher.user.id),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
  await c.questions.insertMany(bank);
  const foreign = { ...bank[0], _id: new ObjectId(), ownerId: new ObjectId(other.user.id) };
  await c.questions.insertOne(foreign);
  const settings = {
    startsAt: null,
    endsAt: null,
    durationMinutes: 60,
    maxAttempts: 1,
    passScore: 70,
    randomQuestions: false,
    randomAnswers: false,
    showAnswers: false,
    allowBack: true,
    autoSubmit: true,
    access: 'RESTRICTED',
    classIds: [cl.id],
    studentIds: [],
  };
  const draft = (selected = bank.slice(0, 2), overrides = {}) => ({
    title: 'Java Backend Test',
    description: 'Read carefully',
    subject: 'Java',
    mode: 'MANUAL',
    blueprint: { EASY: 0, MEDIUM: 0, HARD: 0, VERY_HARD: 0 },
    topic: '',
    selections: selected.map((q) => ({ questionId: q._id.toHexString(), version: 1, points: 1 })),
    settings,
    passwordAction: 'KEEP',
    password: '',
    ...overrides,
  });
  async function publish(input = draft()) {
    const made = await post('/exams', token).send(input).expect(201);
    return (
      await post(`/exams/${made.body.id}/publish`, token)
        .send({ version: made.body.version })
        .expect(200)
    ).body;
  }
  let examId = '';
  await t.test(
    'Very Hard questions validate and auto generation satisfies 20/15/10/5 without duplicates',
    async () => {
      const vh = await post('/questions', token)
        .send({ ...samples[0], difficulty: 'VERY_HARD' })
        .expect(201);
      assert.equal(vh.body.difficulty, 'VERY_HARD');
      const generated = await post('/exams/generate', token)
        .send({ subject: 'Java', counts: { EASY: 20, MEDIUM: 15, HARD: 10, VERY_HARD: 5 } })
        .expect(200);
      assert.equal(generated.body.questions.length, 50);
      assert.equal(new Set(generated.body.questions.map((q: { id: string }) => q.id)).size, 50);
      for (const [difficulty, count] of Object.entries({
        EASY: 20,
        MEDIUM: 15,
        HARD: 10,
        VERY_HARD: 5,
      }))
        assert.equal(
          generated.body.questions.filter((q: Question) => q.difficulty === difficulty).length,
          count,
        );
      assert.ok(
        generated.body.questions.every((q: { ownerId: string }) => q.ownerId === teacher.user.id),
      );
      await post('/exams/generate', token)
        .send({ subject: 'Java', counts: { EASY: 21, MEDIUM: 15, HARD: 10, VERY_HARD: 5 } })
        .expect(400);
      await post('/exams/generate', other.accessToken)
        .send({ subject: 'Java', counts: { EASY: 2, MEDIUM: 0, HARD: 0, VERY_HARD: 0 } })
        .expect(400);
      const auto = await post('/exams', token)
        .send(
          draft(bank, {
            mode: 'AUTO',
            blueprint: { EASY: 20, MEDIUM: 15, HARD: 10, VERY_HARD: 5 },
          }),
        )
        .expect(201);
      assert.equal(auto.body.questionCount, 50);
    },
  );
  await t.test(
    'manual selection validates ownership, ready status, duplicates, quotas and audience',
    async () => {
      await post('/exams', token)
        .send(draft([foreign]))
        .expect(409);
      await post('/exams', token)
        .send(draft([bank[0], bank[0]]))
        .expect(400);
      await post('/exams', token)
        .send(
          draft([], {
            settings: {
              ...settings,
              startsAt: '2026-03-02T00:00:00Z',
              endsAt: '2026-03-01T00:00:00Z',
            },
          }),
        )
        .expect(400);
      await post('/exams', token)
        .send(draft([], { settings: { ...settings, classIds: [new ObjectId().toHexString()] } }))
        .expect(400);
      await post('/exams', token)
        .send(
          draft([], { settings: { ...settings, classIds: [], studentIds: [outsider.user.id] } }),
        )
        .expect(400);
      await post('/exams', token)
        .send(draft(bank.slice(0, 1), { mode: 'AUTO' }))
        .expect(400);
      await post('/exams', st).send(draft()).expect(403);
      const result = await post('/exams', token).send(draft()).expect(201);
      examId = result.body.id;
      await get(`/exams/${examId}`, other.accessToken).expect(404);
      await get(`/exams/${examId}`, st).expect(403);
      await get(`/exams/${examId}`, admin.accessToken).expect(200);
    },
  );
  await t.test(
    'draft concurrency, immutable snapshots and published settings cannot be overwritten',
    async () => {
      const updates = await Promise.all(
        ['First title', 'Second title'].map((title) =>
          put(examId, token, { version: 1, content: draft(undefined, { title }) }),
        ),
      );
      assert.deepEqual(updates.map((r) => r.status).sort(), [200, 409]);
      await c.questions.updateOne(
        { _id: bank[0]._id },
        { $set: { question: 'Changed in bank' }, $inc: { version: 1 } },
      );
      const existing = await get(`/exams/${examId}`, token).expect(200);
      assert.equal(existing.body.questions[0].content.question, bank[0].question);
      await post(`/exams/${examId}/publish`, token).send({ version: 2 }).expect(200);
      await put(examId, token, { version: 3, content: draft() }).expect(409);
      await c.questions.updateOne(
        { _id: bank[0]._id },
        { $set: { question: bank[0].question, version: 1 } },
      );
    },
  );
  await t.test(
    'student lists hide answer keys/password hashes and dynamic class admission is enforced',
    async () => {
      const permitted = await get('/exams/student', st).expect(200);
      assert.ok(permitted.body.exams.some((e: { id: string }) => e.id === examId));
      assert.ok(!JSON.stringify(permitted.body).includes('passwordHash'));
      assert.ok(!JSON.stringify(permitted.body).includes('answers'));
      assert.ok(!JSON.stringify(permitted.body).includes('rubric'));
      assert.equal((await get('/exams/student', outsider.accessToken)).body.exams.length, 0);
      await post(`/exams/student/${examId}/start`, outsider.accessToken).send({}).expect(404);
      await post(`/exams/student/${examId}/start`, token).send({}).expect(403);
    },
  );
  let runId = '';
  await t.test(
    'concurrent start requests resume a single run and never exceed attempt limits',
    async () => {
      const starts = await Promise.all(
        [1, 2, 3].map(() => post(`/exams/student/${examId}/start`, st).send({})),
      );
      assert.ok(starts.every((r) => [200, 201].includes(r.status)));
      assert.equal(new Set(starts.map((r) => r.body.id)).size, 1);
      runId = starts[0].body.id;
      assert.equal(await c.examRuns.countDocuments({ examId: new ObjectId(examId) }), 1);
      const dto = starts[0].body;
      assert.equal(dto.questions[0].correct, undefined);
      assert.equal(dto.questions[0].rubric, undefined);
      assert.equal(dto.questions[0].explanation, undefined);
      await get(`/exams/runs/${runId}`, outsider.accessToken).expect(404);
      assert.ok(dto.questions[0].options.every((o: { id: string }) => !['a', 'b'].includes(o.id)));
    },
  );
  await t.test(
    'response saves are versioned, scored by server, submit is idempotent and history is linked',
    async () => {
      let run = (await get(`/exams/runs/${runId}`, st)).body;
      const stored = await c.examRuns.findOne({ _id: new ObjectId(runId) });
      assert.ok(stored);
      run = (
        await patch(`${runId}?lean=1`, st, {
          revision: run.revision,
          index: 0,
          response: stored.questions[0].correct,
          nextIndex: 1,
        }).expect(200)
      ).body;
      assert.equal(run.questions, undefined);
      assert.equal(run.answered[0], true);
      await patch(runId, st, { revision: 0, index: 1, response: [] }).expect(409);
      await patch(runId, st, { revision: run.revision, index: 1, response: ['fake'] }).expect(400);
      run = (
        await patch(runId, st, {
          revision: run.revision,
          index: 1,
          response: stored.questions[1].correct,
        }).expect(200)
      ).body;
      const submissions = await Promise.all(
        [1, 2].map(() => post(`/exams/runs/${runId}/submit`, st).send({ scorePercent: 0 })),
      );
      assert.ok(
        submissions.every(
          (r) => r.status === 200 && r.body.scorePercent === 100 && r.body.passed === true,
        ),
      );
      assert.equal(submissions[0].body.questions[0].correct, undefined);
      assert.deepEqual(submissions[0].body.awarded, []);
      assert.deepEqual(submissions[0].body.feedback, []);
      assert.equal(await c.attempts.countDocuments({ _id: new ObjectId(runId) }), 1);
      assert.equal((await get('/student/progress', st)).body.average, 10);
      await post(`/exams/student/${examId}/start`, st).send({}).expect(403);
    },
  );
  await t.test(
    'password hashes stay private and scheduling bounds starting and duration',
    async () => {
      const future = await publish(
        draft(undefined, {
          settings: { ...settings, startsAt: new Date(Date.now() + 3600000).toISOString() },
        }),
      );
      await post(`/exams/student/${future.id}/start`, st).send({}).expect(403);
      const gated = await publish(
        draft(undefined, {
          settings: { ...settings, endsAt: new Date(Date.now() + 120000).toISOString() },
          passwordAction: 'SET',
          password: 'exam-code',
        }),
      );
      assert.equal(gated.passwordHash, undefined);
      assert.equal(gated.password, undefined);
      assert.equal(gated.hasPassword, true);
      await post(`/exams/student/${gated.id}/start`, st).send({ password: 'wrong' }).expect(403);
      const run = await post(`/exams/student/${gated.id}/start`, st)
        .send({ password: 'exam-code' })
        .expect(201);
      assert.equal(run.body.expiresAt, gated.settings.endsAt);
      const data = await c.exams.findOne({ _id: new ObjectId(gated.id) });
      assert.ok(data?.passwordHash.startsWith('$2b$'));
      await c.exams.updateOne(
        { _id: new ObjectId(future.id) },
        { $set: { 'settings.startsAt': null, 'settings.endsAt': new Date(0) } },
      );
      await post(`/exams/student/${future.id}/start`, st).send({}).expect(403);
    },
  );
  await t.test(
    'sequential mode hides other questions and rejects backwards or skipped navigation',
    async () => {
      const e = await publish(
        draft(bank.slice(0, 3), { settings: { ...settings, allowBack: false } }),
      );
      let run = (await post(`/exams/student/${e.id}/start`, st).send({}).expect(201)).body;
      assert.equal(run.questions[1].locked, true);
      assert.equal(run.questions[1].question, undefined);
      await patch(run.id, st, { revision: 0, index: 0, response: [], nextIndex: 2 }).expect(403);
      run = (
        await patch(run.id, st, { revision: 0, index: 0, response: [], nextIndex: 1 }).expect(200)
      ).body;
      assert.equal(run.questions[0].locked, true);
      assert.equal(run.questions[1].locked, undefined);
      await patch(run.id, st, { revision: 1, index: 0, response: [] }).expect(403);
      await patch(run.id, st, { revision: 1, index: 1, response: [], nextIndex: 0 }).expect(403);
    },
  );
  await t.test(
    'server expiry submits saved work offline, rejects late changes and optionally expires without a score',
    async () => {
      for (const autoSubmit of [true, false]) {
        const e = await publish(draft([bank[0]], { settings: { ...settings, autoSubmit } }));
        const run = (await post(`/exams/student/${e.id}/start`, st).send({}).expect(201)).body;
        const stored = await c.examRuns.findOne({ _id: new ObjectId(run.id) });
        assert.ok(stored);
        await patch(run.id, st, {
          revision: 0,
          index: 0,
          response: stored.questions[0].correct,
        }).expect(200);
        await c.examRuns.updateOne(
          { _id: stored._id },
          { $set: { expiresAt: new Date(Date.now() - 1000) } },
        );
        await expireRuns(db);
        const result = (
          await patch(run.id, st, { revision: 1, index: 0, response: [] }).expect(200)
        ).body;
        assert.equal(result.status, autoSubmit ? 'SUBMITTED' : 'EXPIRED');
        assert.equal(result.scorePercent, autoSubmit ? 100 : null);
        assert.equal(await c.attempts.countDocuments({ _id: stored._id }), autoSubmit ? 1 : 0);
        const again = await post(`/exams/runs/${run.id}/submit`, st).expect(200);
        assert.equal(again.body.status, result.status);
      }
    },
  );
  await t.test(
    'show-answers is respected only after submission; essay grades finalize weighted results',
    async () => {
      const selected = [bank[0], bank[5]];
      const e = await publish(
        draft(selected, {
          selections: selected.map((q, i) => ({
            questionId: q._id.toHexString(),
            version: 1,
            points: i === 0 ? 2 : 8,
          })),
          settings: { ...settings, showAnswers: true },
        }),
      );
      let run = (await post(`/exams/student/${e.id}/start`, st).send({}).expect(201)).body;
      assert.equal(run.questions[0].correct, undefined);
      const stored = await c.examRuns.findOne({ _id: new ObjectId(run.id) });
      assert.ok(stored);
      run = (
        await patch(run.id, st, {
          revision: 0,
          index: 0,
          response: stored.questions[0].correct,
          nextIndex: 1,
        })
      ).body;
      run = (
        await patch(run.id, st, {
          revision: run.revision,
          index: 1,
          response: ['Bài tự luận đầy đủ'],
        })
      ).body;
      run = (await post(`/exams/runs/${run.id}/submit`, st).expect(200)).body;
      assert.equal(run.status, 'PENDING_REVIEW');
      assert.equal(run.scorePercent, null);
      assert.deepEqual(run.questions[0].correct, stored.questions[0].correct);
      assert.equal(await c.attempts.countDocuments({ _id: stored._id }), 0);
      await post(`/exams/${e.id}/submissions/${run.id}/grade`, other.accessToken)
        .send({ revision: run.revision, grades: [{ index: 1, points: 5 }] })
        .expect(404);
      await post(`/exams/${e.id}/submissions/${run.id}/grade`, st)
        .send({ revision: run.revision, grades: [{ index: 1, points: 5 }] })
        .expect(403);
      await post(`/exams/${e.id}/submissions/${run.id}/grade`, token)
        .send({ revision: run.revision, grades: [{ index: 1, points: 9 }] })
        .expect(400);
      const graded = await post(`/exams/${e.id}/submissions/${run.id}/grade`, token)
        .send({
          revision: run.revision,
          grades: [{ index: 1, points: 5, feedback: 'Cần thêm ví dụ.' }],
        })
        .expect(200);
      assert.equal(graded.body.scorePercent, 70);
      assert.equal(graded.body.passed, true);
      assert.equal(graded.body.status, 'SUBMITTED');
      assert.equal((await c.attempts.findOne({ _id: stored._id }))?.score, 7);
    },
  );
  await t.test(
    'all eight types grade correctly and randomization preserves opaque answer references',
    async () => {
      const e: Exam = {
        _id: new ObjectId(),
        ownerId: new ObjectId(),
        title: 'Types',
        subject: 'Java',
        description: '',
        mode: 'MANUAL',
        blueprint: { EASY: 0, MEDIUM: 0, HARD: 0, VERY_HARD: 0 },
        topic: '',
        questions: samples.map((content) => ({
          questionId: new ObjectId(),
          version: 1,
          points: 1,
          content,
        })),
        settings: {
          ...settings,
          classIds: [],
          studentIds: [],
          randomAnswers: true,
          randomQuestions: true,
        } as ExamSettings,
        passwordHash: '',
        status: 'PUBLISHED',
        version: 1,
        admissionRevision: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      for (let i = 0; i < 5; i++) {
        const delivery = deliverQuestions(e);
        assert.equal(new Set(delivery.map((q) => q.id)).size, 8);
        for (const q of delivery) {
          assert.equal(
            gradeQuestion(
              q,
              q.type === 'SHORT_ANSWER'
                ? [q.correct[0].toUpperCase()]
                : q.type === 'ESSAY'
                  ? ['Essay']
                  : q.correct,
            ),
            q.type === 'ESSAY' ? null : 1,
          );
          if (q.type === 'MATCHING')
            assert.ok(q.left.every((l) => !q.options.some((r) => r.id === l.id)));
        }
      }
    },
  );
  await t.test(
    'direct student access, archive and copy do not bypass class ownership or attempts',
    async () => {
      const e = await publish(
        draft([bank[0]], {
          settings: { ...settings, classIds: [], studentIds: [student.user.id] },
        }),
      );
      const run = (await post(`/exams/student/${e.id}/start`, st).send({}).expect(201)).body;
      await post(`/exams/${e.id}/archive`, token).send({ version: e.version }).expect(200);
      await get(`/exams/runs/${run.id}`, st).expect(200);
      await finishRun(db, new ObjectId(run.id), true);
      await post(`/exams/student/${e.id}/start`, st).send({}).expect(404);
      const copy = await post(`/exams/${e.id}/duplicate`, token).expect(201);
      assert.equal(copy.body.status, 'DRAFT');
      assert.equal(copy.body.hasPassword, false);
      await post(`/exams/${copy.body.id}/publish`, token).send({ version: 1 }).expect(400);
    },
  );
});
