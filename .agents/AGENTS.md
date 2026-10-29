# Hướng dẫn và Nguyên tắc Thực thi cho AI Coding Assistant (AGENTS.md)

Tài liệu này định nghĩa các quy tắc bắt buộc mà mọi AI Coding Assistant / Agent khi làm việc trên dự án này phải tuân thủ nghiêm ngặt 100%.

---

## 1. QUY TẮC ĐẨY MÃ NGUỒN LÊN GITHUB (BẮT BUỘC)

- **Đẩy ngay sau mỗi lần code xong:** Mỗi khi hoàn thành viết mã, chỉnh sửa mã nguồn hoặc cấu hình trong bất kỳ lượt tương tác (prompt) nào, AI Agent **bắt buộc phải commit và đẩy (push) ngay lập tức** lên GitHub.
- **Áp dụng theo từng prompt:** Mỗi một prompt có thay đổi mã nguồn, tài liệu hoặc cấu hình đều phải kết thúc bằng việc đẩy lên GitHub; **code xong là đẩy ngay**, tuyệt đối không được trì hoãn hay chờ đợi sang prompt tiếp theo.
- **Remote đích chính thức:**
  - Remote: `origin` (hoặc `kiyogo`)
  - URL: `https://github.com/kiyogo/erp.git`
  - Nhánh: `main`
  - Lệnh thực thi chuẩn:
    ```bash
    git add <các tệp thay đổi>
    git commit -m "<loại commit>(<phạm vi>): mô tả ngắn gọn"
    git push origin main
    ```
- **Quy chuẩn commit:**
  - Commit message viết rõ ràng theo chuẩn Conventional Commits (ví dụ: `fix(ui): ...`, `feat(...): ...`, `docs(...): ...`).
  - Tuyệt đối không chứa emoji / icon trong commit message và nội dung tệp (theo quy định của dự án).

---

## 2. NGHIÊN CỨU DỰ ÁN MÃ NGUỒN MỞ TRƯỚC KHI LÀM (KHÔNG VIẾT TỪ CON SỐ 0)

- **Không viết từ con số 0 với chức năng mới/chưa quen thuộc:** Đối với bất kỳ chức năng, phân hệ, giải thuật hoặc bài toán nào chưa quen thuộc, AI Agent **tuyệt đối không được tự ý viết mã từ con số 0** theo suy đoán cá nhân.
- **Tìm kiếm và so sánh trên GitHub:** Bắt buộc phải chủ động tìm kiếm các dự án mã nguồn mở (open-source repositories) tương tự trên GitHub để:
  1. Khảo sát cách các dự án lớn/uy tín đã giải quyết bài toán đó.
  2. Đối chiếu, so sánh các luồng ý tưởng, mô hình dữ liệu (data models) và cấu trúc kiến trúc khác nhau.
  3. Đánh giá tính khả thi, tính mở rộng và độ ổn định trước khi quyết định hướng tiếp cận.
- **Chọn lọc và thích ứng:** Sau khi phân tích và lựa chọn giải pháp tối ưu nhất, hãy tích hợp và tùy biến phù hợp với kiến trúc và tiêu chuẩn mã nguồn sẵn có của dự án.

---

## 3. QUY TRÌNH KIỂM THỬ TRƯỚC KHI PUSH

- Trước khi commit và push, phải đảm bảo mã nguồn:
  1. Không có lỗi cú pháp hoặc lỗi build.
  2. Vượt qua các bài kiểm thử tự động (`npm test` đối với thư mục `legacy/web`).
  3. Đảm bảo bản build production (`npm run build`) hoạt động ổn định nếu có thay đổi liên quan đến giao diện hoặc logic ứng dụng web.
- Dọn dẹp sạch sẽ các tệp tạm / scratch script phục vụ kiểm thử trước khi commit.

---

## 4. NGUYÊN TẮC GIAO DIỆN & LOGIC HỆ THỐNG

- **Tuân thủ kiến trúc và phong cách giao diện hiện tại:**
  - Mọi tính năng thêm mới bắt buộc phải làm đúng theo giao diện và kiến trúc giao diện hiện tại của dự án.
  - Tuyệt đối không tự ý tạo thêm bất kỳ giao diện mới, trang mới hoặc kiểu mẫu khác biệt nào khi người dùng không yêu cầu.
  - Triển khai chuẩn xác theo các thành phần hiện hành của hệ thống (menu, dialog/modal, form, bảng dữ liệu,...).
  - Những giao diện nào đã có trong web rồi thì bắt buộc phải lấy luôn giao diện đó, không tạo nên giao diện mới.
- **Quy tắc về nút bấm và tính năng chưa rõ ràng:**
  - Những nút bấm, tính năng nào chưa rõ, chưa biết thì tuyệt đối không được tự ý thêm vào hệ thống.
  - Bắt buộc phải hỏi lại người dùng để làm rõ yêu cầu trước khi triển khai.
  - Phải giải thích được rõ ràng và đầy đủ tất cả các tính năng sau khi đã thêm.
- **Tổng hợp ảnh chụp giao diện:**
  - Khi người dùng cung cấp nhiều ảnh chụp cho cùng một giao diện hoặc một chức năng, AI Agent phải phân tích, đối chiếu và tổng hợp tất cả các chi tiết từ các ảnh lại để xây dựng thành 1 giao diện duy nhất, hoàn chỉnh, đồng nhất và đúng chuẩn giao diện web hiện tại.
- **Chuẩn giao diện Modal / Dialog:**
  - Khoảng cách lề viền và khoảng cách giữa các khối chức năng (form rows, grid, actions) trong dialog tuân theo chuẩn 14px.
  - Các phần tử form control bên trong (như ô chọn Multi-Select, Input, Tags) giữ khoảng cách nhỏ gọn (row-gap 3px, column-gap 4px, margin 0) để đảm bảo tính thẩm mỹ, thanh thoát và không bị giãn dòng cách xa nhau.
- **Ngôn ngữ và thẩm mỹ:**
  - Giao diện và thông báo sử dụng Tiếng Việt chuẩn mực, chuyên nghiệp.
  - Giữ gìn tính toàn vẹn của mã nguồn, chú thích (comments) và cấu trúc hiện hữu của dự án.
  - Tuyệt đối không chứa emoji / icon trong commit message, nội dung tệp và tài liệu dự án.
