import test from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import { MongoClient, ObjectId } from 'mongodb';
import request from 'supertest';
import sharp from 'sharp';
import ExcelJS from 'exceljs';
import { createApp } from '../src/app.js';
import { collections } from '../src/database/collections.js';
import { ensureIndexes } from '../src/database/indexes.js';
import { sampleQuestions, writeQuestionFile } from '../src/common/question-transfer.js';
import { questionContent } from '../src/models/question.model.js';
import type { Config } from '../src/common/config.js';

test('Question bank, ownership, revisions and file exchange on isolated replica set', async (t) => {
  const memory = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const client = new MongoClient(memory.getUri());
  await client.connect();
  t.after(async () => {
    await client.close();
    await memory.stop();
  });
  const db = client.db('questions_test');
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
  const put = (path: string, token: string) =>
    request(app)
      .put(`/api${path}`)
      .set('X-Requested-With', 'QuizSpace')
      .auth(token, { type: 'bearer' });
  async function account(name: string, role: string) {
    return (
      await post('/auth/register')
        .send({ name, email: `${name}@example.com`, password: 'Password123!', role })
        .expect(201)
    ).body;
  }
  const teacher = await account('teacher', 'TEACHER');
  const other = await account('other', 'TEACHER');
  const admin = await account('admin', 'TEACHER');
  const student = await account('student', 'STUDENT');
  await c.users.updateOne({ _id: new ObjectId(admin.user.id) }, { $set: { role: 'ADMIN' } });
  const token = teacher.accessToken;
  const samples = sampleQuestions();
  const created: string[] = [];

  await t.test(
    'create all eight question types and persist initial snapshots atomically',
    async () => {
      for (const content of samples) {
        const response = await post('/questions', token).send(content).expect(201);
        created.push(response.body.id);
        assert.equal(response.body.version, 1);
        assert.deepEqual(response.body.answers, content.answers);
        assert.deepEqual(response.body.topicPath, ['Java Core', 'OOP']);
        assert.equal(
          await c.questionVersions.countDocuments({
            questionId: new ObjectId(response.body.id),
            version: 1,
          }),
          1,
        );
      }
    },
  );
  await t.test(
    'answer validation prevents corrupt choice, blank, matching, essay and ordering questions',
    async () => {
      const invalid = [
        { ...samples[0], answers: ['missing'] },
        { ...samples[0], answers: ['a', 'b'] },
        { ...samples[1], answers: ['a'] },
        { ...samples[1], answers: ['a', 'a'] },
        { ...samples[2], answers: ['yes'] },
        { ...samples[3], question: 'No marker' },
        { ...samples[3], question: '{{2}}' },
        { ...samples[4], answers: [] },
        { ...samples[5], rubric: '' },
        {
          ...samples[6],
          pairs: [
            { left: 'same', right: '1' },
            { left: 'same', right: '2' },
          ],
        },
        { ...samples[7], answers: ['a', 'b'] },
        { ...samples[0], ownerId: other.user.id },
      ];
      for (const input of invalid) await post('/questions', token).send(input).expect(400);
      assert.equal(await c.questions.countDocuments({}), 8);
    },
  );
  await t.test(
    'students and other teachers cannot read, export, edit, restore or import answers',
    async () => {
      for (const path of [
        '/questions',
        '/questions/metadata',
        '/questions/template?format=csv',
        '/questions/export?format=csv',
        `/questions/${created[0]}`,
        `/questions/${created[0]}/versions`,
      ])
        await get(path, student.accessToken).expect(403);
      await request(app).get('/api/questions').expect(401);
      await get(`/questions/${created[0]}`, other.accessToken).expect(404);
      await get(`/questions/${created[0]}/versions/1`, other.accessToken).expect(404);
      await put(`/questions/${created[0]}`, other.accessToken)
        .send({ content: samples[0], version: 1 })
        .expect(404);
      await post(`/questions/${created[0]}/versions/1/restore`, other.accessToken)
        .send({ version: 1 })
        .expect(404);
      await post(`/questions/${created[0]}/duplicate`, other.accessToken).expect(404);
      await post('/questions/import/preview?format=csv', student.accessToken)
        .set('Content-Type', 'application/octet-stream')
        .send(Buffer.from('test'))
        .expect(403);
      const list = await get('/questions', other.accessToken).expect(200);
      assert.equal(list.body.total, 0);
      const all = await get('/questions', admin.accessToken).expect(200);
      assert.equal(all.body.total, 8);
    },
  );
  await t.test(
    'search, hierarchy prefixes, tags, type and difficulty filters are scoped',
    async () => {
      const result = await get(
        '/questions?subject=Java&topic=Java%20Core&type=SINGLE_CHOICE&difficulty=EASY&tag=java&search=kế%20thừa',
        token,
      ).expect(200);
      assert.equal(result.body.total, 1);
      assert.equal(result.body.questions[0].answers, undefined);
      assert.equal((await get('/questions?topic=Java%20Core%20%2F%20OOP', token)).body.total, 8);
      assert.equal((await get('/questions?search=%5B.*%5D', token)).body.total, 0);
      assert.equal((await get('/questions/metadata', other.accessToken)).body.taxonomy.length, 0);
      const meta = await get('/questions/metadata', token).expect(200);
      assert.equal(meta.body.types.length, 8);
    },
  );
  await t.test(
    'optimistic concurrency allows only one edit and preserves immutable snapshots',
    async () => {
      const path = `/questions/${created[0]}`;
      const responses = await Promise.all(
        ['Edit A', 'Edit B'].map((question) =>
          put(path, token).send({
            content: { ...samples[0], question },
            version: 1,
            note: question,
          }),
        ),
      );
      assert.deepEqual(responses.map((r) => r.status).sort(), [200, 409]);
      const current = await get(path, token).expect(200);
      assert.equal(current.body.version, 2);
      const initial = await get(`${path}/versions/1`, token).expect(200);
      assert.equal(initial.body.content.question, samples[0].question);
      assert.equal(
        await c.questionVersions.countDocuments({ questionId: new ObjectId(created[0]) }),
        2,
      );
      await post(`${path}/versions/1/restore`, admin.accessToken).send({ version: 2 }).expect(200);
      const restored = await get(path, token).expect(200);
      assert.equal(restored.body.version, 3);
      assert.equal(restored.body.question, samples[0].question);
      const version = await get(`${path}/versions/3`, token).expect(200);
      assert.equal(version.body.editorName, 'admin');
    },
  );
  await t.test('archive retains history and duplication creates an independent draft', async () => {
    const path = `/questions/${created[0]}`;
    const archived = await post(`${path}/archive`, token).send({ version: 3 }).expect(200);
    assert.equal(archived.body.status, 'ARCHIVED');
    const copy = await post(`${path}/duplicate`, token).expect(201);
    assert.notEqual(copy.body.id, created[0]);
    assert.equal(copy.body.status, 'DRAFT');
    assert.equal(copy.body.version, 1);
    assert.equal((await get('/questions?status=ARCHIVED', token)).body.total, 1);
  });
  await t.test('a failed snapshot write rolls back the question update', async () => {
    const questionId = new ObjectId(created[0]);
    const before = await c.questions.findOne({ _id: questionId });
    assert.ok(before);
    const collisionId = new ObjectId();
    await c.questionVersions.insertOne({
      _id: collisionId,
      questionId,
      version: before.version + 1,
      content: questionContent(before),
      editorId: new ObjectId(teacher.user.id),
      editorName: 'Test',
      note: 'Injected conflict',
      createdAt: new Date(),
    });
    try {
      await put(`/questions/${created[0]}`, token)
        .send({ content: { ...samples[0], question: 'Must not persist' }, version: before.version })
        .expect(409);
      const after = await c.questions.findOne({ _id: questionId });
      assert.equal(after!.question, before.question);
      assert.equal(after!.version, before.version);
    } finally {
      await c.questionVersions.deleteOne({ _id: collisionId });
    }
  });
  let imageQuestionId = '';
  await t.test(
    'images are validated, bounded and re-encoded; external URLs and fake images rejected',
    async () => {
      const image = await sharp({
        create: { width: 40, height: 25, channels: 3, background: '#16896c' },
      })
        .png()
        .toBuffer();
      const result = await post('/questions', token)
        .send({
          ...samples[0],
          image: `data:image/png;base64,${image.toString('base64')}`,
          imageAlt: 'Sơ đồ Java',
        })
        .expect(201);
      imageQuestionId = result.body.id;
      assert.match(result.body.image, /^data:image\/webp;base64,/);
      const storedImage = Buffer.from(result.body.image.split(',')[1], 'base64');
      assert.equal((await sharp(storedImage).metadata()).format, 'webp');
      for (const image of ['https://example.com/img.png', 'data:image/png;base64,bm90YW5pbWFnZQ=='])
        await post('/questions', token)
          .send({ ...samples[0], image, imageAlt: 'test' })
          .expect(400);
    },
  );
  function upload(buffer: Buffer, format: string, access = token) {
    return post(`/questions/import/preview?format=${format}`, access)
      .set('Content-Type', 'application/octet-stream')
      .send(buffer);
  }
  await t.test('invalid CSV row reports row number and writes no questions', async () => {
    const before = await c.questions.countDocuments({});
    const buffer = await writeQuestionFile(
      [samples[0], { ...samples[0], answers: ['missing'] }],
      'csv',
    );
    const result = await upload(buffer, 'csv').expect(200);
    assert.equal(result.body.errors[0].row, 3);
    assert.equal(result.body.valid, 1);
    assert.equal(result.body.importId, null);
    assert.equal(await c.questions.countDocuments({}), before);
  });
  await t.test(
    'CSV and XLSX preserve all types, multiline Unicode, JSON arrays, images and literal formula text',
    async () => {
      const stored = await c.questions.findOne({ _id: new ObjectId(imageQuestionId) });
      assert.ok(stored);
      const content = samples.map((q, i) =>
        i === 0
          ? {
              ...questionContent(stored),
              question: '=SUM(1,2)\nTiếng Việt, "dấu nháy"',
              explanation: "'+literal",
            }
          : q,
      );
      for (const format of ['csv', 'xlsx'] as const) {
        const file = await writeQuestionFile(content, format);
        if (format === 'csv') assert.match(file.toString(), /'=SUM/);
        const preview = await upload(file, format, other.accessToken).expect(200);
        assert.deepEqual(preview.body.errors, []);
        assert.equal(preview.body.valid, 8);
        await post(`/questions/import/${preview.body.importId}/commit`, token).expect(409);
        const before = await c.questions.countDocuments({ ownerId: new ObjectId(other.user.id) });
        const commits = await Promise.all(
          [1, 2].map(() =>
            post(`/questions/import/${preview.body.importId}/commit`, other.accessToken),
          ),
        );
        assert.deepEqual(commits.map((r) => r.status).sort(), [201, 409]);
        assert.equal(
          await c.questions.countDocuments({ ownerId: new ObjectId(other.user.id) }),
          before + 8,
        );
        const imported = await c.questions.findOne({
          ownerId: new ObjectId(other.user.id),
          question: content[0].question,
        });
        assert.ok(imported?.image.startsWith('data:image/webp;base64,'));
        assert.equal(imported.explanation, "'+literal");
        assert.deepEqual(imported.answers, content[0].answers);
      }
    },
  );
  await t.test(
    'expired imports, invalid formats, formula cells, malformed files and excessive rows are rejected',
    async () => {
      const preview = await upload(await writeQuestionFile(samples, 'csv'), 'csv').expect(200);
      await c.questionImports.updateOne(
        { _id: new ObjectId(preview.body.importId) },
        { $set: { expiresAt: new Date(0) } },
      );
      await post(`/questions/import/${preview.body.importId}/commit`, token).expect(409);
      await upload(Buffer.from('not a zip'), 'xlsx').expect(400);
      await upload(Buffer.from('wrong,columns\na,b'), 'csv').expect(400);
      await upload(Buffer.from('test'), 'xls').expect(400);
      await upload(
        await writeQuestionFile(
          Array.from({ length: 101 }, () => samples[0]),
          'csv',
        ),
        'csv',
      ).expect(400);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(
        (await writeQuestionFile(samples, 'xlsx')) as unknown as ExcelJS.Buffer,
      );
      workbook.getWorksheet('Questions')!.getCell('F2').value = { formula: '1+1', result: 2 };
      await upload(Buffer.from(await workbook.xlsx.writeBuffer()), 'xlsx').expect(400);
    },
  );
  await t.test(
    'download endpoints return usable templates and exports restricted to the owner',
    async () => {
      const template = await get('/questions/template?format=csv', token).expect(200);
      assert.match(template.headers['content-disposition'], /template.csv/);
      const preview = await upload(Buffer.from(template.text), 'csv').expect(200);
      assert.equal(preview.body.valid, 8);
      const exported = await get('/questions/export?format=csv&type=ESSAY', token).expect(200);
      const own = await upload(Buffer.from(exported.text), 'csv').expect(200);
      assert.equal(own.body.total, 1);
    },
  );
});
