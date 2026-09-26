'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Archive,
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  Eye,
  FilePenLine,
  LockKeyhole,
  Play,
  Plus,
  Search,
  Send,
  Shuffle,
  Target,
  Users,
  Sparkles,
} from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import {
  displayDate,
  examStatusLabels,
  runStatusLabels,
  type Exam,
  type ExamRun,
  type RunSummary,
  type StudentExam,
} from '@/lib/exams';
import { Empty, ErrorBox, Field, Loading, Modal, SectionTitle, Spinner } from './ui';
import type { Notify } from './workspace';
import { ExamEditor } from './exams/exam-editor';
import { ExamPlayer, RunResult } from './exams/exam-player';
import { QuestionPreview } from './questions/question-preview';

export function ExamManagement({ notify }: { notify: Notify }) {
  const [editor, setEditor] = useState<Exam | 'new' | null>(null);
  const [detail, setDetail] = useState<Exam | null>(null);
  const [submissions, setSubmissions] = useState<Exam | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const params = new URLSearchParams({ search, page: String(page) });
  if (status) params.set('status', status);
  const list = useQuery<{ exams: Exam[]; total: number; pages: number }>(`/exams?${params}`);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [editor, submissions]);
  async function open(id: string, edit = false) {
    setBusy(true);
    try {
      const exam = await api<Exam>(`/exams/${id}`);
      if (edit) setEditor(exam);
      else setDetail(exam);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function action(exam: Exam, action: 'publish' | 'archive' | 'duplicate') {
    if (
      action === 'archive' &&
      !window.confirm(
        'Lưu trữ đề sẽ chặn lượt thi mới. Các lượt đang làm vẫn được tiếp tục đến hạn. Tiếp tục?',
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const result = await api<Exam>(`/exams/${exam.id}/${action}`, {
        method: 'POST',
        body: jsonBody({ version: exam.version }),
      });
      setDetail(null);
      list.reload();
      if (action === 'duplicate') setEditor(result);
      notify(
        action === 'publish'
          ? 'Đã phát hành đề thi theo lịch và quyền truy cập đã chọn.'
          : action === 'archive'
            ? 'Đã lưu trữ đề thi.'
            : 'Đã tạo bản sao. Chọn lịch thi và đối tượng trước khi phát hành.',
      );
    } catch (e) {
      setError((e as Error).message);
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (editor)
    return (
      <ExamEditor
        key={editor === 'new' ? 'new' : editor.id}
        initial={editor === 'new' ? null : editor}
        close={() => setEditor(null)}
        saved={() => {
          setEditor(null);
          list.reload();
          notify('Đã lưu bản nháp. Mở xem trước để phát hành đề.');
        }}
      />
    );
  if (submissions) return <ExamSubmissions exam={submissions} close={() => setSubmissions(null)} />;
  return (
    <>
      <SectionTitle
        eyebrow="DESIGN. ASSESS. INSPIRE."
        title="Đề thi & kiểm tra"
        description="Thiết kế bài đánh giá phù hợp, từ từng câu hỏi đến trải nghiệm làm bài."
        action={
          <div className="ai-heading-actions">
            <Link className="btn btn-secondary" href="/ai-exams">
              <Sparkles size={17} /> Tạo bằng AI
            </Link>
            <button className="btn btn-primary" onClick={() => setEditor('new')}>
              <Plus size={18} /> Tạo đề thi
            </button>
          </div>
        }
      />
      <div className="exam-builder-banner">
        <span className="exam-banner-symbol">
          <ClipboardList size={38} />
        </span>
        <div>
          <span>EXAM BUILDER</span>
          <h2>Một đề thi tốt bắt đầu từ cấu trúc rõ ràng.</h2>
          <p>
            Chọn thủ công hoặc random theo 4 mức độ khó. Kiểm soát thời gian, lượt thi và quyền truy
            cập.
          </p>
        </div>
        <div className="exam-banner-facts">
          <b>04</b>
          <span>Mức độ khó</span>
          <b>08</b>
          <span>Dạng câu hỏi</span>
        </div>
      </div>
      <div className="exam-list-toolbar">
        <div className="exam-status-tabs">
          <button
            className={!status ? 'active' : ''}
            onClick={() => {
              setStatus('');
              setPage(1);
            }}
          >
            Tất cả <span>{list.data?.total ?? 0}</span>
          </button>
          {Object.entries(examStatusLabels).map(([key, label]) => (
            <button
              className={status === key ? 'active' : ''}
              key={key}
              onClick={() => {
                setStatus(key);
                setPage(1);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Tìm đề thi"
            placeholder="Tìm theo tên đề…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>
      </div>
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorBox message={list.error} retry={list.reload} />
      ) : !list.data?.exams.length ? (
        <section className="panel">
          <Empty
            title="Không có đề thi phù hợp"
            description="Tạo đề đầu tiên từ Question Bank hoặc thử thay đổi bộ lọc."
            icon={<ClipboardList size={30} />}
            action={
              <button className="btn btn-primary" onClick={() => setEditor('new')}>
                <Plus size={17} /> Tạo đề thi
              </button>
            }
          />
        </section>
      ) : (
        <div className="exam-card-grid">
          {list.data.exams.map((exam) => (
            <article className="panel exam-card" key={exam.id}>
              <div className="exam-card-top">
                <span className="exam-card-icon">
                  <ClipboardList size={24} />
                </span>
                <span className={`exam-state ${exam.status.toLowerCase()}`}>
                  {examStatusLabels[exam.status]}
                </span>
                <button
                  className="icon-btn"
                  aria-label={`Nhân bản ${exam.title}`}
                  title="Nhân bản đề"
                  disabled={busy}
                  onClick={() => action(exam, 'duplicate')}
                >
                  <Copy size={16} />
                </button>
              </div>
              <span className="exam-card-subject">{exam.subject}</span>
              <button className="exam-card-title" disabled={busy} onClick={() => open(exam.id)}>
                {exam.title}
              </button>
              <p>{exam.description || 'Chưa có mô tả cho đề thi này.'}</p>
              <div className="exam-card-metrics">
                <span>
                  <ClipboardList size={15} />
                  <b>{exam.questionCount}</b> câu
                </span>
                <span>
                  <Clock3 size={15} />
                  <b>{exam.settings.durationMinutes}</b> phút
                </span>
                <span>
                  <Target size={15} />
                  <b>{exam.settings.passScore}%</b> đạt
                </span>
              </div>
              <div className="exam-card-schedule">
                <span>Mở: {displayDate(exam.settings.startsAt)}</span>
                <span>Đóng: {displayDate(exam.settings.endsAt)}</span>
              </div>
              <div className="exam-card-chips">
                <span>
                  {exam.mode === 'AUTO' ? <Shuffle size={13} /> : <FilePenLine size={13} />}
                  {exam.mode === 'AUTO' ? 'Tạo tự động' : 'Thủ công'}
                </span>
                <span>
                  <Users size={13} />
                  {exam.settings.access === 'ALL'
                    ? 'Tất cả Student'
                    : `${exam.settings.classIds.length} lớp · ${exam.settings.studentIds.length} học sinh`}
                </span>
                {exam.hasPassword && (
                  <span>
                    <LockKeyhole size={13} /> Có mã
                  </span>
                )}
              </div>
              <footer>
                <button
                  className="btn btn-secondary small"
                  disabled={busy}
                  onClick={() => setSubmissions(exam)}
                >
                  Bài làm
                </button>
                {exam.status === 'DRAFT' ? (
                  <button
                    className="btn btn-primary small"
                    disabled={busy}
                    onClick={() => open(exam.id, true)}
                  >
                    <FilePenLine size={16} /> Chỉnh sửa
                  </button>
                ) : (
                  <button
                    className="btn btn-primary small"
                    disabled={busy}
                    onClick={() => open(exam.id)}
                  >
                    <Eye size={16} /> Xem đề
                  </button>
                )}
              </footer>
            </article>
          ))}
        </div>
      )}
      {list.data && list.data.total > 0 && (
        <div className="table-pagination">
          <span>
            {list.data.total} đề · Trang {page}/{list.data.pages}
          </span>
          <div>
            <button
              className="btn btn-secondary small"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Trước
            </button>
            <button
              className="btn btn-secondary small"
              disabled={page >= list.data.pages}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </button>
          </div>
        </div>
      )}
      {detail && (
        <Modal
          wide
          title={detail.title}
          description={`${detail.subject} · ${detail.questionCount} câu · ${detail.totalPoints} điểm`}
          close={() => {
            if (!busy) setDetail(null);
          }}
        >
          <div className="exam-publish-summary">
            <div>
              <Clock3 size={19} />
              <b>{detail.settings.durationMinutes} phút</b>
              <span>{detail.settings.maxAttempts} lượt / học sinh</span>
            </div>
            <div>
              <Target size={19} />
              <b>Đạt {detail.settings.passScore}%</b>
              <span>{detail.hasPassword ? 'Yêu cầu mã truy cập' : 'Không yêu cầu mã'}</span>
            </div>
            <div>
              <Users size={19} />
              <b>{detail.settings.access === 'ALL' ? 'Tất cả Student' : 'Giới hạn đối tượng'}</b>
              <span>
                {detail.settings.classIds.length} lớp · {detail.settings.studentIds.length} học sinh
              </span>
            </div>
          </div>
          <p className="exam-field-note">
            Mở: {displayDate(detail.settings.startsAt)} · Đóng:{' '}
            {displayDate(detail.settings.endsAt)}
          </p>
          <div className="exam-settings-chips">
            {[
              [detail.settings.randomQuestions, 'Trộn câu'],
              [detail.settings.randomAnswers, 'Trộn đáp án'],
              [detail.settings.showAnswers, 'Xem đáp án sau nộp'],
              [detail.settings.allowBack, 'Quay lại câu trước'],
              [detail.settings.autoSubmit, 'Tự nộp khi hết giờ'],
            ].map(([enabled, label]) => (
              <span key={String(label)}>
                {enabled ? '✓' : '—'} {label}
              </span>
            ))}
          </div>
          <div className="exam-paper-preview">
            {detail.questions.map((q, i) => (
              <section key={q.questionId}>
                <div className="exam-paper-number">
                  Câu {i + 1} · {q.points} điểm · Ngân hàng v{q.version}
                </div>
                <QuestionPreview value={q.content} />
              </section>
            ))}
          </div>
          <ErrorBox message={error} />
          {detail.status === 'DRAFT' && (
            <p className="exam-field-note">
              Phát hành sẽ khóa nội dung và thiết lập. Học sinh được phép sẽ nhìn thấy đề trong danh
              sách; chỉ bắt đầu được trong lịch thi.
            </p>
          )}
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              disabled={busy || detail.status === 'ARCHIVED'}
              onClick={() => action(detail, 'archive')}
            >
              <Archive size={16} /> Lưu trữ
            </button>
            {detail.status === 'DRAFT' && (
              <>
                <button
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    setEditor(detail);
                    setDetail(null);
                  }}
                >
                  Sửa đề
                </button>
                <button
                  className="btn btn-primary"
                  disabled={busy || !detail.questionCount}
                  onClick={() => action(detail, 'publish')}
                >
                  {busy ? <Spinner /> : <Send size={16} />} Phát hành đề
                </button>
              </>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}
function ExamSubmissions({ exam, close }: { exam: Exam; close: () => void }) {
  const [page, setPage] = useState(1);
  const [run, setRun] = useState<ExamRun | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useQuery<{ runs: RunSummary[]; total: number; pages: number }>(
    `/exams/${exam.id}/submissions?page=${page}`,
  );
  async function open(id: string) {
    setBusy(true);
    setError('');
    try {
      setRun(await api<ExamRun>(`/exams/${exam.id}/submissions/${id}`));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (run)
    return (
      <RunResult
        key={`${run.id}-${run.revision}`}
        run={run}
        teacher
        changed={(value) => {
          setRun(value);
          list.reload();
        }}
        close={() => setRun(null)}
      />
    );
  return (
    <>
      <SectionTitle
        eyebrow="RESULTS & FEEDBACK"
        title={exam.title}
        description="Theo dõi lượt thi, xem bài làm và chấm câu tự luận."
        action={
          <button className="btn btn-secondary" onClick={close}>
            <ArrowLeft size={16} /> Đề thi
          </button>
        }
      />
      <ErrorBox message={error || list.error} />
      <section className="panel">
        {list.loading ? (
          <Loading />
        ) : !list.data?.runs.length ? (
          <Empty
            title="Chưa có bài làm"
            description="Các lượt thi sẽ xuất hiện sau khi học sinh bắt đầu làm bài."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>HỌC SINH</th>
                  <th>LƯỢT</th>
                  <th>TRẠNG THÁI</th>
                  <th>ĐIỂM</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.data.runs.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <b>{r.studentName}</b>
                    </td>
                    <td>{r.attemptNo}</td>
                    <td>{runStatusLabels[r.status]}</td>
                    <td>{r.scorePercent === null ? '—' : `${r.scorePercent}%`}</td>
                    <td>
                      <button
                        className="btn btn-secondary small"
                        disabled={busy}
                        onClick={() => open(r.id)}
                      >
                        Xem / chấm <ArrowUpRight size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="table-pagination">
          <span>{list.data?.total || 0} lượt thi</span>
          <div>
            <button
              className="btn btn-secondary small"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Trước
            </button>
            <button
              className="btn btn-secondary small"
              disabled={page >= (list.data?.pages || 1)}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </button>
            <button className="btn btn-secondary small" onClick={list.reload}>
              Làm mới
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
export function StudentExams({ notify }: { notify: Notify }) {
  const list = useQuery<{ exams: StudentExam[]; serverTime: string }>('/exams/student');
  const [run, setRun] = useState<ExamRun | null>(null);
  const [starting, setStarting] = useState<StudentExam | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!list.data?.serverTime) return;
    const server = Date.parse(list.data.serverTime);
    const anchor = performance.now();
    let active = true;
    const tick = () => {
      if (active) setNow(server + performance.now() - anchor);
    };
    void Promise.resolve().then(tick);
    const timer = setInterval(tick, 1000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [list.data?.serverTime]);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [run?.id]);
  async function start() {
    if (!starting) return;
    setBusy(true);
    setError('');
    try {
      setRun(
        await api<ExamRun>(`/exams/student/${starting.id}/start`, {
          method: 'POST',
          body: jsonBody({ password }),
        }),
      );
      setStarting(null);
      setPassword('');
      list.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    setBusy(true);
    try {
      setRun(await api<ExamRun>(`/exams/runs/${id}`));
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  if (run)
    return (
      <ExamPlayer
        key={run.id}
        initial={run}
        close={() => {
          setRun(null);
          list.reload();
        }}
      />
    );
  return (
    <>
      <SectionTitle
        eyebrow="READY FOR YOUR NEXT CHALLENGE?"
        title="Bài thi của tôi"
        description="Các bài kiểm tra dành cho bạn. Chuẩn bị sẵn sàng và bắt đầu khi đến giờ."
        action={
          <button className="btn btn-secondary" onClick={list.reload}>
            Làm mới
          </button>
        }
      />
      {list.loading ? (
        <Loading />
      ) : list.error ? (
        <ErrorBox message={list.error} retry={list.reload} />
      ) : !list.data?.exams.length ? (
        <section className="panel">
          <Empty
            title="Chưa có đề thi được giao"
            description="Đề thi sẽ xuất hiện khi giáo viên phát hành và cấp quyền cho bạn hoặc lớp của bạn."
            icon={<ClipboardList size={30} />}
          />
        </section>
      ) : (
        <div className="exam-card-grid">
          {list.data.exams.map((exam) => {
            const active = exam.runs.find((r) => r.status === 'RUNNING');
            const future = exam.settings.startsAt && Date.parse(exam.settings.startsAt) > now;
            const ended = exam.settings.endsAt && Date.parse(exam.settings.endsAt) <= now;
            const exhausted = exam.runs.length >= exam.settings.maxAttempts;
            return (
              <article className="panel exam-card" key={exam.id}>
                <div className="exam-card-top">
                  <span className="exam-card-icon">
                    <ClipboardList size={25} />
                  </span>
                  <span className="exam-state published">
                    {exam.status !== 'PUBLISHED'
                      ? 'Đã đóng'
                      : future
                        ? 'Sắp diễn ra'
                        : ended
                          ? 'Đã hết giờ'
                          : 'Đang mở'}
                  </span>
                  {exam.hasPassword && <LockKeyhole size={17} />}
                </div>
                <span className="exam-card-subject">{exam.subject}</span>
                <h2>{exam.title}</h2>
                <p>{exam.description}</p>
                <div className="exam-card-metrics">
                  <span>
                    <ClipboardList size={15} /> {exam.questionCount} câu
                  </span>
                  <span>
                    <Clock3 size={15} /> {exam.settings.durationMinutes} phút
                  </span>
                  <span>
                    <Target size={15} /> {exam.settings.passScore}% đạt
                  </span>
                </div>
                <div className="exam-card-schedule">
                  <span>Mở: {displayDate(exam.settings.startsAt)}</span>
                  <span>Đóng: {displayDate(exam.settings.endsAt)}</span>
                </div>
                <div className="exam-past-runs">
                  {exam.runs.map((r) => (
                    <button disabled={busy} key={r.id} onClick={() => open(r.id)}>
                      <span>
                        Lượt {r.attemptNo} · {runStatusLabels[r.status]}
                      </span>
                      <b>
                        {r.scorePercent === null ? (
                          <ArrowUpRight size={14} />
                        ) : (
                          `${r.scorePercent}%`
                        )}
                      </b>
                    </button>
                  ))}
                </div>
                <footer>
                  <small>
                    Đã dùng {exam.runs.length}/{exam.settings.maxAttempts} lượt
                  </small>
                  {active ? (
                    <button
                      className="btn btn-primary small"
                      disabled={busy}
                      onClick={() => open(active.id)}
                    >
                      <Play size={16} /> Tiếp tục làm
                    </button>
                  ) : (
                    <button
                      className="btn btn-primary small"
                      disabled={
                        busy || !!future || !!ended || exhausted || exam.status !== 'PUBLISHED'
                      }
                      onClick={() => {
                        setStarting(exam);
                        setError('');
                        setPassword('');
                      }}
                    >
                      <Play size={16} /> {exhausted ? 'Hết lượt thi' : 'Bắt đầu thi'}
                    </button>
                  )}
                </footer>
              </article>
            );
          })}
        </div>
      )}
      {starting && (
        <Modal
          title={starting.title}
          description={`${starting.questionCount} câu · ${starting.settings.durationMinutes} phút · Đạt ${starting.settings.passScore}%`}
          close={() => {
            if (!busy) setStarting(null);
          }}
        >
          <div className="exam-start-rules">
            <p>
              <Clock3 size={18} /> Đồng hồ bắt đầu ngay khi xác nhận, vẫn chạy khi bạn rời trang.
            </p>
            <p>
              <CheckCircle2 size={18} />{' '}
              {starting.settings.allowBack
                ? 'Có thể quay lại câu trước.'
                : 'Làm tuần tự, không được quay lại câu trước.'}
            </p>
            <p>
              <Send size={18} />{' '}
              {starting.settings.autoSubmit
                ? 'Tự nộp phần đã lưu khi hết giờ.'
                : 'Phải nộp trước khi hết giờ. Hết hạn chưa nộp sẽ không có điểm.'}
            </p>
          </div>
          {starting.hasPassword && (
            <Field label="Mã truy cập">
              <input
                type="password"
                autoComplete="off"
                maxLength={72}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </Field>
          )}
          <ErrorBox message={error} />
          <div className="modal-actions">
            <button className="btn btn-secondary" disabled={busy} onClick={() => setStarting(null)}>
              Để sau
            </button>
            <button
              className="btn btn-primary"
              disabled={busy || (starting.hasPassword && !password)}
              onClick={start}
            >
              {busy ? <Spinner /> : <Play size={17} />} Xác nhận bắt đầu
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
