'use client';
import { useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react';
import { api, downloadFile } from '@/lib/api';
import { typeLabels, type QuestionType } from '@/lib/questions';
import { ErrorBox, Modal, Spinner } from '../ui';

interface Preview {
  total: number;
  valid: number;
  errors: { row: number; message: string }[];
  importId: string | null;
  preview: { question: string; type: QuestionType; subject: string; topicPath: string[] }[];
}
export function QuestionImport({
  close,
  imported,
}: {
  close: () => void;
  imported: (count: number) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function template(format: 'xlsx' | 'csv') {
    setBusy(true);
    setError('');
    try {
      await downloadFile(`/questions/template?format=${format}`, `quizspace-template.${format}`);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function preview() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      setResult(
        await api<Preview>(
          `/questions/import/preview?format=${file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx'}`,
          { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file },
        ),
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    if (!result?.importId) return;
    setBusy(true);
    setError('');
    try {
      const response = await api<{ count: number }>(`/questions/import/${result.importId}/commit`, {
        method: 'POST',
      });
      imported(response.count);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      wide
      title="Nhập ngân hàng câu hỏi"
      description="Excel (.xlsx) hoặc CSV UTF-8 · tối đa 100 câu hỏi / 8 MB mỗi lần."
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="qb-import-guide">
        <FileSpreadsheet size={28} />
        <div>
          <b>Bắt đầu từ file mẫu</b>
          <p>
            Mẫu có đủ 8 dạng câu hỏi. Giữ nguyên tên và thứ tự cột. Các cột topicPath, options,
            answers, pairs, tags dùng mảng JSON.
          </p>
        </div>
        <div className="qb-actions">
          <button
            className="btn btn-secondary small"
            disabled={busy}
            onClick={() => template('xlsx')}
          >
            <Download size={15} /> Excel
          </button>
          <button
            className="btn btn-secondary small"
            disabled={busy}
            onClick={() => template('csv')}
          >
            CSV
          </button>
        </div>
      </div>
      <label className="qb-upload">
        <Upload size={27} />
        <b>{file?.name || 'Chọn file Excel hoặc CSV'}</b>
        <span>
          {file
            ? `${(file.size / 1024).toFixed(1)} KB · Nhấn để đổi file`
            : 'Chọn file để kiểm tra nội dung trước khi nhập'}
        </span>
        <input
          type="file"
          accept=".xlsx,.csv"
          disabled={busy}
          onChange={(e) => {
            const next = e.target.files?.[0];
            setResult(null);
            setError('');
            setFile(null);
            if (!next) return;
            if (!/\.(xlsx|csv)$/i.test(next.name) || next.size > 8 * 1024 * 1024) {
              setError('Chọn file .xlsx hoặc .csv tối đa 8 MB.');
              return;
            }
            setFile(next);
          }}
        />
      </label>
      <ErrorBox message={error} />
      {result && (
        <div className="qb-import-result">
          <div className={`qb-import-summary ${result.errors.length ? 'has-errors' : ''}`}>
            <CheckCircle2 size={19} />
            <b>
              {result.valid}/{result.total} dòng hợp lệ
            </b>
            <span>
              {result.errors.length
                ? 'Chưa lưu dữ liệu. Sửa lỗi và chọn lại file.'
                : 'Sẵn sàng nhập. Bản xem trước có hiệu lực 15 phút.'}
            </span>
          </div>
          {result.errors.length ? (
            <ul className="qb-import-errors">
              {result.errors.map((error) => (
                <li key={error.row}>
                  <b>Dòng {error.row}</b>
                  <span>{error.message}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="qb-import-preview">
              {result.preview.map((q, i) => (
                <div key={i}>
                  <span>{i + 1}</span>
                  <div>
                    <b>{q.question}</b>
                    <small>
                      {q.subject} / {q.topicPath.join(' / ')} · {typeLabels[q.type]}
                    </small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="qb-import-note">
        Mỗi dòng tạo một câu hỏi mới thuộc tài khoản của bạn. Nội dung, đáp án và hình ảnh đều được
        kiểm tra; không ghi đè câu hỏi đang có.
      </p>
      <div className="modal-actions">
        <button className="btn btn-secondary" disabled={busy} onClick={close}>
          Hủy
        </button>
        {result?.importId ? (
          <button className="btn btn-primary" disabled={busy} onClick={commit}>
            {busy ? <Spinner /> : <CheckCircle2 size={17} />} Nhập {result.valid} câu hỏi
          </button>
        ) : (
          <button className="btn btn-primary" disabled={!file || busy} onClick={preview}>
            {busy ? <Spinner /> : <Upload size={17} />} Kiểm tra file
          </button>
        )}
      </div>
    </Modal>
  );
}
