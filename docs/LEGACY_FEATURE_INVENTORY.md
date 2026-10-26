# Legacy feature inventory — initial audit

This is a source-backed inventory of the legacy application, not a parity claim. `legacy/` remains read-only. The inventory is intentionally marked `DISCOVERED` until each workflow, API contract, permission, persistence path and failure state has been traced and tested.

## Sources examined

- `legacy/AI_PROJECT_RULES.md`, `README.md`, `ARCHITECTURE.md`, `PROJECT_STRUCTURE.md`, `CURRENT_STATE.md`, `API_CONTRACT.md`, `DATABASE_SCHEMA.md`, `CHANGELOG_AI.md`.
- `legacy/web/src/App.tsx`, `api/`, `pages/`, `components/`, `services/`, `utils/`, `context/`, `features/` and `modules/`.
- `legacy/api/index.mjs`, `db.mjs`, `serializers.mjs`, `crypto.mjs`, scripts and deployment files.
- Current target: `server/`, `ui/`, `desktop/`, `web/` and `docs/MIGRATION_MATRIX.md`.

## Discovered legacy module groups

Counts are TypeScript source files under each directory, not counts of completed business features. A single source file can contain multiple workflows; each group still needs feature-level decomposition.

| Group | Source files | Legacy location | Scope discovered |
| --- | ---: | --- | --- |
| Admin | 10 | `legacy/web/src/modules/admin/` | Overview, users, roles, permissions, sessions, audit, backup, system and notifications |
| Assets | 14 | `legacy/web/src/modules/assets/` | Assets, allocation, transfer, audits, maintenance, repairs, depreciation, disposal, materials, consumables, licenses and tasks |
| Attendance | 11 | `legacy/web/src/modules/attendance/` | Shifts, assignments, raw data, timesheets, summaries, leave, overtime and alerts |
| Business | 3 | `legacy/web/src/modules/business/` | Organization units/tree and business travel |
| Chat | 41 | `legacy/web/src/modules/chat/` | Chat API/state, channels, DMs, composer, feed, members, attachments, profile, settings and socket/reconnect behavior |
| CRM | 7 | `legacy/web/src/modules/crm/` | Customers, contacts, partners, suppliers, evaluations and feedback |
| Documents | 6 | `legacy/web/src/modules/documents/` | Document overview, archives, notes, settings and contract templates |
| eKYC | 17 | `legacy/web/src/modules/ekyc/` | Camera, CCCD scanning, QR, OCR, face detection/match and liveness paths |
| Employee | 16 | `legacy/web/src/modules/employee/` | Portal, profile, onboarding, contracts, files, leave, overtime, payslips, assets, proposals, notifications, signatures and identity verification |
| Files | 1 | `legacy/web/src/modules/files/` | Cloud Drive module; also cross-referenced by `legacy/web/src/pages/Files.tsx` and file utilities |
| Finance | 25 | `legacy/web/src/modules/finance/` | Cash/bank accounts and vouchers, statements, e-banking placeholders and internal transfer; invoices, e-invoice, sales/purchasing, payables/receivables, ledger, budgets, tax, payroll, assets, inventory, loans and signatures |
| HR | 14 | `legacy/web/src/modules/hr/` | Employees, contracts, history, onboarding, recruitment, headcount, certificates, training, uniforms, rewards, proposals and performance |
| Insurance | 1 | `legacy/web/src/modules/insurance/` | Insurance profiles, adjustments, benefits and reconciliation paths |
| Meeting rooms | 1 | `legacy/web/src/modules/meetingRooms/` | Room booking, schedule and equipment |
| Plans | 7 | `legacy/web/src/modules/plans/` | Plans, tasks, milestones, progress, roadmap and reports |
| Reports | 1 | `legacy/web/src/modules/reports/` | Reports and business intelligence |
| Services | 2 | `legacy/web/src/modules/services/` | Enterprise services and SLA |
| Settings | 6 | `legacy/web/src/modules/settings/` | Account, appearance, system, security, logs and two-step verification |
| Tickets | 2 | `legacy/web/src/modules/tickets/` | Tickets and incidents |
| Workflows | 5 | `legacy/web/src/modules/workflows/` | Overview, requests, history, configuration and approvals |

Total discovered in these module directories: **190 `.ts`/`.tsx` files across 20 groups**. The full `legacy/web/src/` contains 298 files, including shared UI, pages, document editor, services, contexts and utilities. A text search found 92 client HTTP-call sites in the selected API/module/page trees; this is a call-site count, **not** a unique endpoint count. Route dispatch still requires normalization into unique contracts.

## Shared application surfaces

| Surface | Source | Required audit |
| --- | --- | --- |
| Routing and application shell | `legacy/web/src/App.tsx`, `main.tsx`, generic page/router helpers | Routes, roles, shell states, navigation and not-found behavior |
| Login and activation | `legacy/web/src/pages/Login.tsx`, `ActivateAccount.tsx`, `context/AuthContext.tsx` | Session lifecycle, invalid credentials, activation, expiry and redirects |
| Dashboard | `legacy/web/src/pages/dashboard/` | Real aggregations, filters, empty/error states and permissions |
| Shared custom UI | `legacy/web/src/custom-ui/`, `components/KTable.tsx` | Component behavior, table operations, theme, forms and modal states |
| Files and editor | `pages/Files.tsx`, `pages/DocumentEditorPage.tsx`, `features/documents/editor/` | File persistence and full editor model/input/rendering contracts |
| Services and utilities | `services/`, `utils/`, `hooks/`, `context/` | API dependencies, address data, exports, security, camera and storage |
| Static assets | `legacy/web/public/`, `legacy/web/src/assets/` | Logos, fonts and signature/media assets; review licenses and intended use |

## Current Rust target snapshot (not exhaustive)

