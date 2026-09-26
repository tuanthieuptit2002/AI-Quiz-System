'use client';
import { useState } from 'react';
import { Check, Plus, Search } from 'lucide-react';
import { useQuery } from '@/lib/use-query';
import { api } from '@/lib/api';
import {
  difficultyLabels,
  typeLabels,
  contentOf,
  type Question,
  type QuestionSummary,
} from '@/lib/questions';
import type { ExamQuestion } from '@/lib/exams';
import { ErrorBox, Loading, Modal, Spinner } from '../ui';

export function QuestionPicker({
  subject,
  selected,
  add,
  close,
}: {
  subject: string;
  selected: ExamQuestion[];
  add: (q: ExamQuestion) => void;
  close: () => void;
}) {
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const params = new URLSearchParams({ subject, status: 'READY', search, page: String(page) });
  if (difficulty) params.set('difficulty', difficulty);
  const list = useQuery<{ questions: QuestionSummary[]; total: number; pages: number }>(
    `/questions?${params}`,
  );
  async function pick(id: string) {
    setBusy(id);
    setError('');
    try {
      const q = await api<Question>(`/questions/${id}`);
      add({ questionId: q.id, version: q.version, points: 1, content: contentOf(q) });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }
  return (
    <Modal
      wide
      title="Chọn từ Question Bank"
      description={`Môn ${subject} · Chỉ hiển thị câu hỏi Sẵn sàng · Đã chọn ${selected.length}/100`}
      close={close}
    >
      <div className="exam-picker-filter">
        <div className="input-icon">
          <Search size={17} />
          <input
            aria-label="Tìm câu hỏi cho đề"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Tìm nội dung, chủ đề…"
          />
        </div>
        <select
          aria-label="Độ khó câu hỏi"
          value={difficulty}
          onChange={(e) => {
            setDifficulty(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Tất cả độ khó</option>
          {Object.entries(difficultyLabels).map(([key, name]) => (
            <option value={key} key={key}>
              {name}
            </option>
          ))}
        </select>
      </div>
      <ErrorBox message={error || list.error} />
      <div className="exam-picker-list">
        {list.loading ? (
          <Loading />
        ) : list.data?.questions.length ? (
          list.data.questions.map((q) => {
            const picked = selected.some((v) => v.questionId === q.id);
            return (
              <div className="exam-picker-item" key={q.id}>
                <div>
                  <div className="question-badges">
                    <span className={`qb-badge difficulty-${q.difficulty.toLowerCase()}`}>
                      {difficultyLabels[q.difficulty]}
                    </span>
                    <span className="qb-badge">{typeLabels[q.type]}</span>
                  </div>
                  <b>{q.question}</b>
                  <small>
                    {q.topicPath.join(' / ')} · v{q.version}
                  </small>
                </div>
                <button
                  className={`btn ${picked ? 'btn-secondary' : 'btn-primary'} small`}
                  disabled={!!busy || picked || selected.length >= 100}
                  onClick={() => pick(q.id)}
                >
                  {busy === q.id ? <Spinner /> : picked ? <Check size={16} /> : <Plus size={16} />}
                  {picked ? 'Đã chọn' : 'Thêm'}
                </button>
              </div>
            );
          })
        ) : (
          <p className="exam-empty-small">
            Chưa có câu hỏi phù hợp. Đặt trạng thái câu hỏi thành Sẵn sàng trong Question Bank.
          </p>
        )}
      </div>
      <div className="table-pagination">
        <span>
          {list.data?.total || 0} câu hỏi · Trang {page}/{list.data?.pages || 1}
        </span>
        <div>
          <button
            className="btn btn-secondary small"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Trước
          </button>
          <button
            className="btn btn-secondary small"
            disabled={page >= (list.data?.pages || 1)}
            onClick={() => setPage(page + 1)}
          >
            Sau
          </button>
          <button className="btn btn-primary small" onClick={close}>
            Hoàn tất
          </button>
        </div>
      </div>
    </Modal>
  );
}
