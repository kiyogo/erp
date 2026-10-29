# 13. Lộ trình hoàn thiện

Lộ trình này đề xuất thứ tự; không phải đã triển khai. Không sửa nghiệp vụ trong lượt kiểm toán.

## Giai đoạn 0 — Ngăn hiểu nhầm trạng thái (ưu tiên tức thời)

1. Ẩn hoặc đổi nhãn các trạng thái “đã ghi sổ”, “đã nộp thuế”, “đã phát hành/ký” nếu backend/provider chưa xác nhận.
2. Tắt thao tác có thể bị người dùng hiểu là đã gửi CQT, đã ký hoặc đã chuyển tiền khi chưa có integration thật.
3. Tách dữ liệu demo khỏi tenant/database vận hành; gắn nhãn dữ liệu mẫu.

**Tiêu chí thoát:** UI chỉ thông báo thành công sau khi backend trả trạng thái xác nhận; trường hợp demo hiển thị rõ là bản nháp/mô phỏng.

## Giai đoạn 1 — Xác định quy tắc doanh nghiệp và pháp luật

1. Thu thập pháp nhân, quy mô, ngành, năm tài chính, chế độ, tiền tệ, chi nhánh, thuế GTGT/TNDN, giao dịch ngoại tệ, payroll và kiểm toán bắt buộc.
2. Kế toán trưởng/chuyên gia thuế chốt chart, mẫu, kỳ, rule và chuyển tiếp 2025–2026.
3. Lưu cấu hình pháp lý theo version/effective date; có phê duyệt thay đổi.

**Phụ thuộc:** hồ sơ doanh nghiệp và ý kiến chuyên môn.

## Giai đoạn 2 — Sổ cái và tính toàn vẹn

1. Thiết kế schema chart of accounts, journal header/lines, source link, fiscal period, approval, posted/reversed và idempotency.
2. Enforce cân đối, account tồn tại, ngày/kỳ, quyền sửa/xóa và kỳ khóa ở server/database.
3. Ghi audit append-only, tạo snapshot số dư và quy trình đóng/mở kỳ có phê duyệt.
4. Xác định migration/import có đối chiếu; không viết lại lịch sử âm thầm.

**Tiêu chí thoát:** negative tests TC40–43/47–48 và concurrency/integrity được chạy trên database thử nghiệm.

## Giai đoạn 3 — Liên kết nghiệp vụ và báo cáo

1. Chuẩn hóa nguồn từ sales, purchasing, payments, inventory, assets, payroll sang journal.
2. Thiết kế report mapping theo chế độ đã chọn; lập báo cáo từ posted journal.
3. Reconcile cash/bank, receivable/payable, inventory, fixed assets, payroll và tax.
4. Xác minh report bằng bộ dữ liệu chuẩn được kế toán độc lập tính lại.

## Giai đoạn 4 — Thuế và hóa đơn điện tử

1. Xây tax rules theo luật/kỳ và kiểm thử biên/ngoại lệ; có workflow review trước khi lập tờ khai.
2. Tích hợp nhà cung cấp hóa đơn/CQT trong sandbox; kiểm tra certificate, request/response, retry, adjustment/replacement/cancel.
3. Nối trạng thái bên ngoài về backend; lưu payload, chữ ký, mã tra cứu, response và audit.
4. Không dùng production credentials trong test suite.

## Giai đoạn 5 — Bảo mật, phục hồi và nghiệm thu

1. Chạy ma trận quyền và tenant isolation; kiểm thử API mutation, concurrency, audit, backup/restore.
2. Chạy 70 E2E + regression + UAT bằng bộ dữ liệu hợp pháp đã ẩn danh.
3. Chạy đủ SQLite và PostgreSQL test trên database dùng riêng, xác nhận backup/restore.
4. Kế toán trưởng ký xác nhận kết quả; quản lý triển khai phê duyệt rollout và kế hoạch rollback.

**Điều kiện dùng thật:** tất cả kiểm soát bắt buộc PASS; không còn BLOCKED/NOT TESTED; số liệu độc lập khớp; tích hợp pháp lý được xác minh trên sandbox và production readiness được chủ sở hữu phê duyệt.
