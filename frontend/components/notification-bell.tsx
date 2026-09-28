'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Award,
  Bell,
  CheckCheck,
  ClipboardList,
  Clock3,
  Hourglass,
  MessageSquareText,
  UserCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import {
  timeAgo,
  type AppNotification,
  type NotificationPage,
  type NotificationType,
} from '@/lib/notifications';
import { Spinner } from './ui';

const kinds: Record<NotificationType, { icon: typeof Bell; tone: string }> = {
  EXAM_STARTING: { icon: Clock3, tone: 'blue' },
  DEADLINE_SOON: { icon: Hourglass, tone: 'amber' },
  NEW_EXAM: { icon: ClipboardList, tone: 'green' },
  RESULT_READY: { icon: Award, tone: 'violet' },
  TEACHER_FEEDBACK: { icon: MessageSquareText, tone: 'teal' },
  EXAM_COMPLETED: { icon: UserCheck, tone: 'green' },
};
const pageSize = 15;

export function NotificationBell() {
  const router = useRouter();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());
  const loadedItems = useRef<AppNotification[]>([]);
  useEffect(() => {
    loadedItems.current = items;
  }, [items]);

  const refresh = useCallback(async () => {
    try {
      const page = await api<NotificationPage>(`/notifications?limit=${pageSize}`);
      const fresh = new Set(page.notifications.map((n) => n.id));
      const last = page.notifications.at(-1);
      // Keep pages loaded with "Xem thêm" when polling refreshes the newest ones.
      const older = last
        ? loadedItems.current.filter((n) => !fresh.has(n.id) && n.createdAt < last.createdAt)
        : [];
      setItems([...page.notifications, ...older]);
      if (!older.length) setHasMore(page.hasMore);
      setUnread(page.unread);
      setError('');
      setNow(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 30000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  function toggle() {
    if (!open) void refresh();
    setOpen(!open);
  }
  function openItem(item: AppNotification) {
    setOpen(false);
    if (!item.read) {
      setItems((list) => list.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      setUnread((count) => Math.max(0, count - 1));
      api<{ unread: number }>(`/notifications/${item.id}/read`, { method: 'POST' })
        .then((result) => setUnread(result.unread))
        .catch(() => undefined);
    }
    router.push(item.link);
  }
  async function readAll() {
    setBusy(true);
    try {
      await api('/notifications/read-all', { method: 'POST' });
      setItems((list) => list.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function more() {
    const last = items.at(-1);
    if (!last) return;
    setBusy(true);
    try {
      const page = await api<NotificationPage>(
        `/notifications?limit=${pageSize}&before=${last.id}`,
      );
      setItems((list) => {
        const known = new Set(list.map((n) => n.id));
        return [...list, ...page.notifications.filter((n) => !known.has(n.id))];
      });
      setHasMore(page.hasMore);
      setUnread(page.unread);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="notif" ref={box}>
      <button
        className={`notif-trigger ${open ? 'active' : ''}`}
        onClick={toggle}
        aria-label={unread ? `Thông báo, ${unread} chưa đọc` : 'Thông báo'}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell size={18} />
        {unread > 0 && <span className="notif-badge">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Thông báo">
          <div className="notif-head">
            <div>
              <b>Thông báo</b>
              <small>{unread ? `${unread} chưa đọc` : 'Bạn đã xem hết thông báo'}</small>
            </div>
            <button className="notif-read-all" onClick={readAll} disabled={!unread || busy}>
              <CheckCheck size={15} /> Đọc tất cả
            </button>
          </div>
          {error && items.length > 0 && <p className="notif-error">{error}</p>}
          <div className="notif-list">
            {!loaded ? (
              <div className="notif-empty">
                <Spinner />
              </div>
            ) : error && !items.length ? (
              <div className="notif-empty">
                <p>{error}</p>
              </div>
            ) : !items.length ? (
              <div className="notif-empty">
                <span className="notif-empty-icon">
                  <Bell size={22} />
                </span>
                <b>Chưa có thông báo</b>
                <p>Bài thi mới, hạn nộp và kết quả sẽ xuất hiện ở đây.</p>
              </div>
            ) : (
              items.map((item) => {
                const { icon: Icon, tone } = kinds[item.type];
                return (
                  <button
                    key={item.id}
                    className={`notif-item ${item.read ? '' : 'unread'}`}
                    onClick={() => openItem(item)}
                  >
                    <span className={`notif-icon ${tone}`}>
                      <Icon size={17} />
                    </span>
                    <span className="notif-text">
                      <b>{item.title}</b>
                      <span>{item.body}</span>
                      <small>{timeAgo(item.createdAt, now)}</small>
                    </span>
                    {!item.read && <i className="notif-dot" aria-label="Chưa đọc" />}
                  </button>
                );
              })
            )}
            {hasMore && items.length > 0 && (
              <button className="notif-more" onClick={more} disabled={busy}>
                {busy ? <Spinner /> : 'Xem thêm'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
