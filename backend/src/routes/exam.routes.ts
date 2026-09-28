import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Db } from 'mongodb';
import { requireRole } from '../middleware/role.middleware.js';
import { createExamController } from '../controllers/exam.controller.js';
import { createExamTakingController } from '../controllers/exam-taking.controller.js';
import { createGradingController } from '../controllers/grading.controller.js';
import type { Config } from '../common/config.js';
import { createExplanationController } from '../controllers/explanation.controller.js';

export function createExamRoutes(db: Db, config: Config) {
  const router = Router();
  const builder = createExamController(db);
  const taking = createExamTakingController(db);
  const grading = createGradingController(db, config);
  const explanation = createExplanationController(db, config);
  router.get('/student', requireRole('STUDENT'), taking.list);
  router.post(
    '/student/:id/start',
    requireRole('STUDENT'),
    rateLimit({
      windowMs: 15 * 60000,
      limit: 30,
      keyGenerator: (req) => req.user!._id.toHexString(),
      message: { message: 'Quá nhiều lần nhập mã. Vui lòng thử lại sau.' },
    }),
    taking.start,
  );
  router.get('/runs/:runId', requireRole('STUDENT'), taking.getRun);
  router.patch('/runs/:runId', requireRole('STUDENT'), taking.save);
  router.post('/runs/:runId/submit', requireRole('STUDENT'), taking.submit);
  router.get('/runs/:runId/questions/:index/explanation', requireRole('STUDENT'), explanation.get);
  router.post(
    '/runs/:runId/questions/:index/explanation',
    requireRole('STUDENT'),
    rateLimit({
      windowMs: 60000,
      limit: 12,
      keyGenerator: (req) => req.user!._id.toHexString(),
      message: { message: 'Tối đa 12 yêu cầu giải thích mỗi phút. Vui lòng chờ.' },
    }),
    explanation.send,
  );
  router.use(requireRole('ADMIN', 'TEACHER'));
  router.get('/audience', builder.audience);
  router.post('/generate', builder.generate);
  router.get('/', builder.list);
  router.post('/', builder.create);
  router.get('/:id', builder.get);
  router.put('/:id', builder.update);
  router.post('/:id/publish', builder.publish);
  router.post('/:id/archive', builder.archive);
  router.post('/:id/duplicate', builder.duplicate);
  router.get('/:id/submissions', builder.submissions);
  router.get('/:id/submissions/:runId', builder.review);
  router.post('/:id/submissions/:runId/grade', grading.grade);
  router.get('/:id/submissions/:runId/grading', grading.overview);
  router.post(
    '/:id/submissions/:runId/grading/suggest',
    rateLimit({
      windowMs: 60000,
      limit: 10,
      keyGenerator: (req) => req.user!._id.toHexString(),
      message: { message: 'Tối đa 10 yêu cầu đề xuất mỗi phút. Vui lòng chờ.' },
    }),
    grading.suggest,
  );
  router.post('/:id/submissions/:runId/grading/:suggestionId/dismiss', grading.dismiss);
  return router;
}
