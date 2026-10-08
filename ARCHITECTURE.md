# KIẾN TRÚC HỆ THỐNG KIYO PLATFORM (ARCHITECTURE.MD)

Tài liệu này mô tả kiến trúc đích và phần đã có của **Kiyo Platform** theo hướng Self-Hosted / On-Premise. Dự án đang chuyển đổi; các module chưa được xác nhận đầy đủ trong [ma trận migration](docs/MIGRATION_MATRIX.md). Không coi cấu trúc hiện có là bằng chứng đã sẵn sàng production.

---

## I. CẤU TRÚC THƯ MỤC DỰ ÁN

| Thư mục | Vai trò / Nhiệm vụ | Công nghệ sử dụng |
| :--- | :--- | :--- |
| **`backend/`** | Server Backend (API + Xác thực + Quản lý File + phục vụ static assets) | **Rust** (`axum`, `tokio`, `rusqlite`, `argon2`, `jsonwebtoken`, `tower-http`) |
| **`crates/kiyo-ui/`** | UI, models, state và API client dùng chung cho mọi nền tảng | **Rust + egui/eframe** |
| **`desktop/`** | Launcher native Windows, Linux và macOS gọi `kiyo-ui` | **Rust + eframe** |
| **`web/`** | Launcher trình duyệt biên dịch từ `kiyo-ui` | **WebAssembly + eframe WebRunner** |
| **`legacy/`** | Kho mã cũ chỉ đọc để tham chiếu, không tham gia build | **Legacy snapshot** |

---

## II. KIẾN TRÚC SELF-HOSTED ĐANG XÂY DỰNG

1. **Khách hàng sở hữu trọn vẹn dữ liệu**:
   - Backend Rust hiện sử dụng SQLite (mặc định `data/kiyo-cloud.sqlite`) và thư mục tệp (mặc định theo thư mục database). Không có adapter PostgreSQL.
   - Auth email/password và JWT chạy tại backend; một số tích hợp bên ngoài từ legacy chưa được chuyển và cần quyết định riêng.
2. **Khởi tạo Quản trị viên ban đầu (Bootstrap Admin)**:
   - Server tự động khởi tạo tài khoản quản trị tối cao ban đầu (`admin@kiyo.local`) qua biến môi trường `KIYO_BOOTSTRAP_ADMIN_EMAIL` và `KIYO_BOOTSTRAP_ADMIN_PASSWORD`.
3. **UI đa nền tảng từ một nguồn**:
   - `crates/kiyo-ui` chứa màn hình và state duy nhất.
   - `desktop/` hướng tới native Windows, Linux và macOS; hiện mới build trên Windows.
   - `web/` biên dịch WebAssembly; binary wasm đã build, bundle Trunk và chạy trên browser chưa được kiểm thử.
   - Backend chỉ cung cấp API và dữ liệu; không chứa business UI.

4. **Một nguồn mã duy nhất**:
   - Không còn frontend React trong source tree vận hành.
   - `legacy/` vẫn được giữ nguyên như kho tham chiếu chỉ đọc.
   - Màn hình mới và thay đổi giao diện chỉ được viết trong `crates/kiyo-ui`.

---

## III. QUY TRÌNH TRIỂN KHAI CHO KHÁCH HÀNG (DEPLOYMENT)

Các script dưới đây là bản nháp chưa được chạy kiểm chứng cho production. Chưa có nghiệm thu bảo mật, TLS, sao lưu/khôi phục hoặc thử nghiệm chuyển dữ liệu legacy. Không dùng với dữ liệu thật trước khi hoàn tất các bước đó.

### 1. Triển khai Linux (dự thảo)
Script chỉ nhận artifact từ thư mục hiện hành. Trước tiên cần tạo gói staging chứa `kiyo-server`, `dist/` đã build và `install.sh`; kiểm tra bí mật, quyền và nội dung script trên máy thử. Từ thư mục staging:
```bash
sudo bash install.sh
```
Script dự kiến tạo `/opt/kiyo`, tệp cấu hình và dịch vụ `systemd`, nhưng chưa được kiểm thử end-to-end; hiện dịch vụ trong script chạy với quyền root và cần được harden trước production.

### 2. Triển khai Windows Server (dự thảo)
Chạy script PowerShell Administrator:
```powershell
powershell -ExecutionPolicy Bypass -File backend\deploy\install.ps1
```
Script copy artifact và tạo `.env`, nhưng chạy binary thủ công chưa tự nạp biến trong `.env`; chưa nghiệm thu như một dịch vụ Windows.

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
| `KIYO_API_HOST` | `127.0.0.1` | Địa chỉ IP lắng nghe; triển khai mạng phải cấu hình tường lửa/TLS |
| `KIYO_API_PORT` | `3001` | Cổng dịch vụ Web & API |
| `KIYO_API_DB_PATH` | `data/kiyo-cloud.sqlite` | Đường dẫn tệp CSDL SQLite |
| `KIYO_API_STORAGE_PATH`| `data/files` | Thư mục lưu trữ tệp tin upload |
| `KIYO_STATIC_DIR` | `dist` nếu tồn tại, nếu không là `static` | Thư mục chứa bundle WebAssembly/static web; dùng `web/dist` khi chạy từ root sau `trunk build` |
| `KIYO_CORS_ORIGIN` | không đặt | Một origin HTTP(S) cụ thể cho dev server khác origin; không cho phép wildcard |
| `KIYO_JWT_SECRET` | *(Bắt buộc mọi môi trường)* | Chuỗi bí mật ký JWT, tối thiểu 32 ký tự |
| `KIYO_BOOTSTRAP_ADMIN_PASSWORD` | *(Bắt buộc khi tạo database)* | Mật khẩu admin ban đầu, 12–256 ký tự; không in vào log |
