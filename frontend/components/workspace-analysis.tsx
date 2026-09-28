'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Info,
  ListChecks,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useLearningAnalysis } from './learning/use-learning-analysis';
import {
  learningLevel,
  percentLabel,
  topicName,
  type LearningMetric,
  type LearningRange,
  type LearningSnapshot,
} from '@/lib/learning';
import { Empty, ErrorBox, Loading, Metric, SectionTitle, Spinner } from './ui';

export function LearningAnalysisPage() {
  const [range, setRange] = useState<LearningRange>('90');
  return (
    <div className="la-page">
      <SectionTitle
        eyebrow="LEARN WITH DIRECTION"
        title="Phân tích học tập"
        description="Biết mình đang ở đâu. Tập trung vào điều cần học tiếp."
        action={
          <label className="la-range">
            <Clock3 size={16} />
            <select
              aria-label="Khoảng thời gian"
              value={range}
              onChange={(e) => setRange(e.target.value as LearningRange)}
            >
              <option value="30">30 ngày qua</option>
              <option value="90">90 ngày qua</option>
              <option value="all">Tất cả thời gian</option>
            </select>
          </label>
        }
      />
      <LearningContent key={range} range={range} />
    </div>
  );
}
function LearningContent({ range }: { range: LearningRange }) {
  const { data, loading, sending, active, uncertain, error, reload, generate } =
    useLearningAnalysis(range);
  if (loading) return <Loading />;
  if (!data) return <ErrorBox message={error || 'Không tải được phân tích.'} retry={reload} />;
  const { snapshot: s, report, limits } = data;
  const weak = s.topics.filter((t) => t.level === 'WEAK');
  const strong = s.topics.filter((t) => t.level === 'STRONG');
  const advice = report?.status === 'READY' ? report.advice : null;
  const topics = new Map(s.topics.map((t) => [t.id, t]));
  return (
    <>
      <ErrorBox message={error} retry={reload} />
      {uncertain && !error && (
        <p className="la-footnote" role="status">
          Đang chờ xác nhận yêu cầu. Bạn có thể gửi lại an toàn bằng nút bên dưới.
        </p>
      )}
      <div className="la-hero">
        <div className="la-hero-copy">
          <span className="la-kicker">
            <BrainCircuit size={17} /> YOUR LEARNING COMPASS
          </span>
          <h2>
            {s.exams
              ? 'Học đúng trọng tâm, tiến bộ mỗi ngày.'
              : 'Mỗi bài thi mở ra một hướng học mới.'}
          </h2>
          <p>
            {weak.length
              ? `${weak.length} chủ đề cần ưu tiên ôn tập. Bắt đầu từ phần còn thiếu, từng bước củng cố kiến thức của bạn.`
              : s.exams
                ? 'Khám phá kết quả theo chủ đề và xây dựng kế hoạch ôn tập phù hợp với bạn.'
                : 'Hoàn thành bài thi để thấy điểm mạnh, phần cần cải thiện và gợi ý ôn tập dành riêng cho bạn.'}
          </p>
          <span className="la-hero-note">
            <CheckCircle2 size={14} /> Dựa trên điểm đã chấm · Gợi ý học tập, không thay đổi điểm
          </span>
          {(weak.length > 0 || s.topics.some((topic) => topic.level === 'DEVELOPING')) && (
            <div className="la-hero-actions">
              <Link className="btn btn-primary" href={`/practice?range=${range}`}>
                Practice Weak Topics <ArrowRight size={16} />
              </Link>
            </div>
          )}
        </div>
        <div
          className="la-score-ring"
          style={{ '--score': `${(s.score || 0) * 3.6}deg` } as React.CSSProperties}
        >
          <div>
            <b>{s.score === null ? '—' : percentLabel(s.score)}</b>
            <span>Điểm tổng hợp</span>
          </div>
        </div>
      </div>
      <div className="metrics-grid la-metrics">
        <Metric
          label="Đề thi được phân tích"
          value={s.exams}
          icon={<ListChecks size={21} />}
          detail="Lần đã chấm gần nhất của mỗi đề"
        />
        <Metric
          label="Câu đã chấm"
          value={s.questions}
          icon={<BookOpen size={21} />}
          detail="Điểm thực tế trong bài làm"
          tone="blue"
        />
        <Metric
          label="Chủ đề cần ưu tiên"
          value={weak.length}
          icon={<Target size={21} />}
          detail="Dưới 60% và đủ dữ liệu"
          tone="amber"
        />
        <Metric
          label="Chủ đề nổi bật"
          value={strong.length}
          icon={<TrendingUp size={21} />}
          detail="Từ 80% và đủ dữ liệu"
          tone="violet"
        />
      </div>
      <Coverage snapshot={s} />
      {!s.exams ? (
        <section className="panel">
          <Empty
            title="Chưa có kết quả phù hợp"
            description="Phân tích sử dụng bài đã chấm xong và được Teacher công khai điểm từng câu. Hãy hoàn thành thêm bài thi hoặc chọn khoảng thời gian khác."
            icon={<BrainCircuit size={28} />}
            action={
              <Link className="btn btn-primary" href="/exams">
                Đến bài thi của tôi <ArrowRight size={16} />
              </Link>
            }
          />
        </section>
      ) : (
        <div className="la-data-grid">
          <TopicScores snapshot={s} />
          <RecentScores snapshot={s} />
        </div>
      )}
      <section className="la-ai panel" aria-labelledby="la-ai-title">
        <div className="la-ai-heading">
          <span className="la-ai-icon">
            <Sparkles size={23} />
          </span>
          <div>
            <span className="la-kicker">FROM INSIGHT TO ACTION</span>
            <h2 id="la-ai-title">Kế hoạch ôn tập cùng AI</h2>
            <p>Gợi ý cụ thể từ các chủ đề có đủ dữ liệu.</p>
          </div>
          <span className="la-provider">DeepSeek</span>
        </div>
        {active ? (
          <div className="la-working" role="status">
            <Spinner />
            <div>
              <b>Đang phân tích kết quả học tập…</b>
              <p>Bạn có thể rời trang rồi quay lại. Báo cáo sẽ được lưu tự động.</p>
            </div>
          </div>
        ) : advice ? (
          <>
            <div className="la-ai-summary">
              <Sparkles size={18} />
              <p>{advice.summary}</p>
            </div>
            {!!advice.strengths.length && (
              <div className="la-strengths">
                {advice.strengths.map((item) => {
                  const t = topics.get(item.topicId);
                  return t ? (
                    <div key={item.topicId}>
                      <CheckCircle2 size={18} />
                      <span>
                        <b>
                          {topicName(t)} · {percentLabel(t.score)}
                        </b>
                        <p>{item.observation}</p>
                      </span>
                    </div>
                  ) : null;
                })}
              </div>
            )}
            <div className="la-plan-list">
              {advice.recommendations.map((item, index) => {
                const t = topics.get(item.topicId);
                return t ? (
                  <article className="la-plan" key={item.topicId}>
                    <header>
                      <span className="la-step">{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <small>{[t.subject, ...t.topicPath.slice(0, -1)].join(' / ')}</small>
                        <h3>{topicName(t)}</h3>
                      </div>
                      <span className="la-duration">
                        <Clock3 size={14} /> ~{item.minutes} phút
                      </span>
                    </header>
                    <div className="la-evidence">
                      <span className={`la-level ${t.level.toLowerCase()}`}>
                        {learningLevel[t.level]}
                      </span>
                      <b>{percentLabel(t.score)}</b>
                      <span>
                        {t.questions} câu · {t.exams} đề · {t.earned}/{t.possible} điểm
                      </span>
                    </div>
                    <p>{item.reason}</p>
                    <ul>
                      {item.actions.map((action, i) => (
                        <li key={i}>{action}</li>
                      ))}
                    </ul>
                    <div className="la-practice">
                      <Target size={17} />
                      <div>
                        <b>Tự kiểm tra sau khi ôn</b>
                        <p>{item.practice}</p>
                      </div>
                    </div>
                  </article>
                ) : null;
              })}
            </div>
            {advice.limitations && (
              <p className="la-ai-caveat">
                <Info size={15} />
                {advice.limitations}
              </p>
            )}
            <footer className="la-ai-footer">
              <span>Đã lưu · {new Date(report!.updatedAt).toLocaleString('vi-VN')}</span>
              {weak.length || s.topics.some((topic) => topic.level === 'DEVELOPING') ? (
                <Link href={`/practice?range=${range}`} className="btn btn-primary small">
                  Practice Weak Topics <ArrowRight size={15} />
                </Link>
              ) : (
                <Link href="/exams" className="text-link">
                  Luyện tập tiếp <ArrowRight size={15} />
                </Link>
              )}
            </footer>
          </>
        ) : (
          <div className="la-ai-start">
            <p>
              {!data.eligible
                ? 'Cần ít nhất một chủ đề có 5 câu đã chấm từ 2 đề thi khác nhau. Khi đủ dữ liệu, AI sẽ đề xuất nội dung cần ôn và bài tập tự kiểm tra.'
                : !data.configured
                  ? 'Số liệu đã sẵn sàng. Admin cần cấu hình DeepSeek để tạo gợi ý ôn tập.'
                  : 'AI sẽ nhận diện các chủ đề nên ưu tiên, đề xuất cách ôn và bài tập giúp bạn tự kiểm tra kiến thức.'}
            </p>
            {report?.status === 'FAILED' && <ErrorBox message={report.error} />}
            {data.eligible && (
              <button
                className="btn btn-primary"
                onClick={() => void generate()}
                disabled={
                  !data.configured || sending || (report?.attempts || 0) >= limits.maxAttempts
                }
              >
                {sending ? <Spinner /> : <Sparkles size={17} />}
                {uncertain
                  ? 'Gửi lại yêu cầu'
                  : report?.status === 'FAILED'
                    ? 'Thử phân tích lại'
                    : 'Phân tích với AI'}
              </button>
            )}
            {report?.status === 'FAILED' && report.attempts >= limits.maxAttempts && (
              <small>Đã hết số lần thử cho bộ kết quả này.</small>
            )}
            <small>
              Chỉ gửi số liệu theo chủ đề. Không gửi bài làm, đáp án hay thông tin tài khoản.
            </small>
          </div>
        )}
      </section>
    </>
  );
}

function Coverage({ snapshot: s }: { snapshot: LearningSnapshot }) {
  return (
    <details className="la-coverage">
      <summary>
        <Info size={16} />
        <span>Cách tính & phạm vi dữ liệu</span>
        <ChevronRight size={16} />
      </summary>
      <div>
        <p>
          Điểm % = tổng điểm đạt / tổng điểm tối đa × 100. Chỉ dùng lần thi đã chấm gần nhất của mỗi
          đề trong khoảng thời gian đã chọn, tối đa 200 đề.
        </p>
        <p>
          Ưu tiên ôn: dưới 60% · Cần củng cố: 60–79,99% · Điểm mạnh: từ 80%. Chỉ phân loại khi có ít
          nhất 5 câu từ 2 đề khác nhau; điểm bài thi chưa phản ánh đầy đủ năng lực.
        </p>
        {!!s.pendingRuns && (
          <p>{s.pendingRuns} lượt đang chờ Teacher chấm, chưa tính vào phân tích.</p>
        )}
        {!!s.hiddenExams && (
          <p>{s.hiddenExams} đề đang ẩn điểm từng câu, chưa tính vào phân tích.</p>
        )}
        {!!s.unclassifiedQuestions && (
          <p>
            {s.unclassifiedQuestions} câu chưa có chủ đề được lưu lúc thi: chỉ tính theo môn. Bài
            thi mới sẽ lưu chủ đề để phân tích chi tiết.
          </p>
        )}
        {!!s.invalidQuestions && (
          <p>{s.invalidQuestions} câu có dữ liệu điểm chưa hợp lệ, đã bỏ qua.</p>
        )}
        {s.truncated && (
          <p>
            Đang hiển thị 200 đề gần nhất. Chọn khoảng ngắn hơn để xem chi tiết giai đoạn bạn quan
            tâm.
          </p>
        )}
        <p>
          Câu hỏi có nhiều cấp chủ đề được nhóm theo toàn bộ đường dẫn. Kết quả mới hoặc điểm
          Teacher cập nhật sẽ làm mới dữ liệu; báo cáo AI cũ không được áp dụng cho dữ liệu mới.
        </p>
      </div>
    </details>
  );
}
function TopicScores({ snapshot: s }: { snapshot: LearningSnapshot }) {
  const [mode, setMode] = useState<'topics' | 'subjects'>('topics');
  const [subject, setSubject] = useState('');
  const rows = s[mode].filter((r) => !subject || r.subject === subject);
  return (
    <section className="panel la-scores">
      <div className="panel-heading">
        <div>
          <h2>Bản đồ kiến thức</h2>
          <p>Từ phần cần ôn đến thế mạnh của bạn</p>
        </div>
      </div>
      <div className="la-filters">
        <div className="la-segment" aria-label="Nhóm kết quả">
          <button aria-pressed={mode === 'topics'} onClick={() => setMode('topics')}>
            Theo chủ đề
          </button>
          <button aria-pressed={mode === 'subjects'} onClick={() => setMode('subjects')}>
            Theo môn
          </button>
        </div>
        <select
          aria-label="Lọc môn học"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          <option value="">Tất cả môn</option>
          {s.subjects.map((r) => (
            <option key={r.id} value={r.subject}>
              {r.subject}
            </option>
          ))}
        </select>
      </div>
      {rows.length ? (
        <div className="la-score-list">
          {rows.map((row) => (
            <ScoreRow key={row.id} row={row} />
          ))}
        </div>
      ) : (
        <Empty
          title="Chưa có dữ liệu theo chủ đề"
          description="Các bài thi mới sẽ lưu phân loại từng câu. Bạn vẫn có thể xem kết quả theo môn."
          icon={<BookOpen size={24} />}
        />
      )}
    </section>
  );
}
function ScoreRow({ row }: { row: LearningMetric }) {
  return (
    <div className={`la-score-row ${row.level.toLowerCase()}`}>
      <div className="la-row-heading">
        <div>
          <b>{topicName(row)}</b>
          {!!row.topicPath.length && (
            <small>{[row.subject, ...row.topicPath.slice(0, -1)].join(' / ')}</small>
          )}
        </div>
        <strong>{percentLabel(row.score)}</strong>
      </div>
      <div
        className="la-bar"
        role="meter"
        aria-label={topicName(row)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={row.score}
      >
        <span style={{ width: `${row.score}%` }} />
      </div>
      <div className="la-row-footer">
        <span>
          {row.questions} câu · {row.exams} đề
        </span>
        <span className={`la-level ${row.level.toLowerCase()}`}>{learningLevel[row.level]}</span>
      </div>
    </div>
  );
}
function RecentScores({ snapshot: s }: { snapshot: LearningSnapshot }) {
  const rows = s.recent,
    points = rows.map(
      (r, i) => `${25 + (i * 290) / Math.max(1, rows.length - 1)},${155 - r.score * 1.3}`,
    );
  return (
    <section className="panel la-recent">
      <div className="panel-heading">
        <div>
          <h2>Kết quả gần đây</h2>
          <p>Các lượt được chọn trong phân tích</p>
        </div>
        <TrendingUp size={19} />
      </div>
      <svg
        viewBox="0 0 345 180"
        role="img"
        aria-label="Điểm phần trăm các bài thi theo thứ tự thời gian"
      >
        <title>Điểm các bài thi gần đây, thang 100%</title>
        {[0, 50, 100].map((v) => (
          <g key={v}>
            <line
              x1="25"
              x2="315"
              y1={155 - v * 1.3}
              y2={155 - v * 1.3}
              stroke="#e2ece8"
              strokeDasharray="4 5"
            />
            <text x="318" y={159 - v * 1.3} fill="#7c8a89" fontSize="9">
              {v}
            </text>
          </g>
        ))}
        <polyline
          points={points.join(' ')}
          fill="none"
          stroke="#16896c"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={rows[i].runId}
            cx={p.split(',')[0]}
            cy={p.split(',')[1]}
            r="4"
            fill="white"
            stroke="#16896c"
            strokeWidth="2"
          >
            <title>
              {rows[i].title}: {percentLabel(rows[i].score)}
            </title>
          </circle>
        ))}
      </svg>
      <div className="la-chart-caption">
        <span>Cũ hơn</span>
        <span>Gần nhất</span>
      </div>
      <div className="la-recent-list">
        {rows
          .slice(-3)
          .reverse()
          .map((r) => (
            <Link href={`/exam/${r.runId}`} key={r.runId}>
              <span>
                <b>{r.title}</b>
                <small>{new Date(r.submittedAt).toLocaleDateString('vi-VN')}</small>
              </span>
              <strong>{percentLabel(r.score)}</strong>
              <ChevronRight size={15} />
            </Link>
          ))}
      </div>
      <p className="la-footnote">
        Đề thi có thể khác độ khó; biểu đồ giúp nhìn lại kết quả, không kết luận mức tiến bộ.
      </p>
    </section>
  );
}