- Backend route groups currently include health/platform, auth, dashboard, users, employees, files, meeting rooms, workflow blueprints and admin-only workflow request submission, storage mode and generic collections. Dedicated legacy parity is not implied by route existence.
- Shared Rust views currently include activation, assets, attendance, chat, CRM, dashboard, document editor, employee portal, employees, files, finance, insurance, login, meeting rooms, org units, settings, signatures, users, workflow placeholders, and API-backed workflow blueprint/request screens. These new slices remain unverified and partial.
- Existing verified slices are recorded in `docs/MIGRATION_MATRIX.md`; several Rust views are scaffolds or have incomplete API integration.
- Admin Users, HR Employees, employee phone self-profile and Organization Units core now use real Rust API data; their residual gaps and verification are recorded as `PARTIAL` in `docs/MIGRATION_MATRIX.md`.
- Remaining screen-scope gaps include employee full-personnel/self-service forms, SMTP, notes/direct-email workflows and other module actions; a view file's presence is not evidence of parity.

## Admin system notifications — focused audit

- UI source: `legacy/web/src/modules/admin/AdminSystemNotificationsModule.tsx`. It provides list/search/type filtering, summary cards, create/edit/detail/delete, resend confirmation and activation-email template/config controls.
- Persistence: `legacy/web/src/services/dataService.ts` stores `system_broadcasts` in the generic collection and local cache. Create derives a recipient estimate, uses a timestamp-derived ID, stores an initial read count, and adds a personal notification to the current ADMIN. Edit merges fields; delete removes the record.
- Delivery behavior: selected Email channel resolves recipient email addresses via employees/department and calls `systemApi.sendEmail`; failures are caught and the page still reports success. Resend similarly catches mail failure, adds an ADMIN personal notification and updates estimated read/recipient counts. These counters are not reliable delivery/read receipts.
- Related ADMIN-only mail API contract: `GET/PUT /system/email-config`, `POST /system/email-config/test`, `POST /system/send-email`, and `GET/PUT /system/notification-templates/account-activation`. The legacy config GET returns the decrypted SMTP password; send-email can return HTTP success with per-recipient errors after partial delivery. Activation template fields are HTML-escaped by the server when building actual activation mail, despite the editor's HTML claim. See `docs/API_PARITY_MATRIX.md` for the source-backed details/security decision.
- Rust slice: persistent draft CRUD plus ADMIN-only activation-template read/write now exist in `server/src/main.rs` and shared egui `ui/src/views/system_broadcasts.rs`; SMTP config/test/send, SMS, recipient fan-out, scheduling, resend and analytics remain unimplemented and are not represented as successful.
- This is a focused workflow audit, not full discovery of all 20 module groups or unique API contracts.

## Attendance — focused audit; full module inventory pending

- The directory contains 11 files: overview, alerts, shift catalog, shift assignment, raw data, timesheet, timesheet summary, leave requests, leave summary, leave plans and overtime.
- `ShiftsModule.tsx` reads `attendance_shifts` through `dataService.getGenericData` and persists additions through `saveGenericData`/collection replacement. Its shift fields include code/name, time range, working hours, work-unit conversion, break time, applicable group, grace minutes, night allowance, category and status. Summary claims about staff counts/device coverage and the “sync to FaceID” action have no source-backed integration and are not treated as real capabilities.
- `ShiftAssignmentModule.tsx` uses `attendance_shift_assignments` generic data, accepts free-form employee identity fields and fabricates an employee code when omitted. Its swap approval/rejection updates local collection state without a server-side actor/workflow record; no source UI was found that creates pending swap requests. Rust now has an ADMIN-only typed assignment list/create/detail/history slice using active HR employee and shift records; legacy rows remain unimported and generic writes are blocked.
- `legacy/api/index.mjs` explicitly allowlists `attendance.leave-requests` and `attendance.overtime-requests` as user-scoped collection scopes. The other attendance modules and their storage/permissions still need individual tracing; no complete attendance API or DB contract is claimed here.
- Rust now has a separate typed employee overtime request and ADMIN decision/event flow. It does not migrate legacy local cache rows or the admin screen's unverified pay multipliers, base rate, monthly cap, or estimated payroll.
- Rust now has a typed ADMIN shift-assignment list/create/detail/history flow tied to real employee and shift records. The old generic collection is still available to ADMIN for review but is not imported; free-text identity, unreachable swap decisions and fake FaceID/SLA/export claims are not treated as verified capabilities.
- Rust now has an ADMIN-backed shift-catalog slice. The generic attendance view no longer presents sample attendance or local-only check-in/leave success. Other attendance workflows remain `NOT_STARTED`/`IN_PROGRESS` and must be decomposed into feature IDs.
- `LeaveRequestsModule.tsx` is an ADMIN UI backed by local/cache collection calls to `leave_requests`; it lists, filters, details, creates and changes pending status. Summary balances/SLA/approver stages/attendance sync and print/export success are not supported by verified backend behavior. `EmployeeLeavesModule.tsx` reads fallback `employee_leaves`; the legacy generic API filters USER records by `owner_id`, but the UI derives identity from `localStorage` with hard-coded defaults and calculates a fixed 12-day quota. Its mirrored `leave_requests` write may fail while the local UI still reports success. Rust preserves the generic scopes as ADMIN-only and adds a separate authenticated-user/HR-profile leave-request table, ADMIN one-time decision API and append-only event history; the shared egui self-service route is implemented but unverified. No historical leave data, balance policy or attendance deduction has been migrated.

## Workflow blueprints — focused audit

