# 09. Bảo mật, phân quyền và kiểm soát nội bộ

## Kiểm soát thấy trong source/test

- Legacy API yêu cầu admin cho nhiều thao tác cash, transfer và finance; payroll có kiểm tra quyền riêng.
- Test transfer kiểm tra role, PIN, số dư, retry, rollback, concurrency, hủy/đảo và audit.
- Rust bank accounts mã hóa account number at rest; có test fail closed nếu thiếu encryption key.
- Có audit_events legacy và các luồng payroll/transfer ghi sự kiện.
- Generic collection có owner_id và các route xác thực; Rust phân quyền mutation admin cho collection chung.

## Khoảng trống chưa được chứng minh

- Không chạy test đầy đủ ma trận role × module × hành động; chưa kiểm tra user tự lập/tự duyệt, sửa/xóa voucher đã ghi sổ hoặc truy cập tenant khác.
- Chưa xác minh trường finance scope nào bị lọc theo owner/company; không kết luận isolation đạt hay có lỗ hổng production.
- Không chứng minh audit log append-only, đủ old/new value, không thể xóa, có timestamp đáng tin và bao phủ mọi API/direct DB change.
- Chưa kiểm tra session, CSRF/CORS, rate limit, brute force, secret rotation, dependency CVE hoặc deployment headers/config.
- Chữ ký số chưa chứng minh CA, bảo vệ private key, quyền ký và chứng thư hợp lệ.
- Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 và NĐ 356/2025/NĐ-CP có hiệu lực từ 01/01/2026; chưa kiểm tra notice/consent, purpose limitation, data subject request, retention/deletion hoặc luồng dữ liệu ra ngoài.

## Đánh giá rủi ro

Các test chuyển khoản cho thấy kiểm soát tốt trong một phạm vi API. Không thể ngoại suy sang GL/tax/e-invoice hay phân quyền toàn hệ thống. Do generic financial collections và các trạng thái thành công giả, cần ngăn sử dụng dữ liệu đó làm chứng từ chính thức cho đến khi có kiểm soát vai trò, phê duyệt, audit và đối soát đầu-cuối.

Không thực hiện penetration test hoặc truy cập tài khoản production.
