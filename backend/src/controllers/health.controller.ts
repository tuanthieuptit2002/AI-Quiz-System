import type { RequestHandler } from 'express';
import type { Db } from 'mongodb';

export function createHealthController(db: Db): RequestHandler {
  return async (_req, res) => {
    await db.command({ ping: 1 });
    res.json({ status: 'UP' });
  };
}
