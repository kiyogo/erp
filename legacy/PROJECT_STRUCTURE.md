# CẤU TRÚC DỰ ÁN (PROJECT_STRUCTURE.MD)

Tài liệu này mô tả chi tiết cây thư mục, vai trò của từng thư mục và các tệp tin cốt lõi trong nền tảng **KIYOVN Enterprise**.

---

## I. CÂU TRÚC THƯ MỤC TỔNG THỂ

```
appdnt/
├── data/                       # Thư mục lưu trữ CSDL SQLite & tệp tin tải lên (local)
│   ├── kiyovn.sqlite          # Cơ sở dữ liệu SQLite cục bộ
│   └── files/                 # Kho lưu trữ tệp tin vật lý
├── docs/                       # Tài liệu kỹ thuật chi tiết về kiến trúc Canvas Engine
│   ├── canvas-document-engine.md
│   └── document-editor-architecture.md
├── scripts/                    # Các kịch bản migrate dữ liệu SQLite sang PostgreSQL
│   └── migrate-sqlite-to-pg.mjs
├── server/                     # Backend Node.js
│   ├── db.mjs                 # Dual-Database Engine (PostgreSQL + SQLite)
│   ├── index.mjs              # Kernel HTTP Server, Dispatcher, Business APIs
│   └── Dockerfile             # Dockerfile cho backend
├── src/                        # Frontend React Application
│   ├── api/                   # API clients & Types endpoints
│   │   ├── axios.ts           # Cấu hình Axios instance & Interceptors
│   │   └── endpoints.ts       # Định nghĩa toàn bộ API client & Payload types
│   ├── assets/                # Hình ảnh tĩnh, chữ ký số, logo
│   ├── components/            # Layout, Navigation, Modals, Bảng biểu dùng chung
│   │   ├── generic/           # GenericModulePage layout
│   │   ├── navigation/        # MobileBottomNav, Breadcrumbs
│   │   ├── notification/      # NotificationDropdown
│   │   ├── sidebar/           # SidebarAccordion, SidebarFlyout, WorkspaceTabBar
│   │   └── FileUploadDialog.tsx
│   ├── context/               # React Contexts (AuthContext)
│   ├── custom-ui/             # Hệ sinh thái Component UI Fluent tùy biến (~5.800 dòng)
│   │   ├── DatePicker.tsx     # Custom Calendar & Date picker
│   │   ├── index.tsx          # Toàn bộ Button, Modal, Table, Select, Input, Tag...
│   │   └── theme.css          # Stylesheets, biến màu, Fluent animations
│   ├── data/                  # Cấu trúc menu điều hướng hệ thống
│   │   └── menuData.tsx       # Định nghĩa KIYOVN_MENU_ITEMS, EMPLOYEE_PORTAL_MENU_ITEMS
│   ├── features/              # Feature modules phức tạp
│   │   └── documents/         # Trình soạn thảo Canvas Document Editor độc quyền
│   │       └── editor/        # Core engine: Layout, Rendering, Input, IME, History
│   ├── hooks/                 # Custom React Hooks
│   ├── modules/               # 20+ Phân hệ quản trị nghiệp vụ
│   │   ├── admin/             # Quản trị hệ thống, tài khoản, audit logs
│   │   ├── assets/            # Quản lý tài sản, trang thiết bị, cấp phát
│   │   ├── attendance/        # Chấm công GPS, Face ID, đơn xin nghỉ phép
│   │   ├── business/          # Đơn vị tổ chức, sơ đồ doanh nghiệp, hợp đồng
│   │   ├── chat/              # Chat nội bộ theo kênh và tin nhắn cá nhân
│   │   ├── crm/               # Khách hàng, đối tác, nhà cung cấp, công nợ
│   │   ├── documents/         # Quản lý tài liệu và phân quyền tài liệu
│   │   ├── ekyc/              # Liveness check, OCR CCCD, quét QR, so khớp khuôn mặt
│   │   ├── employee/          # Cổng nhân viên, Onboarding Wizard, Profile, Phiếu lương
│   │   ├── files/             # Quản lý tệp tin Google Drive-like
│   │   ├── finance/           # Thu chi, sổ quỹ, tài khoản ngân hàng, ngân sách
│   │   ├── hr/                # Quản lý nhân sự, khen thưởng, kỷ luật, đồng phục, KPI
│   │   ├── insurance/         # Bảo hiểm xã hội, y tế, chế độ thai sản, ốm đau
│   │   ├── meetingRooms/      # Đặt lịch phòng họp, lịch tuần công tác
│   │   ├── plans/             # Kế hoạch công việc, OKRs/KPIs
│   │   ├── reports/           # Báo cáo tổng hợp và thống kê doanh nghiệp
│   │   ├── services/          # Danh mục dịch vụ nội bộ
│   │   ├── settings/          # Cài đặt giao diện, xác thực 2 bước (2FA), bảo mật
│   │   ├── tickets/           # Hệ thống phiếu hỗ trợ IT/Hành chính
│   │   └── workflows/         # Quy trình trình ký và phê duyệt đa cấp
│   ├── pages/                 # Các trang ứng dụng cấp Route
│   │   ├── ActivateAccount.tsx # Kích hoạt tài khoản qua link email
│   │   ├── DocumentEditorPage.tsx # Giao diện soạn thảo Canvas Document Editor
│   │   ├── Files.tsx          # Trang Google Drive File Explorer
│   │   ├── Login.tsx          # Trang đăng nhập tài khoản
│   │   ├── NotFoundPage.tsx   # Trang 404
│   │   └── dashboard/         # Trang Bảng điều khiển (DashboardPage.tsx)
│   ├── services/              # Các Business Data Services
│   │   ├── addressService.ts  # Dữ liệu Tỉnh/Thành, Quận/Huyện, Phường/Xã Việt Nam
│   │   └── dataService.ts     # Single Source of Truth Service kết nối Backend
│   ├── types/                 # Kiểu dữ liệu TypeScript dùng chung
│   ├── utils/                 # Utility functions (file exporter, date format, route helper)
│   ├── App.tsx                # Ứng dụng chính & Định tuyến Router
│   ├── index.css              # Global styles & Tailwind directives
│   └── main.tsx               # Điểm khởi chạy React DOM
├── AI_PROJECT_RULES.md         # 17 nguyên tắc bắt buộc khi làm việc với dự án
├── ARCHITECTURE.md            # Kiến trúc kỹ thuật và luồng dữ liệu
├── CURRENT_STATE.md           # Bộ nhớ sống và trạng thái hiện tại của dự án
├── DATABASE_SCHEMA.md         # Đặc tả toàn bộ bảng dữ liệu trong CSDL
├── API_CONTRACT.md            # Đặc tả toàn bộ API endpoints của backend
├── CHANGELOG_AI.md            # Nhật ký thay đổi sau mỗi task
├── docker-compose.yml         # File Docker Compose triển khai
├── Dockerfile                 # Multi-stage Dockerfile
├── nginx.conf                 # Cấu hình Nginx reverse proxy
├── package.json               # Dependencies & Scripts
├── tsconfig.json              # Cấu hình TypeScript compiler
└── vite.config.ts             # Cấu hình Vite build tool
```
