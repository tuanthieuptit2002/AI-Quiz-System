import { Router, raw } from 'express';
import type { Db } from 'mongodb';
import { createQuestionController } from '../controllers/question.controller.js';
import { createQuestionAnalyticsController } from '../controllers/question-analytics.controller.js';

export function createQuestionRoutes(db: Db) {
  const router = Router();
  const controller = createQuestionController(db);
  const analytics = createQuestionAnalyticsController(db);
  router.get('/metadata', controller.metadata);
  router.get('/analytics', analytics.list);
  router.get('/template', controller.download);
  router.get('/export', controller.download);
  router.post(
    '/import/preview',
    raw({ type: 'application/octet-stream', limit: '8mb' }),
    controller.previewImport,
  );
  router.post('/import/:importId/commit', controller.commitImport);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.get('/:id/analytics', analytics.detail);
  router.get('/:id', controller.get);
  router.put('/:id', controller.update);
  router.post('/:id/archive', controller.archive);
  router.post('/:id/duplicate', controller.duplicate);
  router.get('/:id/versions', controller.history);
  router.get('/:id/versions/:version', controller.getVersion);
  router.post('/:id/versions/:version/restore', controller.restore);
  return router;
}
