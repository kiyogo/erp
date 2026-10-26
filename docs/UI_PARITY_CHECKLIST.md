# UI parity checklist — initial audit

Use this checklist per feature ID in `docs/MIGRATION_MATRIX.md`. A group-level visual match is not sufficient.

| Dimension | Required evidence | Current status |
| --- | --- | --- |
| Structure and navigation | Legacy route, page, menu state, breadcrumbs, tabs and role visibility compared to the Rust view | `IN_PROGRESS` |
| Visual design | Layout, hierarchy, spacing, typography, colors, iconography and theme compared at representative sizes | `NOT_AUDITED` |
| User actions | Every legacy control has an implemented action or a documented approved deviation; no dead buttons | `IN_PROGRESS` |
| Form behavior | Required fields, validation, error association, preserved input, pending/disabled state and success behavior | `NOT_AUDITED` per module |
| Lists/tables | Search, filter, sort, pagination, selection, row action and empty/error states | `NOT_AUDITED` per module |
| Async states | Loading, empty, forbidden, not found, conflict, timeout, server error and retry | `IN_PROGRESS` |
| Persistence | Save, reload and backend restart preserve the expected data | `NOT_AUDITED` per module |
| Native/Web parity | Shared state and validation; platform-specific file/camera/clipboard adapters tested and differences documented | `NOT_AUDITED` |
| Input/accessibility | Keyboard, focus, IME/Telex/VNI, clipboard, scaling and feasible screen-reader semantics | `IN_PROGRESS` |
| Responsive canvas | At minimum 1440×900, 1280×800 and 390×844, with no inaccessible controls or unintended overflow | Partial: Edge verified admin leave at 1280×800 and dashboard/drawer at 768×900. Compact header and 260/270px breakpoint-specific drawer geometry now pass source/build tests, but have no post-change browser capture; leave at 768×900, broader routes, 1440×900 and 390×844 remain open |

Do not mark a row verified based only on compiling the UI or viewing a screenshot of one state.

## Insurance — `INSURANCE-001` — partial implementation; visual parity not audited

- [x] Map legacy routes and split data sources: employees, contracts, payroll, `insurance_adjustments`, and `insurance_regimes`.
- [x] Replace fabricated Rust sample employees with data-derived labor rows and explicit empty states.
- [x] Show data-backed overview, labor, contribution, adjustment, regime, and expense views in the shared egui UI.
- [x] Implement page-size-8 adjustment/regime tables and create forms; persist records through Rust API and reload after save.
- [x] Validate required fields, business-code duplicates visible in the loaded list, numeric bounds and positive leave days; test the payloads.
- [x] Mark new drafts as not submitted to eBH and internal approval as unverified; do not claim actual payment or external provider success.
- [x] Cover the relevant generic collection read/write ADMIN boundary and read-after-write persistence in backend HTTP tests.
- [x] Encrypt new benefit bank-account values on the Rust server with a domain-separated AES-GCM key; decrypt only for ADMIN reads and fail closed when the key is missing.
- [x] Rebuild the card list/detail route with page-size-8 behavior and legacy labels; preserve blank BHXH/BHYT/clinic fields because the legacy mapping supplies empty strings, and clearly disable unavailable print/VssID actions.
- [ ] Capture and compare the card list and drawer at matching viewport/device scale. No card-number update mutation exists in the audited legacy route; do not invent one. Real identifiers/clinic remain unavailable until a verified data contract supplies them.
- [ ] Add legacy search/filter/detail actions and exact table/card states for every Insurance route.
- [ ] Implement real C12 output only after an actual file-export contract exists; integrate eBH/VssID only with an authorized provider contract.
- [ ] Migrate/review existing plaintext bank-account values and test key rotation/backup recovery before production Insurance-regime use.
- [ ] Run authenticated browser-canvas and native click-through, persistence/restart checks, and compare the same legacy/Rust screens at matching viewport/device-scale sizes.
- [ ] Achieve and prove exact UI parity. Current shared egui layout is not pixel-identical to the legacy React/Ant Design page; no 100% parity claim is made.

Verification: 8 Insurance UI tests, 2 backend auth/persistence/encryption tests, full workspace 189 backend + 278 UI/API tests, and server/Windows desktop/Wasm compile checks pass. This is implementation/build evidence, not visual acceptance.

## Shared compact mobile shell — source/build verification only

- Legacy uses 260px at ≤768px and 270px at 769–992px; Rust now uses a full-height foreground overlay with the same breakpoint widths, a 48px brand strip, navigation content and backdrop shadow.
- The desktop/mobile header and drawer geometry have unit and egui context-render coverage. Current Windows workspace tests (142 backend + 216 UI/API), formatter, WASM compile, desktop build and Trunk bundle pass.
- [ ] Capture current Rust and legacy drawer at the same route/state and viewport; verify open/close/backdrop, full-screen coverage, 390×844 layout and mobile bottom navigation. Build evidence alone is not a visual-parity pass.

## Dashboard data-integrity slice — current checklist

- Dashboard KPI cards are API-backed; hard-coded counts/revenue/activity entries were removed.
- Browser smoke verified actual zero counts and the connected source's empty state at 1280×720 against a disposable SQLite database.
- Monthly revenue/expense are connected to completed Rust cash vouchers; the dashboard now displays recent persisted audit events.
- Dashboard finance values are covered by backend integration tests; current browser visual comparison and full 1440×900/1280×800/390×844 runtime checks remain open.

### Dashboard composition follow-up — source/build/API evidence only

- [x] Rust consumes pending-workflow rows and restores legacy banner, KPI copy/links, conditional approval queue, seven quick-action rows, recent-activity empty/list states, currency projection and the 992px breakpoint.
- [x] UI tests (226), WASM target check, desktop target check and current Trunk bundle pass; isolated API-backed preview at `127.0.0.1:3228` serves health, JS/Wasm, login, introspection and dashboard stats successfully.
- [ ] Capture legacy and Rust dashboard at identical 1440×900, 1280×800 and 390×844 viewports; compare wrapping, exact geometry, gradient/icons/font rasterization, hover/click routes and populated approval/audit states. This route is not pixel-verified yet.

## ADMIN audit log — implementation checklist

- [x] ADMIN-only server-backed list with paging, search and category filters; loading, empty, error/retry and account-switch reset states.
- [x] Renders persisted timestamp, actor, action, module and detail; sensitive detail keys are redacted by the server.
- [x] No fabricated IP, HMAC/hash, 10-year retention, print or file-export claims.
- [ ] Browser/native interaction, visual/responsive/keyboard review, complete domain-event coverage, and an approved retention/export policy.

## Admin Users slice — current checklist

- API-backed paginated list, full-directory debounced search/filter, system-wide total/active/admin summary, profile, create dialog and lock/unlock controls are implemented in the shared egui view.
- Docker workspace tests pass (43 backend + 88 UI/API), including clearing directory and unsaved form state when the authenticated account changes; Linux workspace build, Wasm compile and formatter check pass.

## Chat slice — current checklist

