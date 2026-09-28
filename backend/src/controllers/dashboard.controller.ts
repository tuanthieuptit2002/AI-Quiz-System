import type { RequestHandler } from 'express';
import { ObjectId, type Db } from 'mongodb';
import type { Collections } from '../database/collections.js';
import { learningSnapshot } from '../common/learning-analysis.js';
import { fillDistribution, questionInsights, topicLists } from '../common/dashboard.js';

const round1 = (value: number) => Math.round(value * 10) / 10;
const chartRuns = 500;
const gradedMatch = (ownerId: unknown) => ({
  ownerId,
  status: 'SUBMITTED',
  scorePercent: { $gte: 0, $lte: 100 },
  passed: { $in: [true, false] },
  submittedAt: { $type: 'date' },
  startedAt: { $type: 'date' },
});

export function teacherDashboard(c: Collections): RequestHandler {
  return async (req, res) => {
    const ownerId = req.user!._id;
    const graded = gradedMatch(ownerId);
    const [classRows, exams, questions, attempts, summaryRows, questionRows] = await Promise.all([
      c.classes.find({ teacherId: ownerId }).project({ studentIds: 1 }).toArray(),
      c.exams.countDocuments({ ownerId, status: { $ne: 'ARCHIVED' } }),
      c.questions.countDocuments({ ownerId, status: { $ne: 'ARCHIVED' } }),
      c.examRuns.countDocuments({ ownerId, status: { $in: ['SUBMITTED', 'PENDING_REVIEW'] } }),
      c.examRuns
        .aggregate<{
          summary: { average: number; graded: number; passed: number; duration: number }[];
          distribution: { _id: number | string; count: number }[];
          months: { _id: string; score: number; attempts: number }[];
          subjects: { _id: string; score: number; minutes: number; attempts: number }[];
          students: { name: string; score: number; attempts: number; passed: number }[];
        }>([
          { $match: graded },
          {
            $addFields: {
              durationSeconds: {
                $max: [0, { $divide: [{ $subtract: ['$submittedAt', '$startedAt'] }, 1000] }],
              },
            },
          },
          {
            $facet: {
              summary: [
                {
                  $group: {
                    _id: null,
                    average: { $avg: '$scorePercent' },
                    graded: { $sum: 1 },
                    passed: { $sum: { $cond: ['$passed', 1, 0] } },
                    duration: { $avg: '$durationSeconds' },
                  },
                },
              ],
              distribution: [
                {
                  $bucket: {
                    groupBy: '$scorePercent',
                    boundaries: [0, 50, 60, 70, 80, 90, 101],
                    default: 'other',
                    output: { count: { $sum: 1 } },
                  },
                },
              ],
              months: [
                {
                  $group: {
                    _id: {
                      $dateToString: {
                        format: '%Y-%m',
                        date: '$submittedAt',
                        timezone: 'Asia/Ho_Chi_Minh',
                      },
                    },
                    score: { $avg: '$scorePercent' },
                    attempts: { $sum: 1 },
                  },
                },
                { $sort: { _id: 1 } },
              ],
              subjects: [
                {
                  $group: {
                    _id: '$subject',
                    score: { $avg: '$scorePercent' },
                    minutes: { $avg: { $divide: ['$durationSeconds', 60] } },
                    attempts: { $sum: 1 },
                  },
                },
                { $sort: { attempts: -1, _id: 1 } },
                { $limit: 8 },
              ],
              students: [
                { $sort: { submittedAt: 1 } },
                {
                  $group: {
                    _id: '$studentId',
                    name: { $last: '$studentName' },
                    score: { $avg: '$scorePercent' },
                    attempts: { $sum: 1 },
                    passed: { $sum: { $cond: ['$passed', 1, 0] } },
                  },
                },
                { $sort: { score: -1, name: 1 } },
                { $limit: 12 },
              ],
            },
          },
        ])
        .toArray(),
      c.examRuns
        .aggregate<{
          id: string;
          text: string;
          subject: string;
          topicSubject: string;
          topic: string;
          points: number;
          awarded: number | null;
        }>([
          { $match: graded },
          { $sort: { submittedAt: -1, _id: -1 } },
          { $limit: chartRuns },
          {
            $project: {
              subject: 1,
              awarded: 1,
              questions: { id: 1, question: 1, points: 1, classification: 1 },
            },
          },
          { $unwind: { path: '$questions', includeArrayIndex: 'index' } },
          {
            $project: {
              id: '$questions.id',
              text: { $substrCP: [{ $ifNull: ['$questions.question', ''] }, 0, 160] },
              subject: { $ifNull: ['$subject', ''] },
              topicSubject: { $ifNull: ['$questions.classification.subject', ''] },
              topic: {
                $ifNull: [{ $arrayElemAt: ['$questions.classification.topicPath', -1] }, ''],
              },
              points: '$questions.points',
              awarded: { $arrayElemAt: ['$awarded', '$index'] },
            },
          },
        ])
        .toArray(),
    ]);
    const summary = summaryRows[0]?.summary[0];
    const gradedCount = summary?.graded || 0;
    const students = new Set(
      classRows.flatMap((row) => row.studentIds.map((id: ObjectId) => id.toHexString())),
    );
    const insights = questionInsights(questionRows);
    const months = (summaryRows[0]?.months || []).slice(-6);
    res.json({
      students: students.size,
      exams,
      questions,
      attempts,
      averageScore: gradedCount ? round1(summary!.average) : null,
      passRate: gradedCount ? round1((summary!.passed / gradedCount) * 100) : null,
      averageMinutes: gradedCount ? round1(summary!.duration / 60) : null,
      distribution: fillDistribution(summaryRows[0]?.distribution || []),
      passFail: { passed: summary?.passed || 0, failed: gradedCount - (summary?.passed || 0) },
      months: months.map((month) => ({
        label: month._id.slice(5) + '/' + month._id.slice(0, 4),
        score: round1(month.score),
        attempts: month.attempts,
      })),
      subjects: (summaryRows[0]?.subjects || []).map((subject) => ({
        subject: subject._id || 'Chưa phân loại',
        score: round1(subject.score),
        minutes: round1(subject.minutes),
        attempts: subject.attempts,
      })),
      topics: insights.topics,
      missed: insights.missed,
      studentPerformance: (summaryRows[0]?.students || []).map((student) => ({
        name: student.name || 'Học sinh',
        score: round1(student.score),
        attempts: student.attempts,
        passRate: student.attempts ? round1((student.passed / student.attempts) * 100) : 0,
      })),
      truncated: gradedCount > chartRuns,
    });
  };
}

export function studentDashboard(c: Collections, db: Db): RequestHandler {
  return async (req, res) => {
    const studentId = req.user!._id;
    const [totals, snapshot] = await Promise.all([
      c.attempts
        .aggregate<{ count: number; average: number; best: number; seconds: number }>([
          { $match: { studentId } },
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              average: { $avg: '$score' },
              best: { $max: '$score' },
              seconds: { $sum: '$durationSeconds' },
            },
          },
        ])
        .toArray(),
      learningSnapshot(db, studentId, 'all'),
    ]);
    const total = totals[0];
    const topics = topicLists(snapshot.topics);
    res.json({
      completed: total?.count || 0,
      averageScore: total?.count ? round1(total.average * 10) : null,
      bestScore: total?.count ? round1(total.best * 10) : null,
      studyMinutes: Math.round((total?.seconds || 0) / 60),
      strong: topics.strong,
      weak: topics.weak,
    });
  };
}
