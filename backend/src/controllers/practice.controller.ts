import type { RequestHandler } from 'express';
import { Db, MongoServerError, ObjectId } from 'mongodb';
import { z } from 'zod';
import type { Config } from '../common/config.js';
import type { AIGenerator } from '../common/ai-provider.js';
import { createDeepSeekGenerator } from '../common/ai-provider.js';
import { httpError, objectId } from '../common/http.js';
import { learningSnapshot } from '../common/learning-analysis.js';
import { buildPracticePlan, practiceLimits } from '../common/practice-plan.js';
import {
  answerPracticeItem,
  ensureNextQuestion,
  finishPractice,
  practiceHistory,
} from '../common/practice-runtime.js';
import { collections } from '../database/collections.js';
import { practiceView, type PracticeSession } from '../models/practice.model.js';
import type { LearningRange } from '../models/learning.model.js';

const rangeSchema = z.enum(['30', '90', 'all']).default('90');
export function createPracticeController(
  db: Db,
  config: Config,
  generator: AIGenerator | null = config.deepseekApiKey ? createDeepSeekGenerator(config) : null,
) {
  const c = collections(db);
  const model = config.deepseekModel || 'deepseek-flash';
  const owned = async (id: ObjectId, studentId: ObjectId) => {
    const session = await c.practiceSessions.findOne({ _id: id, studentId });
    if (!session) httpError(404, 'Không tìm thấy phiên luyện tập.');
    return session;
  };
  const plan: RequestHandler = async (req, res) => {
    const { range } = z.object({ range: rangeSchema }).strict().parse(req.query);
    const studentId = req.user!._id;
    const [snapshot, history, active, previous] = await Promise.all([
      learningSnapshot(db, studentId, range),
      practiceHistory(db, studentId),
      c.practiceSessions.findOne({ studentId, status: 'ACTIVE' }),
      c.practiceSessions.findOne({ studentId, status: 'SUBMITTED' }, { sort: { submittedAt: -1 } }),
    ]);
    const built = buildPracticePlan(snapshot.topics, history);
    res.json({
      range,
      eligible: built.plan.length > 0,
      adjusted: built.adjusted,
      total: built.total,
      configured: !!config.deepseekApiKey,
      plan: built.plan,
      activeSessionId: active?._id.toHexString() || null,
      previous: previous ? previousSummary(previous) : null,
    });
  };
  const current: RequestHandler = async (req, res) => {
    const session = await c.practiceSessions.findOne({
      studentId: req.user!._id,
      status: 'ACTIVE',
    });
    res.json({ session: session ? practiceView(session) : null });
  };
  const create: RequestHandler = async (req, res) => {
    const { range } = z.object({ range: rangeSchema }).strict().parse(req.body);
    const studentId = req.user!._id;
    const existing = await c.practiceSessions.findOne({ studentId, status: 'ACTIVE' });
    if (existing) {
      res.json(practiceView(await ensureNextQuestion(db, existing, generator, model)));
      return;
    }
    const since = new Date(Date.now() - 86400000);
    const used = await c.practiceSessions.countDocuments({ studentId, createdAt: { $gte: since } });
    if (used >= practiceLimits.dailySessions)
      httpError(429, 'Tối đa 6 phiên luyện tập trong 24 giờ.');
    const snapshot = await learningSnapshot(db, studentId, range as LearningRange);
    const history = await practiceHistory(db, studentId);
    const built = buildPracticePlan(snapshot.topics, history);
    if (!built.plan.length)
      httpError(400, 'Cần ít nhất một chủ đề ưu tiên ôn hoặc cần củng cố để tạo quiz.');
    const now = new Date();
    const session: PracticeSession = {
      _id: new ObjectId(),
      studentId,
      range,
      sourceKey: snapshot.sourceKey,
      status: 'ACTIVE',
      adjusted: built.adjusted,
      plan: built.plan,
      cursors: built.plan.map((topic) => ({
        topicId: topic.topicId,
        difficulty: topic.startDifficulty,
      })),
      items: [],
      aiCount: 0,
      revision: 0,
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
    };
    try {
      await c.practiceSessions.insertOne(session);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        const same = await c.practiceSessions.findOne({ studentId, status: 'ACTIVE' });
        if (!same) httpError(409, 'Phiên luyện tập vừa được tạo. Hãy tải lại.');
        res.json(practiceView(await ensureNextQuestion(db, same, generator, model)));
        return;
      }
      throw error;
    }
    res.status(201).json(practiceView(await ensureNextQuestion(db, session, generator, model)));
  };
  const next: RequestHandler = async (req, res) => {
    const session = await owned(objectId(req.params.id), req.user!._id);
    res.json(practiceView(await ensureNextQuestion(db, session, generator, model)));
  };
  const answer: RequestHandler = async (req, res) => {
    const body = z
      .object({
        itemId: z.uuid(),
        response: z.array(z.string().max(1000)).max(20),
      })
      .strict()
      .parse(req.body);
    const session = await owned(objectId(req.params.id), req.user!._id);
    if (session.status !== 'ACTIVE') {
      res.json(practiceView(session));
      return;
    }
    res.json(practiceView(await answerPracticeItem(db, session, body.itemId, body.response)));
  };
  const finish: RequestHandler = async (req, res) => {
    const session = await owned(objectId(req.params.id), req.user!._id);
    res.json(practiceView(await finishPractice(db, session)));
  };
  return { plan, current, create, next, answer, finish };
}
function previousSummary(session: PracticeSession) {
  const answered = session.items.filter((item) => item.awarded !== null);
  const possible = answered.reduce((sum, item) => sum + item.points, 0);
  const earned = answered.reduce((sum, item) => sum + (item.awarded || 0), 0);
  return {
    id: session._id.toHexString(),
    submittedAt: session.submittedAt,
    score: possible ? Math.round((earned / possible) * 1000) / 10 : null,
    answered: answered.length,
    correct: answered.filter((item) => item.awarded === item.points).length,
    topics: session.plan.map((topic) => ({
      topicId: topic.topicId,
      subject: topic.subject,
      topicPath: topic.topicPath,
      planned: topic.count,
      answered: session.items.filter(
        (item) => item.topicId === topic.topicId && item.awarded !== null,
      ).length,
      correct: session.items.filter(
        (item) => item.topicId === topic.topicId && item.awarded === item.points,
      ).length,
    })),
  };
}
