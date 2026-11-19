# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Quy tắc bắt buộc của dự án

`AGENTS.md` (gốc) và `legacy/AGENTS.md` là nguồn quy tắc chính thức, đọc trước khi sửa giao diện. Các điểm hay bị vi phạm:

- Code xong là đẩy lên GitHub ngay: mỗi prompt có thay đổi mã nguồn, tài liệu hoặc cấu hình đều phải kết thúc bằng commit (Conventional Commits, không emoji) và `git push origin main`, không để sang prompt sau. Chỉ `git add` đúng các file mình đã sửa, vì working tree có nhiều thay đổi cũ chưa commit của người dùng. Remote: `https://github.com/kiyogo/erp.git`.
- Trước khi push: `npm test` trong `legacy/web`, và `npm run build` nếu đụng giao diện.
- Với chức năng chưa quen thuộc, không viết từ con số 0. Trước khi bắt tay làm, tìm các dự án mã nguồn mở tương tự trên GitHub, so sánh ý tưởng, mô hình dữ liệu và kiến trúc của chúng, chọn hướng phù hợp nhất rồi mới tùy biến theo kiến trúc sẵn có của dự án.
- Giao diện: tiếng Việt, mọi ô nhập và nút cao 32px (không dùng `size="small"`), không chữ đậm, không `&` trong tiêu đề, không viền divider thừa trong dialog, dùng `Modal` chung với `title` (không tự thêm nút X). Chi tiết ở `docs/WEB_UI_GUIDELINES.md`.
- Nút hoặc tính năng chưa rõ mục đích thì hỏi người dùng, không suy đoán.

## Skill luôn dùng

Người dùng yêu cầu luôn bật hai skill đã cài ở `~/.claude/skills/` (nguồn: `github.com/JuliusBrussee/caveman` và `github.com/DietrichGebert/ponytail`): áp dụng ở mọi phiên và mọi tác vụ, không cần người dùng gõ lệnh, trừ khi họ nói "stop caveman", "normal mode" hoặc "stop ponytail".

- `caveman`: trả lời ngắn, đưa kết quả trước, bỏ lời chào và câu thừa, giữ nguyên lệnh, đường dẫn, số liệu và lỗi. Chỉ áp dụng cho lời nói trong chat. Nội dung ghi vào file, commit, tài liệu và giao diện vẫn viết văn phong bình thường.
- `ponytail`: chọn thay đổi nhỏ nhất mà vẫn giải quyết trọn vẹn yêu cầu, ưu tiên dùng lại thành phần có sẵn trong repo, thêm test nhỏ cho logic mới. Cuối câu trả lời ghi một hai dòng về việc đã bỏ qua hoặc chưa kiểm tra.
- Vẫn trả lời bằng tiếng Việt. Khi mâu thuẫn với quy tắc ở trên thì quy tắc của dự án thắng, ví dụ sau khi thêm tính năng vẫn phải giải thích đầy đủ vị trí, cách dùng, trường bắt buộc và ảnh hưởng liên kết.

## Hai codebase song song

Repo đang chuyển đổi từ stack Node/React sang Rust, nhưng hai bên đều có mã sống:

- `legacy/` (Node.js API + React web): `ARCHITECTURE.md` gốc gọi là "chỉ đọc, không tham gia build", nhưng thực tế toàn bộ commit gần đây (module tài chính, hóa đơn điện tử) đều nằm ở `legacy/api` và `legacy/web`. Xác nhận với người dùng thư mục nào cần sửa nếu yêu cầu không nói rõ; mặc định các yêu cầu về giao diện web là `legacy/web`.
- Cargo workspace gốc (`server`, `ui`, `desktop`, `web`): backend Rust (`axum`, `rusqlite`, `argon2`), UI dùng chung egui/eframe, launcher desktop và bản WebAssembly. Tiến độ migration nằm trong `docs/MIGRATION_*.md`. Thư mục `tools/` chứa script xuất dữ liệu từ legacy để nhập vào backend Rust (`server/src/legacy_*_import.rs`).

## Lệnh thường dùng

### legacy/api (Node 24+, không framework)

```bash
cd legacy/api
npm run dev                 # node --env-file=.env --watch index.mjs
npm test                    # node --test tests/*.test.mjs
node --test tests/api-smoke.test.mjs   # chạy một file test
npm run seed:admin          # cần SEED_ADMIN_EMAIL và SEED_ADMIN_PASSWORD
```

Các file `tests/*-browser.mjs` là kịch bản Puppeteer chạy tay, không nằm trong `npm test`. API tự dùng SQLite (`KIYOVN_DB_PATH`, mặc định `./data/kiyovn.sqlite`) khi không kết nối được PostgreSQL.

### legacy/web (React 18, Vite 8, TypeScript, Tailwind)

```bash
cd legacy/web
npm run dev                 # Vite cổng 3011 (strictPort), proxy /api tới KIYO_API_TARGET (mặc định 127.0.0.1:3001)
npm run typecheck           # tsc --noEmit
npm test                    # node --experimental-strip-types --test, danh sách file liệt kê trong package.json
node --experimental-strip-types --test tests/<file>.test.mjs   # một file test
npm run build
```

