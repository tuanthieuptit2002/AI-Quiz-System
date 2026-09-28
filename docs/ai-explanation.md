# AI Explanation — giải thích và hỏi tiếp sau khi thi

## Sử dụng

1. Teacher bật **Hiển thị đáp án sau khi nộp** trong Exam Builder trước khi phát hành đề.
2. Student nộp bài, hoặc mở lại kết quả từ **Bài thi của tôi** tại `/exams`.
3. Chọn **Explain with AI** dưới một câu. Nếu đã có hội thoại, ứng dụng mở lại; nếu chưa có, DeepSeek tạo giải thích đầu tiên.
4. Xem giải thích đối chiếu bài làm, **Điều cần nhớ**, **Thử vận dụng**, rồi bấm câu hỏi gợi ý hoặc nhập nội dung vào **Hỏi tiếp**.
5. Có thể thu gọn, rời trang và mở lại. Hội thoại đã gửi được lưu trên máy chủ; câu đang gõ chưa gửi chỉ nằm trên màn hình hiện tại.

Ví dụ Student chọn A nhưng đúng là B: AI nhận cả lựa chọn A, đáp án B, nội dung câu hỏi và giải thích tham chiếu để nói rõ vì sao Dependency Injection nhận dependency từ bên ngoài thay vì tự khởi tạo. Với câu trả lời đúng hoặc bỏ trống, hướng dẫn yêu cầu AI giải thích đúng tình huống, không mặc định kết luận Student sai.

## Quyền xem và phạm vi

- Chỉ Student sở hữu lượt thi được truy cập. Không có API chia sẻ hội thoại hoặc đọc bài của học sinh khác; Teacher/Admin không dùng endpoint này để giả lập Student.
- Lượt thi phải ở `SUBMITTED` hoặc `PENDING_REVIEW`, đồng thời `run.settings.showAnswers = true`. Lượt đang làm, hết hạn chưa nộp hoặc đề ẩn đáp án đều bị chặn ở backend, kể cả gọi API trực tiếp.
- Đây là quyền xem đáp án theo snapshot của lượt thi. Bật tính năng xem đáp án cũng cho phép xem giải thích AI dù Student còn lượt thi khác, giống quy tắc Exam Builder hiện có.
- Hỗ trợ 8 dạng câu hỏi bằng văn bản. Câu có ảnh không gửi đến AI trong phiên bản này; giao diện hướng dẫn Student hỏi Teacher.
- Short Answer/Essay chờ Teacher chấm vẫn có thể được giải thích theo đáp án/rubric nếu đề cho xem đáp án. Giao diện ghi rõ chưa có điểm cuối cùng; AI không được gán điểm hoặc nói như đã có quyết định chấm chính thức.
- AI chỉ giúp ôn tập. Điểm, nhận xét Teacher, lịch sử chấm và tiến độ không bị thay đổi bởi yêu cầu giải thích.

## Nội dung gửi cho AI

Backend xây dựng ngữ cảnh từ snapshot của lượt thi; frontend không được gửi khóa đáp án, rubric hay điểm thay thế.

- Nội dung, loại câu hỏi, các lựa chọn và đáp án tham chiếu; Matching/Ordering/Fill in the Blank giữ đúng cặp/thứ tự/chỗ trống.
- Câu trả lời đã nộp của Student, điểm hiện tại của câu và nhận xét Teacher.
- Giải thích/rubric có sẵn và các cặp hỏi–đáp thành công trước đó của đúng hội thoại.
- Câu hỏi tiếp theo Student vừa gửi.

Các ID lựa chọn ngẫu nhiên được chuyển thành nhãn và nội dung theo thứ tự thực tế của lượt thi. Vì vậy A/B/C/D trong giải thích ứng với lựa chọn Student đã thấy, kể cả khi đề trộn đáp án. Trang kết quả cũng thể hiện rõ lựa chọn của Student và đáp án đúng.

Request không kèm thông tin tài khoản như tên/email/ID Student. Những gì Student tự viết trong bài làm hoặc câu hỏi tiếp theo vẫn thuộc nội dung gửi cho DeepSeek.

## Hội thoại và kết quả thay đổi

Hội thoại lưu tại `explanationThreads`, tách theo Student + lượt thi + chỉ số câu + hash ngữ cảnh. Hash bao gồm snapshot câu hỏi, bài làm, điểm câu và nhận xét Teacher.

Nếu Teacher chấm/sửa điểm hoặc nhận xét, ngữ cảnh đổi. API từ chối yêu cầu dùng hash cũ bằng `409`; giao diện tải trạng thái mới và cho **Tạo giải thích** dựa trên kết quả hiện tại. Hội thoại cũ được giữ trong database nhưng không trộn vào ngữ cảnh mới hoặc trả như giải thích của kết quả mới.

Worker kiểm tra quyền và hash trước khi gọi AI và một lần nữa trước khi lưu trả lời. Việc thay đổi điểm hay tắt quyền xem trong lúc AI chạy sẽ ngăn công bố câu trả lời cũ. API đọc hội thoại cũng kiểm tra quyền hiện tại trước khi trả dữ liệu.

## Job, thử lại và giới hạn

