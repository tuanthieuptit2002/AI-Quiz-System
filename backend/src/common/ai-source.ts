import { Worker } from 'node:worker_threads';
import { lookup } from 'node:dns/promises';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';
import { load } from 'cheerio';
import { httpError } from './http.js';
import { sourceLimit } from './ai.validation.js';
import type { AISource } from '../models/ai-generation.model.js';

export function cleanSource(text: string) {
  const clean = text
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (clean.length < 80)
    httpError(
      400,
      'Không đủ văn bản để phân tích. Với PDF scan, hãy OCR hoặc dán nội dung văn bản (ít nhất 80 ký tự).',
    );
  if (clean.length > sourceLimit)
    httpError(
      400,
      'Nguồn vượt 60.000 ký tự. Hãy chia nhỏ tài liệu hoặc chọn đoạn bài giảng cần dùng.',
    );
  return clean;
}
export async function extractDocument(buffer: Buffer, filename: string): Promise<AISource> {
  if (!buffer.length || buffer.length > 8 * 1024 * 1024) httpError(400, 'Tài liệu tối đa 8 MB.');
  const name = filename
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f]/g, '')
    .slice(0, 200);
  const extension = name.split('.').pop()?.toLowerCase();
  if (extension === 'txt') {
    try {
      return {
        kind: 'TEXT',
        name,
        text: cleanSource(new TextDecoder('utf-8', { fatal: true }).decode(buffer)),
      };
    } catch (e) {
      if ((e as { status?: number }).status) throw e;
      httpError(400, 'File TXT cần mã hóa UTF-8.');
    }
  }
  const kind = extension === 'pdf' ? 'PDF' : extension === 'docx' ? 'DOCX' : null;
  if (!kind) httpError(400, 'Hỗ trợ .pdf, .docx và .txt. Với Word .doc, hãy lưu thành .docx.');
  if (
    (kind === 'PDF' && !buffer.subarray(0, 1024).includes(Buffer.from('%PDF-'))) ||
    (kind === 'DOCX' && !buffer.subarray(0, 2).equals(Buffer.from('PK')))
  )
    httpError(400, 'Nội dung file không khớp định dạng đã chọn.');
  const extensionCode = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
  const module = new URL(`./source-parser.worker.${extensionCode}`, import.meta.url).href;
  const text = await new Promise<string>((resolve, reject) => {
    const worker = new Worker(
      `const {workerData}=require('node:worker_threads');
      (async()=>{if(workerData.module.endsWith('.ts')) {const {tsImport}=await import('tsx/esm/api'); await tsImport(workerData.module,workerData.module);}
      else await import(workerData.module);})().catch(()=>process.exit(1));`,
      {
        eval: true,
        execArgv: [],
        workerData: { module, buffer, kind },
        env: {},
        resourceLimits: { maxOldGenerationSizeMb: 192 },
      },
    );
    const timer = setTimeout(() => {
      void worker.terminate();
      reject(
        Object.assign(new Error('Tài liệu xử lý quá 20 giây. Hãy dùng file nhỏ hơn.'), {
          status: 400,
        }),
      );
    }, 20000);
    const done = () => {
      clearTimeout(timer);
      void worker.terminate();
    };
    worker.once('message', (result: { text?: string; error?: string }) => {
      done();
      if (result.error) reject(Object.assign(new Error(result.error), { status: 400 }));
      else resolve(result.text || '');
    });
    worker.once('error', () => {
      done();
      reject(
        Object.assign(
          new Error('Không thể đọc tài liệu. Hãy kiểm tra định dạng hoặc dùng file nhỏ hơn.'),
          { status: 400 },
        ),
      );
    });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (code)
        reject(
          Object.assign(
            new Error('Bộ đọc tài liệu đã dừng. Hãy kiểm tra file hoặc giảm kích thước.'),
            { status: 400 },
          ),
        );
    });
  });
  return { kind, name, text: cleanSource(text) };
}

