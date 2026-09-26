import { Router } from 'express';
import type { Collections } from '../database/collections.js';
import { createStudentController } from '../controllers/student.controller.js';

export function createStudentRoutes(c: Collections) {
  const router = Router();
  const controller = createStudentController(c);
  router.get('/classes', controller.listClasses);
  router.post('/classes/join', controller.joinClass);
  router.get('/progress', controller.getProgress);
  router.get('/history', controller.getHistory);
  return router;
}
