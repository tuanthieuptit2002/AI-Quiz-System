import ExcelJS from 'exceljs';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import yauzl from 'yauzl';
import type { QuestionContent } from '../models/question.model.js';
import { httpError } from './http.js';

export const transferColumns = [
  'type',
  'subject',
  'topicPath',
  'difficulty',
  'status',
  'question',
  'options',
  'answers',
  'pairs',
  'rubric',
  'explanation',
  'tags',
  'image',
  'imageAlt',
] as const;
const jsonColumns = new Set(['topicPath', 'options', 'answers', 'pairs', 'tags']);
export const transferLimit = 100;
const byteLimit = 8 * 1024 * 1024;
const formulaStart = /^[=+\-@\t\r'\uFF1D\uFF0B\uFF0D\uFF20]/;
// Escape spreadsheet formulas reversibly, including an existing apostrophe.
const escapeCell = (s: string) => (formulaStart.test(s) ? `'${s}` : s);
const unescapeCell = (s: string) =>
  s.startsWith("'") && formulaStart.test(s.slice(1)) ? s.slice(1) : s;

async function checkZip(buffer: Buffer) {
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(new Error('File Excel không hợp lệ.'));
      let bytes = 0;
      let entries = 0;
      const fail = (error: Error) => {
        zip.close();
        reject(error);
      };
      zip.on('error', fail);
      zip.on('end', resolve);
      zip.on('entry', (entry: yauzl.Entry) => {
        bytes += entry.uncompressedSize;
        entries++;
        if (bytes > 24 * 1024 * 1024 || entries > 200 || entry.isEncrypted()) {
          zip.close();
          reject(new Error('File Excel quá lớn hoặc được mã hóa.'));
        } else {
          // Validate actual inflated sizes before ExcelJS loads the archive into memory.
          zip.openReadStream(entry, (error, stream) => {
            if (error || !stream) return fail(error || new Error('Không đọc được file Excel.'));
            stream.on('error', fail);
            stream.on('end', () => zip.readEntry());
            stream.resume();
          });
        }
      });
      zip.readEntry();
    });
  });
}

export async function readQuestionFile(buffer: Buffer, format: 'csv' | 'xlsx') {
  if (!buffer.length || buffer.length > byteLimit)
    httpError(400, 'File phải có nội dung và không vượt quá 8 MB.');
  let records: string[][] = [];
  const images = new Map<string, string>();
  try {
    if (format === 'csv') {
      records = parse(buffer, {
        bom: true,
        skip_empty_lines: true,
        max_record_size: 1000000,
        to: transferLimit + 2,
      });
    } else {
      await checkZip(buffer);
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
      const sheet = workbook.getWorksheet('Questions');
      if (
        !sheet ||
        sheet.rowCount > transferLimit + 1 ||
        sheet.columnCount !== transferColumns.length
      )
        throw new Error('Dùng sheet Questions trong file mẫu, tối đa 100 câu hỏi.');
      const cellString = (cell: ExcelJS.Cell) => {
        if (cell.value === null || cell.value === undefined) return '';
        if (
          typeof cell.value === 'string' ||
          typeof cell.value === 'number' ||
          typeof cell.value === 'boolean'
        )
          return String(cell.value);
        throw new Error(
          'Không hỗ trợ công thức, liên kết hoặc rich text trong ô. Hãy dán dạng văn bản.',
        );
      };
      sheet.eachRow((row) =>
        records.push(transferColumns.map((_, i) => cellString(row.getCell(i + 1)))),
      );
      const imageSheet = workbook.getWorksheet('Images');
      if (imageSheet) {
        if (imageSheet.rowCount > 600 || imageSheet.columnCount > 3)
          throw new Error('Sheet Images vượt giới hạn.');
        const parts = new Map<string, number>();
        imageSheet.eachRow((row, n) => {
          if (n === 1) return;
          const key = cellString(row.getCell(1));
          const part = Number(cellString(row.getCell(2)));
          const value = cellString(row.getCell(3));
          if (part !== (parts.get(key) || 0) + 1 || value.length > 24000)
            throw new Error('Dữ liệu hình ảnh bị thiếu hoặc sai thứ tự.');
          parts.set(key, part);
          images.set(key, (images.get(key) || '') + value);
        });
      }
    }
  } catch (error) {
    httpError(
      400,
      format === 'xlsx'
        ? (error as Error).message
        : 'CSV không hợp lệ. Dùng UTF-8, dấu phẩy và cấu trúc file mẫu.',
    );
  }
  const headers = records.shift();
  if (
    !headers ||
    headers.length !== transferColumns.length ||
    headers.some((v, i) => v !== transferColumns[i])
  )
    httpError(400, 'Các cột không khớp file mẫu. Hãy tải lại mẫu Excel/CSV.');
  if (!records.length || records.length > transferLimit)
    httpError(400, 'Mỗi file cần từ 1 đến 100 câu hỏi.');
  return records.map((values, index) => {
    try {
      const row: Record<string, unknown> = {};
      transferColumns.forEach((key, i) => {
        let value = values[i] || '';
        if (format === 'csv') value = unescapeCell(value);
        if (key === 'image' && value.startsWith('image:')) {
          const image = images.get(value);
          if (!image) throw new Error('Không tìm thấy dữ liệu ảnh trong sheet Images.');
          value = image;
        }
        row[key] = jsonColumns.has(key) ? JSON.parse(value || '[]') : value;
      });
      return { row: index + 2, data: row, error: '' };
    } catch {
      return {
        row: index + 2,
        data: null,
        error:
          'JSON hoặc dữ liệu hình ảnh không hợp lệ. Kiểm tra topicPath, options, answers, pairs, tags và image.',
      };
    }
  });
}

