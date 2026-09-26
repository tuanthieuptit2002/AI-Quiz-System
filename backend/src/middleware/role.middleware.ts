import type { Request, Response, NextFunction } from 'express';
import type { Role } from '../models/user.model.js';
import { httpError } from '../common/http.js';

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role))
      httpError(403, 'Bạn không có quyền thực hiện thao tác này.');
    next();
  };
}
