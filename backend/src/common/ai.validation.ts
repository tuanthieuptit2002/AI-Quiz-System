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

export function validateAIOutput(
  output: unknown,
  settings: AISettings,
  source: AISource,
  count: number,
  previous: string[],
) {
  const schema = z
    .object({
      questions: z
        .array(
          z
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
            .strict(),
        )
        .length(count),
    })
    .strict();
  const parsed = schema.safeParse(output);
  if (!parsed.success)
    httpError(502, 'AI trả thiếu câu hoặc sai cấu trúc. Hãy thử lại phần còn thiếu.');
  const seen = new Set(previous.map((q) => normalizedText(q).toLocaleLowerCase()));
  return parsed.data.questions.map(({ evidence, ...generated }, index) => {
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
    if (!parsed.success)
      httpError(
        502,
        `Câu AI ${index + 1} không hợp lệ: ${parsed.error.issues[0]?.message || 'Kiểm tra nội dung và đáp án.'}`,
      );
    const content = parsed.data;
    if (['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(content.type) && content.options.length !== 4)
      httpError(502, 'Câu hỏi trắc nghiệm AI phải có đúng 4 lựa chọn.');
    if (
      new Set(content.options.map((o) => normalizedText(o.text).toLocaleLowerCase())).size !==
      content.options.length
    )
      httpError(502, 'AI tạo lựa chọn trùng nhau. Hãy thử tạo lại.');
    const key = normalizedText(content.question).toLocaleLowerCase();
    if (seen.has(key))
      httpError(502, 'AI tạo câu hỏi trùng trong đợt này. Hãy thử lại phần còn thiếu.');
    seen.add(key);
    if (
      source.text &&
      (!evidence || !normalizedText(source.text).includes(normalizedText(evidence)))
    )
      httpError(502, 'AI chưa trích đúng nội dung nguồn. Hãy thử lại hoặc làm rõ tài liệu.');
    return { content, evidence: source.text ? evidence : '' };
  });
}
