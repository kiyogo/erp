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
| Văn bản doanh nghiệp | Hồ sơ ghi cả danh sách; tệp PDF mẫu; hash/chữ ký tự điền; Word chỉ lưu trên trình duyệt | CRUD từng hồ sơ; tệp gốc/Word tải lên kho thật, tải đúng bytes, hash/size do máy chủ tính; Word chờ lưu từ xa trước khi báo thành công; XLSX/PDF từ bản ghi | API enterprise operations, 2 web documents + 5 editor/storage |
| Sổ văn thư đến/đi | Số vào sổ đếm trên client, tệp scan/đã xác minh giả, chuyển xử lý chỉ báo thành công | Cấp số theo sổ/năm trong transaction; chống trùng; tùy chọn scan thật; chuyển xử lý/hoàn tất/lịch sử, giữ tệp khi xóa hồ sơ; XLSX/PDF/clipboard | 3 API archives + 1 luồng UI; cấp số đồng thời trên PostgreSQL |
| Khen thưởng | Chữ ký/người nhận/điểm eNPS và trao thưởng không có kiểm chứng | Nhân viên thật; chờ duyệt → quyết định duyệt nội bộ → trao; actor/time máy chủ, giữ snapshot người nhận, chặn sửa/xóa quyết định đã duyệt; XLSX/PDF | 4 API rewards + 2 UI |
| Quản trị tài khoản | Chỉ tải 20 người, thiếu profile, ghi dữ liệu cũ khi thao tác đồng thời | Tải hết trang; CRUD/khóa/đổi mật khẩu/kích hoạt theo API; bảo vệ Admin cuối, đọc lại trong transaction; chặn xóa chủ hồ sơ nghiệp vụ; không tự xác nhận MFA | 6 API lifecycle + enterprise operations + 2 UI users |
| Sao lưu | Ba snapshot mẫu, kích thước giả và thông báo khôi phục giả | SQLite snapshot thật + kho file trong ZIP/manifest/SHA; tạo/xác minh/tải với quyền Admin; chặn tải khi hash lệch; báo đúng khả năng engine | 7 manager + API endpoints + UI; ZIP 4,3 MB tạo/tải qua trình duyệt, CRC/manifest/SHA khớp |
| Hợp đồng Word | UTF-8 đặt đuôi DOCX, tự điền người ký/địa chỉ, khởi động ghi đè tệp | OOXML ZIP hợp lệ có Unicode; giữ bytes cũ khi cập nhật; không ghi đè DOCX đã lưu khi restart; recipient không xác định không gán cho người bất kỳ; tải Word thật và giữ xuất TXT theo mẫu | 5 DOCX/package/XML + contract API integration + 1 UI download; PostgreSQL |
| Hồ sơ công ty | Giá trị pháp nhân/MST/địa chỉ và chỉ số hạ tầng mẫu; lưu chỉ toast | Đủ các trường pháp nhân/đăng ký/liên hệ trong audit; lưu `system_settings` có revision chống ghi đè; dùng khi tạo hợp đồng; SMTP qua API hiện có; chỉ số API đo thật; PDF từ dữ liệu | Company API validation/stale writes + 2 UI; PostgreSQL |
| Đánh giá hiệu suất | Điểm/nhận xét/tiền thưởng mặc định; dùng sai physical ID; phê duyệt coi như đã chi thưởng | Nhân viên/người đánh giá thật; điểm 0/missing rõ ràng; ba trụ cột tùy chọn, tổng/xếp loại do máy chủ tính; CRUD phiếu chờ duyệt, chốt có lịch sử; thưởng đề xuất, XLSX/PDF thật | 4 API performance + 2 UI; PostgreSQL |

## Giới hạn chưa được giải quyết