- Channel list, text messages, direct/group messages, replies and reactions now use authenticated Rust endpoints and persisted SQLite state; message pages remain stable when records share a timestamp.
- Channel/user/message loading, errors, empty states, DM participant selection and polling refresh are implemented; no fabricated message samples remain.
- The six legacy channel definitions are seeded on database initialization. Locked announcement posting checks ADMIN on the server. Voice channels are display-only, attachment upload is explicitly unsupported, and the legacy socket was only a no-op mock.
- WebSocket/SSE push and reconnect, importing browser-local history, custom channel administration, voice signaling, upload, Chromium interaction and full 1440×900/1280×800/390×844 visual/native parity remain unverified/open.
- Browser interaction, visual comparison against the legacy page, keyboard/IME and Linux/macOS runtime are not yet verified. Legacy has no account edit/delete form; fake 2FA/export/print controls remain intentionally absent.
- 2FA, last-login, Excel export and card printing are intentionally absent until their legacy contracts and actual backend capabilities are established.

## Workflow overview — partial migration

- `/admin/workflows/overview` aggregates persisted generic workflow rows and typed workflow requests, HR proposals and tasks. Search, source/status filters, 20-row paging, per-source load errors and source navigation are data-backed.
- Status counts use each source's known states; unknown states remain separate. No SLA countdown, timeline, signature-verification, contract data, or other inferred values are displayed.
- Contracts now have ADMIN create/edit/archive controls backed by typed Rust APIs and a shared form for contract parties, employee, terms, signatory identity, notes and custom fields. Employee list/detail remains read-only. Lists and workflow overview consume a safe summary; backend full detail is ADMIN/exact-owner scoped. Unowned exact-code history remains summary-only. Signature state is explicitly unverified; download, document generation and signing are not implemented. Current-source web bundle and browser/native interaction remain unverified. Browser LocalStorage workflow cache is not imported; workflow detail/history remain open.
- `cargo test -p kiyo-ui --locked --quiet` passes (179 tests), and the Wasm target check passes. This slice has not had a dedicated browser screenshot/interaction or native GUI run.

## Finance cash voucher slice — current checklist

- `/admin/finance/cash/transactions`, `/income` and `/expense` use real server records for route defaults, filters/search, completed-only KPIs, eight-row paging, creation, details and confirmed soft cancellation.
- The backend creates codes and persists compatible SQLite rows; dashboard current-month revenue/expense query completed voucher records. Account/source, amount and status validation are covered by backend tests.
- Other finance routes explicitly show that they are not migrated; they do not reuse the cash-voucher API or present sample data.
- Formatter, 107 backend + 154 UI/API tests, Linux workspace build, Wasm compile and Trunk release bundle pass. Isolated HTTP E2E confirms real bundle assets and the voucher/dashboard API path. Browser WASM rendering/interaction, native UI, exact visual/responsive parity and import of pre-existing legacy vouchers are not verified.

## Cash flow overview — current checklist

- `/admin/finance/cash/flow` derives completed-only receipts/disbursements/net and category totals from the persisted Rust cash voucher API; pending count is separate, canceled vouchers do not affect totals.
- Category grouping, voucher counts, absolute-net ordering, ten-row paging, refresh, and truthful loading/error/empty states are implemented in the shared egui view.
- Aggregation tests pass with the full 107 backend + 154 UI/API suite; Linux workspace build, Wasm compile and Trunk release bundle pass. The HTTP smoke exercised the underlying API but not the rendered cash-flow screen; browser/native interaction, visual parity and platform runtime remain unverified.

## Finance bank accounts and bank ledger — current checklist

- `/admin/finance/cash/bank/accounts` is backed by the ADMIN-only API and supports legacy account search fields, 10-row paging, empty/loading/error/retry states and account creation. Switching authenticated users clears cached account and ledger data.
- Account numbers are available in full only in the ADMIN view, while the database stores the legacy-compatible encrypted envelope. Opening balances and the derived ledger total are explicitly described as declared/internal values, not a bank-confirmed available balance.
- `/transactions` loads only bank-source voucher rows and supports legacy search fields plus paging. Statement summaries include completed vouchers only and are labelled internal-ledger summaries; statement upload/reconciliation has no real legacy persistence/API and remains unavailable.
- E-banking providers are shown as unconfigured; no placeholder toggle claims connectivity. Internal transfer now uses one ADMIN-only atomic operation, links the paired `Chi`/`Thu` vouchers, preserves an idempotency key on in-view retries, and has a rollback test. It does not claim to verify available funds from declared opening balances.
- Current full test suite: 124 backend + 166 UI/API; Linux workspace build and Wasm target check pass using a scratch target on C:. This audit slice did not rebuild the Trunk bundle. Browser rendering, native interaction, visual/responsive parity and real-data/key-provisioning rehearsal remain open.

## Finance legacy import — current checklist

- ADMIN-only `/admin/system/migration/finance` accepts the bounded JSON export from an explicit SQLite copy and calls summary-only preview before any write.
- The preview separates bank accounts and cash vouchers into total/importable/already-imported/conflicted counts, displays a digest and exact confirmation phrase, and never renders account numbers, counterparties or notes.
- Apply is digest-bound and atomic; after success the UI drops the sensitive bundle from memory. Role/account changes also clear view state. Real-data reconciliation, browser/native visual interaction and operator backup rehearsal remain open.

## HR Employees slice — current checklist

- API-backed list, current filter/search, summary/detail, quick create/edit, soft-retirement confirmation and activation resend request are implemented in the shared egui view.
- Inactive accounts visibly show that SMTP delivery is unavailable. A resend request is explicitly rejected without rotating the existing activation link.
- Backend role/persistence tests, DTO tests, WebAssembly compile and Windows desktop build pass.
- A separate self-profile view reads `/employees/me` and allows phone/address edits; the API smoke verified update then reload. The backend remains authoritative for HR-controlled fields, and bank-account changes use the separate typed approval API.
- Full personnel form, notes/direct-email UI, actual mail delivery, avatar upload/storage, onboarding wizard, broader visual comparison and Linux/macOS runtime remain open. Org-unit manager assignment is handled transactionally by the Business Organization Units API slice. No Excel-export success action is shown because the legacy button only displayed a success toast without generating a file.

## Organization Units slice — current checklist

- The previous five sample units are removed. The shared screen loads `business_org_units` and employee profiles from the Rust API; headcount, budget summaries, search and status filtering use those records.
- Create/edit persists the legacy fields represented by the model; manager assignment and unit deletion update employee departments transactionally in the backend. Deletion is blocked while child units remain.
- Current tests cover wire fields, count matching, numeric validation, hierarchy-cycle prevention, ADMIN-only writes, manager assignment, child guard and atomic employee reassignment.
- Details drawer, visual/browser interaction, responsive audit and real Excel export remain open. The legacy export action only emitted a success message; the Rust screen does not claim it generated a file.
- Employee payslips now show a truthful empty state rather than invented monthly amounts; the legacy collection currently has no typed employee-scoped payroll contract in Rust. Payroll values, bank-account changes, signing, printing and export remain blocked pending `BLK-004` and are not represented as working actions.

## Files listing and transfer — current checklist

