# Test evidence — migration baseline

This file records evidence already documented for the current target. It must be updated only after the listed command or interaction is actually run in the current workspace state.

## Previously recorded evidence (2026-10-08, Windows)

`docs/MIGRATION_MATRIX.md` records:
- `cargo test --workspace --locked`: pass at that checkpoint (8 backend and 5 UI/API tests).
- `cargo check` for workspace/Wasm, desktop build and `trunk build`: pass at that checkpoint.
- Disposable SQLite smoke for health, admin login, profile, file listing and password change.
- Chromium smoke for login/dashboard, activation flow and selected viewport bounds.
- Browser interactions for files and password-change UI, Linux/macOS runtime, production deployment and legacy data migration remain unverified.

These are prior results, not a substitute for rerunning tests after new code changes. Add new entries with command, date, target, exit status, scope and limitations. Never include secrets, real user data or access tokens.

## Admin Users slice — rerun on 2026-10-08 (Windows)

- `cargo test --workspace --locked`: PASS — 9 backend tests and 6 UI/API tests. The new backend HTTP test covers unauthenticated/non-admin denial, creation and persistence of the user/profile/protected workspace, pagination, duplicate email, case-insensitive employee-code conflict, lock/unlock, and activation-link guard. The new UI decoder test covers camelCase profile fields and pagination metadata.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS — shared egui UI and WebAssembly target compile.
- `cargo build -p kiyo-admin-desktop --locked`: PASS — Windows desktop target compiles; no Linux/macOS runtime evidence.
- `git diff --check`: PASS — only Git line-ending conversion warnings were printed. The pre-existing workspace already contains unrelated modified/untracked files; they were preserved. `legacy/` has no reported changes.
- Browser interaction for the changed Admin Users screen was not run. The current browser server is an older running binary and was left untouched, so these results do not claim end-to-end runtime parity.
- Rustfmt is absent from the local 1.89 toolchain and the component fetch failed; formatting validation is pending. No source or user data was changed by that failed toolchain fetch.

## HR Employees slice — rerun on 2026-10-08 (Windows)

- `cargo test --workspace --locked`: PASS — 10 backend tests and 10 UI/API tests. Added `employee_management_persists_profiles_and_enforces_role_boundaries`, covering ADMIN-only listing/create, optional department/position, persisted employee/profile/workspace/activation token, case-insensitive code conflict, restricted employee self-edit, HR update, soft retirement, link revocation, and refusal to rotate links while SMTP is unavailable. UI tests cover legacy code field decoding, the truthful delivery response, PATCH/DELETE methods, form validation and salary formatting.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS after the employee UI and typed API additions.
- `cargo build -p kiyo-admin-desktop --locked`: PASS after the employee UI and typed API additions.
- Browser interaction for the employee screen and actual SMTP delivery remain unverified; the running server was not replaced or restarted.

## Employee Payslips audit — rerun on 2026-10-08 (Windows)

- Removed the three hard-coded sample payslip records and added `payslip_view_starts_without_fabricated_salary_records` to guard against presenting invented salary figures as real.
- `cargo test --workspace --locked`: PASS — 10 backend tests and 11 UI/API tests.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- `cargo build -p kiyo-admin-desktop --locked`: PASS on Windows.
- `git diff --check`: PASS; `git status --short -- legacy` returned no changes. The existing listener on `127.0.0.1:39994` remained PID 3344 and was left untouched.
- No browser interaction was run for this empty state. `trunk` is unavailable in the current PATH; no fresh web bundle was produced. Linux/macOS and payroll API/runtime behavior remain unverified.

## Employee self-profile core — rerun on 2026-10-08 (Windows)

- Added API-backed `/employee/profile` read and phone-only self-update in the shared UI. The client submits only `{ "phone": ... }`; HR-controlled fields are not sent from this screen.
- Extended `employee_management_persists_profiles_and_enforces_role_boundaries` with an authenticated `GET /api/v1/employees/me` contract assertion; its existing self-update assertions continue to verify salary, department, position, status and join date cannot be changed by the employee.
- `cargo test --workspace --locked`: PASS — 10 backend tests and 12 UI/API tests.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS after the profile addition.
- `cargo build -p kiyo-admin-desktop --locked`: PASS after the profile addition on Windows.
- `git diff --check`: PASS; `legacy/` reports no changes. Existing local server PID 3344 on `127.0.0.1:39994` remains untouched.
- No browser interaction has been performed; `trunk` is unavailable in PATH, so no fresh web bundle was produced. Rustfmt is still unavailable from the local toolchain.

