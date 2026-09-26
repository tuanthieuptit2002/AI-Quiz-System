# QuizSpace

Không gian học tập cho **Admin · Teacher · Student**, dùng **Next.js + React + TypeScript** ở frontend và **Node.js + Express + TypeScript + MongoDB** ở backend.

## Chạy dự án

Cần Node.js 22.13+ và MongoDB Atlas hoặc MongoDB local.

```bash
# Terminal 1
cd backend
npm ci
# Lần đầu: sao chép .env.example thành .env và điền cấu hình
npm run dev

# Terminal 2
cd frontend
npm ci
npm run dev
```

Mở **http://localhost:3000**. Backend: http://localhost:8080/health.
Frontend chuyển tiếp `/api/*` sang backend qua Next.js rewrites, nên cookie và API cùng origin.
Nếu đổi địa chỉ backend, đặt `API_SERVER_URL` trong môi trường frontend và khởi động lại Next.js.

## Tài khoản và phân quyền

- **Đăng ký:** tự đăng ký Student hoặc Teacher. Không thể đăng ký Admin qua API công khai.
- **Xác thực:** mật khẩu bcrypt; JWT access 15 phút ở bộ nhớ trình duyệt; refresh token ngẫu nhiên trong cookie HttpOnly, SameSite=Strict, Secure khi production.
- **Phiên đăng nhập:** refresh token được xoay mỗi lần dùng, chỉ lưu hash trong MongoDB; phát hiện dùng lại token sẽ thu hồi phiên. Phiên hết hạn sau 7 ngày.
- **Profile:** tên, giới thiệu, số điện thoại, mục tiêu học tuần, đổi mật khẩu, tải/xóa avatar. Ảnh JPG/PNG/WebP tối đa 500 KB được kiểm tra, resize và mã hóa lại thành WebP.
- **Admin:** thống kê cộng đồng; tìm kiếm, lọc, phân trang, tạo tài khoản; thay vai trò; khóa/mở tài khoản. Không được tự khóa hoặc đổi quyền của chính mình.
- **Teacher:** tạo/sửa/xóa lớp, chia sẻ mã lớp, thêm/gỡ học sinh bằng email, xem danh sách học sinh thuộc các lớp của mình.
- **Student:** tham gia lớp qua mã, xem lớp học, lịch sử thi, điểm trung bình và biểu đồ tiến độ của riêng mình.

Mọi route được kiểm tra quyền ở backend. Khóa tài khoản, đổi vai trò, đổi/reset mật khẩu sẽ thu hồi phiên. Chống CSRF bằng Origin + header riêng; API xác thực có rate limit.

### Admin đầu tiên

Điền `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12–72 ký tự) và `ADMIN_NAME` trong `backend/.env`, sau đó:

```bash
cd backend
npm run admin:create
```

Script không tự đổi mật khẩu hay nâng quyền một tài khoản đã tồn tại.
Admin đầu tiên của workspace hiện tại đã được tạo cho **tuanvp0304@gmail.com**. Mật khẩu ban đầu ở biến `ADMIN_PASSWORD` trong `backend/.env`.
Sau khi đăng nhập, đổi mật khẩu tại **Hồ sơ cá nhân → Bảo mật tài khoản**. Giá trị `ADMIN_PASSWORD` chỉ dùng để khởi tạo, không tự đồng bộ khi bạn đổi mật khẩu trong ứng dụng.

## Quên mật khẩu

Liên kết có hạn 30 phút, chỉ dùng một lần; không trả token trong API công khai. Phản hồi yêu cầu khôi phục không tiết lộ email có tồn tại hay không.

- Khi có `SMTP_HOST`, backend gửi email thật qua SMTP. Cấu hình thêm `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- **Development chưa có SMTP:** email được lưu dưới dạng JSON tại `backend/.mail/`, không công khai qua HTTP. Mở file mới nhất và dùng liên kết trong trường `text` để kiểm tra luồng reset.
- **Production:** cần SMTP. Backend từ chối yêu cầu gửi email nếu chưa cấu hình.

## Đăng nhập Google (tùy chọn)

Điền `GOOGLE_CLIENT_ID` bằng OAuth Web Client ID và khai báo origin của frontend trong Google Cloud Console (local: `http://localhost:3000`). Khởi động lại backend. Nút Google chỉ hiển thị khi có Client ID.

Backend xác minh chữ ký, audience và email đã xác minh của Google. Tài khoản Google mới mặc định là Student. Không tự liên kết tài khoản mật khẩu có cùng email.
Cấu hình này chưa có trong workspace nên Google login chưa được thử với tài khoản thật.

## Ngân hàng câu hỏi

Mở **http://localhost:3000/questions** hoặc chọn **Ngân hàng câu hỏi** trong menu Admin/Teacher.

