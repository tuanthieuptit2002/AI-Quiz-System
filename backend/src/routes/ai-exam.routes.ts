import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Db } from 'mongodb';
import type { Config } from '../common/config.js';
import { createAIExamController } from '../controllers/ai-exam.controller.js';

export function createAIExamRoutes(db: Db, config: Config) {
  const router = Router(),
    controller = createAIExamController(db, config);
  const expensive = rateLimit({
    windowMs: 15 * 60000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.user!._id.toHexString(),
    message: { message: 'Tối đa 30 thao tác AI Exam/15 phút. Vui lòng chờ.' },
  });
  router.get('/', controller.list);
  router.post('/', expensive, controller.create);
  router.get('/:id', controller.get);
  router.put('/:id/plan', controller.plan);
  router.get('/:id/coverage', controller.coverage);
  router.post('/:id/build', expensive, controller.build);
  router.post('/:id/retry', expensive, controller.retry);
  router.put('/:id/items/:itemId', controller.edit);
  router.post('/:id/items/:itemId/replace', expensive, controller.replace);
  router.post('/:id/save', controller.save);
  return router;
}
