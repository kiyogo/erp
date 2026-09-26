# ĐẶC TẢ CƠ SỞ DỮ LIỆU (DATABASE_SCHEMA.MD)

Tài liệu này đặc tả chi tiết toàn bộ các bảng dữ liệu (Tables), khóa chính, khóa ngoại, ràng buộc (Constraints) và chỉ mục (Indexes) trong CSDL của **KIYOVN Enterprise** (hỗ trợ cả SQLite và PostgreSQL).

---

## I. BẢNG NGƯỜI DÙNG & XÁC THỰC

### 1. `users`
*Lưu trữ thông tin tài khoản người dùng và phân quyền hệ thống.*
- `id` (TEXT, PK): ID duy nhất (UUID).
- `email` (TEXT, NOT NULL, UNIQUE): Email đăng nhập.
- `name` (TEXT, NOT NULL): Họ và tên đầy đủ.
- `employee_code` (TEXT, NOT NULL, UNIQUE): Mã nhân viên (VD: `KY-102`).
- `role` (TEXT, NOT NULL, CHECK: `'ADMIN' | 'USER'`): Vai trò.
- `password_hash` (TEXT, NOT NULL): Mật khẩu băm chuẩn `scrypt` với muối riêng.
- `is_active` (INTEGER, NOT NULL, DEFAULT 1): Trạng thái hoạt động (1: Bật, 0: Khóa).
- `created_at` (TEXT, NOT NULL): Thời điểm tạo (ISO string).
- `updated_at` (TEXT, NOT NULL): Thời điểm cập nhật.
- **Indexes**: `users_email_lower_idx` (`LOWER(email)`), `users_code_lower_idx` (`LOWER(employee_code)`).

### 2. `activation_tokens`
*Quản lý mã token kích hoạt tài khoản gửi qua email.*
- `id` (TEXT, PK): UUID.
- `user_id` (TEXT, FK -> `users.id` ON DELETE CASCADE).
- `token_hash` (TEXT, NOT NULL, UNIQUE): Băm SHA-256 của token gửi qua email.
- `issued_at` (TEXT, NOT NULL): Thời điểm cấp (hạn mặc định 2 ngày).
- `expires_at` (TEXT, NOT NULL): Thời điểm hết hạn token.
- `first_opened_at` (TEXT): Thời điểm người dùng mở link lần đầu.
- `session_expires_at` (TEXT): Thời điểm hết hạn phiên kích hoạt (30 phút sau khi mở).
- `used_at` (TEXT): Thời điểm hoàn tất đặt mật khẩu.
- **Indexes**: `activation_tokens_user_idx` (`user_id`, `issued_at DESC`).

### 3. `employee_profiles`
*Hồ sơ chi tiết của nhân viên gắn liền với tài khoản.*
- `user_id` (TEXT, PK, FK -> `users.id` ON DELETE CASCADE).
- `phone` (TEXT, NOT NULL, DEFAULT '').
- `department` (TEXT, NOT NULL, DEFAULT '').
- `position` (TEXT, NOT NULL, DEFAULT '').
- `employment_status` (TEXT, NOT NULL, DEFAULT 'Chính thức').
- `join_date` (TEXT, NOT NULL, DEFAULT '').
- `salary_base` (BIGINT, NOT NULL, DEFAULT 0).
- `avatar_url` (TEXT, NOT NULL, DEFAULT '').
- `details_json` (TEXT, NOT NULL, DEFAULT '{}'): JSON mở rộng lưu CCCD, bảo hiểm, tài khoản ngân hàng, thông tin gia đình.
- `created_at`, `updated_at` (TEXT, NOT NULL).

---

## II. HỆ THỐNG QUẢN LÝ TỆP TIN (FILE STORAGE)

