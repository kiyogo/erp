# Kiyo Desktop Parity Matrix

This matrix is the implementation ledger for making the native desktop app match the `web` frontend. A row is not accepted until UI, behavior, API, permissions and fixed-viewport screenshots pass the acceptance rule in `PARITY_MANIFEST.md`.

## Global Acceptance States

Every applicable route must verify:

| State | Required |
| --- | --- |
| Auth | unauthenticated redirect/login, ADMIN access, Employee access or denial |
| Data | loading, empty, populated, request error |
| Input | validation errors, dirty/cancel behavior, submit success/failure |
| Interaction | hover, focus, modal/popover open, table sorting/filtering/searching |
| Appearance | light, dark, responsive sidebar/flyout, mobile navigation |
| Desktop | native file picker, upload/download, print/export where present |
| Visual | screenshot compare at 1440x900, 1280x800 and 390x844 |

## Foundation And Shell

| Web surface | Desktop target | Status |
| --- | --- | --- |
| `/login` | LoginView | Partial: independent UI exists, needs full visual/state comparison |
| `/activate-account` | Activation flow | Not started |
| AuthGuard redirects | Session gate and role mode switch | Partial |
| Admin shell | Header, nested sidebar, workspace tabs, notifications | Partial: full nested nav scaffold added |
| Employee shell | Employee menu, mode switch, employee-only routes | Partial: full menu scaffold added |
| Appearance/language/profile controls | SettingsView and shell controls | Partial |

## Admin Routes

| Web route family | Required child routes | Desktop group | Status |
| --- | --- | --- | --- |
| `/admin/dashboard` | dashboard | Dashboard | Partial |
| `/admin/chat` | internal, admin, channel slugs, redirects | Chat | Scaffolded |
| `/admin/business` | org-units, org-chart | Business | Scaffolded |
| `/admin/hr` | overview, employees, onboarding, contracts, uniforms, proposals, headcount, history position/transfer/resignation/reward/discipline/bank | HR | Scaffolded |
| `/admin/insurance` | overview, labor, adjustments, regimes, card, voluntary, contributions, expenses | Insurance | Scaffolded |
| `/admin/attendance` | overview, monitoring, alerts, shifts, timesheet, requests and all children | Attendance | Scaffolded |
| `/admin/crm` | customers, suppliers | CRM | Scaffolded |
| `/admin/finance` | overview, analysis, cash, bank, loans, invoices, debts, payments, payroll, tax, costing, purchasing, sales, inventory, general, budget, e-invoice | Finance | Scaffolded |
| `/admin/assets` | overview, list, materials, allocation, transfer, repairs, maintenance, disposal, todo, audit, count, depreciation, reports, usage, system children | Assets | Scaffolded |
| `/admin/workflows` | overview, list, requests, history, settings | Workflows | Scaffolded |
| `/admin/meeting-rooms` | overview, list, calendar, history, settings | Meeting rooms | Scaffolded |
| `/admin/services` | services | Services | Scaffolded |
| `/admin/documents` | overview, list, contracts, notes, archives, settings contract templates, settings digital signature | Documents | Scaffolded |
| `/admin/files` | folders, upload, preview, permissions, hidden files | Files | Partial/scaffolded |
| `/admin/tickets` | tickets, incidents | Tickets | Scaffolded |
| `/admin/tasks`, `/admin/plans/*` | tasks, list, progress, milestones, reports | Plans | Scaffolded |
| `/admin/reports` | reports | Reports | Scaffolded |
| `/admin/system`, `/admin/*admin` | overview, users, roles, permissions, audit logs, sessions, backup, drop-menu, system, system notifications | Administration | Partial/scaffolded |
| `/admin/digital-signature` | list, certs, providers, signers, verify, history, alerts, renew | Digital signatures | Scaffolded |
| `/admin/notifications` | my notifications, system notifications | Notifications | Scaffolded |
| `/admin/settings` | account, security, appearance, system, logs | Settings | Partial/scaffolded |

## Employee Routes

| Web route family | Required child routes | Desktop group | Status |
| --- | --- | --- | --- |
| `/employee/home` | home dashboard | Employee home | Partial |
| `/employee/profile` | profile wizard, update banner, personal info | Employee profile | Scaffolded |
| `/employee/tasks` | assigned tasks | Employee tasks | Scaffolded |
| `/employee/payslip` | electronic payslip, print/export | Payslips | Partial |
| `/employee/contracts` | contracts | Employee contracts | Scaffolded |
| `/employee/proposals` | proposals | Employee proposals | Scaffolded |
| `/employee/assets` | assigned assets | Employee assets | Scaffolded |
| `/employee/files` | employee file scope | Employee files | Scaffolded |
| `/employee/notifications` | employee notifications | Employee notifications | Scaffolded |
| `/employee/digital-signature` | my-signature, verify, history | Employee signatures | Scaffolded |
| `/employee/settings` | account, security, appearance, logs | Employee settings | Scaffolded |
| `/employee/identity/verification` | eKYC, camera/QR/document checks | eKYC | Not started |

## Special Routes

| Web surface | Desktop target | Status |
| --- | --- | --- |
| `/files/document/:type/*` | DocumentEditorView with native file/print/export | Scaffolded |
| `/document/:type/*` | DocumentEditorView redirects/equivalent open behavior | Scaffolded |
| `/channels/*`, `/chat/*` | ChatView channel routing parity | Scaffolded |
| `/404`, `/not-found`, fallback routes | NotFound equivalent | Not started |

## Next Implementation Slices

1. Replace scaffolded group views with route-aware subviews, starting with Shell, Administration and Files/Documents.
2. Migrate API slices in this order: auth/profile, settings, users/roles/permissions, files/documents, HR/attendance, workflows/notifications, finance/CRM/assets, chat/eKYC/signatures.
3. Add screenshot automation and store acceptance artifacts per route/state.
