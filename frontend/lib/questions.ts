export const typeLabels = {
  SINGLE_CHOICE: 'Một đáp án',
  MULTIPLE_CHOICE: 'Nhiều đáp án',
  TRUE_FALSE: 'Đúng / Sai',
  FILL_BLANK: 'Điền vào chỗ trống',
  SHORT_ANSWER: 'Trả lời ngắn',
  ESSAY: 'Tự luận',
  MATCHING: 'Ghép cặp',
  ORDERING: 'Sắp xếp',
};
export const typeEnglish = {
  SINGLE_CHOICE: 'Single Choice',
  MULTIPLE_CHOICE: 'Multiple Choice',
  TRUE_FALSE: 'True / False',
  FILL_BLANK: 'Fill in the Blank',
  SHORT_ANSWER: 'Short Answer',
  ESSAY: 'Essay',
  MATCHING: 'Matching',
  ORDERING: 'Ordering',
};
export const difficultyLabels = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Khó',
  VERY_HARD: 'Rất khó',
};
export const statusLabels = { DRAFT: 'Bản nháp', READY: 'Sẵn sàng', ARCHIVED: 'Đã lưu trữ' };
export type QuestionType = keyof typeof typeLabels;
export interface QuestionContent {
  type: QuestionType;
  subject: string;
  topicPath: string[];
  difficulty: keyof typeof difficultyLabels;
  status: keyof typeof statusLabels;
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
  id: string;
  ownerId: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export type QuestionSummary = Omit<
  Question,
  'image' | 'options' | 'answers' | 'pairs' | 'rubric' | 'explanation'
>;
export interface QuestionMetadata {
  counts: { _id: keyof typeof statusLabels; count: number }[];
  types: { _id: QuestionType; count: number }[];
  taxonomy: { _id: { subject: string; topicPath: string[] }; count: number }[];
  tags: { _id: string }[];
}
export interface Version {
  version: number;
  editorName: string;
  note: string;
  createdAt: string;
  content: QuestionContent;
}
export function emptyQuestion(type: QuestionType = 'SINGLE_CHOICE'): QuestionContent {
  return {
    type,
    subject: '',
    topicPath: [],
    difficulty: 'MEDIUM',
    status: 'DRAFT',
    question: '',
    options: ['SINGLE_CHOICE', 'MULTIPLE_CHOICE', 'ORDERING'].includes(type)
      ? [
          { id: 'a', text: '' },
          { id: 'b', text: '' },
          { id: 'c', text: '' },
          { id: 'd', text: '' },
        ]
      : [],
    answers: type === 'TRUE_FALSE' ? ['true'] : type === 'ORDERING' ? ['a', 'b', 'c', 'd'] : [],
    pairs:
      type === 'MATCHING'
        ? [
            { left: '', right: '' },
            { left: '', right: '' },
          ]
        : [],
    rubric: '',
    explanation: '',
    tags: [],
    image: '',
    imageAlt: '',
  };
}
export function contentOf(q: QuestionContent): QuestionContent {
  const {
    type,
    subject,
    topicPath,
    difficulty,
    status,
    question,
    options,
    answers,
    pairs,
    rubric,
    explanation,
    tags,
    image,
    imageAlt,
  } = q;
  return {
    type,
    subject,
    topicPath,
    difficulty,
    status,
    question,
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
