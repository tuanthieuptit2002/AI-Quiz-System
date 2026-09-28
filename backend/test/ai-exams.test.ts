import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ensureIndexes } from '../src/database/indexes.js';
import { collections } from '../src/database/collections.js';
import { sampleQuestions } from '../src/common/question-transfer.js';
import {
  allocateCounts,
  aiExamPlanSchema,
  validateExamPlan,
  type AIExamPlan,
} from '../src/common/ai-exam.validation.js';
import { createExamPlanner, type ExamPlanner } from '../src/common/ai-exam-provider.js';
import { expireAIExamLeases, processNextAIExamJob } from '../src/common/ai-exam-runtime.js';
import type { AIGenerator } from '../src/common/ai-provider.js';
import type { Config } from '../src/common/config.js';
import type { Question } from '../src/models/question.model.js';

const config: Config = {
  jwtSecret: 'ai-exam-test-secret-that-is-long-enough',
  frontendUrl: 'http://localhost:3000',
  production: false,
  googleClientId: '',
  smtpHost: '',
  smtpPort: 587,
  smtpUser: '',
  smtpPass: '',
  smtpFrom: '',
  mailDirectory: '',
  deepseekApiKey: 'local-test-key',
};
const example: AIExamPlan = {
  title: 'Java Backend Fresher',
  subject: 'Java',
  description: 'Đánh giá kiến thức backend cho fresher.',
  count: 50,
  durationMinutes: 60,
  passScore: 70,
  sections: [
    ['Java Core', 30],
    ['Spring Boot', 30],
    ['Database', 20],
    ['Redis', 10],
    ['Kafka', 10],
  ].map(([topic, percentage]) => ({
    topic: String(topic),
    percentage: Number(percentage),
    type: 'SINGLE_CHOICE',
    difficulty: 'MEDIUM',
    objectives: `Kiến thức ${topic}`,
    keywords: [String(topic)],
  })),
};
const planner: ExamPlanner = async () => structuredClone(example);
let serial = 0;
const generator: AIGenerator = async (input) =>
  Array.from({ length: input.count }, () => {
    const q = structuredClone(sampleQuestions().find((q) => q.type === input.settings.type)!);
    if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(q.type))
      while (q.options.length < 4)
        q.options.push({
          id: String.fromCharCode(97 + q.options.length),
          text: `Lựa chọn ${q.options.length}`,
        });
    return {
      content: {
        ...q,
        subject: input.settings.subject,
        topicPath: input.settings.topicPath,
        difficulty: input.settings.difficulty,
        question: `Câu ${++serial}: ${q.question}`,
        explanation: 'Giải thích đáp án của câu hỏi.',
      },
      evidence: '',
    };
  });
const compact = (count = 7): AIExamPlan => ({
  ...example,
  count,
  sections: [{ ...example.sections[0], percentage: 100 }],
});

test('AI exam allocation keeps exact totals and validates bad matrices', () => {
  assert.deepEqual(allocateCounts(example), [15, 15, 10, 5, 5]);
  const plan = {
    ...example,
    count: 17,
    sections: [34, 33, 33].map((percentage, i) => ({ ...example.sections[i], percentage })),
  };
  assert.deepEqual(allocateCounts(plan), [6, 6, 5]);
  assert.equal(aiExamPlanSchema.safeParse({ ...example, count: 101 }).success, false);
  assert.equal(
    aiExamPlanSchema.safeParse({
      ...example,
      sections: [{ ...example.sections[0], percentage: 99 }],
    }).success,
    false,
  );
  assert.equal(
    aiExamPlanSchema.safeParse({
      ...example,
      sections: [50, 50].map((percentage) => ({ ...example.sections[0], percentage })),
    }).success,
    false,
  );
  assert.throws(
    () =>
      validateExamPlan({
        ...example,
        count: 5,
        sections: [96, 1, 1, 1, 1].map((percentage, i) => ({ ...example.sections[i], percentage })),
      }),
    /quá nhỏ/,
  );
  for (let count = 12; count <= 100; count++)
    assert.equal(
      allocateCounts({ ...example, count }).reduce((a, b) => a + b, 0),
      count,
    );
});

