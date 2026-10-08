# API parity matrix — initial audit

`legacy/` remains read-only. Counts and entries below reflect source inspection; a route is not `VERIFIED` merely because it exists. Direct calls and dynamically constructed paths are still being enumerated.

| API area | Legacy evidence | Rust target evidence | Initial status | Remaining evidence |
| --- | --- | --- | --- | --- |
| Auth: login/profile/introspect/password | `legacy/API_CONTRACT.md`, `legacy/web/src/api/endpoints.ts`, `legacy/api/index.mjs` | `backend/src/main.rs`; `crates/kiyo-ui/src/api.rs` | `IN_PROGRESS` | Invalid credentials, refresh/startup introspection, expiry, logout/revocation, native parity |
| Account activation | `ActivateAccount.tsx`, `employeesApi`, activation handlers | Rust activation authorization/completion routes and shared view | `IN_PROGRESS` | Email delivery, resend UI, native deep link, product acceptance of password-policy difference |
| Dashboard | `DashboardStatsData`, `DashboardPage.tsx`, `legacy/api/index.mjs` | ADMIN-only `/api/v1/dashboard/stats`; actual non-ADMIN account/active/monthly counts and pending records from the connected workflow collection; financial/audit availability is explicit | `PARTIAL` | Legacy finance totals and combined proposals/tasks/contracts are not backed by migrated Rust schema; persisted audit events are absent. Browser empty-state and API permission/runtime smoke verified; full production aggregates remain open |
| Admin users | `usersApi`; `/users` handlers in `legacy/api/index.mjs`; legacy form maps every non-ADMIN role label to `USER` and reports 2FA/export/print actions without a real API operation | Rust paginated `/users`, joined employee profile fields, atomic create/update, uniqueness conflicts, activation-aware status changes; shared egui view uses server data | `PARTIAL` | Browser interaction/runtime evidence; full edit workflow; decide whether legacy role labels need real RBAC; implement 2FA/export/print only with real contracts; test cross-admin and concurrent updates |
| Employees | `employeesApi`, HR and employee portal modules; exact actions include create/edit/retire/resend activation and employee self-profile | Rust `/employees` routes with real SQLite persistence, transactional create/update/retire, code/email conflicts, self-edit restrictions, protected workspace and activation-token lifecycle; shared UI has HR core and phone-only self-profile | `PARTIAL` | SMTP integration, route/browser runtime, full payload compatibility, full self-service wizard/address/avatar/bank flow, custom work-status options, notes/email/export and profile authorization edge cases |
| Organization units | `OrgUnitsModule.tsx`, `business_org_units` generic collection and employee update calls | Typed shared client over the existing collection API; Rust validates hierarchy and uniqueness, assigns managers transactionally, and deletes a unit with atomic employee unassignment | `PARTIAL` | Browser/visual parity, detail drawer and legacy behaviors not backed by real export remain to audit; full legacy data import still open |
| Files | `files` API, `CloudDriveModule`, pages and utilities | Rust `/files` list/folder/upload/download/content/update/delete routes; shared UI now lists/navigates/creates and renames real nodes | `PARTIAL` | Public share parity, comprehensive permission audit, browser/native transfer, upload/download persistence and complete UI workflows |
| Documents/editor | document API service and editor collaboration services | No dedicated Rust document API route group yet | `NOT_STARTED` | Full route and model inventory, storage/version/operation contract and editor proof-of-concept |
| Chat/realtime | `modules/chat/chat-api.ts`, `chat-socket.ts` and direct calls | No dedicated Rust chat routes found in router | `NOT_STARTED` | Unique endpoint/socket contract, authentication, persistence and two-client reconnect test |
| Domain collections | `collectionsApi` and module calls | Generic `/collections/{scope}` and record routes | `IN_PROGRESS` | Enumerate all scopes, validate schema, ownership, ACL and per-scope business invariants |
| Admin/security/notifications/workflows | Admin, settings and workflow modules and API calls | Dedicated route coverage absent or partial | `NOT_STARTED` | Enumerate all paths and side effects; add typed handlers and authorization tests |
| eKYC/signatures/integrations | eKYC services, signature utilities and module calls | No dedicated eKYC/signature service routes found in router | `NOT_STARTED` | Data/privacy requirements, third-party integrations, real platform support and security review |

## Route inventory procedure

Normalize `legacy/api/index.mjs`, the API contract, `legacy/web/src/api/endpoints.ts`, and all direct/dynamic HTTP calls into one row per method/path/contract. Record request, response, status/error shape, role, scope, tables, side effects, UI caller and tests. The 92 current text-search matches are call sites, not unique operations.

