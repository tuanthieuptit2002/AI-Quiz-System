'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  BookOpen,
  ClipboardCheck,
  Copy,
  FileText,
  GraduationCap,
  Layers,
  Link2,
  RefreshCw,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import type { Role, User } from '@/lib/types';
import {
  inviteLink,
  kindLabels,
  type AssignmentKind,
  type StudentClass,
  type TeacherClass,
} from '@/lib/classes';
import { Avatar, Empty, ErrorBox, Field, Loading, Modal, Spinner } from '../ui';
import type { Notify } from '../workspace';
import { LessonList } from './class-lessons';
import { StudentAssignments, TeacherAssignments } from './class-assignments';
import { ClassResults } from './class-results';

type Tab = 'students' | 'lessons' | AssignmentKind | 'results';

export function ClassDetail({ id, role, notify }: { id: string; role: Role; notify: Notify }) {
  return role === 'TEACHER' ? (
    <TeacherClassDetail id={id} notify={notify} />
  ) : (
    <StudentClassDetail id={id} />
  );
}

function BackLink() {
  return (
    <Link href="/classes" className="cd-back">
      <ArrowLeft size={16} /> Lớp học của tôi
    </Link>
  );
}

function Tabs({
  tabs,
  active,
  change,
}: {
  tabs: { key: Tab; label: string; count?: number }[];
  active: Tab;
  change: (tab: Tab) => void;
}) {
  return (
    <div className="exam-status-tabs cd-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={active === tab.key}
          className={active === tab.key ? 'active' : ''}
          onClick={() => change(tab.key)}
        >
          {tab.label}
          {tab.count !== undefined && <span>{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

async function copy(text: string, notify: Notify, done: string) {
  try {
    await navigator.clipboard.writeText(text);
    notify(done);
  } catch {
    notify(text);
  }
}

function TeacherClassDetail({ id, notify }: { id: string; notify: Notify }) {
  const { data, error, loading, reload } = useQuery<TeacherClass>(`/teacher/classes/${id}`);
  const [tab, setTab] = useState<Tab>('students');
  const [resetting, setResetting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  if (loading && !data) return <Loading />;
  if (error && !data)
    return (
      <>
        <BackLink />
        <ErrorBox message={error} retry={reload} />
      </>
    );
  if (!data) return null;
  const { classroom, course, lessons, assignments } = data;
  const link = inviteLink(classroom.code);
  const count = (kind: AssignmentKind) => assignments.filter((a) => a.kind === kind).length;
  async function resetCode() {
    setBusy(true);
    setResetError('');
    try {
      await api(`/teacher/classes/${id}/code`, { method: 'POST' });
      setResetting(false);
      reload();
      notify('Đã đổi mã mời. Mã và link cũ không còn dùng được.');
    } catch (error) {
      setResetError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <BackLink />
      <section className={`cd-hero ${classroom.color}`}>
        <div className="cd-hero-main">
          <span className="cd-hero-icon">
            <BookOpen size={26} strokeWidth={1.6} />
          </span>
          <div>
            <div className="cd-hero-tags">
              <span>{classroom.subject}</span>
              {course && (
                <span>
                  <Layers size={12} /> {course.title}
                </span>
              )}
            </div>
            <h1>{classroom.name}</h1>
            {classroom.description && <p>{classroom.description}</p>}
          </div>
        </div>
        <div className="cd-invite">
          <small>Mời học sinh</small>
          <div className="cd-invite-row">
            <b className="cd-code">{classroom.code}</b>
            <button
              className="icon-btn"
              aria-label="Sao chép mã lớp"
              onClick={() => copy(classroom.code, notify, 'Đã sao chép mã lớp.')}
            >
              <Copy size={15} />
            </button>
          </div>
          <div className="cd-invite-row">
            <span className="cd-link">{link}</span>
            <button
              className="icon-btn"
              aria-label="Sao chép link mời"
              onClick={() => copy(link, notify, 'Đã sao chép link mời.')}
            >
              <Link2 size={15} />
            </button>
          </div>
          <button
            className="cd-reset"
            onClick={() => {
              setResetError('');
              setResetting(true);
            }}
          >
            <RefreshCw size={13} /> Đổi mã mời
          </button>
        </div>
      </section>
      <div className="cd-stats">
        <span>
          <Users size={16} /> <b>{classroom.studentCount}</b> học sinh
        </span>
        <span>
          <FileText size={16} /> <b>{lessons.length}</b> bài học
        </span>
        <span>
          <ClipboardCheck size={16} /> <b>{count('QUIZ')}</b> bài kiểm tra
        </span>
        <span>
          <GraduationCap size={16} /> <b>{count('EXAM')}</b> bài thi
        </span>
      </div>
      <Tabs
        active={tab}
        change={setTab}
        tabs={[
          { key: 'students', label: 'Học sinh', count: classroom.studentCount },
          { key: 'lessons', label: 'Bài học', count: lessons.length },
          { key: 'QUIZ', label: kindLabels.QUIZ, count: count('QUIZ') },
          { key: 'EXAM', label: kindLabels.EXAM, count: count('EXAM') },
          { key: 'results', label: 'Kết quả' },
        ]}
      />
      {tab === 'students' && <ClassMembers classId={id} changed={reload} notify={notify} />}
      {tab === 'lessons' && (
        <LessonList classId={id} lessons={lessons} editable changed={reload} notify={notify} />
      )}
      {(tab === 'QUIZ' || tab === 'EXAM') && (
        <TeacherAssignments
          classId={id}
          kind={tab}
          assignments={assignments}
          changed={reload}
          notify={notify}
        />
      )}
      {tab === 'results' && <ClassResults classId={id} />}
      {resetting && (
        <Modal
          title="Đổi mã mời?"
          description={`Mã hiện tại: ${classroom.code}`}
          close={() => setResetting(false)}
        >
          <ErrorBox message={resetError} />
          <p className="modal-description">
            Mã và link mời cũ sẽ ngừng hoạt động. Học sinh đã ở trong lớp không bị ảnh hưởng.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setResetting(false)}>
              Hủy
            </button>
            <button className="btn btn-primary" onClick={resetCode} disabled={busy}>
              {busy ? <Spinner /> : 'Đổi mã'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function ClassMembers({
  classId,
  changed,
  notify,
}: {
  classId: string;
  changed: () => void;
  notify: Notify;
}) {
  const { data, error, loading, reload } = useQuery<{ students: User[] }>(
    `/teacher/classes/${classId}/students`,
  );
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setActionError('');
    try {
      await api(`/teacher/classes/${classId}/students`, {
        method: 'POST',
        body: jsonBody({ email: new FormData(form).get('email') }),
      });
      form.reset();
      reload();
      changed();
      notify('Đã thêm học sinh vào lớp.');
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    setRemoving(id);
    setActionError('');
    try {
      await api(`/teacher/classes/${classId}/students/${id}`, { method: 'DELETE' });
      reload();
      changed();
      notify('Đã gỡ học sinh khỏi lớp.');
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setRemoving(null);
    }
  }
  return (
    <section className="panel cd-panel">
      <form onSubmit={add} className="add-student-form">
        <Field label="Thêm học sinh bằng email">
          <input name="email" type="email" required placeholder="hocsinh@example.com" />
        </Field>
        <button className="btn btn-primary" disabled={busy} aria-label="Thêm học sinh">
          {busy ? <Spinner /> : <UserPlus size={18} />}
        </button>
      </form>
      <ErrorBox message={actionError} />
      <ErrorBox message={error} retry={reload} />
      {loading && !data ? (
        <Loading />
      ) : data?.students.length ? (
        <div className="member-list cd-members">
          {data.students.map((student) => (
            <div key={student.id}>
              <Avatar user={student} />
              <div>
                <b>{student.name}</b>
                <small>{student.email}</small>
              </div>
              <button
                className="icon-btn danger-text"
                aria-label={`Gỡ ${student.name} khỏi lớp`}
                disabled={removing === student.id}
                onClick={() => remove(student.id)}
              >
                {removing === student.id ? <Spinner /> : <X size={18} />}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon={<Users size={28} />}
          title="Chưa có thành viên"
          description="Thêm bằng email hoặc chia sẻ mã, link mời để học sinh tự tham gia."
        />
      )}
    </section>
  );
}

function StudentClassDetail({ id }: { id: string }) {
  const { data, error, loading, reload } = useQuery<StudentClass>(`/student/classes/${id}`);
  const [tab, setTab] = useState<Tab>('QUIZ');
  if (loading && !data) return <Loading />;
  if (error && !data)
    return (
      <>
        <BackLink />
        <ErrorBox message={error} retry={reload} />
      </>
    );
  if (!data) return null;
  const { classroom, lessons, assignments } = data;
  const count = (kind: AssignmentKind) => assignments.filter((a) => a.kind === kind).length;
  const pending = assignments.filter(
    (a) => a.state === 'RUNNING' || (a.state === 'OPEN' && !a.mine.submitted),
  ).length;
  return (
    <>
      <BackLink />
      <section className={`cd-hero ${classroom.color}`}>
        <div className="cd-hero-main">
          <span className="cd-hero-icon">
            <BookOpen size={26} strokeWidth={1.6} />
          </span>
          <div>
            <div className="cd-hero-tags">
              <span>{classroom.subject}</span>
              {classroom.courseTitle && (
                <span>
                  <Layers size={12} /> {classroom.courseTitle}
                </span>
              )}
            </div>
            <h1>{classroom.name}</h1>
            {classroom.description && <p>{classroom.description}</p>}
          </div>
        </div>
        <div className="cd-invite cd-teacher-box">
          <small>Giáo viên</small>
          <b>
            <GraduationCap size={17} /> {classroom.teacherName}
          </b>
          <small>
            <Trophy size={13} /> {pending} bài đang chờ bạn
          </small>
        </div>
      </section>
      <Tabs
        active={tab}
        change={setTab}
        tabs={[
          { key: 'QUIZ', label: kindLabels.QUIZ, count: count('QUIZ') },
          { key: 'EXAM', label: kindLabels.EXAM, count: count('EXAM') },
          { key: 'lessons', label: 'Bài học', count: lessons.length },
        ]}
      />
      {tab === 'lessons' && <LessonList classId={id} lessons={lessons} />}
      {(tab === 'QUIZ' || tab === 'EXAM') && (
        <StudentAssignments kind={tab} assignments={assignments} />
      )}
    </>
  );
}
