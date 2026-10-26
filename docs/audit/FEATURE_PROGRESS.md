# BẢNG TIẾN ĐỘ CHI TIẾT TỪNG TÍNH NĂNG (FEATURE PROGRESS LEDGER)

> **Dự án:** KIYO PLATFORM — Nền tảng Quản trị Doanh nghiệp Toàn diện
> **Tổng số tính năng được kiểm toán:** 116 tính năng trên 20 phân hệ nghiệp vụ
> **Công thức chấm điểm:** Điểm = (Yêu cầu × 10%) + (Triển khai × 40%) + (Tích hợp × 20%) + (Kiểm thử × 20%) + (Chất lượng × 10%)
> **Trọng số tính năng:** Trọng số = Trọng số Ưu tiên (P0: 5, P1: 3, P2: 2, P3: 1) × Độ phức tạp (1-5)

---

| ID | Phân hệ | Tên tính năng | Ưu tiên | Phức tạp | Trọng số | Yêu cầu | Code | Tích hợp | Test | Chất lượng | Điểm % | Trạng thái |
| :---: | :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| F001 | Platform & Auth | User Login (Argon2id + JWT) | P0 | 4 | 20 | 100% | 100% | 90% | 95% | 90% | **96.0%** | `COMPLETED` |
| F002 | Platform & Auth | User Logout (Session Revocation) | P0 | 2 | 10 | 100% | 100% | 90% | 95% | 90% | **96.0%** | `COMPLETED` |
| F003 | Platform & Auth | Session Introspect & Heartbeat | P0 | 3 | 15 | 100% | 100% | 90% | 95% | 90% | **96.0%** | `COMPLETED` |
| F004 | Platform & Auth | Auth Profile & User Envelope | P0 | 2 | 10 | 100% | 100% | 90% | 95% | 90% | **96.0%** | `COMPLETED` |
| F005 | Platform & Auth | Password Change (Self-Service) | P0 | 3 | 15 | 100% | 100% | 90% | 95% | 90% | **96.0%** | `COMPLETED` |
| F006 | Platform & Auth | Account Activation Flow | P1 | 4 | 12 | 90% | 90% | 80% | 90% | 80% | **87.0%** | `MOSTLY_COMPLETED` |
| F007 | Platform & Auth | Admin Multi-Session Management | P1 | 3 | 9 | 100% | 100% | 90% | 95% | 90% | **96.0%** | `COMPLETED` |
| F008 | Platform & Auth | Storage Mode & Platform Config | P1 | 2 | 6 | 100% | 100% | 90% | 90% | 90% | **95.0%** | `COMPLETED` |
| F009 | Platform & Auth | OAuth / Google Linking | P2 | 4 | 8 | 60% | 30% | 20% | 40% | 60% | **36.0%** | `PARTIAL` |
| F010 | Administration & System | Admin Dashboard Overview | P0 | 4 | 20 | 90% | 85% | 85% | 90% | 85% | **86.5%** | `MOSTLY_COMPLETED` |
| F011 | Administration & System | Admin Users Directory | P0 | 4 | 20 | 100% | 95% | 90% | 95% | 90% | **94.0%** | `COMPLETED` |
| F012 | Administration & System | System Audit Logs | P1 | 4 | 12 | 90% | 90% | 85% | 90% | 85% | **88.5%** | `MOSTLY_COMPLETED` |
| F013 | Administration & System | Broadcast Notifications | P1 | 3 | 9 | 80% | 75% | 75% | 80% | 80% | **77.0%** | `PARTIAL` |
| F014 | Administration & System | Activation Email Template Config | P2 | 2 | 4 | 100% | 100% | 90% | 95% | 90% | **96.0%** | `COMPLETED` |
| F015 | Administration & System | System Settings & Appearance | P2 | 3 | 6 | 85% | 80% | 80% | 85% | 80% | **81.5%** | `MOSTLY_COMPLETED` |
| F016 | Administration & System | Roles & Permissions Management | P1 | 4 | 12 | 70% | 50% | 50% | 60% | 70% | **56.0%** | `PARTIAL` |
| F017 | Administration & System | Data Backup & Recovery | P1 | 4 | 12 | 70% | 50% | 40% | 60% | 60% | **53.0%** | `PARTIAL` |
| F018 | Business & Organization | Org Units Management | P0 | 4 | 20 | 100% | 95% | 90% | 95% | 90% | **94.0%** | `COMPLETED` |
| F019 | Business & Organization | Org Chart & Hierarchy | P1 | 3 | 9 | 90% | 85% | 80% | 85% | 80% | **84.0%** | `MOSTLY_COMPLETED` |
| F020 | HR Management | HR Overview & Metrics | P1 | 2 | 6 | 90% | 85% | 85% | 85% | 85% | **85.5%** | `MOSTLY_COMPLETED` |
| F021 | HR Management | Employees Directory & Management | P0 | 5 | 25 | 90% | 90% | 85% | 90% | 85% | **88.5%** | `MOSTLY_COMPLETED` |
| F022 | HR Management | Onboarding Tracking | P1 | 3 | 9 | 80% | 75% | 75% | 85% | 80% | **78.0%** | `PARTIAL` |
| F023 | HR Management | Recruitment & Job Openings | P1 | 3 | 9 | 75% | 70% | 70% | 80% | 75% | **73.0%** | `PARTIAL` |
| F024 | HR Management | Performance Reviews | P1 | 4 | 12 | 90% | 85% | 85% | 90% | 85% | **86.5%** | `MOSTLY_COMPLETED` |
| F025 | HR Management | Headcount Quotas | P2 | 3 | 6 | 80% | 80% | 75% | 85% | 80% | **80.0%** | `MOSTLY_COMPLETED` |
| F026 | HR Management | Rewards & Recognition | P2 | 3 | 6 | 90% | 90% | 85% | 90% | 85% | **88.5%** | `MOSTLY_COMPLETED` |
| F027 | HR Management | Training Courses | P2 | 3 | 6 | 85% | 80% | 80% | 85% | 80% | **81.5%** | `MOSTLY_COMPLETED` |
| F028 | HR Management | Certificates & Credentials | P2 | 3 | 6 | 85% | 85% | 80% | 85% | 80% | **83.5%** | `MOSTLY_COMPLETED` |
| F029 | HR Management | Uniforms Handover | P2 | 2 | 4 | 85% | 85% | 80% | 85% | 80% | **83.5%** | `MOSTLY_COMPLETED` |
| F030 | HR Management | Employee History Notes | P1 | 3 | 9 | 90% | 85% | 85% | 90% | 85% | **86.5%** | `MOSTLY_COMPLETED` |
| F031 | HR Management | HR Bank Accounts & Quarantine | P1 | 4 | 12 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F032 | Employee Portal | Employee Portal Home | P0 | 3 | 15 | 90% | 85% | 85% | 90% | 85% | **86.5%** | `MOSTLY_COMPLETED` |
| F033 | Employee Portal | Employee Profile Self-Update | P0 | 3 | 15 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F034 | Employee Portal | Employee Leave Self-Service | P0 | 4 | 20 | 95% | 90% | 90% | 95% | 90% | **91.5%** | `COMPLETED` |
| F035 | Employee Portal | Employee Overtime Requests | P1 | 3 | 9 | 95% | 90% | 90% | 95% | 90% | **91.5%** | `COMPLETED` |
| F036 | Employee Portal | Employee Payslips Projection | P1 | 3 | 9 | 80% | 80% | 80% | 85% | 80% | **81.0%** | `MOSTLY_COMPLETED` |
| F037 | Employee Portal | Employee Proposals Submission | P2 | 3 | 6 | 95% | 90% | 90% | 95% | 90% | **91.5%** | `COMPLETED` |
| F038 | Employee Portal | Employee Asset Allocations | P1 | 3 | 9 | 95% | 90% | 90% | 95% | 90% | **91.5%** | `COMPLETED` |
| F039 | Employee Portal | Employee Bank Registration | P1 | 3 | 9 | 95% | 90% | 90% | 95% | 90% | **91.5%** | `COMPLETED` |
| F040 | Employee Portal | Personal Notifications Center | P1 | 3 | 9 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F041 | Employee Portal | Handwritten Signatures Pad | P2 | 3 | 6 | 85% | 80% | 75% | 85% | 80% | **80.5%** | `MOSTLY_COMPLETED` |
| F042 | Finance | Cash Transactions & Vouchers | P0 | 5 | 25 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F043 | Finance | Cash Flow Analysis | P1 | 3 | 9 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F044 | Finance | Bank Accounts Management | P0 | 4 | 20 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F045 | Finance | Bank Ledger & Statements View | P1 | 3 | 9 | 85% | 85% | 80% | 85% | 80% | **83.5%** | `MOSTLY_COMPLETED` |
| F046 | Finance | Internal Bank Transfers (Atomic) | P0 | 4 | 20 | 100% | 100% | 95% | 100% | 95% | **98.5%** | `COMPLETED` |
| F047 | Finance | Legacy Finance Data Importer | P1 | 4 | 12 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F048 | Finance | E-Banking Integration | P2 | 4 | 8 | 60% | 30% | 20% | 40% | 60% | **36.0%** | `PARTIAL` |
| F049 | Finance | Enterprise Budgeting | P2 | 3 | 6 | 70% | 60% | 50% | 60% | 60% | **59.0%** | `PARTIAL` |
| F050 | Asset Management | Asset Inventory & Items | P0 | 4 | 20 | 95% | 90% | 85% | 90% | 85% | **89.0%** | `MOSTLY_COMPLETED` |
| F051 | Asset Management | Asset Materials & Stock Cards | P1 | 3 | 9 | 90% | 90% | 85% | 90% | 85% | **88.5%** | `MOSTLY_COMPLETED` |
| F052 | Asset Management | Asset Allocations & Returns | P0 | 4 | 20 | 95% | 90% | 85% | 95% | 90% | **90.5%** | `COMPLETED` |
| F053 | Asset Management | Asset Transfers Lifecycle | P0 | 4 | 20 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F054 | Asset Management | Asset Maintenance Schedules | P1 | 4 | 12 | 95% | 90% | 85% | 90% | 85% | **89.0%** | `MOSTLY_COMPLETED` |
| F055 | Asset Management | Asset Repairs Management | P1 | 4 | 12 | 95% | 90% | 85% | 90% | 85% | **89.0%** | `MOSTLY_COMPLETED` |
| F056 | Asset Management | Asset Disposals & Loss | P1 | 4 | 12 | 95% | 90% | 85% | 90% | 85% | **89.0%** | `MOSTLY_COMPLETED` |
| F057 | Asset Management | Asset Depreciation Subledger | P1 | 4 | 12 | 95% | 90% | 85% | 95% | 90% | **90.5%** | `COMPLETED` |
| F058 | Asset Management | Asset Audits & Barcode Scan | P1 | 4 | 12 | 90% | 85% | 80% | 90% | 85% | **85.5%** | `MOSTLY_COMPLETED` |
| F059 | Asset Management | Asset To-Do & Kanban | P2 | 3 | 6 | 85% | 80% | 75% | 85% | 80% | **80.5%** | `MOSTLY_COMPLETED` |
| F060 | Asset Management | Asset Legacy Importers (8 tools) | P1 | 4 | 12 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F061 | Attendance & Tracking | Attendance Overview & Monitoring | P1 | 3 | 9 | 85% | 80% | 80% | 85% | 80% | **81.5%** | `MOSTLY_COMPLETED` |
| F062 | Attendance & Tracking | Shifts Catalog Management | P0 | 3 | 15 | 95% | 90% | 85% | 90% | 85% | **89.0%** | `MOSTLY_COMPLETED` |
| F063 | Attendance & Tracking | Shift Assignments & Roster | P0 | 4 | 20 | 95% | 90% | 85% | 95% | 90% | **90.5%** | `COMPLETED` |
| F064 | Attendance & Tracking | Admin Leave Requests Review | P0 | 4 | 20 | 95% | 90% | 85% | 95% | 90% | **90.5%** | `COMPLETED` |
| F065 | Attendance & Tracking | Admin Overtime Review | P1 | 3 | 9 | 95% | 90% | 85% | 95% | 90% | **90.5%** | `COMPLETED` |
| F066 | Attendance & Tracking | Timesheets & Calendar Matrix | P1 | 4 | 12 | 75% | 70% | 65% | 75% | 70% | **70.5%** | `PARTIAL` |
| F067 | Attendance & Tracking | Biometric Clock-in / FaceID | P2 | 5 | 10 | 50% | 20% | 10% | 20% | 50% | **24.0%** | `PARTIAL` |
| F068 | Workflows & Approvals | Workflow Blueprints Catalog | P0 | 4 | 20 | 95% | 90% | 85% | 90% | 85% | **89.0%** | `MOSTLY_COMPLETED` |
| F069 | Workflows & Approvals | Workflow Requests & Decisions | P0 | 5 | 25 | 90% | 85% | 85% | 90% | 85% | **86.5%** | `MOSTLY_COMPLETED` |
| F070 | Workflows & Approvals | Workflow Overview Dashboard | P1 | 3 | 9 | 85% | 80% | 80% | 85% | 80% | **81.5%** | `MOSTLY_COMPLETED` |
| F071 | Workflows & Approvals | Workflow Audit History Stream | P1 | 3 | 9 | 90% | 85% | 85% | 90% | 85% | **86.5%** | `MOSTLY_COMPLETED` |
| F072 | Workflows & Approvals | Workflow Settings & Delegation | P2 | 3 | 6 | 80% | 75% | 70% | 80% | 75% | **75.5%** | `PARTIAL` |
| F073 | Workflows & Approvals | Automated BPMN Execution | P1 | 5 | 15 | 40% | 10% | 10% | 10% | 50% | **17.0%** | `NOT_STARTED` |
| F074 | Contracts | Contracts Directory (PII Encrypted) | P0 | 4 | 20 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F075 | Contracts | Contract Create / Edit / Archive | P0 | 4 | 20 | 95% | 90% | 85% | 90% | 85% | **89.0%** | `MOSTLY_COMPLETED` |
| F076 | Contracts | Contract PKI Digital Signing | P1 | 5 | 15 | 50% | 20% | 10% | 20% | 50% | **24.0%** | `PARTIAL` |
| F077 | Documents & Editor | Enterprise Documents Library | P0 | 4 | 20 | 90% | 85% | 85% | 90% | 85% | **86.5%** | `MOSTLY_COMPLETED` |
| F078 | Documents & Editor | Document Snapshots & Versions | P0 | 4 | 20 | 95% | 90% | 90% | 95% | 90% | **91.5%** | `COMPLETED` |
| F079 | Documents & Editor | Document Editor (Word/DOCX Model) | P0 | 5 | 25 | 80% | 75% | 70% | 80% | 75% | **75.5%** | `PARTIAL` |
| F080 | Documents & Editor | Realtime Collaboration & Comments | P1 | 5 | 15 | 80% | 75% | 70% | 85% | 75% | **76.5%** | `PARTIAL` |
| F081 | Files & Cloud Drive | File & Folder Navigation | P0 | 4 | 20 | 100% | 95% | 90% | 95% | 90% | **94.0%** | `COMPLETED` |
| F082 | Files & Cloud Drive | Folder Create & Rename | P0 | 3 | 15 | 100% | 95% | 90% | 95% | 90% | **94.0%** | `COMPLETED` |
| F083 | Files & Cloud Drive | File Upload & Binary Download | P0 | 4 | 20 | 100% | 95% | 90% | 95% | 90% | **94.0%** | `COMPLETED` |
| F084 | Files & Cloud Drive | File Content Replacement | P1 | 3 | 9 | 100% | 95% | 90% | 95% | 90% | **94.0%** | `COMPLETED` |
| F085 | Files & Cloud Drive | Bulk Soft-Delete & Guard | P0 | 3 | 15 | 100% | 95% | 90% | 95% | 90% | **94.0%** | `COMPLETED` |
| F086 | Files & Cloud Drive | Public File Sharing & Guest View | P1 | 4 | 12 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F087 | Chat & Collaboration | Channels & Direct Messaging | P0 | 4 | 20 | 95% | 90% | 85% | 90% | 85% | **89.0%** | `MOSTLY_COMPLETED` |
| F088 | Chat & Collaboration | Messaging, Replies & Reactions | P0 | 4 | 20 | 95% | 90% | 85% | 95% | 90% | **90.5%** | `COMPLETED` |
| F089 | Chat & Collaboration | Chat Administration & Moderation | P2 | 3 | 6 | 85% | 80% | 75% | 85% | 80% | **80.5%** | `MOSTLY_COMPLETED` |
| F090 | Chat & Collaboration | WebSocket Push & Voice Calls | P2 | 5 | 10 | 40% | 15% | 10% | 15% | 50% | **20.0%** | `PARTIAL` |
| F091 | CRM | CRM Contacts (PII Encrypted) | P0 | 4 | 20 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F092 | CRM | Supplier Evaluations & Scores | P1 | 3 | 9 | 95% | 90% | 85% | 95% | 90% | **90.5%** | `COMPLETED` |
| F093 | CRM | Customer Feedback & Resolution | P1 | 3 | 9 | 95% | 90% | 85% | 95% | 90% | **90.5%** | `COMPLETED` |
| F094 | CRM | CRM Legacy Data Importers | P1 | 4 | 12 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F095 | Insurance | Insurance Overview & Labor | P1 | 3 | 9 | 85% | 80% | 80% | 85% | 80% | **81.5%** | `MOSTLY_COMPLETED` |
| F096 | Insurance | Insurance Adjustments D02-LT | P1 | 4 | 12 | 90% | 85% | 85% | 90% | 85% | **86.5%** | `MOSTLY_COMPLETED` |
| F097 | Insurance | Insurance Regimes & Bank Encrypt | P1 | 4 | 12 | 90% | 85% | 85% | 90% | 85% | **86.5%** | `MOSTLY_COMPLETED` |
| F098 | Insurance | Insurance Card & Expenses | P2 | 3 | 6 | 85% | 80% | 80% | 85% | 80% | **81.5%** | `MOSTLY_COMPLETED` |
| F099 | Insurance | eBH / VssID Online Submission | P2 | 5 | 10 | 40% | 10% | 10% | 10% | 50% | **17.0%** | `NOT_STARTED` |
| F100 | Meeting Rooms | Meeting Rooms Inventory | P1 | 3 | 9 | 95% | 90% | 85% | 95% | 90% | **90.5%** | `COMPLETED` |
| F101 | Meeting Rooms | Room Booking & Conflict Prevention | P0 | 4 | 20 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F102 | Meeting Rooms | Booking Cancellation & History | P1 | 3 | 9 | 95% | 90% | 85% | 95% | 90% | **90.5%** | `COMPLETED` |
| F103 | Meeting Rooms | Meet / Teams Live Sync | P2 | 4 | 8 | 40% | 10% | 10% | 10% | 50% | **17.0%** | `NOT_STARTED` |
| F104 | Plans & Tasks | Plans Directory & Lifecycle | P1 | 3 | 9 | 90% | 85% | 85% | 90% | 85% | **86.5%** | `MOSTLY_COMPLETED` |
| F105 | Plans & Tasks | Tasks Assignment & Checklists | P0 | 5 | 25 | 95% | 90% | 90% | 95% | 90% | **91.5%** | `COMPLETED` |
| F106 | Plans & Tasks | Milestones & OKRs Management | P1 | 3 | 9 | 90% | 85% | 85% | 90% | 85% | **86.5%** | `MOSTLY_COMPLETED` |
| F107 | Plans & Tasks | Progress Tracking & Reports | P1 | 3 | 9 | 90% | 85% | 85% | 90% | 85% | **86.5%** | `MOSTLY_COMPLETED` |
| F108 | Plans & Tasks | Legacy Plan Importers (5 collections) | P2 | 3 | 6 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F109 | Helpdesk & Incidents | Tickets Management & Lifecycle | P0 | 4 | 20 | 95% | 90% | 85% | 95% | 90% | **90.5%** | `COMPLETED` |
| F110 | Helpdesk & Incidents | Incident Tracking & Resolution | P1 | 4 | 12 | 95% | 90% | 85% | 95% | 90% | **90.5%** | `COMPLETED` |
| F111 | Helpdesk & Incidents | Legacy Helpdesk Importers | P2 | 3 | 6 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F112 | Reports & BI | Reports Catalog & Metrics | P1 | 3 | 9 | 85% | 80% | 80% | 85% | 80% | **81.5%** | `MOSTLY_COMPLETED` |
| F113 | Reports & BI | Legacy Reports Catalog Importer | P2 | 3 | 6 | 95% | 95% | 90% | 95% | 90% | **93.5%** | `COMPLETED` |
| F114 | Reports & BI | Automated Cross-Module BI Engine | P1 | 5 | 15 | 40% | 20% | 15% | 20% | 50% | **24.0%** | `PARTIAL` |
| F115 | Services & SLA | Enterprise Services Catalog | P2 | 3 | 6 | 85% | 80% | 80% | 85% | 80% | **81.5%** | `MOSTLY_COMPLETED` |
| F116 | Services & SLA | Service SLA Tracking & Escalation | P2 | 4 | 8 | 50% | 20% | 15% | 20% | 50% | **25.0%** | `PARTIAL` |

