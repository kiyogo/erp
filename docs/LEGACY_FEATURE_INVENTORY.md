# Legacy feature inventory — initial audit

This is a source-backed inventory of the legacy application, not a parity claim. `legacy/` remains read-only. The inventory is intentionally marked `DISCOVERED` until each workflow, API contract, permission, persistence path and failure state has been traced and tested.

## Sources examined

- `legacy/AI_PROJECT_RULES.md`, `README.md`, `ARCHITECTURE.md`, `PROJECT_STRUCTURE.md`, `CURRENT_STATE.md`, `API_CONTRACT.md`, `DATABASE_SCHEMA.md`, `CHANGELOG_AI.md`.
- `legacy/web/src/App.tsx`, `api/`, `pages/`, `components/`, `services/`, `utils/`, `context/`, `features/` and `modules/`.
- `legacy/api/index.mjs`, `db.mjs`, `serializers.mjs`, `crypto.mjs`, scripts and deployment files.
- Current target: `backend/`, `crates/kiyo-ui/`, `desktop/`, `web/` and `docs/MIGRATION_MATRIX.md`.

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
| Finance | 25 | `legacy/web/src/modules/finance/` | Cash/bank, invoices, e-invoice, sales/purchasing, payables/receivables, ledger, budgets, tax, payroll, assets, inventory, loans and signatures |
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

- Backend route groups currently include health/platform, auth, dashboard, users, employees, files, storage mode and generic collections. Dedicated legacy parity is not implied by route existence.
- Shared Rust views currently include activation, assets, attendance, chat, CRM, dashboard, document editor, employee portal, employees, files, finance, insurance, login, meeting rooms, org units, settings, signatures, users and workflows.
- Existing verified slices are recorded in `docs/MIGRATION_MATRIX.md`; several Rust views are scaffolds or have incomplete API integration.
- Admin Users, HR Employees, employee phone self-profile and Organization Units core now use real Rust API data; their residual gaps and verification are recorded as `PARTIAL` in `docs/MIGRATION_MATRIX.md`.
- Remaining screen-scope gaps include employee full-personnel/self-service forms, SMTP, notes/direct-email workflows and other module actions; a view file's presence is not evidence of parity.

## Audit rule

For every discovered feature, add a granular ID to `MIGRATION_MATRIX.md` with source files, API, tables, role, success/error behavior, target code, tests and evidence. Do not treat this group-level inventory as sufficient coverage.
