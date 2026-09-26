import { z } from 'zod';
const id = z.string().regex(/^[a-f\d]{24}$/i, 'ID không hợp lệ.');
const date = z
  .string()
  .datetime({ offset: true })
  .transform((v) => new Date(v))
  .nullable();
export const blueprintSchema = z
  .object({
    EASY: z.number().int().min(0).max(100),
    MEDIUM: z.number().int().min(0).max(100),
    HARD: z.number().int().min(0).max(100),
    VERY_HARD: z.number().int().min(0).max(100),
  })
  .strict();
export const settingsSchema = z
  .object({
    startsAt: date,
    endsAt: date,
    durationMinutes: z.number().int().min(1).max(480),
    maxAttempts: z.number().int().min(1).max(20),
    passScore: z.number().min(0).max(100),
    randomQuestions: z.boolean(),
    randomAnswers: z.boolean(),
    showAnswers: z.boolean(),
    allowBack: z.boolean(),
    autoSubmit: z.boolean(),
    access: z.enum(['ALL', 'RESTRICTED']),
    classIds: z.array(id).max(100),
    studentIds: z.array(id).max(1000),
  })
  .strict()
  .superRefine((s, ctx) => {
    if (s.startsAt && s.endsAt && s.endsAt <= s.startsAt)
      ctx.addIssue({ code: 'custom', message: 'Thời gian kết thúc phải sau thời gian bắt đầu.' });
    if (s.access === 'RESTRICTED' && !s.classIds.length && !s.studentIds.length)
      ctx.addIssue({
        code: 'custom',
        message: 'Chọn ít nhất một lớp hoặc học sinh được phép thi.',
      });
  });
export const examSchema = z
  .object({
    title: z.string().trim().min(3).max(160),
    description: z.string().trim().max(5000).default(''),
    subject: z.string().trim().min(1).max(100),
    topic: z.string().trim().max(520).default(''),
    mode: z.enum(['MANUAL', 'AUTO']),
    blueprint: blueprintSchema,
    selections: z
      .array(
        z
          .object({
            questionId: id,
            version: z.number().int().positive(),
            points: z.number().int().min(1).max(100),
          })
          .strict(),
      )
      .max(100),
    settings: settingsSchema,
    passwordAction: z.enum(['KEEP', 'SET', 'REMOVE']).default('KEEP'),
    password: z.string().max(72).default(''),
  })
  .strict()
  .superRefine((e, ctx) => {
    if (new Set(e.selections.map((q) => q.questionId)).size !== e.selections.length)
      ctx.addIssue({ code: 'custom', message: 'Không chọn trùng câu hỏi.' });
    if (e.passwordAction === 'SET' && (e.password.length < 4 || Buffer.byteLength(e.password) > 72))
      ctx.addIssue({ code: 'custom', message: 'Mã truy cập dài 4–72 byte.' });
    if (Object.values(e.blueprint).reduce((s, n) => s + n, 0) > 100)
      ctx.addIssue({ code: 'custom', message: 'Đề thi tối đa 100 câu hỏi.' });
  });
