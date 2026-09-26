# AI Exam Generator

Mở **http://localhost:3000/ai-exams**, chọn **Tạo đề thi AI** trong menu, hoặc **Tạo bằng AI** ở trang Đề thi & kiểm tra. Chỉ Teacher và Admin được truy cập.

## Quy trình

1. Nhập yêu cầu tự nhiên, chọn Tiếng Việt/English và nguồn câu hỏi. Ví dụ:

   ```text
   Tạo bài kiểm tra Java Backend Fresher
   50 câu
   60 phút
   Java Core: 30%
   Spring Boot: 30%
   Database: 20%
   Redis: 10%
   Kafka: 10%
   ```

2. DeepSeek đề xuất tên, môn học, mục tiêu, thời lượng, điểm đạt và các chủ đề. Mỗi chủ đề có tỷ lệ, độ khó, dạng câu, kiến thức cần đánh giá và các tên chủ đề/tags tương đương để tìm trong ngân hàng. Teacher chỉnh sửa trước khi tạo đề.
3. Backend quy đổi tỷ lệ thành số câu theo phương pháp phần dư lớn nhất, bảo đảm đúng tổng. Ví dụ trên là **15 / 15 / 10 / 5 / 5**. Tổng tỷ lệ cần đúng 100%; mỗi chủ đề phải nhận ít nhất một câu.
4. Xem độ phủ ngân hàng, sau đó **Tạo đề theo cấu trúc**. Quá trình chạy nền và lưu từng nhóm câu vào MongoDB. Mở Lịch sử để theo dõi hoặc tiếp tục sau khi rời trang.
5. Duyệt toàn bộ đề, lọc theo chủ đề, xem đáp án/giải thích, chỉnh sửa hoặc yêu cầu AI tạo câu thay thế kèm góp ý. Việc sửa câu ngân hàng tạo bản riêng trong đề, không thay đổi câu gốc.
6. **Duyệt & lưu đề nháp**: các câu mới/đã sửa được thêm vào Question Bank ở trạng thái `READY`, có version 1 và ghi chú nguồn; đề lưu snapshot câu hỏi vào Exam Builder. Câu ngân hàng không chỉnh sửa được tái sử dụng, không nhân bản.
7. **Cấu hình đề thi** để chọn lớp/học sinh, lịch thi, lượt thi, mã truy cập, điểm mỗi câu và các thiết lập hiện có. Đề mặc định `DRAFT`, giới hạn truy cập chưa có đối tượng; cần chọn đối tượng trước khi phát hành. Student chưa thấy đề nháp.

## Nguồn và cách chọn câu

- **Ngân hàng + AI:** ưu tiên câu có sẵn, sinh đúng phần thiếu theo từng chủ đề.
- **Chỉ ngân hàng:** AI thiết kế cấu trúc, không sinh câu mới khi ghép đề. Nếu thiếu, báo rõ chủ đề và số lượng; có thể chỉnh cấu trúc, bổ sung ngân hàng, hoặc chọn cho AI bổ sung rồi thử lại.
- **Tạo mới bằng AI:** sinh tất cả câu mới theo cấu trúc đã duyệt.

Việc chọn câu ngân hàng sử dụng cấu trúc/từ khóa do AI đề xuất và Teacher duyệt: cùng môn học, độ khó, dạng câu; một phần tử `topicPath` hoặc tag khớp chính xác chủ đề/từ khóa, không phân biệt hoa thường. Teacher chỉ dùng câu `READY` của mình; Admin có thể dùng toàn bộ ngân hàng. Trong số câu phù hợp, ưu tiên câu cập nhật gần đây. Đây là lựa chọn theo metadata, chưa dùng vector search hoặc đánh giá ngữ nghĩa từng câu bằng AI. Nên gắn chủ đề/tags đầy đủ để tái sử dụng hiệu quả. Ngôn ngữ chỉ áp dụng cho câu AI sinh; ngân hàng hiện chưa có trường ngôn ngữ.

Không dùng trùng ID hoặc nội dung câu hỏi đã chuẩn hóa trong cùng đề. Phân bổ độ phủ không đếm một câu cho hai chủ đề. Số câu hiển thị ở bước cấu trúc là số có thể lấy, tối đa số cần; được kiểm tra lại lúc ghép đề. Nguồn ngân hàng được kiểm tra lại trạng thái, quyền sở hữu và phiên bản lúc lưu.

