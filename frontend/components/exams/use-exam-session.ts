'use client';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { api, jsonBody } from '@/lib/api';
import type { ExamRun } from '@/lib/exams';
import { ExamSession, type DraftStorage } from '@/lib/exam-session';

export function useExamSession(initial: ExamRun, ownerId: string) {
  const [session] = useState(() => {
    let latest = initial,
      storage: DraftStorage | null = null;
    try {
      storage = sessionStorage;
    } catch {
      /* Private mode may deny browser storage. */
    }
    const request = async (path: string, options: RequestInit = {}) => {
      const value = await api<Omit<ExamRun, 'questions'> & { questions?: ExamRun['questions'] }>(
        path,
        { ...options, signal: AbortSignal.timeout(12000) },
      );
      latest = { ...value, questions: value.questions || latest.questions };
      return latest;
    };
    return new ExamSession(
      initial,
      ownerId,
      {
        read: () => request(`/exams/runs/${initial.id}?lean=1`),
        save: (body) =>
          request(`/exams/runs/${initial.id}?lean=1`, { method: 'PATCH', body: jsonBody(body) }),
        submit: (revision) =>
          request(`/exams/runs/${initial.id}/submit`, {
            method: 'POST',
            body: jsonBody({ revision }),
          }),
      },
      storage,
    );
  });
  const state = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
  useEffect(() => {
    if (state.run.status !== 'RUNNING') return;
    const sync = () => {
      if (session.getSnapshot().moving) return;
      void session.sync().catch(() => {});
    };
    const offline = () => session.offline();
    const visible = () => {
      if (document.visibilityState === 'visible') {
        session.tick();
        sync();
      }
    };
    const before = (event: BeforeUnloadEvent) => event.preventDefault();
    const retry = setInterval(sync, 5000),
      timer = setInterval(session.tick, 1000);
    window.addEventListener('online', sync);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('beforeunload', before);
    sync();
    return () => {
      clearInterval(retry);
      clearInterval(timer);
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('beforeunload', before);
    };
  }, [session, state.run.status]);
  useEffect(() => {
    if (
      !state.pending ||
      state.moving ||
      state.syncing ||
      state.offline ||
      state.error ||
      state.run.status !== 'RUNNING'
    )
      return;
    const timer = setTimeout(() => void session.sync().catch(() => {}), 650);
    return () => clearTimeout(timer);
  }, [
    session,
    state.run.responses,
    state.run.flagged,
    state.pending,
    state.moving,
    state.syncing,
    state.offline,
    state.error,
    state.run.status,
  ]);
  return { session, ...state };
}
