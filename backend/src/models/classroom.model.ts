import type { ObjectId } from 'mongodb';

export interface Classroom {
  _id: ObjectId;
  teacherId: ObjectId;
  courseId?: ObjectId | null;
  name: string;
  subject: string;
  description: string;
  code: string;
  color: string;
  studentIds: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Course {
  _id: ObjectId;
  teacherId: ObjectId;
  title: string;
  description: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Lesson {
  _id: ObjectId;
  classId: ObjectId;
  teacherId: ObjectId;
  title: string;
  content: string;
  link: string;
  createdAt: Date;
  updatedAt: Date;
}

export const assignmentKinds = ['QUIZ', 'EXAM'] as const;

/** Gives every member of the class access to a published exam until `dueAt`. */
export interface Assignment {
  _id: ObjectId;
  classId: ObjectId;
  teacherId: ObjectId;
  examId: ObjectId;
  kind: (typeof assignmentKinds)[number];
  dueAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export const classDto = (cl: Classroom) => ({
  id: cl._id.toHexString(),
  courseId: cl.courseId ? cl.courseId.toHexString() : null,
  name: cl.name,
  subject: cl.subject,
  description: cl.description,
  code: cl.code,
  color: cl.color,
  studentCount: cl.studentIds.length,
  createdAt: cl.createdAt,
});

export const courseDto = (course: Course, classCount = 0) => ({
  id: course._id.toHexString(),
  title: course.title,
  description: course.description,
  classCount,
  createdAt: course.createdAt,
});

export const lessonDto = (lesson: Lesson) => ({
  id: lesson._id.toHexString(),
  title: lesson.title,
  content: lesson.content,
  link: lesson.link,
  createdAt: lesson.createdAt,
  updatedAt: lesson.updatedAt,
});
