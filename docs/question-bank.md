# Ngân hàng câu hỏi

Trang `/questions` dành cho Admin và Teacher. Teacher chỉ thấy/sửa/xuất câu hỏi do mình tạo, kể cả câu hỏi nhập từ file. Admin quản lý tất cả. Student bị chặn tại API để không lộ đáp án.

## Soạn câu hỏi

1. Chọn **Tạo câu hỏi** và một trong 8 dạng.
2. Nhập môn học, chủ đề, độ khó và trạng thái. Chủ đề phân cấp bằng `/`, ví dụ `Java Core / OOP` trong môn `Java`, tối đa 5 cấp.
3. Nhập nội dung, đáp án và giải thích. Có thể thêm ảnh PNG/JPG/WebP tối đa 500 KB, kèm mô tả ảnh.
4. Dùng bản xem trước để kiểm tra cách trình bày và lưu câu hỏi.

Trạng thái **Bản nháp**, **Sẵn sàng**, **Đã lưu trữ** giúp tổ chức ngân hàng. Lưu trữ giữ nguyên câu hỏi và lịch sử. Nhân bản tạo câu hỏi mới ở trạng thái nháp thuộc người thực hiện.

- **Single Choice:** từ 2–20 lựa chọn, đúng một đáp án.
- **Multiple Choice:** từ 2–20 lựa chọn, ít nhất hai đáp án đúng.
- **True / False:** chọn Đúng hoặc Sai.
- **Fill in the Blank:** viết `{{1}}`, `{{2}}`, … theo thứ tự trong nội dung; mỗi dòng đáp án tương ứng một chỗ trống.
- **Short Answer:** mỗi dòng là một câu trả lời được chấp nhận.
- **Essay:** nhập hướng dẫn chấm/rubric. Dạng này dành cho giáo viên chấm thủ công.
- **Matching:** nhập 2–20 cặp trái/phải đúng; nội dung trong từng cột không trùng nhau.
- **Ordering:** nhập 2–20 mục theo thứ tự đúng, dùng mũi tên để đổi vị trí.

Đây là module biên soạn và quản lý nội dung. Dùng [Exam Builder](exam-builder.md) để chọn câu hỏi Sẵn sàng, tạo đề, giao bài và chấm bài.

## Lịch sử phiên bản

Mỗi lần tạo, sửa, lưu trữ hoặc khôi phục đều ghi snapshot đầy đủ cùng người sửa, thời gian và ghi chú. Chọn biểu tượng lịch sử để xem nội dung từng phiên bản. Khôi phục tạo một phiên bản mới, giữ lại các phiên bản cũ.

Frontend gửi số phiên bản đã mở khi lưu. Nếu câu hỏi đã được sửa ở nơi khác, API trả `409`; tải lại câu hỏi trước khi sửa tiếp để tránh ghi đè.

MongoDB lưu `questions`, `questionVersions`, `questionImports`. Câu hỏi và snapshot được ghi trong cùng transaction; import cũng dùng transaction và chỉ có thể xác nhận thành công một lần. Do đó backend cần **Atlas hoặc MongoDB replica set**, không dùng MongoDB standalone cho module này.

## Nhập / xuất Excel và CSV

Trong **Nhập file**, tải mẫu Excel/CSV có 8 câu hỏi minh họa. Chỉnh sửa file, chọn file và bấm **Kiểm tra file**. Nếu có lỗi, giao diện chỉ rõ dòng lỗi và không lưu câu hỏi. Khi toàn bộ dòng hợp lệ, xác nhận nhập để tạo câu hỏi mới; không cập nhật hay ghi đè câu hỏi cũ.

Giới hạn: 100 câu hỏi, file 8 MB, dữ liệu sau xử lý 6 MB mỗi lần. Bản xem trước hết hạn sau 15 phút; tải file mới sẽ thay bản xem trước trước đó. Với nhiều câu hỏi, chia nhỏ file. Xuất lấy tất cả câu hỏi khớp bộ lọc hiện tại, không chỉ trang đang xem; nếu vượt giới hạn cần lọc hẹp hơn.

Giữ nguyên tên và thứ tự cột:

```text
type,subject,topicPath,difficulty,status,question,options,answers,pairs,rubric,explanation,tags,image,imageAlt
```

