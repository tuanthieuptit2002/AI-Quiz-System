import nodemailer from 'nodemailer';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Config } from './config.js';

export async function sendResetEmail(email: string, link: string, config: Config) {
  const message = {
    from: config.smtpFrom,
    to: email,
    subject: 'Đặt lại mật khẩu QuizSpace',
    text: `Bạn đã yêu cầu đặt lại mật khẩu QuizSpace.\n\nMở liên kết sau trong 30 phút:\n${link}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
  };
  if (config.smtpHost) {
    const transport = nodemailer.createTransport({
      host: config.smtpHost,
      port: config.smtpPort,
      secure: config.smtpPort === 465,
      auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
      connectionTimeout: 10000,
      socketTimeout: 15000,
    });
    await transport.sendMail(message);
  } else {
    if (config.production) throw new Error('SMTP is required in production');
    await mkdir(config.mailDirectory, { recursive: true, mode: 0o700 });
    await writeFile(
      join(config.mailDirectory, `${Date.now()}-${randomUUID()}.json`),
      JSON.stringify(message, null, 2),
      { mode: 0o600 },
    );
    console.log('Email phát triển đã lưu trong thư mục .mail (SMTP chưa cấu hình).');
  }
}