---

## CHI TIẾT BẰNG CHỨNG VÀ ĐIỀU KIỆN NGHIỆM THU TỪNG TÍNH NĂNG

### [F001] User Login (Argon2id + JWT) — Phân hệ: Platform & Auth
- **Mô tả chức năng:** Xác thực tài khoản người dùng bằng email và mật khẩu qua thuật toán Argon2id, phát hành JWT token 12 giờ lưu phiên làm việc trên máy chủ.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **96.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:638, ui/src/views/login.rs:1, tests::password_change_requires_auth_and_replaces_credentials`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ xác thực 2 lớp (2FA/TOTP) trên backend Rust; chưa có cơ chế refresh token xoay vòng tự động.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Đăng nhập thành công với tài khoản hợp lệ, trả JWT có session_id, từ chối mật khẩu sai với HTTP 401.

### [F002] User Logout (Session Revocation) — Phân hệ: Platform & Auth
- **Mô tả chức năng:** Đăng xuất tài khoản người dùng và thu hồi phiên làm việc tức thời trong cơ sở dữ liệu máy chủ.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `2/5` | **Trọng số:** `10`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **96.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:639, ui/src/api.rs, tests::admin_sessions_are_server_backed_revocable_and_role_protected`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tùy chọn đăng xuất khỏi tất cả các thiết bị cùng lúc trên giao diện người dùng thường.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Gửi yêu cầu POST /auth/logout, session_id bị đánh dấu revoked, các request tiếp theo bằng token đó bị từ chối 401.

### [F003] Session Introspect & Heartbeat — Phân hệ: Platform & Auth
- **Mô tả chức năng:** Kiểm tra tính hợp lệ của phiên làm việc định kỳ (heartbeat mỗi 5 phút) và xác thực tính hoạt động của tài khoản.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `3/5` | **Trọng số:** `15`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **96.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:641, ui/src/app.rs:32, tests::auth_profile_returns_the_user_envelope_expected_by_legacy_session_restore`
- **Hạng mục còn thiếu / Rào cản:** Chưa có cơ chế phát hiện xung đột IP bất thường hoặc cảnh báo vị trí đăng nhập mới.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Gọi GET /auth/introspect trả HTTP 200 kèm trạng thái active, nếu tài khoản bị khóa lập tức chuyển hướng về trang Login.

### [F004] Auth Profile & User Envelope — Phân hệ: Platform & Auth
- **Mô tả chức năng:** Truy xuất thông tin hồ sơ phiên người dùng hiện tại bao gồm id, email, họ tên, vai trò và thông tin nhân viên liên kết.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `2/5` | **Trọng số:** `10`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **96.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:640, ui/src/models.rs:44, tests::auth_profile_returns_the_user_envelope_expected_by_legacy_session_restore`
- **Hạng mục còn thiếu / Rào cản:** Chưa bao gồm avatar nhị phân lưu trữ từ máy chủ (hiện hiển thị chữ cái đầu đại diện).
- **Điều kiện nghiệm thu (Acceptance Criteria):** GET /auth/profile trả cấu trúc envelope { user: { ... } } tương thích hoàn toàn với client legacy.

### [F005] Password Change (Self-Service) — Phân hệ: Platform & Auth
- **Mô tả chức năng:** Chức năng tự đổi mật khẩu cá nhân, yêu cầu mật khẩu cũ hợp lệ và kiểm tra độ phức tạp mật khẩu mới (12-256 ký tự).
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `3/5` | **Trọng số:** `15`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **96.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:643, ui/src/views/settings.rs:100, tests::password_change_http_contract_uses_bearer_and_camel_case_json`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ chính sách hết hạn mật khẩu định kỳ (password expiry policy).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Đổi mật khẩu thành công thu hồi toàn bộ các phiên làm việc khác của tài khoản đó.

### [F006] Account Activation Flow — Phân hệ: Platform & Auth
- **Mô tả chức năng:** Quy trình kích hoạt tài khoản nhân viên mới qua mã liên kết một lần (one-time activation token) và thiết lập mật khẩu ban đầu.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **87.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:7008, ui/src/views/activation.rs, tests::activation_http_flow_uses_scoped_session_and_consumes_link_once`
- **Hạng mục còn thiếu / Rào cản:** Chưa tự động gửi email kích hoạt qua giao thức SMTP; admin phải sao chép liên kết thủ công.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Nhập mã kích hoạt hợp lệ, tạo mật khẩu mới đạt chuẩn, tài khoản chuyển từ pending sang active và token bị vô hiệu hóa.