- UI source: `legacy/web/src/modules/workflows/WorkflowsModule.tsx`; it reads/writes `workflow_blueprints` through the generic data service.
- Migrated catalog behavior: code/name/category/scope/version/SLA/budget, generated approval-step configuration, three standard form fields, search/category/status filtering, detail view and active/paused status.
- Legacy `passRate: 100` is fabricated at create time; existing run counters are schema fields but the Rust target has no execution engine. The Rust catalog starts with zero counters, doesn't claim metrics, and disables the legacy success-only Excel/BPMN export.
- Rust's typed list/create/status endpoints live in `server/src/workflows.rs`, are ADMIN-only, and generic writes for `workflow_blueprints` are blocked. The same UI explicitly says PKI flags are configuration only and do not verify tokens or sign documents.
- Not included in the blueprint-catalog slice: request decisions/lifecycle, audit history, settings, employee tasks/proposals, notifications, scheduling, real PKI, export and legacy browser-storage import. Request submission was migrated separately as a partial slice; this is not full parity.

## Remaining workflow modules — focused audit

- `WorkflowRequestsModule.tsx` reads and writes `workflow_requests` through `dataService`; there is no remote request endpoint in the legacy module. Create assigns a fixed three-level route, fabricated attachment metadata and status/deadline values. Its “sign” action accepts a prefilled PIN and manufactures provider, certificate ID and SHA-256 data client-side; reject/change actions mutate local state. Export/download controls only show success messages. The Rust target has a separate ADMIN-only typed submission endpoint; it does not import or trust those client-side artifacts.
- `WorkflowOverviewModule.tsx` combines local workflow items with task, employee proposal and contract API data. It uses a fixed `TODAY` date and derives SLA/timeline labels; these are not persisted approval/audit history. Each underlying API must be mapped independently before restoring the overview.
- `WorkflowHistoryModule.tsx` has an empty data array but static totals (1,420, 1,375, 45 and 100%); integrity verification and PDF/Excel actions return success toasts without checking a provider or producing artifacts.
- `WorkflowSettingsModule.tsx` reads budget tiers from `workflow_settings`, but tier edits only update React state; delegation records are component-local, and the security-policy save only reports success. CA/Slack/auto-escalation summary claims are hard-coded.
- Rust now has ADMIN-only typed request list/create/decision routes, append-only actor/time/note events, and a history view over those records. Ordinary steps allow unsigned approve/reject/return; the creator cannot decide their own request, and PKI-required steps remain blocked. There is no employee/approver assignment or return/resubmission yet; fake attachments/signatures remain excluded. Settings/overview are placeholders. Further work needs real ownership/role resolution, attachment links, provider verification, and durable settings/scheduling. Do not emulate legacy fake signature/history values.
- Employee proposals are a separate, real `employee_proposals` table/API (`GET/POST /employee-proposals`, owner-scoped detail, ADMIN review); the shared employee and HR pages create, inspect, approve and reject with review metadata. Legacy code uses a KNG date/random code, validates title/type/content/amount, scopes USER reads to submitter and allows one-time ADMIN review. The success toast mentions feedback delivery, but the endpoint only persists a note; it does not send a notification. Rust now has a typed SQLite table/handlers and shared egui pages, with role/persistence/validation test source added but not run.

## Audit rule

For every discovered feature, add a granular ID to `MIGRATION_MATRIX.md` with source files, API, tables, role, success/error behavior, target code, tests and evidence. Do not treat this group-level inventory as sufficient coverage.

## Enterprise tasks — focused audit

- Source: `legacy/web/src/api/endpoints.ts` `tasksApi`, `legacy/api/index.mjs`, `legacy/api/db.mjs`, and `legacy/web/src/modules/plans/TasksModule.tsx`.
- Behavior covers assignee lookup, scoped list/detail, create with generated `TASK-YYYYMMDD-8HEX` code and up to 30 checklist items, ADMIN edit/delete, assignee progress/status update, checklist toggles, comments, reports and activity history. Non-ADMIN status cannot directly be `Hoàn thành`; a report requesting completion is normalized to `Chờ nghiệm thu`. Legacy report attachments are metadata in these task tables, not bytes uploaded by this API.
- Rust adds typed Axum routes and normalized task/checklist/comment/activity/report tables. Shared egui lists `/admin/tasks` and `/employee/tasks`, creates admin tasks, tracks progress/checklist, sends text reports/comments and confirms destructive deletion.
- Migrated: ADMIN task field edits, task-scoped report file upload/download/delete ACL, and server-authorized USER creation for the exact department/manager/dependent-unit scope. `POST /api/v1/tasks/batch` creates one task per selected assignee (up to 1,000) atomically and rechecks every assignee on the server; batch creation and rollback cases pass integration tests. Remaining: platform runtime checks and legacy row/localStorage import. No parity-complete claim is made.

## Strategic plan list — focused audit

- Source: `legacy/web/src/modules/plans/PlanListModule.tsx` and `legacy/web/src/services/dataService.ts`; localStorage-backed `plan_items` list/search, create and mark-complete.
- The page's `94.5%` OKR card is a literal constant, and “Xuất Excel” only emits a success toast without producing a file. These are excluded from the Rust parity claim.
- Rust slice: ADMIN-only typed `/api/v1/plans` list/create/complete routes persist in `collection_records`; generic reads/writes for `plan_items` are restricted. Shared egui implements search, data-derived totals, create and complete.
- Remaining: safe localStorage/legacy-record import, runtime tests and visual parity. Rust test source is not runtime evidence.

## Strategic plan milestones — focused audit

- Source: `legacy/web/src/modules/plans/PlanMilestonesModule.tsx`; local `plan_milestones`, quarter/achieved filters, free-text search, create, detail drawer and mark-achieved transition (`progress=100`, status `Đã đạt mốc`).
- The 94.5% OKR card is hard-coded. Both print buttons only show success messages and do not create a document; these behaviors are not reproduced as successful operations.
- Rust slice: ADMIN-only typed list/create/achieve API; persistent `collection_records`; generic scope reads/writes restricted; shared egui list, filters, summaries, create, detail and transition.
- Remaining: safe localStorage import, real acceptance-report output, runtime tests and visual parity. Rust test source is not runtime evidence.

## Strategic plan progress — focused audit

