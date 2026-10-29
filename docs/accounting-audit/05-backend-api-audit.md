# 05. Kiểm toán backend và API

## Các họ API đã đọc mã nguồn

| Họ API | Bằng chứng/hành vi | Giới hạn |
|---|---|---|
| finance/cash-transactions (legacy) | Tạo/xem/hủy cash transaction, kiểm tra payload và phân quyền admin | Không tự tạo journal kép |
| finance/internal-transfers (legacy) | Transaction, tạo chân OUT/IN/phí, idempotency, khóa/kiểm tra số dư, audit và rollback | Không thực hiện chuyển khoản ra ngân hàng; trạng thái là ledger_only |
| finance/documents (legacy) | Tạo chứng từ trong bảng chuyên biệt và có thể sinh cash transaction tự động | Không chứng minh GL, hóa đơn thuế hay mapping tài khoản |
| finance bank accounts (legacy/Rust) | API chuyên biệt; Rust mã hóa số tài khoản at rest và fail closed khi thiếu khóa | Không có kết nối statement/bank được xác minh |
| payroll preview/post/adjust (legacy) | Luồng riêng, transaction/lock/fingerprint/chống duplicate/audit | Định khoản cuối vẫn ở collection generic; chưa test tính lương theo hồ sơ/law |
| generic collections | GET/POST/DELETE cho scope tài chính; một số kiểm soát theo scope | finance_general_ledger, finance_tax, finance_einvoices không có validator kế toán tương ứng |
| finance routes Rust | Typed API chỉ cho cash transactions, bank accounts, bank transfers; route collection tổng quát cho các scope khác | Không có API typed cho GL, thuế, tờ khai, e-invoice và báo cáo |

Danh sách trên là các họ nghiệp vụ được đọc trực tiếp, không phải tổng số mọi endpoint trong repository. Runtime smoke/E2E của các API kế toán trong ma trận 70 ca: 0.

## Kiểm soát tích cực đã thấy

- API chuyển khoản nội bộ kiểm tra vai trò/PIN và điều kiện số dư; có idempotency, kiểm thử request retry, lỗi DB rollback, concurrent spending, reverse/cancel và audit.
- API bank accounts Rust mã hóa số tài khoản at rest và fail closed nếu không có encryption key.
- API payroll có khóa/giao dịch, chống ghi trùng và ghi audit.
- Legacy API có kiểm tra admin cho nhiều thao tác tài chính nhạy cảm.

Các kiểm soát này chỉ chứng minh những route/test cụ thể, không chứng minh tính đúng của sổ cái, thuế, toàn bộ phân quyền hoặc deployment.

## Khoảng trống backend

1. Không có service/journal endpoint tổng quát làm nguồn chuẩn cho debit/credit, chart of accounts và posting period.
2. Collection validator tổng quát không xác minh tổng Nợ bằng tổng Có mỗi voucher, account tồn tại, kỳ mở hoặc trạng thái ghi sổ.
3. Tax/e-invoice handlers không được thấy trong các thao tác UI tương ứng; các thao tác mẫu không đi đến CQT/nhà cung cấp.
4. Một số thao tác legacy của UI chỉ ghi local state/generic records; thông báo UI không được backend xác nhận.
5. Cần một ma trận API đầy đủ: method/path, auth, scope ownership, schema, idempotency, transaction, audit event, error contract và test. Báo cáo này chỉ đếm họ API kế toán đã truy vết, không đưa ra tổng endpoint toàn hệ thống chưa kiểm kê.

## Bằng chứng

- [Finance database/API legacy](../../legacy/api/db.mjs#L271-L329)
- [API transfers/documents/payroll](../../legacy/api/index.mjs#L8600-L8645)
- [Finance routes Rust](../../server/src/main.rs#L1247-L1264)
- [Generic collection routes Rust](../../server/src/main.rs#L1359-L1366)
- [Rust finance schema](../../server/src/finance.rs#L14-L75)
