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

## 6. QUY CHUẨN GIAO DIỆN WEB (MENU, THANH CUỘN, FORM VÀ BẢNG)

Các quy tắc dưới đây áp dụng cho mọi phân hệ web, bao gồm dialog, menu thả, danh sách chọn, bảng dữ liệu và các panel nổi.

### Nguyên tắc chung

- Dùng component, token màu và kiểu bố cục có sẵn trong `legacy/web/src/custom-ui`; không tạo thêm một hệ thống giao diện song song.
- Giữ nguyên cấu trúc, kích thước và vị trí nội dung hiện tại nếu yêu cầu chỉ là sửa một chi tiết. Trạng thái mở/đóng menu hoặc dialog không được làm trang giật, đổi kích thước hay xuất hiện thanh cuộn ngang ngoài ý muốn.
- Dùng HTML/CSS và cơ chế cuộn gốc của trình duyệt. Không vẽ lại trang, dialog, menu hay thanh cuộn bằng canvas.
- Giữ nội dung giao diện và thông báo bằng tiếng Việt nhất quán với phần còn lại của web.

### Màu sắc, đường viền và góc bo

- Lấy màu chữ, nền, viền và trạng thái từ token giao diện hoặc component lân cận. Nền menu và dropdown là nền sáng; trạng thái hover/được chọn phải dễ nhận biết, không thêm dải màu trang trí dưới menu.
- Dùng góc bo đồng nhất với component cùng loại. Menu/dropdown dùng góc bo nhẹ; không để lớp khung xám bên ngoài không bo góc bao quanh một panel đã có khung riêng.
- Chỉ vẽ đường viền khi nó phân định một vùng có ý nghĩa (ví dụ: bảng tab hoặc ô nhập). Tránh khung lồng khung và đường kẻ ở header/footer dialog nếu mẫu giao diện không có.
- Trạng thái focus phải nhìn thấy rõ và dùng màu nhấn đang có của web. Không xóa focus chỉ để làm giao diện phẳng hơn.

### Khoảng cách và điều khiển biểu mẫu

- Trong dialog, lề và khoảng cách giữa các khối lớn như tiêu đề, nội dung, nhóm form và chân trang theo chuẩn 14px.
- Các control nằm cùng hàng hoặc cùng cụm giữ bố cục gọn: khoảng cách hàng 3px, cột 4px, margin mặc định bằng 0 khi áp dụng quy tắc form compact.
- Các cột, nhãn và ô nhập trong cùng một vùng phải thẳng hàng; khoảng cách dọc giữa các hàng nhất quán. Không để một nhóm trường bị dồn, tràn khỏi dialog hoặc có chiều rộng khác bất thường.
- Nút chỉ có biểu tượng dấu cộng dùng dạng vuông; nút chọn dạng chữ có thể dùng biểu tượng vuông nếu đúng vai trò chọn. Không đổi các nút có nhãn hành động thành biểu tượng nếu làm mất nghĩa.

### Dialog và panel nổi

- Tạo dialog bằng component `Modal` dùng chung và truyền tiêu đề qua thuộc tính `title`. Không tự thêm nút đóng X hoặc nút phóng to thứ hai.
- Giới hạn dialog trong khung nhìn, giữ vùng tiêu đề/chân trang ổn định và để nội dung dài cuộn bên trong phần thân. Chân trang và các nút hành động phải còn truy cập được khi cuộn.
- Thanh cuộn dialog là thanh cuộn trình duyệt/native, nằm sát cạnh phải vùng dialog. Không dùng canvas hoặc thanh giả phủ lên nội dung. Thanh cuộn xuất hiện/biến mất không làm thay đổi chiều rộng trang hoặc đẩy nội dung ngang.
- Không để vùng trắng thừa bên dưới nội dung hoặc nút hành động. Footer phải thuộc dialog và bám theo bố cục hiện hành.
- Không thêm khung viền hoặc divider cho header, body, footer nếu thiết kế hiện tại không cần. Không chèn form ẩn có control hiển thị rò rỉ ra ngoài.
- Khi nội dung dialog có tab, bảng, form hoặc upload, mỗi vùng vẫn dùng đúng component hiện có và không tạo thêm dialog lồng thay cho luồng đã có.

### Menu thả xuống và danh sách chọn

