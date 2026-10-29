# Quy chuẩn giao diện web (Menu, thanh cuộn, form và bảng)

Tài liệu này lưu giữ toàn bộ quy chuẩn giao diện người dùng (UI/UX) cho hệ thống ERP web, bao gồm dialog, menu thả, danh sách chọn, thanh cuộn, bảng dữ liệu và các panel nổi.

---

## 1. NGUYÊN TẮC CHUNG

- **Sử dụng component và token chuẩn:** Luôn dùng các component, token màu và kiểu bố cục có sẵn trong `legacy/web/src/custom-ui`; tuyệt đối không tạo thêm hệ thống giao diện song song hoặc can thiệp bằng các thư viện ngoài chưa phê duyệt.
- **Bảo toàn cấu trúc và bố cục:** Giữ nguyên cấu trúc, kích thước và vị trí nội dung hiện tại nếu yêu cầu chỉ là sửa một chi tiết. Trạng thái mở/đóng menu hoặc dialog không được làm trang giật, đổi kích thước hay xuất hiện thanh cuộn ngang ngoài ý muốn.
- **Cuộn native của trình duyệt:** Dùng HTML/CSS và cơ chế cuộn gốc của trình duyệt. Không vẽ lại trang, dialog, menu hay thanh cuộn bằng canvas.
- **Ngôn ngữ chuẩn mực:** Giữ nội dung giao diện và thông báo bằng tiếng Việt nhất quán, chuyên nghiệp với toàn bộ hệ thống.

---

## 2. MÀU SẮC, ĐƯỜNG VIỀN VÀ GÓC BO

- **Hài hòa màu sắc:** Lấy màu chữ, nền, viền và trạng thái từ token giao diện hoặc component lân cận. Nền menu và dropdown là nền sáng; trạng thái hover/được chọn phải dễ nhận biết, không thêm dải màu trang trí dưới menu.
- **Góc bo đồng nhất:** Dùng góc bo đồng nhất với component cùng loại. Menu/dropdown dùng góc bo nhẹ; không để lớp khung xám bên ngoài không bo góc bao quanh một panel đã có khung riêng.
- **Tối giản đường viền:** Chỉ vẽ đường viền khi nó phân định một vùng có ý nghĩa (ví dụ: bảng tab hoặc ô nhập). Tránh khung lồng khung và đường kẻ ở header/footer dialog nếu mẫu giao diện không có.
- **Hiệu ứng Focus:** Trạng thái focus phải nhìn thấy rõ và dùng màu nhấn đang có của web (`#009688`). Không xóa focus chỉ để làm giao diện phẳng hơn.

---

## 3. KHOẢNG CÁCH VÀ ĐIỀU KHIỂN BIỂU MẪU (FORM & SPACING)

- **Khoảng cách Dialog chuẩn 14px:** Trong dialog/modal, lề và khoảng cách giữa các khối lớn như tiêu đề, nội dung, nhóm form và chân trang theo chuẩn 14px.
- **Bố cục điều khiển compact:** Các control nằm cùng hàng hoặc cùng cụm giữ bố cục gọn: khoảng cách hàng 3px, cột 4px, margin mặc định bằng 0 khi áp dụng quy tắc form compact.
- **Căn thẳng hàng và tỷ lệ:** Các cột, nhãn và ô nhập trong cùng một vùng phải thẳng hàng; khoảng cách dọc giữa các hàng nhất quán. Không để một nhóm trường bị dồn, tràn khỏi dialog hoặc có chiều rộng khác bất thường.
- **Quy chuẩn kích thước khung nhập và nút bấm (100% bắt buộc kể từ giờ về sau):**
  - **Chiều cao chuẩn 32px:** Toàn bộ 100% các khung nhập liệu (`Input`, `Select`, `DatePicker`, `TimeRangePicker`, `InputNumber`) và các nút bấm (`Button`, khung bấm) trong toàn hệ thống web bắt buộc phải có chiều cao chuẩn đồng nhất là **`32px`** (`height: 32px; box-sizing: border-box;`).
  - **Đệm trong (Padding):** Ô nhập liệu dùng `padding: 4px 11px`; nút bấm dùng `padding: 4px 12px` (hoặc `4px 15px`).
  - **Bo góc (Border Radius):** Đạt chuẩn `6px` đồng bộ với token hệ thống.
  - **Cỡ chữ (Font Size):** Chuẩn `14px` (line-height: `1.5` hoặc `22px`).
  - **Nút icon đơn lẻ:** Chuẩn vuông `32px x 32px` (`.ant-btn-square-icon`).
  - **Tuyệt đối không dùng `size="small"` (24px) tùy tiện:** Tránh làm lệch chiều cao giữa nút bấm và các ô nhập liệu 32px trong cùng một hàng hoặc cùng một khối chức năng.
  - **Không nhân bản biểu tượng dấu cộng:** Không để nút vừa có `icon={<PlusOutlined />}` vừa có chữ `+ Thêm`, dẫn đến hiển thị lỗi `+ + Thêm`.
