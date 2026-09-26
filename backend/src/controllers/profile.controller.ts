import type { RequestHandler } from 'express';
import type { Collections } from '../database/collections.js';
import { z } from 'zod';
import sharp from 'sharp';
import type { Config } from '../common/config.js';
import { userDto } from '../models/user.model.js';
import { nameSchema, passwordSchema } from '../common/validation.js';
import { httpError } from '../common/http.js';
import { hashPassword, verifyPassword, clearRefreshCookie } from '../common/security.js';

export function createProfileController(c: Collections, config: Config) {
  const getProfile: RequestHandler = (req, res) => res.json(userDto(req.user!));

  const updateProfile: RequestHandler = async (req, res) => {
    const body = z
      .object({
        name: nameSchema,
        bio: z.string().trim().max(300),
        phone: z.string().trim().max(25),
        weeklyGoal: z.number().int().min(1).max(20),
      })
      .strict()
      .partial()
      .parse(req.body);
    const user = await c.users.findOneAndUpdate(
      { _id: req.user!._id },
      { $set: { ...body, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    res.json(userDto(user!));
  };

  const updateAvatar: RequestHandler = async (req, res) => {
    const { image } = z.object({ image: z.string().max(750000) }).parse(req.body);
    const match = image.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
    if (!match) httpError(400, 'Chỉ hỗ trợ ảnh PNG, JPG hoặc WebP.');
    const input = Buffer.from(match[2], 'base64');
    if (input.length > 512000) httpError(400, 'Ảnh cần nhỏ hơn 500 KB.');
    let output: Buffer;
    try {
      output = await sharp(input, { limitInputPixels: 16000000 })
        .rotate()
        .resize(192, 192, { fit: 'cover' })
        .webp({ quality: 80 })
        .toBuffer();
    } catch {
      httpError(400, 'Ảnh không hợp lệ hoặc quá lớn.');
    }
    const user = await c.users.findOneAndUpdate(
      { _id: req.user!._id },
      {
        $set: {
          avatar: `data:image/webp;base64,${output.toString('base64')}`,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
    res.json(userDto(user!));
  };

  const deleteAvatar: RequestHandler = async (req, res) => {
    const user = await c.users.findOneAndUpdate(
      { _id: req.user!._id },
      { $set: { avatar: '', updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    res.json(userDto(user!));
  };

  const changePassword: RequestHandler = async (req, res) => {
    const body = z
      .object({ currentPassword: z.string().max(200), password: passwordSchema })
      .parse(req.body);
    if (
      !req.user!.passwordHash ||
      !(await verifyPassword(body.currentPassword, req.user!.passwordHash))
    )
      httpError(400, 'Mật khẩu hiện tại không chính xác.');
    await c.users.updateOne(
      { _id: req.user!._id },
      {
        $set: { passwordHash: await hashPassword(body.password), updatedAt: new Date() },
        $inc: { tokenVersion: 1 },
        $unset: { resetHash: '', resetExpiresAt: '' },
      },
    );
    await c.sessions.updateMany({ userId: req.user!._id }, { $set: { revoked: true } });
    clearRefreshCookie(res, config);
    res.json({ message: 'Đã đổi mật khẩu. Vui lòng đăng nhập lại.' });
  };

  return { getProfile, updateProfile, updateAvatar, deleteAvatar, changePassword };
}
