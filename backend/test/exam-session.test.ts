import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ExamSession,
  draftKey,
  responseAnswered,
  type DraftStorage,
  type ExamTransport,
  type SaveAnswer,
} from '../../frontend/lib/exam-session.js';
import type { ExamRun, RunQuestion } from '../../frontend/lib/exams.js';

const clone = <T>(value: T): T => structuredClone(value);
const failure = (status: number) => Object.assign(new Error('Conflict'), { status });
function fixture(allowBack = true) {
  const questions: RunQuestion[] = Array.from({ length: 3 }, (_, i) => ({
    id: `question-${i}`,
    type: 'SINGLE_CHOICE',
    question: `Question ${i + 1}`,
    image: '',
    imageAlt: '',
    points: 1,
    options: [
      { id: 'a', text: 'A' },
      { id: 'b', text: 'B' },
    ],
    left: [],
    blankCount: 0,
  }));
  let wall = Date.now(),
    mono = 0;
  const clock = { now: () => wall, monotonic: () => mono };
  let server: ExamRun = {
    id: 'run-one',
    examId: 'exam-one',
    studentName: 'Student',
    title: 'Exam',
    subject: 'Java',
    attemptNo: 1,
    status: 'RUNNING',
    grading: null,
    settings: { showAnswers: false, allowBack, autoSubmit: true, passScore: 70 },
    questions,
    responses: [[], [], []],
    flagged: [false, false, false],
    lastMutationId: null,
    awarded: [],
    feedback: [],
    currentIndex: 0,
    revision: 0,
    startedAt: new Date(wall).toISOString(),
    expiresAt: new Date(wall + 600000).toISOString(),
    serverTime: new Date(wall).toISOString(),
    questionCount: 3,
    answered: [false, false, false],
    scorePercent: null,
    passed: null,
    submittedAt: null,
  };
  const cache = new Map<string, string>();
  const storage: DraftStorage = {
    getItem: (k) => cache.get(k) || null,
    setItem: (k, v) => {
      cache.set(k, v);
    },
    removeItem: (k) => {
      cache.delete(k);
    },
  };
  const flags = { offline: false, loseAck: false, saves: 0, submitCalls: 0 };
  const dto = () => {
    const value = clone(server);
    if (!allowBack && value.status === 'RUNNING') {
      value.questions = value.questions.map((q, i) =>
        i === value.currentIndex
          ? q
          : ({ id: q.id, points: q.points, locked: true } as RunQuestion),
      );
      value.responses = value.responses.map((r, i) => (i === value.currentIndex ? r : []));
    }
    return value;
  };
  const transport: ExamTransport = {
    read: async () => {
      if (flags.offline) throw new TypeError('offline');
      return dto();
    },
    save: async (body) => {
      if (flags.offline) throw new TypeError('offline');
      if (server.lastMutationId === body.mutationId || server.status !== 'RUNNING') return dto();
      if (body.revision !== server.revision) throw failure(409);
      if (!allowBack && body.index !== server.currentIndex) throw failure(403);
      flags.saves++;
      server.responses[body.index] = [...body.response];
      server.flagged[body.index] = body.flagged;
      server.answered[body.index] = responseAnswered(server.questions[body.index], body.response);
      server.currentIndex = body.nextIndex;
      server.revision++;
      server.lastMutationId = body.mutationId;
      if (flags.loseAck) {
        flags.loseAck = false;
        throw new TypeError('response lost');
      }
      return dto();
    },
    submit: async (revision) => {
      if (flags.offline) throw new TypeError('offline');
      assert.equal(revision, server.revision);
      flags.submitCalls++;
      server.status = 'SUBMITTED';
      server.revision++;
      server.submittedAt = new Date(wall).toISOString();
      return dto();
    },
  };
  const session = () => new ExamSession(dto(), 'student-one', transport, storage, clock);
  return {
    session,
    storage,
    cache,
    flags,
    transport,
    dto,
    server: () => server,
    replace: (next: ExamRun) => {
      server = next;
    },
    advance: (ms: number, monotonic = true) => {
      wall += ms;
      if (monotonic) mono += ms;
    },
    clock,
  };
}