## Business Organization Units core — rerun on 2026-10-08 (Windows)

- Replaced sample-only unit data with the typed `business_org_units` collection client and shared UI. Backend write validation and side effects are scoped to this collection.
- `cargo test --workspace --locked`: PASS — 11 backend and 17 UI/API tests. `org_unit_collection_persists_and_restricts_mutations_to_admins` verifies ADMIN-only writes, authenticated read, hierarchy-cycle rejection, persisted data, transactional manager assignment, child-unit deletion guard and atomic staff unassignment. UI tests cover legacy camelCase data, omitted derived headcount on write, path encoding, live department matching, parent-cycle and numeric validation.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS after this slice.
- `cargo build -p kiyo-admin-desktop --locked`: PASS after this slice on Windows.
- `git diff --check`: PASS with only existing line-ending conversion warnings; `legacy/` has no changes. Existing server PID 3344 on `127.0.0.1:39994` was left untouched.
- Browser interaction and visual comparison were not run; `trunk` is unavailable in PATH. Linux/macOS runtime, details drawer and full export parity remain unverified.

## Dashboard data-integrity slice — 2026-10-08 (Windows)

- `cargo test --workspace --locked`: PASS — 12 backend + 18 UI/API tests. `dashboard_stats_use_real_accounts_and_mark_unavailable_sources` checks employee/active/month counts, pending connected workflow count, unavailable finance/audit markers, empty audit data and ADMIN-only access. UI DTO test verifies the availability flags.
- `trunk build`: PASS using workspace-local Trunk 0.21.14 and `CARGO_TARGET_DIR=target/codex-rust/e2e-target`; generated a fresh Wasm/JS bundle in `web/dist`.
- `cargo build --workspace --locked`: PASS on Windows using the isolated target directory; includes backend and desktop packages.
- Browser smoke: PASS against a separate local server on `127.0.0.1:39995` and disposable SQLite under `target/codex-rust/e2e-data`. Test ADMIN login succeeded; dashboard rendered zero employee/workflow counts from that database and explicitly said finance/audit were not connected. The Organization Units screen rendered zero units and its real empty-state message. No records were created through the browser.
- The test server was stopped after browser checks. Existing server PID 3344 on `127.0.0.1:39994` remained untouched. `legacy/` remained read-only; no `D:` path was accessed.
- `rustup component add rustfmt` in the workspace-local toolchain failed to read its downloaded component and rolled back; formatting-component verification was not available in this run.
- Linux/macOS runtime, legacy finance/proposal/task/contract dashboard aggregates, audit-event persistence and production DB migration remain unverified/open.

## Files rename slice — 2026-10-08 (Windows)

- `cargo test --workspace --locked`: PASS — 12 backend tests and 19 UI/API tests. The file HTTP test verifies rename persistence, duplicate-name rejection, protected system-folder denial and cross-employee denial; the API decoder test verifies the rename response DTO.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- `trunk build`: PASS — emitted the shared-canvas Wasm bundle to ignored `web/dist`.
- `cargo build --workspace --locked`: PASS — backend, Windows desktop launcher and web launcher compile in the isolated target directory.
- Browser smoke on `127.0.0.1:39995` with a disposable SQLite database: PASS — employee signed in, opened Files, renamed a folder, and saw the server success notice and new row name. A duplicate-name attempt showed the server error while keeping the dialog and attempted value. After browser reload/re-login and backend restart, the renamed folder remained in the file list.
- Browser full-page reload returned to login rather than restoring the session; session restoration/expiry behavior remains open. This smoke covers one 1280×720 viewport and rename only, not the full Files module or responsive parity.
- `cargo clippy --workspace --all-targets --locked`: NOT RUN — rustup failed while fetching the absent `rustfmt` component before Clippy started. `rustfmt` is unavailable in the local pinned toolchain, so formatting check remains unverified.
- Existing local server PID 3344 on `127.0.0.1:39994` was not touched. The isolated test server was restarted against its own database and stopped after the smoke. `legacy/` remained read-only; no path on drive `D:` was accessed.
