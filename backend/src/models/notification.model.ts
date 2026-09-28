import type { ObjectId } from 'mongodb';

export const notificationTypes = [
  'EXAM_STARTING',
  'DEADLINE_SOON',
  'NEW_EXAM',
  'RESULT_READY',
  'TEACHER_FEEDBACK',
  'EXAM_COMPLETED',
] as const;
export type NotificationType = (typeof notificationTypes)[number];

/** `key` is unique per user so the same event never notifies twice. */
export interface Notification {
  _id: ObjectId;
  userId: ObjectId;
  type: NotificationType;
  key: string;
  title: string;
  body: string;
  link: string;
  count: number;
  readAt: Date | null;
  createdAt: Date;
}

/** Remembers reminder batches already sent so the clock does not recompute audiences. */
export interface NotificationMark {
  _id: string;
  createdAt: Date;
}

export const notificationDto = (n: Notification) => ({
  id: n._id.toHexString(),
  type: n.type,
  title: n.title,
  body: n.body,
  link: n.link,
  read: !!n.readAt,
  createdAt: n.createdAt,
});
