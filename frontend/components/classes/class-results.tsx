'use client';
import { BarChart3 } from 'lucide-react';
import { useQuery } from '@/lib/use-query';
import {
  dueLabel,
  kindLabels,
  resultLabels,
  type ClassResults as Results,
  type RunStatus,
} from '@/lib/classes';
import { Empty, ErrorBox, Loading } from '../ui';

const tone: Record<RunStatus, string> = {
  NOT_STARTED: 'muted-chip',
  RUNNING: 'state-running',
  SUBMITTED: 'state-open',
  PENDING_REVIEW: 'state-upcoming',
  EXPIRED: 'late',
  CANCELLED: 'late',
};

export function ClassResults({ classId }: { classId: string }) {
  const { data, error, loading, reload } = useQuery<Results>(`/teacher/classes/${classId}/results`);
  if (loading && !data) return <Loading />;
  if (error && !data) return <ErrorBox message={error} retry={reload} />;
  if (!data?.assignments.length)
    return (
      <section className="panel cd-panel">
        <Empty
          icon={<BarChart3 size={28} />}
          title="Chưa có kết quả"
          description="Giao bài kiểm tra hoặc bài thi cho lớp để theo dõi kết quả tại đây."
        />
      </section>
    );
  return (
    <div className="cd-results">
      {data.assignments.map((assignment) => (
        <section className="panel cd-panel" key={assignment.id}>
          <div className="cd-result-head">
            <div>
              <span className="cd-chip muted-chip">{kindLabels[assignment.kind]}</span>
              <h2>{assignment.exam?.title || 'Đề thi không còn tồn tại'}</h2>
              <p>Hạn nộp {dueLabel(assignment.dueAt)}</p>
            </div>
            <div className="cd-result-summary">
              <span>
                <b>
                  {assignment.summary.submitted}/{data.studentCount}
                </b>
                Đã nộp
              </span>
              <span>
                <b>{assignment.summary.pendingReview}</b>
                Chờ chấm
              </span>
              <span>
                <b>
                  {assignment.summary.averageScore === null
                    ? '—'
                    : `${assignment.summary.averageScore}%`}
                </b>
                Điểm TB
              </span>
              <span>
                <b>{assignment.summary.passed}</b>
                Đạt
              </span>
            </div>
          </div>
          {assignment.students.length ? (
            <div className="table-scroll">
              <table className="cd-result-table">
                <thead>
                  <tr>
                    <th>HỌC SINH</th>
                    <th>TRẠNG THÁI</th>
                    <th>LƯỢT</th>
                    <th>ĐIỂM CAO NHẤT</th>
                    <th>NỘP LÚC</th>
                  </tr>
                </thead>
                <tbody>
                  {assignment.students.map((row) => (
                    <tr key={row.studentId}>
                      <td>
                        <b>{row.name}</b>
                        <small>{row.email}</small>
                      </td>
                      <td>
                        <span className={`cd-chip ${tone[row.status]}`}>
                          {resultLabels[row.status]}
                        </span>
                      </td>
                      <td>{row.attempts}</td>
                      <td>
                        {row.bestScore === null ? (
                          '—'
                        ) : (
                          <b className={row.passed ? 'pass' : 'fail'}>{row.bestScore}%</b>
                        )}
                      </td>
                      <td>{row.submittedAt ? dueLabel(row.submittedAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted cd-no-students">Lớp chưa có học sinh.</p>
          )}
        </section>
      ))}
    </div>
  );
}
