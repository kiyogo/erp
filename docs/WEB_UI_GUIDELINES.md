# Quy chuẩn giao diện web

Tài liệu này tổng hợp các quy ước giao diện dùng cho web hiện tại. Đây là hướng dẫn cho các thay đổi tiếp theo; nội dung không tự thay đổi hành vi hoặc CSS của ứng dụng. Khi quy chuẩn khác với component dùng chung đang có, hãy kiểm tra component và xác nhận phạm vi trước khi sửa.

## Nguyên tắc chung

- Dùng component, token màu và kiểu bố cục có sẵn trong `legacy/web/src/custom-ui`; không tạo thêm một hệ thống giao diện song song.
- Giữ nguyên cấu trúc, kích thước và vị trí nội dung hiện tại nếu yêu cầu chỉ là sửa một chi tiết. Trạng thái mở/đóng menu hoặc dialog không được làm trang giật, đổi kích thước hay xuất hiện thanh cuộn ngang ngoài ý muốn.
- Dùng HTML/CSS và cơ chế cuộn gốc của trình duyệt. Không vẽ lại trang, dialog, menu hay thanh cuộn bằng canvas.
- Giữ nội dung giao diện và thông báo bằng tiếng Việt nhất quán với phần còn lại của web.

## Màu sắc, đường viền và góc bo

- Lấy màu chữ, nền, viền và trạng thái từ token giao diện hoặc component lân cận. Nền menu và dropdown là nền sáng; trạng thái hover/được chọn phải dễ nhận biết, không thêm dải màu trang trí dưới menu.
- Dùng góc bo đồng nhất với component cùng loại. Menu/dropdown dùng góc bo nhẹ; không để lớp khung xám bên ngoài không bo góc bao quanh một panel đã có khung riêng.
- Chỉ vẽ đường viền khi nó phân định một vùng có ý nghĩa (ví dụ: bảng tab hoặc ô nhập). Tránh khung lồng khung và đường kẻ ở header/footer dialog nếu mẫu giao diện không có.
- Trạng thái focus phải nhìn thấy rõ và dùng màu nhấn đang có của web. Không xóa focus chỉ để làm giao diện phẳng hơn.

## Khoảng cách và điều khiển biểu mẫu

- Trong dialog, lề và khoảng cách giữa các khối lớn như tiêu đề, nội dung, nhóm form và chân trang theo chuẩn 14px.
- Các control nằm cùng hàng hoặc cùng cụm giữ bố cục gọn: khoảng cách hàng 3px, cột 4px, margin mặc định bằng 0 khi áp dụng quy tắc form compact.
- Các cột, nhãn và ô nhập trong cùng một vùng phải thẳng hàng; khoảng cách dọc giữa các hàng nhất quán. Không để một nhóm trường bị dồn, tràn khỏi dialog hoặc có chiều rộng khác bất thường.
- Nút chỉ có biểu tượng dấu cộng dùng dạng vuông; nút chọn dạng chữ có thể dùng biểu tượng vuông nếu đúng vai trò chọn. Không đổi các nút có nhãn hành động thành biểu tượng nếu làm mất nghĩa.

## Dialog và panel nổi

- Tạo dialog bằng component `Modal` dùng chung và truyền tiêu đề qua thuộc tính `title`. Không tự thêm nút đóng X hoặc nút phóng to thứ hai.
- Giới hạn dialog trong khung nhìn, giữ vùng tiêu đề/chân trang ổn định và để nội dung dài cuộn bên trong phần thân. Chân trang và các nút hành động phải còn truy cập được khi cuộn.
- Thanh cuộn dialog là thanh cuộn trình duyệt/native, nằm sát cạnh phải vùng dialog. Không dùng canvas hoặc thanh giả phủ lên nội dung. Thanh cuộn xuất hiện/biến mất không làm thay đổi chiều rộng trang hoặc đẩy nội dung ngang.
- Không để vùng trắng thừa bên dưới nội dung hoặc nút hành động. Footer phải thuộc dialog và bám theo bố cục hiện hành.
- Không thêm khung viền hoặc divider cho header, body, footer nếu thiết kế hiện tại không cần. Không chèn form ẩn có control hiển thị rò rỉ ra ngoài.
- Khi nội dung dialog có tab, bảng, form hoặc upload, mỗi vùng vẫn dùng đúng component hiện có và không tạo thêm một dialog lồng thay cho luồng đã có.

