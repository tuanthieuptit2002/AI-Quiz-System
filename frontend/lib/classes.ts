import type { Classroom } from './types';
import type { ExamRun } from './exams';

export type Course = {
  id: string;
  title: string;
  description: string;
  classCount: number;
  createdAt: string;
};
export type Lesson = {
  id: string;
  title: string;
  content: string;
  link: string;
  createdAt: string;
  updatedAt: string;
};
export type AssignmentKind = 'QUIZ' | 'EXAM';
export type Assignment = {
  id: string;
  kind: AssignmentKind;
  dueAt: string;
  createdAt: string;
  exam: {
    id: string;
    title: string;
    subject: string;
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
    questionCount: number;
    durationMinutes: number;
    maxAttempts: number;
    passScore: number;
    startsAt: string | null;
    endsAt: string | null;
  } | null;
};
export type RunStatus = ExamRun['status'] | 'NOT_STARTED';
export type ProgressSummary = {
  status: RunStatus;
  attempts: number;
  submitted: boolean;
  bestScore: number | null;
  passed: boolean | null;
  submittedAt: string | null;
};
export type StudentAssignment = Assignment & {
  mine: ProgressSummary;
  state: 'RUNNING' | 'CLOSED' | 'OVERDUE' | 'EXHAUSTED' | 'UPCOMING' | 'OPEN';
};
export type TeacherClass = {
  classroom: Classroom;
  course: Course | null;
  lessons: Lesson[];
  assignments: Assignment[];
};
export type StudentClass = {
  classroom: Classroom;
  lessons: Lesson[];
  assignments: StudentAssignment[];
  serverTime: string;
};
export type ClassResults = {
  studentCount: number;
  assignments: (Assignment & {
    summary: {
      submitted: number;
      pendingReview: number;
      averageScore: number | null;
      passed: number;
    };
    students: (ProgressSummary & { studentId: string; name: string; email: string })[];
  })[];
};

export const kindLabels: Record<AssignmentKind, string> = {
  QUIZ: 'Bài kiểm tra',
  EXAM: 'Bài thi',
};
export const resultLabels: Record<RunStatus, string> = {
  NOT_STARTED: 'Chưa làm',
  RUNNING: 'Đang làm',
  SUBMITTED: 'Đã nộp',
  PENDING_REVIEW: 'Chờ chấm',
  EXPIRED: 'Hết hạn, chưa nộp',
  CANCELLED: 'Đã hủy',
};
export const stateLabels: Record<StudentAssignment['state'], string> = {
  RUNNING: 'Đang làm',
  CLOSED: 'Đề đã đóng',
  OVERDUE: 'Đã quá hạn',
  EXHAUSTED: 'Hết lượt',
  UPCOMING: 'Chưa mở',
  OPEN: 'Đang mở',
};

const deadline = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hourCycle: 'h23',
});
export const dueLabel = (value: string) => deadline.format(new Date(value));
export const inviteLink = (code: string) =>
  typeof window === 'undefined' ? `/join/${code}` : `${window.location.origin}/join/${code}`;
export const pendingJoinKey = 'quizspace.pending-join';
