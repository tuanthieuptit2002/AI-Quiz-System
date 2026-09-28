import type { QuestionContent } from '../models/question.model.js';

export const analyticsSample = 10;
export const analyticsRunLimit = 2000;
export const analyticsFlags = ['too_easy', 'too_hard', 'mismatch', 'weak_discrimination'] as const;
export type AnalyticsFlag = (typeof analyticsFlags)[number];
export type Difficulty = QuestionContent['difficulty'];

const difficultyLabels: Record<Difficulty, string> = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Khó',
  VERY_HARD: 'Rất khó',
};
const difficultyRank: Record<Difficulty, number> = { EASY: 0, MEDIUM: 1, HARD: 2, VERY_HARD: 3 };
const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;
const norm = (value: string) =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi');

export type ItemObservation = {
  points: number;
  awarded: number | null;
  scorePercent: number | null;
  dwellMs: number | null;
  type: QuestionContent['type'];
  options: { id: string; text: string }[];
  left: { id: string; text: string }[];
  correct: string[];
  response: string[];
};

export type AnswerShare = {
  text: string;
  count: number;
  rate: number;
  role: 'key' | 'distractor' | 'slot';
  flag: 'attractive' | 'unused' | null;
};

export type QuestionAnalytics = {
  attempts: number;
  graded: number;
  correct: number;
  correctRate: number | null;
  difficultyIndex: number | null;
  averageSeconds: number | null;
  expected: Difficulty;
  actual: Difficulty | null;
  discrimination: number | null;
  discriminationLabel: string | null;
  flags: AnalyticsFlag[];
  distribution: 'choices' | 'slots' | 'answers' | 'none';
  choices: AnswerShare[];
  omitted: number;
  wrongAnswers: { text: string; count: number }[];
  warnings: string[];
};

export function actualDifficulty(correctRate: number): Difficulty {
  if (correctRate >= 70) return 'EASY';
  if (correctRate >= 40) return 'MEDIUM';
  if (correctRate >= 20) return 'HARD';
  return 'VERY_HARD';
}

export function discriminationIndex(rows: { scorePercent: number; correct: boolean }[]) {
  if (rows.length < analyticsSample) return null;
  const sorted = [...rows].sort((a, b) => b.scorePercent - a.scorePercent);
  let group = Math.round(sorted.length * 0.27);
  if (group * 2 > sorted.length) group = Math.floor(sorted.length / 2);
  if (group < 1) return null;
  const rate = (slice: { correct: boolean }[]) => slice.filter((row) => row.correct).length / group;
  return round2(rate(sorted.slice(0, group)) - rate(sorted.slice(-group)));
}

function discriminationLabel(value: number) {
  if (value >= 0.4) return 'Rất tốt';
  if (value >= 0.3) return 'Tốt';
  if (value >= 0.2) return 'Chấp nhận được';
  if (value >= 0) return 'Kém';
  return 'Ngược';
}

function percentText(value: number) {
  return `${Math.round(value).toLocaleString('vi-VN')}%`;
}

export function analyzeQuestion(
  expected: Difficulty,
  observations: ItemObservation[],
): QuestionAnalytics {
  const gradedRows = observations.filter(
    (item) => typeof item.awarded === 'number' && item.points > 0,
  );
  const correctRows = gradedRows.filter((item) => (item.awarded as number) >= item.points);
  const correctRate = gradedRows.length
    ? round1((correctRows.length / gradedRows.length) * 100)
    : null;
  const timed = observations
    .map((item) => item.dwellMs)
    .filter((value): value is number => typeof value === 'number' && value >= 0);
  const averageSeconds = timed.length
    ? round1(timed.reduce((sum, value) => sum + value, 0) / timed.length / 1000)
    : null;
  const comparable = gradedRows.filter(
    (item): item is ItemObservation & { scorePercent: number; awarded: number } =>
      typeof item.scorePercent === 'number' && typeof item.awarded === 'number',
  );
  const discrimination = discriminationIndex(
    comparable.map((item) => ({
      scorePercent: item.scorePercent,
      correct: item.awarded >= item.points,
    })),
  );
  const enough = gradedRows.length >= analyticsSample;
  const actual = enough && correctRate !== null ? actualDifficulty(correctRate) : null;
  const tooEasy = enough && correctRate !== null && correctRate >= 90;
  const tooHard = enough && correctRate !== null && correctRate <= 20;
  const mismatch = !!actual && actual !== expected;
  const weakDiscrimination = discrimination !== null && discrimination < 0.2;
  const flags: AnalyticsFlag[] = [];
  if (tooEasy) flags.push('too_easy');
  if (tooHard) flags.push('too_hard');
  if (mismatch) flags.push('mismatch');
  if (weakDiscrimination) flags.push('weak_discrimination');
  const distribution = shareDistribution(observations);
  const warnings = qualityWarnings({
    expected,
    actual,
    correctRate,
    graded: gradedRows.length,
    attempts: observations.length,
    discrimination,
    choices: distribution.choices,
  });
  return {
    attempts: observations.length,
    graded: gradedRows.length,
    correct: correctRows.length,
    correctRate,
    difficultyIndex: correctRate === null ? null : round2(correctRate / 100),
    averageSeconds,
    expected,
    actual,
    discrimination,
    discriminationLabel: discrimination === null ? null : discriminationLabel(discrimination),
    flags,
    distribution: distribution.kind,
    choices: distribution.choices,
    omitted: distribution.omitted,
    wrongAnswers: distribution.wrongAnswers,
    warnings,
  };
}

