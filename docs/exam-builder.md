# Exam Builder

Trang `/exams` có giao diện riêng theo vai trò. Admin quản lý toàn bộ đề và bài làm; Teacher quản lý đề của mình; Student xem đề được phép thi và các lượt thi của mình. Dữ liệu nằm trong `exams`, `examRuns`; kết quả chấm xong được đồng bộ sang `examAttempts`.

## Teacher: tạo và phát hành

1. Chuẩn bị câu hỏi có trạng thái **Sẵn sàng** trong Question Bank. Chọn độ khó Dễ, Trung bình, Khó hoặc Rất khó.
2. Chọn **Tạo đề thi**, nhập tên, môn học và hướng dẫn.
3. **Thủ công:** chọn câu hỏi trong ngân hàng của mình, sắp xếp và đặt điểm. **Tự động:** nhập số lượng từng độ khó, có thể giới hạn chủ đề, rồi bấm **Random câu hỏi**.
4. Cấu hình lịch, thời lượng, lượt thi, điểm đạt và thiết lập làm bài.
5. Chọn lớp/học sinh hoặc tất cả Student; đặt mã truy cập nếu cần.
6. Lưu bản nháp, mở đề để xem trước, sau đó **Phát hành đề**.

Ví dụ `Java Backend Test`: 20 Easy, 15 Medium, 10 Hard, 5 Very Hard; 60 phút; điểm đạt 70%. Backend lấy đủ 50 câu, không trùng ID. Nếu thiếu câu ở một độ khó, thao tác random thất bại và báo số cần/số đang có; không tự lấy bù từ độ khó khác.

Random khi tạo đề chọn một **tập câu hỏi cố định**. Thiết lập trộn câu khi thi chỉ thay đổi thứ tự cho mỗi lượt, không lấy lại một tập khác từ ngân hàng. Teacher có thể random lại bản nháp để thay tập câu hỏi. Ghép cặp và sắp xếp luôn trộn các mục trình bày để tránh lộ thứ tự đúng; cờ trộn đáp án điều khiển các dạng trắc nghiệm còn lại.

Giới hạn mỗi đề: 100 câu, 10 MB nội dung snapshot gồm ảnh, 1–100 điểm nguyên/câu, thời lượng 1–480 phút, 1–20 lượt/học sinh. Mỗi đề chỉ dùng một môn học. Ngân hàng của Teacher khác không được dùng; Admin có thể dùng toàn bộ.

## Snapshot và vòng đời

Đề chứa bản sao nội dung cùng ID và phiên bản câu hỏi nguồn. Sau khi lưu đề, sửa/lưu trữ câu hỏi trong Question Bank không thay đổi snapshot của đề. Khi thêm một câu mới vào bản nháp, backend kiểm tra lại trạng thái, quyền sở hữu và phiên bản nguồn.

Chỉ bản nháp được sửa; cập nhật dùng số phiên bản để phát hiện hai tab sửa đồng thời. Đề đã phát hành khóa nội dung và thiết lập, bảo đảm mọi lượt thi dùng cùng nội dung gốc. Muốn thay đổi, nhân bản thành đề mới. Bản sao giữ câu hỏi, bỏ mã truy cập, lịch và đối tượng; cần chọn lại trước khi phát hành.

Lưu trữ chặn lượt thi mới, giữ bài làm và cho phép lượt đang chạy hoàn thành đến hạn. Không xóa kết quả đã có.

Khôi phục đưa đề lưu trữ về trạng thái trước khi lưu trữ. Đề đã có bài làm hoặc đang được giao cho lớp luôn trở lại **Đã phát hành** để nội dung vẫn bị khóa; đề lưu trữ trước khi có chức năng này mà chưa được dùng sẽ trở lại **Bản nháp**.

Chỉ bản nháp được xóa vĩnh viễn. Đề đã phát hành hoặc lưu trữ không xóa được để giữ bài làm và kết quả.

## Lịch thi và quyền truy cập

- Giờ nhập/hiển thị theo múi giờ thiết bị; API lưu UTC. Có thể bỏ trống giờ mở/đóng. Nếu có cả hai thì giờ đóng phải sau giờ mở.
- Deadline của lượt thi là thời điểm sớm hơn giữa `bắt đầu lượt + duration` và giờ đóng đề. Không chấp nhận câu trả lời đến sau deadline.
- Đối tượng giới hạn áp dụng **OR**: học sinh được chọn trực tiếp hoặc đang thuộc ít nhất một lớp được chọn. Teacher chỉ chọn lớp và học sinh của mình; Admin chọn toàn bộ. Tư cách thành viên được kiểm tra tại thời điểm bắt đầu.
- Cần đăng nhập role Student; mã truy cập không thay thế kiểm tra tài khoản/lớp. Mã 4–72 byte được hash bằng bcrypt, không trả hash hoặc mã qua API. Giới hạn thử bắt đầu/nhập mã là 30 lần/15 phút/tài khoản.
- Mỗi lượt đã bắt đầu tính vào số lượt, kể cả lượt hết hạn chưa nộp. Bắt đầu đồng thời ở nhiều tab trả cùng lượt đang chạy. Tiếp tục lượt cũ không trừ thêm lượt.

## Student: làm và nộp bài

Chọn bài thi, đọc hướng dẫn, nhập mã nếu có rồi xác nhận bắt đầu. Câu trả lời tự lưu sau khoảng 650 ms ngừng nhập, khi chuyển câu, nộp hoặc chọn lưu & rời bài. Kiểm tra trạng thái **Đã lưu trên server**; dữ liệu chưa đến server khi mất mạng/hết giờ sẽ không được tính.