## Cấu hình và giới hạn

Dùng chung `DEEPSEEK_API_KEY` và `DEEPSEEK_MODEL` trong `backend/.env` với AI Question Generator; mặc định `deepseek-flash`. Không cần key mới hay dependency mới.

- Tối đa **100 câu, 12 chủ đề, 480 phút**, yêu cầu tối đa 4.000 ký tự; tỷ lệ là số nguyên.
- Mỗi chủ đề có một độ khó và một dạng câu trong 8 dạng hiện có. Nếu yêu cầu chưa nêu dạng, AI mặc định Single Choice.
- AI sinh tối đa 5 câu/lần, kiểm tra cấu trúc, đáp án và nội dung trùng trước khi lưu tiến độ. Nội dung giáo dục vẫn cần Teacher duyệt.
- Đề và ảnh tối đa 10 MB. Mỗi câu mặc định 1 điểm; có thể chỉnh trong Exam Builder.
- Mỗi tài khoản tối đa 20 yêu cầu mới/ngày, 30 thao tác tạo/thử lại/thay câu trong 15 phút và một yêu cầu đang chạy trong module AI Exam.
- JSON output, deadline và xử lý lỗi dùng chung adapter DeepSeek với AI Question Generator. Chỉ thử sửa output không hợp lệ một lần; không tự lặp yêu cầu khi key/số dư/mạng lỗi.
- Tác vụ có lease 3 phút. Worker bị dừng sẽ chuyển sang lỗi sau khi lease hết hạn; **Thử lại** giữ các câu đã tạo. Phần thay câu giữ bản trước nếu AI lỗi.
- Request UUID chống tạo yêu cầu trùng; version chống ghi đè; transaction chống lưu đề/câu/version một phần hoặc lưu trùng khi duyệt đồng thời. Cần MongoDB Atlas hoặc replica set.

API key luôn ở backend. Các tài liệu PDF/Word/Text/URL có thể dùng qua module AI Question Generator, duyệt vào ngân hàng, rồi tái sử dụng trong AI Exam.

## API

Các endpoint thuộc `/api/ai-exams`, yêu cầu access token, quyền Teacher/Admin và request guard cho thao tác ghi:

- `GET /`, `POST /`: lịch sử phân trang / tạo yêu cầu `{requestId, prompt, strategy, language}`.
- `GET /:id`: cấu trúc, câu hỏi, tiến độ, lỗi và phiên bản.
- `PUT /:id/plan`: cập nhật `{version, plan, strategy}` trước khi ghép câu.
- `GET /:id/coverage`: độ phủ ngân hàng theo cấu trúc đã lưu.
- `POST /:id/build`: `{version}` để bắt đầu ghép/sinh câu.
- `POST /:id/retry`: `{version, strategy?}`; chỉ đổi strategy khi chưa có câu.
- `PUT /:id/items/:itemId`: `{version, content}`; giữ môn/chủ đề/độ khó/dạng theo ma trận.
- `POST /:id/items/:itemId/replace`: `{version, feedback?}`; không dùng cho chế độ chỉ ngân hàng.
- `POST /:id/save`: `{version}`, trả `{job, exam}`; lưu nháp và câu mới trong một transaction.

Collection `aiExams` giữ yêu cầu, cấu trúc, câu chờ duyệt, tiến độ và liên kết `examId`. Trạng thái: `QUEUED → WORKING → PLANNED → QUEUED → WORKING → REVIEW → SAVED`; lỗi ở bước nào có thể thử lại bước đó.

## Kiểm tra

`npm test` trong backend bao gồm phân bổ tỷ lệ/làm tròn, dữ liệu AI không hợp lệ, RBAC, ngân hàng thiếu/trùng/khác chủ sở hữu, retry từng nhóm, lease hết hạn, sửa/thay câu, xung đột phiên bản, transaction rollback và duyệt đồng thời. Kiểm thử tự động dùng MongoDB tạm và AI giả lập, không ghi dữ liệu thử vào Atlas.

Adapter tuân theo [DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/) và [Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/).
