'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import Script from 'next/script';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  ArrowLeft,
  Eye,
  EyeOff,
  Check,
  ShieldCheck,
  GraduationCap,
  BookOpen,
  Sparkles,
  Mail,
  LockKeyhole,
  Users,
  TrendingUp,
} from 'lucide-react';
import { useAuth } from './auth-provider';
import { Logo, ErrorBox, Spinner, Field } from './ui';
import { api, jsonBody } from '@/lib/api';
import type { AuthResult } from '@/lib/types';

type Mode = 'login' | 'register' | 'forgot' | 'reset';
declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: {
            client_id: string;
            callback: (response: { credential: string }) => void;
          }) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

export function AuthScreen({ mode }: { mode: Mode }) {
  const { user, loading, accept, clear } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [done, setDone] = useState(false);
  const [role, setRole] = useState<'STUDENT' | 'TEACHER'>('STUDENT');
  const [googleClientId, setGoogleClientId] = useState('');
  const googleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!loading && user && (mode === 'login' || mode === 'register')) router.replace('/dashboard');
  }, [user, loading, mode, router]);
  useEffect(() => {
    api<{ googleClientId: string }>('/auth/config')
      .then((result) => setGoogleClientId(result.googleClientId))
      .catch(() => {});
  }, []);
  const setupGoogle = () => {
    if (!googleClientId || !googleRef.current || !window.google) return;
    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: async (response) => {
        setBusy(true);
        setError('');
        try {
          accept(
            await api<AuthResult>('/auth/google', {
              method: 'POST',
              body: jsonBody({ credential: response.credential }),
            }),
          );
          router.replace('/dashboard');
        } catch (error) {
          setError((error as Error).message);
        } finally {
          setBusy(false);
        }
      },
    });
    window.google.accounts.id.renderButton(googleRef.current, {
      theme: 'outline',
      size: 'large',
      width: 360,
      text: 'continue_with',
      locale: 'vi',
    });
  };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const email = String(form.get('email') || '');
      const password = String(form.get('password') || '');
      if (mode === 'login' || mode === 'register') {
        const body =
          mode === 'login'
            ? { email, password }
            : { email, password, name: form.get('name'), role };
        accept(await api<AuthResult>(`/auth/${mode}`, { method: 'POST', body: jsonBody(body) }));
        router.replace('/dashboard');
      } else if (mode === 'forgot') {
        await api('/auth/forgot-password', { method: 'POST', body: jsonBody({ email }) });
        setDone(true);
      } else {
        if (password !== form.get('confirmPassword')) throw new Error('Hai mật khẩu chưa khớp.');
        if (!params.get('token'))
          throw new Error('Liên kết thiếu mã xác nhận. Vui lòng yêu cầu email mới.');
        await api('/auth/reset-password', {
          method: 'POST',
          body: jsonBody({ token: params.get('token'), password }),
        });
        clear();
        setDone(true);
      }
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const titles = {
    login: 'Chào mừng trở lại.',
    register: 'Bắt đầu hành trình mới.',
    forgot: 'Quên mật khẩu?',
    reset: 'Tạo mật khẩu mới.',
  };
  const subtitles = {
    login: 'Đăng nhập để tiếp tục hành trình học tập của bạn.',
    register: 'Một tài khoản. Mở ra nhiều cơ hội học tập.',
    forgot: 'Đừng lo, chúng mình sẽ giúp bạn lấy lại quyền truy cập.',
    reset: 'Một mật khẩu mạnh để bảo vệ không gian của bạn.',
  };
  return (
    <div className="auth-page">
      <aside className="auth-story">
        <Logo light />
        <div className="story-content">
          <span className="story-label">
            <span /> KHÔNG GIAN HỌC TẬP THẾ HỆ MỚI
          </span>
          <h1>
            Mỗi bước học.
            <br />
            Một bước <em>tiến xa.</em>
          </h1>
          <p>
            Kết nối lớp học, nuôi dưỡng tri thức.
            <br />
            Cùng bạn làm chủ hành trình của chính mình.
          </p>
          <div className="story-visual" aria-hidden="true">
            <div className="visual-grid" />
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="floating-symbol symbol-one">
              <BookOpen size={25} />
            </div>
            <div className="floating-symbol symbol-two">
              <GraduationCap size={29} />
            </div>
            <div className="learning-card">
              <div className="learning-card-top">
                <span>
                  <Sparkles size={18} />
                </span>
                <small>YOUR LEARNING SPACE</small>
                <span className="live-dot" />
              </div>
              <h3>Tiến bộ mỗi ngày</h3>
              <p>Những nỗ lực nhỏ. Kết quả lớn.</p>
              <div className="visual-bars">
                {[32, 45, 38, 60, 52, 76, 91].map((height, index) => (
                  <i key={index} style={{ height: `${height}%` }} />
                ))}
              </div>
              <div className="visual-days">
                <span>T2</span>
                <span>T3</span>
                <span>T4</span>
                <span>T5</span>
                <span>T6</span>
                <span>T7</span>
                <span>CN</span>
              </div>
            </div>
            <div className="achievement-card">
              <span>
                <TrendingUp size={21} />
              </span>
              <div>
                <b>Sẵn sàng bứt phá</b>
                <small>Phiên bản tốt hơn của bạn</small>
              </div>
              <Check size={15} />
            </div>
          </div>
          <div className="story-values">
            <span>
              <ShieldCheck size={16} /> An toàn & riêng tư
            </span>
            <span>
              <Users size={16} /> Kết nối dễ dàng
            </span>
          </div>
        </div>
        <div className="story-footer">
          <span>© {new Date().getFullYear()} QuizSpace</span>
          <span>
            Made for curious minds <Sparkles size={13} />
          </span>
        </div>
      </aside>
      <main className="auth-main">
        <div className="auth-mobile-logo">
          <Logo />
        </div>
        <div className="auth-topline">
          {mode === 'login' ? (
            <>
              Chưa có tài khoản?{' '}
              <Link href="/register">
                Đăng ký ngay <ArrowUpRightIcon />
              </Link>
            </>
          ) : (
            <>
              Đã có tài khoản?{' '}
              <Link href="/login">
                Đăng nhập <ArrowUpRightIcon />
              </Link>
            </>
          )}
        </div>
        <div className="auth-form-wrap">
          {mode === 'forgot' || mode === 'reset' ? (
            <Link className="back-link" href="/login">
              <ArrowLeft size={16} /> Quay lại đăng nhập
            </Link>
          ) : (
            <span className="welcome-tag">
              <span /> YOUR NEXT CHAPTER STARTS HERE
            </span>
          )}
          {done ? (
            <div className="auth-success">
              <span className="success-icon">
                {mode === 'forgot' ? <Mail size={30} /> : <Check size={30} />}
              </span>
              <h2>{mode === 'forgot' ? 'Kiểm tra hộp thư nhé.' : 'Mật khẩu đã được cập nhật.'}</h2>
              <p>
                {mode === 'forgot'
                  ? 'Nếu email tồn tại trong hệ thống, bạn sẽ nhận được liên kết đặt lại mật khẩu. Đừng quên kiểm tra mục thư rác.'
                  : 'Bạn đã sẵn sàng quay lại. Đăng nhập bằng mật khẩu mới để tiếp tục.'}
              </p>
              <Link href="/login" className="btn btn-primary">
                Quay lại đăng nhập <ArrowRight size={17} />
              </Link>
            </div>
          ) : (
            <>
              <h2>{titles[mode]}</h2>
              <p className="auth-subtitle">{subtitles[mode]}</p>
              <ErrorBox message={error} />
              <form onSubmit={submit} className="auth-form">
                {mode === 'register' && (
                  <>
                    <div className="role-picker">
                      <button
                        type="button"
                        aria-pressed={role === 'STUDENT'}
                        className={role === 'STUDENT' ? 'selected' : ''}
                        onClick={() => setRole('STUDENT')}
                      >
                        <GraduationCap size={21} />
                        <span>Tôi là học sinh</span>
                        {role === 'STUDENT' && <Check size={15} />}
                      </button>
                      <button
                        type="button"
                        aria-pressed={role === 'TEACHER'}
                        className={role === 'TEACHER' ? 'selected' : ''}
                        onClick={() => setRole('TEACHER')}
                      >
                        <BookOpen size={21} />
                        <span>Tôi là giáo viên</span>
                        {role === 'TEACHER' && <Check size={15} />}
                      </button>
                    </div>
                    <Field label="Họ và tên">
                      <input
                        name="name"
                        autoComplete="name"
                        placeholder="Nguyễn Minh Anh"
                        minLength={2}
                        maxLength={80}
                        required
                      />
                    </Field>
                  </>
                )}
                {mode !== 'reset' && (
                  <Field label="Email">
                    <div className="input-icon">
                      <Mail size={18} />
                      <input
                        type="email"
                        name="email"
                        autoComplete="email"
                        placeholder="ban@example.com"
                        required
                      />
                    </div>
                  </Field>
                )}
                {mode !== 'forgot' && (
                  <Field
                    label={mode === 'reset' ? 'Mật khẩu mới' : 'Mật khẩu'}
                    hint={mode !== 'login' ? 'Ít nhất 10 ký tự, bao gồm chữ và số.' : undefined}
                  >
                    <div className="input-icon">
                      <LockKeyhole size={18} />
                      <input
                        name="password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                        placeholder={
                          mode === 'login' ? 'Nhập mật khẩu của bạn' : 'Tạo mật khẩu an toàn'
                        }
                        minLength={mode === 'login' ? 1 : 10}
                        maxLength={72}
                        required
                      />
                      <button
                        className="password-toggle"
                        type="button"
                        onClick={() => setShowPassword((value) => !value)}
                        aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </Field>
                )}
                {mode === 'reset' && (
                  <Field label="Xác nhận mật khẩu">
                    <input
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      minLength={10}
                      maxLength={72}
                      placeholder="Nhập lại mật khẩu mới"
                      required
                    />
                  </Field>
                )}
                {mode === 'login' && (
                  <div className="auth-form-meta">
                    <span>
                      <ShieldCheck size={14} /> Phiên đăng nhập được bảo vệ
                    </span>
                    <Link href="/forgot-password">Quên mật khẩu?</Link>
                  </div>
                )}
                <button className="btn btn-primary auth-submit" disabled={busy}>
                  {busy ? (
                    <Spinner />
                  ) : (
                    <>
                      {mode === 'login'
                        ? 'Đăng nhập'
                        : mode === 'register'
                          ? 'Tạo tài khoản'
                          : mode === 'forgot'
                            ? 'Gửi liên kết khôi phục'
                            : 'Lưu mật khẩu mới'}
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
              </form>
              {googleClientId && (mode === 'login' || mode === 'register') && (
                <>
                  <div className="divider-text">
                    <span>hoặc tiếp tục với</span>
                  </div>
                  <Script src="https://accounts.google.com/gsi/client" onReady={setupGoogle} />
                  <div ref={googleRef} className="google-button" />
                </>
              )}
              <div className="auth-bottom-note">
                <ShieldCheck size={15} />
                <span>
                  Thông tin của bạn luôn được bảo vệ và chỉ sử dụng
                  <br className="desktop-break" /> để mang đến trải nghiệm học tập tốt hơn.
                </span>
              </div>
            </>
          )}
        </div>
        <footer className="auth-footer">
          <span>Học theo cách của bạn.</span>
          <span>
            Tiếng Việt <span className="language-dot" />
          </span>
        </footer>
      </main>
    </div>
  );
}
function ArrowUpRightIcon() {
  return <ArrowRight size={14} className="diagonal-arrow" />;
}