- Shared Files UI lists/navigates real folders, creates folders, renames and soft-deletes unprotected nodes, uploads raw bytes, downloads through the platform save flow and replaces a file's bytes/MIME/size while preserving its server filename. Replacement requires confirmation and the UI enforces the 50 MiB limit. It also creates public links, copies them, toggles access and rotates tokens. Upload errors keep the selected file available for retry; employee upload type restrictions are also enforced by the backend.
- Delete requires explicit confirmation, hides the item from the live list and preserves stored bytes as legacy does; the dialog clearly warns that restore is not yet available in the UI.
- Public `/files/share?token=...` runs in a standalone shared-canvas view without login; images preview in the canvas, videos can open in the browser, and the download action uses the platform save dialog.
- Browser smokes on isolated databases verify rename/duplicate-name handling, synthetic upload/list/download-save, three-item bulk delete, public share canvas/download, UI link rotation/disable, and confirmed replacement with an exact byte round-trip. The first login interaction found and led to fixing the unsupported WASM `std::time::Instant` panic by switching shared monotonic timers to `web_time::Instant`.
- Share API, public bytes, permission boundary, token rotation/revocation, replacement bytes/metadata/owner scope, delete retention and employee upload restrictions are backend-tested; the principal Files browser flows now have widget-level E2E coverage. Full visual/responsive comparison at smaller viewports, keyboard/IME behavior, native Windows runtime, Linux/macOS runtime and exhaustive route-by-route permission parity remain open. Recovery UX is not in the audited legacy product and is intentionally absent.

## Personal notifications — current checklist

- Employee and admin “Thông báo của tôi” views load the authenticated user's persistent notifications, search by title/message/type, mark one/all read, delete one/all, and follow only a matched route in that role's navigation tree.
- The app header badge uses unread records fetched in the background; polling refreshes every five seconds. The bell opens a server-backed popover with a scrollable list, per-item mark-read, role-visible internal navigation, outside-click dismissal and a link to the full notification view. Account changes/logout clear in-memory state.
- Backend tests verify per-user isolation, ADMIN-only targeting on creation, employee-supplied `userId` being ignored, mark-read denial for another user, mark-all scope, delete isolation, and clear-all scope. An egui canvas test renders a populated popover at 390×844. Browser click-through, screenshot comparison, and keyboard/IME remain unverified.

## Admin broadcast notifications — current checklist

- [x] Shared egui admin screen is wired to persistent Rust endpoints for list/search/create/edit/delete.
- [x] New entries are drafts; UI says Email/SMS/In-app channels are only intended channels and are not sent.
- [x] Search covers title, content, audience, type and sender; existing counters are shown as values stored by legacy.
- [ ] Legacy employee/unit pickers and exact audience resolution.
- [x] Activation email template editor, with server validation/persistence and a plain-text preview; email configuration status truthfully reports unavailable.
- [ ] SMTP configuration, test-send and actual delivery (separate blocked slice; no secrets or send action in the current UI).
- [ ] SMS adapter, in-app fan-out, scheduled delivery, resend confirmation and truthful delivery/read metrics.
- [ ] Browser/native UI interactions, loading/error visual review, keyboard/accessibility and responsive comparison.

## Meeting rooms — current checklist

- [x] Removed four hard-coded rooms and connected overview/list/calendar/history to the persistent Rust API.
- [x] Room creation, booking and cancellation use typed requests; server validates room capacity, date/time and overlapping confirmed reservations.
- [x] Legacy history examples, fake Excel success, and local-only Meet/Teams/reminder switches are not presented as real data or successful integrations.
- [ ] Browser/native interactions, visual/keyboard/IME audit, and full responsive comparison.

## Attendance shift catalog (`ATT-SHIFT-CATALOG-001`) — implementation, verification pending

- Shared egui screen reads the real `attendance_shifts` collection, searches and filters by legacy categories, shows record-derived counts/details, and creates a single server record.
- The form retains the legacy shift fields and work-unit rule. It does not expose the legacy success-only Excel toast or pretend to sync FaceID devices.
- [x] Full-collection saves carry the server revision; stale writes are rejected, and the form remains available so the admin can reload before retrying.
- The separate general attendance view no longer shows hard-coded attendance rows or local-only check-in/leave success; it states that those APIs are not implemented.
- [x] Rust server/UI tests and Linux/Wasm compilation pass; page-size-8 pagination is implemented.
- [ ] Browser/desktop interaction and reload persistence; page-size-8 runtime behavior; historical/localStorage import; generic collection audit instrumentation.
- [ ] Real report export, persistent booking-policy settings and approved Google Meet/Teams/chat integrations.

## Attendance shift assignments (`ATT-SHIFT-ASSIGN-001`) — implementation, verification pending

- [x] Shared egui aliases `/admin/attendance/shifts/detail`, `/summary` and `/registration` use typed API-backed assignment data with search/status filters, 8-row pagination and details/history.
- [x] Create form selects an active HR employee and active shift; server snapshots identity/shift details and stores an append-only creation event.
- [x] Removed free-text/fabricated employee identity and fake FaceID, 24/7 coverage/SLA, Excel-success and local-only swap-decision claims.
- [x] Rust HTTP/UI/API tests, ADMIN/USER role checks and Linux/Wasm compilation pass (`BLK-007`).
- [ ] Browser/desktop interactions, restart persistence and safe historical-data import.
- [ ] Review/import old `attendance_shift_assignments` rows only after unambiguous employee/shift matching; preserve unresolved rows for admin review.

## Admin leave requests (`ATT-LEAVE-ADMIN-001`) — implementation, verification pending

- [x] Shared egui route loads the ADMIN collection and supports search/status filters, details, create, approve and reject.
- [x] Server validates dates, day increments, statuses, unique code/key and record sizes; summary counts use backend records only.
- [x] Matched the legacy KPI text/default display (including the legacy 9.5-day fallback and static SLA/attendance captions); these legacy display defaults are not evidence that the backend verifies annual balance, SLA, or attendance synchronization.
- [x] Backend/UI/API tests and formatter pass for current HR-linked identity slice; final Linux workspace check and current Wasm check pass. Last full workspace build predates the collapsed-section/theme adjustments.
- [x] Full-collection replacement carries the loaded revision; stale writes return 409 without overwriting current records, and the form remains available for reload/reconciliation.
- [x] Current Trunk bundle rendered in headless Edge; synthetic ADMIN login, leave-request list, API reads and no-overflow 1280×800 viewport verified. Legacy and Rust screenshots were compared at the same viewport; no JavaScript errors occurred. The HR picker and mutation flows were not part of this visual run.
- [ ] Native GUI interaction, additional browser/viewport coverage and restart persistence.
- [x] Bind new admin-created rows to authoritative HR employee profiles, snapshot identity server-side and keep linked/unlinked historical identity immutable while permitting legacy status review.
- [x] Keep admin leave management and employee self-service on separate routes; ADMIN can open `/employee/leaves` through the employee portal instead of seeing both screens stacked together.
- [x] Expand admin metrics and the empty state across the content width; cards use persisted request totals only, without invented balance/SLA claims.
- [x] Align the admin page's four KPI labels/default display, status-filter labels, search text, action order, empty-state pagination, and card/toolbar geometry with the legacy component. Excel export stays disabled because the legacy action does not generate a file.
- [x] Align the shared light-theme palette with the legacy web's white/light-gray/teal colors.
- [ ] Pixel parity is still incomplete: the current-source same-size comparison is close on the admin leave cards/table/toolbar, but sidebar icon glyphs and some font weights/spacing still differ. This is one route at one desktop viewport, not full-app 100% parity. Export behavior, native UI, smaller leave viewports, keyboard/IME and restart persistence remain open.
- [ ] Add generic collection audit parity and import reviewed historical data. Typed self-service submissions have their own immutable review events.

