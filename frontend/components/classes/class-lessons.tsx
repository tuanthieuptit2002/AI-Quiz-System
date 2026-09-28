'use client';
import { useState, type FormEvent } from 'react';
import { ExternalLink, FileText, Pencil, Plus, Trash2 } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { dueLabel, type Lesson } from '@/lib/classes';
import { Empty, ErrorBox, Field, Modal, Spinner } from '../ui';
import type { Notify } from '../workspace';

const safeLink = (link: string) => /^https?:\/\//i.test(link);

export function LessonList({
  classId,
  lessons,
  editable = false,
  changed,
  notify,
}: {
  classId: string;
  lessons: Lesson[];
  editable?: boolean;
  changed?: () => void;
  notify?: Notify;
}) {
  const [editing, setEditing] = useState<Lesson | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Lesson | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api(
        `/teacher/classes/${classId}/lessons${editing && editing !== 'new' ? `/${editing.id}` : ''}`,
        {
          method: editing === 'new' ? 'POST' : 'PATCH',
          body: jsonBody({
            title: values.get('title'),
            content: values.get('content'),
            link: String(values.get('link') || '').trim(),
          }),
        },
      );
      notify?.(editing === 'new' ? 'Đã thêm bài học.' : 'Đã cập nhật bài học.');
      setEditing(null);
      changed?.();
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
      await api(`/teacher/classes/${classId}/lessons/${deleting.id}`, { method: 'DELETE' });
      notify?.('Đã xóa bài học.');
      setDeleting(null);
      changed?.();
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
          <h2>Bài học</h2>
          <p>
            {editable
              ? 'Tài liệu, ghi chú và đường dẫn học tập cho cả lớp.'
              : 'Tài liệu giáo viên chia sẻ cho lớp.'}
          </p>
        </div>
        {editable && (
          <button
            className="btn btn-primary"
            onClick={() => {
              setError('');
              setEditing('new');
            }}
          >
            <Plus size={17} /> Thêm bài học
          </button>
        )}
      </div>
      {lessons.length ? (
        <ol className="cd-lessons">
          {lessons.map((lesson, index) => (
            <li key={lesson.id} className={open === lesson.id ? 'open' : ''}>
              <div className="cd-lesson-head">
                <span className="cd-lesson-no">{index + 1}</span>
                <button
                  className="cd-lesson-title"
                  aria-expanded={open === lesson.id}
                  onClick={() => setOpen(open === lesson.id ? null : lesson.id)}
                >
                  <b>{lesson.title}</b>
                  <small>Cập nhật {dueLabel(lesson.updatedAt)}</small>
                </button>
                {editable && (
                  <div className="cd-row-actions">
                    <button
                      className="icon-btn"
                      aria-label={`Sửa ${lesson.title}`}
                      onClick={() => {
                        setError('');
                        setEditing(lesson);
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-btn danger-text"
                      aria-label={`Xóa ${lesson.title}`}
                      onClick={() => {
                        setError('');
                        setDeleting(lesson);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}
              </div>
              {open === lesson.id && (
                <div className="cd-lesson-body">
                  {lesson.content ? (
                    <p>{lesson.content}</p>
                  ) : (
                    <p className="muted">Bài học chưa có nội dung.</p>
                  )}
                  {lesson.link && safeLink(lesson.link) && (
                    <a href={lesson.link} target="_blank" rel="noopener noreferrer">
                      <ExternalLink size={14} /> Mở tài liệu
                    </a>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      ) : (
        <Empty
          icon={<FileText size={28} />}
          title="Chưa có bài học"
          description={
            editable
              ? 'Thêm bài học đầu tiên để chia sẻ tài liệu với lớp.'
              : 'Giáo viên chưa chia sẻ bài học nào.'
          }
        />
      )}
      {editing && (
        <Modal
          wide
          title={editing === 'new' ? 'Thêm bài học' : 'Sửa bài học'}
          description="Nội dung dạng văn bản và một đường dẫn tài liệu (không bắt buộc)."
          close={() => setEditing(null)}
        >
          <ErrorBox message={error} />
          <form className="stack-form" onSubmit={save}>
            <Field label="Tiêu đề">
              <input
                name="title"
                defaultValue={editing === 'new' ? '' : editing.title}
                placeholder="Ví dụ: Bài 1 - Hàm số bậc nhất"
                minLength={2}
                maxLength={160}
                required
              />
            </Field>
            <Field label="Nội dung">
              <textarea
                name="content"
                defaultValue={editing === 'new' ? '' : editing.content}
                maxLength={20000}
                rows={8}
                placeholder="Tóm tắt lý thuyết, ví dụ, bài tập về nhà…"
              />
            </Field>
            <Field label="Đường dẫn tài liệu">
              <input
                name="link"
                type="url"
                pattern="https?://.+"
                defaultValue={editing === 'new' ? '' : editing.link}
                placeholder="https://…"
                maxLength={1000}
              />
            </Field>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(null)}>
                Hủy
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? <Spinner /> : editing === 'new' ? 'Thêm bài học' : 'Lưu thay đổi'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal
          title="Xóa bài học này?"
          description={deleting.title}
          close={() => setDeleting(null)}
        >
          <ErrorBox message={error} />
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setDeleting(null)}>
              Hủy
            </button>
            <button className="btn btn-danger" onClick={remove} disabled={busy}>
              {busy ? <Spinner /> : 'Xóa bài học'}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
