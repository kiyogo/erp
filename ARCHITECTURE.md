# KIẾN TRÚC HỆ THỐNG KIYO PLATFORM (ARCHITECTURE.MD)

Tài liệu này định nghĩa cấu trúc kỹ thuật tổng thể của nền tảng **Kiyo Platform** theo mô hình **Self-Hosted / On-Premise độc lập** (phong cách aaPanel: triển khai trực tiếp lên server của khách hàng, độc lập 100%, tự trỏ domain và quản trị trọn gói).

---

## I. CẤU TRÚC THƯ MỤC DỰ ÁN

| Thư mục | Vai trò / Nhiệm vụ | Công nghệ sử dụng |
| :--- | :--- | :--- |
| **`backend/`** | Server Backend duy nhất (API + Xác thực + Quản lý File + Phục vụ Web SPA) | **Rust** (`axum`, `tokio`, `rusqlite`, `argon2`, `jsonwebtoken`, `tower-http`) |
| **`frontend/`** | Giao diện Web Client (Admin Dashboard & Employee Portal) | **React 18**, **TypeScript**, **Vite 8**, **Tailwind CSS**, **Zustand** |
| **`desktop/`** | Ứng dụng Desktop chạy trực tiếp trên Windows | **Tauri (Rust)** + React |
| **`legacy/`** | Bản sao lưu trữ mã nguồn cũ để đối chiếu | Legacy React + Node API |

---

## II. KIẾN TRÚC TỰ TRỊ 100% (SELF-HOSTED / AUTONOMOUS)

1. **Khách hàng sở hữu trọn vẹn dữ liệu**:
   - Dữ liệu cơ sở dữ liệu SQLite (`kiyo.sqlite`) và tệp tin (`data/files/`) được lưu trữ 100% cục bộ trên ổ cứng máy chủ của khách.
   - Không phụ thuộc vào bất kỳ máy chủ xác thực bên thứ 3 nào.
2. **Khởi tạo Quản trị viên ban đầu (Bootstrap Admin)**:
   - Server tự động khởi tạo tài khoản quản trị tối cao ban đầu (`admin@kiyo.local`) qua biến môi trường `KIYO_BOOTSTRAP_ADMIN_EMAIL` và `KIYO_BOOTSTRAP_ADMIN_PASSWORD`.
3. **Phục vụ giao diện Web trực tiếp (All-In-One Binary)**:
   - Backend Rust có tích hợp sẵn `ServeDir` & `ServeFile` từ `tower-http` để phục vụ thư mục `dist/` của React.
   - Khi chạy `kiyo-server`, server tự động xử lý cả các endpoint `/api/v1/*` lẫn phục vụ Single Page Application (SPA) cho người dùng cuối.

---

## III. QUY TRÌNH TRIỂN KHAI CHO KHÁCH HÀNG (DEPLOYMENT)

### 1. Triển khai Linux (Ubuntu / Debian / CentOS / Rocky Linux)
Chạy script cài đặt 1 chạm:
```bash
sudo bash backend/deploy/install.sh
```
- Tự động tạo thư mục `/opt/kiyo`.
- Tự sinh mã khóa bảo mật JWT ngẫu nhiên.
- Tạo và kích hoạt dịch vụ `systemd` (`kiyo.service`) tự khởi động cùng hệ điều hành.

### 2. Triển khai Windows Server
Chạy script PowerShell Administrator:
```powershell
powershell -ExecutionPolicy Bypass -File backend\deploy\install.ps1
```

### 3. Cấu hình Tên miền riêng & Chứng chỉ SSL (Domain & HTTPS)
- Khách hàng trỏ bản ghi DNS (`A Record`) về IP của Server.
- Cấu hình file Nginx Reverse Proxy theo mẫu tại `backend/deploy/nginx.conf` và cấp chứng chỉ Let's Encrypt Certbot:
```bash
sudo certbot --nginx -d your-domain.com
```

---

## IV. CÁC CỔNG MẠNG & BIẾN MÔI TRƯỜNG CỐT LÕI

| Biến môi trường | Mặc định | Ý nghĩa |
| :--- | :--- | :--- |
| `KIYO_API_HOST` | `0.0.0.0` | Địa chỉ IP lắng nghe kết nối |
| `KIYO_API_PORT` | `3001` | Cổng dịch vụ Web & API |
| `KIYO_API_DB_PATH` | `data/kiyo.sqlite` | Đường dẫn tệp CSDL SQLite |
| `KIYO_API_STORAGE_PATH`| `data/files` | Thư mục lưu trữ tệp tin upload |
| `KIYO_STATIC_DIR` | `dist` | Thư mục chứa mã build Frontend React |
| `KIYO_JWT_SECRET` | *(Bắt buộc trên Production)* | Chuỗi khóa bí mật mã hóa JWT Token |
