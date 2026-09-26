'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  Award,
  BookOpen,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  History,
  TrendingUp,
  Target,
  ArrowRight,
} from 'lucide-react';
import { useQuery } from '@/lib/use-query';
import { dateLabel, type Attempt, type Progress } from '@/lib/types';
import { Empty, ErrorBox, Loading, Metric, SectionTitle } from './ui';

export function ProgressChart({ data }: { data: Progress }) {
  if (!data.recent.length)
    return (
      <Empty
        icon={<TrendingUp size={28} />}
        title="Mọi hành trình đều có khởi đầu"
        description="Kết quả và biểu đồ tiến bộ sẽ xuất hiện sau khi bạn hoàn thành bài thi đầu tiên."
      />
    );
  const width = 640;
  const height = 180;
  const pad = 28;
  const points = data.recent.map(
    (row, index) =>
      `${pad + (index * (width - pad * 2)) / Math.max(1, data.recent.length - 1)},${height - (row.score / 10) * (height - 20)}`,
  );
  return (
    <div className="chart-wrap">
      <div className="chart-y-labels">
        <span>10</span>
        <span>7.5</span>
        <span>5</span>
        <span>2.5</span>
        <span>0</span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height + 20}`}
        role="img"
        aria-label="Điểm các bài thi gần nhất, thang điểm 10"
      >
        <defs>
          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#25a988" stopOpacity=".2" />
            <stop offset="100%" stopColor="#25a988" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[20, 60, 100, 140, 180].map((y) => (
          <line
            key={y}
            x1={pad}
            x2={width - pad}
            y1={y}
            y2={y}
            stroke="#e9efec"
            strokeDasharray="4 5"
          />
        ))}
        <polygon
          points={`${pad},${height} ${points.join(' ')} ${points[points.length - 1].split(',')[0]},${height}`}
          fill="url(#chartFill)"
        />
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#209b7d"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {points.map((point, i) => (
          <circle
            key={i}
            cx={point.split(',')[0]}
            cy={point.split(',')[1]}
            r="5"
            fill="#fff"
            stroke="#209b7d"
            strokeWidth="2"
          >
            <title>
              {dateLabel(data.recent[i].submittedAt)}: {data.recent[i].score}/10
            </title>
          </circle>
        ))}
      </svg>
      <div className="chart-caption">
        <span>Bài gần nhất</span>
        <span>
          <i /> Điểm / 10
        </span>
      </div>
    </div>
  );
}
export function ProgressPage() {
  const { data, error, loading, reload } = useQuery<Progress>('/student/progress');
  return (
    <>
      <SectionTitle
        eyebrow="SMALL STEPS, BIG PROGRESS"
        title="Tiến độ học tập"
        description="Nhìn lại những nỗ lực và tìm động lực cho chặng đường tiếp theo."
      />
      {loading ? (
        <Loading />
      ) : error || !data ? (
        <ErrorBox message={error} retry={reload} />
      ) : (
        <>
          <div className="metrics-grid">
            <Metric
              label="Đã hoàn thành"
              value={data.attempts}
              icon={<CheckCheck size={22} />}
              detail="Bài thi trong hành trình của bạn"
            />
            <Metric
              label="Điểm trung bình"
              value={data.attempts ? `${data.average}/10` : '—'}
              icon={<TrendingUp size={22} />}
              detail="Trên tất cả các bài thi"
              tone="blue"
            />
            <Metric
              label="Điểm cao nhất"
              value={data.attempts ? `${data.best}/10` : '—'}
              icon={<Award size={22} />}
              detail="Cột mốc đáng tự hào của bạn"
              tone="amber"
            />
            <Metric
              label="Mục tiêu tuần"
              value={`${data.weeklyCount}/${data.weeklyGoal}`}
              icon={<Target size={22} />}
              detail="Số bài thi đã hoàn thành tuần này"
              tone="violet"
            />
          </div>
          <div className="overview-grid">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Biểu đồ kết quả</h2>
                  <p>Tối đa 10 bài thi gần nhất</p>
                </div>
                <span className="tag-neutral">Thang điểm 10</span>
              </div>
              <ProgressChart data={data} />
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Theo môn học</h2>
                  <p>Nhận diện điểm mạnh của bạn</p>
                </div>
              </div>
              {data.subjects.length ? (
                <div className="subject-progress">
                  {data.subjects.map((subject) => (
                    <div key={subject.subject}>
                      <div>
                        <b>{subject.subject}</b>
                        <span>{subject.average}/10</span>
                      </div>
                      <div className="progress-track">
                        <i style={{ width: `${subject.average * 10}%` }} />
                      </div>
                      <small>{subject.attempts} bài đã hoàn thành</small>
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Chưa có kết quả"
                  description="Tiến độ từng môn sẽ được tổng hợp tại đây."
                  icon={<BookOpen size={24} />}
                />
              )}
            </section>
          </div>
          <div className="bottom-callout">
            <span className="callout-icon">
              <Target size={22} />
            </span>
            <div>
              <b>Kiên trì quan trọng hơn hoàn hảo.</b>
              <p>Đặt mục tiêu vừa sức, rồi tiến bộ từng chút mỗi ngày.</p>
            </div>
            <Link href="/profile" className="text-link">
              Đặt mục tiêu <ArrowRight size={16} />
            </Link>
          </div>
        </>
      )}
    </>
  );
}
export function HistoryPage() {
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useQuery<{
    items: Attempt[];
    total: number;
    pages: number;
  }>(`/student/history?page=${page}`);
  return (
    <>
      <SectionTitle
        eyebrow="YOUR LEARNING JOURNEY"
        title="Lịch sử thi"
        description="Mỗi kết quả là một dấu mốc trên hành trình học tập."
      />
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>
              Bài thi đã hoàn thành <span className="count-badge">{data?.total || 0}</span>
            </h2>
            <p>Tất cả kết quả của riêng bạn, ở một nơi</p>
          </div>
          <History size={21} className="muted" />
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorBox message={error} retry={reload} />
        ) : data?.items.length ? (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>BÀI THI</th>
                    <th>MÔN HỌC</th>
                    <th>ĐIỂM SỐ</th>
                    <th>THỜI GIAN</th>
                    <th>HOÀN THÀNH</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <b>{item.title}</b>
                      </td>
                      <td>
                        <span className="tag-neutral">{item.subject}</span>
                      </td>
                      <td>
                        <span className={`score-badge ${item.score >= 5 ? '' : 'low'}`}>
                          {item.score}
                          <small>/10</small>
                        </span>
                      </td>
                      <td>
                        <span className="inline-flex muted">
                          <Clock3 size={14} /> {Math.ceil(item.durationSeconds / 60)} phút
                        </span>
                      </td>
                      <td className="muted">{dateLabel(item.submittedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-pagination">
              <span>{data.total} bài thi đã hoàn thành</span>
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
                  {page}/{data.pages}
                </span>
                <button
                  className="icon-btn"
                  disabled={page >= data.pages}
                  onClick={() => setPage(page + 1)}
                  aria-label="Trang sau"
                >
                  <ChevronRight size={17} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <Empty
            icon={<History size={28} />}
            title="Trang đầu tiên của hành trình"
            description="Bạn chưa có bài thi nào. Khi hoàn thành bài thi, kết quả sẽ được lưu và hiển thị tại đây."
            action={
              <Link href="/classes" className="btn btn-secondary">
                Khám phá lớp học <ArrowRight size={16} />
              </Link>
            }
          />
        )}
      </section>
    </>
  );
}
