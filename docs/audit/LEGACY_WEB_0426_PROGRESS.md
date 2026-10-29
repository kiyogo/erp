# Đối chiếu web cũ với video 0426

Ngày rà soát: 2026-10-29

Phạm vi: `legacy/web` và API legacy hiện hữu. Không đánh giá ứng dụng Rust hoặc website mới.

Nguồn yêu cầu: video `0426.mp4`, phần bóc tính năng và workbook `LegacyWeb_0426_Audit.xlsx`.

## Tóm tắt tiến độ

- Video và checklist bóc ra **29 ứng dụng** và **973 gạch đầu dòng yêu cầu**. Workbook được lập trước các thay đổi ngày 26–29/10 nên trạng thái thiếu module trong workbook đã cũ ở một số mục.
- Web hiện có **20 nhóm module** trong kiến trúc legacy. Có code liên quan cho phần lớn ứng dụng trong video, nhưng nhiều mục chỉ đạt một phần và chưa được click-through/đối chiếu từng trạng thái.
- Không có số phần trăm hoàn thành tính năng đáng tin cậy: chưa gắn đủ 973 yêu cầu với kiểm thử thao tác, quyền, API, dữ liệu sau tải lại và trạng thái lỗi. Số module hay test tổng không thể thay thế việc nghiệm thu từng yêu cầu.
- Những ứng dụng chưa thấy luồng tương đương trong web cũ: **Cộng đồng MISA, Kế toán HTX, Website MISA AMIS và eShop**. Chat nội bộ không thay thế feed cộng đồng; các màn hình tài chính/kho chung không tương đương kế toán HTX hoặc cửa hàng trực tuyến.
- Các tích hợp phụ thuộc dịch vụ ngoài chưa được xác nhận hoạt động thật gồm FaceID, eBH/VssID, PKI/WeSign, ngân hàng điện tử, Meet/Teams và AI có nhà cung cấp. Không tính nút bấm hoặc dữ liệu cấu hình là tích hợp thành công.

## Bảng đối chiếu 29 ứng dụng