### 4. `file_nodes`
*Cấu trúc cây thư mục và tệp tin phong cách Google Drive.*
- `id` (TEXT, PK): UUID.
- `parent_id` (TEXT, FK -> `file_nodes.id` ON DELETE RESTRICT): Thư mục cha (NULL nếu là thư mục gốc).
- `employee_id` (TEXT, FK -> `users.id` ON DELETE RESTRICT): Nhân viên sở hữu.
- `owner_id` (TEXT, FK -> `users.id` ON DELETE RESTRICT): Tài khoản tải lên.
- `name` (TEXT, NOT NULL): Tên tệp hoặc thư mục.
- `node_type` (TEXT, NOT NULL, CHECK: `'dir' | 'file'`).
- `mime_type` (TEXT, NOT NULL, DEFAULT '').
- `size` (BIGINT, NOT NULL, DEFAULT 0): Dung lượng byte.
- `storage_key` (TEXT, UNIQUE): Tên file lưu trên ổ cứng vật lý (`data/files/`).
- `origin_module` (TEXT, NOT NULL, DEFAULT 'files'): Module tạo tệp (files, contracts, hr...).
- `is_hidden` (INTEGER, DEFAULT 0): Tệp ẩn.
- `is_system` (INTEGER, DEFAULT 0): Tệp hệ thống không cho phép xóa tự do.
- `is_protected` (INTEGER, DEFAULT 0): Tệp được bảo vệ.
- `deleted_at` (TEXT): Thời điểm xóa mềm (NULL: còn tồn tại; có giá trị: trong Thùng rác).
- `created_at`, `updated_at` (TEXT, NOT NULL).
- **Indexes**: `file_nodes_parent_name_idx` (`parent_id`, `LOWER(name)` WHERE `deleted_at IS NULL`), `file_nodes_parent_idx`, `file_nodes_employee_idx`.

---

## III. HỢP ĐỒNG & CHỮ KÝ ĐIỆN TỬ

### 5. `contracts`
*Quản lý hợp đồng lao động và hợp đồng thương mại.*
- `id` (TEXT, PK): UUID.
- `code` (TEXT, NOT NULL, UNIQUE): Mã hợp đồng (VD: `HDLD-2026-001`).
- `name` (TEXT, NOT NULL): Tên hợp đồng.
- `contract_category` (TEXT, DEFAULT 'labor'): labor / business.
- `contract_template` (TEXT, NOT NULL): Mẫu hợp đồng.
- `party_b_type` (TEXT, DEFAULT 'employee'): employee / individual / organization.
- `party_b_name`, `party_b_tax_code`, `party_b_id_number`, `party_b_phone`, `party_b_email`, `party_b_bank`, `party_b_address` (TEXT).
- `employee_code`, `employee_name`, `employee_id_number`, `employee_phone`, `employee_email`, `employee_bank` (TEXT).
- `employee_user_id` (TEXT, FK -> `users.id`).
- `position`, `department`, `job_level`, `work_location`, `start_date`, `end_date` (TEXT).
- `probation_months` (INTEGER, DEFAULT 0).
- `contract_value`, `salary`, `allowance` (BIGINT, DEFAULT 0).
- `status` (TEXT, DEFAULT 'Chờ ký'): Dự thảo, Chờ ký, Chờ duyệt, Còn hiệu lực, Đã hết hạn.
- `employee_sign_status`, `employee_sign_date`, `employee_sign_method`, `employee_cert_name`, `employee_signed_file_name` (TEXT).
- `company_sign_status`, `company_sign_date`, `company_sign_method`, `company_cert_name`, `company_signed_file_name` (TEXT).
- `file_node_id` (TEXT, FK -> `file_nodes.id`).
- `created_at`, `updated_at` (TEXT, NOT NULL).

---

## IV. TÀI CHÍNH & KINH DOANH (FINANCE & CRM)

