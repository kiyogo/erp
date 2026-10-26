# ĐẶC TẢ API GIAO TIẾP (API_CONTRACT.MD)

Tài liệu này đặc tả toàn bộ các RESTful API endpoints, phương thức, cấu trúc tham số (Request) và dữ liệu trả về (Response) giữa Frontend và Backend của **KIYOVN Enterprise**.

---

## I. XÁC THỰC & TÀI KHOẢN (AUTH & USERS)

### 1. `POST /api/v1/auth/login`
- **Mục đích**: Đăng nhập hệ thống.
- **Request Body**: `{ "email": "admin@kiyovn.com", "password": "..." }`
- **Response (200)**: `{ "token": "JWT_TOKEN", "user": { "id", "email", "name", "employeeCode", "role" } }`
- **Bảo mật**: Rate limit 8 lần thất bại / 15 phút.

### 2. `GET /api/v1/auth/profile`
- **Headers**: `Authorization: Bearer <TOKEN>`
- **Response (200)**: `{ "user": { ... }, "profile": { ... } }`

### 3. `GET /api/v1/users` & `POST /api/v1/users` & `PATCH /api/v1/users/:id` & `DELETE /api/v1/users/:id`
- **Quyền yêu cầu**: Admin (`requireAdmin`).
- **Mục đích**: Quản lý danh sách tài khoản người dùng và phân quyền vai trò.

### 4. `POST /api/v1/employees/:id/activation`
- **Mục đích**: Gửi / Gửi lại email chứa liên kết kích hoạt tài khoản kèm token bảo mật.

---

## II. HỒ SƠ NHÂN SỰ & ONBOARDING

### 5. `GET /api/v1/employees`
- **Response (200)**: `{ "data": EnterpriseEmployee[] }`

### 6. `GET /api/v1/employees/me` & `PATCH /api/v1/employees/me`
- **Mục đích**: Nhân viên tự xem và cập nhật hồ sơ cá nhân của mình sau khi hoàn tất Onboarding.

---

## III. QUẢN LÝ TỆP TIN (FILE STORAGE)

### 7. `GET /api/v1/files`
- **Query Params**: `parentId` (tùy chọn), `scope` (tất cả / của tôi / thùng rác), `q` (tìm kiếm).
- **Response (200)**: `{ "nodes": FileNode[], "breadcrumbs": Breadcrumb[] }`

### 8. `POST /api/v1/files/upload`
- **Content-Type**: `multipart/form-data` hoặc binary stream.
- **Header Params**: `X-Parent-Id`, `X-Origin-Module`.

### 9. `DELETE /api/v1/files/:id` & `POST /api/v1/files/:id/restore`
- **Mục đích**: Xóa mềm tệp vào Thùng rác hoặc khôi phục tệp.

---

## IV. BỘ LƯU TRỮ ĐỘNG (COLLECTIONS API)

### 10. `GET /api/v1/collections/:scope`
- **Query Params**: `page`, `limit`, `q`, `sort`, `order`.
- **Response (200)**: `{ "data": Record[], "pagination": { "page", "limit", "total", "totalPages" } }`

### 11. `POST /api/v1/collections/:scope`
- **Request Body**: `{ "record": { "key": "...", ... } }`

### 12. `PATCH /api/v1/collections/:scope/:recordKey`
- **Request Body**: `{ "patch": { ... } }`

### 13. `PUT /api/v1/collections/:scope`
- **Request Body**: `{ "records": Record[] }` (Thay thế toàn bộ danh sách).

### 14. `DELETE /api/v1/collections/:scope/:recordKey`
- **Response (200)**: `{ "deleted": true }`

*Các Scope thường dùng*: `hr_rewards`, `hr_uniforms`, `hr_certificates`, `hr_performance_reviews`, `hr_onboarding_tasks`, `business_org_units`, `meeting_rooms`, `assets_list`...

---

## V. HỢP ĐỒNG & CHỮ KÝ ĐIỆN TỬ

