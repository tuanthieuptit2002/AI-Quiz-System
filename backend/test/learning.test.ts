import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { collections } from '../src/database/collections.js';
import { ensureIndexes } from '../src/database/indexes.js';
import { learningSnapshot, summarizeLearning } from '../src/common/learning-analysis.js';
import {
  createLearningAnalyst,
  learningInput,
  validateLearningAdvice,
  type LearningInput,
} from '../src/common/learning-provider.js';
import { expireLearningLeases, processNextLearningReport } from '../src/common/learning-runtime.js';
import { deliverQuestions, runDto } from '../src/common/exam-runtime.js';
import { sampleQuestions } from '../src/common/question-transfer.js';
import type { Config } from '../src/common/config.js';
import type { DeliveredQuestion, Exam, ExamRun } from '../src/models/exam.model.js';

const config: Config = {
  jwtSecret: 'local-learning-test-secret-at-least-32-characters',
  frontendUrl: 'http://localhost:3000',
  production: false,
  googleClientId: '',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  mailDirectory: '',
  deepseekApiKey: 'fake-key',
  deepseekModel: 'deepseek-flash',
};
const answer = (input: LearningInput) => ({
  summary: 'Ưu tiên ôn các chủ đề có kết quả còn thấp.',
  strengths: [],
  recommendations: [
    {
      topicId: input.topics[0].id,
      reason: 'Kết quả ở chủ đề này cho thấy cần củng cố kiến thức.',
      actions: ['Ôn lại các khái niệm cốt lõi.', 'Tự giải thích bằng một ví dụ.'],
      practice: 'Viết một ví dụ minh họa và tự kiểm tra.',
      minutes: 30,
    },
  ],
  limitations: 'Điểm các bài thi chưa phản ánh đầy đủ năng lực.',
});
const question = (patch: Partial<DeliveredQuestion> = {}): DeliveredQuestion => ({
  id: randomUUID(),
  type: 'SINGLE_CHOICE',
  question: 'PRIVATE QUESTION',
  image: '',
  imageAlt: '',
  points: 1,
  options: [{ id: 'secret-option', text: 'PRIVATE ANSWER' }],
  left: [],
  blankCount: 0,
  correct: ['secret-option'],
  explanation: 'PRIVATE REFERENCE',
  rubric: '',
  classification: { subject: 'Java', topicPath: ['Redis', 'Cache Strategy'], difficulty: 'MEDIUM' },
  ...patch,
});
const run = (studentId: ObjectId, patch: Partial<ExamRun> = {}): ExamRun => ({
  _id: new ObjectId(),
  examId: new ObjectId(),
  ownerId: new ObjectId(),
  studentId,
  studentName: 'PRIVATE STUDENT NAME',
  title: 'Java Assessment',
  subject: 'Java',
  attemptNo: 1,
  status: 'SUBMITTED',
  settings: { showAnswers: true, allowBack: true, autoSubmit: true, passScore: 70 },
  questions: [question(), question(), question()],
  responses: [['PRIVATE RESPONSE'], [], []],
  awarded: [0, 1, 0],
  feedback: ['PRIVATE FEEDBACK'],
  currentIndex: 0,
  revision: 1,
  startedAt: new Date(Date.now() - 3600000),
  expiresAt: new Date(Date.now() + 3600000),
  submittedAt: new Date(Date.now() - 1000),
  scorePercent: 33.33,
  passed: false,
  ...patch,
});

