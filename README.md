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

- **Đăng ký:** tự đăng ký Student hoặc Teacher và nhập mật khẩu hai lần. Mọi tài khoản mật khẩu, kể cả tài khoản tạo trước đây, chỉ vào được trang web sau khi mở liên kết xác minh email. Đăng nhập Google dùng email Google đã xác minh. Không thể đăng ký Admin qua API công khai.
- **Xác thực:** mật khẩu bcrypt; JWT access 15 phút ở bộ nhớ trình duyệt; refresh token ngẫu nhiên trong cookie HttpOnly, SameSite=Strict, Secure khi production.
- **Phiên đăng nhập:** refresh token được xoay mỗi lần dùng, chỉ lưu hash trong MongoDB; phát hiện dùng lại token sẽ thu hồi phiên. Phiên hết hạn sau 7 ngày.
- **Profile:** tên, giới thiệu, số điện thoại, mục tiêu học tuần, đổi mật khẩu, tải/xóa avatar. Ảnh JPG/PNG/WebP tối đa 500 KB được kiểm tra, resize và mã hóa lại thành WebP.
- **Admin:** thống kê cộng đồng; tìm kiếm, lọc, phân trang, tạo tài khoản; thay vai trò; khóa/mở tài khoản. Không được tự khóa hoặc đổi quyền của chính mình.
- **Teacher:** quản lý khóa học và lớp học, mời học sinh bằng mã hoặc liên kết, giao bài có hạn nộp, đăng bài học, xem kết quả lớp; tạo câu hỏi, đề thi, chấm bài và xem phân tích câu hỏi.
- **Student:** tham gia lớp qua mã hoặc liên kết, làm bài được giao, xem lịch sử thi, điểm, tiến độ, phân tích học tập và luyện tập cá nhân của riêng mình.
- **Mọi vai trò:** nhận thông báo trong ứng dụng qua biểu tượng chuông trên thanh đầu trang.

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

## Email xác minh và quên mật khẩu

Đăng ký gửi liên kết `/verify` có hạn 24 giờ. Quên mật khẩu gửi liên kết `/reset-password` có hạn 30 phút. Cả hai chỉ dùng một lần và không trả token trong API công khai. Gửi lại email không tiết lộ địa chỉ có tồn tại hay không.