test('Exam Player: browser draft restores responses, flags and position without caching question content', async () => {
  const f = fixture(),
    s = f.session();
  s.answer(['a']);
  s.flag();
  await s.navigate(2);
  s.answer(['b']);
  const raw = f.cache.get(draftKey('student-one', 'run-one'))!;
  assert.ok(!raw.includes('Question 1'));
  assert.ok(!raw.includes('correct'));
  const restored = f.session();
  assert.equal(restored.getSnapshot().recovered, true);
  assert.equal(restored.getSnapshot().run.currentIndex, 2);
  assert.deepEqual(restored.getSnapshot().run.responses, [['a'], [], ['b']]);
  assert.equal(restored.getSnapshot().run.flagged[0], true);
  await restored.sync();
  assert.equal(restored.getSnapshot().pending, 0);
  assert.deepEqual(f.server().responses, [['a'], [], ['b']]);
  assert.equal(f.server().flagged[0], true);
});

test('Exam Player: edits during a slow autosave, including reverting to empty, survive acknowledgement', async () => {
  const f = fixture();
  let release!: () => void, started!: () => void;
  const waitStarted = new Promise<void>((r) => {
    started = r;
  });
  const original = f.transport.save;
  let first = true;
  f.transport.save = async (body) => {
    if (first) {
      first = false;
      started();
      await new Promise<void>((r) => {
        release = r;
      });
    }
    return original(body);
  };
  const s = f.session();
  s.answer(['a']);
  const saving = s.sync();
  await waitStarted;
  s.answer([]);
  s.flag();
  release();
  await saving;
  assert.deepEqual(f.server().responses[0], []);
  assert.equal(f.server().flagged[0], true);
  assert.equal(s.getSnapshot().pending, 0);
});

test('Exam Player: offline answers and navigation queue until connection returns; cannot submit stale answers', async () => {
  const f = fixture(),
    s = f.session();
  f.flags.offline = true;
  s.answer(['a']);
  await s.navigate(1);
  s.answer(['b']);
  s.flag();
  await assert.rejects(s.sync());
  assert.equal(s.getSnapshot().offline, true);
  assert.equal(s.getSnapshot().pending, 2);
  await assert.rejects(s.submit());
  assert.equal(f.flags.submitCalls, 0);
  f.flags.offline = false;
  await s.submit();
  assert.deepEqual(f.server().responses, [['a'], ['b'], []]);
  assert.equal(f.flags.submitCalls, 1);
  assert.equal(s.getSnapshot().run.status, 'SUBMITTED');
  assert.equal(f.cache.size, 0);
});

test('Exam Player: lost acknowledgement replays the same mutation after refresh without duplicating a write', async () => {
  const f = fixture(),
    s = f.session();
  f.flags.loseAck = true;
  s.answer(['a']);
  await assert.rejects(s.sync());
  assert.equal(f.flags.saves, 1);
  const restored = f.session();
  await restored.sync();
  assert.equal(f.flags.saves, 1);
  assert.equal(restored.getSnapshot().pending, 0);
  assert.deepEqual(f.server().responses[0], ['a']);
});

test('Exam Player: replay keeps newer local edits after an ambiguous save result', async () => {
  const f = fixture(),
    s = f.session();
  f.flags.loseAck = true;
  s.answer(['a']);
  await assert.rejects(s.sync());
  s.answer(['b']);
  await s.sync();
  assert.deepEqual(f.server().responses[0], ['b']);
  assert.equal(s.getSnapshot().pending, 0);
});

