# Tiến độ sửa và hoàn thiện web cũ

Ngày cập nhật: 2026-10-26. Phạm vi yêu cầu: toàn bộ tính năng hiện tại và đối chiếu video 0426.mp4 + văn bản người dùng. Chưa hoàn thành toàn bộ phạm vi này.

Giữ React/custom UI, Node HTTP, collections API, PostgreSQL/SQLite và Canvas editor. Không xóa menu, module hay dữ liệu hiện tại. Các thay đổi đã có trước trong KTable, smart-table, package files, Vite và dự án Rust được giữ nguyên.

## Đã sửa trong đợt hiện tại

| Phần | Trước | Sau | Bằng chứng |
|---|---|---|---|
| TypeScript | Biến chưa định nghĩa; kiểu dữ liệu sai ở form, phiên đăng nhập, HR, công việc, OTP | Sửa biến và hợp đồng dữ liệu theo implementation | `npx tsc --noEmit` |
| Database | 12 luồng mở transaction bằng SQL qua pool; SQLite có thể lẫn yêu cầu khác vào transaction | Dùng `db.transaction`; tuần tự hóa kết nối SQLite; chờ ghi checklist, collection và chứng từ | `api/tests/database.test.mjs`, `api/tests/api-smoke.test.mjs` |
| Ngân sách | Biểu đồ/kế hoạch chứa số mẫu; nút Excel chỉ báo thành công; có thể chia 0 | Dữ liệu collection; XLSX thật; API xác thực số tiền và tính lại số dư/tỷ lệ/trạng thái | API smoke budget + kiểm thử XLSX |
| PDF dùng chung | Chỉ một trang, mất phần nội dung dài; tự in xác nhận chữ ký số | Xuống dòng/chia trang, không tự xác nhận chữ ký | `web/tests/export-and-auth.test.mjs` |
| Phiếu lương | Tải file mẫu; gửi tên tháng thay mã bản ghi; hai mã phiếu luôn được coi đã ký | Xuất số liệu thực; xác nhận qua PATCH, chờ thành công; không tự coi xác nhận là chữ ký CA | `web/tests/payslip.test.mjs` |
| OTP | Khóa rỗng sinh `000000` | Khóa rỗng bị từ chối; tương thích Web Crypto | Vector RFC 6238 trong test |
| Nghỉ phép | Tự gán tên chức danh, số điện thoại, mã NV, số phép còn lại | Không tự bổ sung những dữ liệu cá nhân không có trong bản ghi | Đọc source + typecheck |
| Phiên đăng nhập | Collection mô tả phiên, xóa không thu hồi token | Phiên có sid, lưu IP/UA/expiry thật; thu hồi/đăng xuất chặn token, tồn tại qua restart; tương thích JWT cũ | 11 ca auth/session |
| Google | Credential/email chưa xác minh; settings chỉ localStorage và báo kết nối giả | Xác minh RS256/claims/Workspace; GIS thật; settings máy chủ, chặn bật bắt buộc trước khi Admin đăng nhập Google thành công | Auth/session + API smoke config |
| Biểu mẫu dùng chung | validateFields trả nguyên values; footer submit không tồn tại | Required/email/URL/độ dài/pattern/custom validator; initial values/reset/submit; lỗi ngay tại trường nhập | 4 ca FormStore + kiểm tra trình duyệt gửi trống |
| Hợp đồng | Tải gây vòng lặp đọc/ghi; lưu lỗi báo thành công; xóa local | API hợp đồng là nguồn dữ liệu; hiển thị lỗi, xóa DB; giữ mã hóa dữ liệu khi sửa | Browser + contract API CRUD |
| Chuyển quỹ | Hai POST riêng hoặc chỉ metadata, số dư có thể lệch | API nguyên tử ghi hai vế/phí/audit, chống chi quá số dư/idempotency; hủy đảo cả hai vế; giữ lịch sử cũ | 10 ca finance, gồm lỗi chèn vế nhận và đồng thời |
| Tuyển dụng | Đếm0 cố định; nút CV/export/copy chỉ toast | Ứng viên và CV thật, các vòng phỏng vấn/offer/nhận việc, lịch sử, thống kê, sửa/tạm dừng tin, XLSX/link nội bộ | 2 web + 1 API và API smoke |
| Onboarding | Checklist tĩnh, tiến độ/thao tác hoàn tất giả | Lưu từng xác nhận, tiến độ từ năm mục thật, nghiệm thu có ghi đánh giá; mở luồng hợp đồng riêng | 2 web + 1 API |
| Lịch sử nhân sự | Chỉ React state | CRUD collection, chọn nhân viên thật kể cả đã nghỉ, lỗi lưu, xem chi tiết, lọc, XLSX | 2 web + API smoke |
| Nghỉ phép/OT/phân ca | Mirror ghi cả danh sách, fake người/giờ/duyệt | Một nguồn chuẩn và một bản ghi mỗi thao tác; nhân viên gửi/Admin duyệt; thời gian/số ngày/phép/OT xác thực; đổi ca cập nhật hai người | 5 domain + API smoke |
| Bảng công/điểm danh | Sinh lịch/giờ theo modulo, chấm công phía client và fake Geofence | Ma trận theo dữ liệu thật và số ngày của tháng; máy chủ ghi giờ vào/ra/danh tính, chống lặp; thiếu dữ liệu để trống | Domain calendar + API check-in |
| Cảnh báo/tổng hợp công | Quyết định/khóa chỉ toast hoặc local | Ghi quyết định/giải trình/số tiền đề xuất, xác thực raw logs, điều chỉnh công và khóa lưu máy chủ; xuất file thật | Typecheck + API validation, chưa nghiệm thu đầy đủ UI thao tác |

