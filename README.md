<div align="center">

# 🏢 KIYO PLATFORM
### Nền tảng Quản trị Doanh nghiệp Toàn diện (Self-Hosted All-in-One Enterprise Suite)

[![Rust](https://img.shields.io/badge/Backend-Rust%20Axum-orange?logo=rust)](https://www.rust-lang.org/)
[![Rust UI](https://img.shields.io/badge/UI-Rust%20%2B%20egui-orange?logo=rust)](https://www.rust-lang.org/)
[![WebAssembly](https://img.shields.io/badge/Web-WebAssembly-purple)](https://webassembly.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20macOS%20%7C%20Docker-brightgreen)](#)

*Giải pháp phần mềm quản trị doanh nghiệp độc lập 100% (tương tự mô hình aaPanel / On-Premise) — Triển khai trực tiếp lên máy chủ riêng, tự trỏ tên miền, toàn quyền kiểm soát dữ liệu và vận hành không phụ thuộc bên thứ 3.*

</div>

---

## 🌟 ĐẶC ĐIỂM NỔI BẬT

- 🔒 **Tự trị & Bảo mật dữ liệu 100%**: Cơ sở dữ liệu SQLite/PostgreSQL và hệ thống tệp tin lưu trữ hoàn toàn trên máy chủ của bạn. Không gửi bất kỳ dữ liệu định danh hay token nào ra ngoài.
- ⚡ **Backend Rust Hiệu năng cao**: Xây dựng trên nền tảng **Rust + Axum + Tokio**, khởi động tức thì, tiêu thụ cực ít RAM/CPU và miễn nhiễm với lỗi rò rỉ bộ nhớ.
- 🎨 **Một giao diện Rust dùng chung**: `kiyo-ui` viết bằng **Rust + egui**, build được thành ứng dụng native Windows, Linux, macOS và WebAssembly, không nhân đôi màn hình giữa các nền tảng.
- 📄 **Canvas Document Editor độc quyền**: Bộ soạn thảo văn bản WYSIWYG chạy 100% trên **HTML5 Canvas 2D Dual-Layer**, hỗ trợ phân trang toán học (Deterministic Multi-page), gõ tiếng Việt Telex/VNI, bảng biểu và lịch sử giao dịch Atomic Undo/Redo.
- 👤 **Sinh trắc học & eKYC số**: Quét và bóc tách thông tin thẻ CCCD (OCR `tesseract.js` + quét QR `jsqr`), đối chiếu khuôn mặt & kiểm tra người thật (Face Liveness bằng `TensorFlow.js` / `BlazeFace`).
- 🚀 **Phục vụ trọn gói All-in-One**: Một binary Rust duy nhất vừa xử lý API vừa phục vụ trực tiếp giao diện WebAssembly, không bắt buộc cài đặt Node.js/Nginx cho môi trường chạy nhanh.

---

## 📦 CÁC PHÂN HỆ NGHIỆP VỤ CHÍNH

| Phân hệ | Chức năng chính |
| :--- | :--- |
| **Cổng Nhân viên (Employee Portal)** | Tự phục vụ (Self-service), hoàn tất Onboarding số, xác thực eKYC sinh trắc học, ký hợp đồng điện tử, xem phiếu lương và bảng chấm công. |
| **Quản trị Nhân sự (HRM)** | Hồ sơ nhân sự đa cấp, theo dõi hợp đồng, quản lý cấp phát đồng phục, bảo hiểm, đào tạo và đánh giá hiệu suất (KPIs). |
| **Tài chính & Kế toán (Finance)** | Thu - chi, dòng tiền, hạn mức ngân sách, công nợ, tài sản cố định, hóa đơn điện tử và sổ cái tổng hợp. |
| **Quản lý Tài liệu & Cloud Drive** | Lưu trữ tệp tin phân cấp như Google Drive, chia sẻ bảo mật, phân quyền thư mục và thùng rác xóa mềm. |
| **Quy trình & Phê duyệt (Workflows)** | Tạo phiếu yêu cầu, phê duyệt đa cấp, lịch sử giao dịch và thông báo thời gian thực. |
| **Hành chính & Kế hoạch** | Đặt phòng họp trực quan, kế hoạch chiến lược (Milestones / Tasks), SLA và hệ thống quản lý sự cố (Tickets). |

---

## 📁 CẤU TRÚC THƯ MỤC DỰ ÁN

```text
kiyodn/
├── backend/                  # Rust API + Auth + SQLite + File Storage
│   ├── Cargo.toml            # Cấu hình Crate 'kiyo-server'
│   ├── src/main.rs           # Core Entrypoint (Axum router, SQLite DB, JWT Auth, Static File Server)
│   └── deploy/               # Bộ công cụ triển khai On-Premise 1 chạm
│       ├── install.sh        # Script cài đặt tự động cho Linux (Systemd Service)
│       ├── install.ps1       # Script cài đặt tự động cho Windows Server
│       ├── kiyo.service      # Cấu hình dịch vụ Systemd
│       ├── nginx.conf        # Mẫu Reverse Proxy có SSL Let's Encrypt
│       ├── Dockerfile        # Docker multi-stage build tối ưu kích thước
│       └── docker-compose.yml
│
├── crates/kiyo-ui/           # UI, models, state và API client dùng chung
│   ├── src/views/             # Các màn hình egui dùng cho mọi nền tảng
│   └── Cargo.toml
│
├── desktop/                  # Launcher native Windows/Linux/macOS mỏng
│   ├── src/main.rs            # Chỉ khởi chạy kiyo-ui native
│   └── Cargo.toml
│
├── web/                      # Launcher WebAssembly mỏng
│   ├── src/main.rs            # Chỉ khởi chạy kiyo-ui trên browser
│   ├── index.html
│   └── Trunk.toml
│
├── docs/                     # Tài liệu kiến trúc và quy trình migration
└── legacy/                   # Kho mã cũ chỉ dùng để tham chiếu, không build
```

---

## 🛠️ HƯỚNG DẪN DÀNH CHO LẬP TRÌNH VIÊN (DEVELOPMENT)

### Yêu cầu môi trường:
- **Rust**: phiên bản được khóa trong `rust-toolchain.toml` (1.89.0)
- **wasm32 target**: tự động theo `rust-toolchain.toml`
- **Trunk**: `cargo install trunk`

### 1. Khởi chạy Backend (Rust Server):
```bash
cargo run -p kiyo-server
```
> Server sẽ tự động khởi tạo database tại `data/kiyo.sqlite` và tạo tài khoản Admin mặc định (`admin@kiyo.local`). Mặc định lắng nghe tại: `http://localhost:3001`.

### 2. Khởi chạy Desktop native:
```bash
cargo run -p kiyo-admin-desktop
```

### 3. Khởi chạy WebAssembly:
```bash
cd web
trunk serve
```
> WebAssembly dùng cùng `crates/kiyo-ui` với desktop và gọi backend qua `/api/v1`.

---

## 🚀 HƯỚNG DẪN TRIỂN KHAI CHO KHÁCH HÀNG (PRODUCTION / ON-PREMISE)

### Cách 1: Cài đặt tự động trên Linux (Ubuntu / Debian / CentOS / Rocky)
1. Build mã nguồn trước hoặc tải gói Release:
   ```bash
# Build WebAssembly UI
cd web
trunk build --release
# Quay lại root rồi build backend
cd ..
# Build Backend
cargo build -p kiyo-server --release
   ```
2. Copy binary `kiyo-server`, thư mục `dist` và `backend/deploy` lên máy chủ.
3. Chạy script cài đặt 1 chạm:
   ```bash
   sudo bash deploy/install.sh
   ```
4. Kiểm tra trạng thái dịch vụ:
   ```bash
   systemctl status kiyo
   journalctl -u kiyo -f
   ```

---

### Cách 2: Cài đặt trên Windows Server
Mở PowerShell dưới quyền Administrator và thực thi:
```powershell
powershell -ExecutionPolicy Bypass -File backend\deploy\install.ps1
```

---

### Cách 3: Triển khai bằng Docker Compose
```bash
docker compose -f backend/deploy/docker-compose.yml up -d --build
```

---

## 🌐 CẤU HÌNH TÊN MIỀN RIÊNG & SSL (DOMAIN & HTTPS)

1. **Trỏ DNS**: Tạo bản ghi `A Record` tên miền của bạn (ví dụ: `erp.yourcompany.com`) trỏ về IP của máy chủ.
2. **Cấu hình Nginx**: Sử dụng file mẫu tại `backend/deploy/nginx.conf`:
   ```bash
   sudo cp backend/deploy/nginx.conf /etc/nginx/sites-available/kiyo.conf
   sudo ln -s /etc/nginx/sites-available/kiyo.conf /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl reload nginx
   ```
3. **Cấp chứng chỉ SSL miễn phí (Let's Encrypt)**:
   ```bash
   sudo certbot --nginx -d erp.yourcompany.com
   ```

---

## ⚙️ BẢNG THAM SỐ BIẾN MÔI TRƯỜNG (.env)

| Biến môi trường | Mặc định | Mô tả |
| :--- | :--- | :--- |
| `KIYO_API_HOST` | `0.0.0.0` | Địa chỉ IP máy chủ lắng nghe kết nối |
| `KIYO_API_PORT` | `3001` | Cổng dịch vụ Web & API |
| `KIYO_API_DB_PATH` | `data/kiyo.sqlite` | Vị trí lưu trữ cơ sở dữ liệu SQLite |
| `KIYO_API_STORAGE_PATH`| `data/files` | Thư mục lưu trữ tệp tin upload / Cloud Drive |
| `KIYO_STATIC_DIR` | `dist` | Thư mục chứa bundle WebAssembly/static web |
| `KIYO_JWT_SECRET` | *(Random trên Prod)* | Khóa bí mật mã hóa JWT Token (tối thiểu 32 ký tự) |
| `KIYO_BOOTSTRAP_ADMIN_EMAIL` | `admin@kiyo.local` | Email của tài khoản Super Admin ban đầu |
| `KIYO_BOOTSTRAP_ADMIN_PASSWORD` | *(Auto-generated)* | Mật khẩu tài khoản Super Admin ban đầu |

---

## 📄 GIẤY PHÉP (LICENSE)
Dự án được phát hành dưới giấy phép mã nguồn mở [Apache-2.0 License](LICENSE).