## Employee leave self-service (`ATT-LEAVE-EMPLOYEE-001`) — implementation, verification pending

- [x] Add typed owner-scoped GET/POST. The server derives user/employee identity from the authenticated session and active HR profile; create input rejects client identity fields.
- [x] Add ADMIN-only one-time approve/reject and append-only submission/decision events; owner and ADMIN can read the event history.
- [x] Shared egui route `/employee/leaves` supports create, list, details, review history and server errors; it renders as a standalone route, including when an ADMIN switches to the employee portal.
- [x] Re-align the self-service screen to the legacy KPI, filter/action toolbar, request columns, eight-row pagination and form choices; annual quota/balance and print remain unavailable instead of showing fabricated values or success.
- [x] Keep annual balance, attendance deduction, print/export and multi-level approval unavailable until backed by verified policy/data.
- [ ] Run server/UI tests, native/WASM builds, browser/desktop interaction and restart persistence; source evidence is not runtime verification (`BLK-007`).
- [ ] Define a safe, reviewed historical-data import and validate existing employee profiles before production use.

## Employee overtime self-service (`ATT-OT-EMPLOYEE-001`) — implementation, verification pending

- [x] Shared egui employee route `/employee/overtime` supports request creation, list/search, day/status filters, details and append-only history; employee identity is server-derived.
- [x] ADMIN route `/admin/attendance/requests/overtime` supports review of requests and one-time decisions; admin cannot submit a self-service request from this screen.
- [x] Keep legacy day-category labels for classification while omitting unverified pay estimates, monthly caps, actual time worked, print/export success and fake integrations.
- [ ] Run Rust tests, native/WASM builds, browser/desktop interaction, account-switch privacy checks and restart persistence; source evidence is not runtime verification (`BLK-007`).
- [ ] Design a safe historical import and source the actual payroll/timekeeping policy before claiming compensation or attendance parity.

## Strategic plan list — initial implementation checklist

- [x] Shared egui route `/admin/plans/list` loads typed backend data and supports search, create and mark-complete.
- [x] Summary values come from loaded plans; the hard-coded OKR percentage and success-only Excel toast were removed.
- [x] Loading, empty, API-error and mutation-pending states are represented; backend validates required fields, date ordering, priority, budget and unique code.
- [ ] Rust tests/build, browser/native interaction, visual/responsive/keyboard comparison and localStorage import remain unverified.
- [ ] Milestones, progress, reports and roadmap have separate feature checklists below; import/runtime verification remains outstanding.

## Strategic plan milestones — initial implementation checklist

- [x] Shared egui route `/admin/plans/milestones` loads backend records and supports search, quarter/achieved filtering, create, detail and mark-achieved.
- [x] Summary cards derive from loaded records; hard-coded OKR and print-success behavior are removed.
- [x] Form/API states and server validation/ADMIN authorization are represented; detail shows acceptance criteria and owner.
- [ ] Rust tests/build, browser/native interaction, visual/responsive/keyboard comparison and localStorage import remain unverified.
- [ ] A real A4/PDF acceptance report generator is not connected and is not represented as working.

## Strategic plan progress — initial implementation checklist

- [x] Shared egui route `/admin/plans/progress` loads persisted entries and supports search, legacy threshold filters, details, percentage edit and 8-row pagination.
- [x] Percent validation is 0–100 on both UI and backend; updating preserves weight/deadline/day fields and mirrors legacy status change.
- [x] Average progress uses loaded entries and is explicitly unweighted; empty state is `—`; hard-coded SLA 100% and false print/Excel success are removed.
- [ ] Rust tests/build, browser/native interaction, visual/responsive/keyboard comparison and localStorage import remain unverified.

## Strategic plan reports — initial implementation checklist

- [x] Shared egui route `/admin/plans/reports` loads persisted reports across periods and supports filters, search, details, create and edit.
- [x] Legacy rows missing a period remain readable as “Chưa xác định kỳ”; arbitrary legacy `projects` JSON is preserved on update but not presented as verified project data.
- [x] Summary values use the selected period's saved records; entry values are labelled self-reported and no accounting reconciliation is claimed.
- [x] Hard-coded sample reports/projects and success-only print/Excel messages are not represented as real records or files.
- [ ] Rust tests/build, browser/native interaction, visual/responsive/keyboard comparison and localStorage import remain unverified; genuine PDF/Excel output is not implemented.

## Strategic roadmap / OKR — initial implementation checklist

- [x] Shared egui route `/admin/plans/roadmap` loads saved `plan_okrs`, searches by code/title/pillar/owner, filters by all four pillars, opens details and paginates eight rows.
- [x] Create persists the legacy fields, supports fractional progress including zero, and server-validates required values, unique code, canonical pillar, 0–100 progress and calendar date.
- [x] Average progress, exceeded-goal count and active-pillar count derive from stored records; empty average is `—`, and hard-coded revenue claims are removed.
- [x] The sync and A4 controls no longer claim success without a provider or document artifact.
- [ ] Rust tests/build, browser/native interaction, visual/responsive/keyboard comparison and localStorage import remain unverified; real progress synchronization and printing are not implemented.

## Workflow blueprints — current checklist

- [x] Removed the Rust demo approval-request rows; the blueprint catalog starts from backend data and has truthful empty/loading/error states.
- [x] Shared egui list, search/category/status filters, create form, flow/form-field detail and active/paused mutation use typed API calls.
- [x] Export is disabled and the screen explains that catalog activation, configured PKI requirements and real execution/signatures are distinct capabilities.
- [ ] Backend/UI/API tests, browser/native interaction, visual comparison, keyboard/IME and responsive canvas checks remain unrun.
- [ ] Workflow request creation/approval, history, settings, employee tasks, actual executor, PKI provider and Excel/BPMN export remain separate migration work.

## Employee proposals — API-backed slice, runtime verification pending

- [x] Employee route creates and lists the signed-in user's proposals; backend detail access is submitter-scoped.
- [x] HR route lists all proposals and exposes approve/reject only to ADMIN; backend records reviewer, status, note and timestamps once.
- [x] Shared egui form, search/status filters, details, summary metrics and explicit API loading/error/result states use typed DTOs; no sample proposals are seeded.
- [ ] HTTP/UI/API tests are added but unrun; browser/native interaction, visual parity and full runtime persistence checks remain pending.
- [ ] Legacy review success copy implies feedback delivery, but its API only persists review fields; a real employee notification remains unimplemented and is not claimed.

## Enterprise tasks — API slice verified, runtime verification pending

- [x] ADMIN task list/create/edit and confirmed delete, plus employee-scoped list/detail, use typed Rust APIs; employees cannot modify ADMIN-only task fields.
- [x] Detail includes persisted checklist, reports, comments and activity; employee progress/status changes are saved by the backend.
- [x] Report attachments use private task-scoped storage; shared UI supports pick/upload/attach/remove/download, with backend membership and report-reference checks.
- [x] Employee task creation and assignee choices are exposed from backend-derived exact department/unit-manager scope; submitted project/assignee choices are revalidated on the server.
- [x] Multi-assignee create uses the transactional batch API; every selected assignee is reauthorized server-side and partial creation is rolled back on failure.
- [x] Latest workspace tests pass (43 backend + 85 UI/API); Linux workspace build, Wasm target check and Rust formatting check pass.
- [ ] Legacy task import, browser/native interaction and responsive/visual parity remain open.

