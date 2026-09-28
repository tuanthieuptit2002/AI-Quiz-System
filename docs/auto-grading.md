# Auto Grading — chấm bài và trợ lý AI

## Luồng sử dụng

1. Student nộp bài trong Exam Player. Máy chủ chấm câu khách quan ngay, trả về điểm, thống kê và thời gian làm bài.
2. Teacher/Admin mở **Đề thi → Bài làm → Xem / chấm**. Màn hình có bài làm, đáp án tham chiếu/rubric và vùng quyết định điểm; lọc **Tất cả / Chờ chấm / Tự luận & ngắn / Khách quan**.
3. Với Essay hoặc Short Answer, nhập điểm/nhận xét trực tiếp hoặc bấm **Nhờ AI đề xuất điểm**. AI chạy nền, có thể rời màn hình và mở lại để xem đề xuất.
4. **Đưa vào bản chấm** chỉ điền điểm và nhận xét vào form. Teacher có thể chỉnh sửa, **Bỏ qua** đề xuất hoặc **Yêu cầu đề xuất mới**.
5. Bấm **Xác nhận điểm câu này** để lưu quyết định của Teacher. Điểm chính thức chỉ được tính khi mọi câu đã được chấm. Student đang mở trang kết quả chờ chấm sẽ thấy kết quả tự cập nhật.
6. Mở **Lịch sử chấm** để xem người chấm, thời điểm, điểm/nhận xét trước và sau, điểm AI đề xuất nếu có. Có thể sửa điểm đã xác nhận; lịch sử vẫn được giữ và tiến độ được cập nhật.

## Quy tắc chấm

- **Single Choice, Multiple Choice, True/False, Fill in the Blank, Matching, Ordering:** đúng toàn bộ mới đủ điểm, còn lại 0. Multiple Choice không phụ thuộc thứ tự chọn; Matching và Ordering cần đúng thứ tự tương ứng. Điền từ chuẩn hóa Unicode NFKC, hoa/thường và khoảng trắng, vẫn phân biệt dấu tiếng Việt.
- **Essay và Short Answer:** có nội dung thì chờ Teacher quyết định, kể cả trả lời ngắn trùng đáp án tham chiếu. Bài trống hoặc chỉ có khoảng trắng được 0. Teacher được sửa điểm các câu này sau khi nộp.
- Điểm Teacher nhập từ 0 đến điểm tối đa của câu, tối đa 2 chữ số thập phân. Nhận xét tối đa 2.000 ký tự. Câu khách quan không nhận điểm do Teacher gửi qua endpoint chấm thủ công.
- Điểm phần trăm = tổng điểm đạt / tổng điểm tối đa × 100, hiển thị tối đa 2 chữ số thập phân. Ngưỡng đạt áp dụng trên tỷ lệ thực; tiến độ quy đổi về thang 10.
- Chưa chấm đủ: trạng thái `PENDING_REVIEW`, hiển thị điểm đã chấm **tạm tính**, chưa quyết định đạt/chưa đạt và chưa ghi vào `examAttempts`. AI tạo đề xuất không thay đổi trạng thái này.
- Chấm đủ: `SUBMITTED`; cùng một lượt thi chỉ có một bản ghi kết quả. Sửa điểm cập nhật bản ghi đó, không tạo thêm lượt hoặc kéo dài thời gian thi.
- Lượt đang làm hoặc hết hạn mà không nộp không có điểm và không được chấm. Deadline, điều hướng và quyền thi giữ quy tắc Exam Player.
- Lượt đã chấm ở phiên bản cũ giữ nguyên điểm. Cách chấm Short Answer mới áp dụng khi lượt thi được kết thúc sau cập nhật; Teacher có thể chủ động chấm lại Short Answer ở lượt cũ.

## Thống kê kết quả

Trường `grading` trong DTO của lượt thi gồm:

