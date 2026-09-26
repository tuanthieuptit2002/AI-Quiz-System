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
export const classSchema = z.object({
  name: z.string().trim().min(2).max(80),
  subject: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).default(''),
  color: z.enum(['mint', 'violet', 'blue', 'amber']).default('mint'),
});
