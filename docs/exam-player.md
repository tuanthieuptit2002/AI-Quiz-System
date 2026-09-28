# Exam Player — giao diện thi

## Sử dụng

1. Teacher phát hành đề từ Exam Builder, cấu hình lịch, thời lượng, đối tượng và quyền điều hướng.
2. Student vào **Bài thi của tôi** (`/exams`), nhập mã truy cập nếu đề yêu cầu, chọn **Bắt đầu** hoặc tiếp tục lượt đang làm.
3. Phòng thi mở tại `/exam/[runId]`, có giao diện riêng, phù hợp desktop và mobile.
4. Chọn **Nộp bài**, kiểm tra số câu chưa trả lời/đã đánh dấu rồi xác nhận. Kết quả và đáp án hiển thị theo cấu hình đề; tự luận có thể chờ Teacher chấm.

Không cần thêm biến môi trường hoặc dependency. Dùng phiên đăng nhập, MongoDB và Exam Builder hiện có.

## Câu hỏi và điều hướng

- Hỗ trợ Single Choice, Multiple Choice, True/False, Fill in the Blank, Short Answer, Essay, Matching và Ordering; giữ hình ảnh của câu hỏi.
- **Đánh dấu câu** chỉ là lời nhắc, không ảnh hưởng điểm. Câu đã đánh dấu vẫn có thể thuộc nhóm đã trả lời hoặc chưa trả lời.
- Sidebar có bảng số câu, tiến độ, thống kê và bộ lọc **Tất cả / Chưa trả lời / Đánh dấu**. Mobile có nút mở/thu gọn bảng câu hỏi.
- Fill in the Blank, Matching và Ordering chỉ được tính là đã trả lời khi điền đủ các mục. Nội dung chỉ có khoảng trắng được xem là chưa trả lời. Trạng thái này không tiết lộ đáp án đúng.
- Đề cho phép quay lại: chuyển câu bằng **Câu trước**, **Câu tiếp** hoặc sidebar, kể cả khi mạng gián đoạn.
- Đề không cho quay lại: chỉ xem/sửa câu hiện tại; **Câu tiếp** cần máy chủ xác nhận. Backend không gửi nội dung câu trước/câu tương lai và chặn việc sửa câu đã chuyển.

## Tự lưu và phục hồi

Đáp án và đánh dấu được ghi ngay vào bản nháp `sessionStorage` của tab, tách theo user và lượt thi. Việc đồng bộ có debounce 650 ms, thử lại mỗi 5 giây và khi có mạng hoặc quay lại tab. Request của phòng thi có timeout 12 giây. Giao diện phân biệt **Chờ lưu**, **Đang đồng bộ**, **Đã lưu trên máy chủ** và **Đang chờ kết nối**.

Khi refresh, ứng dụng lấy trạng thái máy chủ rồi đối chiếu bản nháp trước khi gửi các thay đổi còn thiếu. Nếu API xác thực tạm mất kết nối, giao diện chờ kết nối lại và giữ bản nháp. Phiên thật sự hết hạn vẫn yêu cầu đăng nhập lại.

Mỗi yêu cầu lưu có `mutationId` và `revision`. Yêu cầu được giữ trước khi gửi, nên mất phản hồi sau khi máy chủ đã lưu vẫn có thể thử lại với cùng ID. Điều này cũng tránh chuyển câu hai lần trên đề thi tuần tự. Ghi dữ liệu dùng điều kiện revision và deadline tại MongoDB; cập nhật cũ không âm thầm ghi đè cập nhật mới.

Nếu một tab/thiết bị khác thay đổi cùng đáp án, giao diện yêu cầu Student chọn **Dùng bản trên máy chủ** hoặc **Giữ đáp án trên máy này** trước khi nộp. Thay đổi ở các câu khác nhau được đối chiếu và đồng bộ. Nếu câu đã bị khóa do chuyển tiếp trên thiết bị khác, chỉ có thể chấp nhận bản máy chủ.

### Phạm vi phục hồi

- Bản nháp giữ đáp án chưa đồng bộ, đánh dấu, vị trí và yêu cầu đang chờ; không lưu token, nội dung câu hỏi hoặc đáp án đúng vào cache này.
- Refresh cùng tab và mất mạng ngắn hạn được hỗ trợ. Đóng tab có thể mất các thay đổi chưa tới máy chủ. Phần đã lưu trên máy chủ có thể tiếp tục qua **Bài thi của tôi**.
- Khi hoàn toàn offline, không đảm bảo tải lại được toàn bộ ứng dụng hoặc mở phòng thi lần đầu. Nếu ứng dụng tải được nhưng API chưa sẵn sàng, bản nháp được giữ để phục hồi sau khi có mạng.
- Nếu trình duyệt chặn hoặc hết dung lượng lưu trữ, giao diện thông báo rõ: giữ trang mở và đợi lưu lên máy chủ trước khi refresh.
- Khi lượt thi kết thúc hoặc đăng xuất thành công, bản nháp liên quan được xóa khỏi tab.