- **Quy chuẩn nút bấm:**
  - Nút chỉ có biểu tượng dấu cộng dùng dạng vuông (`.ant-btn-square-icon` 32x32px).
  - Nút chọn dạng chữ có thể dùng biểu tượng vuông nếu đúng vai trò chọn.
  - Không đổi các nút có nhãn hành động thành biểu tượng nếu làm mất nghĩa.

---

## 4. DIALOG VÀ PANEL NỔI (MODAL & POPUP)

- **Sử dụng Modal dùng chung:** Tạo dialog bằng component `Modal` dùng chung và truyền tiêu đề qua thuộc tính `title`. Không tự thêm nút đóng X hoặc nút phóng to thứ hai.
- **Giới hạn trong khung nhìn:** Giới hạn dialog trong khung nhìn (`maxHeight: calc(100vh - 48px)`), giữ vùng tiêu đề/chân trang ổn định và để nội dung dài cuộn bên trong phần thân. Chân trang và các nút hành động phải còn truy cập được khi cuộn.
- **Vị trí thanh cuộn Dialog:** Thanh cuộn dialog là thanh cuộn trình duyệt/native, nằm sát cạnh phải vùng dialog. Không dùng canvas hoặc thanh giả phủ lên nội dung. Thanh cuộn xuất hiện/biến mất không làm thay đổi chiều rộng trang hoặc đẩy nội dung ngang.
- **Loại bỏ khoảng trắng thừa:** Không để vùng trắng thừa bên dưới nội dung hoặc nút hành động. Footer phải thuộc dialog và bám theo bố cục hiện hành.
- **Tránh viền gạch ngang thừa:** Không thêm khung viền hoặc divider cho header, body, footer nếu thiết kế hiện tại không cần. Không chèn form ẩn có control hiển thị rò rỉ ra ngoài.
- **100% không tạo nền hộp xám hoặc viền thừa bao quanh nhóm trường:** Tuyệt đối không tạo các khung viền có nền xám (như `background: '#F8FAFC'`, `border: '1px solid #E2E8F0'`) để bọc các nhóm trường form hoặc cụm checkbox/radio bên trong dialog/modal. Toàn bộ các trường và nhóm trường phải đặt trực tiếp trên nền phẳng trắng tự nhiên của Modal, phân cách bằng tiêu đề nhóm hoặc khoảng cách đệm tự nhiên (`gap`), không tạo hộp lồng hộp làm nặng nề giao diện.
- **Không hiển thị ghi chú định dạng `(...)` ở tiêu đề / nhãn trường:** Tuyệt đối không đưa các chỉ dẫn định dạng như `(HH:mm - HH:mm)`, `(DD/MM/YYYY)`, v.v. vào trong tiêu đề hoặc nhãn trường. Mọi chỉ dẫn định dạng bắt buộc phải đặt trong thuộc tính `placeholder` của ô nhập liệu (ví dụ: `placeholder="08:00 - 17:30"`). Dấu ngoặc đơn `(...)` ở tiêu đề chỉ được phép dùng cho đơn vị đo lường (ví dụ: `(phút)`, `(%)`, `(tháng)`). Ngoài ra không được hiển thị bất kỳ nội dung nào khác trong dấu ngoặc đơn ở tiêu đề.
- **Tuyệt đối không dùng ký tự `&` trong tiêu đề:** Không sử dụng ký tự `&` trong tiêu đề nhóm, nhãn form hoặc tiêu đề dialog (ví dụ: không viết `Thiết lập chấm công & chế độ ca`, chỉ ghi rõ ràng là `Thiết lập chấm công`). Khi cần liên kết nội dung thì sử dụng từ nối tiếng Việt chuẩn `và` hoặc dùng dấu phẩy `,`.
- **Khung giờ và thời gian làm việc bắt buộc phải có menu chọn (TimePicker / TimeRangePicker dropdown tương tự như chọn ngày DatePicker):** Tuyệt đối không để trường nhập khung giờ ca (ví dụ: `08:00 - 17:30`) hoặc thời gian nghỉ giữa ca là một ô `Input` văn bản đơn thuần bắt người dùng phải tự gõ chuỗi ký tự thủ công. 100% các trường khung giờ phải có **menu chọn thả xuống (popup menu) tương tự như chọn ngày (`DatePicker`)**, bao gồm danh sách khung giờ mẫu phổ biến để chọn nhanh và bộ chọn trực quan Giờ bắt đầu - Giờ kết thúc (Giờ : Phút).
- **Nội dung phức hợp:** Khi nội dung dialog có tab, bảng, form hoặc upload, mỗi vùng vẫn dùng đúng component hiện có và không tạo thêm dialog lồng thay cho luồng đã có.

