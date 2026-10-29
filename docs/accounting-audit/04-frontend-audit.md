# 04. Kiểm toán frontend

## Kết quả

Web cũ có 26 module tài chính, nhưng không thể dùng số lượng màn hình để đại diện cho độ hoàn thành. Nhiều thao tác đưa thông báo thành công trong khi chỉ thay state hoặc ghi JSON chung.

| Màn hình/luồng | Hành vi quan sát được | Rủi ro |
|---|---|---|
| Sổ cái | Tạo một dòng Nợ/Có, lưu finance_general_ledger; cân đối tính ở frontend trên tổng collection | Voucher mất cân đối vẫn có thể nằm trong dữ liệu; trạng thái “đã ghi sổ” gây hiểu nhầm |
| Báo cáo tài chính | B01 tổng hợp biến động tài khoản; B02 suy luận doanh thu/chi phí theo tiền tố tài khoản; B03 tổng hợp tiền | Có thể trình bày số liệu không phải biểu mẫu statutory và không reconcile với GL |
| Khóa sổ quý | Thêm nhiều dòng generic rồi cố xóa từng dòng khi có lỗi | Có thể sót một phần kết chuyển nếu rollback từng request thất bại |
| Thuế | Thêm bản ghi generic; thao tác nộp thuế đổi state component | UI hiển thị trạng thái đã nộp dù không có giao dịch nộp hoặc cập nhật backend |
| Hóa đơn điện tử | Tạo bản ghi generic nhưng thông báo đã phát hành/ký số | Mạo nhận trạng thái pháp lý/giao dịch với CQT |
| Tích hợp CQT, eTax, Google Calendar | Một số nút chỉ gọi message.info/toast | Người dùng tưởng đã đăng ký, đồng bộ, tạo lệnh nộp |
| Xuất báo cáo/PDF, ký số, thiết kế mẫu | Một số nút chỉ toast hoặc mở modal mẫu | Chưa có artifact/kết nối ngoài tương ứng |
| Tài sản, trả trước, khoản vay, vốn | Một số form dùng generic save; nút xuất/in hiển thị thành công | Không chứng minh tính toán hay chứng từ đã được lưu đúng nghiệp vụ |
| Tài khoản ngân hàng | Có chọn file sao kê nhưng một số đường đi chỉ báo thành công | Không chứng minh parse/import/reconcile statement |

## Ứng dụng Rust hiện tại

Tài chính Rust có các API typed cho cash transactions, bank accounts và bank transfers. Trong [finance.rs](../../ui/src/views/finance.rs#L1866-L1953), các route thuế, sổ cái, hóa đơn và tài chính khác gắn với scope generic; nhiều trang con được mô tả là static/missing implementation. Export có nút disable và một số thao tác chỉ dựng dữ liệu minh họa.

Điều này cho thấy hai frontend không có cùng độ sâu nghiệp vụ: web cũ có nhiều form hơn; Rust có API typed cho một số luồng tiền nhưng nhiều phân hệ mới chỉ là khung. Không đánh giá bằng ảnh chụp UI hoặc sự hiện diện của route.

## Build và typecheck

- npm run typecheck: PASS.
- npm run build: PASS; Vite build được 5.283 modules.
- Build cảnh báo main JS chunk khoảng 4.884 kB và DOCX modal khoảng 521 kB; cần tối ưu tải nếu là mục tiêu hiệu năng, nhưng không phải bằng chứng lỗi nghiệp vụ kế toán.
- npm test: 155/155 PASS; trong đó ledger-calculations có 3 bài test phép tính, không kiểm chứng journal API hoặc báo cáo pháp định.

Không thực hiện browser E2E hoặc kiểm tra giao diện trên môi trường deploy. Chi tiết phát hiện xem [11. Danh sách phát hiện](11-defects.md).
