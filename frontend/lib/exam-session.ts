import type { ExamRun, RunQuestion } from './exams';

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export interface SaveAnswer {
  revision: number;
  index: number;
  response: string[];
  flagged: boolean;
  nextIndex: number;
  mutationId: string;
}
export interface ExamTransport {
  read(): Promise<ExamRun>;
  save(body: SaveAnswer): Promise<ExamRun>;
  submit(revision: number): Promise<ExamRun>;
}
interface DraftEntry {
  questionId: string;
  baseResponse: string[];
  response: string[];
  baseFlag: boolean;
  flagged: boolean;
  responseTouched: boolean;
  flagTouched: boolean;
}
interface Cache {
  schema: 1;
  runId: string;
  ownerId: string;
  expiresAt: string;
  index: number;
  entries: Record<number, DraftEntry>;
  mutation: SaveAnswer | null;
}
export interface ExamSessionState {
  run: ExamRun;
  pending: number;
  syncing: boolean;
  moving: boolean;
  offline: boolean;
  error: string;
  storageError: boolean;
  recovered: boolean;
  conflicts: number[];
  lostAnswers: number;
  seconds: number;
  lastSavedAt: string | null;
}
const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
const statusOf = (e: unknown) => (e as { status?: number })?.status;
const validResponse = (value: unknown): value is string[] =>
  Array.isArray(value) &&
  value.length <= 30 &&
  value.every((s) => typeof s === 'string' && s.length <= 20000);
export const draftKey = (ownerId: string, runId: string) => `quizspace:exam:v1:${ownerId}:${runId}`;
export function responseAnswered(q: RunQuestion, response: string[]) {
  const count = response.filter((s) => s.trim()).length;
  if (q.type === 'FILL_BLANK') return count === q.blankCount && count > 0;
  if (q.type === 'MATCHING') return count === q.left.length && count > 0;
  if (q.type === 'ORDERING') return count === q.options.length && count > 0;
  return count > 0;
}

/** Serialized writes + a per-tab outbox survive refresh and ambiguous network failures.
 * Server deadlines/revisions remain authoritative; never use client time to extend an exam. */
