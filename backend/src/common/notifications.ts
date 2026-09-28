import { MongoBulkWriteError, ObjectId, type Db } from 'mongodb';
import { collections, type Collections } from '../database/collections.js';
import type { Assignment, Classroom } from '../models/classroom.model.js';
import type { Exam, ExamRun } from '../models/exam.model.js';
import {
  emailedTypes,
  type Notification,
  type NotificationType,
} from '../models/notification.model.js';
import type { EmailJob } from '../models/email.model.js';

export const startLeadMs = 30 * 60000;
export const deadlineLeadMs = 24 * 3600000;

const timeFormat = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh',
  hour: '2-digit',
  minute: '2-digit',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});
export const formatTime = (date: Date) => timeFormat.format(date);

type Message = { type: NotificationType; key: string; title: string; body: string; link: string };

/** Indexes of documents rejected as duplicates; rethrows any other write failure. */
function duplicateIndexes(error: unknown) {
  if (!(error instanceof MongoBulkWriteError)) throw error;
  const errors = Array.isArray(error.writeErrors) ? error.writeErrors : [error.writeErrors];
  if (!errors.every((e) => e.code === 11000)) throw error;
  return new Set(errors.map((e) => e.index));
}

async function insertNew<T extends { _id: ObjectId }>(
  insert: (docs: T[]) => Promise<unknown>,
  docs: T[],
) {
  try {
    await insert(docs);
    return docs;
  } catch (error) {
    const skipped = duplicateIndexes(error);
    return docs.filter((_, index) => !skipped.has(index));
  }
}

/** Delivers one message per user; users who already received `key` are skipped. */
export async function notify(c: Collections, userIds: ObjectId[], message: Message) {
  const ids = unique(userIds);
  const createdAt = new Date();
  for (let i = 0; i < ids.length; i += 1000) {
    const docs: Notification[] = ids.slice(i, i + 1000).map((userId) => ({
      _id: new ObjectId(),
      userId,
      ...message,
      count: 1,
      readAt: null,
      createdAt,
    }));
    const delivered = await insertNew(
      (batch) => c.notifications.insertMany(batch, { ordered: false }),
      docs,
    );
    if (!delivered.length || !emailedTypes.includes(message.type)) continue;
    const jobs: EmailJob[] = delivered.map((n) => ({
      _id: new ObjectId(),
      userId: n.userId,
      key: message.key,
      subject: message.title,
      body: message.body,
      link: message.link,
      status: 'QUEUED',
      attempts: 0,
      nextAttemptAt: createdAt,
      leaseUntil: null,
      error: '',
      createdAt,
      sentAt: null,
    }));
    await insertNew((batch) => c.emailJobs.insertMany(batch, { ordered: false }), jobs);
  }
}

/** Notifications never block the action that triggered them. */
export async function safely(task: () => Promise<unknown>) {
  try {
    await task();
  } catch {
    console.error('Notification delivery failed.');
  }
}

function unique(ids: ObjectId[]) {
  const seen = new Map<string, ObjectId>();
  for (const id of ids) seen.set(id.toHexString(), id);
  return [...seen.values()];
}

async function activeStudents(c: Collections, ids: ObjectId[]) {
  if (!ids.length) return [];
  const users = await c.users
    .find(
      { _id: { $in: unique(ids) }, role: 'STUDENT', status: 'ACTIVE' },
      { projection: { _id: 1 } },
    )
    .toArray();
  return users.map((u) => u._id);
}

async function classStudents(c: Collections, classIds: ObjectId[]) {
  if (!classIds.length) return [];
  const classes = await c.classes
    .find({ _id: { $in: classIds } }, { projection: { studentIds: 1 } })
    .toArray();
  return classes.flatMap((cl) => cl.studentIds);
}

/** Students allowed to take the exam: open access, direct access, audience classes or assignments. */
export async function examAudience(c: Collections, exam: Pick<Exam, '_id' | 'settings'>) {
  if (exam.settings.access === 'ALL') {
    const users = await c.users
      .find({ role: 'STUDENT', status: 'ACTIVE' }, { projection: { _id: 1 } })
      .toArray();
    return users.map((u) => u._id);
  }
  const assigned = await c.assignments
    .find({ examId: exam._id }, { projection: { classId: 1 } })
    .toArray();
  const classIds = [...exam.settings.classIds, ...assigned.map((a) => a.classId)];
  return activeStudents(c, [...exam.settings.studentIds, ...(await classStudents(c, classIds))]);
}

async function submitted(c: Collections, examId: ObjectId) {
  const runs = await c.examRuns
    .find(
      { examId, status: { $in: ['SUBMITTED', 'PENDING_REVIEW'] } },
      { projection: { studentId: 1 } },
    )
    .toArray();
  return new Set(runs.map((run) => run.studentId.toHexString()));
}