Đồng hồ dựa trên thời gian server, không gia hạn khi tải lại trang hoặc đóng trình duyệt. Khi quay lại `/exams`, chọn **Tiếp tục làm**. Nếu tắt quay lại câu trước, server chỉ cấp nội dung câu hiện tại và chặn API chuyển lùi/bỏ qua câu. Có thể nộp sớm; câu bỏ trống được 0 điểm.

- Bật **Tự nộp:** server chấm phần đã lưu khi hết hạn. Worker trong server kiểm tra mỗi 5 giây, xử lý tối đa 100 lượt/lần; đọc/ghi lượt thi cũng kiểm tra deadline. Server khởi động lại sẽ xử lý các lượt quá hạn từ dữ liệu MongoDB.
- Tắt **Tự nộp:** quá hạn khi chưa nộp chuyển thành `EXPIRED`, không có điểm và không thể nộp muộn; vẫn tính một lượt.
- Bật **Xem đáp án sau nộp:** hiển thị đáp án, giải thích, rubric và điểm từng câu sau nộp, kể cả bài còn chờ chấm tự luận hoặc học sinh còn lượt thi khác. Tắt thì chỉ xem câu trả lời của mình và tổng điểm sau khi hoàn tất chấm; đáp án và điểm từng câu không được trả về.
- Ghép cặp chọn vế phải cho từng vế trái. Sắp xếp dùng nút lên/xuống; nếu thứ tự ban đầu đã đúng, bấm **Xác nhận thứ tự**.
- Cập nhật bài làm dùng revision để ngăn tab cũ ghi đè. Khi báo xung đột, tải lại bản đã lưu trên server trước khi tiếp tục.

## Chấm điểm

Câu một/nhiều lựa chọn, đúng/sai, ghép cặp, sắp xếp và điền từ chấm toàn bộ đúng mới được đủ điểm, không có điểm thành phần. Điền từ chuẩn hóa Unicode NFKC, bỏ khoảng trắng đầu/cuối, gộp khoảng trắng và không phân biệt hoa/thường; không loại bỏ dấu tiếng Việt.

Từ module Auto Grading, tự luận và trả lời ngắn có nội dung chuyển thành **Chờ Teacher chấm**; bài trống được 0. Teacher mở **Bài làm → Xem/chấm**, nhập điểm không vượt điểm câu và nhận xét, có thể tham khảo AI trước khi xác nhận. Trả lời ngắn dùng các đáp án đã khai báo làm tham chiếu để Teacher đánh giá cách diễn đạt tương đương. Chỉ khi mọi câu đã chấm mới có tổng điểm chính thức và kết quả đạt/chưa đạt. Những lượt đã chấm trước khi cập nhật vẫn giữ điểm cũ cho đến khi Teacher chủ động sửa.

Điểm phần trăm = tổng điểm đạt / tổng điểm tối đa × 100. So sánh với ngưỡng pass score; lịch sử/tiến độ hiển thị điểm quy đổi thang 10. Nộp lại request không tạo kết quả trùng; sửa điểm tự luận cập nhật cùng kết quả.

Chi tiết đề xuất AI, lịch sử xác nhận và API mở rộng: [Auto Grading](auto-grading.md).

## API

Admin/Teacher:

```text
GET    /api/exams                         Danh sách: search, status, page (12/trang)
GET    /api/exams/audience                Lớp và học sinh được phép chọn
POST   /api/exams/generate                { subject, topic?, counts: { EASY, MEDIUM, HARD, VERY_HARD } }
POST   /api/exams                         Tạo bản nháp
GET    /api/exams/:id                     Chi tiết và snapshot
PUT    /api/exams/:id                     { version, content }
DELETE /api/exams/:id                     Xóa bản nháp
POST   /api/exams/:id/publish             { version }
POST   /api/exams/:id/archive             { version }
POST   /api/exams/:id/restore             { version } Khôi phục đề lưu trữ
POST   /api/exams/:id/duplicate           Nhân bản
GET    /api/exams/:id/submissions         Bài làm, page (20/trang)
GET    /api/exams/:id/submissions/:runId   Xem bài làm
POST   /api/exams/:id/submissions/:runId/grade
       { revision, grades: [{ index, points, feedback? }] }
```

Nội dung tạo/sửa: `title`, `description`, `subject`, `mode`, `blueprint`, `topic`, `selections: [{ questionId, version, points }]`, `settings`, `passwordAction: KEEP | SET | REMOVE`, `password`. Frontend không gửi snapshot hoặc hash tùy ý.

Student:

```text
GET    /api/exams/student
POST   /api/exams/student/:id/start       { password? }
GET    /api/exams/runs/:runId
PATCH  /api/exams/runs/:runId             { revision, index, response: string[], nextIndex? }
POST   /api/exams/runs/:runId/submit
```

`response` chứa ID lựa chọn của lượt thi; ghép cặp chứa ID các vế phải theo thứ tự vế trái; sắp xếp chứa ID theo thứ tự; điền từ chứa chuỗi theo thứ tự chỗ trống; trả lời ngắn/tự luận chứa một chuỗi. Server sinh ID ngẫu nhiên cho các lựa chọn và giữ khóa đáp án riêng.

Không có endpoint cho Student gửi điểm. Cần MongoDB Atlas hoặc replica set để tuần tự hóa việc cấp lượt và lưu kết quả bằng transaction. Tham khảo [MongoDB transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/) và [MongoDB $sample](https://www.mongodb.com/docs/manual/reference/operator/aggregation/sample/).

## Kiểm tra

Chạy `npm test` trong backend. Các test dùng MongoDB replica set tạm, không ghi dữ liệu Atlas; bao gồm chọn câu/random, Very Hard, quyền sở hữu, snapshot, lịch thi, password, bắt đầu/nộp đồng thời, deadline, điều hướng, 8 dạng chấm, tự luận và đồng bộ tiến độ.
