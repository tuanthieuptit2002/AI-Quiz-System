'use client';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Send,
  ShieldCheck,
} from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { runStatusLabels, type ExamRun, type RunQuestion } from '@/lib/exams';
import { typeLabels } from '@/lib/questions';
import { ErrorBox, Spinner } from '../ui';

function AnswerInput({
  q,
  response,
  onChange,
  disabled,
}: {
  q: RunQuestion;
  response: string[];
  onChange: (value: string[]) => void;
  disabled: boolean;
}) {
  if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(q.type))
    return (
      <div className="exam-answer-options">
        {q.options.map((option) => (
          <label key={option.id} className={response.includes(option.id) ? 'selected' : ''}>
            <input
              disabled={disabled}
              type={q.type === 'MULTIPLE_CHOICE' ? 'checkbox' : 'radio'}
              name={q.id}
              checked={response.includes(option.id)}
              onChange={(e) =>
                onChange(
                  q.type !== 'MULTIPLE_CHOICE'
                    ? [option.id]
                    : e.target.checked
                      ? [...response, option.id]
                      : response.filter((id) => id !== option.id),
                )
              }
            />
            <span>{option.text}</span>
          </label>
        ))}
      </div>
    );
  if (q.type === 'FILL_BLANK')
    return (
      <div className="stack-form">
        {Array.from({ length: q.blankCount }, (_, i) => (
          <label className="field" key={i}>
            <span>Chỗ trống {i + 1}</span>
            <input
              disabled={disabled}
              value={response[i] || ''}
              maxLength={1000}
              onChange={(e) => {
                const next = Array.from({ length: q.blankCount }, (_, n) => response[n] || '');
                next[i] = e.target.value;
                onChange(next);
              }}
            />
          </label>
        ))}
      </div>
    );
  if (q.type === 'MATCHING')
    return (
      <div className="exam-match-input">
        {q.left.map((left, i) => (
          <label key={left.id}>
            <b>{left.text}</b>
            <span>→</span>
            <select
              disabled={disabled}
              aria-label={`Ghép ${left.text}`}
              value={response[i] || ''}
              onChange={(e) => {
                const next = Array.from({ length: q.left.length }, (_, n) => response[n] || '');
                next[i] = e.target.value;
                onChange(next);
              }}
            >
              <option value="">Chọn vế tương ứng</option>
              {q.options.map((o) => (
                <option
                  value={o.id}
                  key={o.id}
                  disabled={response.includes(o.id) && response[i] !== o.id}
                >
                  {o.text}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
    );
  if (q.type === 'ORDERING') {
    const ids = response.length === q.options.length ? response : q.options.map((o) => o.id);
    const move = (i: number, direction: number) => {
      const next = [...ids];
      [next[i], next[i + direction]] = [next[i + direction], next[i]];
      onChange(next);
    };
    return (
      <div className="exam-order-input">
        <p>Sắp xếp từ trên xuống dưới. Bấm “Xác nhận thứ tự” nếu không cần đổi.</p>
        {ids.map((id, i) => (
          <div key={id}>
            <span>{i + 1}</span>
            <b>{q.options.find((o) => o.id === id)?.text}</b>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Mục ${i + 1} lên`}
              disabled={disabled || i === 0}
              onClick={() => move(i, -1)}
            >
              <ArrowUp size={17} />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label={`Mục ${i + 1} xuống`}
              disabled={disabled || i === ids.length - 1}
              onClick={() => move(i, 1)}
            >
              <ArrowDown size={17} />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-secondary small"
          disabled={disabled}
          onClick={() => onChange(ids)}
        >
          Xác nhận thứ tự
        </button>
      </div>
    );
  }
  return (
    <textarea
      aria-label={q.type === 'ESSAY' ? 'Bài tự luận' : 'Câu trả lời ngắn'}
      disabled={disabled}
      rows={q.type === 'ESSAY' ? 10 : 3}
      maxLength={q.type === 'ESSAY' ? 20000 : 1000}
      placeholder="Nhập câu trả lời của bạn…"
      value={response[0] || ''}
      onChange={(e) => onChange([e.target.value])}
    />
  );
}
function readable(q: RunQuestion, values: string[]) {
  return values
    .map(
      (v, i) =>
        `${q.type === 'MATCHING' ? `${q.left[i]?.text} → ` : ''}${q.options.find((o) => o.id === v)?.text || v || '(trống)'}`,
    )
    .join(q.type === 'ORDERING' ? ' → ' : '\n');
}
export function RunResult({
  run,
  close,
  teacher = false,
  changed,
}: {
  run: ExamRun;
  close: () => void;
  teacher?: boolean;
  changed?: (value: ExamRun) => void;
}) {
  const [grades, setGrades] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function grade() {
    setBusy(true);
    setError('');
    try {
      const entries = run.questions.flatMap((q, index) =>
        q.type === 'ESSAY' && (grades[index] ?? String(run.awarded[index] ?? '')) !== ''
          ? [
              {
                index,
                points: Number(grades[index] ?? run.awarded[index]),
                feedback: feedback[index] ?? run.feedback[index] ?? '',
              },
            ]
          : [],
      );
      if (!entries.length) throw new Error('Nhập điểm cho ít nhất một câu tự luận.');
      changed?.(
        await api<ExamRun>(`/exams/${run.examId}/submissions/${run.id}/grade`, {
          method: 'POST',
          body: jsonBody({ revision: run.revision, grades: entries }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="exam-result">
      <div className="exam-result-heading">
        <button className="btn btn-secondary" onClick={close}>
          <ArrowLeft size={16} /> Quay lại
        </button>
        <span className={`qb-badge ${run.passed ? 'difficulty-easy' : 'difficulty-medium'}`}>
          {runStatusLabels[run.status]}
        </span>
      </div>
      <section className="panel exam-result-summary">
        <CheckCircle2 size={40} />
        <div>
          <h1>{run.title}</h1>
          <p>
            {run.studentName} · Lượt {run.attemptNo}
          </p>
        </div>
        <div className="exam-result-score">
          <strong>{run.scorePercent === null ? '—' : `${run.scorePercent}%`}</strong>
          <span>
            {run.status === 'PENDING_REVIEW'
              ? 'Đang chờ chấm tự luận'
              : run.status === 'EXPIRED'
                ? 'Hết giờ khi chưa nộp bài'
                : run.passed
                  ? 'Đạt yêu cầu'
                  : run.passed === false
                    ? 'Chưa đạt'
                    : 'Đang làm bài'}
          </span>
        </div>
      </section>
      {!run.settings.showAnswers && !teacher && (
        <p className="exam-result-note">Đề thi này không công khai đáp án sau khi nộp.</p>
      )}
      <div className="exam-review-list">
        {run.questions.map(
          (q, i) =>
            !q.locked && (
              <section className="panel exam-review-item" key={q.id}>
                <div className="exam-review-label">
                  <b>
                    Câu {i + 1} · {typeLabels[q.type]}
                  </b>
                  <span>
                    {run.awarded[i] === null ? 'Chờ chấm' : (run.awarded[i] ?? '—')} / {q.points}{' '}
                    điểm
                  </span>
                </div>
                <h3>{q.question}</h3>
                {q.image && (
                  <Image
                    className="question-image"
                    src={q.image}
                    alt={q.imageAlt}
                    width={1000}
                    height={600}
                    unoptimized
                  />
                )}
                <div className="exam-response-text">
                  <small>BÀI LÀM</small>
                  <p>{readable(q, run.responses[i]) || 'Chưa trả lời'}</p>
                </div>
                {q.correct && (
                  <div className="answer-explanation">
                    <b>{q.type === 'ESSAY' ? 'Hướng dẫn chấm' : 'Đáp án đúng'}</b>
                    <p>{q.type === 'ESSAY' ? q.rubric : readable(q, q.correct)}</p>
                    {q.explanation && <p>{q.explanation}</p>}
                  </div>
                )}
                {run.feedback[i] && <p className="exam-result-note">Nhận xét: {run.feedback[i]}</p>}
                {teacher &&
                  q.type === 'ESSAY' &&
                  ['PENDING_REVIEW', 'SUBMITTED'].includes(run.status) && (
                    <div className="exam-grade-fields">
                      <label className="field">
                        <span>Điểm tự luận (tối đa {q.points})</span>
                        <input
                          type="number"
                          min={0}
                          max={q.points}
                          step="0.1"
                          value={
                            grades[i] ?? (run.awarded[i] === null ? '' : String(run.awarded[i]))
                          }
                          onChange={(e) => setGrades({ ...grades, [i]: e.target.value })}
                        />
                      </label>
                      <label className="field">
                        <span>Nhận xét</span>
                        <textarea
                          rows={2}
                          maxLength={2000}
                          value={feedback[i] ?? run.feedback[i] ?? ''}
                          onChange={(e) => setFeedback({ ...feedback, [i]: e.target.value })}
                        />
                      </label>
                    </div>
                  )}
              </section>
            ),
        )}
      </div>
      <ErrorBox message={error} />
      {teacher &&
        run.questions.some((q) => q.type === 'ESSAY') &&
        ['PENDING_REVIEW', 'SUBMITTED'].includes(run.status) && (
          <div className="qb-editor-footer">
            <button className="btn btn-primary" disabled={busy} onClick={grade}>
              {busy ? <Spinner /> : <CheckCircle2 size={16} />} Lưu điểm tự luận
            </button>
          </div>
        )}
    </div>
  );
}

export function ExamPlayer({ initial, close }: { initial: ExamRun; close: () => void }) {
  const [run, setRun] = useState(initial);
  const current = useRef(initial);
  const [draft, setDraft] = useState(initial.responses[initial.currentIndex]);
  const draftRef = useRef(draft);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(
    Math.max(0, Math.ceil((Date.parse(initial.expiresAt) - Date.parse(initial.serverTime)) / 1000)),
  );
  const queue = useRef<Promise<void>>(Promise.resolve());
  const checking = useRef(false);
  const clockAnchor = useRef({
    serverTime: Date.parse(initial.serverTime),
    clientTime: 0,
  });
  useEffect(() => {
    clockAnchor.current.clientTime = performance.now();
  }, []);
  const accept = useCallback((value: ExamRun, replaceDraft = false) => {
    clockAnchor.current = {
      serverTime: Date.parse(value.serverTime),
      clientTime: performance.now(),
    };
    current.current = value;
    setRun(value);
    if (replaceDraft) {
      draftRef.current = value.responses[value.currentIndex];
      setDraft(draftRef.current);
      setDirty(false);
    }
  }, []);
  const save = useCallback(
    (nextIndex?: number) => {
      const index = current.current.currentIndex;
      const response = [...draftRef.current];
      const task = queue.current.then(async () => {
        if (current.current.status !== 'RUNNING') return;
        setSaving(true);
        try {
          const responseState = await api<
            Omit<ExamRun, 'questions'> & { questions?: ExamRun['questions'] }
          >(`/exams/runs/${current.current.id}?lean=1`, {
            method: 'PATCH',
            body: jsonBody({
              index,
              response,
              revision: current.current.revision,
              ...(nextIndex !== undefined ? { nextIndex } : {}),
            }),
          });
          const value: ExamRun = {
            ...responseState,
            questions: responseState.questions || current.current.questions,
          };
          accept(value, nextIndex !== undefined || value.status !== 'RUNNING');
          if (JSON.stringify(draftRef.current) === JSON.stringify(response)) setDirty(false);
          setError('');
        } finally {
          setSaving(false);
        }
      });
      queue.current = task.catch((e) => {
        setError((e as Error).message);
      });
      return task;
    },
    [accept],
  );
  useEffect(() => {
    if (!dirty || moving || run.status !== 'RUNNING') return;
    const timer = setTimeout(() => {
      void save().catch(() => {});
    }, 650);
    return () => clearTimeout(timer);
  }, [draft, dirty, moving, run.status, save]);
  useEffect(() => {
    if (run.status !== 'RUNNING') return;
    const tick = () => {
      const left = Math.max(
        0,
        Math.ceil(
          (Date.parse(run.expiresAt) -
            clockAnchor.current.serverTime -
            (performance.now() - clockAnchor.current.clientTime)) /
            1000,
        ),
      );
      setSeconds(left);
      if (!left && !checking.current) {
        checking.current = true;
        api<ExamRun>(`/exams/runs/${run.id}`)
          .then((value) => accept(value, value.status !== 'RUNNING'))
          .catch((e) => setError(e.message))
          .finally(() => {
            checking.current = false;
          });
      }
    };
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [run.id, run.expiresAt, run.status, accept]);
  useEffect(() => {
    if (run.status !== 'RUNNING') return;
    const before = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [run.status]);
  async function navigate(next: number) {
    setMoving(true);
    try {
      await save(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMoving(false);
    }
  }
  async function submit() {
    if (!window.confirm('Nộp bài và kết thúc lượt thi này?')) return;
    setMoving(true);
    try {
      await save();
      accept(await api<ExamRun>(`/exams/runs/${run.id}/submit`, { method: 'POST' }), true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMoving(false);
    }
  }
  async function reload() {
    setMoving(true);
    try {
      accept(await api<ExamRun>(`/exams/runs/${run.id}`), true);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMoving(false);
    }
  }
  if (run.status !== 'RUNNING') return <RunResult run={run} close={close} />;
  const q = run.questions[run.currentIndex];
  return (
    <div className="exam-player">
      <div className="exam-player-heading">
        <div>
          <span className="eyebrow">FOCUS. THINK. ACHIEVE.</span>
          <h1>{run.title}</h1>
          <p>
            {run.subject} · Lượt {run.attemptNo}
          </p>
        </div>
        <div className={`exam-timer ${seconds < 60 ? 'urgent' : ''}`}>
          <Clock3 size={22} />
          <div>
            <strong>
              {String(Math.floor(seconds / 60)).padStart(2, '0')}:
              {String(seconds % 60).padStart(2, '0')}
            </strong>
            <small>Thời gian còn lại</small>
          </div>
        </div>
      </div>
      <ErrorBox
        message={error}
        retry={() => {
          if (window.confirm('Tải bản đã lưu trên server? Nội dung chưa lưu sẽ bị thay thế.'))
            void reload();
        }}
      />
      <div className="exam-player-layout">
        <section className="panel exam-active-question">
          <div className="exam-review-label">
            <b>
              Câu {run.currentIndex + 1} / {run.questionCount}
            </b>
            <span>
              {q.points} điểm · {typeLabels[q.type]}
            </span>
          </div>
          <h2>{q.question}</h2>
          {q.image && (
            <Image
              src={q.image}
              alt={q.imageAlt}
              width={1000}
              height={600}
              unoptimized
              className="question-image"
            />
          )}
          <AnswerInput
            q={q}
            response={draft}
            disabled={moving || !seconds}
            onChange={(value) => {
              setDraft(value);
              draftRef.current = value;
              setDirty(true);
            }}
          />
          <div className="exam-save-status">
            {saving ? (
              <>
                <Spinner /> Đang lưu…
              </>
            ) : dirty ? (
              'Có thay đổi chưa lưu'
            ) : (
              <>
                <CheckCircle2 size={14} /> Đã lưu trên server
              </>
            )}
          </div>
          <div className="exam-question-navigation">
            <button
              className="btn btn-secondary"
              disabled={!run.settings.allowBack || run.currentIndex === 0 || moving}
              onClick={() => navigate(run.currentIndex - 1)}
            >
              <ChevronLeft size={16} /> Câu trước
            </button>
            {run.currentIndex + 1 < run.questionCount ? (
              <button
                className="btn btn-primary"
                disabled={moving || !seconds}
                onClick={() => navigate(run.currentIndex + 1)}
              >
                {moving ? <Spinner /> : null} Câu tiếp <ChevronRight size={16} />
              </button>
            ) : (
              <button className="btn btn-primary" disabled={moving || !seconds} onClick={submit}>
                <Send size={16} /> Nộp bài
              </button>
            )}
          </div>
        </section>
        <aside className="panel exam-run-sidebar">
          <h3>Tiến độ làm bài</h3>
          <div className="exam-question-map">
            {run.questions.map((item, i) => (
              <button
                key={item.id}
                className={`${i === run.currentIndex ? 'current' : ''} ${run.answered[i] ? 'answered' : ''}`}
                disabled={moving || !run.settings.allowBack || i === run.currentIndex}
                onClick={() => navigate(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <p>
            <ShieldCheck size={17} />{' '}
            {run.settings.allowBack
              ? 'Bạn có thể xem lại và đổi câu trả lời.'
              : 'Làm tuần tự. Không thể quay lại câu đã chuyển.'}
          </p>
          <p>
            {run.settings.autoSubmit
              ? 'Hết giờ, hệ thống tự nộp các câu trả lời đã lưu.'
              : 'Bạn cần nộp trước khi hết giờ. Hết hạn chưa nộp sẽ không có điểm.'}
          </p>
          <button className="btn btn-primary" disabled={moving || !seconds} onClick={submit}>
            <Send size={16} /> Nộp bài
          </button>
          <button
            className="btn btn-secondary"
            disabled={moving}
            onClick={async () => {
              if (!window.confirm('Rời bài thi? Đồng hồ vẫn tiếp tục chạy.')) return;
              setMoving(true);
              try {
                await save();
                close();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setMoving(false);
              }
            }}
          >
            Lưu & rời bài thi
          </button>
        </aside>
      </div>
    </div>
  );
}