- Source: `legacy/web/src/modules/plans/PlanProgressModule.tsx`; local `plan_progress` list, search, filters (100%, 80–99%, under 80%), details and update-progress dialog. This module has no create operation.
- Editing percentage sets status to `Hoàn thành` at 100 and `Đúng tiến độ` otherwise; it leaves due date, stored days remaining, weight and ownership unchanged. The current 100% SLA KPI is a literal and print/Excel controls only toast success.
- Rust slice: ADMIN-only typed list/update, transactional `collection_records` update and percentage validation; shared egui table/detail/editor/paging with data-derived unweighted mean and explicit unavailable export/SLA claims.
- Remaining: safe legacy localStorage import, runtime tests and visual parity; due-day recomputation/SLA scheduler and real report artifacts are not implemented by this slice.

## Strategic plan reports — focused audit

- Source: `legacy/web/src/modules/plans/PlanReportsModule.tsx`; static `REPORT_DATA` initializes the component, then `dataService.getGenericData('plan_reports')` replaces it. The create handler only calls `setData`; it never calls `saveGenericData`, so new reports do not survive reload. Its period selector does not filter the list or summary.
- The five starter reports and their nested project examples are hard-coded. Creating a report also fabricates a nested “Dự án mục tiêu quý mới”. Print A4 and Excel buttons only show success toasts; no file is produced.
- Rust slice: ADMIN-only typed list/create/update and persistent self-reported values; old camelCase rows without a period are marked “Chưa xác định kỳ”, arbitrary nested project JSON is preserved on updates, and the shared egui screen provides real period filtering, search, summaries, detail, completion progress and correction.
- Remaining: safe localStorage import, real PDF/Excel generation, browser/native runtime and visual parity. Self-reported budgets/KPI are not reconciled against accounting or source plans; no fake project rows are shown.

## Strategic roadmap / OKR — focused audit

- Source routes: `/plans/roadmap`, `/plans/okr`, `/plans/projects` map to `legacy/web/src/modules/plans/StrategicRoadmapModule.tsx`; collection scope is local `plan_okrs`.
- Real interactions: create an OKR (code, title, pillar, owner, target metric, progress, deadline), search by code/title/pillar/owner, filter the four canonical pillars, inspect a details drawer and paginate eight rows. There is no update/delete operation in this module.
- Integrity gaps: the empty starter list is truthful, but the revenue/ARR card and “4 pillars” KPI are hard-coded; average progress yields `NaN` when empty; `Number(progressPct) || 50` prevents storing 0; “sync progress” and print controls only toast success. New status is always `Đang đúng tiến độ` regardless of initial progress.
- Rust slice: typed ADMIN-only persistent list/create, validated unique code, canonical pillar, required text, finite progress and calendar date; shared egui supports the real interactions and derives summary values from saved records. The fake revenue KPI, fictitious sync and successful-print claims are removed.
- Remaining: localStorage import, real source-system sync, post-create progress editing, actual PDF output, runtime tests and visual parity. Test source is not runtime evidence.

## CRM contacts — focused source-to-target audit

- Legacy sources: `legacy/web/src/modules/crm/CRMContactsModule.tsx`, `legacy/web/src/api/endpoints.ts` (`crmContactsApi`), `legacy/api/index.mjs` (`publicCrmContact`, validation and `/crm/contacts` handlers), `legacy/api/db.mjs` (`crm_contacts`), and `legacy/api/crypto.mjs`.
- The migrated slice covers ADMIN type-filtered listing and creation, `customer|supplier|partner`, all contact fields, automatic KH/NCC/DT code generation, search and summaries based on visible results, details and create form. Legacy's export action only displayed a success toast and is not claimed as a working export.
- Rust targets: `server/src/crm.rs`, CRM schema in `server/src/main.rs`, `ui/src/api.rs`, `ui/src/views/crm.rs`, and CRM route dispatch in `ui/src/app.rs`.
- Follow-up CRM slices cover supplier evaluations and customer feedback with typed Rust APIs, shared egui views and a guarded importer for those two legacy localStorage collections. CRM contacts now also have a separate offline, read-only SQLite exporter and guarded ADMIN preview/apply flow. The broader dynamic-call audit and additional CRM functionality remain open; no real legacy contact/evaluation/feedback rows have been imported (only synthetic fixtures were used for tests).

## HR training courses — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/hr/TrainingModule.tsx`; collection `hr_training_courses` via `collectionsApi.get/create`.
- Real screen behavior: ADMIN loads courses, searches code/name/category/instructor, filters status, opens a detail drawer, and creates a scheduled course with category, instructor, dates, hours, planned seats, budget and location.
- The legacy completion-rate field has no audited update workflow. The 100% annual participation and 96.4% exam KPI are hard-coded. Export, attendance-list export and digital-certificate buttons show success without generating files or issuing certificates.
- Rust target: `server/src/hr_training.rs`, typed router and generic-scope guards in `server/src/main.rs`, DTO/client in `ui/src/api.rs`, and shared canvas view `ui/src/views/hr_training.rs`.
- Old records remain in the compatible collection scope, but there is not yet a reviewed localStorage/legacy database import. No participant roster, attendance, exam-result or certificate entity is inferred from the display-only counters.

## HR certificates — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/hr/CertificatesModule.tsx`; collection `hr_certificates` via `collectionsApi.get/create`.
- Real screen behavior: ADMIN search/status filtering, certificate detail and create form for code, certificate, holder, issuer, credential ID, dates, sponsorship amount and optional verification URL.
- Integrity gaps: create synthesizes an employee code from the clock when none is supplied, assumes company sponsorship and an 8,000,000 VND exam fee, and creates a Credly URL from a credential ID. The source does not confirm any of those facts with HR or the issuing organization. Status is stored as a label and can become stale. Export, copy-link and recertification controls only show success messages; no file, clipboard operation or funding workflow is performed.
- Rust target: `server/src/hr_certificates.rs`, typed route and generic-scope guards in `server/src/main.rs`, DTO/client in `ui/src/api.rs`, and shared canvas view `ui/src/views/hr_certificates.rs`. The server resolves employee code to an HR profile, snapshots the canonical identity, validates dates/HTTPS links/fees, and derives expiry status when listing.
- Existing compatible-scope JSON is read through the typed API; localStorage/legacy database import is not performed. No external certificate verification, export, or recertification funding is claimed.

