'use client';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { api } from '@/lib/api';
import { type ExamRun, runStatusLabels } from '@/lib/exams';
import { typeLabels } from '@/lib/questions';
import { readableAnswer } from '@/lib/grading';
import { ErrorBox } from '../ui';
import { ResultSummary } from './result-summary';

export function RunResult({ run: initial, close }: { run: ExamRun; close: () => void }) {
  const [run, setRun] = useState(initial);
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (run.status !== 'PENDING_REVIEW') return;
    let active = true;
    const reload = () =>
      void api<ExamRun>(`/exams/runs/${run.id}`, { signal: AbortSignal.timeout(12000) })
        .then((value) => {
          if (active) {
            setRun(value);
            setError('');
          }
        })
        .catch(() => {
          if (active) setError('Chưa cập nhật được điểm mới. Đang chờ kết nối lại.');
        });
    const timer = setInterval(reload, 5000);
    window.addEventListener('online', reload);
    reload();
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('online', reload);
    };
  }, [run.id, run.status, refresh]);
  return (
    <div className="exam-result">
      <div className="exam-result-heading">
        <button className="btn btn-secondary" onClick={close}>
          <ArrowLeft size={16} /> Quay lại
        </button>
        <span className={`qb-badge ${run.passed ? 'difficulty-easy' : 'difficulty-medium'}`}>
          {runStatusLabels[run.status]}
        </span>
      </div>
      <div className="gr-result-title">
        <span className="eyebrow">YOUR ASSESSMENT</span>
        <h1>{run.title}</h1>
        <p>
          {run.studentName} · Lượt {run.attemptNo}
        </p>
      </div>
      <ResultSummary run={run} />
      {run.status === 'PENDING_REVIEW' && (
        <div className="gr-notice">
          <RefreshCw size={18} />
          <span>
            Câu khách quan đã chấm xong. Teacher sẽ xác nhận điểm tự luận và trả lời ngắn; kết quả
            tự cập nhật tại đây.
          </span>
        </div>
      )}
      <ErrorBox message={error} retry={() => setRefresh((v) => v + 1)} />
      {!run.settings.showAnswers && (
        <p className="exam-result-note">
          Đề thi này không công khai đáp án và điểm từng câu sau khi nộp.
        </p>
      )}
      <div className="exam-review-list">
        {run.questions.map(
          (q, i) =>
            !q.locked && (
              <section className="panel exam-review-item" key={q.id}>
                <div className="exam-review-label">
                  <b>
                    Câu {i + 1} · {typeLabels[q.type]}
                  </b>
                  <span>
                    {run.awarded[i] === null
                      ? 'Chờ chấm'
                      : run.awarded[i] === undefined
                        ? 'Không công khai điểm'
                        : `${run.awarded[i]} / ${q.points} điểm`}
                  </span>
                </div>
                <h3>{q.question}</h3>
                {q.image && (
                  <Image
                    className="question-image"
                    src={q.image}
                    alt={q.imageAlt}
                    width={1000}
                    height={600}
                    unoptimized
                  />
                )}
                <div className="exam-response-text">
                  <small>BÀI LÀM</small>
                  <p>{readableAnswer(q, run.responses[i]) || 'Chưa trả lời'}</p>
                </div>
                {q.correct && (
                  <div className="answer-explanation">
                    <b>{q.type === 'ESSAY' ? 'Hướng dẫn chấm' : 'Đáp án tham chiếu'}</b>
                    <p>{q.type === 'ESSAY' ? q.rubric : readableAnswer(q, q.correct)}</p>
                    {q.explanation && <p>{q.explanation}</p>}
                  </div>
                )}
                {run.feedback[i] && (
                  <div className="gr-teacher-feedback">
                    <b>Nhận xét từ Teacher</b>
                    <p>{run.feedback[i]}</p>
                  </div>
                )}
              </section>
            ),
        )}
      </div>
    </div>
  );
}