- 29 ứng dụng trong video/txt chưa được triển khai và nghiệm thu đủ từng yêu cầu. Không lấy số route hay build đạt làm phần trăm hoàn thành nghiệp vụ.
- Kiểm tra trình duyệt chỉ phát hiện lỗi mở route/JavaScript/trang trắng; chưa kiểm tra mọi nút, biểu mẫu, quyền truy cập và tình huống nghiệp vụ.
- PostgreSQL thật đã đạt 15 luồng trên database tạm riêng, gồm nền tảng cũ và thêm văn thư cấp số đồng thời, văn bản, khen thưởng, vòng đời tài khoản, DOCX hợp đồng, hồ sơ công ty và hiệu suất. Database thử được xóa sau kiểm tra; chưa chạy mọi ca nghiệp vụ/quyền trên PostgreSQL. Các race chi tiết của lifecycle dùng SQLite có điều khiển thứ tự giao dịch, chưa lặp đầy đủ trên PostgreSQL.
- Nhiều chỗ còn optimistic cache, tải file mặc định, thông báo thành công không tương ứng backend, số liệu mẫu, MockChatSocket và các luồng chưa có tích hợp nhà cung cấp.
- Mốc hiện tại đạt 75 ca API + 38 ca web/domain, thêm 15 luồng PostgreSQL thật. Build production và typecheck đạt; bundle khoảng 4,74 MB chưa nén. Lượt production trước đó đã mở 246 đường dẫn không lỗi JavaScript/trang trắng; chưa chạy lại toàn bộ 246 route sau đợt sửa mới. Mốc mới kiểm tra trình duyệt trực tiếp đăng nhập, Form văn bản, Canvas Word, cấu hình công ty và tạo/tải ZIP sao lưu. Bằng chứng `*-latest.txt`, ảnh `backup-browser.png` và báo cáo trong `outputs/legacy-progress-2026-10-26/` ở thư mục gốc.
- Đăng nhập Google thật với tài khoản nhà cung cấp chưa được nghiệm thu trên môi trường của người dùng (cần Client ID/origin hợp lệ). Kiểm thử xác minh dùng RSA/key fixture trong môi trường tạm, không phải Google tài khoản thật.
- Sao lưu chưa có khôi phục tự động hoặc lịch định kỳ; PostgreSQL chưa có `pg_dump` được cấu hình nên chỉ sao lưu kho file. Khóa mã hóa gốc không nằm trong ZIP. SQLite snapshot và kho file không cùng một transaction; từng file được băm lại khi đóng ZIP, không giả nhận RTO/khôi phục đã kiểm thử. ZIP hiện giới hạn dưới 4 GiB/65.534 tệp. Snapshot mẫu cũ được giữ trong DB nhưng không được coi là backup vật lý.
- Môi trường trình duyệt thử riêng bị phê duyệt tự động chặn khởi động, không có lý do chi tiết trong kết quả. Kiểm thử ghi dữ liệu dùng API/fixture riêng; trình duyệt đang chạy chỉ tạo bản sao lưu và thử các form chưa ghi dữ liệu nghiệp vụ. Luồng tải Word từ máy chủ được kiểm tra ở API + handler UI, chưa thao tác lưu/mở lại mọi tài liệu trên trình duyệt thật.
- Đánh giá hiệu suất hiện có tự chấm/điểm quản lý và ba trụ cột nhập thủ công. Chưa có chiến dịch khảo sát đa người 360 độ hoặc đồng bộ khoản thưởng sang payroll. Kỳ/chức danh/phòng ban do người nhập xác nhận; phê duyệt không tạo lệnh chi.
- Khởi động API không tự tạo hợp đồng mẫu mới. Dữ liệu mẫu cũ vẫn giữ nguyên; chỉ nạp thêm mẫu khi người vận hành chủ động đặt `SEED_DEMO_DATA=true`. DOCX sinh từ dữ liệu hợp đồng, chưa phải toàn bộ bộ mẫu pháp lý và quy trình ký CA đã nghiệm thu.
- `downloadFile` mặc định vẫn có nội dung mẫu ở các caller chưa chuyển sang truyền dữ liệu. PDF dùng font chuẩn nên tiếng Việt được chuyển không dấu; chưa nhúng font Unicode.
- Xác nhận phiếu lương là xác nhận nội bộ, không phải chữ ký số CA. Ký số, ngân hàng, email, Google, bảo hiểm/thuế, AI cần kiểm tra cấu hình và tích hợp riêng.
- Chưa xem toàn bộ video từng khung hình; bảng đánh giá trước đó chỉ là nguồn đối chiếu sơ bộ.

## Tiếp tục theo yêu cầu gốc

1. Nghiệm thu các thao tác nghiệp vụ còn lại trên trình duyệt. Lượt rà production 246 route đã đạt nhưng không thay thế mọi nút và quy trình.
2. Hoàn thiện persistence/error handling của các caller `saveGenericData` còn lại, cache theo người dùng và chống ghi đè dữ liệu. Đã sửa phân trang và chặn late read ghi đè dữ liệu mới.
3. Tiếp tục phân quyền chi tiết/RBAC, workflow/ủy quyền/lịch sử xử lý, quản lý tài sản, kế toán/kho và tích hợp ký số CA/ngân hàng/thiết bị. Tài liệu scan/tải file gốc đã có kiểm thử riêng; chưa thay thế nghiệm thu mọi luồng gửi-ký-nhận.
4. Đối chiếu từng phần tử trong văn bản/video với UI → service → API → database, bổ sung chức năng thiếu trong module hiện có.
5. Viết/chạy kiểm thử nghiệp vụ, quyền, dữ liệu lỗi, tải lại trang và PostgreSQL cho từng luồng; cập nhật trạng thái theo bằng chứng.

## Lệnh kiểm tra

Trong `legacy/web`: `npm run typecheck`, `npm run build`, `npm test`.

Trong `legacy/api`: `node --check index.mjs`, `npm test`. `npm run test:postgres` là kiểm tra tự chọn, cần quyền tạo database thử; script chỉ tạo/xóa database có tên `kiyovn_codex_test_<uuid>` do chính lần chạy tạo.

Kiểm tra route: cung cấp `TEST_EMAIL`, `TEST_PASSWORD` cho tài khoản được phép kiểm thử rồi chạy `node tests/browser-routes.mjs`. Có thể đặt `TEST_WEB_URL`, `TEST_API_URL`. Script không bấm nút thay đổi dữ liệu; kết quả ghi trong thư mục tạm hệ thống. Các test API dùng SQLite và kho file riêng trong thư mục tạm.
