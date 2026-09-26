'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileStack,
  History,
  LibraryBig,
  PenLine,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { api, ApiError, jsonBody } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import {
  examExample,
  examJobLabels,
  examWorking,
  sectionCounts,
  strategyLabels,
  type AIExamJob,
  type AIExamItem,
  type AIExamPlan,
} from '@/lib/ai-exams';
import type { AIStatus } from '@/lib/ai';
import type { Exam } from '@/lib/exams';
import type { QuestionMetadata } from '@/lib/questions';
import { Empty, ErrorBox, Field, Modal, Spinner } from './ui';
import { ExamPlanEditor } from './ai/exam-plan-editor';
import { QuestionEditor } from './questions/question-editor';
import { QuestionPreview } from './questions/question-preview';
import { ExamEditor } from './exams/exam-editor';
import type { Notify } from './workspace';

export function AIExamStudio({ notify }: { notify: Notify }) {
  const config = useQuery<AIStatus>('/ai/status');
  const metadata = useQuery<QuestionMetadata>('/questions/metadata');
  const [page, setPage] = useState(1);
  const history = useQuery<{ jobs: AIExamJob[]; total: number; pages: number }>(
    `/ai-exams?page=${page}`,
  );
  const [showHistory, setShowHistory] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [strategy, setStrategy] = useState<AIExamJob['strategy']>('HYBRID');
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');
  const request = useRef<{ key: string; id: string } | null>(null);
  const [job, setJob] = useState<AIExamJob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<AIExamItem | null>(null);
  const [replacing, setReplacing] = useState<AIExamItem | null>(null);
  const [feedback, setFeedback] = useState('');
  const [filter, setFilter] = useState(-1);
  const [confirmSave, setConfirmSave] = useState(false);
  const [exam, setExam] = useState<Exam | null>(null);
  const working = examWorking(job),
    pollingId = working ? job?.id : undefined;
  const reloadHistory = history.reload;
  useEffect(() => {
    if (!pollingId) return;
    let active = true,
      fetching = false;
    const poll = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const next = await api<AIExamJob>(`/ai-exams/${pollingId}`);
        if (active) {
          setJob((current) => (current?.id === next.id ? next : current));
          setError('');
          if (!examWorking(next)) reloadHistory();
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
  }, [pollingId, reloadHistory]);
  async function create() {
    if (busy) return;
    setBusy(true);
    setError('');
    const key = JSON.stringify({ prompt, strategy, language });
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    try {
      setJob(
        await api<AIExamJob>('/ai-exams', {
          method: 'POST',
          body: jsonBody({ prompt, strategy, language, requestId: request.current.id }),
        }),
      );
      history.reload();
      setFilter(-1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    setBusy(true);
    setError('');
    try {
      setJob(await api<AIExamJob>(`/ai-exams/${id}`));
      setShowHistory(false);
      setFilter(-1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function action(path: string, body: object = {}, method = 'POST', current = job) {
    if (!current) throw new Error('Chưa chọn đề.');
    try {
      const next = await api<AIExamJob>(`/ai-exams/${current.id}${path}`, {
        method,
        body: jsonBody({ version: current.version, ...body }),
      });
      setJob(next);
      history.reload();
      return next;
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        try {
          setJob(await api<AIExamJob>(`/ai-exams/${current.id}`));
        } catch {}
      }
      throw e;
    }
  }
  async function run(task: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await task();
    } catch (e) {
      setError((e as Error).message);
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function savePlan(plan: AIExamPlan, source: AIExamJob['strategy'], build: boolean) {
    await run(async () => {
      const next = await action('/plan', { plan, strategy: source }, 'PUT');
      if (build) await action('/build', {}, 'POST', next);
      else notify('Đã lưu cấu trúc đề.');
    });
  }
  async function saveExam() {
    await run(async () => {
      try {
        const result = await api<{ job: AIExamJob; exam: Exam }>(`/ai-exams/${job!.id}/save`, {
          method: 'POST',
          body: jsonBody({ version: job!.version }),
        });
        setJob(result.job);
        setConfirmSave(false);
        history.reload();
        notify('Đã lưu đề nháp và đưa các câu mới vào ngân hàng.');
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          try {
            setJob(await api<AIExamJob>(`/ai-exams/${job!.id}`));
            setConfirmSave(false);
          } catch {
            /* Keep the review available if the network is offline. */
          }
        }
        throw e;
      }
    });
  }
  if (exam)
    return (
      <ExamEditor
        key={exam.id}
        initial={exam}
        close={() => setExam(null)}
        saved={() => {
          setExam(null);
          notify('Đã cập nhật đề. Mở Đề thi & kiểm tra để phát hành.');
        }}
      />
    );
  if (editing && job?.plan)
    return (
      <QuestionEditor
        key={editing.id}
        initial={null}
        metadata={metadata.data}
        close={() => setEditing(null)}
        saved={() => {}}
        review={{
          content: {
            ...editing.content,
            subject: job.plan.subject,
            topicPath: [job.plan.sections[editing.section].topic],
          },
          save: async (content) => {
            await action(`/items/${editing.id}`, { content }, 'PUT');
            setEditing(null);
            notify('Đã lưu chỉnh sửa trong đề. Câu gốc trong ngân hàng được giữ nguyên.');
          },
        }}
      />
    );
  const plan = job?.plan;
  const counts = plan ? sectionCounts(plan) : [];
  const step = !job || (job.phase === 'PLAN' && !plan) ? 0 : job.status === 'PLANNED' ? 1 : 2;
  const editablePlan = job && plan && !working && job.status !== 'SAVED' && job.items.length === 0;
  return (
    <div className="ae-studio">
      <div className="ai-page-heading">
        <div>
          <span className="eyebrow">ASSESSMENT DESIGN / AI EXAM STUDIO</span>
          <h1>
            Từ ý tưởng đến một đề thi <Sparkles size={24} />
          </h1>
          <p>Mô tả mục tiêu. AI lên cấu trúc, chọn câu và hoàn thiện bài kiểm tra.</p>
        </div>
        <div className="ai-heading-actions">
          <button
            className="btn btn-secondary"
            onClick={() => {
              history.reload();
              setShowHistory(true);
            }}
            disabled={busy}
          >
            <History size={17} /> Lịch sử
          </button>
          {job && (
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => {
                setJob(null);
                setError('');
                request.current = null;
              }}
            >
              <Plus size={17} /> Đề mới
            </button>
          )}
        </div>
      </div>
      <ol className="ae-steps">
        {['Mô tả bài kiểm tra', 'Duyệt cấu trúc', 'Hoàn thiện & lưu đề'].map((label, i) => (
          <li className={i === step ? 'is-current' : i < step ? 'is-done' : ''} key={label}>
            <span>{i < step ? <Check size={16} /> : `0${i + 1}`}</span>
            {label}
          </li>
        ))}
      </ol>
      <ErrorBox message={error || config.error} />
      {!job && (
        <div className="ae-create-grid">
          <form
            className="ae-panel ae-prompt-panel"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="ae-panel-title">
              <span className="ae-symbol">
                <WandSparkles size={24} />
              </span>
              <div>
                <h2>Bạn muốn đánh giá điều gì?</h2>
                <p>Viết tự nhiên, như trao đổi với một trợ giảng.</p>
              </div>
            </div>
            <Field label="Yêu cầu bài kiểm tra">
              <textarea
                className="ae-prompt"
                required
                minLength={15}
                maxLength={4000}
                rows={12}
                placeholder={examExample}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </Field>
            <div className="ae-prompt-tools">
              <button type="button" className="text-link" onClick={() => setPrompt(examExample)}>
                <Sparkles size={14} /> Dùng ví dụ Java Backend
              </button>
              <small>{prompt.length}/4.000</small>
            </div>
            <div className="ae-fields">
              <Field label="Nguồn câu hỏi">
                <select
                  value={strategy}
                  onChange={(e) => setStrategy(e.target.value as AIExamJob['strategy'])}
                >
                  {Object.entries(strategyLabels).map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Ngôn ngữ câu hỏi">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'vi' | 'en')}
                >
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </Field>
            </div>
            <p className="ae-hint">
              {strategy === 'HYBRID'
                ? 'Ưu tiên câu phù hợp trong ngân hàng. AI sinh thêm phần còn thiếu.'
                : strategy === 'BANK_ONLY'
                  ? 'AI thiết kế cấu trúc; câu hỏi chỉ lấy từ ngân hàng của bạn.'
                  : 'AI tạo toàn bộ câu hỏi mới theo từng chủ đề.'}
            </p>
            {config.data && !config.data.configured && (
              <ErrorBox message="Dịch vụ AI chưa được cấu hình. Liên hệ Admin để bật tính năng." />
            )}
            <button
              className="btn btn-primary ae-create-button"
              disabled={busy || !config.data?.configured}
            >
              {busy ? <Spinner /> : <Sparkles size={18} />} Thiết kế cấu trúc với AI{' '}
              <ArrowRight size={17} />
            </button>
            <small className="ae-private">
              <ShieldCheck size={14} /> Bạn duyệt cấu trúc trước khi AI bắt đầu tạo câu hỏi.
            </small>
          </form>
          <aside className="ae-example">
            <span className="ae-example-caption">MỘT YÊU CẦU. MỘT ĐỀ THI HOÀN CHỈNH.</span>
            <h2>
              Java Backend
              <br />
              <em>Fresher Assessment</em>
            </h2>
            <div className="ae-example-facts">
              <span>
                <FileStack size={17} /> 50 câu
              </span>
              <span>
                <Clock3 size={17} /> 60 phút
              </span>
            </div>
            <span className="ae-example-label">VÍ DỤ PHÂN BỔ CHỦ ĐỀ</span>
            {[
              ['Java Core', 30, 15],
              ['Spring Boot', 30, 15],
              ['Database', 20, 10],
              ['Redis', 10, 5],
              ['Kafka', 10, 5],
            ].map(([label, pct, n], i) => (
              <div className="ae-example-row" key={label}>
                <div>
                  <span>{label}</span>
                  <b>
                    {pct}% <small>· {n} câu</small>
                  </b>
                </div>
                <div className="ae-bar">
                  <span style={{ width: `${pct}%`, background: `var(--ae-color-${i})` }} />
                </div>
              </div>
            ))}
            <div className="ae-example-note">
              <LibraryBig size={19} />
              <p>
                Câu hỏi đã có + kiến thức AI.
                <br />
                <strong>Một ma trận nhất quán với mục tiêu.</strong>
              </p>
            </div>
            <p className="ae-hint">Tối đa 100 câu · 8 dạng câu hỏi · 4 mức độ khó</p>
          </aside>
        </div>
      )}
      {job && (
        <>
          <div className="ae-job-strip">
            <div>
              <span className="qb-badge">{examJobLabels[job.status]}</span>
              <span>{strategyLabels[job.strategy]}</span>
            </div>
            <small>{new Date(job.createdAt).toLocaleString('vi-VN')}</small>
          </div>
          {working && (
            <div className="ae-panel ae-progress" role="status">
              <span className="ae-progress-icon">
                <Spinner />
              </span>
              <h2>
                {job.phase === 'PLAN'
                  ? 'AI đang thiết kế cấu trúc đề…'
                  : job.phase === 'REPLACE'
                    ? 'Đang tạo câu thay thế…'
                    : 'Đang ghép câu hỏi cho bài kiểm tra…'}
              </h2>
              <p>
                {job.phase === 'PLAN'
                  ? 'Phân tích chủ đề, tỷ lệ và mức độ phù hợp với yêu cầu của bạn.'
                  : `${job.generated} / ${plan?.count || 0} câu đã sẵn sàng · ${job.fromBank} câu từ ngân hàng`}
              </p>
              {job.phase !== 'PLAN' && <progress max={plan?.count || 1} value={job.generated} />}
              <small>Bạn có thể rời trang và mở lại từ Lịch sử. Tiến độ được lưu tự động.</small>
            </div>
          )}
          {job.status === 'FAILED' && (
            <div className="ae-panel ae-failure">
              <ErrorBox message={job.error} />
              <button
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => void run(() => action('/retry'))}
              >
                {busy ? <Spinner /> : <RefreshCw size={16} />} Thử lại phần còn thiếu
              </button>
              {job.strategy === 'BANK_ONLY' && !job.items.length && job.phase === 'BUILD' && (
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => void run(() => action('/retry', { strategy: 'HYBRID' }))}
                >
                  <Sparkles size={16} /> Cho AI bổ sung câu thiếu
                </button>
              )}
            </div>
          )}
          {editablePlan && (
            <ExamPlanEditor
              key={`${job.id}-${job.version}`}
              job={job}
              busy={busy}
              save={savePlan}
            />
          )}
          {plan && !editablePlan && (
            <>
              <div className="ae-panel ae-review-header">
                <div>
                  <span className="eyebrow">
                    {job.status === 'SAVED' ? 'ĐÃ LƯU VÀO EXAM BUILDER' : 'BẢN ĐỀ CHỜ BẠN DUYỆT'}
                  </span>
                  <h2>{plan.title}</h2>
                  <p>{plan.description}</p>
                </div>
                <div className="ae-review-facts">
                  <span>
                    <FileStack size={17} />
                    <b>
                      {job.generated}/{plan.count}
                    </b>{' '}
                    câu
                  </span>
                  <span>
                    <Clock3 size={17} />
                    <b>{plan.durationMinutes}</b> phút
                  </span>
                  <span>
                    <ShieldCheck size={17} />
                    Đạt <b>{plan.passScore}%</b>
                  </span>
                </div>
                <div className="ae-distribution">
                  {plan.sections.map((s, i) => (
                    <span
                      key={s.topic}
                      title={`${s.topic}: ${counts[i]} câu`}
                      style={{ flexGrow: s.percentage, background: `var(--ae-color-${i % 5})` }}
                    />
                  ))}
                </div>
                <div className="ae-legend">
                  {plan.sections.map((s, i) => (
                    <span key={s.topic}>
                      <i style={{ background: `var(--ae-color-${i % 5})` }} />
                      {s.topic} <b>{counts[i]}</b>
                    </span>
                  ))}
                </div>
                {job.status === 'REVIEW' && (
                  <div className="ae-review-save">
                    <p>
                      Duyệt nội dung và đáp án. Các câu AI hoặc đã sửa sẽ được lưu vào ngân hàng
                      cùng đề nháp.
                    </p>
                    <button
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() => setConfirmSave(true)}
                    >
                      <CheckCheck size={18} /> Duyệt & lưu đề nháp
                    </button>
                  </div>
                )}
                {job.status === 'SAVED' && (
                  <div className="ae-review-save">
                    <p>
                      Đề đã lưu. Cấu hình lớp học, lịch thi và quyền truy cập trước khi phát hành.
                    </p>
                    <button
                      className="btn btn-primary"
                      disabled={busy}
                      onClick={() =>
                        void run(async () => setExam(await api<Exam>(`/exams/${job.examId}`)))
                      }
                    >
                      <PenLine size={17} /> Cấu hình đề thi
                    </button>
                    <Link className="btn btn-secondary" href="/exams">
                      Danh sách đề <ArrowRight size={16} />
                    </Link>
                  </div>
                )}
              </div>
              {!!job.items.length && (
                <>
                  <div className="ae-question-toolbar">
                    <h3>
                      Câu hỏi trong đề <span>{job.items.length}</span>
                    </h3>
                    <label>
                      <span className="sr-only">Lọc chủ đề</span>
                      <select
                        aria-label="Lọc chủ đề"
                        value={filter}
                        onChange={(e) => setFilter(Number(e.target.value))}
                      >
                        <option value={-1}>Tất cả chủ đề</option>
                        {plan.sections.map((s, i) => (
                          <option value={i} key={s.topic}>
                            {s.topic}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="ae-question-list">
                    {[...job.items]
                      .sort((a, b) => a.section - b.section)
                      .map(
                        (item, index) =>
                          (filter < 0 || item.section === filter) && (
                            <article className="ae-panel ae-question" key={item.id}>
                              <div className="ae-question-top">
                                <b>Câu {index + 1}</b>
                                <span>{plan.sections[item.section].topic}</span>
                                <span
                                  className={`ae-origin ae-origin-${item.origin.toLowerCase()}`}
                                >
                                  {item.origin === 'BANK' ? (
                                    <LibraryBig size={13} />
                                  ) : (
                                    <Sparkles size={13} />
                                  )}
                                  {item.origin === 'BANK'
                                    ? 'Ngân hàng'
                                    : item.origin === 'AI'
                                      ? 'AI tạo mới'
                                      : 'Đã chỉnh sửa'}
                                </span>
                              </div>
                              <QuestionPreview value={item.content} />
                              {job.status === 'REVIEW' && (
                                <div className="ae-question-actions">
                                  <button
                                    className="btn btn-secondary"
                                    disabled={busy}
                                    onClick={() => setEditing(item)}
                                  >
                                    <PenLine size={15} /> Chỉnh sửa
                                  </button>
                                  {job.strategy !== 'BANK_ONLY' && (
                                    <button
                                      className="btn btn-secondary"
                                      disabled={busy}
                                      onClick={() => {
                                        setReplacing(item);
                                        setFeedback('');
                                      }}
                                    >
                                      <RefreshCw size={15} /> Tạo câu thay thế
                                    </button>
                                  )}
                                </div>
                              )}
                            </article>
                          ),
                      )}
                  </div>
                </>
              )}
            </>
          )}
        </>
      )}
      {showHistory && (
        <Modal
          title="Lịch sử tạo đề AI"
          description="Mở lại cấu trúc, theo dõi tiến độ hoặc tiếp tục duyệt đề."
          close={() => setShowHistory(false)}
          wide
        >
          <ErrorBox message={history.error} />
          {history.loading ? (
            <Spinner />
          ) : !history.data?.jobs.length ? (
            <Empty title="Chưa có đề AI" description="Mô tả bài kiểm tra đầu tiên để bắt đầu." />
          ) : (
            <div className="ae-history">
              {history.data.jobs.map((j) => (
                <button key={j.id} disabled={busy} onClick={() => void open(j.id)}>
                  <span className="ae-symbol">
                    <FileStack size={21} />
                  </span>
                  <div>
                    <b>{j.plan?.title || j.prompt.split('\n')[0]}</b>
                    <small>
                      {new Date(j.createdAt).toLocaleString('vi-VN')} · {j.generated}/
                      {j.plan?.count || '…'} câu
                    </small>
                  </div>
                  <span className="qb-badge">{examJobLabels[j.status]}</span>
                  <ArrowRight size={16} />
                </button>
              ))}
            </div>
          )}
          <div className="ae-pagination">
            <button
              className="icon-btn"
              aria-label="Trang trước"
              disabled={page === 1 || busy}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={19} />
            </button>
            <span>
              {page} / {history.data?.pages || 1}
            </span>
            <button
              className="icon-btn"
              aria-label="Trang sau"
              disabled={page >= (history.data?.pages || 1) || busy}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={19} />
            </button>
          </div>
        </Modal>
      )}
      {replacing && (
        <Modal
          title="Tạo câu thay thế"
          description="AI tạo câu mới cùng chủ đề, độ khó và dạng câu. Câu hiện tại được giữ lại nếu yêu cầu thất bại."
          close={() => {
            if (!busy) setReplacing(null);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(async () => {
                await action(`/items/${replacing.id}/replace`, { feedback });
                setReplacing(null);
              });
            }}
          >
            <Field label="Góp ý cho câu mới (tùy chọn)">
              <textarea
                rows={4}
                maxLength={1000}
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="Ví dụ: thêm tình huống thực tế về xử lý transaction…"
              />
            </Field>
            <ErrorBox message={error} />
            <div className="ae-footer-actions">
              <button
                type="button"
                className="btn btn-secondary"
                disabled={busy}
                onClick={() => setReplacing(null)}
              >
                Hủy
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? <Spinner /> : <Sparkles size={17} />} Tạo câu mới
              </button>
            </div>
          </form>
        </Modal>
      )}
      {confirmSave && job && (
        <Modal
          title="Duyệt và lưu đề nháp?"
          description={`${job.generated} câu sẽ được đưa vào đề. ${job.generated - job.fromBank} câu mới hoặc đã sửa sẽ được thêm vào Question Bank ở trạng thái Sẵn sàng.`}
          close={() => {
            if (!busy) setConfirmSave(false);
          }}
        >
          <p className="ae-hint">
            Mỗi câu mặc định 1 điểm. Bạn có thể điều chỉnh điểm, lịch thi, lớp học và các thiết lập
            khác trong Exam Builder.
          </p>
          <ErrorBox message={error} />
          <div className="ae-footer-actions">
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => setConfirmSave(false)}
            >
              <ArrowLeft size={16} /> Xem lại đề
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={() => void saveExam()}>
              {busy ? <Spinner /> : <CheckCheck size={17} />} Xác nhận lưu đề
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
