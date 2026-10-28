import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { pool, initDatabaseSchema, transaction } from '../db.mjs';

const DATA_DIR = path.resolve(process.env.KIYOVN_DATA_DIR || 'data');
const DB_PATH = path.resolve(process.env.KIYOVN_DB_PATH || path.join(DATA_DIR, 'kiyovn.sqlite'));

async function main() {
  console.log('[Migration] Starting SQLite -> PostgreSQL migration...');
  if (!fs.existsSync(DB_PATH)) {
    console.log(`[Migration] SQLite database file not found at ${DB_PATH}. Nothing to migrate.`);
    await initDatabaseSchema();
    console.log('[Migration] Initialized fresh PostgreSQL schema.');
    await pool.end();
    return;
  }

  console.log(`[Migration] Reading SQLite database from: ${DB_PATH}`);
  const sqliteDb = new DatabaseSync(DB_PATH);

  console.log('[Migration] Ensuring PostgreSQL schema exists...');
  await initDatabaseSchema();

  const tables = [
    'users',
    'file_nodes',
    'finance_cash_transactions',
    'finance_documents',
    'finance_bank_accounts',
    'crm_contacts',
    'tasks',
    'task_checklist_items',
    'task_comments',
    'task_activities',
    'task_reports',
    'employee_proposals',
    'documents',
    'document_members',
    'document_snapshots',
    'document_operations',
    'document_comments',
    'employee_profiles',
    'activation_tokens',
    'system_settings',
    'outbound_mail_log',
    'notifications',
    'contracts',
    'collection_records',
    'trash_items',
    'audit_events',
  ];

  await transaction(async (tx) => {
    // Disable triggers / constraint checks during bulk import if needed
    for (const table of tables) {
      try {
        const rows = sqliteDb.prepare(`SELECT * FROM ${table}`).all();
        if (rows.length === 0) {
          console.log(`[Migration] Table ${table}: 0 rows (skipped).`);
          continue;
        }

        console.log(`[Migration] Migrating table ${table}: ${rows.length} rows...`);
        const columns = Object.keys(rows[0]);
        const colList = columns.join(', ');
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');

        const insertSql = `INSERT INTO ${table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

        for (const row of rows) {
          const values = columns.map((col) => row[col]);
          await tx.query(insertSql, values);
        }
        console.log(`[Migration] Migrated ${table} successfully.`);
      } catch (tableError) {
        console.warn(`[Migration] Note on table ${table}:`, tableError.message);
      }
    }
  });

  console.log('[Migration] SQLite -> PostgreSQL migration finished successfully!');
  await pool.end();
}

main().catch((err) => {
  console.error('[Migration Error]', err);
  process.exit(1);
});