- Khi có `SMTP_HOST`, backend gửi email thật qua SMTP. Cấu hình thêm `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- **Development chưa có SMTP:** email được lưu dưới dạng JSON tại `backend/.mail/`, không công khai qua HTTP. Mở file mới nhất và dùng liên kết trong trường `text`.
- **Production:** cần SMTP. Backend từ chối đăng ký và yêu cầu gửi email nếu chưa cấu hình.

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

Các collection chính: `users`, `sessions`, `courses`, `classes`, `lessons`, `assignments`, `questions`, `questionVersions`, `questionImports`, `exams`, `examRuns`, `examAttempts`, `examActivity`, `aiGenerations`, `aiExams`, `gradingSuggestions`, `gradingEvents`, `explanationThreads`, `learningReports`, `practiceSessions`, `notifications`, `notificationMarks` và `emailJobs`. Unique/TTL index được tạo khi server khởi động.

Lịch sử và tiến độ đọc dữ liệu thật từ `examAttempts`, không tạo điểm mẫu. Khi bài thi được chấm xong, backend ghi kết quả vào collection này (thang điểm 10). Bài có tự luận/trả lời ngắn chưa chấm đủ không được tính vào tiến độ. Học sinh không thể tự gửi điểm.

## Exam Builder — tạo đề và làm bài

Mở **http://localhost:3000/exams**. Admin/Teacher tạo đề, Student xem các đề được giao và làm bài.

- Chọn thủ công từ Question Bank hoặc random theo ma trận **Easy / Medium / Hard / Very Hard**; tối đa 100 câu, có điểm riêng từng câu. Chỉ lấy câu hỏi **Sẵn sàng** thuộc quyền quản lý.
- Cấu hình giờ mở/đóng, thời lượng, số lượt, điểm đạt %, trộn câu/trộn đáp án, xem đáp án sau nộp, quay lại câu trước và tự nộp khi hết giờ.
- Mã truy cập lưu bằng bcrypt; giới hạn theo lớp hoặc học sinh. Teacher chỉ giao cho lớp/học sinh mình quản lý, hoặc chọn tất cả Student. Đề đã phát hành còn có thể giao cho lớp kèm hạn nộp (xem **Lớp học & Khóa học**).
- Tùy chọn **Giám sát phòng thi** ghi nhật ký phiên thi và giới hạn số lần rời trang (xem **Giám sát phòng thi**).
- Quy trình **Bản nháp → Xem trước → Phát hành**. Đề lưu snapshot câu hỏi; đề đã phát hành không sửa trực tiếp, có thể nhân bản thành đề mới.
- Student làm đủ 8 dạng câu hỏi, tự lưu câu trả lời, tiếp tục lượt đang làm. Backend kiểm tra deadline, giới hạn lượt và quyền điều hướng; tự nộp phần đã lưu dù đóng trình duyệt.
- Chấm tự động 6 dạng khách quan; tự luận và trả lời ngắn có nội dung chờ Teacher xác nhận. Điểm hoàn tất đồng bộ sang lịch sử và tiến độ.

Chi tiết quy tắc, giới hạn và API: [docs/exam-builder.md](docs/exam-builder.md).

## Exam Player — phòng thi Student

Đăng nhập Student, mở **Bài thi của tôi** tại **http://localhost:3000/exams**, chọn **Bắt đầu** hoặc tiếp tục lượt đang làm. Phòng thi có đường dẫn riêng `/exam/[runId]` để tải lại và tiếp tục bài.

- Giao diện tập trung cho desktop/mobile, đồng hồ đếm ngược, 8 dạng câu hỏi và điều hướng theo quy định của đề.
- Đánh dấu câu cần xem lại; bảng số câu, bộ lọc và thống kê đã trả lời/chưa trả lời/đã đánh dấu.
- Tự lưu đáp án và đánh dấu; giữ bản nháp trong tab khi refresh hoặc mất mạng ngắn hạn, tự đồng bộ khi kết nối lại.
- Phát hiện xung đột giữa các tab/thiết bị, cho chọn bản cần giữ; gửi lại yêu cầu bị mất phản hồi không làm chuyển câu hai lần.
- Xác nhận trước khi nộp, đồng bộ đáp án trước khi chấm; máy chủ quyết định deadline và xử lý hết giờ theo cấu hình đề.

Đáp án chưa tới máy chủ trước deadline không được tính. Bản nháp chưa đồng bộ chỉ giữ trong tab hiện tại; không hỗ trợ mở phòng thi lần đầu khi hoàn toàn offline. Xem [hướng dẫn Exam Player](docs/exam-player.md).

## Giám sát phòng thi — nhật ký và giới hạn rời trang

Teacher bật **Giám sát phòng thi** trong phần cài đặt của đề và chọn số lần được rời trang (1–10, mặc định 3). Đề không bật giám sát sẽ không ghi các sự kiện phía trình duyệt.

- Nhật ký mỗi lượt thi ghi: bắt đầu, rời tab, rời cửa sổ, quay lại, vào/thoát toàn màn hình, trình duyệt không hỗ trợ toàn màn hình, bị chặn sao chép/dán, nộp bài, hết giờ và bị hủy. Kèm IP, trình duyệt và hệ điều hành của phiên.
- Trong phòng thi, sao chép, dán, menu chuột phải và phím tắt tương ứng bị chặn và được ghi lại.
- Mỗi lần rời tab hoặc cửa sổ, Student thấy cảnh báo **Lần x/y** và số lần còn lại. Vượt quá giới hạn thì lượt thi bị hủy, kết thúc ngay và không có điểm.
- Máy chủ quyết định số lần vi phạm; nếu sự kiện chưa gửi được, Student được báo là chưa ghi nhận.
- Teacher xem nhật ký tại **Đề thi → Bài làm → Xem / chấm**. Tối đa 200 sự kiện phía trình duyệt mỗi lượt. Nhật ký chỉ là tín hiệu tham khảo, một sự kiện chưa đủ để kết luận gian lận.

## Auto Grading — chấm bài và trợ lý AI

Teacher/Admin vào **Đề thi → Bài làm → Xem / chấm**. Student xem kết quả ngay sau khi nộp hoặc mở lại lượt thi.

- Câu khách quan được chấm ngay khi nộp. Kết quả hiển thị điểm đạt/tối đa, phần trăm, số câu đúng/sai/điểm một phần/chờ chấm và thời gian làm bài.
- Essay và Short Answer có nội dung chờ Teacher chấm. Nhập điểm và nhận xét theo đáp án/rubric, xác nhận từng câu; chỉ khi chấm đủ mới công bố tổng điểm chính thức và cập nhật tiến độ.
- **DeepSeek chỉ đề xuất:** điểm, lý do, điểm tốt, điều cần cải thiện và trích đoạn bài làm. Teacher có thể bỏ qua, yêu cầu lại hoặc đưa vào bản chấm để sửa rồi xác nhận. AI không tự ghi điểm.
- Lịch sử lưu người chấm, điểm/nhận xét trước và sau, cùng điểm AI đề xuất nếu được tham khảo. Sửa điểm cập nhật cùng kết quả; revision ngăn ghi đè giữa các tab.

Dùng `DEEPSEEK_API_KEY` và `DEEPSEEK_MODEL` hiện có. Không cấu hình AI vẫn chấm thủ công được. Xem [hướng dẫn Auto Grading](docs/auto-grading.md).

## AI Explanation — hiểu bài sau khi thi

Student mở kết quả của lượt thi, chọn **Explain with AI** dưới một câu, rồi dùng gợi ý hoặc nhập câu hỏi tiếp theo.

- Đối chiếu câu trả lời với đáp án/rubric của đề, giải thích kiến thức cần nhớ và cách vận dụng; giữ đúng nhãn A/B/C/D của lượt thi đã trộn.
- Hội thoại riêng theo Student, lượt thi và câu hỏi, được lưu trong MongoDB để mở lại sau refresh. Lỗi AI có thể thử lại mà không làm mất các lượt trao đổi trước.
- Chỉ dùng sau khi nộp và Teacher bật **Hiển thị đáp án sau khi nộp**. AI không sửa điểm; câu chờ chấm được ghi rõ là chưa có quyết định cuối cùng của Teacher.
- Nếu Teacher sửa điểm/nhận xét, lần trao đổi tiếp theo dùng ngữ cảnh mới. Câu có hình ảnh hiện cần hỏi Teacher.

Dùng chung cấu hình DeepSeek. Giới hạn 8 lượt/hội thoại và 50 yêu cầu/Student trong 24 giờ. Xem [hướng dẫn AI Explanation](docs/ai-explanation.md).

## AI Learning Analysis — học đúng trọng tâm

Student chọn **Phân tích học tập** tại **http://localhost:3000/learning-analysis**, hoặc mở từ Tiến độ học / kết quả thi.

- Điểm theo môn và đường dẫn chủ đề, lọc 30/90 ngày hoặc tất cả, biểu đồ kết quả gần đây. Điểm % tính từ tổng điểm đạt/tối đa, có tính trọng số và điểm một phần.
- Chỉ dùng lần đã chấm gần nhất của mỗi đề, tối đa 200 đề; không tính bài chờ chấm hoặc ẩn điểm từng câu. Bài mới lưu phân loại từng câu theo snapshot; bài cũ thiếu thông tin chỉ tính theo môn.
- Nhận diện phần cần ôn dưới 60%, phần cần củng cố dưới 80% và điểm mạnh từ 80%; chỉ phân loại khi có ít nhất 5 câu từ 2 đề khác nhau. Nhóm ít mẫu được ghi rõ.
- DeepSeek đề xuất ưu tiên, các bước ôn, thời lượng và bài tập tự kiểm tra dựa trên số liệu. Chỉ gửi thống kê chủ đề, không gửi bài làm/đáp án/thông tin tài khoản, không sửa điểm.
- Báo cáo được lưu và dùng lại cho cùng dữ liệu; thay đổi điểm/bài thi làm mới nguồn phân tích. Có phục hồi sau refresh, chống gửi trùng và thử lại khi lỗi AI.

Dùng chung cấu hình DeepSeek; tối đa 10 yêu cầu/Student trong 24 giờ. Xem [hướng dẫn AI Learning Analysis](docs/ai-learning-analysis.md).

## Personalized Quiz — luyện đúng chỗ còn yếu

Student bấm **Practice Weak Topics** trên **Phân tích học tập**, hoặc mở **Luyện tập cá nhân** tại **http://localhost:3000/practice**.

- Quiz chỉ gồm chủ đề **Ưu tiên ôn** và **Cần củng cố**. Mỗi chủ đề có ít nhất 5 câu và tối đa 10 câu. Một chủ đề được 10 câu; hai chủ đề được 20 câu; từ ba chủ đề thì tổng là 25 câu, phần dư được dồn cho chủ đề yếu hơn.
- Ví dụ Redis 40%, Kafka 42% và Spring Boot 70% cho ra **Redis 10 câu, Kafka 10 câu, Spring Boot 5 câu**. Độ khó bắt đầu theo điểm: dưới 45% là Dễ, dưới 60% là Trung bình, dưới 80% là Khó.
- Trong lúc làm, đúng một câu thì câu sau của **cùng chủ đề** khó hơn một mức; sai thì dễ hơn một mức. Các chủ đề được xen kẽ, không làm hết một chủ đề rồi mới sang chủ đề khác.
- Câu lấy từ ngân hàng **Sẵn sàng**, cùng môn và đúng đường dẫn chủ đề. Hết câu thì DeepSeek tạo câu trắc nghiệm chỉ cho phiên đó, không đưa vào Question Bank và không tạo đề thi.
- Kết quả luyện được cộng vào lần xếp đề tiếp theo. Chủ đề làm tốt nhận ít câu hơn, bắt đầu khó hơn, hoặc ra khỏi quiz khi đã đạt mức điểm mạnh. Điểm bài thi, tiến độ và phân tích chính thức không đổi.
- Tối đa 6 phiên và 40 câu AI mỗi Student trong 24 giờ. Có thể kết thúc sớm; câu chưa nộp không được tính.

Xem [hướng dẫn Personalized Quiz](docs/personalized-quiz.md).

## Question Analytics — đánh giá chất lượng câu hỏi

Admin/Teacher mở **Phân tích câu hỏi** tại **http://localhost:3000/question-analytics**, hoặc từ một câu trong Ngân hàng câu hỏi.

- Tính từ các lượt thi đã nộp của đề do mình tạo (Admin: toàn hệ thống), tối đa 2.000 lượt gần nhất. Câu được nhận diện theo câu gốc trong ngân hàng, kể cả khi đề đã trộn câu và đáp án.
- Mỗi câu có: số lượt làm và lượt đã chấm, tỷ lệ đúng, chỉ số độ khó, thời gian làm trung bình, độ khó thực tế so với độ khó đã đặt và chỉ số phân biệt (nhóm 27% điểm cao so với 27% điểm thấp).
- Độ khó thực tế: từ 70% đúng là Dễ, từ 40% là Trung bình, từ 20% là Khó, dưới 20% là Rất khó. Chỉ kết luận khi có ít nhất 10 lượt đã chấm.
- Gắn cờ **Quá dễ** (từ 90% đúng), **Quá khó** (không quá 20%), **Lệch độ khó** và **Phân biệt kém** (dưới 0,2); có cảnh báo bằng lời, ví dụ "được đặt độ khó Dễ nhưng chỉ 25% thí sinh trả lời đúng".
- Phân bố đáp án: tỷ lệ chọn từng phương án của câu trắc nghiệm, cảnh báo phương án nhiễu được chọn nhiều hơn đáp án đúng hoặc gần như không ai chọn; tỷ lệ đúng từng vị trí của câu Ordering/Matching; các câu trả lời sai phổ biến của Fill in the Blank/Short Answer.
- Danh sách có tìm kiếm, lọc theo cờ và phân trang.

## Dashboard

Trang **Tổng quan** hiển thị theo vai trò, chỉ đọc dữ liệu thật.

- **Teacher:** số học sinh, đề thi, câu hỏi, lượt làm bài, điểm trung bình, tỷ lệ đạt và các biểu đồ từ bài đã chấm.
- **Student:** số bài đã hoàn thành, điểm %, điểm cao nhất, thời gian học, cùng chủ đề mạnh/yếu theo đúng ngưỡng của Phân tích học tập.
- **Admin:** thống kê cộng đồng và quản lý người dùng.

## Lớp học & Khóa học

Teacher mở **Lớp học** tại **http://localhost:3000/classes**; mỗi lớp có trang riêng `/classes/[id]`.

- **Khóa học:** tạo/sửa/xóa khóa học để nhóm các lớp. Danh sách lớp lọc theo khóa học. Xóa khóa học không xóa lớp.
- **Mời học sinh:** mỗi lớp có mã 10 ký tự và liên kết `/join/[mã]` để sao chép; có thể đổi mã, mã cũ hết hiệu lực. Teacher cũng thêm/gỡ học sinh bằng email.
- **Tham gia bằng liên kết:** Student chưa đăng nhập được đưa tới đăng nhập/đăng ký rồi tự vào lớp. Teacher mở liên kết chỉ thấy thông báo liên kết dành cho học sinh.
- **Bài học:** tiêu đề, nội dung và liên kết tài liệu (chỉ http/https).
- **Giao bài:** chọn đề đã phát hành của mình, loại **Bài kiểm tra** hoặc **Bài thi** và hạn nộp. Mọi thành viên lớp được làm bài đến hạn; sau hạn không bắt đầu được nữa, và thời gian làm bài không vượt quá hạn nộp hay giờ đóng đề. Có thể sửa hạn nộp hoặc gỡ bài; bài đã nộp vẫn được giữ.
- **Kết quả:** theo từng bài được giao: số học sinh đã nộp, điểm trung bình, số đạt, và bảng từng học sinh với trạng thái và điểm cao nhất.
- **Student:** xem lớp với các tab Bài kiểm tra / Bài thi / Bài học, số bài còn phải làm, hạn nộp và trạng thái từng bài. Danh sách **Bài thi của tôi** hiển thị hạn nộp và nhãn **Quá hạn nộp**.

## Thông báo

Biểu tượng chuông trên thanh đầu trang hiển thị số thông báo chưa đọc, tự cập nhật mỗi 30 giây và khi quay lại tab.

| Thông báo                   | Người nhận            | Khi nào                                                         |
| --------------------------- | --------------------- | --------------------------------------------------------------- |
| Có bài thi mới              | Student được phép làm | Teacher phát hành đề, hoặc giao bài cho lớp (kèm hạn nộp)       |
| Bài thi sắp bắt đầu         | Student được phép làm | 30 phút trước giờ mở đề                                         |
| Sắp hết hạn                 | Student chưa nộp bài  | 24 giờ trước hạn nộp của bài được giao hoặc giờ đóng đề         |
| Đã có kết quả               | Student               | Bài tự luận được chấm xong, hoặc bài được tự nộp khi hết giờ    |
| Giáo viên đã nhận xét       | Student               | Teacher viết nhận xét mới và đề cho phép xem đáp án sau khi nộp |
| Học sinh hoàn thành bài thi | Teacher tạo đề        | Student nộp bài                                                 |

- Mỗi sự kiện chỉ gửi một lần cho mỗi người. Thông báo nộp bài được gộp theo đề, ví dụ "An và 3 học sinh khác đã nộp bài…", và đếm lại sau khi Teacher đã đọc.
- Không nhắc "sắp bắt đầu" hoặc "sắp hết hạn" nếu đề vừa phát hành hay bài vừa giao ngay trước mốc đó, vì thông báo đầu tiên đã ghi thời gian. Student tự bấm nộp thấy kết quả ngay nên không nhận thêm thông báo kết quả.
- Bấm vào thông báo sẽ đánh dấu đã đọc và mở đúng trang: đề thi được làm nổi bật, trang lớp học, kết quả lượt thi, hoặc danh sách bài nộp của đề với Teacher. Có **Đọc tất cả** và **Xem thêm**.
- Thời gian trong thông báo theo giờ Việt Nam. Thông báo được giữ 90 ngày. Nhắc lịch được máy chủ kiểm tra mỗi phút.
- **Email:** mọi thông báo dành cho Student (5 loại đầu trong bảng) cũng được gửi tới email của học sinh, kèm liên kết mở đúng trang. Thông báo cho Teacher chỉ hiện trong ứng dụng.
  - Email được đưa vào hàng đợi `emailJobs` và một worker trong backend gửi dần, tối đa khoảng 120 email/phút, để phát hành đề cho nhiều học sinh không làm chậm thao tác và không vượt giới hạn SMTP.
  - SMTP lỗi thì thử lại sau 1 phút, 5 phút, 30 phút, 2 giờ; sau đó đánh dấu `FAILED`. Tài khoản bị khóa hoặc chưa xác minh email được bỏ qua (`SKIPPED`). Email lấy theo địa chỉ hiện tại của học sinh lúc gửi. Hàng đợi được giữ 30 ngày.
  - Production chưa cấu hình SMTP thì email nằm chờ trong hàng đợi; development ghi email vào `backend/.mail/`.

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
Exam Player có thêm kiểm thử bản nháp, mất phản hồi, đồng bộ khi có mạng, xung đột đáp án, điều hướng tuần tự và hết giờ.
Auto Grading kiểm tra điểm có trọng số, xác nhận của Teacher, lịch sử sửa điểm, quyền truy cập, job AI/lease, thử lại và dữ liệu AI không hợp lệ.
AI Explanation kiểm tra quyền xem đáp án, hội thoại nhiều lượt, câu hỏi đã trộn, gửi lại request, lease, giới hạn sử dụng và kết quả thay đổi sau khi Teacher chấm lại.
AI Learning Analysis kiểm tra điểm có trọng số theo chủ đề, mẫu ít, thi lại, phạm vi thời gian, bài cũ/ẩn/chờ chấm, phân quyền, cache và khôi phục job, quota và dữ liệu thay đổi trong lúc AI chạy.
Personalized Quiz kiểm tra phân bổ 10/10/5, tăng/giảm độ khó, đề sau bỏ chủ đề đã vững, và việc luyện tập không ghi vào điểm bài thi.
Dashboard kiểm tra số liệu thống kê của Teacher và Student từ bài đã chấm.
Question Analytics kiểm tra tỷ lệ đúng, độ khó thực tế, chỉ số phân biệt, phân bố đáp án khi đề trộn câu/đáp án và phạm vi dữ liệu theo quyền.
Giám sát phòng thi kiểm tra ghi nhật ký chỉ khi bật, giới hạn sự kiện, cảnh báo và hủy lượt thi khi rời trang quá số lần.
Lớp học kiểm tra khóa học, mã mời và đổi mã, bài học, giao bài có hạn nộp, quyền làm bài theo lớp, chặn sau hạn và bảng kết quả.
Thông báo kiểm tra người nhận của từng loại, nhắc lịch không gửi trùng, gộp thông báo nộp bài, kết quả sau khi chấm, nhận xét mới và API đọc/đánh dấu đã đọc.

## Cấu trúc

- `backend/src/app.ts`: lắp ghép middleware và routes; `server.ts` khởi động server.
- `backend/src/routes`: khai báo đường dẫn API theo auth, profile, admin, teacher (dashboard, khóa học, lớp học), student, questions (kèm analytics), exams, ai, ai-exams, learning-analysis, practice, notifications.
- `backend/src/controllers`: xử lý request theo từng nhóm tính năng.
- `backend/src/middleware`: xác thực, phân quyền, kiểm tra request, giới hạn tần suất và xử lý lỗi.
- `backend/src/models`: kiểu dữ liệu MongoDB và hàm chuyển dữ liệu trả về client.
- `backend/src/database`: kết nối MongoDB, collections và indexes.
- `backend/src/common`: cấu hình, validation, tiện ích JWT/password/cookie, email, chấm thi, nhật ký phòng thi, lớp học, thông báo và nhắc lịch, phân tích câu hỏi, DeepSeek adapter, AI worker và bộ đọc nguồn tài liệu.
- `backend/scripts`: script kiểm tra database và tạo admin.
- `backend/test`: kiểm thử tích hợp API.
- `frontend/app`: các route tài khoản, dashboard, classes (kèm `/classes/[id]`, `/join/[code]`), questions, question-analytics, exams, phòng thi `/exam/[runId]`, ai, ai-exams, lịch sử, tiến độ, phân tích học tập và luyện tập.
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
