# TRẠNG THÁI HIỆN TẠI CỦA DỰ ÁN (CURRENT_STATE.MD)

> Cập nhật 2026-10-26: các tuyên bố “100%”, “Hoàn thiện”, “0 Mock” bên dưới là ghi nhận cũ và chưa được nghiệm thu. Đợt sửa hiện tại đạt build/typecheck, 61 kiểm thử tự động, tám luồng PostgreSQL thật và lượt mở 246 route production không lỗi JS/trắng trang. Đã sửa dữ liệu và quyền của tuyển dụng/onboarding/lịch sử nhân sự, nghỉ phép/OT/phân ca/chấm công, chuyển quỹ, phiên đăng nhập/Google, Form và hợp đồng. Toàn bộ yêu cầu video/txt vẫn chưa hoàn thành. Xem `IMPLEMENTATION_PROGRESS.md` và bằng chứng trong `outputs/legacy-progress-2026-10-26/` ở thư mục gốc.

Tài liệu này đóng vai trò là **Bộ nhớ sống (Living Memory)** của dự án. Mọi AI Agent hoặc lập trình viên khi tiếp nhận dự án đều phải đọc tài liệu này để nắm bắt chính xác hiện trạng hệ thống.

---

## I. TỔNG QUAN TÌNH TRẠNG HIỆN TẠI

* **Tình trạng Build & Compile**: `100% Sạch` (Clean Build).
  * `npx tsc --noEmit` ➡️ **0 Errors (Mã thoát 0)**.
  * `npm run build` ➡️ **Build Production thành công (Vite 8, 5098 modules transformed)**.
* **Toàn vẹn Dữ liệu (Data Integrity)**: `100% Real Data / 0 Mock / 0 Fake`.
  * Toàn bộ 56 module con được đồng bộ lưu trữ trực tiếp với Backend & CSDL kép SQLite/PostgreSQL qua `dataService` và `collectionsApi`.
  * Không còn mảng mock objects `INITIAL_*` trong UI state; hiển thị Empty State chuẩn khi CSDL rỗng.
  * 100% mã hệ thống sinh tự động tuần tự/timestamp (0 Math.random cho mã NV/tài sản/hợp đồng/vé).
* **Cơ sở dữ liệu**: Đã sẵn sàng chạy kép trên cả **PostgreSQL** và **SQLite** cục bộ (`data/kiyovn.sqlite`).
* **Backend**: Node.js Native HTTP Server hoạt động trên cổng `3001` (hoặc `PORT` cấu hình).

---

## II. DANH SÁCH MODULE & TRẠNG THÁI HOẠT ĐỘNG

| Phân hệ / Module | Vị trí thư mục | Trạng thái | Nguồn dữ liệu & Cơ chế |
| :--- | :--- | :---: | :--- |
| **Canvas Document Editor** | `src/features/documents/editor/` | `Hoàn thiện cao` | Dual-layer Canvas 2D, snapshot/operations DB tables, IME Telex/VNI, Undo/Redo. |
| **Google Drive File Storage** | `src/pages/Files.tsx` & `src/modules/files/` | `Hoàn thiện cao` | `file_nodes` table, Soft-delete, breadcrumbs, doc/pdf/xlsx preview, Selecto drag. |
| **eKYC & Liveness Verification** | `src/modules/ekyc/` | `Hoàn thiện` | BlazeFace camera detection, Tesseract OCR, QR scanner, token sync qua QR. |
| **Employee Portal (Self-Service)** | `src/modules/employee/` | `Hoàn thiện` | Onboarding Wizard 5 bước, Profile, E-sign phiếu lương, quản lý hồ sơ. |
| **HR Management** | `src/modules/hr/` | `Hoàn thiện` | Nhân viên, khen thưởng, kỷ luật, đồng phục, chứng chỉ, KPI review, Onboarding. |
| **Finance & Cash Management** | `src/modules/finance/` | `Hoàn thiện` | Thu chi tiền mặt/ngân hàng, tài khoản công ty, hóa đơn, công nợ, sổ cái. |
| **Business & Org Chart** | `src/modules/business/` | `Hoàn thiện` | Đơn vị tổ chức (`business_org_units`), sơ đồ tổ chức cây, hợp đồng thương mại. |
| **CRM & Contacts** | `src/modules/crm/` | `Hoàn thiện` | Khách hàng, đối tác, nhà cung cấp, hạn mức tín dụng và công nợ. |
| **Meeting Rooms & Calendar** | `src/modules/meetingRooms/` | `Hoàn thiện` | Đặt lịch phòng họp, thiết bị phòng họp, lịch tuần công tác. |
| **Internal Chat & Workflows** | `src/modules/chat/` & `src/modules/workflows/` | `Hoàn thiện` | Kênh chat nội bộ, MockChatSocket, quy trình trình ký & phê duyệt đa cấp. |
| **Helpdesk & Tickets** | `src/modules/tickets/` | `Hoàn thiện` | Tiếp nhận và xử lý sự cố IT/Hành chính, SLA theo dõi. |
| **Insurance (Bảo hiểm)** | `src/modules/insurance/` | `Hoàn thiện` | BHXH, BHYT, BHTN (tỷ lệ 32%), điều chỉnh D02-TS, chế độ thai sản/ốm đau, đối soát C12. |
| **Plans & Strategic OKRs** | `src/modules/plans/` | `Hoàn thiện` | Kế hoạch chiến lược, OKRs/KPIs, lộ trình Roadmap, tiến độ công việc. |
| **Reports & BI Dashboard** | `src/modules/reports/` & `src/pages/dashboard/` | `Hoàn thiện` | Báo cáo tài chính, nhân sự, tài sản, kết xuất PDF/Excel, thống kê KPI. |
| **Enterprise Services Catalog** | `src/modules/services/` | `Hoàn thiện` | Danh mục gói dịch vụ Cloud, AI, An ninh mạng, cam kết SLA. |
| **Admin System & Settings** | `src/modules/admin/` & `src/modules/settings/` | `Hoàn thiện` | Cấu hình SMTP mã hóa AES-256, Audit Logs, Theme sáng/tối, 2FA OTP, quản trị người dùng. |