### 15. `GET /api/v1/contracts` & `POST /api/v1/contracts` & `PUT /api/v1/contracts/:id`
- **Mục đích**: Quản lý danh sách hợp đồng, soạn thảo hợp đồng.

### 16. `POST /api/v1/contracts/:id/sign`
- **Request Body**: `{ "signMethod": "digital" | "upload", "certName": "...", "signAs": "employee" | "company" }`

---

## VI. EKYC & SINH TRẮC HỌC

### 17. `POST /api/v1/ekyc/session` & `POST /api/v1/ekyc/session/:token/verify`
- **Mục đích**: Khởi tạo phiên quét eKYC bằng mã QR điện thoại và đồng bộ kết quả xác minh CCCD/Khuôn mặt lên server.

---

## VII. CANVAS DOCUMENT ENGINE

### 18. `GET /api/v1/documents` & `POST /api/v1/documents`
### 19. `GET /api/v1/documents/:id` & `PATCH /api/v1/documents/:id`
### 20. `POST /api/v1/documents/:id/operations` (Ghi nhận atomic mutation)
### 21. `POST /api/v1/documents/:id/share` (Phân quyền tài liệu)
### 22. `POST /api/v1/documents/:id/comments` (Bình luận văn bản)

## VIII. ĐIỀU CHUYỂN NỘI BỘ VÀ SỐ DƯ SỔ QUỸ

### `GET /api/v1/finance/internal-transfers`
- Yêu cầu Admin. Trả `{ data: FinanceInternalTransfer[], accounts: FinanceTransferAccount[] }`.
- Tài khoản/quỹ được lấy từ danh mục ngân hàng và sổ quỹ tiền mặt. `balance` là số dư sổ quỹ, chưa xác nhận đối soát với ngân hàng.
- Lệnh cũ không có `ledgerRecorded` vẫn được giữ và đọc, cần đối chiếu chứng từ trước khi hủy.

### `POST /api/v1/finance/internal-transfers`
- Yêu cầu Admin. Body: `{ requestId, sourceAccountId, destinationAccountId, amount, fee?, purpose, transferDate, transferMethod? }`.
- `requestId`: 8–100 ký tự chữ/số, `_`, `-`; được dùng lại cho cùng yêu cầu khi mất kết nối. `amount` là số nguyên dương VNĐ; `fee` là phí thực tế không âm; ngày không được ở tương lai.
- Backend kiểm tra tài khoản hoạt động và số dư nguồn đủ cả tiền lẫn phí; ghi đồng thời phiếu chi, phiếu thu, phiếu phí nếu có, lệnh và audit trong một transaction.
- Người lập lấy từ phiên đăng nhập. Backend không nhận người duyệt hay chữ ký số từ client.
- Trả `201 { transfer, replayed: false }`; gửi lại cùng yêu cầu trả `200 { transfer, replayed: true }`; cùng `requestId` nhưng nội dung khác trả `409`.
- `executionStatus: 'ledger_only'` xác nhận đã ghi sổ nội bộ. API không gửi lệnh thanh toán ra nhà cung cấp ngân hàng.

### `POST /api/v1/finance/internal-transfers/:key/cancel`
- Yêu cầu Admin. Body: `{ reason }`. Hủy đồng thời chứng từ thu, chi và phí; lưu người hủy, thời gian và lý do, giữ lịch sử.
- Chỉ hủy lệnh có chứng từ liên kết và tài khoản đích đủ số dư hoàn lại. Hủy lại một lệnh đã hủy trả dữ liệu hiện tại.
- Không thể hủy riêng một chứng từ thuộc lệnh qua `/finance/cash-transactions/:id`. Generic Collections không cho sửa/xóa/ghi đè scope `finance_internal_transfers`.

### `GET /api/v1/finance/bank-accounts`
- Giữ `balance` là số dư đầu kỳ để tương thích client cũ; bổ sung `currentBalance` là số dư sau chứng từ thu/chi hoàn thành.
- Chứng từ cũ ghi tên ngân hàng chỉ được gán khi tên nhận diện duy nhất một tài khoản; dữ liệu tên không rõ cần đối chiếu trước khi dùng làm số dư từng tài khoản.