## Workflow requests, history and policy — audit follow-up

- [x] Rust uses server-backed admin request records and real append-only history; it does not show fake records, client-generated certificate/hash claims, static audit totals or false success actions.
- [x] Admin-only request creation/list backed by active blueprints; duplicate codes and configured budgets are server-validated. Ordinary decisions require a different ADMIN from the creator and persist actor/time/note; PKI-required steps fail closed.
- [x] Request summary cards derive pending count, urgent P1 count, pending budget, and total approved count from backend-loaded records; no fabricated KPIs. “Approved today” remains intentionally unclaimed until the business timezone is specified.
- [x] History screen reads and filters persisted events, distinguishing ordinary unsigned decisions; PKI verification/export controls remain disabled.
- Request summary cards use loaded backend records, and account changes clear unsaved request/decision UI state; aggregation and account-switch regression tests are added but unrun, so visual/runtime parity is not verified.
- [ ] Employee-owned submission and approver visibility, role/department assignment, return/resubmission, real attachment storage and broader SLA/policy behavior.
- [ ] Overview aggregates sourced from actual task/proposal/contract/request APIs with correct timezone and status semantics.
- [ ] Durable budget tiers/delegations/security policies, SLA scheduler, real CA verification, genuine exports, and web/native interaction and responsive parity.

## Workflow settings — legacy interaction port

- [x] `/admin/workflows/settings` is routed to the shared egui screen with budget matrix, approval delegation and digital-signature/notification tabs; tier edits, delegation creation and security save retain the source's in-view/toast-only behavior.
- [x] Budget tiers load through Rust `/api/v1/collections/workflow_settings`, now ADMIN-only; tests cover camelCase/`requirePKI`, unknown legacy fields, form validation, in-view updates and ADMIN/USER access.
- [x] Tier PKI/status and delegation status/notification badges use the legacy Ant Design preset colors, border and radius; unit tests pin the source palette values.
- [x] WebAssembly reads the legacy `kiyovn_cache_workflow_settings` localStorage array as a read-only fallback only when the server collection is empty; server data takes precedence and the cache is never overwritten or uploaded automatically.
- [ ] Exact KeyOutlined/BellOutlined glyph rendering, screenshot comparison at matching desktop/mobile viewport sizes, browser/native click-through, and reviewed durable import into the Rust API remain open. Native has no browser-local cache. This does not implement a scheduler, CA issuer, Slack webhook delivery or durable settings writes absent from the legacy module.

## Authentication sessions — implementation source, verification pending

- [x] Admin Sessions view uses server-backed active sessions; current session is identified by the signed token's server session ID, not localStorage.
- [x] Shared app introspects immediately after login and periodically; transient network errors do not discard the current session, while server 401/403 clears authenticated UI state.
- [x] Revoke requires confirmation and reports that the next request for the target session will be rejected; the current session cannot be revoked through the admin action.
- [x] No unsupported IP, location, VPN, device, MFA or last-active claims are rendered.
- [ ] Rust test/build, web/native interaction, logout network-failure handling and startup session restoration remain unverified/open.

## CRM Contacts slice — API-backed, runtime parity open

- [x] Removed the seeded sample contacts and local-only create success; `/admin/crm`, `/admin/crm/customers` and `/admin/crm/suppliers` load the authenticated backend.
- [x] Shared egui includes type filter, legacy search fields, 10-row paging, summaries over the filtered/search-visible set, details and all fields from the legacy create contract. Backend remains ADMIN-authoritative.
- [x] CRM PII columns are encrypted at rest using the Node-compatible envelope; UI reports server key/config errors without claiming that a save succeeded.
- [x] Workspace tests/build/WASM compile/format pass for this checkout (see `TEST_EVIDENCE.md`).
- [ ] Browser/native interaction, visual/responsive comparison, keyboard/IME, configured-key restart persistence and legacy contact import remain open. CRM export is absent because the legacy action did not create an artifact; evaluation/feedback modules are not included in this contacts slice.

## CRM supplier evaluations and customer feedback — API-backed, runtime parity open

- [x] Added dedicated partner contact navigation backed by the existing type-filtered contacts API.
- [x] Supplier evaluations use persisted records, server-computed score/tier, search, tier filtering, paging, details and create form.
- [x] Customer feedback uses persisted records, encrypted phone, search/rating/status/priority filters, paging, details, create and one-time resolve action.
- [x] Generic collection reads/writes for these typed CRM scopes are blocked; no toast-only export/PDF/invoice or unsupported SLA claims are rendered.
- [x] Workspace API/HTTP tests and host workspace check pass; see `TEST_EVIDENCE.md`.
- [ ] Historical generic/localStorage data import, browser/native interaction, visual/responsive comparison and key-provisioned restart remain open (`BLK-010`).

## HR training courses — typed API-backed slice, runtime parity open

- [x] Added `/admin/hr/training` route and shared egui list/search/status filtering, paging, details and create form backed by the Rust API.
- [x] Course summaries show saved course count, scheduled count, planned hours and planned participant seats; they do not claim actual attendance or certification.
- [x] Removed success-only export/attendance/certificate actions and fabricated pass-rate/annual participation KPI from the Rust view.
- [x] ADMIN enforcement, persistence, date ordering, uniqueness and generic collection bypass are covered by backend HTTP tests; form and DTO behavior have UI tests.
- [ ] Historical course rows, participant enrollment, attendance, outcomes/certificates, browser/native interaction and visual parity remain open.

## HR certificates — typed API-backed slice, runtime parity open

- [x] Added `/admin/hr/certificates` with API-backed search/status filtering, paging, details and create form.
- [x] New records resolve the employee code against the server HR directory; display name, code, department and employee ID are server-derived rather than client-supplied.
- [x] Expiry status is derived from the stored expiry date; summary counts and sponsorship totals use loaded records. Optional verification links require HTTPS and are clearly not described as externally verified.
- [x] Replaced the fake copy toast with actual clipboard copy; removed export and recertification actions that only displayed success without producing an artifact or workflow.
- [x] ADMIN enforcement, record persistence, employee linkage, expiry boundaries, URL/date validation and generic collection bypass have HTTP coverage; DTO/form behavior has UI tests.
- [ ] Legacy localStorage import, browser/native interaction, visual/responsive comparison and a real certificate-issuer verification integration remain open.

## HR uniforms — typed API-backed slice, runtime parity open

- [x] Connected `/admin/hr/uniforms` to a Rust API-backed shared egui view with search, status filters, pagination, details and a create form.
- [x] New requests resolve employee codes against the HR directory; identity fields and request date are server-derived. Item, size and quantity are validated server-side.
- [x] Added a confirmed, one-time “recorded handover” transition with administrator actor/time. The UI explicitly does not represent this as a receiver signature.
- [x] Generic collection reads/writes are blocked; backend HTTP tests cover permission, linkage, invalid quantity, persistence, repeat-transition conflict and bypass attempts; UI tests cover DTO/form behavior.
- [x] Removed the fabricated stock count, future delivery estimate, receiver-signature text and toast-only export claim.
- [ ] Historical localStorage import, inventory ledger/stock availability, receiver acknowledgment, browser/native interaction and visual parity remain open.

