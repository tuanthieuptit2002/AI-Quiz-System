export interface Config {
  jwtSecret: string;
  frontendUrl: string;
  production: boolean;
  googleClientId: string;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  mailDirectory: string;
}
export function loadConfig(): Config {
  const jwtSecret = process.env.JWT_SECRET || '';
  if (jwtSecret.length < 32 || jwtSecret.startsWith('replace-with'))
    throw new Error('JWT_SECRET phải có ít nhất 32 ký tự ngẫu nhiên.');
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
  new URL(frontendUrl);
  return {
    jwtSecret,
    frontendUrl: frontendUrl.replace(/\/$/, ''),
    production: process.env.NODE_ENV === 'production',
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: Number(process.env.SMTP_PORT || 587),
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    smtpFrom: process.env.SMTP_FROM || 'QuizSpace <noreply@example.com>',
    mailDirectory: process.env.MAIL_DIRECTORY || '.mail',
  };
}
