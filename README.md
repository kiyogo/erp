<div align="center">

# 🏢 KIYO PLATFORM
### Nền tảng Quản trị Doanh nghiệp Toàn diện (Self-Hosted All-in-One Enterprise Suite)

[![Rust](https://img.shields.io/badge/Backend-Rust%20Axum-orange?logo=rust)](https://www.rust-lang.org/)
[![Rust UI](https://img.shields.io/badge/UI-Rust%20%2B%20egui-orange?logo=rust)](https://www.rust-lang.org/)
[![WebAssembly](https://img.shields.io/badge/Web-WebAssembly-purple)](https://webassembly.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-green.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20macOS%20%7C%20Docker-brightgreen)](#)

*Ứng dụng đang được chuyển từ `legacy/` sang Rust. Kiến trúc đích là self-hosted; chưa đủ parity để triển khai production.*

</div>

---

## Trạng thái triển khai

- `backend/` là Rust/Axum với SQLite và lưu tệp trên máy chủ; **không có PostgreSQL**.
- `crates/kiyo-ui/` là UI Rust/egui dùng chung cho `desktop/` và `web/`; bản web vẽ trong canvas.
- Đăng nhập, đổi mật khẩu và danh sách/tạo thư mục đang được nối API thật. Nhiều màn hình khác vẫn là scaffold hoặc dùng dữ liệu minh họa.
- Document editor, cộng tác, chat, eKYC, chữ ký số, chia sẻ file và nhiều phân hệ nghiệp vụ **chưa đạt parity** với `legacy/`.
- API và bundle web là hai artifact build riêng; server Rust có thể phục vụ bundle tĩnh sau khi build.
- [Ma trận chuyển đổi](docs/MIGRATION_MATRIX.md) ghi bằng chứng và việc còn thiếu. Chưa kiểm chứng chạy thực tế trên Linux/macOS hoặc triển khai production.

---

## 📦 CÁC PHÂN HỆ NGHIỆP VỤ MỤC TIÊU (CHƯA ĐẦY ĐỦ)

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
apwdnt/
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
> Server dùng SQLite tại `data/kiyo-cloud.sqlite` nếu chưa đặt `KIYO_API_DB_PATH`, tạo tài khoản admin khi database trống và mặc định lắng nghe cổng 3001. Trước lần khởi động đầu tiên (kể cả debug), phải đặt `KIYO_BOOTSTRAP_ADMIN_PASSWORD` (12–256 ký tự) và `KIYO_JWT_SECRET` (ít nhất 32 ký tự) trong môi trường; mật khẩu không được in vào log.

### 2. Khởi chạy Desktop native:
```bash
cargo run -p kiyo-admin-desktop
```

### 3. Build và chạy WebAssembly cùng backend:
```bash
cd web
trunk build
cd ..
# Đặt KIYO_STATIC_DIR=web/dist trong môi trường của tiến trình backend.
cargo run -p kiyo-server
```
> Mở `http://localhost:3001` khi backend đang phục vụ `web/dist`. WebAssembly dùng cùng `crates/kiyo-ui` với desktop và gọi API tương đối `/api/v1`. `trunk serve` riêng lẻ chưa được cấu hình proxy API. Để phát triển khác origin, đặt `KIYO_CORS_ORIGIN` bằng đúng origin của dev server; mặc định backend không phát CORS cho origin khác.

---

## 🚀 BẢN NHÁP TRIỂN KHAI (CHƯA KIỂM CHỨNG PRODUCTION)

Các script trong `backend/deploy/` là bản nháp. Cần kiểm tra bảo mật, dịch vụ, TLS, sao lưu/khôi phục và luồng cài đặt trên hệ điều hành đích trước khi dùng cho dữ liệu thật.

### Cách 1: Cài đặt tự động trên Linux (Ubuntu / Debian / CentOS / Rocky)
1. Build từ repository: `cd web && trunk build --release`, sau đó quay lại root và chạy `cargo build -p kiyo-server --release`.
2. Tạo gói staging gồm `target/release/kiyo-server`, `web/dist/` (đặt tên `dist/`) và `backend/deploy/install.sh`. Script Linux tìm binary và `dist/` **trong thư mục hiện hành**, không tự lấy từ `target/` hay `web/`.
3. Kiểm tra script, biến môi trường và quyền truy cập dữ liệu trước khi chạy. Từ chính thư mục staging, có thể thử `sudo bash install.sh` trên máy thử; chưa có bằng chứng chạy thành công trên Linux production.
4. Kiểm tra trạng thái dịch vụ thử nghiệm:
   ```bash
   systemctl status kiyo
   journalctl -u kiyo -f
   ```

---

### Cách 2: Cài đặt trên Windows Server
Script Windows hiện mới tạo `.env` và copy artifact; tiến trình chạy thủ công không tự đọc `.env`, nên cần nạp các biến môi trường tương ứng trước khi khởi động. Mở PowerShell dưới quyền Administrator và chỉ thử trên máy thử sau khi đã kiểm tra script:
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
| `KIYO_API_HOST` | `127.0.0.1` | Địa chỉ IP máy chủ lắng nghe; chỉ đặt `0.0.0.0` khi đã cấu hình bảo vệ mạng/TLS |
| `KIYO_API_PORT` | `3001` | Cổng dịch vụ Web & API |
| `KIYO_API_DB_PATH` | `data/kiyo-cloud.sqlite` | Vị trí lưu trữ cơ sở dữ liệu SQLite |
| `KIYO_API_STORAGE_PATH`| `data/files` | Thư mục lưu trữ tệp tin upload / Cloud Drive |
| `KIYO_STATIC_DIR` | `dist` nếu tồn tại, nếu không là `static` | Thư mục chứa bundle WebAssembly/static web; khi build từ `web/`, đặt `web/dist` |
| `KIYO_CORS_ORIGIN` | không đặt | Một origin HTTP(S) được cho phép gọi API từ trình duyệt khác origin; không chấp nhận `*` |
| `KIYO_JWT_SECRET` | *(Bắt buộc mọi môi trường)* | Khóa bí mật ký JWT (tối thiểu 32 ký tự) |
| `KIYO_BOOTSTRAP_ADMIN_EMAIL` | `admin@kiyo.local` | Email của tài khoản Super Admin ban đầu |
| `KIYO_BOOTSTRAP_ADMIN_PASSWORD` | *(Bắt buộc lúc tạo database ban đầu)* | Mật khẩu tài khoản Super Admin ban đầu, 12–256 ký tự |

---

## 📄 GIẤY PHÉP (LICENSE)
Dự án được phát hành dưới giấy phép mã nguồn mở [Apache-2.0 License](LICENSE).
