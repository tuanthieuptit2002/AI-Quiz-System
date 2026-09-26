import type { ObjectId } from 'mongodb';
import type { QuestionContent } from './question.model.js';

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
export interface AIGeneration {
  _id: ObjectId;
  ownerId: ObjectId;
  requestId: string;
  settings: AISettings;
  source: AISource;
  model: string;
  status: 'QUEUED' | 'GENERATING' | 'REVIEW' | 'FAILED';
  items: AICandidate[];
  version: number;
  error: string;
  regenerateId: string | null;
  feedback: string;
  leaseId: string | null;
  leaseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export function generationDto(job: AIGeneration, detail = true) {
  const {
    _id,
    ownerId,
    requestId: _requestId,
    leaseId: _leaseId,
    leaseUntil: _leaseUntil,
    ...data
  } = job;
  return {
    ...data,
    id: _id.toHexString(),
    ownerId: ownerId.toHexString(),
    source: detail ? job.source : { kind: job.source.kind, name: job.source.name },
    items: detail ? job.items : undefined,
    generated: job.items.length,
    approved: job.items.filter((item) => item.status === 'APPROVED').length,
    rejected: job.items.filter((item) => item.status === 'REJECTED').length,
  };
}
