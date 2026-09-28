export type ScoreBand = { label: string; count: number };
export type NamedScore = { subject: string; topic?: string; score: number; questions?: number };
export type TeacherDashboard = {
  students: number;
  exams: number;
  questions: number;
  attempts: number;
  averageScore: number | null;
  passRate: number | null;
  averageMinutes: number | null;
  distribution: ScoreBand[];
  passFail: { passed: number; failed: number };
  months: { label: string; score: number; attempts: number }[];
  subjects: { subject: string; score: number; minutes: number; attempts: number }[];
  topics: { subject: string; topic: string; score: number; questions: number }[];
  missed: { question: string; subject: string; misses: number; served: number; rate: number }[];
  studentPerformance: { name: string; score: number; attempts: number; passRate: number }[];
  truncated: boolean;
};
export type StudentDashboard = {
  completed: number;
  averageScore: number | null;
  bestScore: number | null;
  studyMinutes: number;
  strong: { subject: string; topic: string; score: number }[];
  weak: { subject: string; topic: string; score: number }[];
};

export const countLabel = (value: number) => value.toLocaleString('vi-VN');
export const percentLabel = (value: number | null) =>
  value === null ? '—' : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
export const studyLabel = (minutes: number) => {
  if (minutes < 60) return `${minutes} phút`;
  const hours = Math.round((minutes / 60) * 10) / 10;
  return `${hours.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} giờ`;
};
