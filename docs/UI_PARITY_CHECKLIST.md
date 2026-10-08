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
| Responsive canvas | At minimum 1440×900, 1280×800 and 390×844, with no inaccessible controls or unintended overflow | Prior smoke evidence exists for login/activation only |

Do not mark a row verified based only on compiling the UI or viewing a screenshot of one state.

## Dashboard data-integrity slice — current checklist

- Dashboard KPI cards are API-backed; hard-coded counts/revenue/activity entries were removed.
- Browser smoke verified actual zero counts and the connected source's empty state at 1280×720 against a disposable SQLite database.
- Finance and audit panels explicitly report that no corresponding Rust data source is connected; legacy totals and persisted audit history remain open under `BLK-005`.
- Full 1440×900/1280×800/390×844 comparison, legacy filter parity, and finance/audit persistence are not verified.

## Admin Users slice — current checklist

- API-backed paginated list, current-page search/filter, profile summary, create dialog and lock/unlock controls are implemented in the shared egui view.
- Backend and wire-format tests pass; Wasm compile and Windows desktop build pass.
- Browser interaction, visual comparison against the legacy page, editing/deletion UI, all-page search/filter, keyboard/IME and runtime behavior on Linux/macOS are not yet verified.
- 2FA, last-login, Excel export and card printing are intentionally absent until their legacy contracts and actual backend capabilities are established.

## HR Employees slice — current checklist

- API-backed list, current filter/search, summary/detail, quick create/edit, soft-retirement confirmation and activation resend request are implemented in the shared egui view.
- Inactive accounts visibly show that SMTP delivery is unavailable. A resend request is explicitly rejected without rotating the existing activation link.
- Backend role/persistence tests, DTO tests, WebAssembly compile and Windows desktop build pass.
- A separate self-profile view now reads `/employees/me` and allows phone-only edits; the backend remains authoritative for HR-controlled fields.
- Full personnel form, notes/direct-email UI, actual mail delivery, address/avatar/bank/onboarding controls, visual/browser comparison and Linux/macOS runtime are still open. Org-unit manager assignment is now handled transactionally by the Business Organization Units API slice. No Excel-export success action is shown because the legacy button only displayed a success toast without generating a file.

## Organization Units slice — current checklist

- The previous five sample units are removed. The shared screen loads `business_org_units` and employee profiles from the Rust API; headcount, budget summaries, search and status filtering use those records.
- Create/edit persists the legacy fields represented by the model; manager assignment and unit deletion update employee departments transactionally in the backend. Deletion is blocked while child units remain.
- Current tests cover wire fields, count matching, numeric validation, hierarchy-cycle prevention, ADMIN-only writes, manager assignment, child guard and atomic employee reassignment.
- Details drawer, visual/browser interaction, responsive audit and real Excel export remain open. The legacy export action only emitted a success message; the Rust screen does not claim it generated a file.
- Employee payslips now show a truthful empty state rather than invented monthly amounts; the legacy collection currently has no typed employee-scoped payroll contract in Rust. Payroll values, bank-account changes, signing, printing and export remain blocked pending `BLK-004` and are not represented as working actions.

## Files rename slice — current checklist

- Shared Files UI now lists/navigates real folders, creates folders and exposes rename for unprotected nodes; rename uses the backend response and refreshes the active folder.
- Browser smoke at 1280×720 verified rename success, duplicate-name error with entered text retained, and data still visible after page reload/re-login and backend restart.
- Full visual/responsive comparison, keyboard/IME behavior, create-folder UI flow, uploads/downloads, deletion/recovery, search/sort/multiselect, sharing and native-vs-browser transfer adapters remain unverified.
