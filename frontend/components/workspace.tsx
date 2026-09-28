'use client';
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  GraduationCap,
  History,
  ChartNoAxesCombined,
  Settings2,
  LogOut,
  Search,
  ArrowUpRight,
  ChevronRight,
  Menu,
  X,
  BookOpenText,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  LibraryBig,
  BarChart3,
  ClipboardList,
  BrainCircuit,
  Target,
} from 'lucide-react';
import { useAuth } from './auth-provider';
import { Avatar, Logo, Loading, Modal, ErrorBox } from './ui';
import { api } from '@/lib/api';
import { roleLabel, type User } from '@/lib/types';
import { Overview } from './workspace-overview';
import { UserManagement } from './workspace-users';
import { ClassManagement, StudentManagement } from './workspace-classes';
import { ClassDetail } from './classes/class-detail';
import { HistoryPage, ProgressPage } from './workspace-learning';
import { ProfilePage } from './workspace-profile';
import { QuestionBank } from './workspace-questions';
import { QuestionAnalytics } from './workspace-question-analytics';
import { ExamManagement, StudentExams } from './workspace-exams';
import { AIExamStudio } from './workspace-ai-exams';
import { AIStudio } from './workspace-ai';
import { LearningAnalysisPage } from './workspace-analysis';
import { PracticeStudio } from './practice/practice-studio';
import { NotificationBell } from './notification-bell';
import { DocsPage } from './docs/docs-page';
import { OnboardingWizard } from './docs/onboarding-wizard';

export type View =
  | 'dashboard'
  | 'users'
  | 'classes'
  | 'students'
  | 'history'
  | 'progress'
  | 'learning-analysis'
  | 'practice'
  | 'profile'
  | 'docs'
  | 'questions'
  | 'question-analytics'
  | 'exams'
  | 'ai'
  | 'ai-exams';