## Giới hạn chưa được giải quyết

- 29 ứng dụng trong video/txt chưa được triển khai và nghiệm thu đủ từng yêu cầu. Không lấy số route hay build đạt làm phần trăm hoàn thành nghiệp vụ.
- Kiểm tra trình duyệt chỉ phát hiện lỗi mở route/JavaScript/trang trắng; chưa kiểm tra mọi nút, biểu mẫu, quyền truy cập và tình huống nghiệp vụ.
- PostgreSQL thật đã đạt tám luồng trên database tạm riêng: login/session, collections/JSON sort, checklist, tạo Canvas đồng thời, operations/snapshot, chuyển quỹ/hủy, chấm công, thu hồi phiên. Database thử được xóa sau kiểm tra; chưa chạy mọi ca nghiệp vụ/quyền trên PostgreSQL.
- Nhiều chỗ còn optimistic cache, tải file mặc định, thông báo thành công không tương ứng backend, số liệu mẫu, MockChatSocket và các luồng chưa có tích hợp nhà cung cấp.
- Đợt kiểm tra này đạt 41 ca API + 20 ca web/domain, thêm tám luồng PostgreSQL thật; thiết bị và nhà cung cấp bên ngoài chưa được nghiệm thu. Build production và typecheck đạt; có cảnh báo bundle lớn. Production browser rà 246 đường dẫn: không lỗi JavaScript/trang trắng; có kiểm tra gửi trống biểu mẫu không phát sinh POST. Bằng chứng lưu tại `outputs/legacy-progress-2026-10-26/` ở thư mục gốc.
- Đăng nhập Google thật với tài khoản nhà cung cấp chưa được nghiệm thu trên môi trường của người dùng (cần Client ID/origin hợp lệ). Kiểm thử xác minh dùng RSA/key fixture trong môi trường tạm, không phải Google tài khoản thật.
- Các tác vụ con chạm giới hạn sử dụng trong đợt tiếp theo. Phần đính kèm văn thư/scan chưa được triển khai; Google settings và history đã được root hoàn tất/kiểm tra phần đang sửa.
- `downloadFile` mặc định vẫn có nội dung mẫu ở các caller chưa chuyển sang truyền dữ liệu. PDF dùng font chuẩn nên tiếng Việt được chuyển không dấu; chưa nhúng font Unicode.
- Xác nhận phiếu lương là xác nhận nội bộ, không phải chữ ký số CA. Ký số, ngân hàng, email, Google, bảo hiểm/thuế, AI cần kiểm tra cấu hình và tích hợp riêng.
- Chưa xem toàn bộ video từng khung hình; bảng đánh giá trước đó chỉ là nguồn đối chiếu sơ bộ.

## Tiếp tục theo yêu cầu gốc

1. Nghiệm thu các thao tác nghiệp vụ còn lại trên trình duyệt. Lượt rà production 246 route đã đạt nhưng không thay thế mọi nút và quy trình.
2. Hoàn thiện persistence/error handling của các caller `saveGenericData` còn lại, cache theo người dùng và chống ghi đè dữ liệu. Đã sửa phân trang và chặn late read ghi đè dữ liệu mới.
3. Tiếp tục phân quyền chi tiết/RBAC, ký số CA, tài liệu scan/tải file gốc và tích hợp ngân hàng/thiết bị; thu hồi phiên và chuyển quỹ nguyên tử nội bộ đã có kiểm thử riêng.
4. Đối chiếu từng phần tử trong văn bản/video với UI → service → API → database, bổ sung chức năng thiếu trong module hiện có.
5. Viết/chạy kiểm thử nghiệp vụ, quyền, dữ liệu lỗi, tải lại trang và PostgreSQL cho từng luồng; cập nhật trạng thái theo bằng chứng.

## Lệnh kiểm tra

Trong `legacy/web`: `npm run typecheck`, `npm run build`, `npm test`.

Trong `legacy/api`: `node --check index.mjs`, `npm test`. `npm run test:postgres` là kiểm tra tự chọn, cần quyền tạo database thử; script chỉ tạo/xóa database có tên `kiyovn_codex_test_<uuid>` do chính lần chạy tạo.

Kiểm tra route: cung cấp `TEST_EMAIL`, `TEST_PASSWORD` cho tài khoản được phép kiểm thử rồi chạy `node tests/browser-routes.mjs`. Có thể đặt `TEST_WEB_URL`, `TEST_API_URL`. Script không bấm nút thay đổi dữ liệu; kết quả ghi trong thư mục tạm hệ thống. Các test API dùng SQLite và kho file riêng trong thư mục tạm.
