'use client';
import Link from 'next/link';
import {
  ArrowRight,
  ArrowUpRight,
  Users,
  GraduationCap,
  BookOpen,
  ShieldCheck,
  Plus,
  Check,
  Sparkles,
  Target,
  Clock3,
  Trophy,
  CalendarDays,
  Layers3,
} from 'lucide-react';
import { useQuery } from '@/lib/use-query';
import { type User, type Classroom, type Progress, roleLabel, dateLabel } from '@/lib/types';
import { Avatar, Empty, ErrorBox, Loading, Metric, SectionTitle } from './ui';
import { ProgressChart } from './workspace-learning';
import { StudentStrengths, TeacherAnalytics } from './dashboard-analytics';
import {
  countLabel,
  percentLabel,
  studyLabel,
  type StudentDashboard,
  type TeacherDashboard,
} from '@/lib/dashboard';

export function Overview({ user }: { user: User }) {
  return (
    <>
      <SectionTitle
        eyebrow="YOUR WORKSPACE, YOUR POSSIBILITIES"
        title={`Xin chào, ${user.name.split(' ').slice(-1)[0]} 👋`}
        description={
          user.role === 'ADMIN'
            ? 'Cùng xây dựng một cộng đồng học tập tốt hơn, mỗi ngày.'
            : user.role === 'TEACHER'
              ? 'Một ngày mới, thêm nhiều cơ hội để truyền cảm hứng.'
              : 'Thật vui khi gặp lại bạn. Hôm nay mình cùng tiến bộ nhé!'
        }
        action={
          <span className="date-pill">
            <CalendarDays size={16} />
            {new Date().toLocaleDateString('vi-VN', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        }
      />
      <div className="welcome-banner">
        <div>
          <span className="banner-tag">
            <Sparkles size={13} />{' '}
            {user.role === 'ADMIN'
              ? 'KẾT NỐI & PHÁT TRIỂN'
              : user.role === 'TEACHER'
                ? 'TEACH WITH PURPOSE'
                : 'LEARN SOMETHING NEW'}
          </span>
          <h2>
            {user.role === 'ADMIN'
              ? 'Một nền tảng. Nhiều tiềm năng.'
              : user.role === 'TEACHER'
                ? 'Lớp học nhỏ. Những ý tưởng lớn.'
                : 'Đầu tư cho tri thức, mở lối tương lai.'}
          </h2>
          <p>
            {user.role === 'ADMIN'
              ? 'Quản lý thành viên, kết nối giáo viên và học sinh trong một không gian.'
              : user.role === 'TEACHER'
                ? 'Tổ chức lớp học và đồng hành cùng từng học sinh trên hành trình học tập.'
                : 'Mỗi bài học là một bước tiến. Bắt đầu từ mục tiêu nhỏ của bạn hôm nay.'}
          </p>
          <Link href={user.role === 'ADMIN' ? '/users' : '/classes'}>
            {user.role === 'ADMIN' ? 'Khám phá cộng đồng' : 'Đến lớp học của bạn'}{' '}
            <ArrowRight size={16} />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <span className="art-ring ring-a" />
          <span className="art-ring ring-b" />
          <div className="art-book">
            <BookOpen size={49} strokeWidth={1.1} />
          </div>
          <span className="art-star star-one">✦</span>
          <span className="art-star star-two">✦</span>
          <span className="art-chip">
            <Check size={13} /> Keep growing
          </span>
        </div>
      </div>
      {user.role === 'ADMIN' ? (
        <AdminOverview />
      ) : user.role === 'TEACHER' ? (
        <TeacherOverview />
      ) : (
        <StudentOverview />
      )}
    </>
  );
}
type AdminSummary = {
  total: number;
  teachers: number;
  students: number;
  locked: number;
  classes: number;
  recent: User[];
};
function AdminOverview() {
  const { data, error, loading, reload } = useQuery<AdminSummary>('/admin/overview');
  if (loading) return <Loading />;
  if (error || !data) return <ErrorBox message={error} retry={reload} />;
  const teacherAngle = data.total ? (data.teachers / data.total) * 360 : 0;
  const studentAngle = data.total ? (data.students / data.total) * 360 : 0;
  return (
    <>
      <div className="metrics-grid">
        <Metric
          label="Tổng người dùng"
          value={data.total}
          icon={<Users size={21} />}
          detail="Thành viên trong cộng đồng"
        />
        <Metric
          label="Giáo viên"
          value={data.teachers}
          icon={<BookOpen size={21} />}
          detail={`${data.classes} lớp học đã được tạo`}
          tone="violet"
        />
        <Metric
          label="Học sinh"
          value={data.students}
          icon={<GraduationCap size={22} />}
          detail="Cùng nhau học hỏi mỗi ngày"
          tone="blue"
        />
        <Metric
          label="Đang hoạt động"
          value={data.total - data.locked}
          icon={<ShieldCheck size={21} />}
          detail={`${data.locked} tài khoản đang bị khóa`}
          tone="amber"
        />
      </div>
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Thành viên mới</h2>
              <p>Những gương mặt mới trong cộng đồng</p>
            </div>
            <Link className="text-link" href="/users">
              Xem tất cả <ArrowUpRight size={16} />
            </Link>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>THÀNH VIÊN</th>
                  <th>VAI TRÒ</th>
                  <th>THAM GIA</th>
                  <th>TRẠNG THÁI</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="person-cell">
                        <Avatar user={user} />
                        <div>
                          <b>{user.name}</b>
                          <small>{user.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge ${user.role.toLowerCase()}`}>
                        {roleLabel[user.role]}
                      </span>
                    </td>
                    <td className="muted">{dateLabel(user.createdAt)}</td>
                    <td>
                      <span className={`status-badge ${user.status === 'LOCKED' ? 'locked' : ''}`}>
                        <i />
                        {user.status === 'ACTIVE' ? 'Hoạt động' : 'Đã khóa'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section className="panel community-panel">
          <div className="panel-heading">
            <div>
              <h2>Cộng đồng QuizSpace</h2>
              <p>Khác vai trò, chung mục tiêu</p>
            </div>
          </div>
          <div
            className="donut"
            style={{
              background: `conic-gradient(#29aa8c 0deg ${studentAngle}deg, #9f8ce9 ${studentAngle}deg ${studentAngle + teacherAngle}deg, #254d51 ${studentAngle + teacherAngle}deg 360deg)`,
            }}
          >
            <div>
              <strong>{data.total}</strong>
              <span>thành viên</span>
            </div>
          </div>
          <div className="donut-legend">
            <div>
              <i style={{ background: '#29aa8c' }} />
              <span>Học sinh</span>
              <b>{data.students}</b>
            </div>
            <div>
              <i style={{ background: '#9f8ce9' }} />
              <span>Giáo viên</span>
              <b>{data.teachers}</b>
            </div>
            <div>
              <i style={{ background: '#254d51' }} />
              <span>Quản trị viên</span>
              <b>{data.total - data.students - data.teachers}</b>
            </div>
          </div>
        </section>
      </div>
      <div className="bottom-callout">
        <span className="callout-icon">
          <Users size={22} />
        </span>
        <div>
          <b>Mỗi thành viên mới, một cơ hội mới.</b>
          <p>Tạo tài khoản, phân quyền và giúp mọi người bắt đầu.</p>
        </div>
        <Link className="btn btn-secondary" href="/users">
          <Plus size={16} /> Quản lý người dùng
        </Link>
      </div>
    </>
  );
}
function TeacherOverview() {
  const dashboard = useQuery<TeacherDashboard>('/teacher/dashboard');
  const classes = useQuery<{ classes: Classroom[] }>('/teacher/classes');
  if (dashboard.loading || classes.loading) return <Loading />;
  if (dashboard.error || !dashboard.data || classes.error)
    return (
      <ErrorBox
        message={dashboard.error || classes.error}
        retry={() => {
          dashboard.reload();
          classes.reload();
        }}
      />
    );
  const data = dashboard.data;
  const list = classes.data?.classes || [];
  return (
    <>
      <div className="metrics-grid">
        <Metric
          label="Học sinh"
          value={countLabel(data.students)}
          icon={<GraduationCap size={22} />}
          detail="Thành viên trong các lớp của bạn"
        />
        <Metric
          label="Đề thi"
          value={countLabel(data.exams)}
          icon={<BookOpen size={21} />}
          detail="Đề đang soạn và đã xuất bản"
          tone="violet"
        />
        <Metric
          label="Câu hỏi"
          value={countLabel(data.questions)}
          icon={<Layers3 size={21} />}
          detail="Trong ngân hàng, trừ câu đã lưu trữ"
          tone="blue"
        />
        <Metric
          label="Lượt làm bài"
          value={countLabel(data.attempts)}
          icon={<Check size={21} />}
          detail="Bài đã nộp, kể cả bài chờ chấm"
          tone="amber"
        />
      </div>
      <div className="metrics-grid two">
        <Metric
          label="Điểm trung bình"
          value={percentLabel(data.averageScore)}
          icon={<Trophy size={21} />}
          detail="Các bài đã có điểm"
        />
        <Metric
          label="Tỷ lệ đạt"
          value={percentLabel(data.passRate)}
          icon={<Target size={21} />}
          detail="Số bài đạt trên số bài đã chấm"
          tone="violet"
        />
      </div>
      <TeacherAnalytics data={data} />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Lớp học gần đây</h2>
            <p>Truyền cảm hứng, từng lớp học một</p>
          </div>
          <Link href="/classes" className="text-link">
            Quản lý lớp <ArrowUpRight size={16} />
          </Link>
        </div>
        {list.length ? (
          <div className="mini-class-grid">
            {list.slice(0, 3).map((cl) => (
              <Link href="/classes" className={`mini-class ${cl.color}`} key={cl.id}>
                <BookOpen size={24} />
                <h3>{cl.name}</h3>
                <p>{cl.subject}</p>
                <span>
                  <Users size={14} /> {cl.studentCount} học sinh <ArrowUpRight size={15} />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <Empty
            title="Lớp học đầu tiên đang chờ bạn"
            description="Tạo lớp học, mời học sinh và bắt đầu kết nối ngay hôm nay."
            action={
              <Link className="btn btn-primary" href="/classes">
                <Plus size={16} /> Tạo lớp học
              </Link>
            }
          />
        )}
      </section>
      <div className="bottom-callout">
        <span className="callout-icon">
          <Sparkles size={22} />
        </span>
        <div>
          <b>Một lời mời, mở ra nhiều kết nối.</b>
          <p>Chia sẻ mã lớp hoặc thêm học sinh bằng email đã đăng ký.</p>
        </div>
        <Link href="/students" className="text-link">
          Xem học sinh <ArrowRight size={16} />
        </Link>
      </div>
    </>
  );
}
function StudentOverview() {
  const progress = useQuery<Progress>('/student/progress');
  const dashboard = useQuery<StudentDashboard>('/student/dashboard');
  if (progress.loading || dashboard.loading) return <Loading />;
  if (progress.error || dashboard.error || !dashboard.data)
    return (
      <ErrorBox
        message={progress.error || dashboard.error}
        retry={() => {
          progress.reload();
          dashboard.reload();
        }}
      />
    );
  const data = progress.data!;
  const summary = dashboard.data;
  return (
    <>
      <div className="metrics-grid">
        <Metric
          label="Bài thi đã hoàn thành"
          value={countLabel(summary.completed)}
          icon={<Check size={21} />}
          detail="Mỗi bài thi là một bước tiến"
        />
        <Metric
          label="Điểm trung bình"
          value={percentLabel(summary.averageScore)}
          icon={<Trophy size={21} />}
          detail="Trên thang 100%"
          tone="violet"
        />
        <Metric
          label="Điểm cao nhất"
          value={percentLabel(summary.bestScore)}
          icon={<Target size={21} />}
          detail="Bài làm tốt nhất"
          tone="blue"
        />
        <Metric
          label="Thời gian học"
          value={studyLabel(summary.studyMinutes)}
          icon={<Clock3 size={21} />}
          detail="Tổng thời gian làm bài"
          tone="amber"
        />
      </div>
      <StudentStrengths data={summary} />
      <div className="overview-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Hành trình tiến bộ</h2>
              <p>Kết quả 10 bài thi gần nhất</p>
            </div>
            <Link className="text-link" href="/progress">
              Chi tiết <ArrowUpRight size={16} />
            </Link>
          </div>
          <ProgressChart data={data} />
        </section>
        <section className="panel goal-panel">
          <span className="goal-icon">
            <Target size={25} />
          </span>
          <h2>
            Từng bước nhỏ,
            <br />
            thành quả lớn.
          </h2>
          <p>Mục tiêu hoàn thành bài thi tuần này</p>
          <div className="goal-count">
            <strong>{data.weeklyCount}</strong>
            <span>/ {data.weeklyGoal} bài</span>
          </div>
          <div className="progress-track">
            <i style={{ width: `${Math.min(100, (data.weeklyCount / data.weeklyGoal) * 100)}%` }} />
          </div>
          <small>
            {data.weeklyCount >= data.weeklyGoal
              ? 'Tuyệt vời! Bạn đã hoàn thành mục tiêu.'
              : `Còn ${data.weeklyGoal - data.weeklyCount} bài để hoàn thành mục tiêu.`}
          </small>
          <Link href="/profile">
            Điều chỉnh mục tiêu <ArrowRight size={14} />
          </Link>
        </section>
      </div>
    </>
  );
}
