import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Db } from 'mongodb';
import type { Config } from '../common/config.js';
import { createLearningController } from '../controllers/learning.controller.js';

export function createLearningRoutes(db: Db, config: Config) {
  const router = Router(),
    controller = createLearningController(db, config);
  router.get('/', controller.get);
  router.post(
    '/',
    rateLimit({
      windowMs: 60000,
      limit: 10,
      keyGenerator: (req) => req.user!._id.toHexString(),
      message: { message: 'Tối đa 10 yêu cầu phân tích mỗi phút. Vui lòng chờ.' },
    }),
    controller.generate,
  );
  return router;
}
