import { z } from 'zod';
import { difficulties, questionTypes } from '../models/question.model.js';
import { normalizedText } from './ai.validation.js';
import { httpError } from './http.js';

export const examStrategy = z.enum(['HYBRID', 'BANK_ONLY', 'AI_ONLY']);
export const aiExamRequest = z
  .object({
    requestId: z.uuid(),
    prompt: z.string().trim().min(15).max(4000),
    strategy: examStrategy,
    language: z.enum(['vi', 'en']),
  })
  .strict();
export const aiExamPlanSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    subject: z.string().trim().min(1).max(100),
    description: z.string().trim().max(2000),
    count: z.number().int().min(1).max(100),
    durationMinutes: z.number().int().min(1).max(480),
    passScore: z.number().int().min(0).max(100),
    sections: z
      .array(
        z
          .object({
            topic: z
              .string()
              .trim()
              .min(1)
              .max(100)
              .refine((v) => !v.includes('/'), 'Tên chủ đề không chứa /. '),
            percentage: z.number().int().min(1).max(100),
            difficulty: z.enum(difficulties),
            type: z.enum(questionTypes),
            objectives: z.string().trim().min(1).max(600),
            keywords: z.array(z.string().trim().min(2).max(60)).min(1).max(8),
          })
          .strict(),
      )
      .min(1)
      .max(12),
  })
  .strict()
  .superRefine((plan, ctx) => {
    if (plan.sections.reduce((n, s) => n + s.percentage, 0) !== 100)
      ctx.addIssue({ code: 'custom', message: 'Tổng tỷ lệ các chủ đề phải bằng 100%.' });
    if (
      new Set(plan.sections.map((s) => normalizedText(s.topic).toLowerCase())).size !==
      plan.sections.length
    )
      ctx.addIssue({ code: 'custom', message: 'Các chủ đề không được trùng nhau.' });
    if (plan.sections.length > plan.count)
      ctx.addIssue({ code: 'custom', message: 'Số chủ đề không được vượt số câu.' });
  });
export type AIExamPlan = z.infer<typeof aiExamPlanSchema>;

// Largest remainder allocation is deterministic and always sums to the requested total.
export function allocateCounts(plan: Pick<AIExamPlan, 'count' | 'sections'>) {
  const exact = plan.sections.map((s) => (plan.count * s.percentage) / 100);
  const counts = exact.map(Math.floor);
  const priority = exact
    .map((v, i) => ({ i, fraction: v - counts[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  const remaining = plan.count - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remaining; i++) counts[priority[i].i]++;
  return counts;
}
export function validateExamPlan(output: unknown) {
  const result = aiExamPlanSchema.safeParse(output);
  if (!result.success)
    httpError(502, `Cấu trúc đề AI chưa hợp lệ: ${result.error.issues[0]?.message}`);
  if (allocateCounts(result.data).some((n) => n === 0))
    httpError(502, 'Tỷ lệ quá nhỏ so với tổng số câu. Hãy gộp chủ đề hoặc tăng số câu.');
  return result.data;
}
