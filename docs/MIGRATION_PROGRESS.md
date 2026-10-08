# Migration progress — baseline

Last audited: 2026-10-08 (Windows workspace). This is a baseline, not a completion percentage.

## Coverage counts

- 20 legacy module directories discovered.
- 190 `.ts`/`.tsx` files counted in those module directories; 298 files under `legacy/web/src/` overall.
- 92 client HTTP-call search matches found in selected directories; this is not a unique endpoint count.
- Unique API operations, granular feature IDs and full database-table count: **not yet established**.
- Existing Rust shared view files: 19 plus module/index files; source presence does not prove parity.

## Existing verified slices (per previous evidence)

- Login and selected dashboard smoke.
- Account activation authorization/completion and token scrubbing.
- Self-service password change backend contract.
- Authenticated file listing and folder creation backend contract.

See `docs/MIGRATION_MATRIX.md` and `docs/TEST_EVIDENCE.md`; none of these imply full module parity.

## First implementation slice: Admin Users

`ADMIN-USERS`: implemented the real paginated user list, joined employee profile DTO, atomic account/profile/protected-workspace create, account/profile update validation, uniqueness conflicts, activation-aware status toggling and shared-egui API-backed list/create/profile/lock UI. Added backend permission/persistence tests and a UI DTO wire-format test. The legacy 2FA, last-login, export and print-card UI contains hard-coded or success-only behavior and is not represented as a real capability without an API contract.

Verification on 2026-10-08 after this slice: `cargo test --workspace --locked` passes (9 backend + 6 UI/API tests); Wasm `cargo check` passes; Windows desktop `cargo build` passes. The existing local server was not restarted or replaced, so browser interaction for this changed view is still pending. See `docs/TEST_EVIDENCE.md` for scope and limitations.

## Second implementation slice: HR Employees core

Replaced the Rust employee screen's three hard-coded rows and local-only create action with a shared-UI API flow for real list/search/status/unit filters, HR summary cards, profile details, create/edit, soft retirement and activation resend requests. Typed DTO decoding tolerates the backend's legacy-compatible `code` + `employeeCode` fields. Backend create/update/retire now use transactions; employee self-service cannot alter HR-controlled status, department, position, join date or salary. Retirement locks the account and consumes pending activation links, and activation endpoints reject retired employees. Duplicate codes are checked case-insensitively; department/position are optional in create, matching the legacy quick form.

Email remains a real blocker: employee creation returns `delivery.status=not_configured`; retry returns 503 without rotating a live link. The UI reports this accurately. Full personnel details, self-service UI, notes, direct email, org-unit manager guard and actual SMTP delivery remain open.

Verification after this slice (2026-10-08): `cargo test --workspace --locked` passed at 10 backend + 10 UI/API tests; `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked` and `cargo build -p kiyo-admin-desktop --locked` passed. Browser interaction remains pending; the running local server was not restarted.

## Employee Payslips audit

The legacy page uses the generic `employee_payslips` collection; signing only mutates local collection state and download/export actions report success without generating a payroll artifact. No typed Rust payroll contract or safe employee-scoped read exists. Removed the three hard-coded Rust salary records and replaced them with an explicit disconnected/empty state so no fabricated pay amounts appear as real records. This is a truthful UI correction, not a payslip feature migration; schema, permissions, bank-account handling, publication/signature lifecycle and real export are tracked as `BLK-004`.

## Employee self-profile core

Connected `/employee/profile` to the existing self-scoped `GET/PATCH /api/v1/employees/me` contract. The shared egui screen displays identity/HR data returned for the authenticated employee and permits editing only the phone number; backend tests verify own-profile GET and ensure self-updates cannot alter department, position, status, join date or salary. Employee address, avatar storage, bank-account approval and the legacy onboarding wizard remain explicitly incomplete.

## Business Organization Units core

Replaced the five hard-coded Rust departments with a typed shared-UI client over the legacy `business_org_units` collection. The screen loads actual units and employees, computes live exact-token department headcounts, supports search/status filtering and persists create/edit. Backend validation rejects duplicate keys/codes/names and cyclic parent relationships. Manager assignment and employee department unassignment on unit deletion execute in the same SQLite transaction as collection write/delete; deleting a parent with child units is rejected. Details drawer and browser parity are still open.

Verification after the Organization Units slice (2026-10-08): `cargo test --workspace --locked` passed (11 backend + 17 UI/API tests); Wasm `cargo check`, Windows desktop `cargo build` and `git diff --check` passed. `legacy/` had no reported changes. The existing local server on `127.0.0.1:39994` was left untouched; no new browser bundle/runtime was produced because `trunk` is unavailable in PATH.

## Dashboard data-integrity slice

Removed hard-coded KPI values and synthetic system-log entries from the Rust dashboard. The shared screen now loads `/dashboard/stats`, displays real employee account counts and connected workflow count, and exposes loading, error/retry and refresh states. The backend matches the legacy non-ADMIN employee count semantics and calculates new accounts for the current UTC month. Finance totals and audit activity are explicitly marked unavailable because the Rust target has not migrated `finance_cash_transactions` or persisted `audit_events`; see `BLK-005`.

Verification on 2026-10-08: 12 backend + 18 UI/API tests pass; `trunk build` and native workspace build pass using a target directory under `target/codex-rust`. A fresh Wasm bundle was loaded in the browser against an isolated SQLite test database: login succeeded, the dashboard showed actual zero counts (not sample KPIs), finance/audit were marked unavailable, and the Organization Units view showed a true empty state. Existing server PID 3344 on `127.0.0.1:39994` was not modified; the separate test server was stopped after browser checks. Rustfmt component installation was attempted only in the workspace-local toolchain and rolled back after its download failed.

## Files rename slice

Added a typed `PATCH /api/v1/files/{id}` client and a shared-egui rename dialog for unprotected files/folders. Success refreshes the current folder; API errors preserve the dialog and the entered name. Backend contract coverage now checks successful persisted rename, duplicate-name rejection, protected system-folder denial and cross-employee `404`.

Verification on 2026-10-08 (Windows): `cargo test --workspace --locked` passed (12 backend + 19 UI/API tests); `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`, `trunk build`, and `cargo build --workspace --locked` passed. Browser smoke on a disposable SQLite database at `127.0.0.1:39995` verified employee login, Files list, successful rename, duplicate-name error with the form value retained, browser reload/re-login, server restart and visibility of the renamed folder afterward. The UI session itself does not survive a full page reload; session restoration remains a separate open auth item. Existing server PID 3344 on `127.0.0.1:39994` was left untouched. `cargo clippy --workspace --all-targets --locked` could not reach Clippy because rustup attempted to fetch the absent `rustfmt` component and failed; formatting/Clippy are not claimed as passed.

## Remaining

Full feature-level inventory, unique route normalization, schema reconciliation, remaining user role model, full employee/personnel self-service parity, SMTP delivery, employee payroll, finance/audit schemas, all other domain slices, data import, Linux/macOS runtime testing and production readiness remain open. This is ongoing migration work; no completion percentage or full-parity claim is made.
