import { classifyLevel } from './learning-analysis.js';
import { difficulties, type QuestionContent } from '../models/question.model.js';
import type { LearningMetric } from '../models/learning.model.js';

export type Difficulty = QuestionContent['difficulty'];
export const practiceLimits = {
  maxTopics: 4,
  minPerTopic: 5,
  maxPerTopic: 10,
  dailySessions: 6,
  dailyAiQuestions: 40,
};
export interface PracticeHistory {
  topicId: string;
  questions: number;
  earned: number;
  possible: number;
  sessions: number;
}
export interface PracticeTopicPlan {
  topicId: string;
  subject: string;
  topicPath: string[];
  level: LearningMetric['level'];
  officialScore: number;
  blendedScore: number;
  count: number;
  startDifficulty: Difficulty;
}
const round = (n: number) => Math.round(n * 100) / 100;

// One topic is a short set; two topics split 10/10; three or four use the 25-question cap.
export function practiceTotal(topicCount: number) {
  if (topicCount <= 1) return 10;
  if (topicCount === 2) return 20;
  return 25;
}
export function topicWeight(level: LearningMetric['level'], score: number) {
  const gap = Math.max(1, 100 - score);
  if (level === 'WEAK') return gap;
  if (level === 'DEVELOPING') return gap * 0.5;
  return 0;
}
export function startDifficulty(score: number): Difficulty {
  if (score < 45) return 'EASY';
  if (score < 60) return 'MEDIUM';
  if (score < 80) return 'HARD';
  return 'VERY_HARD';
}
export function nextDifficulty(current: Difficulty, correct: boolean): Difficulty {
  const index = difficulties.indexOf(current);
  const next = correct ? Math.min(difficulties.length - 1, index + 1) : Math.max(0, index - 1);
  return difficulties[next];
}
export function difficultyShift(from: Difficulty, to: Difficulty): 'HARDER' | 'EASIER' | 'SAME' {
  const delta = difficulties.indexOf(to) - difficulties.indexOf(from);
  return delta > 0 ? 'HARDER' : delta < 0 ? 'EASIER' : 'SAME';
}

// Extra questions go to weak topics first. Two weak topics and one developing topic
// therefore land on 10 / 10 / 5 when the total is 25.
function give(counts: number[], weights: number[], extra: number) {
  let left = extra;
  while (left > 0) {
    let best = -1;
    let bestScore = -1;
    for (let i = 0; i < counts.length; i++) {
      if (weights[i] <= 0 || counts[i] >= practiceLimits.maxPerTopic) continue;
      const score = weights[i] / (counts[i] + 1);
      if (best < 0 || score > bestScore) {
        best = i;
        bestScore = score;
      }
    }
    if (best < 0) break;
    counts[best]++;
    left--;
  }
  return left;
}
export function allocatePracticeCounts(topics: Pick<LearningMetric, 'level' | 'score'>[]) {
  if (!topics.length) return [];
  const counts = topics.map(() => practiceLimits.minPerTopic);
  let extra = practiceTotal(topics.length) - counts.reduce((sum, n) => sum + n, 0);
  extra = give(
    counts,
    topics.map((topic) => (topic.level === 'WEAK' ? topicWeight('WEAK', topic.score) : 0)),
    extra,
  );
  give(
    counts,
    topics.map((topic) =>
      topic.level === 'DEVELOPING' ? topicWeight('DEVELOPING', topic.score) : 0,
    ),
    extra,
  );
  return counts;
}
export function blendTopic(metric: LearningMetric, practice?: PracticeHistory): LearningMetric {
  if (!practice?.possible) return metric;
  const earned = metric.earned + practice.earned;
  const possible = metric.possible + practice.possible;
  const questions = metric.questions + practice.questions;
  const exams = metric.exams + practice.sessions;
  const percent = (earned / possible) * 100;
  return {
    ...metric,
    earned: round(earned),
    possible: round(possible),
    questions,
    exams,
    score: round(percent),
    level: classifyLevel(questions, exams, percent),
  };
}
function compose(topics: LearningMetric[], history: PracticeHistory[]) {
  const byId = new Map(history.map((row) => [row.topicId, row]));
  const selected = topics
    .map((topic) => blendTopic(topic, byId.get(topic.id)))
    .filter((topic) => topic.level === 'WEAK' || topic.level === 'DEVELOPING')
    .sort((a, b) => a.score - b.score || a.id.localeCompare(b.id))
    .slice(0, practiceLimits.maxTopics);
  const counts = allocatePracticeCounts(selected);
  const official = new Map(topics.map((topic) => [topic.id, topic]));
  const plan: PracticeTopicPlan[] = selected.map((topic, index) => ({
    topicId: topic.id,
    subject: topic.subject,
    topicPath: [...topic.topicPath],
    level: topic.level,
    officialScore: official.get(topic.id)!.score,
    blendedScore: topic.score,
    count: counts[index],
    startDifficulty: startDifficulty(topic.score),
  }));
  return { plan, total: plan.reduce((sum, topic) => sum + topic.count, 0) };
}
const signature = (plan: PracticeTopicPlan[]) =>
  plan
    .map((topic) => `${topic.topicId}:${topic.count}:${topic.startDifficulty}:${topic.level}`)
    .join('|');

export function buildPracticePlan(topics: LearningMetric[], history: PracticeHistory[] = []) {
  const current = compose(topics, history);
  return {
    ...current,
    adjusted: signature(current.plan) !== signature(compose(topics, []).plan),
  };
}
export function nextPracticeTopic<
  T extends { topicId: string; count: number; blendedScore: number },
>(plan: T[], served: { topicId: string }[]) {
  const used = new Map<string, number>();
  for (const item of served) used.set(item.topicId, (used.get(item.topicId) || 0) + 1);
  return (
    plan
      .filter((topic) => (used.get(topic.topicId) || 0) < topic.count)
      .sort((a, b) => {
        const left = (used.get(a.topicId) || 0) / a.count;
        const right = (used.get(b.topicId) || 0) / b.count;
        return (
          left - right || a.blendedScore - b.blendedScore || a.topicId.localeCompare(b.topicId)
        );
      })[0] || null
  );
}
