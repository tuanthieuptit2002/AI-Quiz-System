import type { RunQuestion } from './exams';
export interface GradeProposal {
  points: number;
  reason: string;
  strengths: string[];
  improvements: string[];
  evidence: string[];
  limitations: string;
}
export interface GradingSuggestion {
  id: string;
  index: number;
  status: 'QUEUED' | 'GENERATING' | 'READY' | 'FAILED' | 'DISMISSED';
  proposal: GradeProposal | null;
  error: string;
  model: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface GradingEvent {
  id: string;
  index: number;
  revision: number;
  reviewerName: string;
  previousPoints: number | null;
  points: number;
  previousFeedback: string;
  feedback: string;
  suggestionId: string | null;
  suggestedPoints: number | null;
  createdAt: string;
}
export interface GradingOverview {
  configured: boolean;
  model: string;
  suggestions: GradingSuggestion[];
  history: GradingEvent[];
  total: number;
  page: number;
  pages: number;
}
export const isWrittenQuestion = (type: string) => ['ESSAY', 'SHORT_ANSWER'].includes(type);
export const isActiveSuggestion = (s: GradingSuggestion) =>
  ['QUEUED', 'GENERATING'].includes(s.status);
export function readableAnswer(q: RunQuestion, values: string[]) {
  return values
    .map(
      (v, i) =>
        `${q.type === 'MATCHING' ? `${q.left?.[i]?.text} → ` : ''}${q.options?.find((o) => o.id === v)?.text || v || '(trống)'}`,
    )
    .join(q.type === 'ORDERING' ? ' → ' : '\n');
}
export function examDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600),
    minutes = Math.floor((seconds % 3600) / 60),
    remainder = seconds % 60;
  return `${hours ? `${hours}h ` : ''}${minutes}m ${String(remainder).padStart(2, '0')}s`;
}