### 6. `finance_cash_transactions`
*Quản lý thu chi sổ quỹ tiền mặt và tài khoản ngân hàng.*
- `id` (TEXT, PK), `code` (TEXT, UNIQUE).
- `transaction_type` (TEXT, CHECK: `'Thu' | 'Chi'`).
- `source` (TEXT, CHECK: `'bank' | 'petty'`).
- `category` (TEXT, NOT NULL), `amount` (BIGINT, > 0).
- `transaction_date` (TEXT), `counterparty` (TEXT), `account_name` (TEXT).
- `status` (TEXT, CHECK: `'Đã hoàn thành' | 'Chờ duyệt' | 'Đã hủy'`).
- `created_by` (TEXT, FK -> `users.id`), `created_at`, `updated_at`.

### 7. `finance_documents`
*Chứng từ hóa đơn mua vào / bán ra / hóa đơn điện tử.*
- `id` (TEXT, PK), `code` (TEXT, UNIQUE).
- `document_type` (TEXT, CHECK: `'sale' | 'purchase' | 'invoice'`).
- `subtype` (TEXT), `partner_name` (TEXT), `amount` (BIGINT), `paid_amount` (BIGINT).
- `document_date`, `due_date`, `status`, `tax_code`, `vat_rate`, `vat_amount`.

### 8. `finance_bank_accounts`
*Danh sách tài khoản ngân hàng công ty.*
- `id` (TEXT, PK), `bank_name` (TEXT), `account_number` (TEXT, UNIQUE), `account_holder` (TEXT), `branch` (TEXT), `opening_balance` (BIGINT), `status` (TEXT).

### 9. `crm_contacts`
*Đối tác, nhà cung cấp và khách hàng CRM.*
- `id` (TEXT, PK), `code` (TEXT, UNIQUE), `name` (TEXT).
- `contact_type` (TEXT, CHECK: `'customer' | 'supplier' | 'partner'`).
- `tax_code`, `industry`, `contact_person`, `phone`, `email`, `address`, `bank_account`.
- `credit_limit` (BIGINT), `total_value` (BIGINT), `debt_balance` (BIGINT), `tier`, `status`.

---

## V. CÔNG VIỆC, ĐỀ XUẤT & SOẠN THẢO VĂN BẢN (TASKS & CANVAS DOCUMENTS)

### 10. `tasks` & `task_checklist_items` & `task_comments` & `task_activities` & `task_reports`
*Hệ thống quản lý công việc và báo cáo tiến độ chi tiết.*

### 11. `employee_proposals`
*Đơn vị đề xuất / kiến nghị nội bộ nhân viên.*

### 12. `documents` & `document_members` & `document_snapshots` & `document_operations` & `document_comments`
*Hệ thống tài liệu Canvas Document Editor hỗ trợ cộng tác thời gian thực, lưu trữ snapshot lịch sử và phân quyền (`owner`, `editor`, `commenter`, `viewer`).*

---

## VI. BỘ LƯU TRỮ ĐỘNG VÀ AUDIT LOGS

### 13. `collection_records`
*Lưu trữ dạng NoSQL/Scope cho hơn 20 module nghiệp vụ (như `hr_rewards`, `hr_uniforms`, `hr_certificates`, `business_org_units`...).*
- `id` (TEXT, PK): UUID.
- `scope` (TEXT, NOT NULL): Tên danh mục (VD: `hr_rewards`).
- `record_key` (TEXT, NOT NULL): Mã khóa bản ghi.
- `owner_id` (TEXT, FK -> `users.id` ON DELETE CASCADE).
- `payload_json` (TEXT, NOT NULL): Toàn bộ dữ liệu bản ghi dưới dạng JSON.
- `created_at`, `updated_at` (TEXT, NOT NULL).
- **Ràng buộc duy nhất**: `UNIQUE(scope, record_key, owner_id)`.

### 14. `audit_events` & `notifications` & `system_settings` & `outbound_mail_log`
*Nhật ký thao tác hệ thống, thông báo thời gian thực, cấu hình SMTP và lịch sử gửi email.*
