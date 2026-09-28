import type { ObjectId } from 'mongodb';

export interface ExplanationReply {
  explanation: string;
  takeaway: string;
  practice: string;
  followUps: string[];
  caveat: string;
}
export interface ExplanationTurn {
  id: string;
  question: string;
  reply: ExplanationReply | null;
  status: 'PENDING' | 'READY' | 'FAILED';
  error: string;
  attempts: number;
  model: string;
  createdAt: Date;
  answeredAt: Date | null;
}
export interface ExplanationThread {
  _id: ObjectId;
  studentId: ObjectId;
  runId: ObjectId;
  index: number;
  sourceKey: string;
  version: number;
  status: 'QUEUED' | 'GENERATING' | 'READY' | 'FAILED';
  turns: ExplanationTurn[];
  requests: { id: string; turnId: string; kind: 'MESSAGE' | 'RETRY'; createdAt: Date }[];
  leaseId: string | null;
  leaseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export const explanationLimits = {
  maxTurns: 8,
  maxAttempts: 3,
  dailyRequests: 50,
  maxQuestionChars: 1000,
};
export const defaultExplanationQuestion =
  'Giải thích đáp án của câu này và đối chiếu với bài làm của tôi.';
export function explanationDto(thread: ExplanationThread) {
  return {
    id: thread._id.toHexString(),
    version: thread.version,
    sourceKey: thread.sourceKey,
    status: thread.status,
    turns: thread.turns,
    updatedAt: thread.updatedAt,
    lastRequestId: thread.requests.at(-1)?.id || null,
  };
}
