'use client';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Maximize2 } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { Modal } from '../ui';

type ClientActivity =
  | 'tab_changed'
  | 'returned'
  | 'window_blur'
  | 'fullscreen_entered'
  | 'fullscreen_exited'
  | 'fullscreen_unavailable'
  | 'copy_blocked'
  | 'paste_blocked';

type ActivityReply = {
  accepted: boolean;
  violations?: number;
  limit?: number;
  terminated?: boolean;
  warning?: boolean;
};

export type LeaveWarning =
  { kind: 'counted'; count: number; limit: number } | { kind: 'unrecorded' };

const subscribeFullscreen = (onChange: () => void) => {
  document.addEventListener('fullscreenchange', onChange);
  return () => document.removeEventListener('fullscreenchange', onChange);
};
const fullscreenNow = () => !!document.fullscreenElement;
const leaveEvent = (type: ClientActivity) => type === 'tab_changed' || type === 'window_blur';

export function useExamGuard(runId: string, enabled: boolean, onEnded?: () => void) {
  const fullscreen = useSyncExternalStore(subscribeFullscreen, fullscreenNow, () => false);
  const [unavailable, setUnavailable] = useState(false);
  const [warning, setWarning] = useState<LeaveWarning | null>(null);
  const [ended, setEnded] = useState(false);
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let away: 'tab' | 'blur' | null = null;
    let blurTimer = 0;
    let fullscreenOn = !!document.fullscreenElement;
    const lastSent = new Map<ClientActivity, number>();
    const send = (type: ClientActivity) => {
      const now = Date.now();
      if (now - (lastSent.get(type) || 0) < 1500) return;
      lastSent.set(type, now);
      void api<ActivityReply>(`/exams/runs/${runId}/activity`, {
        method: 'POST',
        body: jsonBody({ type }),
        keepalive: true,
      })
        .then((body) => {
          if (!active) return;
          if (body.terminated) {
            setWarning(null);
            setEnded(true);
            onEndedRef.current?.();
            return;
          }
          if (!leaveEvent(type) || !body.warning || !body.violations) return;
          setWarning({ kind: 'counted', count: body.violations, limit: body.limit || 3 });
        })
        .catch(() => {
          if (active && leaveEvent(type)) setWarning({ kind: 'unrecorded' });
        });
    };
    const onVisibility = () => {
      window.clearTimeout(blurTimer);
      if (document.visibilityState === 'hidden') {
        if (!away) {
          away = 'tab';
          send('tab_changed');
        }
        return;
      }
      if (away) {
        away = null;
        send('returned');
      }
    };
    const onBlur = () => {
      blurTimer = window.setTimeout(() => {
        if (document.visibilityState === 'hidden' || away) return;
        away = 'blur';
        send('window_blur');
      }, 400);
    };
    const onFocus = () => {
      window.clearTimeout(blurTimer);
      if (away === 'blur') {
        away = null;
        send('returned');
      }
    };
    const onFullscreen = () => {
      const activeNow = !!document.fullscreenElement;
      if (activeNow && !fullscreenOn) send('fullscreen_entered');
      if (!activeNow && fullscreenOn) send('fullscreen_exited');
      fullscreenOn = activeNow;
    };
    const blockCopy = (event: Event) => {
      event.preventDefault();
      send('copy_blocked');
    };
    const blockPaste = (event: Event) => {
      event.preventDefault();
      send('paste_blocked');
    };
    const blockMenu = (event: Event) => event.preventDefault();
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'c' || key === 'x') {
        event.preventDefault();
        send('copy_blocked');
      }
      if (key === 'v') {
        event.preventDefault();
        send('paste_blocked');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('fullscreenchange', onFullscreen);
    document.addEventListener('copy', blockCopy);
    document.addEventListener('cut', blockCopy);
    document.addEventListener('paste', blockPaste);
    document.addEventListener('contextmenu', blockMenu);
    document.addEventListener('keydown', onKey);
    return () => {
      active = false;
      window.clearTimeout(blurTimer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('fullscreenchange', onFullscreen);
      document.removeEventListener('copy', blockCopy);
      document.removeEventListener('cut', blockCopy);
      document.removeEventListener('paste', blockPaste);
      document.removeEventListener('contextmenu', blockMenu);
      document.removeEventListener('keydown', onKey);
    };
  }, [enabled, runId]);
  async function enterFullscreen() {
    const root = document.documentElement;
    if (!root.requestFullscreen) {
      setUnavailable(true);
      void api(`/exams/runs/${runId}/activity`, {
        method: 'POST',
        body: jsonBody({ type: 'fullscreen_unavailable' }),
      }).catch(() => {});
      return;
    }
    try {
      await root.requestFullscreen();
      setUnavailable(false);
    } catch {
      setUnavailable(true);
      void api(`/exams/runs/${runId}/activity`, {
        method: 'POST',
        body: jsonBody({ type: 'fullscreen_unavailable' }),
      }).catch(() => {});
    }
  }
  return {
    fullscreen,
    unavailable,
    enterFullscreen,
    warning,
    dismiss: () => setWarning(null),
    ended,
  };
}

export function ExamLeaveDialog({
  warning,
  dismiss,
}: {
  warning: LeaveWarning | null;
  dismiss: () => void;
}) {
  if (!warning) return null;
  const counted = warning.kind === 'counted';
  const last = counted && warning.count >= warning.limit;
  return (
    <Modal
      title="Cảnh báo rời trang thi"
      description={
        counted ? `Lần ${warning.count}/${warning.limit}` : 'Chưa ghi nhận được lên máy chủ'
      }
      close={dismiss}
    >
      <p>
        {counted
          ? last
            ? 'Bạn vừa chuyển tab hoặc rời khỏi trang web. Đây là lần cuối được phép. Lần rời trang tiếp theo sẽ hủy bài và kết thúc lượt thi.'
            : `Bạn vừa chuyển tab hoặc rời khỏi trang web. Còn ${warning.limit - warning.count} lần. Nếu vượt quá, bài thi sẽ bị hủy và kết thúc.`
          : 'Bạn vừa rời khỏi trang web. Máy chủ chưa ghi nhận được lần này. Hãy ở lại trang thi. Nếu vượt số lần cho phép, bài sẽ bị hủy.'}
      </p>
      <div className="modal-actions">
        <button className="btn btn-primary" onClick={dismiss}>
          Tiếp tục làm bài
        </button>
      </div>
    </Modal>
  );
}

export function ExamGuardBanner({
  fullscreen,
  unavailable,
  enter,
  leaveLimit,
}: {
  fullscreen: boolean;
  unavailable: boolean;
  enter: () => void;
  leaveLimit: number;
}) {
  if (fullscreen) return null;
  return (
    <div className="ep-banner ep-banner-warning" role="status">
      <Maximize2 size={19} />
      <span>
        {unavailable
          ? `Trình duyệt không vào được toàn màn hình. Bạn vẫn làm bài được. Rời tab hoặc rời khỏi trang web quá ${leaveLimit} lần sẽ hủy và kết thúc bài thi.`
          : `Phòng thi yêu cầu toàn màn hình. Rời tab hoặc rời khỏi trang web sẽ hiện cảnh báo. Quá ${leaveLimit} lần, bài thi bị hủy và kết thúc. Sao chép và dán bị chặn.`}
      </span>
      {!unavailable && (
        <button className="btn btn-secondary small" onClick={enter}>
          Toàn màn hình
        </button>
      )}
    </div>
  );
}