| # | Ứng dụng trong video | Tình trạng source hiện tại | Còn thiếu hoặc chưa nghiệm thu |
|---:|---|---|---|
| 1 | AMIS Hệ thống | Có quản trị người dùng, vai trò/quyền, đơn vị tổ chức, thiết lập công ty, nhật ký, thùng rác và báo cáo sử dụng ứng dụng. | Chưa so khớp đủ hồ sơ công ty, các mục cài đặt và báo cáo trên từng màn hình video; quyền cần kiểm tra ở từng thao tác. |
| 2 | AMIS Kế toán | Có các phân hệ tiền, ngân hàng, chứng từ, sổ cái, công nợ, hóa đơn, mua/bán, thuế, lương, tài sản và kho. | E-banking/meInvoice chưa được xác nhận với nhà cung cấp; cần rà từng báo cáo, định khoản, đối chiếu và luồng chốt sổ theo checklist. |
| 3 | Cộng đồng MISA | Chưa thấy ứng dụng feed cộng đồng trong web cũ. | Thiếu bài viết, hỏi đáp, bình luận/trả lời, lượt thích/xem, theo dõi, chuyên gia, xếp hạng và gói hỗ trợ. Chat nội bộ là nghiệp vụ khác. |
| 4 | AMIS Tiền lương | Có tính lương, phiếu lương, xuất lệnh chuyển khoản và ghi bút toán lương vào sổ cái. | Chưa xác minh trọn luồng chấm công → tính lương → phản hồi phiếu → chi tiền; việc tạo lệnh không đồng nghĩa ngân hàng đã nhận tiền. |
| 5 | AMIS Chấm công | Có ca, phân ca, chấm công, bảng công, giải trình, nghỉ phép, làm thêm và cảnh báo. | FaceID/thiết bị chưa có kết nối được xác nhận; cần kiểm tra dữ liệu nguồn, quyền duyệt, tính phép và các báo cáo. |
| 6 | AMIS Bảo hiểm xã hội | Có hồ sơ lao động, điều chỉnh, chế độ, đối soát và chi phí bảo hiểm. | Chưa có bằng chứng gửi/nhận hồ sơ thật với eBH/VssID hoặc cơ quan BHXH. |
| 7 | AMIS Phòng họp | Có danh mục phòng, đặt/hủy lịch, kiểm tra xung đột và lịch sử đặt. | Chưa xác minh báo cáo sử dụng theo kỳ và đồng bộ Meet/Teams. |
| 8 | AMIS Văn thư | Có thư viện tài liệu, lưu trữ, ghi chú/chỉ đạo và mẫu hợp đồng. | Cần đối chiếu sổ văn bản đến/đi, phát hành, luân chuyển và tìm kiếm như video. |
| 9 | AMIS Mua hàng | Có chứng từ mua hàng, yêu cầu mua hàng và quy trình xác định nhà cung cấp. | Cần rà đủ tổng hợp nhu cầu, so sánh/lựa chọn nhà cung cấp, duyệt, nhận hàng, công nợ và các bộ lọc theo video. |
| 10 | AMIS aiMarketing | Đã có chọn Email Marketing/Marketing Automation, chọn nhiều mục tiêu, lưu và sửa thiết lập qua API. | Chưa có bằng chứng gửi chiến dịch, phân nhóm, theo dõi tương tác hoặc chạy automation; video/checklist hiện chỉ xác nhận luồng chọn mục tiêu. |
| 11 | AMIS Tài sản | Có danh mục và các luồng cấp phát/thu hồi, điều chuyển, sửa chữa, bảo trì, thanh lý, kiểm kê, khấu hao, vật tư, license và nhiệm vụ. | Chưa nghiệm thu mọi trường, báo cáo, biểu mẫu, chữ ký và tình huống lỗi ở từng màn hình. |
| 12 | AMIS Mục tiêu | Có kế hoạch, mục tiêu, mốc, tiến độ, lộ trình và báo cáo. | Cần so khớp đủ BSC/MBO, phân rã theo tổ chức/nhân viên, quyền và các trường/mẫu trong video. |
| 13 | AMIS Công việc | Có giao việc, checklist, tiến độ, cộng tác viên, báo cáo, ma trận Eisenhower và file báo cáo được lưu qua API. | Chưa xác minh đủ Gantt, các loại báo cáo, dashboard chia sẻ, thông báo và phân quyền theo video. |
| 14 | AMIS Nhân viên | Có hồ sơ, cổng nhân viên, hợp đồng, onboarding, nghỉ/làm thêm, phiếu lương, đề xuất, tài sản, file và chữ ký cá nhân. | Cần kiểm tra từng nhóm hồ sơ và self-service; eKYC/OCR không đồng nghĩa xác minh danh tính bởi nhà cung cấp. |
| 15 | AMIS Tuyển dụng | Có tin tuyển dụng, vòng đời ứng viên, lịch phỏng vấn, kho ứng viên và trang ứng tuyển công khai. | Cần nghiệm thu mọi bước funnel, email/lịch, báo cáo và xuất dữ liệu; không coi chỉ số tĩnh là dữ liệu tuyển dụng. |
| 16 | AMIS Thuế TNCN | Có phân hệ thuế và dữ liệu liên quan bảng lương. | Chưa có bằng chứng khai/nộp điện tử, chữ ký số và truyền nhận chứng từ với cơ quan thuế. |
| 17 | AMIS Khuyến mại | Đã có chương trình khuyến mại, tìm/lọc, bật/tắt, xuất dữ liệu; khuyến mại đủ điều kiện được tính vào đơn bán; tích điểm gắn giao dịch bán hàng và đổi/trả thưởng. | Cần kiểm tra toàn bộ tổ hợp điều kiện, hoàn/hủy đơn, chống áp dụng trùng, phân quyền và báo cáo đối soát. |
| 18 | AMIS Quy trình | Có danh mục blueprint, yêu cầu, duyệt, lịch sử, OTP cho phê duyệt lớn và nhắc việc quá hạn. | Chưa có trình thiết kế BPMN/luồng trực quan và bằng chứng engine tự động chạy mọi node như video; chữ ký PKI còn thiếu. |
| 19 | AMIS CRM | Có khách hàng/liên hệ, đối tác, nhà cung cấp, đánh giá, phản hồi, bán hàng và khuyến mại/tích điểm. | Chưa xác minh đủ pipeline cơ hội, báo giá/đơn hàng và AI/AVA; cần rà các bộ lọc, lịch sử tương tác và phân quyền. |
| 20 | AMIS Danh bạ | Có danh bạ liên hệ CRM và hồ sơ nhân viên. | Chưa thấy đầy đủ nhãn, yêu thích, gần đây và tìm kiếm ngôn ngữ tự nhiên của danh bạ hợp nhất. |
| 21 | AMIS Điều hành – Beta | Có dashboard quản trị, báo cáo sử dụng ứng dụng và báo cáo nghiệp vụ. | Chưa chứng minh mọi lát cắt doanh số/khách hàng/nhân sự lấy từ nguồn thật và lọc theo quyền; chưa có AI/AVA xác thực. |
| 22 | AMIS Workflow – Beta | Có các trang quy trình dùng chung với AMIS Quy trình. | Chưa có ứng dụng dựng sơ đồ và thực thi quy trình tự động riêng như video. |
| 23 | AMIS Kho ảnh | Có quản lý tệp/thư mục chung. | Chưa có thư viện ảnh riêng với album, metadata, bộ lọc ảnh và xem trước theo đặc thù media. |
| 24 | AMIS Kho hàng riêng | Inventory đã có kho, vị trí/bố trí, lô/hạn dùng, barcode, phương pháp xuất kho, giao hàng và nhận hàng hoàn về. | Vẫn nằm trong phân hệ tài chính, chưa chứng minh đầy đủ ứng dụng kho riêng, dashboard và mọi nghiệp vụ video. |
| 25 | AMIS Kế toán HTX | Chưa có luồng kế toán HTX riêng. | Thiếu khởi tạo lĩnh vực/chi nhánh HTX, cấu hình chuyển đổi, bán hàng và các báo cáo/tiện ích HTX trong checklist. |
| 26 | Website MISA AMIS | Không thuộc giao diện KIYOVN Enterprise trong repo. | Không có website tiếp thị sản phẩm, gói giá, đăng ký tư vấn/dùng thử như phần video mở ngoài hệ thống. |
| 27 | AMIS WeSign / Tài liệu điện tử | Có thư viện tài liệu, trình soạn Word/DOCX đã tích hợp, mẫu và chữ ký nội bộ liên quan. | Chưa xác minh gửi-ký-nhận qua PKI/chứng thư số, chuỗi tin cậy và báo cáo WeSign với nhà cung cấp thật. |
| 28 | AMIS Đánh giá | Có phiếu đánh giá lưu qua API, nhân viên/người đánh giá từ danh mục thật, điểm, duyệt, tìm kiếm và xuất XLSX/PDF. | Chưa có bằng chứng chính sách 360/KPI cấu hình đầy đủ, tích hợp thưởng vào bảng lương và đối chiếu tất cả trường của video. |
| 29 | Cửa hàng / MISA eShop | Chưa thấy luồng cửa hàng trực tuyến trong web cũ. | Thiếu đăng ký cửa hàng, tên miền, tài khoản người bán và trang quản lý eShop. |

