import { Router } from 'express';
import type { Collections } from '../database/collections.js';
import type { Config } from '../common/config.js';
import type { sendResetEmail } from '../common/mail.js';
import { createAuthController } from '../controllers/auth.controller.js';

export function createAuthRoutes(
  c: Collections,
  config: Config,
  mailer: typeof sendResetEmail,
  requireEmailVerification = true,
) {
  const router = Router();
  const controller = createAuthController(c, config, mailer, requireEmailVerification);
  router.get('/config', controller.getConfig);
  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.post('/google', controller.googleLogin);
  router.post('/refresh', controller.refresh);
  router.post('/logout', controller.logout);
  router.post('/forgot-password', controller.forgotPassword);
  router.post('/reset-password', controller.resetPassword);
  router.post('/resend-verification', controller.resendVerification);
  router.post('/verify-email', controller.verifyEmail);
  return router;
}