## Menu thả xuống và danh sách chọn

- Menu thao tác, submenu và Select dropdown dùng cùng ngôn ngữ giao diện: nền sáng, viền mảnh, bóng nhẹ, góc bo và trạng thái hover/được chọn nhất quán.
- Menu phải xếp trên nội dung và dialog liên quan, không bị cắt bởi khung cha. Đặt vị trí cạnh control kích hoạt; khi gần mép khung nhìn thì mở về phía còn đủ chỗ.
- Nội dung dài được cuộn trong chính danh sách. Select dropdown hiện tại ẩn kiểu thanh cuộn của dropdown; không thêm một thanh giả/canvas. Việc ẩn thanh cuộn không được làm mất khả năng cuộn bằng bánh xe, trackpad, phím hoặc cảm ứng.
- Bấm vào chữ của một lựa chọn phải kích hoạt đúng lựa chọn, đóng/mở theo hành vi component và giữ vị trí trang. Không để click hoặc focus làm trang tự nhảy xuống một đoạn.
- Không làm mất focus bàn phím; lựa chọn có thể thao tác bằng bàn phím và trạng thái focus/được chọn phải phân biệt được.
- Menu có nhiều mục phải cuộn đúng mục đang điều hướng vào tầm nhìn mà không kéo trang nền theo. Không để menu tạo dải màu hoặc khoảng trắng giả ở đáy.

## Thanh cuộn và hành vi cuộn

- Dùng cơ chế cuộn native cho trang, dialog, bảng và danh sách. Chỉ đặt `overflow` trên vùng thực sự cần cuộn; tránh lồng nhiều vùng cuộn cho cùng một nội dung.
- Thanh cuộn dialog được làm mảnh, track trong suốt và thumb xám nhạt theo style hiện có. Thanh cuộn dropdown Select đang được ẩn bằng CSS; các vùng cuộn khác giữ hành vi và khả năng truy cập mặc định trừ khi có thiết kế đã áp dụng.
- Với dialog dài, thanh cuộn nằm sát mép phải dialog và không bị padding che khuất. Nội dung cuộn không tràn ngang; footer không bị cuộn mất nếu component đang bố trí footer riêng.
- Khi menu/dialog mở, đóng hoặc người dùng chọn một dòng, giữ nguyên vị trí cuộn trang nền. Chỉ vùng đang thao tác được cuộn; không tự cuộn trang do click chữ.
- Kiểm tra ở trạng thái thanh cuộn có/không có, nội dung ngắn/dài và cửa sổ hẹp để bảo đảm không đổi kích thước hoặc sinh thanh cuộn ngang ngoài ý muốn.

## Bảng dữ liệu

- Dùng component bảng hiện có, giữ đầu cột, hàng dữ liệu, điều khiển phân trang và tổng số theo cùng một lưới.
- Control trong ô không làm tăng chiều cao hàng bất ngờ. Menu của Select trong bảng hiển thị phía trên các hàng/phân trang cần thiết và không bị cắt.
- Khi bảng rộng, cuộn ngang thuộc vùng bảng; không làm rộng toàn trang. Nút thao tác và phân trang vẫn hiện đúng vị trí của component.
- Trạng thái rỗng, đang tải và lỗi phải dùng trạng thái thực của dữ liệu; không đưa dữ liệu mẫu vào chỉ để lấp bảng.

## Checklist trước khi hoàn tất thay đổi giao diện

- [ ] Dùng component và token sẵn có; không tạo giao diện trùng lặp.
- [ ] Dialog không có nút X/phóng to trùng; nội dung dài cuộn trong thân và footer còn dùng được.
- [ ] Thanh cuộn ở đúng mép phải, không che nội dung và không làm trang đổi kích thước.
- [ ] Dropdown không bị cắt; chọn bằng cách bấm vào chữ không gây nhảy trang.
- [ ] Menu, Select, dialog và bảng không có khung xám thừa, dải màu đáy hoặc khoảng trắng bất thường.
- [ ] Các hàng/cột form thẳng, khoảng cách nhất quán, màu focus/hover/selected đúng hệ thống.
- [ ] Kiểm tra thao tác chuột, bàn phím và cuộn ở nội dung ngắn/dài, dialog mở/đóng và khung nhìn hẹp.
- [ ] Xác minh các nút thực hiện đúng hành động; không chỉ chỉnh hình thức mà làm mất chức năng.
