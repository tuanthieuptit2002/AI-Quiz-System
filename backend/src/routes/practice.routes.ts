import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Db } from 'mongodb';
import type { Config } from '../common/config.js';
import { createPracticeController } from '../controllers/practice.controller.js';

const limit = (max: number) =>
  rateLimit({
    windowMs: 60000,
    limit: max,
    keyGenerator: (req) => req.user!._id.toHexString(),
    message: { message: 'Bạn thao tác quá nhanh. Vui lòng chờ một chút.' },
  });
export function createPracticeRoutes(db: Db, config: Config) {
  const router = Router();
  const controller = createPracticeController(db, config);
  router.get('/plan', controller.plan);
  router.get('/current', controller.current);
  router.post('/', limit(10), controller.create);
  router.post('/:id/next', limit(60), controller.next);
  router.post('/:id/answer', limit(60), controller.answer);
  router.post('/:id/finish', limit(20), controller.finish);
  return router;
}
