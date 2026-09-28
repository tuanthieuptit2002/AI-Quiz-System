'use client';
import { useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  BookOpenText,
  Check,
  ClipboardList,
  History,
  LibraryBig,
  PanelLeft,
  PartyPopper,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { Modal } from '../ui';
import type { Role } from '@/lib/types';

type TourStep = {
  label: string;
  icon: typeof Sparkles;
  title: string;
  text: string;
  points?: string[];
  menu?: string;
};

const finish = (role: Role): TourStep => ({
  label: 'Hoàn tất',
  icon: PartyPopper,
  title: 'Bạn đã sẵn sàng!',
  text: 'Trung tâm hướng dẫn có bài viết từng bước cho mọi tính năng bạn dùng được. Bạn có thể mở lại hướng dẫn nhanh này bất cứ lúc nào từ đó.',
  points:
    role === 'STUDENT'
      ? [
          'Cách vào lớp và làm bài thi',
          'Đọc kết quả và hỏi AI giải thích',
          'Luyện tập chủ đề còn yếu',
        ]
      : role === 'TEACHER'
        ? [
            'Soạn câu hỏi và đề thi',
            'Giao bài cho lớp kèm hạn nộp',
            'Chấm bài và phân tích câu hỏi',
          ]
        : ['Quản lý tài khoản người dùng', 'Soạn câu hỏi và đề thi', 'Nhận thông báo quan trọng'],
  menu: 'Hướng dẫn',
});

const tours: Record<Role, TourStep[]> = {
  ADMIN: [
    {
      label: 'Chào mừng',
      icon: Sparkles,
      title: 'Chào mừng đến với QuizSpace',
      text: 'Hướng dẫn nhanh này giới thiệu các khu vực chính của Quản trị viên. Chỉ mất khoảng một phút.',
    },
    {
      label: 'Người dùng',
      icon: Users,
      title: 'Quản lý người dùng',
      text: 'Tạo tài khoản, đổi vai trò, khóa hoặc mở khóa người dùng.',
      points: [
        'Tìm theo tên, email và lọc theo vai trò, trạng thái',
        'Khóa hoặc đổi vai trò sẽ đăng xuất người đó khỏi mọi thiết bị',
      ],
      menu: 'Người dùng',
    },
    {
      label: 'Nội dung',
      icon: LibraryBig,
      title: 'Câu hỏi, đề thi và AI',
      text: 'Quản trị viên dùng được toàn bộ công cụ soạn nội dung với phạm vi toàn hệ thống.',
      points: [
        'Ngân hàng câu hỏi và Tạo câu hỏi AI',
        'Đề thi & kiểm tra, Tạo đề thi AI',
        'Phân tích câu hỏi sau khi có bài làm',
      ],
      menu: 'Ngân hàng câu hỏi',
    },
    finish('ADMIN'),
  ],
  TEACHER: [
    {
      label: 'Chào mừng',
      icon: Sparkles,
      title: 'Chào mừng đến với QuizSpace',
      text: 'Hướng dẫn nhanh này giới thiệu quy trình của giáo viên: soạn câu hỏi, tạo đề, giao bài và chấm điểm.',
    },
    {
      label: 'Câu hỏi',
      icon: LibraryBig,
      title: 'Xây dựng ngân hàng câu hỏi',
      text: 'Soạn câu hỏi theo môn, chủ đề và độ khó, hoặc nhập nhanh từ Excel/CSV.',
      points: [
        '8 dạng câu: trắc nghiệm, Đúng/Sai, điền chỗ trống, tự luận…',
        'Tạo câu hỏi AI từ chủ đề, tài liệu hoặc URL rồi duyệt vào ngân hàng',
      ],
      menu: 'Ngân hàng câu hỏi',
    },
    {
      label: 'Đề thi',
      icon: ClipboardList,
      title: 'Tạo và phát hành đề thi',
      text: 'Chọn câu thủ công hoặc ngẫu nhiên theo độ khó, cài thời gian, lượt thi và đối tượng.',
      points: [
        'Bật giám sát phòng thi để giới hạn số lần rời trang',
        'Tạo đề thi AI từ một yêu cầu mô tả',
      ],
      menu: 'Đề thi & kiểm tra',
    },
    {
      label: 'Lớp học',
      icon: BookOpen,
      title: 'Lớp học và giao bài',
      text: 'Tạo lớp, gửi mã hoặc liên kết mời cho học sinh, rồi giao đề kèm hạn nộp.',
      points: [
        'Học sinh nhận thông báo khi có bài mới',
        'Tab Kết quả cho biết ai đã nộp và điểm bao nhiêu',
      ],
      menu: 'Lớp học',
    },
    {
      label: 'Chấm & phân tích',
      icon: BarChart3,
      title: 'Chấm bài và phân tích câu hỏi',
      text: 'Câu khách quan được chấm tự động; câu tự luận có gợi ý chấm bằng AI.',
      points: [
        'Gửi nhận xét, học sinh nhận thông báo khi có điểm',
        'Xem độ khó thực tế, độ phân biệt và phương án nhiễu',
      ],
      menu: 'Phân tích câu hỏi',
    },
    finish('TEACHER'),
  ],
  STUDENT: [
    {
      label: 'Chào mừng',
      icon: Sparkles,
      title: 'Chào mừng đến với QuizSpace',
      text: 'Hướng dẫn nhanh này giúp bạn biết cách vào lớp, làm bài và theo dõi tiến bộ.',
    },
    {
      label: 'Lớp học',
      icon: BookOpen,
      title: 'Tham gia lớp học',
      text: 'Nhập mã lớp 10 ký tự hoặc mở liên kết mời giáo viên gửi để vào lớp.',
      points: ['Xem bài kiểm tra, bài thi và bài học của lớp', 'Theo dõi hạn nộp của từng bài'],
      menu: 'Lớp học',
    },
    {
      label: 'Làm bài',
      icon: ClipboardList,
      title: 'Làm bài thi',
      text: 'Bấm “Bắt đầu thi” trên đề đang mở. Đáp án được lưu tự động trong khi làm.',
      points: [
        'Đánh dấu câu để quay lại xem sau',
        'Với đề có giám sát, đừng chuyển tab hay rời cửa sổ',
      ],
      menu: 'Đề thi & kiểm tra',
    },
    {
      label: 'Kết quả',
      icon: History,
      title: 'Kết quả và phân tích',
      text: 'Xem điểm, đáp án và nhận xét của giáo viên, hỏi AI giải thích từng câu.',
      points: [
        'Tiến độ học: điểm trung bình, mục tiêu tuần',
        'Phân tích học tập chỉ ra chủ đề cần ôn',
      ],
      menu: 'Lịch sử thi',
    },
    {
      label: 'Luyện tập',
      icon: Target,
      title: 'Luyện tập cá nhân',
      text: 'Quiz tự điều chỉnh độ khó, tập trung vào những chủ đề bạn còn yếu.',
      points: ['Không ảnh hưởng điểm bài thi chính thức', 'Có thể kết thúc sớm bất cứ lúc nào'],
      menu: 'Luyện tập cá nhân',
    },
    finish('STUDENT'),
  ],
};

export function OnboardingWizard({
  role,
  name,
  close,
}: {
  role: Role;
  name: string;
  close: () => void;
}) {
  const steps = tours[role];
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const last = index === steps.length - 1;
  const Icon = step.icon;
  return (
    <Modal title={`Xin chào, ${name}!`} description="Hướng dẫn nhanh cho người mới" close={close}>
      <ol className="tour-stepper">
        {steps.map((item, position) => (
          <li
            key={item.label}
            className={position < index ? 'done' : position === index ? 'active' : ''}
          >
            <button
              type="button"
              onClick={() => setIndex(position)}
              aria-label={`Bước ${position + 1}: ${item.label}`}
              aria-current={position === index ? 'step' : undefined}
            >
              <span>{position < index ? <Check size={13} strokeWidth={3} /> : position + 1}</span>
              <small>{item.label}</small>
            </button>
          </li>
        ))}
      </ol>
      <div className="tour-body" key={index}>
        <span className="tour-icon">
          <Icon size={24} />
        </span>
        <small className="tour-count">
          Bước {index + 1}/{steps.length}
        </small>
        <h3>{step.title}</h3>
        <p>{step.text}</p>
        {step.points && (
          <ul>
            {step.points.map((point) => (
              <li key={point}>
                <Check size={14} /> {point}
              </li>
            ))}
          </ul>
        )}
        {step.menu && (
          <span className="tour-menu">
            <PanelLeft size={14} />
            Trong menu: <b>{step.menu}</b>
          </span>
        )}
      </div>
      <footer className="tour-actions">
        <button type="button" className="text-link" onClick={close}>
          {last ? 'Để sau' : 'Bỏ qua'}
        </button>
        <div>
          {index > 0 && (
            <button type="button" className="btn btn-secondary" onClick={() => setIndex(index - 1)}>
              <ArrowLeft size={16} /> Quay lại
            </button>
          )}
          {last ? (
            <Link href="/docs" className="btn btn-primary" onClick={close}>
              <BookOpenText size={16} /> Mở trung tâm hướng dẫn
            </Link>
          ) : (
            <button type="button" className="btn btn-primary" onClick={() => setIndex(index + 1)}>
              Tiếp tục <ArrowRight size={16} />
            </button>
          )}
        </div>
      </footer>
    </Modal>
  );
}
