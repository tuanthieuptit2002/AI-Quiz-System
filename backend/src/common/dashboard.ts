import type { LearningMetric } from '../models/learning.model.js';

const round1 = (value: number) => Math.round(value * 10) / 10;
export const scoreBands = [
  { label: 'Dưới 50', min: 0 },
  { label: '50–59', min: 50 },
  { label: '60–69', min: 60 },
  { label: '70–79', min: 70 },
  { label: '80–89', min: 80 },
  { label: '90–100', min: 90 },
] as const;

export type TopicRow = { subject: string; topic: string; score: number; questions: number };
export type MissedRow = {
  question: string;
  subject: string;
  misses: number;
  served: number;
  rate: number;
};

export function topicLists(topics: LearningMetric[]) {
  const label = (topic: LearningMetric) => ({
    subject: topic.subject,
    topic: topic.topicPath.at(-1) || topic.subject,
    score: round1(topic.score),
  });
  return {
    strong: topics
      .filter((topic) => topic.level === 'STRONG')
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map(label),
    weak: topics
      .filter((topic) => topic.level === 'WEAK')
      .sort((a, b) => a.score - b.score)
      .slice(0, 4)
      .map(label),
  };
}

export function fillDistribution(rows: { _id: number | string; count: number }[]) {
  return scoreBands.map((band) => ({
    label: band.label,
    count: rows.find((row) => row._id === band.min)?.count || 0,
  }));
}

export function questionInsights(
  rows: {
    id?: string;
    text?: string;
    subject?: string;
    topicSubject?: string;
    topic?: string;
    points?: number;
    awarded?: number | null;
  }[],
) {
  const topics = new Map<string, TopicRow & { earned: number; possible: number }>();
  const missed = new Map<string, MissedRow>();
  for (const row of rows) {
    if (typeof row.awarded !== 'number' || !row.points || row.points <= 0) continue;
    const subject =
      (row.topicSubject || row.subject || 'Chưa phân loại').trim() || 'Chưa phân loại';
    const topic = (row.topic || '').trim();
    if (topic) {
      const key = `${subject.toLocaleLowerCase('vi')}\n${topic.toLocaleLowerCase('vi')}`;
      const current = topics.get(key) || {
        subject,
        topic,
        score: 0,
        questions: 0,
        earned: 0,
        possible: 0,
      };
      current.questions += 1;
      current.earned += row.awarded;
      current.possible += row.points;
      topics.set(key, current);
    }
    const text = (row.text || 'Câu hỏi').replace(/\s+/g, ' ').trim().slice(0, 160);
    const key = row.id || text;
    const item = missed.get(key) || { question: text, subject, misses: 0, served: 0, rate: 0 };
    item.served += 1;
    if (row.awarded < row.points) item.misses += 1;
    missed.set(key, item);
  }
  return {
    topics: [...topics.values()]
      .map((topic) => ({
        subject: topic.subject,
        topic: topic.topic,
        questions: topic.questions,
        score: topic.possible ? round1((topic.earned / topic.possible) * 100) : 0,
      }))
      .sort((a, b) => b.questions - a.questions || a.topic.localeCompare(b.topic, 'vi'))
      .slice(0, 8),
    missed: [...missed.values()]
      .filter((item) => item.misses > 0)
      .map((item) => ({ ...item, rate: round1((item.misses / item.served) * 100) }))
      .sort((a, b) => b.misses - a.misses || b.rate - a.rate)
      .slice(0, 5),
  };
}
