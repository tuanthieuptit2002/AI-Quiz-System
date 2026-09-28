import { AlertTriangle, Check, TrendingUp } from 'lucide-react';
import {
  countLabel,
  percentLabel,
  studyLabel,
  type StudentDashboard,
  type TeacherDashboard,
} from '@/lib/dashboard';
import { Empty } from './ui';

function Bars({
  items,
  label,
  value,
  max,
  caption,
}: {
  items: { key: string; label: string; value: number; hint?: string }[];
  label: (item: { label: string; value: number; hint?: string }) => string;
  value: (item: { label: string; value: number }) => string;
  max: number;
  caption?: string;
}) {
  if (!items.length) return <p className="analytics-empty">Chưa có dữ liệu cho biểu đồ này.</p>;
  const ceiling = Math.max(max, 1);
  return (
    <div className="bar-list">
      {items.map((item) => (
        <div className="bar-row" key={item.key}>
          <span title={item.hint || item.label}>{label(item)}</span>
          <i>
            <b style={{ width: `${Math.max(2, (item.value / ceiling) * 100)}%` }} />
          </i>
          <strong>{value(item)}</strong>
        </div>
      ))}
      {caption ? <small>{caption}</small> : null}
    </div>
  );
}

export function TeacherAnalytics({ data }: { data: TeacherDashboard }) {
  const graded = data.passFail.passed + data.passFail.failed;
  if (!graded)
    return (
      <section className="panel">
        <Empty
          icon={<TrendingUp size={28} />}
          title="Chưa có bài đã chấm"
          description="Phân bố điểm, tỷ lệ đạt và câu sai nhiều sẽ hiện khi học sinh nộp bài và bài đã có điểm."
        />
      </section>
    );
  const peak = Math.max(...data.distribution.map((band) => band.count), 1);
  return (
    <div className="analytics-stack">
      <div className="analytics-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Phân bố điểm</h2>
              <p>Số lượt làm bài theo khoảng điểm</p>
            </div>
          </div>
          <Bars
            items={data.distribution.map((band) => ({
              key: band.label,
              label: band.label,
              value: band.count,
            }))}
            label={(item) => item.label}
            value={(item) => countLabel(item.value)}
            max={peak}
          />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Đạt / không đạt</h2>
              <p>So với điểm đạt của từng đề</p>
            </div>
          </div>
          <div className="pass-split" aria-label="Tỷ lệ đạt và không đạt">
            <i
              style={{
                width: `${graded ? (data.passFail.passed / graded) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="pass-legend">
            <span>
              <i className="pass-dot" /> Đạt <b>{countLabel(data.passFail.passed)}</b>
            </span>
            <span>
              <i className="fail-dot" /> Không đạt <b>{countLabel(data.passFail.failed)}</b>
            </span>
          </div>
          <p className="analytics-note">Tỷ lệ đạt {percentLabel(data.passRate)}</p>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Điểm trung bình</h2>
              <p>Theo tháng nộp bài</p>
            </div>
          </div>
          <Bars
            items={data.months.map((month) => ({
              key: month.label,
              label: month.label,
              value: month.score,
              hint: `${month.attempts} lượt`,
            }))}
            label={(item) => item.label}
            value={(item) => percentLabel(item.value)}
            max={100}
          />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Thời gian hoàn thành</h2>
              <p>
                Trung bình{' '}
                {data.averageMinutes === null
                  ? '—'
                  : `${data.averageMinutes.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} phút`}
              </p>
            </div>
          </div>
          <Bars
            items={data.subjects.map((subject) => ({
              key: subject.subject,
              label: subject.subject,
              value: subject.minutes,
              hint: `${subject.attempts} lượt`,
            }))}
            label={(item) => item.label}
            value={(item) =>
              `${item.value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} phút`
            }
            max={Math.max(...data.subjects.map((subject) => subject.minutes), 1)}
          />
        </section>
      </div>
      <div className="analytics-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Kết quả theo môn và chủ đề</h2>
              <p>Điểm có trọng số trên các câu đã chấm</p>
            </div>
          </div>
          <h3 className="analytics-subhead">Môn học</h3>
          <Bars
            items={data.subjects.map((subject) => ({
              key: `subject-${subject.subject}`,
              label: subject.subject,
              value: subject.score,
            }))}
            label={(item) => item.label}
            value={(item) => percentLabel(item.value)}
            max={100}
          />
          <h3 className="analytics-subhead">Chủ đề</h3>
          <Bars
            items={data.topics.map((topic) => ({
              key: `${topic.subject}-${topic.topic}`,
              label: topic.topic,
              hint: topic.subject,
              value: topic.score,
            }))}
            label={(item) => item.label}
            value={(item) => percentLabel(item.value)}
            max={100}
            caption={
              data.truncated
                ? 'Chủ đề và câu sai bên dưới tính trên 500 lượt làm bài gần nhất.'
                : undefined
            }
          />
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Câu sai nhiều nhất</h2>
              <p>Câu chưa đạt đủ điểm, xếp theo số lần sai</p>
            </div>
          </div>
          {data.missed.length ? (
            <ol className="miss-list">
              {data.missed.map((item, index) => (
                <li key={`${item.subject}-${index}`}>
                  <b>{item.question}</b>
                  <small>
                    {item.subject} · sai {countLabel(item.misses)}/{countLabel(item.served)} ·{' '}
                    {percentLabel(item.rate)}
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="analytics-empty">Chưa có câu nào bị mất điểm.</p>
          )}
        </section>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Kết quả học sinh</h2>
            <p>Điểm trung bình của từng học sinh đã nộp bài</p>
          </div>
        </div>
        <Bars
          items={data.studentPerformance.map((student, index) => ({
            key: `${student.name}-${index}`,
            label: student.name,
            value: student.score,
            hint: `${student.attempts} lượt · đạt ${percentLabel(student.passRate)}`,
          }))}
          label={(item) => item.label}
          value={(item) => percentLabel(item.value)}
          max={100}
        />
      </section>
    </div>
  );
}

export function StudentStrengths({ data }: { data: StudentDashboard }) {
  return (
    <section className="panel strength-panel">
      <div className="panel-heading">
        <div>
          <h2>Điểm mạnh và điểm yếu</h2>
          <p>Cùng cách phân loại với phân tích học tập</p>
        </div>
      </div>
      <TopicGroup title="Điểm mạnh" items={data.strong} tone="strong" />
      <TopicGroup title="Điểm yếu" items={data.weak} tone="weak" />
      {!data.strong.length && !data.weak.length && (
        <p className="analytics-empty">
          Cần ít nhất 5 câu của một chủ đề, lấy từ 2 bài thi trở lên, thì chủ đề mới được xếp mạnh
          hoặc yếu.
        </p>
      )}
      <p className="analytics-note">
        Đã hoàn thành {countLabel(data.completed)} bài · trung bình{' '}
        {percentLabel(data.averageScore)} · cao nhất {percentLabel(data.bestScore)} · học{' '}
        {studyLabel(data.studyMinutes)}
      </p>
    </section>
  );
}

function TopicGroup({
  title,
  items,
  tone,
}: {
  title: string;
  items: StudentDashboard['strong'];
  tone: 'strong' | 'weak';
}) {
  return (
    <div className={`topic-group ${tone}`}>
      <h3>{title}</h3>
      {items.length ? (
        <ul>
          {items.map((item) => (
            <li key={`${item.subject}-${item.topic}`}>
              {tone === 'strong' ? <Check size={15} /> : <AlertTriangle size={15} />}
              <span>
                <b>{item.topic}</b>
                <small>
                  {item.subject} · {percentLabel(item.score)}
                </small>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p>{tone === 'strong' ? 'Chưa có chủ đề vững.' : 'Chưa có chủ đề yếu.'}</p>
      )}
    </div>
  );
}
