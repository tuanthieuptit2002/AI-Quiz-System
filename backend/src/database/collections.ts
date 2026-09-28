import type { Db } from 'mongodb';
import type { User } from '../models/user.model.js';
import type { Session } from '../models/session.model.js';
import type { Assignment, Classroom, Course, Lesson } from '../models/classroom.model.js';
import type { ExamAttempt } from '../models/exam-attempt.model.js';
import type { Question, QuestionVersion, QuestionImport } from '../models/question.model.js';
import type { Exam, ExamRun } from '../models/exam.model.js';
import type { AIExamJob } from '../models/ai-exam.model.js';
import type { AIGeneration } from '../models/ai-generation.model.js';
import type { GradingSuggestion, GradingEvent } from '../models/grading.model.js';
import type { ExplanationThread } from '../models/explanation.model.js';
import type { LearningReport } from '../models/learning.model.js';
import type { PracticeSession } from '../models/practice.model.js';
import type { ExamActivity } from '../models/exam-activity.model.js';
import type { Notification, NotificationMark } from '../models/notification.model.js';
import type { EmailJob } from '../models/email.model.js';

export function collections(db: Db) {
  return {
    users: db.collection<User>('users'),
    sessions: db.collection<Session>('sessions'),
    classes: db.collection<Classroom>('classes'),
    courses: db.collection<Course>('courses'),
    lessons: db.collection<Lesson>('lessons'),
    assignments: db.collection<Assignment>('assignments'),
    attempts: db.collection<ExamAttempt>('examAttempts'),
    questions: db.collection<Question>('questions'),
    questionVersions: db.collection<QuestionVersion>('questionVersions'),
    questionImports: db.collection<QuestionImport>('questionImports'),
    exams: db.collection<Exam>('exams'),
    examRuns: db.collection<ExamRun>('examRuns'),
    examActivity: db.collection<ExamActivity>('examActivity'),
    aiGenerations: db.collection<AIGeneration>('aiGenerations'),
    aiExams: db.collection<AIExamJob>('aiExams'),
    gradingSuggestions: db.collection<GradingSuggestion>('gradingSuggestions'),
    gradingEvents: db.collection<GradingEvent>('gradingEvents'),
    explanationThreads: db.collection<ExplanationThread>('explanationThreads'),
    learningReports: db.collection<LearningReport>('learningReports'),
    practiceSessions: db.collection<PracticeSession>('practiceSessions'),
    notifications: db.collection<Notification>('notifications'),
    notificationMarks: db.collection<NotificationMark>('notificationMarks'),
    emailJobs: db.collection<EmailJob>('emailJobs'),
  };
}

export type Collections = ReturnType<typeof collections>;
