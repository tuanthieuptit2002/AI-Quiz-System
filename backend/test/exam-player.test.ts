import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { collections } from '../src/database/collections.js';
import { ensureIndexes } from '../src/database/indexes.js';
import { sampleQuestions } from '../src/common/question-transfer.js';
import { finishRun } from '../src/common/exam-runtime.js';
import type { Exam } from '../src/models/exam.model.js';

test('Exam Player API: flags, retries, sequential rules and final submit revision', async (t) => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const client = await new MongoClient(memory.getUri()).connect();
  t.after(async () => {
    await client.close();
    await memory.stop();
  });
  const db = client.db('exam_player_tests');
  await ensureIndexes(db);
  const c = collections(db),
    app = createApp(
      db,
      {
        jwtSecret: 'exam-player-test-secret-that-is-long-enough',
        frontendUrl: 'http://localhost:3000',
        production: false,
        googleClientId: '',
        smtpHost: '',
        smtpPort: 587,
        smtpUser: '',
        smtpPass: '',
        smtpFrom: '',
        mailDirectory: '',
      },
      { rateLimits: false, requireEmailVerification: false },
    );
  const post = (url: string, token = '') =>
    request(app)
      .post(`/api${url}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' });
  const get = (url: string, token: string) =>
    request(app).get(`/api${url}`).auth(token, { type: 'bearer' });
  const patch = (id: string, body: object, token: string) =>
    request(app)
      .patch(`/api/exams/runs/${id}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' })
      .send(body);
  const account = async (name: string, role = 'STUDENT') =>
    (
      await post('/auth/register')
        .send({ name, email: `${name}@example.com`, password: 'Password123!', role })
        .expect(201)
    ).body;
  const student = await account('student'),
    other = await account('other'),
    teacher = await account('teacher', 'TEACHER');
  const token = student.accessToken;
  const start = async (allowBack = true, autoSubmit = true) => {
    const now = new Date();
    const exam: Exam = {
      _id: new ObjectId(),
      ownerId: new ObjectId(teacher.user.id),
      title: 'Exam Player test',
      description: '',
      subject: 'Java',
      mode: 'MANUAL',
      topic: '',
      blueprint: { EASY: 8, MEDIUM: 0, HARD: 0, VERY_HARD: 0 },
      questions: sampleQuestions().map((content) => ({
        questionId: new ObjectId(),
        version: 1,
        points: 1,
        content,
      })),
      settings: {
        startsAt: null,
        endsAt: null,
        durationMinutes: 60,
        maxAttempts: 5,
        passScore: 70,
        randomQuestions: false,
        randomAnswers: false,
        showAnswers: false,
        allowBack,
        autoSubmit,
        access: 'ALL',
        classIds: [],
        studentIds: [],
      },
      passwordHash: '',
      status: 'PUBLISHED',
      version: 1,
      admissionRevision: 0,
      createdAt: now,
      updatedAt: now,
    };
    await c.exams.insertOne(exam);
    return (await post(`/exams/student/${exam._id}/start`, token).send({}).expect(201)).body;
  };
  await t.test(
    'flags persist independently from answers and legacy runs default to false',
    async () => {
      let run = await start();
      assert.deepEqual(run.flagged, Array(8).fill(false));
      const before = run.revision;
      run = (
        await patch(
          run.id,
          { revision: before, index: 0, response: [], flagged: true, mutationId: randomUUID() },
          token,
        ).expect(200)
      ).body;
      assert.equal(run.flagged[0], true);
      assert.equal(run.answered[0], false);
      assert.equal(run.revision, before + 1);
      const refreshed = (await get(`/exams/runs/${run.id}?lean=1`, token).expect(200)).body;
      assert.equal(refreshed.flagged[0], true);
      assert.equal(refreshed.questions, undefined);
      await c.examRuns.updateOne({ _id: new ObjectId(run.id) }, { $unset: { flagged: '' } });
      assert.deepEqual(
        (await get(`/exams/runs/${run.id}`, token)).body.flagged,
        Array(8).fill(false),
      );
      await patch(
        run.id,
        { revision: run.revision, index: 0, response: [], flagged: 'yes' },
        token,
      ).expect(400);
      await patch(
        run.id,
        { revision: run.revision, index: 0, response: [], flagged: true },
        other.accessToken,
      ).expect(404);
      await get(`/exams/runs/${run.id}`, teacher.accessToken).expect(403);
    },
  );
  await t.test(
    'sequential Next is idempotent after lost response and cannot edit earlier questions',
    async () => {
      const first = await start(false),
        mutationId = randomUUID();
      const body = {
        revision: first.revision,
        index: 0,
        nextIndex: 1,
        response: [first.questions[0].options[0].id],
        flagged: true,
        mutationId,
      };
      const saved = (await patch(first.id, body, token).expect(200)).body;
      const replay = (await patch(first.id, body, token).expect(200)).body;
      assert.equal(replay.revision, saved.revision);
      assert.equal(replay.currentIndex, 1);
      assert.equal(replay.flagged[0], true);
      assert.equal(replay.questions[0].locked, true);
      assert.deepEqual(replay.responses[0], []);
      await patch(
        first.id,
        { ...body, mutationId: randomUUID(), revision: replay.revision },
        token,
      ).expect(403);
      const stored = await c.examRuns.findOne({ _id: new ObjectId(first.id) });
      assert.deepEqual(stored?.responses[0], body.response);
    },
  );
  await t.test(
    'different stale writes conflict and submission requires the current revision',
    async () => {
      const first = await start();
      const saved = (
        await patch(
          first.id,
          {
            revision: first.revision,
            index: 0,
            response: [],
            flagged: true,
            mutationId: randomUUID(),
          },
          token,
        ).expect(200)
      ).body;
      await patch(
        first.id,
        {
          revision: first.revision,
          index: 0,
          response: [],
          flagged: false,
          mutationId: randomUUID(),
        },
        token,
      ).expect(409);
      await post(`/exams/runs/${first.id}/submit`, token)
        .send({ revision: first.revision })
        .expect(409);
      assert.equal((await c.examRuns.findOne({ _id: new ObjectId(first.id) }))?.status, 'RUNNING');
      const result = (
        await post(`/exams/runs/${first.id}/submit`, token)
          .send({ revision: saved.revision })
          .expect(200)
      ).body;
      assert.equal(result.status, 'SUBMITTED');
      assert.equal(result.flagged[0], true);
      assert.equal(result.questions[0].correct, undefined);
      await post(`/exams/runs/${first.id}/submit`, token)
        .send({ revision: saved.revision })
        .expect(200);
      assert.equal(await c.attempts.countDocuments({ _id: new ObjectId(first.id) }), 1);
    },
  );
  await t.test(
    'flag changes and client timestamps cannot extend the exam or mutate expired answers',
    async () => {
      for (const auto of [true, false]) {
        const first = await start(true, auto);
        await c.examRuns.updateOne(
          { _id: new ObjectId(first.id) },
          { $set: { expiresAt: new Date(Date.now() - 1) } },
        );
        const result = (
          await patch(
            first.id,
            {
              revision: first.revision,
              index: 0,
              response: [first.questions[0].options[0].id],
              flagged: true,
            },
            token,
          ).expect(200)
        ).body;
        assert.equal(result.status, auto ? 'SUBMITTED' : 'EXPIRED');
        assert.deepEqual(result.responses[0], []);
        assert.equal(result.flagged[0], false);
        await finishRun(db, new ObjectId(first.id));
        assert.equal(
          await c.attempts.countDocuments({ _id: new ObjectId(first.id) }),
          auto ? 1 : 0,
        );
      }
    },
  );
  await t.test(
    'partial blanks, matching and ordering are not counted as complete answers',
    async () => {
      let run = await start();
      for (const type of ['FILL_BLANK', 'MATCHING', 'ORDERING']) {
        const index = run.questions.findIndex((q: { type: string }) => q.type === type),
          q = run.questions[index];
        const response = type === 'FILL_BLANK' ? [''] : [q.options[0].id];
        run = (await patch(run.id, { revision: run.revision, index, response }, token).expect(200))
          .body;
        assert.equal(run.answered[index], false);
      }
    },
  );
});
