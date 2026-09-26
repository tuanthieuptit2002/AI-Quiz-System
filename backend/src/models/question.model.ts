import type { ObjectId } from 'mongodb';

export const questionTypes = [
  'SINGLE_CHOICE',
  'MULTIPLE_CHOICE',
  'TRUE_FALSE',
  'FILL_BLANK',
  'SHORT_ANSWER',
  'ESSAY',
  'MATCHING',
  'ORDERING',
] as const;
export const difficulties = ['EASY', 'MEDIUM', 'HARD', 'VERY_HARD'] as const;
export const questionStatuses = ['DRAFT', 'READY', 'ARCHIVED'] as const;
export interface QuestionContent {
  type: (typeof questionTypes)[number];
  subject: string;
  topicPath: string[];
  difficulty: (typeof difficulties)[number];
  status: (typeof questionStatuses)[number];
  question: string;
  options: { id: string; text: string }[];
  answers: string[];
  pairs: { left: string; right: string }[];
  rubric: string;
  explanation: string;
  tags: string[];
  image: string;
  imageAlt: string;
}
export interface Question extends QuestionContent {
  _id: ObjectId;
  ownerId: ObjectId;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}
export interface QuestionVersion {
  _id: ObjectId;
  questionId: ObjectId;
  version: number;
  content: QuestionContent;
  editorId: ObjectId;
  editorName: string;
  note: string;
  createdAt: Date;
}
export interface QuestionImport {
  _id: ObjectId;
  ownerId: ObjectId;
  questions: QuestionContent[];
  expiresAt: Date;
}
export function questionContent(question: QuestionContent): QuestionContent {
  const {
    type,
    subject,
    topicPath,
    difficulty,
    status,
    question: text,
    options,
    answers,
    pairs,
    rubric,
    explanation,
    tags,
    image,
    imageAlt,
  } = question;
  return {
    type,
    subject,
    topicPath,
    difficulty,
    status,
    question: text,
    options,
    answers,
    pairs,
    rubric,
    explanation,
    tags,
    image,
    imageAlt,
  };
}
export function questionDto(question: Question) {
  const { _id, ownerId, ...rest } = question;
  return { id: _id.toHexString(), ownerId: ownerId.toHexString(), ...rest };
}