export async function notifyNewExam(c: Collections, exam: Exam) {
  const { startsAt, endsAt } = exam.settings;
  const schedule = [
    startsAt && startsAt > new Date() ? `bắt đầu lúc ${formatTime(startsAt)}` : '',
    endsAt ? `kết thúc lúc ${formatTime(endsAt)}` : '',
  ].filter(Boolean);
  await notify(c, await examAudience(c, exam), {
    type: 'NEW_EXAM',
    key: `new:${exam._id}`,
    title: 'Có bài thi mới',
    body: `"${exam.title}" đã được phát hành${schedule.length ? `, ${schedule.join(', ')}` : ''}.`,
    link: `/exams?exam=${exam._id}`,
  });
}

export async function notifyAssignment(
  c: Collections,
  classroom: Classroom,
  exam: Exam,
  assignment: Assignment,
) {
  await notify(c, await activeStudents(c, classroom.studentIds), {
    type: 'NEW_EXAM',
    key: `assigned:${assignment._id}`,
    title: 'Có bài mới trong lớp',
    body: `Lớp "${classroom.name}" vừa giao ${assignment.kind === 'QUIZ' ? 'bài kiểm tra' : 'bài thi'} "${exam.title}", hạn nộp ${formatTime(assignment.dueAt)}.`,
    link: `/classes/${classroom._id}`,
  });
}

/** Called once a run leaves RUNNING; `auto` means the clock submitted it. */
export async function notifyRunFinished(c: Collections, run: ExamRun, auto: boolean) {
  if (run.status !== 'SUBMITTED' && run.status !== 'PENDING_REVIEW') return;
  // One unread card per exam: repeated submissions bump it instead of flooding the teacher.
  const name = { $literal: run.studentName };
  await c.notifications.updateOne(
    { userId: run.ownerId, key: `completed:${run.examId}` },
    [
      {
        $set: {
          count: {
            $cond: [
              { $eq: [{ $ifNull: ['$readAt', null] }, null] },
              { $add: [{ $ifNull: ['$count', 0] }, 1] },
              1,
            ],
          },
        },
      },
      {
        $set: {
          type: 'EXAM_COMPLETED',
          title: 'Học sinh hoàn thành bài thi',
          body: {
            $cond: [
              { $gt: ['$count', 1] },
              {
                $concat: [
                  name,
                  ' và ',
                  { $toString: { $subtract: ['$count', 1] } },
                  { $literal: ` học sinh khác đã nộp bài "${run.title}".` },
                ],
              },
              { $concat: [name, { $literal: ` đã nộp bài "${run.title}".` }] },
            ],
          },
          link: { $literal: `/exams?submissions=${run.examId}` },
          readAt: null,
          createdAt: new Date(),
        },
      },
    ],
    { upsert: true },
  );
  if (auto && run.status === 'SUBMITTED')
    await notify(c, [run.studentId], {
      type: 'RESULT_READY',
      key: `result:${run._id}`,
      title: 'Đã có kết quả',
      body: `Bài "${run.title}" đã được tự động nộp khi hết giờ, đạt ${run.scorePercent}%.`,
      link: `/exam/${run._id}`,
    });
}

/** `feedback` is true when the teacher wrote new comments the student is allowed to see. */
export async function notifyGraded(
  c: Collections,
  previous: ExamRun['status'],
  run: ExamRun,
  reviewer: string,
  feedback: boolean,
) {
  if (previous === 'PENDING_REVIEW' && run.status === 'SUBMITTED') {
    await notify(c, [run.studentId], {
      type: 'RESULT_READY',
      key: `result:${run._id}`,
      title: 'Đã có kết quả',
      body: `Bài "${run.title}" đã được chấm xong, đạt ${run.scorePercent}%.${feedback ? ' Giáo viên có nhận xét cho bài làm.' : ''}`,
      link: `/exam/${run._id}`,
    });
    return;
  }
  if (feedback)
    await notify(c, [run.studentId], {
      type: 'TEACHER_FEEDBACK',
      key: `feedback:${run._id}:${run.revision}`,
      title: 'Giáo viên đã nhận xét',
      body: `${reviewer} vừa nhận xét bài "${run.title}".`,
      link: `/exam/${run._id}`,
    });
}

async function unmarked(c: Collections, keys: string[]) {
  if (!keys.length) return new Set<string>();
  const marks = await c.notificationMarks.find({ _id: { $in: keys } }).toArray();
  const done = new Set(marks.map((m) => m._id));
  return new Set(keys.filter((key) => !done.has(key)));
}

