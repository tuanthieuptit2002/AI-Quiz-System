'use client';
import { useState } from 'react';
import { History, RotateCcw } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import type { Question, Version } from '@/lib/questions';
import { ErrorBox, Loading, Modal, Spinner } from '../ui';
import { QuestionPreview } from './question-preview';

export function QuestionHistory({
  question,
  close,
  restored,
}: {
  question: Question;
  close: () => void;
  restored: () => void;
}) {
  const [page, setPage] = useState(1);
  const history = useQuery<{ versions: Omit<Version, 'content'>[]; total: number }>(
    `/questions/${question.id}/versions?page=${page}`,
  );
  const [selected, setSelected] = useState(question.version);
  const snapshot = useQuery<Version>(`/questions/${question.id}/versions/${selected}`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function restore() {
    if (
      !window.confirm(
        `Khôi phục nội dung phiên bản ${selected}? Hệ thống sẽ tạo phiên bản mới và giữ lại toàn bộ lịch sử.`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      await api(`/questions/${question.id}/versions/${selected}/restore`, {
        method: 'POST',
        body: jsonBody({ version: question.version }),
      });
      restored();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title="Lịch sử phiên bản"
      description="Mỗi thay đổi đều được lưu lại. Khôi phục không xóa lịch sử."
      close={() => {
        if (!busy) close();
      }}
    >
      <ErrorBox message={error || history.error} />
      <div className="qb-history-layout">
        <div className="qb-version-list">
          {history.loading ? (
            <Loading />
          ) : (
            history.data?.versions.map((v) => (
              <button
                key={v.version}
                className={`qb-version ${selected === v.version ? 'selected' : ''}`}
                onClick={() => setSelected(v.version)}
              >
                <span>
                  <History size={15} />
                  <b>Phiên bản {v.version}</b>
                  {v.version === question.version && <small>Hiện tại</small>}
                </span>
                <p>{v.note}</p>
                <small>
                  {v.editorName} · {new Date(v.createdAt).toLocaleString('vi-VN')}
                </small>
              </button>
            ))
          )}
          <div className="qb-version-pagination">
            <button
              className="btn btn-secondary small"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              Trước
            </button>
            <span>{page}</span>
            <button
              className="btn btn-secondary small"
              disabled={page * 20 >= (history.data?.total || 0)}
              onClick={() => setPage(page + 1)}
            >
              Sau
            </button>
          </div>
        </div>
        <div className="qb-version-content">
          {snapshot.loading ? (
            <Loading />
          ) : snapshot.error ? (
            <ErrorBox message={snapshot.error} retry={snapshot.reload} />
          ) : (
            snapshot.data && (
              <>
                <p className="qb-version-taxonomy">
                  {[snapshot.data.content.subject, ...snapshot.data.content.topicPath].join(' → ')}
                </p>
                <QuestionPreview key={selected} value={snapshot.data.content} showAnswers />
                <p className="muted">Tags: {snapshot.data.content.tags.join(', ') || 'Không có'}</p>
              </>
            )
          )}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={close} disabled={busy}>
          Đóng
        </button>
        <button
          className="btn btn-primary"
          disabled={busy || snapshot.loading || !!snapshot.error || selected === question.version}
          onClick={restore}
        >
          {busy ? <Spinner /> : <RotateCcw size={16} />} Khôi phục phiên bản {selected}
        </button>
      </div>
    </Modal>
  );
}
