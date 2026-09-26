'use client';
import { useEffect, useState } from 'react';
import {
  Archive,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  FileQuestion,
  FolderTree,
  History,
  Layers3,
  ListFilter,
  Pencil,
  Plus,
  Search,
  Upload,
  X,
} from 'lucide-react';
import { api, downloadFile, jsonBody } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import {
  difficultyLabels,
  statusLabels,
  typeLabels,
  typeEnglish,
  type Question,
  type QuestionMetadata,
  type QuestionSummary,
} from '@/lib/questions';
import type { Notify } from './workspace';
import { Empty, ErrorBox, Loading, Modal, SectionTitle, Spinner } from './ui';
import { QuestionEditor } from './questions/question-editor';
import { QuestionPreview } from './questions/question-preview';
import { QuestionHistory } from './questions/question-history';
import { QuestionImport } from './questions/question-import';

export function QuestionBank({ notify }: { notify: Notify }) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [tag, setTag] = useState('');
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Question | 'new' | null>(null);
  const [selected, setSelected] = useState<Question | null>(null);
  const [history, setHistory] = useState<Question | null>(null);
  const [archiving, setArchiving] = useState<QuestionSummary | null>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [editor]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const params = new URLSearchParams({ page: String(page) });
  for (const [key, value] of Object.entries({
    search: debounced,
    subject,
    topic,
    difficulty,
    type,
    status,
    tag,
  }))
    if (value) params.set(key, value);
  const list = useQuery<{ questions: QuestionSummary[]; total: number; pages: number }>(
    `/questions?${params}`,
  );
  const metadata = useQuery<QuestionMetadata>('/questions/metadata');
  const total = metadata.data?.counts.reduce((sum, c) => sum + c.count, 0) || 0;
  const ready = metadata.data?.counts.find((c) => c._id === 'READY')?.count || 0;
  const subjects = [...new Set(metadata.data?.taxonomy.map((t) => t._id.subject))];
  const reload = () => {
    list.reload();
    metadata.reload();
  };
  const resetFilters = () => {
    setSearch('');
    setDebounced('');
    setSubject('');
    setTopic('');
    setDifficulty('');
    setType('');
    setStatus('');
    setTag('');
    setPage(1);
  };
  const filtered = !!(search || subject || topic || difficulty || type || status || tag);
  async function open(question: QuestionSummary, mode: 'preview' | 'edit' | 'history') {
    setBusy(true);
    try {
      const full = await api<Question>(`/questions/${question.id}`);
      if (mode === 'edit') setEditor(full);
      else if (mode === 'history') setHistory(full);
      else setSelected(full);
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function duplicate(question: QuestionSummary) {
    setBusy(true);
    try {
      const copy = await api<Question>(`/questions/${question.id}/duplicate`, { method: 'POST' });
      reload();
      setEditor(copy);
      notify('Đã tạo bản sao dưới dạng bản nháp.');
    } catch (error) {
      notify((error as Error).message, true);
    } finally {
      setBusy(false);
    }
  }
  async function archive() {
    if (!archiving) return;
    setBusy(true);
    setActionError('');
    try {
      await api(`/questions/${archiving.id}/archive`, {
        method: 'POST',
        body: jsonBody({ version: archiving.version }),
      });
      setArchiving(null);
      reload();
      notify('Đã lưu trữ câu hỏi. Bạn có thể khôi phục từ lịch sử.');
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exportFile(format: 'xlsx' | 'csv') {
    setBusy(true);
    setActionError('');
    try {
      const query = new URLSearchParams(params);
      query.delete('page');
      query.set('format', format);
      await downloadFile(`/questions/export?${query}`, `quizspace-questions.${format}`);
      setExporting(false);
    } catch (error) {
      setActionError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (editor)
    return (
      <QuestionEditor
        key={editor === 'new' ? 'new' : editor.id}
        initial={editor === 'new' ? null : editor}
        metadata={metadata.data}
        close={() => setEditor(null)}
        saved={() => {
          setEditor(null);
          reload();
          notify('Đã lưu câu hỏi và lịch sử phiên bản.');
        }}
      />
    );
  return (
    <>
      <SectionTitle
        eyebrow="BUILD KNOWLEDGE. INSPIRE LEARNING."
        title="Ngân hàng câu hỏi"
        description="Tổ chức kiến thức. Xây dựng câu hỏi. Nâng tầm mỗi bài kiểm tra."
        action={
          <div className="qb-actions">
            <button className="btn btn-secondary" onClick={() => setImporting(true)}>
              <Upload size={17} /> Nhập file
            </button>
            <button className="btn btn-primary" onClick={() => setEditor('new')}>
              <Plus size={18} /> Tạo câu hỏi
            </button>
          </div>
        }
      />
      <div className="qb-stats">
        <div>
          <span className="qb-stat-icon mint">
            <Layers3 size={22} />
          </span>
          <div>
            <strong>{total}</strong>
            <span>Câu hỏi trong ngân hàng</span>
          </div>
        </div>
        <div>
          <span className="qb-stat-icon blue">
            <CheckCircle2 size={22} />
          </span>
          <div>
            <strong>{ready}</strong>
            <span>Sẵn sàng sử dụng</span>
          </div>
        </div>
        <div>
          <span className="qb-stat-icon purple">
            <BookOpen size={22} />
          </span>
          <div>
            <strong>{subjects.length}</strong>
            <span>Môn học</span>
          </div>
        </div>
        <div>
          <span className="qb-stat-icon amber">
            <FileQuestion size={22} />
          </span>
          <div>
            <strong>08</strong>
            <span>Dạng câu hỏi được hỗ trợ</span>
          </div>
        </div>
      </div>
      <div className="qb-bank-layout">
        <aside className="panel qb-taxonomy">
          <div className="qb-taxonomy-title">
            <FolderTree size={18} />
            <b>Danh mục kiến thức</b>
          </div>
          <button
            className={`qb-tree-all ${!subject ? 'selected' : ''}`}
            onClick={() => {
              setSubject('');
              setTopic('');
              setPage(1);
            }}
          >
            <Layers3 size={16} /> Tất cả môn học <span>{total}</span>
          </button>
          {metadata.loading ? (
            <p className="muted qb-tree-hint">Đang tải danh mục…</p>
          ) : metadata.error ? (
            <ErrorBox message={metadata.error} retry={metadata.reload} />
          ) : !subjects.length ? (
            <p className="muted qb-tree-hint">
              Môn học và chủ đề sẽ xuất hiện khi bạn tạo câu hỏi đầu tiên.
            </p>
          ) : (
            subjects.map((name) => {
              const paths = metadata.data!.taxonomy.filter((t) => t._id.subject === name);
              const nodes = new Map<string, number>();
              for (const item of paths)
                item._id.topicPath.forEach((_, i) => {
                  const key = item._id.topicPath.slice(0, i + 1).join(' / ');
                  nodes.set(key, (nodes.get(key) || 0) + item.count);
                });
              return (
                <div className="qb-tree-group" key={name}>
                  <button
                    className={subject === name && !topic ? 'selected' : ''}
                    onClick={() => {
                      setSubject(name);
                      setTopic('');
                      setPage(1);
                    }}
                  >
                    <BookOpen size={15} />
                    <b>{name}</b>
                    <span>{paths.reduce((sum, p) => sum + p.count, 0)}</span>
                  </button>
                  {subject === name &&
                    [...nodes.entries()]
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([path, count]) => (
                        <button
                          key={path}
                          className={`qb-tree-topic ${topic === path ? 'selected' : ''}`}
                          style={{ paddingLeft: 18 + path.split(' / ').length * 12 }}
                          title={path}
                          onClick={() => {
                            setTopic(path);
                            setPage(1);
                          }}
                        >
                          <ChevronRight size={12} />
                          <span>{path.split(' / ').at(-1)}</span>
                          <small>{count}</small>
                        </button>
                      ))}
                </div>
              );
            })
          )}
          <div className="qb-taxonomy-tip">
            <b>Một nơi cho mọi kiến thức</b>
            <p>Sắp xếp theo môn học và tối đa 5 cấp chủ đề. Dễ tìm, dễ tái sử dụng.</p>
          </div>
        </aside>
        <section className="panel qb-library">
          <div className="qb-library-heading">
            <div>
              <h2>
                Thư viện câu hỏi <span className="count-badge">{list.data?.total ?? 0}</span>
              </h2>
              <p>
                {subject
                  ? [subject, topic].filter(Boolean).join(' / ')
                  : 'Tất cả kiến thức, được tổ chức theo cách của bạn.'}
              </p>
            </div>
            <button
              className="btn btn-secondary small"
              disabled={list.loading || !list.data?.total}
              onClick={() => {
                setActionError('');
                setExporting(true);
              }}
            >
              <Download size={16} /> Xuất file
            </button>
          </div>
          <div className="qb-filters">
            <div className="input-icon">
              <Search size={17} />
              <input
                aria-label="Tìm câu hỏi"
                placeholder="Tìm nội dung, môn học, chủ đề hoặc tag…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="qb-filter-selects">
              <ListFilter size={16} />
              <select
                aria-label="Lọc dạng câu hỏi"
                value={type}
                onChange={(e) => {
                  setType(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tất cả dạng</option>
                {Object.entries(typeLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Lọc độ khó"
                value={difficulty}
                onChange={(e) => {
                  setDifficulty(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Độ khó</option>
                {Object.entries(difficultyLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Lọc trạng thái"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Trạng thái</option>
                {Object.entries(statusLabels).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
              <select
                aria-label="Lọc tag"
                value={tag}
                onChange={(e) => {
                  setTag(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">Tags</option>
                {metadata.data?.tags.map((t) => (
                  <option key={t._id}>{t._id}</option>
                ))}
              </select>
            </div>
            {filtered && (
              <div className="qb-active-filter">
                <span>{list.data?.total || 0} kết quả phù hợp</span>
                <button onClick={resetFilters}>
                  <X size={13} /> Xóa bộ lọc
                </button>
              </div>
            )}
          </div>
          {list.loading ? (
            <Loading />
          ) : list.error ? (
            <ErrorBox message={list.error} retry={list.reload} />
          ) : !list.data?.questions.length ? (
            <Empty
              title={filtered ? 'Chưa có câu hỏi phù hợp' : 'Bắt đầu ngân hàng kiến thức của bạn'}
              description={
                filtered
                  ? 'Thử từ khóa khác hoặc xóa bộ lọc để xem thêm câu hỏi.'
                  : 'Tạo câu hỏi đầu tiên hoặc nhập từ file Excel / CSV. Mỗi câu hỏi là một viên gạch cho bài kiểm tra chất lượng.'
              }
              icon={<FileQuestion size={30} />}
              action={
                <button
                  className="btn btn-primary"
                  onClick={filtered ? resetFilters : () => setEditor('new')}
                >
                  {filtered ? 'Xóa bộ lọc' : 'Tạo câu hỏi đầu tiên'}
                </button>
              }
            />
          ) : (
            <div className="qb-question-list">
              {list.data.questions.map((q) => (
                <article key={q.id} className="qb-question-card">
                  <div className="qb-question-top">
                    <div className="question-badges">
                      <span className="qb-badge" title={typeEnglish[q.type]}>
                        {typeLabels[q.type]}
                      </span>
                      <span className={`qb-badge difficulty-${q.difficulty.toLowerCase()}`}>
                        {difficultyLabels[q.difficulty]}
                      </span>
                      <span className={`qb-status status-${q.status.toLowerCase()}`}>
                        {statusLabels[q.status]}
                      </span>
                    </div>
                    <small>v{q.version}</small>
                  </div>
                  <button
                    className="qb-question-title"
                    onClick={() => open(q, 'preview')}
                    disabled={busy}
                  >
                    {q.question}
                  </button>
                  <p className="qb-question-path">
                    {q.subject} <ChevronRight size={12} /> {q.topicPath.join(' / ')}
                  </p>
                  <div className="qb-question-bottom">
                    <div className="qb-tags">
                      {q.tags.slice(0, 4).map((t) => (
                        <button
                          key={t}
                          onClick={() => {
                            setTag(t);
                            setPage(1);
                          }}
                        >
                          #{t}
                        </button>
                      ))}
                      <time dateTime={q.updatedAt}>
                        Cập nhật {new Date(q.updatedAt).toLocaleDateString('vi-VN')}
                      </time>
                    </div>
                    <div className="qb-card-actions">
                      <button
                        className="icon-btn"
                        title="Chỉnh sửa"
                        aria-label={`Sửa câu hỏi ${q.question.slice(0, 40)}`}
                        disabled={busy}
                        onClick={() => open(q, 'edit')}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Lịch sử phiên bản"
                        aria-label="Lịch sử phiên bản"
                        disabled={busy}
                        onClick={() => open(q, 'history')}
                      >
                        <History size={17} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Nhân bản"
                        aria-label="Nhân bản câu hỏi"
                        disabled={busy}
                        onClick={() => duplicate(q)}
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        className="icon-btn"
                        title="Lưu trữ"
                        aria-label="Lưu trữ câu hỏi"
                        disabled={busy || q.status === 'ARCHIVED'}
                        onClick={() => {
                          setActionError('');
                          setArchiving(q);
                        }}
                      >
                        <Archive size={16} />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {list.data && list.data.total > 0 && (
            <div className="table-pagination">
              <span>
                {list.data.total} câu hỏi · Trang {page}/{list.data.pages}
              </span>
              <div>
                <button
                  className="btn btn-secondary small"
                  disabled={page <= 1 || list.loading}
                  onClick={() => setPage(page - 1)}
                >
                  Trước
                </button>
                <button
                  className="btn btn-secondary small"
                  disabled={page >= list.data!.pages || list.loading}
                  onClick={() => setPage(page + 1)}
                >
                  Sau
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
      {selected && (
        <Modal
          wide
          title="Chi tiết câu hỏi"
          description={`${selected.subject} / ${selected.topicPath.join(' / ')} · Phiên bản ${selected.version}`}
          close={() => setSelected(null)}
        >
          <QuestionPreview value={selected} showAnswers />
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              onClick={() => {
                setHistory(selected);
                setSelected(null);
              }}
            >
              <History size={17} /> Lịch sử
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                setEditor(selected);
                setSelected(null);
              }}
            >
              <Pencil size={17} /> Chỉnh sửa
            </button>
          </div>
        </Modal>
      )}
      {history && (
        <QuestionHistory
          question={history}
          close={() => setHistory(null)}
          restored={() => {
            setHistory(null);
            reload();
            notify('Đã khôi phục nội dung thành một phiên bản mới.');
          }}
        />
      )}
      {importing && (
        <QuestionImport
          close={() => setImporting(false)}
          imported={(count) => {
            setImporting(false);
            reload();
            notify(`Đã nhập ${count} câu hỏi vào ngân hàng.`);
          }}
        />
      )}
      {archiving && (
        <Modal
          title="Lưu trữ câu hỏi?"
          description="Câu hỏi và lịch sử được giữ lại. Bạn có thể xem bằng bộ lọc Đã lưu trữ và khôi phục khi cần."
          close={() => {
            if (!busy) setArchiving(null);
          }}
        >
          <p className="qb-confirm-question">{archiving.question}</p>
          <ErrorBox message={actionError} />
          <div className="modal-actions">
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => setArchiving(null)}
            >
              Hủy
            </button>
            <button className="btn btn-primary" disabled={busy} onClick={archive}>
              {busy ? <Spinner /> : <Archive size={17} />} Lưu trữ
            </button>
          </div>
        </Modal>
      )}
      {exporting && (
        <Modal
          title="Xuất ngân hàng câu hỏi"
          description={`Xuất ${list.data?.total || 0} câu hỏi theo bộ lọc hiện tại, gồm đáp án, giải thích và hình ảnh. Tối đa 100 câu hỏi / 8 MB mỗi lần.`}
          close={() => {
            if (!busy) setExporting(false);
          }}
        >
          <ErrorBox message={actionError} />
          <div className="qb-export-options">
            <button className="btn btn-primary" disabled={busy} onClick={() => exportFile('xlsx')}>
              {busy ? <Spinner /> : <Download size={17} />} Excel (.xlsx)
            </button>
            <button className="btn btn-secondary" disabled={busy} onClick={() => exportFile('csv')}>
              CSV (.csv)
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
