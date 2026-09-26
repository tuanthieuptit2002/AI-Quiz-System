import { rateLimit } from 'express-rate-limit';
import type { Express } from 'express';

export function applyRateLimits(app: Express) {
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 180,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.' },
    }),
  );
  const authLimit = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Quá nhiều lần thử. Vui lòng thử lại sau 15 phút.' },
  });
  app.use(
    ['/api/auth/login', '/api/auth/register', '/api/auth/google', '/api/auth/reset-password'],
    authLimit,
  );
  app.use(
    '/api/auth/forgot-password',
    rateLimit({
      windowMs: 15 * 60000,
      limit: 5,
      message: { message: 'Vui lòng chờ trước khi yêu cầu email tiếp theo.' },
    }),
  );
}
