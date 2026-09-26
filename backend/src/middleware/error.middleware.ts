import type express from 'express';
import type { RequestHandler, ErrorRequestHandler } from 'express';
import { MongoServerError } from 'mongodb';
import { z } from 'zod';
import { httpError } from '../common/http.js';

export const notFound: RequestHandler = (_req, _res) => httpError(404, 'Không tìm thấy API.');

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
) => {
  if (error instanceof z.ZodError)
    return res.status(400).json({ message: error.issues[0]?.message || 'Dữ liệu không hợp lệ.' });
  if (error instanceof MongoServerError && error.code === 11000)
    return res.status(409).json({ message: 'Email hoặc dữ liệu này đã tồn tại.' });
  const err = error as { status?: number; message?: string };
  const status = err.status && err.status >= 400 && err.status <= 599 ? err.status : 500;
  if (status === 500)
    console.error(
      'API request failed. Error type:',
      error instanceof Error ? error.name : 'Unknown',
    );
  res
    .status(status)
    .json({ message: status === 500 ? 'Máy chủ đang gặp sự cố. Vui lòng thử lại.' : err.message });
};