Test mới dạng `*.test.mts` phải được thêm vào script `test` trong `package.json`, vì script liệt kê file thủ công. `VITE_API_URL` trong `.env` là URL tuyệt đối (hiện `http://localhost:3003/api/v1`) nên bỏ qua proxy của Vite; port API trong `legacy/api/.env` phải khớp.

Nếu `vite` báo thiếu native binding của rolldown trên Linux: `package.json` có `@rolldown/binding-win32-x64-msvc` và lockfile từng sinh trên Windows. Cài `@rolldown/binding-linux-x64-gnu` đúng phiên bản của `rolldown` (lấy tarball bằng `npm pack`, giải nén vào `node_modules/@rolldown/`) để không đổi lockfile.

### Cargo workspace (Rust 1.89, edition 2024)

```bash
cargo run -p kiyo-server               # cần KIYO_JWT_SECRET (>=32 ký tự) và KIYO_BOOTSTRAP_ADMIN_PASSWORD khi tạo DB mới
cargo test -p kiyo-server              # test nằm cùng file trong #[cfg(test)]
cargo test -p kiyo-server <tên_test>   # một test
cargo run -p kiyo-admin-desktop
cd web && trunk build                  # bundle WebAssembly; chạy server với KIYO_STATIC_DIR=web/dist
```

Biến môi trường backend Rust: `KIYO_API_HOST` (127.0.0.1), `KIYO_API_PORT` (3001), `KIYO_API_DB_PATH`, `KIYO_API_STORAGE_PATH`, `KIYO_CORS_ORIGIN`.

## Kiến trúc legacy (cần đọc nhiều file mới thấy)

- `legacy/api/index.mjs` là một file rất lớn (~14.000 dòng) chứa toàn bộ route `/api/v1`, dispatcher thủ công `handleRequest`, middleware `requireUser`/`requireAdmin`, giới hạn đăng nhập `loginAttempts` trong bộ nhớ (8 lần/15 phút) và băm mật khẩu `scrypt$salt$hash`. Không có framework HTTP. Các module phụ: `db.mjs`, `crypto.mjs`, `serializers.mjs` (che dữ liệu nhạy cảm), `backups.mjs`, `document-files.mjs`.
- `legacy/api/db.mjs` bọc hai CSDL sau một giao diện: ưu tiên PostgreSQL (`DATABASE_URL`/`PGHOST`), nếu không thì `node:sqlite`. Câu SQL viết theo kiểu SQLite với `?` và `json_extract`, `convertSql` đổi sang `$n` và `->>` cho PostgreSQL. Transaction dùng `AsyncLocalStorage` để mỗi lời gọi lấy đúng connection. Khi viết SQL mới phải chạy được trên cả hai.
- `legacy/web/src`: `api/endpoints.ts` (toàn bộ client API và kiểu payload) -> `api/axios.ts` (Bearer JWT) -> `services/dataService.ts`. Mỗi phân hệ nghiệp vụ là một thư mục trong `modules/`; logic thuần tách thành `*Rules.ts` kèm `*.test.mts` (ví dụ `modules/finance/`). Menu điều hướng khai báo tại `data/menuData.tsx`.
- `legacy/web/src/custom-ui/` (`index.tsx`, `theme.css`) là thư viện component riêng (Button, Modal, Table, Select, Input...) thay cho Ant Design; chỉ `@ant-design/icons` được dùng. Mọi UI mới phải dùng lại thư viện này.
- `legacy/web/src/features/documents/editor/` là engine soạn thảo văn bản tự viết trên Canvas 2D (phân trang, IME Telex/VNI, undo/redo); mô tả trong `legacy/docs/canvas-document-engine.md` và `document-editor-architecture.md`.
- eKYC chạy hoàn toàn phía trình duyệt (`modules/ekyc`: tfjs/blazeface, tesseract.js, jsqr).
- Tài liệu sống của legacy: `legacy/CURRENT_STATE.md`, `API_CONTRACT.md`, `DATABASE_SCHEMA.md`, `CHANGELOG_AI.md`. Một số tuyên bố "hoàn thiện 100%" trong đó đã cũ; đối chiếu với mã nguồn.

## Kiến trúc Rust

- `server/src/` là một file Rust cho mỗi phân hệ (`finance.rs`, `hr_*.rs`, `asset_*.rs`, ...) cùng các module `*_import.rs` nhập dữ liệu từ legacy; `main.rs` ghép router axum, phục vụ luôn static bundle web. SQLite là CSDL duy nhất, không có adapter PostgreSQL.
- `ui/` giữ toàn bộ màn hình, state và API client egui dùng chung cho desktop và WebAssembly; `desktop/` và `web/` chỉ là launcher mỏng. Thay đổi giao diện của stack Rust chỉ làm trong `ui/`.
