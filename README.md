# 🚀 KIYO PLATFORM - ALL-IN-ONE SELF-HOSTED ENTERPRISE SUITE

Hệ sinh thái phần mềm quản trị doanh nghiệp **Kiyo Platform** được thiết kế theo kiến trúc **Self-Hosted độc lập (tương tự aaPanel)**. Cho phép triển khai trực tiếp lên VPS/Server Linux hoặc Windows của khách hàng, trỏ domain riêng và vận hành trọn vẹn mà không phụ thuộc vào bất kỳ bên thứ 3 nào.

---

## 📁 Cấu trúc dự án

```
D:\DATA\source\apwdnt/
├── backend/                  # Server Backend duy nhất (Rust Axum + SQLite)
│   ├── src/main.rs          # Xử lý API, Auth, File Storage & Serve Web SPA
│   ├── Cargo.toml
│   └── deploy/              # Kịch bản cài đặt tự động & Reverse Proxy
│       ├── install.sh       # Script cài đặt 1 chạm cho Linux Systemd
│       ├── install.ps1      # Script cài đặt 1 chạm cho Windows Server
│       ├── kiyo.service     # File cấu hình Systemd service
│       ├── nginx.conf       # File mẫu Reverse Proxy & SSL Let's Encrypt
│       ├── Dockerfile       # Docker multi-stage build
│       └── docker-compose.yml
│
├── frontend/                 # Giao diện Web Client (React 18 + Vite + Tailwind)
│   ├── src/                 # Admin Dashboard, Employee Portal, Canvas Editor...
│   ├── package.json
│   └── vite.config.ts
│
├── desktop/                  # Ứng dụng Desktop cho Windows (Tauri v2 + Rust)
│
└── legacy/                   # Lưu trữ mã nguồn cũ để đối chiếu
```

---

## ⚡ Hướng dẫn Chạy Môi trường Phát triển (Development)

### 1. Khởi động Backend (Rust Server):
```bash
cd backend
cargo run
```
*Server sẽ khởi động tại `http://localhost:3001`, tự động khởi tạo database SQLite tại `data/kiyo.sqlite` và tạo tài khoản Admin mặc định.*

### 2. Khởi động Frontend (React Web):
```bash
cd frontend
npm install
npm run dev
```
*Giao diện Web chạy tại `http://localhost:3004` (tự động proxy API sang cổng 3001).*

---

## 🌐 Hướng dẫn Đóng gói & Triển khai cho Khách hàng (Production / On-Premise)

### Bước 1: Build mã nguồn
```bash
# 1. Build Frontend ra thư mục dist
cd frontend
npm run build

# 2. Build Backend Release
cd ../backend
cargo build --release
```

### Bước 2: Triển khai lên VPS/Server Linux
1. Copy file thực thi `backend/target/release/kiyo-server`, thư mục `frontend/dist` và thư mục `backend/deploy` lên máy chủ.
2. Chạy lệnh cài đặt tự động:
   ```bash
   sudo bash deploy/install.sh
   ```
3. Cấu hình Domain & SSL:
   - Trỏ DNS tên miền về IP của máy chủ.
   - Cấu hình file `deploy/nginx.conf` vào `/etc/nginx/sites-available/` và cấp chứng chỉ Let's Encrypt qua `certbot --nginx`.

---

## 🔒 Thông tin Quản trị mặc định (First-run Setup)
- **Tài khoản**: `admin@kiyo.local`
- **Mật khẩu**: Được in ra màn hình khi chạy `install.sh` hoặc cấu hình qua `KIYO_BOOTSTRAP_ADMIN_PASSWORD` trong file `.env`.
