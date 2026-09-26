'use client';
import Image from 'next/image';
import { useState } from 'react';
import { Check, Eye, EyeOff, GripVertical, Lightbulb } from 'lucide-react';
import { typeLabels, difficultyLabels, type QuestionContent } from '@/lib/questions';

export function QuestionPreview({
  value,
  showAnswers = false,
}: {
  value: QuestionContent;
  showAnswers?: boolean;
}) {
  const [revealed, setRevealed] = useState(showAnswers);
  return (
    <div className="question-preview">
      <div className="question-badges">
        <span className="qb-badge">{typeLabels[value.type]}</span>
        <span className={`qb-badge difficulty-${value.difficulty.toLowerCase()}`}>
          {difficultyLabels[value.difficulty]}
        </span>
      </div>
      <h3>{value.question || 'Nội dung câu hỏi sẽ xuất hiện tại đây…'}</h3>
      {value.image && (
        <Image
          src={value.image}
          alt={value.imageAlt || 'Hình minh họa câu hỏi'}
          width={1000}
          height={600}
          unoptimized
          className="question-image"
        />
      )}
      <div className="preview-answers">
        {value.options.map((option, index) => (
          <div
            key={option.id}
            className={`preview-option ${revealed && value.answers.includes(option.id) && value.type !== 'ORDERING' ? 'is-correct' : ''}`}
          >
            <span className="option-letter">
              {value.type === 'ORDERING' ? (
                <GripVertical size={15} />
              ) : (
                String.fromCharCode(65 + index)
              )}
            </span>
            <span>{option.text || `Lựa chọn ${index + 1}`}</span>
            {revealed && value.type !== 'ORDERING' && value.answers.includes(option.id) && (
              <Check size={17} />
            )}
          </div>
        ))}
        {value.type === 'TRUE_FALSE' &&
          ['true', 'false'].map((v) => (
            <div
              key={v}
              className={`preview-option ${revealed && value.answers.includes(v) ? 'is-correct' : ''}`}
            >
              {v === 'true' ? 'Đúng' : 'Sai'}
              {revealed && value.answers.includes(v) && <Check size={17} />}
            </div>
          ))}
        {value.type === 'MATCHING' && (
          <div className="matching-preview">
            <div>
              {value.pairs.map((p, i) => (
                <p key={i}>
                  {i + 1}. {p.left || 'Vế trái'}
                </p>
              ))}
            </div>
            <div>
              {[...value.pairs].reverse().map((p, i) => (
                <p key={i}>
                  {String.fromCharCode(65 + i)}. {p.right || 'Vế phải'}
                </p>
              ))}
            </div>
          </div>
        )}
        {['FILL_BLANK', 'SHORT_ANSWER', 'ESSAY'].includes(value.type) && (
          <div className="preview-response">
            {value.type === 'ESSAY' ? 'Khu vực viết bài tự luận…' : 'Câu trả lời của học sinh…'}
          </div>
        )}
      </div>
      <button
        type="button"
        className="text-link answer-toggle"
        onClick={() => setRevealed(!revealed)}
      >
        {revealed ? <EyeOff size={16} /> : <Eye size={16} />}
        {revealed ? 'Ẩn đáp án' : 'Xem đáp án & giải thích'}
      </button>
      {revealed && (
        <div className="answer-explanation">
          <b>
            <Lightbulb size={17} /> Đáp án & hướng dẫn
          </b>
          {value.type === 'ORDERING' && (
            <p>
              {value.answers
                .map((id) => value.options.find((o) => o.id === id)?.text || '…')
                .join(' → ')}
            </p>
          )}
          {value.type === 'MATCHING' &&
            value.pairs.map((p, i) => (
              <p key={i}>
                {p.left} → {p.right}
              </p>
            ))}
          {value.type === 'FILL_BLANK' &&
            value.answers.map((a, i) => (
              <p key={i}>
                {`{{${i + 1}}}`}: {a}
              </p>
            ))}
          {value.type === 'SHORT_ANSWER' && (
            <p>Chấp nhận: {value.answers.join(' / ') || 'Chưa nhập'}</p>
          )}
          {value.type === 'ESSAY' && <p>{value.rubric || 'Chưa nhập hướng dẫn chấm.'}</p>}
          {value.explanation && <p>{value.explanation}</p>}
        </div>
      )}
    </div>
  );
}
