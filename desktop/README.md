# KIYO Admin Native App

Đây là launcher native mỏng cho Windows, Linux và macOS. Toàn bộ màn hình,
models, state và API client dùng chung với WebAssembly trong `ui`;
thư mục này chỉ chứa cấu hình cửa sổ native và entry point `src/main.rs`.

Chạy từ thư mục gốc:

```bash
cargo run -p kiyo-admin-desktop
```

Mọi thay đổi giao diện phải thực hiện trong `ui` để ba nền tảng
native và web luôn dùng cùng một code.
