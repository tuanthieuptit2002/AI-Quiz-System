'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  MessageCircle,
  RefreshCw,
  Send,
  Sparkles,
} from 'lucide-react';
import { api, ApiError, jsonBody } from '@/lib/api';
import type { ExplanationData, ExplanationRequest } from '@/lib/explanations';
import { ErrorBox, Spinner } from '../ui';

export function QuestionExplanation({
  runId,
  index,
  pendingGrade,
}: {
  runId: string;
  index: number;
  pendingGrade: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ExplanationData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const cached = useRef<ExplanationData | null>(null);
  const pending = useRef<ExplanationRequest | null>(null);
  const reading = useRef(false);
  const sending = useRef(false);
  const path = `/exams/runs/${runId}/questions/${index}/explanation`;
  const panelId = `explanation-${runId}-${index}`;
  const receive = useCallback((value: ExplanationData) => {
    if (
      cached.current?.sourceKey === value.sourceKey &&
      (cached.current.thread?.version || 0) > (value.thread?.version || 0)
    )
      return cached.current;
    cached.current = value;
    setData(value);
    if (pending.current && pending.current.requestId === value.thread?.lastRequestId) {
      const sentQuestion = pending.current?.question;
      if (sentQuestion) setQuestion((current) => (current.trim() === sentQuestion ? '' : current));
      pending.current = null;
      setUncertain(false);
      setError('');
    }
    return value;
  }, []);
  const load = useCallback(
    async (clearError = false) => {
      if (reading.current || sending.current) return cached.current;
      reading.current = true;
      setLoading(true);
      try {
        const value = receive(
          await api<ExplanationData>(path, { signal: AbortSignal.timeout(12000) }),
        );
        if (clearError) setError('');
        return value;
      } catch (e) {
        if (e instanceof ApiError && [400, 401, 403, 404].includes(e.status)) {
          cached.current = null;
          setData(null);
          pending.current = null;
          setUncertain(false);
        }
        setError((e as Error).message);
        return null;
      } finally {
        reading.current = false;
        setLoading(false);
      }
    },
    [path, receive],
  );
  const active = !!data?.thread && ['QUEUED', 'GENERATING'].includes(data.thread.status);
  useEffect(() => {
    if (!open || (!active && !uncertain)) return;
    const refresh = () => void load();
    const interval = setInterval(refresh, 2000);
    window.addEventListener('online', refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener('online', refresh);
    };
  }, [open, active, uncertain, load]);
  async function send(body: ExplanationRequest) {
    if (sending.current) return;
    sending.current = true;
    setBusy(true);
    setError('');
    pending.current = body;
    let success = false,
      refresh = false;
    try {
      receive(
        await api<ExplanationData>(path, {
          method: 'POST',
          body: jsonBody(body),
          signal: AbortSignal.timeout(12000),
        }),
      );
      pending.current = null;
      setUncertain(false);
      success = true;
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status < 500) {
        pending.current = null;
        setUncertain(false);
        refresh = true;
      } else setUncertain(true);
    } finally {
      sending.current = false;
      setBusy(false);
    }
    if (refresh) await load();
    return success;
  }
  async function ask(text?: string, retry = false, initial = cached.current) {
    if (!initial) return;
    const body: ExplanationRequest = {
      sourceKey: initial.sourceKey,
      version: initial.thread?.version || 0,
      requestId: crypto.randomUUID(),
      ...(text ? { question: text } : {}),
      ...(retry ? { retry: true } : {}),
    };
    if (await send(body)) {
      if (text) setQuestion('');
    }
  }
  async function toggle() {
    if (open) {
      setOpen(false);
      return;
    }
    setOpen(true);
    const value = await load(true);
    if (value?.configured && !value.thread && !pending.current) await ask(undefined, false, value);
  }
  const turns = data?.thread?.turns || [],
    last = turns.at(-1);
  const full = turns.length >= (data?.limits.maxTurns || 8);
  const disabled = busy || loading || active || uncertain || !data?.configured;
  return (
    <div className={`xe-section ${open ? 'is-open' : ''}`}>
      <button
        className="xe-trigger"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        disabled={loading && !open}
      >
        <span className="xe-trigger-icon">
          <Sparkles size={18} />
        </span>
        <span>
          <b>Explain with AI</b>
          <small>Hiểu đáp án, hỏi tiếp điều bạn chưa rõ</small>
        </span>
        {open ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
      </button>
      {open && (
        <div className="xe-panel" id={panelId}>
          <header className="xe-heading">
            <div>
              <span className="xe-orb">
                <Sparkles size={20} />
              </span>
              <div>
                <b>Trợ lý học tập</b>
                <span>Câu {index + 1} · Giải thích cùng DeepSeek</span>
              </div>
            </div>
            <span className="xe-conversation-label">
              <MessageCircle size={13} /> {turns.length} / {data?.limits.maxTurns || 8} lượt
            </span>
          </header>
          <p className="xe-policy">
            {pendingGrade
              ? 'Teacher chưa chấm xong câu này. AI giúp bạn hiểu kiến thức, không quyết định điểm.'
              : 'Giải thích giúp bạn ôn tập. Điểm và nhận xét chính thức vẫn do hệ thống và Teacher quyết định.'}
          </p>
          {loading && !data && (
            <div className="xe-loading">
              <Spinner /> Đang mở hội thoại…
            </div>
          )}
          <ErrorBox message={error} retry={() => void load(true)} />
          {uncertain && (
            <div className="xe-reconnect">
              <p>
                Chưa xác nhận được yêu cầu đã gửi. Bạn có thể kết nối lại và gửi lại cùng yêu cầu.
              </p>
              <button
                className="btn btn-secondary small"
                disabled={busy}
                onClick={() => {
                  if (pending.current) void send(pending.current);
                }}
              >
                <RefreshCw size={14} /> Gửi lại yêu cầu
              </button>
            </div>
          )}
          {data && !data.configured && (
            <p className="xe-empty">
              Trợ lý AI chưa được cấu hình. Bạn vẫn có thể xem đáp án và giải thích của Teacher ở
              phía trên.
            </p>
          )}
          <div className="xe-conversation" aria-label={`Hội thoại giải thích câu ${index + 1}`}>
            {turns.map((turn, position) => (
              <div className="xe-turn" key={turn.id}>
                <div className="xe-student">
                  <span>BẠN</span>
                  <p>{turn.question}</p>
                </div>
                <div className="xe-assistant">
                  <span className="xe-ai-name">
                    <Sparkles size={14} /> QUIZSPACE AI
                  </span>
                  {turn.status === 'PENDING' && (
                    <div className="xe-loading" role="status">
                      <Spinner />
                      <span>
                        {data?.thread?.status === 'QUEUED'
                          ? 'Đang chờ giải thích…'
                          : 'Đang đối chiếu bài làm và giải thích…'}
                        <small>Bạn có thể thu gọn hoặc mở lại sau.</small>
                      </span>
                    </div>
                  )}
                  {turn.status === 'FAILED' && (
                    <div className="xe-failed">
                      <p>{turn.error}</p>
                      {position === turns.length - 1 &&
                        turn.attempts < (data?.limits.maxAttempts || 3) && (
                          <button
                            className="btn btn-secondary small"
                            disabled={disabled}
                            onClick={() => void ask(undefined, true)}
                          >
                            <RefreshCw size={14} /> Thử tạo lại
                          </button>
                        )}
                    </div>
                  )}
                  {turn.reply && (
                    <>
                      <p className="xe-explanation">{turn.reply.explanation}</p>
                      <div className="xe-takeaway">
                        <Lightbulb size={18} />
                        <div>
                          <b>Điều cần nhớ</b>
                          <p>{turn.reply.takeaway}</p>
                        </div>
                      </div>
                      {turn.reply.practice && (
                        <div className="xe-practice">
                          <BookOpen size={16} />
                          <div>
                            <b>Thử vận dụng</b>
                            <p>{turn.reply.practice}</p>
                          </div>
                        </div>
                      )}
                      {turn.reply.caveat && <p className="xe-caveat">{turn.reply.caveat}</p>}
                      <small className="xe-time">
                        {turn.answeredAt && new Date(turn.answeredAt).toLocaleString('vi-VN')}
                      </small>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
          {data?.configured && !data.thread && (
            <div className="xe-empty">
              <p>
                Giải thích dựa trên đáp án và kết quả hiện tại. Nếu Teacher vừa sửa điểm, một hội
                thoại mới sẽ được mở.
              </p>
              <button
                className="btn btn-secondary small"
                disabled={disabled}
                onClick={() => void ask()}
              >
                <Sparkles size={15} /> Tạo giải thích
              </button>
            </div>
          )}
          {last?.reply && !full && (
            <div className="xe-suggestions">
              {last.reply.followUps.map((text, i) => (
                <button key={i} disabled={disabled} onClick={() => void ask(text)}>
                  <MessageCircle size={13} /> {text}
                </button>
              ))}
            </div>
          )}
          {data?.thread && !full && (
            <form
              className="xe-composer"
              onSubmit={(event) => {
                event.preventDefault();
                if (!disabled && question.trim()) void ask(question.trim());
              }}
            >
              <label htmlFor={`${panelId}-question`}>Bạn muốn hiểu rõ thêm điều gì?</label>
              <div>
                <textarea
                  id={`${panelId}-question`}
                  aria-label={`Hỏi tiếp về câu ${index + 1}`}
                  maxLength={data.limits.maxQuestionChars}
                  rows={2}
                  value={question}
                  disabled={disabled}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="Ví dụ: Vì sao đáp án tôi chọn chưa đúng?"
                />
                <button
                  className="btn btn-primary"
                  disabled={disabled || !question.trim()}
                  type="submit"
                >
                  {busy ? <Spinner /> : <Send size={16} />} Hỏi tiếp
                </button>
              </div>
              <footer>
                <span>Nội dung câu hỏi và bài làm được gửi đến DeepSeek khi bạn yêu cầu.</span>
                <span>
                  {question.length}/{data.limits.maxQuestionChars}
                </span>
              </footer>
            </form>
          )}
          {full && (
            <p className="xe-limit">
              Đã đủ {data?.limits.maxTurns} lượt trao đổi cho câu này. Bạn có thể đọc lại hội thoại
              hoặc hỏi Teacher nếu còn thắc mắc.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
