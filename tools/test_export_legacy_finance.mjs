import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const exporter = path.resolve('tools/export_legacy_finance.mjs');

function withFixture(t, { includeTables = true, accountNumber = '0012345678' } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'kiyovn-finance-export-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = path.join(directory, 'legacy-copy.sqlite');
  const db = new DatabaseSync(source);
  if (includeTables) {
    db.exec(`
      CREATE TABLE finance_bank_accounts (
        id TEXT PRIMARY KEY, bank_name TEXT NOT NULL, account_number TEXT NOT NULL,
        account_holder TEXT NOT NULL, branch TEXT NOT NULL DEFAULT '', opening_balance BIGINT NOT NULL,
        status TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      CREATE TABLE finance_cash_transactions (
        id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, transaction_type TEXT NOT NULL,
        source TEXT NOT NULL, category TEXT NOT NULL, amount BIGINT NOT NULL,
        transaction_date TEXT NOT NULL, counterparty TEXT NOT NULL, account_name TEXT NOT NULL,
        status TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', department TEXT, employee_code TEXT,
        created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      );
      INSERT INTO finance_cash_transactions VALUES
        ('cash-1','PT-LEGACY-1','Thu','bank','Thu hợp đồng',250000,'2026-10-02','Khách hàng A','Ngân hàng A','Đã hoàn thành','Hợp đồng A','Tài chính','EMP-01','admin-1','2026-10-02T00:00:00.000Z','2026-10-02T00:00:00.000Z'),
        ('cash-2','PC-LEGACY-2','Chi','petty','Chi phí văn phòng',50000,'2026-10-03','Nhà cung cấp B','Quỹ tiền mặt','Đã hủy','Phiếu đã hủy',NULL,NULL,'admin-1','2026-10-03T00:00:00.000Z','2026-10-03T00:00:00.000Z');
    `);
    db.prepare(`
      INSERT INTO finance_bank_accounts
      (id,bank_name,account_number,account_holder,branch,opening_balance,status,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run('bank-1', 'Ngân hàng A', accountNumber, 'NGUYEN VAN A', 'Hà Nội', 1200000,
      'Đang hoạt động', 'admin-1', '2026-10-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z');
  }
  db.close();
  return { directory, source };
}

function runExporter(source, output, sourceId = 'approved-copy-1') {
  return spawnSync(process.execPath, [
    exporter,
    '--source', source,
    '--source-id', sourceId,
    '--output', output,
  ], { encoding: 'utf8' });
}

test('exports only allowlisted finance fields and preserves both voucher sources', (t) => {
  const { directory, source } = withFixture(t, { accountNumber: 'ENC:{"v":1,"kid":"finance-v1"}' });
  const output = path.join(directory, 'finance-bundle.json');
  const result = runExporter(source, output);
  assert.equal(result.status, 0, result.stderr);
  const bundle = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(bundle.format, 'kiyovn-legacy-finance');
  assert.equal(bundle.sourceDatabaseId, 'approved-copy-1');
  assert.equal(bundle.accounts.length, 1);
  assert.equal(bundle.accounts[0].key, 'bank-1');
  assert.equal(bundle.accounts[0].accountNumber, 'ENC:{"v":1,"kid":"finance-v1"}');
  assert.equal(bundle.cashTransactions.length, 2);
  assert.equal(bundle.cashTransactions[1].source, 'petty');
  assert.equal(bundle.cashTransactions[1].status, 'Đã hủy');
  assert.match(result.stderr, /chỉ-đọc/);
  const verify = new DatabaseSync(source, { readOnly: true });
  assert.equal(verify.prepare('SELECT COUNT(*) AS total FROM finance_bank_accounts').get().total, 1);
  assert.equal(verify.prepare('SELECT COUNT(*) AS total FROM finance_cash_transactions').get().total, 2);
  verify.close();
});

test('exports plaintext legacy account data with a warning and refuses to overwrite output', (t) => {
  const { directory, source } = withFixture(t);
  const output = path.join(directory, 'finance-bundle.json');
  const first = runExporter(source, output);
  assert.equal(first.status, 0, first.stderr);
  const bundle = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(bundle.accounts[0].accountNumber, '0012345678');
  const before = fs.readFileSync(output, 'utf8');
  const second = runExporter(source, output);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /EEXIST|file already exists|đã tồn tại/i);
  assert.equal(fs.readFileSync(output, 'utf8'), before);
});

test('rejects unsupported databases without creating a bundle', (t) => {
  const { directory, source } = withFixture(t, { includeTables: false });
  const output = path.join(directory, 'finance-bundle.json');
  const result = runExporter(source, output);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /không có bảng finance_bank_accounts/);
  assert.equal(fs.existsSync(output), false);
});

test('rejects an invalid stable source identifier before touching output', (t) => {
  const { directory, source } = withFixture(t);
  const output = path.join(directory, 'finance-bundle.json');
  const result = runExporter(source, output, '../production');
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(output), false);
});
