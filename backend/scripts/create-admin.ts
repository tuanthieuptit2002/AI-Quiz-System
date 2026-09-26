import { ObjectId } from 'mongodb';
import { z } from 'zod';
import { connectDatabase, closeDatabase } from '../src/database/connection.js';
import { ensureIndexes } from '../src/database/indexes.js';
import { collections } from '../src/database/collections.js';
import type { User } from '../src/models/user.model.js';
import { hashPassword } from '../src/common/security.js';

try {
  const email = z.string().email().parse(process.env.ADMIN_EMAIL).toLowerCase();
  const password = z.string().min(12).max(72).parse(process.env.ADMIN_PASSWORD);
  const db = await connectDatabase();
  await ensureIndexes(db);
  const users = collections(db).users;
  const existing = await users.findOne({ email });
  if (existing) {
    if (existing.role !== 'ADMIN')
      throw new Error('Email đã có tài khoản không phải Admin. Không tự động nâng quyền.');
    console.log('Tài khoản Admin đã tồn tại; mật khẩu được giữ nguyên.');
  } else {
    const now = new Date();
    const admin: User = {
      _id: new ObjectId(),
      email,
      name: process.env.ADMIN_NAME || 'Tuấn',
      passwordHash: await hashPassword(password),
      role: 'ADMIN',
      status: 'ACTIVE',
      avatar: '',
      bio: '',
      phone: '',
      weeklyGoal: 3,
      tokenVersion: 0,
      createdAt: now,
      updatedAt: now,
    };
    await users.insertOne(admin);
    console.log(
      'Đã tạo tài khoản Admin. Mật khẩu ban đầu nằm trong ADMIN_PASSWORD của backend/.env.',
    );
  }
} catch (error) {
  console.error(
    error instanceof z.ZodError
      ? 'Cần ADMIN_EMAIL hợp lệ và ADMIN_PASSWORD từ 12–72 ký tự.'
      : error instanceof Error
        ? error.message
        : 'Không thể tạo Admin.',
  );
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
