export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT';
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: 'ACTIVE' | 'LOCKED';
  avatar: string;
  bio: string;
  phone: string;
  weeklyGoal: number;
  createdAt: string;
  lastLoginAt?: string;
  hasPassword: boolean;
  onboarded: boolean;
};
export type AuthResult = { user: User; accessToken: string };
export type Classroom = {
  id: string;
  courseId: string | null;
  courseTitle?: string;
  name: string;
  subject: string;
  description: string;
  code: string;
  color: 'mint' | 'violet' | 'blue' | 'amber';
  studentCount: number;
  createdAt: string;
  teacherName?: string;
};
export type Attempt = {
  id: string;
  title: string;
  subject: string;
  score: number;
  durationSeconds: number;
  submittedAt: string;
};
export type Progress = {
  attempts: number;
  average: number;
  best: number;
  minutes: number;
  weeklyCount: number;
  weeklyGoal: number;
  subjects: { subject: string; attempts: number; average: number }[];
  recent: { score: number; submittedAt: string }[];
};
export const roleLabel: Record<Role, string> = {
  ADMIN: 'Quản trị viên',
  TEACHER: 'Giáo viên',
  STUDENT: 'Học sinh',
};
export const dateLabel = (value: string) =>
  new Date(value).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
