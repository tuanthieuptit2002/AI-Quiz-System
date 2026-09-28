import { Router } from 'express';
import type { Collections } from '../database/collections.js';
import { createNotificationController } from '../controllers/notification.controller.js';

export function createNotificationRoutes(c: Collections) {
  const router = Router();
  const controller = createNotificationController(c);
  router.get('/', controller.list);
  router.post('/read-all', controller.readAll);
  router.post('/:id/read', controller.read);
  return router;
}
