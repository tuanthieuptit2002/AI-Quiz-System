'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowDown, ArrowUp, Check, ImagePlus, Plus, Save, Trash2 } from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import {
  contentOf,
  emptyQuestion,
  typeLabels,
  typeEnglish,
  difficultyLabels,
  statusLabels,
  type Question,
  type QuestionContent,
  type QuestionMetadata,
  type QuestionType,
} from '@/lib/questions';
import { ErrorBox, Field, Spinner } from '../ui';
import { QuestionPreview } from './question-preview';

export function QuestionEditor({
  initial,
  metadata,
  close,
  saved,
  review,
}: {
  initial: Question | null;
  metadata: QuestionMetadata | null;
  close: () => void;
  saved: (question: Question) => void;
  review?: { content: QuestionContent; save: (content: QuestionContent) => Promise<void> };
}) {
  const seed = review?.content || initial;
  const [value, setValue] = useState<QuestionContent>(
    seed
      ? {
          ...contentOf(seed),
          options:
            seed.type === 'ORDERING'
              ? seed.answers.map((id) => seed.options.find((o) => o.id === id)!)
              : seed.options,
        }
      : emptyQuestion(),
  );
  const [topic, setTopic] = useState(seed?.topicPath.join(' / ') || '');
  const [tags, setTags] = useState(seed?.tags.join(', ') || '');
  const [answerText, setAnswerText] = useState(seed?.answers.join('\n') || '');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageBusy, setImageBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  function update<K extends keyof QuestionContent>(key: K, next: QuestionContent[K]) {
    setValue((old) => ({ ...old, [key]: next }));
    setDirty(true);
  }
  useEffect(() => {
    if (!dirty) return;
    const prevent = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty]);
  const leave = () => {
    if (!busy && (!dirty || window.confirm('Bỏ các thay đổi chưa lưu?'))) close();
  };
  function changeType(type: QuestionType) {
    if (type === value.type) return;
    if (
      (value.answers.length ||
        value.options.some((o) => o.text) ||
        value.pairs.some((p) => p.left || p.right) ||
        value.rubric) &&
      !window.confirm('Đổi dạng sẽ xóa phần đáp án hiện tại. Tiếp tục?')
    )
      return;
    const blank = emptyQuestion(type);
    setValue({
      ...value,
      type,
      options: blank.options,
      answers: blank.answers,
      pairs: blank.pairs,
      rubric: '',
    });
    setAnswerText('');
    setDirty(true);
  }
  async function uploadImage(file?: File) {
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 500 * 1024) {
      setError('Chọn ảnh PNG/JPG/WebP tối đa 500 KB.');
      return;
    }
    setImageBusy(true);
    try {
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      update('image', image);
    } catch {
      setError('Không đọc được ảnh. Hãy thử lại.');
    } finally {
      setImageBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const content = {
      ...value,
      topicPath: topic
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean),
      tags: tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    try {
      if (review) {
        await review.save({ ...content, status: 'DRAFT' });
        setDirty(false);
        return;
      }
      const result = await api<Question>(`/questions${initial ? `/${initial.id}` : ''}`, {
        method: initial ? 'PUT' : 'POST',
        body: jsonBody(initial ? { content, version: initial.version, note } : content),
      });
      setDirty(false);
      saved(result);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, delta: number) {
    const options = [...value.options];
    [options[index], options[index + delta]] = [options[index + delta], options[index]];
    setValue({ ...value, options, answers: options.map((o) => o.id) });
    setDirty(true);
  }
  return (
    <form onSubmit={submit} className="question-editor">
      <div className="qb-editor-heading">
        <button type="button" className="btn btn-secondary" onClick={leave} disabled={busy}>
          <ArrowLeft size={17} /> {review ? 'Chờ duyệt' : 'Ngân hàng'}
        </button>
        <div>
          <span className="eyebrow">QUESTION STUDIO</span>
          <h1>
            {review ? 'Biên tập câu hỏi AI' : initial ? 'Chỉnh sửa câu hỏi' : 'Tạo câu hỏi mới'}
          </h1>
          <p>
            {review
              ? 'Lưu thay đổi vào hàng chờ. Câu hỏi chỉ vào ngân hàng sau khi được duyệt.'
              : initial
                ? `Phiên bản ${initial.version} · Lưu thay đổi sẽ tạo phiên bản mới`
                : 'Biến kiến thức thành những câu hỏi chất lượng.'}
          </p>
        </div>
        <button className="btn btn-primary" disabled={busy || imageBusy}>
          {busy ? <Spinner /> : <Save size={17} />} Lưu câu hỏi
        </button>
      </div>
      <ErrorBox message={error} />
      <div className="qb-editor-layout">
        <div className="qb-editor-fields">
          <section className="panel qb-form-section">
            <h2>
              <span>01</span> Dạng câu hỏi
            </h2>
            <div className="question-type-grid">
              {(Object.keys(typeLabels) as QuestionType[]).map((type) => (
                <button
                  type="button"
                  key={type}
                  onClick={() => changeType(type)}
                  className={`question-type-option ${value.type === type ? 'selected' : ''}`}
                >
                  <span>{typeLabels[type]}</span>
                  <small>{typeEnglish[type]}</small>
                  {value.type === type && <Check size={15} />}
                </button>
              ))}
            </div>
          </section>
          <section className="panel qb-form-section">
            <h2>
              <span>02</span> Phân loại kiến thức
            </h2>
            <div className="form-grid">
              <Field label="Môn học *">
                <input
                  required
                  maxLength={100}
                  list="question-subjects"
                  placeholder="Ví dụ: Java"
                  value={value.subject}
                  onChange={(e) => update('subject', e.target.value)}
                />
              </Field>
              <Field label="Chủ đề *" hint="Phân cấp bằng /, tối đa 5 cấp.">
                <input
                  required
                  list="question-topics"
                  placeholder="Java Core / OOP"
                  value={topic}
                  onChange={(e) => {
                    setTopic(e.target.value);
                    setDirty(true);
                  }}
                />
              </Field>
              <Field label="Độ khó">
                <select
                  value={value.difficulty}
                  onChange={(e) =>
                    update('difficulty', e.target.value as QuestionContent['difficulty'])
                  }
                >
                  {Object.entries(difficultyLabels).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              {!review && (
                <Field label="Trạng thái">
                  <select
                    value={value.status}
                    onChange={(e) => update('status', e.target.value as QuestionContent['status'])}
                  >
                    {Object.entries(statusLabels).map(([key, label]) => (
                      <option value={key} key={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
            <datalist id="question-subjects">
              {[...new Set(metadata?.taxonomy.map((t) => t._id.subject))].map((subject) => (
                <option key={subject} value={subject} />
              ))}
            </datalist>
            <datalist id="question-topics">
              {metadata?.taxonomy
                .filter((t) => t._id.subject === value.subject)
                .map((t) => (
                  <option key={t._id.topicPath.join('/')} value={t._id.topicPath.join(' / ')} />
                ))}
            </datalist>
          </section>
          <section className="panel qb-form-section">
            <h2>
              <span>03</span> Nội dung & đáp án
            </h2>
            <Field
              label="Câu hỏi *"
              hint={
                value.type === 'FILL_BLANK'
                  ? 'Đánh dấu chỗ trống bằng {{1}}, {{2}}, … theo thứ tự.'
                  : 'Hỗ trợ văn bản nhiều dòng, kể cả đoạn mã.'
              }
            >
              <textarea
                required
                rows={5}
                maxLength={10000}
                value={value.question}
                placeholder="Nhập nội dung câu hỏi…"
                onChange={(e) => update('question', e.target.value)}
              />
            </Field>
            <div className="qb-image-controls">
              <label className="btn btn-secondary">
                <ImagePlus size={17} />
                {value.image ? 'Thay hình ảnh' : 'Thêm hình ảnh'}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    void uploadImage(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </label>
              <small>PNG, JPG, WebP · tối đa 500 KB</small>
              {value.image && (
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label="Xóa hình ảnh"
                  onClick={() => {
                    update('image', '');
                    update('imageAlt', '');
                  }}
                >
                  <Trash2 size={17} />
                </button>
              )}
            </div>
            {value.image && (
              <Field label="Mô tả hình ảnh *">
                <input
                  required
                  maxLength={200}
                  value={value.imageAlt}
                  onChange={(e) => update('imageAlt', e.target.value)}
                  placeholder="Mô tả nội dung ảnh cho người đọc"
                />
              </Field>
            )}
            {value.options.length > 0 && (
              <div className="answer-editor">
                <div className="qb-subheading">
                  <b>{value.type === 'ORDERING' ? 'Các mục theo thứ tự đúng' : 'Các lựa chọn'}</b>
                  <small>
                    {value.type === 'ORDERING'
                      ? 'Dùng mũi tên để thay đổi thứ tự.'
                      : value.type === 'SINGLE_CHOICE'
                        ? 'Chọn một đáp án đúng.'
                        : 'Chọn ít nhất hai đáp án đúng.'}
                  </small>
                </div>
                {value.options.map((option, i) => (
                  <div className="answer-edit-row" key={option.id}>
                    {value.type === 'ORDERING' ? (
                      <span className="option-letter">{i + 1}</span>
                    ) : (
                      <input
                        type={value.type === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'}
                        name="correct-answer"
                        aria-label={`Lựa chọn ${i + 1} là đáp án đúng`}
                        checked={value.answers.includes(option.id)}
                        onChange={(e) =>
                          update(
                            'answers',
                            value.type === 'SINGLE_CHOICE'
                              ? [option.id]
                              : e.target.checked
                                ? [...value.answers, option.id]
                                : value.answers.filter((a) => a !== option.id),
                          )
                        }
                      />
                    )}
                    <input
                      required
                      maxLength={1000}
                      aria-label={`Nội dung lựa chọn ${i + 1}`}
                      value={option.text}
                      placeholder={`Lựa chọn ${String.fromCharCode(65 + i)}`}
                      onChange={(e) =>
                        update(
                          'options',
                          value.options.map((o) =>
                            o.id === option.id ? { ...o, text: e.target.value } : o,
                          ),
                        )
                      }
                    />
                    {value.type === 'ORDERING' && (
                      <>
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={i === 0}
                          aria-label={`Di chuyển mục ${i + 1} lên`}
                          onClick={() => move(i, -1)}
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          type="button"
                          className="icon-btn"
                          disabled={i === value.options.length - 1}
                          aria-label={`Di chuyển mục ${i + 1} xuống`}
                          onClick={() => move(i, 1)}
                        >
                          <ArrowDown size={15} />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      className="icon-btn"
                      disabled={value.options.length <= 2}
                      aria-label={`Xóa lựa chọn ${i + 1}`}
                      onClick={() => {
                        setValue({
                          ...value,
                          options: value.options.filter((o) => o.id !== option.id),
                          answers: value.answers.filter((a) => a !== option.id),
                        });
                        setDirty(true);
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-link"
                  disabled={value.options.length >= 20}
                  onClick={() => {
                    const id = crypto.randomUUID();
                    setValue({
                      ...value,
                      options: [...value.options, { id, text: '' }],
                      answers: value.type === 'ORDERING' ? [...value.answers, id] : value.answers,
                    });
                    setDirty(true);
                  }}
                >
                  <Plus size={16} /> Thêm lựa chọn
                </button>
              </div>
            )}
            {value.type === 'TRUE_FALSE' && (
              <Field label="Đáp án đúng">
                <select
                  value={value.answers[0]}
                  onChange={(e) => update('answers', [e.target.value])}
                >
                  <option value="true">Đúng</option>
                  <option value="false">Sai</option>
                </select>
              </Field>
            )}
            {['FILL_BLANK', 'SHORT_ANSWER'].includes(value.type) && (
              <Field
                label="Đáp án *"
                hint={
                  value.type === 'FILL_BLANK'
                    ? 'Mỗi dòng là đáp án cho một chỗ trống, đúng thứ tự {{1}}, {{2}}, …'
                    : 'Mỗi dòng là một cách trả lời được chấp nhận.'
                }
              >
                <textarea
                  required
                  rows={4}
                  value={answerText}
                  onChange={(e) => {
                    setAnswerText(e.target.value);
                    update('answers', e.target.value.split('\n'));
                  }}
                />
              </Field>
            )}
            {value.type === 'ESSAY' && (
              <Field
                label="Hướng dẫn chấm / rubric *"
                hint="Nêu các ý cần đạt, tiêu chí và điểm tương ứng. Giáo viên chấm thủ công."
              >
                <textarea
                  required
                  rows={5}
                  maxLength={10000}
                  value={value.rubric}
                  onChange={(e) => update('rubric', e.target.value)}
                />
              </Field>
            )}
            {value.type === 'MATCHING' && (
              <div className="answer-editor">
                <div className="qb-subheading">
                  <b>Các cặp đúng</b>
                  <small>Mỗi dòng là một cặp tương ứng.</small>
                </div>
                {value.pairs.map((pair, i) => (
                  <div className="answer-edit-row" key={i}>
                    <input
                      required
                      maxLength={1000}
                      aria-label={`Vế trái cặp ${i + 1}`}
                      placeholder="Vế trái"
                      value={pair.left}
                      onChange={(e) =>
                        update(
                          'pairs',
                          value.pairs.map((p, j) => (j === i ? { ...p, left: e.target.value } : p)),
                        )
                      }
                    />
                    <span>↔</span>
                    <input
                      required
                      maxLength={1000}
                      aria-label={`Vế phải cặp ${i + 1}`}
                      placeholder="Vế phải"
                      value={pair.right}
                      onChange={(e) =>
                        update(
                          'pairs',
                          value.pairs.map((p, j) =>
                            j === i ? { ...p, right: e.target.value } : p,
                          ),
                        )
                      }
                    />
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label={`Xóa cặp ${i + 1}`}
                      disabled={value.pairs.length <= 2}
                      onClick={() =>
                        update(
                          'pairs',
                          value.pairs.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-link"
                  disabled={value.pairs.length >= 20}
                  onClick={() => update('pairs', [...value.pairs, { left: '', right: '' }])}
                >
                  <Plus size={16} /> Thêm cặp
                </button>
              </div>
            )}
          </section>
          <section className="panel qb-form-section">
            <h2>
              <span>04</span> Giải thích & ghi chú
            </h2>
            <Field label="Giải thích đáp án">
              <textarea
                rows={4}
                maxLength={10000}
                value={value.explanation}
                onChange={(e) => update('explanation', e.target.value)}
                placeholder="Giúp học sinh hiểu vì sao đáp án đúng…"
              />
            </Field>
            <Field label="Tags" hint="Ngăn cách bằng dấu phẩy, tối đa 15 tags.">
              <input
                value={tags}
                placeholder="java, oop, phỏng vấn"
                onChange={(e) => {
                  setTags(e.target.value);
                  setDirty(true);
                }}
              />
            </Field>
            {initial && !review && (
              <Field label="Ghi chú phiên bản">
                <input
                  maxLength={300}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Ví dụ: Làm rõ cách diễn đạt đáp án B"
                />
              </Field>
            )}
          </section>
          <ErrorBox message={error} />
          <div className="qb-editor-footer">
            <button type="button" className="btn btn-secondary" disabled={busy} onClick={leave}>
              Hủy
            </button>
            <button className="btn btn-primary" disabled={busy || imageBusy}>
              {busy ? <Spinner /> : <Save size={17} />} Lưu câu hỏi
            </button>
          </div>
        </div>
        <aside className="qb-preview-panel">
          <div className="qb-preview-label">
            <span className="tiny-dot" /> XEM TRƯỚC TRỰC TIẾP
          </div>
          <QuestionPreview value={value} />
          <p className="qb-preview-note">
            Bản xem trước nội dung. Đáp án chỉ hiển thị trong không gian quản lý.
          </p>
        </aside>
      </div>
    </form>
  );
}