## HR onboarding — typed API-backed record slice, workflow parity open

- [x] Connected `/admin/hr/onboarding` to API-backed shared egui listing/search/status filtering/paging/detail/create.
- [x] Creation requires a real employee code and mentor code; canonical name, position, department and mentor phone come from the server HR directory.
- [x] Evaluation date follows the legacy +60-day rule; unfinished duplicate onboarding records conflict.
- [x] Removed fake default progress/equipment/email values, hard-coded pass-rate KPI, toast-only export and local-only “complete & sign contract” action.
- [x] Backend HTTP tests cover ADMIN boundaries, identity linkage, duplicate/date validation, persistence and generic bypass; UI tests cover request field ownership, invalid input and legacy DTO compatibility.
- [ ] Persisted checklist items/state, actual equipment/account provisioning, probation evaluation/contract signing, historical localStorage import and browser/native visual/runtime parity remain open.

## HR recruitment — persisted job openings slice, candidate pipeline open

- [x] Added `/admin/hr/recruitment` to the shared egui navigation with API-backed list, search, status filter, paging, details and create form.
- [x] Added ADMIN-only typed Axum GET/POST for `hr_job_openings`; generic collection reads/writes are blocked. The server validates code uniqueness, level, headcount, text lengths and date, then owns the record key, initial status and creator/time.
- [x] Summaries use persisted openings and requested headcount only. Candidate/interview/offer numbers and hard-coded acceptance/time-to-hire claims are omitted; export, copy-link and CV-list buttons are not presented as successful actions.
- [x] Tests cover ADMIN boundaries, validation, duplicate codes, persistence, generic bypass, DTO/form ownership and status filtering.
- [ ] Candidate/application/interview/offer lifecycle, persisted pause/close transitions, directory-backed department/position selectors, historical import and browser/native visual/runtime parity remain open.

## HR headcount — typed planning slice

- [x] Connected `/admin/hr/headcount` to typed API-backed list/search/status filter/paging/detail/create on shared egui.
- [x] The backend derives actual staffing from active HR profiles whose department and position match; caller-provided actual/vacancy/status values are ignored.
- [x] Quota and monthly budget are explicit user inputs; the UI calls the budget a plan, not an approved amount. Added ADMIN-only routes and blocked generic scope reads/writes.
- [x] Tests cover role boundaries, real directory-derived counts, ignored client state, duplicate code, quota/budget validation and UI payload ownership.
- [ ] Approval/versioning, edit lifecycle, catalog-backed department/position choices, historical import and browser/native visual/runtime parity remain open.

## HR rewards — typed approval and award-record slice

- [x] Added `/admin/hr/rewards` shared-egui list/search/status filter/paging/details/create UI backed by typed server data.
- [x] Employee recipients are submitted by HR code and resolved server-side; team recipients require team name and department. Client cannot choose canonical employee name, ID, creator or status.
- [x] Added explicit confirmation for ordered one-time approval and award-record transitions; backend stores actor ID/time in append-only event rows and blocks generic collection reads/writes.
- [x] Status labels clarify that approval/award are admin-recorded operations, not digital signatures, payment, or employee receipt. Legacy statuses without server event records are marked unverified; unsupported eNPS/fund totals and toast-only export claims are omitted.
- [x] Tests cover role boundaries, active server-linked employee identity, duplicate identifiers, validation, transition ordering, legacy audit-field spoofing and UI payload ownership.
- [ ] Historical/localStorage import, separate approver permissions, supporting documents, receipt/payment proof, actor display names, retention policy and browser/native visual/runtime parity remain open.

## HR performance reviews — typed review/completion slice

- [x] Added `/admin/hr/performance` shared-egui list/search/status filter/paging/detail/create against typed Rust API.
- [x] New records resolve employee identity from an active HR profile, record evaluator/creator from the authenticated account, validate self/manager scores and declared proposed bonus, and derive grade server-side.
- [x] Added one-time confirmed completion with actor/time in append-only events. Generic collection reads/writes are blocked; legacy client-supplied actor/status/audit fields cannot create verified history.
- [x] Removed unpersisted three-pillar scores/default values, promotion/360 claims, payroll payment claim and toast-only report export. UI labels bonus as proposed, not paid.
- [x] Tests cover ADMIN boundary, identity linkage, validation, spoofed data, event-backed workflow, generic bypass and UI form ownership.
- [ ] Review/import of legacy records, approved scoring policy, payroll integration, browser/native interaction, Windows/macOS runtime and visual parity remain open.

## HR employee history — append-only note slice

- [x] Connected `/admin/hr/history` and position/transfer/resignation/reward/discipline subroutes to shared egui typed list/search/category/detail/create.
- [x] ADMIN-only API resolves the entered employee code to an HR profile and sets recorder/time server-side; typed SQLite history rows cannot be updated or deleted.
- [x] UI marks declared signer as unverified and says entries do not approve or mutate the employee profile/status.
- [x] Connected HR bank subroute and employee profile/payslip surfaces to the typed shared bank-account API; numbers are masked by default and approve/reject/retire actions require confirmation.
- [x] eKYC/localStorage and toast-only export are not presented as verified/successful; account hard-delete is not offered.
- [x] Added ADMIN migration screen with allowlisted localStorage exporter instructions, explicit plaintext-file warning, summary-only dry-run counts/hash and typed confirmation before apply.
- [x] Imported records return to pending review; unresolved rows are stored encrypted in quarantine; migrated employee-profile bank fields are scrubbed only after their bank-field payload is preserved encrypted.
- [x] ADMIN quarantine list is paged and returns masked account values; adoption can map/correct values into a pending account, dismissal is explicit, both require a typed confirmation and audit reason, and the encrypted source row is immutable.
- [ ] Production dry-run and key provisioning, real eKYC provider/evidence, browser/native interaction and visual parity remain open.

## CRM supplier evaluation and customer feedback history import

- [x] Added a read-only exporter for only the two allowlisted CRM localStorage keys; it validates stable keys, caps output and reports metadata/counts without logging customer contents.
- [x] Added an ADMIN-only shared egui migration page with an explicit plaintext-PII file warning, summary-only preview, digest and exact confirmation phrase.
- [x] Imported CRM records carry an unverified marker shown in evaluation/feedback views. Rust recalculates supplier score/tier, resets legacy feedback resolution claims to pending, encrypts feedback phone and encrypted source archive, and retains stable keys/unknown fields.
- [x] Account switching/logout clears the selected bundle and in-memory import state; successful import discards the selected file contents from the view state.
- [ ] Real-source review, configured deployment key, disposable-copy backup/restore rehearsal, production authorization, browser/native interaction and visual parity remain open.

## Documents/editor — first persistent slice

