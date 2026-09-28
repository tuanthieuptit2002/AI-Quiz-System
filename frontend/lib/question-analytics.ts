import { countLabel, percentLabel } from './dashboard';
import { difficultyLabels, typeLabels, type QuestionType } from './questions';

export type AnalyticsFlag = 'too_easy' | 'too_hard' | 'mismatch' | 'weak_discrimination';
export type Difficulty = keyof typeof difficultyLabels;

export type AnswerShare = {
  text: string;
  count: number;
  rate: number;
  role: 'key' | 'distractor' | 'slot';
  flag: 'attractive' | 'unused' | null;
};

export type AnalyticsRow = {
  id: string;
  question: string;
  subject: string;
  topic: string;
  type: QuestionType;
  difficulty: Difficulty;
  status: string;
  attempts: number;
  graded: number;
  correctRate: number | null;
  averageSeconds: number | null;
  difficultyIndex: number | null;
  actual: Difficulty | null;
  discrimination: number | null;
  discriminationLabel: string | null;
  flags: AnalyticsFlag[];
};

export type AnalyticsList = {
  truncated: boolean;
  sample: number;
  summary: {
    analyzed: number;
    tooEasy: number;
    tooHard: number;
    mismatch: number;
    weakDiscrimination: number;
  };
  total: number;
  pages: number;
  page: number;
  questions: AnalyticsRow[];
};

export type AnalyticsDetail = AnalyticsRow & {
  distribution: 'choices' | 'slots' | 'answers' | 'none';
  choices: AnswerShare[];
  omitted: number;
  wrongAnswers: { text: string; count: number }[];
  warnings: string[];
  truncated: boolean;
  sample: number;
};

export const flagLabels: Record<AnalyticsFlag, string> = {
  too_easy: 'Quá dễ',
  too_hard: 'Quá khó',
  mismatch: 'Lệch độ khó',
  weak_discrimination: 'Phân biệt kém',
};

export { difficultyLabels, typeLabels, countLabel, percentLabel };

export function secondsLabel(seconds: number | null) {
  if (seconds === null) return '—';
  const rounded = Math.max(0, Math.round(seconds));
  if (rounded < 60) return `${rounded.toLocaleString('vi-VN')} giây`;
  const minutes = Math.floor(rounded / 60);
  const rest = rounded % 60;
  return rest
    ? `${minutes.toLocaleString('vi-VN')} phút ${rest.toLocaleString('vi-VN')} giây`
    : `${minutes.toLocaleString('vi-VN')} phút`;
}

export function indexLabel(value: number | null) {
  if (value === null) return '—';
  return value.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function difficultyLabel(value: Difficulty | null) {
  return value ? difficultyLabels[value] : 'Chưa đủ mẫu';
}
