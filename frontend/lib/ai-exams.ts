import type { QuestionContent } from './questions';

export interface AIExamSection {
  topic: string;
  percentage: number;
  difficulty: QuestionContent['difficulty'];
  type: QuestionContent['type'];
  objectives: string;
  keywords: string[];
}
export interface AIExamPlan {
  title: string;
  subject: string;
  description: string;
  count: number;
  durationMinutes: number;
  passScore: number;
  sections: AIExamSection[];
}
export interface AIExamItem {
  id: string;
  section: number;
  origin: 'BANK' | 'AI' | 'EDITED';
  questionId: string | null;
  questionVersion: number | null;
  content: QuestionContent;
}
export interface AIExamJob {
  id: string;
  ownerId: string;
  prompt: string;
  strategy: 'HYBRID' | 'BANK_ONLY' | 'AI_ONLY';
  language: 'vi' | 'en';
  status: 'QUEUED' | 'WORKING' | 'PLANNED' | 'REVIEW' | 'FAILED' | 'SAVED';
  phase: 'PLAN' | 'BUILD' | 'REPLACE';
  plan: AIExamPlan | null;
  items: AIExamItem[];
  examId: string | null;
  version: number;
  generated: number;
  fromBank: number;
  error: string;
  createdAt: string;
}
export const examJobLabels = {
  QUEUED: 'Đang chờ',
  WORKING: 'Đang tạo',
  PLANNED: 'Duyệt cấu trúc',
  REVIEW: 'Duyệt đề',
  FAILED: 'Cần thử lại',
  SAVED: 'Đã lưu đề',
};
export const strategyLabels = {
  HYBRID: 'Ngân hàng + AI',
  BANK_ONLY: 'Chỉ ngân hàng',
  AI_ONLY: 'Tạo mới bằng AI',
};
export const examWorking = (job: AIExamJob | null) =>
  !!job && ['QUEUED', 'WORKING'].includes(job.status);
export function sectionCounts(plan: AIExamPlan) {
  if (plan.sections.reduce((n, s) => n + s.percentage, 0) !== 100 || !Number.isInteger(plan.count))
    return plan.sections.map(() => 0);
  const exact = plan.sections.map((s) => (plan.count * s.percentage) / 100),
    counts = exact.map(Math.floor);
  const order = exact
    .map((v, i) => ({ i, fraction: v - counts[i] }))
    .sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  const remaining = plan.count - counts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remaining; i++) counts[order[i].i]++;
  return counts;
}
export const examExample =
  'Tạo bài kiểm tra Java Backend Fresher\n\n50 câu\n60 phút\n\nJava Core: 30%\nSpring Boot: 30%\nDatabase: 20%\nRedis: 10%\nKafka: 10%';