- Job lưu trạng thái `QUEUED → GENERATING → READY/FAILED`; worker dùng lease 3 phút. Khi backend bị gián đoạn, lượt chờ xử lý trong queue còn được giữ; lượt đang xử lý chuyển sang lỗi sau khi lease hết để Student thử lại.
- Mỗi Student có tối đa một yêu cầu AI đang chờ/đang chạy tại một thời điểm. Các câu hỏi khác có thể tiếp tục khi yêu cầu này kết thúc.
- Mỗi ngữ cảnh có tối đa **8 lượt hỏi**, gồm giải thích đầu tiên. Câu hỏi tiếp theo tối đa **1.000 ký tự**.
- Một lượt lỗi có thể thử lại, tối đa **3 lần xử lý** tính cả lần đầu. Thử lại giữ nguyên nội dung câu hỏi và các lượt trao đổi trước; không tạo thêm lượt hỏi.
- Tối đa **50 yêu cầu/Student trong 24 giờ**, gồm lần xử lý lại; HTTP giới hạn **12 POST/phút**. Mở lại/lấy trạng thái không tạo yêu cầu AI mới.
- `requestId` giúp gửi lại request khi mất phản hồi mà không thêm lượt hoặc gọi AI trùng. `version` ngăn hai tab đồng thời ghi đè/ghép lẫn hội thoại.
- Mất kết nối sau khi gửi: giao diện kiểm tra trạng thái và có nút **Gửi lại yêu cầu** với cùng ID. Khi server xác nhận đã nhận, câu hỏi đã gửi được xóa khỏi ô nhập.
- AI lỗi hoặc output sai định dạng được hiển thị kèm **Thử tạo lại** khi còn lượt xử lý. Hội thoại thành công trước đó vẫn còn. Backend không tự chấp nhận câu trả lời rỗng hoặc cắt ngắn.

## Cấu hình và chất lượng giải thích

Dùng `DEEPSEEK_API_KEY` và `DEEPSEEK_MODEL` đã có trong `backend/.env`. Không thêm biến môi trường/dependency. Không có API key vẫn đọc được hội thoại đã lưu và giải thích Teacher; chỉ việc tạo câu trả lời AI mới bị tắt.

Adapter dùng [JSON Output của DeepSeek](https://api-docs.deepseek.com/guides/json_mode/) và kiểm tra các trường `explanation`, `takeaway`, `practice`, `followUps`, `caveat`. Kết quả được hiển thị dưới dạng văn bản, không thực thi HTML hoặc mã do mô hình trả về.

Prompt yêu cầu xem toàn bộ bài làm, câu hỏi, tài liệu tham chiếu và lịch sử như dữ liệu không đáng tin; chỉ đáp ứng câu hỏi học tập liên quan. Mô hình không có công cụ gọi API, truy cập câu khác, chạy mã hoặc sửa điểm. Hướng dẫn yêu cầu giữ nguyên nhãn đáp án, đối chiếu đúng bài làm và nêu sự không chắc chắn khi tài liệu tham chiếu mâu thuẫn/thiếu thông tin. Kiểm tra cấu trúc không bảo đảm mọi giải thích đều chính xác; Student nên đối chiếu đáp án và hỏi Teacher khi còn thắc mắc.

## API

Prefix: `/api/exams/runs/:runId/questions/:index/explanation`. `index` bắt đầu từ 0; yêu cầu xác thực Student và quyền sở hữu.

- `GET`: trả `{ configured, sourceKey, limits, thread }`. `thread = null` nếu chưa có hội thoại với ngữ cảnh hiện tại. Mỗi thread có version, trạng thái, các lượt hỏi–đáp, thời điểm cập nhật và request ID mới nhất.
- `POST`: body `{ sourceKey, version, requestId, question?, retry? }`. Lần đầu dùng version `0`, có thể bỏ `question` để dùng yêu cầu giải thích mặc định. Hỏi tiếp gửi câu hỏi mới và version hiện tại. Thử lại gửi `retry: true`, không gửi câu hỏi thay thế.
- Thành công mới trả `202`; request ID đã nhận trả `200` với hội thoại hiện tại. ID dùng cho nội dung khác, version/hash cũ hoặc có job đang chạy trả `409`. Hết quyền trả `403/404`; sai cấu hình/giới hạn trả `503/429`.

Không có endpoint thay đổi điểm hoặc nhận nội dung tham chiếu tùy ý từ Student.

## Mã nguồn và kiểm thử

- `backend/src/models/explanation.model.ts`: thread, lượt trao đổi và giới hạn.
- `backend/src/common/explanation-provider.ts`: chính sách điều kiện, hash ngữ cảnh, ánh xạ lựa chọn, prompt và adapter.
- `backend/src/common/explanation-runtime.ts`: worker, lease và kiểm tra lại nguồn/quyền.
- `backend/src/controllers/explanation.controller.ts`: đọc, gửi, retry, revision và quota.
- `frontend/components/exams/question-explanation.tsx`: hội thoại, gợi ý hỏi tiếp, phục hồi và trạng thái lỗi.
- `frontend/components/exams/exam-result.tsx`: nút Explain with AI, lựa chọn Student/đáp án đúng trên kết quả.
- `backend/test/explanations.test.ts`: RBAC, quyền xem đáp án, hội thoại, nhãn đã trộn, retry/idempotency, concurrent requests, quota/giới hạn, lease, nguồn/quyền thay đổi và output AI không hợp lệ.

Kiểm tra bằng `npm test` ở backend, `npm run lint` và `npm run build` ở frontend. Test dùng MongoDB tạm và AI giả lập, không sửa Atlas hoặc gọi API tính phí. Luồng trình duyệt đã kiểm tra ở desktop/mobile, gồm hỏi tiếp, refresh, mất phản hồi, AI lỗi, kết quả chấm lại, câu chờ chấm và đề ẩn đáp án.
