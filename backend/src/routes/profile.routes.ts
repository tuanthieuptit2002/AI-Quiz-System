import { Router } from 'express';
import type { Collections } from '../database/collections.js';
import type { Config } from '../common/config.js';
import { createProfileController } from '../controllers/profile.controller.js';

export function createProfileRoutes(c: Collections, config: Config) {
  const router = Router();
  const controller = createProfileController(c, config);
  router.get('/', controller.getProfile);
  router.patch('/', controller.updateProfile);
  router.post('/onboarding', controller.completeOnboarding);
  router.put('/avatar', controller.updateAvatar);
  router.delete('/avatar', controller.deleteAvatar);
  router.put('/password', controller.changePassword);
  return router;
}