## Admin users slice — backend and typed client contract

- `GET /api/v1/users?page=&limit=` is ADMIN-only and returns `data` plus `pagination { page, limit, total }`; each row joins nullable employee-profile fields.
- `POST /api/v1/users` is ADMIN-only and returns `201 { user }`; user, employee profile and protected workspace roots are created in one SQLite transaction. Duplicate email or employee code returns `409`.
- `GET /api/v1/users/{id}` permits ADMIN or the same authenticated user and includes the joined profile.
- `PATCH /api/v1/users/{id}` is ADMIN-only, updates account/profile fields atomically, prevents self-deactivation, and will not bypass a still-valid one-time activation link.
- `DELETE /api/v1/users/{id}` remains an existing route but is not exposed in the new shared UI and needs lifecycle/cascade review before parity is claimed.
- Tests currently cover permission denial, persisted create/profile/workspace, pagination, email uniqueness, lock/unlock and the activation guard. The Rust UI decoder has a camelCase contract test. Browser interaction and the remaining authorization/concurrency cases are still open.

## Employee management slice — backend and typed client contract

- `GET /api/v1/employees` is ADMIN-only and returns `{data:[employee]}`; employee DTOs include both `code` and `employeeCode` for legacy compatibility.
- `GET /api/v1/employees/me` returns only the authenticated employee's own profile; the shared Rust profile view uses it and does not fetch the HR-wide list.
- `POST /api/v1/employees` is ADMIN-only; user, profile, protected workspace and one-time activation record are persisted atomically. Department and position remain optional as in the legacy quick form. The response explicitly reports `delivery.status = not_configured` while no mail sender exists.
- `PATCH /api/v1/employees/{id}` is ADMIN-only for identity/HR fields. `PATCH /api/v1/employees/me` permits personal phone/avatar/details but ignores client attempts to change department, position, employment status, join date or salary.
- The new self-profile UI sends only a phone field; address, avatar, banking approval and onboarding are not yet implemented in the Rust UI.
- `DELETE /api/v1/employees/{id}` is a soft retirement, not a row deletion: it locks the account, marks the profile `Đã nghỉ việc`, and consumes pending activation links in the same transaction. Activation authorization/completion reject retired users; user management cannot directly unlock a retired profile.
- `POST /api/v1/employees/{id}/activation` currently returns `503` without modifying tokens because the Rust mail sender is absent. A disabled delivery is not reported as success and a working old link is not invalidated by a failed resend request.
- Contract tests cover ADMIN denial, create/profile/workspace/activation persistence, case-insensitive code conflict, self-edit field restrictions, admin update, retirement/link revocation and unavailable-mail behavior. DTO tests cover the duplicated legacy code fields and the not-configured delivery shape. Browser/runtime email checks remain open.

## Organization units slice — collection contract

- `GET /api/v1/collections/business_org_units` remains authenticated-readable to match the legacy shared collection contract; `PUT` and record `DELETE` require ADMIN.
- The Rust shared view uses the stored records, derives member counts from live employee profiles, filters/searches, and persists create/edit through the collection's transactional replacement route.
- For this scope, server validation rejects duplicate keys/codes/names, invalid status or negative/non-integer values, and hierarchy cycles. Saving a unit and adding its selected manager to the department field are one SQLite transaction.
- Deleting a unit is an ADMIN-only record operation: child units block deletion; matching department values are removed from employee profiles in the same transaction as unit deletion.
- HTTP test covers access policy, persisted read/write, hierarchy validation, manager assignment, child guard and employee reassignment. Browser interaction, details drawer and visual comparison remain unverified.

## Files rename slice — `/api/v1/files/{id}`

- The shared Files view now offers rename for unprotected files/folders and sends a bearer-authenticated `PATCH` with `{ "name": ... }`; the returned file node is decoded using the backend camelCase contract.
- A successful rename closes the dialog, reports the new name and reloads the current folder. A duplicate/permission/network error leaves the dialog and user-entered name available for correction.
- Backend HTTP coverage verifies persisted rename, duplicate-name rejection, protected system-folder denial and `404` for cross-employee rename attempts.
- Browser smoke on an isolated SQLite database verified the successful path, duplicate-name error with input retained, page reload, server restart and re-login; the renamed folder remained visible after restart.
- This does not complete Files parity: upload/download adapters for browser and native, file content updates, deletion/recovery semantics, sharing, search/sort/multiselect and full permission cases remain open.

## Verification rule

`VERIFIED` requires contract tests, authorization tests, persistent storage tests, UI integration and runtime evidence. Build-only or handler-only results do not qualify.
