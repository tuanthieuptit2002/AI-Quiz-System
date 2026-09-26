import { Router } from 'express';
import type { Collections } from '../database/collections.js';
import { createTeacherController } from '../controllers/teacher.controller.js';

export function createTeacherRoutes(c: Collections) {
  const router = Router();
  const controller = createTeacherController(c);
  router.get('/classes', controller.listClasses);
  router.post('/classes', controller.createClass);
  router.patch('/classes/:id', controller.updateClass);
  router.delete('/classes/:id', controller.deleteClass);
  router.get('/classes/:id/students', controller.listClassStudents);
  router.post('/classes/:id/students', controller.addClassStudent);
  router.delete('/classes/:id/students/:studentId', controller.removeClassStudent);
  router.get('/students', controller.listStudents);
  return router;
}
