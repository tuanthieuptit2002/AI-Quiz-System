import { z } from 'zod';

export const emailSchema = z.string().trim().email('Email không hợp lệ.').max(254).toLowerCase();
export const passwordSchema = z
  .string()
  .min(10, 'Mật khẩu cần ít nhất 10 ký tự.')
  .max(72, 'Mật khẩu tối đa 72 ký tự.')
  .regex(/[a-zA-Z]/, 'Mật khẩu cần có chữ.')
  .regex(/[0-9]/, 'Mật khẩu cần có số.')
  .refine((value) => Buffer.byteLength(value) <= 72, 'Mật khẩu tối đa 72 byte.');
export const nameSchema = z.string().trim().min(2, 'Tên cần ít nhất 2 ký tự.').max(80);
export const roleSchema = z.enum(['ADMIN', 'TEACHER', 'STUDENT']);
const objectIdText = z.string().regex(/^[a-f\d]{24}$/i, 'ID không hợp lệ.');
export const classSchema = z.object({
  name: z.string().trim().min(2).max(80),
  subject: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).default(''),
  color: z.enum(['mint', 'violet', 'blue', 'amber']).default('mint'),
  courseId: objectIdText.nullable().optional(),
});
export const courseSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(1000).default(''),
  })
  .strict();
export const lessonSchema = z
  .object({
    title: z.string().trim().min(2).max(160),
    content: z.string().trim().max(20000).default(''),
    link: z
      .string()
      .trim()
      .max(1000)
      .refine(
        (value) => !value || /^https?:\/\//i.test(value),
        'Liên kết phải bắt đầu bằng http(s)://.',
      )
      .default(''),
  })
  .strict();
export const assignmentSchema = z
  .object({
    examId: objectIdText,
    kind: z.enum(['QUIZ', 'EXAM']),
    dueAt: z
      .string()
      .datetime({ offset: true })
      .transform((value) => new Date(value)),
  })
  .strict();
