'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  LibraryBig,
  PenLine,
  Plus,
  RefreshCw,
  Sparkles,
  WandSparkles,
  X,
  Quote,
  ShieldCheck,
  BookOpen,
  AlertCircle,
} from 'lucide-react';
import { api, ApiError, jsonBody } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import {
  candidateLabels,
  isWorking,
  jobStatusLabel,
  sourceLabels,
  type AICandidate,
  type AIJob,
  type AIStatus,
} from '@/lib/ai';
import { difficultyLabels, typeLabels, type QuestionMetadata } from '@/lib/questions';
import { Empty, ErrorBox, Field, Modal, Spinner } from './ui';
import { QuestionPreview } from './questions/question-preview';
import { QuestionEditor } from './questions/question-editor';
import type { Notify } from './workspace';
import { GenerationForm } from './ai/generation-form';

const date = (value: string) =>
  new Date(value).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
export function AIStudio({ notify }: { notify: Notify }) {
  const config = useQuery<AIStatus>('/ai/status');
  const metadata = useQuery<QuestionMetadata>('/questions/metadata');
  const [page, setPage] = useState(1);
  const history = useQuery<{ jobs: AIJob[]; total: number; page: number; pages: number }>(
    `/ai/generations?page=${page}`,
  );
  const [job, setJob] = useState<AIJob | null>(null);
  const [editing, setEditing] = useState<AICandidate | null>(null);
  const [regenerating, setRegenerating] = useState<AICandidate | null>(null);
  const [feedback, setFeedback] = useState('');
  const [filter, setFilter] = useState<'ALL' | AICandidate['status']>('ALL');
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const working = isWorking(job);
  const pollingId = working ? job?.id : undefined;
  useEffect(() => {
    if (!pollingId) return;
    let active = true,
      fetching = false;
    const poll = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const value = await api<AIJob>(`/ai/generations/${pollingId}`);
        if (active) {
          setJob((current) => (current?.id === value.id ? value : current));
          setError('');
        }
      } catch (e) {
        if (active) setError((e as Error).message);
      } finally {
        fetching = false;
      }
    };
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [pollingId]);

  async function open(id: string) {
    setBusy(true);
    setError('');
    try {
      setJob(await api<AIJob>(`/ai/generations/${id}`));
      setSelected([]);
      setFilter('ALL');
      setShowHistory(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(path: string, body: object, method = 'POST') {
    if (!job) return;
    setBusy(true);
    setError('');
    try {
      const value = await api<AIJob>(`/ai/generations/${job.id}${path}`, {
        method,
        body: jsonBody({ version: job.version, ...body }),
      });
      setJob(value);
      setSelected([]);
      history.reload();
      return value;
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError && e.status === 409) {
        try {
          setJob(await api<AIJob>(`/ai/generations/${job.id}`));
        } catch {
          /* retain the current review on network failure */
        }
      }
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function decide(kind: 'approve' | 'reject', ids: string[]) {
    try {
      await action(`/${kind}`, { ids });
      notify(
        kind === 'approve'
          ? `Đã đưa ${ids.length} câu vào ngân hàng ở trạng thái Sẵn sàng.`
          : `Đã từ chối ${ids.length} câu.`,
      );
    } catch {}
  }
  if (editing && job)
    return (
      <QuestionEditor
        key={`${editing.id}-${editing.revision}`}
        initial={null}
        metadata={metadata.data}
        close={() => setEditing(null)}
        saved={() => {}}
        review={{
          content: editing.content,
          save: async (content) => {
            await action(`/items/${editing.id}`, { content }, 'PUT');
            setEditing(null);
            notify('Đã lưu bản chỉnh sửa. Bạn có thể duyệt câu hỏi.');
          },
        }}
      />
    );
  const pending = job?.items.filter((item) => item.status === 'PENDING') || [];
  const filtered = job?.items.filter((item) => filter === 'ALL' || item.status === filter) || [];
  return (
    <div className="ai-studio">
      <div className="ai-page-heading">
        <div>
          <span className="eyebrow">TEACHER WORKSPACE / AI STUDIO</span>
          <h1>
            Biến kiến thức thành câu hỏi
            <span className="ai-heading-spark">
              <Sparkles size={25} />
            </span>
          </h1>
          <p>AI soạn bản đầu. Bạn quyết định chất lượng cuối cùng.</p>
        </div>
        <div className="ai-heading-actions">
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => {
              setShowHistory(!showHistory);
              history.reload();
            }}
          >
            <History size={17} />
            Lịch sử tạo
          </button>
          {job && (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                setJob(null);
                setError('');
                setSelected([]);
                setShowHistory(false);
                history.reload();
              }}
            >
              <Plus size={17} />
              Đợt mới
            </button>
          )}
        </div>
      </div>
      <ErrorBox message={error} />
      <ErrorBox message={config.error} retry={config.reload} />
      {showHistory ? (
        <section className="panel ai-history">
          <div className="ai-panel-heading">
            <div>
              <h2>Những đợt câu hỏi của bạn</h2>
              <p>Mở lại để tiếp tục duyệt hoặc theo dõi tiến độ.</p>
            </div>
            <button
              className="icon-btn"
              aria-label="Đóng lịch sử"
              onClick={() => setShowHistory(false)}
            >
              <X size={18} />
            </button>
          </div>
          <ErrorBox message={history.error} retry={history.reload} />
          {history.loading ? (
            <div className="ai-loading">
              <Spinner /> Đang tải lịch sử…
            </div>
          ) : history.data?.jobs.length ? (
            <>
              <div className="ai-history-list">
                {history.data.jobs.map((entry) => (
                  <button
                    key={entry.id}
                    className="ai-history-row"
                    onClick={() => void open(entry.id)}
                    disabled={busy}
                  >
                    <span className="ai-history-icon">
                      <FileText size={22} />
                    </span>
                    <span className="ai-history-title">
                      <b>{entry.settings.topicPath.join(' / ')}</b>
                      <small>
                        {entry.settings.subject} · {typeLabels[entry.settings.type]} ·{' '}
                        {date(entry.createdAt)}
                      </small>
                    </span>
                    <span className={`ai-status ai-status-${entry.status.toLowerCase()}`}>
                      {jobStatusLabel(entry)}
                    </span>
                    <span className="ai-history-count">
                      {entry.generated}/{entry.settings.count} câu
                      <small>{entry.approved} đã duyệt</small>
                    </span>
                    <ChevronRight size={18} />
                  </button>
                ))}
              </div>
              <div className="ai-pagination">
                <span>{history.data.total} đợt tạo</span>
                <button
                  className="icon-btn"
                  aria-label="Trang trước"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft size={18} />
                </button>
                <span>
                  {page}/{history.data.pages}
                </span>
                <button
                  className="icon-btn"
                  aria-label="Trang sau"
                  disabled={page >= history.data.pages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </>
          ) : (
            <Empty
              title="Chưa có đợt tạo nào"
              description="Bắt đầu từ một chủ đề hoặc tài liệu bài giảng."
            />
          )}
        </section>
      ) : !job ? (
        <GenerationForm
          configured={config.data}
          disabled={busy || config.loading}
          onStart={(value) => {
            setJob(value);
            setError('');
            history.reload();
          }}
        />
      ) : (
        <>
          <section className="ai-review-header panel">
            <div className="ai-review-title">
              <div className="ai-large-icon">
                <WandSparkles size={26} />
              </div>
              <div>
                <span className="eyebrow">KHU VỰC DUYỆT CÂU HỎI</span>
                <h2>{job.settings.topicPath.join(' / ')}</h2>
                <p>
                  {job.settings.subject} · {difficultyLabels[job.settings.difficulty]} ·{' '}
                  {typeLabels[job.settings.type]}
                </p>
              </div>
              <span className={`ai-status ai-status-${job.status.toLowerCase()}`}>
                {working && <Spinner />}
                {jobStatusLabel(job)}
              </span>
            </div>
            <div className="ai-review-stats">
              <div>
                <b>
                  {job.generated}
                  <span>/{job.settings.count}</span>
                </b>
                <small>Câu đã tạo</small>
              </div>
              <div>
                <b>{pending.length}</b>
                <small>Chờ quyết định</small>
              </div>
              <div>
                <b>{job.approved}</b>
                <small>Đã vào ngân hàng</small>
              </div>
              <div>
                <b>{job.rejected}</b>
                <small>Đã từ chối</small>
              </div>
            </div>
            {working && (
              <div className="ai-progress" role="status">
                <div>
                  <span>
                    {job.regenerateId
                      ? 'Đang viết lại câu hỏi theo yêu cầu của bạn…'
                      : `Đang tạo ${job.generated}/${job.settings.count} câu hỏi…`}
                  </span>
                  <small>Bạn có thể rời trang và mở lại từ lịch sử.</small>
                </div>
                <progress
                  max={job.settings.count}
                  value={job.regenerateId ? undefined : job.generated}
                />
              </div>
            )}
            {job.status === 'FAILED' && (
              <div className="ai-failure">
                <AlertCircle size={20} />
                <div>
                  <b>Đợt tạo chưa hoàn tất</b>
                  <p>{job.error}</p>
                </div>
                <button
                  className="btn btn-secondary"
                  disabled={busy || !config.data?.configured}
                  onClick={() => void action('/retry', {}).catch(() => {})}
                >
                  <RefreshCw size={16} />
                  Thử lại
                </button>
              </div>
            )}
            <details className="ai-source-details">
              <summary>
                <BookOpen size={16} />
                {sourceLabels[job.source.kind]} · {job.source.name || 'Kiến thức theo chủ đề'}
                <span>{job.model}</span>
              </summary>
              {job.source.text ? (
                <pre>{job.source.text}</pre>
              ) : (
                <p>
                  Tạo dựa trên chủ đề và yêu cầu:{' '}
                  {job.settings.instructions || 'Không có yêu cầu bổ sung.'}
                </p>
              )}
            </details>
          </section>
          <div className="ai-review-toolbar">
            <div className="ai-review-tabs" role="group" aria-label="Lọc trạng thái câu hỏi">
              {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((status) => (
                <button
                  className={filter === status ? 'active' : ''}
                  key={status}
                  onClick={() => setFilter(status)}
                >
                  {status === 'ALL'
                    ? 'Tất cả'
                    : status === 'PENDING'
                      ? 'Chờ duyệt'
                      : status === 'APPROVED'
                        ? 'Đã duyệt'
                        : 'Từ chối'}
                  <span>
                    {status === 'ALL'
                      ? job.items.length
                      : job.items.filter((q) => q.status === status).length}
                  </span>
                </button>
              ))}
            </div>
            <Link href="/questions" className="text-link">
              <LibraryBig size={16} />
              Mở ngân hàng
              <ArrowRight size={15} />
            </Link>
          </div>
          {pending.length > 0 && (
            <div className="ai-selection">
              <label>
                <input
                  type="checkbox"
                  checked={
                    pending.length > 0 && pending.every((item) => selected.includes(item.id))
                  }
                  disabled={busy || working}
                  onChange={(e) =>
                    setSelected(e.target.checked ? pending.map((item) => item.id) : [])
                  }
                />
                Chọn tất cả câu chờ duyệt
              </label>
              <div>
                <span>{selected.length} đã chọn</span>
                <button
                  className="btn btn-secondary"
                  disabled={!selected.length || busy || working}
                  onClick={() => void decide('reject', selected)}
                >
                  <X size={16} />
                  Từ chối
                </button>
                <button
                  className="btn btn-primary"
                  disabled={!selected.length || busy || working}
                  onClick={() => void decide('approve', selected)}
                >
                  {busy ? <Spinner /> : <CheckCheck size={17} />}Duyệt đã chọn
                </button>
              </div>
            </div>
          )}
          <div className="ai-review-grid">
            {filtered.map((item) => (
              <article
                key={item.id}
                className={`panel ai-question-card ${item.status === 'REJECTED' ? 'ai-rejected' : ''}`}
              >
                <div className="ai-card-header">
                  <label>
                    <input
                      type="checkbox"
                      aria-label={`Chọn câu ${job.items.indexOf(item) + 1}`}
                      disabled={busy || working || item.status !== 'PENDING'}
                      checked={selected.includes(item.id)}
                      onChange={(e) =>
                        setSelected((ids) =>
                          e.target.checked ? [...ids, item.id] : ids.filter((id) => id !== item.id),
                        )
                      }
                    />
                    <b>Câu {String(job.items.indexOf(item) + 1).padStart(2, '0')}</b>
                    <small>Bản {item.revision}</small>
                  </label>
                  <span className={`ai-candidate-status ai-candidate-${item.status.toLowerCase()}`}>
                    {item.status === 'APPROVED' && <Check size={14} />}
                    {candidateLabels[item.status]}
                  </span>
                </div>
                <QuestionPreview value={item.content} showAnswers />
                {item.evidence && (
                  <details className="ai-evidence">
                    <summary>
                      <Quote size={15} />
                      Đối chiếu tài liệu nguồn
                    </summary>
                    <blockquote>{item.evidence}</blockquote>
                  </details>
                )}
                <div className="ai-card-actions">
                  {item.status === 'PENDING' && (
                    <>
                      <button
                        className="btn btn-primary"
                        disabled={busy || working}
                        onClick={() => void decide('approve', [item.id])}
                      >
                        <Check size={16} />
                        Approve
                      </button>
                      <button
                        className="btn btn-secondary"
                        disabled={busy || working}
                        onClick={() => setEditing(item)}
                      >
                        <PenLine size={15} />
                        Edit
                      </button>
                    </>
                  )}
                  {item.status !== 'APPROVED' && (
                    <button
                      className="btn btn-secondary"
                      disabled={busy || working || !config.data?.configured}
                      onClick={() => {
                        setRegenerating(item);
                        setFeedback('');
                      }}
                    >
                      <RefreshCw size={15} />
                      Regenerate
                    </button>
                  )}
                  {item.status === 'PENDING' && (
                    <button
                      className="ai-reject-btn"
                      disabled={busy || working}
                      onClick={() => void decide('reject', [item.id])}
                    >
                      <X size={16} />
                      Reject
                    </button>
                  )}
                  {item.status === 'APPROVED' && (
                    <span className="ai-approved-note">
                      <ShieldCheck size={17} />
                      Sẵn sàng sử dụng trong đề thi
                    </span>
                  )}
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && (
            <Empty
              icon={working ? <Spinner /> : <Sparkles size={28} />}
              title={working ? 'AI đang soạn câu hỏi…' : 'Chưa có câu hỏi ở trạng thái này'}
              description={
                working
                  ? 'Kết quả sẽ xuất hiện theo từng nhóm 5 câu. Không cần giữ trang này mở.'
                  : 'Chọn bộ lọc khác để tiếp tục duyệt.'
              }
            />
          )}
        </>
      )}
      {regenerating && (
        <Modal
          title="Viết lại câu hỏi"
          description="Bản hiện tại được giữ nguyên nếu AI gặp lỗi. Bản mới cần được duyệt lại."
          close={() => {
            if (!busy) setRegenerating(null);
          }}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await action(`/items/${regenerating.id}/regenerate`, { feedback });
                setRegenerating(null);
              } catch {}
            }}
          >
            <p className="ai-regenerate-question">{regenerating.content.question}</p>
            <Field
              label="Bạn muốn thay đổi điều gì?"
              hint="Ví dụ: Dùng tình huống thực tế, làm đáp án nhiễu khó hơn."
            >
              <textarea
                rows={4}
                maxLength={1000}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Yêu cầu bổ sung (không bắt buộc)…"
              />
            </Field>
            <ErrorBox message={error} />
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setRegenerating(null)}
              >
                Hủy
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? <Spinner /> : <RefreshCw size={16} />}Tạo lại câu hỏi
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