### [F007] Admin Multi-Session Management — Phân hệ: Platform & Auth
- **Mô tả chức năng:** Quản trị viên theo dõi danh sách tất cả các phiên đăng nhập đang hoạt động và quyền thu hồi phiên từ xa.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **96.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:771, ui/src/views/auth_sessions.rs, tests::admin_sessions_are_server_backed_revocable_and_role_protected`
- **Hạng mục còn thiếu / Rào cản:** Chưa tích hợp cơ sở dữ liệu định vị GeoIP để hiển thị thành phố/quốc gia của phiên.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Admin xem danh sách phiên, bấm thu hồi một phiên thì client của phiên đó bị đá về màn hình đăng nhập.

### [F008] Storage Mode & Platform Config — Phân hệ: Platform & Auth
- **Mô tả chức năng:** Xác định chế độ lưu trữ máy chủ (Self-Hosted Linux / Local Admin SQLite) và cấu hình nền tảng.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `2/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **95.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:631-637, ui/src/models.rs:14, tests::api_unknown_route_returns_json_not_spa_html`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ cấu hình runtime động qua giao diện (hiện nạp qua biến môi trường ENV lúc khởi động).
- **Điều kiện nghiệm thu (Acceptance Criteria):** GET /health trả { status: 'healthy', version: '0.1.0' } và mã HTTP 200.

### [F009] OAuth / Google Linking — Phân hệ: Platform & Auth
- **Mô tả chức năng:** Liên kết và đăng nhập bằng tài khoản Google Workspace (OAuth2 / OpenID Connect).
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `4/5` | **Trọng số:** `8`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **36.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/activation.rs:331, server/src/main.rs`
- **Hạng mục còn thiếu / Rào cản:** Chưa cấu hình OAuth Client ID và Secret; giao diện thông báo 'Máy chủ này chưa cấu hình liên kết tài khoản Google'.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Fails closed an toàn khi chưa có cấu hình; từ chối mọi yêu cầu giả mạo payload không có chữ ký hợp lệ.

### [F010] Admin Dashboard Overview — Phân hệ: Administration & System
- **Mô tả chức năng:** Bảng tổng quan số liệu điều hành quản trị: số nhân sự thực tế, biến động trong tháng, tổng thu/chi hoàn tất, hàng chờ duyệt.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **86.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:647, ui/src/views/dashboard.rs, tests::dashboard_stats_use_real_accounts_and_include_recent_audit_events`
- **Hạng mục còn thiếu / Rào cản:** Chưa tích hợp biểu đồ đồ họa phân tích xu hướng thu chi đa trục (hiện hiển thị số liệu thẻ KPI).
- **Điều kiện nghiệm thu (Acceptance Criteria):** GET /dashboard/stats trả về số liệu tính toán thời gian thực từ cơ sở dữ liệu SQLite, không dùng số liệu hardcode.

### [F011] Admin Users Directory — Phân hệ: Administration & System
- **Mô tả chức năng:** Danh bạ quản trị người dùng: tìm kiếm đa trường hỗ trợ tiếng Việt Unicode có dấu, lọc trạng thái, khóa/mở khóa tài khoản.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **94.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:656, ui/src/views/users.rs, tests::admin_user_management_is_persisted_paginated_and_permission_checked`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ xuất danh sách người dùng ra định dạng Excel/CSV thực tế.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Tìm kiếm debounced chính xác theo họ tên, email, phòng ban; khóa tài khoản lập tức thu hồi mọi phiên của người đó.

### [F012] System Audit Logs — Phân hệ: Administration & System
- **Mô tả chức năng:** Sổ nhật ký kiểm toán hệ thống: lưu vết hành động của người dùng, phân loại danh mục, hỗ trợ tìm kiếm và phân trang.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **88.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/audit.rs, ui/src/views/audit_logs.rs, tests::audit_api_records_redacted_events_lists_admin_only_and_is_append_only`
- **Hạng mục còn thiếu / Rào cản:** Chưa thiết lập chính sách tự động xóa/lưu trữ nhật ký cũ (retention policy).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Bản ghi kiểm toán chỉ ghi thêm (append-only), tự động che các trường nhạy cảm (redaction), chỉ ADMIN được xem.

### [F013] Broadcast Notifications — Phân hệ: Administration & System
- **Mô tả chức năng:** Hệ thống phát thông báo toàn hệ thống (Broadcast): tạo bản nháp, chỉnh sửa, xóa và gửi thông báo chung.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **77.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:308, ui/src/views/system_broadcasts.rs, tests::system_broadcast_drafts_persist_and_are_admin_only`
- **Hạng mục còn thiếu / Rào cản:** Chưa tích hợp gửi đa kênh (SMS Gateway, Email Broadcast); giao diện hiển thị rõ 'Chưa hỗ trợ gửi HTML/Email'.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Bản nháp thông báo lưu vào SQLite, tìm kiếm không phân biệt chữ hoa thường, từ chối quyền truy cập của USER thường.

### [F014] Activation Email Template Config — Phân hệ: Administration & System
- **Mô tả chức năng:** Cấu hình mẫu thư điện tử kích hoạt tài khoản nhân viên mới dành cho quản trị viên.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `2/5` | **Trọng số:** `4`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **96.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:279, ui/src/views/administration.rs, tests::activation_email_template_is_admin_only_validated_and_persistent`
- **Hạng mục còn thiếu / Rào cản:** Trình soạn thảo văn bản thuần (plain text), chưa hỗ trợ kéo thả mẫu Rich HTML động.
- **Điều kiện nghiệm thu (Acceptance Criteria):** GET/PUT lưu cấu hình template an toàn trong bảng settings, xác thực các trường bắt buộc.

### [F015] System Settings & Appearance — Phân hệ: Administration & System
- **Mô tả chức năng:** Cài đặt cá nhân và giao diện: tùy chỉnh chế độ màu sáng/tối (Theme Dark/Light), bố cục thanh điều hướng.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **81.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/settings.rs, ui/src/theme.rs, tests::settings::tests::appearance_clicks_save_and_reset_only_supported_preferences`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ chuyển đổi đa ngôn ngữ (hiện cố định Tiếng Việt).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Thay đổi theme phản hồi tức thì trên canvas egui và lưu trạng thái vào preferences.

### [F016] Roles & Permissions Management — Phân hệ: Administration & System
- **Mô tả chức năng:** Quản lý vai trò và phân quyền quản trị: hiển thị danh sách vai trò và quyền hạn theo từng phân hệ.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **56.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/administration.rs:533`
- **Hạng mục còn thiếu / Rào cản:** Máy chủ hiện cố định 2 vai trò ADMIN và USER; chưa hỗ trợ tạo thêm vai trò tùy biến (Custom Roles).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Giao diện giải thích rõ 'Các vai trò trên tài khoản được thực thi bởi máy chủ. Chưa hỗ trợ nhóm quyền tùy chỉnh'.

### [F017] Data Backup & Recovery — Phân hệ: Administration & System
- **Mô tả chức năng:** Quản lý sao lưu dữ liệu hệ thống: tạo snapshot toàn bộ tệp CSDL SQLite và kho lưu trữ tệp.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **53.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `legacy/api/backups.mjs, ui/src/views/administration.rs`
- **Hạng mục còn thiếu / Rào cản:** Chưa có nút khôi phục (restore) 1 chạm trực tiếp trên UI Rust do yêu cầu an toàn vận hành.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Gói sao lưu sinh tệp ZIP hợp lệ chứa hình ảnh SQLite nhất quán và manifest kiểm tra băm SHA-256.

### [F018] Org Units Management — Phân hệ: Business & Organization
- **Mô tả chức năng:** Quản trị cơ cấu đơn vị tổ chức: tạo phòng ban/chi nhánh, phân cấp cha-con, chỉ định trưởng bộ phận, chống tạo vòng lặp.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **94.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:305, ui/src/views/org_units.rs, tests::org_unit_collection_persists_and_restricts_mutations_to_admins`
- **Hạng mục còn thiếu / Rào cản:** Chưa tích hợp xuất sơ đồ tổ chức ra định dạng tệp ảnh vector SVG/PDF.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Kiểm tra chống tạo vòng lặp cây cha-con thành công; xóa phòng ban tự động hủy gán nhân sự trong cùng transaction.

### [F019] Org Chart & Hierarchy — Phân hệ: Business & Organization
- **Mô tả chức năng:** Hiển thị trực quan sơ đồ cây doanh nghiệp (Org Chart), tính toán số lượng nhân sự thực tế theo từng đơn vị.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **84.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/org_units.rs:350, tests::views::org_units::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ thao tác kéo thả (drag & drop) để sắp xếp lại vị trí phòng ban trên sơ đồ.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Sơ đồ hiển thị chính xác cây phân cấp và tổng số nhân sự đang hoạt động trong từng nhánh.

### [F020] HR Overview & Metrics — Phân hệ: HR Management
- **Mô tả chức năng:** Bảng tổng quan phân hệ nhân sự: các chỉ số nhân sự tổng, tỷ lệ nam/nữ, phân bổ theo phòng ban.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `2/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **85.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/hr_overview.rs`
- **Hạng mục còn thiếu / Rào cản:** Chưa có dự báo biến động nhân sự tương lai qua mô hình thống kê.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Dữ liệu thống kê tính toán trực tiếp từ bảng employee_profiles trong CSDL.

