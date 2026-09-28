import { zipDocument, pdfDocument } from './helpers/source-fixtures.js';
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
import {
  createDeepSeekGenerator,
  type AIGenerator,
  type AIRequest,
} from '../src/common/ai-provider.js';
import { validateAIOutput } from '../src/common/ai.validation.js';
import { processNextAIJob, expireAILeases } from '../src/common/ai-runtime.js';
import {
  extractDocument,
  cleanSource,
  htmlText,
  isPublicAddress,
  resolvePublicURL,
} from '../src/common/ai-source.js';
import type { AISettings, AISource } from '../src/models/ai-generation.model.js';
import type { Config } from '../src/common/config.js';

const config: Config = {
  jwtSecret: 'test-secret-that-is-long-enough-for-ai-tests',
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
  deepseekModel: 'deepseek-flash',
};
const settings: AISettings = {
  subject: 'Java',
  topicPath: ['Spring Boot'],
  difficulty: 'MEDIUM',
  type: 'SINGLE_CHOICE',
  count: 6,
  language: 'vi',
  instructions: '',
};
const source: AISource = { kind: 'PROMPT', name: '', text: '' };
const lecture =
  'Spring Boot uses auto-configuration to configure an application based on the dependencies available on the classpath. Constructor injection makes dependencies explicit and enables straightforward unit tests.';
let serial = 0;
export const fakeGenerator: AIGenerator = async (input) =>
  Array.from({ length: input.count }, () => {
    const q = structuredClone(sampleQuestions().find((q) => q.type === input.settings.type)!);
    if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(q.type))
      while (q.options.length < 4)
        q.options.push({
          id: String.fromCharCode(97 + q.options.length),
          text: `Phương án khác ${q.options.length + 1}`,
        });
    return {
      content: {
        ...q,
        subject: input.settings.subject,
        topicPath: input.settings.topicPath,
        difficulty: input.settings.difficulty,
        question: `${q.question} [Câu ${++serial}]`,
        explanation: 'Giải thích đáp án dựa trên kiến thức và tài liệu của bài học.',
      },
      evidence: input.source.text ? input.source.text.slice(0, 90) : '',
    };
  });
const asOutput = (items: Awaited<ReturnType<AIGenerator>>) => ({
  questions: items.map(({ content: q, evidence }) => ({
    question: q.question,
    options: q.options,
    answers: q.answers,
    pairs: q.pairs,
    rubric: q.rubric,
    explanation: q.explanation,
    tags: q.tags,
    evidence,
  })),
});

test('AI source extraction validates file contents and blocks private network destinations', async (t) => {
  await t.test(
    'reads UTF-8, DOCX paragraphs and PDF text without storing uploaded files',
    async () => {
      assert.equal((await extractDocument(Buffer.from(lecture), 'lesson.txt')).text, lecture);
      const word = await extractDocument(zipDocument(lecture), 'Spring Boot.docx');
      assert.equal(word.kind, 'DOCX');
      assert.equal(word.text, lecture);
      const pdf = await extractDocument(pdfDocument(lecture), 'Spring Boot.pdf');
      assert.equal(pdf.kind, 'PDF');
      assert.ok(pdf.text.includes('Spring Boot uses auto-configuration'));
    },
  );
  await t.test(
    'rejects invalid, empty, scan-only, oversized and unsupported documents',
    async () => {
      await assert.rejects(extractDocument(Buffer.from('fake'), 'a.pdf'), /khớp/);
      await assert.rejects(extractDocument(Buffer.from('fake'), 'a.doc'), /docx/);
      await assert.rejects(extractDocument(Buffer.alloc(8 * 1024 * 1024 + 1), 'a.txt'), /8 MB/);
      await assert.rejects(extractDocument(pdfDocument(''), 'scan.pdf'), /OCR/);
      await assert.rejects(extractDocument(Buffer.from([0xff, 0xfe]), 'a.txt'), /UTF-8/);
      assert.throws(() => cleanSource('x'.repeat(60001)), /60.000/);
    },
  );
  await t.test('URL validation catches IPv4, IPv6, mapped IPv4 and mixed DNS results', async () => {
    for (const address of [
      '127.0.0.1',
      '0.0.0.0',
      '10.0.0.2',
      '169.254.169.254',
      '192.168.2.1',
      '172.16.0.1',
      '100.64.0.1',
      '::1',
      '::',
      'fe80::1',
      'fc00::1',
      '::ffff:127.0.0.1',
    ])
      assert.equal(isPublicAddress(address), false, address);
    assert.equal(isPublicAddress('8.8.8.8'), true);
    for (const url of [
      'http://127.1',
      'http://2130706433',
      'http://[::ffff:127.0.0.1]',
      'file:///etc/passwd',
      'https://user:pass@example.com',
      'https://example.com:8080',
    ])
      await assert.rejects(resolvePublicURL(url));
    const resolver = async () => [
      { address: '8.8.8.8', family: 4 },
      { address: '127.0.0.1', family: 4 },
    ];
    await assert.rejects(resolvePublicURL('https://example.com', resolver as never), /mạng riêng/);
    const result = await resolvePublicURL(
      'https://example.com',
      async () => [{ address: '8.8.8.8', family: 4 }] as never,
    );
    assert.equal(result.address.address, '8.8.8.8');
  });
  await t.test(
    'HTML removes scripts, navigation and hidden instructions; source remains plain text',
    () => {
      const html = `<html><head><title>Lecture</title><script>bad()</script></head><body><nav>private menu</nav><article><p>${lecture}</p><div hidden>hidden-instruction</div></article></body></html>`;
      const result = htmlText(Buffer.from(html));
      assert.equal(result.text, lecture);
      assert.equal(result.name, 'Lecture');
    },
  );
});

