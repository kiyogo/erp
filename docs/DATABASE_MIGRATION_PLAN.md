# Database migration plan — initial audit

## Known state

- Legacy documentation and `legacy/api/db.mjs` describe SQLite/PostgreSQL support; exact production schemas and version history require source-level reconciliation.
- The Rust backend currently initializes a SQLite schema in `backend/src/main.rs`; no PostgreSQL adapter or legacy-to-Rust import tool is present in the current target files inspected.
- Do not connect this audit or tests to a production database. Do not read secret values from `.env` files.

## Required inventory before implementation

1. Enumerate all legacy schema creation/migration statements, tables, columns, constraints, indexes, triggers and DB-specific behavior.
2. Identify any schema declared in `DATABASE_SCHEMA.md` but absent from executable migrations, and vice versa.
3. Map every target table/column to its legacy source, transformations, defaults and null semantics.
4. Track identifiers, foreign keys, soft-delete, audit/approval history, file references, version records and encrypted fields.
5. Identify SQLite/PostgreSQL compatibility differences and decide adapters without silently dropping supported deployment modes.

## Import tool acceptance

- Dry-run is the default and never mutates either database.
- Apply requires explicit source/target paths, a verified backup and a disposable test copy during development.
- Import is transactional/batched, resumable and idempotent; it preserves IDs and history or writes a verified mapping table.
- Verify compares row counts, uniqueness, foreign keys/orphans, soft-deleted rows, file checksums and business aggregates (including financial balances).
- Source is read-only. No production import is run by the coding agent.
- Logs and reports contain no credentials or sensitive row values.

## Status

`DISCOVERED`; schema reconciliation and safe importer are not implemented or verified.
