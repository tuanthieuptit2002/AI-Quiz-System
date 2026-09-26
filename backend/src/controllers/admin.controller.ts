import type { RequestHandler } from 'express';
import type { Collections } from '../database/collections.js';
import { z } from 'zod';
import type { Filter } from 'mongodb';
import { userDto, type User } from '../models/user.model.js';
import { createUser } from '../common/user.js';
import { emailSchema, nameSchema, passwordSchema, roleSchema } from '../common/validation.js';
import { httpError, objectId, escapeRegex } from '../common/http.js';

export function createAdminController(c: Collections) {
  const getOverview: RequestHandler = async (_req, res) => {
    const [total, teachers, students, locked, classes, recent] = await Promise.all([
      c.users.countDocuments(),
      c.users.countDocuments({ role: 'TEACHER' }),
      c.users.countDocuments({ role: 'STUDENT' }),
      c.users.countDocuments({ status: 'LOCKED' }),
      c.classes.countDocuments(),
      c.users.find().sort({ createdAt: -1 }).limit(6).toArray(),
    ]);
    res.json({ total, teachers, students, locked, classes, recent: recent.map(userDto) });
  };

  const listUsers: RequestHandler = async (req, res) => {
    const query = z
      .object({
        q: z.string().max(100).default(''),
        role: roleSchema.optional(),
        status: z.enum(['ACTIVE', 'LOCKED']).optional(),
        page: z.coerce.number().int().min(1).default(1),
      })
      .parse(req.query);
    const filter: Filter<User> = {};
    if (query.role) filter.role = query.role;
    if (query.status) filter.status = query.status;
    if (query.q.trim())
      filter.$or = [
        { name: { $regex: escapeRegex(query.q.trim()), $options: 'i' } },
        { email: { $regex: escapeRegex(query.q.trim()), $options: 'i' } },
      ];
    const [users, total] = await Promise.all([
      c.users
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * 10)
        .limit(10)
        .toArray(),
      c.users.countDocuments(filter),
    ]);
    res.json({
      users: users.map(userDto),
      total,
      page: query.page,
      pages: Math.max(1, Math.ceil(total / 10)),
    });
  };

  const addUser: RequestHandler = async (req, res) => {
    const body = z
      .object({ name: nameSchema, email: emailSchema, password: passwordSchema, role: roleSchema })
      .strict()
      .parse(req.body);
    res.status(201).json(userDto(await createUser(c, body)));
  };

  const updateUser: RequestHandler = async (req, res) => {
    const id = objectId(req.params.id);
    const body = z
      .object({ role: roleSchema.optional(), status: z.enum(['ACTIVE', 'LOCKED']).optional() })
      .strict()
      .parse(req.body);
    if (id.equals(req.user!._id))
      httpError(400, 'Bạn không thể thay đổi quyền hoặc khóa chính mình.');
    const user = await c.users.findOneAndUpdate(
      { _id: id },
      { $set: { ...body, updatedAt: new Date() }, $inc: { tokenVersion: 1 } },
      { returnDocument: 'after' },
    );
    if (!user) httpError(404, 'Không tìm thấy người dùng.');
    await c.sessions.updateMany({ userId: id }, { $set: { revoked: true } });
    res.json(userDto(user));
  };

  return { getOverview, listUsers, addUser, updateUser };
}
