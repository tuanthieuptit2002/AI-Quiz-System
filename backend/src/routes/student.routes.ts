import { Router } from 'express';
import type { Db } from 'mongodb';
import type { Collections } from '../database/collections.js';
import { createStudentController } from '../controllers/student.controller.js';
import { studentDashboard } from '../controllers/dashboard.controller.js';

export function createStudentRoutes(c: Collections, db: Db) {
  const router = Router();
  const controller = createStudentController(c);
  router.get('/dashboard', studentDashboard(c, db));
  router.get('/classes', controller.listClasses);
  router.post('/classes/join', controller.joinClass);
  router.get('/progress', controller.getProgress);
  router.get('/history', controller.getHistory);
  return router;
}
