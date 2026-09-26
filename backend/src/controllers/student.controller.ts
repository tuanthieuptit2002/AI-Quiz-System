import type { RequestHandler } from 'express';
import type { Collections } from '../database/collections.js';
import { z } from 'zod';
import { classDto } from '../models/classroom.model.js';
import { httpError } from '../common/http.js';

export function createStudentController(c: Collections) {
  const listClasses: RequestHandler = async (req, res) => {
    const classes = await c.classes
      .find({ studentIds: req.user!._id })
      .sort({ createdAt: -1 })
      .toArray();
    const teachers = await c.users
      .find({ _id: { $in: classes.map((cl) => cl.teacherId) } })
      .toArray();
    res.json({
      classes: classes.map((cl) => ({
        ...classDto(cl),
        teacherName: teachers.find((t) => t._id.equals(cl.teacherId))?.name || 'Giáo viên',
      })),
    });
  };

  const joinClass: RequestHandler = async (req, res) => {
    const { code } = z
      .object({
        code: z
          .string()
          .trim()
          .toUpperCase()
          .regex(/^[A-F0-9]{10}$/, 'Mã lớp gồm 10 ký tự.'),
      })
      .parse(req.body);
    const cl = await c.classes.findOne({ code });
    if (!cl) httpError(404, 'Mã lớp không tồn tại.');
    if (cl.studentIds.length >= 1000) httpError(400, 'Lớp đã đủ thành viên.');
    const teacher = await c.users.findOne({ _id: cl.teacherId, status: 'ACTIVE', role: 'TEACHER' });
    if (!teacher) httpError(400, 'Lớp học hiện không khả dụng.');
    await c.classes.updateOne({ _id: cl._id }, { $addToSet: { studentIds: req.user!._id } });
    res.json({ message: 'Đã tham gia lớp học.' });
  };

  const getProgress: RequestHandler = async (req, res) => {
    const attempts = await c.attempts
      .find({ studentId: req.user!._id })
      .sort({ submittedAt: -1 })
      .toArray();
    const avg = attempts.length
      ? attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length
      : 0;
    const week = new Date();
    week.setHours(0, 0, 0, 0);
    week.setDate(week.getDate() - ((week.getDay() + 6) % 7));
    const weeklyCount = attempts.filter((a) => a.submittedAt >= week).length;
    const subjects = [...new Set(attempts.map((a) => a.subject))].map((subject) => {
      const rows = attempts.filter((a) => a.subject === subject);
      return {
        subject,
        attempts: rows.length,
        average: Math.round((rows.reduce((s, a) => s + a.score, 0) / rows.length) * 10) / 10,
      };
    });
    res.json({
      attempts: attempts.length,
      average: Math.round(avg * 10) / 10,
      best: attempts.length ? Math.max(...attempts.map((a) => a.score)) : 0,
      minutes: Math.round(attempts.reduce((sum, a) => sum + a.durationSeconds, 0) / 60),
      weeklyCount,
      weeklyGoal: req.user!.weeklyGoal,
      subjects,
      recent: attempts
        .slice(0, 10)
        .reverse()
        .map((a) => ({ score: a.score, submittedAt: a.submittedAt })),
    });
  };

  const getHistory: RequestHandler = async (req, res) => {
    const { page } = z.object({ page: z.coerce.number().int().min(1).default(1) }).parse(req.query);
    const filter = { studentId: req.user!._id };
    const [items, total] = await Promise.all([
      c.attempts
        .find(filter)
        .sort({ submittedAt: -1 })
        .skip((page - 1) * 10)
        .limit(10)
        .toArray(),
      c.attempts.countDocuments(filter),
    ]);
    res.json({
      items: items.map((a) => ({
        id: a._id.toHexString(),
        title: a.title,
        subject: a.subject,
        score: a.score,
        durationSeconds: a.durationSeconds,
        submittedAt: a.submittedAt,
      })),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / 10)),
    });
  };

  return { listClasses, joinClass, getProgress, getHistory };
}
