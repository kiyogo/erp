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
- **Quy chuẩn kích thước khung nhập và nút bấm (100% bắt buộc kể từ giờ về sau):**
  - **Chiều cao chuẩn 32px:** Toàn bộ 100% các khung nhập liệu (`Input`, `Select`, `DatePicker`, `TimeRangePicker`, `InputNumber`) và các nút bấm (`Button`, khung bấm) trong toàn hệ thống web bắt buộc phải có chiều cao chuẩn đồng nhất là **`32px`** (`height: 32px; box-sizing: border-box;`).
  - **Đệm trong (Padding):** Ô nhập liệu dùng `padding: 4px 11px`; nút bấm dùng `padding: 4px 12px` (hoặc `4px 15px`).
  - **Bo góc (Border Radius):** Đạt chuẩn `6px` đồng bộ với token hệ thống.
  - **Cỡ chữ (Font Size):** Chuẩn `14px` (line-height: `1.5` hoặc `22px`).
  - **Nút icon đơn lẻ:** Chuẩn vuông `32px x 32px` (`.ant-btn-square-icon`).
  - **Tuyệt đối không dùng `size="small"` (24px) tùy tiện:** Tránh làm lệch chiều cao giữa nút bấm và các ô nhập liệu 32px trong cùng một hàng hoặc cùng một khối chức năng.
  - **Không nhân bản biểu tượng dấu cộng:** Không để nút vừa có `icon={<PlusOutlined />}` vừa có chữ `+ Thêm`, dẫn đến hiển thị lỗi `+ + Thêm`.
- **Ngôn ngữ và thẩm mỹ:**
  - Giao diện và thông báo sử dụng Tiếng Việt chuẩn mực, chuyên nghiệp.
  - Giữ gìn tính toàn vẹn của mã nguồn, chú thích (comments) và cấu trúc hiện hữu của dự án.
  - Tuyệt đối không chứa emoji / icon trong commit message, nội dung tệp và tài liệu dự án.
  - Toàn bộ chữ trong giao diện web phải dùng nét thường; không dùng chữ đậm (`bold`, `font-weight: 500/600/700/800`, thẻ `<b>` hoặc `<strong>`) để nhấn mạnh. Phân cấp nội dung bằng kích thước chữ, màu sắc và khoảng cách.

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

- **100% không được tạo nền (background) hoặc khung hộp thừa cho các nhóm trường trong Form/Modal:**
  - Tuyệt đối không tạo các khung viền có nền xám (như `background: '#F8FAFC'`, `border: '1px solid #E2E8F0'`) để bọc các nhóm trường form hoặc cụm checkbox/radio bên trong dialog/modal.
  - Toàn bộ các trường và nhóm trường phải đặt trực tiếp trên nền phẳng trắng tự nhiên của Modal, phân cách bằng tiêu đề nhóm hoặc khoảng cách đệm tự nhiên (`gap`), không tạo hộp lồng hộp làm nặng nề giao diện.

- **Không hiển thị ghi chú định dạng `(...)` ở tiêu đề / nhãn trường (Label):**
  - Tuyệt đối không đưa các chỉ dẫn định dạng như `(HH:mm - HH:mm)`, `(DD/MM/YYYY)`, v.v. vào trong tiêu đề hoặc nhãn trường. Mọi chỉ dẫn định dạng bắt buộc phải đặt trong thuộc tính `placeholder` của ô nhập liệu (ví dụ: `placeholder="08:00 - 17:30"`).
  - Dấu ngoặc đơn `(...)` ở tiêu đề chỉ được phép dùng cho đơn vị đo lường (ví dụ: `(phút)`, `(%)`, `(tháng)`). Ngoài ra không được hiển thị bất kỳ nội dung nào khác trong dấu ngoặc đơn ở tiêu đề.

- **Tuyệt đối không dùng ký tự `&` trong tiêu đề:**
  - Không sử dụng ký tự `&` trong tiêu đề nhóm, nhãn form hoặc tiêu đề dialog (ví dụ: không viết `Thiết lập chấm công & chế độ ca`, chỉ ghi rõ ràng là `Thiết lập chấm công`). Khi cần liên kết nội dung thì sử dụng từ nối tiếng Việt chuẩn `và` hoặc dùng dấu phẩy `,`.

