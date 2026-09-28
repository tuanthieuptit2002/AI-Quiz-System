'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  CalendarClock,
  ClipboardCheck,
  Clock3,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import { localDate, type Exam } from '@/lib/exams';
import {
  dueLabel,
  kindLabels,
  resultLabels,
  stateLabels,
  type Assignment,
  type AssignmentKind,
  type StudentAssignment,
} from '@/lib/classes';
import { Empty, ErrorBox, Field, Loading, Modal, Spinner } from '../ui';
import type { Notify } from '../workspace';

const overdue = (dueAt: string) => new Date(dueAt).getTime() <= Date.now();

function AssignmentMeta({ assignment }: { assignment: Assignment }) {
  const exam = assignment.exam;
  return (
    <div className="cd-assign-meta">
      <span className={overdue(assignment.dueAt) ? 'late' : ''}>
        <CalendarClock size={14} /> Hạn nộp {dueLabel(assignment.dueAt)}
      </span>
      {exam && (
        <>
          <span>
            <ClipboardCheck size={14} /> {exam.questionCount} câu
          </span>
          <span>
            <Clock3 size={14} /> {exam.durationMinutes} phút · {exam.maxAttempts} lượt
          </span>
        </>
      )}
    </div>
  );
}

export function TeacherAssignments({
  classId,
  kind,
  assignments,
  changed,
  notify,
}: {
  classId: string;
  kind: AssignmentKind;
  assignments: Assignment[];
  changed: () => void;
  notify: Notify;
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Assignment | null>(null);
  const [deleting, setDeleting] = useState<Assignment | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rows = assignments.filter((a) => a.kind === kind);
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const values = new FormData(event.currentTarget);
    const due = String(values.get('dueAt'));
    setBusy(true);
    setError('');
    try {
      await api(`/teacher/classes/${classId}/assignments/${editing.id}`, {
        method: 'PATCH',
        body: jsonBody({
          kind: values.get('kind'),
          ...(due !== localDate(editing.dueAt) && { dueAt: new Date(due).toISOString() }),
        }),
      });
      notify('Đã cập nhật bài đã giao.');
      setEditing(null);
      changed();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError('');
    try {
      await api(`/teacher/classes/${classId}/assignments/${deleting.id}`, { method: 'DELETE' });
      notify('Đã gỡ bài khỏi lớp. Bài làm đã nộp vẫn được giữ.');
      setDeleting(null);
      changed();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel cd-panel">
      <div className="panel-heading">
        <div>
          <h2>{kindLabels[kind]}</h2>
          <p>Giao đề đã phát hành cho cả lớp và đặt hạn nộp.</p>
        </div>
        <button
          className="btn btn-primary"
          onClick={() => {
            setError('');
            setAdding(true);
          }}
        >
          <Plus size={17} /> Giao {kindLabels[kind].toLowerCase()}
        </button>
      </div>
      {rows.length ? (
        <div className="cd-assign-list">
          {rows.map((assignment) => (
            <article key={assignment.id} className="cd-assign">
              <div className="cd-assign-main">
                <div className="cd-assign-title">
                  <b>{assignment.exam?.title || 'Đề thi không còn tồn tại'}</b>
                  {assignment.exam && assignment.exam.status !== 'PUBLISHED' && (
                    <span className="cd-chip muted-chip">Đề đã đóng</span>
                  )}
                  {overdue(assignment.dueAt) && <span className="cd-chip late">Đã quá hạn</span>}
                </div>
                {assignment.exam && <small>{assignment.exam.subject}</small>}
                <AssignmentMeta assignment={assignment} />
              </div>
              <div className="cd-row-actions">
                <button
                  className="icon-btn"
                  aria-label="Sửa hạn nộp"
                  onClick={() => {
                    setError('');
                    setEditing(assignment);
                  }}
                >
                  <Pencil size={15} />
                </button>
                <button
                  className="icon-btn danger-text"
                  aria-label="Gỡ bài khỏi lớp"
                  onClick={() => {
                    setError('');
                    setDeleting(assignment);
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Empty
          icon={<ClipboardCheck size={28} />}
          title={`Chưa giao ${kindLabels[kind].toLowerCase()} nào`}
          description="Chọn một đề đã phát hành trong mục Đề thi & kiểm tra để giao cho lớp."
        />
      )}
      {adding && (
        <AssignModal
          classId={classId}
          kind={kind}
          assigned={assignments.map((a) => a.exam?.id).filter(Boolean) as string[]}
          close={() => setAdding(false)}
          done={() => {
            setAdding(false);
            changed();
            notify('Đã giao bài cho lớp.');
          }}
        />
      )}
      {editing && (
        <Modal
          title="Sửa bài đã giao"
          description={editing.exam?.title}
          close={() => setEditing(null)}
        >
          <ErrorBox message={error} />
          <form className="stack-form" onSubmit={update}>
            <Field label="Loại">
              <select name="kind" defaultValue={editing.kind}>
                <option value="QUIZ">{kindLabels.QUIZ}</option>
                <option value="EXAM">{kindLabels.EXAM}</option>
              </select>
            </Field>
            <Field label="Hạn nộp">
              <input
                name="dueAt"
                type="datetime-local"
                defaultValue={localDate(editing.dueAt)}
                required
              />
            </Field>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                Hủy
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? <Spinner /> : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Gỡ bài khỏi lớp?"
          description={deleting.exam?.title}
          close={() => setDeleting(null)}
        >
          <ErrorBox message={error} />
          <p className="modal-description">
            Học sinh sẽ không còn thấy bài này trong lớp. Các bài làm đã nộp vẫn được giữ nguyên.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
              Hủy
            </button>
            <button className="btn btn-danger" onClick={remove} disabled={busy}>
              {busy ? <Spinner /> : 'Gỡ bài'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function AssignModal({
  classId,
  kind,
  assigned,
  close,
  done,
}: {
  classId: string;
  kind: AssignmentKind;
  assigned: string[];
  close: () => void;
  done: () => void;
}) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [examId, setExamId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const exams = useQuery<{ exams: Exam[] }>(
    `/exams?status=PUBLISHED&search=${encodeURIComponent(query)}`,
  );
  const [minDue] = useState(() => localDate(new Date(Date.now() + 5 * 60000).toISOString()));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    if (!examId) {
      setError('Hãy chọn một đề thi.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api(`/teacher/classes/${classId}/assignments`, {
        method: 'POST',
        body: jsonBody({
          examId,
          kind: values.get('kind'),
          dueAt: new Date(String(values.get('dueAt'))).toISOString(),
        }),
      });
      done();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title={`Giao ${kindLabels[kind].toLowerCase()}`}
      description="Chỉ hiển thị đề bạn đã phát hành."
      close={close}
    >
      <ErrorBox message={error} />
      <form
        className="cd-exam-search"
        onSubmit={(event) => {
          event.preventDefault();
          setQuery(search.trim());
        }}
      >
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Tìm đề thi"
            placeholder="Tìm theo tên hoặc môn…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <button className="btn btn-secondary">Tìm</button>
      </form>
      <div className="cd-exam-picker" role="radiogroup" aria-label="Chọn đề thi">
        {exams.loading && !exams.data ? (
          <Loading />
        ) : exams.error ? (
          <ErrorBox message={exams.error} retry={exams.reload} />
        ) : exams.data?.exams.length ? (
          exams.data.exams.map((exam) => {
            const taken = assigned.includes(exam.id);
            return (
              <label
                key={exam.id}
                className={`${examId === exam.id ? 'selected' : ''} ${taken ? 'disabled' : ''}`}
              >
                <input
                  type="radio"
                  name="exam"
                  value={exam.id}
                  checked={examId === exam.id}
                  disabled={taken}
                  onChange={() => setExamId(exam.id)}
                />
                <span>
                  <b>{exam.title}</b>
                  <small>
                    {exam.subject} · {exam.questionCount} câu · {exam.settings.durationMinutes} phút
                  </small>
                </span>
                {taken && <em>Đã giao</em>}
              </label>
            );
          })
        ) : (
          <Empty
            icon={<ClipboardCheck size={26} />}
            title="Không có đề phù hợp"
            description="Phát hành đề trong mục Đề thi & kiểm tra rồi quay lại giao cho lớp."
          />
        )}
      </div>
      <form className="stack-form cd-assign-form" onSubmit={submit}>
        <div className="cd-assign-fields">
          <Field label="Loại">
            <select name="kind" defaultValue={kind}>
              <option value="QUIZ">{kindLabels.QUIZ}</option>
              <option value="EXAM">{kindLabels.EXAM}</option>
            </select>
          </Field>
          <Field label="Hạn nộp">
            <input name="dueAt" type="datetime-local" min={minDue} required />
          </Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-secondary" onClick={close}>
            Hủy
          </button>
          <button className="btn btn-primary" disabled={busy}>
            {busy ? <Spinner /> : 'Giao bài'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function StudentAssignments({
  kind,
  assignments,
}: {
  kind: AssignmentKind;
  assignments: StudentAssignment[];
}) {
  const rows = assignments.filter((a) => a.kind === kind);
  return (
    <section className="panel cd-panel">
      <div className="panel-heading">
        <div>
          <h2>{kindLabels[kind]}</h2>
          <p>Hoàn thành trước hạn nộp để được tính kết quả trong lớp.</p>
        </div>
      </div>
      {rows.length ? (
        <div className="cd-assign-list">
          {rows.map((assignment) => {
            const open = assignment.state === 'OPEN' || assignment.state === 'RUNNING';
            return (
              <article key={assignment.id} className="cd-assign">
                <div className="cd-assign-main">
                  <div className="cd-assign-title">
                    <b>{assignment.exam?.title || 'Đề thi không còn tồn tại'}</b>
                    <span className={`cd-chip state-${assignment.state.toLowerCase()}`}>
                      {stateLabels[assignment.state]}
                    </span>
                  </div>
                  {assignment.exam && <small>{assignment.exam.subject}</small>}
                  <AssignmentMeta assignment={assignment} />
                  <div className="cd-mine">
                    <span>{resultLabels[assignment.mine.status]}</span>
                    <span>
                      Lượt đã dùng: {assignment.mine.attempts}
                      {assignment.exam ? `/${assignment.exam.maxAttempts}` : ''}
                    </span>
                    {assignment.mine.bestScore !== null && (
                      <span>
                        Điểm cao nhất: <b>{assignment.mine.bestScore}%</b>
                      </span>
                    )}
                  </div>
                </div>
                {open && assignment.exam && (
                  <Link className="btn btn-primary" href={`/exams?exam=${assignment.exam.id}`}>
                    {assignment.state === 'RUNNING' ? 'Tiếp tục' : 'Làm bài'}{' '}
                    <ArrowUpRight size={16} />
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={<ClipboardCheck size={28} />}
          title={`Chưa có ${kindLabels[kind].toLowerCase()}`}
          description="Khi giáo viên giao bài, bài sẽ xuất hiện tại đây kèm hạn nộp."
        />
      )}
    </section>
  );
}
