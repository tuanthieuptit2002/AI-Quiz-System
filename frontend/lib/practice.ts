import type { LearningRange } from './learning';
import type { QuestionContent } from './questions';

export type PracticeDifficulty = QuestionContent['difficulty'];
export interface PracticeTopic {
  topicId: string;
  subject: string;
  topicPath: string[];
  level: 'INSUFFICIENT' | 'WEAK' | 'DEVELOPING' | 'STRONG';
  officialScore: number;
  blendedScore: number;
  count: number;
  startDifficulty: PracticeDifficulty;
  served?: number;
  correct?: number;
}
export interface PracticeQuestion {
  id: string;
  topicId: string;
  subject: string;
  topicPath: string[];
  source: 'BANK' | 'AI';
  type: QuestionContent['type'];
  question: string;
  image: string;
  imageAlt: string;
  points: number;
  options: { id: string; text: string }[];
  left: { id: string; text: string }[];
  blankCount: number;
  difficulty: PracticeDifficulty;
  index: number;
  total: number;
}
export interface PracticeFeedback {
  itemId: string;
  topicId: string;
  subject: string;
  topicPath: string[];
  source: 'BANK' | 'AI';
  type: QuestionContent['type'];
  question: string;
  options: { id: string; text: string }[];
  left: { id: string; text: string }[];
  blankCount: number;
  response: string[];
  correct: string[];
  explanation: string;
  awarded: number;
  points: number;
  difficulty: PracticeDifficulty;
  nextDifficulty: PracticeDifficulty;
  shift: 'HARDER' | 'EASIER' | 'SAME';
}
export interface PracticeView {
  id: string;
  status: 'ACTIVE' | 'SUBMITTED';
  phase: 'QUESTION' | 'FEEDBACK' | 'SUMMARY';
  range: LearningRange;
  total: number;
  answered: number;
  correctCount: number;
  score: number | null;
  adjusted: boolean;
  plan: PracticeTopic[];
  question: PracticeQuestion | null;
  feedback: PracticeFeedback | null;
}
export interface PracticePlan {
  range: LearningRange;
  eligible: boolean;
  adjusted: boolean;
  total: number;
  configured: boolean;
  plan: PracticeTopic[];
  activeSessionId: string | null;
  previous: {
    id: string;
    submittedAt: string | null;
    score: number | null;
    answered: number;
    correct: number;
    topics: {
      topicId: string;
      subject: string;
      topicPath: string[];
      planned: number;
      answered: number;
      correct: number;
    }[];
  } | null;
}
export const leaf = (topic: { subject: string; topicPath: string[] }) =>
  topic.topicPath.at(-1) || topic.subject;
export const shiftLabel = {
  HARDER: 'Đúng. Câu sau của chủ đề này sẽ khó hơn.',
  EASIER: 'Chưa đúng. Câu sau của chủ đề này sẽ dễ hơn.',
  SAME: 'Giữ nguyên độ khó của chủ đề này.',
};
