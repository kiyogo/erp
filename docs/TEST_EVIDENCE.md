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

## Leave-request UI source follow-up — 2026-10-09 (Windows)

- Direct `rustfmt 1.8.0-stable --check --edition 2024 ui/src/views/attendance_leave_requests.rs`: PASS after the ADMIN and employee self-service UI source updates. egui API symbols used by those edits were checked against the locked egui 0.29.1 source.
- Direct toolchain `cargo check -p kiyo-ui --lib --locked --offline`: NOT COMPLETED. Cargo reached `Checking kiyo-ui`, then rustc failed to write `target/debug/deps/rmeta.../full.rmeta` with Windows OS error 112 (disk full). E: had 12 KiB free and C: had 0 bytes afterward. This is not evidence of a Rust type-check pass or failure; no diagnostic about the changed Rust code was emitted.
- `cargo test`, fresh native/Wasm/Trunk builds, and visual/browser/native runtime comparison were not run for these latest source edits. Existing desktop EXE and `web/dist` artifacts predate them. No legacy or production data was modified.

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

## Files transfer, soft-delete and public-share slice — 2026-10-08 (Windows)

- `cargo test --workspace --locked`: PASS — 13 backend tests and 24 UI/API tests. `file_upload_download_round_trip_preserves_bytes_and_owner_scope` verifies exact binary round-trip including NUL and `0xFF`, Unicode filename decoding, MIME/size/origin metadata, unauthenticated upload rejection, cross-employee download denial, rejection of a disallowed employee `.bin`, and that `DELETE` hides a node from list/download while its bytes remain stored. It also verifies share creation, anonymous metadata/byte access, denial of cross-employee share mutation, token rotation invalidating the prior URL, disable revocation, and that soft-deleting a file makes an otherwise active share return 404. UI tests cover share DTOs, preview classification, URL construction and the delete response.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS after the native/WASM file-dialog adapter and raw-byte APIs.
- `cargo build --workspace --locked`: PASS on Windows. The WASM check, workspace build and `trunk build` pass after the share routes and views were added.
- Browser E2E against a disposable SQLite DB and storage on `127.0.0.1:39995`: PASS — synthetic employee logged in, selected the 149-byte `kiyo-transfer-fixture.txt` through the WASM picker, confirmed upload, and saw the persisted row and success notice. The UI download-save flow completed and reported success. A separate authenticated API re-download was saved under the same isolated test directory; its SHA-256 matched the fixture exactly (`68DDA48F0C120C30639380C8E96727359D4AAD98323647F05FD170DAB5E1B40D`).
- Test server PID 40124 was stopped after the check. Existing listener PID 3344 on `127.0.0.1:39994` was not touched. `git status --short -- legacy` was empty. Linux/macOS and native file-dialog runtime remain unverified; Rustfmt/Clippy remain unverified because the configured Rustfmt component could not be loaded.
- The newly added delete-confirmation UI has not yet been exercised in the browser; backend contract and storage-retention behavior are covered by the HTTP integration test.
- Public share manager and guest view compile for native/WASM and pass DTO/contract tests; browser interaction, clipboard behavior, image rendering and video playback have not yet been exercised end-to-end.
- Existing local server PID 3344 on `127.0.0.1:39994` was not touched. The isolated test server was restarted against its own database and stopped after the smoke. `legacy/` remained read-only; no path on drive `D:` was accessed.

## Files content replacement — 2026-10-08 (Windows)

