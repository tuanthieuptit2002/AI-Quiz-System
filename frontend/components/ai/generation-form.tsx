'use client';
import { useRef, useState, type FormEvent } from 'react';
import {
  ArrowRight,
  Check,
  CheckCheck,
  ChevronRight,
  FileText,
  Globe,
  PenLine,
  Sparkles,
  UploadCloud,
  WandSparkles,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { api, jsonBody } from '@/lib/api';
import { sourceLabels, type AIJob, type AISource, type AIStatus } from '@/lib/ai';
import { difficultyLabels, typeLabels, type QuestionContent } from '@/lib/questions';
import { ErrorBox, Field, Spinner } from '../ui';
const initialSource: AISource = { kind: 'PROMPT', name: '', text: '' };
export function GenerationForm({
  configured,
  disabled,
  onStart,
}: {
  configured: AIStatus | null;
  disabled: boolean;
  onStart: (job: AIJob) => void;
}) {
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [difficulty, setDifficulty] = useState<QuestionContent['difficulty']>('MEDIUM');
  const [type, setType] = useState<QuestionContent['type']>('SINGLE_CHOICE');
  const [count, setCount] = useState(20);
  const [language, setLanguage] = useState<'vi' | 'en'>('vi');
  const [instructions, setInstructions] = useState('');
  const [source, setSource] = useState<AISource>(initialSource);
  const [mode, setMode] = useState<'PROMPT' | 'TEXT' | 'FILE' | 'URL'>('PROMPT');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<{ fingerprint: string; id: string } | null>(null);
  async function extract(file?: File) {
    if (!file) return;
    setError('');
    if (file.size > 8 * 1024 * 1024 || !file.name.match(/\.(pdf|docx|txt)$/i)) {
      setError('Chọn PDF, Word .docx hoặc TXT tối đa 8 MB.');
      return;
    }
    setReading(true);
    try {
      setSource(
        await api<AISource>(`/ai/source/file?filename=${encodeURIComponent(file.name)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/octet-stream' },
          body: file,
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  }
  async function readURL() {
    setReading(true);
    setError('');
    try {
      setSource(await api<AISource>('/ai/source/url', { method: 'POST', body: jsonBody({ url }) }));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || reading || disabled || !configured?.configured) return;
    setError('');
    const topicPath = topic
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!topicPath.length) {
      setError('Vui lòng nhập chủ đề.');
      return;
    }
    if (mode !== 'PROMPT' && (source.kind === 'PROMPT' || source.text.trim().length < 80)) {
      setError('Cần đọc nguồn và có ít nhất 80 ký tự nội dung trước khi tạo.');
      return;
    }
    const input = {
      settings: { subject, topicPath, difficulty, type, count, language, instructions },
      source,
    };
    const fingerprint = JSON.stringify(input);
    if (request.current?.fingerprint !== fingerprint)
      request.current = { fingerprint, id: crypto.randomUUID() };
    setBusy(true);
    try {
      const job = await api<AIJob>('/ai/generations', {
        method: 'POST',
        body: jsonBody({ ...input, requestId: request.current.id }),
      });
      onStart(job);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="ai-intro">
        <div className="ai-intro-content">
          <span className="ai-pill">
            <Sparkles size={14} />
            DEEPSEEK × QUIZSPACE
          </span>
          <h2>
            Một tài liệu. <br />
            Nhiều cách kiểm tra kiến thức.
          </h2>
          <p>
            Từ chủ đề, bài giảng hay tài liệu chuyên môn — tạo câu hỏi có đáp án và giải thích chỉ
            trong vài bước.
          </p>
          <div className="ai-intro-tags">
            <span>
              <Check size={14} />8 dạng câu hỏi
            </span>
            <span>
              <Check size={14} />4 mức độ khó
            </span>
            <span>
              <Check size={14} />
              Bạn luôn có quyền duyệt
            </span>
          </div>
        </div>
        <div className="ai-intro-art" aria-hidden="true">
          <div className="ai-art-orbit" />
          <div className="ai-art-document">
            <FileText size={28} />
            <i />
            <i />
            <i />
            <span>Kiến thức của bạn</span>
          </div>
          <div className="ai-art-spark">
            <Sparkles size={27} />
          </div>
          <div className="ai-art-question">
            <span>CÂU HỎI CHẤT LƯỢNG</span>
            <b>Từ kiến thức đến thấu hiểu</b>
            <div>
              <i>A</i>
              <em />
              <Check size={15} />
            </div>
            <div>
              <i>B</i>
              <em />
            </div>
            <small>Đáp án + Giải thích</small>
          </div>
        </div>
      </section>
      {configured && !configured.configured && (
        <div className="ai-setup-note">
          <AlertCircle size={20} />
          <div>
            <b>AI chưa được cấu hình</b>
            <p>
              Quản trị viên cần thêm DEEPSEEK_API_KEY trong backend/.env và khởi động lại backend.
            </p>
          </div>
        </div>
      )}
      <form className="ai-create-layout" onSubmit={submit}>
        <div className="ai-form-main">
          <section className="panel ai-form-section">
            <div className="ai-panel-heading">
              <h2>
                <span className="ai-step">01</span>Nguồn kiến thức
              </h2>
              <small>Bắt đầu với những gì bạn có</small>
            </div>
            <div className="ai-source-tabs">
              {(
                [
                  { key: 'PROMPT', label: 'Chủ đề / Prompt', icon: WandSparkles },
                  { key: 'TEXT', label: 'Văn bản / Bài giảng', icon: PenLine },
                  { key: 'FILE', label: 'PDF / Word', icon: UploadCloud },
                  { key: 'URL', label: 'Website URL', icon: Globe },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  disabled={reading || busy}
                  className={mode === tab.key ? 'active' : ''}
                  onClick={() => {
                    if (mode === tab.key) return;
                    if (
                      source.text &&
                      !window.confirm('Đổi loại nguồn sẽ bỏ nội dung nguồn hiện tại. Tiếp tục?')
                    )
                      return;
                    setMode(tab.key);
                    setSource(
                      tab.key === 'TEXT'
                        ? { kind: 'TEXT', name: 'Văn bản bài giảng', text: '' }
                        : initialSource,
                    );
                    setError('');
                  }}
                >
                  <tab.icon size={19} />
                  <span>{tab.label}</span>
                </button>
              ))}
            </div>
            {mode === 'PROMPT' && (
              <div className="ai-prompt-note">
                <WandSparkles size={22} />
                <div>
                  <b>Bạn chọn chủ đề, AI xây dựng câu hỏi</b>
                  <p>
                    Điền môn học, chủ đề và yêu cầu bên dưới. Muốn câu hỏi bám sát bài giảng, hãy
                    chọn nguồn văn bản hoặc tài liệu.
                  </p>
                </div>
              </div>
            )}
            {mode === 'FILE' && (
              <label className={`ai-upload ${reading ? 'reading' : ''}`}>
                <input
                  type="file"
                  accept=".pdf,.docx,.txt"
                  disabled={reading || busy}
                  onChange={(e) => {
                    void extract(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
                {reading ? <Spinner /> : <UploadCloud size={30} />}
                <b>
                  {reading
                    ? 'Đang đọc nội dung tài liệu…'
                    : source.name || 'Chọn tài liệu từ máy tính'}
                </b>
                <span>PDF, Word (.docx), TXT · Tối đa 8 MB</span>
                <small>
                  PDF có lớp văn bản · Tối đa 100 trang · Không hỗ trợ PDF scan chưa OCR
                </small>
              </label>
            )}
            {mode === 'URL' && (
              <div className="ai-url-field">
                <Field label="Đường dẫn bài giảng hoặc tài liệu công khai">
                  <input
                    type="url"
                    value={url}
                    maxLength={2000}
                    onChange={(e) => {
                      setUrl(e.target.value);
                      setSource(initialSource);
                    }}
                    placeholder="https://example.com/bai-giang"
                    disabled={reading || busy}
                  />
                </Field>
                <button
                  className="btn btn-secondary"
                  type="button"
                  disabled={!url || reading || busy}
                  onClick={() => void readURL()}
                >
                  {reading ? <Spinner /> : <Globe size={17} />}Đọc URL
                </button>
                <small>
                  Đọc trang HTML/TXT công khai. Trang cần đăng nhập hoặc chạy JavaScript: hãy dán
                  nội dung văn bản.
                </small>
              </div>
            )}
            {(mode === 'TEXT' || source.text) && (
              <div className="ai-source-preview">
                <Field
                  label={
                    mode === 'TEXT'
                      ? 'Nội dung bài giảng *'
                      : 'Nội dung đã đọc — bạn có thể chọn lọc và chỉnh sửa'
                  }
                >
                  <textarea
                    rows={9}
                    maxLength={60000}
                    value={source.text}
                    disabled={busy || reading}
                    onChange={(e) => setSource({ ...source, text: e.target.value })}
                    placeholder="Dán văn bản hoặc nội dung bài giảng vào đây (ít nhất 80 ký tự)…"
                  />
                </Field>
                <div>
                  <span>{source.name || 'Văn bản tham chiếu'}</span>
                  <small>{source.text.length.toLocaleString('vi-VN')} / 60.000 ký tự</small>
                </div>
              </div>
            )}
          </section>
          <section className="panel ai-form-section">
            <div className="ai-panel-heading">
              <h2>
                <span className="ai-step">02</span>Thiết kế bộ câu hỏi
              </h2>
              <small>Điều chỉnh theo mục tiêu giảng dạy</small>
            </div>
            <div className="form-grid">
              <Field label="Môn học *">
                <input
                  required
                  maxLength={100}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Ví dụ: Java"
                />
              </Field>
              <Field label="Chủ đề *" hint="Dùng / để chia cấp: Java Core / OOP">
                <input
                  required
                  maxLength={520}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Ví dụ: Java Spring Boot"
                />
              </Field>
              <Field label="Dạng câu hỏi">
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as QuestionContent['type'])}
                >
                  {Object.entries(typeLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Độ khó">
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as QuestionContent['difficulty'])}
                >
                  {Object.entries(difficultyLabels).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Số câu hỏi" hint="1–50 câu mỗi đợt">
                <input
                  required
                  type="number"
                  min={1}
                  max={50}
                  value={count}
                  onChange={(e) => setCount(Number(e.target.value))}
                />
              </Field>
              <Field label="Ngôn ngữ">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value as 'vi' | 'en')}
                >
                  <option value="vi">Tiếng Việt</option>
                  <option value="en">English</option>
                </select>
              </Field>
            </div>
            <Field
              label="Yêu cầu bổ sung / Prompt"
              hint={
                mode === 'PROMPT'
                  ? 'AI dùng yêu cầu này cùng chủ đề và nguồn bạn chọn.'
                  : 'Không bắt buộc. Để trống, AI tự đọc tài liệu và tạo câu hỏi bao quát toàn bộ nội dung.'
              }
            >
              <textarea
                maxLength={2000}
                rows={4}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="Ví dụ: Tập trung vào Dependency Injection, REST API, JPA. Ưu tiên câu hỏi tình huống, tránh học thuộc."
              />
            </Field>
            <ErrorBox message={error} />
          </section>
        </div>
        <aside className="ai-create-aside">
          <div className="panel ai-summary">
            <span className="ai-summary-icon">
              <Sparkles size={25} />
            </span>
            <span className="eyebrow">BẢN THIẾT KẾ CỦA BẠN</span>
            <h3>{topic || 'Bộ câu hỏi mới'}</h3>
            <p>{subject || 'Môn học chưa chọn'}</p>
            <dl>
              <div>
                <dt>Số lượng</dt>
                <dd>{count || 0} câu</dd>
              </div>
              <div>
                <dt>Dạng câu hỏi</dt>
                <dd>{typeLabels[type]}</dd>
              </div>
              <div>
                <dt>Độ khó</dt>
                <dd>{difficultyLabels[difficulty]}</dd>
              </div>
              <div>
                <dt>Ngôn ngữ</dt>
                <dd>{language === 'vi' ? 'Tiếng Việt' : 'English'}</dd>
              </div>
              <div>
                <dt>Nguồn</dt>
                <dd>{mode === 'FILE' ? 'Tài liệu' : sourceLabels[mode]}</dd>
              </div>
            </dl>
            {['SINGLE_CHOICE', 'MULTIPLE_CHOICE'].includes(type) && (
              <p className="ai-choice-note">
                4 lựa chọn / câu ·{' '}
                {type === 'SINGLE_CHOICE' ? '1 đáp án đúng' : 'Nhiều đáp án đúng'}
              </p>
            )}
            <button
              className="btn btn-primary ai-generate-button"
              disabled={disabled || busy || reading || !configured?.configured}
            >
              {busy ? <Spinner /> : <WandSparkles size={18} />}Tạo câu hỏi với AI
              <ArrowRight size={17} />
            </button>
            <small className="ai-data-note">
              Nội dung nguồn và yêu cầu sẽ được gửi đến DeepSeek để tạo câu hỏi.
            </small>
            <div className="ai-model-label">
              <span className={configured?.configured ? 'tiny-dot' : ''} />
              {configured?.model || 'DeepSeek'}
            </div>
          </div>
          <div className="ai-review-promise">
            <ShieldCheck size={21} />
            <div>
              <b>Chất lượng nằm trong tay bạn</b>
              <p>
                Mọi câu hỏi đều ở trạng thái chờ duyệt. Kiểm tra đáp án, chỉnh sửa và chỉ thêm vào
                ngân hàng khi bạn hài lòng.
              </p>
            </div>
          </div>
          <div className="ai-flow">
            <span>
              <FileText size={16} />
              Chọn nguồn
            </span>
            <ChevronRight size={15} />
            <span>
              <Sparkles size={16} />
              AI soạn
            </span>
            <ChevronRight size={15} />
            <span>
              <CheckCheck size={16} />
              Bạn duyệt
            </span>
          </div>
        </aside>
      </form>
    </>
  );
}