export async function writeQuestionFile(questions: QuestionContent[], format: 'csv' | 'xlsx') {
  const rows = questions.map((q) =>
    transferColumns.map((key) => (jsonColumns.has(key) ? JSON.stringify(q[key]) : String(q[key]))),
  );
  let buffer: Buffer;
  if (format === 'csv')
    buffer = Buffer.from(
      stringify([transferColumns, ...rows.map((r) => r.map(escapeCell))], { bom: true }),
    );
  else {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'QuizSpace';
    const sheet = workbook.addWorksheet('Questions', { views: [{ state: 'frozen', ySplit: 1 }] });
    const images = workbook.addWorksheet('Images');
    images.addRow(['key', 'part', 'data']);
    sheet.addRow([...transferColumns]);
    rows.forEach((row, index) => {
      const imageIndex = transferColumns.indexOf('image');
      if (row[imageIndex]) {
        const key = `image:${index + 1}`;
        const value = row[imageIndex];
        for (let i = 0; i < value.length; i += 24000)
          images.addRow([key, i / 24000 + 1, value.slice(i, i + 24000)]);
        row[imageIndex] = key;
      }
      sheet.addRow(row);
    });
    sheet.columns.forEach((column, i) => {
      column.width = ['question', 'explanation', 'rubric'].includes(transferColumns[i]) ? 55 : 24;
    });
    sheet.eachRow((row, n) => {
      row.alignment = { vertical: 'top', wrapText: true };
      row.height = n === 1 ? 26 : 70;
      if (n === 1) {
        row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16896C' } };
      }
    });
    sheet.autoFilter = { from: 'A1', to: 'N1' };
    images.state = 'hidden';
    buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  }
  if (buffer.length > byteLimit) httpError(400, 'File xuất vượt 8 MB. Hãy lọc ít câu hỏi hơn.');
  return buffer;
}

export function sampleQuestions(): QuestionContent[] {
  const base = {
    subject: 'Java',
    topicPath: ['Java Core', 'OOP'],
    difficulty: 'EASY' as const,
    status: 'DRAFT' as const,
    options: [],
    answers: [],
    pairs: [],
    rubric: '',
    explanation: '',
    tags: ['java', 'mẫu'],
    image: '',
    imageAlt: '',
  };
  return [
    {
      ...base,
      type: 'SINGLE_CHOICE',
      question: 'Từ khóa nào dùng để kế thừa lớp trong Java?',
      options: [
        { id: 'a', text: 'extends' },
        { id: 'b', text: 'implements' },
      ],
      answers: ['a'],
      explanation: 'extends dùng để kế thừa lớp.',
    },
    {
      ...base,
      type: 'MULTIPLE_CHOICE',
      question: 'Chọn các tính chất của lập trình hướng đối tượng.',
      options: [
        { id: 'a', text: 'Đóng gói' },
        { id: 'b', text: 'Kế thừa' },
        { id: 'c', text: 'Biên dịch' },
      ],
      answers: ['a', 'b'],
    },
    { ...base, type: 'TRUE_FALSE', question: 'Java hỗ trợ đa kế thừa lớp.', answers: ['false'] },
    {
      ...base,
      type: 'FILL_BLANK',
      question: 'Dùng từ khóa {{1}} để tạo đối tượng.',
      answers: ['new'],
    },
    {
      ...base,
      type: 'SHORT_ANSWER',
      question: 'OOP là viết tắt của cụm từ nào?',
      answers: ['Object Oriented Programming', 'Object-Oriented Programming'],
    },
    {
      ...base,
      type: 'ESSAY',
      question: 'Giải thích tính đóng gói và cho ví dụ.',
      rubric: 'Định nghĩa: 4 điểm; ví dụ Java: 4 điểm; phân tích lợi ích: 2 điểm.',
    },
    {
      ...base,
      type: 'MATCHING',
      question: 'Ghép từ khóa với chức năng.',
      pairs: [
        { left: 'extends', right: 'Kế thừa lớp' },
        { left: 'implements', right: 'Triển khai interface' },
      ],
    },
    {
      ...base,
      type: 'ORDERING',
      question: 'Sắp xếp các bước chạy chương trình Java.',
      options: [
        { id: 'a', text: 'Viết mã nguồn' },
        { id: 'b', text: 'Biên dịch' },
        { id: 'c', text: 'Chạy trên JVM' },
      ],
      answers: ['a', 'b', 'c'],
    },
  ];
}
