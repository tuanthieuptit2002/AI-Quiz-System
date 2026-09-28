# Personalized Quiz — luyện tập theo chỗ còn yếu

## Sử dụng

1. Student mở **Phân tích học tập** và bấm **Practice Weak Topics**, hoặc chọn **Luyện tập cá nhân** trong menu.
2. Xem phân bổ trước khi bắt đầu. Chủ đề điểm thấp hơn nhận nhiều câu hơn, mỗi chủ đề từ 5 đến 10 câu.
3. Làm từng câu. Sau khi nộp, hệ thống báo đúng/sai, giải thích, và độ khó của câu tiếp theo trong cùng chủ đề.
4. Hết quiz hoặc bấm **Kết thúc sớm**. Màn hình kết quả dẫn tới đề đã được điều chỉnh.

Đề luyện không tạo `examRuns` hay `examAttempts`, nên không đổi điểm bài thi, tiến độ hay báo cáo phân tích chính thức.

## Cách xếp số câu

Chỉ lấy chủ đề đã đủ mẫu và đang ở mức **Ưu tiên ôn** hoặc **Cần củng cố**, tối đa 4 chủ đề, chủ đề thấp điểm đứng trước.

| Số chủ đề | Tổng câu |
| --------- | -------- |
| 1         | 10       |
| 2         | 20       |
| 3 hoặc 4  | 25       |

Mỗi chủ đề nhận sẵn 5 câu. Số câu còn lại được đưa cho chủ đề **Ưu tiên ôn** trước, theo độ hụt điểm, tối đa 10 câu/chủ đề. Chủ đề **Cần củng cố** chỉ nhận phần dư.

Vì vậy Redis 40%, Kafka 42% và Spring Boot 70% ra **10 / 10 / 5**. Hai chủ đề yếu hấp thụ hết 10 câu dư và chạm trần 10; Spring Boot giữ 5 câu.

Độ khó bắt đầu theo điểm đang dùng để xếp đề:

- dưới 45%: Dễ
- từ 45% đến dưới 60%: Trung bình
- từ 60% đến dưới 80%: Khó
- từ 80%: không còn trong quiz luyện này

## Adaptive testing

Độ khó của từng chủ đề đi riêng: Dễ → Trung bình → Khó → Rất khó.

- Đúng: câu sau của chủ đề đó tăng một mức. Đang ở Rất khó thì giữ nguyên.
- Sai: giảm một mức. Đang ở Dễ thì giữ nguyên.

Các chủ đề được xen kẽ theo tỷ lệ câu đã phát, nên học sinh không làm liền 10 câu Redis rồi mới tới Kafka. Một câu Redis đúng không làm câu Kafka khó hơn.

Nếu ngân hàng không có đúng mức đang cần, hệ thống lấy mức gần hơn, ưu tiên câu dễ hơn, rồi mới lấy câu khó hơn. Bước tiếp theo tính trên độ khó của câu thực tế vừa làm.

## Câu hỏi lấy từ đâu?

1. Câu **Sẵn sàng** trong Question Bank, cùng môn và đúng cả đường dẫn chủ đề, thuộc 6 dạng chấm ngay. Câu nháp, lưu trữ, tự luận và trả lời ngắn không dùng.
2. Khi chủ đề đã hết câu chưa làm, DeepSeek tạo một câu trắc nghiệm một đáp án. Câu này chỉ nằm trong phiên luyện, không vào Question Bank và không chờ Teacher duyệt.

Đáp án và giải thích chỉ trả về sau khi nộp câu đó. Làm mới trang khi đang có câu mở sẽ gặp lại câu đó, không tạo câu thứ hai.

## Đề sau được điều chỉnh thế nào?

Mỗi câu luyện đã nộp cộng `1` điểm tối đa vào đúng `topicId` của phân tích. Điểm dùng để xếp đề là tổng điểm bài thi đã chấm và điểm luyện, cùng công thức % và cùng ngưỡng 60/80.

- Làm tốt có thể đưa chủ đề từ ưu tiên ôn lên cần củng cố: ít câu dư hơn và bắt đầu khó hơn.
- Đạt từ 80% với đủ mẫu thì chủ đề rời quiz kế tiếp.
- Làm chưa tốt giữ chủ đề ở nhóm nhiều câu và độ khó thấp.

Phân tích học tập vẫn chỉ đọc bài thi đã chấm. Hai màn hình cố ý không trộn số: phân tích là kết quả chính thức, quiz là kế hoạch luyện.

## Giới hạn

- 6 phiên mới mỗi Student trong 24 giờ. Mở lại phiên đang làm không tính thêm.
- 40 câu AI mỗi Student trong 24 giờ.
- Một phiên đang làm cho mỗi Student.
- HTTP: 10 lần tạo phiên, 60 lần nộp/lấy câu và 20 lần kết thúc mỗi phút.

Chưa cấu hình `DEEPSEEK_API_KEY` vẫn luyện được bằng câu Sẵn sàng. Hết câu và chưa có AI thì phiên báo lỗi cho chủ đề đó; các câu đã nộp vẫn được giữ khi kết thúc.

## API

Chỉ role STUDENT. Không nhận `studentId` từ client.

- `GET /api/student/practice/plan?range=30|90|all`: phân bổ, cờ đã điều chỉnh, phiên đang làm và kết quả lần luyện gần nhất.
- `GET /api/student/practice/current`: phiên đang làm, hoặc `session: null`.
- `POST /api/student/practice`: `{ range }`. Tạo phiên và câu đầu, hoặc trả phiên đang làm. `201` khi tạo mới.
- `POST /api/student/practice/:id/answer`: `{ itemId, response }`. Chấm ngay và trả hướng đổi độ khó.
- `POST /api/student/practice/:id/next`: lấy câu kế tiếp. Gọi lại khi câu hiện tại chưa nộp thì không tạo thêm câu.
- `POST /api/student/practice/:id/finish`: kết thúc. Câu chưa nộp bị bỏ và không cộng vào lần xếp đề sau.

## Mã nguồn

- `backend/src/common/practice-plan.ts`: phân bổ, trộn điểm luyện, độ khó bắt đầu và bước adaptive.
- `backend/src/common/practice-runtime.ts`: chọn câu, gọi AI khi thiếu, chấm và lưu phiên.
- `backend/src/controllers/practice.controller.ts`, `routes/practice.routes.ts`, `models/practice.model.ts`.
- `frontend/components/practice/practice-studio.tsx`, `frontend/app/practice.css`.
- Nút **Practice Weak Topics** nằm ở `frontend/components/workspace-analysis.tsx`.
- Ô nhập đáp án dùng chung `AnswerInput` của phòng thi.

## Kiểm tra

`backend/test/practice.test.ts` kiểm tra phân bổ 10/10/5, đúng thì khó hơn, sai ở mức Dễ thì giữ Dễ, đề sau loại chủ đề đã vững, đáp án không lộ trước khi nộp, học sinh khác và Teacher không vào phiên, câu AI không vào ngân hàng, và không phát sinh `examAttempts`.