- [x] Replaced the seeded local-only editor scaffold with API-backed document listing, creation, opening and saving for basic paragraphs, headings and bullet lists in the shared egui/native/WASM view.
- [x] Added a read-only safety mode when legacy snapshots contain tables, images, page breaks or inline marks unsupported by this first Rust editor slice; those snapshots are not silently rewritten as plain text.
- [x] Added route-backed SQLite document schema, viewer/commenter/editor/owner authorization, comments and resolution, owner sharing/member listing, snapshots/history, bounded operations, idempotent transaction IDs, presence and SSE.
- [x] Snapshot saves require the expected revision, atomically advance to a new revision, preserve earlier snapshots, and return conflict for stale edits; the shared UI shows current/history revision metadata.
- [x] Backend tests cover role enforcement, document persistence, comments and duplicate operation IDs; UI tests cover basic block conversion and rich-content read-only detection.
- [ ] Full legacy editor formatting/block tools, Vietnamese IME/selection/search/page setup/print, live presence/collaboration client, legacy document import, browser/native interaction, editor restart smoke and visual parity remain open. Revision restore is not exposed because the legacy history dialog has no working restore action.

## Asset inventory (`ASSET-INVENTORY-001`)

- [x] Remove seeded sample assets; load the `asset_items` collection and report loading/error/empty states from server data.
- [x] Add code/barcode/name/model/person/location search, category/status filters, and summaries derived only from loaded records.
- [x] Restore the legacy department filter using department values from loaded records.
- [x] Support create/edit/detail/confirmed delete for the audited asset fields; preserve unknown legacy fields and record identity when editing.
- [x] Require a server revision before enabling writes; preserve the form on validation/API errors and refuse stale full-list writes.
- [ ] Verify rendered web/native interactions, restart persistence and responsive layout against the legacy page at approved viewport sizes.
- [ ] Audit and migrate transfers/audits/maintenance/repairs/disposal/depreciation/consumables/licenses/tasks, employee asset requests, and localStorage history import separately.

## Asset materials and stock cards (`ASSET-MATERIALS-001`)

- [x] Route `/admin/assets/materials` to a shared egui screen for native and WebAssembly rather than the general asset inventory fallback.
- [x] Implement server-loaded item list, KPI cards, code/name/specification/warehouse/supplier/compatibility search, status/category filters and page-size-8 table.
- [x] Preserve legacy camelCase material fields and unknown JSON on generic collection reads and stock patches; keep writes ADMIN-only through Axum.
- [x] Create an item with initial stock receipt/history and import/export stock vouchers that recalculate quantity/status and prepend a voucher history record; preserve legacy export clamp-to-zero.
- [x] Keep Excel/PDF controls behavior-identical to legacy: show the same success toasts without creating files.
- [x] Verify legacy compatibility for POST/PATCH without `expectedRevision`, revision-aware GET/create/stock update, stale-write 409, same-transaction audit events and preservation of unknown JSON fields.
- [x] Rerun the full workspace suite after the revision/audit follow-up: 183 backend + 265 shared UI/API tests pass.
- [ ] Recheck the WASM and native targets, then serve/click through the current bundle and compare matched screenshots; visual 100% parity remains open.
- [ ] Build a fresh browser/desktop preview, exercise the live canvas/native route, verify restart persistence, and compare matched screenshots. Exact 100% visual parity remains unverified.

## Asset allocations and returns (`ASSET-ALLOCATION-001`)

- [x] Audit legacy issue/return fields and reject arbitrary-PIN “digital signature” and unverified warehouse-receipt claims.
- [x] Add revisioned ADMIN collection management and ADMIN issue/return UI.
- [x] Restrict employee listing to the authenticated account's active HR identity; allow one-time acknowledgment only for that employee's pending issue.
- [x] Record acknowledgment actor/time/method without setting digital-signature fields; record ADMIN warehouse receipt separately for a pending return.
- [x] Persist status transitions and audit events in one SQLite transaction.
- [x] Pair latest WASM UI with a rebuilt backend and verify ADMIN login, revisioned persistence, warehouse-receipt transition and read-after-write over HTTP.
- [x] Add a separate ADMIN-only migration screen and synthetic-verified read-only paginated exporter/append-only importer for server-side allocation history; preserve source fields and show historical signature/warehouse claims as unverified.
- [ ] Exercise the employee acknowledgment and ADMIN receipt through actual canvas clicks; verify native build/interaction and restart persistence.
- [ ] Verify visual parity at approved viewports and rehearse source-to-target allocation history transfer on an authorized disposable legacy copy.
- [ ] Migrate transfer, audit, maintenance, repair, disposal, depreciation, consumables, licenses, tasks and employee asset requests as separate features.

## Asset transfers (`ASSET-TRANSFER-001`)

- [x] Audit legacy record fields, list/search/filter/detail behavior and the approve/reject/receive transitions.
- [x] Identify fake default prices/carrier/tracking/approver values, client-only state changes, unauthenticated receipt claims, hard-coded location choices and toast-only exports.
- [x] Add ADMIN-only server-backed transfer routes, generic-write denial, data revision, field/date/value validation, transactional state transitions and append-only actor/time audit events. Backend integration/unit tests pass.
- [x] Add shared egui list, summaries, search/status/location filters, paging, create/detail, approve/reject and receipt-condition flows. Attribution comes from the authenticated session; receipt wording does not claim recipient identity verification. Shared UI tests, Wasm check, desktop check/build and Trunk bundle pass.
- [x] Verify HTTP lifecycle against isolated SQLite: login, create, approve, receive, reject, and read-after-write; SPA/JS/WASM static assets return HTTP 200.
- [x] Add a read-only source exporter (server collection preferred, browser cache fallback), ADMIN summary preview and append-only import with exact confirmation; fixture tests cover auth/network failure, paging, no writes, field preservation, unverified claims, duplicate codes, conflicts and stale-plan rejection.
- [x] Build the post-import WebAssembly bundle and distinct Windows native test EXE; package signatures and Rust target checks pass.
- [ ] Serve the paired UI/API and exercise browser/native transitions plus restart persistence.
- [ ] Compare each route against legacy at matched viewports/device scales; 100% UI fidelity remains unproven. Keep PDF/Excel controls unavailable until actual output exists.

## Shared navigation shell — icon assets and mobile drawer

- [x] Use the same Ant Design SVG identities as the legacy admin menu, employee menu and mobile bottom shortcuts; package them as static MIT-attributed assets and cache their egui textures.
- [x] Test all 25 SVGs rasterize and test every admin/employee root-icon mapping.
- [x] Match the legacy mobile drawer width breakpoints (260px through 768px; 270px from 769–992px) and assert its rendered overlay bounds at 390, 768, 769 and 992px.
- [ ] Serve the current bundle and compare legacy/Rust screenshots at matching desktop, tablet and mobile viewports; inspect icon tint, size, row spacing, active/expanded states and drawer shadow.
- [ ] Click through the same routes on the WebAssembly canvas and native Windows app; verify navigation state and responsive interactions. A successful compile/package is not pixel or runtime acceptance.

## Login screen — shared WebAssembly/native source slice

- [x] Read-only audit of `legacy/web/src/pages/Login.tsx`; Rust card/control widths, card padding, vertical gaps, input icon identities/tint, Google logo and footer follow the legacy structure.
- [x] Rendered current Wasm canvas and legacy Vite app at 1280×800 and 390×844; typed into the canvas field and verified empty-submit validation without sending a login request. Evidence is in `build/kiyovn-login-parity-pixel-aligned-evidence-20261009/`.
- [ ] Match browser text rasterization, antialiasing, focused/hover/error states and all viewport/device-scale combinations exactly; current egui/canvas screenshots retain small raster differences.
- [ ] Launch and click through the same screen in the Windows native app and validate Linux/macOS native rendering.
- [ ] Configure and test secure signed Google OAuth/OIDC. The legacy route accepts unsigned identity data, so the Rust affordance currently reports SSO as not safely configured rather than preserving that vulnerability.

