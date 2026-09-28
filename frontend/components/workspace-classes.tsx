'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import {
  BookOpen,
  Plus,
  Search,
  Users,
  ArrowUpRight,
  Copy,
  Trash2,
  Pencil,
  GraduationCap,
  KeyRound,
  Layers,
} from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import type { Classroom, Role, User } from '@/lib/types';
import type { Course } from '@/lib/classes';
import { Avatar, Empty, ErrorBox, Field, Loading, Modal, SectionTitle, Spinner } from './ui';
import { CourseManager } from './classes/course-manager';
import type { Notify } from './workspace';

export function ClassManagement({ role, notify }: { role: Role; notify: Notify }) {
  const teacher = role === 'TEACHER';
  const { data, error, loading, reload } = useQuery<{ classes: Classroom[] }>(
    teacher ? '/teacher/classes' : '/student/classes',
  );
  const courses = useQuery<{ courses: Course[] }>(teacher ? '/teacher/courses' : null);
  const [search, setSearch] = useState('');
  const [course, setCourse] = useState<string>('');
  const [form, setForm] = useState<Classroom | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Classroom | null>(null);
  const [join, setJoin] = useState(false);
  const [managing, setManaging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  const courseList = courses.data?.courses || [];
  const courseTitle = (cl: Classroom) =>
    cl.courseTitle || courseList.find((item) => item.id === cl.courseId)?.title || '';
  const classes = (data?.classes || []).filter(
    (cl) =>
      `${cl.name} ${cl.subject} ${courseTitle(cl)}`.toLowerCase().includes(search.toLowerCase()) &&
      (!course || (course === 'none' ? !cl.courseId : cl.courseId === course)),
  );
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setFormError('');
    try {
      if (join) {
        await api('/student/classes/join', {
          method: 'POST',
          body: jsonBody({ code: values.get('code') }),
        });
        notify('Chào mừng bạn đến với lớp học mới!');
        setJoin(false);
      } else {
        await api(`/teacher/classes${form !== 'new' && form ? `/${form.id}` : ''}`, {
          method: form === 'new' ? 'POST' : 'PATCH',
          body: jsonBody({
            name: values.get('name'),
            subject: values.get('subject'),
            description: values.get('description'),
            color: values.get('color'),
            courseId: values.get('courseId') || null,
          }),
        });
        notify(form === 'new' ? 'Lớp học mới đã sẵn sàng.' : 'Đã cập nhật lớp học.');
        setForm(null);
        courses.reload();
      }
      reload();
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function removeClass() {
    if (!deleting) return;
    setBusy(true);
    try {
      await api(`/teacher/classes/${deleting.id}`, { method: 'DELETE' });
      setDeleting(null);
      reload();
      courses.reload();
      notify('Đã xóa lớp học.');
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionTitle
        eyebrow={teacher ? 'CONNECT. INSPIRE. GROW.' : 'BETTER TOGETHER'}
        title="Lớp học của tôi"
        description={
          teacher
            ? 'Không gian để kết nối, chia sẻ và cùng nhau phát triển.'
            : 'Nơi bạn kết nối cùng thầy cô và những người bạn đồng hành.'
        }
        action={
          <div className="class-heading-actions">
            {teacher && (
              <button className="btn btn-secondary" onClick={() => setManaging(true)}>
                <Layers size={17} /> Khóa học
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={() => {
                setFormError('');
                if (teacher) setForm('new');
                else setJoin(true);
              }}
            >
              <Plus size={18} />
              {teacher ? 'Tạo lớp học' : 'Tham gia lớp'}
            </button>
          </div>
        }
      />
      <div className="class-toolbar">
        <div>
          <b>{data?.classes.length || 0} lớp học</b>
          <span className="muted"> · Không gian kết nối của bạn</span>
        </div>
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Tìm lớp học"
            placeholder="Tìm lớp, môn hoặc khóa học…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>
      {teacher && courseList.length > 0 && (
        <div className="exam-status-tabs class-course-tabs" role="group" aria-label="Lọc theo khóa">
          <button className={!course ? 'active' : ''} onClick={() => setCourse('')}>
            Tất cả
          </button>
          {courseList.map((item) => (
            <button
              key={item.id}
              className={course === item.id ? 'active' : ''}
              onClick={() => setCourse(item.id)}
            >
              {item.title} <span>{item.classCount}</span>
            </button>
          ))}
          <button className={course === 'none' ? 'active' : ''} onClick={() => setCourse('none')}>
            Chưa xếp khóa
          </button>
        </div>
      )}
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox message={error} retry={reload} />
      ) : classes.length ? (
        <div className="class-grid">
          {classes.map((cl) => (
            <article className="class-card" key={cl.id}>
              <div className={`class-cover ${cl.color}`}>
                <span className="class-cover-symbol">
                  <BookOpen size={31} strokeWidth={1.5} />
                </span>
                <span className="class-cover-pattern" aria-hidden="true" />
                <span className="class-subject">{cl.subject}</span>
                {teacher && (
                  <div className="class-actions">
                    <button
                      className="icon-btn"
                      onClick={() => {
                        setForm(cl);
                        setFormError('');
                      }}
                      aria-label={`Sửa ${cl.name}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-btn"
                      onClick={() => {
                        setFormError('');
                        setDeleting(cl);
                      }}
                      aria-label={`Xóa ${cl.name}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
              <div className="class-info">
                {courseTitle(cl) && (
                  <span className="class-course">
                    <Layers size={12} /> {courseTitle(cl)}
                  </span>
                )}
                <h2>{cl.name}</h2>
                <p>
                  {cl.description ||
                    (teacher
                      ? 'Cùng nhau tạo nên những giờ học ý nghĩa.'
                      : `Giáo viên: ${cl.teacherName}`)}
                </p>
                <div className="class-info-meta">
                  <span>
                    <Users size={15} /> {cl.studentCount} học sinh
                  </span>
                  {teacher ? (
                    <button
                      className="class-code"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(cl.code);
                          notify('Đã sao chép mã lớp.');
                        } catch {
                          notify(`Mã lớp: ${cl.code}`);
                        }
                      }}
                      title="Sao chép mã lớp"
                    >
                      {cl.code} <Copy size={12} />
                    </button>
                  ) : (
                    <span className="status-badge">
                      <i />
                      Đang tham gia
                    </span>
                  )}
                </div>
                {!teacher && (
                  <div className="class-teacher">
                    <GraduationCap size={17} />
                    <span>{cl.teacherName}</span>
                  </div>
                )}
                <Link className="class-open" href={`/classes/${cl.id}`}>
                  {teacher ? 'Quản lý lớp học' : 'Vào lớp học'} <ArrowUpRight size={17} />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <section className="panel">
          <Empty
            icon={<BookOpen size={29} />}
            title={
              search || course
                ? 'Chưa tìm thấy lớp học'
                : teacher
                  ? 'Bắt đầu từ một lớp học'
                  : 'Lớp học mới đang chờ bạn'
            }
            description={
              search || course
                ? 'Thử từ khóa khác hoặc chọn khóa học khác.'
                : teacher
                  ? 'Tạo lớp đầu tiên, mời học sinh và truyền cảm hứng theo cách của bạn.'
                  : 'Nhập mã lớp hoặc mở link mời do giáo viên chia sẻ để bắt đầu học cùng mọi người.'
            }
            action={
              !search &&
              !course && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    setFormError('');
                    if (teacher) setForm('new');
                    else setJoin(true);
                  }}
                >
                  <Plus size={17} />
                  {teacher ? 'Tạo lớp đầu tiên' : 'Nhập mã lớp'}
                </button>
              )
            }
          />
        </section>
      )}
      {(form || join) && (
        <Modal
          title={
            join ? 'Tham gia lớp học' : form === 'new' ? 'Tạo lớp học mới' : 'Chỉnh sửa lớp học'
          }
          description={
            join
              ? 'Nhập mã 10 ký tự được giáo viên chia sẻ.'
              : 'Tạo một không gian cho những ý tưởng mới.'
          }
          close={() => {
            setForm(null);
            setJoin(false);
          }}
        >
          <ErrorBox message={formError} />
          <form className="stack-form" onSubmit={save}>
            {join ? (
              <Field label="Mã lớp học">
                <div className="input-icon">
                  <KeyRound size={18} />
                  <input
                    name="code"
                    placeholder="Ví dụ: A1B2C3D4E5"
                    minLength={10}
                    maxLength={10}
                    required
                    autoComplete="off"
                    className="uppercase"
                  />
                </div>
              </Field>
            ) : (
              <>
                <Field label="Tên lớp học">
                  <input
                    name="name"
                    defaultValue={form && form !== 'new' ? form.name : ''}
                    placeholder="Ví dụ: Toán học 12A1"
                    minLength={2}
                    maxLength={80}
                    required
                  />
                </Field>
                <Field label="Môn học">
                  <input
                    name="subject"
                    defaultValue={form && form !== 'new' ? form.subject : ''}
                    placeholder="Ví dụ: Toán học"
                    maxLength={60}
                    required
                  />
                </Field>
                <Field label="Khóa học">
                  <select
                    name="courseId"
                    defaultValue={
                      form && form !== 'new'
                        ? form.courseId || ''
                        : course && course !== 'none'
                          ? course
                          : ''
                    }
                  >
                    <option value="">Không thuộc khóa nào</option>
                    {courseList.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Mô tả lớp">
                  <textarea
                    name="description"
                    defaultValue={form && form !== 'new' ? form.description : ''}
                    placeholder="Một vài lời giới thiệu về lớp học…"
                    maxLength={500}
                    rows={3}
                  />
                </Field>
                <Field label="Màu lớp học">
                  <select name="color" defaultValue={form && form !== 'new' ? form.color : 'mint'}>
                    <option value="mint">Xanh ngọc</option>
                    <option value="violet">Tím lavender</option>
                    <option value="blue">Xanh bầu trời</option>
                    <option value="amber">Vàng nắng</option>
                  </select>
                </Field>
              </>
            )}
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setForm(null);
                  setJoin(false);
                }}
              >
                Hủy
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? (
                  <Spinner />
                ) : join ? (
                  'Tham gia lớp'
                ) : form === 'new' ? (
                  'Tạo lớp học'
                ) : (
                  'Lưu thay đổi'
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {managing && (
        <CourseManager
          courses={courseList}
          close={() => setManaging(false)}
          changed={() => {
            courses.reload();
            reload();
          }}
          notify={notify}
        />
      )}
      {deleting && (
        <Modal title="Xóa lớp học này?" description={deleting.name} close={() => setDeleting(null)}>
          <ErrorBox message={formError} />
          <p className="modal-description">
            Lớp học, bài học và danh sách bài đã giao trong lớp sẽ được gỡ. Tài khoản và kết quả thi
            của học sinh vẫn được giữ nguyên.
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
              Hủy
            </button>
            <button className="btn btn-danger" onClick={removeClass} disabled={busy}>
              {busy ? <Spinner /> : 'Xóa lớp học'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function StudentManagement() {
  const { data, error, loading, reload } = useQuery<{ students: (User & { classes: string[] })[] }>(
    '/teacher/students',
  );
  const [search, setSearch] = useState('');
  const students = (data?.students || []).filter((user) =>
    `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()),
  );
  return (
    <>
      <SectionTitle
        eyebrow="GROWING TOGETHER"
        title="Học sinh của tôi"
        description="Kết nối và đồng hành cùng từng thành viên trong lớp."
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              Danh sách học sinh <span className="count-badge">{data?.students.length || 0}</span>
            </h2>
            <p>Tổng hợp từ các lớp học bạn đang quản lý</p>
          </div>
          <div className="input-icon">
            <Search size={17} />
            <input
              aria-label="Tìm học sinh"
              placeholder="Tìm tên hoặc email…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} retry={reload} />
        ) : students.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>HỌC SINH</th>
                  <th>LỚP HỌC</th>
                  <th>TRẠNG THÁI</th>
                </tr>
              </thead>
              <tbody>
                {students.map((student) => (
                  <tr key={student.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar user={student} />
                        <div>
                          <b>{student.name}</b>
                          <small>{student.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="class-tags">
                        {student.classes.map((name) => (
                          <span className="tag-neutral" key={name}>
                            {name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${student.status === 'LOCKED' ? 'locked' : ''}`}
                      >
                        <i />
                        {student.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={<GraduationCap size={30} />}
            title={search ? 'Không tìm thấy học sinh' : 'Cùng chào đón những thành viên đầu tiên'}
            description={
              search
                ? 'Thử tìm kiếm với tên hoặc email khác.'
                : 'Thêm học sinh tại trang Lớp học để quản lý danh sách tại đây.'
            }
          />
        )}
      </section>
    </>
  );
}
