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
import { pendingJoinKey } from '@/lib/classes';

type Mode = 'login' | 'register' | 'forgot' | 'reset' | 'verify';
function homePath() {
  const code = window.sessionStorage.getItem(pendingJoinKey) || '';
  return /^[a-f\d]{10}$/i.test(code) ? `/join/${code}` : '/dashboard';
}
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
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [resent, setResent] = useState(false);
  const [verifying, setVerifying] = useState(
    mode === 'verify' && (params.get('token') || '').length >= 20,
  );
  const [verified, setVerified] = useState(false);
  const [role, setRole] = useState<'STUDENT' | 'TEACHER'>('STUDENT');
  const [googleClientId, setGoogleClientId] = useState('');
  const googleRef = useRef<HTMLDivElement>(null);
  const verifyStarted = useRef(false);
  useEffect(() => {
    if (!loading && user && (mode === 'login' || mode === 'register')) router.replace(homePath());
  }, [user, loading, mode, router]);
  useEffect(() => {
    api<{ googleClientId: string }>('/auth/config')
      .then((result) => setGoogleClientId(result.googleClientId))
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (mode !== 'verify') return;
    const timer = setTimeout(() => {
      if (verifyStarted.current) return;
      verifyStarted.current = true;
      const token = new URLSearchParams(window.location.search).get('token') || '';
      if (token.length < 20) return;
      setVerifying(true);
      api<AuthResult>('/auth/verify-email', { method: 'POST', body: jsonBody({ token }) })
        .then((result) => {
          accept(result);
          setVerified(true);
          setVerifying(false);
          window.setTimeout(() => router.replace(homePath()), 4000);
        })
        .catch((reason) => {
          setError((reason as Error).message);
          setVerifying(false);
        });
    }, 0);
    return () => clearTimeout(timer);
  }, [mode, accept, router]);
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
          router.replace(homePath());
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
    const email = String(form.get('email') || '');
    try {
      const password = String(form.get('password') || '');
      if (mode === 'login') {
        accept(
          await api<AuthResult>('/auth/login', {
            method: 'POST',
            body: jsonBody({ email, password }),
          }),
        );
        router.replace(homePath());
      } else if (mode === 'register') {
        const confirmPassword = String(form.get('confirmPassword') || '');
        if (password !== confirmPassword) throw new Error('Hai mật khẩu chưa khớp.');
        await api('/auth/register', {
          method: 'POST',
          body: jsonBody({ email, password, confirmPassword, name: form.get('name'), role }),
        });
        router.push(`/verify?email=${encodeURIComponent(email)}`);
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
      const message = (error as Error).message;
      if (mode === 'login' && message.includes('xác minh')) {
        router.push(`/verify?email=${encodeURIComponent(email)}`);
        return;
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  }
  const pendingEmail = params.get('email') || '';
  async function resendVerification() {
    if (!pendingEmail) return;
    setBusy(true);
    setError('');
    try {
      await api('/auth/resend-verification', {
        method: 'POST',
        body: jsonBody({ email: pendingEmail }),
      });
      setResent(true);
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
    verify: 'Xác minh email.',
  };
  const subtitles = {
    login: 'Đăng nhập để tiếp tục hành trình học tập của bạn.',
    register: 'Một tài khoản. Mở ra nhiều cơ hội học tập.',
    forgot: 'Đừng lo, chúng mình sẽ giúp bạn lấy lại quyền truy cập.',
    reset: 'Một mật khẩu mạnh để bảo vệ không gian của bạn.',
    verify: 'Mở liên kết trong email để vào trang chủ.',
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
          {mode === 'forgot' || mode === 'reset' || (mode === 'verify' && !verified) ? (
            <Link className="back-link" href="/login">
              <ArrowLeft size={16} /> Quay lại đăng nhập
            </Link>
          ) : (
            <span className="welcome-tag">
              <span /> YOUR NEXT CHAPTER STARTS HERE
            </span>
          )}
          {mode === 'verify' ? (
            <div className="auth-success">
              <span className="success-icon">
                {verified ? <Check size={30} /> : verifying ? <Spinner /> : <Mail size={30} />}
              </span>
              <h2>
                {verified
                  ? 'Xác minh thành công'
                  : verifying
                    ? 'Đang xác minh email…'
                    : pendingEmail
                      ? 'Kiểm tra hộp thư nhé.'
                      : 'Chưa xác minh được email.'}
              </h2>
              <p>
                {verified
                  ? 'Tài khoản đã sẵn sàng. Bạn sẽ vào trang chủ trong giây lát.'
                  : verifying
                    ? 'Đang kiểm tra liên kết xác minh.'
                    : pendingEmail
                      ? `Mở liên kết đã gửi tới ${pendingEmail}. Liên kết có hiệu lực trong 24 giờ. Hãy kiểm tra cả mục thư rác.`
                      : error || 'Liên kết không hợp lệ hoặc đã hết hạn.'}
              </p>
              {verified && (
                <Link href="/dashboard" className="btn btn-primary">
                  Vào trang chủ <ArrowRight size={17} />
                </Link>
              )}
              {!verified && !verifying && pendingEmail && (
                <button
                  type="button"
                  className="btn btn-secondary auth-resend"
                  disabled={busy || resent}
                  onClick={resendVerification}
                >
                  {busy ? <Spinner /> : resent ? 'Đã gửi lại email' : 'Gửi lại email xác minh'}
                </button>
              )}
              {!verified && !verifying && !pendingEmail && (
                <Link href="/login" className="btn btn-primary">
                  Quay lại đăng nhập <ArrowRight size={17} />
                </Link>
              )}
            </div>
          ) : done ? (
            <div className="auth-success">
              <span className="success-icon">
                {mode === 'reset' ? <Check size={30} /> : <Mail size={30} />}
              </span>
              <h2>{mode === 'reset' ? 'Mật khẩu đã được cập nhật.' : 'Kiểm tra hộp thư nhé.'}</h2>
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
                {(mode === 'reset' || mode === 'register') && (
                  <Field label={mode === 'register' ? 'Nhập lại mật khẩu' : 'Xác nhận mật khẩu'}>
                    <div className="input-icon">
                      <LockKeyhole size={18} />
                      <input
                        name="confirmPassword"
                        type={showConfirm ? 'text' : 'password'}
                        autoComplete="new-password"
                        minLength={10}
                        maxLength={72}
                        placeholder={
                          mode === 'register' ? 'Nhập lại mật khẩu' : 'Nhập lại mật khẩu mới'
                        }
                        required
                      />
                      <button
                        className="password-toggle"
                        type="button"
                        onClick={() => setShowConfirm((value) => !value)}
                        aria-label={showConfirm ? 'Ẩn mật khẩu nhập lại' : 'Hiện mật khẩu nhập lại'}
                      >
                        {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
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
