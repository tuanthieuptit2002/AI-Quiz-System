import type { Db } from 'mongodb';
import { collections } from './collections.js';

export async function ensureIndexes(db: Db) {
  const c = collections(db);
  await Promise.all([
    c.users.createIndex({ email: 1 }, { unique: true }),
    c.users.createIndex({ resetHash: 1 }, { sparse: true }),
    c.sessions.createIndex({ tokenHash: 1 }, { unique: true }),
    c.sessions.createIndex({ userId: 1 }),
    c.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.classes.createIndex({ code: 1 }, { unique: true }),
    c.classes.createIndex({ teacherId: 1 }),
    c.classes.createIndex({ studentIds: 1 }),
    c.attempts.createIndex({ studentId: 1, submittedAt: -1 }),
    c.questions.createIndex({ ownerId: 1, updatedAt: -1 }),
    c.questions.createIndex({ subject: 1, difficulty: 1, type: 1, status: 1 }),
    c.questions.createIndex({ tags: 1 }),
    c.questionVersions.createIndex({ questionId: 1, version: -1 }, { unique: true }),
    c.questionImports.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    c.exams.createIndex({ ownerId: 1, updatedAt: -1 }),
    c.exams.createIndex({ status: 1, 'settings.startsAt': 1 }),
    c.examRuns.createIndex({ examId: 1, studentId: 1, attemptNo: 1 }, { unique: true }),
    c.examRuns.createIndex({ studentId: 1, startedAt: -1 }),
    c.examRuns.createIndex({ status: 1, expiresAt: 1 }),
    c.gradingSuggestions.createIndex({ ownerId: 1, requestId: 1 }, { unique: true }),
    c.gradingSuggestions.createIndex({ ownerId: 1, createdAt: -1 }),
    c.gradingSuggestions.createIndex({ runId: 1, index: 1, createdAt: -1 }),
    c.gradingSuggestions.createIndex({ status: 1, leaseUntil: 1, createdAt: 1 }),
    c.gradingSuggestions.createIndex(
      { ownerId: 1 },
      {
        unique: true,
        name: 'one_active_grading_job_per_owner',
        partialFilterExpression: { status: { $in: ['QUEUED', 'GENERATING'] } },
      },
    ),
    c.gradingSuggestions.createIndex(
      { runId: 1, index: 1 },
      {
        unique: true,
        name: 'one_active_grading_job_per_question',
        partialFilterExpression: { status: { $in: ['QUEUED', 'GENERATING'] } },
      },
    ),
    c.gradingEvents.createIndex({ runId: 1, createdAt: -1 }),
    c.gradingEvents.createIndex({ runId: 1, revision: 1, index: 1 }, { unique: true }),
    c.explanationThreads.createIndex(
      { studentId: 1, runId: 1, index: 1, sourceKey: 1 },
      { unique: true },
    ),
    c.explanationThreads.createIndex({ studentId: 1, 'requests.id': 1 }, { unique: true }),
    c.explanationThreads.createIndex({ studentId: 1, 'requests.createdAt': -1 }),
    c.explanationThreads.createIndex({ status: 1, leaseUntil: 1, updatedAt: 1 }),
    c.explanationThreads.createIndex(
      { studentId: 1 },
      {
        unique: true,
        name: 'one_active_explanation_per_student',
        partialFilterExpression: { status: { $in: ['QUEUED', 'GENERATING'] } },
      },
    ),
    c.aiGenerations.createIndex({ ownerId: 1, createdAt: -1 }),
    c.aiGenerations.createIndex({ ownerId: 1, requestId: 1 }, { unique: true }),
    c.aiGenerations.createIndex(
      { ownerId: 1 },
      {
        unique: true,
        name: 'one_active_ai_job_per_owner',
        partialFilterExpression: { status: { $in: ['QUEUED', 'GENERATING'] } },
      },
    ),
    c.aiGenerations.createIndex({ status: 1, leaseUntil: 1, createdAt: 1 }),
    c.aiExams.createIndex({ ownerId: 1, createdAt: -1 }),
    c.aiExams.createIndex({ ownerId: 1, requestId: 1 }, { unique: true }),
    c.aiExams.createIndex(
      { ownerId: 1 },
      {
        unique: true,
        name: 'one_active_ai_exam_per_owner',
        partialFilterExpression: { status: { $in: ['QUEUED', 'WORKING'] } },
      },
    ),
    c.aiExams.createIndex({ status: 1, leaseUntil: 1, createdAt: 1 }),
  ]);
}