### [F021] Employees Directory & Management — Phân hệ: HR Management
- **Mô tả chức năng:** Quản lý hồ sơ nhân viên toàn diện: danh sách, tạo mới, chỉnh sửa thông tin, cho thôi việc/nghỉ hưu mềm (soft retire).
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `5/5` | **Trọng số:** `25`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **88.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:779, ui/src/views/employees.rs, tests::employee_management_persists_profiles_and_enforces_role_boundaries`
- **Hạng mục còn thiếu / Rào cản:** Thiếu luồng gửi email tự động khi tạo nhân viên mới (cần module SMTP).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Thôi việc nhân viên tự động khóa tài khoản đăng nhập và hủy toàn bộ liên kết kích hoạt còn hiệu lực.

### [F022] Onboarding Tracking — Phân hệ: HR Management
- **Mô tả chức năng:** Theo dõi quy trình hội nhập nhân viên mới (Onboarding): phân công người hướng dẫn (mentor), kế hoạch 60 ngày đánh giá.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **78.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/hr_onboarding.rs, ui/src/views/hr_onboarding.rs, tests::hr_onboarding::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ cấu hình quy trình checklist 14 bước chi tiết cho từng loại vị trí đặc thù.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Tạo nhiệm vụ hội nhập liên kết hồ sơ nhân sự thực tế, tính ngày đánh giá chính xác sau 60 ngày.

### [F023] Recruitment & Job Openings — Phân hệ: HR Management
- **Mô tả chức năng:** Quản lý tin tuyển dụng và nhu cầu định biên: vị trí tuyển, cấp bậc, số lượng cần tuyển, hạn nộp hồ sơ.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **73.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/hr_recruitment.rs, ui/src/views/hr_recruitment.rs, tests::hr_recruitment::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có cổng nộp CV công khai (Public Career Portal) và quy trình phỏng vấn nhiều vòng.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Tạo tin tuyển dụng lưu trữ với mã định danh duy nhất, không tạo các con số ứng viên giả mạo.

### [F024] Performance Reviews — Phân hệ: HR Management
- **Mô tả chức năng:** Quản lý đánh giá hiệu suất nhân sự (KPIs): ghi nhận điểm đánh giá, xếp loại tự động (A/B/C/D), đề xuất thưởng.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **86.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/hr_performance_reviews.rs, ui/src/views/hr_performance_reviews.rs, tests::hr_performance_reviews::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có cơ chế đánh giá 360 độ từ đồng nghiệp và cấp dưới.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Xếp loại kết quả theo quy tắc thang điểm xác định, phê duyệt một lần duy nhất qua audit ledger.

### [F025] Headcount Quotas — Phân hệ: HR Management
- **Mô tả chức năng:** Quản lý định biên nhân sự theo vị trí công việc: hạn mức số lượng, ngân sách lương dự kiến, tính toán vị trí trống thực tế.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **80.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/hr_headcount.rs, ui/src/views/hr_headcount.rs, tests::hr_headcount::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có quy trình phê duyệt điều chỉnh định biên đa cấp.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Số lượng nhân sự hiện tại được tính toán động từ số nhân viên đang hoạt động trong danh bạ.

### [F026] Rewards & Recognition — Phân hệ: HR Management
- **Mô tả chức năng:** Quản lý khen thưởng và vinh danh: ghi nhận quyết định khen thưởng, chuyển đổi trạng thái (Chờ duyệt -> Đã duyệt -> Đã trao).
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **88.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/hr_rewards.rs, ui/src/views/hr_rewards.rs, tests::hr_rewards::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tích hợp tự động kết chuyển khoản thưởng vào kỳ tính lương tháng.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Quy trình chuyển đổi trạng thái một chiều có lưu vết người phê duyệt và thời gian máy chủ.

### [F027] Training Courses — Phân hệ: HR Management
- **Mô tả chức năng:** Quản lý khóa đào tạo nội bộ: danh mục khóa học, giảng viên, ngân sách, số lượng chỗ dự kiến, lịch đào tạo.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **81.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/hr_training.rs, ui/src/views/hr_training.rs, tests::hr_training::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có bài kiểm tra trắc nghiệm đánh giá kết quả sau đào tạo trực tuyến.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Dữ liệu khóa học lưu trữ nhất quán, không hiển thị các chứng chỉ cấp giả mạo.

### [F028] Certificates & Credentials — Phân hệ: HR Management
- **Mô tả chức năng:** Quản lý chứng chỉ nghề nghiệp của nhân sự: tên chứng chỉ, đơn vị cấp, số hiệu, ngày hết hạn và cảnh báo tự động.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **83.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/hr_certificates.rs, ui/src/views/hr_certificates.rs, tests::hr_certificates::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có kết nối kiểm tra chứng chỉ số qua API của đơn vị cấp bằng quốc tế.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Trạng thái còn hạn/hết hạn được tính toán chuẩn xác từ ngày hết hạn so với thời gian hiện tại.

### [F029] Uniforms Handover — Phân hệ: HR Management
- **Mô tả chức năng:** Quản lý cấp phát đồng phục và trang thiết bị bảo hộ: ghi nhận số lượng, chủng loại, kích cỡ và biên bản bàn giao.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `2/5` | **Trọng số:** `4`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **83.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/hr_uniforms.rs, ui/src/views/hr_uniforms.rs, tests::hr_uniforms::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có module theo dõi tồn kho đồng phục nhập - xuất - tồn trong kho tổng.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Biên bản bàn giao ghi nhận người cấp và thời điểm, chỉ cho phép thực hiện một lần duy nhất.

### [F030] Employee History Notes — Phân hệ: HR Management
- **Mô tả chức năng:** Sổ lịch sử công tác nhân viên: ghi chép biến động chức vụ, thuyên chuyển bộ phận, tăng giảm lương, xử lý kỷ luật.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **86.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/hr_employee_history.rs, ui/src/views/hr_employee_history.rs, tests::hr_employee_history::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có quy trình đính kèm tệp văn bản quyết định scan có chữ ký số.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Bản ghi lịch sử chỉ thêm (append-only), liên kết chặt chẽ với mã nhân viên trong hệ thống.

### [F031] HR Bank Accounts & Quarantine — Phân hệ: HR Management
- **Mô tả chức năng:** Quản lý tài khoản ngân hàng nhân sự: mã hóa AES-GCM 256-bit số tài khoản, quy trình cách ly (quarantine) và duyệt tài khoản.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/employee_bank_accounts.rs, ui/src/views/employee_bank_import.rs, tests::employee_bank_accounts::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa tích hợp API xác thực chủ tài khoản tự động (VietQR / Napas).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Số tài khoản ngân hàng lưu trữ dưới dạng ciphertext; chỉ ADMIN có thẩm quyền mới được giải mã.

### [F032] Employee Portal Home — Phân hệ: Employee Portal
- **Mô tả chức năng:** Cổng thông tin tự phục vụ nhân viên: bảng tin cá nhân, lối tắt xem bảng lương, chấm công, gửi yêu cầu nghỉ.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `3/5` | **Trọng số:** `15`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **86.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/employee_portal.rs, tests::views::employee_portal::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ cá nhân hóa vị trí các khối tiện ích (widget drag & drop).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Giao diện responsive tương thích hoàn hảo trên cả 3 kích thước màn hình máy tính, máy tính bảng và điện thoại.

### [F033] Employee Profile Self-Update — Phân hệ: Employee Portal
- **Mô tả chức năng:** Cập nhật thông tin cá nhân nhân viên: xem hồ sơ đầy đủ, tự chỉnh sửa số điện thoại liên lạc và địa chỉ cư trú.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `3/5` | **Trọng số:** `15`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:783, ui/src/views/employee_portal.rs:400, tests::tests::employee_profile_api_redacts_and_rejects_plaintext_bank_account_fields`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ tải lên và cắt cúp ảnh đại diện (avatar upload) trực tiếp trên giao diện.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Nhân viên chỉ được cập nhật số điện thoại và địa chỉ; không được tự sửa chức danh, lương hay phòng ban.

### [F034] Employee Leave Self-Service — Phân hệ: Employee Portal
- **Mô tả chức năng:** Nhân viên tạo yêu cầu xin nghỉ phép: chọn loại phép (năm/ốm/việc riêng), chọn buổi/ngày, lý do và xem tiến độ xét duyệt.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **91.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/employee_leave_requests.rs, ui/src/views/attendance_leave_requests.rs:1000, tests::employee_leave_requests::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa tự động trừ phép vào quỹ phép năm tích lũy của năm hiện hành.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Kiểm tra chặn khoảng ngày nghỉ ngược (ngày bắt đầu sau ngày kết thúc), ghi nhận lịch sử trạng thái minh bạch.

### [F035] Employee Overtime Requests — Phân hệ: Employee Portal
- **Mô tả chức năng:** Nhân viên đăng ký làm việc thêm giờ (Overtime): nhập số giờ, loại ngày (ngày thường/cuối tuần/lễ), mã dự án.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **91.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/employee_overtime_requests.rs, ui/src/views/employee_overtime_requests.rs, tests::employee_overtime_requests::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có quy định giới hạn tối đa số giờ làm thêm theo tháng của Bộ luật Lao động.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Chấp nhận số giờ chia hết cho 0.5, kiểm tra quyền sở hữu chính chủ của người tạo đơn.

### [F036] Employee Payslips Projection — Phân hệ: Employee Portal
- **Mô tả chức năng:** Nhân viên tra cứu phiếu lương cá nhân theo từng tháng: lương cơ bản, phụ cấp, các khoản giảm trừ, số thực nhận.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **81.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/employee_payslips.rs, ui/src/views/employee_portal.rs:700, tests::employee_payslips::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có chức năng ký số điện tử trên phiếu lương và xuất tệp PDF có dấu đỏ.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Dữ liệu phiếu lương chiếu đúng theo owner_id của người đăng nhập; không bao giờ để lộ lương của đồng nghiệp.

### [F037] Employee Proposals Submission — Phân hệ: Employee Portal
- **Mô tả chức năng:** Nhân viên gửi kiến nghị / đề xuất cải tiến (Proposals) lên ban lãnh đạo: tiêu đề, loại sáng kiến, ngân sách dự kiến.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **91.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/employee_proposals.rs, ui/src/views/employee_proposals.rs, tests::employee_proposals::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có quy trình phản hồi trao đổi thảo luận nhiều chiều dạng bình luận (comment thread).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Sinh mã đề xuất KNG tự động, cho phép quản trị viên phản hồi kết quả phê duyệt kèm ghi chú.

### [F038] Employee Asset Allocations — Phân hệ: Employee Portal
- **Mô tả chức năng:** Nhân viên kiểm tra danh mục tài sản và thiết bị làm việc đang được bàn giao và thực hiện xác nhận nhận bàn giao.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **91.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/asset_allocations.rs:400, ui/src/views/asset_allocations.rs:500, tests::asset_allocations::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng báo hỏng thiết bị trực tiếp từ danh mục tài sản cá nhân.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Nhân viên xem đúng tài sản mang mã định danh của mình, thực hiện bấm xác nhận bàn giao có lưu vết.

### [F039] Employee Bank Registration — Phân hệ: Employee Portal
- **Mô tả chức năng:** Nhân viên đăng ký thông tin tài khoản ngân hàng nhận lương: tên ngân hàng, chi nhánh, số tài khoản.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **91.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/employee_bank_accounts.rs:500, ui/src/views/employee_bank_accounts.rs, tests::employee_bank_accounts::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ liên kết nhiều tài khoản ngân hàng cùng lúc cho một nhân sự.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Thông tin gửi lên được mã hóa AES-GCM ngay tại backend và chuyển sang trạng thái chờ duyệt.

### [F040] Personal Notifications Center — Phân hệ: Employee Portal
- **Mô tả chức năng:** Trung tâm thông báo cá nhân: thông báo thời gian thực về duyệt đơn, cập nhật ca làm việc, đánh dấu đã đọc.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:6972, ui/src/views/notifications.rs, tests::notifications_are_persisted_and_scoped_to_authenticated_users`
- **Hạng mục còn thiếu / Rào cản:** Chưa có cơ chế đẩy thông báo qua trình duyệt (Web Push Notifications) khi đóng tab.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Thông báo lưu trữ theo người dùng, hỗ trợ đánh dấu đã đọc tất cả và điều hướng tới trang liên quan.

### [F041] Handwritten Signatures Pad — Phân hệ: Employee Portal
- **Mô tả chức năng:** Bảng vẽ chữ ký tay điện tử: hỗ trợ vẽ chữ ký trên màn hình cảm ứng, lưu trữ tạm thời cho các tài liệu nội bộ.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **80.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/signatures.rs, tests::views::signatures::tests`
- **Hạng mục còn thiếu / Rào cản:** Chữ ký hình ảnh (image) thuần túy, chưa có giá trị pháp lý chứng thư số PKI/X.509.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Chữ ký vẽ lưu an toàn trong phiên làm việc, tự động dọn dẹp khi đăng xuất hoặc đổi tài khoản.

### [F042] Cash Transactions & Vouchers — Phân hệ: Finance
- **Mô tả chức năng:** Quản lý phiếu thu và phiếu chi tiền mặt: sinh mã tự động (PT/PC), lọc theo nguồn quỹ (ngân hàng/quỹ tiền mặt), hủy chứng từ có xác nhận.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `5/5` | **Trọng số:** `25`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/finance.rs:16, ui/src/views/finance.rs, tests::finance::tests::cash_transaction_http_routes_enforce_admin_and_preserve_legacy_contract`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ in phiếu thu/chi ra mẫu biểu kế toán chuẩn theo Thông tư 200/133.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Tạo chứng từ thu/chi hợp lệ, lưu vào SQLite; thao tác hủy chứng từ yêu cầu mở modal xác nhận.

### [F043] Cash Flow Analysis — Phân hệ: Finance
- **Mô tả chức năng:** Báo cáo phân tích dòng tiền (Cash Flow): tổng hợp thu, chi, số dư ròng theo từng danh mục và kỳ báo cáo kế toán.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/cash_flow.rs, tests::views::cash_flow::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa tích hợp dự báo dòng tiền tương lai (Cash Flow Forecasting).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Tính toán chỉ dựa trên các chứng từ đã hoàn thành thực tế, loại trừ các giao dịch nháp hoặc đã hủy.

### [F044] Bank Accounts Management — Phân hệ: Finance
- **Mô tả chức năng:** Quản lý danh mục tài khoản ngân hàng doanh nghiệp: số tài khoản mã hóa AES-GCM, chủ tài khoản, ngân hàng, chi nhánh.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/finance.rs:41, ui/src/views/bank_accounts.rs, tests::finance::tests::bank_account_routes_are_admin_only_and_encrypt_account_numbers_at_rest`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng kết nối lấy sao kê tự động theo thời gian thực từ cổng thanh toán.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Chặn lưu trùng số tài khoản dạng plaintext trong CSDL; số dư ghi nhận là số dư khai báo kế toán nội bộ.

### [F045] Bank Ledger & Statements View — Phân hệ: Finance
- **Mô tả chức năng:** Sổ phụ ngân hàng và giao dịch qua tài khoản: theo dõi chi tiết biến động tiền gửi ngân hàng theo từng tài khoản.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **83.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/bank_accounts.rs:800, tests::finance::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng đối soát tự động (Bank Reconciliation) với tệp sao kê MT940.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Dữ liệu sổ phụ tái sử dụng đúng nguồn chứng từ hợp lệ, phân trang 10 dòng chuẩn mực.

