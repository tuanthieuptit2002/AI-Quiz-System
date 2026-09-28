import type { ClientSession, ObjectId } from 'mongodb';
import type { Collections } from '../database/collections.js';
import type { Assignment } from '../models/classroom.model.js';
import type { Exam, ExamRun } from '../models/exam.model.js';

export type AssignedExam = Pick<Exam, '_id' | 'title' | 'subject' | 'status' | 'settings'> & {
  questions: { points: number }[];
};
export type RunRow = Pick<
  ExamRun,
  | '_id'
  | 'examId'
  | 'studentId'
  | 'status'
  | 'scorePercent'
  | 'passed'
  | 'submittedAt'
  | 'startedAt'
>;

export const runRowProjection = {
  _id: 1,
  examId: 1,
  studentId: 1,
  status: 1,
  scorePercent: 1,
  passed: 1,
  submittedAt: 1,
  startedAt: 1,
} as const;

export const assignedExamProjection = {
  title: 1,
  subject: 1,
  status: 1,
  settings: 1,
  'questions.points': 1,
} as const;

/**
 * Latest class deadline for this student and exam, or null when no class assigned it.
 * A class deadline applies even when the exam is also open to the student another way.
 */
export async function assignedDue(
  c: Collections,
  examId: ObjectId,
  studentId: ObjectId,
  session?: ClientSession,
) {
  const classes = await c.classes
    .find({ studentIds: studentId }, { projection: { _id: 1 }, session })
    .toArray();
  if (!classes.length) return null;
  const rows = await c.assignments
    .find(
      { examId, classId: { $in: classes.map((cl) => cl._id) } },
      { projection: { dueAt: 1 }, session },
    )
    .toArray();
  return rows.length ? new Date(Math.max(...rows.map((row) => row.dueAt.getTime()))) : null;
}

export function runSummary(runs: RunRow[]) {
  const ordered = [...runs].sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  const graded = runs.filter((run) => run.status === 'SUBMITTED' && run.scorePercent !== null);
  const done = runs.filter((run) => run.status === 'SUBMITTED' || run.status === 'PENDING_REVIEW');
  const submitted = done
    .map((run) => run.submittedAt)
    .filter((at): at is Date => at instanceof Date)
    .sort((a, b) => b.getTime() - a.getTime());
  return {
    status: ordered[0]?.status ?? ('NOT_STARTED' as const),
    attempts: runs.length,
    submitted: done.length > 0,
    bestScore: graded.length ? Math.max(...graded.map((run) => run.scorePercent!)) : null,
    passed: graded.length ? graded.some((run) => run.passed === true) : null,
    submittedAt: submitted[0] ?? null,
  };
}

export function assignmentView(assignment: Assignment, exam: AssignedExam | undefined) {
  return {
    id: assignment._id.toHexString(),
    kind: assignment.kind,
    dueAt: assignment.dueAt,
    createdAt: assignment.createdAt,
    exam: exam
      ? {
          id: exam._id.toHexString(),
          title: exam.title,
          subject: exam.subject,
          status: exam.status,
          questionCount: exam.questions.length,
          durationMinutes: exam.settings.durationMinutes,
          maxAttempts: exam.settings.maxAttempts,
          passScore: exam.settings.passScore,
          startsAt: exam.settings.startsAt,
          endsAt: exam.settings.endsAt,
        }
      : null,
  };
}

export async function assignedExams(c: Collections, assignments: Assignment[]) {
  const exams = await c.exams
    .find(
      { _id: { $in: assignments.map((row) => row.examId) } },
      { projection: assignedExamProjection },
    )
    .toArray();
  return new Map(exams.map((exam) => [exam._id.toHexString(), exam as unknown as AssignedExam]));
}