- Hỗ trợ Single Choice, Multiple Choice, True/False, Fill in the Blank, Short Answer, Essay, Matching và Ordering.
- Câu hỏi có môn học, chủ đề phân cấp tối đa 5 tầng, độ khó, đáp án, giải thích, tags, hình ảnh và trạng thái nháp/sẵn sàng/lưu trữ.
- Teacher quản lý câu hỏi của mình; Admin quản lý toàn bộ; Student không truy cập ngân hàng đáp án.
- Tìm kiếm, lọc, phân trang, nhân bản, lưu trữ, xem trước nội dung và lịch sử phiên bản; khôi phục tạo phiên bản mới.
- Nhập/xuất Excel `.xlsx` và CSV UTF-8, có file mẫu 8 dạng câu hỏi. Kiểm tra lỗi theo dòng trước khi xác nhận nhập; tối đa 100 câu hỏi / 8 MB mỗi file.
- Ảnh PNG/JPG/WebP tối đa 500 KB, được kiểm tra và chuyển sang WebP; giữ ảnh khi xuất/nhập lại.

**Cần MongoDB replica set hoặc Atlas** cho các giao dịch lưu câu hỏi, phiên bản và nhập file. Workspace hiện dùng Atlas. Xem [hướng dẫn module và định dạng import](docs/question-bank.md).

## AI Question Generator — DeepSeek

Mở **http://localhost:3000/ai** hoặc chọn **Tạo câu hỏi AI**. Cấu hình `DEEPSEEK_API_KEY` trong `backend/.env`; `DEEPSEEK_MODEL` mặc định `deepseek-flash`.

- Tạo từ chủ đề/prompt, văn bản/bài giảng, PDF có lớp văn bản, Word `.docx`, TXT hoặc URL công khai.
- 8 dạng câu hỏi, 4 mức độ khó, Tiếng Việt/English, tối đa 50 câu mỗi đợt; câu trắc nghiệm có 4 lựa chọn.
- Tiến độ và lịch sử lưu trong MongoDB; Teacher có thể rời trang, mở lại và tiếp tục duyệt.
- **Approve / Edit / Regenerate / Reject**, duyệt từng câu hoặc hàng loạt. Chỉ câu đã duyệt mới vào Question Bank ở trạng thái **Sẵn sàng**, kèm version history.
- Xem văn bản đã trích xuất trước khi gửi; đối chiếu trích đoạn nguồn khi duyệt. PDF scan cần OCR trước; file tối đa 8 MB, nguồn tối đa 60.000 ký tự.

Key chỉ dùng ở backend. Xem [hướng dẫn cấu hình, giới hạn và API AI](docs/ai-question-generator.md).

## AI Exam Generator — tạo đề từ yêu cầu

Mở **http://localhost:3000/ai-exams** hoặc chọn **Tạo đề thi AI**. Dùng chung cấu hình DeepSeek hiện có.

- Nhập yêu cầu tự nhiên: mục tiêu, số câu, thời lượng và tỷ lệ chủ đề. AI đề xuất cấu trúc để Teacher chỉnh sửa và duyệt.
- Phân bổ đúng tổng số câu, hỗ trợ kết hợp Question Bank + AI, chỉ ngân hàng hoặc tạo mới toàn bộ bằng AI.
- Theo dõi tiến độ/lịch sử, thử lại phần thiếu, xem đáp án, chỉnh sửa và tạo câu thay thế trước khi lưu.
- Duyệt để lưu đề nháp vào Exam Builder; các câu mới vào Question Bank kèm version history. Cấu hình lịch và đối tượng trước khi phát hành.
- Tối đa 100 câu, 12 chủ đề và 480 phút. Ví dụ 50 câu với tỷ lệ 30/30/20/10/10 cho kết quả 15/15/10/5/5 câu.

Xem [hướng dẫn AI Exam Generator](docs/ai-exam-generator.md) về quy tắc chọn câu, giới hạn và API.

## Dữ liệu học tập

Các collection chính: `users`, `sessions`, `classes`, `questions`, `questionVersions`, `exams`, `examRuns`, `examAttempts`, `aiGenerations` và `aiExams`. Unique/TTL index được tạo khi server khởi động.

Lịch sử và tiến độ đọc dữ liệu thật từ `examAttempts`, không tạo điểm mẫu. Khi bài thi được chấm xong, backend ghi kết quả vào collection này (thang điểm 10). Bài có tự luận chưa chấm đủ không được tính vào tiến độ. Học sinh không thể tự gửi điểm.

## Exam Builder — tạo đề và làm bài

Mở **http://localhost:3000/exams**. Admin/Teacher tạo đề, Student xem các đề được giao và làm bài.