### [F046] Internal Bank Transfers (Atomic) — Phân hệ: Finance
- **Mô tả chức năng:** Chuyển tiền nội bộ giữa các tài khoản ngân hàng: sinh cặp phiếu chi - phiếu thu liên kết nguyên tử trong một giao dịch duy nhất.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **98.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/finance.rs:58, ui/src/views/bank_accounts.rs:1000, tests::finance::tests::bank_transfer_creates_linked_vouchers_atomically_and_is_idempotent`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ chuyển tiền đa ngoại tệ (hiện tại tính toán theo VNĐ).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Thao tác atomic: nếu tạo vế ghi có lỗi thì tự động rollback vế ghi nợ; hỗ trợ cơ chế idempotent chống gửi đúp.

### [F047] Legacy Finance Data Importer — Phân hệ: Finance
- **Mô tả chức năng:** Bộ công cụ di chuyển dữ liệu tài chính cũ (Legacy Finance Importer): trích xuất an toàn tài khoản và phiếu thu/chi legacy.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/finance_import.rs, tools/export_legacy_finance.mjs, tests::finance_import::tests`
- **Hạng mục còn thiếu / Rào cản:** Yêu cầu người vận hành cung cấp khóa giải mã legacy qua biến môi trường trước khi thực hiện.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Kiểm tra tính nhất quán mã băm (digest verification), lưu trữ bản lưu vết gốc mã hóa và không bao giờ ghi đè nếu có xung đột.

### [F048] E-Banking Integration — Phân hệ: Finance
- **Mô tả chức năng:** Kết nối ngân hàng điện tử doanh nghiệp (E-Banking): kết nối cổng thanh toán của các ngân hàng thương mại.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `4/5` | **Trọng số:** `8`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **36.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/bank_accounts.rs:1150`
- **Hạng mục còn thiếu / Rào cản:** Chưa có hợp đồng kết nối API ngân hàng thực tế; giao diện hiển thị thông báo trung thực 'Chưa cấu hình'.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Không hiển thị kết nối thành công giả mạo; vô hiệu hóa các nút bấm khi chưa có cấu hình.

### [F049] Enterprise Budgeting — Phân hệ: Finance
- **Mô tả chức năng:** Quản trị ngân sách tài chính doanh nghiệp: thiết lập các tầng hạn mức ngân sách theo phòng ban và theo dõi chi tiêu.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **59.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/finance.rs:500`
- **Hạng mục còn thiếu / Rào cản:** Chưa có cảnh báo tự động khi chi tiêu vượt quá 90% hạn mức ngân sách được cấp.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Lưu trữ định nghĩa ngân sách an toàn, từ chối các khoản chi vượt thẩm quyền.

### [F050] Asset Inventory & Items — Phân hệ: Asset Management
- **Mô tả chức năng:** Quản lý danh mục tài sản cố định và công cụ dụng cụ: mã tài sản, mã vạch barcode, nguyên giá, thời gian trích khấu hao, hiện trạng.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **89.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:6456, ui/src/views/assets.rs, tests::asset_collection_is_revisioned_persistent_and_admin_write_only`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng in tem nhãn tài sản tích hợp máy in mã vạch chuyên dụng.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Cập nhật tài sản kiểm tra khóa revision chống ghi đè; hỗ trợ xem chi tiết đầy đủ trong drawer trượt.

### [F051] Asset Materials & Stock Cards — Phân hệ: Asset Management
- **Mô tả chức năng:** Quản lý vật tư tiêu hao và thẻ kho (Stock Cards): ghi nhận phiếu nhập kho, phiếu xuất kho, lịch sử biến động số lượng.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **88.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:288, ui/src/views/asset_materials.rs, tests::asset_material_revision_prevents_stale_stock_overwrite_and_audits_atomically`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ cảnh báo tự động khi số lượng tồn kho giảm xuống dưới định mức tối thiểu.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Giao dịch kho thực hiện nguyên tử, ghi nhận sự kiện kiểm toán kèm số lượng trước và sau biến động.

### [F052] Asset Allocations & Returns — Phân hệ: Asset Management
- **Mô tả chức năng:** Quản lý cấp phát và thu hồi tài sản: lập phiếu cấp phát cho nhân sự, ghi nhận tình trạng khi thu hồi về kho.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **90.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/asset_allocations.rs, ui/src/views/asset_allocations.rs, tests::asset_allocations_are_revisioned_scoped_and_acknowledged_by_the_right_actor`
- **Hạng mục còn thiếu / Rào cản:** Chưa có chữ ký điện tử xác nhận của thủ kho trên biên bản xuất kho.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Cấp phát tài sản ràng buộc mã nhân viên trong danh bạ; nhân viên xác nhận receipt thì trạng thái chuyển thành hoàn tất.

### [F053] Asset Transfers Lifecycle — Phân hệ: Asset Management
- **Mô tả chức năng:** Quy trình điều chuyển tài sản giữa các chi nhánh/phòng ban: đề xuất điều chuyển, phê duyệt, từ chối và ghi nhận tiếp nhận.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/asset_transfers.rs, ui/src/views/asset_transfers.rs, tests::asset_transfers_use_authenticated_transactional_lifecycle_and_audit`
- **Hạng mục còn thiếu / Rào cản:** Chưa có module tích hợp đơn vị vận chuyển bên ngoài để theo dõi vị trí GPS kiện hàng.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Chặn điều chuyển cùng địa điểm; thao tác từ chối yêu cầu nhập lý do; ghi nhận thông tin người tiếp nhận.

### [F054] Asset Maintenance Schedules — Phân hệ: Asset Management
- **Mô tả chức năng:** Quản lý kế hoạch bảo dưỡng định kỳ tài sản: tần suất bảo dưỡng, lịch đến hạn, danh mục kiểm tra (checklist), chi phí.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **89.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/asset_maintenances.rs, ui/src/views/asset_maintenances.rs, tests::asset_maintenance_is_admin_only_persistent_and_generic_write_bypasses_are_blocked`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng tự động gửi thông báo nhắc việc bảo dưỡng trước 3 ngày đến kỹ thuật viên.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Xác thực danh mục kiểm tra phải hoàn tất đầy đủ mới cho phép ghi nhận hoàn thành đợt bảo dưỡng.

### [F055] Asset Repairs Management — Phân hệ: Asset Management
- **Mô tả chức năng:** Quản lý sửa chữa và khắc phục sự cố tài sản: lập phiếu yêu cầu sửa chữa, báo giá, phê duyệt chi phí, nghiệm thu hoàn thành.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **89.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/asset_repairs.rs, ui/src/views/asset_repairs.rs, tests::asset_repairs_preserve_legacy_collection_and_enforce_audited_lifecycle`
- **Hạng mục còn thiếu / Rào cản:** Chưa có báo cáo phân tích tổng chi phí sửa chữa so với nguyên giá để đề xuất thanh lý.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Vòng đời xử lý qua các bước có lưu vết; cập nhật trạng thái thiết bị tương ứng trong danh mục tài sản.

### [F056] Asset Disposals & Loss — Phân hệ: Asset Management
- **Mô tả chức năng:** Quản lý thanh lý và xử lý mất mát tài sản: 5 phương thức thanh lý, tính toán giá trị còn lại, xác nhận xóa sạch dữ liệu.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **89.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/asset_disposals.rs, ui/src/views/asset_disposals.rs, tests::asset_disposals_preserve_legacy_rows_and_enforce_audited_settlement`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tệp PDF mẫu biên bản thanh lý tài sản cố định theo Thông tư số 200/2014/TT-BTC.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Tính toán giá trị còn lại chính xác; xác nhận xóa dữ liệu (wipe) là cam kết của người duyệt có ghi vết.

### [F057] Asset Depreciation Subledger — Phân hệ: Asset Management
- **Mô tả chức năng:** Sổ trích khấu hao tài sản cố định (Subledger): tính toán khấu hao đường thẳng hàng tháng, chạy khấu hao định kỳ kỳ kế toán.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **90.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/asset_depreciations.rs, ui/src/views/asset_depreciations.rs, tests::asset_depreciations_preserve_legacy_rows_and_record_idempotent_monthly_runs`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ phương pháp trích khấu hao theo sản lượng hoặc số dư giảm dần có điều chỉnh.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Chạy khấu hao tháng có tính chất idempotent (chạy lại cùng tháng không sinh trùng dữ liệu); lưu sổ phụ riêng biệt.

### [F058] Asset Audits & Barcode Scan — Phân hệ: Asset Management
- **Mô tả chức năng:** Kiểm kê tài sản định kỳ: quét mã vạch kiểm kê, đối soát tài sản thực tế với số liệu trên sổ sách, ghi nhận sai lệch thừa/thiếu.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **85.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/asset_audits.rs, ui/src/views/asset_audits.rs, tests::asset_audits_snapshot_inventory_record_scans_close_and_submit_resolution`
- **Hạng mục còn thiếu / Rào cản:** Chưa có ứng dụng di động native hỗ trợ quét mã vạch qua camera điện thoại chuyên dụng.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Ghi nhận tiến độ kiểm kê, đóng đợt kiểm kê và sinh biên bản chênh lệch tài sản minh bạch.

### [F059] Asset To-Do & Kanban — Phân hệ: Asset Management
- **Mô tả chức năng:** Bảng công việc quản lý tài sản dạng Kanban: phân luồng các phiếu công việc (Cần làm, Đang làm, Hoàn tất).
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **80.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/asset_todo.rs, tests::views::asset_todo::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng tự động gán việc cho kỹ thuật viên dựa trên khối lượng công việc hiện tại.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Bố cục kanban co giãn tốt trên 4 loại kích thước màn hình, thao tác chuyển cột mượt mà.

### [F060] Asset Legacy Importers (8 tools) — Phân hệ: Asset Management
- **Mô tả chức năng:** Hệ thống 8 công cụ nhập dữ liệu tài sản cũ (Legacy Asset Importers): nhập an toàn danh mục, cấp phát, điều chuyển, khấu hao...
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/legacy_asset_*_import.rs, tools/export_legacy_asset_*.js, tests::legacy_asset_*_import::tests`
- **Hạng mục còn thiếu / Rào cản:** Yêu cầu tệp nguồn JSON được trích xuất bằng script kiểm toán được phê duyệt.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Xem trước bản tóm tắt số liệu (preview-only), yêu cầu gõ cụm từ xác nhận chính xác trước khi áp dụng.

### [F061] Attendance Overview & Monitoring — Phân hệ: Attendance & Tracking
- **Mô tả chức năng:** Bảng điều khiển tổng quan phân hệ chấm công: tỷ lệ đi làm đúng giờ, số người vắng mặt, biểu đồ đi trễ theo phòng ban.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **81.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/attendance.rs, tests::views::attendance::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có bản đồ nhiệt (heat map) theo dõi khung giờ tập trung điểm danh cao điểm.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Số liệu hiển thị trung thực từ dữ liệu chấm công thực tế, không sinh số liệu demo.

### [F062] Shifts Catalog Management — Phân hệ: Attendance & Tracking
- **Mô tả chức năng:** Quản lý danh mục ca làm việc (Shifts Catalog): thời gian bắt đầu/kết thúc, thời gian nghỉ giữa ca, số phút cho phép đi trễ.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `3/5` | **Trọng số:** `15`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **89.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:293, ui/src/views/attendance_shifts.rs, tests::attendance_shift_collection_is_admin_only_validated_and_persistent`
- **Hạng mục còn thiếu / Rào cản:** Chưa có ca làm việc linh hoạt không cố định giờ (Flexible shift).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Lưu trữ định nghĩa ca làm việc với kiểm soát khóa revision; từ chối ca có khoảng thời gian không hợp lệ.

### [F063] Shift Assignments & Roster — Phân hệ: Attendance & Tracking
- **Mô tả chức năng:** Phân ca làm việc cho nhân viên (Shift Assignments): xếp ca cho nhân sự theo tuần/tháng, kiểm tra trùng lặp ca.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **90.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/attendance_shift_assignments.rs, ui/src/views/attendance_shift_assignments.rs, tests::attendance_shift_assignments_are_admin_only_linked_and_audited`
- **Hạng mục còn thiếu / Rào cản:** Chưa có quy trình đổi ca tự phục vụ giữa hai nhân viên (Shift swap request flow).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Liên kết chặt chẽ mã nhân viên và mã ca làm việc hợp lệ; lưu vết lịch sử xếp ca của quản trị viên.