---

- **Bố cục xem trước phân ca trong Modal Phân ca chi tiết (Bắt buộc luôn ở bên phải):** Trong modal "Phân ca chi tiết", phần **Xem trước phân ca** (lưới lịch tháng và ca trực) bắt buộc **luôn luôn hiển thị ở cột bên phải** theo bố cục 2 cột (side-by-side: cột trái là Thông tin chung, Thời gian áp dụng và Đối tượng áp dụng; cột phải là Xem trước phân ca). Tuyệt đối **không được bố trí Xem trước phân ca ở phía dưới** các trường nhập liệu.

- **Xóa 100% các thanh kẻ thẳng (border/divider) phân cách trong Dialog:** Tuyệt đối không tạo các đường kẻ thẳng phân cách (như orderLeft, orderRight, orderTop, orderBottom, divider) giữa các cột nội dung hoặc phía trên cụm nút bấm chân trang (footer) của dialog. Bố cục giữa các vùng phải được phân định hoàn toàn tự nhiên bằng khoảng cách đệm (gap, margin), giữ cho giao diện dialog phẳng, liền mạch và thanh thoát.
- **Kích thước Dialog / Modal rộng rãi và thoáng đãng:** Đối với các modal/dialog có bố cục 2 cột (như modal "Phân ca chi tiết"), kích thước phải đủ lớn (chuẩn width: 1180px - 1200px, maxWidth: '96vw') để các cột thiết lập và lưới lịch xem trước hiển thị to, rõ ràng, không bị co ép chữ hay chật chội.

## 5. MENU THẢ XUỐNG VÀ DANH SÁCH CHỌN (DROPDOWN & SELECT)

- **Đồng bộ thiết kế:** Menu thao tác, submenu và Select dropdown dùng cùng ngôn ngữ giao diện: nền sáng, viền mảnh, bóng nhẹ, góc bo và trạng thái hover/được chọn nhất quán.
- **Hiển thị và vị trí:** Menu phải xếp trên nội dung và dialog liên quan (`z-index` phù hợp), không bị cắt bởi khung cha. Đặt vị trí cạnh control kích hoạt; khi gần mép khung nhìn thì mở về phía còn đủ chỗ.
- **Cuộn trong danh sách:** Nội dung dài được cuộn trong chính danh sách. Select dropdown có thể ẩn kiểu thanh cuộn theo style hiện tại; không thêm thanh giả/canvas. Việc ẩn thanh cuộn không được làm mất khả năng cuộn bằng bánh xe, trackpad, phím hoặc cảm ứng.
- **Tương tác click mượt mà:** Bấm vào chữ của một lựa chọn phải kích hoạt đúng lựa chọn, đóng/mở theo hành vi component và giữ vị trí trang. Không để click hoặc focus làm trang tự nhảy cuộn xuống một đoạn.
- **Điều hướng bàn phím:** Không làm mất focus bàn phím; lựa chọn có thể thao tác bằng bàn phím và trạng thái focus/được chọn phải phân biệt được rõ ràng.
- **Điều hướng danh sách dài:** Menu có nhiều mục phải cuộn đúng mục đang điều hướng vào tầm nhìn mà không kéo trang nền theo. Không để menu tạo dải màu hoặc khoảng trắng giả ở đáy.

