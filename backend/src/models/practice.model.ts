import type { ObjectId } from 'mongodb';
import type { DeliveredQuestion } from './exam.model.js';
import type { LearningRange } from './learning.model.js';
import {
  difficultyShift,
  type Difficulty,
  type PracticeTopicPlan,
} from '../common/practice-plan.js';

export interface PracticeCursor {
  topicId: string;
  difficulty: Difficulty;
}
export interface PracticeItem {
  id: string;
  topicId: string;
  source: 'BANK' | 'AI';
  questionId: string | null;
  difficulty: Difficulty;
  points: number;
  delivered: DeliveredQuestion;
  response: string[] | null;
  awarded: number | null;
  answeredAt: Date | null;
}
export interface PracticeSession {
  _id: ObjectId;
  studentId: ObjectId;
  range: LearningRange;
  sourceKey: string;
  status: 'ACTIVE' | 'SUBMITTED';
  adjusted: boolean;
  plan: PracticeTopicPlan[];
  cursors: PracticeCursor[];
  items: PracticeItem[];
  aiCount: number;
  revision: number;
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
}
export interface PracticeQuestionView {
  id: string;
  topicId: string;
  subject: string;
  topicPath: string[];
  source: PracticeItem['source'];
  type: DeliveredQuestion['type'];
  question: string;
  image: string;
  imageAlt: string;
  points: number;
  options: DeliveredQuestion['options'];
  left: DeliveredQuestion['left'];
  blankCount: number;
  difficulty: Difficulty;
  index: number;
  total: number;
}
export interface PracticeFeedback {
  itemId: string;
  topicId: string;
  subject: string;
  topicPath: string[];
  source: PracticeItem['source'];
  type: DeliveredQuestion['type'];
  question: string;
  options: DeliveredQuestion['options'];
  left: DeliveredQuestion['left'];
  blankCount: number;
  response: string[];
  correct: string[];
  explanation: string;
  awarded: number;
  points: number;
  difficulty: Difficulty;
  nextDifficulty: Difficulty;
  shift: 'HARDER' | 'EASIER' | 'SAME';
}
export interface PracticeView {
  id: string;
  status: PracticeSession['status'];
  phase: 'QUESTION' | 'FEEDBACK' | 'SUMMARY';
  range: LearningRange;
  total: number;
  answered: number;
  correctCount: number;
  score: number | null;
  adjusted: boolean;
  plan: (PracticeTopicPlan & { served: number; correct: number })[];
  question: PracticeQuestionView | null;
  feedback: PracticeFeedback | null;
}
const round = (n: number) => Math.round(n * 100) / 100;
const topicOf = (session: PracticeSession, topicId: string) =>
  session.plan.find((topic) => topic.topicId === topicId);

export function practiceView(session: PracticeSession): PracticeView {
  const answered = session.items.filter((item) => item.awarded !== null);
  const open = session.items.find((item) => item.awarded === null) || null;
  const last = answered.at(-1) || null;
  const earned = answered.reduce((sum, item) => sum + (item.awarded || 0), 0);
  const possible = answered.reduce((sum, item) => sum + item.points, 0);
  const total = session.plan.reduce((sum, topic) => sum + topic.count, 0);
  const phase =
    session.status === 'SUBMITTED' ? 'SUMMARY' : open ? 'QUESTION' : last ? 'FEEDBACK' : 'QUESTION';
  const questionTopic = open ? topicOf(session, open.topicId) : undefined;
  const feedbackTopic = last ? topicOf(session, last.topicId) : undefined;
  const cursor = last ? session.cursors.find((row) => row.topicId === last.topicId) : undefined;
  return {
    id: session._id.toHexString(),
    status: session.status,
    phase,
    range: session.range,
    total,
    answered: answered.length,
    correctCount: answered.filter((item) => item.awarded === item.points).length,
    score: possible ? round((earned / possible) * 100) : null,
    adjusted: session.adjusted,
    plan: session.plan.map((topic) => ({
      ...topic,
      served: session.items.filter((item) => item.topicId === topic.topicId).length,
      correct: session.items.filter(
        (item) => item.topicId === topic.topicId && item.awarded === item.points,
      ).length,
    })),
    question:
      open && questionTopic
        ? {
            id: open.id,
            topicId: open.topicId,
            subject: questionTopic.subject,
            topicPath: questionTopic.topicPath,
            source: open.source,
            type: open.delivered.type,
            question: open.delivered.question,
            image: open.delivered.image,
            imageAlt: open.delivered.imageAlt,
            points: open.points,
            options: open.delivered.options,
            left: open.delivered.left,
            blankCount: open.delivered.blankCount,
            difficulty: open.difficulty,
            index: session.items.length,
            total,
          }
        : null,
    feedback:
      last && feedbackTopic && cursor && !open
        ? {
            itemId: last.id,
            topicId: last.topicId,
            subject: feedbackTopic.subject,
            topicPath: feedbackTopic.topicPath,
            source: last.source,
            type: last.delivered.type,
            question: last.delivered.question,
            options: last.delivered.options,
            left: last.delivered.left,
            blankCount: last.delivered.blankCount,
            response: last.response || [],
            correct: last.delivered.correct,
            explanation: last.delivered.explanation,
            awarded: last.awarded || 0,
            points: last.points,
            difficulty: last.difficulty,
            nextDifficulty: cursor.difficulty,
            shift: difficultyShift(last.difficulty, cursor.difficulty),
          }
        : null,
  };
}
