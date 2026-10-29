import pg from 'pg';
import { DatabaseSync, backup } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { AsyncLocalStorage } from 'node:async_hooks';

const { Pool } = pg;
const asyncLocalStorage = new AsyncLocalStorage();

const DATA_DIR = path.resolve(process.env.KIYOVN_DATA_DIR || 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.resolve(process.env.KIYOVN_DB_PATH || path.join(DATA_DIR, 'kiyovn.sqlite'));

let isPg = false;
let pool = null;
let sqliteDb = null;
let sqliteQueue = Promise.resolve();

function withSqliteConnection(callback) {
  if (asyncLocalStorage.getStore()?.sqliteTransaction) return callback();
  const pending = sqliteQueue.then(callback);
  sqliteQueue = pending.catch(() => {});
  return pending;
}

function tryInitPostgres() {
  if (process.env.USE_SQLITE === 'true') return null;
  const isSsl = process.env.PGSSL === 'true' || (process.env.DATABASE_URL && process.env.DATABASE_URL.includes('sslmode=require'));
  const config = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: isSsl ? { rejectUnauthorized: false } : false,
        max: Number(process.env.PGMAX || 20),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3000,
      }
    : {
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'appdnt',
        user: process.env.PGUSER || 'postgres',
        password: process.env.PGPASSWORD || 'postgres',
        ssl: isSsl ? { rejectUnauthorized: false } : false,
        max: Number(process.env.PGMAX || 20),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 3000,
      };

  return new Pool(config);
}

const testPool = tryInitPostgres();
if (testPool) {
  try {
    const client = await testPool.connect();
    client.release();
    pool = testPool;
    isPg = true;
    console.log('[Database] Connected successfully to PostgreSQL.');
  } catch (err) {
    console.warn(`[Database] PostgreSQL not available (${err.message}). Falling back to SQLite at ${DB_PATH}`);
    await testPool.end().catch(() => {});
    pool = null;
    isPg = false;
  }
}

if (!isPg) {
  sqliteDb = new DatabaseSync(DB_PATH);
  sqliteDb.exec('PRAGMA foreign_keys = ON;');
  console.log(`[Database] Using SQLite storage: ${DB_PATH}`);
}

export { pool };

function getClient() {
  const store = asyncLocalStorage.getStore();
  return store?.client || pool;
}

export function convertSql(sql) {
  let index = 1;
  let inString = false;
  let stringChar = '';
  let result = '';
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (!inString && (char === "'" || char === '"')) {
      inString = true;
      stringChar = char;
      result += char;
    } else if (inString && char === stringChar) {
      if (sql[i + 1] === stringChar) {
        result += char + sql[i + 1];
        i++;
      } else {
        inString = false;
        result += char;
      }
    } else if (!inString && char === '?') {
      result += `$${index++}`;
    } else {
      result += char;
    }
  }
  return result
    .replace(/COLLATE\s+NOCASE/gi, '')
    .replace(/json_extract\s*\(\s*([a-zA-Z0-9_]+)\s*,\s*'\$\.([^']+)'\s*\)/gi, "($1::jsonb->>'$2')");
}

export async function query(sql, params = []) {
  if (isPg) {
    const runner = getClient();
    const converted = convertSql(sql);
    return await runner.query(converted, params);
  }
  return withSqliteConnection(() => {
    const info = sqliteDb.prepare(sql).run(...params);
    return { rowCount: Number(info.changes || 0), rows: [] };
  });
}

export async function queryOne(sql, params = []) {
  if (isPg) {
    const runner = getClient();
    const converted = convertSql(sql);
    const result = await runner.query(converted, params);
    return result.rows[0] || null;
  }
  return withSqliteConnection(() => sqliteDb.prepare(sql).get(...params) || null);
}

export async function queryAll(sql, params = []) {
  if (isPg) {
    const runner = getClient();
    const converted = convertSql(sql);
    const result = await runner.query(converted, params);
    return result.rows;
  }
  return withSqliteConnection(() => sqliteDb.prepare(sql).all(...params));
}

export async function exec(sql) {
  if (isPg) {
    const runner = getClient();
    return await runner.query(sql);
  }
  return withSqliteConnection(() => sqliteDb.exec(sql));
}

export function prepare(sql) {
  return {
    get: async (...params) => {
      const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      return await queryOne(sql, flattened);
    },
    all: async (...params) => {
      const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      return await queryAll(sql, flattened);
    },
    run: async (...params) => {
      const flattened = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
      const res = await query(sql, flattened);
      return { changes: res.rowCount, rowCount: res.rowCount };
    },
  };
}

