import type { RequestHandler } from 'express';
import type { Collections } from '../database/collections.js';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { classDto, type Classroom } from '../models/classroom.model.js';
import { userDto } from '../models/user.model.js';
import { emailSchema, classSchema } from '../common/validation.js';
import { httpError, objectId } from '../common/http.js';

export function createTeacherController(c: Collections) {
  const ownedClass = async (id: unknown, teacherId: ObjectId) => {
    const classroom = await c.classes.findOne({ _id: objectId(id), teacherId });
    if (!classroom) httpError(404, 'Không tìm thấy lớp học.');
    return classroom;
  };

  const listClasses: RequestHandler = async (req, res) => {
    const classrooms = await c.classes
      .find({ teacherId: req.user!._id })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ classes: classrooms.map(classDto) });
  };

  const createClass: RequestHandler = async (req, res) => {
    const body = classSchema.parse(req.body);
    const now = new Date();
    const classroom: Classroom = {
      ...body,
      _id: new ObjectId(),
      teacherId: req.user!._id,
      studentIds: [],
      code: randomBytes(5).toString('hex').toUpperCase(),
      createdAt: now,
      updatedAt: now,
    };
    await c.classes.insertOne(classroom);
    res.status(201).json(classDto(classroom));
  };

  const updateClass: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    const body = classSchema.partial().parse(req.body);
    const updated = await c.classes.findOneAndUpdate(
      { _id: cl._id, teacherId: req.user!._id },
      { $set: { ...body, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    res.json(classDto(updated!));
  };

  const deleteClass: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    await c.classes.deleteOne({ _id: cl._id, teacherId: req.user!._id });
    res.json({ message: 'Đã xóa lớp học.' });
  };

  const listClassStudents: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    const users = await c.users
      .find({ _id: { $in: cl.studentIds }, role: 'STUDENT' })
      .sort({ name: 1 })
      .toArray();
    res.json({ classroom: classDto(cl), students: users.map(userDto) });
  };

  const addClassStudent: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    const { email } = z.object({ email: emailSchema }).parse(req.body);
    const student = await c.users.findOne({ email, role: 'STUDENT', status: 'ACTIVE' });
    if (!student) httpError(404, 'Không tìm thấy tài khoản học sinh đang hoạt động với email này.');
    if (cl.studentIds.length >= 1000) httpError(400, 'Lớp đã đủ 1.000 thành viên.');
    await c.classes.updateOne(
      { _id: cl._id, teacherId: req.user!._id },
      { $addToSet: { studentIds: student._id }, $set: { updatedAt: new Date() } },
    );
    res.json(userDto(student));
  };

  const removeClassStudent: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    await c.classes.updateOne(
      { _id: cl._id, teacherId: req.user!._id },
      { $pull: { studentIds: objectId(req.params.studentId) }, $set: { updatedAt: new Date() } },
    );
    res.json({ message: 'Đã gỡ học sinh khỏi lớp.' });
  };

  const listStudents: RequestHandler = async (req, res) => {
    const classes = await c.classes.find({ teacherId: req.user!._id }).toArray();
    const ids = classes.flatMap((cl) => cl.studentIds);
    const users = await c.users
      .find({ _id: { $in: ids }, role: 'STUDENT' })
      .sort({ name: 1 })
      .toArray();
    res.json({
      students: users.map((user) => ({
        ...userDto(user),
        classes: classes
          .filter((cl) => cl.studentIds.some((id) => id.equals(user._id)))
          .map((cl) => cl.name),
      })),
    });
  };

  return {
    listClasses,
    createClass,
    updateClass,
    deleteClass,
    listClassStudents,
    addClassStudent,
    removeClassStudent,
    listStudents,
  };
}