## IX. PHIÊN ĐĂNG NHẬP VÀ GOOGLE IDENTITY

- Token truy cập mới có `scope: 'access'` và `sid` duy nhất, được liên kết với bản ghi hệ thống trong scope `admin_sessions`. Bản ghi lưu IP kết nối tới API, User-Agent, thời gian đăng nhập, hoạt động cuối, hết hạn và lịch sử thu hồi; không lưu JWT gốc.
- `requireUser` kiểm tra cả chữ ký JWT, tài khoản hoạt động, phạm vi token và phiên chưa bị thu hồi/hết hạn. Token kích hoạt không được dùng làm access token.
- Tương thích token cũ: JWT hợp lệ chưa có `sid` được đăng ký một lần bằng khóa băm SHA-256 của token khi truy cập; tiếp tục đến hạn cũ và có thể thu hồi như phiên mới. Các dòng `admin_sessions` cũ không phải bản ghi xác thực vẫn được giữ trong DB nhưng không được coi là phiên đăng nhập.
- Generic Collections không cho ghi đè, tạo, sửa hoặc xóa scope `admin_sessions`.

### `GET /api/v1/admin/sessions`
- Yêu cầu Admin, trả `{ data: AdminSessionRecord[] }`, bao gồm phiên còn hạn, hết hạn và đã thu hồi. `current` đánh dấu phiên gửi yêu cầu.
- Hoạt động gần nhất được ghi từ yêu cầu API xác thực, tối đa một lần mỗi 30 giây; trạng thái hoạt động áp dụng cửa sổ 5 phút, không xác nhận trình duyệt còn mở hoặc có heartbeat.
- IP là địa chỉ socket trực tiếp, không tin header `X-Forwarded-For` do client tự gửi. User-Agent là thông tin client khai báo. Không suy đoán VPN, vị trí địa lý hoặc MFA. Thông tin TLS chỉ có khi socket API thực sự dùng TLS.

### `POST /api/v1/admin/sessions/:key/revoke`
- Yêu cầu Admin, body `{ reason? }`, trả `{ session }`. Thu hồi phiên chính xác, lưu audit và lịch sử. Các yêu cầu API tiếp theo của token tương ứng bị từ chối `401`; các phiên khác tiếp tục hoạt động.
- Thu hồi lại một phiên đã thu hồi trả phiên hiện tại. Có thể thu hồi phiên đang dùng; yêu cầu sau đó cần đăng nhập lại.

### `POST /api/v1/auth/logout`
- Yêu cầu đăng nhập, thu hồi phiên hiện tại và trả `{ loggedOut: true }`. Đăng xuất khi trình duyệt mất mạng chỉ xóa phiên trên trình duyệt; token trên máy chủ vẫn chịu hạn cũ nếu yêu cầu thu hồi không tới máy chủ.

### `GET /api/v1/auth/google/config`
- Công khai, trả cấu hình Google Identity Services từ `system_settings.google_sso_config`; `GOOGLE_CLIENT_ID`, `GOOGLE_ALLOWED_DOMAIN`, `GOOGLE_ENFORCE_LOGIN` có ưu tiên cao hơn. Bao gồm `{ configured, clientId, clientKey, allowedDomain, enforceGoogleLogin, redirectUri, environmentOverride }`. Không trả hoặc lưu Client Secret.

