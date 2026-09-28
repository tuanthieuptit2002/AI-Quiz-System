# AI Learning Analysis — phân tích học tập và đề xuất ôn tập

## Sử dụng

1. Student chọn **Phân tích học tập** trong menu, tại `/learning-analysis`. Có liên kết từ **Tiến độ học** và kết quả thi đã chấm xong.
2. Chọn **30 ngày qua**, **90 ngày qua** (mặc định) hoặc **Tất cả thời gian**.
3. Xem điểm tổng hợp, số đề/câu được phân tích, bản đồ kiến thức **Theo chủ đề / Theo môn**, lọc môn và xem các kết quả gần đây.
4. Khi đủ dữ liệu, bấm **Phân tích với AI** để nhận nhận xét, điểm mạnh và danh sách ưu tiên ôn: lý do, các bước học, thời lượng gợi ý và bài tập tự kiểm tra.
5. Báo cáo được lưu để mở lại sau refresh/rời trang. Có thể **Thử phân tích lại** khi AI gặp lỗi. Không tự gọi AI khi mở trang.

Dùng `DEEPSEEK_API_KEY` và `DEEPSEEK_MODEL` hiện có ở backend. Không cần thêm dependency hoặc biến môi trường. Khi chưa cấu hình AI, số liệu và báo cáo đã lưu vẫn xem được.

## Dữ liệu và công thức

- Nguồn là `examRuns` của đúng Student, chỉ trạng thái `SUBMITTED` (đã chấm đủ), có thời điểm nộp và `settings.showAnswers = true`. Bài đang làm, hết hạn không nộp, chờ Teacher chấm hoặc ẩn điểm từng câu không được đưa vào phân tích.
- Với mỗi đề, lấy **lần thi đã chấm gần nhất trong khoảng đã chọn**, không lấy điểm cao nhất, không cộng tất cả lần làm lại. Nếu lượt mới nhất đã chấm ẩn điểm thì loại đề đó, không dùng lượt cũ để thay thế. Lượt đang chờ chấm không thay thế lượt đã chấm trước đó.
- Tối đa **200 đề gần nhất**, tính cả đề bị loại do ẩn điểm. UI ghi rõ nếu chạm giới hạn, số lượt đang chờ chấm và số đề ẩn điểm. Bộ lọc ngày tính từ 00:00 UTC của ngày đầu tiên, bao gồm hôm nay; không nhận ngày nộp trong tương lai.
- **Điểm % = tổng điểm đạt / tổng điểm tối đa × 100.** Ví dụ câu 3 điểm được 1,5 và câu 1 điểm được 1 cho kết quả 62,5%, không phải trung bình số câu đúng. Điểm một phần của bài viết dùng quyết định cuối cùng của Teacher, không dùng điểm AI đề xuất.
- Tám loại câu hỏi đều dùng điểm chính thức đã lưu. Câu có điểm thiếu, không hữu hạn, âm, lớn hơn điểm tối đa hoặc điểm tối đa không dương bị loại và ghi số lượng trong phạm vi dữ liệu; không âm thầm coi câu chưa chấm là sai.
- Điểm môn/chủ đề cũng tính theo trọng số này. Chuẩn hóa Unicode, khoảng trắng và chữ hoa/thường khi nhóm tên. Chủ đề được xác định bằng **môn + toàn bộ đường dẫn**; `Redis / Configuration` và `Kafka / Configuration` là hai nhóm khác nhau.
- Chỉ phân loại khi có ít nhất **5 câu từ 2 đề khác nhau**: dưới 60% là **Ưu tiên ôn**, 60 đến dưới 80% là **Cần củng cố**, từ 80% là **Điểm mạnh**. Nếu ít mẫu, vẫn hiển thị điểm nhưng ghi **Cần thêm dữ liệu**, không gửi chủ đề đó cho AI.
- Biểu đồ hiển thị tối đa 10 kết quả được chọn theo thời gian. Đề có thể khác độ khó; đây không phải phép đo chuẩn hóa về năng lực hay bằng chứng chắc chắn rằng Student đang tiến bộ/sa sút.

