'use client';
import { useState } from 'react';
import { ArrowRight, LibraryBig, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { useQuery } from '@/lib/use-query';
import { sectionCounts, strategyLabels, type AIExamJob, type AIExamPlan } from '@/lib/ai-exams';
import { difficultyLabels, typeLabels } from '@/lib/questions';
import { ErrorBox, Field, Spinner } from '../ui';

export function ExamPlanEditor({
  job,
  busy,
  save,
}: {
  job: AIExamJob;
  busy: boolean;
  save: (plan: AIExamPlan, strategy: AIExamJob['strategy'], build: boolean) => Promise<void>;
}) {
  const [plan, setPlan] = useState<AIExamPlan>(job.plan!);
  const [strategy, setStrategy] = useState(job.strategy);
  const coverage = useQuery<{
    sections: { required: number; fromBank: number; toGenerate: number }[];
  }>(`/ai-exams/${job.id}/coverage?version=${job.version}`);
  const total = plan.sections.reduce((n, s) => n + s.percentage, 0),
    counts = sectionCounts(plan);
  const dirty = JSON.stringify(plan) !== JSON.stringify(job.plan) || strategy !== job.strategy;
  const issue =
    total !== 100
      ? `Tổng tỷ lệ hiện tại là ${total}%. Cần đúng 100%.`
      : counts.some((n) => !n)
        ? 'Mỗi chủ đề cần ít nhất một câu. Tăng tỷ lệ hoặc tổng số câu.'
        : '';
  const section = (index: number, value: Partial<AIExamPlan['sections'][number]>) =>
    setPlan((p) => ({
      ...p,
      sections: p.sections.map((s, i) => (i === index ? { ...s, ...value } : s)),
    }));
  return (
    <form
      className="ae-plan"
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy && !issue) void save(plan, strategy, true);
      }}
    >
      <div className="ae-panel ae-plan-summary">
        <div className="ae-panel-title">
          <span className="ae-number">01</span>
          <div>
            <h2>Cấu trúc đề đề xuất</h2>
            <p>Điều chỉnh ma trận trước khi AI ghép câu hỏi.</p>
          </div>
          <span className="qb-badge">Có thể chỉnh sửa</span>
        </div>
        <div className="ae-fields">
          <Field label="Tên bài kiểm tra">
            <input
              required
              minLength={3}
              maxLength={160}
              value={plan.title}
              onChange={(e) => setPlan({ ...plan, title: e.target.value })}
            />
          </Field>
          <Field label="Môn học trong ngân hàng">
            <input
              required
              maxLength={100}
              value={plan.subject}
              onChange={(e) => setPlan({ ...plan, subject: e.target.value })}
            />
          </Field>
        </div>
        <div className="ae-fields ae-three">
          <Field label="Số câu hỏi">
            <input
              type="number"
              required
              min={1}
              max={100}
              value={plan.count}
              onChange={(e) => setPlan({ ...plan, count: Number(e.target.value) })}
            />
          </Field>
          <Field label="Thời gian (phút)">
            <input
              type="number"
              required
              min={1}
              max={480}
              value={plan.durationMinutes}
              onChange={(e) => setPlan({ ...plan, durationMinutes: Number(e.target.value) })}
            />
          </Field>
          <Field label="Điểm đạt (%)">
            <input
              type="number"
              required
              min={0}
              max={100}
              value={plan.passScore}
              onChange={(e) => setPlan({ ...plan, passScore: Number(e.target.value) })}
            />
          </Field>
        </div>
        <Field label="Mục tiêu bài kiểm tra">
          <textarea
            rows={2}
            maxLength={2000}
            value={plan.description}
            onChange={(e) => setPlan({ ...plan, description: e.target.value })}
          />
        </Field>
        <Field label="Nguồn câu hỏi">
          <select
            value={strategy}
            onChange={(e) => setStrategy(e.target.value as AIExamJob['strategy'])}
          >
            {Object.entries(strategyLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="ae-panel">
        <div className="ae-panel-title">
          <div>
            <h2>Ma trận chủ đề</h2>
            <p>Phần trăm được quy đổi thành số câu, bảo đảm tổng chính xác.</p>
          </div>
          <b className={total === 100 ? 'ae-valid' : 'ae-invalid'}>{total} / 100%</b>
        </div>
        <div className="ae-distribution" aria-label="Phân bổ chủ đề">
          {plan.sections.map((s, i) => (
            <span
              key={i}
              style={{
                flexGrow: Math.max(0, s.percentage),
                background: `var(--ae-color-${i % 5})`,
              }}
              title={`${s.topic}: ${s.percentage}%`}
            />
          ))}
        </div>
        <div className="ae-sections">
          {plan.sections.map((s, i) => (
            <section className="ae-section-edit" key={i}>
              <div className="ae-section-head">
                <span className="ae-topic-dot" style={{ background: `var(--ae-color-${i % 5})` }} />
                <b>Chủ đề {i + 1}</b>
                <span>{counts[i]} câu</span>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Xóa chủ đề ${i + 1}`}
                  disabled={plan.sections.length === 1 || busy}
                  onClick={() =>
                    setPlan({ ...plan, sections: plan.sections.filter((_, n) => n !== i) })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <div className="ae-fields ae-topic-fields">
                <Field label="Chủ đề">
                  <input
                    required
                    maxLength={100}
                    value={s.topic}
                    onChange={(e) => section(i, { topic: e.target.value })}
                  />
                </Field>
                <Field label="Tỷ lệ (%)">
                  <input
                    type="number"
                    required
                    min={1}
                    max={100}
                    value={s.percentage}
                    onChange={(e) => section(i, { percentage: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Độ khó">
                  <select
                    value={s.difficulty}
                    onChange={(e) =>
                      section(i, { difficulty: e.target.value as typeof s.difficulty })
                    }
                  >
                    {Object.entries(difficultyLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Dạng câu hỏi">
                  <select
                    value={s.type}
                    onChange={(e) => section(i, { type: e.target.value as typeof s.type })}
                  >
                    {Object.entries(typeLabels).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Kiến thức cần đánh giá">
                <textarea
                  rows={2}
                  required
                  maxLength={600}
                  value={s.objectives}
                  onChange={(e) => section(i, { objectives: e.target.value })}
                />
              </Field>
              <Field
                label="Chủ đề / tags tương đương trong ngân hàng"
                hint="Ngăn cách bằng dấu phẩy. Khớp chính xác tên chủ đề hoặc tag, cùng môn, độ khó và dạng câu."
              >
                <input
                  required
                  value={s.keywords.join(',')}
                  onChange={(e) => section(i, { keywords: e.target.value.split(',') })}
                />
              </Field>
              {!dirty && coverage.data?.sections[i] && (
                <div className="ae-coverage">
                  <span>
                    <LibraryBig size={14} /> {coverage.data.sections[i].fromBank} từ ngân hàng
                  </span>
                  <span>
                    <Sparkles size={14} /> {coverage.data.sections[i].toGenerate}{' '}
                    {strategy === 'BANK_ONLY' ? 'câu còn thiếu' : 'câu cần AI tạo'}
                  </span>
                </div>
              )}
            </section>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || plan.sections.length >= 12}
          onClick={() =>
            setPlan({
              ...plan,
              sections: [
                ...plan.sections,
                {
                  topic: '',
                  percentage: 10,
                  difficulty: 'MEDIUM',
                  type: 'SINGLE_CHOICE',
                  objectives: '',
                  keywords: [''],
                },
              ],
            })
          }
        >
          <Plus size={16} /> Thêm chủ đề
        </button>
        <ErrorBox message={issue || coverage.error} />
        <p className="ae-hint">
          {dirty
            ? 'Lưu cấu trúc để cập nhật số câu phù hợp trong ngân hàng.'
            : 'Số câu ngân hàng được kiểm tra lại khi tạo đề. Mỗi câu chỉ được dùng một lần.'}
        </p>
      </div>
      <div className="ae-footer-actions">
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy || !!issue}
          onClick={() => void save(plan, strategy, false)}
        >
          <Save size={16} /> Lưu cấu trúc
        </button>
        <button className="btn btn-primary" disabled={busy || !!issue}>
          {busy ? <Spinner /> : <Sparkles size={17} />} Tạo đề theo cấu trúc{' '}
          <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
