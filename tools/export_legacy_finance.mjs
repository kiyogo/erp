#!/usr/bin/env node
// Read-only, allowlisted exporter for legacy finance bank accounts and cash vouchers.
// Use only an approved disposable SQLite copy; the output can contain account numbers
// and financial counterparties. This script never reads credentials or changes the DB.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const FORMAT = 'kiyovn-legacy-finance';
const MAX_RECORDS = 10_000;
const MAX_BYTES = 15 * 1024 * 1024;
const TABLES = {
  finance_bank_accounts: [
    'id', 'bank_name', 'account_number', 'account_holder', 'branch', 'opening_balance',
    'status', 'created_by', 'created_at', 'updated_at',
  ],
  finance_cash_transactions: [
    'id', 'code', 'transaction_type', 'source', 'category', 'amount', 'transaction_date',
    'counterparty', 'account_name', 'status', 'note', 'department', 'employee_code',
    'created_by', 'created_at', 'updated_at',
  ],
};

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!['--source', '--source-id', '--output'].includes(flag)) {
      throw new Error(`Tùy chọn không được hỗ trợ: ${flag}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Thiếu giá trị cho ${flag}.`);
    if (options[flag]) throw new Error(`Không được lặp tùy chọn ${flag}.`);
    options[flag] = value;
    index += 1;
  }
  if (!options['--source'] || !options['--source-id']) {
    throw new Error('Cách dùng: node tools/export_legacy_finance.mjs --source <sqlite-copy> --source-id <stable-id> [--output <new-json-file>]');
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(options['--source-id'])) {
    throw new Error('--source-id chỉ được dùng chữ ASCII, số, dấu chấm, gạch ngang hoặc gạch dưới (tối đa 64 ký tự).');
  }
  return options;
}

function assertSchema(db, table, requiredColumns) {
  const present = db.prepare("SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name=?").get(table);
  if (!present) throw new Error(`Database không có bảng ${table}; chưa tạo gói.`);
  const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
  if (requiredColumns.some((column) => !columns.has(column))) {
    throw new Error(`Schema ${table} không khớp phiên bản được hỗ trợ; chưa tạo gói.`);
  }
}

function requiredString(value, label, maximum = 64 * 1024) {
  if (typeof value !== 'string' || value.length > maximum) {
    throw new Error(`Dữ liệu ${label} không hợp lệ; chưa tạo gói.`);
  }
  return value;
}

function requiredInteger(value, label) {
  if (!Number.isSafeInteger(value)) throw new Error(`Số liệu ${label} vượt miền nguyên an toàn; chưa tạo gói.`);
  return value;
}

function exportAccounts(db) {
  const rows = db.prepare(`
    SELECT id,bank_name,account_number,account_holder,branch,opening_balance,status,
           created_by,created_at,updated_at
    FROM finance_bank_accounts ORDER BY id
  `).all();
  const seen = new Set();
  return rows.map((row) => {
    const key = requiredString(row.id, 'ID tài khoản', 256);
    if (!key.trim() || key !== key.trim() || seen.has(key)) {
      throw new Error('Database có ID tài khoản rỗng hoặc trùng; chưa tạo gói.');
    }
    seen.add(key);
    return {
      key,
      bankName: requiredString(row.bank_name, 'tên ngân hàng', 2_000),
      accountNumber: requiredString(row.account_number, 'số tài khoản', 16 * 1024),
      accountHolder: requiredString(row.account_holder, 'chủ tài khoản', 2_000),
      branch: requiredString(row.branch ?? '', 'chi nhánh', 2_000),
      balance: requiredInteger(row.opening_balance, 'số dư khai báo'),
      status: requiredString(row.status, 'trạng thái tài khoản', 1_000),
      createdBy: requiredString(row.created_by, 'người tạo tài khoản', 256),
      createdAt: requiredString(row.created_at, 'thời điểm tạo tài khoản', 256),
      updatedAt: requiredString(row.updated_at, 'thời điểm cập nhật tài khoản', 256),
    };
  });
}

