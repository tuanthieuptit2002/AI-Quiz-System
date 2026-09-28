'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, jsonBody } from '@/lib/api';
import type { LearningOverview, LearningRange } from '@/lib/learning';

export function useLearningAnalysis(range: LearningRange) {
  const [data, setData] = useState<LearningOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const request = useRef<{
    range: LearningRange;
    sourceKey: string;
    requestId: string;
    retry: boolean;
  } | null>(null);
  const sequence = useRef(0);
  const sendingRef = useRef(false);
  const invalidate = useCallback(() => { sequence.current++; }, []);
  const receive = useCallback((value: LearningOverview) => {
    setData(value);
    setError('');
    if (
      request.current &&
      (value.report || value.snapshot.sourceKey !== request.current.sourceKey)
    ) {
      request.current = null;
      setUncertain(false);
    }
  }, []);
  const reload = useCallback(async () => {
    const id = ++sequence.current;
    try {
      const result = await api<LearningOverview>(`/student/learning-analysis?range=${range}`, {
        signal: AbortSignal.timeout(12000),
      });
      if (id === sequence.current) receive(result);
    } catch (e) {
      if (id === sequence.current) {
        setError(
          e instanceof ApiError ? e.message : 'Chưa kết nối được máy chủ. Bạn có thể tải lại.',
        );
        if (e instanceof ApiError && [401, 403].includes(e.status)) setData(null);
      }
    } finally {
      if (id === sequence.current) setLoading(false);
    }
  }, [range, receive]);
  const active = data?.report?.status === 'QUEUED' || data?.report?.status === 'GENERATING';
  useEffect(() => {
    const initial = setTimeout(() => void reload(), 0);
    window.addEventListener('online', reload);
    window.addEventListener('focus', reload);
    return () => {
      clearTimeout(initial);
      invalidate();
      window.removeEventListener('online', reload);
      window.removeEventListener('focus', reload);
    };
  }, [reload, invalidate]);
  useEffect(() => {
    if (!active && !uncertain) return;
    const timer = setInterval(() => void reload(), 2500);
    return () => clearInterval(timer);
  }, [active, uncertain, reload]);
  const generate = async () => {
    if (!data || sendingRef.current || active) return;
    sendingRef.current = true;
    setSending(true);
    setError('');
    const body = request.current || {
      range,
      sourceKey: data.snapshot.sourceKey,
      requestId: crypto.randomUUID(),
      retry: data.report?.status === 'FAILED',
    };
    request.current = body;
    const id = ++sequence.current;
    try {
      const result = await api<LearningOverview>('/student/learning-analysis', {
        method: 'POST',
        body: jsonBody(body),
        signal: AbortSignal.timeout(12000),
      });
      if (id === sequence.current) receive(result);
      request.current = null;
      setUncertain(false);
      // A GET may have overtaken the POST while a previous request was being reconciled.
      if (id !== sequence.current) void reload();
    } catch (e) {
      if (!(e instanceof ApiError) || e.status >= 500) {
        setUncertain(true);
        setError('Chưa nhận được xác nhận. Đang kiểm tra lại; gửi lại sẽ dùng cùng yêu cầu.');
      } else {
        request.current = null;
        setUncertain(false);
        setError(e.message);
        if (e.status === 409) void reload();
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };
  return { data, loading, sending, active, uncertain, error, reload, generate };
}