### [F064] Admin Leave Requests Review — Phân hệ: Attendance & Tracking
- **Mô tả chức năng:** Quản trị viên phê duyệt đơn xin nghỉ phép của nhân sự: duyệt đơn, từ chối đơn kèm lý do, xem lịch sử duyệt.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **90.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:297, ui/src/views/attendance_leave_requests.rs, tests::leave_request_collection_is_admin_only_validated_and_persistent`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng ủy quyền phê duyệt đơn nghỉ phép khi quản lý đi công tác vắng mặt.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Chỉ quản trị viên có quyền mới được phê duyệt; bản ghi sau khi duyệt là bất biến không thể sửa đổi.

### [F065] Admin Overtime Review — Phân hệ: Attendance & Tracking
- **Mô tả chức năng:** Quản trị viên phê duyệt đơn làm thêm giờ (Overtime Review): thẩm định số giờ làm thêm, phê duyệt hoặc từ chối.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **90.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/employee_overtime_requests.rs:200, ui/src/views/attendance_leave_requests.rs:1500, tests::employee_overtime_requests::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa tự động tính toán số tiền phụ cấp làm thêm giờ theo hệ số luật định.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Ghi nhận người duyệt và thời điểm phê duyệt chính xác trên máy chủ.

### [F066] Timesheets & Calendar Matrix — Phân hệ: Attendance & Tracking
- **Mô tả chức năng:** Bảng chấm công tổng hợp và chi tiết ngày công (Timesheet Matrix): hiển thị dạng lưới lịch tháng các ký hiệu công.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **70.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/attendance_records.rs, tests::views::attendance_records::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có công cụ tính công tự động từ dữ liệu quẹt thẻ thô (Raw punch data).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Lưới chấm công co giãn linh hoạt, không bị vỡ giao diện trên màn hình độ phân giải thấp.

### [F067] Biometric Clock-in / FaceID — Phân hệ: Attendance & Tracking
- **Mô tả chức năng:** Tích hợp thiết bị chấm công sinh trắc học (Máy nhận diện khuôn mặt FaceID / Vân tay / Camera AI).
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `5/5` | **Trọng số:** `10`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **24.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `legacy/web/src/modules/attendance/attendanceRules.ts`
- **Hạng mục còn thiếu / Rào cản:** Chưa có kết nối phần cứng máy chấm công vật lý; các nút đồng bộ trên giao diện ở trạng thái vô hiệu hóa.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Không báo kết nối máy chấm công thành công giả mạo; tuân thủ nguyên tắc trung thực dữ liệu.

### [F068] Workflow Blueprints Catalog — Phân hệ: Workflows & Approvals
- **Mô tả chức năng:** Quản lý danh mục quy trình nghiệp vụ (Workflow Blueprints): định nghĩa các bước phê duyệt, thời hạn cam kết SLA, danh mục áp dụng.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **89.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/workflows.rs, ui/src/views/workflow_blueprints.rs, tests::workflow_blueprints_are_typed_admin_only_and_generic_writes_are_blocked`
- **Hạng mục còn thiếu / Rào cản:** Chưa có công cụ vẽ luồng quy trình đồ họa BPMN 2.0 trực quan (hiện cấu hình theo bảng bước).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Lưu trữ định nghĩa quy trình chuẩn hóa, tạo mã định danh duy nhất, ngăn chặn tạo quy trình trùng mã.

### [F069] Workflow Requests & Decisions — Phân hệ: Workflows & Approvals
- **Mô tả chức năng:** Khởi tạo và phê duyệt phiếu yêu cầu quy trình (Workflow Requests): nộp phiếu, duyệt, từ chối, yêu cầu bổ sung thông tin.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `5/5` | **Trọng số:** `25`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **86.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/workflows/requests.rs, ui/src/views/workflow_requests.rs, tests::workflow_requests_persist_with_immutable_submission_history_and_admin_access`
- **Hạng mục còn thiếu / Rào cản:** Các bước quy trình yêu cầu chữ ký số điện tử bắt buộc (requirePKI) hiện tại fail closed an toàn trả về 503.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Chặn người tạo phiếu tự phê duyệt phiếu của chính mình; ghi nhận lịch sử duyệt bất biến.

### [F070] Workflow Overview Dashboard — Phân hệ: Workflows & Approvals
- **Mô tả chức năng:** Bảng tổng quan theo dõi tiến độ các quy trình trong toàn doanh nghiệp: số phiếu đang xử lý, số phiếu quá hạn SLA.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **81.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/workflows.rs, tests::workflows::tests::overview_metrics_keep_paused_and_unrecognized_states_separate`
- **Hạng mục còn thiếu / Rào cản:** Chưa có cảnh báo tự động qua tin nhắn khi phiếu yêu cầu sắp chạm ngưỡng vi phạm thời gian SLA.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Tổng hợp dữ liệu chính xác từ các nguồn phiếu thực tế, phân tách rõ trạng thái tạm dừng và đang chạy.

### [F071] Workflow Audit History Stream — Phân hệ: Workflows & Approvals
- **Mô tả chức năng:** Sổ lịch sử xử lý quy trình phê duyệt: hiển thị toàn bộ tiến trình lịch sử sự kiện nộp đơn và các quyết định xét duyệt.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **86.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:6722, ui/src/views/workflow_history.rs, tests::workflow_history::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng xuất toàn bộ tiến trình lịch sử phê duyệt ra tệp chứng thực PDF.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Dữ liệu lịch sử chỉ đọc, phản ánh chân thực chuỗi sự kiện được ghi nhận trên máy chủ.

### [F072] Workflow Settings & Delegation — Phân hệ: Workflows & Approvals
- **Mô tả chức năng:** Cài đặt chính sách ủy quyền và hạn mức phê duyệt: thiết lập người được ủy quyền duyệt thay trong khoảng thời gian nhất định.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **75.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/workflow_settings.rs, tests::workflow_settings::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có bộ phân tích phát hiện ủy quyền chéo có nguy cơ xung đột lợi ích.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Lưu trữ chính sách phân cấp ngân sách an toàn, từ chối các mức phê duyệt không đúng thẩm quyền.

### [F073] Automated BPMN Execution — Phân hệ: Workflows & Approvals
- **Mô tả chức năng:** Bộ máy thực thi quy trình nghiệp vụ tự động (Automated BPMN 2.0 Execution Engine) hỗ trợ phân nhánh rẽ và chạy nền.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `5/5` | **Trọng số:** `15`
- **Trạng thái thực tế:** `NOT_STARTED` | **Tiến độ hoàn thành:** **17.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `docs/MIGRATION_MATRIX.md`
- **Hạng mục còn thiếu / Rào cản:** Chưa xây dựng công cụ runtime BPMN tự động (hiện xử lý theo các bước duyệt tuần tự).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Cần thiết kế kiến trúc máy trạng thái (State Machine) trước khi triển khai thực tế.

### [F074] Contracts Directory (PII Encrypted) — Phân hệ: Contracts
- **Mô tả chức năng:** Quản lý kho hợp đồng doanh nghiệp (lao động, kinh tế, dịch vụ): tìm kiếm, phân loại, mã hóa AES-GCM 9 trường thông tin định danh PII.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/contracts.rs, ui/src/views/contracts.rs, tests::contracts::tests::contract_reads_are_scoped_by_owner_or_unambiguous_exact_employee_code`
- **Hạng mục còn thiếu / Rào cản:** Chưa có công cụ quét OCR hợp đồng giấy đã ký để tự động trích xuất điều khoản.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Dữ liệu nhạy cảm được mã hóa an toàn tại máy chủ; chỉ ADMIN và chủ thể hợp đồng mới được giải mã xem đầy đủ.

### [F075] Contract Create / Edit / Archive — Phân hệ: Contracts
- **Mô tả chức năng:** Tạo mới, cập nhật và lưu trữ hồ sơ hợp đồng: xác thực trường dữ liệu, liên kết mã nhân sự chính xác, lưu trữ mềm (soft archive).
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **89.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/contracts.rs:200, ui/src/views/contracts.rs:300, tests::contracts::tests::contract_admin_can_create_update_and_soft_archive_without_faking_signatures`
- **Hạng mục còn thiếu / Rào cản:** Chưa tích hợp mẫu hợp đồng lao động điện tử theo chuẩn của Bộ Lao động - Thương binh và Xã hội.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Xóa hợp đồng chuyển trạng thái sang soft archive, không làm mất dữ liệu gốc.

### [F076] Contract PKI Digital Signing — Phân hệ: Contracts
- **Mô tả chức năng:** Ký số điện tử trên hợp đồng qua nhà cung cấp dịch vụ chứng thực chữ ký số công cộng (USB Token / Cloud-CA HSM).
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `5/5` | **Trọng số:** `15`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **24.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `docs/MIGRATION_BLOCKERS.md:BLK-015`
- **Hạng mục còn thiếu / Rào cản:** Chưa có nhà cung cấp chứng thư số công cộng tích hợp; hệ thống từ chối ký giả mạo.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Không hiển thị con dấu chứng thực giả mạo; tuân thủ nguyên tắc không bịa số liệu thành công.

### [F077] Enterprise Documents Library — Phân hệ: Documents & Editor
- **Mô tả chức năng:** Quản lý kho lưu trữ tài liệu doanh nghiệp: phân mục tài liệu, phân quyền truy cập (Người xem / Người bình luận / Biên tập / Chủ sở hữu).
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **86.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/documents.rs, ui/src/views/documents.rs, tests::documents::tests::shared_document_enforces_roles_and_operation_ids_are_idempotent`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng tìm kiếm toàn văn (Full-Text Search) bên trong nội dung tệp tin tài liệu.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Thực thi phân quyền chặt chẽ; người có quyền Viewer không được phép chỉnh sửa hoặc bình luận.

### [F078] Document Snapshots & Versions — Phân hệ: Documents & Editor
- **Mô tả chức năng:** Quản lý phiên bản và ảnh chụp tài liệu (Document Snapshots): lưu trữ lịch sử sửa đổi, khôi phục phiên bản cũ, kiểm soát xung đột.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **91.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/documents.rs:250, ui/src/views/document_editor.rs:800, tests::documents::tests::document_snapshot_save_rejects_stale_revision_without_mutation`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng so sánh trực quan khác biệt văn bản giữa hai phiên bản (Visual Diff).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Lưu bản chụp tài liệu tự động tăng số hiệu revision; từ chối lưu đè nếu gửi lên số revision cũ (HTTP 409).

### [F079] Document Editor (Word/DOCX Model) — Phân hệ: Documents & Editor
- **Mô tả chức năng:** Trình soạn thảo văn bản tương thích định dạng Word (DOCX Model): hỗ trợ định dạng tiêu đề, đoạn văn, danh sách gạch đầu dòng.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `5/5` | **Trọng số:** `25`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **75.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/document_editor.rs, tests::views::document_editor::tests`
- **Hạng mục còn thiếu / Rào cản:** Các khối phức tạp (bảng biểu nâng cao, ảnh chèn ngang, ngắt trang đặc thù) đang ở chế độ chỉ đọc để tránh làm mất dữ liệu.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Văn bản cơ bản round-trip nguyên vẹn giữa trình soạn thảo và định dạng lưu trữ máy chủ.

### [F080] Realtime Collaboration & Comments — Phân hệ: Documents & Editor
- **Mô tả chức năng:** Cộng tác soạn thảo tài liệu thời gian thực: hiển thị trạng thái hiện diện (presence), bình luận và giải quyết bình luận (resolve).
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `5/5` | **Trọng số:** `15`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **76.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/documents.rs:400, ui/src/views/document_editor.rs:1200, tests::documents::tests::commenter_can_post_comment_but_viewer_cannot`
- **Hạng mục còn thiếu / Rào cản:** Chưa có cơ chế Operational Transformation (OT) hoặc CRDT đa con trỏ cho nhiều người gõ đồng thời trên cùng một từ.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Gửi bình luận, đánh dấu đã giải quyết hoạt động tức thì và lưu vết người thao tác.

### [F081] File & Folder Navigation — Phân hệ: Files & Cloud Drive
- **Mô tả chức năng:** Duyệt cây thư mục và danh sách tệp tin trên Đám mây lưu trữ (Cloud Drive): điều hướng thư mục cha-con, phân biệt vùng lưu trữ cá nhân/chung.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **94.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:6983, ui/src/views/files.rs, tests::employee_file_list_and_folder_creation_use_real_workspace`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng gắn nhãn màu sắc (color tags) và đánh dấu yêu thích cho tệp tin.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Ngăn cách hoàn toàn thư mục giữa các nhân viên; không cho phép truy cập tệp ngoài phạm vi được phân quyền.

### [F082] Folder Create & Rename — Phân hệ: Files & Cloud Drive
- **Mô tả chức năng:** Tạo thư mục mới và đổi tên tệp/thư mục: kiểm tra chống trùng tên trong cùng thư mục, bảo vệ các thư mục hệ thống cố định.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `3/5` | **Trọng số:** `15`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **94.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:85, ui/src/views/files.rs:300, tests::tests::file_delete_enforces_protection_owner_and_empty_folder_rules`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ thao tác kéo thả tệp từ thư mục này sang thư mục khác trên giao diện web canvas.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Đổi tên thư mục thành công giữ nguyên nội dung bên trong; từ chối đổi tên các thư mục gốc hệ thống.

