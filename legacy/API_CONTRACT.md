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