export function isPublicAddress(address: string) {
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}
export async function resolvePublicURL(raw: string, resolver: typeof lookup = lookup) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    httpError(400, 'URL không hợp lệ.');
  }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    (url.port && !['80', '443'].includes(url.port))
  )
    httpError(400, 'Chỉ hỗ trợ URL HTTP/HTTPS công khai trên cổng 80/443, không kèm tài khoản.');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: { address: string; family: number }[];
  try {
    addresses = isIP(host)
      ? [{ address: host, family: isIP(host) }]
      : await resolver(host, { all: true, verbatim: true });
  } catch {
    httpError(400, 'Không tìm thấy địa chỉ website.');
  }
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    httpError(400, 'Không thể đọc URL nội bộ hoặc địa chỉ mạng riêng.');
  return { url, address: addresses[0] };
}
export function htmlText(buffer: Buffer) {
  const $ = load(buffer.toString('utf8'));
  $(
    'script,style,noscript,iframe,svg,canvas,nav,footer,header,form,[hidden],[aria-hidden="true"]',
  ).remove();
  $('br').replaceWith('\n');
  $('p,div,li,h1,h2,h3,h4,tr,pre').append('\n');
  const main = $('article').first().length
    ? $('article').first()
    : $('main').first().length
      ? $('main').first()
      : $('body');
  return { name: $('title').text().trim().slice(0, 200), text: cleanSource(main.text()) };
}
export async function readPublicURL(raw: string): Promise<AISource> {
  try {
    let target = raw;
    const signal = AbortSignal.timeout(15000);
    for (let redirects = 0; redirects <= 3; redirects++) {
      const { url, address } = await Promise.race([
        resolvePublicURL(target),
        new Promise<never>((_resolve, reject) => {
          if (signal.aborted) reject(new Error());
          else signal.addEventListener('abort', () => reject(new Error()), { once: true });
        }),
      ]);
      const result = await new Promise<{ redirect?: string; body?: Buffer; contentType?: string }>(
        (resolve, reject) => {
          const request = url.protocol === 'https:' ? httpsRequest : httpRequest;
          const req = request(
            url,
            {
              signal,
              agent: false,
              family: address.family,
              headers: {
                'User-Agent': 'QuizSpace/1.0 (teaching source reader)',
                Accept: 'text/html,text/plain',
                'Accept-Encoding': 'identity',
              },
              // Pin the validated DNS answer for the connection, including all redirect hops.
              lookup: (_hostname, options, callback) =>
                options.all
                  ? callback(null, [address])
                  : callback(null, address.address, address.family),
            },
            (response) => {
              if (
                [301, 302, 303, 307, 308].includes(response.statusCode || 0) &&
                response.headers.location
              ) {
                response.destroy();
                resolve({ redirect: new URL(response.headers.location, url).href });
                return;
              }
              const type = response.headers['content-type'] || '';
              if (
                response.statusCode !== 200 ||
                !/^text\/(html|plain)(;|$)/i.test(type) ||
                (response.headers['content-encoding'] &&
                  response.headers['content-encoding'] !== 'identity')
              ) {
                response.destroy();
                reject(
                  new Error(
                    'Website không trả văn bản HTML/TXT công khai. Hãy sao chép nội dung bài giảng.',
                  ),
                );
                return;
              }
              let size = 0;
              const parts: Buffer[] = [];
              response.on('data', (part: Buffer) => {
                size += part.length;
                if (size > 2 * 1024 * 1024) {
                  response.destroy();
                  reject(new Error('Nội dung URL vượt 2 MB.'));
                } else parts.push(part);
              });
              response.on('error', reject);
              response.on('end', () => resolve({ body: Buffer.concat(parts), contentType: type }));
            },
          );
          req.on('error', reject);
          req.end();
        },
      );
      if (result.redirect) {
        target = result.redirect;
        continue;
      }
      const content = result.contentType!.startsWith('text/html')
        ? htmlText(result.body!)
        : { text: cleanSource(result.body!.toString('utf8')) };
      return { kind: 'URL', name: url.href.slice(0, 300), text: content.text };
    }
    httpError(400, 'URL chuyển hướng quá nhiều lần.');
  } catch (error) {
    if ((error as { status?: number }).status) throw error;
    httpError(
      400,
      'Không đọc được URL trong 15 giây. Dùng trang công khai HTML/TXT hoặc dán nội dung trực tiếp.',
    );
  }
}
