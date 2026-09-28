import type { ObjectId } from 'mongodb';

export const activityTypes = [
  'exam_started',
  'tab_changed',
  'returned',
  'window_blur',
  'fullscreen_entered',
  'fullscreen_exited',
  'fullscreen_unavailable',
  'copy_blocked',
  'paste_blocked',
  'exam_submitted',
  'exam_expired',
  'exam_cancelled',
] as const;
export const clientActivityTypes = [
  'tab_changed',
  'returned',
  'window_blur',
  'fullscreen_entered',
  'fullscreen_exited',
  'fullscreen_unavailable',
  'copy_blocked',
  'paste_blocked',
] as const;
export type ActivityType = (typeof activityTypes)[number];
export type ClientActivityType = (typeof clientActivityTypes)[number];
export const activityLimit = 200;

export interface ExamActivity {
  _id: ObjectId;
  runId: ObjectId;
  examId: ObjectId;
  ownerId: ObjectId;
  studentId: ObjectId;
  type: ActivityType;
  at: Date;
  ip: string;
  device: string;
  userAgent: string;
}
