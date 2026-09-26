import jwt from 'jsonwebtoken';
import { ObjectId } from 'mongodb';
import type { Request, Response, NextFunction } from 'express';
import type { Config } from '../common/config.js';
import type { Collections } from '../database/collections.js';
import type { User } from '../models/user.model.js';
import { httpError } from '../common/http.js';

declare global {
  namespace Express {
    interface Request {
      user?: User;
      sessionId?: ObjectId;
    }
  }
}

export function authentication(c: Collections, config: Config) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : '';
    let payload: jwt.JwtPayload;
    try {
      const decoded = jwt.verify(token, config.jwtSecret, {
        algorithms: ['HS256'],
        issuer: 'quizspace',
        audience: 'quizspace-web',
      });
      if (
        typeof decoded === 'string' ||
        decoded.type !== 'access' ||
        !ObjectId.isValid(decoded.sub || '') ||
        !ObjectId.isValid(decoded.sid || '')
      )
        throw new Error();
      payload = decoded;
    } catch {
      return next(Object.assign(new Error('Phiên đăng nhập đã hết hạn.'), { status: 401 }));
    }
    const user = await c.users.findOne({ _id: new ObjectId(payload.sub) });
    if (!user || user.tokenVersion !== payload.ver) httpError(401, 'Vui lòng đăng nhập lại.');
    if (user.status !== 'ACTIVE') httpError(403, 'Tài khoản đã bị khóa. Liên hệ quản trị viên.');
    const sessionId = new ObjectId(payload.sid);
    const session = await c.sessions.findOne({
      _id: sessionId,
      userId: user._id,
      revoked: false,
      expiresAt: { $gt: new Date() },
    });
    if (!session) httpError(401, 'Phiên đăng nhập đã kết thúc.');
    req.user = user;
    req.sessionId = sessionId;
    next();
  };
}
