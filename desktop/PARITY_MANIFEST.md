# Kiyo Desktop Parity Manifest

The desktop frontend in `app/frontend` is independently authored. It must not import, link, symlink, copy a build artifact from, or depend on any frontend source under `web` or `web wbe hiện tại`.

## Acceptance rule

Every reference route is accepted only when all of the following are true:

1. The app owns its source implementation.
2. The Rust API owns the required server behavior and authorization.
3. Every user action has an equivalent result, validation, loading state and error state.
4. ADMIN and Employee access are verified where relevant.
5. Reference and app screenshots are compared at 1440x900, 1280x800 and 390x844.

## Feature groups

| Group | Required capabilities |
| --- | --- |
| Foundation | Login, activation, profile, security, appearance, language, notifications, persistent desktop configuration, Cloud/Self-hosted/Local Admin policy |
| Shell | Admin and employee layouts, responsive sidebar/flyout, workspace tabs, headers, profile controls, mobile navigation, dark/light state |
| Administration | Overview, users, roles, permissions, audit log, sessions, backup, drop menus, system configuration and system notifications |
| Workforce | Employees, onboarding, contracts, uniforms, proposals, history, certificates, rewards, training, attendance, leave, overtime, shifts and timesheets |
| Business operations | Organization, insurance, assets, workflows, meeting rooms, services, plans, tasks, tickets and reports |
| Documents | Files, folders, uploads, permissions, preview, documents, contracts, archives, notes, editor, collaboration, print and export |
| Finance and CRM | Cash, banking, invoices, debt, payment, payroll, tax, costing, purchasing, sales, inventory, ledger, budgets, e-invoices, customers, suppliers, partners and contacts |
| Special systems | Chat, eKYC, digital signatures, QR/camera flows, certificate validation, native file and print integration |
| Employee portal | Home, profile, tasks, payslips, contracts, proposals, assets, files, notifications, signatures and employee settings |

## Current status

The independent login, desktop shell, dashboard and initial user management slice exist. No other group is accepted as complete until the acceptance rule has been met.
