import type { Db } from 'mongodb';
import { collections } from '../database/collections.js';
import { emailIsVerified } from '../models/user.model.js';
import type { EmailJob } from '../models/email.model.js';
import type { Config } from './config.js';
import { sendMail, type MailMessage } from './mail.js';

export type Mailer = (mail: MailMessage, config: Config) => Promise<void>;

/** Wait before retry N (1-based); the job fails after the last one. */
export const retryDelaysMs = [60000, 5 * 60000, 30 * 60000, 2 * 3600000];
const leaseMs = 2 * 60000;
/** Caps SMTP throughput at roughly 120 emails per minute. */
const batchSize = 10;
const tickMs = 5000;

export function composeEmail(job: EmailJob, name: string, config: Config) {
  const url = new URL(job.link, config.frontendUrl).toString();
  return {
    subject: `[QuizSpace] ${job.subject}`,
    text: `Chào ${name},\n\n${job.body}\n\nXem chi tiết: ${url}\n\nEmail được gửi tự động từ QuizSpace vì bạn là học sinh trên hệ thống.`,
  };
}

/** Sends one queued email. Returns false when nothing is due. */
export async function processNextEmail(db: Db, config: Config, mailer: Mailer = sendMail) {
  const c = collections(db);
  const now = new Date();
  const job = await c.emailJobs.findOneAndUpdate(
    {
      $or: [
        { status: 'QUEUED', nextAttemptAt: { $lte: now } },
        { status: 'SENDING', leaseUntil: { $lt: now } },
      ],
    },
    {
      $set: { status: 'SENDING', leaseUntil: new Date(now.getTime() + leaseMs) },
      $inc: { attempts: 1 },
    },
    { sort: { nextAttemptAt: 1 }, returnDocument: 'after' },
  );
  if (!job) return false;
  const finish = (fields: Partial<EmailJob>) =>
    c.emailJobs.updateOne(
      { _id: job._id, status: 'SENDING', attempts: job.attempts },
      { $set: { leaseUntil: null, ...fields } },
    );

  const user = await c.users.findOne(
    { _id: job.userId },
    { projection: { name: 1, email: 1, status: 1, emailVerifiedAt: 1 } },
  );
  if (!user || user.status !== 'ACTIVE' || !emailIsVerified(user)) {
    await finish({
      status: 'SKIPPED',
      error: 'Tài khoản không hoạt động hoặc chưa xác minh email.',
    });
    return true;
  }
  try {
    await mailer({ to: user.email, ...composeEmail(job, user.name, config) }, config);
    await finish({ status: 'SENT', error: '', sentAt: new Date() });
  } catch (error) {
    const delay = retryDelaysMs[job.attempts - 1];
    const reason = (error instanceof Error ? error.message : 'Unknown error').slice(0, 300);
    await finish(
      delay === undefined
        ? { status: 'FAILED', error: reason }
        : { status: 'QUEUED', error: reason, nextAttemptAt: new Date(Date.now() + delay) },
    );
  }
  return true;
}

export function startEmailWorker(db: Db, config: Config, mailer: Mailer = sendMail) {
  let running = false;
  let warned = false;
  const tick = async () => {
    if (running) return;
    if (config.production && !config.smtpHost) {
      if (!warned) console.error('SMTP chưa cấu hình; email thông báo được giữ trong hàng đợi.');
      warned = true;
      return;
    }
    running = true;
    try {
      for (let i = 0; i < batchSize; i++) if (!(await processNextEmail(db, config, mailer))) break;
    } catch {
      console.error('Email worker temporarily unavailable; retrying on next tick.');
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), tickMs).unref();
  void tick();
  return () => clearInterval(timer);
}
