import type { ObjectId } from 'mongodb';

export interface Classroom {
  _id: ObjectId;
  teacherId: ObjectId;
  name: string;
  subject: string;
  description: string;
  code: string;
  color: string;
  studentIds: ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

export const classDto = (cl: Classroom) => ({
  id: cl._id.toHexString(),
  name: cl.name,
  subject: cl.subject,
  description: cl.description,
  code: cl.code,
  color: cl.color,
  studentCount: cl.studentIds.length,
  createdAt: cl.createdAt,
});
