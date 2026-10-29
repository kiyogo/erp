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
  - Nếu web đã có trang, menu, dialog/modal, form, bảng hoặc thành phần phù hợp thì phải dùng và mở rộng thành phần đó theo đúng kiến trúc hiện hữu; không tạo bản giao diện trùng lặp.
  - Không tự ý tạo trang, menu, dialog/modal, kiểu điều hướng hoặc mẫu giao diện mới nếu người dùng chưa yêu cầu rõ.
- **Quy tắc về yêu cầu, nút bấm và tính năng chưa rõ:**
  - Trước khi triển khai, phải xác định rõ mục đích, hành vi, dữ liệu đầu vào/đầu ra, quyền sử dụng và ảnh hưởng liên kết của từng nút hoặc tính năng mới.
  - Nếu một trong các điểm trên chưa rõ hoặc không thể xác minh từ yêu cầu, ảnh chụp hay hành vi hiện có của web, không được tự suy đoán hoặc thêm tính năng; phải hỏi người dùng để làm rõ phần còn thiếu.
  - Sau khi triển khai, phải giải thích đầy đủ tính năng đã thêm: vị trí truy cập, cách sử dụng, trường bắt buộc/tùy chọn và kiểm tra dữ liệu, quyền và trạng thái, thao tác thêm/sửa/xóa, liên kết và ảnh hưởng tới các phần khác.
- **Tổng hợp ảnh chụp giao diện:**
  - Khi người dùng cung cấp nhiều ảnh chụp của cùng một giao diện/chức năng, phải đối chiếu và tổng hợp các chi tiết thành một giao diện thống nhất, dùng lại kiến trúc và thành phần có sẵn của web.
  - Xem các ảnh là những trạng thái hoặc góc nhìn bổ sung của cùng giao diện nếu ngữ cảnh cho thấy chúng thuộc cùng một luồng; không tạo giao diện/trang riêng cho từng ảnh và không tự thêm chi tiết không có căn cứ. Nếu ảnh mâu thuẫn hoặc không đủ thông tin để xác định hành vi, phải hỏi người dùng.
- **Chuẩn giao diện Modal / Dialog:**
  - Khoảng cách lề viền và khoảng cách giữa các khối chức năng (form rows, grid, actions) trong dialog tuân theo chuẩn 14px.
  - Các phần tử form control bên trong (như ô chọn Multi-Select, Input, Tags) giữ khoảng cách nhỏ gọn (row-gap 3px, column-gap 4px, margin 0) để đảm bảo tính thẩm mỹ, thanh thoát và không bị giãn dòng cách xa nhau.
- **Ngôn ngữ và thẩm mỹ:**
  - Giao diện và thông báo sử dụng Tiếng Việt chuẩn mực, chuyên nghiệp.
  - Giữ gìn tính toàn vẹn của mã nguồn, chú thích (comments) và cấu trúc hiện hữu của dự án.
  - Tuyệt đối không chứa emoji / icon trong commit message, nội dung tệp và tài liệu dự án.

---

## 5. CÁC LỖI GIAO DIỆN CẦN TRÁNH VÀ QUY TẮC KHẮC PHỤC (MODAL & DIALOG)

Nhằm đảm bảo giao diện luôn chuẩn xác 100% theo ảnh mẫu và hệ thống component hiện có của web, mọi lập trình viên và AI Agent bắt buộc phải tuân thủ các quy tắc phòng tránh lỗi sau:

- **Tuyệt đối không tự ý thêm nút phóng to hoặc nhân bản nút đóng (X):**
  - Component `Modal` của web đã tích hợp sẵn thanh tiêu đề và nút đóng (X) mặc định ở góc trên bên phải.
  - Không tự ý tạo thêm nút phóng to (fullscreen/maximize) hoặc tạo thêm nút X tùy chỉnh trong phần nội dung modal, tránh gây trùng lặp hai nút X hoặc làm sai lệch thanh header chuẩn của hệ thống.
  - Luôn sử dụng thuộc tính `title` tiêu chuẩn của `Modal`.

- **Loại bỏ các thanh kẻ thẳng (border/divider) không cần thiết:**
  - Không tự ý thêm các đường viền gạch ngang cứng nhắc (`borderBottom`, `borderTop`) ở chân header, đầu footer hoặc viền bao quanh bảng dữ liệu nếu thiết kế mẫu không có.
  - Giữ giao diện phẳng, thanh thoát; sử dụng khoảng cách đệm tự nhiên (`padding`, `gap`) thay vì lạm dụng các đường kẻ phân cách.

- **Không để rò rỉ khung nhập liệu (input frames) thừa vào giao diện:**
  - Khi cần tạo form ngầm để phục vụ kiểm thử tự động hoặc xử lý logic nền, chỉ sử dụng thẻ `<Form form={form} onFinish={...} style={{ display: 'none' }} />` với 0 phần tử con (children).
  - Tuyệt đối không chèn các thẻ `<Form.Item>` và `<Input>` con vào form ngầm vì các class CSS có thể khiến các ô nhập liệu bị hiển thị ra ngoài giao diện, tạo ra các khung trống kỳ dị bên dưới bảng dữ liệu.

- **Kích thước và tỷ lệ hiển thị của Modal / Dialog:**
  - Kích thước modal phải vừa vặn, chuẩn xác theo tỷ lệ của ảnh mẫu (ví dụ: `width: 780px`, khoảng cách đỉnh màn hình `top: 50px`, giới hạn `maxWidth: '95vw'`).
  - Không để các thành phần ẩn hoặc lỗi CSS kéo dãn chiều cao modal bất thường, làm mất cân đối so với khung hình làm việc.

- **Dữ liệu mẫu dự phòng cho bảng dữ liệu:**
  - Khi triển khai bảng dữ liệu chọn đối tượng từ modal (như danh sách nhân viên hội nhập), luôn chuẩn bị dữ liệu mẫu dự phòng phản ánh đúng thực tế trong ảnh mẫu nếu cơ sở dữ liệu hiện tại đang rỗng hoặc chưa có nhân sự phù hợp, tránh để bảng hiển thị trạng thái "No Data" gây gián đoạn trải nghiệm người dùng.

