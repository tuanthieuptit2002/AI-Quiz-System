import type { ObjectId } from 'mongodb';
import type { QuestionContent } from './question.model.js';

export interface ExamSettings {
  startsAt: Date | null;
  endsAt: Date | null;
  durationMinutes: number;
  maxAttempts: number;
  passScore: number;
  randomQuestions: boolean;
  randomAnswers: boolean;
  showAnswers: boolean;
  allowBack: boolean;
  autoSubmit: boolean;
  access: 'ALL' | 'RESTRICTED';
  classIds: ObjectId[];
  studentIds: ObjectId[];
}
export interface ExamQuestion {
  questionId: ObjectId;
  version: number;
  points: number;
  content: QuestionContent;
}
export interface Exam {
  _id: ObjectId;
  ownerId: ObjectId;
  title: string;
  description: string;
  subject: string;
  mode: 'MANUAL' | 'AUTO';
  blueprint: Record<QuestionContent['difficulty'], number>;
  topic: string;
  questions: ExamQuestion[];
  settings: ExamSettings;
  passwordHash: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  version: number;
  admissionRevision: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface DeliveredQuestion {
  id: string;
  type: QuestionContent['type'];
  question: string;
  image: string;
  imageAlt: string;
  points: number;
  options: { id: string; text: string }[];
  left: { id: string; text: string }[];
  blankCount: number;
  correct: string[];
  explanation: string;
  rubric: string;
}
export interface ExamRun {
  _id: ObjectId;
  examId: ObjectId;
  ownerId: ObjectId;
  studentId: ObjectId;
  studentName: string;
  title: string;
  subject: string;
  attemptNo: number;
  status: 'RUNNING' | 'SUBMITTED' | 'PENDING_REVIEW' | 'EXPIRED';
  settings: Pick<ExamSettings, 'showAnswers' | 'allowBack' | 'autoSubmit' | 'passScore'>;
  questions: DeliveredQuestion[];
  responses: string[][];
  flagged?: boolean[];
  lastMutationId?: string;
  awarded: (number | null)[];
  feedback: string[];
  currentIndex: number;
  revision: number;
  startedAt: Date;
  expiresAt: Date;
  submittedAt: Date | null;
  scorePercent: number | null;
  passed: boolean | null;
}
export function examDto(exam: Exam, detail = true) {
  const { _id, ownerId, passwordHash, admissionRevision: _revision, questions, ...rest } = exam;
  return {
    ...rest,
    id: _id.toHexString(),
    ownerId: ownerId.toHexString(),
    hasPassword: !!passwordHash,
    questionCount: questions.length,
    totalPoints: questions.reduce((sum, q) => sum + q.points, 0),
    ...(detail ? { questions } : {}),
  };
}