test('Learning analysis: evidence, authorization, cached AI and recovery', async (t) => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const client = await new MongoClient(memory.getUri()).connect();
  t.after(async () => {
    await client.close();
    await memory.stop();
  });
  const db = client.db('learning_tests'),
    c = collections(db);
  await ensureIndexes(db);
  const app = createApp(db, config, { rateLimits: false, requireEmailVerification: false });
  const post = (path: string, token = '') =>
    request(app)
      .post(`/api${path}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' });
  const get = (token: string, range = 'all') =>
    request(app)
      .get(`/api/student/learning-analysis?range=${range}`)
      .auth(token, { type: 'bearer' });
  let count = 0;
  async function account(role = 'STUDENT') {
    return (
      await post('/auth/register')
        .send({
          name: `Learning ${++count}`,
          email: `learning${count}@example.com`,
          password: 'Password123!',
          role,
        })
        .expect(201)
    ).body;
  }
  async function fixture() {
    const student = await account(),
      id = new ObjectId(student.user.id);
    const runs = [run(id), run(id, { submittedAt: new Date(Date.now() - 2000) })];
    await c.examRuns.insertMany(runs);
    const read = async () => (await get(student.accessToken).expect(200)).body;
    const send = async (extra: object = {}) =>
      post('/student/learning-analysis', student.accessToken).send({
        range: 'all',
        sourceKey: (await read()).snapshot.sourceKey,
        requestId: randomUUID(),
        ...extra,
      });
    return { student, id, runs, read, send };
  }
  await t.test(
    'snapshot classifications survive question shuffle and bank edits without leaking to exam player',
    () => {
      const contents = sampleQuestions();
      const exam = {
        questions: contents.map((content) => ({ content, points: 1 })),
        settings: { randomAnswers: true, randomQuestions: true },
      } as Exam;
      const delivered = deliverQuestions(exam);
      for (const q of delivered) {
        const original = contents.find((c) => c.question === q.question)!;
        assert.deepEqual(q.classification, {
          subject: original.subject,
          topicPath: original.topicPath,
          difficulty: original.difficulty,
        });
        assert.notEqual(q.classification!.topicPath, original.topicPath);
      }
      const result = runDto(
        run(new ObjectId(), {
          questions: delivered,
          responses: delivered.map(() => []),
          awarded: delivered.map(() => 0),
        }),
      );
      assert.equal(result.questions[0].classification, undefined);
    },
  );
  await t.test(
    'weighted points, partial credit, normalization and hierarchy; pending/invalid scores excluded',
    () => {
      const id = new ObjectId();
      const a = run(id, {
        questions: [question({ points: 3 }), question({ points: 1 })],
        awarded: [1.5, 1],
      });
      const b = run(id, {
        questions: [
          question({
            classification: {
              subject: ' java ',
              topicPath: ['redis', ' cache  strategy '],
              difficulty: 'HARD',
            },
          }),
          question({
            classification: {
              subject: 'Java',
              topicPath: ['Kafka', 'Cache Strategy'],
              difficulty: 'EASY',
            },
          }),
          question({ classification: undefined }),
          question(),
          question(),
        ],
        awarded: [0, 1, 0, null, 99],
      });
      const s = summarizeLearning([a, b], 'all', null, 0);
      assert.equal(s.score, 50); // 3.5 earned / 7 possible, NOT mean of percentages
      assert.equal(s.subjects.length, 1);
      assert.equal(s.subjects[0].questions, 5);
      assert.equal(s.topics.length, 2); // same leaf under different parents stays distinct
      assert.equal(s.topics.find((r) => r.topicPath[0] === 'Redis')!.questions, 3);
      assert.equal(s.topics[0].level, 'INSUFFICIENT');
      assert.equal(s.unclassifiedQuestions, 1);
      assert.equal(s.invalidQuestions, 2);
    },
  );
  await t.test(
    'latest finalized attempt per exam, window, hidden answers, pending runs and legacy data',
    async () => {
      const f = await fixture();
      await c.examRuns.updateOne({ _id: f.runs[0]._id }, { $set: { attemptNo: 2 } });
      await c.examRuns.insertMany([
        run(f.id, {
          examId: f.runs[0].examId,
          awarded: [1, 1, 1],
          submittedAt: new Date(Date.now() - 86400000),
        }),
        run(f.id, { status: 'PENDING_REVIEW', awarded: [null, null, null] }),
        run(f.id, { status: 'RUNNING', submittedAt: null }),
        run(f.id, { status: 'EXPIRED', submittedAt: null }),
        run(f.id, {
          settings: { ...f.runs[0].settings, showAnswers: false },
          title: 'HIDDEN TITLE',
        }),
        run(f.id, { submittedAt: new Date(Date.now() - 100 * 86400000) }),
        run(f.id, { questions: [question({ classification: undefined })], awarded: [1] }),
      ]);
      const s = (await get(f.student.accessToken, '30').expect(200)).body.snapshot;
      assert.equal(s.exams, 3);
      assert.equal(s.questions, 7);
      assert.equal(s.pendingRuns, 1);
      assert.equal(s.hiddenExams, 1);
      assert.equal(s.unclassifiedQuestions, 1);
      assert.equal(s.topics[0].questions, 6);
      assert.equal(s.topics[0].exams, 2);
      assert.equal(s.topics[0].level, 'WEAK');
      assert.ok(!JSON.stringify(s).includes('PRIVATE'));
      assert.ok(!JSON.stringify(s).includes('HIDDEN TITLE'));
      assert.equal((await f.read()).snapshot.exams, 4);
    },
  );
  await t.test('student-only, own data, empty and insufficient sample states', async () => {
    const f = await fixture(),
      other = await account(),
      teacher = await account('TEACHER');
    assert.equal((await get(other.accessToken).expect(200)).body.snapshot.exams, 0);
    await get(teacher.accessToken).expect(403);
    await get('').expect(401);
    await post('/student/learning-analysis', teacher.accessToken).send({}).expect(403);
    await get(f.student.accessToken, 'invalid').expect(400);
    await post('/student/learning-analysis', f.student.accessToken)
      .send({
        range: 'all',
        studentId: other.user.id,
        sourceKey: (await f.read()).snapshot.sourceKey,
        requestId: randomUUID(),
      })
      .expect(400);
    await c.examRuns.deleteOne({ _id: f.runs[0]._id });
    const view = await f.read();
    assert.equal(view.eligible, false);
    assert.equal(view.snapshot.topics[0].level, 'INSUFFICIENT');
    assert.equal((await f.send()).status, 400);
  });
  await t.test(
    'same snapshot caches once, concurrent requests converge, worker claims once; only aggregates sent',
    async () => {
      const f = await fixture(),
        before = await c.examRuns.find({ studentId: f.id }).toArray();
      const [a, b] = await Promise.all([f.send(), f.send()]);
      assert.ok([200, 202].includes(a.status));
      assert.ok([200, 202].includes(b.status));
      assert.equal(a.body.report.id, b.body.report.id);
      assert.equal(await c.learningReports.countDocuments({ studentId: f.id }), 1);
      const seen: LearningInput[] = [];
      const work = () =>
        processNextLearningReport(db, async (input) => {
          seen.push(input);
          return answer(input);
        });
      await Promise.all([work(), work()]);
      assert.equal(seen.length, 1);
      assert.ok(!JSON.stringify(seen).includes('PRIVATE'));
      assert.ok(!JSON.stringify(seen).includes(f.student.user.email));
      assert.ok(!JSON.stringify(seen).includes(f.id.toHexString()));
      const view = await f.read();
      assert.equal(view.report.status, 'READY');
      assert.equal(view.report.advice.recommendations[0].topicId, view.snapshot.topics[0].id);
      assert.equal(view.report.studentId, undefined);
      assert.equal(view.report.snapshot, undefined);
      assert.equal((await f.send()).status, 200);
      assert.equal((await f.read()).report.attempts, 1);
      assert.deepEqual(await c.examRuns.find({ studentId: f.id }).toArray(), before);
      assert.equal(await c.gradingEvents.countDocuments({}), 0);
    },
  );
  await t.test(
    'grade changes invalidate cached advice and stale client requests; live bank changes do not',
    async () => {
      const f = await fixture(),
        source = (await f.read()).snapshot.sourceKey;
      await f.send();
      await processNextLearningReport(db, async (input) => answer(input));
      await c.examRuns.updateOne({ _id: f.runs[0]._id }, { $set: { 'awarded.0': 1 } });
      const view = await f.read();
      assert.notEqual(view.snapshot.sourceKey, source);
      assert.equal(view.report, null);
      await post('/student/learning-analysis', f.student.accessToken)
        .send({ range: 'all', sourceKey: source, requestId: randomUUID() })
        .expect(409);
      assert.equal((await f.send()).status, 202);
      await processNextLearningReport(db, async (input) => answer(input));
      assert.equal((await f.read()).report.status, 'READY');
      await c.examRuns.updateOne(
        { _id: f.runs[0]._id },
        { $set: { flagged: [true], revision: 90 } },
      );
      assert.equal((await f.read()).snapshot.sourceKey, view.snapshot.sourceKey);
    },
  );
  await t.test('safe failure, idempotent retries and three-attempt cap', async () => {
    const f = await fixture();
    await f.send();
    const fail = () =>
      processNextLearningReport(db, async () => {
        throw new Error('SECRET PROVIDER CREDENTIAL');
      });
    await fail();
    assert.ok(!(await f.read()).report.error.includes('SECRET'));
    for (let attempt = 2; attempt <= 3; attempt++) {
      const id = randomUUID();
      assert.equal((await f.send({ retry: true, requestId: id })).status, 202);
      await fail();
      assert.equal((await f.send({ retry: true, requestId: id })).status, 200);
      assert.equal((await f.read()).report.attempts, attempt);
    }
    assert.equal((await f.send({ retry: true })).status, 429);
  });
  await t.test(
    'one active report across ranges; no API key blocks generation but cached report readable',
    async () => {
      const f = await fixture();
      await f.send();
      const ninety = (await get(f.student.accessToken, '90')).body;
      await post('/student/learning-analysis', f.student.accessToken)
        .send({ range: '90', sourceKey: ninety.snapshot.sourceKey, requestId: randomUUID() })
        .expect(409);
      await processNextLearningReport(db, async (input) => answer(input));
      const noKey = createApp(
        db,
        { ...config, deepseekApiKey: '' },
        { rateLimits: false, requireEmailVerification: false },
      );
      const cached = await request(noKey)
        .get('/api/student/learning-analysis?range=all')
        .auth(f.student.accessToken, { type: 'bearer' })
        .expect(200);
      assert.equal(cached.body.configured, false);
      assert.equal(cached.body.report.status, 'READY');
      await request(noKey)
        .post('/api/student/learning-analysis')
        .set('X-Requested-With', 'QuizSpace')
        .auth(f.student.accessToken, { type: 'bearer' })
        .send({ range: '90', sourceKey: ninety.snapshot.sourceKey, requestId: randomUUID() })
        .expect(503);
    },
  );
  await t.test(
    'source and account permissions checked before and after AI; late result cannot overwrite expired lease',
    async () => {
      const f = await fixture();
      await f.send();
      let calls = 0;
      await processNextLearningReport(db, async (input) => {
        calls++;
        await c.examRuns.updateOne({ _id: f.runs[0]._id }, { $set: { 'awarded.0': 1 } });
        return answer(input);
      });
      assert.equal(calls, 1);
      assert.equal((await c.learningReports.findOne({ studentId: f.id }))!.status, 'FAILED');
      assert.equal((await f.read()).report, null);
      await f.send();
      await processNextLearningReport(db, async (input) => {
        await c.learningReports.updateOne(
          { studentId: f.id, status: 'GENERATING' },
          { $set: { leaseUntil: new Date(0) } },
        );
        await expireLearningLeases(db);
        return answer(input);
      });
      assert.equal((await f.read()).report.status, 'FAILED');
      assert.equal((await f.read()).report.advice, null);
      await f.send({ retry: true });
      await processNextLearningReport(db, async (input) => {
        await c.users.updateOne({ _id: f.id }, { $set: { status: 'LOCKED' } });
        return answer(input);
      });
      await get(f.student.accessToken).expect(403);
      assert.equal(
        (await c.learningReports.findOne({
          studentId: f.id,
          sourceKey: (await learningSnapshot(db, f.id, 'all')).sourceKey,
        }))!.status,
        'FAILED',
      );
      await c.users.updateOne({ _id: f.id }, { $set: { status: 'ACTIVE' } });
      await f.send({ retry: true });
      await c.examRuns.updateOne(
        { _id: f.runs[0]._id },
        { $set: { 'settings.showAnswers': false } },
      );
      await processNextLearningReport(db, async () => {
        throw new Error('Must not be called');
      });
      assert.equal((await f.read()).report, null);
    },
  );
  await t.test('daily quota, bounded history and sample thresholds', async () => {
    const f = await fixture();
    await f.send();
    await processNextLearningReport(db, async () => {
      throw new Error();
    });
    const base = (await c.learningReports.findOne({ studentId: f.id }))!;
    for (let i = 0; i < 9; i++)
      await c.learningReports.insertOne({
        ...base,
        _id: new ObjectId(),
        sourceKey: `previous-${i}`,
        requests: [{ id: randomUUID(), createdAt: new Date() }],
      });
    assert.equal((await f.send({ retry: true })).status, 429);
    const many = await account(),
      manyId = new ObjectId(many.user.id);
    await c.examRuns.insertMany(Array.from({ length: 201 }, () => run(manyId)));
    const s = (await get(many.accessToken)).body.snapshot;
    assert.equal(s.exams, 200);
    assert.equal(s.truncated, true);
    const strong = summarizeLearning(
      [run(f.id, { awarded: [1, 1, 1] }), run(f.id, { awarded: [1, 1, 1] })],
      'all',
      null,
      0,
    );
    assert.equal(strong.topics[0].level, 'STRONG');
  });
  await t.test(
    'AI validation rejects invented topics, wrong strengths, duplicate recommendations and hidden grade actions',
    async () => {
      const f = await fixture(),
        input = learningInput((await f.read()).snapshot, 'deepseek-flash'),
        valid = answer(input);
      assert.deepEqual(validateLearningAdvice(valid, input), valid);
      assert.throws(() => validateLearningAdvice({ ...valid, finalScore: 100 }, input));
      assert.throws(() =>
        validateLearningAdvice(
          { ...valid, strengths: [{ topicId: input.topics[0].id, observation: 'Strong' }] },
          input,
        ),
      );
      assert.throws(() =>
        validateLearningAdvice(
          {
            ...valid,
            recommendations: [{ ...valid.recommendations[0], topicId: 'invented-topic' }],
          },
          input,
        ),
      );
      assert.throws(() =>
        validateLearningAdvice(
          { ...valid, recommendations: [valid.recommendations[0], valid.recommendations[0]] },
          input,
        ),
      );
      let calls = 0;
      const analyst = createLearningAnalyst(config, async (_url, init) => {
        const body = JSON.parse(init!.body as string);
        assert.match(body.messages[0].content, /untrusted DATA/);
        assert.equal(body.response_format.type, 'json_object');
        assert.ok(!JSON.stringify(body).includes('PRIVATE'));
        calls++;
        return new Response(
          JSON.stringify({
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: JSON.stringify(calls === 1 ? { ...valid, finalScore: 100 } : valid),
                },
              },
            ],
          }),
          { status: 200 },
        );
      });
      assert.deepEqual(await analyst(input), valid);
      assert.equal(calls, 2);
    },
  );
});