- `earnedPoints`, `totalPoints`: tổng điểm đã chấm và tối đa; dùng cùng `scorePercent` để thể hiện điểm gốc và phần trăm.
- `correct`: câu được đủ điểm; `partial`: điểm lớn hơn 0 nhưng chưa đủ; `incorrect`: câu 0 điểm, bao gồm câu bỏ trống; `pending`: chưa chấm. Bốn nhóm này cộng lại bằng số câu của đề.
- `unanswered`: số câu không có nội dung trả lời, là thống kê bổ sung; không cộng thêm vào bốn nhóm trên.
- `durationSeconds`: thời gian từ bắt đầu đến nộp, không vượt deadline và không tính thời gian Teacher chấm. Ví dụ 2.601 giây hiển thị `43m 21s`.
- `final`: đã chấm đủ hay còn tạm tính. `grading = null` khi lượt đang làm hoặc hết hạn chưa nộp.

Ví dụ 50 câu khách quan, mỗi câu 2 điểm, đúng 41 và sai 9: **82/100**, **82%**, **41 đúng**, **9 sai**.

Tắt **Xem đáp án sau nộp** vẫn cho Student xem tổng điểm/thống kê, nhưng không trả khóa đáp án, rubric, giải thích, điểm và nhận xét từng câu. Các đề xuất AI và lịch sử người chấm chỉ dành cho Teacher quản lý đề hoặc Admin.

## DeepSeek chỉ là grading assistant

Dùng `DEEPSEEK_API_KEY` và `DEEPSEEK_MODEL` trong `backend/.env`, giống các module AI trước. Không thêm biến môi trường hoặc dependency. Không có API key hoặc DeepSeek gặp lỗi thì vẫn chấm thủ công bình thường.

Teacher chủ động bấm nút mới gửi dữ liệu. Request gồm loại câu, nội dung câu hỏi, điểm tối đa, đáp án tham chiếu/rubric, giải thích và bài làm. Không kèm thông tin tài khoản như tên/email/ID học sinh. Những gì học sinh tự viết trong bài làm vẫn nằm trong nội dung gửi. Phiên bản này không gửi ảnh sang AI; câu có ảnh yêu cầu chấm thủ công.

AI trả về đề xuất có điểm, lý do ngắn gọn theo rubric, các ý đã đáp ứng, điều cần cải thiện, trích đoạn nguyên văn bài làm và giới hạn cần Teacher xem lại. Backend kiểm tra cấu trúc, điểm trong giới hạn, số chữ số thập phân, độ dài và trích dẫn phải xuất hiện trong bài làm; không chấp nhận trích dẫn tự tạo. Kiểm tra cấu trúc không đảm bảo nhận định của AI chính xác, nên Teacher vẫn cần đối chiếu.

Prompt coi bài làm và các tài liệu tham chiếu là dữ liệu không đáng tin, không làm theo yêu cầu tự cho điểm trong bài. AI không có công cụ gọi API, thực thi mã hoặc quyền ghi điểm. Worker chỉ ghi `gradingSuggestions`; endpoint chấm điểm riêng luôn yêu cầu quyền Teacher/Admin và điểm do người chấm xác nhận.