## Các thay đổi đã có trong web cũ kể từ workbook gốc

- Thêm app launcher trong header, tìm kiếm không phân biệt dấu, nhóm danh mục, mục yêu thích lưu theo người dùng và chỉ điều hướng đến route đang tồn tại.
- Thêm luồng aiMarketing chọn sản phẩm/mục tiêu và lưu thiết lập trên API.
- Thêm yêu cầu mua hàng và quy trình xác định nhà cung cấp.
- Thêm ứng viên tuyển dụng, trạng thái vòng đời, lịch phỏng vấn, kho ứng viên và trang nhận hồ sơ.
- Thêm chương trình khuyến mại/tích điểm nối với đơn bán hàng.
- Bổ sung bố trí kho, nhận hàng hoàn, báo cáo Eisenhower và lưu báo cáo công việc/đính kèm.
- Bổ sung luồng duyệt tài sản thanh lý, OTP cho một số phê duyệt và nhắc các yêu cầu quá hạn.
- Tích hợp editor DOCX từ `E:\DATA\source\Nom\nomw\docs` vào giao diện web legacy hiện tại; không tạo ứng dụng web mới.

## Cách đọc trạng thái và việc còn lại

“Có code” chỉ xác nhận đã tìm thấy thành phần trong source; “có luồng” chỉ xác nhận có hành động/API tương ứng. Chưa đánh dấu hoàn thành cấp ứng dụng nếu chưa xác minh đủ dữ liệu, quyền, trạng thái tải/lỗi/rỗng, lưu sau khi tải lại và mọi yêu cầu trong checklist.

Để đạt parity thực sự, cần cập nhật trạng thái ở từng dòng của checklist 973 mục sau khi đối chiếu component/API và chạy luồng tương ứng. Ưu tiên tiếp theo trong web cũ: (1) xử lý các ứng dụng chưa có tương đương; (2) hoàn tất nghiệp vụ còn thiếu ở quy trình, kế toán/kho, CRM và chấm công; (3) kiểm tra các tích hợp ngoài chỉ sau khi có hợp đồng API, thông tin cấu hình và môi trường thử nghiệm; (4) chạy click-through theo video ở cùng kích thước màn hình.

## Kiểm thử đã chạy cho thay đổi web gần nhất

Ở commit `e387bca`, `legacy/web` đã đạt 155/155 bài test, typecheck và build production. Dev server trả HTTP 200 cho trang và module launcher. Build còn cảnh báo bundle chính khoảng 4.88 MB và chunk editor DOCX khoảng 521 KB. Các kết quả này kiểm tra source/build và launcher; **không phải** nghiệm thu runtime toàn bộ 29 ứng dụng hay 973 yêu cầu.