- Menu thao tác, submenu và Select dropdown dùng cùng ngôn ngữ giao diện: nền sáng, viền mảnh, bóng nhẹ, góc bo và trạng thái hover/được chọn nhất quán.
- Menu phải xếp trên nội dung và dialog liên quan, không bị cắt bởi khung cha. Đặt vị trí cạnh control kích hoạt; khi gần mép khung nhìn thì mở về phía còn đủ chỗ.
- Nội dung dài được cuộn trong chính danh sách. Select dropdown có thể ẩn kiểu thanh cuộn theo style hiện tại; không thêm thanh giả/canvas. Việc ẩn thanh cuộn không được làm mất khả năng cuộn bằng bánh xe, trackpad, phím hoặc cảm ứng.
- Bấm vào chữ của một lựa chọn phải kích hoạt đúng lựa chọn, đóng/mở theo hành vi component và giữ vị trí trang. Không để click hoặc focus làm trang tự nhảy xuống một đoạn.
- Không làm mất focus bàn phím; lựa chọn có thể thao tác bằng bàn phím và trạng thái focus/được chọn phải phân biệt được.
- Menu có nhiều mục phải cuộn đúng mục đang điều hướng vào tầm nhìn mà không kéo trang nền theo. Không để menu tạo dải màu hoặc khoảng trắng giả ở đáy.

### Thanh cuộn và hành vi cuộn

- Dùng cơ chế cuộn native cho trang, dialog, bảng và danh sách. Chỉ đặt `overflow` trên vùng thực sự cần cuộn; tránh lồng nhiều vùng cuộn cho cùng một nội dung.
- Thanh cuộn dialog được làm mảnh, track trong suốt và thumb xám nhạt theo style hiện có. Select dropdown hiện ẩn thanh cuộn bằng CSS; vùng cuộn khác giữ hành vi và khả năng truy cập mặc định trừ khi thiết kế hiện hành quy định khác.
- Với dialog dài, thanh cuộn nằm sát mép phải dialog và không bị padding che khuất. Nội dung cuộn không tràn ngang; footer không bị cuộn mất nếu component đang bố trí footer riêng.
- Khi menu/dialog mở, đóng hoặc người dùng chọn một dòng, giữ nguyên vị trí cuộn trang nền. Chỉ vùng đang thao tác được cuộn; không tự cuộn trang do click chữ.
- Kiểm tra ở trạng thái thanh cuộn có/không có, nội dung ngắn/dài và cửa sổ hẹp để bảo đảm không đổi kích thước hoặc sinh thanh cuộn ngang ngoài ý muốn.

### Bảng dữ liệu

- Dùng component bảng hiện có, giữ đầu cột, hàng dữ liệu, điều khiển phân trang và tổng số theo cùng một lưới.
- Control trong ô không làm tăng chiều cao hàng bất ngờ. Menu của Select trong bảng hiển thị trên các hàng/phân trang cần thiết và không bị cắt.
- Khi bảng rộng, cuộn ngang thuộc vùng bảng; không làm rộng toàn trang. Nút thao tác và phân trang vẫn hiện đúng vị trí của component.
- Trạng thái rỗng, đang tải và lỗi phải phản ánh trạng thái dữ liệu thực tế; với modal chọn đối tượng, tuân thủ quy tắc dữ liệu dự phòng ở mục 5.

### Checklist giao diện

- [ ] Dùng component và token sẵn có; không tạo giao diện trùng lặp.
- [ ] Dialog không có nút X/phóng to trùng; nội dung dài cuộn trong thân và footer còn dùng được.
- [ ] Thanh cuộn ở đúng mép phải, không che nội dung và không làm trang đổi kích thước.
- [ ] Dropdown không bị cắt; chọn bằng cách bấm vào chữ không gây nhảy trang.
- [ ] Menu, Select, dialog và bảng không có khung xám thừa, dải màu đáy hoặc khoảng trắng bất thường.
- [ ] Các hàng/cột form thẳng, khoảng cách nhất quán, màu focus/hover/selected đúng hệ thống.
- [ ] Kiểm tra thao tác chuột, bàn phím và cuộn ở nội dung ngắn/dài, dialog mở/đóng và khung nhìn hẹp.
- [ ] Xác minh các nút thực hiện đúng hành động; không chỉ chỉnh hình thức mà làm mất chức năng.

