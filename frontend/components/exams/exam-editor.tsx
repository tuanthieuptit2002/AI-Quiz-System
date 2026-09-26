'use client';
import { useEffect, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Clock3,
  Eye,
  ListChecks,
  Plus,
  Save,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { useQuery } from '@/lib/use-query';
import {
  contentOf,
  difficultyLabels,
  typeLabels,
  type Question,
  type QuestionMetadata,
} from '@/lib/questions';
import {
  defaultSettings,
  localDate,
  type Exam,
  type ExamAudience,
  type ExamQuestion,
  type ExamSettings,
} from '@/lib/exams';
import { ErrorBox, Field, Modal, Spinner } from '../ui';
import { QuestionPicker } from './question-picker';
import { QuestionPreview } from '../questions/question-preview';

export function ExamEditor({
  initial,
  close,
  saved,
}: {
  initial: Exam | null;
  close: () => void;
  saved: () => void;
}) {
  const [title, setTitle] = useState(initial?.title || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [subject, setSubject] = useState(initial?.subject || '');
  const [topic, setTopic] = useState(initial?.topic || '');
  const [mode, setMode] = useState<'MANUAL' | 'AUTO'>(initial?.mode || 'MANUAL');
  const [counts, setCounts] = useState(
    initial?.blueprint || { EASY: 20, MEDIUM: 15, HARD: 10, VERY_HARD: 5 },
  );
  const [questions, setQuestions] = useState<ExamQuestion[]>(initial?.questions || []);
  const [settings, setSettings] = useState<ExamSettings>(initial?.settings || defaultSettings);
  const [passwordAction, setPasswordAction] = useState('KEEP');
  const [password, setPassword] = useState('');
  const [picker, setPicker] = useState(false);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const meta = useQuery<QuestionMetadata>('/questions/metadata');
  const audience = useQuery<ExamAudience>('/exams/audience');
  const total = questions.reduce((sum, q) => sum + q.points, 0);
  const expected = Object.values(counts).reduce((sum, n) => sum + n, 0);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const before = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, [dirty]);
  function setting<K extends keyof ExamSettings>(key: K, value: ExamSettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
    setDirty(true);
  }
  const leave = () => {
    if (!busy && (!dirty || window.confirm('Bỏ những thay đổi chưa lưu?'))) close();
  };
  async function generate() {
    if (
      questions.length &&
      !window.confirm('Random lại sẽ thay thế toàn bộ câu hỏi đang chọn. Tiếp tục?')
    )
      return;
    setBusy(true);
    setError('');
    try {
      const response = await api<{ questions: Question[] }>('/exams/generate', {
        method: 'POST',
        body: jsonBody({
          subject,
          topic: topic
            .split('/')
            .map((s) => s.trim())
            .filter(Boolean)
            .join(' / '),
          counts,
        }),
      });
      setQuestions(
        response.questions.map((q) => ({
          questionId: q.id,
          version: q.version,
          points: 1,
          content: contentOf(q),
        })),
      );
      setDirty(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const content = {
      title,
      description,
      subject,
      topic,
      mode,
      blueprint: counts,
      selections: questions.map(({ questionId, version, points }) => ({
        questionId,
        version,
        points,
      })),
      settings,
      passwordAction,
      password,
    };
    try {
      await api(`/exams${initial ? `/${initial.id}` : ''}`, {
        method: initial ? 'PUT' : 'POST',
        body: jsonBody(initial ? { version: initial.version, content } : content),
      });
      setDirty(false);
      saved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, delta: number) {
    const next = [...questions];
    [next[index], next[index + delta]] = [next[index + delta], next[index]];
    setQuestions(next);
    setDirty(true);
  }
  return (
    <form className="exam-editor" onSubmit={submit} onChange={() => setDirty(true)}>
      <div className="qb-editor-heading">
        <button type="button" className="btn btn-secondary" disabled={busy} onClick={leave}>
          <ArrowLeft size={16} /> Đề thi
        </button>
        <div>
          <span className="eyebrow">EXAM STUDIO</span>
          <h1>{initial ? 'Chỉnh sửa đề thi' : 'Thiết kế đề thi mới'}</h1>
          <p>Từ ngân hàng kiến thức đến một bài đánh giá hoàn chỉnh.</p>
        </div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? <Spinner /> : <Save size={17} />} Lưu bản nháp
        </button>
      </div>
      <div className="exam-editor-layout">
        <div className="exam-editor-main">
          <section className="panel exam-form-section">
            <h2>
              <span>01</span> Thông tin đề thi
            </h2>
            <Field label="Tên đề thi *">
              <input
                required
                minLength={3}
                maxLength={160}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Java Backend Test"
              />
            </Field>
            <div className="form-grid">
              <Field label="Môn học *">
                <input
                  required
                  maxLength={100}
                  list="exam-subjects"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Java"
                />
              </Field>
              <Field label="Mô tả / hướng dẫn">
                <textarea
                  rows={2}
                  maxLength={5000}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Hướng dẫn dành cho học sinh trước khi bắt đầu…"
                />
              </Field>
            </div>
            <datalist id="exam-subjects">
              {[...new Set(meta.data?.taxonomy.map((t) => t._id.subject))].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </datalist>
          </section>
          <section className="panel exam-form-section">
            <h2>
              <span>02</span> Xây dựng nội dung
            </h2>
            <div className="exam-mode-switch">
              <button
                type="button"
                className={mode === 'MANUAL' ? 'selected' : ''}
                onClick={() => {
                  setMode('MANUAL');
                  setDirty(true);
                }}
              >
                <ListChecks size={20} />
                <span>
                  <b>Chọn thủ công</b>
                  <small>Chủ động chọn và sắp xếp từng câu hỏi</small>
                </span>
                {mode === 'MANUAL' && <Check size={16} />}
              </button>
              <button
                type="button"
                className={mode === 'AUTO' ? 'selected' : ''}
                onClick={() => {
                  setMode('AUTO');
                  setDirty(true);
                }}
              >
                <Shuffle size={20} />
                <span>
                  <b>Tạo tự động</b>
                  <small>Random theo ma trận độ khó</small>
                </span>
                {mode === 'AUTO' && <Check size={16} />}
              </button>
            </div>
            {mode === 'AUTO' && (
              <div className="exam-blueprint">
                <Field label="Giới hạn chủ đề (tùy chọn)">
                  <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="Java Core / OOP"
                  />
                </Field>
                <div className="exam-difficulty-grid">
                  {Object.entries(difficultyLabels).map(([key, label]) => (
                    <label key={key}>
                      <span className={`qb-badge difficulty-${key.toLowerCase()}`}>{label}</span>
                      <input
                        type="number"
                        aria-label={`Số câu ${label}`}
                        min={0}
                        max={100}
                        value={counts[key as keyof typeof counts]}
                        onChange={(e) => setCounts({ ...counts, [key]: Number(e.target.value) })}
                      />
                      <small>câu hỏi</small>
                    </label>
                  ))}
                </div>
                <div className="exam-blueprint-footer">
                  <span>
                    Tổng cộng <b>{expected}</b> câu · tối đa 100
                  </span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy || !subject || expected < 1 || expected > 100}
                    onClick={generate}
                  >
                    {busy ? <Spinner /> : <Shuffle size={16} />} Random câu hỏi
                  </button>
                </div>
              </div>
            )}
            <div className="exam-selection-heading">
              <b>
                {questions.length} câu hỏi đã chọn <span>· {total} điểm</span>
              </b>
              {mode === 'MANUAL' && (
                <button
                  type="button"
                  className="btn btn-secondary small"
                  disabled={!subject || questions.length >= 100}
                  onClick={() => setPicker(true)}
                >
                  <Plus size={16} /> Thêm câu hỏi
                </button>
              )}
            </div>
            {!questions.length ? (
              <div className="exam-selection-empty">
                <ListChecks size={32} />
                <h3>Đề thi bắt đầu từ câu hỏi hay</h3>
                <p>
                  {mode === 'MANUAL'
                    ? 'Nhập môn học rồi chọn câu hỏi từ Question Bank.'
                    : 'Cấu hình số lượng từng độ khó và bấm Random câu hỏi.'}
                </p>
              </div>
            ) : (
              <div className="exam-selected-list">
                {questions.map((q, i) => (
                  <div className="exam-selected-item" key={q.questionId}>
                    <span className="exam-question-number">{String(i + 1).padStart(2, '0')}</span>
                    <div className="exam-selected-text">
                      <div className="question-badges">
                        <span
                          className={`qb-badge difficulty-${q.content.difficulty.toLowerCase()}`}
                        >
                          {difficultyLabels[q.content.difficulty]}
                        </span>
                        <span className="qb-badge">{typeLabels[q.content.type]}</span>
                        <small>v{q.version}</small>
                      </div>
                      <p>{q.content.question}</p>
                    </div>
                    <div className="exam-item-controls">
                      <label>
                        <input
                          aria-label={`Điểm câu ${i + 1}`}
                          type="number"
                          min={1}
                          max={100}
                          required
                          value={q.points}
                          onChange={(e) =>
                            setQuestions(
                              questions.map((v, j) =>
                                j === i ? { ...v, points: Number(e.target.value) } : v,
                              ),
                            )
                          }
                        />
                        <small>điểm</small>
                      </label>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={i === 0}
                        aria-label={`Đưa câu ${i + 1} lên`}
                        onClick={() => move(i, -1)}
                      >
                        <ArrowUp size={15} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        disabled={i === questions.length - 1}
                        aria-label={`Đưa câu ${i + 1} xuống`}
                        onClick={() => move(i, 1)}
                      >
                        <ArrowDown size={15} />
                      </button>
                      {mode === 'MANUAL' && (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`Bỏ câu ${i + 1}`}
                          onClick={() => {
                            setQuestions(questions.filter((_, j) => j !== i));
                            setDirty(true);
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <ErrorBox message={error} />
          </section>
          <section className="panel exam-form-section">
            <h2>
              <span>03</span> Lịch thi & đánh giá
            </h2>
            <p className="exam-field-note">
              Giờ hiển thị theo múi giờ trên thiết bị. Bỏ trống để không giới hạn thời gian mở đề.
            </p>
            <div className="form-grid">
              <Field label="Thời gian bắt đầu">
                <input
                  type="datetime-local"
                  value={localDate(settings.startsAt)}
                  onChange={(e) =>
                    setting(
                      'startsAt',
                      e.target.value ? new Date(e.target.value).toISOString() : null,
                    )
                  }
                />
              </Field>
              <Field label="Thời gian kết thúc">
                <input
                  type="datetime-local"
                  value={localDate(settings.endsAt)}
                  onChange={(e) =>
                    setting(
                      'endsAt',
                      e.target.value ? new Date(e.target.value).toISOString() : null,
                    )
                  }
                />
              </Field>
              <Field label="Thời lượng (phút)">
                <input
                  required
                  type="number"
                  min={1}
                  max={480}
                  value={settings.durationMinutes}
                  onChange={(e) => setting('durationMinutes', Number(e.target.value))}
                />
              </Field>
              <Field label="Số lần được thi">
                <input
                  required
                  type="number"
                  min={1}
                  max={20}
                  value={settings.maxAttempts}
                  onChange={(e) => setting('maxAttempts', Number(e.target.value))}
                />
              </Field>
              <Field label="Điểm đạt (%)">
                <input
                  required
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={settings.passScore}
                  onChange={(e) => setting('passScore', Number(e.target.value))}
                />
              </Field>
            </div>
            <p className="exam-field-note">
              Hạn nộp là thời điểm sớm hơn giữa hết thời lượng và giờ đóng đề. Lượt đã bắt đầu được
              tính vào giới hạn lượt thi.
            </p>
          </section>
          <section className="panel exam-form-section">
            <h2>
              <span>04</span> Thiết lập làm bài
            </h2>
            <div className="exam-toggle-list">
              {(
                [
                  [
                    'randomQuestions',
                    'Trộn thứ tự câu hỏi',
                    'Mỗi lượt thi có thứ tự riêng; tập câu hỏi đã chọn được giữ nguyên.',
                  ],
                  [
                    'randomAnswers',
                    'Trộn thứ tự đáp án',
                    'Áp dụng cho câu trắc nghiệm. Ghép cặp và sắp xếp luôn trộn để không lộ đáp án.',
                  ],
                  [
                    'showAnswers',
                    'Hiển thị đáp án sau khi nộp',
                    'Bao gồm giải thích và hướng dẫn chấm, kể cả khi còn lượt thi khác.',
                  ],
                  [
                    'allowBack',
                    'Cho phép quay lại câu trước',
                    'Tắt để làm tuần tự; khi chuyển câu, câu trước sẽ bị khóa.',
                  ],
                  [
                    'autoSubmit',
                    'Tự động nộp khi hết giờ',
                    'Server nộp phần đã lưu ngay cả khi đóng trình duyệt. Tắt: hết giờ mà chưa nộp sẽ không có điểm.',
                  ],
                ] as const
              ).map(([key, label, detail]) => (
                <label className="exam-toggle" key={key}>
                  <span>
                    <b>{label}</b>
                    <small>{detail}</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={settings[key]}
                    onChange={(e) => setting(key, e.target.checked)}
                  />
                  <span className="exam-switch" />
                </label>
              ))}
            </div>
          </section>
          <section className="panel exam-form-section">
            <h2>
              <span>05</span> Quyền truy cập
            </h2>
            <Field label="Đối tượng được thi">
              <select
                value={settings.access}
                onChange={(e) => setting('access', e.target.value as ExamSettings['access'])}
              >
                <option value="RESTRICTED">Chỉ lớp / học sinh được chọn</option>
                <option value="ALL">Tất cả tài khoản Student</option>
              </select>
            </Field>
            {settings.access === 'RESTRICTED' && (
              <>
                <p className="exam-field-note">
                  Học sinh được phép nếu thuộc một lớp đã chọn HOẶC được chọn trực tiếp. Thành viên
                  lớp được kiểm tra tại thời điểm bắt đầu.
                </p>
                <ErrorBox message={audience.error} retry={audience.reload} />
                <div className="exam-audience-grid">
                  <div>
                    <h3>Lớp học</h3>
                    <div className="exam-audience-options">
                      {audience.data?.classes.map((cl) => (
                        <label key={cl.id}>
                          <input
                            type="checkbox"
                            checked={settings.classIds.includes(cl.id)}
                            onChange={(e) =>
                              setting(
                                'classIds',
                                e.target.checked
                                  ? [...settings.classIds, cl.id]
                                  : settings.classIds.filter((id) => id !== cl.id),
                              )
                            }
                          />
                          <span>
                            {cl.name}
                            <small>
                              {cl.subject} · {cl.count} học sinh
                            </small>
                          </span>
                        </label>
                      ))}
                      {!audience.data?.classes.length && (
                        <p className="exam-field-note">Chưa có lớp học.</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3>Học sinh cụ thể</h3>
                    <div className="exam-audience-options">
                      {audience.data?.students.map((s) => (
                        <label key={s.id}>
                          <input
                            type="checkbox"
                            checked={settings.studentIds.includes(s.id)}
                            onChange={(e) =>
                              setting(
                                'studentIds',
                                e.target.checked
                                  ? [...settings.studentIds, s.id]
                                  : settings.studentIds.filter((id) => id !== s.id),
                              )
                            }
                          />
                          <span>
                            {s.name}
                            <small>{s.email}</small>
                          </span>
                        </label>
                      ))}
                      {!audience.data?.students.length && (
                        <p className="exam-field-note">Thêm học sinh vào lớp để chọn.</p>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
            <div className="form-grid">
              <Field label="Mã truy cập / password">
                <select value={passwordAction} onChange={(e) => setPasswordAction(e.target.value)}>
                  <option value="KEEP">
                    {initial?.hasPassword ? 'Giữ mã đang có' : 'Không yêu cầu mã'}
                  </option>
                  <option value="SET">Đặt mã mới</option>
                  {initial?.hasPassword && <option value="REMOVE">Gỡ mã truy cập</option>}
                </select>
              </Field>
              {passwordAction === 'SET' && (
                <Field label="Mã truy cập mới">
                  <input
                    type="password"
                    autoComplete="new-password"
                    minLength={4}
                    maxLength={72}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Tối thiểu 4 ký tự"
                  />
                </Field>
              )}
            </div>
            <p className="exam-field-note">
              Mã được lưu dạng hash. Chia sẻ mã với học sinh ngoài hệ thống.
            </p>
          </section>
          <ErrorBox message={error} />
          <div className="qb-editor-footer">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={leave}>
              Hủy
            </button>
            <button className="btn btn-primary" disabled={busy}>
              {busy ? <Spinner /> : <Save size={17} />} Lưu bản nháp
            </button>
          </div>
        </div>
        <aside className="exam-summary panel">
          <div className="exam-summary-art">
            <SlidersHorizontal size={32} />
            <span>YOUR EXAM, YOUR WAY</span>
          </div>
          <div className="exam-summary-body">
            <span className="qb-badge">BẢN NHÁP</span>
            <h2>{title || 'Đề thi của bạn'}</h2>
            <p>{subject || 'Chưa chọn môn học'}</p>
            <div className="exam-summary-numbers">
              <div>
                <strong>{questions.length}</strong>
                <span>Câu hỏi</span>
              </div>
              <div>
                <strong>{total}</strong>
                <span>Tổng điểm</span>
              </div>
            </div>
            <div className="exam-summary-detail">
              <span>
                <Clock3 size={16} /> Thời lượng
              </span>
              <b>{settings.durationMinutes} phút</b>
            </div>
            <div className="exam-summary-detail">
              <span>
                <Check size={16} /> Điểm đạt
              </span>
              <b>{settings.passScore}%</b>
            </div>
            <div className="exam-summary-detail">
              <span>
                <ShieldCheck size={16} /> Số lượt
              </span>
              <b>{settings.maxAttempts}</b>
            </div>
            <div className="exam-distribution">
              {Object.entries(difficultyLabels).map(([key, name]) => (
                <span key={key}>
                  <i className={`difficulty-dot ${key.toLowerCase()}`} />
                  {name}
                  <b>{questions.filter((q) => q.content.difficulty === key).length}</b>
                </span>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!questions.length}
              onClick={() => setPreview(true)}
            >
              <Eye size={17} /> Xem trước đề
            </button>
            <small className="exam-summary-note">
              Lưu bản nháp, kiểm tra nội dung rồi phát hành. Đề đã phát hành giữ nguyên nội dung và
              thiết lập.
            </small>
          </div>
        </aside>
      </div>
      {picker && (
        <QuestionPicker
          subject={subject}
          selected={questions}
          close={() => setPicker(false)}
          add={(q) => {
            setQuestions((old) =>
              old.some((v) => v.questionId === q.questionId) ? old : [...old, q],
            );
            setDirty(true);
          }}
        />
      )}
      {preview && (
        <Modal
          wide
          title={title || 'Xem trước đề thi'}
          description={`${questions.length} câu · ${total} điểm · ${settings.durationMinutes} phút`}
          close={() => setPreview(false)}
        >
          <div className="exam-paper-preview">
            {questions.map((q, i) => (
              <section key={q.questionId}>
                <div className="exam-paper-number">
                  Câu {i + 1} · {q.points} điểm
                </div>
                <QuestionPreview value={q.content} />
              </section>
            ))}
          </div>
        </Modal>
      )}
    </form>
  );
}