test('DeepSeek adapter validates every question and never exposes provider secrets', async (t) => {
  const base: AIRequest = {
    settings,
    source,
    count: 1,
    previous: [],
    feedback: '',
    model: 'deepseek-flash',
  };
  await t.test(
    'eight supported types satisfy the bank schema, and choice questions have four options',
    async () => {
      for (const sample of sampleQuestions()) {
        const input = { ...base, settings: { ...settings, type: sample.type } };
        const generated = await fakeGenerator(input);
        const validated = validateAIOutput(asOutput(generated), input.settings, source, 1, []);
        assert.equal(validated[0].content.type, sample.type);
        assert.equal(validated[0].content.status, 'DRAFT');
      }
    },
  );
  await t.test(
    'malformed counts, duplicate questions/options, wrong keys and fabricated evidence are rejected',
    async () => {
      const sample = await fakeGenerator(base);
      const output = asOutput(sample);
      assert.throws(() => validateAIOutput(output, settings, source, 2, []));
      assert.throws(
        () => validateAIOutput(output, settings, source, 1, [sample[0].content.question]),
        /trùng/,
      );
      const wrong = structuredClone(output);
      wrong.questions[0].answers = ['forged'];
      assert.throws(() => validateAIOutput(wrong, settings, source, 1, []), /đáp án/i);
      wrong.questions[0] = structuredClone(output.questions[0]);
      wrong.questions[0].options[1].text = wrong.questions[0].options[0].text;
      assert.throws(() => validateAIOutput(wrong, settings, source, 1, []), /trùng/);
      const document = { kind: 'TEXT' as const, name: 'lecture', text: lecture };
      assert.throws(() => validateAIOutput(output, settings, document, 1, []), /trích/);
      output.questions[0].evidence = lecture.slice(0, 90);
      assert.equal(
        validateAIOutput(output, settings, document, 1, [])[0].evidence,
        lecture.slice(0, 90).trim(),
      );
      output.questions[0].evidence = 'Invented quote';
      assert.throws(() => validateAIOutput(output, settings, document, 1, []), /trích/);
    },
  );
  await t.test(
    'sends JSON-mode requests only to DeepSeek and handles refusals/truncation/invalid JSON',
    async () => {
      const payload = asOutput(await fakeGenerator(base));
      const fetcher: typeof fetch = async (url, init) => {
        assert.equal(url, 'https://api.deepseek.com/chat/completions');
        const body = JSON.parse(String(init!.body));
        assert.equal(body.response_format.type, 'json_object');
        assert.equal(body.thinking.type, 'disabled');
        assert.equal(body.messages[0].role, 'system');
        assert.ok(!JSON.stringify(body).includes(config.deepseekApiKey!));
        return Response.json({
          choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(payload) } }],
        });
      };
      assert.equal((await createDeepSeekGenerator(config, fetcher)(base)).length, 1);
      let attempts = 0;
      const repaired = createDeepSeekGenerator(config, async () => {
        attempts++;
        return attempts === 1
          ? Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{}' } }] })
          : fetcher('https://api.deepseek.com/chat/completions', {
              body: JSON.stringify({
                response_format: { type: 'json_object' },
                thinking: { type: 'disabled' },
                messages: [{ role: 'system' }],
              }),
            });
      });
      assert.equal((await repaired(base)).length, 1);
      assert.equal(attempts, 2);

      for (const status of [401, 402, 429, 500]) {
        const generator = createDeepSeekGenerator(
          config,
          async () => new Response('SECRET_PROVIDER_DETAILS', { status }),
        );
        await assert.rejects(
          generator(base),
          (error: Error) => !error.message.includes('SECRET_PROVIDER_DETAILS'),
        );
      }
      for (const choice of [
        { finish_reason: 'length', message: { content: '{}' } },
        { finish_reason: 'stop', message: { content: '' } },
      ])
        await assert.rejects(
          createDeepSeekGenerator(config, async () => Response.json({ choices: [choice] }))(base),
          /rỗng/,
        );
      await assert.rejects(
        createDeepSeekGenerator({ ...config, deepseekApiKey: '' }, fetcher)(base),
        /DEEPSEEK_API_KEY/,
      );
    },
  );
});