### `POST /api/v1/auth/google`
- Body `{ credential }` là ID token thực nhận từ Google Identity Services. Backend kiểm tra chữ ký RS256 qua khóa công khai Google có cache, `aud`, `iss`, `exp`, `iat`, email đã xác minh và `hd` nếu giới hạn tên miền.
- Không chấp nhận email client khai báo, token tự sửa, tên đăng nhập cùng tiền tố ở tên miền khác hoặc yêu cầu rỗng để lấy tài khoản Admin.
- Người dùng hiện có phải đang hoạt động và danh tính Google phải khớp liên kết. Email ngoài Gmail/Workspace cần được liên kết trước để tránh tự nhận quyền sở hữu email doanh nghiệp chưa được Google quản lý.
- Tài khoản Google mới hợp lệ vẫn có thể tạo tài khoản hệ thống với vai trò `USER`, không tự cấp `ADMIN`. Tài khoản đã khóa không được tự mở khóa bằng Google.
- Cần Client ID Google thực và khai báo origin đúng trên Google Cloud để hoàn thành đăng nhập tương tác. Khi chưa cấu hình, giao diện giữ nút Google và thông báo điều kiện cấu hình; đăng nhập tài khoản/mật khẩu vẫn sử dụng API hiện có.

### `PUT /api/v1/system/google-config`

- Admin lưu `{ clientKey, allowedDomain, redirectUri, enforceGoogleLogin: 'optional' | '100' }` trong `system_settings`; trả `{ config }`. `redirectUri` là Authorized JavaScript origin dùng cho GIS, không phải callback URL. Client Secret không cần và không được lưu.
- Bật bắt buộc Google chỉ khi phiên hiện tại đã xác minh qua Google với cùng Client ID/tên miền đang áp dụng. Cần lưu chế độ linh hoạt, kiểm tra đăng nhập thật, sau đó mới bật bắt buộc. API mật khẩu trả `403` khi chế độ bắt buộc có hiệu lực.

## X. Các luồng nghiệp vụ đã nối dữ liệu thật (2026-10-26)

- `POST /attendance/check-in { type: 'in' | 'out' }`: dùng danh tính phiên và thời gian máy chủ theo Asia/Ho_Chi_Minh, lưu một bản ghi/người/ngày tại `employee_timesheets`, chống lặp giờ vào/ra. Chưa xác minh vị trí hay thiết bị; generic writes vào scope này bị chặn.
- Collections `leave_requests`, `attendance_overtime`: tạo mới chờ duyệt, bản ghi thuộc nhân viên, Admin xem và duyệt, actor/ngày duyệt từ máy chủ, đơn đã xử lý không sửa/xóa. OT kiểm tra số giờ theo khoảng giờ, giá trị tiền từ số giờ/hệ số/đơn giá. PUT thay toàn danh sách bị chặn.
- `employee_leaves`/`employee_overtime` cũ được sao chép một lần sang scope chuẩn; dữ liệu nguồn được giữ lại. Bản ghi chưa xác định được nhân viên cần quản trị viên liên kết lại.
- `attendance_shifts`, `attendance_shift_assignments`: xác minh ca/nhân viên/ngày; duyệt đổi ca trao đổi cả hai phân ca trong một transaction khi khác nhân viên, cùng khoảng hiệu lực và ca đối ứng đang áp dụng.
- `attendance_leave_summary`, `attendance_timesheet_summary`: sổ điều chỉnh thủ công; máy chủ tính lại tổng/tỷ lệ và xác thực số; nhân viên chỉ đọc số dư phép của mình, Admin điều chỉnh. Bảng công đã khóa không sửa.
- `hr_job_openings`, `hr_recruitment_candidates`: mã vị trí/email trong vị trí không trùng; kiểm tra vị trí và nhân viên xử lý; ứng viên mới ở `applied`, đi theo `screening → interview → offer → hired`, có thể `rejected`; lịch sử chuyển giai đoạn có actor/thời gian máy chủ. CV dùng kho file thật, không phải nội dung tạo mẫu.
- `hr_onboarding_tasks`: đủ năm khóa checklist chuẩn, tiến độ do máy chủ tính từ boolean; nghiệm thu chỉ khi đủ năm mục và ghi đánh giá; không tự tạo chữ ký hợp đồng.
- `hr_employee_history`: CRUD từng bản ghi, liên kết nhân viên thật (kể cả đã nghỉ), kiểm tra ngày/loại/nội dung, metadata người tạo/sửa do máy chủ cung cấp; không tự đổi hồ sơ nhân viên khi thêm lịch sử.
