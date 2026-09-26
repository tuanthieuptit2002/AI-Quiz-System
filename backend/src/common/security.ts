import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { ObjectId } from 'mongodb';
import type { Response } from 'express';
import type { Config } from './config.js';
import type { User } from '../models/user.model.js';

export const REFRESH_COOKIE = 'qs_refresh';
export const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');
export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
export function setRefreshCookie(res: Response, token: string, config: Config, expiresAt: Date) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: config.production,
    sameSite: 'strict',
    path: '/api/auth',
    expires: expiresAt,
  });
}
export function clearRefreshCookie(res: Response, config: Config) {
  res.clearCookie(REFRESH_COOKIE, {
    httpOnly: true,
    secure: config.production,
    sameSite: 'strict',
    path: '/api/auth',
  });
}
export function accessToken(user: User, sessionId: ObjectId, config: Config) {
  return jwt.sign(
    { sid: sessionId.toHexString(), ver: user.tokenVersion, type: 'access' },
    config.jwtSecret,
    {
      subject: user._id.toHexString(),
      algorithm: 'HS256',
      expiresIn: '15m',
      issuer: 'quizspace',
      audience: 'quizspace-web',
    },
  );
}
