import type { ObjectId } from 'mongodb';

export interface GradeProposal {
  points: number;
  reason: string;
  strengths: string[];
  improvements: string[];
  evidence: string[];
  limitations: string;
}
export interface GradingSuggestion {
  _id: ObjectId;
  ownerId: ObjectId;
  examId: ObjectId;
  runId: ObjectId;
  index: number;
  sourceHash: string;
  requestId: string;
  model: string;
  status: 'QUEUED' | 'GENERATING' | 'READY' | 'FAILED' | 'DISMISSED';
  proposal: GradeProposal | null;
  error: string;
  version: number;
  leaseId: string | null;
  leaseUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
export interface GradingEvent {
  _id: ObjectId;
  examId: ObjectId;
  runId: ObjectId;
  index: number;
  revision: number;
  reviewerId: ObjectId;
  reviewerName: string;
  previousPoints: number | null;
  points: number;
  previousFeedback: string;
  feedback: string;
  suggestionId: ObjectId | null;
  suggestedPoints: number | null;
  createdAt: Date;
}
export function suggestionDto(job: GradingSuggestion) {
  return {
    id: job._id.toHexString(),
    index: job.index,
    status: job.status,
    proposal: job.proposal,
    error: job.error,
    model: job.model,
    version: job.version,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  };
}
export function gradingEventDto(event: GradingEvent) {
  const { _id, reviewerId: _reviewer, examId: _exam, runId: _run, suggestionId, ...rest } = event;
  return { ...rest, id: _id.toHexString(), suggestionId: suggestionId?.toHexString() || null };
}
