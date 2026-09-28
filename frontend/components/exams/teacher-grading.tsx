'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  History,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import { api, ApiError, jsonBody } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import { type ExamRun, runStatusLabels } from '@/lib/exams';
import {
  isActiveSuggestion,
  isWrittenQuestion,
  readableAnswer,
  type GradingOverview,
  type GradingSuggestion,
} from '@/lib/grading';
import { typeLabels } from '@/lib/questions';
import { Empty, ErrorBox, Field, Modal, Spinner } from '../ui';
import { ResultSummary } from './result-summary';
import { ExamActivityLog } from './exam-activity-log';

interface GradeDraft {
  points: string;
  feedback: string;
  suggestionId: string | null;
  revision: number;
}
type Filter = 'all' | 'pending' | 'written' | 'objective';
export function TeacherGrading({
  run,
  changed,
  close,
}: {
  run: ExamRun;
  changed: (run: ExamRun) => void;
  close: () => void;
}) {
  const [selected, setSelected] = useState(() =>
    Math.max(
      0,
      run.awarded.findIndex((p) => p === null),
    ),
  );
  const [filter, setFilter] = useState<Filter>('all');
  const [drafts, setDrafts] = useState<Record<number, GradeDraft>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [history, setHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const requestIds = useRef<Record<number, string>>({});
  const path = `/exams/${run.examId}/submissions/${run.id}`;
  const query = useQuery<GradingOverview>(`${path}/grading?page=${historyPage}`);
  const reload = query.reload;
  const active = query.data?.suggestions.some(isActiveSuggestion) || false;
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(reload, 2000);
    return () => clearInterval(timer);
  }, [active, reload]);
  const dirty = Object.keys(drafts).length > 0;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const indexes = run.questions.flatMap((q, i) =>
    filter === 'all' ||
    (filter === 'pending' && run.awarded[i] === null) ||
    (filter === 'written' && isWrittenQuestion(q.type)) ||
    (filter === 'objective' && !isWrittenQuestion(q.type))
      ? [i]
      : [],
  );
  const index = indexes.includes(selected) ? selected : indexes[0];
  const q = run.questions[index];
  const job = query.data?.suggestions.find((s) => s.index === index);
  const draft = drafts[index];
  const value: GradeDraft = draft || {
    points:
      run.awarded[index] === null || run.awarded[index] === undefined
        ? ''
        : String(run.awarded[index]),
    feedback: run.feedback[index] || '',
    suggestionId: null,
    revision: run.revision,
  };
  const editable = ['PENDING_REVIEW', 'SUBMITTED'].includes(run.status);
  const update = (part: Partial<GradeDraft>) =>
    setDrafts((prev) => ({ ...prev, [index]: { ...value, ...part } }));
  const canSuggest =
    editable &&
    q &&
    isWrittenQuestion(q.type) &&
    !q.image &&
    run.responses[index].some((s) => s.trim());
  async function suggest() {
    setBusy(true);
    setError('');
    setNotice('');
    const requestId = (requestIds.current[index] ||= crypto.randomUUID());
    try {
      await api<GradingSuggestion>(`${path}/grading/suggest`, {
        method: 'POST',
        body: jsonBody({ index, requestId }),
        signal: AbortSignal.timeout(12000),
      });
      delete requestIds.current[index];
      setNotice('Đã gửi yêu cầu. Bạn có thể tiếp tục chấm thủ công trong khi AI xử lý.');
    } catch (e) {
      if (e instanceof ApiError && e.status < 500) delete requestIds.current[index];
      setError((e as Error).message);
    } finally {
      setBusy(false);
      reload();
    }
  }
  async function dismiss() {
    if (!job) return;
    setBusy(true);
    setError('');
    try {
      await api(`${path}/grading/${job.id}/dismiss`, {
        method: 'POST',
        body: jsonBody({ version: job.version }),
      });
      if (draft?.suggestionId === job.id)
        setDrafts((prev) => {
          const next = { ...prev };
          delete next[index];
          return next;
        });
      setNotice('Đã bỏ qua đề xuất. Điểm chính thức không thay đổi.');
      reload();
    } catch (e) {
      setError((e as Error).message);
      reload();
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!draft || !q) return;
    const points = Number(draft.points);
    if (
      !draft.points.trim() ||
      !Number.isFinite(points) ||
      points < 0 ||
      points > q.points ||
      Math.abs(points * 100 - Math.round(points * 100)) > 1e-7
    ) {
      setError(`Nhập điểm từ 0 đến ${q.points}, tối đa 2 chữ số thập phân.`);
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await api<ExamRun>(`${path}/grade`, {
        method: 'POST',
        body: jsonBody({
          revision: draft.revision,
          grades: [{ index, points, feedback: draft.feedback, suggestionId: draft.suggestionId }],
        }),
      });
      setDrafts((prev) =>
        Object.fromEntries(
          Object.entries(prev)
            .filter(([key]) => Number(key) !== index)
            .map(([key, v]) => [key, { ...v, revision: result.revision }]),
        ),
      );
      changed(result);
      reload();
      setNotice(`Đã xác nhận ${points} / ${q.points} điểm cho câu ${index + 1}.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function refreshRun() {
    if (
      dirty &&
      !window.confirm(
        'Tải lại sẽ bỏ các điểm và nhận xét chưa xác nhận trên màn hình này. Tiếp tục?',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const latest = await api<ExamRun>(path);
      setDrafts({});
      changed(latest);
      reload();
      setNotice('Đã tải trạng thái mới nhất.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="gr-workspace">
      <div className="gr-toolbar">
        <button
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => {
            if (
              !dirty ||
              window.confirm('Rời màn hình sẽ bỏ điểm và nhận xét chưa xác nhận. Tiếp tục?')
            )
              close();
          }}
        >
          <ArrowLeft size={16} /> Bài làm
        </button>
        <div>
          <button className="btn btn-secondary small" disabled={busy} onClick={refreshRun}>
            <RefreshCw size={15} /> Tải lại bài làm
          </button>
          <button className="btn btn-secondary small" onClick={() => setHistory(true)}>
            <History size={16} /> Lịch sử chấm
          </button>
        </div>
      </div>
      <div className="gr-heading">
        <div>
          <span className="eyebrow">GRADING STUDIO</span>
          <h1>{run.studentName}</h1>
          <p>
            {run.title} · Lượt {run.attemptNo}
          </p>
        </div>
        <span className="qb-badge difficulty-medium">{runStatusLabels[run.status]}</span>
      </div>
      <ResultSummary run={run} />
      <ExamActivityLog examId={run.examId} runId={run.id} />
      {editable && (
        <div className="gr-notice">
          <ShieldCheck size={19} />
          <span>
            AI hỗ trợ phân tích bài làm. <b>Teacher quyết định điểm cuối cùng.</b> Chỉ điểm đã xác
            nhận mới cập nhật kết quả học sinh.
          </span>
        </div>
      )}
      <ErrorBox message={error || query.error} retry={query.error ? reload : undefined} />
      {notice && (
        <p className="gr-success" role="status">
          <Check size={16} /> {notice}
        </p>
      )}
      <div className="gr-review-toolbar">
        <div className="gr-filters">
          {(
            [
              ['all', 'Tất cả'],
              ['pending', 'Chờ chấm'],
              ['written', 'Tự luận / ngắn'],
              ['objective', 'Khách quan'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? 'active' : ''}
              onClick={() => setFilter(key)}
            >
              {label}
              {key === 'pending' && <span>{run.grading?.pending || 0}</span>}
            </button>
          ))}
        </div>
        <span>
          {indexes.length} câu · {Object.keys(drafts).length} bản chấm chưa xác nhận
        </span>
      </div>
      {!q ? (
        <section className="panel">
          <Empty
            title="Không có câu hỏi trong nhóm này"
            description="Chọn bộ lọc khác để tiếp tục xem bài."
          />
        </section>
      ) : (
        <div className="gr-layout">
          <aside className="gr-question-nav panel">
            <b>Câu hỏi</b>
            <div>
              {indexes.map((i) => (
                <button
                  key={i}
                  className={`${i === index ? 'active' : ''} ${run.awarded[i] === null ? 'pending' : 'graded'}`}
                  onClick={() => setSelected(i)}
                  aria-label={`Chấm câu ${i + 1}`}
                  aria-current={i === index ? 'step' : undefined}
                >
                  {i + 1}
                  {drafts[i] && <small>•</small>}
                </button>
              ))}
            </div>
            <p>
              Chấm vàng: chờ Teacher
              <br />
              Dấu •: có bản chấm chưa lưu
            </p>
          </aside>
          <section className="gr-answer-card panel">
            <header>
              <span className="qb-badge">{typeLabels[q.type]}</span>
              <span>
                Câu {index + 1} / {run.questionCount} · {q.points} điểm
              </span>
            </header>
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
            <div className="gr-answer-block">
              <span>BÀI LÀM CỦA HỌC SINH</span>
              <p>{readableAnswer(q, run.responses[index]) || 'Không có câu trả lời.'}</p>
            </div>
            <div className="gr-reference">
              <span>{q.type === 'ESSAY' ? 'RUBRIC · HƯỚNG DẪN CHẤM' : 'ĐÁP ÁN THAM CHIẾU'}</span>
              <p>{q.type === 'ESSAY' ? q.rubric : readableAnswer(q, q.correct || [])}</p>
              {q.explanation && <p>{q.explanation}</p>}
            </div>
            <div className="gr-question-pager">
              <button
                className="btn btn-secondary small"
                disabled={indexes.indexOf(index) === 0}
                onClick={() => setSelected(indexes[indexes.indexOf(index) - 1])}
              >
                <ChevronLeft size={16} /> Trước
              </button>
              <span>
                {indexes.indexOf(index) + 1} / {indexes.length}
              </span>
              <button
                className="btn btn-secondary small"
                disabled={indexes.indexOf(index) === indexes.length - 1}
                onClick={() => setSelected(indexes[indexes.indexOf(index) + 1])}
              >
                Tiếp <ChevronRight size={16} />
              </button>
            </div>
          </section>
          <aside className="gr-decision-column">
            {isWrittenQuestion(q.type) && editable ? (
              <>
                <section className="gr-manual panel">
                  <header>
                    <ClipboardCheck size={19} />
                    <h2>Quyết định của Teacher</h2>
                  </header>
                  <p>
                    Điểm hiện tại:{' '}
                    <b>
                      {run.awarded[index] === null
                        ? 'Chưa chấm'
                        : `${run.awarded[index]} / ${q.points}`}
                    </b>
                  </p>
                  <Field label={`Điểm câu ${index + 1} (tối đa ${q.points})`}>
                    <input
                      type="number"
                      min={0}
                      max={q.points}
                      step="0.01"
                      value={value.points}
                      disabled={busy}
                      placeholder="Nhập điểm"
                      onChange={(e) => update({ points: e.target.value })}
                    />
                  </Field>
                  <Field label="Nhận xét cho học sinh">
                    <textarea
                      aria-label="Nhận xét cho học sinh"
                      rows={4}
                      maxLength={2000}
                      value={value.feedback}
                      disabled={busy}
                      placeholder="Nêu điểm tốt và điều cần cải thiện…"
                      onChange={(e) => update({ feedback: e.target.value })}
                    />
                  </Field>
                  {value.suggestionId && (
                    <small className="gr-draft-note">
                      Đang tham khảo đề xuất AI. Bạn có thể sửa điểm và nhận xét trước khi xác nhận.
                    </small>
                  )}
                  <button className="btn btn-primary" disabled={busy || !draft} onClick={save}>
                    {busy ? <Spinner /> : <Check size={17} />} Xác nhận điểm câu này
                  </button>
                  <small>Nhận xét được hiển thị cho Student khi đề cho phép xem đáp án.</small>
                </section>
                <section className="gr-ai panel">
                  <header>
                    <span>
                      <Sparkles size={20} />
                    </span>
                    <div>
                      <h2>Trợ lý chấm AI</h2>
                      <p>Đề xuất để bạn đối chiếu</p>
                    </div>
                  </header>
                  {!query.data?.configured && !query.loading && (
                    <p>Chưa cấu hình DeepSeek. Bạn vẫn có thể chấm thủ công.</p>
                  )}
                  {!canSuggest && (
                    <p>
                      {q.image
                        ? 'Câu có hình ảnh cần Teacher chấm trực tiếp.'
                        : 'Bài trống được 0 điểm, không cần gửi AI.'}
                    </p>
                  )}
                  {job && isActiveSuggestion(job) && (
                    <p className="gr-ai-loading" role="status">
                      <Spinner />{' '}
                      {job.status === 'QUEUED' ? 'Đang chờ phân tích…' : 'Đang phân tích bài làm…'}
                    </p>
                  )}
                  {job?.status === 'FAILED' && <ErrorBox message={job.error} />}
                  {job?.status === 'DISMISSED' && (
                    <p>
                      Đề xuất đã được bỏ qua. Bạn có thể chấm thủ công hoặc yêu cầu đề xuất mới.
                    </p>
                  )}
                  {job?.status === 'READY' && job.proposal && (
                    <div className="gr-ai-proposal">
                      <div className="gr-proposed-score">
                        <span>ĐIỂM ĐỀ XUẤT</span>
                        <b>
                          {job.proposal.points} <small>/ {q.points}</small>
                        </b>
                      </div>
                      <h3>Lý do đề xuất</h3>
                      <p>{job.proposal.reason}</p>
                      {job.proposal.strengths.length > 0 && (
                        <>
                          <h3>Đã đáp ứng</h3>
                          <ul>
                            {job.proposal.strengths.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {job.proposal.improvements.length > 0 && (
                        <>
                          <h3>Cần cải thiện</h3>
                          <ul>
                            {job.proposal.improvements.map((s, i) => (
                              <li key={i}>{s}</li>
                            ))}
                          </ul>
                        </>
                      )}
                      {job.proposal.evidence.length > 0 && (
                        <>
                          <h3>Trích từ bài làm</h3>
                          {job.proposal.evidence.map((s, i) => (
                            <blockquote key={i}>{s}</blockquote>
                          ))}
                        </>
                      )}
                      {job.proposal.limitations && (
                        <p className="gr-ai-limitation">
                          Cần Teacher kiểm tra: {job.proposal.limitations}
                        </p>
                      )}
                      <div className="gr-proposal-actions">
                        <button
                          className="btn btn-secondary small"
                          disabled={busy}
                          onClick={() => {
                            update({
                              points: String(job.proposal!.points),
                              feedback: job.proposal!.reason,
                              suggestionId: job.id,
                            });
                            setNotice(
                              'Đã đưa đề xuất vào bản chấm. Điểm chưa thay đổi cho đến khi bạn xác nhận.',
                            );
                          }}
                        >
                          <ClipboardCheck size={16} /> Đưa vào bản chấm
                        </button>
                        <button className="text-link" disabled={busy} onClick={dismiss}>
                          <X size={14} /> Bỏ qua
                        </button>
                      </div>
                    </div>
                  )}
                  {canSuggest && (
                    <button
                      className="btn btn-secondary gr-request-ai"
                      disabled={busy || active || !query.data?.configured || query.loading}
                      onClick={suggest}
                    >
                      <Sparkles size={16} /> {job ? 'Yêu cầu đề xuất mới' : 'Nhờ AI đề xuất điểm'}
                    </button>
                  )}
                  <small>
                    Nút này gửi câu hỏi, đáp án tham chiếu/rubric và bài làm đến DeepSeek để gợi ý.
                    Không kèm thông tin tài khoản học sinh.
                  </small>
                </section>
              </>
            ) : (
              <section className="gr-manual panel">
                <header>
                  <ShieldCheck size={20} />
                  <h2>{editable ? 'Đã chấm tự động' : 'Chưa có điểm'}</h2>
                </header>
                <div className="gr-auto-points">
                  {run.awarded[index] ?? '—'} <small>/ {q.points}</small>
                </div>
                <p>
                  {editable
                    ? 'Câu khách quan được đối chiếu với đáp án trong đề. Điểm được tính ngay khi nộp bài.'
                    : 'Chỉ có thể chấm sau khi Student nộp bài.'}
                </p>
              </section>
            )}
          </aside>
        </div>
      )}
      {history && (
        <Modal
          title="Lịch sử chấm điểm"
          description="Ghi nhận mỗi lần Teacher xác nhận hoặc sửa điểm."
          close={() => setHistory(false)}
          wide
        >
          <div className="gr-history">
            {query.data?.history.map((event) => (
              <article key={event.id}>
                <header>
                  <b>
                    Câu {event.index + 1} · {event.previousPoints ?? 'Chưa chấm'} → {event.points}{' '}
                    điểm
                  </b>
                  <span>
                    {event.suggestionId ? 'Teacher tham khảo AI' : 'Teacher chấm thủ công'}
                  </span>
                </header>
                <p>
                  {event.reviewerName} · {new Date(event.createdAt).toLocaleString('vi-VN')}
                </p>
                {event.suggestionId && (
                  <small>
                    AI đề xuất {event.suggestedPoints}; Teacher quyết định {event.points}.
                  </small>
                )}
                {event.feedback && <blockquote>{event.feedback}</blockquote>}
                {event.previousFeedback && event.previousFeedback !== event.feedback && (
                  <details>
                    <summary>Nhận xét trước đó</summary>
                    <p>{event.previousFeedback}</p>
                  </details>
                )}
              </article>
            ))}
          </div>
          {!query.data?.history.length && <p>Chưa có lần xác nhận điểm thủ công nào.</p>}
          <div className="table-pagination">
            <span>{query.data?.total || 0} lần xác nhận</span>
            <div>
              <button
                className="btn btn-secondary small"
                disabled={historyPage <= 1}
                onClick={() => setHistoryPage((p) => p - 1)}
              >
                Trước
              </button>
              <span>
                {historyPage} / {query.data?.pages || 1}
              </span>
              <button
                className="btn btn-secondary small"
                disabled={historyPage >= (query.data?.pages || 1)}
                onClick={() => setHistoryPage((p) => p + 1)}
              >
                Sau
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
