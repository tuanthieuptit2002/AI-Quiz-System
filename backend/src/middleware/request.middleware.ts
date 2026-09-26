import type { RequestHandler } from 'express';
import type { Config } from '../common/config.js';
import { httpError } from '../common/http.js';

export function requestGuard(config: Config): RequestHandler {
  return (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (req.get('X-Requested-With') !== 'QuizSpace') httpError(403, 'Yêu cầu không hợp lệ.');
      if (req.get('Origin') && req.get('Origin') !== config.frontendUrl)
        httpError(403, 'Origin không hợp lệ.');
    }
    next();
  };
}