export async function backupTo(destination) {
  if (isPg) throw new Error('Native database backup is currently supported for SQLite only.');
  return withSqliteConnection(() => backup(sqliteDb, destination));
}

export async function transaction(callback) {
  if (isPg) {
    const existingStore = asyncLocalStorage.getStore();
    if (existingStore?.client) {
      return await callback();
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await asyncLocalStorage.run({ client }, async () => {
        return await callback();
      });
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // ignore rollback errors
      }
      throw error;
    } finally {
      client.release();
    }
  } else {
    if (asyncLocalStorage.getStore()?.sqliteTransaction) return callback();
    return withSqliteConnection(() => asyncLocalStorage.run({ sqliteTransaction: true }, async () => {
      sqliteDb.exec('BEGIN TRANSACTION;');
      try {
        const result = await callback();
        sqliteDb.exec('COMMIT;');
        return result;
      } catch (err) {
        sqliteDb.exec('ROLLBACK;');
        throw err;
      }
    }));
  }
}

export async function close() {
  if (pool) await pool.end().catch(() => {});
  if (sqliteDb) await withSqliteConnection(() => sqliteDb.close());
}

export async function initDatabaseSchema() {
  await exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      employee_code TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL CHECK (role IN ('ADMIN', 'USER')),
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users(LOWER(email));
    CREATE INDEX IF NOT EXISTS users_code_lower_idx ON users(LOWER(employee_code));

    CREATE TABLE IF NOT EXISTS file_nodes (
      id TEXT PRIMARY KEY,
      parent_id TEXT REFERENCES file_nodes(id) ON DELETE RESTRICT,
      employee_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
      owner_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
      name TEXT NOT NULL,
      node_type TEXT NOT NULL CHECK (node_type IN ('dir', 'file')),
      mime_type TEXT NOT NULL DEFAULT '',
      size BIGINT NOT NULL DEFAULT 0 CHECK (size >= 0),
      storage_key TEXT UNIQUE,
      origin_module TEXT NOT NULL DEFAULT 'files',
      is_hidden INTEGER NOT NULL DEFAULT 0 CHECK (is_hidden IN (0, 1)),
      is_system INTEGER NOT NULL DEFAULT 0 CHECK (is_system IN (0, 1)),
      is_protected INTEGER NOT NULL DEFAULT 0 CHECK (is_protected IN (0, 1)),
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS file_nodes_parent_name_idx
      ON file_nodes(parent_id, LOWER(name)) WHERE deleted_at IS NULL;
    CREATE INDEX IF NOT EXISTS file_nodes_parent_idx ON file_nodes(parent_id, deleted_at, name);
    CREATE INDEX IF NOT EXISTS file_nodes_employee_idx ON file_nodes(employee_id, deleted_at, created_at DESC);

    CREATE TABLE IF NOT EXISTS file_shares (
      id TEXT PRIMARY KEY,
      file_id TEXT NOT NULL REFERENCES file_nodes(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS file_shares_file_idx ON file_shares(file_id);
    CREATE INDEX IF NOT EXISTS file_shares_token_idx ON file_shares(token);

    CREATE TABLE IF NOT EXISTS finance_cash_transactions (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Thu', 'Chi')),
      source TEXT NOT NULL CHECK (source IN ('bank', 'petty')),
      category TEXT NOT NULL,
      amount BIGINT NOT NULL CHECK (amount > 0),
      transaction_date TEXT NOT NULL,
      counterparty TEXT NOT NULL,
      account_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Đã hoàn thành', 'Chờ duyệt', 'Đã hủy')),
      note TEXT NOT NULL DEFAULT '',
      journal_lines_json TEXT NOT NULL DEFAULT '[]',
      attachments_json TEXT NOT NULL DEFAULT '[]',
      voucher_date TEXT,
      currency TEXT NOT NULL DEFAULT 'VND',
      reference TEXT NOT NULL DEFAULT '',
      department TEXT,
      employee_code TEXT,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS finance_cash_transactions_date_idx ON finance_cash_transactions(transaction_date DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS finance_cash_transactions_source_idx ON finance_cash_transactions(source, transaction_type, status);
    CREATE INDEX IF NOT EXISTS finance_cash_transactions_code_idx ON finance_cash_transactions(LOWER(code));

    CREATE TABLE IF NOT EXISTS finance_cash_categories (
      id TEXT PRIMARY KEY,
      transaction_type TEXT NOT NULL CHECK (transaction_type IN ('Thu', 'Chi')),
      name TEXT NOT NULL,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      UNIQUE(transaction_type, name)
    );
    CREATE UNIQUE INDEX IF NOT EXISTS finance_cash_categories_name_lower_idx
      ON finance_cash_categories(transaction_type, LOWER(name));

    CREATE TABLE IF NOT EXISTS finance_documents (
      id TEXT PRIMARY KEY,
      document_type TEXT NOT NULL CHECK (document_type IN ('sale', 'purchase', 'invoice')),
      code TEXT NOT NULL UNIQUE,
      subtype TEXT NOT NULL,
      partner_name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      amount BIGINT NOT NULL CHECK (amount > 0),
      paid_amount BIGINT NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
      document_date TEXT NOT NULL,
      due_date TEXT,
      status TEXT NOT NULL,
      tax_code TEXT NOT NULL DEFAULT '',
      vat_rate INTEGER NOT NULL DEFAULT 0,
      vat_amount BIGINT NOT NULL DEFAULT 0 CHECK (vat_amount >= 0),
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS finance_documents_type_idx ON finance_documents(document_type, subtype, document_date DESC);
    CREATE INDEX IF NOT EXISTS finance_documents_partner_idx ON finance_documents(LOWER(partner_name));
    CREATE INDEX IF NOT EXISTS finance_documents_code_idx ON finance_documents(LOWER(code));

    CREATE TABLE IF NOT EXISTS finance_bank_accounts (
      id TEXT PRIMARY KEY,
      bank_name TEXT NOT NULL,
      account_number TEXT NOT NULL UNIQUE,
      account_holder TEXT NOT NULL,
      branch TEXT NOT NULL DEFAULT '',
      opening_balance BIGINT NOT NULL DEFAULT 0 CHECK (opening_balance >= 0),
      status TEXT NOT NULL DEFAULT 'Đang hoạt động',
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS finance_bank_accounts_bank_idx ON finance_bank_accounts(LOWER(bank_name));
    CREATE INDEX IF NOT EXISTS finance_bank_accounts_acc_idx ON finance_bank_accounts(LOWER(account_number));

    CREATE TABLE IF NOT EXISTS crm_contacts (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      contact_type TEXT NOT NULL CHECK (contact_type IN ('customer', 'supplier', 'partner')),
      tax_code TEXT NOT NULL DEFAULT '',
      industry TEXT NOT NULL DEFAULT '',
      contact_person TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      email TEXT NOT NULL DEFAULT '',
      address TEXT NOT NULL DEFAULT '',
      bank_account TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '',
      credit_limit BIGINT NOT NULL DEFAULT 0 CHECK (credit_limit >= 0),
      total_value BIGINT NOT NULL DEFAULT 0 CHECK (total_value >= 0),
      debt_balance BIGINT NOT NULL DEFAULT 0 CHECK (debt_balance >= 0),
      tier TEXT NOT NULL DEFAULT 'Tiêu chuẩn',
      account_manager TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Đang hoạt động',
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS crm_contacts_type_idx ON crm_contacts(contact_type, created_at DESC);
    CREATE INDEX IF NOT EXISTS crm_contacts_name_idx ON crm_contacts(LOWER(name));
    CREATE INDEX IF NOT EXISTS crm_contacts_code_idx ON crm_contacts(LOWER(code));

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      project_name TEXT NOT NULL DEFAULT '',
      assignee_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      priority TEXT NOT NULL CHECK (priority IN ('Khẩn cấp', 'Cao', 'Trung bình', 'Thấp')),
      due_date TEXT NOT NULL,
      progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
      status TEXT NOT NULL DEFAULT 'Chưa bắt đầu' CHECK (status IN ('Chưa bắt đầu', 'Đang thực hiện', 'Chờ nghiệm thu', 'Hoàn thành', 'Tạm dừng')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS tasks_assignee_idx ON tasks(assignee_id, status, due_date);
    CREATE INDEX IF NOT EXISTS tasks_due_date_idx ON tasks(due_date, status);
    CREATE INDEX IF NOT EXISTS tasks_code_idx ON tasks(LOWER(code));

    CREATE TABLE IF NOT EXISTS task_due_date_history (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      previous_due_date TEXT NOT NULL,
      new_due_date TEXT NOT NULL,
      changed_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      changed_at TEXT NOT NULL,
      is_postponement INTEGER NOT NULL CHECK (is_postponement IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS task_due_date_history_task_idx ON task_due_date_history(task_id, changed_at);

    CREATE TABLE IF NOT EXISTS task_collaborators (
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      collaborator_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      added_by TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      added_at TEXT NOT NULL,
      PRIMARY KEY (task_id, collaborator_id)
    );
    CREATE INDEX IF NOT EXISTS task_collaborators_user_idx ON task_collaborators(collaborator_id, task_id);

    CREATE TABLE IF NOT EXISTS task_checklist_items (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      is_completed INTEGER NOT NULL DEFAULT 0 CHECK (is_completed IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS task_checklist_items_task_idx ON task_checklist_items(task_id, sort_order);

    CREATE TABLE IF NOT EXISTS task_comments (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS task_comments_task_idx ON task_comments(task_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS task_activities (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS task_activities_task_idx ON task_activities(task_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS task_reports (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      content TEXT NOT NULL DEFAULT '',
      attachments_json TEXT NOT NULL DEFAULT '[]',
      progress INTEGER NOT NULL CHECK (progress >= 0 AND progress <= 100),
      status TEXT NOT NULL CHECK (status IN ('Chưa bắt đầu', 'Đang thực hiện', 'Chờ nghiệm thu', 'Hoàn thành', 'Tạm dừng')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS task_reports_task_idx ON task_reports(task_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS employee_proposals (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      proposal_type TEXT NOT NULL,
      estimated_amount BIGINT NOT NULL DEFAULT 0 CHECK (estimated_amount >= 0),
      content TEXT NOT NULL,
      submitter_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      status TEXT NOT NULL DEFAULT 'Chờ duyệt' CHECK (status IN ('Chờ duyệt', 'Đã duyệt', 'Từ chối')),
      reviewer_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
      review_note TEXT NOT NULL DEFAULT '',
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS employee_proposals_submitter_idx ON employee_proposals(submitter_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS employee_proposals_status_idx ON employee_proposals(status, created_at DESC);
    CREATE INDEX IF NOT EXISTS employee_proposals_code_idx ON employee_proposals(LOWER(code));

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      title TEXT NOT NULL,
      current_revision INTEGER NOT NULL DEFAULT 1,
      settings_json TEXT NOT NULL DEFAULT '{}',
      deleted_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS documents_owner_idx ON documents(owner_id, deleted_at, updated_at DESC);

    CREATE TABLE IF NOT EXISTS document_members (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'commenter', 'viewer')),
      created_at TEXT NOT NULL,
      UNIQUE(document_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS document_members_doc_idx ON document_members(document_id);
    CREATE INDEX IF NOT EXISTS document_members_user_idx ON document_members(user_id);

    CREATE TABLE IF NOT EXISTS document_snapshots (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(document_id, revision)
    );
    CREATE INDEX IF NOT EXISTS document_snapshots_doc_idx ON document_snapshots(document_id, revision DESC);

    CREATE TABLE IF NOT EXISTS document_operations (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      revision INTEGER NOT NULL,
      client_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(document_id, transaction_id)
    );
    CREATE INDEX IF NOT EXISTS document_operations_doc_idx ON document_operations(document_id, revision ASC);

    CREATE TABLE IF NOT EXISTS document_comments (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      anchor_data TEXT NOT NULL,
      body TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0 CHECK (resolved IN (0, 1)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS document_comments_doc_idx ON document_comments(document_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS employee_profiles (
      user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      phone TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      position TEXT NOT NULL DEFAULT '',
      employment_status TEXT NOT NULL DEFAULT 'Chính thức',
      join_date TEXT NOT NULL DEFAULT '',
      salary_base BIGINT NOT NULL DEFAULT 0,
      avatar_url TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS employee_profiles_department_idx ON employee_profiles(department, employment_status);

    CREATE TABLE IF NOT EXISTS activation_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash TEXT NOT NULL UNIQUE,
      issued_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      first_opened_at TEXT,
      session_expires_at TEXT,
      used_at TEXT
    );
    CREATE INDEX IF NOT EXISTS activation_tokens_user_idx ON activation_tokens(user_id, issued_at DESC);

    CREATE TABLE IF NOT EXISTS system_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS outbound_mail_log (
      id TEXT PRIMARY KEY,
      category TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'system',
      link TEXT NOT NULL DEFAULT '',
      is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, is_read, created_at DESC);

    CREATE TABLE IF NOT EXISTS system_broadcasts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL,
      target_type TEXT NOT NULL CHECK (target_type IN ('all', 'employee', 'unit')),
      target_ids_json TEXT NOT NULL DEFAULT '[]',
      target_audience TEXT NOT NULL,
      channels_json TEXT NOT NULL DEFAULT '[]',
      sender_label TEXT NOT NULL,
      created_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      status TEXT NOT NULL CHECK (status IN ('Nháp', 'Đang xử lý', 'Đã gửi', 'Gửi một phần', 'Gửi thất bại')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS system_broadcasts_created_idx ON system_broadcasts(created_at DESC, id);
    CREATE INDEX IF NOT EXISTS system_broadcasts_status_idx ON system_broadcasts(status, created_at DESC);

    CREATE TABLE IF NOT EXISTS system_broadcast_recipients (
      id TEXT PRIMARY KEY,
      broadcast_id TEXT NOT NULL REFERENCES system_broadcasts(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      recipient_name TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      employee_code TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      in_app_status TEXT NOT NULL DEFAULT 'not_requested',
      email_status TEXT NOT NULL DEFAULT 'not_requested',
      email_error TEXT NOT NULL DEFAULT '',
      email_attempted_at TEXT,
      email_sent_at TEXT,
      notification_id TEXT REFERENCES notifications(id) ON DELETE SET NULL,
      read_at TEXT,
      created_at TEXT NOT NULL,
      UNIQUE(broadcast_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS system_broadcast_recipients_broadcast_idx ON system_broadcast_recipients(broadcast_id, recipient_name);
    CREATE INDEX IF NOT EXISTS system_broadcast_recipients_user_idx ON system_broadcast_recipients(user_id, broadcast_id);

    CREATE TABLE IF NOT EXISTS contracts (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      contract_category TEXT NOT NULL DEFAULT 'labor',
      contract_template TEXT NOT NULL DEFAULT 'Hợp đồng lao động chính thức',
      party_b_type TEXT NOT NULL DEFAULT 'employee',
      party_b_name TEXT NOT NULL DEFAULT '',
      party_b_tax_code TEXT NOT NULL DEFAULT '',
      party_b_representative TEXT NOT NULL DEFAULT '',
      party_b_position TEXT NOT NULL DEFAULT '',
      party_b_id_number TEXT NOT NULL DEFAULT '',
      party_b_phone TEXT NOT NULL DEFAULT '',
      party_b_email TEXT NOT NULL DEFAULT '',
      party_b_bank TEXT NOT NULL DEFAULT '',
      party_b_address TEXT NOT NULL DEFAULT '',
      employee_code TEXT NOT NULL DEFAULT '',
      employee_name TEXT NOT NULL DEFAULT '',
      employee_id_number TEXT NOT NULL DEFAULT '',
      employee_phone TEXT NOT NULL DEFAULT '',
      employee_email TEXT NOT NULL DEFAULT '',
      employee_bank TEXT NOT NULL DEFAULT '',
      employee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      contract_type TEXT NOT NULL DEFAULT 'Hợp đồng lao động chính thức',
      position TEXT NOT NULL DEFAULT '',
      department TEXT NOT NULL DEFAULT '',
      job_level TEXT NOT NULL DEFAULT '',
      work_location TEXT NOT NULL DEFAULT '',
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      probation_months INTEGER NOT NULL DEFAULT 0,
      contract_value BIGINT NOT NULL DEFAULT 0,
      salary BIGINT NOT NULL DEFAULT 0,
      allowance BIGINT NOT NULL DEFAULT 0,
      stock_shares_percent TEXT NOT NULL DEFAULT '',
      payment_method TEXT NOT NULL DEFAULT '',
      payment_day INTEGER NOT NULL DEFAULT 5,
      working_hours TEXT NOT NULL DEFAULT '',
      annual_leave_days INTEGER NOT NULL DEFAULT 12,
      insurance_type TEXT NOT NULL DEFAULT '',
      nda_clause INTEGER NOT NULL DEFAULT 1,
      non_compete_clause INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'Chờ ký',
      employee_sign_status TEXT NOT NULL DEFAULT 'Chưa ký',
      employee_sign_date TEXT,
      employee_sign_method TEXT,
      employee_cert_name TEXT,
      employee_signed_file_name TEXT,
      company_sign_status TEXT NOT NULL DEFAULT 'Chưa ký',
      company_sign_date TEXT,
      company_sign_method TEXT,
      company_cert_name TEXT,
      company_signed_file_name TEXT,
      signer_name TEXT NOT NULL DEFAULT '',
      signer_position TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      custom_field_values_json TEXT NOT NULL DEFAULT '{}',
      file_node_id TEXT REFERENCES file_nodes(id) ON DELETE SET NULL,
      created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS contracts_code_idx ON contracts(LOWER(code));
    CREATE INDEX IF NOT EXISTS contracts_employee_code_idx ON contracts(LOWER(employee_code));
    CREATE INDEX IF NOT EXISTS contracts_employee_user_id_idx ON contracts(employee_user_id);
    CREATE INDEX IF NOT EXISTS contracts_status_idx ON contracts(status);

    CREATE TABLE IF NOT EXISTS collection_records (
      id TEXT PRIMARY KEY,
      scope TEXT NOT NULL,
      record_key TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(scope, record_key, owner_id)
    );
    CREATE INDEX IF NOT EXISTS collection_records_scope_idx
      ON collection_records(scope, updated_at DESC, record_key);
    CREATE INDEX IF NOT EXISTS collection_records_owner_idx
      ON collection_records(owner_id, scope, updated_at DESC);

    CREATE TABLE IF NOT EXISTS trash_items (
      id TEXT PRIMARY KEY,
      original_id TEXT NOT NULL,
      scope TEXT NOT NULL,
      record_key TEXT NOT NULL,
      owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_by_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      deleted_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS trash_items_deleted_idx ON trash_items(deleted_at DESC, scope, record_key);
    CREATE INDEX IF NOT EXISTS trash_items_owner_idx ON trash_items(owner_id, deleted_at DESC);

    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      actor_id TEXT REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      resource_scope TEXT NOT NULL,
      resource_id TEXT NOT NULL DEFAULT '',
      details_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS audit_events_created_idx ON audit_events(created_at DESC);
    CREATE INDEX IF NOT EXISTS audit_events_actor_idx ON audit_events(actor_id, created_at DESC);
  `);

  const cashColumnNames = isPg
    ? (await queryAll("SELECT column_name FROM information_schema.columns WHERE table_name = 'finance_cash_transactions' AND table_schema = current_schema()")).map(row => row.column_name)
    : (await queryAll('PRAGMA table_info(finance_cash_transactions)')).map(row => row.name);
  const cashColumns = new Set(cashColumnNames);
  for (const [name, definition] of [
    ['source_account_id', 'TEXT'],
    ['counterparty_type', "TEXT NOT NULL DEFAULT 'other'"],
    ['counterparty_contact_id', 'TEXT'],
    ['journal_lines_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['attachments_json', "TEXT NOT NULL DEFAULT '[]'"],
    ['voucher_date', 'TEXT'],
    ['currency', "TEXT NOT NULL DEFAULT 'VND'"],
    ['reference', "TEXT NOT NULL DEFAULT ''"],
  ]) {
    if (cashColumns.has(name)) continue;
    await exec(`ALTER TABLE finance_cash_transactions ADD COLUMN ${isPg ? 'IF NOT EXISTS ' : ''}${name} ${definition}`);
  }
  await exec('CREATE INDEX IF NOT EXISTS finance_cash_transactions_account_idx ON finance_cash_transactions(source_account_id)');
  await exec('CREATE INDEX IF NOT EXISTS finance_cash_transactions_contact_idx ON finance_cash_transactions(counterparty_contact_id)');
  const crmColumns = new Set(isPg
    ? (await queryAll("SELECT column_name FROM information_schema.columns WHERE table_name = 'crm_contacts' AND table_schema = current_schema()")).map(row => row.column_name)
    : (await queryAll('PRAGMA table_info(crm_contacts)')).map(row => row.name));
  if (!crmColumns.has('details_json')) await exec(`ALTER TABLE crm_contacts ADD COLUMN ${isPg ? 'IF NOT EXISTS ' : ''}details_json TEXT NOT NULL DEFAULT ''`);
}

const db = {
  pool,
  query,
  queryOne,
  queryAll,
  exec,
  prepare,
  transaction,
  backupTo,
  close,
  initDatabaseSchema,
};

export default db;