Trang này khác **Tiến độ học** cũ: tiến độ vẫn tính mọi lượt đã chấm từ `examAttempts` trên thang 10, trong khi phân tích dùng lần đã chấm gần nhất mỗi đề và điểm từng câu trên thang phần trăm.

## Phân loại câu hỏi và bài thi cũ

Từ tính năng này, khi bắt đầu lượt thi, `deliverQuestions` lưu `classification: { subject, topicPath, difficulty }` cùng từng câu đã phát. Thông tin vẫn gắn đúng câu khi trộn thứ tự; sửa ngân hàng hoặc đề gốc không đổi lịch sử phân loại của bài làm.

Lượt thi được tạo trước tính năng này chưa có thông tin đó. Các câu này chỉ đóng góp vào điểm môn theo `run.subject`; không đoán chủ đề từ ngân hàng hiện tại vì câu đã phát có thể khác phiên bản hoặc thứ tự. Trang hiển thị số câu chưa có chủ đề. Không tự sửa hoặc backfill dữ liệu cũ; bài mới sẽ có thống kê chủ đề chi tiết.

Metadata phục vụ phân tích chỉ giữ ở backend, không bổ sung khóa ngân hàng hoặc đáp án vào payload phòng thi.

## AI dựa trên bằng chứng nào?

Backend gửi tối đa **20 chủ đề đủ mẫu**, ưu tiên điểm thấp trước. Mỗi chủ đề có ID nội bộ của nhóm, môn, đường dẫn, số câu, số đề, điểm đạt/tối đa, phần trăm và mức phân loại. Gửi kèm khoảng thời gian, số đề/câu tổng hợp và số nhóm bị loại do ít mẫu.

Không gửi tên/email/ID tài khoản, nội dung câu hỏi, đáp án, bài làm hay nhận xét riêng của Teacher. Tên môn/chủ đề là nội dung do người dùng nhập, vẫn được gửi như dữ liệu. Prompt yêu cầu không làm theo chỉ dẫn chèn trong tên, không gọi công cụ/URL, không suy đoán tính cách, nguyên nhân mắc lỗi hay chủ đề chưa có bằng chứng.

AI trả nhận xét và đề xuất, không tính lại điểm. `topicId` trong đề xuất phải thuộc các nhóm được gửi; phần điểm mạnh chỉ chấp nhận nhóm có mức `STRONG`, không cho trùng chủ đề trong cùng danh sách. Giới hạn độ dài, số đề xuất, số bước và thời lượng được kiểm tra ở adapter và trước khi lưu. Giao diện lấy phần trăm/số câu/số đề trực tiếp từ thống kê backend cạnh mỗi đề xuất, không dùng số liệu do AI tự viết.

Ví dụ dữ liệu có `Redis / Cache Strategy` 43% và `Kafka / Consumer Group` 39% với đủ mẫu thì AI có thể khuyến nghị ôn hai chủ đề này. Nếu chỉ có tên `Redis` mà chưa có nhánh `Cache Strategy`, hệ thống không tự khẳng định học sinh yếu ở nhánh chưa được đo. Với tất cả chủ đề đều mạnh, AI được hướng dẫn đề xuất duy trì và luyện tập nâng cao.

Gợi ý là hỗ trợ học tập; kiểm tra cấu trúc không bảo đảm mọi nhận xét hoặc bài tập AI đều đúng. Không có thao tác ghi vào điểm, lịch sử chấm hoặc ngân hàng câu hỏi.

## Lưu báo cáo, thay đổi điểm và phục hồi