- **Khung giờ và thời gian làm việc bắt buộc phải có menu chọn (TimePicker / TimeRangePicker dropdown tương tự như chọn ngày DatePicker):**
  - Tuyệt đối không để trường nhập khung giờ ca (ví dụ: `08:00 - 17:30`) hoặc thời gian nghỉ giữa ca là một ô `Input` văn bản đơn thuần bắt người dùng phải tự gõ chuỗi ký tự thủ công.
  - 100% các trường khung giờ phải có **menu chọn thả xuống (popup menu) tương tự như chọn ngày (`DatePicker`)**.
  - Khi người dùng nhấp vào ô nhập liệu hoặc biểu tượng đồng hồ, hệ thống phải mở menu chọn gồm:
    1. **Khung giờ mẫu:** Danh sách các ca chuẩn phổ biến (`08:00 - 17:30`, `08:00 - 17:00`, `07:30 - 16:30`, `08:30 - 18:00`, `06:00 - 14:00`, `14:00 - 22:00`, `22:00 - 06:00`...) để người dùng nhấp chọn nhanh chỉ với 1 click.
    2. **Tùy chỉnh giờ:** Bộ chọn Giờ bắt đầu và Giờ kết thúc trực quan (chọn Giờ : Phút) để người dùng linh hoạt thiết lập khung giờ bất kỳ mà không lo sai định dạng.

- **Kích thước và tỷ lệ hiển thị của Modal / Dialog:**
  - Kích thước modal phải vừa vặn, chuẩn xác theo tỷ lệ của ảnh mẫu (ví dụ: `width: 780px`, khoảng cách đỉnh màn hình `top: 50px`, giới hạn `maxWidth: '95vw'`).
  - Không để các thành phần ẩn hoặc lỗi CSS kéo dãn chiều cao modal bất thường, làm mất cân đối so với khung hình làm việc.

- **Dữ liệu mẫu dự phòng cho bảng dữ liệu:**
  - Khi triển khai bảng dữ liệu chọn đối tượng từ modal (như danh sách nhân viên hội nhập), luôn chuẩn bị dữ liệu mẫu dự phòng phản ánh đúng thực tế trong ảnh mẫu nếu cơ sở dữ liệu hiện tại đang rỗng hoặc chưa có nhân sự phù hợp, tránh để bảng hiển thị trạng thái "No Data" gây gián đoạn trải nghiệm người dùng.

## 6. QUY CHUẨN GIAO DIỆN WEB (MENU, THANH CUỘN, FORM VÀ BẢNG)

Toàn bộ hướng dẫn chi tiết và tiêu chuẩn thiết kế giao diện (Menu thả, Thanh cuộn, Dialog, Form và Bảng dữ liệu) được quy định và lưu trữ độc lập tại tài liệu: [docs/WEB_UI_GUIDELINES.md](docs/WEB_UI_GUIDELINES.md).

Mọi lập trình viên và AI Agent khi triển khai giao diện bắt buộc phải đối chiếu và tuân thủ các quy tắc trong tài liệu trên, bao gồm:
1. **Nguyên tắc chung:** Dùng component và token màu sẵn có trong `custom-ui`, dùng cơ chế cuộn native của trình duyệt, không vẽ lại bằng canvas.
2. **Màu sắc, đường viền và góc bo:** Lấy màu theo token giao diện (`#009688`), bo góc nhẹ, loại bỏ hoàn toàn viền divider hoặc border thừa ở header/footer.
3. **Khoảng cách form:** Lề và khoảng cách các khối trong dialog theo chuẩn 14px, bố cục control gọn gàng (row-gap 3px, col-gap 4px, margin 0).
4. **Dialog và panel nổi:** Dùng `Modal` chung qua thuộc tính `title`, thanh cuộn native sát mép phải, không tạo nút đóng X hoặc nút phóng to thứ hai.
5. **Menu thả xuống (Dropdown/Select):** Nền sáng, viền mảnh, z-index xếp trên nội dung, click chọn chữ không làm giật cuộn trang.
6. **Thanh cuộn (Scrollbar):** Native, mảnh, chỉ đặt overflow trên vùng thực sự cần thiết, không cuộn lồng nhau.
7. **Bảng dữ liệu:** Lưới hiển thị đồng nhất, cuộn ngang cục bộ thuộc vùng bảng, chuẩn bị dữ liệu mẫu dự phòng khi cơ sở dữ liệu rỗng.

### Checklist kiểm thử trước khi hoàn tất giao diện

- [ ] Dùng component và token sẵn có; không tạo giao diện trùng lặp.
- [ ] Dialog không có nút X/phóng to trùng; nội dung dài cuộn trong thân và footer còn dùng được.
- [ ] Thanh cuộn ở đúng mép phải, không che nội dung và không làm trang đổi kích thước.
- [ ] Dropdown không bị cắt; chọn bằng cách bấm vào chữ không gây nhảy trang.
- [ ] Menu, Select, dialog và bảng không có khung xám thừa, dải màu đáy hoặc khoảng trắng bất thường.
- [ ] Các hàng/cột form thẳng, khoảng cách nhất quán, màu focus/hover/selected đúng hệ thống.
- [ ] Kiểm tra thao tác chuột, bàn phím và cuộn ở nội dung ngắn/dài, dialog mở/đóng và khung nhìn hẹp.
- [ ] Xác minh các nút thực hiện đúng hành động; không chỉ chỉnh hình thức mà làm mất chức năng.