function qualityWarnings(input: {
  expected: Difficulty;
  actual: Difficulty | null;
  correctRate: number | null;
  graded: number;
  attempts: number;
  discrimination: number | null;
  choices: AnswerShare[];
}) {
  if (!input.attempts) return ['Câu hỏi chưa có lượt làm bài đã nộp.'];
  if (!input.graded) return ['Các lượt làm chưa có điểm nên chưa tính được tỷ lệ đúng.'];
  if (input.graded < analyticsSample || input.correctRate === null) {
    return [
      `Chưa đủ lượt chấm để kết luận độ khó và độ phân biệt. Cần ít nhất ${analyticsSample} lượt đã có điểm.`,
    ];
  }
  const warnings: string[] = [];
  const percent = percentText(input.correctRate);
  if (input.actual && input.actual !== input.expected) {
    const harder = difficultyRank[input.actual] > difficultyRank[input.expected];
    warnings.push(
      harder
        ? `Câu này được đặt độ khó ${difficultyLabels[input.expected]} nhưng chỉ ${percent} thí sinh trả lời đúng.`
        : `Câu này được đặt độ khó ${difficultyLabels[input.expected]} nhưng ${percent} thí sinh trả lời đúng.`,
    );
  }
  if (input.correctRate >= 90) warnings.push('Câu quá dễ: từ 90% lượt làm đúng toàn bộ điểm.');
  if (input.correctRate <= 20)
    warnings.push('Câu quá khó: không quá 20% lượt làm đúng toàn bộ điểm.');
  if (input.discrimination !== null && input.discrimination < 0)
    warnings.push('Chỉ số phân biệt âm. Học sinh điểm cao sai nhiều hơn học sinh điểm thấp.');
  else if (input.discrimination !== null && input.discrimination < 0.2)
    warnings.push('Chỉ số phân biệt thấp. Câu chưa tách được học sinh giỏi và học sinh yếu.');
  for (const choice of input.choices) {
    if (warnings.length >= 6) break;
    const text = choice.text.slice(0, 80);
    if (choice.flag === 'attractive')
      warnings.push(`Phương án “${text}” được chọn nhiều hơn đáp án đúng.`);
    if (choice.flag === 'unused') warnings.push(`Phương án “${text}” gần như không ai chọn.`);
  }
  return warnings;
}

function shareDistribution(observations: ItemObservation[]): {
  kind: QuestionAnalytics['distribution'];
  choices: AnswerShare[];
  omitted: number;
  wrongAnswers: { text: string; count: number }[];
} {
  const type = observations.find((item) => item.type)?.type;
  if (type && ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(type))
    return { kind: 'choices', ...choiceShares(observations), wrongAnswers: [] };
  if (type && ['ORDERING', 'MATCHING'].includes(type))
    return { kind: 'slots', choices: slotShares(observations), omitted: 0, wrongAnswers: [] };
  if (type && ['FILL_BLANK', 'SHORT_ANSWER'].includes(type))
    return { kind: 'answers', choices: [], omitted: 0, wrongAnswers: wrongShares(observations) };
  return { kind: 'none', choices: [], omitted: 0, wrongAnswers: [] };
}

