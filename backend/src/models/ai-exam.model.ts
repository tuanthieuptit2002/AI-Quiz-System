import type { ObjectId } from 'mongodb';
import type { AIExamPlan } from '../common/ai-exam.validation.js';
import type { QuestionContent } from './question.model.js';

export interface AIExamItem {
  id: string;
  section: number;
  origin: 'BANK' | 'AI' | 'EDITED';
  questionId: ObjectId | null;
  questionVersion: number | null;
  content: QuestionContent;
}
export interface AIExamJob {
  _id: ObjectId;
  ownerId: ObjectId;
  requestId: string;
  prompt: string;
  strategy: 'HYBRID' | 'BANK_ONLY' | 'AI_ONLY';
  language: 'vi' | 'en';
  model: string;
  status: 'QUEUED' | 'WORKING' | 'PLANNED' | 'REVIEW' | 'FAILED' | 'SAVED';
  phase: 'PLAN' | 'BUILD' | 'REPLACE';
  plan: AIExamPlan | null;
  items: AIExamItem[];
  replaceId: string | null;
  feedback: string;
  examId: ObjectId | null;
  version: number;
  error: string;
  leaseId: string | null;
  leaseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export function aiExamDto(job: AIExamJob, detail = true) {
  const {
    _id,
    ownerId,
    requestId: _request,
    leaseId: _lease,
    leaseUntil: _until,
    items,
    ...rest
  } = job;
  return {
    ...rest,
    id: _id.toHexString(),
    ownerId: ownerId.toHexString(),
    generated: items.length,
    fromBank: items.filter((i) => i.origin === 'BANK').length,
    ...(detail ? { items } : {}),
  };
}
