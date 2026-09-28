import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Db } from 'mongodb';
import type { Config } from './common/config.js';
import { sendResetEmail } from './common/mail.js';
import { createHealthController } from './controllers/health.controller.js';
import { requestGuard } from './middleware/request.middleware.js';
import { applyRateLimits } from './middleware/rate-limit.middleware.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';
import { createApiRoutes } from './routes/index.js';

export function createApp(
  db: Db,
  config: Config,
  options: {
    rateLimits?: boolean;
    mailer?: typeof sendResetEmail;
    requireEmailVerification?: boolean;
  } = {},
) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(helmet());
  app.use(cors({ origin: config.frontendUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api', requestGuard(config));
  if (options.rateLimits !== false) applyRateLimits(app);
  app.get('/health', createHealthController(db));
  app.use(
    '/api',
    createApiRoutes(db, config, options.mailer || sendResetEmail, {
      requireEmailVerification: options.requireEmailVerification !== false,
    }),
  );
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