test('DeepSeek planner repairs malformed output, uses JSON mode and redacts provider errors', async () => {
  let calls = 0;
  const transport: typeof fetch = async (_url, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    assert.equal(body.response_format.type, 'json_object');
    assert.ok(body.messages[0].content.includes('JSON'));
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: 'stop',
            message: { content: JSON.stringify(calls === 1 ? { invalid: true } : example) },
          },
        ],
      }),
    );
  };
  assert.deepEqual(
    await createExamPlanner(
      config,
      transport,
    )({ prompt: 'test', language: 'vi', model: 'deepseek-flash' }),
    example,
  );
  assert.equal(calls, 2);
  const denied: typeof fetch = async () => {
    calls++;
    return new Response('SECRET', { status: 401 });
  };
  await assert.rejects(
    createExamPlanner(config, denied)({ prompt: 'test', language: 'vi', model: 'deepseek-flash' }),
    /API key/,
  );
  assert.equal(calls, 3);
});

test('AI Exam integration: planning, scoped bank reuse, generation, review and transactional draft', async (t) => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const client = await new MongoClient(memory.getUri()).connect();
  t.after(async () => {
    await client.close();
    await memory.stop();
  });
  const db = client.db('ai_exam_tests');
  await ensureIndexes(db);
  const c = collections(db),
    app = createApp(db, config, { rateLimits: false, requireEmailVerification: false });
  const post = (path: string, token = '') =>
    request(app)
      .post(`/api${path}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' });
  const put = (path: string, token: string) =>
    request(app)
      .put(`/api${path}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' });
  const get = (path: string, token = '') =>
    request(app).get(`/api${path}`).auth(token, { type: 'bearer' });
  const register = async (name: string, role = 'TEACHER') =>
    (
      await post('/auth/register')
        .send({ name, email: `${name}@example.com`, password: 'Password123!', role })
        .expect(201)
    ).body;
  const teacher = await register('teacher'),
    other = await register('other'),
    student = await register('student', 'STUDENT'),
    admin = await register('admin');
  await c.users.updateOne({ _id: new ObjectId(admin.user.id) }, { $set: { role: 'ADMIN' } });
  const token = teacher.accessToken,
    ownerId = new ObjectId(teacher.user.id);
  const read = async (id: string) => (await get(`/ai-exams/${id}`, token).expect(200)).body;
  const input = (strategy = 'HYBRID') => ({
    requestId: randomUUID(),
    prompt: 'Tạo bài kiểm tra Java Backend Fresher, 50 câu, 60 phút.',
    strategy,
    language: 'vi',
  });
  const create = async (strategy = 'AI_ONLY', custom: AIExamPlan = compact()) => {
    const job = (await post('/ai-exams', token).send(input(strategy)).expect(202)).body;
    await processNextAIExamJob(db, async () => custom, generator);
    return read(job.id);
  };
  const build = async (id: string) => {
    const job = await read(id);
    await post(`/ai-exams/${id}/build`, token).send({ version: job.version }).expect(202);
  };
  const seedQuestion = async (topic: string, overrides: Partial<Question> = {}) => {
    const content = (
      await generator({
        settings: {
          subject: 'Java',
          topicPath: [topic],
          difficulty: 'MEDIUM',
          type: 'SINGLE_CHOICE',
          count: 1,
          language: 'vi',
          instructions: '',
        },
        source: { kind: 'PROMPT', name: '', text: '' },
        count: 1,
        previous: [],
        feedback: '',
        model: '',
      })
    )[0].content;
    const q: Question = {
      ...content,
      status: 'READY',
      _id: new ObjectId(),
      ownerId,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    await c.questions.insertOne(q);
    return q;
  };
  let mainId = '',
    staleBank: Question;
  await t.test(
    'RBAC, ownership, idempotency, active job constraint and prompt limits',
    async () => {
      await get('/ai-exams').expect(401);
      await get('/ai-exams', student.accessToken).expect(403);
      await post('/ai-exams', student.accessToken).send(input()).expect(403);
      await post('/ai-exams', token)
        .send({ ...input(), prompt: 'x'.repeat(4001) })
        .expect(400);
      const same = input();
      const results = await Promise.all([
        post('/ai-exams', token).send(same),
        post('/ai-exams', token).send(same),
      ]);
      assert.ok(results.every((r) => [200, 202].includes(r.status)));
      assert.equal(results[0].body.id, results[1].body.id);
      mainId = results[0].body.id;
      await post('/ai-exams', token).send(input()).expect(409);
      await get(`/ai-exams/${mainId}`, other.accessToken).expect(404);
      await get(`/ai-exams/${mainId}`, admin.accessToken).expect(200);
      const jobs = await Promise.all([
        processNextAIExamJob(db, planner, generator),
        processNextAIExamJob(db, planner, generator),
      ]);
      assert.deepEqual(jobs.sort(), [false, true]);
      const job = await read(mainId);
      assert.equal(job.status, 'PLANNED');
      assert.deepEqual(job.plan, example);
      assert.ok(!JSON.stringify(job).includes(config.deepseekApiKey!));
    },
  );
  await t.test(
    'coverage excludes other teachers, drafts, wrong subjects/types and duplicate bank text',
    async () => {
      for (const section of example.sections) {
        await seedQuestion(section.topic);
        await seedQuestion(section.topic);
      }
      staleBank = await seedQuestion('Java Core');
      await seedQuestion('Java Core', { ownerId: new ObjectId(other.user.id) });
      await seedQuestion('Java Core', { status: 'DRAFT' });
      await seedQuestion('Java Core', { subject: 'Python' });
      await seedQuestion('Java Core', { difficulty: 'HARD' });
      await seedQuestion('Java Core', { question: staleBank.question });
      const coverage = (await get(`/ai-exams/${mainId}/coverage`, token).expect(200)).body;
      assert.deepEqual(
        coverage.sections.map((s: { fromBank: number }) => s.fromBank),
        [3, 2, 2, 2, 2],
      );
      assert.equal(
        coverage.sections.reduce((n: number, s: { toGenerate: number }) => n + s.toGenerate, 0),
        39,
      );
    },
  );
  await t.test('plan validation and optimistic version conflicts', async () => {
    const job = await read(mainId);
    await put(`/ai-exams/${mainId}/plan`, token)
      .send({ version: job.version - 1, plan: example, strategy: 'HYBRID' })
      .expect(409);
    await put(`/ai-exams/${mainId}/plan`, token)
      .send({ version: job.version, plan: { ...example, count: 101 }, strategy: 'HYBRID' })
      .expect(400);
    await put(`/ai-exams/${mainId}/plan`, token)
      .send({ version: job.version, plan: example, strategy: 'HYBRID' })
      .expect(200);
  });
  await t.test(
    'hybrid generates exactly the shortages, preserving 50-question topic distribution',
    async () => {
      const bankBefore = await c.questions.countDocuments();
      await build(mainId);
      let generated = 0;
      await processNextAIExamJob(db, planner, async (i) => {
        generated += i.count;
        assert.ok(i.count <= 5);
        return generator(i);
      });
      const job = await read(mainId);
      assert.equal(job.status, 'REVIEW');
      assert.equal(job.items.length, 50);
      assert.equal(job.fromBank, 11);
      assert.equal(generated, 39);
      assert.deepEqual(
        example.sections.map(
          (_, i) => job.items.filter((q: { section: number }) => q.section === i).length,
        ),
        [15, 15, 10, 5, 5],
      );
      assert.equal(
        new Set(job.items.map((i: { content: { question: string } }) => i.content.question)).size,
        50,
      );
      assert.equal(await c.questions.countDocuments(), bankBefore);
      assert.equal(await c.exams.countDocuments(), 0);
      await put(`/ai-exams/${mainId}/plan`, token)
        .send({ version: job.version, plan: example, strategy: 'AI_ONLY' })
        .expect(409);
    },
  );
  await t.test(
    'invalid generated answers fail before storage; retry keeps previous valid batches',
    async () => {
      const initial = await create();
      await build(initial.id);
      let calls = 0;
      await processNextAIExamJob(db, planner, async (i) => {
        const result = await generator(i);
        if (++calls === 2) for (const item of result) item.content.answers = ['missing-option'];
        return result;
      });
      let job = await read(initial.id);
      assert.equal(job.status, 'FAILED');
      assert.equal(job.items.length, 5);
      const prefix = job.items.map((i: { id: string }) => i.id);
      await post(`/ai-exams/${job.id}/save`, token).send({ version: job.version }).expect(409);
      await post(`/ai-exams/${job.id}/retry`, token).send({ version: job.version }).expect(202);
      let requested = 0;
      await processNextAIExamJob(db, planner, async (i) => {
        requested += i.count;
        return generator(i);
      });
      job = await read(job.id);
      assert.equal(job.status, 'REVIEW');
      assert.equal(requested, 2);
      assert.deepEqual(
        job.items.slice(0, 5).map((i: { id: string }) => i.id),
        prefix,
      );
    },
  );
  await t.test(
    'bank-only reports missing topics without generating; hybrid retry fills the gap',
    async () => {
      const initial = await create('BANK_ONLY', { ...compact(2), subject: 'Go' });
      await build(initial.id);
      await processNextAIExamJob(db, planner, async () => {
        throw new Error('Should not call AI');
      });
      let job = await read(initial.id);
      assert.equal(job.status, 'FAILED');
      assert.match(job.error, /thiếu câu/);
      assert.equal(job.items.length, 0);
      await post(`/ai-exams/${job.id}/retry`, token)
        .send({ version: job.version, strategy: 'HYBRID' })
        .expect(202);
      await processNextAIExamJob(db, planner, generator);
      job = await read(job.id);
      assert.equal(job.status, 'REVIEW');
      assert.equal(job.items.length, 2);
    },
  );
  await t.test(
    'bank-only succeeds without AI generation and avoids cloning bank questions',
    async () => {
      const initial = await create('BANK_ONLY', compact(1));
      await build(initial.id);
      await processNextAIExamJob(db, planner, async () => {
        throw new Error('Must not generate');
      });
      const job = await read(initial.id);
      assert.equal(job.status, 'REVIEW');
      assert.equal(job.fromBank, 1);
      const before = await c.questions.countDocuments();
      await post(`/ai-exams/${job.id}/items/${job.items[0].id}/replace`, token)
        .send({ version: job.version })
        .expect(400);
      await post(`/ai-exams/${job.id}/save`, token).send({ version: job.version }).expect(201);
      assert.equal(await c.questions.countDocuments(), before);
    },
  );
  await t.test(
    'editing uses a copy, keeps the section contract and blocks duplicate questions',
    async () => {
      let job = await read(mainId);
      const item = job.items.find((i: { origin: string }) => i.origin === 'BANK');
      const content = {
        ...item.content,
        question: 'Câu đã sửa riêng trong đề?',
        explanation: 'Giải thích đã duyệt.',
      };
      await put(`/ai-exams/${mainId}/items/${item.id}`, other.accessToken)
        .send({ version: job.version, content })
        .expect(404);
      await put(`/ai-exams/${mainId}/items/${item.id}`, token)
        .send({
          version: job.version,
          content: { ...content, type: 'ESSAY', options: [], answers: [], rubric: 'Rubric' },
        })
        .expect(400);
      await put(`/ai-exams/${mainId}/items/${item.id}`, token)
        .send({
          version: job.version,
          content: { ...content, question: job.items[1].content.question },
        })
        .expect(400);
      await put(`/ai-exams/${mainId}/items/${item.id}`, token)
        .send({ version: job.version, content })
        .expect(200);
      job = await read(mainId);
      assert.equal(job.items.find((i: { id: string }) => i.id === item.id).origin, 'EDITED');
      assert.equal(
        (await c.questions.findOne({ _id: new ObjectId(item.questionId) }))!.question,
        item.content.question,
      );
    },
  );
  await t.test(
    'replacement preserves original on failure and retries with no duplicate IDs',
    async () => {
      let job = await read(mainId);
      const item = job.items.find((i: { origin: string }) => i.origin === 'AI');
      await post(`/ai-exams/${mainId}/items/${item.id}/replace`, token)
        .send({ version: job.version, feedback: 'Thêm tình huống thực tế.' })
        .expect(202);
      await processNextAIExamJob(db, planner, async () => {
        throw new Error('private transport error');
      });
      job = await read(mainId);
      assert.equal(job.status, 'FAILED');
      assert.ok(!job.error.includes('private'));
      assert.equal(
        job.items.find((i: { id: string }) => i.id === item.id).content.question,
        item.content.question,
      );
      await post(`/ai-exams/${mainId}/retry`, token).send({ version: job.version }).expect(202);
      await processNextAIExamJob(db, planner, async (i) => {
        assert.equal(i.count, 1);
        assert.match(i.feedback, /thực tế/);
        return generator(i);
      });
      job = await read(mainId);
      assert.equal(job.status, 'REVIEW');
      assert.equal(job.items.length, 50);
      assert.notEqual(
        job.items.find((i: { id: string }) => i.id === item.id).content.question,
        item.content.question,
      );
    },
  );
  await t.test('stale bank snapshot aborts the entire save transaction', async () => {
    const job = await read(mainId),
      item = job.items.find((i: { origin: string }) => i.origin === 'BANK');
    await c.questions.updateOne({ _id: new ObjectId(item.questionId) }, { $inc: { version: 1 } });
    const bank = await c.questions.countDocuments(),
      exams = await c.exams.countDocuments();
    await post(`/ai-exams/${mainId}/save`, token).send({ version: job.version }).expect(409);
    assert.equal(await c.questions.countDocuments(), bank);
    assert.equal(await c.exams.countDocuments(), exams);
    assert.equal((await read(mainId)).status, 'REVIEW');
    await c.questions.updateOne({ _id: new ObjectId(item.questionId) }, { $inc: { version: -1 } });
  });
  await t.test(
    'concurrent approval saves only once, keeps teacher owner and a restricted draft',
    async () => {
      const job = await read(mainId),
        before = await c.questions.countDocuments();
      const responses = await Promise.all([
        post(`/ai-exams/${mainId}/save`, admin.accessToken).send({ version: job.version }),
        post(`/ai-exams/${mainId}/save`, token).send({ version: job.version }),
      ]);
      assert.ok(responses.some((r) => r.status === 201));
      assert.ok(responses.every((r) => [200, 201, 409].includes(r.status)));
      const saved = await read(mainId),
        exam = (await get(`/exams/${saved.examId}`, token).expect(200)).body;
      assert.equal(saved.status, 'SAVED');
      assert.equal(exam.ownerId, teacher.user.id);
      assert.equal(exam.status, 'DRAFT');
      assert.equal(exam.settings.access, 'RESTRICTED');
      assert.equal(exam.settings.durationMinutes, 60);
      assert.equal(exam.questions.length, 50);
      assert.equal(await c.questions.countDocuments(), before + 40);
      assert.equal(await c.questionVersions.countDocuments({ note: { $regex: mainId } }), 40);
      await post(`/ai-exams/${mainId}/save`, token).send({ version: job.version }).expect(200);
      await post(`/exams/${saved.examId}/publish`, token)
        .send({ version: exam.version })
        .expect(400);
      await get(`/exams/${saved.examId}`, other.accessToken).expect(404);
      await get(`/ai-exams/${mainId}`, student.accessToken).expect(403);
    },
  );
  await t.test('expired leases recover and disabled owners cannot consume AI', async () => {
    const initial = await create();
    await build(initial.id);
    await c.aiExams.updateOne(
      { _id: new ObjectId(initial.id) },
      { $set: { status: 'WORKING', leaseId: 'old', leaseUntil: new Date(0) } },
    );
    await expireAIExamLeases(db);
    let job = await read(initial.id);
    assert.equal(job.status, 'FAILED');
    await post(`/ai-exams/${job.id}/retry`, token).send({ version: job.version }).expect(202);
    await c.users.updateOne({ _id: ownerId }, { $set: { status: 'LOCKED' } });
    let calls = 0;
    await processNextAIExamJob(db, planner, async (i) => {
      calls++;
      return generator(i);
    });
    assert.equal(calls, 0);
    await c.users.updateOne({ _id: ownerId }, { $set: { status: 'ACTIVE' } });
    job = await read(initial.id);
    assert.equal(job.status, 'FAILED');
  });
});