### [F083] File Upload & Binary Download — Phân hệ: Files & Cloud Drive
- **Mô tả chức năng:** Tải lên và tải xuống tệp tin nhị phân: kiểm tra danh sách loại tệp MIME cho phép, giới hạn kích thước 50 MiB, bảo toàn byte nhị phân 100%.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **94.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:90, ui/src/views/files.rs:500, tests::tests::file_upload_download_round_trip_preserves_bytes_and_owner_scope`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ tiếp tục tải lên ngắt quãng (Chunked / Resumable Upload) cho các tệp siêu lớn trên 1 GB.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Kiểm tra băm SHA-256 tệp sau khi tải về khớp 100% từng byte với tệp gốc tải lên.

### [F084] File Content Replacement — Phân hệ: Files & Cloud Drive
- **Mô tả chức năng:** Thay thế nội dung tệp tin: cập nhật byte dữ liệu mới cho tệp đã có mà vẫn giữ nguyên tên tệp và mã định danh liên kết.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **94.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:98, ui/src/views/files.rs:700, tests::tests::file_upload_download_round_trip_preserves_bytes_and_owner_scope`
- **Hạng mục còn thiếu / Rào cản:** Chưa có lưu trữ các phiên bản nội dung cũ của tệp sau khi bị ghi đè thay thế.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Thay thế tệp thành công cập nhật kích thước mới và thời gian sửa đổi gần nhất.

### [F085] Bulk Soft-Delete & Guard — Phân hệ: Files & Cloud Drive
- **Mô tả chức năng:** Xóa mềm tệp tin và bảo vệ dữ liệu: hỗ trợ chọn nhiều tệp để xóa hàng loạt tuần tự, giữ lại byte dữ liệu trên đĩa cứng.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `3/5` | **Trọng số:** `15`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **94.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:298, ui/src/views/files.rs:900, tests::tests::file_delete_enforces_protection_owner_and_empty_folder_rules`
- **Hạng mục còn thiếu / Rào cản:** Chưa có giao diện Thùng rác (Recycle Bin) cho người dùng tự khôi phục tệp đã xóa mềm.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Thư mục không rỗng không cho phép xóa; tệp bị xóa mềm lập tức biến mất khỏi danh sách nhưng byte vẫn bảo toàn.

### [F086] Public File Sharing & Guest View — Phân hệ: Files & Cloud Drive
- **Mô tả chức năng:** Chia sẻ tệp tin công khai qua liên kết bảo mật: sinh mã token ngẫu nhiên 36 ký tự an toàn, hỗ trợ xoay vòng/hủy kích hoạt liên kết.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:6997, ui/src/views/file_share.rs, tests::tests::file_upload_download_round_trip_preserves_bytes_and_owner_scope`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng đặt mật khẩu bảo vệ hoặc đặt ngày tự động hết hạn cho liên kết chia sẻ công khai.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Người ngoài truy cập liên kết công khai xem trước được ảnh/tải tệp mà không thấy mã nhân viên của người sở hữu.

### [F087] Channels & Direct Messaging — Phân hệ: Chat & Collaboration
- **Mô tả chức năng:** Hệ sinh thái kênh chat nội bộ và tin nhắn riêng: 6 kênh mặc định toàn công ty, chat trực tiếp 1:1, chat nhóm nhiều người.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **89.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/chat.rs, ui/src/views/chat.rs, tests::chat::tests::chat_messages_are_persistent_authenticated_and_announcement_is_admin_only`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ người dùng tự tạo kênh chat công ty mới qua giao diện (hiện cố định theo danh mục khởi tạo ban đầu).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Tin nhắn riêng tư giữa 2 người dùng được bảo mật tuyệt đối, người thứ ba không thể đọc được.

### [F088] Messaging, Replies & Reactions — Phân hệ: Chat & Collaboration
- **Mô tả chức năng:** Nhắn tin trao đổi công việc, trả lời theo luồng (Thread Reply), thả biểu tượng cảm xúc (Reactions), phân trang ổn định.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **90.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/chat.rs:200, ui/src/views/chat.rs:500, tests::chat::tests::chat_reactions_replies_read_state_and_private_dm_scope_persist`
- **Hạng mục còn thiếu / Rào cản:** Chưa hỗ trợ chỉnh sửa hoặc thu hồi tin nhắn đã gửi sau 15 phút.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Phân trang tin nhắn bằng con trỏ thời gian ổn định tuyệt đối ngay cả khi nhiều tin nhắn trùng microsecond.

### [F089] Chat Administration & Moderation — Phân hệ: Chat & Collaboration
- **Mô tả chức năng:** Quản trị phân hệ chat: kiểm duyệt thành viên, đăng thông báo quan trọng trên kênh thông báo chung (chỉ ADMIN có quyền).
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **80.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/chat.rs:800, tests::chat::tests::admin_empty_and_long_metadata_layout_matches_legacy_without_security_claims`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng cấm chat (mute) người dùng vi phạm quy định phát ngôn trong khoảng thời gian nhất định.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Người dùng thường gửi tin nhắn vào kênh thông báo chung bị máy chủ từ chối với mã HTTP 403.

### [F090] WebSocket Push & Voice Calls — Phân hệ: Chat & Collaboration
- **Mô tả chức năng:** Kết nối thời gian thực qua WebSocket, gọi thoại/video trực tiếp và đính kèm tệp tin đa phương tiện trong chat.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `5/5` | **Trọng số:** `10`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **20.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `docs/UI_PARITY_CHECKLIST.md:71`
- **Hạng mục còn thiếu / Rào cản:** Hiện tại chat hoạt động qua cơ chế HTTP Polling định kỳ; chưa tích hợp máy chủ WebSocket/WebRTC và upload tệp.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Không hiển thị biểu tượng cuộc gọi thoại giả mạo; tuân thủ nguyên tắc trung thực tính năng.

### [F091] CRM Contacts (PII Encrypted) — Phân hệ: CRM
- **Mô tả chức năng:** Quản lý danh bạ khách hàng và đối tác (CRM Contacts): mã hóa AES-GCM 256-bit thông tin liên lạc nhạy cảm, tìm kiếm, phân trang.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/crm.rs:6614, ui/src/views/crm.rs, tests::crm::tests::crm_http_contract_enforces_admin_encrypts_pii_and_persists_contacts`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng tự động phát hiện và gộp các hồ sơ khách hàng bị trùng lặp số điện thoại.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Dữ liệu PII của khách hàng được mã hóa trong CSDL; giao diện hiển thị danh sách rõ ràng, phân trang 10 dòng.

### [F092] Supplier Evaluations & Scores — Phân hệ: CRM
- **Mô tả chức năng:** Đánh giá nhà cung cấp (Supplier Evaluations): chấm điểm 4 tiêu chí (Chất lượng, Tiến độ, Đơn giá, Dịch vụ), xếp hạng tự động.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **90.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/crm.rs:685, ui/src/views/crm_operations.rs, tests::crm::tests::supplier_evaluations_and_customer_feedback_use_typed_admin_contracts`
- **Hạng mục còn thiếu / Rào cản:** Chưa có lịch sử biến động điểm xếp hạng nhà cung cấp qua các năm.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Tổng điểm và xếp hạng (Tier) được tính toán tự động từ các đầu vào có giới hạn số học xác thực.

### [F093] Customer Feedback & Resolution — Phân hệ: CRM
- **Mô tả chức năng:** Quản lý ý kiến đóng góp và khiếu nại của khách hàng (Customer Feedback): tiếp nhận phản ánh, phân công xử lý, ghi nhận kết quả.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **90.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/crm.rs:689, ui/src/views/crm_operations.rs:400, tests::crm::tests::supplier_evaluations_and_customer_feedback_use_typed_admin_contracts`
- **Hạng mục còn thiếu / Rào cản:** Chưa có cổng tự động gửi khảo sát độ hài lòng (CSAT) qua email sau khi khiếu nại được giải quyết.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Chuyển trạng thái khiếu nại sang đã giải quyết lưu vết người xử lý và nội dung giải quyết cụ thể.

### [F094] CRM Legacy Data Importers — Phân hệ: CRM
- **Mô tả chức năng:** Bộ công cụ di chuyển dữ liệu khách hàng cũ (CRM Legacy Importers): chuyển đổi an toàn danh bạ và đánh giá từ legacy.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/crm.rs:667, tools/export_legacy_crm_contacts.mjs, tests::crm::tests::crm_contact_import_is_admin_only_encrypted_atomic_and_idempotent`
- **Hạng mục còn thiếu / Rào cản:** Yêu cầu khóa mã hóa master key kế thừa hợp lệ để giải mã tệp dữ liệu nguồn.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Nhập liệu bảo toàn nguyên vẹn mã số khách hàng cũ, lưu trữ vết xuất xứ và đánh dấu bản ghi di chuyển minh bạch.

### [F095] Insurance Overview & Labor — Phân hệ: Insurance
- **Mô tả chức năng:** Bảng tổng quan theo dõi Bảo hiểm xã hội: danh sách lao động tham gia bảo hiểm, mức đóng, theo dõi biến động.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **81.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/insurance.rs, tests::views::insurance::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có bảng tính chi tiết tỷ lệ đóng giữa doanh nghiệp và người lao động theo chính sách hiện hành.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Danh sách người tham gia trích xuất trực tiếp từ hồ sơ nhân sự đang hoạt động hợp lệ.

### [F096] Insurance Adjustments D02-LT — Phân hệ: Insurance
- **Mô tả chức năng:** Quản lý tăng giảm điều chỉnh BHXH (Mẫu D02-LT): lập hồ sơ tăng mới, giảm hẳn, điều chỉnh mức đóng, lưu vết kiểm toán.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **86.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:307, ui/src/views/insurance.rs:400, tests::payroll_and_insurance_collections_are_admin_only_and_persistent`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng kết xuất ra tệp hồ sơ điện tử XML tương thích phần mềm kê khai bảo hiểm xã hội.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Hồ sơ điều chỉnh lưu trữ vào SQLite, chặn trùng mã giao dịch, ghi nhật ký kiểm toán nguyên tử.

### [F097] Insurance Regimes & Bank Encrypt — Phân hệ: Insurance
- **Mô tả chức năng:** Quản lý hồ sơ hưởng chế độ BHXH (Ốm đau, Thai sản, Dưỡng sức): mã hóa AES-GCM số tài khoản nhận tiền trợ cấp của người lao động.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **86.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:286, ui/src/views/insurance.rs:600, tests::insurance_benefit_bank_account_requires_an_encryption_key`
- **Hạng mục còn thiếu / Rào cản:** Chưa có quy trình theo dõi tiền bảo hiểm chuyển về tài khoản công ty và chi trả lại cho nhân viên.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Tạo hồ sơ chế độ bắt buộc phải có khóa mã hóa domain bảo hiểm đang mở; thiếu khóa máy chủ từ chối ghi.

### [F098] Insurance Card & Expenses — Phân hệ: Insurance
- **Mô tả chức năng:** Đổi số thẻ và theo dõi chi phí bảo hiểm: quản lý thông tin thẻ BHYT, danh mục cơ sở khám chữa bệnh ban đầu.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **81.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/insurance.rs:800, tests::views::insurance::tests`
- **Hạng mục còn thiếu / Rào cản:** Các nút tra cứu tự động qua cổng thông tin VssID hiện bị vô hiệu hóa kèm giải thích rõ ràng.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Dữ liệu mã thẻ hiển thị trung thực; không bịa kết quả tra cứu bảo hiểm thành công.

### [F099] eBH / VssID Online Submission — Phân hệ: Insurance
- **Mô tả chức năng:** Nộp hồ sơ bảo hiểm trực tuyến tới cổng cơ quan BHXH Việt Nam (Cổng dịch vụ công BHXH điện tử eBH).
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `5/5` | **Trọng số:** `10`
- **Trạng thái thực tế:** `NOT_STARTED` | **Tiến độ hoàn thành:** **17.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `docs/MIGRATION_BLOCKERS.md:BLK-018`
- **Hạng mục còn thiếu / Rào cản:** Chưa có chứng thư số doanh nghiệp và dịch vụ I-VAN được kết nối để nộp hồ sơ qua mạng.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Hồ sơ lưu trữ nội bộ ở trạng thái nháp; không báo nộp bảo hiểm thành công giả mạo.

