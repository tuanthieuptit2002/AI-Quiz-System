import { Router } from 'express';
import type { Collections } from '../database/collections.js';
import { createTeacherController } from '../controllers/teacher.controller.js';
import { teacherDashboard } from '../controllers/dashboard.controller.js';

export function createTeacherRoutes(c: Collections) {
  const router = Router();
  const controller = createTeacherController(c);
  router.get('/dashboard', teacherDashboard(c));
  router.get('/courses', controller.listCourses);
  router.post('/courses', controller.createCourse);
  router.patch('/courses/:id', controller.updateCourse);
  router.delete('/courses/:id', controller.deleteCourse);
  router.get('/classes', controller.listClasses);
  router.post('/classes', controller.createClass);
  router.get('/classes/:id', controller.getClass);
  router.patch('/classes/:id', controller.updateClass);
  router.delete('/classes/:id', controller.deleteClass);
  router.post('/classes/:id/code', controller.resetCode);
  router.get('/classes/:id/students', controller.listClassStudents);
  router.post('/classes/:id/students', controller.addClassStudent);
  router.delete('/classes/:id/students/:studentId', controller.removeClassStudent);
  router.post('/classes/:id/lessons', controller.createLesson);
  router.patch('/classes/:id/lessons/:lessonId', controller.updateLesson);
  router.delete('/classes/:id/lessons/:lessonId', controller.deleteLesson);
  router.post('/classes/:id/assignments', controller.createAssignment);
  router.patch('/classes/:id/assignments/:assignmentId', controller.updateAssignment);
  router.delete('/classes/:id/assignments/:assignmentId', controller.deleteAssignment);
  router.get('/classes/:id/results', controller.results);
  router.get('/students', controller.listStudents);
  return router;
}
