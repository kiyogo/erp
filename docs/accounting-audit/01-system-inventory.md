# 01. Kiểm kê hệ thống

## Kiến trúc tìm thấy

Repository có hai ứng dụng quản trị song song. Báo cáo giữ riêng hai kiến trúc, không xem chúng là một phiên bản duy nhất.

| Thành phần | Công nghệ/đường dẫn | Vai trò kế toán |
|---|---|---|
| Web cũ | legacy/web; React 18, TypeScript, Vite | 26 màn hình tài chính và các luồng nhập liệu người dùng. |
| API cũ | legacy/api; Node.js ESM | Các API tài chính, xác thực/ủy quyền, tích hợp dữ liệu và lược đồ SQLite/PostgreSQL. |
| Ứng dụng Rust | Cargo workspace: server, ui, web, desktop | Giao diện và server thế hệ hiện tại; API tài chính có kiểu cho một số nghiệp vụ tiền. |
| Database web cũ | SQLite hoặc PostgreSQL, lựa chọn qua cấu hình runtime | Bảng tài chính chuyên biệt cộng collection_records JSON. Không mở cấu hình bí mật hoặc database production. |
| Database Rust | server/src/finance.rs và schema cài trong server | Có bảng chuyên biệt cash transactions, bank accounts, bank transfers; nhiều scope khác đi qua generic collections. |
| Xác thực/phân quyền | Legacy API có kiểm tra user/admin ở các tuyến; Rust server dùng session/auth và kiểm tra quyền ở route | Chỉ đọc mã nguồn và test hiện có; không kiểm tra cấu hình production. |
| Tác vụ nền/storage/tích hợp | Có cấu hình và các module khác của ứng dụng; chưa lập được danh mục đầy đủ chứng minh phần kế toán đang dùng | Không xác minh runtime, credentials hoặc dịch vụ bên ngoài. |

## Các màn hình tài chính web cũ

Tìm thấy 26 module TSX: Advances, BankAccounts, Budget, CashFlow, CashForecast, CashTransactions, Costing, Debts, DigitalSignature, EInvoice, Equity, FinanceOverview, FixedAssets, GeneralLedger, InternalTransfer, Inventory, Invoices, Loans, Payments, Payroll, PettyCash, PrepaidExpenses, PurchaseRequests, Purchasing, Sales và Tax.

## Sơ đồ dữ liệu/nghiệp vụ quan sát được

1. Một số nghiệp vụ tiền đi qua bảng chuyên biệt; chuyển khoản nội bộ tạo các chân tiền mặt liên kết trong transaction.
2. Chứng từ bán/mua được lưu trong finance_documents; có tuyến tự động ghi một số giao dịch tiền.
3. Lương được xử lý qua API riêng để xem trước, ghi sổ và điều chỉnh; dòng ghi sổ vẫn được lưu trong collection_records.
4. Sổ cái, thuế và hóa đơn điện tử ở web cũ chủ yếu dùng collection_records với JSON payload.
5. Trong Rust, API typed hiện bao phủ tiền mặt, tài khoản ngân hàng và chuyển khoản; các scope tài chính khác có thể truy cập collection tổng quát nhưng không có mô hình kế toán kép tương ứng.

## Giới hạn kiểm kê

- Không mở legacy/api/.env và không đưa thông tin xác thực vào báo cáo.
- Không kết nối PostgreSQL/SQLite production; do đó không xác minh bảng thật, bản ghi thật, migration đã chạy, quyền DB, backup hoặc dữ liệu bẩn.
- Không có thông tin định danh doanh nghiệp, ngành nghề, quy mô, kỳ tài chính, phương pháp thuế hay chế độ kế toán. Không suy đoán áp dụng Thông tư 99, 133 hay 58.
- Danh mục thành phần dựa trên source tree và manifest; không phải kiểm kê hạ tầng triển khai hay dịch vụ đang hoạt động.

## Bằng chứng chính

- [Danh sách module tài chính web cũ](../../legacy/web/src/modules/finance)
- [Lược đồ API/database cũ](../../legacy/api/db.mjs)
- [Các tuyến API cũ](../../legacy/api/index.mjs)
- [Lược đồ tài chính Rust](../../server/src/finance.rs)
- [Các tuyến server Rust](../../server/src/main.rs)
- [Các màn hình tài chính Rust](../../ui/src/views/finance.rs)