- Chọn thủ công từ Question Bank hoặc random theo ma trận **Easy / Medium / Hard / Very Hard**; tối đa 100 câu, có điểm riêng từng câu. Chỉ lấy câu hỏi **Sẵn sàng** thuộc quyền quản lý.
- Cấu hình giờ mở/đóng, thời lượng, số lượt, điểm đạt %, trộn câu/trộn đáp án, xem đáp án sau nộp, quay lại câu trước và tự nộp khi hết giờ.
- Mã truy cập lưu bằng bcrypt; giới hạn theo lớp hoặc học sinh. Teacher chỉ giao cho lớp/học sinh mình quản lý, hoặc chọn tất cả Student.
- Quy trình **Bản nháp → Xem trước → Phát hành**. Đề lưu snapshot câu hỏi; đề đã phát hành không sửa trực tiếp, có thể nhân bản thành đề mới.
- Student làm đủ 8 dạng câu hỏi, tự lưu câu trả lời, tiếp tục lượt đang làm. Backend kiểm tra deadline, giới hạn lượt và quyền điều hướng; tự nộp phần đã lưu dù đóng trình duyệt.
- Chấm tự động 7 dạng, tự luận chờ Teacher chấm. Điểm hoàn tất đồng bộ sang lịch sử và tiến độ.

Chi tiết quy tắc, giới hạn và API: [docs/exam-builder.md](docs/exam-builder.md).

## Cấu hình

Xem `backend/.env.example`:

- `MONGODB_URI`, `MONGODB_DB_NAME`: kết nối và tên database.
- `JWT_SECRET`: chuỗi ngẫu nhiên tối thiểu 32 ký tự. Có thể tạo bằng `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`.
- `PORT`: mặc định 8080.
- `FRONTEND_URL`: origin frontend, mặc định `http://localhost:3000`; dùng cho CORS, CSRF và liên kết khôi phục.
- `NODE_ENV=production`: bật cookie Secure và yêu cầu SMTP cho khôi phục mật khẩu; chạy qua HTTPS.

`.env`, `.mail`, thư mục build và dependency không đưa vào Git.

## Kiểm tra và build

```bash
cd backend
npm run db:check
npm run typecheck
npm test
npm run build
npm start

cd ../frontend
npm run lint
npm run build
npm start
```

Dừng các dev server trước khi chạy `npm start` trên cùng cổng.
Test dùng MongoDB tạm qua `mongodb-memory-server`, không sửa dữ liệu Atlas. Lần đầu có thể tải MongoDB binary.
Kiểm tra gồm tài khoản/RBAC, Question Bank, import/export, Exam Builder, làm bài/chấm điểm và AI Generator (đọc tài liệu, bảo vệ URL, job nhiều nhóm, duyệt đồng thời và khôi phục khi lỗi). AI trong test tự động được giả lập, không gọi API tính phí.

## Cấu trúc

- `backend/src/app.ts`: lắp ghép middleware và routes; `server.ts` khởi động server.
- `backend/src/routes`: khai báo đường dẫn API theo auth, profile, admin, teacher, student, questions, exams, ai, ai-exams.
- `backend/src/controllers`: xử lý request theo từng nhóm tính năng.
- `backend/src/middleware`: xác thực, phân quyền, kiểm tra request, giới hạn tần suất và xử lý lỗi.
- `backend/src/models`: kiểu dữ liệu MongoDB và hàm chuyển dữ liệu trả về client.
- `backend/src/database`: kết nối MongoDB, collections và indexes.
- `backend/src/common`: cấu hình, validation, tiện ích JWT/password/cookie, email, chấm thi, DeepSeek adapter, AI worker và bộ đọc nguồn tài liệu.
- `backend/scripts`: script kiểm tra database và tạo admin.
- `backend/test`: kiểm thử tích hợp API.
- `frontend/app`: các route tài khoản, dashboard, classes, questions, exams, ai và tiến độ học.
- `frontend/components`: giao diện theo vai trò và các form quản lý.
- `frontend/lib/api.ts`: access token trong bộ nhớ và refresh cookie.

## Format code

Chạy tại thư mục gốc `AI-Exam-Quiz-System`:

```bash
npm ci
npm run format
npm run format:check
```

FE và BE dùng chung `.prettierrc.json`: thụt lề 2 dấu cách, dấu nháy đơn, dấu chấm phẩy và độ dài dòng 100 ký tự.
`.prettierignore` bỏ qua biến môi trường, dependencies, file build, lockfile và file tự sinh.

Tài liệu tham khảo: [MongoDB Node.js](https://www.mongodb.com/docs/drivers/node/current/), [JWT](https://github.com/auth0/node-jsonwebtoken), [Google ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
