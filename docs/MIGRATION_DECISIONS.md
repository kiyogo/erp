# Migration decisions and deviations

## Confirmed target architecture

- Keep the current workspace architecture: Rust/Axum backend, shared Rust `egui`/`eframe` UI, native desktop and WebAssembly canvas.
- Keep `legacy/` read-only and retained as reference.
- Do not introduce another UI framework or a DOM-based business frontend during this migration.

## Initial source findings requiring explicit treatment

1. `legacy/web/src/modules/admin/AdminUsersModule.tsx` derives `twoFactor: false` and `lastLogin` placeholders when loading users; the list has a success-only Excel export message and a print-card success message without a corresponding real export/print implementation in that component. These are not verified capabilities and must not become fake Rust features.
2. The legacy user form displays several privilege labels, but its create handler maps only `Super Admin` to `ADMIN` and maps other labels to `USER`. The current Rust `users.role` schema accepts only `ADMIN` and `USER`. Distinct RBAC roles must not be claimed without finding and testing actual legacy authorization rules.
3. The current Rust admin users screen has hard-coded accounts and locally toggles active state; this is a confirmed parity defect. The first implementation slice replaces it with API-backed behavior.
4. Legacy docs describe SQLite and PostgreSQL; the current Rust backend is SQLite-only. No support mode is removed until the actual legacy deployment contract is reconciled and an explicit migration decision is recorded.
5. Rust dashboard metrics must come from backend data. Employee counts exclude `ADMIN` accounts and month grouping uses UTC, matching the legacy API's ISO month prefix. Finance totals and audit activity are reported as unavailable until the corresponding transaction schema and persisted audit-event store are migrated; zero values or synthetic logs must not masquerade as complete data (`BLK-005`).

## Decision process

For each deviation, record source evidence, security/data impact, alternatives, compatibility plan and approval status. Do not infer approval from a successful build or a placeholder screen.
