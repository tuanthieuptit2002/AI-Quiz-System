import type { QuestionContent } from './questions';
export const examStatusLabels = {
  DRAFT: 'Bản nháp',
  PUBLISHED: 'Đã phát hành',
  ARCHIVED: 'Đã lưu trữ',
};
export const runStatusLabels = {
  RUNNING: 'Đang làm',
  SUBMITTED: 'Đã chấm',
  PENDING_REVIEW: 'Chờ Teacher chấm',
  EXPIRED: 'Hết hạn, chưa nộp',
  CANCELLED: 'Đã hủy',
};
export interface ExamSettings {
  startsAt: string | null;
  endsAt: string | null;
  durationMinutes: number;
  maxAttempts: number;
  passScore: number;
  randomQuestions: boolean;
  randomAnswers: boolean;
  secure: boolean;
  leaveLimit: number;
  showAnswers: boolean;
  allowBack: boolean;
  autoSubmit: boolean;
  access: 'ALL' | 'RESTRICTED';
  classIds: string[];
  studentIds: string[];
}
export interface ExamQuestion {
  questionId: string;
  version: number;
  points: number;
  content: QuestionContent;
}
export interface Exam {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  subject: string;
  mode: 'MANUAL' | 'AUTO';
  topic: string;
  blueprint: Record<QuestionContent['difficulty'], number>;
  questions: ExamQuestion[];
  settings: ExamSettings;
  status: keyof typeof examStatusLabels;
  version: number;
  hasPassword: boolean;
  questionCount: number;
  totalPoints: number;
  updatedAt: string;
}
export interface RunSummary {
  id: string;
  studentName: string;
  status: keyof typeof runStatusLabels;
  attemptNo: number;
  scorePercent: number | null;
  passed: boolean | null;
  submittedAt: string | null;
}
export interface StudentExam extends Omit<Exam, 'questions' | 'settings'> {
  settings: Omit<ExamSettings, 'access' | 'classIds' | 'studentIds'>;
  runs: RunSummary[];
  dueAt: string | null;
}
export interface RunQuestion {
  id: string;
  type: QuestionContent['type'];
  question: string;
  image: string;
  imageAlt: string;
  points: number;
  options: { id: string; text: string }[];
  left: { id: string; text: string }[];
  blankCount: number;
  correct?: string[];
  explanation?: string;
  rubric?: string;
  locked?: boolean;
}
export interface ExamRun extends RunSummary {
  grading: GradingSummary | null;
  examId: string;
  title: string;
  subject: string;
  settings: Pick<
    ExamSettings,
    'showAnswers' | 'allowBack' | 'autoSubmit' | 'passScore' | 'secure'
  > & {
    leaveLimit?: number;
  };
  questions: RunQuestion[];
  responses: string[][];
  flagged: boolean[];
  lastMutationId: string | null;
  awarded: (number | null)[];
  feedback: string[];
  currentIndex: number;
  revision: number;
  startedAt: string;
  expiresAt: string;
  serverTime: string;
  questionCount: number;
  answered: boolean[];
}
export interface GradingSummary {
  earnedPoints: number;
  totalPoints: number;
  correct: number;
  incorrect: number;
  partial: number;
  pending: number;
  unanswered: number;
  durationSeconds: number;
  final: boolean;
}
export interface ExamAudience {
  classes: { id: string; name: string; subject: string; count: number }[];
  students: { id: string; name: string; email: string }[];
}
export const defaultSettings: ExamSettings = {
  startsAt: null,
  endsAt: null,
  durationMinutes: 60,
  maxAttempts: 1,
  passScore: 70,
  randomQuestions: true,
  randomAnswers: true,
  secure: false,
  leaveLimit: 3,
  showAnswers: false,
  allowBack: true,
  autoSubmit: true,
  access: 'RESTRICTED',
  classIds: [],
  studentIds: [],
};
export function localDate(value: string | null) {
  if (!value) return '';
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function displayDate(value: string | null) {
  return value ? new Date(value).toLocaleString('vi-VN') : 'Không giới hạn';
}
