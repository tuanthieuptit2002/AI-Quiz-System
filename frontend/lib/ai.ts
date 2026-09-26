import type { QuestionContent } from './questions';

export interface AISettings {
  subject: string;
  topicPath: string[];
  difficulty: QuestionContent['difficulty'];
  type: QuestionContent['type'];
  count: number;
  language: 'vi' | 'en';
  instructions: string;
}
export interface AISource {
  kind: 'PROMPT' | 'TEXT' | 'PDF' | 'DOCX' | 'URL';
  name: string;
  text: string;
}
export interface AICandidate {
  id: string;
  content: QuestionContent;
  evidence: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  revision: number;
  questionId: string | null;
}
export interface AIJob {
  id: string;
  ownerId: string;
  settings: AISettings;
  source: AISource;
  model: string;
  status: 'QUEUED' | 'GENERATING' | 'REVIEW' | 'FAILED';
  items: AICandidate[];
  version: number;
  error: string;
  regenerateId: string | null;
  feedback: string;
  createdAt: string;
  updatedAt: string;
  generated: number;
  approved: number;
  rejected: number;
}
export interface AIStatus {
  configured: boolean;
  provider: string;
  model: string;
  maxCount: number;
  maxSourceChars: number;
  maxFileMB: number;
}
export const jobLabels = {
  QUEUED: 'Đang chờ',
  GENERATING: 'Đang tạo',
  REVIEW: 'Chờ duyệt',
  FAILED: 'Cần thử lại',
};
export const jobStatusLabel = (job: AIJob) =>
  job.status === 'REVIEW' && job.generated > 0 && job.approved + job.rejected === job.generated
    ? 'Đã xử lý'
    : jobLabels[job.status];
export const candidateLabels = {
  PENDING: 'Chờ duyệt',
  APPROVED: 'Đã vào ngân hàng',
  REJECTED: 'Đã từ chối',
};
export const sourceLabels = {
  PROMPT: 'Chủ đề / Prompt',
  TEXT: 'Văn bản / Bài giảng',
  PDF: 'Tài liệu PDF',
  DOCX: 'Tài liệu Word',
  URL: 'Website',
};
export const isWorking = (job: AIJob | null) =>
  !!job && ['QUEUED', 'GENERATING'].includes(job.status);
