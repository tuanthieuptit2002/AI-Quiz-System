import type { Request } from 'express';
import { ObjectId, type ClientSession, type Db } from 'mongodb';
import { collections } from '../database/collections.js';
import {
  activityLimit,
  clientActivityTypes,
  type ActivityType,
  type ClientActivityType,
  type ExamActivity,
} from '../models/exam-activity.model.js';
import type { ExamRun } from '../models/exam.model.js';

const labels: Record<ActivityType, string> = {
  exam_started: 'Bắt đầu làm bài',
  tab_changed: 'Rời tab',
  returned: 'Quay lại trang thi',
  window_blur: 'Rời cửa sổ',
  fullscreen_entered: 'Vào toàn màn hình',
  fullscreen_exited: 'Thoát toàn màn hình',
  fullscreen_unavailable: 'Trình duyệt không bật được toàn màn hình',
  copy_blocked: 'Chặn sao chép',
  paste_blocked: 'Chặn dán',
  exam_submitted: 'Nộp bài',
  exam_expired: 'Hết giờ, chưa nộp',
  exam_cancelled: 'Kết thúc vì rời trang quá số lần',
};

export function deviceLabel(userAgent: string) {
  const ua = userAgent.slice(0, 400);
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
      ? 'Chrome'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Trình duyệt khác';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Mac OS|Macintosh/.test(ua)
      ? 'macOS'
      : /Android/.test(ua)
        ? 'Android'
        : /iPhone|iPad/.test(ua)
          ? 'iOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : '';
  return { userAgent: ua, device: [browser, os].filter(Boolean).join(' · ') };
}

export function clientContext(req: Request) {
  const forwarded = req.get('user-agent') || '';
  return { ip: (req.ip || '').slice(0, 80), ...deviceLabel(forwarded) };
}

export async function recordExamActivity(
  db: Db,
  run: Pick<ExamRun, '_id' | 'examId' | 'ownerId' | 'studentId' | 'settings'>,
  type: ActivityType,
  context: { ip?: string; userAgent?: string; device?: string } = {},
  session?: ClientSession,
) {
  const client = (clientActivityTypes as readonly string[]).includes(type);
  if (client && run.settings.secure !== true) return false;
  const c = collections(db);
  if (client) {
    const count = await c.examActivity.countDocuments(
      { runId: run._id, type: { $in: [...clientActivityTypes] } },
      { session },
    );
    if (count >= activityLimit) return false;
  }
  const described = deviceLabel(context.userAgent || '');
  const event: ExamActivity = {
    _id: new ObjectId(),
    runId: run._id,
    examId: run.examId,
    ownerId: run.ownerId,
    studentId: run.studentId,
    type,
    at: new Date(),
    ip: (context.ip || '').slice(0, 80),
    device: context.device || (context.userAgent ? described.device : 'Máy chủ'),
    userAgent: described.userAgent,
  };
  await c.examActivity.insertOne(event, { session });
  return true;
}

export function activityView(
  events: ExamActivity[],
  secure: boolean,
  truncated: boolean,
  leaveLimit = 3,
) {
  const counts = Object.fromEntries(clientActivityTypes.map((type) => [type, 0])) as Record<
    ClientActivityType,
    number
  >;
  for (const event of events) {
    if ((clientActivityTypes as readonly string[]).includes(event.type))
      counts[event.type as ClientActivityType] += 1;
  }
  const started = events.find((event) => event.type === 'exam_started');
  const leaves = counts.tab_changed + counts.window_blur;
  return {
    secure,
    truncated,
    leave: {
      count: leaves,
      limit: leaveLimit,
      cancelled: events.some((event) => event.type === 'exam_cancelled'),
    },
    note: 'Nhật ký chỉ ghi sự kiện. Một tín hiệu chưa đủ để kết luận gian lận.',
    session: started
      ? { ip: started.ip, device: started.device, userAgent: started.userAgent, at: started.at }
      : null,
    counts,
    events: events.map((event) => ({
      id: event._id.toHexString(),
      type: event.type,
      label: labels[event.type],
      at: event.at,
      ip: event.ip,
      device: event.device,
    })),
  };
}