---

## III. BẢN ĐỒ SERVICE VÀ DATA ACCESS

* **`src/services/dataService.ts`**: Single Source of Truth cho dữ liệu doanh nghiệp (Nhân viên, Hợp đồng, Thu chi, Phòng họp, Tickets, Kế hoạch, Dropdown options).
* **`src/services/addressService.ts`**: Dữ liệu chuẩn phân cấp Tỉnh/Thành phố, Quận/Huyện, Phường/Xã Việt Nam.
* **`src/modules/ekyc/services/`**:
  * `cameraService.ts`: Quản lý luồng video camera và tính toán độ nét/độ sáng.
  * `cardValidationService.ts`: Xử lý OCR Tesseract + QR decoding + MRZ reader.
  * `faceDetectionService.ts`: Phát hiện khuôn mặt và tự động crop avatar từ thẻ CCCD.
  * `ekycService.ts`: So khớp sinh trắc học và kiểm tra Liveness.
* **`src/utils/fileStorage.ts` & `fileExporter.ts`**: Quản lý Blob, mã băm SHA-256, định dạng dung lượng và xuất file PDF/Excel.

---

## IV. QUYẾT ĐỊNH KIẾN TRÚC & NHỮNG ĐIỀU TUYỆT ĐỐI KHÔNG ĐƯỢC THAY ĐỔI

1. **Không thay thế Canvas Engine bằng contenteditable**:
   - Trình soạn thảo văn bản bắt buộc phải giữ kiến trúc Dual-Layer Canvas (`doc-base-canvas` + `doc-interaction-canvas`) để bảo đảm ngắt trang toán học chuẩn in ấn.
2. **Không loại bỏ cơ chế Dual-Database**:
   - `server/db.mjs` phải luôn hỗ trợ cả PostgreSQL và SQLite fallback để phục vụ phát triển cục bộ và triển khai Docker.
3. **Không phá vỡ giao diện Fluent UI**:
   - Giữ nguyên hệ thống animation Origin-based scale trong `src/custom-ui/`.
4. **Không xóa các scope trong `collectionsApi`**:
   - Các phân hệ HR, Admin và Business phụ thuộc trực tiếp vào bảng `collection_records` thông qua `collectionsApi`.

---

## V. CÁC ĐẦU VIỆC CÓ THỂ NÂNG CẤP TRONG TƯƠNG LAI (BACKLOG)

1. Tách nhỏ file `server/index.mjs` (~4.460 dòng) thành các controller/router module hóa khi có yêu cầu tái cấu trúc.
2. Phân rã `src/custom-ui/index.tsx` (~5.840 dòng) thành các tệp component riêng biệt.
3. Bổ sung bộ kiểm thử tự động E2E (Playwright) cho các luồng nghiệp vụ phê duyệt hợp đồng.
