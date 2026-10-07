# Desktop Parity Backlog

`crates/kiyo-ui` is the visual and behavior source of truth. The native launcher
and WebAssembly launcher consume the same implementation. No task is complete
until native/browser behavior and fixed-viewport visual output are accepted.

## Baseline scope

* Shared UI: `crates/kiyo-ui`.
* Backend: `backend`.
* Current inventory: 197 files below `src/pages` and `src/modules`, 20 module groups, and at least 94 legacy API route branches.
* Required reference sizes: 1440x900, 1280x800, and 390x844.
* Required state coverage: unauthenticated, loading, empty, populated, validation error, request error, modal/popup open, hover/focus, dark/light appearance, ADMIN, and Employee where the route applies.

## Work order

1. **Foundation:** login, account activation, auth guard, API error handling, shared appearance/language settings, desktop configuration and storage-mode policy.
2. **Shell:** admin/employee layout, sidebar nesting and flyouts, header, workspace tabs, notification dropdown, mobile bottom navigation and responsive rules.
3. **Administration:** dashboard, users, employees, roles, permissions, sessions, audit logs, system settings, account/security/appearance.
4. **Core records:** files, upload/download/permissions, documents and document editor, notifications, search/table/form primitives.
5. **Operations:** HR, attendance, payroll, contracts, insurance, business organization, assets, finance, CRM, workflow, plans, tickets, meeting rooms and reports.
6. **Special systems:** chat, eKYC, signatures, document collaboration, PDF/export/print and browser/native capability differences.

## API migration gates

The Rust API migration follows feature slices, not just route names. A slice includes exact request/response shape, permission rules, errors, data ownership and automated integration tests. The first slices are auth/profile, dashboard, users/employees, settings, files and documents. Collection-backed modules follow after their generic collection contract is verified.

## Completion record per route

For every route, record its source route, roles, API calls, desktop route, screenshots, interaction checks and visual-diff result. A route remains incomplete if one supported state is absent or a backend permission check differs from web.

## Current delivery

* **Implemented in shared Rust UI:** login, native shell, route-level nested sidebar scaffold, header, workspace tab, dashboard and user views.
* **Backed by Rust:** login/profile, dashboard statistics, user list/create/update/delete and the collection contract. These endpoints enforce the administrator role on the server.
* **Visual checks:** native and WebAssembly launchers must be checked at 1440x900, 1280x800 and 390x844.
* **Not yet complete:** all other module routes and their original forms, tables, workflows, special tools, route-specific screens and corresponding Rust API slices. They remain in the work order above and must not be represented as 100% parity yet. Track them in `DESKTOP_PARITY_MATRIX.md`.