- `cargo test --workspace --locked`: PASS — 13 backend tests and 24 UI/API tests. The existing Files HTTP integration test now exercises both upload and replacement with 3 MiB requests (proving both routes exceed Axum's default 2 MiB extractor limit), rejects cross-employee replacement, verifies the original filename is retained, checks updated MIME/size and exact authenticated/public download bytes, and confirms persisted storage contains the replacement. Upload and replacement routes each explicitly allow up to 50 MiB at the extractor layer, matching the handler/client cap.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS; `cargo build --workspace --locked`: PASS; `trunk build`: PASS.
- The shared Files UI now provides a replacement-file picker and explicit confirmation, sends the existing authenticated `PUT /api/v1/files/{id}/content` contract, retains the selected file on API failure and reloads the listing on success. Browser E2E for this new control has not been run; native dialog runtime and Linux/macOS remain unverified.
- `git diff --check` and the read-only `legacy/` check are recorded below after final validation.

## Personal notifications — 2026-10-08 (Windows)

- `cargo test --workspace --locked`: PASS — 14 backend tests and 27 UI/API tests. New `notifications_are_persisted_and_scoped_to_authenticated_users` exercises anonymous rejection, persisted create, ADMIN targeting, non-admin `userId` isolation, per-user listing, cross-user mark-read denial, owner mark-read, scoped mark-all, delete isolation, and clear-all isolation. UI tests verify legacy DTO fields, search fields, and role-visible internal-link resolution.
- The Rust API response preserves legacy `id/key/userId/type/read/unread/time/createdAt` fields. Cross-user mark-read returns 404 instead of exposing another user's notification payload; delete remains non-disclosing and scoped.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`, `cargo build --workspace --locked` and `trunk build`: PASS after the notification UI and background unread-count integration.
- Browser UI interaction, unread badge runtime behavior, native runtime, Linux/macOS, and the separate admin broadcast-notification manager remain unverified/open.

## Admin broadcast drafts — 2026-10-08 (implementation only)

- Added `system_broadcast_drafts_persist_and_are_admin_only`, covering employee denial on typed and generic reads, employee create/delete denial, invalid typed and generic writes, ADMIN draft creation, durable collection persistence, partial update, list, and delete.
- Added an API DTO test for legacy `type`, `targetAudience`, `createdAt`, `readCount`, and `totalRecipients` names, plus a UI search test.
- **Not run:** no `cargo`, `rustc`, or `rustup` executable was available in this turn's shell. No server/UI test, Wasm check, native build, Trunk build, or browser interaction is claimed for these edits.
- SMTP configuration/test/send, SMS/in-app fan-out and real recipient delivery are still unimplemented. Create only persists `Nháp`; it does not claim delivery.

## Activation email template — 2026-10-08 (implementation only)

- Added ADMIN-only GET/PUT template routes, validated persistence through the existing `settings` table, and a typed API client/editor in the shared egui UI. The GET response states `emailConfigured=false`; template body preview is plain text and never executes markup.
- Added `activation_email_template_is_admin_only_validated_and_persistent` for role denial, default response, invalid input, save/reload persistence and truthful delivery status. Added a UI/API contract test for camelCase fields and the safe config-status flag.
- **Not run:** `cargo`, `rustc`, and `rustup` were unavailable in this turn's shell. No tests, Wasm/native build, browser interaction, Rustfmt or Clippy result is claimed for this change.
- SMTP credentials/configuration, test-send, provider integration, and real delivery remain out of scope for this slice. `legacy/` remains read-only.

## Meeting rooms — 2026-10-08 (implementation only)

- Replaced hard-coded room cards and local success-only booking with typed Axum endpoints over the existing `meeting_rooms` and `room_bookings` storage scopes, plus shared egui overview/list/calendar/history flows.
- Added `meeting_rooms_and_bookings_persist_and_reject_conflicts` to cover role boundaries, persistent room creation, case-insensitive duplicate rejection, booking identity field compatibility, overlapping reservations, capacity limits, cancellation, list reload and generic-write bypass rejection. Added a DTO/wire-format contract test and an empty-state test guarding against fabricated rooms.
- **Not run:** no `cargo`, `rustc`, `rustup` or `trunk` executable is available in this shell. No Rust test, native/Wasm build, browser/native interaction, formatter or Clippy result is claimed.
- Legacy's three completed-history examples were hard-coded, and its report export and Meet/Teams/settings controls only report/localize client state; these are not represented as working features. Real export, durable policy settings and provider integrations remain open.

## Workflow blueprint catalog — 2026-10-08 (implementation only)

- Added `workflow_blueprints_are_typed_admin_only_and_generic_writes_are_blocked`, which covers ADMIN create/list/status, duplicate-code rejection, employee read denial, honest zero run/pass counters, and generic-write bypass rejection.
- Added the UI/API contract test for camelCase `requireTokenPKI` and form `type` fields, serialization names, catalog empty state and category/search/status filtering.
- Extracted the blueprint API/domain implementation into `server/src/workflows.rs`; routes and response contracts are intended to be unchanged. This refactor has not been compiled, so no compatibility claim is made yet.
- **Not run:** the current shell has no `cargo`, `rustc`, `rustup` or `trunk` executable available. No Rust tests, native/WASM build, formatting, browser UI or desktop runtime result is claimed.
- `legacy/` was read-only; no legacy data import, PKI operation, SMTP send, or service restart was performed. Workflow request/execution/history/settings and employee task/proposal flows remain open.

## Workflow request submission — 2026-10-08 (implementation only)

- Added `workflow_requests_persist_with_immutable_submission_history_and_admin_access` for ADMIN request creation/list persistence, recorded submit event, duplicate code and budget-limit rejection, employee read denial, generic write bypass denial, and SQLite rejection of event UPDATE/DELETE.
- Added a UI/API DTO contract test for camelCase request fields and history, and UI tests for search/status filtering, truthful empty state and VND formatting.
- Extended the request HTTP test to verify that a newly persisted pending request appears in the dashboard count and normalized `pendingWorkflows` summary.
- Added history-view tests for flattening/filtering stored events and for an empty backend state with no seeded audit rows.
- Extended backend HTTP coverage for creator self-decision denial, ordinary approval advancing to a PKI-required step, fail-closed 503 with unchanged history at that step, plus persisted reject/return/final-approval outcomes and notes. A USER decision attempt is also asserted to return 403.
- Added a UI metric aggregation test over pending, urgent, PKI-waiting, approved and returned records; the visible cards use only loaded request data and label approvals as a total rather than an unverified timezone-dependent “today” count.
- Added a UI account-switch regression test asserting loaded requests, expanded details, search/filter state, unsaved request fields and decision notes are cleared before loading another account's records.
- **Not run:** Rust tests, workspace/native/WASM builds, formatting, browser or desktop UI verification. The configured Rust toolchain is unavailable in this shell; see `BLK-007`. Test source is coverage intent only until executed.
- `legacy/` remained read-only; no migration import, real signing, SMTP send or service restart occurred. Approval transitions, employee ownership, attachments, overview/history/settings, PKI/TSA and exports remain open.

## Employee proposals — implementation only

- Added typed Rust routes and schema for legacy `GET/POST /employee-proposals`, `GET /{id}`, and `PATCH /{id}/review`; the integration test covers generated code/wire fields, USER-owned list/detail, cross-user denial, USER review denial, ADMIN review metadata, one-time transition, and invalid amount rejection.
- Added shared egui employee/HR views and typed API DTO tests, plus view tests for real-record metrics, filtering, amount validation/formatting and account-switch state clearing.
- **Not run:** server/UI tests, workspace/native/WASM builds, browser/native interaction and formatting because the current shell has no `cargo`, `rustc` or `rustfmt`. Source coverage is not runtime evidence.
- `legacy/` remains read-only. No legacy database/localStorage import or notification send was performed; the legacy review endpoint only stores review metadata despite the UI's feedback-delivery wording.

## Enterprise tasks — implementation only

- Added `task_lifecycle_persists_and_enforces_assignment_permissions` for ADMIN-only assignee listing/create/delete, full ADMIN task-field update, create/code/checklist/activity, employee-scoped list/detail, cross-user and protected-field denial, progress, comment, report, checklist update and cascade delete; added a client DTO camelCase/`type` wire-format test.
- Added task-scoped binary attachment lifecycle coverage: upload and exact-byte download, cross-member denial, same-task report reference validation, forged-metadata rejection, unreported draft-delete cleanup, conflict when deleting a reported file, encoded Unicode filenames, and blob cleanup when deleting the task.
- Executed the exact `init_database` SQL string from `server/src/main.rs` in Node 24's in-memory SQLite engine. It created the task tables, including the eight-column `task_attachments` table. This validates SQL syntax/schema only, not Rust handler behavior.
- **Not run:** Rust tests/build, formatter, browser/native E2E. `cargo`, `rustc`, `rustfmt` and `trunk` are not available in this shell. No runtime parity is claimed; `legacy/` was read-only and no task records were imported.

## Strategic plan list — implementation only

- Added backend HTTP test coverage for ADMIN-only list/create/complete, generic-collection read/write bypass rejection, normalized unique codes, invalid date ordering, persistence and completion state.
- Added UI search coverage for code/name/department/manager and Vietnamese currency-format coverage.
- **Not run:** Rust tests/builds, formatting, browser/native interaction or visual parity. No localStorage import was performed; roadmap is tracked as its own slice below.

## Strategic plan milestones — implementation only

- Added backend HTTP test coverage for ADMIN-only access, generic-collection bypass rejection, create/list/achieve persistence, unique code, invalid quarter and invalid deadline handling.
- Added typed client contract coverage for legacy camelCase fields and UI search/filter/account-switch coverage across code, quarter, name, acceptance criteria, owner and achieved status.
- **Not run:** Rust tests/builds, formatter, browser/native interaction or visual parity. No localStorage import or A4/PDF generation was performed.

## Strategic plan progress — implementation only

- Added backend HTTP coverage for ADMIN-only list/update, generic collection bypass rejection, integer-range validation, state transition/persistence and preservation of unrelated legacy fields.
- Added client camelCase contract coverage and UI tests for the legacy thresholds, search fields, rounded unweighted average, empty state, overdue/completed labels and account-switch clearing.
- **Not run:** Rust tests/build/format, browser/native interaction or visual parity. `cargo`, `rustc`, `rustfmt` and `trunk` are unavailable on PATH; legacy localStorage data has not been imported.

## Strategic plan reports — implementation only

- Added backend HTTP coverage for ADMIN-only list/create/update, generic write bypass rejection, validation, persistence, multiple reports per unit/period, period filtering, compatibility with prior camelCase records lacking a period, and preservation of arbitrary legacy `projects` JSON when updating.
- Added typed client camelCase contract coverage and UI tests for KPI/budget/search filters, numeric form validation, summary math, currency, variance and completion-rate formatting.
- **Not run:** Rust tests/build/format, browser/native interaction or visual parity. No localStorage import or real PDF/Excel generation was performed; tests are source evidence only.

## Strategic roadmap / OKR — implementation only

- Added backend HTTP coverage for ADMIN-only list/create, generic scope read/write boundaries, persistence, case-insensitive duplicate codes, zero progress, invalid progress, unsupported pillar and invalid calendar date.
- Added client camelCase/fractional-progress contract coverage and UI tests for pillar/search filters, empty/data-backed summaries, progress bounds/formatting and create-form validation.
- **Not run:** Rust tests/build/format, browser/native interaction or visual parity. No localStorage import or real printing/provider synchronization was performed; test source is not runtime evidence.

## Legacy Plans localStorage importer — source coverage only

- Added backend HTTP test source for ADMIN-only preview/apply, preview no-mutation, successful OKR persistence with unknown JSON field retention, append-only audit row, same-batch replay rejection, unsupported scope, invalid typed progress and nonempty-target refusal without partial import.
- Added API DTO tests for preview/result camelCase responses. The exporter JavaScript passed `node --check`.
- A Node VM smoke with mocked localStorage verified the exporter requests only the five allowlisted keys, performs no localStorage writes, and produces a one-record export summary. This is not a browser-origin or business-data migration test.
- **Not run:** Rust tests/build/WASM/native build, browser exporter/import flow, any live legacy origin, backup/restore or actual data transfer. Do not treat static source coverage as migration verification.

## Attendance shift catalog — source coverage only (2026-10-08)

- Backend test source `attendance_shift_collection_is_admin_only_validated_and_persistent` covers ADMIN full-collection `PUT`/list, USER read/write denial, duplicate-key and invalid work-unit rejection, preservation of the saved collection after rejected replacement, persistence, `key` precedence over `id`, and an unknown legacy field.
- API DTO test `attendance_shift_contract_preserves_legacy_fields_and_camel_case` covers camelCase fields and preservation of unknown legacy properties.
- `git diff --check`: PASS (exit 0; only Git line-ending conversion warnings) after the latest edits. `cargo test`, Rust formatting, desktop/WASM builds, browser interaction and server restart checks: **NOT RUN** because `cargo`, `rustc`, `rustfmt` and `trunk` are not discoverable in this shell. Test source is not runtime evidence.
- No legacy or production data was used or modified. No migration/import test was performed.

## Attendance leave requests — source coverage only (2026-10-08)

- Added backend test source `leave_request_collection_is_admin_only_validated_and_persistent` for ADMIN GET/PUT, USER denial on both `leave_requests` and `employee_leaves`, duplicate-key rejection, case-insensitive duplicate-code rejection on PUT/POST/PATCH, date-range rejection, multiline reason persistence, unknown-field retention and preservation of the prior collection after rejected replacement.
- Added Rust client DTO tests for legacy aliases (`type`, `fromDate`, `toDate`, `days`), unknown JSON round-trip, camelCase form fields and fallback collection identity. Added UI source tests for pending-status compatibility and missing-key normalization.
- `git diff --check` is run after the current edits; Rust tests/builds, formatting, desktop/WASM/browser UI, restart persistence and localStorage import are **NOT RUN** because no Rust toolchain is available. These tests are source coverage only.
- `legacy/` and production data were not modified or imported. This test section covers the older ADMIN-only generic collection and does not, by itself, verify the separate employee self-service API.

## Attendance leave collections — optimistic concurrency verification (2026-10-09)

- `GET` for `leave_requests` returns a revision calculated from the same SQLite read snapshot as the records. `PUT` requires `expectedRevision`, checks it inside an immediate transaction and returns HTTP 409 before replacing anything when stale. The same write guard is enabled for generic `employee_leaves` replacements.
- The HTTP integration test verifies missing revision rejection, successful replacement with the current revision, revision change after a write, stale revision conflict without data loss, and revision enforcement on `employee_leaves`. Existing authorization, field validation, duplicate and persistence checks remain covered.
- The shared UI stores/sends the revision, disables writes if the response has no revision, updates it after successful replacement and retains the form on conflict. API contract tests verify revision decoding and camelCase `expectedRevision` serialization.
- Verification: `cargo fmt --all -- --check` PASS; `cargo test -p kiyo-server -p kiyo-ui --locked --quiet` PASS (128 backend + 170 UI/API); `cargo build --workspace --locked` PASS; `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked` PASS, all Rust build/test commands in Linux Docker (`rust:1.89-bookworm`). Browser/native interaction, restart persistence and visual parity were not tested. No legacy or production data was changed or imported.
- Fresh bundle runtime follow-up: `trunk build --release` PASS (Trunk 0.21.14). Headless Chromium (1280×800) loaded the current WASM canvas, signed into a disposable backend with a synthetic ADMIN account, rendered the dashboard and opened the ADMIN leave-request screen; the associated API calls returned HTTP 200. In a stale-editor scenario, a second full-list update succeeded, the screen's subsequent save returned 409, the conflict message was rendered and both entered form fields remained visible. A follow-up GET confirmed both concurrent records survived. No JavaScript exception occurred; the expected HTTP 409 was logged as a failed resource. Isolated test server and database were removed after the check; no production or legacy data was used.

## Employee leave self-service — source coverage only (2026-10-08)

- Added HTTP test source `employee_leave_requests_are_owner_scoped_and_audited`: rejects client-supplied employee identity, invalid half-day amount and accounts without an active HR profile; checks server-derived identity, owner-only listing, ADMIN listing, cross-user event denial, USER decision denial, ADMIN approval, duplicate-decision conflict, account-delete protection and append-only event protection.
- Added module validation tests for supported leave types/date ranges/day increments, UI form tests for comma-decimal half days and invalid dates/amounts, and API DTO tests proving create payloads do not include employee identity.
- The UI now links `/employee/leaves` from the employee portal and uses typed create/list/detail/history APIs. ADMIN typed submissions are visible and reviewable on the attendance request page alongside the old ADMIN collection. Generic collection scopes remain ADMIN-only.
- **NOT RUN:** Rust tests/build/format, browser/native/WASM interaction, and restart persistence; `cargo`, `rustc`, `rustfmt`, and `trunk` are unavailable in this session. Source tests are not runtime verification. `legacy/`, production data, and historical records were not modified or imported.

## Employee overtime self-service — source coverage only (2026-10-08)

- Added HTTP test source `employee_overtime_requests_are_owner_scoped_and_audited`: rejects client identity spoofing and accounts without an active employee profile; verifies server-derived employee snapshots, owner-only USER list, ADMIN list, cross-owner event denial, USER decision denial, ADMIN approval, repeated-decision conflict, account-deletion protection and append-only event protection.
- Added validation tests for date/category/half-hour input, UI form tests for comma-decimal hours and invalid values, and API DTO checks that create payloads omit employee identity, multiplier and pay-rate fields.
- Executed the extracted schema SQL in a fresh in-memory SQLite database: both typed tables and append-only event triggers were created; a valid request/event insert succeeded; event UPDATE/DELETE and a 1.25-hour value were rejected. This checks schema SQL only, not Rust handler behavior.
- **NOT RUN:** Rust tests/build/format, native/WASM/browser interaction or restart persistence; `cargo`, `rustc`, `rustfmt` and `trunk` are unavailable. Source tests are not runtime verification.
- No legacy or production records were imported or modified. The legacy UI's fabricated pay estimates and monthly cap are not evidence of payroll policy.

## Attendance shift assignments — source coverage only (2026-10-08)

- Added backend HTTP test source `attendance_shift_assignments_are_admin_only_linked_and_audited`: USER typed/generic read denial and create denial; client identity spoof rejection; invalid date range; missing active employee profile; paused-shift rejection; active linked employee/shift snapshots; duplicate-code conflict; ADMIN event access boundary; generic-write bypass denial; account-delete protection; append-only history.
- Added module validation tests for code/date normalization, API DTO camelCase and key-only create inputs, and shared-egui form tests for invalid code/date order and requiring loaded employee/shift records.
- **NOT RUN:** Rust tests/build/format, native/WASM/browser interaction, restart persistence and historical assignment import because the Rust toolchain is unavailable (`BLK-007`). Test source is not runtime verification.
- The legacy generic `attendance_shift_assignments` rows were not read from a live database, exported, imported, rewritten or deleted; `legacy/` remains unchanged.

## Server-backed authentication sessions — source coverage only

- Added session-backed JWT issuance on password login and activation completion; each protected request checks the session row and revocation state. Sid-less pre-change tokens are rejected in production, so deployment requires users to sign in again.
- Added logout and ADMIN list/revoke routes, explicit self-revoke protection, atomic append-only session events, other-session revocation on password change, and all-session revocation on account deactivation. User deletion keeps session-event identifiers while cascading session rows.
- Added ADMIN-only egui session list/revoke confirmation and backend test source for listing, role denial, self-revoke denial, admin revocation, logout, password-change revocation, account deactivation and rejected post-revocation access. Fields that legacy fabricated (IP/VPN/device/location/MFA/last-active) are not represented.
- The shared app now calls `/auth/introspect` immediately after login and every five minutes while active; it preserves the session during network failures and returns to login for server 401/403. Backend test source checks active introspection and rejection after revocation.
- **Not run:** Rust tests/build/format, API contract tests, browser/native/WASM interaction. The Rust toolchain is unavailable in this shell; see `BLK-007`. Cross-restart session restoration and retention/cleanup policy remain open.

## Task manager-scoped delegation — verified in Docker (2026-10-08)

- Fixed compile issues found by the first full workspace run: workflow request handler visibility, the broadcast update transaction borrow/commit, a plan-report JSON test, UI event-label lifetime, dialog close-state borrowing, and missing API test imports. Corrected collection-write test payloads and aligned the deactivated/revoked-session assertion with the server's 401 behavior. The broadcast-search helper now normalizes its query itself, including uppercase Vietnamese text.
- `cargo test --workspace --locked` in `rust:1.89-bookworm`: PASS — 42 backend tests and 83 shared UI/API tests (125 total). Includes task lifecycle/assignment scope, direct/child-unit manager options, employee cross-unit denial and UI selector/API contract coverage.
- `cargo build --workspace --locked` in `rust:1.89-bookworm`: PASS — Linux debug build of backend, shared UI, desktop binary and WebAssembly entrypoint.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS. The shared `egui` UI and web entrypoint compile for `wasm32-unknown-unknown`.
- `cargo fmt --all`: applied standard formatting to the Rust workspace; subsequent `cargo fmt --all -- --check`: PASS.
- `git diff --check`: PASS (exit 0; only Git LF/CRLF conversion warnings). `git status --short -- legacy`: empty.
- Docker Linux compilation is not evidence of Windows/macOS runtime, browser interaction, or production data import. `legacy/` was not modified and no legacy/production records were imported.

## Task multi-assignee batch — verified in Docker (2026-10-08)

- Added integration coverage for one task per selected assignee, manager-scoped USER authorization of every recipient, ADMIN batch creation, rejection of out-of-scope recipients without partial writes, duplicate canonical assignee rejection/rollback, and persisted task/checklist/activity counts. API DTO tests cover `assigneeIds` and the `{ tasks, count }` response; UI tests cover pruning selections when the project scope changes.
- `cargo test --workspace --locked` in `rust:1.89-bookworm`: PASS — 43 backend tests and 85 shared UI/API tests (128 total).
- `cargo build --workspace --locked`: PASS — Linux workspace build including server, desktop binary and WebAssembly entrypoint.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- `cargo fmt --all -- --check`: PASS. `git diff --check`: PASS. `git status --short -- legacy`: empty.
- Browser/native end-to-end, fresh Trunk bundle, Windows/macOS runtime, visual parity and historical task import remain open; no legacy records were imported or modified.

## Admin Users — full-directory search/filter parity verified in Docker (2026-10-08)

- Extended ADMIN `GET /api/v1/users` with bounded `search` (maximum 160 characters) and allowlisted `filter=all|active|locked|admin|retired`. Search covers employee code, name, email, department, position and role using Unicode lowercasing; filtering happens before pagination. The response includes filtered `pagination.total` and a separate global summary of total, active and ADMIN accounts.
- Updated shared egui to debounce query edits, request server-side results, reset to page one on query/filter changes, and render system-wide summary values rather than counts from the current page.
- Backend HTTP test covers full-dataset summary, case-insensitive search by name, email, employee code, Unicode Vietnamese department and position, active and ADMIN filters, pagination result counts and invalid-filter rejection. UI/API tests cover query encoding, summary decoding and filter parameter mapping; a UI state test verifies account changes clear directory, search, selected detail and unsaved password state.
- `cargo test --workspace --locked` in `rust:1.89-bookworm`: PASS — 43 backend and 88 shared UI/API tests.
- `cargo build --workspace --locked`: PASS — Linux workspace including backend, desktop and Wasm entrypoint. `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS. `cargo fmt --all -- --check`: PASS.
- Browser/native interaction, keyboard/IME, visual parity and Windows/macOS runtime remain unverified. Legacy has no account edit/delete UI; fake 2FA/last-login/export/print remain excluded.

## CRM contacts — API, crypto compatibility and UI logic (2026-10-08)

- `cargo test --workspace`: PASS — 50 backend + 91 UI/API tests. CRM HTTP tests cover ADMIN vs USER, create/list/type filtering, ignored client code, generated code shape, authorized plaintext response, encrypted database columns, validation rejection, no-key 503/no-write and no ciphertext disclosure with missing or mismatched keys.
- Rust decrypts a fixed `ENC:` AES-256-GCM vector generated using Node built-in `crypto` with an artificial test master key, fixed nonce and the legacy CRM HKDF salt/info. Rust encrypt/decrypt round trips pass. No real secret was used or output.
- `cargo build --workspace --locked`: PASS — Linux backend, desktop binary and Wasm entrypoint. `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- `cargo fmt --all -- --check`: PASS. `git diff --check`: PASS (Git only printed LF/CRLF conversion warnings). `git status --short -- legacy`: empty.
- No CRM production/legacy records were imported; no live key file was inspected. Browser/native flow, provisioned-key restart persistence, visual parity, CRM evaluation/feedback and cross-platform runtime remain open.

## CRM supplier evaluations and customer feedback — typed APIs/UI (2026-10-08)

- `cargo test --workspace --locked`: PASS — 51 backend + 91 shared UI/API tests. The new CRM HTTP test verifies ADMIN-only access, server-derived evaluation totals/tiers and generated feedback codes, duplicate-code conflict, creator/resolver metadata, phone encryption at rest, generic collection read/write blocking, persistence and one-time feedback resolution.
- `cargo build --workspace --locked`: PASS — Linux server, shared desktop UI, desktop launcher and web entry point.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- `cargo fmt --all -- --check`: PASS. `git diff --check`: PASS (Git may warn that checked-in LF files will be converted to CRLF on the Windows host). `git status --short -- legacy`: empty.
- Browser/native screens, visual/responsive comparison, provisioned-key restart, Linux/macOS runtime and migration/import of old collection/localStorage records remain unverified. No production records or real key material were read or imported; `BLK-010` remains open.

## HR training courses and certificates — latest full workspace verification (2026-10-08)

- `cargo test --workspace --locked`: PASS — 54 backend + 98 shared UI/API tests (152 total). Certificate HTTP coverage verifies ADMIN-only access, employee code resolution to server-owned HR identity, persistent list/create, generated and duplicate codes, reversed-date rejection, HTTPS-only link validation, and generic collection read/write bypass rejection. Certificate status boundary tests cover expired, due within 90 days, and valid dates. UI/API tests cover legacy camelCase DTO fields, unknown-field compatibility, form validation, all-record default status filtering and omission of fabricated holder identity.
- `cargo build --workspace --locked`: PASS — Linux server, shared desktop UI, desktop launcher and web entry point.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- `cargo fmt --all -- --check`: PASS. `git diff --check`: PASS (Git emitted only LF/CRLF conversion warnings). `git status --short -- legacy`: empty.
- No legacy/localStorage or production certificate records were imported or modified. Browser/native interaction, visual/responsive parity, Windows/macOS runtime, external certificate-issuer verification and export/recertification workflows remain unverified or unimplemented; no issuer validation, report export or funding success is claimed.

## HR uniform requests — latest full workspace verification (2026-10-08)

- `cargo test --workspace --locked`: PASS — 55 backend + 101 shared UI/API tests (156 total). Uniform HTTP coverage verifies ADMIN-only access, actual HR profile lookup and server-derived employee snapshot, item/quantity validation, persisted request create/list, generated request code/date, actor/time on handover, one-time handover conflict, USER denial and generic collection read/write bypass blocking. UI tests verify that create payloads contain only employee code and request fields, reject invalid size/quantity, and decode unknown legacy JSON fields.
- `cargo build --workspace --locked`: PASS — Linux server, shared desktop UI, desktop launcher and web entry point.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- `cargo fmt --all -- --check`: PASS. After the documentation update, `git diff --check`: PASS (only Git LF/CRLF conversion warnings); `git status --short -- legacy`: empty.
- No legacy/localStorage or production uniform records were imported or modified. Browser/native interaction, Windows/macOS runtime, real inventory/stock, receiver signature/acknowledgment, localStorage import and visual parity remain open; no stock availability or employee receipt is claimed.

## HR onboarding — latest full workspace verification (2026-10-08)

- `cargo test --workspace --locked`: PASS — 56 backend + 104 shared UI/API tests (160 total). Onboarding HTTP coverage verifies ADMIN-only access, employee/mentor identity lookup, server-derived identity/phone, exact +60-day calculation, duplicate unfinished record conflict, invalid/missing references, persistence, no fabricated checklist/provisioning/contract flags, and generic collection read/write bypass blocking. UI tests cover client-owned input fields, validation and decoding legacy rows with unknown fields.
- `cargo build --workspace --locked`: PASS — Linux server, shared desktop UI, desktop launcher and web entry point.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS. `cargo fmt --all -- --check`: PASS.
- The follow-up recruitment change also reran the complete workspace tests/build/Wasm/formatter checks; final `git diff --check` and `git status --short -- legacy` are recorded in the recruitment evidence below.
- No legacy/localStorage or production onboarding records were imported or modified. Persisted checklist/provisioning/probation/contract workflow, browser/native interaction, Windows/macOS runtime and visual parity remain unverified or unimplemented; the view does not claim these actions occurred.

## HR recruitment — full workspace verification (2026-10-08)

- `cargo test --workspace --locked`: PASS — 58 backend + 107 shared UI/API tests (165 total). Recruitment HTTP coverage verifies ADMIN-only list/create, validation of level/headcount/deadline, case-insensitive unique job codes, persisted list/create, server-owned identity/status, omission of untrusted pipeline counters and generic collection read/write bypass rejection. UI tests cover supported create payload fields, validation and legacy closed-status filtering.
- `cargo build --workspace --locked`: PASS — Linux server, shared desktop UI, desktop launcher and web entry point.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS. `cargo fmt --all -- --check`: PASS.
- Final `git diff --check`: PASS (Git emitted only LF/CRLF conversion warnings). `git status --short -- legacy`: empty.
- No legacy/localStorage or production recruitment records were imported or modified. Candidate pipeline, opening status transitions, job publishing/export, directory-backed selectors, browser/native interaction, Windows/macOS runtime and visual parity remain open; no candidate totals or recruiting outcomes are claimed.

## HR headcount — full workspace verification (2026-10-08)

- `cargo test --workspace --locked`: PASS — 60 backend + 109 shared UI/API tests (169 total). Headcount HTTP coverage verifies ADMIN-only access, generic GET/POST bypass rejection, persisted create/list, server-generated key/creator, staffing derived from active HR profiles (excluding retired and activation-pending accounts), Unicode case-insensitive department/position matching, ignored client-supplied actual/status, case-insensitive position-code uniqueness and quota/budget validation. UI tests cover planning-only payload ownership and invalid inputs.
- `cargo build --workspace --locked`: PASS — Linux server, shared desktop UI, desktop launcher and web entry point.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS. `cargo fmt --all -- --check`: PASS.
- `git diff --check`: PASS (only Git LF/CRLF conversion warnings). `git status --short -- legacy`: empty.
- No legacy/localStorage or production headcount records were imported or modified. Approval/versioning, edit lifecycle, department/position catalog parity, browser/native runtime and visual parity remain open; budget is not claimed as approved.
- No legacy/localStorage or production headcount records were imported or modified. Approval/versioning, edit lifecycle, department/position catalog parity, browser/native runtime and visual parity are open; the UI does not claim the plan is approved.

## HR rewards — full workspace verification (2026-10-08)

- `cargo test --workspace --locked`: PASS — 63 backend + 113 shared UI/API tests (176 total). Rewards HTTP coverage verifies ADMIN-only access, generic collection bypass rejection, active-profile identity linkage, inactive employee rejection, unique reward and decision IDs, field/date validation, persistence, ordered one-time transitions, append-only event-backed actor/time, and rejection of spoofed legacy audit fields/award bypass. UI tests verify employee/team input ownership, form validation and unverified legacy status presentation.
- `cargo build --workspace --locked`: PASS — Linux server, shared desktop UI, desktop launcher and web entry point.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS. `cargo fmt --all -- --check`: PASS.
- `git diff --check`: PASS (Git may report LF/CRLF conversion warnings). `git status --short -- legacy`: empty.
- No legacy/localStorage or production reward records were imported or modified. Separate approver roles, signed documents, payment/receipt evidence, historical review/import, event retention policy, browser/native interaction, Windows/macOS runtime and visual parity remain open; no eNPS, fund total, digital signature, payment or employee receipt is claimed.

## HR performance reviews — full workspace verification (2026-10-08)

- `cargo test --workspace --locked`: PASS — 66 backend + 116 shared UI/API tests (182 total). HTTP coverage verifies ADMIN-only access, generic collection bypass blocking, canonical active-employee linkage, ignored client identity/evaluator/status/grade/pillar/audit fields, inactive employee rejection, duplicate codes, score/bonus validation, server grade boundaries, append-only create/approval events, one-time approval and refusal to trust or approve legacy JSON claims. UI tests cover input ownership, validation and unverified legacy status.
- `cargo build --workspace --locked`: PASS — Linux server, shared desktop UI, desktop launcher and web entry point.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS. `cargo fmt --all -- --check`: PASS.
- `git diff --check`: PASS (Git may report LF/CRLF conversion warnings). `git status --short -- legacy`: empty.
- No legacy/localStorage or production performance-review records were imported or modified. Scoring-policy approval, legacy review adoption, payroll/payment integration, report artifact, browser/native end-to-end, Windows/macOS runtime and visual parity remain open; no bonus payment, promotion decision or 360-pillar measurement is claimed.

## HR employee history — focused source-to-target verification (2026-10-08)

- Focused Docker Rust 1.89 run: backend tests PASS (2); shared UI tests PASS (2). Backend verifies ADMIN boundary, HR code-to-profile binding, server-owned recorder identity/time, persistence, append-only delete protection, unknown employee/type/date, whitespace-only value and pending-profile rejection. UI verifies category route mapping and ISO date/empty-value handling.
- Full workspace tests, Linux build, Wasm check, formatter, final `git diff --check` and `legacy/` status are recorded after this slice is included in the latest verification below.
- No legacy/localStorage or production HR history/bank/eKYC data was imported. General legacy history entries were not persisted by the source module. Bank API/data protection, eKYC verification provider, browser/native end-to-end and visual/platform parity remain open.

## HR employee bank-account API — focused security and UI verification (2026-10-08)

- Focused Docker Rust 1.89 tests PASS: 5 backend tests for owner scoping/encryption/generic bypass, HR role and active-profile linkage, approve/reject/retire lifecycle and append-only audit, missing-key fail-closed behavior, and employee-profile redaction/rejection; 2 shared UI tests cover masking/status presentation and form identity ownership. The dedicated crypto test verifies bank envelopes are domain-separated and plaintext fallback is rejected.
- Employee profile API coverage also confirms bank fields are stripped from nested profile details and new plaintext bank-field writes are rejected. The existing phone-update test now sends a phone-only payload; it remains independent from that rejection contract.
- No legacy generic bank rows or profile plaintext were imported, modified or deleted. Import/reconciliation, production key provisioning, eKYC provider/evidence, browser/native end-to-end and visual/platform parity remain open.

## Workspace verification after HR employee bank-account API (2026-10-08)

- `cargo test --workspace --locked`: PASS — 74 backend + 121 shared UI/API tests (195 total).
- `cargo build --workspace --locked`: PASS — Linux server, shared desktop UI, desktop launcher and web entry point.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS. `cargo fmt --all -- --check`: PASS.
- Bank-specific coverage includes typed owner/ADMIN boundaries, canonical active employee linkage, encrypted fields, key-failure behavior, primary-account replacement, one-time transitions, append-only events, generic bypass rejection and employee profile redaction.
- Final `git diff --check`: PASS (Git reports only LF/CRLF conversion warnings); `git status --short -- legacy`: empty.
- This does not verify Trunk bundling/browser interaction or Windows/macOS/Linux GUI runtime.

## HR employee bank legacy importer — focused verification (2026-10-08)

- `cargo test --workspace --locked employee_bank_import`: PASS — 4 backend tests. They verify ADMIN-only access, summary-only/PII-free read-only preview, profile-code resolution, duplicate/unmatched quarantine, encrypted archival, pending/non-primary reset, atomic profile-bank-field cleanup, stale-hash and exact-confirmation rejection, missing-key fail-closed behavior and re-export idempotency.
- `cargo test --workspace --locked legacy_employee_bank_import_contract`: PASS — shared UI/API DTO contract contains only import counts and hashes, not account values.
- `node --check tools/export_legacy_employee_bank_accounts.js`: PASS. Node VM fixture: PASS — reads only the allowlisted localStorage key, performs no writes, emits parseable JSON and preserves duplicate source IDs with stable export IDs.
- The exporter fixture uses synthetic rows only. No browser localStorage, production database, secret key or real employee bank data was read or imported.

## Latest workspace verification after HR employee bank importer (2026-10-08)

- `cargo test --workspace --locked`: PASS — 78 backend + 122 shared UI/API tests (200 total).
- `cargo build --workspace --locked`: PASS — Linux server, shared desktop UI, desktop launcher and web entry point.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS. `cargo fmt --all -- --check`: PASS.
- `node --check` and synthetic read-only exporter fixture: PASS. `git diff --check`: verified after docs update; `git status --short -- legacy`: verified after docs update.
- No production import or UI runtime/browser test was run. Quarantine adoption, production key setup, live-data backup/restore, Trunk/browser interaction and Windows/macOS/Linux GUI runtime remain open.

## HR employee bank quarantine review/adoption — focused verification (2026-10-08)

- `cargo test -p kiyo-server --locked employee_bank_import`: PASS — 6 backend tests. Coverage includes ADMIN-only access, masked account values, malformed short-number redaction, wrong action phrase rejection, canonical active-employee mapping, duplicate-adoption conflict, pending account creation, dismissal, one-time resolution, encrypted reasons and append-only database triggers.
- `cargo test -p kiyo-ui --locked legacy_employee_bank_quarantine_contract`: PASS — typed paged/masked list and adopt/dismiss response DTOs decode as expected. The final full workspace run also includes this contract test.
- Full verification in Docker `rust:1.89-bookworm`: `cargo fmt --all -- --check` PASS; `cargo test --workspace --locked` PASS — 80 backend + 123 shared UI/API tests (203 total); `cargo build --workspace --locked` PASS; `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked` PASS; final formatter check PASS.
- This is fixture/API evidence only. No browser localStorage, production database or production secret key was accessed; no production migration/adoption, disposable-copy backup/restore, Trunk/browser run or native GUI/platform runtime was verified.

## CRM legacy operations importer — verification (2026-10-08)

- `cargo test --workspace --locked crm_legacy_import`: PASS — 3 backend HTTP tests for ADMIN-only access, key fail-closed, PII-free/read-only preview, exact confirmation and stale digest rejection, atomic persistence, recalculated supplier score/tier, encrypted feedback phone/raw provenance, reset resolution claims, idempotent re-export and changed-payload conflict.
- `cargo test --workspace --locked legacy_crm_import_contract`: PASS — shared UI/API preview/result DTO contains summary counts and hashes only.
- `node --check tools/export_legacy_crm_operations.js`: PASS. Synthetic Node VM fixture PASS — exporter reads exactly the two allowlisted keys, produces a download, performs no localStorage writes, and emits no PII in console metadata.
- Full verification in Docker `rust:1.89-bookworm`: `cargo test --workspace --locked` PASS — 83 backend + 124 shared UI/API tests (207 total) at that checkpoint; `cargo build --workspace --locked` PASS; `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked` PASS; `cargo fmt --all -- --check` PASS. The later CRM contacts SQLite importer verification below supersedes this count.
- `git diff --check`: PASS (Git reports only existing working-copy LF/CRLF normalization warnings); `git status --short -- legacy`: empty. No browser localStorage, production database/key, real customer data, live import, Trunk/browser UI or native GUI runtime was accessed or verified.

## CRM contacts SQLite importer — verification (2026-10-08)

- `cargo test --workspace --locked`: PASS — 84 backend + 125 shared UI/API tests. New HTTP coverage verifies ADMIN-only access, key fail-closed, summary-only/non-mutating preview, exact confirmation, stale-digest rejection, encrypted target PII and provenance, source ID/code/timestamp preservation, authenticated creator mapping, unverified API status, exact re-export idempotency, changed-source conflict and all-or-nothing target-conflict rejection.
- `cargo build --workspace --locked`: PASS — Linux workspace including server, desktop and web entry point. `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS. `cargo fmt --all -- --check`: PASS.
- `node --check tools/export_legacy_crm_contacts.mjs`: PASS. Synthetic SQLite exporter fixture PASS — source file hash unchanged, ciphertext copied unchanged, sensitive row values absent from exporter logs, and existing output is refused without modification.
- `git diff --check`: PASS (only Git LF/CRLF normalization warnings); `git status --short -- legacy`: empty. No real database/key/data was read or imported. Browser/native runtime, provisioned-key restart, disposable-copy backup/restore and operator rehearsal remain open.

## Helpdesk tickets — typed API/UI and workspace verification (2026-10-08)

- Focused backend and shared UI tests pass for ticket authorization, server-owned identifiers/status/creator, persistent list/create/update, allowed transitions, append-only event history, generic collection write rejection and form payload validation.
- `cargo fmt --all` and `cargo fmt --all -- --check`: PASS. `cargo test --workspace --locked`: PASS — 86 backend + 127 shared UI/API tests (213 total).
- `cargo build --workspace --locked`: PASS — Linux workspace. `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- `git diff --check`: PASS; Git reports LF/CRLF normalization warnings only. `git status --short -- legacy`: empty.
- No historical ticket localStorage/collection rows, production DB or secrets were accessed or imported. Trunk bundling/browser interaction, native GUI runtime on Windows/macOS/Linux, ticket-history import and any incident workflow remain unverified/open.

## Helpdesk ticket history importer — verification (2026-10-08)

- `cargo test -p kiyo-server --locked helpdesk_ticket_import`: PASS — 4 backend tests cover ADMIN-only access, summary-only/non-mutating preview, exact confirmation, stale digest, source identity/code/status/date preservation, authenticated importer attribution, unverified labeling, exact re-export idempotency, changed-payload conflict and all-or-nothing collision rejection.
- UI/API contract tests verify summary-only preview/result DTOs and optional imported/unverified ticket status. Full `cargo test --workspace --locked`: PASS — 90 backend + 128 shared UI/API tests (218 total).
- `node --check tools/export_legacy_helpdesk_tickets.js`: PASS. `node tools/test_export_legacy_helpdesk_tickets.mjs`: PASS — synthetic VM fixture reads exactly the allowlisted cache key, preserves payload, performs no storage writes and emits no ticket-row contents in logs.
- `cargo fmt --all -- --check`, `cargo build --workspace --locked` (Linux) and `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS. `git diff --check`: PASS; `git status --short -- legacy`: empty.
- No real browser cache, production database or ticket data was read/imported. Actual operator preview/apply, backup/restore, Trunk/browser interaction, Windows/macOS/Linux GUI runtime and legacy incidents remain open.

## Helpdesk incident lifecycle — verification (2026-10-08)

- `cargo test -p kiyo-server --locked helpdesk_incident`: PASS — 2 backend tests cover input validation/client-state rejection, ADMIN boundary, typed create/list/detail/resolve, persistence, required resolution note, one-time transition, append-only events and generic legacy write denial.
- `cargo test -p kiyo-ui --locked helpdesk_incident`: PASS — 3 UI/API tests cover DTO wire contracts, supported-only create fields, resolution-note serialization and truthful server-owned statuses.
- `cargo fmt --all -- --check`: PASS. `cargo test --workspace --locked`: PASS — 92 backend + 131 shared UI/API tests (223 total).
- `cargo build --workspace --locked`: PASS — Linux workspace. `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- No legacy incident cache or production data was read/imported. Incident history export/import, Trunk/browser interaction, native GUI runtime on Windows/macOS/Linux and visual parity remain open. `legacy/` remains unchanged.

## Helpdesk incident history importer — verification (2026-10-08)

- `cargo test -p kiyo-server --locked helpdesk_incident_import`: PASS — 5 tests cover normalization/unsupported fields, ADMIN-only summary preview/no mutation/PII-free result, exact confirmation and stale digest, source identity/code/date preservation, active/unverified state reset, append-only import event, actor attribution, source cache row retention, idempotent re-export, changed-payload and duplicate-code conflict, and no partial writes.
- `cargo test -p kiyo-ui --locked helpdesk_incident`: PASS — 6 incident UI/API tests cover lifecycle DTOs and payloads, import summary/result DTO, JSON object/size validation, and incident status/form behavior.
- `node --check tools/export_legacy_helpdesk_incidents.js`: PASS. `node tools/test_export_legacy_helpdesk_incidents.mjs`: PASS — synthetic VM fixture confirms exactly one allowlisted localStorage read, unchanged stored data/no writes, bundle contents, duplicate/empty rejection and no incident-row values in logs.
- Full Docker `rust:1.89-bookworm` verification: `cargo fmt --all -- --check`: PASS; `cargo test --workspace --locked`: PASS — 97 backend + 134 shared UI/API tests (231 total); `cargo build --workspace --locked`: PASS — Linux workspace; `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- No real browser cache/incident or production database was read/imported. Preview/apply was exercised only against synthetic in-memory SQLite fixtures. Trunk/browser interaction, Windows/macOS/Linux native runtime, visual parity and an authorized disposable-copy backup/restore rehearsal remain open. `legacy/` was not changed.

## Files ACL acceptance — verification (2026-10-08)

- Source audit of `legacy/api/index.mjs`, `legacy/web/src/api/endpoints.ts`, `legacy/web/src/modules/files/CloudDriveModule.tsx`, and `legacy/web/src/pages/Files.tsx` found soft-delete but no restore/recovery route or user control. Recovery is therefore not an omitted legacy feature and no Rust restore UX was invented.
- Added `file_delete_enforces_protection_owner_and_empty_folder_rules`: protected system folder deletion is forbidden; non-empty folder deletion is rejected; cross-employee deletion returns 404; empty folder deletion sets `deleted_at` while retaining the database node; and ADMIN cannot create a child directly under the global root. Existing tests cover upload/download/replacement/share ownership, employee workspace boundaries, protected rename, and deleted-file/share denial.
- `cargo fmt --all -- --check`: PASS. `cargo test --workspace --locked`: PASS — 98 backend + 138 shared UI/API tests (236 total), including case-insensitive file-name/MIME/kind search, all sort modes, current-folder multi-selection/protected-item handling and honest partial bulk-delete failure reporting. Linux workspace build and `wasm32-unknown-unknown` check: PASS.
- The full run initially exposed a probabilistic bank-import test assertion that searched encrypted ciphertext for the substring `MB`; it now checks that storage differs from plaintext and decrypts to the exact source bank name. The focused test and subsequent full suite pass.
- Browser multi-select/bulk-delete/share/replacement interaction, route-by-route ACL review, restart persistence, native file-dialog runtime, responsive behavior and full visual parity remain open. No legacy data was touched; `legacy/` remains read-only.

## WASM clock fix and Files browser verification (2026-10-08)

- First Chromium interaction uncovered a WASM runtime panic on `std::time::Instant::now()` (`time not implemented on this platform`), despite the target check passing. Replaced shared UI monotonic-clock imports with `web_time::Instant` and added the direct `web-time` dependency. This covers the app auth refresh plus view refresh/debounce timers.
- Rebuilt the release canvas with Trunk and served it from an isolated Docker backend on `127.0.0.1:39997`, using a disposable SQLite DB and storage directory. Synthetic ADMIN/employee accounts and three synthetic folders were created only in that container.
- Chromium verified login, Files list, selecting three unprotected folders, confirmation listing the exact three names, all three `DELETE /api/v1/files/{id}` responses returning 200, success notice, and the protected `System` folder remaining. No browser JavaScript errors or failed HTTP responses were observed.
- A second isolated run verified the share manager creates a public link, the anonymous `/files/share?token=...` canvas displays the shared file and download returns the exact original bytes, UI token rotation invalidates the old URL (404), and UI disable revokes the active URL (404). The public text-file fallback rendered as designed; image/video previews were not exercised.
- Chromium's WASM file chooser accepted an in-memory synthetic replacement fixture; the confirmation dialog displayed filename/MIME/size, the content PUT returned 200, and a subsequent authenticated download matched the exact 27-byte replacement. No browser JavaScript errors were observed.
- Restarted the same isolated server/container; employee login and API listing persisted and returned only `System`. The test container (including its temporary DB/storage) was removed afterward. No existing local server, production data, or `legacy/` source was touched.
- After the fix: `cargo fmt --all -- --check`, `cargo test --workspace --locked` (98 backend + 138 UI/API tests), `cargo build --workspace --locked` (Linux), `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`, and `trunk build --release`: PASS. Complete route-by-route ACL audit, native GUI/file-dialog, cross-platform runtime and visual/responsive parity remain open.

## Documents/editor API and shared UI slice (2026-10-08)

- Added document schema installation and authenticated route handlers for CRUD metadata, document snapshots/operations/history, comments, share/member listing, presence and server-sent events. Operations are size-bounded and transaction-ID idempotent; ACL roles are enforced at the API boundary.
- Replaced the sample-only document panel with API-backed list/create/open/save in shared egui. Basic paragraphs, headings and bullets round-trip to the legacy snapshot format. Unsupported rich content is deliberately read-only pending a full Rust editor port.
- `cargo test --workspace --locked`: PASS — 101 backend + 141 UI/API tests. New tests cover viewer/editor/commenter boundaries, comments, duplicate operation IDs, concurrent revision allocation, atomic metadata/snapshot rollback and persistence, collaboration DTOs, legacy block conversion and unsupported-content protection.
- `cargo check --workspace --locked`: PASS; `cargo build --workspace --locked` (Linux): PASS; `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS; `cargo fmt --all -- --check`: PASS; `trunk build --release`: PASS.
- Linux full build after this change, Trunk bundle/browser interaction, native GUI, editor persistence/reload after server restart and full visual/feature parity remain unverified. Legacy source and data were not modified or imported.
- Additional disposable HTTP smoke on 2026-10-08: launched the current Linux backend binary in an isolated Docker container with a read-only build-volume mount, ephemeral container-layer SQLite/storage, synthetic bootstrap credentials and a separate loopback port. PASS — health, admin login, document create/list/open, atomic title+snapshot update, persisted JSON snapshot round-trip, comment create/list, history and member listing. The container and ephemeral data were removed afterward; the pre-existing server and workspace data were not touched. This validates the API over HTTP, not browser/native editor interaction or legacy visual/feature parity.

## Documents/editor revision-history follow-up — 2026-10-08

- Fixed the snapshot-history contract: `PATCH /api/v1/documents/{id}` now requires `expectedRevision` when a snapshot is submitted, returns 409 for stale edits, and atomically advances the document revision and inserts a new snapshot. Snapshot JSON receives the committed revision. Metadata-only changes remain possible without incrementing the content revision.
- Added the shared egui history list with current-version marker and refresh after open/create/save; history is informational only. The legacy history dialog has no functioning restore action, so none was invented. The editor still protects unsupported rich content as read-only.
- Regression tests cover missing/stale revision rejection, preserved old snapshot, version increment, atomic rollback and API request/response wire names. `cargo fmt --all -- --check`: PASS; `cargo test --workspace --locked`: PASS — 102 backend + 142 shared UI/API tests; `cargo build --workspace --locked` (Linux): PASS; `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- Disposable HTTP smoke: PASS — synthetic admin login, create/list/open, revision 1→2 save with JSON round-trip, stale save returns HTTP 409 without changing title/revision, comments, two-version history and members. Container/ephemeral DB removed afterward; pre-existing server and project data untouched.
- `trunk build --release`, browser/native editor interaction and restart persistence were not rerun for this UI follow-up. Linux/macOS native runtime and complete editor parity remain unverified; `legacy/` remained unchanged.

## Chat API and shared UI slice — 2026-10-08

- Added authenticated Rust chat endpoints backed by SQLite: default channels, channel/directory listing, private/group DM creation, messages with stable cursor pagination, same-channel replies, reactions and read markers. Locked announcement posting is ADMIN-only; private conversation membership is enforced for list/read/write operations.
- Replaced sample-only egui chat with API-backed channels/messages, directory-based DM picker, text send, older-message paging, replies and reaction toggles. Voice/attachment/realtime features are explicitly marked unavailable; legacy socket code was a no-op mock, and browser-local message history was not imported.
- `cargo fmt --all -- --check`: PASS. `cargo test --workspace --locked`: PASS — 105 backend + 145 UI/API tests; includes same-timestamp pagination regression and channel/message/reply/reaction/read/DM authorization/persistence checks. `cargo build --workspace --locked` (Linux) and `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- No browser/native visual or two-client realtime test was performed. Legacy source and localStorage data were not changed or imported; attachment storage, voice signaling, push/reconnect, custom channel administration and local history migration remain open.
# Finance cash vouchers — 2026-10-08

- `cargo fmt --all -- --check`: PASS.
- `cargo test --workspace --locked`: PASS — 107 backend + 151 shared UI/API tests. New backend coverage verifies the cash transaction HTTP contract, ADMIN boundary, generated voucher identity, source filtering, soft cancellation, persistence and dashboard aggregates; UI/API tests verify legacy wire fields and server-owned code; view tests cover route scope, filters, validation and account-switch cache clearing.
- `cargo build --workspace --locked`: PASS in Linux Docker (`rust:1.89-bookworm`).
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- Dashboard monthly revenue/expense now reflect completed persisted cash vouchers; audit logs remain unavailable. No browser/native interaction or visual comparison was run for this slice. No production database or legacy data was imported; `legacy/` was not changed.

## Cash flow overview — 2026-10-08

- `cargo fmt --all -- --check`: PASS.
- `cargo test --workspace --locked`: PASS — 107 backend + 154 shared UI/API tests. New cash-flow tests verify completed-only totals, separate pending counts, canceled-record exclusion, category aggregation, voucher counts, net values, legacy absolute-net ordering and stable equal-total category order.
- `cargo build --workspace --locked`: PASS in Linux Docker (`rust:1.89-bookworm`).
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS; `trunk build --release`: PASS.
- Isolated HTTP E2E smoke on port 41000 with a disposable container SQLite database: root HTML and generated JS/Wasm assets returned HTTP 200; ADMIN login succeeded; income (1,234,500 VND), expense (234,500 VND) and pending (50,000 VND) vouchers were created and listed with server-generated codes/status; dashboard returned matching monthly revenue/expense and `financialMetricsAvailable=true`. Test container was stopped afterward and port 41000 was confirmed free.
- This was an HTTP/static-asset smoke, not browser execution of the egui/WASM canvas; visual/native interaction remains unverified. No production or legacy data was imported; `legacy/` was not changed.

## Finance bank accounts and bank ledger — 2026-10-09

- `cargo fmt --all -- --check`: PASS.
- `cargo test --workspace --locked`: PASS — 112 backend + 159 shared UI/API tests. Backend HTTP coverage verifies ADMIN-only GET/POST, compatible camelCase DTO, encryption at rest, decrypt/list round-trip, duplicate plaintext rejection, numeric bounds, legacy empty/default and numeric-string validation, and fail-closed create without a key. A static account-number envelope generated through the legacy Node crypto module with a synthetic test key decrypts in Rust; Rust-generated finance envelopes round-trip and contain no plaintext. UI/API tests cover wire fields, form bounds, route mapping and completed-only account-grouped ledger summaries.
- `cargo build --workspace --locked`: PASS in Linux Docker (`rust:1.89-bookworm`). `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- From `web/`, `trunk build --release`: PASS with Trunk 0.21.14; the shared egui/WASM UI optimized and produced the release bundle.
- At this earlier checkpoint, account balance display distinguished declared opening balances and internal-book voucher movement from a bank-confirmed balance; bank transaction search/paging was data-backed. Statement import/reconciliation, actual e-banking providers and atomic internal transfer had not yet been implemented. The following transfer checkpoint supersedes only the transfer status.
- This was compile/test/bundle verification, not a browser interaction or native desktop run. No legacy account rows, live database, or production encryption key were read/imported; `legacy/` remained unchanged. Deployment key provisioning, account-screen visual comparison and Windows/macOS/Linux GUI runtime remain open.

## Finance internal transfer — 2026-10-09

- `cargo fmt --all -- --check`: PASS.
- `cargo test --workspace --locked`: PASS — 114 backend + 161 shared UI/API tests. New Axum/SQLite tests verify ADMIN-only access, paired `Chi`/`Thu` legacy fields and labels, one link row, same-key retry returning the original pair, changed-payload key conflict, and USER denial. A trigger deliberately aborts the credit insert; the HTTP request fails and both voucher and transfer tables remain empty. UI/API tests cover response decoding, idempotency payload names, route mapping and form validation.
- `cargo build --workspace --locked`: PASS in Linux Docker (`rust:1.89-bookworm`). `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- From `web/`, `trunk build --release`: PASS with Trunk 0.21.14; the updated shared canvas compiles into the release bundle.
- These are automated server/DTO/form and build checks, not browser interaction or native GUI execution. No live bank balance is checked; `opening_balance` is declared input only. No legacy or production records/keys were read or imported, and `legacy/` remained unchanged. UI/runtime parity and production-key rehearsal remain open.

## Employee payslips owner-scoped read — 2026-10-09

- `cargo fmt --all -- --check`: PASS.
- `cargo test -p kiyo-server -p kiyo-ui --locked`: PASS — 128 backend + 169 shared UI/API tests. A focused `cargo test -p kiyo-server employee_payslips --locked -- --nocapture` selection also passed all 4 matching tests, including the HTTP owner-scope/generic-bypass integration test.
- `cargo build --workspace --locked`: PASS in Linux Docker (`rust:1.89-bookworm`); `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS.
- Backend coverage verifies exact immutable owner binding, rejects conflicting or absent owner IDs, omits signature/bank/unknown fields, does not coerce invalid payroll amounts to zero, enforces USER-only access and active employee profile, blocks generic collection access, validates pagination, and searches Unicode text. Shared API/UI coverage verifies DTO decoding, real API task wiring, account-switch clearing and missing-amount handling.
- `trunk build --release`, browser/native interaction and visual parity were not run. No production payroll data, real signature/export or legacy import was performed. `legacy/` remained unchanged.

## Audit events and dashboard — 2026-10-09

- `cargo fmt --all -- --check`: PASS.
- `cargo test -p kiyo-server -p kiyo-ui --locked`: PASS — 124 backend + 166 UI/API tests. Coverage includes ADMIN-only audit listing, authenticated event intake, bounded filter/body validation, sensitive-key redaction, append-only SQL triggers, atomic event rollback, compatibility/idempotence against the legacy audit schema, retention of the legacy actor snapshot when its `ON DELETE SET NULL` foreign key is exercised, dashboard recent events, DTO decoding and UI account-state reset. After the foreign-key trigger adjustment, `cargo test -p kiyo-server --locked` was rerun and all 124 backend tests passed.
- `cargo build --workspace --locked`: PASS in Docker `rust:1.89-bookworm`, rerun after the foreign-key adjustment; artifacts used a temporary target mounted on C: because E: had less than 1 GiB free.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS, rerun on the same final source. No Trunk release bundle was built for this slice.
- No browser/native interaction, visual comparison, production DB import or retention-policy review was performed. Existing legacy event rows were tested only in a synthetic compatible SQLite fixture; `legacy/` remained unchanged.

## Finance legacy SQLite import — 2026-10-09

- `cargo fmt --all -- --check`: PASS.
- `cargo test --workspace --locked`: PASS in Docker `rust:1.89-bookworm` — 120 backend + 163 shared UI/API tests. Finance importer tests cover ADMIN-only preview/apply, summary-only preview, key-required fail-closed behavior, preserved source values with encrypted account number, stable re-export idempotency, strict IDs/date/status validation, stale target-digest rejection and all-or-nothing rollback. UI/API tests cover the finance preview/result wire contract and bundle limit.
- `node --test tools/test_export_legacy_finance.mjs`: PASS — 4/4 synthetic SQLite tests for the allowlist, bank/petty cash rows, read-only source counts, plaintext warning/no-overwrite, unsupported schema and invalid source ID.
- `git diff --check`: PASS; `git status --short -- legacy` returned no changes. No production or legacy data/key was used.
- `cargo build --workspace --locked` was started in Linux Docker but interrupted after the mounted E: volume reported 100% usage with approximately 802 MiB free; no build success is claimed. No files were deleted. A fresh Wasm target check, Trunk bundle and browser/native UI interaction were not run in this checkpoint.

## Attendance shift catalog optimistic concurrency — 2026-10-09

- `cargo fmt --all -- --check`: PASS.
- `cargo test -p kiyo-server -p kiyo-ui --locked --quiet`: PASS — 128 backend + 169 shared UI/API tests. Focused `cargo test -p kiyo-server attendance_shift_collection_is_admin_only_validated_and_persistent --locked -- --nocapture`: PASS.
- HTTP coverage verifies empty GET revision, expected-revision save, missing revision rejection, stale second write returning 409 without clobbering, admin/user boundaries, invalid/duplicate records, unreadable legacy JSON failing closed and a stale snapshot preserving the raw corrupt row. The list and fingerprint are read within one SQLite transaction snapshot. API contract tests verify revision decoding and camelCase `expectedRevision` serialization.
- `cargo build --workspace --locked`: PASS in Linux Docker (`rust:1.89-bookworm`); `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked`: PASS. `git diff --check`: PASS; `git status --short -- legacy` and `git diff --name-only -- legacy` returned no changes.
- No browser/native interaction, visual comparison or historical import was performed. Legacy source remains read-only.

## Admin generic leave-request HR identity — 2026-10-09

- Replaced free-text employee/department creation with an HR employee picker searchable by name, code and department. UI selection filters out inactive, retired, ADMIN and incomplete profiles; department is displayed from HR as read-only.
- Backend PUT/POST resolves new `employeeId` rows from an active, non-retired HR profile and overwrites client-supplied name/code/department. Immediate transactions keep identity resolution and persistence atomic. Linked row snapshots cannot be changed. Existing unlinked legacy rows cannot be attached or have their identity edited, but status can still be reviewed; aliases and unknown fields remain in the JSON record.
- Added backend coverage for missing employee ID, server-derived snapshot despite forged client values, immutable linked and unlinked identity, and status updates that preserve legacy aliases. UI/API tests cover employee eligibility/search and `employeeId`/`employeeCode` serialization while preserving old rows that lack those fields.
- `cargo fmt --all -- --check`: PASS. `cargo test -p kiyo-server -p kiyo-ui --locked --quiet`: PASS — 128 backend + 172 shared UI/API tests. Linux `cargo build --workspace --locked` PASS before the final collapsed-section/theme adjustments; final `cargo check --workspace --locked` and `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked` PASS after them.
- New generic POST can now send only `employeeId` plus leave details; the server fills identity and the integration test confirms canonical response. The ADMIN self-service collection was moved into a collapsed section to remove the duplicate full-page header/buttons shown in the screenshot while preserving the workflow. The light egui palette now follows the legacy web's white/light-gray/teal colors.
- Trunk bundle and browser interaction for the new picker/collapsed section are still pending. The prior revision's concurrency browser smoke is not evidence for these visual changes. No production/legacy data was used; `legacy/` remains read-only.

## Admin leave-management route/layout correction — 2026-10-09

- `cargo test -p kiyo-ui --locked --quiet`: PASS — 172 tests; `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --quiet`: PASS; `cargo fmt --all -- --check`: PASS; `git diff --check`: PASS.
- `trunk build --release --locked`: PASS with Trunk 0.21.14, output directed to a separate temporary directory rather than `web/dist`.
- Isolated current-source Axum server on `127.0.0.1:40110`, disposable SQLite DB, synthetic ADMIN only: `/api/v1/health`, SPA HTML, generated JS, and generated Wasm returned HTTP 200; login returned role ADMIN; `GET /api/v1/collections/leave_requests` returned an empty collection with a revision. The preview container was stopped after the check; the pre-existing service on port 39994 was untouched.
- Browser pixel/interaction verification was not completed: Windows CUA and Node REPL both failed initialization with `failed to write kernel assets`. The earlier Chromium screenshot predates this route/layout correction and is not evidence for the new appearance. Native GUI and additional viewport coverage remain open.
- `git status --short -- legacy` was empty; no production or legacy data was used.

## Responsive canvas follow-up — 2026-10-09

- `cargo fmt --all -- --check`: PASS; `cargo test -p kiyo-ui --locked --quiet`: PASS — 173 tests, including compact-layout breakpoint coverage.
- `trunk build --release --locked`: PASS with Trunk 0.21.14; artifacts went to the disposable preview directory, not `web/dist`.
- Headless Edge, isolated preview backend on `127.0.0.1:40110`, synthetic ADMIN and disposable SQLite: at 390×844, login → dashboard → admin leave route worked; at 1280×800, login → admin leave route worked. Login, session introspection, notifications, dashboard, employees and leave collection requests returned HTTP 200. No page errors/JavaScript exceptions.
- Visual review found and then verified the mobile leave status filters and search on separate, non-overlapping rows, and the dashboard's lower panels stacked at mobile width. Screenshots: `mobile-dashboard-final.png`, `mobile-leave-final.png`, `admin-leave-final.png` in `C:\Users\sonng\AppData\Local\Temp\kiyo-ui-preview-20261009`.
- This is targeted responsive evidence, not a claim of 100% pixel parity. Remaining routes/states, 1440×900, native GUI and full legacy screenshot comparison remain open. `git status --short -- legacy` remained empty; no production/legacy data was used.

## Employee profile contact address — 2026-10-09

- `cargo fmt --all -- --check`: PASS. `cargo test -p kiyo-server -p kiyo-ui --locked --quiet`: PASS — 128 backend tests and 174 UI/API tests. Backend HTTP regression coverage verifies self-scope, trimming/persistence after a fresh GET, rejects a 513-byte address without mutating the stored address, and confirms self-updates still cannot change HR-owned department, position, status, join date or salary. UI/API tests verify phone/address validation and exact camelCase response/request fields.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --quiet`: PASS; `cargo build -p kiyo-server --locked --quiet`: PASS; `trunk build --release --locked`: PASS with Trunk 0.21.14.
- Isolated current-source Axum preview on `127.0.0.1:40110`, disposable SQLite DB, synthetic ADMIN and synthetic employee profile only. Headless Edge at 1280×800 performed login → employee portal → `/employee/profile` → edit address → save → reload. `GET /employees/me`, `PATCH /employees/me`, and subsequent `GET /employees/me` returned HTTP 200; the saved address was visible after reload. No JavaScript exceptions occurred. Screenshot: `employee-profile-address-saved.png` in the local temporary preview directory.
- No production data was used; `legacy/` remained unchanged. Full personnel/onboarding wizard, avatar upload/storage, native GUI, broader routes/viewport visual parity and deployment/runtime persistence remain open.

## Workflow overview — partial source-backed aggregation — 2026-10-09

- `cargo fmt --all -- --check`: PASS.
- `cargo test -p kiyo-ui --locked --quiet`: PASS — 179 tests. New coverage validates the generic `workflows` DTO retains unknown legacy fields, the overview maps only supported fields, known source-specific statuses count correctly, paused/unknown statuses are not mislabeled as rejected, and navigation targets point to actual migrated modules.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --quiet`: PASS against the updated shared UI and collection API task.
- `git diff --check`: PASS. `git diff --name-only -- legacy` is empty. `git status --short -- legacy` reports untracked `legacy/api/package-lock.json` and `legacy/web/package-lock.json`; both were preserved and not edited by this slice.
- No Trunk bundle, route-specific browser interaction/screenshot, native GUI test, contract data or LocalStorage cache migration was performed. This is compile/test evidence for a partial screen only, not complete overview parity.

## Contracts — read-only summary slice — 2026-10-09

- `cargo fmt --all -- --check`: PASS.
- `cargo test -p kiyo-server --locked --quiet`: PASS — 130 backend tests. Contract HTTP coverage verifies unauthenticated denial, ADMIN-wide list, USER exact-owner and unowned exact-code access, denial of name-only and conflicting-owner fallbacks, 404 concealment for foreign detail, sensitive-field omission, `signatureVerificationStatus: unverified`, and generic collection read/write denial.
- `cargo test -p kiyo-ui --locked --quiet`: PASS — 182 shared UI/API tests, including legacy camelCase DTO decoding, category labels, safe contract overview mapping and navigation.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --quiet`: PASS.
- No Trunk bundle, browser interaction/screenshot, native GUI test, restart test or real legacy data import was performed. The existing service on `127.0.0.1:39994` was not restarted. `legacy/` source was not edited; existing untracked `package-lock.json` files were preserved.

## Contracts — authorized full-detail projection — 2026-10-09

- `cargo fmt --all -- --check`: PASS.
- `cargo test -p kiyo-server -p kiyo-ui --locked --quiet`: PASS — 131 backend + 183 UI/API tests. Contract HTTP tests verify full detail for ADMIN and exact linked owner, summary-only detail for unowned exact-code matches, 404 concealment for foreign/name-only/conflicting-owner rows, and HTTP 503 with no plaintext leak when the decryption key is absent. The UI/API test decodes full-detail optional fields.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --quiet`: PASS.
- No Trunk bundle, route browser screenshot/interaction, native GUI test, restart test or real legacy data import was performed. `legacy/` remained unchanged; existing untracked lockfiles and legacy edits were preserved.

## Windows desktop and web preview — 2026-10-09

- `cargo build -p kiyo-admin-desktop -p kiyo-server --locked`: PASS on Windows MSVC with Rust 1.89.0. The task-scoped build output is `C:\Users\sonng\AppData\Local\Temp\kiyovn-validation-20261009\target-windows\debug`.
- The new `kiyo-admin-desktop.exe` launched and stayed responsive with the expected native window title. The paired newly built backend started against an isolated temporary SQLite DB on `127.0.0.1:3001`.
- HTTP smoke: `/api/v1/health`, `/`, the JS and WASM files referenced by the existing bundle, synthetic ADMIN login, and `/api/v1/dashboard/stats` all returned HTTP 200. Dashboard `totalUsers=0`. Test credentials are `admin@kiyo.local` / `KiyoTest-2026-Admin!`.
- **Not a current-source web bundle:** `web/dist` is dated 2026-10-08. Trunk `0.21.14` and lockfile-matching `wasm-bindgen 0.2.129` were SHA-256 verified, but a fresh Trunk build failed with OS error 112 (C: disk full) during `web-sys` compilation. Incomplete task-scoped WASM outputs were cleaned; the Windows app/server were rebuilt and are intact. Current-source `cargo check` for WASM had passed separately, but no current Trunk packaging or browser canvas interaction is proven.
- Native window is available for manual test; automated UI/canvas interaction did not run because CUA kernel initialization failed. No production data was used and `legacy/` was not edited.

## Contracts — ADMIN CRUD HTTP API — 2026-10-09

- Docker `rust:1.89-bookworm`: `cargo test -p kiyo-server -p kiyo-ui --locked --quiet`: PASS — 132 backend tests and 183 UI/API tests. Rust formatting checks passed for `server/src/contracts.rs` and `server/src/main.rs` using edition 2024.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --quiet`: PASS; this confirms compilation, not a fresh Trunk bundle or browser interaction.
- HTTP coverage verifies non-ADMIN denial, invalid attempt to mark a contract active, ADMIN create, generated code, unsigned/unverified defaults, PII encryption at rest and authorized decryption, update persistence, and soft-archive hiding from list/detail.
- The open Windows preview was not restarted, so it does not contain this API change. No current-source Trunk bundle, UI CRUD, browser/native interaction, generated document, or PKI signature verification is claimed. `legacy/` source was not modified.

## Contracts — shared ADMIN form and Windows desktop build — 2026-10-09

- `cargo test -p kiyo-server -p kiyo-ui --locked --quiet`: PASS — 132 backend + 186 UI/API tests. New shared-view tests cover all writable form serialization, signer name/position, omission of signature/certificate/file claims, malformed numeric/custom JSON input, custom category labels, and edit-action gating for historical active/expired records.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --quiet`: PASS against the updated shared form and API client.
- Edition-2024 formatting checks passed for `server/src/contracts.rs`, `server/src/main.rs`, `ui/src/api.rs`, and `ui/src/views/contracts.rs`.
- Windows MSVC `cargo build -p kiyo-admin-desktop --locked`: PASS. Current executable: `C:\Users\sonng\AppData\Local\Temp\kiyovn-validation-20261009\target-windows\debug\kiyo-admin-desktop.exe` (28,835,840 bytes at build time).
- Runtime limitation: the existing test backend process holds the old `kiyo-server.exe` open, so it was not replaced. The rebuilt desktop is not yet paired with live CRUD routes; browser/native UI interaction and current-source Trunk packaging remain unverified. No production data was used; `legacy/` was not edited.

## Current-source web + desktop preview — 2026-10-09 (supersedes preview limitation above)

- `trunk build --locked`: PASS with Trunk 0.21.14 and Rust 1.89.0; built the current `web/` and shared `kiyo-ui` source. The task-scoped Cargo target was placed on C: with dev debug symbols/incremental output disabled after E: ran out of space. Generated `web/dist/kiyo-web-wasm-69c946a918bfe9b7_bg.wasm` (31,301,586 bytes), JS and HTML at 09:08 local time.
- Rebuilt Windows desktop remains open and responsive (PID 55624); a convenient copy is `build/KIYOVN-Enterprise-test.exe` (28,835,840 bytes). The executable copy is an ignored build artifact.
- Current Axum server serves the newly built bundle and API together on `127.0.0.1:3101`, using a fresh disposable SQLite DB under the task-scoped C: temp directory. HTTP checks passed for API health, SPA HTML, generated JS, generated WASM (`application/wasm`), and `/activate-account` SPA fallback. Synthetic ADMIN login returned role `ADMIN` with an access token; secrets are generated per process and are not recorded here.
- Browser canvas was opened in the Codex panel for user testing. This is an HTTP/build smoke test, not a claimed visual-parity or manual click-through result. The native window is open; native login interaction remains for the user to test. No production data was used; this task did not modify `legacy/`.

## Documents — preserve/edit formatted runs — 2026-10-09

- `cargo test -p kiyo-ui --locked --quiet`: PASS — 189 tests. New regressions verify editing a bold run while retaining run/block IDs, other marks, paragraph/list styles, document settings, unknown source fields and immutability of the loaded snapshot; appending a paragraph/heading/list item or run; and fail-closed behavior for tables, images, malformed runs and unsupported block structures.
- `trunk build --locked`: PASS for current shared UI/WASM source. Current bundle in `web/dist` returned HTTP 200 for the canvas HTML, hashed JS and hashed WASM (`application/wasm`) from the live isolated backend. `cargo check -p kiyo-admin-desktop --locked --quiet`: PASS after this shared UI change.
- Runtime HTTP smoke created a rich document, saved an edited snapshot at expected revision 1, then read revision 2 back with bold marks, numbered-list structure and unknown metadata preserved. The synthetic record remains in the temporary test DB for manual preview.
- Limitation: no automated canvas click-through or screenshot was run for the new editor. Native `cargo check` passes and a fresh executable artifact is available at `build/KIYOVN-Enterprise-editor-test.exe`; Cargo could not replace the top-level output because the already-running preview process holds it open. The current window is still the previous build, and launching/testing the new copy remains pending. Tables/images and remaining formatting/editor tools stay on the migration backlog. `legacy/` was not modified.

## Asset inventory — revisioned `asset_items` collection — 2026-10-09

- `cargo test -p kiyo-server -p kiyo-ui --locked --quiet`: PASS — 133 backend + 197 shared UI/API tests.
- Backend HTTP integration coverage against the Axum router and in-memory SQLite verifies authenticated USER list access, ADMIN full-list replacement, missing revision rejection, persistent re-read, unknown legacy JSON preservation, stale revision HTTP 409, USER write HTTP 403, and duplicate-key rejection.
- Shared UI/API tests verify camelCase field decoding, nullable legacy text, missing-key fallback through legacy ID/code, unknown-property round-trip, revisioned replacement payload, required name/code, integer/VN-grouped money parsing, net book value and preservation of legacy row identity/unknown metadata when editing.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --quiet`: PASS. `cargo check -p kiyo-admin-desktop --locked --quiet`: PASS. `cargo fmt --all -- --check`: PASS. `git diff --check -- . ':!legacy'`: PASS.
- No current Trunk bundle or browser/native click-through was run; this is compile and router-integration evidence, not runtime visual acceptance. Browser-local legacy rows and other asset modules remain unmigrated. No production data was used; the slice did not edit `legacy/` and preserved pre-existing changes there.

## Asset allocations and returns — employee acknowledgment and warehouse receipt — 2026-10-09

- `cargo test -p kiyo-server --locked --offline --quiet`: PASS — 134/134. The latest run used the E: workspace target and placed Rust temporary files on E: because C: was full.
- Previously verified for this source slice: `cargo test -p kiyo-ui --locked --quiet`: PASS — 203/203; `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --quiet`: PASS; `trunk build --locked`: PASS, output at `build/asset-allocation-web-preview`.
- Backend HTTP integration coverage verifies revisioned ADMIN collection access, employee own-scope filtering, foreign-record 404, rejection of ADMIN self-acknowledgment, account acknowledgment without setting legacy signature flags, one-time state transitions, ADMIN-only warehouse receipt, and audit-event persistence.
- `cargo rustc -p kiyo-server --bin kiyo-server-asset-allocation-test --locked --offline -- -C debuginfo=0`: PASS. The temporary bin alias was removed from `server/Cargo.toml` after linking. The binary at `target/debug/kiyo-server-asset-allocation-test.exe` now serves the current bundle and API together on `127.0.0.1:3013`, using isolated `build/asset-allocation-test-data-20261009/kiyovn.sqlite` and file storage.
- Live HTTP smoke on 3013: health, SPA HTML, generated JS and WASM (`application/wasm`) returned 200; synthetic ADMIN login succeeded; revisioned `asset_allocations` replacement persisted two synthetic return rows; ADMIN receipt PATCH changed one to `Đã thu hồi về kho`, recorded `Kiyo Administrator`, and a fresh GET confirmed `signedByReceiver=false`. One separate `Chờ xác nhận thu hồi` row remains for manual browser testing. The older 3001/3011 processes still return 404 on these newly added routes.
- A fresh native executable was not linked because E: again ran short of space; the available native preview predates this slice. The browser panel was opened at 3013, but no visual/click-through pass is claimed (the computer-use helper failed to initialize). Safe browser-local history import, restart persistence and visual parity remain open. No real or production data was used; `legacy/` source was not changed.
- `legacy/` source and real/production data were not modified or used. Safe browser-local history import, restart persistence, UI click-through, visual parity and remaining asset modules remain open.

## Asset transfers — tested lifecycle slice — 2026-10-09

- `cargo test -p kiyo-server -p kiyo-ui --locked --offline --quiet`: PASS — 138 backend + 205 shared UI/API tests. Coverage includes role denial, generic-write bypass denial, transfer code uniqueness, actor attribution, state transitions, rejection reason, receipt metadata, persistence/revision, and UI money-input/no-fabricated-values behavior.
- `cargo fmt --all -- --check`: PASS. `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --quiet`: PASS. `cargo check -p kiyo-admin-desktop --locked --offline --quiet`: PASS. `cargo build -p kiyo-admin-desktop --locked --offline --quiet`: PASS. Trunk 0.21.14 build PASS to `build/asset-transfer-web-preview`.
- Fresh desktop app: `build/KIYOVN-Enterprise-asset-transfer-test.exe`. Test server executable: `build/KIYOVN-Enterprise-asset-transfer-server-test.exe`. Server is running at `http://127.0.0.1:3014/` with isolated synthetic SQLite/file storage under `build/asset-transfer-runtime-20261009`. Test login: `admin@kiyo.local` / `AssetTransferAdmin-2026!Local`; desktop API endpoint: `http://127.0.0.1:3014/api/v1`.
- HTTP smoke PASS: health, SPA, generated JS and WASM returned 200 (WASM content type `application/wasm`); ADMIN login; revision-bearing list; create; approve; receive; reject; final GET returned both expected rows with a 64-character revision. Approval/receipt actor is `Kiyo Administrator`; receipt metadata does not claim the destination custodian identity was authenticated. Synthetic records are retained for manual preview.
- Browser canvas click-through, visual/responsive parity, native UI interaction and restart persistence remain **unverified**. The Computer Use runtime failed to initialize kernel assets; this is not treated as a visual pass. No real legacy or production data was used; `legacy/` source was not changed.

## Leave-request route/UI verification — 2026-10-09 (Windows, current workspace)

- Direct toolchain `cargo check -p kiyo-ui --lib --locked --offline`: PASS (Rust 1.89, Windows MSVC).
- Direct toolchain `cargo test -p kiyo-ui --lib --locked --offline`: PASS — 209/209 unit tests.
- Source audit: legacy `/admin/attendance/requests/list` resolves to `LeaveRequestsModule`; legacy `/employee/leaves` resolves to `EmployeeLeavesModule`. Rust `app.rs` dispatches those paths to the admin and employee-self-service views separately. This verifies route separation, not pixel parity.
- `legacy/` was not edited during this turn; pre-existing changes under `legacy/` were preserved. Current desktop EXE and `web/dist` still predate these UI edits. Fresh Trunk/native builds and visual/browser/native interaction were not run. Computer Use and node-repl initialization both failed with `failed to write kernel assets` (OS error 3); no screenshot or visual pass is claimed.
- E: had 1.40 GiB free after the check/tests; C: remains full. No production data was accessed.

## Admin leave-request UI parity follow-up — 2026-10-09 (Windows, current workspace)

- Read-only source comparison confirms legacy `/admin/attendance/requests/list` resolves to `LeaveRequestsModule`, while `/employee/leaves` resolves to `EmployeeLeavesModule`; Rust `app.rs` dispatches these routes separately.
- Corrected the Rust admin leave screen source to keep all six legacy table headers visible when empty, use the legacy table-style empty state, align the toolbar/card geometry, and move employee-availability feedback into the create dialog so it no longer shifts the initial page. Legacy files were not edited.
- `cargo test -p kiyo-ui --lib --locked --offline`: PASS — 210/210, including a regression test for the legacy leave-table headers/empty text. `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --quiet`: PASS.
- The running preview at `127.0.0.1:3217` still returns HTTP 200 but serves the previous bundle; the preview EXEs also predate these UI edits. No current Trunk bundle, screenshot comparison or native GUI click-through is claimed. Pixel parity, responsive viewports, export, verified leave balances, restart persistence and cross-platform native GUI acceptance remain open.
- E: had 0.92 GiB free after the WASM check. Production data was not accessed; existing working-tree changes, including pre-existing changes under `legacy/`, were preserved.

## Leave-request current-source browser comparison — supersedes the preceding preview note — 2026-10-09

- Current `cargo test -p kiyo-ui --lib --locked --offline --jobs 1 --quiet`: PASS, 210/210. Current Trunk `build --locked`: PASS.
- Headless Edge at 1280×800 exercised synthetic ADMIN login and `/admin/attendance/requests/list` on `127.0.0.1:3218`; auth, introspection, notifications, dashboard, leave collection and employee-list requests returned HTTP 200, no JavaScript exceptions occurred, and document scroll width remained 1280.
- Compared the current Rust screenshot against the actual legacy Vite preview at `127.0.0.1:3220`, same viewport. Dashboard and open drawer were also captured at 768×900; the leave route was not tested at that width. Artifacts are in `build/kiyovn-leave-parity-runtime-20261009/`.
- The admin leave view now follows legacy KPI defaults/captions, geometry, empty table and pagination more closely. Visual parity is still incomplete (including sidebar icon glyphs and typography); native GUI, fresh desktop executable, export, employee route, restart persistence and remaining routes are not verified. `legacy/` was not modified.

## Compact mobile header source/build verification — 2026-10-09

- Read-only legacy source check: `App.tsx` uses a 48px header; CSS hides `.kiyovn-user-name` on mobile and the user trigger uses a 28px icon. Rust compact layout now omits the username and desktop separator and sizes the avatar to 28px.
- `cargo test -p kiyo-ui --lib --locked --offline --jobs 1 --quiet`: PASS (211/211). `trunk build --locked --dist ..\build\kiyovn-mobile-header-preview-20261009`: PASS. `cargo check -p kiyo-admin-desktop --locked --offline --jobs 1 --quiet`: PASS with the C: scratch target.
- This is not browser visual evidence: the existing preview at 3218 rejected the available test login with HTTP 401. No existing preview database was changed, and the newly built bundle has not been served. The isolated server launch was blocked by local execution policy. The running desktop executable also predates this source change. Legacy source remains read-only.

## Header notification popover source/render verification — 2026-10-09

- The Rust header bell now toggles an API-backed popover rather than routing directly. The panel supports empty/loading/error display, bounded scroll, legacy notification-type tile colors, unread badge, mark-one-read, role-allowlisted link navigation, outside-click close and the full-view footer.
- `cargo test -p kiyo-ui --lib --locked --offline --jobs 1 --quiet`: PASS, 214/214; the added egui context test rendered one populated notification at 390×844 and verified the panel rect. Trunk dev bundle at `build/kiyovn-notification-popover-preview-20261009`: PASS. Windows desktop `cargo check`: PASS. `rustfmt --check` for `notifications.rs` and `git diff --check` pass.
- Browser/WASM pixel comparison and click-through are still unverified; the currently running preview's available test login returned HTTP 401, and a separate server launch was blocked by local execution policy. The new bundle is not live on a preview. No existing database or legacy source was modified.

## Current workspace verification and previews — 2026-10-09 (Windows MSVC)

- Using the repository's Rust 1.89 toolchain, locked dependencies and offline mode with the build target on the C: scratch volume: `cargo test --workspace --locked --offline --jobs 1 --quiet` PASS — 142 backend tests and 214 shared UI/API tests; no failures.
- `cargo fmt --all -- --check` PASS after applying workspace rustfmt. `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --jobs 1 --quiet` PASS.
- Current-source Trunk dev bundle PASS at `build/kiyovn-current-source-preview-20261009/` (`index.html`, JS and WASM). Windows desktop debug build PASS; copied artifact: `build/KIYOVN-Enterprise-current-preview-20261009.exe`.
- These are build/test results, not a UI acceptance pass. The bundle was not served and the desktop app was not launched in this checkpoint; browser/native click-through, screenshot comparison, pixel parity, restart persistence and production-data migration remain unverified. `legacy/` was not edited in this checkpoint.

## Compact mobile drawer geometry correction — 2026-10-09

- Read-only legacy CSS audit found `.kiyovn-sidebar-mobile-open` is 260px at widths ≤768px (the final CSS override) and 270px at 769–992px (the inline width), fixed to the viewport's top-left edge. The Rust titleless `egui::Window` used window chrome/placement behavior rather than that overlay geometry. It is now a foreground egui `Area` with a fixed screen-origin rectangle, the matching breakpoint-specific width (clamped only on narrower screens), 48px brand row, neutral fill/border, and a rightward 24px blur shadow. Navigation contents and routing are unchanged.
- Final current-source verification: `cargo test --workspace --locked --offline --jobs 1 --quiet` PASS — 142 backend + 216 shared UI/API tests; `cargo fmt --all -- --check` PASS; WASM target check PASS; Windows desktop build PASS; Trunk dev bundle PASS. An egui context render test checks the actual overlay bounds at 390, 768, 769 and 992px.
- Latest artifacts are `build/KIYOVN-Enterprise-mobile-drawer-preview-20261009.exe` and `build/kiyovn-mobile-drawer-preview-20261009/`. Neither was launched/served for this correction, so its pixel alignment and click-through remain unverified. No 100% parity claim is made; `legacy/` was not edited.

## Navigation icon fidelity — 2026-10-09 (Windows MSVC)

- Read-only comparison of `legacy/web/src/data/menuData.tsx` and `MobileBottomNav.tsx` showed that the shared shell uses Ant Design SVGs for the admin roots, employee roots and mobile shortcuts. Added 25 static, tintable SVG assets generated from the installed `@ant-design/icons-svg@4.6.0` package; the generator version/license-checks its input, the MIT text is included, and no runtime dependency on the legacy package was added.
- Replaced Rust's hand-drawn approximations in active navigation rendering with the matching SVG assets. `egui_extras::image::load_svg_bytes` rasterizes each icon once and `KiyoApp` caches its texture. Tests check all SVGs rasterize to visible 64×64 pixels and verify each admin/employee root mapping against the legacy menu order.
- `cargo fmt --all -- --check`: PASS. `node tools/generate_navigation_icons.mjs --check`: PASS. `cargo test --workspace --locked --offline --jobs 1 --quiet`: PASS — 142 backend + 219 shared UI/API tests. `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --jobs 1 --quiet`: PASS. Windows `cargo build -p kiyo-admin-desktop --locked --offline --jobs 1 --quiet`: PASS. Trunk 0.21.14 build: PASS.
- Current artifacts: `build/kiyovn-navigation-icons-preview-20261009/` (WASM magic `00-61-73-6D`, 35,935,214 bytes) and `build/KIYOVN-Enterprise-navigation-icons-preview-20261009.exe` (PE `MZ`, 32,943,616 bytes).
- This validates source icon identity, compilation and packaging, not screenshot or pixel parity. The bundle was not served, the EXE was not launched, and route interaction/native behavior remains unverified. Full UI parity is still open; `legacy/` was not edited in this slice.

## Login-screen canvas comparison and interaction — 2026-10-09 (Windows MSVC)

- Read-only comparison used `legacy/web/src/pages/Login.tsx`, the legacy Vite app at `127.0.0.1:3220`, and the current shared egui/WebAssembly login. Legacy DOM measurement at 1280×800: card 360×445.5px at (460,177.25), control width 286px; same card at 390×844 was centered at x=15. Rust layout was adjusted to those dimensions and CSS gaps; UserOutlined/LockOutlined are tinted to legacy gray.
- `cargo test --workspace --locked --offline --jobs 1 --quiet`: PASS — 142 backend + 221 shared UI/API tests. `cargo fmt --all -- --check`, `node tools/generate_navigation_icons.mjs --check`, and `git diff --check`: PASS. `cargo build -p kiyo-admin-desktop --locked --offline --jobs 1 --quiet`: PASS. Trunk 0.21.14 build PASS.
- Browser preview at `http://127.0.0.1:3226/`: HTML and Wasm loaded (Wasm HTTP 200, `application/wasm`); 1280×800 and 390×844 canvases rendered with no Rust JS/page errors. Headless Chromium typed synthetic `preview-user` into the canvas and clicked empty submit; required-field validation appeared and no login request was sent. The legacy Vite screenshots are valid UI references, though that page logged a refused request to its unavailable local API. Screenshots: `build/kiyovn-login-parity-pixel-aligned-evidence-20261009/{rust-1280,legacy-1280,rust-390,legacy-390,rust-input-interaction,rust-empty-submit}.png`.
- Fresh Windows desktop artifact: `build/KIYOVN-Enterprise-login-parity-pixel-aligned-20261009.exe` (32,981,504 bytes; SHA-256 `13633CCC2D489C60DB6EFF35F20387F77ACF555B74C597A15C3D543636DE23CD`). The app launches and reports a responsive native window; native login click-through is not claimed.
- Visual placement and assets are close to the legacy reference, but canvas font rasterization/antialiasing and a few control edges are not pixel-identical, so this does not satisfy the requested 100% UI parity by itself. The legacy `/auth/google` path accepts unsigned identity data; Rust intentionally shows a safe “not configured” error instead of recreating that authentication vulnerability. Secure provider setup and full parity remain open. No `legacy/` files were edited in this turn.

## Dashboard content/API slice — 2026-10-09 (Windows MSVC)

- Added typed `DashboardPendingWorkflow` decoding for the existing camelCase dashboard API response, including optional `amount`; tests assert the legacy pending-row fields survive deserialization.
- Rebuilt the shared dashboard around the legacy operational banner, four clickable KPI cards, conditional approval feed, seven exact legacy quick-action labels/destinations, recent audit list/empty state, money formatting and the 992px responsive breakpoint. Source references: `legacy/web/src/pages/dashboard/DashboardPage.tsx` and `legacy/web/src/api/endpoints.ts`; legacy files were not edited by this slice.
- `cargo test -p kiyo-ui --locked --offline --jobs 1 --quiet`: PASS — 226 tests. Rust formatting check for the touched Rust files: PASS. `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --jobs 1 --quiet`: PASS. `cargo check -p kiyo-admin-desktop --locked --offline --jobs 1 --quiet`: PASS. Trunk build PASS; fresh distribution is `build/kiyovn-dashboard-parity-20261009/`.
- Disposable local Axum preview at `127.0.0.1:3229` serves that distribution and an isolated SQLite DB. HTTP smoke: health 200, SPA route fallback 200, JS 200 (`text/javascript`), Wasm 200 (`application/wasm`, 36,725,006 bytes), ADMIN login 200, legacy-shaped profile 200, introspection 200, dashboard stats 200. Stats had zero employees/pending/revenue/audit rows; no production data was used. The preview server remains running for manual testing.
- No same-viewport dashboard screenshot or rendered click-through was captured. The computer-use runtime failed to initialize; legacy visual source comparison and build/API smoke are not substitutes for screenshot acceptance. Native executable was not rebuilt/launched for this slice. 100% route/UI/API/data migration remains incomplete.

## Auth profile envelope compatibility — 2026-10-09 (Windows MSVC)

- Read-only legacy contract: `legacy/web/src/context/AuthContext.tsx` extracts a profile only from `payload.user`, `payload.profile`, or `payload.data`; the API client passes `response.data`. A bare JSON user therefore fails stored-session validation. Rust `/api/v1/auth/profile` now returns `{ "user": <authenticated user> }`.
- Regression coverage: `cargo test -p kiyo-server --locked --offline --jobs 1 --quiet` PASS — 143 tests; the new test issues an authenticated profile request and asserts the nested user fields and absence of a bare top-level id. `rustfmt --check --edition 2024 --config skip_children=true server/src/main.rs`: PASS.
- Built a unique preview binary using a temporary Cargo target alias, then removed the alias from `server/Cargo.toml`. HTTP on isolated port 3229 verified login → profile envelope → introspection → dashboard stats, plus SPA fallback. The alias is not left in the manifest; existing unrelated running servers were not restarted.

## Workflow settings screen/API slice — 2026-10-09 (Windows MSVC)

- Ported the three `/admin/workflows/settings` tabs to the shared egui view. Budget tiers load from the legacy generic collection through a typed Rust client DTO; adding/editing tiers and delegations remains in-memory and the security save remains toast-only, matching the source behavior. No scheduler, real CA provider, Slack delivery or durable policy writes were added.
- The Rust collection read for `workflow_settings` now requires ADMIN. Router regression coverage confirms ADMIN gets 200 and an ordinary employee gets 403. DTO tests cover legacy camelCase, the exact `requirePKI` wire key and unknown fields; view tests cover edit preservation, validation, delegation defaults, account switching and route-state cleanup. In WebAssembly, `kiyovn_cache_workflow_settings` is parsed read-only and used only if the server returns an empty collection; malformed cache data safely yields no rows. There is no automatic upload, overwrite, or native local-cache equivalent.
- `cargo test --workspace --locked --offline --jobs 1`: PASS — 143 backend + 233 shared UI/API tests; desktop and Wasm host test targets and doctests also complete (0 additional tests). Separate `cargo check -p kiyo-admin-desktop --locked --offline --jobs 1` and `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --jobs 1`: PASS.
- `cargo fmt --all -- --check` and `git diff --check`: PASS (Git printed only existing LF/CRLF normalization warnings).
- `cargo build -p kiyo-admin-desktop --bin kiyo-admin-desktop-workflow-tags-preview --locked --offline --jobs 1`: PASS — generated `target/debug/kiyo-admin-desktop-workflow-tags-preview.exe` (33,205,248 bytes). The temporary Cargo bin alias was removed afterward; the already-running `kiyo-admin-desktop.exe` was not overwritten or stopped. The new EXE has not yet been opened for visual/native interaction testing.
- The workflow-settings table now uses the legacy Ant Design Tag preset background/border/text palette and 5px radius for PKI, status and notification labels; unit tests pin the colors. Exact Ant icon glyph rendering remains open.
- Current Trunk debug bundle PASS at `build/kiyovn-workflow-settings-tag-parity-dev-20261009/` (36,930,792-byte WASM artifact). The previous release attempt still fails during `wasm-opt` archive extraction with `unexpected end of file` on both attempts, so no optimized release bundle is claimed. No live HTTP/browser server was started for this slice.
- Legacy-versus-Rust screenshot comparison, native click-through, and full settings persistence/import remain unverified. `legacy/` was not edited by this slice; this is not a 100% UI-parity or migration-completion claim.

## Asset inventory — browser-local legacy import — 2026-10-09 (Windows MSVC)

- Added a read-only exporter for only `kiyovn_cache_asset_items` and a scoped ADMIN importer at `/api/v1/legacy-import/asset-items/{preview,apply}`. The envelope and record keys are validated; unknown record fields are preserved. Preview returns counts and a SHA-256 plan token only. Apply requires an exact phrase, rechecks both source bundle and target collection revision inside an immediate transaction, appends only missing keys, counts identical records as already present, blocks any conflicting key without partial writes, and records a summary-only audit row. No browser localStorage or real asset data was read or imported.
- Backend integration tests: 4/4 passed, covering envelope/key validation, ADMIN-only summary preview without writes or row contents, append-only apply/preservation/idempotent identical re-export, and conflict/stale-plan rejection. UI/API tests cover summary DTO and JSON file-size/object validation.
- `cargo test --workspace --locked --offline --jobs 1 --quiet`: PASS — 147 backend + 235 shared UI/API tests. `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --jobs 1 --quiet`: PASS. `cargo check -p kiyo-admin-desktop --locked --offline --jobs 1 --quiet`: PASS. `trunk build --locked --dist build/kiyovn-asset-items-import-preview`: PASS; bundle contains a 37,099,324-byte WASM file.
- Fresh Windows desktop artifact: `build/KIYOVN-Enterprise-asset-items-import-test.exe` (33,304,064 bytes, SHA-256 `99634D2868EBB4932CEFCA1EBCD3D4978AC575ABE880CAA5D266D47714248C74`). It was built under a unique temporary Cargo bin alias; the alias was removed and the existing desktop executable was not overwritten.
- Still unverified: HTTP/browser deployment smoke for this new bundle, native/browser click-through, restart persistence, visual comparison against legacy at matched sizes, and exact 100% UI parity. The exporter fixture used synthetic data only; `legacy/` source and production data were not modified.
- Local server launch for HTTP/browser smoke was blocked by the environment policy before process start; no synthetic runtime database/process was created. The Computer Use kernel also failed to initialize, so no screenshot or click-through was captured.

## Asset allocation history exporter/importer — 2026-10-09 (Windows MSVC)

- Source audit: `legacy/web/src/modules/assets/AssetAllocationModule.tsx` calls `collectionsApi.get('asset_allocations', { limit: 500 })`; the legacy API exposes paginated ADMIN GET over server-side `collection_records`. No `asset_allocations` localStorage cache is used by this screen.
- Exporter `tools/export_legacy_asset_allocations.js`: synthetic fixture PASS. Confirms two-page export, same-origin `GET /api/v1/collections/asset_allocations`, bearer token sent only in the request header, no localStorage writes, no token/row contents in console, and fail-closed behavior for missing token, 403, empty collection, duplicate key, and inconsistent page length. `tools/test_export_legacy_asset_items.mjs` also PASS.
- Backend adds `/api/v1/legacy-import/asset-allocations/preview` and `/apply`. Four integration tests PASS: envelope/key validation; ADMIN-only summary-only preview with no writes or PII; exact-record append-only import preserving legacy signature/status claims without certifying them; and conflict/stale revision blocking without partial insert/audit. Existing identical rows count as already imported; changed rows at the same key conflict.
- UI/API adds typed preview/result DTOs, API client tasks, a separate ADMIN migration screen with aggregate claim counts and exact confirmation, JSON size/type validation, and account-state cleanup. The screen identifies legacy signature and warehouse status as unverified; no record contents are shown in preview.
- `cargo test --workspace --locked --offline --jobs 1 --quiet`: PASS — 151 backend + 237 shared UI/API tests. `cargo fmt --all -- --check`: PASS. `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --jobs 1 --quiet`: PASS. `cargo check -p kiyo-admin-desktop --locked --offline --jobs 1 --quiet`: PASS. Both asset exporter fixtures PASS.
- `trunk build --locked --dist ..\build\kiyovn-asset-allocations-import-preview` from `web/`: PASS; bundle contains `kiyo-web-wasm-7a27930c0f3dd20d_bg.wasm` (37,244,792 bytes), JS and `index.html`.
- Fresh distinct Windows artifact: `build/KIYOVN-Enterprise-asset-allocations-import-test.exe` (33,404,416 bytes; SHA-256 `90D69342AAFD0DCA7A7E8CD2D7302CAD91A05281B0D805E25738AD8F0116CA38`). Built through a temporary bin alias that was removed afterward; existing `target/debug/kiyo-admin-desktop.exe` was not overwritten. The new executable was not launched.
- No live legacy API/session or production data was used. This bundle was not served with its matching backend; HTTP/browser smoke, employee/admin canvas click-through, native click-through, restart persistence and matched-size legacy screenshots remain unverified. `legacy/` was not edited in this slice. This does not prove complete migration or 100% visual parity.

## Asset transfer history exporter/importer — 2026-10-09 (Windows MSVC)

- Source contract: `AssetTransferModule.tsx` uses `dataService.getGenericData('asset_transfers')`. The exporter matches its source selection: same-origin ADMIN collection GET with pagination; only when server returns zero rows does it read `kiyovn_cache_asset_transfers`. It never writes to legacy, and it refuses fallback if the server request/auth fails.
- `node tools/test_export_legacy_asset_transfers.mjs`: PASS. Synthetic coverage includes server-over-cache precedence, 501-row pagination, empty-server cache fallback, empty source, duplicate keys, short page, 403/network fail-closed behavior, no localStorage writes and token/row redaction. Asset allocations and asset inventory exporter fixtures also PASS.
- Backend `/api/v1/legacy-import/asset-transfers/{preview,apply}`: five tests PASS for envelope/source/key/reserved-marker validation, ADMIN-only PII-free non-mutating preview, aggregate unverified approval/receipt counts, preservation/reporting of duplicate transfer codes, append-only legacy-field preservation, imported-marker idempotence, and conflicts/stale revision without partial writes/audit. Actor-shaped source fields (creator/approver/receipt/rejection IDs, names, methods and timestamps) remain preserved under `_kiyoLegacyImport.untrustedSourceFields`; they cannot impersonate a verified Rust event.
- Shared UI/API adds typed preview/result, ADMIN file/preview/apply screen at `/admin/system/migration/asset-transfers`, file size/object checks, confirmation and unverified-claim presentation. Transfer details label legacy approval/receipt claims separately from authenticated Rust actor events.
- Full verification on final source: `cargo test --workspace --locked --offline --jobs 1 --quiet` PASS — 156 backend and 240 shared UI/API tests. Touched-file `rustfmt --check` PASS. `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --jobs 1 --quiet` and `cargo check -p kiyo-admin-desktop --locked --offline --jobs 1 --quiet` PASS. Final Trunk build at `build/kiyovn-asset-transfers-import-preview-final-20261009/`; Wasm is 37,399,722 bytes with `00-61-73-6D` header.
- Distinct final Windows test app: `build/KIYOVN-Enterprise-asset-transfers-import-final-test.exe`, 33,387,520 bytes, SHA-256 `89557B14F4DB9CE4388DD8218C47798D592B0A06966E482AB7574EBE30030FF8`. It was built using a temporary bin alias that was removed from `desktop/Cargo.toml` afterward; no pre-existing app artifact was overwritten.
- No live legacy origin/session or real production data was used/imported. The paired new bundle/API has not been served or clicked through; restart persistence, native/browser interaction and matched-viewport screenshots are unverified. No 100% UI parity claim is made; `legacy/` was unchanged in this slice.

## Asset maintenance lifecycle and history importer — 2026-10-09 (Windows MSVC)

- Source audit: `AssetMaintenanceModule.tsx` reads `asset_maintenances` via `dataService`, with server-first/browser-cache fallback, plan/list/detail/perform flows. New legacy plans were falsely created as completed with all checklist items and health/certificate values prefilled; Rust does not treat those as real performance evidence.
- Added ADMIN-only typed `/api/v1/assets/maintenance` list/create and `/api/v1/assets/maintenance/{key}/perform`. HTTP integration verifies ADMIN boundary, no-fabrication planned state, checklist completion, server actor/time/history/audit and generic POST/PUT/PATCH/DELETE bypass rejection. Legacy-compatible generic ADMIN GET remains readable.
- Added `tools/export_legacy_asset_maintenances.js`; `node tools/test_export_legacy_asset_maintenances.mjs` PASS. Synthetic cases cover 501-row pagination, server-over-cache precedence, empty-server cache fallback, read-only storage, credential/row redaction, empty/malformed source, duplicate keys, 403 and network fail-closed behavior.
- Added ADMIN `/api/v1/legacy-import/asset-maintenances/{preview,apply}` and shared migration screen `/admin/system/migration/asset-maintenances`. Import preserves source rows and unknown fields with `_kiyoLegacyImport.verification=unverified`, counts duplicate business codes and legacy completion/certificate/checklist claims, and binds append-only apply to exact confirmation plus source/target digest inside an immediate transaction.
- Full workspace: `cargo test --workspace --locked --offline --jobs 1 --quiet` PASS — 165 backend + 247 shared UI/API tests. Final-tree `cargo check -p kiyo-admin-desktop --locked --offline --jobs 1 --quiet` and `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --jobs 1 --quiet` both PASS. A fresh Trunk bundle and native/browser UI interaction have not yet been verified for this final importer-integrated tree.
- No real legacy origin/session or production rows were used, exported or imported. Browser/native click-through, restart persistence, matched-viewport screenshots and exact 100% parity remain unverified. Existing unrelated changes under `legacy/` were preserved and not edited by this slice.

## Asset repair request/approval/completion — 2026-10-09 (Windows MSVC)

- Audited `legacy/web/src/modules/assets/AssetRepairsModule.tsx`: server collection `asset_repairs`, ADMIN list/search/status/severity filters, create, detail, quote approval and completion with actual cost/notes. Static “100% SLA” and Excel/PDF success toasts are not backed by measurements or real output files.
- Added ADMIN `/api/v1/assets/repairs` list/create and `/api/v1/assets/repairs/{key}/approve|complete`. Existing collection rows are read without rewrite; new writes validate code, required fields, enumerated values, dates and nonnegative cost. Approval/completion are conditional transactional transitions, use server actor/time fields, append audit rows, and completion includes a verified Rust event. Generic collection read remains compatible; generic writes are blocked.
- Added a shared egui screen at `/admin/assets/repairs` with legacy-shaped form/defaults, four cards, 8-row table, search/status/severity filters, detail, approval and completion dialogs. The unsupported static SLA percentage and toast-only export claims are not asserted as real results.
- New HTTP integration test verifies USER denial, legacy-row/unknown-field preservation, ADMIN create → approve → complete, verified actor event, duplicate transition conflict, generic GET compatibility, generic write rejection and three audit records. API/view contract tests also pass.
- `cargo test --workspace --locked --offline --jobs 1 --quiet`: PASS — 167 backend + 250 UI/API tests, including the native endpoint-override fallback contract. `cargo check -p kiyo-admin-desktop --locked --offline --jobs 1 --quiet` and `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --jobs 1 --quiet`: PASS. Touched Rust files were formatted with Rust 1.89 rustfmt.
- Current Trunk bundle PASS at `build/kiyovn-asset-repairs-preview-20261009/` (38,194,921-byte valid Wasm module). The distinct Windows preview EXE `target/debug/kiyo-admin-desktop-asset-repairs-preview.exe` PASS-built after adding an opt-in native `KIYO_API_ENDPOINT` override (default endpoint is unchanged), 34,120,704 bytes; SHA-256 `5F886303A48AE2B87160191F0166048A9D27725F116B940FA445E90DEC03272F`. Its temporary Cargo alias was removed and the EXE was not launched.
- Isolated current-source server on `127.0.0.1:3230` uses only `target/codex-smoke-asset-repairs-20261009/preview.sqlite`. HTTP smoke verified `/health`, SPA HTML, hashed JS/WASM and `application/wasm`; authenticated synthetic ADMIN login then create → approve → complete → list returned the expected states, actual cost and `verification=verified`. The local preview server is left running for manual testing. No real legacy rows or production data were touched.
- Browser/native visual click-through and matched legacy screenshots remain unverified. The Windows Computer Use and Node REPL kernels both failed to initialize (`failed to write kernel assets: The system cannot find the path specified`), so no screenshot was captured. No real data was exported/imported; `legacy/` source was not modified. Exact 100% visual parity remains unverified.

## Asset disposal / loss — targeted verification (2026-10-09)

- Source audited read-only: `legacy/web/src/modules/assets/AssetDisposalModule.tsx` and `dataService.ts`. The source server collection is preferred, with `kiyovn_cache_asset_disposals` as browser-cache fallback when the server list is empty.
- Added `server/src/asset_disposals.rs`: ADMIN list/create/approve, strict selection/date/money validation, server-side book/gain-loss arithmetic, duplicate code and transition checks, transactionally stored audit events, actor/time provenance, generic-write blocking and compatible generic ADMIN reads.
- Added `ui/src/api.rs` typed camelCase DTO/tasks with unknown-field retention and tests for formatted legacy money strings; shared `views/asset_disposals.rs` includes the list/search/filters, page-size-8 table, create/detail/approval UI and CSV escaping/export. The detail PDF action is openly unavailable rather than reporting fake success.
- Added `tools/export_legacy_asset_disposals.js` and its synthetic Node fixture. It validates paginated same-origin ADMIN GET data, falls back to localStorage only for an empty server collection, writes no source storage, redacts credentials/rows from logs and fails closed on malformed, duplicate, oversized or unauthorized data. No live legacy origin was opened.
- Added ADMIN-only `/api/v1/legacy-import/asset-disposals/{preview,apply}` and shared screen `/admin/system/migration/asset-disposals`. Apply is append-only and transactionally audited; it requires exact confirmation and a digest bound to the source bundle plus target revision. Unknown source fields are retained; old approval/wipe assertions and user identities are stored as unverified provenance rather than Rust events.
- HTTP test `legacy_asset_disposals_import_is_admin_only_append_only_and_replay_safe` PASS: USER denied; summary reports wipe claim/business-code duplicate; preexisting rows survive; unknown fields survive; approval fields are segregated as untrusted; replay is rejected; target revision change after preview returns conflict without importing stale rows. UI tests cover DTO, CSV escaping and saturation of extreme totals.
- Final `cargo test --workspace --locked --offline --jobs 1 --quiet`: PASS — 172 backend + 254 UI/API tests. `cargo fmt --all -- --check`, `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --jobs 1 --quiet`, `cargo check -p kiyo-admin-desktop --locked --offline --jobs 1 --quiet`, Node synthetic exporter fixture and `git diff --check`: PASS.
- Fresh WebAssembly preview: `trunk build --locked --dist ..\build\kiyovn-asset-disposals-import-preview` PASS; HTML, JS and 38,654,943-byte Wasm (valid `00-61-73-6D` magic) are in the unique dist directory. Fresh Windows test app: `build/KIYOVN-Enterprise-asset-disposals-import-test.exe` (34,466,816 bytes; SHA-256 `DBFB821595263894E3243A90747A6274912D96ADA037C61638F5C9447DBA086C`). Temporary bin aliases were removed and earlier test EXEs were not overwritten.
- Isolated manual preview server is running on loopback `http://127.0.0.1:3234`, serving that bundle and API against only `build/kiyovn-asset-disposals-runtime-20261009-a1/preview.sqlite`; `/health`, SPA HTML, JS, Wasm MIME/bytes and a synthetic ADMIN login returned successfully. Ports 3001/3011 and their existing processes were left untouched. The test database contains no imported legacy rows.
- Browser canvas/native click-through, restart persistence, paired legacy screenshots, exact visual parity and authorized real-data rehearsal remain unverified. No real legacy rows were transferred and this slice did not edit `legacy/`.

## Asset depreciation — targeted verification (2026-10-10)

- Read-only source audit: `legacy/web/src/modules/assets/AssetDepreciationModule.tsx`. Verified collection fields, 3 method labels sharing the same monthly rounding, residual-value omission, create/schedule/pause/run controls, client-only monthly state update, fake GL success claim, static department figures and toast-only Excel/PDF actions.
- Added `server/src/asset_depreciations.rs`: ADMIN list/create/toggle/run, strict input/account/method/date/life validation, existing `collection_records` persistence with unknown-field preservation, unique-period append-only run journal, transactionally updated schedule/counters and audit events. Generic writes are blocked; run response discloses `ledger=asset_depreciation_subledger` and `financeGeneralLedgerUpdated=false`.
- Added shared DTOs/API tasks and `views/asset_depreciations.rs`: KPI/search/status/method filters, page-size-8 list, org-unit choices, create form, schedule detail, pause/resume, current-month run preview and actual CSV downloads. No static departmental figures or fake PDF/Excel success is displayed.
- Backend HTTP test `asset_depreciations_preserve_legacy_rows_and_record_idempotent_monthly_runs` PASS: USER denied; unknown legacy fields preserved; ADMIN creates and toggles; current-period run records expected amount and subledger status; repeated/future period rejected; generic mutation rejected; append-only triggers and audit counts verified. Four module unit tests cover rounding, period/money validation and legacy-compatible account plus 120-month create bound.
- Added `tools/export_legacy_asset_depreciations.js`: same-origin authenticated GET with pagination/key/size checks, browser-cache fallback only when the server collection is empty, no source writes, and redacted summary logging. `tools/test_export_legacy_asset_depreciations.mjs` PASSes synthetic server-preference, fallback, read-only, redaction and fail-closed cases.
- Added ADMIN-only `/api/v1/legacy-import/asset-depreciations/preview` and `/apply` plus `views/asset_depreciations_import.rs`. HTTP test `legacy_asset_depreciations_import_is_admin_only_append_only_and_replay_safe` PASSes role denial, append-only import, unknown-field preservation, unverified history claims, duplicate asset-code reporting, replay rejection and target-revision conflict. No real data was accessed or moved.
- Imported legacy rows carry a visible `Chưa xác minh` warning and are excluded from the run estimate and monthly server write until their history is reviewed; the integration test submits a monthly run and confirms no state mutation.
- Full `cargo test --workspace --locked --offline --jobs 1 --quiet` PASS: 181 backend + 260 shared UI/API tests. WASM and Windows desktop `cargo check`, `cargo fmt --all -- --check`, `git diff --check`, and the synthetic exporter fixture PASS.
- Fresh Trunk bundle PASS at `build/kiyovn-asset-depreciations-preview-20261010/`; valid WASM `kiyo-web-wasm-c9acf54bc56add4a_bg.wasm` (39,538,120 bytes). Distinct Windows desktop artifact: `build/KIYOVN-Enterprise-asset-depreciations-import-test.exe` (35,112,448 bytes; SHA-256 `D2FDA05B5247D0FFF8881003060C7662777C165B02CB20B3F2A76CB2E9FF415C`). Current backend preview artifact: `build/KIYOVN-Enterprise-asset-depreciations-preview-server.exe` (26,327,552 bytes; SHA-256 `724FEA2080AA18708997CCB16F2C15BC0D85BFDD3DA29BC8BAEF723F34B2E990`). Temporary Cargo bin aliases were removed; previous test EXEs were not overwritten.
- Isolated preview server is running on `http://127.0.0.1:3235` (PID 51520), serving the fresh bundle and backed only by `build/kiyovn-asset-depreciations-runtime-20261010/preview.sqlite`. Health, synthetic ADMIN login, depreciation create/list, and SPA HTTP smoke PASS; one clearly labeled synthetic row is present. No legacy database/data or credentials were used.
- Current visual verification remains unproven because the Windows UI helper is unavailable in this session; browser/native click-through, restart persistence and paired screenshots were not captured. Exact 100% parity remains open. This slice did not modify `legacy/`.

## Asset materials stock-card slice — 2026-10-10

- Targeted `cargo test --workspace --locked --offline --jobs 1 asset_materials -- --nocapture` PASS at the original slice: one Axum collection integration test plus six UI/API tests. The HTTP test verifies ADMIN-only create/patch, employee-readable list persistence and preservation of unknown material/history fields. UI tests verify the legacy camelCase record shape, initial receipt, import/export stock/status rules, clamping of export quantity at zero, validation and CSV escaping/formula neutralization.
- Full `cargo test --workspace --locked --offline --jobs 1 --quiet` PASS: 182 backend + 266 shared UI/API tests.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --jobs 1` PASS; `cargo check -p kiyo-admin-desktop --locked --offline --jobs 1` PASS.
- Direct Rustfmt check on `server/src/main.rs`, `ui/src/api.rs`, `ui/src/app.rs`, `ui/src/views/mod.rs` and `ui/src/views/asset_materials.rs` PASS; `git diff --check` PASS. Rust toolchain commands used the checked-in workspace toolchain paths because Cargo is not on this shell's PATH.
- No fresh browser bundle/desktop EXE, runtime click-through, restart persistence test, real-data transfer or screenshot parity comparison was produced. The legacy directory was not modified by this slice; its pre-existing dirty paths remain untouched. Exact 100% parity is not established.

## Asset materials revision/audit follow-up — 2026-10-11

- `cargo test -p kiyo-server --locked --jobs 1 asset_material -- --nocapture` PASS: two backend HTTP tests. Confirms revision exposure, compatibility for legacy POST/PATCH without a revision, stale-write 409 with no stock mutation or extra audit, successful fresh stock update, and create/update audit metadata committed with the mutation.
- `cargo test -p kiyo-ui --locked --jobs 1 asset_materials -- --nocapture` PASS before the toast-fidelity correction: six UI/API tests. The current UI/API count is five after removing the CSV-only test and behavior.
- `cargo test --workspace --locked --jobs 1 --quiet` PASS on the current tree: 183 backend + 265 shared UI/API tests.
- Current-tree `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --jobs 1` and `cargo check -p kiyo-admin-desktop --locked --jobs 1` PASS.
- Browser/native interaction, restart persistence and matched-viewport UI comparison are still pending for this follow-up; 100% UI parity is not claimed.

## Enterprise report catalog (`reports_catalog`) — 2026-10-11

- Read-only audit: `legacy/web/src/modules/reports/ReportsModule.tsx` and `dataService.ts`. Legacy reads from a generic collection with a `kiyovn_cache_reports_catalog` localStorage fallback and writes the full list; its PDF/Excel/print actions create no files.
- Added the shared egui `/admin/reports` route and ADMIN-only generic collection read policy. New records use the existing ADMIN POST route, timestamp-only string keys and legacy camelCase fields.
- `cargo test -p kiyo-ui --lib --locked --offline --jobs 1 --quiet reports::tests`: PASS, 6 report-view tests.
- `cargo test -p kiyo-server --locked --offline --jobs 1 --quiet reports_catalog_collection_is_admin_only_and_persistent`: PASS, 1 HTTP test (USER denied; ADMIN create/list persists).
- `cargo test -p kiyo-server --locked --offline --jobs 1 --quiet legacy_reports_catalog_import::tests`: PASS, 3 importer HTTP tests (authorization, append-only persistence/audit/replay, identical skip/conflict/stale revision/invalid key).
- `cargo test -p kiyo-ui --lib --locked --offline --jobs 1 --quiet reports_catalog_import`: PASS, 2 importer UI validation tests after the unused-parameter cleanup.
- `cargo test --workspace --locked --offline --jobs 1 --quiet`: PASS on the current tree, 187 backend + 270 shared UI/API tests.
- `cargo fmt --all -- --check` and `git diff --check`: PASS on the final source/documentation state.
- Full tests ran with installed stable Rust 1.99. Rustup then successfully installed the project-pinned Rust 1.89 toolchain and Wasm target. Current-source `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --jobs 1 --quiet`: PASS; `cargo check -p kiyo-admin-desktop --locked --offline --jobs 1 --quiet`: PASS under Rust/Cargo 1.89. These are compile checks only; no fresh Trunk bundle or GUI/browser runtime was produced for this slice.
- `cargo build -p kiyo-admin-desktop --locked --offline --jobs 1`: PASS after Rustfmt. Fresh debug artifact: `build/KIYOVN-Enterprise-reports-catalog-final-test-20261011.exe`, 35,464,704 bytes, SHA-256 `934EA17828E78406A2E12CA3E647708F7486C1559BBEEDBDA37A568A0BA1B01D`. It was not launched because an existing local backend is listening on 3237 and its database was not verified as disposable. Trunk is absent from PATH/Cargo bin, so this slice has no fresh web bundle.
- No browser localStorage data was read/exported/imported. Pre-existing dirty paths under `legacy/` were preserved and not modified by this slice. Native/WASM click-through, restart persistence and matched screenshots remain outstanding; exact 100% visual parity is not proven.
- `node --check tools/export_legacy_reports_catalog.js`: PASS. `node tools/test_export_legacy_reports_catalog.mjs`: PASS with synthetic-only fixtures for server-first selection, cache fallback, pagination, read-only storage, fail-closed auth/network validation, key validation and redacted output. No live legacy origin was accessed.
- The ADMIN append-only preview/apply endpoint and shared egui import flow are implemented; importing actual user data remains operator-authorized and unperformed. The targeted UI importer validation passed (2/2). Native/WASM runtime, restart persistence, matched-screen screenshot comparison and exact 100% visual parity remain unproven.

## Isolated local login smoke — 2026-10-11

- The user's screenshot showed connection refusal at `127.0.0.1:3001`. Started the pre-existing `target/debug/kiyo-server.exe` on `127.0.0.1:3001` with a newly created isolated database `build/kiyo-login-local-20261011/kiyo.sqlite`, isolated file storage, and a fresh bootstrap `admin@kiyo.local` account. No credentials or records from the existing server on 3237 were read; that server was left running and unchanged.
- `GET /api/health`: PASS (`status=ok`). `POST /api/v1/auth/login`: PASS; returned `admin@kiyo.local`, role `ADMIN`, and a nonempty token. The access token and generated password are not recorded here. Server PID 32276 remains available for the user to log into the local UI.
- On 2026-10-12, reissued a random password for only this isolated synthetic ADMIN account; verified `POST /api/v1/auth/login` and authenticated `GET /api/v1/auth/profile` both succeed on `127.0.0.1:3001`. The password and token are intentionally not stored in project files.
- A current-source `cargo build -p kiyo-server --locked --offline --jobs 1` attempt failed because Windows denied replacing `target/debug/kiyo-server.exe` while the existing 3237 process had the image loaded. Thus this smoke uses the existing executable, not a freshly rebuilt binary. No current-source browser bundle, authenticated UI click-through, route parity, or exact 100% visual parity is established.

## Insurance card list and detail — 2026-10-12

- Read-only audit confirmed legacy maps `socialInsNumber`, `healthInsNumber`, and `hospitalClinic` to empty strings. The card route has page-size-8 pagination and a 600px VssID drawer; print/VssID controls only show success messages, and no card-number update mutation was found.
- Rust renders the card list and selectable detail window with the legacy labels, available employee/status/salary/join-date values, and blank unsupported identifiers/clinic. Print and VssID controls are disabled and their unavailability is explained; no card-change endpoint was added.
- `cargo test -p kiyo-ui --lib --locked --offline --jobs 1 insurance::tests -- --nocapture`: PASS, 8/8. `cargo test --workspace --locked --offline --jobs 1 --quiet`: PASS, 189 backend + 278 UI/API. Server, `wasm32-unknown-unknown`, and Windows desktop `cargo check`, `cargo fmt --all -- --check`, and `git diff --check` pass.
- No authenticated card-route click-through or matched legacy/Rust screenshot was taken. This is not visual parity acceptance; route search/filter, source-backed card identifiers, native/browser runtime and 100% parity remain open. `legacy/` was not edited.

## Insurance adjustment and regime forms — 2026-10-11

- `cargo test -p kiyo-ui --lib --locked --offline --jobs 1 insurance::tests -- --nocapture`: PASS, 8 Insurance tests. Coverage includes server-backed empty state, labor derivation, payroll aggregation/rounding, adjustment payload/duplicate/amount validation, regime payload/duplicate/leave-day validation, and truthful unsubmitted provider status.
- Backend tests verify ADMIN-only Insurance/payroll reads and writes, validated unique Insurance codes, audit persistence, encrypted regime bank-account storage/read-back, fail-closed missing-key behavior, and denial of generic Insurance PUT/PATCH/DELETE.
- `cargo test --workspace --locked --offline --jobs 1 --quiet`: PASS, 189 backend + 278 shared UI/API tests using project-pinned Rust/Cargo 1.89.0.
- `cargo check -p kiyo-server --locked --offline --jobs 1 --quiet`: PASS. This checks the production server target without replacing any running executable.
- `cargo check -p kiyo-web-wasm --target wasm32-unknown-unknown --locked --offline --jobs 1 --quiet`: PASS. `cargo check -p kiyo-admin-desktop --locked --offline --jobs 1 --quiet`: PASS. These establish compilation, not GUI/browser runtime or visual parity.
- Insurance adjustments, regimes and expenses now use persisted Rust API data and page-size-8 lists; new forms preserve legacy business fields. Saving a draft does not claim external eBH submission or actual benefit payment. New regime bank-account values are encrypted at rest, but historical plaintext records have not been migrated and production key rotation/recovery is unverified. No real legacy records were accessed/imported. Native/WASM click-through, exact legacy layout comparison and 100% parity remain open; `legacy/` was not edited.
