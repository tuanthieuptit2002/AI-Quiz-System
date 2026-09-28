import type { Role } from './types';

export type DocImage = { src: string; alt: string; width: number; height: number };

export type DocSection = {
  heading: string;
  text?: string;
  steps?: string[];
  points?: string[];
  images?: DocImage[];
};

export type DocArticle = {
  slug: string;
  category: DocCategory;
  title: string;
  summary: string;
  roles: Role[];
  links: { label: string; href: string }[];
  sections: DocSection[];
  tips?: string[];
};

export const docCategories = ['Bắt đầu', 'Quản trị', 'Giáo viên', 'Học sinh'] as const;
export type DocCategory = (typeof docCategories)[number];

const everyone: Role[] = ['ADMIN', 'TEACHER', 'STUDENT'];
const authors: Role[] = ['ADMIN', 'TEACHER'];
const cloudinaryBase = 'https://res.cloudinary.com/dld6zt8jn/image/upload';

/** `src` is a Cloudinary public id; `c_limit` keeps Cloudinary from upscaling past the original. */
export function cloudinaryUrl(src: string, width?: number, quality?: number) {
  const transforms = [
    'f_auto',
    `q_${quality ?? 'auto'}`,
    ...(width ? ['c_limit', `w_${width}`] : []),
  ];
  return `${cloudinaryBase}/${transforms.join(',')}/${src}`;
}

/** Screenshots live in Cloudinary under quizspace/docs and were taken at 1280×800 unless a size is given. */
const shot = (name: string, alt: string, width = 1280, height = 800): DocImage => ({
  src: `quizspace/docs/${name}`,
  alt,
  width,
  height,
});

