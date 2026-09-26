import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { Db } from 'mongodb';
import { requireRole } from '../middleware/role.middleware.js';
import { createExamController } from '../controllers/exam.controller.js';
import { createExamTakingController } from '../controllers/exam-taking.controller.js';

export function createExamRoutes(db: Db) {
  const router = Router();
  const builder = createExamController(db);
  const taking = createExamTakingController(db);
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
  router.post('/:id/submissions/:runId/grade', builder.grade);
  return router;
}
