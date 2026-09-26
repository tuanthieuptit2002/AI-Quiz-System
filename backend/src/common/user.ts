import { ObjectId } from 'mongodb';
import type { Collections } from '../database/collections.js';
import type { User } from '../models/user.model.js';
import { hashPassword } from './security.js';

export const createUser = async (
  c: Collections,
  input: { name: string; email: string; role: User['role']; password?: string; googleId?: string },
) => {
  const now = new Date();
  const user: User = {
    _id: new ObjectId(),
    name: input.name,
    email: input.email,
    role: input.role,
    status: 'ACTIVE',
    passwordHash: input.password ? await hashPassword(input.password) : undefined,
    googleId: input.googleId,
    avatar: '',
    bio: '',
    phone: '',
    weeklyGoal: 3,
    tokenVersion: 0,
    createdAt: now,
    updatedAt: now,
  };
  await c.users.insertOne(user);
  return user;
};
