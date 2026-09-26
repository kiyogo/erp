# KIẾN TRÚC HỆ THỐNG KIYOVN ENTERPRISE (ARCHITECTURE.MD)

Tài liệu này định nghĩa cấu trúc kỹ thuật tổng thể, phân luồng dữ liệu và kiến trúc công nghệ cốt lõi của nền tảng **KIYOVN Enterprise**.

---

## I. TỔNG QUAN HỆ THỐNG
KIYOVN Enterprise là hệ sinh thái quản trị doanh nghiệp All-in-One bao gồm 2 cổng người dùng chính:
1. **Employee Portal (Cổng thông tin nhân viên)**: Tự phục vụ (Self-service), hoàn tất Onboarding số, eKYC sinh trắc học (CCCD + Face Match), quản lý hồ sơ nhân sự, hợp đồng lao động, phiếu lương điện tử và điểm danh.
2. **Admin Portal (Cổng quản trị doanh nghiệp)**: Quản trị hơn 20 phân hệ (HR, Finance, Assets, Business Contracts, CRM, Attendance, Meeting Rooms, Workflows, Tickets, Insurance, Plans, Reports).
3. **Core Engines độc quyền**:
   - **Canvas Document Editor**: Engine soạn thảo văn bản WYSIWYG trên HTML5 Canvas 2D theo kiến trúc Dual-Layer, phân trang toán học (Deterministic Multi-page pagination), bộ gõ Tiếng Việt Telex/VNI (`CompositionManager`), hỗ trợ bảng biểu và lịch sử giao dịch (Atomic Undo/Redo).
   - **Cloud File Storage**: Trình duyệt tệp tin phong cách Google Drive với thư mục phân cấp, phân loại tệp hệ thống/bảo vệ, thùng rác xóa mềm (Trash & Soft-delete).

---

## II. NGĂN XẾP CÔNG NGHỆ (TECH STACK)

### 1. Frontend Layer
- **Core Framework**: React 18, TypeScript 5, Vite 8, React Router v7.
- **Styling & UI Components**: Tailwind CSS, `@ant-design/icons`, `lucide-react`, Custom UI Engine (`src/custom-ui/index.tsx` & `src/custom-ui/theme.css`) với hiệu ứng scale mở từ điểm click (Origin-based Animations).
- **Client-Side AI & Computer Vision**:
  - `@tensorflow/tfjs`, `@tensorflow-models/blazeface` cho Face Tracking & Liveness Check.
  - `tesseract.js` cho OCR bóc tách thông tin thẻ CCCD tiếng Việt.
  - `jsqr` để quét mã QR thẻ CCCD gắn chip.
- **Document Rendering Engine**: Thuần TypeScript + HTML5 Canvas 2D (`src/features/documents/editor/`).
- **State Management**: Zustand, React Context (`AuthContext`), custom hooks (`useAppearanceSettings`, `useCamera`, `useFaceDetection`).

### 2. Backend Layer
- **Kernel Engine**: Node.js Native HTTP Server (`server/index.mjs`), kiến trúc phi tập trung, zero-heavy-framework, kiểm soát I/O và stream trực tiếp.
- **Bảo mật & Mã hóa**:
  - Băm mật khẩu bằng hàm chuẩn `scrypt` với muối ngẫu nhiên (Salt).
  - Tự sinh và xác thực JSON Web Token (JWT) qua chữ ký HMAC-SHA256.
  - Chống tấn công dò mật khẩu (Brute-force Protection) qua bộ đếm In-Memory `loginAttempts` (giới hạn 8 lần/15 phút).
  - Mã hóa cấu hình nhạy cảm (như mật khẩu SMTP) bằng AES-256-CBC đối xứng.
  - Kiểm soát đường dẫn tệp chống Directory/Path Traversal.

### 3. Database Layer (Dual-Database Architecture)
- Triển khai tại `server/db.mjs`:
  - **Tự động thích ứng (Auto-fallback)**: Ưu tiên kết nối PostgreSQL Connection Pool nếu có biến môi trường `DATABASE_URL` hoặc cấu hình `PGHOST`. Nếu không có PostgreSQL, tự động chuyển về SQLite cục bộ (`node:sqlite DatabaseSync`) tại thư mục `data/kiyovn.sqlite`.
  - **Chuyển đổi cú pháp SQL (`convertSql`)**: Tự động ánh xạ tham số `?` thành `$1, $2...` và bóc tách các hàm JSON (`json_extract`) sang PostgreSQL (`->>`).
  - **Quản lý Transaction an toàn**: Sử dụng `AsyncLocalStorage` để bảo đảm các thao tác trong cùng một transaction được gán đúng Connection client từ Pool.

---

## III. PHÂN LUỒNG DỮ LIỆU ĐIỂN HÌNH (END-TO-END DATA FLOW)

```
[Người dùng thao tác UI]
       │
       ▼
[React Component / Custom UI Modal]
       │
       ▼
[Service Layer (dataService / addressService / EkycService)]
       │
       ▼
[API Client (src/api/endpoints.ts -> Axios Client src/api/axios.ts)]
       │ (Gửi Bearer Token JWT qua Header)
       ▼
[Node.js HTTP Dispatcher (server/index.mjs handleRequest)]
       │
       ├── Middleware Xác thực: requireUser / requireAdmin / requireActivationSession
       ├── Rate Limiting & Input Validation
       │
       ▼
[Database Operations (server/db.mjs)]
       │ (AsyncLocalStorage Transaction Isolation)
       ▼
[PostgreSQL / SQLite Database Tables]
```