Adapter dùng [JSON Output của DeepSeek](https://api-docs.deepseek.com/guides/json_mode/), kiểm tra kết quả và thử sửa một lần nếu JSON/điểm/trích dẫn không hợp lệ. Request có timeout, lỗi được lưu để Teacher xem và yêu cầu lại; không tự lặp vô hạn hoặc công bố điểm khi thất bại.

## Độ bền và quyền truy cập

- Đề xuất lưu MongoDB theo lượt thi/câu, gắn hash snapshot câu hỏi và bài làm. Kết quả sinh từ dữ liệu đã thay đổi không được dùng để xác nhận điểm.
- Job `QUEUED → GENERATING → READY/FAILED`; có lease 3 phút để tránh hai worker xử lý cùng job. Worker bị gián đoạn chuyển job sang lỗi khi lease hết, Teacher có thể yêu cầu mới. Kết quả từ worker cũ không ghi đè job mới.
- Một yêu cầu AI đang chạy trên mỗi tài khoản và mỗi câu; tối đa 100 yêu cầu/tài khoản trong 24 giờ, 10 request tạo đề xuất/phút. `requestId` giúp gửi lại request bị mất phản hồi mà không tạo job tính phí trùng.
- Worker kiểm tra lại quyền người yêu cầu và snapshot trước và sau khi gọi AI. Khóa tài khoản/đổi quyền sẽ ngăn tiếp tục xử lý.
- Ghi điểm, lịch sử và kết quả học tập trong cùng transaction. `revision` cũ trả `409`; form giữ nội dung để Teacher xem, yêu cầu tải lại trước khi xác nhận tiếp. Không tự ghi đè điểm từ thiết bị khác.
- Điểm/nhận xét chưa xác nhận trên form chưa được lưu lên server. Giao diện cảnh báo khi rời/tải lại nếu có thay đổi. Các đề xuất AI đã lưu và các điểm đã xác nhận vẫn tồn tại khi refresh.
- Cần MongoDB Atlas hoặc replica set như các module trước. Index mới tạo tự động khi backend khởi động, không cần migrate dữ liệu cũ.

## API

Các endpoint sau yêu cầu Admin hoặc Teacher sở hữu đề, bắt đầu bằng `/api/exams/:id/submissions/:runId`:

- `GET /grading?page=1`: trạng thái cấu hình AI, đề xuất mới nhất theo câu, lịch sử chấm phân trang 20 dòng, tổng số và số trang.
- `POST /grading/suggest`, body `{ index, requestId }`: yêu cầu đề xuất cho câu Essay/Short Answer có nội dung, đã nộp và không có ảnh. Trả `202`, hoặc `200` cho request ID đã xử lý. Không nhận bài làm hoặc rubric thay thế từ frontend.
- `POST /grading/:suggestionId/dismiss`, body `{ version }`: bỏ qua đề xuất `READY`, không sửa điểm. Bản đề xuất cũ vẫn được giữ.
- `POST /grade`, body `{ revision, grades: [{ index, points, feedback, suggestionId? }] }`: xác nhận điểm; tối đa 100 câu khác nhau trong một request. `suggestionId` chỉ dùng ghi nguồn tham khảo, không tự áp dụng điểm AI. Teacher có thể chọn điểm khác đề xuất. Nếu bỏ qua AI thì không gửi ID hoặc gửi `null`.

`gradingSuggestions` lưu job/đề xuất; `gradingEvents` lưu từng quyết định Teacher. Endpoint Student không trả hai loại dữ liệu này.

## Mã nguồn và kiểm thử

- `backend/src/common/exam-runtime.ts`: chấm khách quan, thống kê và cập nhật kết quả.
- `backend/src/common/grading-provider.ts`: prompt, adapter DeepSeek, validation và hash snapshot.
- `backend/src/common/grading-runtime.ts`: worker và lease job.
- `backend/src/controllers/grading.controller.ts`: quyền chấm, đề xuất, bỏ qua, xác nhận và lịch sử.
- `frontend/components/exams/teacher-grading.tsx`: màn hình Teacher chấm và duyệt đề xuất.
- `frontend/components/exams/exam-result.tsx`, `result-summary.tsx`: kết quả Student và thống kê dùng chung.
- `backend/test/grading.test.ts`: chấm 8 dạng, trọng số, quyền, stale revision, rollback transaction, lịch sử, đề xuất không tự cho điểm, bỏ qua/tạo lại, idempotency, lease, nguồn thay đổi và output AI sai.

Chạy `npm test` trong backend, `npm run lint` và `npm run build` trong frontend. Test dùng database tạm và AI giả lập, không sửa dữ liệu Atlas hay gọi AI tính phí. Đã thử luồng chấm thủ công/AI trên trình duyệt desktop/mobile, xác nhận điểm, xung đột, lịch sử và kết quả Student tự cập nhật.
