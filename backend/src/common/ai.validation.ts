import { z } from 'zod';
import { difficulties, questionTypes } from '../models/question.model.js';
import { questionSchema } from './question.validation.js';
import type { AISettings, AISource } from '../models/ai-generation.model.js';
import { httpError } from './http.js';

export const sourceLimit = 60000;
export const sourceSchema = z
  .object({
    kind: z.enum(['PROMPT', 'TEXT', 'PDF', 'DOCX', 'URL']),
    name: z.string().trim().max(300),
    text: z.string().trim().max(sourceLimit),
  })
  .strict()
  .superRefine((source, ctx) => {
    if (source.kind !== 'PROMPT' && source.text.length < 80)
      ctx.addIssue({
        code: 'custom',
        message: 'Nguồn cần ít nhất 80 ký tự văn bản để tạo câu hỏi.',
      });
    if (source.kind === 'PROMPT' && source.text)
      ctx.addIssue({
        code: 'custom',
        message: 'Chọn nguồn văn bản để sử dụng tài liệu tham chiếu.',
      });
  });
export const aiSettingsSchema = z
  .object({
    subject: z.string().trim().min(1).max(100),
    topicPath: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(100)
          .refine((s) => !s.includes('/')),
      )
      .min(1)
      .max(5),
    difficulty: z.enum(difficulties),
    type: z.enum(questionTypes),
    count: z.number().int().min(1).max(50),
    language: z.enum(['vi', 'en']).default('vi'),
    instructions: z.string().trim().max(2000).default(''),
  })
  .strict();
export const generationSchema = z
  .object({
    requestId: z.uuid(),
    settings: aiSettingsSchema,
    source: sourceSchema,
  })
  .strict();
export const normalizedText = (value: string) =>
  value.normalize('NFKC').replace(/\s+/g, ' ').trim();

/** Words only: PDF extraction and the model disagree on quotes, dashes, casing and line-break hyphens. */
export const groundingText = (value: string) =>
  value
    .normalize('NFKC')
    .toLocaleLowerCase('vi')
    .replace(/\u00ad/g, '')
    .replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim();

const minRun = 4;

/**
 * A quote counts as grounded when at least 80% of its words appear in the source in runs of four or
 * more consecutive words, so ellipses and small copy slips pass while invented quotes still fail.
 */
export function isGrounded(source: string, evidence: string) {
  const haystack = ` ${groundingText(source)} `;
  const compact = haystack.replaceAll(' ', '');
  const fragments = evidence
    .split(/\[?(?:\.{3,}|…)\]?/)
    .map((part) => groundingText(part).split(' ').filter(Boolean))
    .filter((words) => words.length);
  const total = fragments.reduce((sum, words) => sum + words.length, 0);
  if (total < 3) return false;
  let covered = 0;
  for (const words of fragments) {
    const joined = words.join('');
    // Space-insensitive match covers extractors that break words apart ("ch ươ ng" for "chương").
    if (
      haystack.includes(` ${words.join(' ')} `) ||
      (joined.length >= 15 && compact.includes(joined))
    ) {
      covered += words.length;
      continue;
    }
    for (let start = 0; start < words.length;) {
      let end = start;
      while (end < words.length && haystack.includes(` ${words.slice(start, end + 1).join(' ')} `))
        end++;
      if (end - start >= minRun) {
        covered += end - start;
        start = end;
      } else start++;
    }
  }
  return covered / total >= 0.8;
}

const generatedSchema = z
  .object({
    question: z.string(),
    options: z.array(z.object({ id: z.string(), text: z.string() }).strict()),
    answers: z.array(z.string()),
    pairs: z.array(z.object({ left: z.string(), right: z.string() }).strict()),
    rubric: z.string(),
    explanation: z.string().trim().min(1),
    tags: z.array(z.string()),
    evidence: z.string().trim().max(1000),
  })
  .strict();

/**
 * Returns the valid questions (at most `count`) and drops the rest, so one bad item no longer
 * discards a whole batch; the caller asks again for whatever is still missing.
 */
export function validateAIOutput(
  output: unknown,
  settings: AISettings,
  source: AISource,
  count: number,
  previous: string[],
) {
  const envelope = z
    .object({ questions: z.array(z.unknown()).min(1) })
    .strict()
    .safeParse(output);
  if (!envelope.success)
    httpError(502, 'AI trả thiếu câu hoặc sai cấu trúc. Hãy thử lại phần còn thiếu.');
  const seen = new Set(previous.map((q) => normalizedText(q).toLocaleLowerCase()));
  const accepted: { content: z.infer<typeof questionSchema>; evidence: string }[] = [];
  let firstProblem = '';
  for (const [index, raw] of envelope.data.questions.entries()) {
    if (accepted.length >= count) break;
    const problem = (message: string) => {
      firstProblem ||= message;
    };
    const item = generatedSchema.safeParse(raw);
    if (!item.success) {
      problem('AI trả thiếu câu hoặc sai cấu trúc. Hãy thử lại phần còn thiếu.');
      continue;
    }
    const { evidence, ...generated } = item.data;
    const parsed = questionSchema.safeParse({
      ...generated,
      type: settings.type,
      subject: settings.subject,
      topicPath: settings.topicPath,
      difficulty: settings.difficulty,
      status: 'DRAFT',
      image: '',
      imageAlt: '',
    });
    if (!parsed.success) {
      problem(
        `Câu AI ${index + 1} không hợp lệ: ${parsed.error.issues[0]?.message || 'Kiểm tra nội dung và đáp án.'}`,
      );
      continue;
    }
    const content = parsed.data;
    if (
      ['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(content.type) &&
      content.options.length !== 4
    ) {
      problem('Câu hỏi trắc nghiệm AI phải có đúng 4 lựa chọn.');
      continue;
    }
    if (
      new Set(content.options.map((o) => normalizedText(o.text).toLocaleLowerCase())).size !==
      content.options.length
    ) {
      problem('AI tạo lựa chọn trùng nhau. Hãy thử tạo lại.');
      continue;
    }
    const key = normalizedText(content.question).toLocaleLowerCase();
    if (seen.has(key)) {
      problem('AI tạo câu hỏi trùng trong đợt này. Hãy thử lại phần còn thiếu.');
      continue;
    }
    if (source.text && (!evidence || !isGrounded(source.text, evidence))) {
      problem('AI chưa trích đúng nội dung nguồn. Hãy thử lại hoặc làm rõ tài liệu.');
      continue;
    }
    seen.add(key);
    accepted.push({ content, evidence: source.text ? evidence : '' });
  }
  if (!accepted.length) httpError(502, firstProblem);
  return accepted;
}
