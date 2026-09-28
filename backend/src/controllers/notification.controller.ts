import type { RequestHandler } from 'express';
import type { Filter } from 'mongodb';
import { z } from 'zod';
import type { Collections } from '../database/collections.js';
import { httpError, objectId } from '../common/http.js';
import { notificationDto, type Notification } from '../models/notification.model.js';

export function createNotificationController(c: Collections) {
  const list: RequestHandler = async (req, res) => {
    const query = z
      .object({
        before: z
          .string()
          .regex(/^[a-f\d]{24}$/i)
          .optional(),
        limit: z.coerce.number().int().min(1).max(50).default(20),
      })
      .parse(req.query);
    const userId = req.user!._id;
    const filter: Filter<Notification> = { userId };
    if (query.before) {
      const cursor = await c.notifications.findOne(
        { _id: objectId(query.before), userId },
        { projection: { createdAt: 1 } },
      );
      if (cursor)
        filter.$or = [
          { createdAt: { $lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, _id: { $lt: cursor._id } },
        ];
    }
    const [rows, unread] = await Promise.all([
      c.notifications
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .limit(query.limit + 1)
        .toArray(),
      c.notifications.countDocuments({ userId, readAt: null }),
    ]);
    res.json({
      notifications: rows.slice(0, query.limit).map(notificationDto),
      unread,
      hasMore: rows.length > query.limit,
    });
  };
  const read: RequestHandler = async (req, res) => {
    const result = await c.notifications.updateOne(
      { _id: objectId(req.params.id), userId: req.user!._id },
      [{ $set: { readAt: { $ifNull: ['$readAt', '$$NOW'] } } }],
    );
    if (!result.matchedCount) httpError(404, 'Không tìm thấy thông báo.');
    res.json({
      unread: await c.notifications.countDocuments({ userId: req.user!._id, readAt: null }),
    });
  };
  const readAll: RequestHandler = async (req, res) => {
    await c.notifications.updateMany(
      { userId: req.user!._id, readAt: null },
      { $set: { readAt: new Date() } },
    );
    res.json({ unread: 0 });
  };
  return { list, read, readAll };
}
