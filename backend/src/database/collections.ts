import type { Db } from 'mongodb';
import type { User } from '../models/user.model.js';
import type { Session } from '../models/session.model.js';
import type { Classroom } from '../models/classroom.model.js';
import type { ExamAttempt } from '../models/exam-attempt.model.js';
import type { Question, QuestionVersion, QuestionImport } from '../models/question.model.js';
import type { Exam, ExamRun } from '../models/exam.model.js';

export function collections(db: Db) {
  return {
    users: db.collection<User>('users'),
    sessions: db.collection<Session>('sessions'),
    classes: db.collection<Classroom>('classes'),
    attempts: db.collection<ExamAttempt>('examAttempts'),
    questions: db.collection<Question>('questions'),
    questionVersions: db.collection<QuestionVersion>('questionVersions'),
    questionImports: db.collection<QuestionImport>('questionImports'),
    exams: db.collection<Exam>('exams'),
    examRuns: db.collection<ExamRun>('examRuns'),
  };
}

export type Collections = ReturnType<typeof collections>;
