import type { RequestHandler } from 'express';
import type { Collections } from '../database/collections.js';
import type { ObjectId } from 'mongodb';
import { z } from 'zod';
import { classDto, lessonDto, type Classroom } from '../models/classroom.model.js';
import { httpError, objectId } from '../common/http.js';
import {
  assignedExams,
  assignmentView,
  runRowProjection,
  runSummary,
  type RunRow,
} from '../common/classroom.js';

export function createStudentController(c: Collections) {
  const withNames = async (classes: Classroom[]) => {
    const [teachers, courses] = await Promise.all([
      c.users
        .find({ _id: { $in: classes.map((cl) => cl.teacherId) } }, { projection: { name: 1 } })
        .toArray(),
      c.courses
        .find(
          { _id: { $in: classes.map((cl) => cl.courseId).filter((id): id is ObjectId => !!id) } },
          { projection: { title: 1 } },
        )
        .toArray(),
    ]);
    return classes.map((cl) => ({
      ...classDto(cl),
      teacherName: teachers.find((t) => t._id.equals(cl.teacherId))?.name || 'Giáo viên',
      courseTitle: courses.find((course) => cl.courseId?.equals(course._id))?.title || '',
    }));
  };

  const listClasses: RequestHandler = async (req, res) => {
    const classes = await c.classes
      .find({ studentIds: req.user!._id })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ classes: await withNames(classes) });
  };

  const getClass: RequestHandler = async (req, res) => {
    const cl = await c.classes.findOne({
      _id: objectId(req.params.id),
      studentIds: req.user!._id,
    });
    if (!cl) httpError(404, 'Không tìm thấy lớp học.');
    const [lessons, assignments] = await Promise.all([
      c.lessons.find({ classId: cl._id }).sort({ createdAt: 1 }).toArray(),
      c.assignments.find({ classId: cl._id }).sort({ dueAt: 1, _id: 1 }).toArray(),
    ]);
    const [exams, runs] = await Promise.all([
      assignedExams(c, assignments),
      c.examRuns
        .find(
          { examId: { $in: assignments.map((row) => row.examId) }, studentId: req.user!._id },
          { projection: runRowProjection },
        )
        .toArray() as Promise<RunRow[]>,
    ]);
    const now = Date.now();
    res.json({
      classroom: (await withNames([cl]))[0],
      lessons: lessons.map(lessonDto),
      assignments: assignments.map((assignment) => {
        const view = assignmentView(assignment, exams.get(assignment.examId.toHexString()));
        const mine = runSummary(runs.filter((run) => run.examId.equals(assignment.examId)));
        const exam = view.exam;
        const state =
          mine.status === 'RUNNING'
            ? 'RUNNING'
            : !exam || exam.status !== 'PUBLISHED'
              ? 'CLOSED'
              : assignment.dueAt.getTime() <= now ||
                  (exam.endsAt && new Date(exam.endsAt).getTime() <= now)
                ? 'OVERDUE'
                : mine.attempts >= exam.maxAttempts
                  ? 'EXHAUSTED'
                  : exam.startsAt && new Date(exam.startsAt).getTime() > now
                    ? 'UPCOMING'
                    : 'OPEN';
        return { ...view, mine, state };
      }),
      serverTime: new Date(),
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
    const joined = cl.studentIds.some((id) => id.equals(req.user!._id));
    await c.classes.updateOne({ _id: cl._id }, { $addToSet: { studentIds: req.user!._id } });
    res.json({
      message: joined ? 'Bạn đã ở trong lớp này.' : 'Đã tham gia lớp học.',
      classId: cl._id.toHexString(),
      className: cl.name,
    });
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

  return { listClasses, getClass, joinClass, getProgress, getHistory };
}
