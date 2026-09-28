import type { RequestHandler } from 'express';
import type { Collections } from '../database/collections.js';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { MongoServerError, ObjectId } from 'mongodb';
import {
  classDto,
  courseDto,
  lessonDto,
  type Assignment,
  type Classroom,
  type Course,
  type Lesson,
} from '../models/classroom.model.js';
import { userDto } from '../models/user.model.js';
import {
  emailSchema,
  classSchema,
  courseSchema,
  lessonSchema,
  assignmentSchema,
} from '../common/validation.js';
import { httpError, objectId } from '../common/http.js';
import {
  assignedExams,
  assignmentView,
  runRowProjection,
  runSummary,
  type RunRow,
} from '../common/classroom.js';
import { notifyAssignment, safely } from '../common/notifications.js';

const newCode = () => randomBytes(5).toString('hex').toUpperCase();
const duplicate = (error: unknown) => error instanceof MongoServerError && error.code === 11000;

export function createTeacherController(c: Collections) {
  const ownedClass = async (id: unknown, teacherId: ObjectId) => {
    const classroom = await c.classes.findOne({ _id: objectId(id), teacherId });
    if (!classroom) httpError(404, 'Không tìm thấy lớp học.');
    return classroom;
  };
  const ownedCourse = async (id: unknown, teacherId: ObjectId) => {
    const course = await c.courses.findOne({ _id: objectId(id), teacherId });
    if (!course) httpError(404, 'Không tìm thấy khóa học.');
    return course;
  };
  const courseRef = async (id: string | null | undefined, teacherId: ObjectId) =>
    id ? (await ownedCourse(id, teacherId))._id : null;

  const listCourses: RequestHandler = async (req, res) => {
    const [courses, classes] = await Promise.all([
      c.courses.find({ teacherId: req.user!._id }).sort({ createdAt: -1 }).toArray(),
      c.classes
        .find(
          { teacherId: req.user!._id, courseId: { $ne: null } },
          { projection: { courseId: 1 } },
        )
        .toArray(),
    ]);
    res.json({
      courses: courses.map((course) =>
        courseDto(course, classes.filter((cl) => cl.courseId?.equals(course._id)).length),
      ),
    });
  };

  const createCourse: RequestHandler = async (req, res) => {
    const body = courseSchema.parse(req.body);
    const now = new Date();
    const course: Course = {
      ...body,
      _id: new ObjectId(),
      teacherId: req.user!._id,
      createdAt: now,
      updatedAt: now,
    };
    await c.courses.insertOne(course);
    res.status(201).json(courseDto(course));
  };

  const updateCourse: RequestHandler = async (req, res) => {
    const course = await ownedCourse(req.params.id, req.user!._id);
    const body = courseSchema.partial().parse(req.body);
    const updated = await c.courses.findOneAndUpdate(
      { _id: course._id, teacherId: req.user!._id },
      { $set: { ...body, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    res.json(courseDto(updated!));
  };

  const deleteCourse: RequestHandler = async (req, res) => {
    const course = await ownedCourse(req.params.id, req.user!._id);
    await c.classes.updateMany(
      { teacherId: req.user!._id, courseId: course._id },
      { $set: { courseId: null, updatedAt: new Date() } },
    );
    await c.courses.deleteOne({ _id: course._id, teacherId: req.user!._id });
    res.json({ message: 'Đã xóa khóa học. Các lớp trong khóa vẫn được giữ.' });
  };

  const listClasses: RequestHandler = async (req, res) => {
    const classrooms = await c.classes
      .find({ teacherId: req.user!._id })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ classes: classrooms.map(classDto) });
  };

  const createClass: RequestHandler = async (req, res) => {
    const { courseId, ...body } = classSchema.parse(req.body);
    const now = new Date();
    const classroom: Classroom = {
      ...body,
      _id: new ObjectId(),
      teacherId: req.user!._id,
      courseId: await courseRef(courseId, req.user!._id),
      studentIds: [],
      code: newCode(),
      createdAt: now,
      updatedAt: now,
    };
    await c.classes.insertOne(classroom);
    res.status(201).json(classDto(classroom));
  };

  const updateClass: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    const { courseId, ...body } = classSchema.partial().parse(req.body);
    const updated = await c.classes.findOneAndUpdate(
      { _id: cl._id, teacherId: req.user!._id },
      {
        $set: {
          ...body,
          ...(courseId !== undefined ? { courseId: await courseRef(courseId, req.user!._id) } : {}),
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' },
    );
    res.json(classDto(updated!));
  };

  const deleteClass: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    await Promise.all([
      c.lessons.deleteMany({ classId: cl._id }),
      c.assignments.deleteMany({ classId: cl._id }),
    ]);
    await c.classes.deleteOne({ _id: cl._id, teacherId: req.user!._id });
    res.json({ message: 'Đã xóa lớp học.' });
  };

  const getClass: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    const [course, lessons, assignments] = await Promise.all([
      cl.courseId ? c.courses.findOne({ _id: cl.courseId }) : null,
      c.lessons.find({ classId: cl._id }).sort({ createdAt: 1 }).toArray(),
      c.assignments.find({ classId: cl._id }).sort({ dueAt: 1, _id: 1 }).toArray(),
    ]);
    const exams = await assignedExams(c, assignments);
    res.json({
      classroom: classDto(cl),
      course: course ? courseDto(course) : null,
      lessons: lessons.map(lessonDto),
      assignments: assignments.map((row) =>
        assignmentView(row, exams.get(row.examId.toHexString())),
      ),
    });
  };

  const resetCode: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newCode();
      try {
        await c.classes.updateOne(
          { _id: cl._id, teacherId: req.user!._id },
          { $set: { code, updatedAt: new Date() } },
        );
        res.json({ code });
        return;
      } catch (error) {
        if (!duplicate(error)) throw error;
      }
    }
    httpError(503, 'Chưa tạo được mã mới. Vui lòng thử lại.');
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

  const createLesson: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    const body = lessonSchema.parse(req.body);
    if ((await c.lessons.countDocuments({ classId: cl._id })) >= 200)
      httpError(400, 'Mỗi lớp tối đa 200 bài học.');
    const now = new Date();
    const lesson: Lesson = {
      ...body,
      _id: new ObjectId(),
      classId: cl._id,
      teacherId: req.user!._id,
      createdAt: now,
      updatedAt: now,
    };
    await c.lessons.insertOne(lesson);
    res.status(201).json(lessonDto(lesson));
  };

  const updateLesson: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    const body = lessonSchema.partial().parse(req.body);
    const lesson = await c.lessons.findOneAndUpdate(
      { _id: objectId(req.params.lessonId), classId: cl._id },
      { $set: { ...body, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!lesson) httpError(404, 'Không tìm thấy bài học.');
    res.json(lessonDto(lesson));
  };

  const deleteLesson: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    const result = await c.lessons.deleteOne({
      _id: objectId(req.params.lessonId),
      classId: cl._id,
    });
    if (!result.deletedCount) httpError(404, 'Không tìm thấy bài học.');
    res.json({ message: 'Đã xóa bài học.' });
  };

  const createAssignment: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    const body = assignmentSchema.parse(req.body);
    if (body.dueAt.getTime() <= Date.now()) httpError(400, 'Hạn nộp phải ở tương lai.');
    const exam = await c.exams.findOne({
      _id: objectId(body.examId),
      ownerId: req.user!._id,
      status: 'PUBLISHED',
    });
    if (!exam) httpError(404, 'Chỉ giao được đề thi đã phát hành của bạn.');
    const now = new Date();
    const assignment: Assignment = {
      _id: new ObjectId(),
      classId: cl._id,
      teacherId: req.user!._id,
      examId: exam._id,
      kind: body.kind,
      dueAt: body.dueAt,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await c.assignments.insertOne(assignment);
    } catch (error) {
      if (duplicate(error)) httpError(409, 'Đề thi này đã được giao cho lớp.');
      throw error;
    }
    await safely(() => notifyAssignment(c, cl, exam, assignment));
    const exams = await assignedExams(c, [assignment]);
    res.status(201).json(assignmentView(assignment, exams.get(exam._id.toHexString())));
  };

  const updateAssignment: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    const body = assignmentSchema.pick({ kind: true, dueAt: true }).partial().parse(req.body);
    if (body.dueAt && body.dueAt.getTime() <= Date.now())
      httpError(400, 'Hạn nộp phải ở tương lai.');
    const assignment = await c.assignments.findOneAndUpdate(
      { _id: objectId(req.params.assignmentId), classId: cl._id },
      { $set: { ...body, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!assignment) httpError(404, 'Không tìm thấy bài đã giao.');
    const exams = await assignedExams(c, [assignment]);
    res.json(assignmentView(assignment, exams.get(assignment.examId.toHexString())));
  };

  const deleteAssignment: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    const result = await c.assignments.deleteOne({
      _id: objectId(req.params.assignmentId),
      classId: cl._id,
    });
    if (!result.deletedCount) httpError(404, 'Không tìm thấy bài đã giao.');
    res.json({ message: 'Đã gỡ bài khỏi lớp. Bài làm đã nộp vẫn được giữ.' });
  };

  const results: RequestHandler = async (req, res) => {
    const cl = await ownedClass(req.params.id, req.user!._id);
    const [assignments, students] = await Promise.all([
      c.assignments.find({ classId: cl._id }).sort({ dueAt: 1, _id: 1 }).toArray(),
      c.users
        .find(
          { _id: { $in: cl.studentIds }, role: 'STUDENT' },
          { projection: { name: 1, email: 1 } },
        )
        .sort({ name: 1 })
        .toArray(),
    ]);
    const [exams, runs] = await Promise.all([
      assignedExams(c, assignments),
      c.examRuns
        .find(
          {
            examId: { $in: assignments.map((row) => row.examId) },
            studentId: { $in: students.map((student) => student._id) },
          },
          { projection: runRowProjection },
        )
        .toArray() as Promise<RunRow[]>,
    ]);
    res.json({
      studentCount: students.length,
      assignments: assignments.map((assignment) => {
        const rows = students.map((student) => ({
          studentId: student._id.toHexString(),
          name: student.name,
          email: student.email,
          ...runSummary(
            runs.filter(
              (run) => run.examId.equals(assignment.examId) && run.studentId.equals(student._id),
            ),
          ),
        }));
        const scores = rows
          .map((row) => row.bestScore)
          .filter((score): score is number => score !== null);
        return {
          ...assignmentView(assignment, exams.get(assignment.examId.toHexString())),
          summary: {
            submitted: rows.filter((row) => row.submitted).length,
            pendingReview: rows.filter((row) => row.status === 'PENDING_REVIEW').length,
            averageScore: scores.length
              ? Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) /
                10
              : null,
            passed: rows.filter((row) => row.passed === true).length,
          },
          students: rows,
        };
      }),
    });
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
    listCourses,
    createCourse,
    updateCourse,
    deleteCourse,
    listClasses,
    createClass,
    updateClass,
    deleteClass,
    getClass,
    resetCode,
    listClassStudents,
    addClassStudent,
    removeClassStudent,
    createLesson,
    updateLesson,
    deleteLesson,
    createAssignment,
    updateAssignment,
    deleteAssignment,
    results,
    listStudents,
  };
}