test('Exam Player: another tab changing the same answer requires an explicit choice', async () => {
  const f = fixture(),
    s = f.session();
  s.answer(['a']);
  f.server().responses[0] = ['b'];
  f.server().revision++;
  await s.sync();
  assert.deepEqual(s.getSnapshot().conflicts, [0]);
  assert.deepEqual(s.getSnapshot().run.responses[0], ['a']);
  await assert.rejects(s.submit());
  assert.equal(f.flags.submitCalls, 0);
  s.resolve(0, true);
  await s.sync();
  assert.deepEqual(f.server().responses[0], ['a']);
  s.answer(['b']);
  f.server().responses[0] = [];
  f.server().revision++;
  await s.sync();
  s.resolve(0, false);
  await s.sync();
  assert.deepEqual(s.getSnapshot().run.responses[0], []);
});

test('Exam Player: flags on an independently changed answer merge without overwriting that answer', async () => {
  const f = fixture(),
    s = f.session();
  s.flag();
  f.server().responses[0] = ['b'];
  f.server().revision++;
  await s.sync();
  assert.equal(s.getSnapshot().conflicts.length, 0);
  assert.deepEqual(f.server().responses[0], ['b']);
  assert.equal(f.server().flagged[0], true);
});

test('Exam Player: sequential navigation waits for acknowledgement and recovers a lost Next result', async () => {
  const f = fixture(false),
    s = f.session();
  s.answer(['a']);
  await s.sync();
  f.flags.offline = true;
  await s.navigate(1);
  assert.equal(s.getSnapshot().run.currentIndex, 0);
  f.flags.offline = false;
  await s.sync();
  // Offline preflight never sends Next; explicitly advance after reconnecting.
  assert.equal(s.getSnapshot().run.currentIndex, 0);
  await s.navigate(1);
  assert.equal(s.getSnapshot().run.currentIndex, 1);
  s.answer(['b']);
  await s.sync();
  f.flags.loseAck = true;
  await s.navigate(2);
  const restored = f.session();
  await restored.sync();
  assert.equal(restored.getSnapshot().run.currentIndex, 2);
  assert.deepEqual(f.server().responses.slice(0, 2), [['a'], ['b']]);
  await restored.navigate(0);
  assert.equal(restored.getSnapshot().run.currentIndex, 2);
});

test('Exam Player: expiry freezes input and discards unsent changes with an explicit lost-answer count', async () => {
  const f = fixture(),
    s = f.session();
  s.answer(['a']);
  f.advance(601000);
  s.tick();
  assert.equal(s.getSnapshot().seconds, 0);
  s.answer(['b']);
  assert.deepEqual(s.getSnapshot().run.responses[0], ['a']);
  f.server().status = 'SUBMITTED';
  f.server().revision++;
  await s.sync();
  assert.equal(s.getSnapshot().lostAnswers, 1);
  assert.equal(f.cache.size, 0);
  assert.equal(f.flags.saves, 0);
  await s.sync();
  assert.equal(s.getSnapshot().lostAnswers, 1);
});

test('Exam Player: timer follows elapsed time across sleep and storage failure does not block server save', async () => {
  const f = fixture();
  const broken: DraftStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error('quota');
    },
    removeItem: () => {},
  };
  const s = new ExamSession(f.dto(), 'student-one', f.transport, broken, f.clock);
  s.answer(['a']);
  assert.equal(s.getSnapshot().storageError, true);
  await s.sync();
  assert.deepEqual(f.server().responses[0], ['a']);
  f.advance(60000, false);
  s.tick();
  assert.equal(s.getSnapshot().seconds, 540);
});

test('Exam Player: complete-answer counts ignore whitespace and incomplete multi-part responses', () => {
  const q = fixture().dto().questions[0];
  assert.equal(responseAnswered({ ...q, type: 'ESSAY' }, ['  ']), false);
  assert.equal(responseAnswered({ ...q, type: 'FILL_BLANK', blankCount: 2 }, ['yes', '']), false);
  assert.equal(responseAnswered({ ...q, type: 'FILL_BLANK', blankCount: 2 }, ['yes', 'no']), true);
  assert.equal(responseAnswered({ ...q, type: 'ORDERING' }, ['a']), false);
  assert.equal(responseAnswered({ ...q, type: 'ORDERING' }, ['b', 'a']), true);
});
