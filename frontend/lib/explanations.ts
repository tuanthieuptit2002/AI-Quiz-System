import type { RunQuestion } from './exams';
export interface ExplanationReply {
  explanation: string;
  takeaway: string;
  practice: string;
  caveat: string;
  followUps: string[];
}
export interface ExplanationTurn {
  id: string;
  question: string;
  reply: ExplanationReply | null;
  status: 'PENDING' | 'READY' | 'FAILED';
  error: string;
  attempts: number;
  model: string;
  createdAt: string;
  answeredAt: string | null;
}
export interface ExplanationData {
  configured: boolean;
  sourceKey: string;
  limits: {
    maxTurns: number;
    maxAttempts: number;
    dailyRequests: number;
    maxQuestionChars: number;
  };
  thread: {
    id: string;
    sourceKey: string;
    version: number;
    status: 'QUEUED' | 'GENERATING' | 'READY' | 'FAILED';
    turns: ExplanationTurn[];
    updatedAt: string;
    lastRequestId: string | null;
  } | null;
}
export interface ExplanationRequest {
  sourceKey: string;
  version: number;
  requestId: string;
  question?: string;
  retry?: boolean;
}
export function choiceAnswer(q: RunQuestion, values: string[]) {
  return values
    .map((value) => {
      const index = q.options.findIndex((o) => o.id === value);
      return index < 0 ? value : `${String.fromCharCode(65 + index)}. ${q.options[index].text}`;
    })
    .join('\n');
}
