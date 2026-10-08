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
trunk build
```

For same-origin browser testing, run the backend from the workspace root with `KIYO_STATIC_DIR=web/dist` in its environment, then open `http://localhost:3001`. The web UI calls relative `/api/v1`. `trunk serve` alone does not proxy those API calls in the current configuration. If using a separate dev-server origin, set `KIYO_CORS_ORIGIN` to exactly that HTTP(S) origin; no wildcard is allowed. The default backend response has no cross-origin allowance. The activation route accepts the token-bearing link format, then the Wasm launcher replaces that one-shot URL with `/` before mounting the canvas; SMTP/email delivery is not yet configured in Rust. Other secrets must not be placed in URLs.

The current migration is **partial**. See [the migration ledger](MIGRATION_MATRIX.md) before treating a visible navigation item or an API route as a complete feature. The shared UI currently implements activation, password change and real file listing/folder creation; activation email delivery, upload/download/share, document editing and many domain modules remain incomplete. The activation link exchange, one-use scoped session and atomic account activation have backend/UI tests and a Chromium smoke test against a disposable server/database.

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
Successful Windows and wasm compilation does not prove Linux/macOS runtime behavior, IME, clipboard, file dialogs or browser interaction. Those checks remain outstanding.

## Verification commands for each target runner

Run these on Windows, Linux and macOS CI or a real host with the repository's pinned Rust toolchain and the OS graphics/build prerequisites installed:

```bash
cargo fmt --all -- --check
cargo check --workspace --locked
cargo test --workspace --locked
cargo build -p kiyo-admin-desktop --locked
cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked
cd web && trunk build
```

Then run the native app and the browser bundle against a disposable backend database, separately for ADMIN and Employee. Check Vietnamese text/IME, clipboard, DPI, file picker, network errors, deep-link refresh and 1440x900/1280x800 (desktop/browser) plus 390x844 (browser). The current Windows run has only build/test and an isolated HTTP smoke test; UI interactions and other operating systems still need evidence.
