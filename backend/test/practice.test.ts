import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { collections } from '../src/database/collections.js';
import { ensureIndexes } from '../src/database/indexes.js';
import {
  allocatePracticeCounts,
  buildPracticePlan,
  nextDifficulty,
  nextPracticeTopic,
  startDifficulty,
} from '../src/common/practice-plan.js';
import { ensureNextQuestion } from '../src/common/practice-runtime.js';
import { practiceView, type PracticeSession } from '../src/models/practice.model.js';
import type { LearningMetric } from '../src/models/learning.model.js';
import type { Config } from '../src/common/config.js';
import type { ExamRun } from '../src/models/exam.model.js';
import type { QuestionContent } from '../src/models/question.model.js';
import type { AIGenerator } from '../src/common/ai-provider.js';

const metric = (
  id: string,
  topic: string,
  score: number,
  earned: number,
  possible: number,
  level: LearningMetric['level'],
): LearningMetric => ({
  id,
  subject: 'Java',
  topicPath: [topic],
  questions: 5,
  exams: 2,
  earned,
  possible,
  score,
  level,
});

test('practice allocation follows weakness and adapts one step at a time', () => {
  assert.deepEqual(
    allocatePracticeCounts([
      { level: 'WEAK', score: 40 },
      { level: 'WEAK', score: 42 },
      { level: 'DEVELOPING', score: 70 },
    ]),
    [10, 10, 5],
  );
  assert.equal(startDifficulty(40), 'EASY');
  assert.equal(startDifficulty(70), 'HARD');
  assert.equal(nextDifficulty('EASY', true), 'MEDIUM');
  assert.equal(nextDifficulty('VERY_HARD', true), 'VERY_HARD');
  assert.equal(nextDifficulty('MEDIUM', false), 'EASY');
  assert.equal(nextDifficulty('EASY', false), 'EASY');
  const plan = [
    { topicId: 'redis', count: 10, blendedScore: 40 },
    { topicId: 'kafka', count: 5, blendedScore: 70 },
  ];
  assert.equal(nextPracticeTopic(plan, [])?.topicId, 'redis');
  assert.equal(nextPracticeTopic(plan, [{ topicId: 'redis' }])?.topicId, 'kafka');
  const topics = [
    metric('redis', 'Redis', 40, 2, 5, 'WEAK'),
    metric('kafka', 'Kafka', 40, 2, 5, 'WEAK'),
  ];
  const adjusted = buildPracticePlan(topics, [
    { topicId: 'redis', questions: 10, earned: 10, possible: 10, sessions: 1 },
  ]);
  assert.deepEqual(
    adjusted.plan.map((topic) => topic.topicId),
    ['kafka'],
  );
  assert.equal(adjusted.adjusted, true);
  assert.equal(adjusted.plan[0].count, 10);
  const harder = buildPracticePlan(topics, [
    { topicId: 'redis', questions: 10, earned: 8, possible: 10, sessions: 1 },
  ]);
  assert.equal(harder.plan.find((topic) => topic.topicId === 'redis')?.startDifficulty, 'HARD');
  assert.equal(harder.adjusted, true);
});

