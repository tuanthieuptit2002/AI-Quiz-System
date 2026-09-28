import type { Request, RequestHandler } from 'express';
import { ObjectId, type Db, type Filter } from 'mongodb';
import { z } from 'zod';
import { collections } from '../database/collections.js';
import { httpError, objectId } from '../common/http.js';
import {
  analyticsFlags,
  analyticsRunLimit,
  analyticsSample,
  analyzeQuestion,
  attributeQuestion,
  examQuestionKeys,
  type AnalyticsFlag,
  type ItemObservation,
  type QuestionAnalytics,
} from '../common/question-analytics.js';
import type { Question } from '../models/question.model.js';

const pageSize = 12;
const querySchema = z.object({
  search: z.string().trim().max(200).default(''),
  flag: z.enum(analyticsFlags).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
});

type RunRow = {
  examId: ObjectId;
  scorePercent: number | null;
  dwellMs?: number[];
  awarded: (number | null)[];
  responses: string[][];
  questions: {
    bankQuestionId?: string;
    question: string;
    type: Question['type'];
    points: number;
    options: { id: string; text: string }[];
    left: { id: string; text: string }[];
    correct: string[];
  }[];
};

export function createQuestionAnalyticsController(db: Db) {
  const c = collections(db);
  const scope = (req: Request): Filter<Question> =>
    req.user!.role === 'ADMIN' ? {} : { ownerId: req.user!._id };

  const collect = async (req: Request) => {
    const runFilter =
      req.user!.role === 'ADMIN'
        ? { status: { $in: ['SUBMITTED', 'PENDING_REVIEW'] as const } }
        : { ownerId: req.user!._id, status: { $in: ['SUBMITTED', 'PENDING_REVIEW'] as const } };
    const totalRuns = await c.examRuns.countDocuments(runFilter);
    const runs = await c.examRuns
      .find(runFilter, {
        projection: {
          examId: 1,
          scorePercent: 1,
          dwellMs: 1,
          awarded: 1,
          responses: 1,
          'questions.bankQuestionId': 1,
          'questions.question': 1,
          'questions.type': 1,
          'questions.points': 1,
          'questions.options': 1,
          'questions.left': 1,
          'questions.correct': 1,
        },
      })
      .sort({ submittedAt: -1, _id: -1 })
      .limit(analyticsRunLimit)
      .toArray();
    const examIds = [...new Set(runs.map((run) => run.examId.toHexString()))].map(
      (id) => new ObjectId(id),
    );
    const exams = examIds.length
      ? await c.exams
          .find(
            { _id: { $in: examIds } },
            {
              projection: {
                'questions.questionId': 1,
                'questions.content.question': 1,
                'questions.content.type': 1,
              },
            },
          )
          .toArray()
      : [];
    const keys = new Map(
      exams.map((exam) => [exam._id.toHexString(), examQuestionKeys(exam.questions)]),
    );
    const grouped = new Map<string, ItemObservation[]>();
    for (const run of runs as unknown as RunRow[]) {
      run.questions.forEach((question, index) => {
        const id = attributeQuestion(question, keys.get(run.examId.toHexString()));
        if (!id) return;
        const dwell = run.dwellMs?.[index];
        const observation: ItemObservation = {
          points: question.points,
          awarded: run.awarded?.[index] ?? null,
          scorePercent: typeof run.scorePercent === 'number' ? run.scorePercent : null,
          dwellMs: typeof dwell === 'number' ? dwell : null,
          type: question.type,
          options: question.options || [],
          left: question.left || [],
          correct: question.correct || [],
          response: run.responses?.[index] || [],
        };
        grouped.set(id, [...(grouped.get(id) || []), observation]);
      });
    }
    const ids = [...grouped.keys()]
      .filter((id) => ObjectId.isValid(id))
      .map((id) => new ObjectId(id));
    const questions = ids.length
      ? await c.questions.find({ _id: { $in: ids }, ...scope(req) }).toArray()
      : [];
    const analyzed = questions.map((question) => ({
      question,
      stats: analyzeQuestion(question.difficulty, grouped.get(question._id.toHexString()) || []),
    }));
    return { analyzed, truncated: totalRuns > analyticsRunLimit };
  };

  const rowOf = (question: Question, stats: QuestionAnalytics) => ({
    id: question._id.toHexString(),
    question: question.question.replace(/\s+/g, ' ').trim().slice(0, 180),
    subject: question.subject,
    topic: question.topicPath.at(-1) || question.subject,
    type: question.type,
    difficulty: question.difficulty,
    status: question.status,
    attempts: stats.attempts,
    graded: stats.graded,
    correctRate: stats.correctRate,
    averageSeconds: stats.averageSeconds,
    difficultyIndex: stats.difficultyIndex,
    actual: stats.actual,
    discrimination: stats.discrimination,
    discriminationLabel: stats.discriminationLabel,
    flags: stats.flags,
  });

  const list: RequestHandler = async (req, res) => {
    const query = querySchema.parse(req.query);
    const { analyzed, truncated } = await collect(req);
    const summary = {
      analyzed: analyzed.length,
      tooEasy: analyzed.filter((item) => item.stats.flags.includes('too_easy')).length,
      tooHard: analyzed.filter((item) => item.stats.flags.includes('too_hard')).length,
      mismatch: analyzed.filter((item) => item.stats.flags.includes('mismatch')).length,
      weakDiscrimination: analyzed.filter((item) =>
        item.stats.flags.includes('weak_discrimination'),
      ).length,
    };
    const needle = query.search.toLocaleLowerCase('vi');
    const searched = needle
      ? analyzed.filter(({ question }) =>
          [question.question, question.subject, ...question.topicPath, ...question.tags]
            .join('\n')
            .toLocaleLowerCase('vi')
            .includes(needle),
        )
      : analyzed;
    const flagged = query.flag
      ? searched.filter((item) => item.stats.flags.includes(query.flag as AnalyticsFlag))
      : searched;
    flagged.sort(
      (a, b) =>
        Number(b.stats.flags.length > 0) - Number(a.stats.flags.length > 0) ||
        b.stats.attempts - a.stats.attempts ||
        (a.stats.correctRate ?? 101) - (b.stats.correctRate ?? 101),
    );
    const pages = Math.max(1, Math.ceil(flagged.length / pageSize));
    const page = Math.min(query.page, pages);
    res.json({
      truncated,
      sample: analyticsSample,
      summary,
      total: flagged.length,
      pages,
      page,
      questions: flagged
        .slice((page - 1) * pageSize, page * pageSize)
        .map((item) => rowOf(item.question, item.stats)),
    });
  };

  const detail: RequestHandler = async (req, res) => {
    const question = await c.questions.findOne({ _id: objectId(req.params.id), ...scope(req) });
    if (!question) httpError(404, 'Không tìm thấy câu hỏi.');
    const { analyzed, truncated } = await collect(req);
    const found = analyzed.find((item) => item.question._id.equals(question._id));
    const stats = found?.stats || analyzeQuestion(question.difficulty, []);
    res.json({
      ...rowOf(question, stats),
      distribution: stats.distribution,
      choices: stats.choices,
      omitted: stats.omitted,
      wrongAnswers: stats.wrongAnswers,
      warnings: stats.warnings,
      truncated,
      sample: analyticsSample,
    });
  };

  return { list, detail };
}