export const docs: DocArticle[] = [
  {
    slug: 'tai-khoan',
    category: 'Bắt đầu',
    title: 'Tài khoản và đăng nhập',
    summary: 'Đăng ký, xác minh email, đăng nhập và lấy lại mật khẩu.',
    roles: everyone,
    links: [{ label: 'Hồ sơ cá nhân', href: '/profile' }],
    sections: [
      {
        heading: 'Đăng ký tài khoản',
        images: [shot('dang-ky', 'Trang Đăng ký: chọn vai trò, nhập họ tên, email và mật khẩu')],
        steps: [
          'Mở trang Đăng ký, chọn vai trò Học sinh hoặc Giáo viên.',
          'Nhập họ tên, email và mật khẩu hai lần. Bấm biểu tượng con mắt để xem lại mật khẩu đã nhập.',
          'Mở email xác minh và bấm liên kết trong vòng 24 giờ. Chỉ sau bước này bạn mới đăng nhập được.',
        ],
      },
      {
        heading: 'Đăng nhập và phiên làm việc',
        points: [
          'Đăng nhập bằng email và mật khẩu, hoặc bằng Google nếu hệ thống đã bật.',
          'Phiên đăng nhập được giữ tối đa 7 ngày. Đổi mật khẩu, bị khóa hoặc đổi vai trò sẽ đăng xuất mọi thiết bị.',
          'Tài khoản Quản trị viên không đăng ký được từ trang công khai.',
        ],
      },
      {
        heading: 'Quên mật khẩu',
        steps: [
          'Bấm “Quên mật khẩu?” ở trang đăng nhập và nhập email.',
          'Mở liên kết trong email trong vòng 30 phút và đặt mật khẩu mới.',
        ],
      },
    ],
    tips: ['Không nhận được email? Kiểm tra thư mục Spam rồi dùng chức năng gửi lại.'],
  },
  {
    slug: 'ho-so',
    category: 'Bắt đầu',
    title: 'Hồ sơ cá nhân và bảo mật',
    summary: 'Cập nhật thông tin, ảnh đại diện, mục tiêu học và đổi mật khẩu.',
    roles: everyone,
    links: [{ label: 'Mở Hồ sơ cá nhân', href: '/profile' }],
    sections: [
      {
        heading: 'Thông tin cá nhân',
        images: [
          shot('ho-so', 'Trang Hồ sơ cá nhân với ảnh đại diện, thông tin và mục tiêu học mỗi tuần'),
        ],
        points: [
          'Sửa họ tên, giới thiệu ngắn và số điện thoại.',
          'Ảnh đại diện nhận JPG, PNG hoặc WebP tối đa 500 KB; ảnh được tự cắt vuông và nén lại.',
          'Học sinh đặt số bài muốn làm mỗi tuần; mục tiêu này hiện trong Tiến độ học.',
        ],
      },
      {
        heading: 'Đổi mật khẩu',
        steps: [
          'Mở Hồ sơ cá nhân, tìm phần Bảo mật tài khoản.',
          'Nhập mật khẩu hiện tại và mật khẩu mới. Các thiết bị khác sẽ bị đăng xuất.',
        ],
      },
    ],
  },
  {
    slug: 'thong-bao',
    category: 'Bắt đầu',
    title: 'Thông báo',
    summary: 'Biểu tượng chuông báo bài thi mới, lịch thi, hạn nộp, kết quả và nhận xét.',
    roles: everyone,
    links: [],
    sections: [
      {
        heading: 'Xem thông báo',
        images: [
          shot(
            'thong-bao',
            'Bảng thông báo mở từ biểu tượng chuông, thông báo chưa đọc có chấm xanh',
          ),
        ],
        steps: [
          'Bấm biểu tượng chuông trên thanh đầu trang. Số màu đỏ là số thông báo chưa đọc.',
          'Bấm vào một thông báo để mở đúng trang liên quan; thông báo được đánh dấu đã đọc.',
          'Dùng “Đọc tất cả” để xóa số chưa đọc, “Xem thêm” để xem thông báo cũ hơn.',
        ],
      },
      {
        heading: 'Học sinh nhận được',
        points: [
          'Có bài thi mới khi giáo viên phát hành đề hoặc giao bài cho lớp.',
          'Bài thi sắp bắt đầu: 30 phút trước giờ mở đề.',
          'Sắp hết hạn: 24 giờ trước hạn nộp, chỉ khi bạn chưa nộp bài.',
          'Đã có kết quả khi bài tự luận được chấm xong hoặc bài được tự nộp lúc hết giờ.',
          'Giáo viên đã nhận xét khi có nhận xét mới cho bài làm của bạn.',
          'Các thông báo trên cũng được gửi tới email đăng ký của bạn, thường trong vòng vài phút.',
        ],
      },
      {
        heading: 'Giáo viên nhận được',
        points: [
          'Học sinh hoàn thành bài thi. Nhiều học sinh nộp cùng một đề được gộp thành một thông báo.',
          'Bấm vào thông báo để mở thẳng danh sách bài nộp của đề.',
        ],
      },
    ],
    tips: ['Thông báo tự cập nhật mỗi 30 giây và được giữ trong 90 ngày.'],
  },
  {
    slug: 'nguoi-dung',
    category: 'Quản trị',
    title: 'Quản lý người dùng',
    summary: 'Tạo tài khoản, đổi vai trò, khóa hoặc mở khóa người dùng.',
    roles: ['ADMIN'],
    links: [{ label: 'Mở Người dùng', href: '/users' }],
    sections: [
      {
        heading: 'Tìm và quản lý tài khoản',
        images: [
          shot('nguoi-dung', 'Danh sách người dùng với ô tìm kiếm, bộ lọc vai trò và trạng thái'),
        ],
        points: [
          'Tìm theo tên hoặc email, lọc theo vai trò và trạng thái, xem theo trang.',
          'Tạo tài khoản mới cho giáo viên hoặc học sinh.',
          'Đổi vai trò hoặc khóa tài khoản sẽ đăng xuất người đó khỏi mọi thiết bị.',
        ],
      },
      {
        heading: 'Giới hạn an toàn',
        points: [
          'Bạn không thể tự khóa hoặc tự đổi vai trò của chính mình.',
          'Quản trị viên cũng dùng được Ngân hàng câu hỏi, Đề thi và các công cụ AI với phạm vi toàn hệ thống.',
        ],
      },
    ],
  },
  {
    slug: 'ngan-hang-cau-hoi',
    category: 'Giáo viên',
    title: 'Ngân hàng câu hỏi',
    summary: 'Tạo, nhập file, phân loại và quản lý phiên bản câu hỏi.',
    roles: authors,
    links: [{ label: 'Mở Ngân hàng câu hỏi', href: '/questions' }],
    sections: [
      {
        heading: 'Tạo câu hỏi',
        images: [
          shot('tao-cau-hoi', 'Màn hình Tạo câu hỏi mới: chọn dạng câu và xem trước trực tiếp'),
        ],
        steps: [
          'Bấm “Tạo câu hỏi” và chọn dạng: một đáp án, nhiều đáp án, Đúng/Sai, điền chỗ trống, trả lời ngắn, tự luận, nối cặp hoặc sắp xếp.',
          'Chọn môn học, chủ đề (tối đa 5 cấp), độ khó, nhập đáp án, giải thích và thẻ.',
          'Lưu ở trạng thái Nháp hoặc Sẵn sàng. Chỉ câu Sẵn sàng mới dùng được trong đề thi.',
        ],
      },
      {
        heading: 'Nhập và xuất file',
        images: [
          shot('ngan-hang-cau-hoi', 'Ngân hàng câu hỏi với các nút Nhập file, Xuất file và bộ lọc'),
        ],
        steps: [
          'Bấm “Nhập file”, tải file mẫu Excel (.xlsx) hoặc CSV UTF-8 có đủ 8 dạng câu hỏi.',
          'Tải file lên để kiểm tra; lỗi được báo theo từng dòng trước khi xác nhận.',
          'Mỗi lần tối đa 100 câu hỏi và 8 MB. “Xuất file” tải về theo bộ lọc hiện tại.',
        ],
      },
      {
        heading: 'Phiên bản và lưu trữ',
        points: [
          'Mỗi lần sửa tạo phiên bản mới; có thể xem lịch sử và khôi phục phiên bản cũ.',
          'Nhân bản để tạo biến thể; lưu trữ để ẩn câu hỏi khỏi đề mới mà không mất dữ liệu.',
        ],
      },
    ],
    tips: ['Ảnh câu hỏi nhận PNG, JPG, WebP tối đa 500 KB.'],
  },
  {
    slug: 'tao-cau-hoi-ai',
    category: 'Giáo viên',
    title: 'Tạo câu hỏi bằng AI',
    summary: 'Sinh câu hỏi từ chủ đề, bài giảng, file hoặc URL rồi duyệt vào ngân hàng.',
    roles: authors,
    links: [{ label: 'Mở Tạo câu hỏi AI', href: '/ai' }],
    sections: [
      {
        heading: 'Tạo một đợt câu hỏi',
        images: [
          shot(
            'tao-cau-hoi-ai',
            'Tạo câu hỏi AI: chọn nguồn kiến thức là chủ đề, văn bản, PDF/Word hoặc URL',
          ),
        ],
        steps: [
          'Chọn nguồn: nhập chủ đề/yêu cầu, dán văn bản, tải PDF có chữ, Word .docx, TXT hoặc nhập URL công khai.',
          'Xem trước văn bản đã trích xuất, chọn dạng câu, độ khó, ngôn ngữ và số câu (tối đa 50).',
          'Gửi yêu cầu. Bạn có thể rời trang và quay lại; tiến độ được lưu.',
        ],
      },
      {
        heading: 'Duyệt kết quả',
        points: [
          'Với từng câu: Duyệt, Sửa, Tạo lại hoặc Loại bỏ. Có thể duyệt hàng loạt.',
          'Đối chiếu trích đoạn nguồn trước khi duyệt.',
          'Chỉ câu đã duyệt mới vào Ngân hàng câu hỏi ở trạng thái Sẵn sàng.',
        ],
      },
    ],
    tips: ['PDF dạng ảnh scan cần nhận dạng chữ (OCR) trước khi tải lên.'],
  },
  {
    slug: 'tao-de-thi',
    category: 'Giáo viên',
    title: 'Tạo và phát hành đề thi',
    summary: 'Chọn câu hỏi, cài đặt thời gian, lượt thi, quyền truy cập rồi phát hành.',
    roles: authors,
    links: [{ label: 'Mở Đề thi & kiểm tra', href: '/exams' }],
    sections: [
      {
        heading: 'Soạn đề',
        images: [
          shot(
            'soan-de',
            'Trình soạn đề: thông tin đề, chọn câu thủ công hoặc tự động và bảng tóm tắt',
          ),
        ],
        steps: [
          'Bấm “Tạo đề thi”, nhập tên, mô tả và môn học.',
          'Chọn câu thủ công từ ngân hàng hoặc lấy ngẫu nhiên theo số câu Dễ / Trung bình / Khó / Rất khó (tối đa 100 câu), đặt điểm từng câu.',
          'Cài đặt giờ mở/đóng, thời lượng, số lượt, điểm đạt, trộn câu, trộn đáp án, cho quay lại câu trước, hiện đáp án sau khi nộp và tự nộp khi hết giờ.',
          'Chọn đối tượng: tất cả học sinh, một số lớp hoặc từng học sinh. Có thể đặt mã truy cập.',
        ],
      },
      {
        heading: 'Phát hành',
        images: [
          shot('de-thi', 'Danh sách đề thi theo trạng thái Bản nháp, Đã phát hành, Đã lưu trữ'),
        ],
        steps: [
          'Bấm “Lưu bản nháp”; màn hình phát hành mở ra để kiểm tra lần cuối. Với đề nháp có sẵn, bấm nút “Phát hành” trên thẻ đề.',
          'Bấm “Phát hành đề”. Học sinh được phép thi sẽ nhận thông báo.',
          'Đề đã phát hành không sửa trực tiếp; dùng Nhân bản để tạo đề mới từ đề cũ.',
          'Nếu chưa đến giờ bắt đầu thi, mở đề và bấm “Thu hồi về nháp” để sửa rồi phát hành lại. Đề đang giao cho lớp cần gỡ khỏi lớp trước.',
          'Đề đã lưu trữ có nút Khôi phục để đưa về trạng thái trước đó. Bản nháp không cần nữa có thể xóa bằng biểu tượng thùng rác trên thẻ đề.',
        ],
      },
    ],
    tips: [
      'Muốn giao đề cho lớp kèm hạn nộp riêng? Dùng chức năng Giao bài trong trang lớp học.',
      'Có thể dùng “Tạo đề thi AI” để có cấu trúc đề từ một yêu cầu mô tả.',
    ],
  },
  {
    slug: 'tao-de-thi-ai',
    category: 'Giáo viên',
    title: 'Tạo đề thi bằng AI',
    summary: 'Mô tả yêu cầu bằng lời, duyệt cấu trúc và lưu thành đề nháp.',
    roles: authors,
    links: [{ label: 'Mở Tạo đề thi AI', href: '/ai-exams' }],
    sections: [
      {
        heading: 'Các bước',
        images: [shot('tao-de-thi-ai', 'Tạo đề thi AI: mô tả yêu cầu bằng lời rồi duyệt cấu trúc')],
        steps: [
          'Nhập yêu cầu tự nhiên: mục tiêu, số câu, thời lượng và tỷ lệ chủ đề.',
          'Xem và chỉnh cấu trúc AI đề xuất, chọn lấy câu từ ngân hàng, tạo mới bằng AI hoặc kết hợp.',
          'Kiểm tra đáp án, thay câu chưa phù hợp, rồi bấm “Duyệt & lưu đề nháp”.',
          'Mở đề nháp trong Đề thi & kiểm tra để cài lịch, đối tượng và phát hành.',
        ],
      },
    ],
    tips: ['Tối đa 100 câu, 12 chủ đề và 480 phút mỗi đề.'],
  },
  {
    slug: 'giam-sat-phong-thi',
    category: 'Giáo viên',
    title: 'Giám sát phòng thi',
    summary: 'Ghi nhật ký phiên thi và giới hạn số lần học sinh rời trang.',
    roles: authors,
    links: [{ label: 'Mở Đề thi & kiểm tra', href: '/exams' }],
    sections: [
      {
        heading: 'Bật giám sát',
        images: [
          shot(
            'thiet-lap-giam-sat',
            'Phần Thiết lập làm bài với công tắc Giám sát phòng thi và số lần được rời trang',
            720,
            778,
          ),
        ],
        steps: [
          'Trong phần cài đặt của đề, bật “Giám sát phòng thi”.',
          'Chọn số lần được rời trang (1–10, mặc định 3).',
        ],
      },
      {
        heading: 'Điều xảy ra khi thi',
        points: [
          'Sao chép, dán và menu chuột phải bị chặn trong phòng thi.',
          'Mỗi lần học sinh chuyển tab hoặc rời cửa sổ sẽ thấy cảnh báo “Lần x/y”.',
          'Vượt quá số lần cho phép, lượt thi bị hủy ngay và không có điểm.',
        ],
      },
      {
        heading: 'Xem nhật ký',
        text: 'Mở Đề thi → Bài làm → Xem / chấm. Nhật ký gồm thời điểm bắt đầu, rời trang, quay lại, toàn màn hình, thao tác bị chặn, nộp bài, cùng IP và thiết bị.',
      },
    ],
    tips: ['Nhật ký chỉ là tín hiệu tham khảo; một sự kiện chưa đủ để kết luận gian lận.'],
  },
  {
    slug: 'cham-bai',
    category: 'Giáo viên',
    title: 'Chấm bài và nhận xét',
    summary: 'Xem bài nộp, chấm tự luận với gợi ý AI và gửi nhận xét.',
    roles: authors,
    links: [{ label: 'Mở Đề thi & kiểm tra', href: '/exams' }],
    sections: [
      {
        heading: 'Chấm bài',
        images: [shot('bai-lam', 'Danh sách bài làm của một đề với trạng thái và nút Xem / chấm')],
        steps: [
          'Mở đề, bấm “Bài làm” để xem danh sách lượt thi.',
          'Bấm “Xem / chấm” trên lượt cần chấm. Câu khách quan đã được chấm tự động.',
          'Với tự luận và trả lời ngắn, nhập điểm và nhận xét theo đáp án/rubric rồi xác nhận.',
          'Khi chấm đủ các câu, điểm chính thức được công bố và học sinh nhận thông báo.',
        ],
      },
      {
        heading: 'Gợi ý chấm bằng AI',
        images: [
          shot(
            'cham-bai',
            'Màn hình chấm câu tự luận: bài làm, rubric, ô nhập điểm, nhận xét và Trợ lý chấm AI',
            1030,
            700,
          ),
        ],
        points: [
          'AI đề xuất điểm, lý do, điểm tốt và điều cần cải thiện.',
          'Bạn có thể bỏ qua, yêu cầu lại hoặc đưa vào bản chấm để sửa. AI không tự ghi điểm.',
          'Lịch sử chấm lưu người chấm, điểm và nhận xét trước/sau.',
        ],
      },
    ],
    tips: [
      'Học sinh chỉ thấy nhận xét khi đề bật “Hiển thị đáp án sau khi nộp”.',
      'Thông báo “Học sinh hoàn thành bài thi” mở thẳng trang bài nộp.',
    ],
  },
  {
    slug: 'phan-tich-cau-hoi',
    category: 'Giáo viên',
    title: 'Phân tích câu hỏi',
    summary: 'Đánh giá độ khó thực tế, độ phân biệt và phương án nhiễu của từng câu.',
    roles: authors,
    links: [{ label: 'Mở Phân tích câu hỏi', href: '/question-analytics' }],
    sections: [
      {
        heading: 'Các chỉ số',
        images: [
          shot(
            'phan-tich-cau-hoi',
            'Phân tích câu hỏi: tỷ lệ đúng, độ khó kỳ vọng và thực tế của từng câu',
          ),
        ],
        points: [
          'Tỷ lệ đúng và thời gian làm trung bình của mỗi câu.',
          'Độ khó thực tế: từ 70% đúng là Dễ, từ 40% là Trung bình, từ 20% là Khó, dưới 20% là Rất khó.',
          'Chỉ số phân biệt so sánh nhóm 27% điểm cao với 27% điểm thấp; dưới 0,2 là phân biệt kém.',
          'Phân bố đáp án: tỷ lệ chọn từng phương án, câu trả lời sai phổ biến.',
        ],
      },
      {
        heading: 'Cờ cảnh báo',
        points: [
          'Quá dễ (từ 90% đúng), Quá khó (không quá 20% đúng).',
          'Lệch độ khó khi độ khó thực tế khác độ khó đã đặt.',
          'Phương án nhiễu được chọn nhiều hơn đáp án đúng hoặc gần như không ai chọn.',
        ],
      },
    ],
    tips: ['Cần ít nhất 10 lượt đã chấm để kết luận độ khó và độ phân biệt.'],
  },
  {
    slug: 'lop-hoc',
    category: 'Giáo viên',
    title: 'Lớp học và khóa học',
    summary: 'Tạo lớp, nhóm theo khóa học và mời học sinh bằng mã hoặc liên kết.',
    roles: ['TEACHER'],
    links: [{ label: 'Mở Lớp học', href: '/classes' }],
    sections: [
      {
        heading: 'Tạo lớp học',
        images: [
          shot(
            'lop-hoc',
            'Danh sách lớp học nhóm theo khóa học, mỗi thẻ có mã mời và nút Quản lý lớp học',
          ),
        ],
        steps: [
          'Mở Lớp học, bấm “Khóa học” nếu muốn tạo khóa để nhóm các lớp.',
          'Bấm tạo lớp, nhập tên, môn học, chọn khóa học, mô tả và màu lớp.',
          'Bấm “Quản lý lớp học” trên thẻ lớp để vào trang chi tiết.',
        ],
      },
      {
        heading: 'Mời học sinh',
        images: [
          shot('lop-hoc-chi-tiet', 'Trang chi tiết lớp với mã mời, liên kết mời và nút Đổi mã mời'),
        ],
        points: [
          'Sao chép mã lớp 10 ký tự hoặc liên kết mời và gửi cho học sinh.',
          'Học sinh chưa đăng nhập mở liên kết sẽ được đưa tới đăng nhập rồi tự vào lớp.',
          'Thêm trực tiếp bằng email đã đăng ký ở tab Học sinh.',
          '“Đổi mã mời” làm mã và liên kết cũ hết hiệu lực.',
        ],
      },
      {
        heading: 'Bài học',
        text: 'Tab Bài học cho phép đăng tiêu đề, nội dung và liên kết tài liệu (http/https) cho cả lớp.',
      },
    ],
  },
  {
    slug: 'giao-bai',
    category: 'Giáo viên',
    title: 'Giao bài và theo dõi kết quả',
    summary: 'Giao đề cho lớp kèm hạn nộp và xem ai đã nộp, điểm bao nhiêu.',
    roles: ['TEACHER'],
    links: [{ label: 'Mở Lớp học', href: '/classes' }],
    sections: [
      {
        heading: 'Giao bài',
        images: [shot('giao-bai', 'Hộp Giao bài: chọn đề đã phát hành, loại bài và hạn nộp')],
        steps: [
          'Trong trang lớp, mở tab Bài kiểm tra hoặc Bài thi, bấm “Giao bài”.',
          'Chọn một đề đã phát hành, loại bài và hạn nộp ở tương lai.',
          'Cả lớp nhận thông báo và được làm bài đến hạn nộp.',
        ],
      },
      {
        heading: 'Quy tắc hạn nộp',
        points: [
          'Sau hạn nộp học sinh không bắt đầu lượt mới được.',
          'Thời gian làm bài không vượt quá hạn nộp hoặc giờ đóng đề.',
          'Có thể sửa hạn nộp hoặc gỡ bài; bài đã nộp vẫn được giữ.',
          'Học sinh chưa nộp được nhắc 24 giờ trước hạn.',
        ],
      },
      {
        heading: 'Kết quả',
        images: [
          shot(
            'ket-qua-lop',
            'Tab Kết quả của lớp: số đã nộp, chờ chấm, điểm trung bình và bảng từng học sinh',
          ),
        ],
        text: 'Tab Kết quả hiển thị cho từng bài: số học sinh đã nộp, điểm trung bình, số đạt và bảng trạng thái, điểm cao nhất của từng học sinh.',
      },
    ],
  },
  {
    slug: 'tham-gia-lop',
    category: 'Học sinh',
    title: 'Tham gia lớp học',
    summary: 'Vào lớp bằng mã hoặc liên kết và xem bài được giao.',
    roles: ['STUDENT'],
    links: [{ label: 'Mở Lớp học', href: '/classes' }],
    sections: [
      {
        heading: 'Vào lớp',
        images: [shot('tham-gia-lop', 'Hộp Tham gia lớp học với ô nhập mã lớp')],
        steps: [
          'Mở Lớp học, bấm “Tham gia lớp” và nhập mã 10 ký tự giáo viên gửi.',
          'Hoặc mở liên kết mời; nếu chưa đăng nhập, đăng nhập xong bạn sẽ tự vào lớp.',
        ],
      },
      {
        heading: 'Trong lớp học',
        images: [
          shot(
            'lop-hoc-hoc-sinh',
            'Trang lớp phía học sinh: bài được giao, hạn nộp, trạng thái và điểm cao nhất',
          ),
        ],
        points: [
          'Bấm “Vào lớp học” để xem bài kiểm tra, bài thi và bài học của lớp.',
          'Mỗi bài hiển thị hạn nộp, điểm cao nhất của bạn và trạng thái: Chưa mở, Đang mở, Đang làm, Hết lượt, Đã quá hạn hoặc Đề đã đóng.',
          'Số bài còn phải làm hiện ngay trên đầu trang lớp.',
        ],
      },
    ],
  },
  {
    slug: 'lam-bai-thi',
    category: 'Học sinh',
    title: 'Làm bài thi',
    summary: 'Bắt đầu, làm bài, đánh dấu câu và nộp bài đúng hạn.',
    roles: ['STUDENT'],
    links: [{ label: 'Mở Bài thi của tôi', href: '/exams' }],
    sections: [
      {
        heading: 'Bắt đầu',
        images: [
          shot('bai-thi-cua-toi', 'Danh sách Bài thi của tôi với nút Bắt đầu thi'),
          shot(
            'bat-dau-thi',
            'Hộp xác nhận trước khi bắt đầu: số câu, thời gian, điểm đạt và quy định',
          ),
        ],
        steps: [
          'Mở Đề thi & kiểm tra, chọn đề đang mở và bấm “Bắt đầu thi”.',
          'Đọc thông tin về thời gian, số lượt, điểm đạt rồi xác nhận bắt đầu.',
          'Nếu đề có mã truy cập, nhập mã giáo viên cung cấp.',
        ],
      },
      {
        heading: 'Trong phòng thi',
        images: [
          shot(
            'phong-thi',
            'Phòng thi: đồng hồ đếm ngược, câu hỏi, câu đã đánh dấu và bảng tổng quan',
          ),
        ],
        points: [
          'Đồng hồ đếm ngược ở đầu trang; máy chủ quyết định thời điểm hết giờ.',
          'Đáp án được lưu tự động. Mất mạng ngắn hạn vẫn giữ bản nháp và đồng bộ khi có mạng.',
          'Dùng “Đánh dấu câu” để quay lại xem sau; bảng số câu cho biết câu đã làm, chưa làm, đã đánh dấu.',
          'Có đề không cho quay lại câu trước; hãy đọc kỹ trước khi chuyển câu.',
        ],
      },
      {
        heading: 'Đề có giám sát',
        text: 'Không chuyển tab hay rời cửa sổ. Mỗi lần rời trang bạn sẽ thấy cảnh báo và số lần còn lại; vượt quá giới hạn thì bài bị hủy và không có điểm.',
      },
      {
        heading: 'Nộp bài',
        images: [
          shot(
            'nop-bai',
            'Hộp xác nhận nộp bài cho biết số câu đã trả lời, chưa trả lời và đánh dấu',
          ),
        ],
        steps: [
          'Bấm “Nộp bài”, kiểm tra số câu chưa trả lời rồi xác nhận nộp.',
          'Hết giờ, bài được tự nộp phần đã lưu nếu đề bật tự nộp.',
        ],
      },
    ],
  },
  {
    slug: 'ket-qua',
    category: 'Học sinh',
    title: 'Xem kết quả và giải thích bằng AI',
    summary: 'Đọc điểm, đáp án, nhận xét của giáo viên và hỏi AI về từng câu.',
    roles: ['STUDENT'],
    links: [{ label: 'Mở Lịch sử thi', href: '/history' }],
    sections: [
      {
        heading: 'Kết quả bài thi',
        images: [
          shot('ket-qua', 'Trang kết quả: điểm chính thức, số câu đúng/sai, thời gian làm bài'),
        ],
        points: [
          'Câu khách quan có điểm ngay khi nộp. Tự luận và trả lời ngắn chờ giáo viên chấm.',
          'Kết quả gồm điểm, phần trăm, đạt/chưa đạt, số câu đúng/sai và thời gian làm bài.',
          'Đáp án, giải thích và nhận xét chỉ hiện khi giáo viên cho phép xem sau khi nộp.',
        ],
      },
      {
        heading: 'Explain with AI',
        images: [
          shot(
            'ket-qua-nhan-xet',
            'Câu tự luận đã chấm với nhận xét của giáo viên và nút Explain with AI',
            1200,
            610,
          ),
        ],
        steps: [
          'Trong trang kết quả, bấm “Explain with AI” dưới một câu.',
          'Chọn câu hỏi gợi ý hoặc tự nhập câu hỏi tiếp theo. Cuộc trò chuyện được lưu lại.',
        ],
      },
    ],
    tips: ['AI không thay đổi điểm. Mỗi ngày có tối đa 50 yêu cầu giải thích.'],
  },
  {
    slug: 'tien-do',
    category: 'Học sinh',
    title: 'Lịch sử, tiến độ và phân tích học tập',
    summary: 'Theo dõi điểm theo thời gian và biết chủ đề nào cần ôn.',
    roles: ['STUDENT'],
    links: [
      { label: 'Lịch sử thi', href: '/history' },
      { label: 'Tiến độ học', href: '/progress' },
      { label: 'Phân tích học tập', href: '/learning-analysis' },
    ],
    sections: [
      {
        heading: 'Lịch sử và tiến độ',
        images: [
          shot('lich-su-thi', 'Lịch sử thi với điểm thang 10, thời gian làm và ngày hoàn thành'),
          shot('tien-do-hoc', 'Tiến độ học: số bài hoàn thành, điểm trung bình và mục tiêu tuần'),
        ],
        points: [
          'Lịch sử thi liệt kê các bài đã có điểm chính thức (thang 10).',
          'Tiến độ học hiện điểm trung bình, điểm cao nhất, thời gian học, mục tiêu tuần và biểu đồ.',
        ],
      },
      {
        heading: 'Phân tích học tập',
        images: [
          shot(
            'phan-tich-hoc-tap',
            'Phân tích học tập: điểm tổng hợp, chủ đề cần ưu tiên và chủ đề nổi bật',
          ),
        ],
        points: [
          'Điểm theo môn và chủ đề, lọc 30 ngày, 90 ngày hoặc tất cả.',
          'Dưới 60% là Ưu tiên ôn, dưới 80% là Cần củng cố, từ 80% là điểm mạnh.',
          'Bấm “Phân tích với AI” để nhận kế hoạch ôn tập: ưu tiên, các bước và bài tự kiểm tra.',
        ],
      },
    ],
    tips: ['Một chủ đề cần ít nhất 5 câu từ 2 đề khác nhau mới được phân loại.'],
  },
  {
    slug: 'luyen-tap',
    category: 'Học sinh',
    title: 'Luyện tập cá nhân',
    summary: 'Quiz tự điều chỉnh độ khó cho những chủ đề còn yếu.',
    roles: ['STUDENT'],
    links: [{ label: 'Mở Luyện tập cá nhân', href: '/practice' }],
    sections: [
      {
        heading: 'Cách hoạt động',
        images: [shot('luyen-tap', 'Luyện tập cá nhân: chủ đề cần ôn, số câu và độ khó bắt đầu')],
        points: [
          'Quiz chỉ gồm chủ đề Ưu tiên ôn và Cần củng cố, mỗi chủ đề 5–10 câu.',
          'Trả lời đúng thì câu sau cùng chủ đề khó hơn một mức; sai thì dễ hơn.',
          'Chủ đề làm tốt sẽ ít câu hơn hoặc rời khỏi quiz ở lần sau.',
        ],
      },
      {
        heading: 'Bắt đầu',
        steps: [
          'Bấm “Practice Weak Topics” trong Phân tích học tập hoặc mở Luyện tập cá nhân.',
          'Làm từng câu và xem giải thích ngay. Có thể kết thúc sớm bất cứ lúc nào.',
        ],
      },
    ],
    tips: ['Kết quả luyện tập không ảnh hưởng điểm bài thi chính thức.'],
  },
];

export const docsFor = (role: Role) => docs.filter((doc) => doc.roles.includes(role));

export function docText(doc: DocArticle) {
  return [
    doc.title,
    doc.summary,
    ...doc.sections.flatMap((s) => [
      s.heading,
      s.text || '',
      ...(s.steps || []),
      ...(s.points || []),
    ]),
    ...(doc.tips || []),
  ]
    .join(' ')
    .toLocaleLowerCase('vi');
}
