'use client';
import { useState, type FormEvent } from 'react';
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import type { Course } from '@/lib/classes';
import { Empty, ErrorBox, Field, Modal, Spinner } from '../ui';
import type { Notify } from '../workspace';

export function CourseManager({
  courses,
  close,
  changed,
  notify,
}: {
  courses: Course[];
  close: () => void;
  changed: () => void;
  notify: Notify;
}) {
  const [editing, setEditing] = useState<Course | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Course | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api(`/teacher/courses${editing && editing !== 'new' ? `/${editing.id}` : ''}`, {
        method: editing === 'new' ? 'POST' : 'PATCH',
        body: jsonBody({ title: values.get('title'), description: values.get('description') }),
      });
      notify(editing === 'new' ? 'Đã tạo khóa học.' : 'Đã cập nhật khóa học.');
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
      await api(`/teacher/courses/${deleting.id}`, { method: 'DELETE' });
      notify('Đã xóa khóa học.');
      setDeleting(null);
      changed();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (deleting)
    return (
      <Modal title="Xóa khóa học này?" description={deleting.title} close={() => setDeleting(null)}>
        <ErrorBox message={error} />
        <p className="modal-description">
          Các lớp trong khóa vẫn được giữ lại và chuyển sang mục “Chưa xếp khóa”.
        </p>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
            Hủy
          </button>
          <button className="btn btn-danger" onClick={remove} disabled={busy}>
            {busy ? <Spinner /> : 'Xóa khóa học'}
          </button>
        </div>
      </Modal>
    );
  if (editing)
    return (
      <Modal
        title={editing === 'new' ? 'Tạo khóa học' : 'Sửa khóa học'}
        description="Khóa học gom nhiều lớp cùng chương trình."
        close={() => setEditing(null)}
      >
        <ErrorBox message={error} />
        <form className="stack-form" onSubmit={save}>
          <Field label="Tên khóa học">
            <input
              name="title"
              defaultValue={editing === 'new' ? '' : editing.title}
              placeholder="Ví dụ: Toán 12 - Học kỳ I"
              minLength={2}
              maxLength={120}
              required
            />
          </Field>
          <Field label="Mô tả">
            <textarea
              name="description"
              defaultValue={editing === 'new' ? '' : editing.description}
              maxLength={1000}
              rows={3}
              placeholder="Mục tiêu, nội dung chính của khóa…"
            />
          </Field>
          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
              Hủy
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? <Spinner /> : editing === 'new' ? 'Tạo khóa học' : 'Lưu thay đổi'}
            </button>
          </div>
        </form>
      </Modal>
    );
  return (
    <Modal title="Khóa học" description="Mỗi khóa học có thể gồm nhiều lớp." close={close}>
      <button
        className="btn btn-primary course-add"
        onClick={() => {
          setError('');
          setEditing('new');
        }}
      >
        <Plus size={17} /> Tạo khóa học
      </button>
      {courses.length ? (
        <div className="member-list">
          {courses.map((course) => (
            <div key={course.id}>
              <span className="course-icon">
                <Layers size={17} />
              </span>
              <div>
                <b>{course.title}</b>
                <small>
                  {course.classCount} lớp{course.description ? ` · ${course.description}` : ''}
                </small>
              </div>
              <button
                className="icon-btn"
                aria-label={`Sửa ${course.title}`}
                onClick={() => {
                  setError('');
                  setEditing(course);
                }}
              >
                <Pencil size={15} />
              </button>
              <button
                className="icon-btn danger-text"
                aria-label={`Xóa ${course.title}`}
                onClick={() => {
                  setError('');
                  setDeleting(course);
                }}
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <Empty
          icon={<Layers size={28} />}
          title="Chưa có khóa học"
          description="Tạo khóa học để nhóm các lớp cùng chương trình."
        />
      )}
    </Modal>
  );
}
