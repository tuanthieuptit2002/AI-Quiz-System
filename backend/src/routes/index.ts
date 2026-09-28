import { Router } from 'express';
import type { Db } from 'mongodb';
import type { Config } from '../common/config.js';
import type { sendResetEmail } from '../common/mail.js';
import { collections } from '../database/collections.js';
import { authentication } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/role.middleware.js';
import { createAuthRoutes } from './auth.routes.js';
import { createProfileRoutes } from './profile.routes.js';
import { createAdminRoutes } from './admin.routes.js';
import { createTeacherRoutes } from './teacher.routes.js';
import { createStudentRoutes } from './student.routes.js';
import { createQuestionRoutes } from './question.routes.js';
import { createExamRoutes } from './exam.routes.js';
import { createAIExamRoutes } from './ai-exam.routes.js';
import { createAIRoutes } from './ai.routes.js';
import { createLearningRoutes } from './learning.routes.js';

export function createApiRoutes(db: Db, config: Config, mailer: typeof sendResetEmail) {
  const router = Router();
  const c = collections(db);
  const auth = authentication(c, config);
  router.use('/auth', createAuthRoutes(c, config, mailer));
  router.use('/me', auth, createProfileRoutes(c, config));
  router.use('/admin', auth, requireRole('ADMIN'), createAdminRoutes(c));
  router.use('/teacher', auth, requireRole('TEACHER'), createTeacherRoutes(c));
  router.use('/student', auth, requireRole('STUDENT'), createStudentRoutes(c));
  router.use(
    '/student/learning-analysis',
    auth,
    requireRole('STUDENT'),
    createLearningRoutes(db, config),
  );
  router.use('/questions', auth, requireRole('ADMIN', 'TEACHER'), createQuestionRoutes(db));
  router.use('/exams', auth, createExamRoutes(db, config));
  router.use('/ai-exams', auth, requireRole('ADMIN', 'TEACHER'), createAIExamRoutes(db, config));
  router.use('/ai', auth, requireRole('ADMIN', 'TEACHER'), createAIRoutes(db, config));
  return router;
}