test('personalized practice quiz stays out of official scores', async (t) => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const client = await new MongoClient(memory.getUri()).connect();
  t.after(async () => {
    await client.close();
    await memory.stop();
  });
  const db = client.db('practice_tests');
  const c = collections(db);
  await ensureIndexes(db);
  const config: Config = {
    jwtSecret: 'local-practice-test-secret-at-least-32-characters',
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
  const app = createApp(db, config, { rateLimits: false, requireEmailVerification: false });
  const post = (path: string, token = '') =>
    request(app)
      .post(`/api${path}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' });
  const get = (path: string, token: string) =>
    request(app)
      .get(`/api${path}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' });
  let count = 0;
  const account = async (role = 'STUDENT') =>
    (
      await post('/auth/register')
        .send({
          name: `Practice ${++count}`,
          email: `practice${count}@example.com`,
          password: 'Password123!',
          role,
        })
        .expect(201)
    ).body as { accessToken: string; user: { id: string } };

  const submitted = (studentId: ObjectId, path: string[], awarded: number[]): ExamRun => ({
    _id: new ObjectId(),
    examId: new ObjectId(),
    ownerId: new ObjectId(),
    studentId,
    studentName: 'Student',
    title: path[0],
    subject: 'Java',
    attemptNo: 1,
    status: 'SUBMITTED',
    settings: { showAnswers: true, allowBack: true, autoSubmit: true, passScore: 50 },
    questions: awarded.map(() => ({
      id: new ObjectId().toHexString(),
      type: 'SINGLE_CHOICE',
      question: 'Exam question',
      image: '',
      imageAlt: '',
      points: 1,
      options: [{ id: 'a', text: 'A' }],
      left: [],
      blankCount: 0,
      correct: ['a'],
      explanation: 'OFFICIAL',
      rubric: '',
      classification: { subject: 'Java', topicPath: path, difficulty: 'MEDIUM' },
    })),
    responses: awarded.map(() => []),
    awarded,
    feedback: [],
    currentIndex: 0,
    revision: 1,
    startedAt: new Date(Date.now() - 3600000),
    expiresAt: new Date(),
    submittedAt: new Date(),
    scorePercent: 40,
    passed: false,
  });
  const seedBank = async (
    path: string[],
    difficulty: QuestionContent['difficulty'],
    copies: number,
  ) => {
    await c.questions.insertMany(
      Array.from({ length: copies }, (_, index) => ({
        _id: new ObjectId(),
        ownerId: new ObjectId(),
        version: 1,
        type: 'SINGLE_CHOICE' as const,
        subject: 'Java',
        topicPath: path,
        difficulty,
        status: 'READY' as const,
        question: `${path[0]} ${difficulty} ${index}`,
        options: [
          { id: 'a', text: 'Right' },
          { id: 'b', text: 'Wrong' },
          { id: 'c', text: 'Nope' },
          { id: 'd', text: 'No' },
        ],
        answers: ['a'],
        pairs: [],
        rubric: '',
        explanation: 'PRIVATE EXPLANATION',
        tags: [],
        image: '',
        imageAlt: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
  };
  const openCorrect = async (sessionId: string) => {
    const doc = await c.practiceSessions.findOne({ _id: new ObjectId(sessionId) });
    const open = doc?.items.find((item) => item.awarded === null);
    assert.ok(open);
    return open.delivered.correct;
  };

  await t.test('weak topics become 10, 10 and 5 questions', async () => {
    const student = await account();
    const id = new ObjectId(student.user.id);
    await c.examRuns.insertMany([
      submitted(id, ['Redis'], [0, 0, 1]),
      submitted(id, ['Redis'], [1, 0]),
      submitted(id, ['Kafka'], [0, 1, 0]),
      submitted(id, ['Kafka'], [0, 1]),
      submitted(id, ['Spring Boot'], [1, 1, 1, 1, 1]),
      submitted(id, ['Spring Boot'], [1, 1, 0, 0, 0]),
    ]);
    const body = (await get('/student/practice/plan?range=all', student.accessToken).expect(200))
      .body;
    const counts = Object.fromEntries(
      body.plan.map((topic: { topicPath: string[]; count: number }) => [
        topic.topicPath.at(-1),
        topic.count,
      ]),
    );
    assert.equal(body.eligible, true);
    assert.equal(body.adjusted, false);
    assert.equal(body.total, 25);
    assert.equal(counts.Redis, 10);
    assert.equal(counts.Kafka, 10);
    assert.equal(counts['Spring Boot'], 5);
    assert.equal(
      body.plan.find((topic: { topicPath: string[] }) => topic.topicPath[0] === 'Redis')
        .startDifficulty,
      'EASY',
    );
    assert.equal(
      body.plan.find((topic: { topicPath: string[] }) => topic.topicPath[0] === 'Spring Boot')
        .startDifficulty,
      'HARD',
    );
  });

  await t.test(
    'correct answers climb difficulty and the next plan drops a mastered topic',
    async () => {
      const student = await account();
      const id = new ObjectId(student.user.id);
      await c.examRuns.insertMany([
        submitted(id, ['Redis'], [0, 0, 1]),
        submitted(id, ['Redis'], [1, 0]),
      ]);
      await seedBank(['Redis'], 'EASY', 2);
      await seedBank(['Redis'], 'MEDIUM', 2);
      await seedBank(['Redis'], 'HARD', 2);
      await seedBank(['Redis'], 'VERY_HARD', 8);
      const started = (
        await post('/student/practice', student.accessToken).send({ range: 'all' }).expect(201)
      ).body;
      assert.equal(started.question.difficulty, 'EASY');
      assert.equal(started.question.correct, undefined);
      assert.equal(started.question.explanation, undefined);
      assert.ok(!JSON.stringify(started).includes('PRIVATE EXPLANATION'));
      const resumed = (
        await post('/student/practice', student.accessToken).send({ range: 'all' }).expect(200)
      ).body;
      assert.equal(resumed.question.id, started.question.id);
      const seen = [started.question.difficulty];
      let view = started;
      for (let step = 0; step < 10; step++) {
        const correct = await openCorrect(view.id);
        view = (
          await post(`/student/practice/${view.id}/answer`, student.accessToken)
            .send({ itemId: view.question.id, response: correct })
            .expect(200)
        ).body;
        if (step === 0) {
          assert.equal(view.feedback.shift, 'HARDER');
          assert.equal(view.feedback.nextDifficulty, 'MEDIUM');
          assert.match(view.feedback.explanation, /PRIVATE EXPLANATION/);
        }
        if (step < 9) {
          view = (
            await post(`/student/practice/${view.id}/next`, student.accessToken)
              .send({})
              .expect(200)
          ).body;
          seen.push(view.question.difficulty);
          assert.equal(view.question.explanation, undefined);
        }
      }
      assert.deepEqual(seen, [
        'EASY',
        'MEDIUM',
        'HARD',
        'VERY_HARD',
        'VERY_HARD',
        'VERY_HARD',
        'VERY_HARD',
        'VERY_HARD',
        'VERY_HARD',
        'VERY_HARD',
      ]);
      assert.equal(view.phase, 'SUMMARY');
      assert.equal(view.score, 100);
      const analysis = (
        await get('/student/learning-analysis?range=all', student.accessToken).expect(200)
      ).body;
      assert.equal(analysis.snapshot.topics[0].score, 40);
      assert.equal(analysis.snapshot.topics[0].level, 'WEAK');
      const nextPlan = (
        await get('/student/practice/plan?range=all', student.accessToken).expect(200)
      ).body;
      assert.equal(nextPlan.eligible, false);
      assert.equal(nextPlan.adjusted, true);
      assert.equal(nextPlan.previous.score, 100);
      assert.equal(await c.attempts.countDocuments({ studentId: id }), 0);
      assert.equal(await c.questions.countDocuments({ question: /^AI / }), 0);
    },
  );

  await t.test(
    'a wrong easy answer stays easy and other roles cannot open the session',
    async () => {
      const student = await account();
      const other = await account();
      const teacher = await account('TEACHER');
      const id = new ObjectId(student.user.id);
      await c.examRuns.insertMany([
        submitted(id, ['Kafka'], [0, 0, 0]),
        submitted(id, ['Kafka'], [0, 1]),
      ]);
      await seedBank(['Kafka'], 'EASY', 3);
      await get('/student/practice/plan?range=all', teacher.accessToken).expect(403);
      const started = (
        await post('/student/practice', student.accessToken).send({ range: 'all' }).expect(201)
      ).body;
      const correct = await openCorrect(started.id);
      const wrong = started.question.options.find(
        (option: { id: string }) => !correct.includes(option.id),
      ).id;
      const graded = (
        await post(`/student/practice/${started.id}/answer`, student.accessToken)
          .send({ itemId: started.question.id, response: [wrong] })
          .expect(200)
      ).body;
      assert.ok(graded.feedback.correct.length);
      assert.equal(graded.feedback.shift, 'SAME');
      assert.equal(graded.feedback.nextDifficulty, 'EASY');
      const next = (
        await post(`/student/practice/${started.id}/next`, student.accessToken).send({}).expect(200)
      ).body;
      assert.equal(next.question.difficulty, 'EASY');
      assert.notEqual(next.question.id, started.question.id);
      await post(`/student/practice/${started.id}/answer`, other.accessToken)
        .send({ itemId: next.question.id, response: ['x'] })
        .expect(404);
      const finished = (
        await post(`/student/practice/${started.id}/finish`, student.accessToken)
          .send({})
          .expect(200)
      ).body;
      assert.equal(finished.phase, 'SUMMARY');
      assert.equal(finished.answered, 1);
      const doc = await c.practiceSessions.findOne({ _id: new ObjectId(started.id) });
      assert.equal(doc?.items.length, 1);
      assert.equal(await c.attempts.countDocuments({ studentId: id }), 0);
    },
  );

  await t.test('AI fills a topic the bank does not have and does not publish it', async () => {
    const student = await account();
    const generator: AIGenerator = async (input) => [
      {
        content: {
          type: 'SINGLE_CHOICE',
          subject: input.settings.subject,
          topicPath: input.settings.topicPath,
          difficulty: input.settings.difficulty,
          status: 'DRAFT',
          question: 'AI practice stem',
          options: [
            { id: 'a', text: 'Alpha' },
            { id: 'b', text: 'Beta' },
            { id: 'c', text: 'Gamma' },
            { id: 'd', text: 'Delta' },
          ],
          answers: ['a'],
          pairs: [],
          rubric: '',
          explanation: 'Generated for practice only.',
          tags: ['Redis'],
          image: '',
          imageAlt: '',
        },
        evidence: '',
      },
    ];
    const now = new Date();
    const session: PracticeSession = {
      _id: new ObjectId(),
      studentId: new ObjectId(student.user.id),
      range: 'all',
      sourceKey: 'a'.repeat(64),
      status: 'ACTIVE',
      adjusted: false,
      plan: [
        {
          topicId: 'redis',
          subject: 'Java',
          topicPath: ['Pulsar'],
          level: 'WEAK',
          officialScore: 40,
          blendedScore: 40,
          count: 10,
          startDifficulty: 'MEDIUM',
        },
      ],
      cursors: [{ topicId: 'redis', difficulty: 'MEDIUM' }],
      items: [],
      aiCount: 0,
      revision: 0,
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
    };
    await c.practiceSessions.insertOne(session);
    const before = await c.questions.countDocuments();
    const saved = await ensureNextQuestion(db, session, generator, 'deepseek-flash');
    const view = practiceView(saved);
    assert.equal(view.question?.source, 'AI');
    assert.equal(view.question?.difficulty, 'MEDIUM');
    assert.equal(view.question?.question, 'AI practice stem');
    assert.equal(view.question && 'correct' in view.question, false);
    assert.equal(await c.questions.countDocuments(), before);
    assert.ok(!JSON.stringify(view.question).includes('Generated for practice only.'));
  });
});
