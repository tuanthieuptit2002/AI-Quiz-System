'use client';
import { useEffect, useState, type FormEvent } from 'react';
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  ShieldCheck,
  LockKeyhole,
  UnlockKeyhole,
  Users,
} from 'lucide-react';
import { useQuery } from '@/lib/use-query';
import { api, jsonBody } from '@/lib/api';
import { dateLabel, roleLabel, type User } from '@/lib/types';
import { Avatar, Empty, ErrorBox, Field, Loading, Modal, SectionTitle, Spinner } from './ui';
import type { Notify } from './workspace';

export function UserManagement({ user, notify }: { user: User; notify: Notify }) {
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [create, setCreate] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [locking, setLocking] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const params = new URLSearchParams({
    page: String(page),
    q: query,
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
  });
  const { data, error, loading, reload } = useQuery<{
    users: User[];
    total: number;
    pages: number;
  }>(`/admin/users?${params}`);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setFormError('');
    const form = new FormData(event.currentTarget);
    try {
      const body = editing
        ? { role: form.get('role') }
        : {
            name: form.get('name'),
            email: form.get('email'),
            password: form.get('password'),
            role: form.get('role'),
          };
      await api(`/admin/users${editing ? `/${editing.id}` : ''}`, {
        method: editing ? 'PATCH' : 'POST',
        body: jsonBody(body),
      });
      notify(
        editing ? 'Đã cập nhật vai trò. Người dùng cần đăng nhập lại.' : 'Đã tạo tài khoản mới.',
      );
      setCreate(false);
      setEditing(null);
      reload();
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function toggleLock() {
    if (!locking) return;
    setBusy(true);
    try {
      await api(`/admin/users/${locking.id}`, {
        method: 'PATCH',
        body: jsonBody({ status: locking.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE' }),
      });
      notify(
        locking.status === 'ACTIVE'
          ? 'Đã khóa tài khoản và kết thúc các phiên đăng nhập.'
          : 'Đã mở khóa tài khoản.',
      );
      setLocking(null);
      reload();
    } catch (error) {
      setFormError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SectionTitle
        eyebrow="PEOPLE & PERMISSIONS"
        title="Quản lý người dùng"
        description="Một cộng đồng vững mạnh bắt đầu từ những kết nối tốt."
        action={
          <button
            className="btn btn-primary"
            onClick={() => {
              setCreate(true);
              setFormError('');
            }}
          >
            <Plus size={18} /> Thêm người dùng
          </button>
        }
      />
      <section className="panel users-panel">
        <div className="users-panel-title">
          <div>
            <span className="panel-icon">
              <Users size={20} />
            </span>
            <h2>
              Tất cả thành viên <span className="count-badge">{data?.total ?? '…'}</span>
            </h2>
          </div>
          <span className="muted small">
            <ShieldCheck size={14} /> Quyền truy cập được bảo vệ
          </span>
        </div>
        <div className="table-toolbar">
          <div className="input-icon search-input">
            <Search size={18} />
            <input
              placeholder="Tìm theo tên hoặc email…"
              aria-label="Tìm người dùng"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="filter-group">
            <select
              aria-label="Lọc vai trò"
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả vai trò</option>
              {Object.entries(roleLabel).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Lọc trạng thái"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Tất cả trạng thái</option>
              <option value="ACTIVE">Hoạt động</option>
              <option value="LOCKED">Đã khóa</option>
            </select>
          </div>
        </div>
        <ErrorBox message={error} retry={reload} />
        {loading ? (
          <Loading />
        ) : data?.users.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>NGƯỜI DÙNG</th>
                    <th>VAI TRÒ</th>
                    <th>TRẠNG THÁI</th>
                    <th>NGÀY THAM GIA</th>
                    <th className="align-right">THAO TÁC</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users.map((person) => (
                    <tr key={person.id}>
                      <td>
                        <div className="person-cell">
                          <Avatar user={person} />
                          <div>
                            <b>
                              {person.name}
                              {person.id === user.id && <span className="you-label">Bạn</span>}
                            </b>
                            <small>{person.email}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className={`role-badge ${person.role.toLowerCase()}`}>
                          {roleLabel[person.role]}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${person.status === 'LOCKED' ? 'locked' : ''}`}
                        >
                          <i />
                          {person.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}
                        </span>
                      </td>
                      <td className="muted">{dateLabel(person.createdAt)}</td>
                      <td>
                        <div className="table-actions">
                          <button
                            disabled={person.id === user.id}
                            className="icon-btn"
                            title="Đổi vai trò"
                            aria-label={`Đổi vai trò của ${person.name}`}
                            onClick={() => {
                              setEditing(person);
                              setFormError('');
                            }}
                          >
                            <SlidersHorizontal size={17} />
                          </button>
                          <button
                            disabled={person.id === user.id}
                            className={`icon-btn ${person.status === 'ACTIVE' ? 'danger-text' : 'success-text'}`}
                            title={person.status === 'ACTIVE' ? 'Khóa tài khoản' : 'Mở khóa'}
                            aria-label={`${person.status === 'ACTIVE' ? 'Khóa' : 'Mở khóa'} ${person.name}`}
                            onClick={() => {
                              setFormError('');
                              setLocking(person);
                            }}
                          >
                            {person.status === 'ACTIVE' ? (
                              <LockKeyhole size={17} />
                            ) : (
                              <UnlockKeyhole size={17} />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-pagination">
              <span>
                Hiển thị {(page - 1) * 10 + 1}–{Math.min(page * 10, data.total)} trong {data.total}{' '}
                thành viên
              </span>
              <div>
                <button
                  className="icon-btn"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                  aria-label="Trang trước"
                >
                  <ChevronLeft size={17} />
                </button>
                <span>
                  Trang {page} / {data.pages}
                </span>
                <button
                  className="icon-btn"
                  disabled={page >= data.pages}
                  onClick={() => setPage(page + 1)}
                  aria-label="Trang tiếp"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </>
        ) : (
          !error && (
            <Empty
              title="Chưa tìm thấy thành viên"
              description="Thử thay đổi từ khóa hoặc bộ lọc, hoặc thêm người dùng mới."
            />
          )
        )}
      </section>
      <div className="info-strip">
        <ShieldCheck size={19} />
        <p>
          Chỉ quản trị viên được thay đổi vai trò và trạng thái tài khoản. Mỗi thay đổi quyền sẽ kết
          thúc các phiên đăng nhập hiện tại.
        </p>
      </div>
      {(create || editing) && (
        <Modal
          title={editing ? 'Cập nhật vai trò' : 'Thêm thành viên mới'}
          description={
            editing
              ? `Thiết lập quyền truy cập cho ${editing.name}.`
              : 'Tạo tài khoản để bắt đầu hành trình cùng QuizSpace.'
          }
          close={() => {
            setCreate(false);
            setEditing(null);
          }}
        >
          <ErrorBox message={formError} />
          <form className="stack-form" onSubmit={save}>
            {!editing && (
              <>
                <Field label="Họ và tên">
                  <input
                    name="name"
                    minLength={2}
                    maxLength={80}
                    required
                    placeholder="Nguyễn Minh Anh"
                  />
                </Field>
                <Field label="Email">
                  <input name="email" type="email" required placeholder="thanhvien@example.com" />
                </Field>
                <Field label="Mật khẩu ban đầu" hint="Ít nhất 10 ký tự, bao gồm chữ và số.">
                  <input
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={10}
                    maxLength={72}
                    required
                  />
                </Field>
              </>
            )}
            <Field label="Vai trò">
              <select name="role" defaultValue={editing?.role || 'STUDENT'}>
                {Object.entries(roleLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setCreate(false);
                  setEditing(null);
                }}
              >
                Hủy
              </button>
              <button className="btn btn-primary" disabled={busy}>
                {busy ? <Spinner /> : editing ? 'Lưu thay đổi' : 'Tạo tài khoản'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {locking && (
        <Modal
          title={locking.status === 'ACTIVE' ? 'Khóa tài khoản này?' : 'Mở khóa tài khoản?'}
          description={`${locking.name} · ${locking.email}`}
          close={() => setLocking(null)}
        >
          <ErrorBox message={formError} />
          <p className="modal-description">
            {locking.status === 'ACTIVE'
              ? 'Người dùng sẽ bị đăng xuất và không thể truy cập cho đến khi bạn mở khóa.'
              : 'Người dùng có thể đăng nhập và sử dụng tài khoản trở lại.'}
          </p>
          <div className="modal-actions">
            <button className="btn btn-secondary" onClick={() => setLocking(null)}>
              Hủy
            </button>
            <button
              className={`btn ${locking.status === 'ACTIVE' ? 'btn-danger' : 'btn-primary'}`}
              onClick={toggleLock}
              disabled={busy}
            >
              {busy ? <Spinner /> : 'Xác nhận'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