## HR uniforms — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/hr/UniformsModule.tsx`; collection `hr_uniforms` via generic collection GET/POST/PATCH.
- Real screen behavior: ADMIN search/status filter, detail, request creation (item, size, quantity, note), and moving a request from “Chờ cấp phát” to “Đã bàn giao”.
- Integrity gaps: create synthesizes an employee code if absent and a delivery date three days ahead; handover manufactures a `receiverSign` string instead of collecting a signature. The 120-piece stock card and Friday delivery claim are hard-coded, and Excel only displays a success toast.
- Rust target: `server/src/hr_uniforms.rs`, typed router and generic-scope guards in `server/src/main.rs`, DTO/client in `ui/src/api.rs`, and shared canvas view in `ui/src/views/hr_uniforms.rs`. Requests resolve real HR profiles and snapshot canonical identity. A one-time ADMIN action records that the handover was recorded, by whom and when; it is explicitly not a receiver acknowledgment.
- Existing server-side collection JSON remains available through the typed ADMIN list. No localStorage import, stock ledger, actual receiver signature, promised delivery date or export file is implemented/claimed.

## HR onboarding — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/hr/OnboardingModule.tsx`; collection `hr_onboarding_tasks` via GET/POST.
- Persisted behavior: load/search/filter/detail and create an onboarding record with employee fields, start date, mentor, phone, and a 60-day evaluation date. The create handler invents an employee code if absent, starts progress at 15%, marks laptop/email as provided and contract unsigned, and writes the record once.
- Non-persisted behavior: the five-step checklist is static; visual checkmarks derive from the progress number. The “complete & sign contract” button only updates component state and reports a success message. A 96.8% pass rate is hard-coded and export only toasts success.
- Rust target: `server/src/hr_onboarding.rs`, typed route and generic-scope guards in `server/src/main.rs`, DTO/client in `ui/src/api.rs`, and shared view in `ui/src/views/hr_onboarding.rs`. New rows resolve both employee and mentor from HR profiles and snapshot identity. Legacy row JSON and unknown fields remain decodable.
- The Rust view keeps the step descriptions but has no completion state, and makes this limitation explicit. No policy-backed probation evaluation, provisioning acknowledgment, contract signing, localStorage import or export artifact is claimed.

## HR recruitment — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/hr/RecruitmentModule.tsx`; collection `hr_job_openings` via generic GET/POST.
- Persisted behavior: list/search/status filter/detail and create opening fields (code, title, department, level, requested headcount, salary range, deadline, recruiter and experience requirements). New rows initialize applicant/interview/offer counts to zero and status to “Đang tuyển dụng”. No audited code updates those funnel counters or changes opening status.
- Unsupported legacy presentation/actions: 92% offer acceptance and 16.5-day time-to-hire are hard-coded; export, copy-JD and “open candidate list” only show toast messages. The CV drawer merely reads the unchanging counters and has no candidate records.
- Rust target: `server/src/hr_recruitment.rs`, typed `/api/v1/hr/recruitment-openings`, generic-scope guards in `server/src/main.rs`, typed client/DTO in `ui/src/api.rs`, and `/admin/hr/recruitment` shared egui view. The API omits the unsupported counters and assigns new record identity/status/creator on the server.
- Candidate data/privacy, application state transitions, real hiring outcomes, public JD publishing/export, status mutation, historical import and directory-backed department/position selectors require follow-up contracts; they are not claimed as migrated.

## HR headcount — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/hr/HeadcountModule.tsx`; generic collection `hr_headcount_quotas` GET/POST plus organization-unit and position dropdown lookups.
- Persisted behavior: search/status filter/detail/create for department, position/code, quota, client-entered actual, salary budget, level distribution, derived vacancy/status. The create form seeds quota 10, actual 8 and a salary budget; fallback localStorage is used when the collection is empty or the request fails. Static approval/fill-rate/pipeline claims are not reliable.
- Rust target: `server/src/hr_headcount.rs`, typed `/api/v1/hr/headcount-quotas`, collection guards in `server/src/main.rs`, API DTO/client and `/admin/hr/headcount` shared egui view. New quota and planned budget are inputs; actual headcount is derived from active, non-retired/non-pending HR accounts with an exact normalized department/position match. Vacancy and status follow from that calculation.
- The view removes localStorage fallback and approval claims; planned salary budget is not payroll or an approved allocation. The source has no edit/approval mutation, catalog-backed selectors remain open, and the toast-only recruitment redirect is not repeated as a successful action.

## HR rewards — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/hr/RewardsModule.tsx`; generic collection `hr_rewards` GET/POST/PATCH.
- Persisted behavior: create/list award records with employee or team, title/type/value, decision number/date and summary; new records start at “Chờ duyệt”. Legacy status transitions are client-side writes, and the award action can be used before approval. Employee identity/signer fields are client-controlled.
- Unsupported presentation/actions: eNPS and fund totals are static or mix incomparable values; PDF/book export only reports toast success. A status named “Đã ký quyết định” is not evidence of a digital signature; “Đã trao giải” is not proof of payment or receipt.
- Rust target: `server/src/hr_rewards.rs`, typed `/api/v1/hr/rewards` list/create and one-time approve/award endpoints, append-only `hr_reward_events` schema/guards in `server/src/main.rs`, typed client and `/admin/hr/rewards` shared egui view. Employee recipient identity is resolved from active HR profiles; team recipient is explicit. Server enforces unique reward code/decision, validates input, records actor ID/time in append-only events and requires pending → approved → awarded. Client-supplied legacy audit-shaped JSON is ignored.
- Separate approver roles, document attachments, payment/receipt evidence, signer authority, historical import, actor display names and audit retention need product/data contracts. Existing collection records remain readable; no legacy/localStorage records were imported.

