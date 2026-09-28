import type { ObjectId } from 'mongodb';

/**
 * One queued email per notification. `key` mirrors the notification key so an event is mailed at
 * most once per user. The address is resolved when sending, so email changes and locks apply.
 */
export interface EmailJob {
  _id: ObjectId;
  userId: ObjectId;
  key: string;
  subject: string;
  body: string;
  link: string;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'SKIPPED' | 'FAILED';
  attempts: number;
  nextAttemptAt: Date;
  leaseUntil: Date | null;
  error: string;
  createdAt: Date;
  sentAt: Date | null;
}