- `type`: `SINGLE_CHOICE`, `MULTIPLE_CHOICE`, `TRUE_FALSE`, `FILL_BLANK`, `SHORT_ANSWER`, `ESSAY`, `MATCHING`, `ORDERING`.
- `subject`: tên môn học.
- `topicPath`: mảng JSON, ví dụ `["Java Core","OOP"]`.
- `difficulty`: `EASY`, `MEDIUM`, `HARD`, `VERY_HARD`.
- `status`: `DRAFT`, `READY`, `ARCHIVED`.
- `question`: nội dung văn bản; hỗ trợ nhiều dòng, tiếng Việt và đoạn mã.
- `options`: mảng JSON dạng `[{"id":"a","text":"extends"},{"id":"b","text":"implements"}]`. ID duy nhất, gồm chữ/số/dấu gạch ngang/gạch dưới.
- `answers`: mảng JSON. Trắc nghiệm: ID lựa chọn đúng; sắp xếp: toàn bộ ID theo thứ tự đúng; đúng/sai: `["true"]` hoặc `["false"]`; điền từ: đáp án theo thứ tự; trả lời ngắn: các đáp án được chấp nhận. Tự luận/ghép cặp để `[]`.
- `pairs`: mảng JSON dạng `[{"left":"extends","right":"Kế thừa lớp"},{"left":"implements","right":"Triển khai interface"}]`. Chỉ dùng cho ghép cặp, dạng khác để `[]`.
- `rubric`: hướng dẫn chấm tự luận; dạng khác để trống.
- `explanation`: giải thích đáp án, có thể để trống.
- `tags`: mảng JSON như `["java","oop"]`, tối đa 15 tags.
- `image`: để trống hoặc data URI PNG/JPG/WebP; không chấp nhận URL bên ngoài. Khi xuất Excel, dữ liệu ảnh nằm ở sheet ẩn `Images`, cột này chứa khóa tham chiếu. Giữ sheet này để nhập lại ảnh; không dùng ảnh dán trực tiếp lên worksheet.
- `imageAlt`: mô tả bắt buộc nếu có ảnh.

CSV dùng UTF-8, dấu phẩy và quy tắc quote CSV; file xuất có BOM cho tiếng Việt. Văn bản có thể bị Excel hiểu là công thức được thêm dấu nháy đơn và được phục hồi khi nhập lại. Excel dùng sheet `Questions`, không hỗ trợ công thức, hyperlink hoặc rich text trong ô. Dán dưới dạng văn bản nếu file chứa các kiểu ô này.

File xuất chỉ chứa nội dung hiện tại, không chứa lịch sử phiên bản, ID hay chủ sở hữu. Chỉ tài khoản có quyền mới tải được file chứa đáp án.

## API chính

Mọi endpoint dưới `/api/questions` yêu cầu access token và role Admin/Teacher. Request thay đổi dữ liệu cần `X-Requested-With: QuizSpace` như các module còn lại.

```text
GET    /questions                          Danh sách, tìm kiếm, bộ lọc, phân trang
GET    /questions/metadata                 Môn/chủ đề, tags và thống kê
POST   /questions                          Tạo câu hỏi
GET    /questions/:id                      Chi tiết đầy đủ
PUT    /questions/:id                      { content, version, note? }
POST   /questions/:id/archive              { version }
POST   /questions/:id/duplicate            Tạo bản sao
GET    /questions/:id/versions?page=1       Lịch sử, 20 mục/trang
GET    /questions/:id/versions/:version     Nội dung snapshot
POST   /questions/:id/versions/:n/restore   { version: phiên_bản_hiện_tại }
GET    /questions/template?format=xlsx     File mẫu, format csv hoặc xlsx
GET    /questions/export?format=csv        Xuất theo bộ lọc
POST   /questions/import/preview?format=xlsx
POST   /questions/import/:importId/commit
```

Danh sách: `search`, `subject`, `topic` (đường dẫn phân cách `/`; bao gồm chủ đề con), `difficulty`, `type`, `status`, `tag`, `page` (12 câu/trang). Preview import gửi binary với `Content-Type: application/octet-stream`.

## Kiểm tra

`npm test` trong backend chạy database tạm; không sửa dữ liệu Atlas. Bộ test module kiểm tra 8 dạng, validation đáp án, RBAC và quyền sở hữu, lịch sử bất biến, cập nhật đồng thời, lưu trữ/nhân bản, ảnh, nhập/xuất CSV/XLSX và xác nhận import một lần.

Tham khảo triển khai: [MongoDB transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/), [ExcelJS](https://github.com/exceljs/exceljs), [CSV BOM](https://csv.js.org/parse/options/bom/), [CSV formula escaping](https://csv.js.org/stringify/options/escape_formulas/).
