export type LearningRange = '30' | '90' | 'all';
export interface LearningMetric {
  id: string;
  subject: string;
  topicPath: string[];
  questions: number;
  exams: number;
  earned: number;
  possible: number;
  score: number;
  level: 'INSUFFICIENT' | 'WEAK' | 'DEVELOPING' | 'STRONG';
}
export interface LearningSnapshot {
  range: LearningRange;
  from: string | null;
  sourceKey: string;
  exams: number;
  questions: number;
  score: number | null;
  pendingRuns: number;
  hiddenExams: number;
  unclassifiedQuestions: number;
  invalidQuestions: number;
  truncated: boolean;
  subjects: LearningMetric[];
  topics: LearningMetric[];
  recent: { runId: string; title: string; submittedAt: string; score: number }[];
}
export interface LearningAdvice {
  summary: string;
  strengths: { topicId: string; observation: string }[];
  recommendations: {
    topicId: string;
    reason: string;
    actions: string[];
    practice: string;
    minutes: number;
  }[];
  limitations: string;
}
export interface LearningOverview {
  snapshot: LearningSnapshot;
  configured: boolean;
  eligible: boolean;
  limits: {
    maxExams: number;
    minQuestions: number;
    minExams: number;
    maxTopics: number;
    maxAttempts: number;
    dailyRequests: number;
  };
  report: {
    id: string;
    sourceKey: string;
    status: 'QUEUED' | 'GENERATING' | 'READY' | 'FAILED';
    advice: LearningAdvice | null;
    error: string;
    attempts: number;
    updatedAt: string;
    lastRequestId: string | null;
  } | null;
}
export const learningLevel = {
  INSUFFICIENT: 'Cần thêm dữ liệu',
  WEAK: 'Ưu tiên ôn',
  DEVELOPING: 'Cần củng cố',
  STRONG: 'Điểm mạnh',
};
export const topicName = (row: LearningMetric) => row.topicPath.at(-1) || row.subject;
export const percentLabel = (score: number) =>
  `${score.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
