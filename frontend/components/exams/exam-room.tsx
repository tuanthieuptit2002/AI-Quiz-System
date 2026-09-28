'use client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect } from 'react';
import { useAuth } from '../auth-provider';
import { ErrorBox, Loading } from '../ui';
import { useQuery } from '@/lib/use-query';
import type { ExamRun } from '@/lib/exams';
import { ExamPlayer } from './exam-player';

export function ExamRoom({ runId }: { runId: string }) {
  const { user, loading, connectionError, reconnect } = useAuth();
  const router = useRouter();
  const query = useQuery<ExamRun>(user?.role === 'STUDENT' ? `/exams/runs/${runId}` : null);
  const reload = query.reload;
  useEffect(() => {
    if (!query.error) return;
    const timer = setInterval(reload, 5000);
    window.addEventListener('online', reload);
    return () => {
      clearInterval(timer);
      window.removeEventListener('online', reload);
    };
  }, [query.error, reload]);
  if (loading) return <Loading />;
  if (connectionError && !user)
    return (
      <div className="ep-gate">
        <ErrorBox message={connectionError} retry={reconnect} />
        <p>Bản nháp vẫn được giữ trong tab này. Khi có kết nối, bài thi sẽ tự tải lại.</p>
      </div>
    );
  if (!user)
    return (
      <div className="ep-gate">
        <h1>Đăng nhập để tiếp tục bài thi</h1>
        <p>
          Bản nháp trong tab này được giữ lại. Sau khi đăng nhập, mở lại lượt thi từ Bài thi của
          tôi.
        </p>
        <Link className="btn btn-primary" href="/login">
          Đăng nhập
        </Link>
      </div>
    );
  if (user.role !== 'STUDENT')
    return (
      <div className="ep-gate">
        <h1>Phòng thi dành cho Student</h1>
        <Link className="btn btn-secondary" href="/exams">
          Quay lại đề thi
        </Link>
      </div>
    );
  if (query.error && !query.data)
    return (
      <div className="ep-gate">
        <ErrorBox message={query.error} retry={reload} />
        <Link href="/exams">Về bài thi của tôi</Link>
      </div>
    );
  if (!query.data) return <Loading />;
  return (
    <ExamPlayer
      key={`${user.id}-${runId}`}
      ownerId={user.id}
      initial={query.data}
      close={() => router.push('/exams')}
    />
  );
}