## HR performance reviews — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/hr/PerformanceReviewModule.tsx`; generic collection `hr_performance_reviews` GET/POST/PATCH, plus organization-unit and position dropdown reads.
- Persisted behavior: creates review records with code, period, free-text employee, self/manager scores, entered evaluator/comment and optional KPI bonus; list/search/grade filter/detail; ADMIN status update from “Chờ phê duyệt điểm” to “Đã hoàn tất đánh giá”.
- Unsupported legacy data/presentation: creation writes constant 54/18/18 three-pillar scores, seeds scores/bonus/evaluator, generates a fake employee code when missing and derives grade from client input. Detail uses fallback pillar values and fabricated comment. UI says approval pays bonus, implies promotion/360 policy, displays company averages/progress and reports successful Excel export without a real artifact.
- Rust target: `server/src/hr_performance_reviews.rs`, typed list/create/approve API, append-only `hr_performance_review_events` and generic scope guards in `server/src/main.rs`, typed DTO/client and `/admin/hr/performance` shared egui view. New employee identity/evaluator/grade/status are server-owned; only submitted self/manager scores, period, code, proposed bonus and comment persist. Approval requires a verified typed creation event. Legacy status/actor/time JSON is not trusted.
- Legacy row review/import, score/grade policy confirmation, separate approver authority, payroll/payment integration and real report export require additional contracts. No legacy/localStorage records were imported.

## HR employee history — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/hr/EmployeeHistoryModule.tsx`; general history list starts from an empty constant and create only calls React `setData`, so general lifecycle entries are not persisted by that module.
- Other tabs are different contracts: bank accounts use generic `employee_bank_accounts` replacement plus local cache and carry account numbers; identity rows are synthesized from employee profile/details and `employee_ekyc_verified` localStorage. The eKYC request and Excel export controls only show toast messages.
- Rust target: typed ADMIN-only `/api/v1/hr/employee-history` backed by append-only SQLite rows; employee code resolves to an existing HR profile and actor/time are server-owned. The shared egui view supports history search/category routes and records only a declared signer, not verified signature or approval.
- Bank account slice: typed owner-scoped employee and ADMIN HR APIs now replace the generic collection path; canonical identity, pending initial status, one-time audited transitions, encrypted sensitive fields, masked display and profile redaction are implemented. The shared UI is connected at HR history, employee profile and payslip routes; generic collection access is blocked for this scope.
- Added a read-only localStorage exporter and ADMIN preview/apply importer for legacy collection rows, employee profile bank fields and exported cache rows. Preview returns no account PII, verifies a digest of source+directory+target state, and apply requires exact confirmation and one atomic transaction. Imported legacy status/primary/approver claims are not trusted; valid records become pending with encrypted source payloads, unresolved records are encrypted in quarantine, and migrated profile bank fields are removed only after encrypted preservation. No importer has been run on production data.
- ADMIN quarantine resolution/adoption now exists with masked list results, exact confirmations and append-only encrypted audit. Applying it to real source rows remains unverified until a disposable-copy operator rehearsal, authorized key provisioning and approved cache cleanup. The target does not treat profile/localStorage values as eKYC proof, and no eKYC provider/evidence contract exists.

## Helpdesk tickets — focused source-to-target audit

- Legacy sources: `legacy/web/src/modules/tickets/TicketsModule.tsx` and `legacy/web/src/services/dataService.ts`. Tickets are stored under the generic `tickets` collection and mirrored in the browser cache; fields include key/code/title/requester/department/priority/status/created date. The client generates ticket codes and updates status through generic writes.
- Unsupported legacy behavior: SLA/response-time figures are static, and Excel/print controls only show success toasts without creating artifacts. The audited ticket UI does not establish an incident workflow or ticket-history import contract.
- Rust target: `server/src/helpdesk_tickets.rs`, `helpdesk_tickets`/`helpdesk_ticket_events` schema and generic-scope guards in `server/src/main.rs`; typed DTO/client and `ui/src/views/helpdesk_tickets.rs`; route `/admin/tickets` in the shared egui app.
- Rust assigns ticket code, creator and timestamps, validates required fields and priority, owns forward status transitions, writes append-only create/status events and prevents generic write/deletion bypass. The UI summarizes only loaded records and does not claim static SLA or toast-only export/print actions as real features.
- Added a read-only exporter for exactly `kiyovn_cache_tickets` plus ADMIN preview/apply APIs and a migration screen. The importer preserves stable IDs/codes/current status/created date, maps the authenticated importer as recorder, keeps only typed source fields, records immutable source hashes and marks imported records `unverified`. Unknown fields, invalid records, duplicate IDs/codes and target collisions block the whole batch. Generic historical collection reads remain ADMIN-only; no old rows are removed.
- Backend/UI tests and a synthetic browser exporter fixture pass. No real localStorage rows were read or imported. Browser/native interaction and visual parity remain open.