function choiceShares(observations: ItemObservation[]) {
  const buckets = new Map<
    string,
    { text: string; selected: number; keyed: number; served: number }
  >();
  let omitted = 0;
  for (const item of observations) {
    if (!['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'TRUE_FALSE'].includes(item.type)) continue;
    if (typeof item.awarded !== 'number') continue;
    const picked = new Set(item.response.filter(Boolean));
    if (![...picked].some((id) => item.options.some((option) => option.id === id))) omitted += 1;
    const seen = new Set<string>();
    for (const option of item.options) {
      const key = norm(option.text);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const bucket = buckets.get(key) || {
        text: option.text.trim(),
        selected: 0,
        keyed: 0,
        served: 0,
      };
      bucket.served += 1;
      if (item.correct.includes(option.id)) bucket.keyed += 1;
      if (picked.has(option.id)) bucket.selected += 1;
      buckets.set(key, bucket);
    }
  }
  const rows = [...buckets.values()];
  const keys = rows.filter((row) => row.keyed > 0 && row.keyed * 2 >= row.served);
  const keySelected = Math.max(0, ...keys.map((row) => row.selected));
  const choices: AnswerShare[] = rows
    .map((row) => {
      const key = row.keyed > 0 && row.keyed * 2 >= row.served;
      let flag: AnswerShare['flag'] = null;
      if (!key && keys.length && row.selected > keySelected) flag = 'attractive';
      else if (!key && row.served >= 20 && row.selected / row.served < 0.05) flag = 'unused';
      return {
        text: row.text,
        count: row.selected,
        rate: row.served ? round1((row.selected / row.served) * 100) : 0,
        role: key ? ('key' as const) : ('distractor' as const),
        flag,
      };
    })
    .sort((a, b) => Number(b.role === 'key') - Number(a.role === 'key') || b.count - a.count);
  return { choices, omitted };
}

function slotShares(observations: ItemObservation[]): AnswerShare[] {
  const buckets = new Map<string, { text: string; correct: number; served: number }>();
  for (const item of observations) {
    if (typeof item.awarded !== 'number') continue;
    const slots =
      item.type === 'ORDERING'
        ? item.correct.map((id, index) => ({
            text:
              item.options.find((option) => option.id === id)?.text.trim() || `Mục ${index + 1}`,
            hit: item.response[index] === id,
          }))
        : item.type === 'MATCHING'
          ? item.left.map((left, index) => ({
              text: left.text.trim() || `Cặp ${index + 1}`,
              hit: !!item.response[index] && item.response[index] === item.correct[index],
            }))
          : [];
    for (const slot of slots) {
      const key = norm(slot.text);
      const bucket = buckets.get(key) || { text: slot.text, correct: 0, served: 0 };
      bucket.served += 1;
      if (slot.hit) bucket.correct += 1;
      buckets.set(key, bucket);
    }
  }
  return [...buckets.values()].map((bucket) => ({
    text: bucket.text,
    count: bucket.correct,
    rate: bucket.served ? round1((bucket.correct / bucket.served) * 100) : 0,
    role: 'slot' as const,
    flag: null,
  }));
}

function wrongShares(observations: ItemObservation[]) {
  const counts = new Map<string, { text: string; count: number }>();
  for (const item of observations) {
    if (typeof item.awarded !== 'number' || item.awarded >= item.points) continue;
    const text = item.response
      .map((part) => part.trim())
      .filter(Boolean)
      .join(' | ')
      .slice(0, 80);
    if (!text) continue;
    const key = norm(text);
    const row = counts.get(key) || { text, count: 0 };
    row.count += 1;
    counts.set(key, row);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
}

export function attributeQuestion(
  delivered: { bankQuestionId?: string; question: string; type: string },
  examKeys?: Map<string, string>,
) {
  if (delivered.bankQuestionId && /^[a-f\d]{24}$/i.test(delivered.bankQuestionId))
    return delivered.bankQuestionId;
  return examKeys?.get(`${norm(delivered.question)}\n${delivered.type}`) || null;
}

export function examQuestionKeys(
  questions: {
    questionId?: { toHexString(): string };
    content?: { question?: string; type?: string };
  }[],
) {
  const counts = new Map<string, { id: string; count: number }>();
  for (const item of questions) {
    const id = item.questionId?.toHexString();
    const text = item.content?.question;
    const type = item.content?.type;
    if (!id || !text || !type) continue;
    const key = `${norm(text)}\n${type}`;
    const current = counts.get(key) || { id, count: 0 };
    current.count += 1;
    counts.set(key, current);
  }
  const unique = new Map<string, string>();
  for (const [key, value] of counts) if (value.count === 1) unique.set(key, value.id);
  return unique;
}