async function mark(c: Collections, key: string) {
  await c.notificationMarks.updateOne(
    { _id: key },
    { $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );
}

const examFields = { projection: { title: 1, status: 1, settings: 1, updatedAt: 1 } };

/**
 * Sends "starting soon" and "deadline soon" reminders. Items published or assigned after the
 * reminder window opened are skipped because their first notification already shows the time.
 */
export async function sendReminders(c: Collections, now = new Date()) {
  const soon = new Date(now.getTime() + startLeadMs);
  const day = new Date(now.getTime() + deadlineLeadMs);
  const [starting, closing, due] = await Promise.all([
    c.exams
      .find({ status: 'PUBLISHED', 'settings.startsAt': { $gt: now, $lte: soon } }, examFields)
      .limit(500)
      .toArray(),
    c.exams
      .find({ status: 'PUBLISHED', 'settings.endsAt': { $gt: now, $lte: day } }, examFields)
      .limit(500)
      .toArray(),
    c.assignments
      .find({ dueAt: { $gt: now, $lte: day } })
      .limit(500)
      .toArray(),
  ]);

  const startKeys = await unmarked(
    c,
    starting.map((e) => `starting:${e._id}`),
  );
  for (const exam of starting) {
    const key = `starting:${exam._id}`;
    const startsAt = exam.settings.startsAt!;
    if (!startKeys.has(key)) continue;
    if (exam.updatedAt.getTime() <= startsAt.getTime() - startLeadMs)
      await notify(c, await examAudience(c, exam), {
        type: 'EXAM_STARTING',
        key,
        title: 'Bài thi sắp bắt đầu',
        body: `"${exam.title}" bắt đầu lúc ${formatTime(startsAt)}.`,
        link: `/exams?exam=${exam._id}`,
      });
    await mark(c, key);
  }

  const closeKeys = await unmarked(
    c,
    closing.map((e) => `closing:${e._id}`),
  );
  for (const exam of closing) {
    const key = `closing:${exam._id}`;
    const { startsAt, endsAt } = exam.settings;
    if (!closeKeys.has(key)) continue;
    const opensLong = !startsAt || endsAt!.getTime() - startsAt.getTime() > deadlineLeadMs;
    if (opensLong && exam.updatedAt.getTime() <= endsAt!.getTime() - deadlineLeadMs) {
      const done = await submitted(c, exam._id);
      const students = (await examAudience(c, exam)).filter((id) => !done.has(id.toHexString()));
      await notify(c, students, {
        type: 'DEADLINE_SOON',
        key,
        title: 'Sắp hết hạn làm bài',
        body: `"${exam.title}" đóng lúc ${formatTime(endsAt!)}. Bạn chưa nộp bài.`,
        link: `/exams?exam=${exam._id}`,
      });
    }
    await mark(c, key);
  }

  const dueKey = (a: Assignment) => `deadline:${a._id}:${a.dueAt.getTime()}`;
  const dueKeys = await unmarked(c, due.map(dueKey));
  const pending = due.filter((a) => dueKeys.has(dueKey(a)));
  const [exams, classes] = await Promise.all([
    c.exams
      .find({ _id: { $in: pending.map((a) => a.examId) }, status: 'PUBLISHED' }, examFields)
      .toArray(),
    c.classes
      .find(
        { _id: { $in: pending.map((a) => a.classId) } },
        { projection: { name: 1, studentIds: 1 } },
      )
      .toArray(),
  ]);
  for (const assignment of pending) {
    const exam = exams.find((e) => e._id.equals(assignment.examId));
    const classroom = classes.find((cl) => cl._id.equals(assignment.classId));
    if (
      exam &&
      classroom &&
      assignment.createdAt.getTime() <= assignment.dueAt.getTime() - deadlineLeadMs
    ) {
      const done = await submitted(c, exam._id);
      const students = (await activeStudents(c, classroom.studentIds)).filter(
        (id) => !done.has(id.toHexString()),
      );
      await notify(c, students, {
        type: 'DEADLINE_SOON',
        key: dueKey(assignment),
        title: 'Sắp hết hạn nộp bài',
        body: `"${exam.title}" của lớp "${classroom.name}" hết hạn lúc ${formatTime(assignment.dueAt)}. Bạn chưa nộp bài.`,
        link: `/classes/${classroom._id}`,
      });
    }
    await mark(c, dueKey(assignment));
  }
}

export function startNotificationClock(db: Db) {
  const c = collections(db);
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      await sendReminders(c);
    } catch {
      console.error('Notification reminders failed; retrying on next tick.');
    } finally {
      busy = false;
    }
  };
  void tick();
  const interval = setInterval(() => {
    void tick();
  }, 60000).unref();
  return () => clearInterval(interval);
}