- `learningReports` lưu snapshot thống kê, hash nguồn, model, trạng thái, nội dung AI, lịch sử request và lease. Tách theo Student + khoảng thời gian + hash dữ liệu.
- Cùng dữ liệu đã có báo cáo thì trả lại bản đã lưu, không gọi AI lần nữa. Hash thay đổi khi có bài mới, điểm chính thức/phân loại/phạm vi nguồn thay đổi; báo cáo cũ được giữ trong DB nhưng không hiển thị như phân tích hiện tại.
- Worker kiểm tra tài khoản còn ACTIVE/STUDENT và hash hiện tại **trước/sau** gọi AI. Điểm/quyền thay đổi khi đang chạy sẽ ngăn công bố báo cáo cũ. Giao diện tải lại khi mở trang, trở lại tab hoặc có mạng; báo cáo đang chạy được kiểm tra mỗi 2,5 giây.
- Trạng thái `QUEUED → GENERATING → READY/FAILED`. Claim nguyên tử và lease 3 phút ngăn worker ghi đè nhau. Job đang xử lý bị gián đoạn sẽ chuyển lỗi khi lease hết; kết quả trả muộn không được ghi đè lần mới.
- Tối đa một job đang chờ/chạy cho mỗi Student, **10 yêu cầu/24 giờ**, tối đa **3 lần xử lý cho một snapshot** (gồm lần đầu), HTTP giới hạn 10 POST/phút. Mở lại báo cáo không tính lượt gọi AI.
- POST có `requestId` UUID, giúp gửi lại khi mất phản hồi mà không gọi trùng. Hai tab tạo cùng báo cáo sẽ nhận cùng job; thử lại lỗi cần `retry: true` và ID mới. Retry của cùng ID đã nhận không tăng số lần xử lý.
- API lỗi/AI không đúng cấu trúc không xóa thống kê. Không có khóa AI vẫn xem số liệu được. Đổi khoảng thời gian tải tập dữ liệu riêng, không lẫn báo cáo giữa các khoảng.

## API và mã nguồn

Yêu cầu xác thực role STUDENT; không nhận `studentId` từ client.

- `GET /api/student/learning-analysis?range=30|90|all`: `{ snapshot, configured, eligible, limits, report }`. `report` chỉ ứng với hash nguồn hiện tại, nếu chưa có trả `null`.
- `POST /api/student/learning-analysis`: `{ range, sourceKey, requestId, retry? }`. `sourceKey` lấy từ GET. Trả `202` khi đưa vào queue, `200` khi trả job/báo cáo đã có, `409` cho dữ liệu cũ/yêu cầu xung đột, `400` nếu chưa đủ mẫu, `429` khi vượt giới hạn, `503` nếu chưa cấu hình AI.
- Hash do backend tính; frontend không được gửi điểm, phân loại hay nội dung AI thay thế.

Các file chính:

- `backend/src/common/learning-analysis.ts`: chọn lượt thi, tổng hợp điểm, phân loại và hash nguồn.
- `backend/src/common/learning-provider.ts`: dữ liệu gửi DeepSeek, prompt, kiểm tra output.
- `backend/src/common/learning-runtime.ts`: worker, lease, kiểm tra lại quyền/nguồn.
- `backend/src/controllers/learning.controller.ts`, `routes/learning.routes.ts`, `models/learning.model.ts`: API, quota, cache và lưu báo cáo.
- `frontend/components/workspace-analysis.tsx`, `learning/use-learning-analysis.ts`: giao diện, bộ lọc, trạng thái và phục hồi.
- `frontend/app/learning-analysis.css`: giao diện desktop/mobile.
- `backend/test/learning.test.ts`: trọng số, phân loại, ít mẫu, metadata đã trộn, giới hạn thời gian, thi lại, bài cũ, đề ẩn/chờ chấm, RBAC, cache, concurrency, retry, quota, regrade, lease và output AI sai.

## Kiểm tra

Chạy `npm test` và `npm run build` trong backend; `npm run lint` và `npm run build` trong frontend; `npm run format:check` ở thư mục gốc.

Test dùng MongoDB tạm, AI giả lập; không sửa Atlas hoặc gọi DeepSeek tính phí. Kiểm thử trình duyệt dùng API tạm để kiểm tra lọc môn/thời gian, điểm từng chủ đề, kế hoạch AI, mất phản hồi, refresh, sửa điểm, thử lại lỗi và bố cục desktop/mobile.