## Đồng hồ và nộp bài

Đồng hồ căn theo `serverTime` và `expiresAt`, tính cả thời gian máy ngủ hoặc tab chạy nền. Refresh không tạo thêm thời gian. Khi đồng hồ về 0, không cho sửa tiếp; máy chủ xác nhận trạng thái kết thúc.

- **Tự nộp bật:** máy chủ chấm phần đáp án đã nhận, kể cả khi trình duyệt đã đóng.
- **Tự nộp tắt:** lượt chưa nộp chuyển sang hết hạn theo quy tắc Exam Builder.
- Khi nộp chủ động, ứng dụng khóa chỉnh sửa, đồng bộ các thay đổi, kiểm tra xung đột rồi gửi revision cuối cùng. Nếu trạng thái đã thay đổi ở thiết bị khác, máy chủ trả `409` để đối chiếu lại.
- Mất mạng không được báo là nộp thành công. Student thấy thông báo giữ trang mở để kết nối và thử lại.
- **Đáp án chưa đến máy chủ trước deadline không được tính.** Nếu phát hiện bản nháp khác kết quả đã kết thúc, giao diện cho biết số câu chưa kịp đồng bộ. Thời gian trên máy học sinh không được dùng để gia hạn lượt thi.

## API và mã nguồn

Giữ các endpoint của Exam Builder, bổ sung tương thích với lượt thi cũ:

- `GET /api/exams/runs/:id`: thêm `flagged` và `lastMutationId`. `?lean=1` bỏ nội dung câu hỏi khi lượt đang chạy và cho phép quay lại; lần tải đầu vẫn dùng bản đầy đủ.
- `PATCH /api/exams/runs/:id`: thêm `flagged?: boolean`, `mutationId?: UUID`. Giữ `revision`, `index`, `response`, `nextIndex`. Request gửi lại với mutation ID mới nhất được trả về trạng thái đã lưu.
- `POST /api/exams/runs/:id/submit`: nhận `revision?: number`; revision cũ trả `409` nếu lượt chưa hết hạn. Nộp lại lượt đã kết thúc không tạo thêm kết quả.
- Lượt thi cũ chưa có `flagged` mặc định tất cả là `false`. Backend vẫn kiểm tra Student sở hữu lượt thi; frontend không quyết định quyền hoặc điểm.

Các file chính:

- `frontend/app/exam/[runId]/page.tsx`: route phòng thi.
- `frontend/components/exams/exam-room.tsx`: xác thực và tải lượt thi.
- `frontend/components/exams/exam-player.tsx`, `frontend/app/exam-player.css`: giao diện và xác nhận nộp/rời bài.
- `frontend/lib/exam-session.ts`: bản nháp, hàng đợi lưu, đối chiếu và đồng hồ.
- `frontend/components/exams/use-exam-session.ts`: kết nối React, API và chu kỳ đồng bộ.
- `backend/src/controllers/exam-taking.controller.ts`, `backend/src/common/exam-runtime.ts`: quyền truy cập, lưu có revision, deadline và kết thúc lượt thi.

## Kiểm tra

Chạy toàn bộ backend bằng `cd backend && npm test`. Test dùng MongoDB tạm, không sửa dữ liệu Atlas.

- `backend/test/exam-session.test.ts`: phục hồi bản nháp, chỉnh sửa trong lúc request chạy, mất mạng, mất phản hồi, xung đột giữa các thiết bị, điều hướng tuần tự, đồng hồ sau sleep, lưu trữ bị chặn và dọn cache.
- `backend/test/exam-player.test.ts`: lưu đánh dấu, tương thích lượt cũ, RBAC, request thử lại, revision, nộp lặp, deadline và bộ đếm hoàn thành.
- Kiểm tra trình duyệt desktop/mobile với 50 câu, đủ 8 dạng: mở phòng thi, refresh, mất mạng rồi kết nối lại, mất phản hồi sau lưu, xung đột, xác nhận nộp, quyền sở hữu và tự kết thúc khi hết giờ.
