'use client';
import { useState, type FormEvent, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, ShieldCheck, LockKeyhole, Save, Target, Mail, CalendarDays } from 'lucide-react';
import { useAuth } from './auth-provider';
import { Avatar, Field, SectionTitle, Spinner } from './ui';
import { api, jsonBody } from '@/lib/api';
import { dateLabel, roleLabel, type User } from '@/lib/types';
import type { Notify } from './workspace';

export function ProfilePage({ notify }: { notify: Notify }) {
  const { user, updateUser, clear } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  if (!user) return null;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    const data = new FormData(event.currentTarget);
    try {
      updateUser(
        await api<User>('/me', {
          method: 'PATCH',
          body: jsonBody({
            name: data.get('name'),
            phone: data.get('phone'),
            bio: data.get('bio'),
            weeklyGoal: Number(data.get('weeklyGoal') || user!.weeklyGoal),
          }),
        }),
      );
      notify('Hồ sơ của bạn đã được cập nhật.');
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setSaving(false);
    }
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 512000) {
      notify('Chọn ảnh JPG, PNG hoặc WebP nhỏ hơn 500 KB.', true);
      return;
    }
    setUploading(true);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      updateUser(await api<User>('/me/avatar', { method: 'PUT', body: jsonBody({ image }) }));
      notify('Đã cập nhật ảnh đại diện.');
    } catch (error) {
      notify((error as Error).message || 'Không thể tải ảnh lên.', true);
    } finally {
      setUploading(false);
    }
  }
  async function removeAvatar() {
    setUploading(true);
    try {
      updateUser(await api<User>('/me/avatar', { method: 'DELETE' }));
      notify('Đã xóa ảnh đại diện.');
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setUploading(false);
    }
  }
  async function password(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (data.get('password') !== data.get('confirm')) {
      notify('Hai mật khẩu mới chưa khớp.', true);
      return;
    }
    setPasswordBusy(true);
    try {
      await api('/me/password', {
        method: 'PUT',
        body: jsonBody({
          currentPassword: data.get('currentPassword'),
          password: data.get('password'),
        }),
      });
      clear();
      router.replace('/login');
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setPasswordBusy(false);
    }
  }
  return (
    <>
      <SectionTitle
        eyebrow="A LITTLE MORE ABOUT YOU"
        title="Hồ sơ cá nhân"
        description="Thể hiện cá tính của bạn và giữ tài khoản luôn an toàn."
      />
      <div className="profile-grid">
        <aside>
          <section className="panel identity-card">
            <div className="profile-cover">
              <span />
              <i />
            </div>
            <div className="profile-identity">
              <div className="profile-avatar-wrap">
                <Avatar user={user} size="lg" />
                <label className="avatar-upload" title="Đổi ảnh đại diện">
                  {uploading ? <Spinner /> : <Camera size={17} />}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={upload}
                    disabled={uploading}
                    aria-label="Tải ảnh đại diện"
                  />
                </label>
              </div>
              <h2>{user.name}</h2>
              <span className={`role-badge ${user.role.toLowerCase()}`}>
                {roleLabel[user.role]}
              </span>
              <p>{user.bio || 'Mỗi ngày là một cơ hội để học điều mới.'}</p>
              {user.avatar && (
                <button className="text-link muted" onClick={removeAvatar} disabled={uploading}>
                  Xóa ảnh đại diện
                </button>
              )}
              <small className="avatar-hint">JPG, PNG, WebP · tối đa 500 KB</small>
            </div>
            <div className="identity-details">
              <span>
                <Mail size={16} />
                {user.email}
              </span>
              <span>
                <CalendarDays size={16} />
                Tham gia {dateLabel(user.createdAt)}
              </span>
              <span className="success-text">
                <ShieldCheck size={16} />
                Tài khoản đang hoạt động
              </span>
            </div>
          </section>
          <div className="profile-tip">
            <ShieldCheck size={24} />
            <h3>An toàn bắt đầu từ bạn</h3>
            <p>Dùng mật khẩu riêng cho mỗi tài khoản và không chia sẻ thông tin đăng nhập.</p>
          </div>
        </aside>
        <div className="profile-forms">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Thông tin cá nhân</h2>
                <p>Một lời giới thiệu giúp mọi người hiểu bạn hơn.</p>
              </div>
              <span className="tag-neutral">{roleLabel[user.role]}</span>
            </div>
            <form className="profile-form" onSubmit={save}>
              <div className="form-grid">
                <Field label="Họ và tên">
                  <input
                    name="name"
                    defaultValue={user.name}
                    minLength={2}
                    maxLength={80}
                    required
                    autoComplete="name"
                  />
                </Field>
                <Field label="Số điện thoại">
                  <input
                    name="phone"
                    type="tel"
                    defaultValue={user.phone}
                    maxLength={25}
                    placeholder="Thêm số điện thoại"
                    autoComplete="tel"
                  />
                </Field>
              </div>
              <Field label="Email" hint="Email dùng để đăng nhập và khôi phục tài khoản.">
                <input value={user.email} disabled />
              </Field>
              <Field label="Giới thiệu bản thân">
                <textarea
                  name="bio"
                  defaultValue={user.bio}
                  rows={3}
                  maxLength={300}
                  placeholder="Chia sẻ một chút về bạn, sở thích hoặc mục tiêu học tập…"
                />
              </Field>
              {user.role === 'STUDENT' && (
                <div className="goal-settings">
                  <Target size={22} />
                  <div>
                    <b>Mục tiêu học tập mỗi tuần</b>
                    <p>Bắt đầu vừa sức, tiến bộ đều đặn.</p>
                  </div>
                  <label>
                    <input
                      name="weeklyGoal"
                      type="number"
                      min={1}
                      max={20}
                      defaultValue={user.weeklyGoal}
                      required
                      aria-label="Số bài thi mục tiêu mỗi tuần"
                    />
                    <span>bài / tuần</span>
                  </label>
                </div>
              )}
              <div className="form-footer">
                <span>Thông tin sẽ được lưu vào hồ sơ của bạn.</span>
                <button className="btn btn-primary" disabled={saving}>
                  {saving ? (
                    <Spinner />
                  ) : (
                    <>
                      <Save size={17} />
                      Lưu thay đổi
                    </>
                  )}
                </button>
              </div>
            </form>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>
                  <LockKeyhole size={18} /> Bảo mật tài khoản
                </h2>
                <p>Đổi mật khẩu để bảo vệ những điều quan trọng.</p>
              </div>
            </div>
            {user.hasPassword ? (
              <form className="profile-form" onSubmit={password}>
                <Field label="Mật khẩu hiện tại">
                  <input
                    name="currentPassword"
                    type="password"
                    autoComplete="current-password"
                    required
                  />
                </Field>
                <div className="form-grid">
                  <Field label="Mật khẩu mới" hint="Ít nhất 10 ký tự, gồm chữ và số.">
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      minLength={10}
                      maxLength={72}
                      required
                    />
                  </Field>
                  <Field label="Xác nhận mật khẩu mới">
                    <input
                      name="confirm"
                      type="password"
                      autoComplete="new-password"
                      minLength={10}
                      maxLength={72}
                      required
                    />
                  </Field>
                </div>
                <div className="form-footer">
                  <span>Bạn sẽ cần đăng nhập lại sau khi đổi mật khẩu.</span>
                  <button className="btn btn-secondary" disabled={passwordBusy}>
                    {passwordBusy ? <Spinner /> : 'Cập nhật mật khẩu'}
                  </button>
                </div>
              </form>
            ) : (
              <p className="panel-body muted">
                Bạn đang đăng nhập bằng Google. Bạn có thể dùng chức năng quên mật khẩu để tạo mật
                khẩu cho tài khoản.
              </p>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