test('AI workflow persists drafts, enforces ownership and approves atomically into the bank', async (t) => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const client = new MongoClient(memory.getUri());
  await client.connect();
  t.after(async () => {
    await client.close();
    await memory.stop();
  });
  const db = client.db('ai_tests');
  await ensureIndexes(db);
  const c = collections(db);
  const app = createApp(db, config, { rateLimits: false, requireEmailVerification: false });
  const post = (path: string, token = '') =>
    request(app)
      .post(`/api${path}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' });
  const get = (path: string, token = '') =>
    request(app).get(`/api${path}`).auth(token, { type: 'bearer' });
  const put = (path: string, token: string) =>
    request(app)
      .put(`/api${path}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' });
  const register = async (name: string, role: string) =>
    (
      await post('/auth/register')
        .send({ name, email: `${name}@example.com`, password: 'Password123!', role })
        .expect(201)
    ).body;
  const teacher = await register('teacher', 'TEACHER'),
    other = await register('other', 'TEACHER'),
    student = await register('student', 'STUDENT'),
    admin = await register('admin', 'TEACHER');
  await c.users.updateOne({ _id: new ObjectId(admin.user.id) }, { $set: { role: 'ADMIN' } });
  const token = teacher.accessToken;
  const fresh = (count = 6) => ({
    requestId: randomUUID(),
    settings: { ...settings, count },
    source,
  });
  const read = async (id: string) => (await get(`/ai/generations/${id}`, token).expect(200)).body;
  let id = '';
  await t.test(
    'teacher/admin only, no API key leaks; file and URL endpoints are protected',
    async () => {
      await get('/ai/status').expect(401);
      await get('/ai/status', student.accessToken).expect(403);
      const status = (await get('/ai/status', token).expect(200)).body;
      assert.equal(status.configured, true);
      assert.ok(!JSON.stringify(status).includes(config.deepseekApiKey!));
      await post('/ai/source/url', token).send({ url: 'http://127.0.0.1:8080/health' }).expect(400);
      const extracted = await post('/ai/source/file?filename=lecture.txt', token)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from(lecture))
        .expect(200);
      assert.equal(extracted.body.text, lecture);
      await post('/ai/generations', token)
        .send({ ...fresh(), settings: { ...settings, count: 51 } })
        .expect(400);
    },
  );
  await t.test(
    'request IDs and unique active-owner index prevent duplicate paid jobs',
    async () => {
      const input = fresh();
      const responses = await Promise.all([
        post('/ai/generations', token).send(input),
        post('/ai/generations', token).send(input),
      ]);
      assert.ok(responses.every((r) => [200, 202].includes(r.status)));
      id = responses[0].body.id;
      assert.equal(responses[1].body.id, id);
      assert.equal(await c.aiGenerations.countDocuments({}), 1);
      await post('/ai/generations', token).send(fresh()).expect(409);
      await get(`/ai/generations/${id}`, other.accessToken).expect(404);
      assert.equal((await get('/ai/generations', other.accessToken)).body.total, 0);
      const job = await read(id);
      await post(`/ai/generations/${id}/approve`, token)
        .send({ version: job.version, ids: [randomUUID()] })
        .expect(409);
    },
  );
  await t.test(
    'two workers do not claim one job twice; batch count and no auto-bank writes',
    async () => {
      const calls: number[] = [];
      const generator: AIGenerator = async (input) => {
        calls.push(input.count);
        assert.equal(input.settings.count, input.count);
        return fakeGenerator(input);
      };
      const workers = await Promise.all([
        processNextAIJob(db, generator),
        processNextAIJob(db, generator),
      ]);
      assert.equal(workers.filter(Boolean).length, 1);
      assert.deepEqual(calls, [5, 1]);
      const job = await read(id);
      assert.equal(job.status, 'REVIEW');
      assert.equal(job.items.length, 6);
      assert.ok(job.items.every((i: { status: string }) => i.status === 'PENDING'));
      assert.equal(await c.questions.countDocuments({}), 0);
      assert.equal(job.leaseId, undefined);
      assert.equal(job.requestId, undefined);
    },
  );
  await t.test(
    'editing stays in review; concurrent approval inserts a question and version once',
    async () => {
      let job = await read(id);
      const item = job.items[0];
      await put(`/ai/generations/${id}/items/${item.id}`, other.accessToken)
        .send({ version: job.version, content: item.content })
        .expect(404);
      job = (
        await put(`/ai/generations/${id}/items/${item.id}`, token)
          .send({
            version: job.version,
            content: { ...item.content, question: 'Câu hỏi đã biên tập', status: 'READY' },
          })
          .expect(200)
      ).body;
      assert.equal(job.items[0].content.status, 'DRAFT');
      assert.equal(await c.questions.countDocuments({}), 0);
      const body = { version: job.version, ids: [item.id] };
      const responses = await Promise.all([
        post(`/ai/generations/${id}/approve`, token).send(body),
        post(`/ai/generations/${id}/approve`, token).send(body),
      ]);
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      job = await read(id);
      const bank = await c.questions.findOne({ _id: new ObjectId(job.items[0].questionId) });
      assert.equal(bank?.question, 'Câu hỏi đã biên tập');
      assert.equal(bank?.status, 'READY');
      assert.equal(bank?.ownerId.toHexString(), teacher.user.id);
      assert.equal(await c.questions.countDocuments({}), 1);
      assert.equal(
        await c.questionVersions.countDocuments({ questionId: bank!._id, version: 1 }),
        1,
      );
      await put(`/ai/generations/${id}/items/${item.id}`, token)
        .send({ version: job.version, content: item.content })
        .expect(409);
      await post(`/ai/generations/${id}/items/${item.id}/regenerate`, token)
        .send({ version: job.version })
        .expect(409);
    },
  );
  await t.test(
    'reject keeps bank untouched; regeneration is reviewed again and uses feedback',
    async () => {
      let job = await read(id);
      const item = job.items[1];
      job = (
        await post(`/ai/generations/${id}/reject`, token)
          .send({ version: job.version, ids: [item.id] })
          .expect(200)
      ).body;
      assert.equal(job.items[1].status, 'REJECTED');
      await post(`/ai/generations/${id}/items/${item.id}/regenerate`, token)
        .send({ version: job.version, feedback: 'Dùng ví dụ thực tế' })
        .expect(202);
      await processNextAIJob(db, async (input) => {
        assert.equal(input.count, 1);
        assert.equal(input.feedback, 'Dùng ví dụ thực tế');
        return fakeGenerator(input);
      });
      job = await read(id);
      assert.equal(job.status, 'REVIEW');
      assert.equal(job.items[1].id, item.id);
      assert.equal(job.items[1].status, 'PENDING');
      assert.equal(job.items[1].revision, 2);
      assert.notEqual(job.items[1].content.question, item.content.question);
      assert.equal(await c.questions.countDocuments({}), 1);
    },
  );
  await t.test(
    'partial provider failure can resume without losing the first five questions',
    async () => {
      const created = (await post('/ai/generations', token).send(fresh()).expect(202)).body;
      let calls = 0;
      await processNextAIJob(db, async (input) => {
        if (++calls === 2) throw Object.assign(new Error('AI tạm lỗi'), { status: 502 });
        return fakeGenerator(input);
      });
      let job = await read(created.id);
      assert.equal(job.status, 'FAILED');
      assert.equal(job.items.length, 5);
      const first = job.items[0].id;
      await post(`/ai/generations/${created.id}/items/${first}/regenerate`, token)
        .send({ version: job.version, feedback: 'Viết lại rõ hơn' })
        .expect(202);
      await processNextAIJob(db, fakeGenerator);
      job = await read(created.id);
      assert.equal(job.status, 'FAILED');
      assert.equal(job.items.length, 5);
      assert.equal(job.items[0].id, first);
      assert.equal(job.items[0].revision, 2);
      assert.equal(job.regenerateId, null);
      await post(`/ai/generations/${created.id}/retry`, token)
        .send({ version: job.version })
        .expect(202);
      await processNextAIJob(db, async (input) => {
        assert.equal(input.count, 1);
        assert.equal(input.previous.length, 5);
        return fakeGenerator(input);
      });
      job = await read(created.id);
      assert.equal(job.items.length, 6);
      assert.equal(job.items[0].id, first);
      assert.equal(job.status, 'REVIEW');
    },
  );
  await t.test(
    'stale leases reject late worker results and preserve the existing draft',
    async () => {
      let job = await read(id);
      const original = job.items[2];
      await post(`/ai/generations/${id}/items/${original.id}/regenerate`, token)
        .send({ version: job.version })
        .expect(202);
      await processNextAIJob(db, async (input) => {
        await c.aiGenerations.updateOne(
          { _id: new ObjectId(id) },
          { $set: { leaseUntil: new Date(0) } },
        );
        await expireAILeases(db);
        return fakeGenerator(input);
      });
      job = await read(id);
      assert.equal(job.status, 'FAILED');
      assert.equal(job.items[2].content.question, original.content.question);
    },
  );
  await t.test(
    'admin approval preserves original teacher ownership; sources stay out of list responses',
    async () => {
      const job = await read(id);
      const chosen = job.items
        .filter((i: { status: string }) => i.status === 'PENDING')
        .slice(0, 2);
      const next = (
        await post(`/ai/generations/${id}/approve`, admin.accessToken)
          .send({ version: job.version, ids: chosen.map((i: { id: string }) => i.id) })
          .expect(200)
      ).body;
      for (const item of next.items.filter((i: { id: string }) =>
        chosen.some((v: { id: string }) => v.id === i.id),
      )) {
        const bank = await c.questions.findOne({ _id: new ObjectId(item.questionId) });
        assert.equal(bank?.ownerId.toHexString(), teacher.user.id);
      }
      const list = (await get('/ai/generations', token).expect(200)).body;
      assert.equal(list.jobs[0].items, undefined);
      assert.equal(list.jobs[0].source.text, undefined);
    },
  );
  await t.test(
    'a 30-question document job generates six batches with verified source quotes',
    async () => {
      const input = {
        ...fresh(30),
        source: { kind: 'PDF', name: 'Spring Boot.pdf', text: lecture },
      };
      const created = (await post('/ai/generations', token).send(input).expect(202)).body;
      const batches: number[] = [];
      await processNextAIJob(db, async (request) => {
        batches.push(request.count);
        return fakeGenerator(request);
      });
      const job = await read(created.id);
      assert.deepEqual(batches, [5, 5, 5, 5, 5, 5]);
      assert.equal(job.items.length, 30);
      assert.equal(new Set(job.items.map((item: { id: string }) => item.id)).size, 30);
      assert.ok(job.items.every((item: { evidence: string }) => lecture.includes(item.evidence)));
      assert.equal(await c.questions.countDocuments({}), 3);
    },
  );
  await t.test(
    'a blocked account cannot start provider work and empty config cannot create jobs',
    async () => {
      await post('/ai/generations', other.accessToken).send(fresh(1)).expect(202);
      await c.users.updateOne(
        { _id: new ObjectId(other.user.id) },
        { $set: { status: 'BLOCKED' } },
      );
      let called = false;
      await processNextAIJob(db, async (input) => {
        called = true;
        return fakeGenerator(input);
      });
      assert.equal(called, false);
      const disabled = createApp(
        db,
        { ...config, deepseekApiKey: '' },
        { rateLimits: false, requireEmailVerification: false },
      );
      await request(disabled)
        .post('/api/ai/generations')
        .auth(token, { type: 'bearer' })
        .set('X-Requested-With', 'QuizSpace')
        .send(fresh())
        .expect(503);
    },
  );
});
