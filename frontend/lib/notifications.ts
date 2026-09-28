export type NotificationType =
  | 'EXAM_STARTING'
  | 'DEADLINE_SOON'
  | 'NEW_EXAM'
  | 'RESULT_READY'
  | 'TEACHER_FEEDBACK'
  | 'EXAM_COMPLETED';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface NotificationPage {
  notifications: AppNotification[];
  unread: number;
  hasMore: boolean;
}

export function timeAgo(value: string, now = Date.now()) {
  const minutes = Math.floor((now - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'Vừa xong';
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} ngày trước`;
  return new Date(value).toLocaleDateString('vi-VN');
}
