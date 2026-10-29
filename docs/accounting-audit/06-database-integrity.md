# 06. Toàn vẹn cơ sở dữ liệu

## Schema nhìn thấy trong mã nguồn

| Dữ liệu | Cấu trúc quan sát được | Nhận xét |
|---|---|---|
| Giao dịch tiền mặt legacy | finance_cash_transactions, amount > 0, loại/trạng thái/source có check | Ràng buộc hữu ích ở miền cash; không áp đặt đối ứng Nợ/Có |
| Chứng từ bán/mua legacy | finance_documents có loại, số tiền, đã trả, VAT và ngày | Có cấu trúc nghiệp vụ nhưng chưa có journal lines/liên kết GL bắt buộc |
| Tài khoản ngân hàng legacy | finance bank account table | Không đồng nghĩa kết nối ngân hàng |
| Sổ cái/thuế/hóa đơn legacy | collection_records(scope, record_key, owner_id, payload_json, timestamps) | Generic JSON; không có ràng buộc schema kế toán cho các scope này |
| Bằng chứng audit legacy | audit_events | Có bảng sự kiện; chưa chứng minh mọi thay đổi kế toán được log bất biến |
| Tài chính Rust | finance_cash_transactions, finance_bank_accounts, finance_bank_transfers | Typed schema cho các luồng tiền; chưa có bảng dedicated journal, tax filing hoặc issued invoice trong phần finance schema đã đọc |

## Rủi ro dữ liệu

- Không có khóa ngoại cho từng line item GL tới journal header/account trong phần schema đã rà.
- Không có database constraint đảm bảo cân đối từng bút toán.
- Generic JSON làm cho cấu trúc payload có thể lệch giữa client/version và không bảo đảm truy vấn tổng hợp theo tài khoản đúng.
- Bảng owner_id có mặt ở generic collection; chưa kiểm tra dữ liệu production hoặc toàn bộ logic tenant isolation nên không kết luận cô lập doanh nghiệp đạt.
- Không có kiểm chứng retention, archive, backup, restore, encryption backup, replication, migration rollback hoặc integrity scan trên database thực.
- Thiết kế transfer có transaction/rollback đã được test; thiết kế đóng sổ phía UI lại tạo/xóa record từng bước nên không có atomicity tương đương.

## Kiểm tra dữ liệu thực

Không truy cập database production hoặc file SQLite vận hành. Vì vậy chưa thể đưa ra số lượng duplicate, orphan, cân đối, số dư đầu kỳ/cuối kỳ, dữ liệu sai kỳ hoặc completeness của audit log. Không đọc .env và không chạy migration lên dữ liệu thật.

## Khuyến nghị schema

Trước khi dùng sổ thật, cần có chart_of_accounts có version/chế độ; journal_entries header và journal_lines có kiểm tra tổng; fiscal_periods với lock/reopen audit; liên kết nguồn chứng từ; idempotency key; foreign keys; decimal/đơn vị tiền rõ ràng; trạng thái draft/approved/posted/reversed; và sự kiện audit không thể sửa/xóa bởi người nhập liệu thông thường.