## Asset maintenance (`ASSET-MAINTENANCE-001`)

- [x] Audit legacy maintenance fields, server/cache precedence, filters, plan/detail/perform interactions and false completion/checklist/certificate defaults.
- [x] Add shared Rust plan list/search/status/frequency filters, summary cards, create/detail/checklist and explicit maintenance completion.
- [x] Persist ADMIN-created plans; leave new checklist/health/cost/certificate unset rather than claiming work happened; record completion actor/time, recurrence, history and audit event on the server.
- [x] Add a read-only source exporter and ADMIN append-only preview/apply import; preserve legacy rows and unknown fields, count unverified completion/certificate/checklist claims, and block conflicts/stale confirmations without overwrites.
- [x] Keep the legacy-compatible collection GET available for export, block generic writes and route normal asset maintenance to the typed API.
- [ ] Serve the current WASM/API and exercise plan, detail and completion interactions; verify browser refresh and server restart persistence.
- [ ] Click through the Windows native screen and verify Linux/macOS native builds; compare the full screen, forms, details and modal states at matching viewport/device scales. 100% parity remains unproven.
- [ ] Export/import a real authorized legacy copy, verify source/target counts and review unverified historical claims. No production or real legacy data has been transferred.

## Asset repairs (`ASSET-REPAIRS-001`)

- [x] Audit legacy fields, list/search/status/severity filters, create form, detail drawer, quote approval and completion dialog.
- [x] Add shared egui view at the existing `/admin/assets/repairs` route, with page-size-8 list, search/filters, create/detail and both lifecycle dialogs.
- [x] Preserve existing collection rows and unknown fields; validate new records and persist quote approval/completion with authenticated actor/time plus audit events.
- [x] Add ADMIN-only typed API routes and block generic mutation bypasses; keep legacy-compatible ADMIN collection reads available.
- [x] Build the current Trunk bundle and a distinct Windows EXE; serve the bundle from an isolated SQLite preview and verify HTML/JS/WASM HTTP responses plus ADMIN create/approve/complete/list via HTTP.
- [ ] Click through the WASM canvas create/approve/complete UI, verify refresh/restart persistence, launch the current native EXE and exercise the same flows.
- [ ] Compare list, four cards, table columns, create form, detail drawer and completion dialog against legacy screenshots at matched viewport/device scales. Exact 100% parity is not proven.
- [ ] Confirm whether historical `asset_repairs` rows are already present in the target DB on a disposable copy; reconcile source/target counts without editing the legacy source or treating legacy approvals/completions as Rust-verified events.

## Asset disposal / loss (`ASSET-DISPOSAL-001`)

- [x] Audit source list, search/status/method filters, four summary cards, create form, Mẫu 02-TSCĐ detail, final-price approval and data-wipe checkbox; confirm that legacy Excel/PDF buttons are toast-only.
- [x] Add ADMIN typed list/create/approve API, append-only audit events, server-side accounting calculations, duplicate-transition protection and generic-write bypass rejection while preserving unknown existing fields.
- [x] Wire the shared egui screen to `/admin/assets/disposal`; implement the page-size-8 list, CSV export, create/detail/approval states for shared native/WASM code.
- [x] Run the full workspace suite (172 backend + 254 UI/API tests) and target-specific Windows desktop + `wasm32-unknown-unknown` checks against the final source.
- [x] Add and synthetic-test a read-only exporter and guarded ADMIN preview/apply importer for server/browser-cache `asset_disposals`; append-only, exact-confirmation and stale-plan protections are HTTP-tested. No live/real data was read or transferred; an authorized disposable-copy rehearsal remains outstanding.
- [ ] Click through the current WASM canvas and native desktop; verify create/approve, CSV save, refresh and server restart persistence.
- [ ] Compare the four cards, all filters/table columns, create form, document drawer and approval modal with legacy at identical sizes and scale. Exact 100% parity is not proven; no paired screenshots exist yet.
- [ ] Keep historical wipe assertions unverified until evidence is independently recorded; do not interpret a user checkbox or legacy static NIST text as verified erasure.

## Asset depreciation (`ASSET-DEPRECIATION-001`)

- [x] Audit source fields, four KPI cards, search/status/method filters, page-size-8 table, create form, schedule drawer, pause/resume and current-month run dialog.
- [x] Wire shared egui `/admin/assets/depreciation` with those controls, schedule details, org-unit choices, current-month run preview and actual CSV export for native/WASM.
- [x] Preserve legacy monthly rounding/field shape; persist and audit the monthly run once per period, while explicitly disclosing that no finance general ledger is updated.
- [x] Add the read-only legacy exporter and ADMIN-only preview/apply append-only import path; preserve unknown fields and mark imported history unverified.
- [x] Show a warning for imported legacy rows and exclude their unverified history from monthly preview and run.
- [x] Pass full workspace suites (181 backend + 260 UI/API), synthetic exporter fixture, and desktop/WASM target checks.
- [ ] Click through the current canvas/native screen, save CSV, refresh and restart the server to verify persisted records and run history.
- [ ] Compare every KPI, filter, table column, create field, schedule detail and run dialog with legacy screenshots at matched viewport/device scales. Exact 100% parity is not established; the CUA screenshot session could not initialize.
- [ ] No real legacy depreciation data has been transferred. Only rehearse with a disposable copy after explicit authorization.

## Enterprise report catalog (`reports_catalog`) — in progress

- [x] Audit the legacy record fields, five category tabs, search fields, decorative period selector, four KPI cards, page-size-8 table, create modal, detail drawer and message-only PDF/Excel/print actions.
- [x] Add shared egui `/admin/reports` backed by ADMIN-protected collection reads and ADMIN record creation; preserve camelCase fields, timestamp-string keys and unknown JSON fields.
- [x] Pass the report UI tests, ADMIN-denial/persistence HTTP test, importer tests, and current full workspace suite (187 backend + 270 UI/API).
- [x] Add a read-only legacy exporter for `reports_catalog`: server-first, browser-cache fallback only when the server is empty, scoped token use and synthetic tests for paging/fallback/read-only/fail-closed behavior.
- [x] Add the ADMIN preview/apply append-only importer and shared migration UI: digest/revision-bound preview, exact confirmation, transactional insert-only apply, identical-row skip, conflict/replay rejection and summary audit. No real browser profile or report data has been accessed.
- [x] Current-source Rust 1.89 compile checks pass for the WebAssembly and Windows desktop targets; this is compile evidence, not runtime or visual verification.
- [x] Build `build/KIYOVN-Enterprise-reports-catalog-final-test-20261011.exe` from the current tree and launch the native app; its window remained responsive. Authenticated native route click-through is still pending.
- [ ] Click through current native and WebAssembly builds against an isolated synthetic database; verify create/list/detail, role boundaries and restart persistence.
- [ ] Compare every card, filter, table column, modal and drawer against legacy at identical viewport/device scale. Exact 100% visual parity is not established.
