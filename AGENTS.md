# Hướng dẫn và Nguyên tắc Thực thi cho AI Coding Assistant (AGENTS.md)

Tài liệu này định nghĩa các quy tắc bắt buộc mà mọi AI Coding Assistant / Agent khi làm việc trên dự án này phải tuân thủ nghiêm ngặt 100%.

---

## 1. QUY TẮC ĐẨY MÃ NGUỒN LÊN GITHUB (BẮT BUỘC)

- **Đẩy ngay sau mỗi lần code xong:** Mỗi khi hoàn thành viết mã, chỉnh sửa mã nguồn hoặc cấu hình trong bất kỳ lượt tương tác (prompt) nào, AI Agent **bắt buộc phải commit và đẩy (push) ngay lập tức** lên GitHub.
- **Áp dụng theo từng prompt:** Mỗi một prompt có thay đổi mã nguồn hoặc tài liệu dự án đều phải kết thúc bằng việc đẩy lên GitHub (`kiyogo/main`), không được trì hoãn hay chờ đợi sang prompt tiếp theo.
- **Remote đích chính thức:**
  - Remote: `kiyogo`
  - URL: `https://github.com/kiyogo/erp.git`
  - Nhánh: `main`
  - Lệnh thực thi chuẩn:
    ```bash
    git add <các tệp thay đổi>
    git commit -m "<loại commit>(<phạm vi>): mô tả ngắn gọn"
    git push kiyogo main
    ```
- **Quy chuẩn commit:**
  - Commit message viết rõ ràng theo chuẩn Conventional Commits (ví dụ: `fix(ui): ...`, `feat(...): ...`, `docs(...): ...`).
  - Tuyệt đối không chứa emoji / icon trong commit message và nội dung tệp (theo quy định của dự án).

---

## 2. QUY TRÌNH KIỂM THỬ TRƯỚC KHI PUSH

- Trước khi commit và push, phải đảm bảo mã nguồn:
  1. Không có lỗi cú pháp hoặc lỗi build.
  2. Vượt qua các bài kiểm thử tự động (`npm test` đối với thư mục `legacy/web`).
  3. Đảm bảo bản build production (`npm run build`) hoạt động ổn định nếu có thay đổi liên quan đến giao diện hoặc logic ứng dụng web.
- Dọn dẹp sạch sẽ các tệp tạm / scratch script phục vụ kiểm thử trước khi commit.

---

## 3. NGUYÊN TẮC GIAO DIỆN & LOGIC HỆ THỐNG

- **Chuẩn giao diện Modal / Dialog:**
  - Khoảng cách lề viền và khoảng cách giữa các khối chức năng (form rows, grid, actions) trong dialog tuân theo chuẩn 14px.
  - Các phần tử form control bên trong (như ô chọn Multi-Select, Input, Tags) giữ khoảng cách nhỏ gọn (row-gap 3px, column-gap 4px, margin 0) để đảm bảo tính thẩm mỹ, thanh thoát và không bị giãn dòng cách xa nhau.
- **Ngôn ngữ và thẩm mỹ:**
  - Giao diện và thông báo sử dụng Tiếng Việt chuẩn mực, chuyên nghiệp.
  - Giữ gìn tính toàn vẹn của mã nguồn, chú thích (comments) và cấu trúc hiện hữu của dự án.