---

## 6. THANH CUỘN VÀ HÀNH VI CUỘN (SCROLLBAR & BEHAVIOR)

- **Cơ chế cuộn Native:** Dùng cơ chế cuộn native cho trang, dialog, bảng và danh sách. Chỉ đặt `overflow` trên vùng thực sự cần cuộn; tránh lồng nhiều vùng cuộn cho cùng một nội dung.
- **Kiểu dáng thanh cuộn:** Thanh cuộn dialog được làm mảnh, track trong suốt và thumb xám nhạt theo style hiện có. Select dropdown ẩn thanh cuộn bằng CSS; vùng cuộn khác giữ hành vi và khả năng truy cập mặc định trừ khi thiết kế hiện hành quy định khác.
- **Vị trí thanh cuộn:** Với dialog dài, thanh cuộn nằm sát mép phải dialog và không bị padding che khuất. Nội dung cuộn không tràn ngang; footer không bị cuộn mất nếu component đang bố trí footer riêng.
- **Giữ vị trí cuộn nền:** Khi menu/dialog mở, đóng hoặc người dùng chọn một dòng, giữ nguyên vị trí cuộn trang nền. Chỉ vùng đang thao tác được cuộn; không tự cuộn trang do click chữ.
- **Kiểm thử đa kích thước:** Kiểm tra ở trạng thái thanh cuộn có/không có, nội dung ngắn/dài và cửa sổ hẹp để bảo đảm không đổi kích thước hoặc sinh thanh cuộn ngang ngoài ý muốn.

---

## 7. BẢNG DỮ LIỆU (DATA TABLE)

- **Lưới hiển thị đồng nhất:** Dùng component bảng hiện có (`KTable` hoặc `Table`), giữ đầu cột, hàng dữ liệu, điều khiển phân trang và tổng số theo cùng một lưới.
- **Kiểm soát chiều cao hàng:** Control trong ô (nút bấm, tags, select) không làm tăng chiều cao hàng bất ngờ. Menu của Select trong bảng hiển thị trên các hàng/phân trang cần thiết và không bị cắt.
- **Cuộn ngang cục bộ:** Khi bảng rộng, cuộn ngang thuộc vùng bảng; không làm rộng toàn trang. Nút thao tác và phân trang vẫn hiện đúng vị trí của component.
- **Trạng thái dữ liệu trung thực:** Trạng thái rỗng, đang tải và lỗi phải phản ánh đúng thực tế dữ liệu; với modal chọn đối tượng, tuân thủ quy tắc dữ liệu dự phòng phản ánh đúng mẫu khi DB rỗng.

---

## 8. CHECKLIST KIỂM THỬ TRƯỚC KHI HOÀN TẤT GIAO DIỆN

- [ ] Dùng component và token sẵn có; không tạo giao diện trùng lặp.
- [ ] Dialog không có nút X/phóng to trùng; nội dung dài cuộn trong thân và footer còn dùng được.
- [ ] Thanh cuộn ở đúng mép phải, không che nội dung và không làm trang đổi kích thước.
- [ ] Dropdown không bị cắt; chọn bằng cách bấm vào chữ không gây nhảy trang.
- [ ] Menu, Select, dialog và bảng không có khung xám thừa, dải màu đáy hoặc khoảng trắng bất thường.
- [ ] Các hàng/cột form thẳng, khoảng cách nhất quán, màu focus/hover/selected đúng hệ thống.
- [ ] Kiểm tra thao tác chuột, bàn phím và cuộn ở nội dung ngắn/dài, dialog mở/đóng và khung nhìn hẹp.
- [ ] Xác minh các nút thực hiện đúng hành động; không chỉ chỉnh hình thức mà làm mất chức năng.
