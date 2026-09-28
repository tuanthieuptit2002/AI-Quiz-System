'use client';
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowRight, CheckCircle2, RotateCcw, Sparkles, Target, XCircle } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { learningLevel, percentLabel, type LearningRange } from '@/lib/learning';
import {
  leaf,
  shiftLabel,
  type PracticeFeedback,
  type PracticePlan,
  type PracticeQuestion,
  type PracticeView,
} from '@/lib/practice';
import { difficultyLabels, typeLabels } from '@/lib/questions';
import { AnswerInput } from '../exams/exam-player';
import type { RunQuestion } from '@/lib/exams';
import { Empty, ErrorBox, Loading, SectionTitle, Spinner } from '../ui';

const parseRange = (value: string | null): LearningRange =>
  value === '30' || value === 'all' ? value : '90';
const ready = (question: PracticeQuestion, response: string[]) => {
  if (question.type === 'FILL_BLANK')
    return response.length === question.blankCount && response.every((value) => value.trim());
  if (question.type === 'MATCHING') return question.left.every((_, index) => response[index]);
  if (question.type === 'ORDERING') return response.length === question.options.length;
  if (question.type === 'MULTIPLE_CHOICE') return response.length > 0;
  return response.length === 1;
};

export function PracticeStudio() {
  const params = useSearchParams();
  const range = parseRange(params.get('range'));
  const [plan, setPlan] = useState<PracticePlan | null>(null);
  const [session, setSession] = useState<PracticeView | null>(null);
  const [response, setResponse] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const applySession = (next: PracticeView | null) => {
    setSession(next);
    const question = next?.question;
    setResponse(question?.type === 'ORDERING' ? question.options.map((option) => option.id) : []);
  };
  const load = useCallback(async () => {
    setError('');
    try {
      const [nextPlan, current] = await Promise.all([
        api<PracticePlan>(`/student/practice/plan?range=${range}`),
        api<{ session: PracticeView | null }>('/student/practice/current'),
      ]);
      setPlan(nextPlan);
      setSession(current.session);
      const question = current.session?.question;
      setResponse(question?.type === 'ORDERING' ? question.options.map((option) => option.id) : []);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setLoading(false);
    }
  }, [range]);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    return () => clearTimeout(initial);
  }, [load]);

  const run = async (path: string, body?: unknown, method = 'POST') => {
    setBusy(true);
    setError('');
    try {
      const next = await api<PracticeView>(path, {
        method,
        body: body ? jsonBody(body) : undefined,
      });
      applySession(next);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (loading && !plan) return <Loading />;
  return (
    <div className="pq-page">
      <SectionTitle
        eyebrow="PERSONALIZED QUIZ"
        title="Luyện tập cá nhân"
        description="Quiz bám chủ đề còn yếu. Trả lời đúng thì câu sau khó hơn, sai thì dễ hơn."
        action={
          <Link href={`/learning-analysis`} className="btn btn-secondary">
            Về phân tích
          </Link>
        }
      />
      <ErrorBox message={error} retry={load} />
      {session?.status === 'SUBMITTED' ? (
        <Summary
          session={session}
          onPlan={() => {
            setSession(null);
            void load();
          }}
        />
      ) : session?.status === 'ACTIVE' ? (
        <Player
          session={session}
          response={response}
          busy={busy}
          onResponse={setResponse}
          onAnswer={() =>
            void run(`/student/practice/${session.id}/answer`, {
              itemId: session.question?.id,
              response,
            })
          }
          onNext={() => void run(`/student/practice/${session.id}/next`, {})}
          onFinish={() => void run(`/student/practice/${session.id}/finish`, {})}
        />
      ) : (
        <PlanCard
          plan={plan}
          range={range}
          busy={busy}
          onStart={() => void run('/student/practice', { range })}
        />
      )}
    </div>
  );
}
function PlanCard({
  plan,
  range,
  busy,
  onStart,
}: {
  plan: PracticePlan | null;
  range: LearningRange;
  busy: boolean;
  onStart: () => void;
}) {
  if (!plan) return <ErrorBox message="Không tải được kế hoạch luyện tập." />;
  return (
    <>
      <section className="pq-hero">
        <div>
          <span className="la-kicker">
            <Target size={16} /> PRACTICE WEAK TOPICS
          </span>
          <h2>
            {plan.eligible ? 'Đề được xếp theo chỗ bạn còn thiếu.' : 'Chưa đủ chủ đề để tạo quiz.'}
          </h2>
          <p>
            {plan.adjusted
              ? 'Các lần luyện trước đã được tính. Chủ đề bạn làm tốt sẽ ít câu hơn, bắt đầu khó hơn, hoặc rời khỏi đề.'
              : 'Chủ đề dưới 60% nhận nhiều câu hơn. Chủ đề cần củng cố giữ mức tối thiểu 5 câu.'}
          </p>
        </div>
        <div className="pq-adapt" aria-label="Luật đổi độ khó">
          <span>Đúng</span>
          <ArrowRight size={14} />
          <b>Khó hơn</b>
          <ArrowRight size={14} />
          <b>Khó hơn</b>
          <span className="pq-adapt-wrong">Sai → dễ hơn</span>
        </div>
      </section>
      {plan.previous && (
        <section className="panel pq-previous">
          <div className="panel-heading">
            <div>
              <h2>Lần luyện gần nhất</h2>
              <p>
                {plan.previous.correct}/{plan.previous.answered} câu đúng
                {plan.previous.score !== null ? ` · ${percentLabel(plan.previous.score)}` : ''}
              </p>
            </div>
          </div>
          <div className="pq-plan-list">
            {plan.previous.topics.map((topic) => (
              <div key={topic.topicId}>
                <b>{leaf(topic)}</b>
                <span>
                  {topic.correct}/{topic.answered} đúng
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {plan.eligible ? (
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Quiz lần này</h2>
              <p>
                {plan.total} câu ·{' '}
                {range === 'all' ? 'mọi kết quả đã chấm' : `${range} ngày gần đây`} · không tính vào
                điểm bài thi
              </p>
            </div>
            <button className="btn btn-primary" onClick={onStart} disabled={busy}>
              {busy ? <Spinner /> : <Sparkles size={16} />}
              {plan.activeSessionId ? 'Tiếp tục quiz' : 'Practice Weak Topics'}
            </button>
          </div>
          <div className="pq-plan-list">
            {plan.plan.map((topic) => (
              <article key={topic.topicId}>
                <div>
                  <small>
                    {[topic.subject, ...topic.topicPath.slice(0, -1)].filter(Boolean).join(' / ')}
                  </small>
                  <b>{leaf(topic)}</b>
                </div>
                <span className={`la-level ${topic.level.toLowerCase()}`}>
                  {learningLevel[topic.level]}
                </span>
                <span>{percentLabel(topic.blendedScore)}</span>
                <strong>{topic.count} câu</strong>
                <span className={`qb-badge difficulty-${topic.startDifficulty.toLowerCase()}`}>
                  Bắt đầu {difficultyLabels[topic.startDifficulty]}
                </span>
              </article>
            ))}
          </div>
          <p className="pq-note">
            Câu được lấy từ ngân hàng Sẵn sàng. Nếu chủ đề chưa có câu, AI tạo câu chỉ cho phiên này
            và không đưa vào ngân hàng. Các chủ đề được xen kẽ; độ khó đổi riêng trong từng chủ đề.
            {!plan.configured && ' Chưa cấu hình DeepSeek nên quiz chỉ dùng câu có sẵn.'}
          </p>
        </section>
      ) : (
        <section className="panel">
          <Empty
            title="Chưa có chủ đề cần luyện"
            description="Cần ít nhất một chủ đề ưu tiên ôn hoặc cần củng cố từ bài đã chấm. Nếu bạn vừa luyện tốt, đề tiếp theo đã bỏ các chủ đề đó."
            icon={<Target size={28} />}
            action={
              <Link className="btn btn-primary" href="/exams">
                Đến bài thi của tôi <ArrowRight size={16} />
              </Link>
            }
          />
        </section>
      )}
    </>
  );
}
function Player({
  session,
  response,
  busy,
  onResponse,
  onAnswer,
  onNext,
  onFinish,
}: {
  session: PracticeView;
  response: string[];
  busy: boolean;
  onResponse: (value: string[]) => void;
  onAnswer: () => void;
  onNext: () => void;
  onFinish: () => void;
}) {
  const question = session.question;
  const feedback = session.feedback;
  return (
    <div className="pq-play">
      <aside className="panel pq-side">
        <h2>Tiến độ chủ đề</h2>
        {session.plan.map((topic) => (
          <div
            key={topic.topicId}
            className={question?.topicId === topic.topicId ? 'is-current' : ''}
          >
            <div>
              <b>{leaf(topic)}</b>
              <span>
                {topic.served || 0}/{topic.count} · {topic.correct || 0} đúng
              </span>
            </div>
            <i style={{ width: `${((topic.served || 0) / topic.count) * 100}%` }} />
          </div>
        ))}
        <button className="btn btn-secondary" onClick={onFinish} disabled={busy}>
          Kết thúc sớm
        </button>
      </aside>
      <section className="panel pq-card">
        {session.phase === 'FEEDBACK' && feedback ? (
          <Feedback feedback={feedback} busy={busy} last={false} onNext={onNext} />
        ) : question ? (
          <>
            <header className="pq-question-head">
              <div>
                <span className="la-kicker">
                  {leaf(question)} · {question.index}/{question.total}
                </span>
                <h2>{question.question}</h2>
              </div>
              <div className="pq-tags">
                <span className={`qb-badge difficulty-${question.difficulty.toLowerCase()}`}>
                  {difficultyLabels[question.difficulty]}
                </span>
                <span className="qb-badge">{question.source === 'AI' ? 'AI' : 'Ngân hàng'}</span>
                <span className="qb-badge">{typeLabels[question.type]}</span>
              </div>
            </header>
            {question.image && (
              <Image
                src={question.image}
                alt={question.imageAlt}
                width={1000}
                height={600}
                unoptimized
                className="question-image"
              />
            )}
            <AnswerInput
              q={question as RunQuestion}
              response={response}
              disabled={busy}
              onChange={onResponse}
            />
            <footer className="pq-actions">
              <span>Độ khó của chủ đề này đổi sau khi bạn nộp câu.</span>
              <button
                className="btn btn-primary"
                disabled={busy || !ready(question, response)}
                onClick={onAnswer}
              >
                {busy ? <Spinner /> : null}
                Nộp câu này
              </button>
            </footer>
          </>
        ) : (
          <Empty
            title="Chưa có câu tiếp theo"
            description={busy ? 'Đang lấy câu hỏi.' : 'Hãy thử lại hoặc kết thúc phiên này.'}
            icon={<Sparkles size={28} />}
            action={
              <button className="btn btn-primary" onClick={onNext} disabled={busy}>
                Lấy câu tiếp theo
              </button>
            }
          />
        )}
      </section>
    </div>
  );
}
function Feedback({
  feedback,
  busy,
  last,
  onNext,
}: {
  feedback: PracticeFeedback;
  busy: boolean;
  last: boolean;
  onNext: () => void;
}) {
  const correct = feedback.awarded >= feedback.points;
  return (
    <div className={`pq-feedback ${correct ? 'is-correct' : 'is-wrong'}`}>
      <header>
        {correct ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
        <div>
          <b>{shiftLabel[feedback.shift]}</b>
          <p>
            {leaf(feedback)} · {difficultyLabels[feedback.difficulty]} →{' '}
            {difficultyLabels[feedback.nextDifficulty]}
          </p>
        </div>
      </header>
      <h2>{feedback.question}</h2>
      <div className="pq-review">
        {feedback.options.map((option, index) => {
          const chosen = feedback.response.includes(option.id);
          const right = feedback.correct.includes(option.id);
          return (
            <div key={option.id} className={right ? 'is-right' : chosen ? 'is-wrong' : ''}>
              <span>{String.fromCharCode(65 + index)}</span>
              <p>{option.text}</p>
            </div>
          );
        })}
        {!feedback.options.length && <p>Đáp án: {feedback.correct.join(', ') || '—'}</p>}
      </div>
      {feedback.explanation && <p className="pq-explain">{feedback.explanation}</p>}
      {!last && (
        <button className="btn btn-primary" onClick={onNext} disabled={busy}>
          {busy ? <Spinner /> : <ArrowRight size={16} />}
          Câu tiếp theo
        </button>
      )}
    </div>
  );
}
function Summary({ session, onPlan }: { session: PracticeView; onPlan: () => void }) {
  return (
    <section className="panel pq-summary">
      <div className="pq-summary-score">
        <b>{session.score === null ? '—' : percentLabel(session.score)}</b>
        <span>
          {session.correctCount}/{session.answered} câu đúng
        </span>
      </div>
      <div>
        <span className="la-kicker">NEXT QUIZ</span>
        <h2>Đề tiếp theo sẽ dùng kết quả này.</h2>
        <p>
          Điểm bài thi chính thức không đổi. Chủ đề bạn vừa làm tốt sẽ được giao ít câu hơn hoặc bắt
          đầu ở độ khó cao hơn.
        </p>
        <div className="pq-plan-list">
          {session.plan.map((topic) => (
            <article key={topic.topicId}>
              <b>{leaf(topic)}</b>
              <span>
                {topic.correct || 0}/{topic.served || 0} đúng
              </span>
            </article>
          ))}
        </div>
        {session.feedback && (
          <Feedback feedback={session.feedback} busy={false} last onNext={() => undefined} />
        )}
        <button className="btn btn-primary" onClick={onPlan}>
          <RotateCcw size={16} /> Xem đề đã điều chỉnh
        </button>
      </div>
    </section>
  );
}
