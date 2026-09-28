import type { RequestHandler } from 'express';
import type { Collections } from '../database/collections.js';
import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { OAuth2Client } from 'google-auth-library';
import type { Response } from 'express';
import type { Config } from '../common/config.js';
import type { sendResetEmail } from '../common/mail.js';
import { emailIsVerified, userDto, type User } from '../models/user.model.js';
import { createUser } from '../common/user.js';
import { emailSchema, nameSchema, passwordSchema } from '../common/validation.js';
import { httpError } from '../common/http.js';
import {
  hashPassword,
  verifyPassword,
  randomToken,
  digest,
  accessToken,
  setRefreshCookie,
  clearRefreshCookie,
  REFRESH_COOKIE,
} from '../common/security.js';

const VERIFY_WINDOW_MS = 24 * 60 * 60 * 1000;

export function createAuthController(
  c: Collections,
  config: Config,
  mailer: typeof sendResetEmail,
  requireEmailVerification = true,
) {
  const google = new OAuth2Client(config.googleClientId);
  const startSession = async (user: User, res: Response) => {
    const token = randomToken();
    const now = new Date();
    const session = {
      _id: new ObjectId(),
      userId: user._id,
      tokenHash: digest(token),
      usedHashes: [],
      createdAt: now,
      expiresAt: new Date(Date.now() + 7 * 86400000),
      revoked: false,
      tokenVersion: user.tokenVersion,
    };
    await c.sessions.insertOne(session);
    await c.users.updateOne({ _id: user._id }, { $set: { lastLoginAt: now } });
    setRefreshCookie(res, token, config, session.expiresAt);
    return { user: userDto(user), accessToken: accessToken(user, session._id, config) };
  };

  const getConfig: RequestHandler = (_req, res) =>
    res.json({ googleClientId: config.googleClientId });

  const register: RequestHandler = async (req, res) => {
    const body = z
      .object({
        name: nameSchema,
        email: emailSchema,
        password: passwordSchema,
        confirmPassword: z.string().max(72).optional(),
        role: z.enum(['TEACHER', 'STUDENT']).default('STUDENT'),
      })
      .strict()
      .superRefine((value, ctx) => {
        const mismatch =
          requireEmailVerification || value.confirmPassword !== undefined
            ? value.confirmPassword !== value.password
            : false;
        if (mismatch)
          ctx.addIssue({
            code: 'custom',
            path: ['confirmPassword'],
            message: 'Hai mật khẩu chưa khớp.',
          });
      })
      .parse(req.body);
    if (requireEmailVerification && config.production && !config.smtpHost)
      httpError(503, 'Dịch vụ gửi email chưa sẵn sàng.');
    const user = await createUser(c, body);
    if (!requireEmailVerification) {
      const emailVerifiedAt = new Date();
      await c.users.updateOne({ _id: user._id }, { $set: { emailVerifiedAt } });
      res.status(201).json(await startSession({ ...user, emailVerifiedAt }, res));
      return;
    }
    const token = randomToken();
    const hash = digest(token);
    await c.users.updateOne(
      { _id: user._id },
      {
        $set: {
          emailVerifiedAt: null,
          verifyHash: hash,
          verifyExpiresAt: new Date(Date.now() + VERIFY_WINDOW_MS),
        },
      },
    );
    try {
      await mailer(body.email, `${config.frontendUrl}/verify?token=${token}`, config, 'verify');
    } catch {
      await c.users.deleteOne({ _id: user._id, emailVerifiedAt: null });
      console.error('Không thể gửi email xác minh. Kiểm tra cấu hình SMTP.');
      httpError(503, 'Dịch vụ gửi email chưa sẵn sàng.');
    }
    res.status(201).json({
      message: 'Hãy mở email để xác minh tài khoản trước khi vào trang chủ.',
      email: body.email,
    });
  };

  const login: RequestHandler = async (req, res) => {
    const body = z
      .object({ email: emailSchema, password: z.string().min(1).max(200) })
      .parse(req.body);
    const user = await c.users.findOne({ email: body.email });
    // A fixed bcrypt hash keeps unknown-email checks comparable to normal password checks.
    const dummyHash = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.2PvDQPHWhOYiP0XaPgFN60q.jUaVjvi';
    const valid = await verifyPassword(body.password, user?.passwordHash || dummyHash);
    if (!user || !user.passwordHash || !valid)
      httpError(401, 'Email hoặc mật khẩu không chính xác.');
    if (user.status !== 'ACTIVE') httpError(403, 'Tài khoản đã bị khóa. Liên hệ quản trị viên.');
    if (!emailIsVerified(user))
      httpError(
        403,
        'Email chưa được xác minh. Hãy mở liên kết trong hộp thư trước khi đăng nhập.',
      );
    res.json(await startSession(user, res));
  };

  const googleLogin: RequestHandler = async (req, res) => {
    if (!config.googleClientId) httpError(503, 'Đăng nhập Google chưa được cấu hình.');
    const { credential } = z.object({ credential: z.string().min(1).max(6000) }).parse(req.body);
    let payload;
    try {
      payload = (
        await google.verifyIdToken({ idToken: credential, audience: config.googleClientId })
      ).getPayload();
    } catch {
      httpError(401, 'Không thể xác minh tài khoản Google.');
    }
    if (!payload?.email || !payload.email_verified || !payload.sub)
      httpError(401, 'Email Google chưa được xác minh.');
    const email = payload.email.toLowerCase();
    let user = await c.users.findOne({ email });
    if (user && user.googleId !== payload.sub)
      httpError(409, 'Email này đã có tài khoản. Vui lòng đăng nhập bằng mật khẩu.');
    if (!user)
      user = await createUser(c, {
        name: payload.name || email.split('@')[0],
        email,
        role: 'STUDENT',
        googleId: payload.sub,
      });
    if (user.status !== 'ACTIVE') httpError(403, 'Tài khoản đã bị khóa.');
    if (!emailIsVerified(user)) {
      const emailVerifiedAt = new Date();
      await c.users.updateOne({ _id: user._id }, { $set: { emailVerifiedAt } });
      user = { ...user, emailVerifiedAt };
    }
    res.json(await startSession(user, res));
  };

  const refresh: RequestHandler = async (req, res) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (typeof token !== 'string' || token.length > 100) httpError(401, 'Vui lòng đăng nhập.');
    const hash = digest(token);
    const nextToken = randomToken();
    const session = await c.sessions.findOneAndUpdate(
      { tokenHash: hash, revoked: false, expiresAt: { $gt: new Date() } },
      { $set: { tokenHash: digest(nextToken) }, $push: { usedHashes: hash } },
      { returnDocument: 'after' },
    );
    if (!session) {
      await c.sessions.updateOne({ usedHashes: hash }, { $set: { revoked: true } });
      clearRefreshCookie(res, config);
      httpError(401, 'Phiên đăng nhập đã hết hạn.');
    }
    const user = await c.users.findOne({ _id: session.userId });
    if (
      !user ||
      user.status !== 'ACTIVE' ||
      !emailIsVerified(user) ||
      user.tokenVersion !== session.tokenVersion
    ) {
      await c.sessions.updateOne({ _id: session._id }, { $set: { revoked: true } });
      clearRefreshCookie(res, config);
      httpError(401, 'Vui lòng đăng nhập lại.');
    }
    setRefreshCookie(res, nextToken, config, session.expiresAt);
    res.json({ user: userDto(user), accessToken: accessToken(user, session._id, config) });
  };

  const logout: RequestHandler = async (req, res) => {
    const token = req.cookies[REFRESH_COOKIE];
    if (typeof token === 'string')
      await c.sessions.updateOne(
        { $or: [{ tokenHash: digest(token) }, { usedHashes: digest(token) }] },
        { $set: { revoked: true } },
      );
    clearRefreshCookie(res, config);
    res.json({ message: 'Đã đăng xuất.' });
  };

  const forgotPassword: RequestHandler = async (req, res) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    if (config.production && !config.smtpHost) httpError(503, 'Dịch vụ gửi email chưa sẵn sàng.');
    const user = await c.users.findOne({ email, status: 'ACTIVE' });
    if (user) {
      const token = randomToken();
      const hash = digest(token);
      await c.users.updateOne(
        { _id: user._id },
        { $set: { resetHash: hash, resetExpiresAt: new Date(Date.now() + 30 * 60000) } },
      );
      try {
        await mailer(email, `${config.frontendUrl}/reset-password?token=${token}`, config);
      } catch {
        await c.users.updateOne(
          { _id: user._id, resetHash: hash },
          { $unset: { resetHash: '', resetExpiresAt: '' } },
        );
        // Do not expose account existence or SMTP credentials to a public caller.
        console.error('Không thể gửi email đặt lại mật khẩu. Kiểm tra cấu hình SMTP.');
      }
    }
    res.json({
      message: 'Nếu email tồn tại, bạn sẽ nhận được liên kết đặt lại mật khẩu trong ít phút.',
    });
  };

  const resendVerification: RequestHandler = async (req, res) => {
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    const message = 'Nếu tài khoản đang chờ xác minh, bạn sẽ nhận được email trong ít phút.';
    if (config.production && !config.smtpHost) httpError(503, 'Dịch vụ gửi email chưa sẵn sàng.');
    const user = await c.users.findOne({
      email,
      status: 'ACTIVE',
      $or: [{ emailVerifiedAt: null }, { emailVerifiedAt: { $exists: false } }],
    });
    if (user) {
      const token = randomToken();
      const hash = digest(token);
      await c.users.updateOne(
        {
          _id: user._id,
          $or: [{ emailVerifiedAt: null }, { emailVerifiedAt: { $exists: false } }],
        },
        { $set: { verifyHash: hash, verifyExpiresAt: new Date(Date.now() + VERIFY_WINDOW_MS) } },
      );
      try {
        await mailer(email, `${config.frontendUrl}/verify?token=${token}`, config, 'verify');
      } catch {
        await c.users.updateOne(
          { _id: user._id, verifyHash: hash },
          { $unset: { verifyHash: '', verifyExpiresAt: '' } },
        );
        console.error('Không thể gửi lại email xác minh. Kiểm tra cấu hình SMTP.');
      }
    }
    res.json({ message });
  };

  const verifyEmail: RequestHandler = async (req, res) => {
    const { token } = z.object({ token: z.string().min(20).max(100) }).parse(req.body);
    const user = await c.users.findOneAndUpdate(
      {
        verifyHash: digest(token),
        verifyExpiresAt: { $gt: new Date() },
        status: 'ACTIVE',
        $or: [{ emailVerifiedAt: null }, { emailVerifiedAt: { $exists: false } }],
      },
      {
        $set: { emailVerifiedAt: new Date(), updatedAt: new Date() },
        $unset: { verifyHash: '', verifyExpiresAt: '' },
      },
      { returnDocument: 'after' },
    );
    if (!user) httpError(400, 'Liên kết xác minh không hợp lệ hoặc đã hết hạn.');
    res.json(await startSession(user, res));
  };

  const resetPassword: RequestHandler = async (req, res) => {
    const body = z
      .object({ token: z.string().min(20).max(100), password: passwordSchema })
      .parse(req.body);
    const passwordHash = await hashPassword(body.password);
    const user = await c.users.findOneAndUpdate(
      { resetHash: digest(body.token), resetExpiresAt: { $gt: new Date() }, status: 'ACTIVE' },
      {
        $set: { passwordHash, updatedAt: new Date() },
        $inc: { tokenVersion: 1 },
        $unset: { resetHash: '', resetExpiresAt: '' },
      },
    );
    if (!user) httpError(400, 'Liên kết không hợp lệ hoặc đã hết hạn.');
    await c.sessions.updateMany({ userId: user._id }, { $set: { revoked: true } });
    clearRefreshCookie(res, config);
    res.json({ message: 'Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới.' });
  };

  return {
    getConfig,
    register,
    login,
    googleLogin,
    refresh,
    logout,
    forgotPassword,
    resetPassword,
    resendVerification,
    verifyEmail,
  };
}
