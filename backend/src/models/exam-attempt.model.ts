import type { ObjectId } from 'mongodb';

export interface ExamAttempt {
  _id: ObjectId;
  studentId: ObjectId;
  title: string;
  subject: string;
  score: number;
  durationSeconds: number;
  submittedAt: Date;
}