export class ExamSession {
  private remote: ExamRun;
  private cache: Cache;
  private listeners = new Set<() => void>();
  private inFlight: Promise<void> | null = null;
  private conflicts = new Set<number>();
  private anchor: { server: number; monotonic: number; wall: number };
  private state: ExamSessionState;
  private storage: DraftStorage | null;
  constructor(
    initial: ExamRun,
    ownerId: string,
    private transport: ExamTransport,
    storage: DraftStorage | null,
    private time = { now: () => Date.now(), monotonic: () => performance.now() },
  ) {
    this.remote = initial;
    this.storage = storage;
    this.anchor = {
      server: Date.parse(initial.serverTime),
      monotonic: time.monotonic(),
      wall: time.now(),
    };
    this.cache = {
      schema: 1,
      runId: initial.id,
      ownerId,
      expiresAt: initial.expiresAt,
      index: initial.currentIndex,
      entries: {},
      mutation: null,
    };
    this.state = {
      run: initial,
      pending: 0,
      syncing: false,
      moving: false,
      offline: false,
      error: '',
      storageError: !storage,
      recovered: false,
      conflicts: [],
      lostAnswers: 0,
      seconds: this.remaining(),
      lastSavedAt: null,
    };
    try {
      const raw = storage?.getItem(draftKey(ownerId, initial.id));
      if (raw && raw.length < 8 * 1024 * 1024) {
        const saved = JSON.parse(raw) as Cache;
        const valid =
          saved.schema === 1 &&
          saved.ownerId === ownerId &&
          saved.runId === initial.id &&
          saved.expiresAt === initial.expiresAt &&
          Number.isInteger(saved.index) &&
          saved.index >= 0 &&
          saved.index < initial.questionCount &&
          saved.entries &&
          Object.entries(saved.entries).every(
            ([index, entry]) =>
              initial.questions[Number(index)]?.id === entry.questionId &&
              validResponse(entry.response) &&
              validResponse(entry.baseResponse) &&
              typeof entry.flagged === 'boolean' &&
              typeof entry.baseFlag === 'boolean' &&
              typeof entry.responseTouched === 'boolean' &&
              typeof entry.flagTouched === 'boolean',
          ) &&
          (!saved.mutation ||
            (Number.isInteger(saved.mutation.index) &&
              !!initial.questions[saved.mutation.index] &&
              Number.isInteger(saved.mutation.revision) &&
              Number.isInteger(saved.mutation.nextIndex) &&
              saved.mutation.nextIndex >= 0 &&
              saved.mutation.nextIndex < initial.questionCount &&
              validResponse(saved.mutation.response) &&
              typeof saved.mutation.flagged === 'boolean' &&
              typeof saved.mutation.mutationId === 'string' &&
              /^[\da-f-]{36}$/i.test(saved.mutation.mutationId)));
        if (valid) {
          this.cache = saved;
          this.state.recovered = !!Object.keys(saved.entries).length;
        }
      }
    } catch {
      this.state.storageError = true;
    }
    // A pending request may already be committed. Reconcile it before replaying.
    if (
      !this.cache.mutation ||
      initial.lastMutationId === this.cache.mutation.mutationId ||
      initial.status !== 'RUNNING'
    )
      this.accept(initial);
    else this.emit();
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.state;
  private remaining() {
    const elapsed = Math.max(
      0,
      this.time.monotonic() - this.anchor.monotonic,
      this.time.now() - this.anchor.wall,
    );
    return Math.max(
      0,
      Math.ceil((Date.parse(this.remote.expiresAt) - this.anchor.server - elapsed) / 1000),
    );
  }
  private persist() {
    try {
      if (!this.storage) throw new Error();
      const key = draftKey(this.cache.ownerId, this.cache.runId);
      if (this.remote.status !== 'RUNNING') this.storage.removeItem(key);
      else this.storage.setItem(key, JSON.stringify(this.cache));
      this.state.storageError = false;
    } catch {
      this.state.storageError = true;
    }
  }
  private emit() {
    const responses = this.remote.responses.map((r) => [...r]),
      flagged = [...this.remote.flagged],
      answered = [...this.remote.answered];
    for (const [key, entry] of Object.entries(this.cache.entries)) {
      const i = Number(key);
      if (!this.remote.questions[i].locked) {
        responses[i] = entry.response;
        answered[i] = responseAnswered(this.remote.questions[i], entry.response);
      }
      flagged[i] = entry.flagged;
    }
    this.state = {
      ...this.state,
      run: {
        ...this.remote,
        responses,
        flagged,
        answered,
        currentIndex: this.remote.settings.allowBack ? this.cache.index : this.remote.currentIndex,
      },
      pending: Object.keys(this.cache.entries).length,
      conflicts: [...this.conflicts],
      seconds: this.remaining(),
    };
    this.listeners.forEach((listener) => listener());
  }
  tick = () => {
    this.emit();
  };
  offline = () => {
    this.state.offline = true;
    this.emit();
  };
  private entry(index: number): DraftEntry {
    return (this.cache.entries[index] ||= {
      questionId: this.remote.questions[index].id,
      baseResponse: [...this.remote.responses[index]],
      response: [...this.remote.responses[index]],
      baseFlag: this.remote.flagged[index],
      flagged: this.remote.flagged[index],
      responseTouched: false,
      flagTouched: false,
    });
  }
  answer = (response: string[]) => {
    if (this.remote.status !== 'RUNNING' || !this.remaining() || this.state.moving) return;
    const entry = this.entry(this.state.run.currentIndex);
    entry.response = [...response];
    entry.responseTouched = true;
    this.persist();
    this.emit();
  };
  flag = () => {
    if (this.remote.status !== 'RUNNING' || !this.remaining() || this.state.moving) return;
    const entry = this.entry(this.state.run.currentIndex);
    entry.flagged = !entry.flagged;
    entry.flagTouched = true;
    this.persist();
    this.emit();
  };
  private accept(next: ExamRun, acknowledged?: SaveAnswer) {
    if (next.revision < this.remote.revision) return;
    const mutation =
      acknowledged ||
      (next.lastMutationId === this.cache.mutation?.mutationId ? this.cache.mutation! : undefined);
    this.remote = next;
    this.anchor = {
      server: Date.parse(next.serverTime),
      monotonic: this.time.monotonic(),
      wall: this.time.now(),
    };
    this.state.offline = false;
    this.state.error = '';
    this.conflicts.clear();
    if (next.status !== 'RUNNING') {
      this.state.lostAnswers = Math.max(
        this.state.lostAnswers,
        Object.entries(this.cache.entries).filter(
          ([index, e]) => e.responseTouched && !same(e.response, next.responses[Number(index)]),
        ).length,
      );
      this.cache.entries = {};
      this.cache.mutation = null;
    } else {
      for (const [key, entry] of Object.entries(this.cache.entries)) {
        const i = Number(key),
          own = mutation?.index === i;
        if (next.questions[i].locked) {
          if (own) delete this.cache.entries[i];
          else this.conflicts.add(i);
          continue;
        }
        const response = next.responses[i],
          flagged = next.flagged[i];
        if (entry.responseTouched && !same(response, entry.response)) {
          if (own || same(response, entry.baseResponse)) entry.baseResponse = [...response];
          else this.conflicts.add(i);
        } else {
          entry.response = [...response];
          entry.baseResponse = [...response];
          entry.responseTouched = false;
        }
        if (!entry.flagTouched || entry.flagged === flagged) {
          entry.flagged = flagged;
          entry.flagTouched = false;
        }
        entry.baseFlag = flagged;
        if (!entry.responseTouched && !entry.flagTouched) delete this.cache.entries[i];
      }
    }
    if (mutation) this.cache.mutation = null;
    if (!next.settings.allowBack) this.cache.index = next.currentIndex;
    this.persist();
    this.emit();
  }
  resolve = (index: number, useLocal: boolean) => {
    const entry = this.cache.entries[index];
    if (!entry || !this.conflicts.has(index)) return;
    if (useLocal && !this.remote.questions[index].locked) {
      entry.baseResponse = [...this.remote.responses[index]];
      entry.baseFlag = this.remote.flagged[index];
    } else delete this.cache.entries[index];
    this.conflicts.delete(index);
    this.persist();
    this.emit();
  };
  private async write(body: SaveAnswer) {
    this.cache.mutation = body;
    this.persist();
    try {
      const next = await this.transport.save(body);
      this.accept(next, next.lastMutationId === body.mutationId ? body : undefined);
      this.cache.mutation = null;
      this.state.lastSavedAt = new Date(this.time.now()).toISOString();
      this.persist();
    } catch (error) {
      if ([400, 403, 409].includes(statusOf(error) || 0)) {
        this.cache.mutation = null;
        this.persist();
        await this.refresh();
        // Revision conflicts on independent questions are safe to rebase; conflicts on the
        // same answer stay blocked until the student chooses a version.
        if (statusOf(error) === 409) return;
      }
      throw error;
    }
  }
  private async refresh() {
    this.accept(await this.transport.read());
  }
  sync = (): Promise<void> => {
    if (this.inFlight) return this.inFlight;
    const task = async () => {
      this.state.syncing = true;
      this.emit();
      try {
        // Replay with the same mutation ID before reading. The first response may have
        // been lost after MongoDB committed, including a sequential Next operation.
        if (this.cache.mutation) await this.write(this.cache.mutation);
        await this.refresh();
        let writes = 0;
        while (this.remote.status === 'RUNNING' && this.remaining() && writes++ < 110) {
          const index = Object.keys(this.cache.entries)
            .map(Number)
            .find((i) => !this.conflicts.has(i));
          if (index === undefined) break;
          const entry = this.cache.entries[index];
          await this.write({
            index,
            response: [...entry.response],
            flagged: entry.flagged,
            revision: this.remote.revision,
            nextIndex: this.remote.settings.allowBack ? this.cache.index : index,
            mutationId: crypto.randomUUID(),
          });
        }
        if (this.conflicts.size)
          this.state.error =
            'Có đáp án khác nhau giữa các tab. Chọn bản cần giữ để tiếp tục đồng bộ.';
      } catch (error) {
        this.state.offline = !statusOf(error) || (statusOf(error) || 0) >= 500;
        this.state.error = this.state.offline
          ? 'Chưa kết nối được máy chủ. Đáp án sẽ tự đồng bộ khi kết nối trở lại.'
          : (error as Error).message;
        throw error;
      } finally {
        this.state.syncing = false;
        this.emit();
      }
    };
    this.inFlight = task().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  };
  navigate = async (index: number) => {
    if (
      this.remote.status !== 'RUNNING' ||
      !this.remaining() ||
      this.state.moving ||
      index < 0 ||
      index >= this.remote.questionCount
    )
      return;
    if (this.remote.settings.allowBack) {
      this.cache.index = index;
      this.persist();
      this.emit();
      return;
    }
    if (index !== this.remote.currentIndex + 1) return;
    this.state.moving = true;
    this.emit();
    try {
      await this.sync();
      if (
        this.conflicts.size ||
        this.remote.status !== 'RUNNING' ||
        index !== this.remote.currentIndex + 1
      )
        return;
      const i = this.remote.currentIndex;
      await this.write({
        index: i,
        response: this.remote.responses[i],
        flagged: this.remote.flagged[i],
        revision: this.remote.revision,
        nextIndex: index,
        mutationId: crypto.randomUUID(),
      });
    } catch (error) {
      this.state.error = (error as Error).message;
    } finally {
      this.state.moving = false;
      this.emit();
    }
  };
  submit = async () => {
    if (this.state.moving) return;
    this.state.moving = true;
    this.emit();
    try {
      await this.sync();
      if (this.remote.status !== 'RUNNING') return;
      if (this.conflicts.size || Object.keys(this.cache.entries).length)
        throw new Error('Cần đồng bộ tất cả đáp án trước khi nộp.');
      try {
        this.accept(await this.transport.submit(this.remote.revision));
      } catch (error) {
        if (statusOf(error) === 409) await this.refresh();
        throw error;
      }
    } catch (error) {
      this.state.error = (error as Error).message;
      throw error;
    } finally {
      this.state.moving = false;
      this.emit();
    }
  };
}
