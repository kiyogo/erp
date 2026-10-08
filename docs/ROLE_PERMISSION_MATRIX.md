# Role and permission matrix — initial audit

This file records only roles and checks supported by evidence. It is not a complete RBAC specification yet.

| Role/scope | Legacy evidence | Current Rust evidence | Status / next work |
| --- | --- | --- | --- |
| `ADMIN` | `requireAdmin` in legacy API; Admin modules | `require_admin` for dashboard stats/users/employees; business-org-unit collection write/delete are ADMIN-only; dashboard, HR and org-unit HTTP tests cover counts, lifecycle, hierarchy and manager side effects | `IN_PROGRESS`: enumerate every Admin operation; test remaining direct API denials and HR invariants |
| `USER` / employee | User role in legacy DB and employee portal; self-service profile updates include phone/bank/details data | Rust authenticated user plus employee profile/workspace scopes; self-update can change personal phone/avatar/details but cannot change department, position, status, join date or salary; cross-employee employee-profile reads/updates are denied; org-unit collection read remains authenticated-readable | `IN_PROGRESS`: verify every profile/detail subfield and employee workspace endpoint; finish full self-service UI and department ownership checks |
| Department manager / executive / HR / accountant labels | Admin user form presents these labels, but its create handler maps every non-`ADMIN` option to `USER`; no distinct role contract is established by that form | Current `users.role` SQLite check currently allows only `ADMIN` and `USER` | `ANALYZED`: do not present these labels as distinct effective privileges until legacy backend authorization confirms them |
| Anonymous | Login and account-activation surfaces | Public health/platform/login/activation authorization routes | `IN_PROGRESS`: enumerate public routes and verify all protected routes return 401 |

## Rules

- Authorization is enforced server-side for each action and target resource.
- Never trust a role, owner ID, employee ID or department supplied by the client without checking it against the authenticated principal and persisted relationships.
- Do not infer permissions from menu visibility.
- Do not broaden permissions to make a UI action work.
- Expand this matrix from actual middleware, handler checks, database ownership and tested legacy behavior.
