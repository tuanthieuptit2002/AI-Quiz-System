'use client';
import { ScrollText } from 'lucide-react';
import { useQuery } from '@/lib/use-query';
import { ErrorBox, Loading } from '../ui';

type ActivityType =
  | 'exam_started'
  | 'tab_changed'
  | 'returned'
  | 'window_blur'
  | 'fullscreen_entered'
  | 'fullscreen_exited'
  | 'fullscreen_unavailable'
  | 'copy_blocked'
  | 'paste_blocked'
  | 'exam_submitted'
  | 'exam_expired'
  | 'exam_cancelled';

interface ActivityLog {
  secure: boolean;
  truncated: boolean;
  note: string;
  session: { ip: string; device: string; userAgent: string; at: string } | null;
  leave?: { count: number; limit: number; cancelled: boolean };
  counts: Record<string, number>;
  events: {
    id: string;
    type: ActivityType;
    label: string;
    at: string;
    ip: string;
    device: string;
  }[];
}

const clock = new Intl.DateTimeFormat('vi-VN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
  timeZone: 'Asia/Ho_Chi_Minh',
});

export function ExamActivityLog({ examId, runId }: { examId: string; runId: string }) {
  const log = useQuery<ActivityLog>(`/exams/${examId}/submissions/${runId}/activity`);
  if (log.loading) return <Loading />;
  if (log.error || !log.data) return <ErrorBox message={log.error} retry={log.reload} />;
  const data = log.data;
  const signals = [
    ['Rời tab', data.counts.tab_changed || 0],
    ['Rời cửa sổ', data.counts.window_blur || 0],
    ['Thoát toàn màn hình', data.counts.fullscreen_exited || 0],
    ['Chặn dán', data.counts.paste_blocked || 0],
  ] as const;
  return (
    <section className="panel activity-log">
      <div className="panel-heading">
        <div>
          <h2>
            <ScrollText size={18} /> Nhật ký phòng thi
          </h2>
          <p>{data.note}</p>
        </div>
      </div>
      {data.secure && data.leave && (
        <p className="activity-session">
          Rời trang {data.leave.count}/{data.leave.limit}
          {data.leave.cancelled ? ' · Đã kết thúc vì vượt số lần cho phép' : ''}
        </p>
      )}
      {data.session && (
        <p className="activity-session">
          Thiết bị {data.session.device || 'không rõ'}
          {data.session.ip ? ` · IP ${data.session.ip}` : ''}
          {data.secure ? ' · Giám sát đang bật' : ' · Đề không bật giám sát rời tab'}
        </p>
      )}
      <div className="activity-counts">
        {signals.map(([label, count]) => (
          <span key={label}>
            <b>{count}</b> {label}
          </span>
        ))}
      </div>
      {!data.events.length ? (
        <p className="activity-empty">
          Lượt thi này chưa có sự kiện. Nhật ký bắt đầu từ các lượt thi mới.
        </p>
      ) : (
        <ol>
          {data.events.map((event) => (
            <li key={event.id}>
              <time dateTime={event.at}>{clock.format(new Date(event.at))}</time>
              <span>{event.label}</span>
              {event.device && event.type === 'exam_started' ? <small>{event.device}</small> : null}
            </li>
          ))}
        </ol>
      )}
      {data.truncated && (
        <p className="activity-empty">
          Nhật ký đã đủ 200 sự kiện giám sát. Các sự kiện sau không được thêm.
        </p>
      )}
    </section>
  );
}