## Helpdesk incidents — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/tickets/IncidentsModule.tsx`; `dataService` derives the cache key as `kiyovn_cache_ticket_incidents` from the generic scope `ticket_incidents`. Rows include key/code/title/affected system/severity/occurred/resolved times/handler/downtime/root cause/timeline/action items/status.
- Create persists through the generic collection but fabricates an initial timeline entry, default CAPA/action item and `downtimeMinutes: 0`; the client also chooses key/code/status. Resolve updates component state only and does not call `saveGenericData`, so that transition is not durable.
- The 99.98% uptime, 11.4-minute MTTR, annual downtime budget, “RCA complete”, and report-export success claims are not backed by an authoritative service or generated artifact; they are not copied as production facts.
- Rust target: `server/src/helpdesk_incidents.rs`, dedicated `helpdesk_incidents` and append-only `helpdesk_incident_events` tables, typed ADMIN routes `/api/v1/tickets/incidents*`, UI/API DTOs and shared egui view `ui/src/views/helpdesk_incidents.rs` at `/admin/tickets/incidents`. The server owns code, identity, timestamps and status. Resolution is a one-time persisted action requiring a note; the UI does not call that note an independent RCA.
- The generic legacy collection is retained for ADMIN review, but generic writes and incident deletion are blocked. `tools/export_legacy_helpdesk_incidents.js` reads only `kiyovn_cache_ticket_incidents`, validates row/count/size limits, exports without storage writes or row logging, and warns about internal infrastructure data.
- ADMIN `/api/v1/legacy-import/helpdesk-incidents/{preview,apply}` and `/admin/system/migration/helpdesk-incidents` provide summary-only preview, SHA-256 plan binding, exact confirmation and one SQLite transaction with immutable run/source hashes. Stable keys/codes and supported descriptive fields are preserved; the authenticated importer is the recorder. Old status/resolved time are reset to active/null and shown unverified; the fabricated/unsourced downtime, timeline and CAPA payloads are not promoted to target events. Duplicate/changed sources, unsupported fields and ID/code collisions conflict atomically. Original generic rows and browser cache are not changed.
- Five importer HTTP/normalization tests, UI/API/view contracts, and a synthetic Node VM exporter fixture pass. Full tests/build/Wasm/format checks pass at 97 backend + 134 UI/API tests. No real incident cache was exported or imported; browser/native interaction and visual parity remain open.

## Asset inventory — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/assets/AssetsModule.tsx`. It reads/writes the `asset_items` collection through `dataService`, whose localStorage cache is retained when the server responds with an empty list. The screen supports search by code/barcode/name/model/assignee/location, category/status/department filters, create/edit/delete, details, and book-value summaries.
- The Rust `assets.rs` scaffold previously displayed four hard-coded rows and appended new rows only in memory. It now loads `/api/v1/collections/asset_items` from Rust/Axum and removes the sample inventory. Shared UI exposes search, category/status filters, data-derived summaries, details, and confirmation-backed create/edit/delete.
- The generic Rust collection API retains authenticated reads for `asset_` scopes and restricts writes to ADMIN. `asset_items` now uses a stable revision; full-array replacement requires the current revision, validates key uniqueness/count/record size, and rejects stale writes. Typed decoding preserves unknown JSON properties and legacy IDs.
- Current tests cover persistence, role boundary, stale revision, malformed key sets, DTO casing/unknown-field round-trip, money validation, depreciation arithmetic and edit identity. No real browser-local data was read/imported, no real asset rows were created, and no production database was touched.
- Added `tools/export_legacy_asset_items.js`, which reads only `kiyovn_cache_asset_items`, preserves arbitrary record fields, validates stable keys/size and downloads a protected JSON bundle without changing localStorage. ADMIN-only Rust preview/apply (`server/src/legacy_asset_items_import.rs`) is revision-bound, summary-only, exact-confirmation-bound, append-only and transactionally audited. The shared egui migration screen is at `/admin/system/migration/asset-items`; no real bundle has been exported or imported.
- This is only the master inventory slice. Asset transfer and maintenance have separate partial typed Rust/API/UI and guarded history-import slices; asset materials now have a shared Rust screen over the existing generic collection. Asset audit, repairs, disposal, depreciation history, consumables, licenses, tasks, employee asset requests, real-data transfer and current-source browser/native visual verification remain separate work. See `docs/MIGRATION_MATRIX.md` and `docs/API_PARITY_MATRIX.md` for evidence and gaps.

## Asset allocations and returns — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/assets/AssetAllocationModule.tsx` reads rows from server-side `collectionsApi.get('asset_allocations')`, backed by the authenticated generic collection API; the ADMIN route is paginated (maximum 500 rows per page). It supports issue/return records plus an employee acknowledgment. Its “digital signature” handler accepts any PIN of at least four characters and directly sets `signedByReceiver`; return creation directly reports warehouse receipt without a receipt event. Those two claims are not treated as verified evidence in Rust.
- Rust target: `server/src/asset_allocations.rs`, route registration and revision/size guards in `server/src/main.rs`, typed DTO/client in `ui/src/api.rs`, and shared canvas view `ui/src/views/asset_allocations.rs`.
- ADMIN list/replacement is revisioned. USER access uses the active linked HR profile and exact employee identity; an assigned employee can acknowledge only a pending allocation, which records the authenticated user, timestamp and `authenticated_employee_account` method without setting digital-signature fields. ADMIN can record warehouse receipt only for a pending return. Both transitions update the collection record and append an audit event atomically.
- Tests cover scope, role/state guards, receipt persistence, audit entries and signature-claim separation. A read-only ADMIN exporter paginates the source API using the bearer token in memory and never logs it or row contents; a synthetic-fixture-tested Rust preview/apply importer reports conflicts and unverified claim counts, appends exact records atomically, and never overwrites existing rows. No real source row was exported or imported. Existing legacy-compatible rows remain readable; native runtime, browser click-through/restart and visual parity remain open.

## Asset transfers — focused source audit and current migration slice

