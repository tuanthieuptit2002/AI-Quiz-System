import { parentPort, workerData } from 'node:worker_threads';
import yauzl from 'yauzl';
import { load } from 'cheerio';

async function docxText(buffer: Buffer) {
  return new Promise<string>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(new Error('File Word không hợp lệ. Chỉ hỗ trợ .docx.'));
      let total = 0,
        entries = 0;
      let document: Buffer | null = null;
      const fail = (error: Error) => {
        zip.close();
        reject(error);
      };
      zip.on('error', fail);
      zip.on('entry', (entry: yauzl.Entry) => {
        total += entry.uncompressedSize;
        if (++entries > 500 || total > 24 * 1024 * 1024 || entry.isEncrypted())
          return fail(new Error('File Word quá lớn sau giải nén hoặc được mã hóa.'));
        if (entry.fileName !== 'word/document.xml') return zip.readEntry();
        if (document || entry.uncompressedSize > 4 * 1024 * 1024)
          return fail(new Error('Nội dung Word vượt giới hạn hoặc không hợp lệ.'));
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return fail(new Error('Không đọc được file Word.'));
          const chunks: Buffer[] = [];
          let bytes = 0;
          stream.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 4 * 1024 * 1024) {
              stream.destroy();
              fail(new Error('Nội dung Word quá lớn.'));
            } else chunks.push(chunk);
          });
          stream.on('error', fail);
          stream.on('end', () => {
            document = Buffer.concat(chunks);
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => {
        if (!document) return reject(new Error('Không tìm thấy nội dung trong file .docx.'));
        const $ = load((document as Buffer).toString('utf8'), { xmlMode: true });
        const paragraphs = $('w\\:p')
          .map((_i, element) =>
            $(element)
              .find('w\\:t')
              .map((_j, run) => $(run).text())
              .get()
              .join(''),
          )
          .get();
        resolve(paragraphs.join('\n'));
      });
      zip.readEntry();
    });
  });
}
async function extract() {
  const buffer = Buffer.from(workerData.buffer);
  if (workerData.kind === 'DOCX') return docxText(buffer);
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: false,
    disableFontFace: true,
    useWorkerFetch: false,
    verbosity: 0,
  });
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 100)
      throw new Error('PDF tối đa 100 trang. Hãy tách tài liệu thành phần nhỏ hơn.');
    let text = '';
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      // PDFs split words into runs at every font or glyph change (Vietnamese diacritics especially),
      // so a space is only real when there is a visible gap between runs.
      let last: { end: number; y: number; size: number } | null = null;
      text += '\n';
      for (const item of content.items) {
        if (!('str' in item)) continue;
        const [, , c, d, x, y] = item.transform;
        const size = Math.hypot(c, d) || item.height || 10;
        if (last) {
          if (Math.abs(y - last.y) > last.size * 0.5) text += '\n';
          else if (
            x - last.end > last.size * 0.15 &&
            !/\s/.test(text.at(-1) || '') &&
            !/^\s/.test(item.str)
          )
            text += ' ';
        }
        text += item.str;
        last = item.hasEOL ? null : { end: x + item.width, y, size };
        if (item.hasEOL) text += '\n';
      }
      page.cleanup();
      if (text.length > 100000)
        throw new Error('Tài liệu quá dài. Hãy tách thành các phần nhỏ hơn.');
    }
    return text;
  } finally {
    await task.destroy();
  }
}
void extract()
  .then((text) => parentPort!.postMessage({ text }))
  .catch((error) => {
    const name = (error as Error).name;
    parentPort!.postMessage({
      error:
        name === 'PasswordException'
          ? 'PDF có mật khẩu. Hãy dùng bản đã mở khóa.'
          : name === 'InvalidPDFException'
            ? 'File PDF không hợp lệ.'
            : (error as Error).message,
    });
  });