function exportCashTransactions(db) {
  const rows = db.prepare(`
    SELECT id,code,transaction_type,source,category,amount,transaction_date,counterparty,
           account_name,status,note,department,employee_code,created_by,created_at,updated_at
    FROM finance_cash_transactions ORDER BY id
  `).all();
  const seenIds = new Set();
  const seenCodes = new Set();
  return rows.map((row) => {
    const key = requiredString(row.id, 'ID phiếu', 256);
    const code = requiredString(row.code, 'mã phiếu', 512);
    if (!key.trim() || key !== key.trim() || seenIds.has(key) || seenCodes.has(code.toLowerCase())) {
      throw new Error('Database có ID hoặc mã phiếu trùng; chưa tạo gói.');
    }
    seenIds.add(key);
    seenCodes.add(code.toLowerCase());
    return {
      key,
      code,
      type: requiredString(row.transaction_type, 'loại phiếu', 100),
      source: requiredString(row.source, 'nguồn phiếu', 100),
      category: requiredString(row.category, 'nội dung phiếu'),
      amount: requiredInteger(row.amount, 'số tiền phiếu'),
      date: requiredString(row.transaction_date, 'ngày phiếu', 100),
      recipientOrPayer: requiredString(row.counterparty, 'đối tác phiếu'),
      account: requiredString(row.account_name, 'tài khoản phiếu'),
      status: requiredString(row.status, 'trạng thái phiếu', 100),
      note: requiredString(row.note ?? '', 'ghi chú'),
      department: row.department == null ? null : requiredString(row.department, 'phòng ban'),
      employeeCode: row.employee_code == null ? null : requiredString(row.employee_code, 'mã nhân viên'),
      createdBy: requiredString(row.created_by, 'người tạo phiếu', 256),
      createdAt: requiredString(row.created_at, 'thời điểm tạo phiếu', 256),
      updatedAt: requiredString(row.updated_at, 'thời điểm cập nhật phiếu', 256),
    };
  });
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const sourcePath = path.resolve(options['--source']);
  const outputPath = path.resolve(options['--output'] ||
    `kiyovn-legacy-finance-${new Date().toISOString().slice(0, 10)}.json`);
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isFile()) {
    throw new Error('Không tìm thấy tệp SQLite nguồn; không tạo gói.');
  }
  if (sourcePath === outputPath) throw new Error('Tệp xuất không được trùng với database nguồn.');

  const db = new DatabaseSync(sourcePath, { readOnly: true });
  let outputCreated = false;
  try {
    db.exec('PRAGMA query_only=ON; BEGIN;');
    for (const [table, columns] of Object.entries(TABLES)) assertSchema(db, table, columns);
    const accounts = exportAccounts(db);
    const cashTransactions = exportCashTransactions(db);
    const total = accounts.length + cashTransactions.length;
    if (!Number.isSafeInteger(total) || total < 1 || total > MAX_RECORDS) {
      throw new Error(`Tổng tài khoản và phiếu phải nằm trong 1..${MAX_RECORDS}; không tạo gói.`);
    }
    const bundle = {
      format: FORMAT,
      schemaVersion: 1,
      batchId: randomUUID(),
      sourceDatabaseId: options['--source-id'],
      exportedAt: new Date().toISOString(),
      accounts,
      cashTransactions,
    };
    const serialized = `${JSON.stringify(bundle, null, 2)}\n`;
    const bytes = Buffer.byteLength(serialized, 'utf8');
    if (bytes > MAX_BYTES) throw new Error('Gói finance vượt quá 15 MiB; chưa tạo tệp.');
    fs.writeFileSync(outputPath, serialized, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    outputCreated = true;
    db.exec('ROLLBACK;');
    db.close();
    console.warn('Đã xuất finance bằng SQLite chỉ-đọc; không sửa DB nguồn. Gói có thể chứa số tài khoản, tên đối tác và thông tin tài chính; hãy bảo vệ tệp và chỉ chạy trên bản sao đã được phê duyệt.', {
      sourceDatabaseId: bundle.sourceDatabaseId,
      batchId: bundle.batchId,
      accounts: accounts.length,
      cashTransactions: cashTransactions.length,
      bytes,
    });
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch {}
    try { db.close(); } catch {}
    if (outputCreated) {
      try { fs.unlinkSync(outputPath); } catch {}
    }
    throw error;
  }
}

try {
  main();
} catch (error) {
  console.error(`Export finance thất bại: ${error.message}`);
  process.exitCode = 1;
}
