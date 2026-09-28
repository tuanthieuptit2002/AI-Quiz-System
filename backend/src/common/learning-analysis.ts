import { createHash } from 'node:crypto';
import type { Db, ObjectId } from 'mongodb';
import { collections } from '../database/collections.js';
import type { ExamRun } from '../models/exam.model.js';
import {
  learningLimits,
  type LearningMetric,
  type LearningRange,
  type LearningSnapshot,
} from '../models/learning.model.js';

const round = (n: number) => Math.round(n * 100) / 100;
const clean = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ');
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
type Bucket = Omit<LearningMetric, 'exams' | 'score' | 'level'> & { runIds: Set<string> };

// Only immutable delivered classifications are used. Never infer old topics from the live bank.
export function summarizeLearning(
  runs: ExamRun[],
  range: LearningRange,
  from: string | null,
  pendingRuns: number,
  truncated = false,
): LearningSnapshot {
  const subjects = new Map<string, Bucket>(),
    topics = new Map<string, Bucket>();
  let earned = 0,
    possible = 0,
    questions = 0,
    exams = 0,
    hiddenExams = 0,
    unclassifiedQuestions = 0,
    invalidQuestions = 0;
  const recent: LearningSnapshot['recent'] = [];
  const add = (
    map: Map<string, Bucket>,
    subject: string,
    topicPath: string[],
    runId: string,
    points: number,
    max: number,
  ) => {
    const id = hash([subject, ...topicPath].map((s) => s.toLocaleLowerCase('vi')));
    const row = map.get(id) || {
      id,
      subject,
      topicPath,
      questions: 0,
      earned: 0,
      possible: 0,
      runIds: new Set<string>(),
    };
    row.questions++;
    row.earned += points;
    row.possible += max;
    row.runIds.add(runId);
    map.set(id, row);
  };
  for (const run of runs) {
    if (run.status !== 'SUBMITTED' || !run.submittedAt) continue;
    if (!run.settings.showAnswers) {
      hiddenExams++;
      continue;
    }
    let runEarned = 0,
      runPossible = 0;
    run.questions.forEach((q, i) => {
      const points = run.awarded[i];
      if (
        typeof points !== 'number' ||
        !Number.isFinite(points) ||
        !Number.isFinite(q.points) ||
        q.points <= 0 ||
        points < 0 ||
        points > q.points
      ) {
        invalidQuestions++;
        return;
      }
      const subject = clean(q.classification?.subject || run.subject) || 'Chưa phân môn';
      const path = (q.classification?.topicPath || []).map(clean).filter(Boolean);
      const id = run._id.toHexString();
      add(subjects, subject, [], id, points, q.points);
      if (path.length) add(topics, subject, path, id, points, q.points);
      else unclassifiedQuestions++;
      questions++;
      earned += points;
      possible += q.points;
      runEarned += points;
      runPossible += q.points;
    });
    if (runPossible > 0) {
      exams++;
      recent.push({
        runId: run._id.toHexString(),
        title: run.title,
        submittedAt: run.submittedAt.toISOString(),
        score: round((runEarned / runPossible) * 100),
      });
    }
  }
  const rows = (map: Map<string, Bucket>): LearningMetric[] =>
    [...map.values()]
      .map(({ runIds, ...b }) => {
        const percent = (b.earned / b.possible) * 100;
        const level: LearningMetric['level'] =
          b.questions < learningLimits.minQuestions || runIds.size < learningLimits.minExams
            ? 'INSUFFICIENT'
            : percent < 60
              ? 'WEAK'
              : percent < 80
                ? 'DEVELOPING'
                : 'STRONG';
        return {
          ...b,
          earned: round(b.earned),
          possible: round(b.possible),
          score: round(percent),
          exams: runIds.size,
          level,
        };
      })
      .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
  const result = {
    range,
    from,
    exams,
    questions,
    score: possible ? round((earned / possible) * 100) : null,
    pendingRuns,
    hiddenExams,
    unclassifiedQuestions,
    invalidQuestions,
    truncated,
    subjects: rows(subjects),
    topics: rows(topics),
    recent: recent
      .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || a.runId.localeCompare(b.runId))
      .slice(0, 10)
      .reverse(),
  };
  // Rolling date labels and pending counts don't invalidate unchanged finalized evidence.
  const sourceKey = hash({
    range,
    exams,
    questions,
    subjects: result.subjects,
    topics: result.topics,
    runs: runs
      .filter((r) => r.status === 'SUBMITTED')
      .map((r) => [
        r._id.toHexString(),
        r.submittedAt?.toISOString(),
        r.settings.showAnswers,
        r.awarded,
        r.questions.map((q) => [q.points, q.classification || null]),
      ]),
  });
  return { ...result, sourceKey };
}

export async function learningSnapshot(
  db: Db,
  studentId: ObjectId,
  range: LearningRange,
  now = new Date(),
) {
  const c = collections(db);
  const from =
    range === 'all'
      ? null
      : new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
            (Number(range) - 1) * 86400000,
        );
  const dates = { $lte: now, ...(from ? { $gte: from } : {}) };
  const [runs, pending] = await Promise.all([
    c.examRuns
      .aggregate<ExamRun>([
        { $match: { studentId, status: 'SUBMITTED', submittedAt: dates } },
        { $sort: { submittedAt: -1, _id: -1 } },
        {
          $project: {
            _id: 1,
            examId: 1,
            title: 1,
            subject: 1,
            status: 1,
            submittedAt: 1,
            'settings.showAnswers': 1,
            awarded: 1,
            'questions.points': 1,
            'questions.classification': 1,
          },
        },
        { $group: { _id: '$examId', run: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$run' } },
        { $sort: { submittedAt: -1, _id: -1 } },
        { $limit: learningLimits.maxExams + 1 },
      ])
      .toArray(),
    c.examRuns.countDocuments({ studentId, status: 'PENDING_REVIEW', submittedAt: dates }),
  ]);
  return summarizeLearning(
    runs.slice(0, learningLimits.maxExams),
    range,
    from?.toISOString() || null,
    pending,
    runs.length > learningLimits.maxExams,
  );
}
