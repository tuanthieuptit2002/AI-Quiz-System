import { Check, CircleCheck, Clock3, Hourglass, Minus, X } from 'lucide-react';
import type { ExamRun } from '@/lib/exams';
import { examDuration } from '@/lib/grading';

export function ResultSummary({ run }: { run: ExamRun }) {
  const summary = run.grading;
  if (!summary)
    return (
      <p className="exam-result-note">
        {run.status === 'EXPIRED'
          ? 'Lượt thi hết hạn khi chưa nộp, không có điểm.'
          : 'Bài đang làm, chưa có kết quả chấm.'}
      </p>
    );
  return (
    <section className="gr-summary" aria-label="Kết quả chấm điểm">
      <div className="gr-score">
        <span>{summary.final ? 'ĐIỂM CHÍNH THỨC' : 'ĐIỂM ĐÃ CHẤM · TẠM TÍNH'}</span>
        <div>
          <strong>{summary.earnedPoints}</strong>
          <span>/ {summary.totalPoints}</span>
        </div>
        <p>
          {summary.final
            ? `${run.scorePercent}% · ${run.passed ? 'Đạt yêu cầu' : 'Chưa đạt'}`
            : `Còn ${summary.pending} câu cần Teacher xác nhận`}
        </p>
        <span className="gr-pass">
          <CircleCheck size={14} /> Ngưỡng đạt {run.settings.passScore}%
        </span>
      </div>
      <div className="gr-metrics">
        <div>
          <span className="gr-metric-icon correct">
            <Check size={18} />
          </span>
          <strong>{summary.correct}</strong>
          <span>Đúng / đủ điểm</span>
        </div>
        <div>
          <span className="gr-metric-icon incorrect">
            <X size={18} />
          </span>
          <strong>{summary.incorrect}</strong>
          <span>Sai / không điểm</span>
        </div>
        <div>
          <span className="gr-metric-icon partial">
            <Minus size={18} />
          </span>
          <strong>{summary.partial}</strong>
          <span>Điểm một phần</span>
        </div>
        <div>
          <span className="gr-metric-icon pending">
            <Hourglass size={18} />
          </span>
          <strong>{summary.pending}</strong>
          <span>Chờ chấm</span>
        </div>
        <div className="gr-duration">
          <Clock3 size={17} />
          <b>{examDuration(summary.durationSeconds)}</b>
          <span>Thời gian làm bài</span>
          <small>{summary.unanswered} câu bỏ trống</small>
        </div>
      </div>
    </section>
  );
}
