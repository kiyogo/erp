# 11. Danh sách phát hiện và lỗi

Mức độ phản ánh rủi ro nếu người dùng dựa vào hành vi hiện tại cho nghiệp vụ thật. Chưa biết deployment hoặc người dùng đã sử dụng hay chưa. Không phát hiện P0 trong phạm vi source/test đã xem; điều này không xác nhận hệ thống production không có P0.

| ID | Mức | Phát hiện | Bằng chứng | Tác động | Trạng thái |
|---|---|---|---|---|---|
| FIN-01 | P1 | Sổ cái không kiểm tra cân đối từng voucher/tài khoản | [GeneralLedgerModule.tsx](../../legacy/web/src/modules/finance/GeneralLedgerModule.tsx#L68-L117); generic collection API | Cho phép dữ liệu không đủ điều kiện ghi sổ được hiển thị là đã ghi | Mở |
| FIN-02 | P1 | Báo cáo B01/B02/B03 dùng tổng hợp và heuristic, chưa phải báo cáo statutory đã đối chiếu | [GeneralLedgerModule.tsx](../../legacy/web/src/modules/finance/GeneralLedgerModule.tsx#L143-L153); [ledgerCalculations.ts](../../legacy/web/src/modules/finance/ledgerCalculations.ts#L30-L67) | Sai lệch báo cáo, không thể dùng khai/nộp hoặc ký | Mở |
| FIN-03 | P1 | UI hóa đơn có thể báo đã phát hành/ký khi chỉ lưu generic payload | [EInvoiceModule.tsx](../../legacy/web/src/modules/finance/EInvoiceModule.tsx#L67-L82) | Người dùng có thể hiểu nhầm hóa đơn đã có hiệu lực/CQT nhận | Mở |
| FIN-04 | P1 | Nút nộp thuế xác nhận thành công bằng state UI, không có giao dịch backend trong handler | [TaxModule.tsx](../../legacy/web/src/modules/finance/TaxModule.tsx#L68-L90) | Nghĩa vụ thuế có thể bị bỏ sót dù UI thể hiện đã nộp | Mở |
| FIN-05 | P1 | Công thức thuế và kỳ pháp lý 2026 chưa được triển khai/kiểm chứng | TaxModule chứa dữ liệu mẫu; chưa có test tính/kê khai | Sai thuế, truy thu/phạt nếu dùng số liệu | Mở |
| FIN-06 | P1 | Không có cơ chế xác định regime/profile doanh nghiệp trước khi dựng tài khoản, thuế, báo cáo | Chưa tìm thấy cấu hình được xác minh | Không thể biết mẫu/công thức có áp dụng cho doanh nghiệp hay không | Mở |
| FIN-07 | P2 | Các sổ thuế, hóa đơn và GL lưu ở JSON collection thay vì schema nghiệp vụ | [db.mjs](../../legacy/api/db.mjs#L672-L702) | Khó ràng buộc, truy vấn, migration, audit và chống dữ liệu lệch | Mở |
| FIN-08 | P2 | Đóng sổ quý tạo/xóa nhiều bản ghi tuần tự, không có transaction bao trọn | [GeneralLedgerModule.tsx](../../legacy/web/src/modules/finance/GeneralLedgerModule.tsx#L155-L216) | Có thể tạo trạng thái kết chuyển một phần khi lỗi giữa chừng | Mở |
| FIN-09 | P2 | Các luồng bán/mua/tiền/kho chưa chứng minh liên kết một-một tới GL | finance_documents, cash, inventory và collection scopes tách nhau | Có nguy cơ thiếu hoặc ghi trùng kế toán | Mở |
| FIN-10 | P2 | Ứng dụng Rust còn nhiều trang finance tĩnh/chỉ dùng generic scope | [finance.rs](../../ui/src/views/finance.rs#L1914-L1953) | UI cho cảm giác có chức năng nhưng thiếu API nghiệp vụ | Mở |

## Tổng hợp mức độ

| Mức | Số phát hiện |
|---|---:|
| P0 xác nhận | 0 |
| P1 | 6 |
| P2 | 4 |
| P3 | 0 |

Các mục FIN-05/06 là thiếu bằng chứng và năng lực cần thiết; không khẳng định đã có tờ khai sai hoặc doanh nghiệp đã vi phạm. Khắc phục theo [13. Lộ trình](13-improvement-roadmap.md).
