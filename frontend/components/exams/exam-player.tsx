'use client';
import Image from 'next/image';
import { useState } from 'react';
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
  Flag,
  WifiOff,
  CloudCheck,
  RefreshCw,
  CircleHelp,
  ListChecks,
  X,
} from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { runStatusLabels, type ExamRun, type RunQuestion } from '@/lib/exams';
import { typeLabels } from '@/lib/questions';
import { ErrorBox, Spinner, Modal } from '../ui';
import { useExamSession } from './use-exam-session';

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
        {q.options.map((option, index) => (
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
            <span className="ep-option-letter">{String.fromCharCode(65 + index)}</span>
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
        `${q.type === 'MATCHING' ? `${q.left?.[i]?.text} → ` : ''}${q.options?.find((o) => o.id === v)?.text || v || '(trống)'}`,
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

export function ExamPlayer({
  initial,
  ownerId,
  close,
}: {
  initial: ExamRun;
  ownerId: string;
  close: () => void;
}) {
  const {
    session,
    run,
    pending,
    syncing,
    moving,
    offline,
    error,
    storageError,
    recovered,
    conflicts,
    lostAnswers,
    seconds,
    lastSavedAt,
  } = useExamSession(initial, ownerId);
  const [confirm, setConfirm] = useState<'submit' | 'leave' | null>(null);
  const [filter, setFilter] = useState<'all' | 'unanswered' | 'flagged'>('all');
  const [dismissRecovery, setDismissRecovery] = useState(false);
  const [notice, setNotice] = useState('');
  const [showMap, setShowMap] = useState(false);
  const answered = run.answered.filter(Boolean).length,
    flagged = run.flagged.filter(Boolean).length;
  const index = run.currentIndex,
    question = run.questions[index];
  const disabled = moving || !seconds;
  const saveText = offline
    ? 'Đang chờ kết nối'
    : syncing
      ? 'Đang đồng bộ…'
      : conflicts.length
        ? 'Cần kiểm tra xung đột'
        : pending
          ? 'Chờ lưu đáp án…'
          : 'Đã lưu trên máy chủ';
  async function submit() {
    setNotice('');
    try {
      await session.submit();
      setConfirm(null);
    } catch {
      setNotice('Chưa nộp được bài. Giữ trang này mở để đồng bộ rồi thử lại.');
    }
  }
  async function leave() {
    try {
      await session.sync();
      if (session.getSnapshot().pending) return;
      close();
    } catch {
      setNotice('Chưa lưu lên máy chủ. Bạn có thể tiếp tục làm bài trong lúc chờ kết nối.');
    }
  }
  if (run.status !== 'RUNNING')
    return (
      <div className="ep-result-wrap">
        {lostAnswers > 0 && (
          <ErrorBox
            message={`${lostAnswers} câu có thay đổi chưa kịp đồng bộ trước khi lượt thi kết thúc. Kết quả sử dụng các đáp án máy chủ đã nhận.`}
          />
        )}
        <RunResult run={run} close={close} />
      </div>
    );
  return (
    <div className="ep-shell">
      <header className="ep-topbar">
        <button className="ep-brand" onClick={() => setConfirm('leave')} aria-label="Rời phòng thi">
          <span>
            <ListChecks size={24} />
          </span>
          <b>
            quizspace<span>.</span>
          </b>
          <small>EXAM ROOM</small>
        </button>
        <div className="ep-topbar-right">
          <span className={`ep-connection ${offline ? 'is-offline' : ''}`} role="status">
            {offline ? <WifiOff size={16} /> : <CloudCheck size={16} />}
            <span>{saveText}</span>
          </span>
          <button
            className="btn btn-secondary small"
            onClick={() => setConfirm('leave')}
            disabled={moving}
          >
            <X size={15} /> Rời bài thi
          </button>
        </div>
      </header>
      <main className="ep-main">
        <div className="ep-heading">
          <div>
            <span className="eyebrow">
              {run.subject} · LƯỢT THI {run.attemptNo}
            </span>
            <h1>{run.title}</h1>
            <p>Hãy đọc kỹ câu hỏi và chọn câu trả lời phù hợp nhất.</p>
          </div>
          <div
            className={`ep-clock ${seconds <= 60 ? 'is-urgent' : ''}`}
            role="timer"
            aria-label="Thời gian còn lại"
          >
            <Clock3 size={24} />
            <div>
              <small>THỜI GIAN CÒN LẠI</small>
              <strong>
                {String(Math.floor(seconds / 60)).padStart(2, '0')}
                <span>:</span>
                {String(seconds % 60).padStart(2, '0')}
              </strong>
            </div>
          </div>
        </div>
        {recovered && !dismissRecovery && (
          <div className="ep-banner">
            <CloudCheck size={18} />
            <span>
              Đã khôi phục bản nháp trên trình duyệt. Các thay đổi đang được đối chiếu và đồng bộ
              với máy chủ.
            </span>
            <button
              className="icon-btn"
              onClick={() => setDismissRecovery(true)}
              aria-label="Ẩn thông báo khôi phục"
            >
              <X size={16} />
            </button>
          </div>
        )}
        {storageError && (
          <ErrorBox message="Trình duyệt không lưu được bản nháp. Giữ trang mở và chờ trạng thái Đã lưu trên máy chủ trước khi refresh." />
        )}
        {offline && (
          <div className="ep-banner ep-banner-warning" role="status">
            <WifiOff size={19} />
            <span>
              {run.settings.allowBack
                ? 'Kết nối đang gián đoạn. Bạn vẫn có thể trả lời và chuyển câu; bản nháp sẽ tự đồng bộ khi có mạng.'
                : 'Kết nối đang gián đoạn. Bạn vẫn có thể trả lời câu hiện tại; cần kết nối để chuyển câu theo quy định của đề.'}{' '}
              Đồng hồ vẫn tiếp tục chạy.
            </span>
            <button
              className="text-link"
              disabled={syncing}
              onClick={() => void session.sync().catch(() => {})}
            >
              <RefreshCw size={15} /> Kết nối lại
            </button>
          </div>
        )}
        {!seconds && (
          <div className="ep-banner ep-banner-warning" role="status">
            <Clock3 size={19} />
            <span>
              Đã hết thời gian làm bài.{' '}
              {run.settings.autoSubmit
                ? 'Máy chủ tự nộp các đáp án đã nhận.'
                : 'Đề này không bật tự nộp; lượt chưa nộp sẽ hết hạn.'}{' '}
              {offline ? 'Kết nối lại để xem trạng thái bài thi.' : 'Đang xác nhận kết quả…'}
            </span>
          </div>
        )}
        {!offline && !conflicts.length && (
          <ErrorBox message={error} retry={() => void session.sync().catch(() => {})} />
        )}
        {!!conflicts.length && (
          <section className="ep-conflicts" role="alert">
            <h2>
              <CircleHelp size={19} /> Có thay đổi từ một tab hoặc thiết bị khác
            </h2>
            <p>Bản nháp của bạn được giữ lại. Chọn đáp án muốn sử dụng cho từng câu.</p>
            {conflicts.map((i) => (
              <div key={i}>
                <b>
                  Câu {i + 1}
                  {run.questions[i].locked ? ' — đã chuyển qua trên thiết bị khác' : ''}
                </b>
                <p className="ep-local-answer">
                  {run.questions[i].locked
                    ? 'Đề không cho phép sửa câu đã chuyển. Chấp nhận bản máy chủ để tiếp tục.'
                    : `Trên máy này: ${readable(run.questions[i], run.responses[i]) || '(trống)'}`}
                </p>
                <div>
                  <button
                    className="btn btn-secondary small"
                    onClick={() => {
                      session.resolve(i, false);
                      void session.sync().catch(() => {});
                    }}
                  >
                    Dùng bản trên máy chủ
                  </button>
                  {!run.questions[i].locked && (
                    <button
                      className="btn btn-primary small"
                      onClick={() => {
                        session.resolve(i, true);
                        void session.sync().catch(() => {});
                      }}
                    >
                      Giữ đáp án trên máy này
                    </button>
                  )}
                </div>
              </div>
            ))}
          </section>
        )}
        <div className="ep-layout">
          <section className="ep-question-panel" aria-label={`Câu hỏi ${index + 1}`}>
            <div className="ep-question-heading">
              <div>
                <span className="ep-question-number">{String(index + 1).padStart(2, '0')}</span>
                <div>
                  <b>
                    Câu {index + 1} <span>/ {run.questionCount}</span>
                  </b>
                  <small>
                    {typeLabels[question.type]} · {question.points} điểm
                  </small>
                </div>
              </div>
              <button
                className={`ep-flag ${run.flagged[index] ? 'is-flagged' : ''}`}
                disabled={disabled}
                aria-pressed={run.flagged[index]}
                onClick={session.flag}
              >
                <Flag size={17} fill={run.flagged[index] ? 'currentColor' : 'none'} />
                {run.flagged[index] ? 'Đã đánh dấu' : 'Đánh dấu câu'}
              </button>
            </div>
            <div className="ep-question-body">
              <h2>{question.question}</h2>
              {question.image && (
                <Image
                  src={question.image}
                  alt={question.imageAlt}
                  width={1000}
                  height={600}
                  unoptimized
                  className="question-image"
                />
              )}
              <p className="ep-answer-hint">
                {question.type === 'MULTIPLE_CHOICE'
                  ? 'Chọn tất cả đáp án bạn cho là đúng.'
                  : question.type === 'SINGLE_CHOICE' || question.type === 'TRUE_FALSE'
                    ? 'Chọn một đáp án.'
                    : 'Hoàn thành câu trả lời bên dưới.'}
              </p>
              <AnswerInput
                q={question}
                response={run.responses[index]}
                disabled={disabled}
                onChange={session.answer}
              />
              <div className="ep-question-tools">
                <span className="exam-save-status" role="status">
                  {syncing ? (
                    <Spinner />
                  ) : offline ? (
                    <WifiOff size={14} />
                  ) : (
                    <CloudCheck size={15} />
                  )}
                  {saveText}
                  {!pending && !syncing && !offline && lastSavedAt && (
                    <small> · {new Date(lastSavedAt).toLocaleTimeString('vi-VN')}</small>
                  )}
                </span>
                <button
                  className="text-link"
                  disabled={disabled || !run.responses[index].length}
                  onClick={() => session.answer([])}
                >
                  Xóa câu trả lời
                </button>
              </div>
            </div>
            <footer className="ep-navigation">
              <button
                className="btn btn-secondary"
                disabled={disabled || !run.settings.allowBack || index === 0}
                onClick={() => void session.navigate(index - 1)}
              >
                <ChevronLeft size={17} /> Câu trước
              </button>
              <span>
                {index + 1} / {run.questionCount}
              </span>
              {index + 1 < run.questionCount ? (
                <button
                  className="btn btn-primary"
                  disabled={disabled}
                  onClick={() => void session.navigate(index + 1)}
                >
                  {moving ? <Spinner /> : null} Câu tiếp <ChevronRight size={17} />
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={disabled}
                  onClick={() => {
                    setNotice('');
                    setConfirm('submit');
                  }}
                >
                  <Send size={17} /> Nộp bài
                </button>
              )}
            </footer>
          </section>
          <aside className="ep-sidebar">
            <div className="ep-sidebar-title">
              <div>
                <ListChecks size={19} />
                <h2>Tổng quan bài thi</h2>
              </div>
              <button
                className="icon-btn ep-map-toggle"
                aria-label="Mở danh sách câu hỏi"
                onClick={() => setShowMap(!showMap)}
                aria-expanded={showMap}
              >
                <ChevronRight size={19} />
              </button>
            </div>
            <div className="ep-completion">
              <div>
                <span>Tiến độ hoàn thành</span>
                <b>{Math.round((answered / run.questionCount) * 100)}%</b>
              </div>
              <progress value={answered} max={run.questionCount} />
            </div>
            <div className="ep-counts">
              <div>
                <i className="answered" />
                <strong>{answered}</strong>
                <span>Đã trả lời</span>
              </div>
              <div>
                <i />
                <strong>{run.questionCount - answered}</strong>
                <span>Chưa trả lời</span>
              </div>
              <div>
                <Flag size={12} />
                <strong>{flagged}</strong>
                <span>Đánh dấu</span>
              </div>
            </div>
            <div className={`ep-map-area ${showMap ? 'is-open' : ''}`}>
              <label className="ep-map-filter">
                <span>Lọc câu hỏi</span>
                <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                  <option value="all">Tất cả câu hỏi</option>
                  <option value="unanswered">Chưa trả lời</option>
                  <option value="flagged">Đã đánh dấu</option>
                </select>
              </label>
              <div className="ep-question-map">
                {run.questions.map(
                  (q, i) =>
                    (filter === 'all' ||
                      (filter === 'flagged' && run.flagged[i]) ||
                      (filter === 'unanswered' && !run.answered[i])) && (
                      <button
                        key={q.id}
                        aria-label={`Câu ${i + 1}, ${run.answered[i] ? 'đã trả lời' : 'chưa trả lời'}${run.flagged[i] ? ', đã đánh dấu' : ''}`}
                        aria-current={i === index ? 'step' : undefined}
                        title={q.locked ? 'Đề thi yêu cầu làm tuần tự' : `Đến câu ${i + 1}`}
                        className={`${run.answered[i] ? 'answered' : ''} ${i === index ? 'current' : ''} ${run.flagged[i] ? 'flagged' : ''}`}
                        disabled={disabled || !run.settings.allowBack || i === index}
                        onClick={() => void session.navigate(i)}
                      >
                        {i + 1}
                        {run.flagged[i] && <Flag size={10} fill="currentColor" />}
                      </button>
                    ),
                )}
              </div>
              <div className="ep-map-legend">
                <span>
                  <i /> Đang xem
                </span>
                <span>
                  <Flag size={11} /> Cần xem lại
                </span>
              </div>
            </div>
            <button
              className="btn btn-primary ep-submit"
              disabled={disabled || !!conflicts.length}
              onClick={() => {
                setNotice('');
                setConfirm('submit');
              }}
            >
              <Send size={17} /> Nộp bài
            </button>
            <p className="ep-rule">
              <ShieldCheck size={17} />
              {run.settings.allowBack
                ? 'Bạn có thể quay lại và đổi đáp án trước khi nộp.'
                : 'Làm tuần tự. Không thể quay lại câu đã chuyển.'}
            </p>
            <p className="ep-rule">
              <Clock3 size={16} />
              {run.settings.autoSubmit
                ? 'Hết giờ, hệ thống tự nộp các đáp án đã lưu.'
                : 'Bạn cần nộp bài trước khi hết giờ.'}
            </p>
          </aside>
        </div>
        <footer className="ep-footer">
          <span>
            <ShieldCheck size={14} /> Kết quả được xác nhận trên máy chủ
          </span>
          <span>QuizSpace · Không gian tập trung của bạn</span>
        </footer>
      </main>
      {confirm && (
        <Modal
          title={confirm === 'submit' ? 'Sẵn sàng nộp bài?' : 'Rời phòng thi?'}
          description={
            confirm === 'submit'
              ? 'Sau khi nộp, bạn không thể thay đổi câu trả lời của lượt này.'
              : 'Đồng hồ vẫn chạy khi bạn rời trang. Bạn có thể tiếp tục lượt đang làm từ Bài thi của tôi.'
          }
          close={() => {
            if (!moving) setConfirm(null);
          }}
        >
          <div className="ep-submit-summary">
            <div>
              <b>{answered}</b>
              <span>Đã trả lời</span>
            </div>
            <div>
              <b>{run.questionCount - answered}</b>
              <span>Chưa trả lời</span>
            </div>
            <div>
              <b>{flagged}</b>
              <span>Đánh dấu</span>
            </div>
          </div>
          {confirm === 'submit' && (run.questionCount - answered > 0 || flagged > 0) && (
            <p className="ep-confirm-note">
              Còn {run.questionCount - answered} câu chưa hoàn tất và {flagged} câu được đánh dấu.
              Bạn có thể quay lại kiểm tra trước khi nộp.
            </p>
          )}
          {pending > 0 && (
            <p className="ep-confirm-note">
              {pending} câu đang chờ đồng bộ. Hệ thống sẽ lưu xong đáp án trước khi{' '}
              {confirm === 'submit' ? 'nộp bài' : 'rời trang'}.
            </p>
          )}
          <ErrorBox message={notice} />
          <div className="ep-modal-actions">
            <button
              className="btn btn-secondary"
              disabled={moving}
              onClick={() => setConfirm(null)}
            >
              Tiếp tục làm bài
            </button>
            <button
              className="btn btn-primary"
              disabled={moving || !!conflicts.length || !seconds}
              onClick={() => void (confirm === 'submit' ? submit() : leave())}
            >
              {moving || syncing ? <Spinner /> : <Send size={16} />}
              {confirm === 'submit' ? 'Xác nhận nộp bài' : 'Lưu & rời bài thi'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
