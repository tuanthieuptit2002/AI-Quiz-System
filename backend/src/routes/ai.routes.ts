import { Router, raw } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Db } from 'mongodb';
import type { Config } from '../common/config.js';
import { createAIController } from '../controllers/ai.controller.js';

export function createAIRoutes(db: Db, config: Config) {
  const router = Router();
  const controller = createAIController(db, config);
  const expensive = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.user!._id.toHexString(),
    message: { message: 'Bạn đã dùng hết 30 thao tác AI/15 phút. Vui lòng chờ.' },
  });
  router.get('/status', controller.status);
  router.post(
    '/source/file',
    expensive,
    raw({ type: 'application/octet-stream', limit: '8mb' }),
    controller.extract,
  );
  router.post('/source/url', expensive, controller.fromURL);
  router.get('/generations', controller.list);
  router.post('/generations', expensive, controller.create);
  router.get('/generations/:id', controller.get);
  router.put('/generations/:id/items/:itemId', controller.edit);
  router.post('/generations/:id/approve', controller.approve);
  router.post('/generations/:id/reject', controller.reject);
  router.post('/generations/:id/items/:itemId/regenerate', expensive, controller.regenerate);
  router.post('/generations/:id/retry', expensive, controller.retry);
  return router;
}
