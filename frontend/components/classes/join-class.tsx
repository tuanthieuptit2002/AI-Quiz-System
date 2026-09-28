'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BookOpen, CheckCircle2 } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { pendingJoinKey } from '@/lib/classes';
import { useAuth } from '../auth-provider';
import { ErrorBox, Loading, Logo, Spinner } from '../ui';

type Joined = { message: string; classId: string; className: string };

export function JoinClass({ code }: { code: string }) {
  const { user, loading } = useAuth();
  const [joined, setJoined] = useState<Joined | null>(null);
  const [error, setError] = useState('');
  const started = useRef(false);
  const student = user?.role === 'STUDENT';
  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.sessionStorage.setItem(pendingJoinKey, code);
      return;
    }
    window.sessionStorage.removeItem(pendingJoinKey);
    if (!student || started.current) return;
    started.current = true;
    api<Joined>('/student/classes/join', { method: 'POST', body: jsonBody({ code }) })
      .then(setJoined)
      .catch((reason) => setError((reason as Error).message));
  }, [loading, user, student, code]);
  if (loading) return <Loading />;
  return (
    <div className="join-page">
      <div className="join-card">
        <Logo />
        <span className="join-icon">
          {joined ? <CheckCircle2 size={30} /> : <BookOpen size={30} strokeWidth={1.6} />}
        </span>
        {!user ? (
          <>
            <h1>Bạn được mời vào một lớp học</h1>
            <p>
              Mã mời <b className="cd-code">{code}</b>. Đăng nhập hoặc tạo tài khoản học sinh, bạn
              sẽ được đưa vào lớp ngay sau đó.
            </p>
            <div className="join-actions">
              <Link className="btn btn-primary" href="/login">
                Đăng nhập để tham gia <ArrowRight size={16} />
              </Link>
              <Link className="btn btn-secondary" href="/register">
                Tạo tài khoản
              </Link>
            </div>
          </>
        ) : !student ? (
          <>
            <h1>Link mời dành cho học sinh</h1>
            <p>Tài khoản giáo viên hoặc quản trị không thể tham gia lớp bằng mã mời.</p>
            <div className="join-actions">
              <Link className="btn btn-primary" href="/classes">
                Về trang lớp học
              </Link>
            </div>
          </>
        ) : joined ? (
          <>
            <h1>{joined.className}</h1>
            <p>{joined.message}</p>
            <div className="join-actions">
              <Link className="btn btn-primary" href={`/classes/${joined.classId}`}>
                Vào lớp học <ArrowRight size={16} />
              </Link>
            </div>
          </>
        ) : error ? (
          <>
            <h1>Không thể tham gia lớp</h1>
            <ErrorBox message={error} />
            <p>
              Mã mời có thể đã được giáo viên đổi. Hãy xin link mới hoặc nhập mã tại trang lớp học.
            </p>
            <div className="join-actions">
              <Link className="btn btn-secondary" href="/classes">
                Về trang lớp học
              </Link>
            </div>
          </>
        ) : (
          <>
            <h1>Đang tham gia lớp…</h1>
            <Spinner />
          </>
        )}
      </div>
    </div>
  );
}