### [F100] Meeting Rooms Inventory — Phân hệ: Meeting Rooms
- **Mô tả chức năng:** Quản lý danh mục phòng họp doanh nghiệp: tên phòng, sức chứa tối đa, vị trí tầng, danh mục trang thiết bị (máy chiếu, mic).
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **90.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:306, ui/src/views/meeting_rooms.rs, tests::meeting_rooms_and_bookings_persist_and_reject_conflicts`
- **Hạng mục còn thiếu / Rào cản:** Chưa có bảng hiển thị điện tử ngoài cửa phòng họp (Room Display Tablet Mode).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Tạo phòng họp kiểm tra tên phòng không được trùng lặp, sức chứa phải lớn hơn 0.

### [F101] Room Booking & Conflict Prevention — Phân hệ: Meeting Rooms
- **Mô tả chức năng:** Đặt phòng họp và ngăn chặn trùng lịch nguyên tử: chọn ngày giờ, kiểm tra xung đột trong một transaction SQLite duy nhất.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:306, ui/src/views/meeting_rooms.rs:300, tests::meeting_rooms_and_bookings_persist_and_reject_conflicts`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng đặt lịch phòng họp định kỳ lặp lại theo tuần/tháng.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Hai người cùng bấm đặt cùng một phòng trong cùng khung giờ thì một người thành công, một người bị báo trùng lịch.

### [F102] Booking Cancellation & History — Phân hệ: Meeting Rooms
- **Mô tả chức năng:** Hủy đặt phòng và theo dõi lịch sử sử dụng phòng: giải phóng khung giờ họp, ghi nhận người hủy và lý do hủy.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **90.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/main.rs:306, ui/src/views/meeting_rooms.rs:600, tests::meeting_rooms_and_bookings_persist_and_reject_conflicts`
- **Hạng mục còn thiếu / Rào cản:** Chưa có thống kê hiệu suất sử dụng phòng họp (% thời gian phòng được tận dụng).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Hủy lịch họp lập tức mở lại khung giờ trống cho nhân viên khác đăng ký sử dụng.

### [F103] Meet / Teams Live Sync — Phân hệ: Meeting Rooms
- **Mô tả chức năng:** Đồng bộ lịch phòng họp với Google Calendar / Microsoft Teams để tự động tạo đường link họp trực tuyến.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `4/5` | **Trọng số:** `8`
- **Trạng thái thực tế:** `NOT_STARTED` | **Tiến độ hoàn thành:** **17.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/meeting_rooms.rs:750`
- **Hạng mục còn thiếu / Rào cản:** Chưa có cấu hình OAuth Calendar API; giao diện thông báo tính năng chưa kết nối.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Không hiển thị link họp Google Meet giả mạo; tuân thủ nguyên tắc trung thực dữ liệu.

### [F104] Plans Directory & Lifecycle — Phân hệ: Plans & Tasks
- **Mô tả chức năng:** Quản trị danh mục kế hoạch chiến lược và dự án (Plans): mục tiêu kế hoạch, ngân sách dự án, thời gian bắt đầu và kết thúc.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **86.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/plans.rs, ui/src/views/plans.rs, tests::plans::tests::plan_lifecycle_is_persistent_and_admin_scoped`
- **Hạng mục còn thiếu / Rào cản:** Chưa có biểu đồ Gantt tương tác để kéo giãn tiến độ kế hoạch tổng thể.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Kế hoạch lưu trữ vào CSDL với mã số xác định, kiểm tra khoảng ngày bắt đầu và kết thúc.

### [F105] Tasks Assignment & Checklists — Phân hệ: Plans & Tasks
- **Mô tả chức năng:** Quản lý nhiệm vụ (Tasks) và công việc: giao việc cho nhiều nhân sự nguyên tử, danh mục việc cần làm (checklists), bình luận trao đổi.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `5/5` | **Trọng số:** `25`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **91.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/tasks.rs, ui/src/views/tasks.rs, tests::tasks::tests::task_lifecycle_persists_and_enforces_assignment_permissions`
- **Hạng mục còn thiếu / Rào cản:** Chưa có cơ chế ghi nhận thời gian làm việc thực tế trên nhiệm vụ (Task Time Tracking).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Phân công việc hàng loạt tạo đúng 1 bản ghi cho mỗi người được giao; nhân viên chỉ thấy việc trong phạm vi phụ trách.

### [F106] Milestones & OKRs Management — Phân hệ: Plans & Tasks
- **Mô tả chức năng:** Quản lý các mốc quan trọng (Milestones) và mục tiêu OKRs: thiết lập kết quả then chốt (Key Results), trọng số mục tiêu.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **86.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/plan_milestones.rs, server/src/plan_okrs.rs, ui/src/views/plan_milestones.rs, tests::plan_milestones::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có cây phân cấp liên kết mục tiêu OKRs công ty xuống mục tiêu cá nhân (Cascading OKRs).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Tiến độ mốc quan trọng được cập nhật minh bạch, lưu trữ nhất quán theo dự án.

### [F107] Progress Tracking & Reports — Phân hệ: Plans & Tasks
- **Mô tả chức năng:** Theo dõi tiến độ thực hiện và báo cáo công việc định kỳ: ghi nhận nhật ký báo cáo tiến độ, cập nhật % hoàn thành.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **86.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/plan_progress.rs, server/src/plan_reports.rs, ui/src/views/plan_progress.rs, tests::plan_progress::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng nhắc nhở nộp báo cáo tiến độ tuần tự động vào chiều thứ Sáu.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Nhật ký tiến độ ghi nhận người cập nhật, thời gian máy chủ và tỷ lệ % tiến độ mới.

### [F108] Legacy Plan Importers (5 collections) — Phân hệ: Plans & Tasks
- **Mô tả chức năng:** Bộ công cụ nhập dữ liệu kế hoạch cũ (Legacy Plan Importer): nhập an toàn 5 bộ sưu tập kế hoạch từ mã nguồn cũ.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/legacy_plan_import.rs, tools/export_legacy_plan_collections.js, tests::legacy_plan_import::tests`
- **Hạng mục còn thiếu / Rào cản:** Yêu cầu tệp sao lưu dữ liệu json hợp lệ từ môi trường cũ.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Nhập liệu toàn bộ danh mục kế hoạch và nhiệm vụ không gây gián đoạn CSDL hiện tại.

### [F109] Tickets Management & Lifecycle — Phân hệ: Helpdesk & Incidents
- **Mô tả chức năng:** Quản lý yêu cầu hỗ trợ người dùng (Helpdesk Tickets): tiếp nhận ticket, phân loại độ ưu tiên, phân công kỹ thuật viên, chuyển trạng thái.
- **Mức độ ưu tiên:** `P0 (Bắt buộc)` | **Độ phức tạp:** `4/5` | **Trọng số:** `20`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **90.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/helpdesk_tickets.rs, ui/src/views/helpdesk_tickets.rs, tests::helpdesk_tickets::tests::tickets_are_admin_only_persistent_and_event_audited`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng tạo ticket tự động qua email gửi về hòm thư hỗ trợ (Email-to-Ticket).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Quy trình chuyển đổi trạng thái ticket (Mới -> Đang xử lý -> Đã đóng) được lưu vết sự kiện bất biến.

### [F110] Incident Tracking & Resolution — Phân hệ: Helpdesk & Incidents
- **Mô tả chức năng:** Quản lý sự cố kỹ thuật hệ thống (Incidents): phân loại mức độ nghiêm trọng (P0/P1/P2/P3), ghi nhận hành động khắc phục (CAPA).
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `4/5` | **Trọng số:** `12`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **90.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/helpdesk_incidents.rs, ui/src/views/helpdesk_incidents.rs, tests::helpdesk_incidents::tests::incident_lifecycle_is_admin_only_persistent_and_event_audited`
- **Hạng mục còn thiếu / Rào cản:** Chưa có tính năng tự động gửi tin nhắn SMS cảnh báo khẩn cấp cho ban giám đốc khi xảy ra sự cố P0.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Ghi nhận chi tiết thời gian phát sinh, thời gian khắc phục và phân tích nguyên nhân gốc rễ (RCA).

### [F111] Legacy Helpdesk Importers — Phân hệ: Helpdesk & Incidents
- **Mô tả chức năng:** Bộ công cụ nhập dữ liệu ticket và sự cố cũ (Legacy Helpdesk Importers): nhập an toàn lịch sử hỗ trợ kỹ thuật.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/helpdesk_ticket_import.rs, server/src/helpdesk_incident_import.rs, tests::helpdesk_ticket_import::tests`
- **Hạng mục còn thiếu / Rào cản:** Yêu cầu kiểm tra mã băm xác thực tệp trước khi áp dụng vào hệ thống.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Bảo toàn số hiệu ticket cũ, đánh dấu bản ghi lịch sử di chuyển minh bạch.

### [F112] Reports Catalog & Metrics — Phân hệ: Reports & BI
- **Mô tả chức năng:** Danh mục báo cáo phân tích quản trị (Reports Catalog): phân loại báo cáo tài chính, nhân sự, tài sản và đếm lượt tải.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `3/5` | **Trọng số:** `9`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **81.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/reports.rs, tests::views::reports::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có trình thiết kế mẫu báo cáo tùy biến kéo thả (Custom Report Builder).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Danh mục báo cáo phân trang chuẩn mực, ghi nhận trung thực trạng thái khả dụng của từng báo cáo.

### [F113] Legacy Reports Catalog Importer — Phân hệ: Reports & BI
- **Mô tả chức năng:** Bộ công cụ nhập dữ liệu danh mục báo cáo cũ (Legacy Reports Catalog Importer): nhập cấu hình báo cáo từ legacy.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `COMPLETED` | **Tiến độ hoàn thành:** **93.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `server/src/legacy_reports_catalog_import.rs, tools/export_legacy_reports_catalog.js, tests::legacy_reports_catalog_import::tests`
- **Hạng mục còn thiếu / Rào cản:** Yêu cầu quyền quản trị viên cao cấp để kích hoạt lệnh nhập dữ liệu.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Nhập liệu an toàn, chống ghi đè cấu hình báo cáo hiện có.

### [F114] Automated Cross-Module BI Engine — Phân hệ: Reports & BI
- **Mô tả chức năng:** Động cơ kết xuất báo cáo thông minh tự động (Automated Cross-Module BI Engine): xuất tệp phân tích số liệu đồ họa phức tạp.
- **Mức độ ưu tiên:** `P1 (Quan trọng)` | **Độ phức tạp:** `5/5` | **Trọng số:** `15`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **24.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `docs/MIGRATION_MATRIX.md`
- **Hạng mục còn thiếu / Rào cản:** Chưa xây dựng công cụ tổng hợp dữ liệu OLAP và kết xuất tệp đồ họa tự động.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Không hiển thị nút bấm tải báo cáo thành công giả mạo khi chưa có dữ liệu kết xuất.

### [F115] Enterprise Services Catalog — Phân hệ: Services & SLA
- **Mô tả chức năng:** Danh mục dịch vụ nội bộ doanh nghiệp (Enterprise Services): danh sách dịch vụ CNTT, hành chính, báo giá dịch vụ nội bộ.
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `3/5` | **Trọng số:** `6`
- **Trạng thái thực tế:** `MOSTLY_COMPLETED` | **Tiến độ hoàn thành:** **81.5%**
- **Bằng chứng mã nguồn & Kiểm thử:** `ui/src/views/services.rs, tests::views::services::tests`
- **Hạng mục còn thiếu / Rào cản:** Chưa có cổng thanh toán nội bộ giữa các trung tâm chi phí (Cost Centers).
- **Điều kiện nghiệm thu (Acceptance Criteria):** Danh mục dịch vụ hiển thị đầy đủ thông tin, tính toán chính xác tổng chi phí ước tính.

### [F116] Service SLA Tracking & Escalation — Phân hệ: Services & SLA
- **Mô tả chức năng:** Giám sát chất lượng cam kết dịch vụ (SLA Tracking) và quy tắc tự động leo thang sự cố (Incident Escalation).
- **Mức độ ưu tiên:** `P2 (Bổ sung)` | **Độ phức tạp:** `4/5` | **Trọng số:** `8`
- **Trạng thái thực tế:** `PARTIAL` | **Tiến độ hoàn thành:** **25.0%**
- **Bằng chứng mã nguồn & Kiểm thử:** `docs/MIGRATION_MATRIX.md`
- **Hạng mục còn thiếu / Rào cản:** Chưa xây dựng tiến trình quét ngầm định kỳ để kích hoạt quy tắc leo thang tự động khi quá hạn SLA.
- **Điều kiện nghiệm thu (Acceptance Criteria):** Hiển thị trung thực trạng thái giám sát dịch vụ, không bịa thông số cam kết SLA 100%.
