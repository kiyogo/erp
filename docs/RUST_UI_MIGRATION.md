# KIYO Rust UI architecture

## Target structure

```text
crates/kiyo-ui/     Shared egui UI, models, state and API client
desktop/             Native launcher for Windows, Linux and macOS
web/                 WebAssembly launcher
backend/             Axum API, auth, SQLite and file storage
legacy/              Read-only historical source; not part of the build
```

## Rules

1. All new screens belong in `crates/kiyo-ui`.
2. `desktop` only owns the native window and platform launcher.
3. `web` only owns the browser canvas and WebAssembly launcher.
4. Windows-specific code must stay behind `cfg(windows)` or `cfg(target_os = "windows")`.
5. Do not add a second React frontend. `legacy/` is read-only reference material.
6. Backend secrets, authorization and database access stay in `backend`.

## Local development

```bash
cargo run -p kiyo-server
cargo run -p kiyo-admin-desktop

cargo install trunk
cd web
trunk serve
```

## Native builds

```bash
# Windows
cargo build -p kiyo-admin-desktop --release

# Linux
cargo build -p kiyo-admin-desktop --release

# macOS
cargo build -p kiyo-admin-desktop --release
```

The Rust source is shared; only the target toolchain and packaging format differ.
