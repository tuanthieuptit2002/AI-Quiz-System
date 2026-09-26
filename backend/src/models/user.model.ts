import type { ObjectId } from 'mongodb';

export type Role = 'ADMIN' | 'TEACHER' | 'STUDENT';
export interface User {
  _id: ObjectId;
  name: string;
  email: string;
  passwordHash?: string;
  googleId?: string;
  role: Role;
  status: 'ACTIVE' | 'LOCKED';
  avatar: string;
  bio: string;
  phone: string;
  weeklyGoal: number;
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  resetHash?: string;
  resetExpiresAt?: Date;
}
export function userDto(user: User) {
  return {
    id: user._id.toHexString(),
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    avatar: user.avatar || '',
    bio: user.bio || '',
    phone: user.phone || '',
    weeklyGoal: user.weeklyGoal || 3,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    hasPassword: Boolean(user.passwordHash),
  };
}