export type Notify = (message: string, error?: boolean) => void;
const navigation = [
  {
    view: 'dashboard',
    label: 'Tổng quan',
    icon: LayoutDashboard,
    roles: ['ADMIN', 'TEACHER', 'STUDENT'],
  },
  { view: 'users', label: 'Người dùng', icon: Users, roles: ['ADMIN'] },
  { view: 'questions', label: 'Ngân hàng câu hỏi', icon: LibraryBig, roles: ['ADMIN', 'TEACHER'] },
  {
    view: 'question-analytics',
    label: 'Phân tích câu hỏi',
    icon: BarChart3,
    roles: ['ADMIN', 'TEACHER'],
  },
  { view: 'ai', label: 'Tạo câu hỏi AI', icon: Sparkles, roles: ['ADMIN', 'TEACHER'] },
  {
    view: 'exams',
    label: 'Đề thi & kiểm tra',
    icon: ClipboardList,
    roles: ['ADMIN', 'TEACHER', 'STUDENT'],
  },
  { view: 'ai-exams', label: 'Tạo đề thi AI', icon: ClipboardList, roles: ['ADMIN', 'TEACHER'] },
  { view: 'classes', label: 'Lớp học', icon: BookOpen, roles: ['TEACHER', 'STUDENT'] },
  { view: 'students', label: 'Học sinh', icon: GraduationCap, roles: ['TEACHER'] },
  { view: 'history', label: 'Lịch sử thi', icon: History, roles: ['STUDENT'] },
  { view: 'progress', label: 'Tiến độ học', icon: ChartNoAxesCombined, roles: ['STUDENT'] },
  { view: 'learning-analysis', label: 'Phân tích học tập', icon: BrainCircuit, roles: ['STUDENT'] },
  { view: 'practice', label: 'Luyện tập cá nhân', icon: Target, roles: ['STUDENT'] },
  {
    view: 'profile',
    label: 'Hồ sơ cá nhân',
    icon: Settings2,
    roles: ['ADMIN', 'TEACHER', 'STUDENT'],
  },
  {
    view: 'docs',
    label: 'Hướng dẫn',
    icon: BookOpenText,
    roles: ['ADMIN', 'TEACHER', 'STUDENT'],
  },
];
const accountViews = ['profile', 'docs'];
export function Workspace({
  view,
  classId,
  docSlug,
}: {
  view: View;
  classId?: string;
  docSlug?: string;
}) {
  const { user, loading, logout, connectionError, reconnect, updateUser } = useAuth();
  const router = useRouter();
  const [sidebar, setSidebar] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState('');
  const [tour, setTour] = useState(false);
  const [tourDone, setTourDone] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [notice, setNotice] = useState<{ message: string; error: boolean } | null>(null);
  const notify = useCallback<Notify>((message, error = false) => setNotice({ message, error }), []);
  useEffect(() => {
    if (!loading && !user && !connectionError) router.replace('/login');
  }, [user, loading, router, connectionError]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5500);
    return () => clearTimeout(timer);
  }, [notice]);
  if (connectionError && !user)
    return (
      <div className="ep-gate">
        <ErrorBox message={connectionError} retry={reconnect} />
      </div>
    );
  if (loading || !user) return <Loading />;
  const nav = navigation.filter((item) => item.roles.includes(user.role));
  const current = navigation.find((item) => item.view === view)!;
  const allowed = current.roles.includes(user.role);
  const showTour = tour || (!user.onboarded && !tourDone);
  const closeTour = () => {
    setTour(false);
    setTourDone(true);
    if (!user.onboarded)
      api<User>('/me/onboarding', { method: 'POST' })
        .then(updateUser)
        .catch((error: Error) => notify(error.message, true));
  };
  const signOut = async () => {
    setLoggingOut(true);
    try {
      await logout();
      router.replace('/login');
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setLoggingOut(false);
    }
  };
  return (
    <div className="workspace">
      {sidebar && (
        <button
          className="sidebar-backdrop"
          onClick={() => setSidebar(false)}
          aria-label="Đóng menu"
        />
      )}
      <aside className={`sidebar ${sidebar ? 'is-open' : ''}`}>
        <div className="sidebar-brand">
          <Logo />
          <button
            className="icon-btn mobile-only"
            onClick={() => setSidebar(false)}
            aria-label="Đóng menu"
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-switch">
          <span className={`workspace-icon ${user.role.toLowerCase()}`}>
            <GraduationCap size={20} />
          </span>
          <div>
            <b>Không gian của tôi</b>
            <small>{roleLabel[user.role]}</small>
          </div>
          <span className="workspace-status" />
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav className="sidebar-nav">
          {nav
            .filter((item) => !accountViews.includes(item.view))
            .map((item) => (
              <Link
                key={item.view}
                href={`/${item.view}`}
                className={`nav-item ${view === item.view ? 'active' : ''}`}
                onClick={() => setSidebar(false)}
              >
                <item.icon size={19} strokeWidth={1.8} />
                <span>{item.label}</span>
                {view === item.view && <span className="nav-dot" />}
              </Link>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip">
            <span className="tip-icon">
              <Sparkles size={20} />
            </span>
            <h4>Sẵn sàng cho điều mới?</h4>
            <p>Một hồ sơ hoàn chỉnh là khởi đầu cho kết nối tốt hơn.</p>
            <Link href="/profile">
              Hoàn thiện hồ sơ <ArrowUpRight size={15} />
            </Link>
          </div>
          <span className="nav-caption">TÀI KHOẢN</span>
          <Link href="/profile" className={`nav-item ${view === 'profile' ? 'active' : ''}`}>
            <Settings2 size={19} />
            <span>Hồ sơ cá nhân</span>
          </Link>
          <Link
            href="/docs"
            className={`nav-item ${view === 'docs' ? 'active' : ''}`}
            onClick={() => setSidebar(false)}
          >
            <BookOpenText size={19} />
            <span>Hướng dẫn</span>
          </Link>
          <button className="nav-item sidebar-logout" onClick={signOut} disabled={loggingOut}>
            <LogOut size={19} />
            <span>{loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</span>
          </button>
          <div className="sidebar-user">
            <Avatar user={user} />
            <div>
              <b>{user.name}</b>
              <small>{roleLabel[user.role]}</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="workspace-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="icon-btn mobile-only"
              onClick={() => setSidebar(true)}
              aria-label="Mở menu"
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <b>{current.label}</b>
          </div>
          <div className="topbar-actions">
            <button className="quick-search" onClick={() => setSearch(true)}>
              <Search size={17} />
              <span>Tìm nhanh…</span>
              <kbd>⌕</kbd>
            </button>
            <span className="connection-status">
              <i /> Đã kết nối
            </span>
            <NotificationBell />
            <span className="topbar-separator" />
            <Link href="/profile" aria-label="Hồ sơ cá nhân">
              <Avatar user={user} size="sm" />
            </Link>
            <button className="topbar-logout" onClick={signOut} disabled={loggingOut}>
              <LogOut size={16} />
              <span>{loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</span>
            </button>
          </div>
        </header>
        <main className="page-content">
          {!allowed ? (
            <div className="access-denied">
              <ShieldCheck size={40} />
              <h1>Không gian dành cho vai trò khác</h1>
              <p>Tài khoản của bạn không có quyền truy cập trang này.</p>
              <Link href="/dashboard" className="btn btn-primary">
                Về tổng quan
              </Link>
            </div>
          ) : (
            <>
              {view === 'dashboard' && <Overview user={user} />}
              {view === 'users' && <UserManagement user={user} notify={notify} />}
              {view === 'classes' &&
                (classId ? (
                  <ClassDetail id={classId} role={user.role} notify={notify} />
                ) : (
                  <ClassManagement role={user.role} notify={notify} />
                ))}
              {view === 'students' && <StudentManagement />}
              {view === 'history' && <HistoryPage />}
              {view === 'progress' && <ProgressPage />}
              {view === 'learning-analysis' && <LearningAnalysisPage />}
              {view === 'practice' && (
                <Suspense fallback={<Loading />}>
                  <PracticeStudio />
                </Suspense>
              )}
              {view === 'profile' && <ProfilePage notify={notify} />}
              {view === 'docs' && (
                <DocsPage role={user.role} slug={docSlug} openTour={() => setTour(true)} />
              )}
              {view === 'questions' && <QuestionBank notify={notify} />}
              {view === 'question-analytics' && <QuestionAnalytics />}
              {view === 'ai-exams' && <AIExamStudio notify={notify} />}
              {view === 'ai' && <AIStudio notify={notify} />}
              {view === 'exams' &&
                (user.role === 'STUDENT' ? (
                  <Suspense fallback={<Loading />}>
                    <StudentExams />
                  </Suspense>
                ) : (
                  <Suspense fallback={<Loading />}>
                    <ExamManagement notify={notify} />
                  </Suspense>
                ))}
            </>
          )}
        </main>
        <footer className="workspace-footer">
          <span>© {new Date().getFullYear()} QuizSpace. Học hỏi không giới hạn.</span>
          <span>
            <span className="tiny-dot" /> Không gian học tập của bạn
          </span>
        </footer>
      </div>
      {notice && (
        <div
          role={notice.error ? 'alert' : 'status'}
          className={`toast ${notice.error ? 'toast-error' : ''}`}
        >
          {notice.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
          <span>{notice.message}</span>
          <button onClick={() => setNotice(null)} aria-label="Đóng thông báo">
            <X size={17} />
          </button>
        </div>
      )}
      {search && (
        <Modal title="Bạn muốn đến đâu?" close={() => setSearch(false)}>
          <div className="input-icon">
            <Search size={18} />
            <input
              autoFocus
              placeholder="Tìm trang hoặc chức năng…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="search-results">
            {nav
              .filter((item) => item.label.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
              .map((item) => (
                <Link onClick={() => setSearch(false)} href={`/${item.view}`} key={item.view}>
                  <item.icon size={20} />
                  <span>{item.label}</span>
                  <ArrowUpRight size={16} />
                </Link>
              ))}
          </div>
        </Modal>
      )}
      {showTour && <OnboardingWizard role={user.role} name={user.name} close={closeTour} />}
    </div>
  );
}
