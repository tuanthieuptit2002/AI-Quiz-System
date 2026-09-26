# AI Question Generator

Mở **http://localhost:3000/ai** hoặc **Tạo câu hỏi AI** trong menu. Teacher tạo và duyệt câu hỏi của mình; Admin xem và xử lý toàn bộ; Student không truy cập nguồn tài liệu hoặc đáp án.

## Cấu hình DeepSeek

Thêm vào `backend/.env`, sau đó khởi động lại backend:

```dotenv
DEEPSEEK_API_KEY=your-deepseek-api-key
DEEPSEEK_MODEL=deepseek-flash
```

Model mặc định là `deepseek-flash`; có thể đổi bằng `DEEPSEEK_MODEL` sang model tương thích Chat Completions và JSON Output của DeepSeek. Key chỉ đọc ở backend, không trả qua API hoặc nhúng vào frontend. Khi thiếu key, giao diện hiển thị hướng dẫn cấu hình và không cho gửi yêu cầu tạo mới. Các câu đã tạo vẫn có thể xem, sửa và duyệt.

Module dùng [DeepSeek Chat Completions](https://api-docs.deepseek.com/api/create-chat-completion/) và [JSON Output](https://api-docs.deepseek.com/guides/json_mode/), tắt thinking, không gọi công cụ/web search từ model. Backend kiểm tra JSON và toàn bộ quy tắc đáp án sau mỗi phản hồi. Nếu đầu ra sai cấu trúc, thử yêu cầu sửa một lần; lỗi API key, số dư, rate limit hoặc kết nối không tự gọi lại. Mỗi lần gọi tối đa 90 giây; tổng thời gian cả lần sửa tối đa 120 giây.

## Tạo và duyệt

1. Chọn **Chủ đề / Prompt**, **Văn bản / Bài giảng**, **PDF / Word** hoặc **Website URL**.
2. Với file/URL, bấm đọc nguồn rồi kiểm tra phần văn bản đã trích xuất. Có thể chỉnh sửa, bỏ phần thừa trước khi tạo. File gốc không được lưu.
3. Nhập môn học, chủ đề phân cấp, độ khó, số câu, dạng câu hỏi, ngôn ngữ và yêu cầu bổ sung.
4. Bấm **Tạo câu hỏi với AI**. Nguồn và yêu cầu được gửi đến DeepSeek; bản văn bản dùng để tạo được lưu cùng đợt để xem lại/đối chiếu.
5. Xem tiến độ, hoặc rời trang và mở lại từ **Lịch sử tạo**. Mỗi nhóm tối đa 5 câu được lưu vào MongoDB.
6. Khi hoàn tất hoặc gặp lỗi, xem đáp án, giải thích và trích đoạn nguồn. Chọn một hoặc nhiều câu để **Approve / Edit / Regenerate / Reject**.

Ví dụ: môn Java, chủ đề Java Spring Boot, Medium, 20 câu; hoặc tải `Spring Boot.pdf` rồi chọn 30 câu.

- **Single Choice:** đúng 4 lựa chọn, 1 đáp án đúng.
- **Multiple Choice:** đúng 4 lựa chọn, nhiều đáp án đúng. Trong giao diện chọn **Nhiều đáp án**.
- Hỗ trợ thêm True/False, Fill in the Blank, Short Answer, Essay, Matching và Ordering. Câu tự luận có rubric chấm điểm.
- Độ khó: Easy, Medium, Hard, Very Hard; ngôn ngữ: Tiếng Việt hoặc English.
- Đáp án và giải thích luôn có sẵn trong khu vực duyệt. Với tài liệu, AI phải cung cấp trích đoạn có thật trong nguồn; kiểm tra trích đoạn không thay thế việc giáo viên xác minh tính đúng của câu hỏi.

## Ý nghĩa các thao tác

- **Approve:** đưa câu hỏi vào Question Bank ở trạng thái **Sẵn sàng**, tạo version 1 và ghi chú nguồn AI trong lịch sử phiên bản. Sau đó có thể dùng trong Exam Builder. Duyệt hàng loạt là một transaction; hai tab duyệt cùng lúc không tạo bản sao trùng. Admin duyệt vẫn giữ Teacher gốc là chủ sở hữu.
- **Edit:** dùng trình biên tập đầy đủ của Question Bank (gồm ảnh và 8 dạng đáp án). Lưu chỉ sửa bản chờ duyệt, chưa đưa vào ngân hàng.
- **Regenerate:** nhập góp ý để AI viết lại một câu. Dùng lại nguồn và phân loại của bản đã chỉnh sửa; các câu khác giữ nguyên. Nếu lỗi, bản cũ vẫn còn. Bản mới quay về chờ duyệt; câu bị Reject cũng có thể tạo lại.
- **Reject:** đánh dấu từ chối, không thêm vào Question Bank.
- Câu đã Approve được sửa/lưu trữ trong Question Bank. Bản trong lịch sử AI giữ nội dung tại thời điểm duyệt.

## Nguồn và giới hạn

- Tối đa **50 câu/đợt**, **30 đợt/tài khoản/ngày**, một đợt đang chờ/chạy trên mỗi tài khoản. Đọc file/URL, tạo, thử lại và regenerate dùng chung hạn mức 30 thao tác/15 phút/tài khoản.
- Nguồn văn bản **80–60.000 ký tự**, không cắt ngầm nội dung quá dài. Hãy tách theo chương hoặc chọn đoạn cần dùng.
- File **8 MB**: PDF có lớp văn bản (tối đa 100 trang), Word `.docx`, TXT UTF-8. `.doc` cần lưu lại thành `.docx`. PDF scan chưa OCR, file mã hóa hoặc không trích được đủ văn bản sẽ báo lỗi.
- Bộ đọc PDF/Word chạy trong worker có giới hạn thời gian 20 giây và heap 192 MB; Word kiểm tra số entry/kích thước giải nén. Không chạy macro hay tải tài nguyên nhúng.
- URL chỉ đọc HTML/TXT công khai, cổng 80/443, tối đa 2 MB và 3 lần chuyển hướng, trong 15 giây. Loại script/navigation khi trích nội dung. Trang cần đăng nhập hoặc JavaScript có thể không đọc được; dùng dán văn bản thay thế.
- Chặn IP private, loopback, link-local, địa chỉ metadata và IPv4-mapped IPv6 nội bộ; kiểm tra DNS ở từng lần chuyển hướng và ghim IP đã kiểm tra cho kết nối.
- Câu trùng nguyên văn trong cùng đợt, sai đáp án, sai số lượng hoặc trích dẫn không có trong nguồn không được lưu vào hàng chờ. Không bảo đảm loại được các câu trùng ý nghĩa hoặc trùng với toàn bộ ngân hàng.

## Lưu tiến độ và khôi phục

Collection `aiGenerations` chứa cấu hình, nguồn, câu chờ duyệt, trạng thái, revision và ID câu đã đưa vào ngân hàng. Backend worker lấy job đã lưu, không phụ thuộc kết nối trình duyệt. Mỗi process xử lý lần lượt một job; nhiều process dùng lease để không xử lý trùng cùng job.

Trạng thái `QUEUED → GENERATING → REVIEW` hoặc `FAILED`. Lease 3 phút được gia hạn sau mỗi nhóm; backend phát hiện lease hết hạn và chuyển sang lỗi có thể thử lại. Bấm **Thử lại** tiếp tục phần còn thiếu, giữ các câu đã tạo/sửa/duyệt. Không tự tiếp tục gọi AI sau lỗi để tránh phát sinh chi phí ngoài dự kiến.

Nguồn phải đủ kiến thức để tạo số câu yêu cầu. AI vẫn có thể trả đáp án sai về nội dung dù JSON hợp lệ; luôn duyệt trước khi sử dụng cho học sinh. Việc duyệt cần MongoDB Atlas hoặc replica set, giống Question Bank.

## API

Tất cả route dưới `/api/ai` cần đăng nhập Admin/Teacher và kiểm tra quyền sở hữu:

```text
GET  /status                                  Trạng thái cấu hình, model, giới hạn (không trả key)
POST /source/file?filename=Spring%20Boot.pdf    application/octet-stream, tối đa 8 MB
POST /source/url                              { url }
GET  /generations?page=1                       Lịch sử 10 đợt/trang, không trả văn bản nguồn/đáp án
POST /generations                             { requestId: UUID, settings, source }
GET  /generations/:id                          Tiến độ, nguồn và câu hỏi chờ duyệt
PUT  /generations/:id/items/:itemId            { version, content }
POST /generations/:id/approve                  { version, ids: UUID[] }
POST /generations/:id/reject                   { version, ids: UUID[] }
POST /generations/:id/items/:itemId/regenerate { version, feedback? }
POST /generations/:id/retry                    { version }
```

`settings`: `subject`, `topicPath`, `difficulty`, `type`, `count`, `language`, `instructions`. `source`: `kind`, `name`, `text`. `requestId` giúp gửi lại yêu cầu tạo sau lỗi mạng mà không tạo job mới. Các thao tác duyệt/sửa dùng version để ngăn ghi đè từ tab cũ.

## Kiểm thử

`npm test` tại backend sử dụng MongoDB replica set tạm và provider giả lập; không ghi vào Atlas hoặc gọi DeepSeek. Test gồm 8 dạng câu hỏi, đọc PDF/Word/TXT, bảo vệ URL, lỗi provider, sửa đầu ra một lần, duyệt đồng thời, cô lập Teacher/Student, nguồn trích dẫn, job 30 câu, lỗi một phần và lease hết hạn.

Kiểm thử thực tế DeepSeek đã xác nhận sinh câu một đáp án và nhiều đáp án từ đoạn bài giảng mẫu; key không được in ra log. Các kiểm thử trình duyệt dùng DB/provider giả lập riêng biệt để xác minh luồng và giao diện.