- Legacy source: `legacy/web/src/modules/assets/AssetTransferModule.tsx`; `dataService` reads server collection `asset_transfers` when nonempty and otherwise falls back to `kiyovn_cache_asset_transfers`. The page supports list/KPIs, search by transfer/asset/location/custodian/tracking code, status and location filters, create, details, approve, reject, receive-condition entry, and a three-step shipment display.
- Record fields include asset identifiers/value snapshots, origin/destination location/department/custodian, carrier/tracking/shipping cost, transfer/expected/received dates, reason, packaging condition, approver text, approval time, receipt condition and status (`Chờ phê duyệt`, `Đang vận chuyển`, `Đã điều chuyển hoàn tất`, `Từ chối điều chuyển`). The location filter is hard-coded to three regions and the status filter omits rejected rows.
- Integrity gaps: creation supplies fabricated locations, custodians, carrier, tracking number, fee, approver and condition; missing prices become 30,000,000/25,000,000 VND. Approval/rejection/receipt update only local collection state; `approver` is free text rather than authenticated actor evidence, rejection has no reason, and receipt does not authenticate the destination custodian. Excel/PDF buttons only toast success.
- Rust lifecycle now persists in `collection_records`, validates transitions, derives actor/time from authenticated requests, blocks generic writes and keeps generated exports unavailable. `tools/export_legacy_asset_transfers.js` is read-only and chooses server rows before local cache fallback; the ADMIN append-only importer at `/api/v1/legacy-import/asset-transfers/{preview,apply}` preserves unknown fields and labels source claims unverified. Shared importer route: `/admin/system/migration/asset-transfers`. Synthetic fixtures/tests pass; no real transfer data has been exported/imported. Full visual parity, runtime interaction and restart persistence remain open.

## Asset repairs — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/assets/AssetRepairsModule.tsx`; server-backed ADMIN collection `asset_repairs`. The page supports four summary cards, search, status/severity filters, an 8-row table, create form, detail drawer, quote approval and completion modal with actual cost/notes.
- Record fields cover repair code, asset/category/serial, requester/department, severity/unit, vendor/contact, issue/root cause/solution/replaced parts, estimated/actual costs, cost bearer, start/expected/completed dates, warranty, approver, notes and status. Static 100% SLA is not measured; Excel/PDF buttons do not generate files.
- Rust implementation: `server/src/asset_repairs.rs`, ADMIN API routes in `server/src/main.rs`, API DTO/tasks in `ui/src/api.rs` and shared canvas view `ui/src/views/asset_repairs.rs` at `/admin/assets/repairs`.
- Existing `asset_repairs` collection records remain readable and are not rewritten; unknown fields survive. New requests validate required values, selections, dates, nonnegative amounts and unique codes. Approve/complete are one-time transactional transitions with authenticated actor/time and audit events; generic writes cannot bypass the lifecycle.
- Current workspace tests and Windows/WASM compile checks pass. No current-source Trunk bundle, browser/native interaction, restart test, matched legacy screenshots or real-data rehearsal has been completed. Exact 100% UI parity remains unverified; `legacy/` was not modified by this slice.

## Asset disposal / loss — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/assets/AssetDisposalModule.tsx`; `dataService.getGenericData/saveGenericData('asset_disposals')` uses the generic API and persistent browser cache. The page supports four summary cards, search, status/method filters, page-size-8 table, proposal form, Mẫu 02-TSCĐ detail drawer and settlement approval with final price and wipe checkbox.
- Fields include disposal code/method/date; asset/category/serial; reason; original cost, accumulated depreciation, book value, starting/actual price, disposal costs and gain/loss; buyer/contact; council; wipe flag/officer; status and notes. Excel/PDF actions only show success toasts; the legacy UI unconditionally seeds a wipe claim and sample officer, so neither constitutes verification.
- Rust implementation: `server/src/asset_disposals.rs`, ADMIN routes in `server/src/main.rs`, typed API in `ui/src/api.rs` and shared view in `ui/src/views/asset_disposals.rs` at `/admin/assets/disposal`. `tools/export_legacy_asset_disposals.js` reads the server collection and falls back to `kiyovn_cache_asset_disposals` only when empty; ADMIN preview/apply at `/admin/system/migration/asset-disposals` is append-only, digest-bound, and retains unknown fields and historical claims as unverified.
- New settlement writes are authenticated, one-time and audited; accounting values are recalculated server-side. The checkbox is recorded as a user attestation, not independent NIST proof. List CSV export works; detail PDF generation remains open. Full suite (172 backend + 254 UI/API), Windows desktop/WASM checks and synthetic exporter/import HTTP tests pass. No real source rows have been transferred; browser/native click-through, matched screenshots, authorized data rehearsal and exact 100% visual parity remain open. The disposal migration slice did not edit `legacy/`.

## Asset depreciation — focused source-to-target audit

- Legacy source: `legacy/web/src/modules/assets/AssetDepreciationModule.tsx`; collection `asset_depreciations`, route `/admin/assets/depreciation`. Fields include asset/category/department, debit/credit accounts, method, original/residual value, useful life, month counters, monthly/yearly expense, accumulated depreciation, net book value, dates, state, notes and monthly schedule.
- Source controls: four summary cards, code/name/category/department/cost-account search, status/method filters, page-size-8 table, create form, monthly schedule drawer, pause/resume and current-month run modal. Its three method labels share `Math.round(originalCost/lifeMonths)`; residual value is not used. The run mutates client state only and claims an unpersisted GL entry; Excel/PDF only show toast success, and departmental allocation values are static.
- Rust implementation: `server/src/asset_depreciations.rs`, ADMIN API routes in `server/src/main.rs`, typed DTO/tasks and shared view in `ui/src/api.rs` and `ui/src/views/asset_depreciations.rs`. It stores the collection, preserves unknown JSON fields, validates create/status/run, audits changes and appends unique-period runs. Generic writes are blocked. A recorded run is an internal subledger only, not a general-ledger posting. Imported legacy history is visibly unverified and excluded from monthly preview/write.
- Shared UI reproduces the control set and exports actual CSV rather than claiming Excel/PDF output that is not generated. ADMIN migration uses the read-only DevTools exporter `tools/export_legacy_asset_depreciations.js` and append-only preview/apply routes `/api/v1/legacy-import/asset-depreciations/{preview,apply}`; imported schedule/actor/status claims remain explicitly unverified. Full workspace tests (181 backend + 260 UI/API), Windows desktop/WASM checks and synthetic exporter fixtures pass. No real data was exported/imported; runtime click-through, restart rehearsal, matched screenshot and exact 100% visual parity remain unverified. This slice did not modify `legacy/`.
