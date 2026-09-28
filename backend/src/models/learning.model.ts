import type { ObjectId } from 'mongodb';

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
export interface LearningReport {
  _id: ObjectId;
  studentId: ObjectId;
  range: LearningRange;
  sourceKey: string;
  snapshot: LearningSnapshot;
  status: 'QUEUED' | 'GENERATING' | 'READY' | 'FAILED';
  requests: { id: string; createdAt: Date }[];
  advice: LearningAdvice | null;
  error: string;
  model: string;
  leaseId: string | null;
  leaseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export const learningLimits = {
  maxExams: 200,
  minQuestions: 5,
  minExams: 2,
  maxTopics: 20,
  maxAttempts: 3,
  dailyRequests: 10,
};
export function learningReportDto(report: LearningReport) {
  return {
    id: report._id.toHexString(),
    sourceKey: report.sourceKey,
    status: report.status,
    advice: report.advice,
    error: report.error,
    attempts: report.requests.length,
    updatedAt: report.updatedAt,
    lastRequestId: report.requests.at(-1)?.id || null,
  };
}
