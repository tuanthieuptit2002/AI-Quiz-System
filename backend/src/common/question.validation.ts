import { z } from 'zod';
import sharp from 'sharp';
import { difficulties, questionStatuses, questionTypes } from '../models/question.model.js';
import { httpError } from './http.js';

const text = (max: number) => z.string().trim().min(1, 'Vui lòng nhập đầy đủ nội dung.').max(max);
export const questionSchema = z
  .object({
    type: z.enum(questionTypes),
    subject: text(100),
    topicPath: z
      .array(
        text(100).refine((value) => !value.includes('/'), 'Tên mỗi cấp chủ đề không chứa dấu /.'),
      )
      .min(1)
      .max(5),
    difficulty: z.enum(difficulties),
    status: z.enum(questionStatuses).default('DRAFT'),
    question: text(10000),
    options: z
      .array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), text: text(1000) }).strict())
      .max(20)
      .default([]),
    answers: z.array(text(1000)).max(30).default([]),
    pairs: z
      .array(z.object({ left: text(1000), right: text(1000) }).strict())
      .max(20)
      .default([]),
    rubric: z.string().trim().max(10000).default(''),
    explanation: z.string().trim().max(10000).default(''),
    tags: z
      .array(text(40))
      .max(15)
      .default([])
      .transform((tags) => [...new Set(tags)]),
    image: z.string().max(720000).default(''),
    imageAlt: z.string().trim().max(200).default(''),
  })
  .strict()
  .superRefine((q, ctx) => {
    for (const field of ['options', 'answers', 'pairs'] as const) {
      if (JSON.stringify(q[field]).length > 32000)
        ctx.addIssue({
          code: 'custom',
          message: `Nội dung ${field} quá dài để lưu trong một ô Excel.`,
          path: [field],
        });
    }
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
    const choice = ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'ORDERING'].includes(q.type);
    const ids = q.options.map((o) => o.id);
    if (choice) {
      if (q.options.length < 2 || new Set(ids).size !== ids.length)
        fail('Cần ít nhất 2 lựa chọn với ID khác nhau.');
      if (new Set(q.answers).size !== q.answers.length || q.answers.some((a) => !ids.includes(a)))
        fail('Đáp án phải tham chiếu các lựa chọn hợp lệ và không trùng nhau.');
    } else if (q.options.length) fail('Dạng câu hỏi này không sử dụng lựa chọn.');
    if (q.type === 'SINGLE_CHOICE' && q.answers.length !== 1) fail('Chọn đúng 1 đáp án.');
    if (q.type === 'MULTIPLE_CHOICE' && q.answers.length < 2) fail('Chọn ít nhất 2 đáp án đúng.');
    if (q.type === 'ORDERING' && (q.answers.length !== ids.length || ids.length < 2))
      fail('Thứ tự đúng phải chứa mọi lựa chọn đúng một lần.');
    if (
      q.type === 'TRUE_FALSE' &&
      (q.answers.length !== 1 || !['true', 'false'].includes(q.answers[0]))
    )
      fail('Đáp án phải là true hoặc false.');
    if (q.type === 'FILL_BLANK') {
      const markers = [...q.question.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
      if (
        !markers.length ||
        markers.length !== q.answers.length ||
        markers.some((n, i) => n !== i + 1)
      )
        fail('Dùng {{1}}, {{2}}, … theo thứ tự, mỗi chỗ trống có một đáp án.');
    }
    if (q.type === 'SHORT_ANSWER' && !q.answers.length)
      fail('Nhập ít nhất một đáp án được chấp nhận.');
    if (q.type === 'ESSAY' && (!q.rubric || q.answers.length))
      fail('Tự luận cần hướng dẫn chấm, không dùng đáp án tự động.');
    if (q.type === 'MATCHING') {
      if (q.pairs.length < 2 || q.answers.length)
        fail('Ghép cặp cần ít nhất 2 cặp và không dùng trường answers.');
      if (
        new Set(q.pairs.map((p) => p.left)).size !== q.pairs.length ||
        new Set(q.pairs.map((p) => p.right)).size !== q.pairs.length
      )
        fail('Nội dung hai cột ghép cặp không được trùng nhau.');
    } else if (q.pairs.length) fail('Chỉ dạng ghép cặp mới sử dụng pairs.');
    if (q.type !== 'ESSAY' && q.rubric) fail('Chỉ dạng tự luận mới sử dụng hướng dẫn chấm.');
    if (q.image && !q.imageAlt) fail('Thêm mô tả cho hình ảnh.');
  });

export async function parseQuestion(input: unknown) {
  const data = questionSchema.parse(input);
  if (data.image) {
    if (!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(data.image))
      httpError(400, 'Ảnh phải là PNG, JPG hoặc WebP.');
    const buffer = Buffer.from(data.image.split(',')[1], 'base64');
    if (buffer.length > 500 * 1024) httpError(400, 'Ảnh tối đa 500 KB.');
    try {
      const normalized = await sharp(buffer, { limitInputPixels: 16000000 })
        .rotate()
        .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      if (normalized.length > 350 * 1024)
        httpError(400, 'Ảnh quá phức tạp. Hãy giảm kích thước ảnh.');
      data.image = `data:image/webp;base64,${normalized.toString('base64')}`;
    } catch {
      httpError(400, 'Không thể xử lý ảnh. Hãy dùng ảnh hợp lệ tối đa 500 KB.');
    }
  }
  return data;
}
