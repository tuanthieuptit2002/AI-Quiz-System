import { Router } from 'express';
import type { Collections } from '../database/collections.js';
import { createAdminController } from '../controllers/admin.controller.js';

export function createAdminRoutes(c: Collections) {
  const router = Router();
  const controller = createAdminController(c);
  router.get('/overview', controller.getOverview);
  router.get('/users', controller.listUsers);
  router.post('/users', controller.addUser);
  router.patch('/users/:id', controller.updateUser);
  return router;
}
