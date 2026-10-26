import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-finance-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'),
  KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'finance@example.test', SEED_ADMIN_PASSWORD: 'Finance-Test-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-FINANCE', JWT_SECRET: 'isolated-finance-test-secret',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
const storage = new DatabaseSync(env.KIYOVN_DB_PATH);
after(async () => {
  storage.close();
  if (server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  console.log(`Isolated finance evidence: ${directory}`);
});
const base = `http://127.0.0.1:${port}/api/v1`;
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (server.exitCode !== null || i === 99) throw new Error(logs);
  await new Promise(resolve => setTimeout(resolve, 100));
}
const loginResponse = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }) });
assert.equal(loginResponse.status, 200);
const session = await loginResponse.json();
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token || session.token}` };
async function request(route, method = 'GET', payload, expected = 200) {
  const response = await fetch(`${base}${route}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}
async function bank(balance = 100_000, status = 'Đang hoạt động', bankName = `Test ${randomUUID()}`) {
  return (await request('/finance/bank-accounts', 'POST', { bankName, accountNumber: randomUUID(), accountHolder: 'Test Company', branch: '', balance, status }, 201)).account;
}
function payload(source, destination, extra = {}) {
  return {
    requestId: randomUUID(), sourceAccountId: source.key, destinationAccountId: destination.key,
    amount: 1000, fee: 0, purpose: 'Test ledger transfer', transferDate: new Date().toISOString().slice(0, 10), transferMethod: 'Ghi sổ nội bộ', ...extra,
  };
}
async function balance(key) {
  return (await request('/finance/internal-transfers')).accounts.find(account => account.key === key).balance;
}

test('only authenticated administrators may read or record transfers', async () => {
  assert.equal((await fetch(`${base}/finance/internal-transfers`)).status, 401);
  assert.equal((await fetch(`${base}/finance/internal-transfers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
  const admin = storage.prepare('SELECT * FROM users WHERE id = ?').get(session.user.id);
  storage.prepare("INSERT INTO users (id, email, name, employee_code, role, password_hash, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 'USER', ?, 1, ?, ?)")
    .run('finance-user', 'user@example.test', 'Finance User', 'FINANCE-USER', admin.password_hash, admin.created_at, admin.updated_at);
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'user@example.test', password: env.SEED_ADMIN_PASSWORD }) });
  assert.equal(login.status, 200);
  const user = await login.json();
  const userHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${user.access_token || user.token}` };
  for (const method of ['GET', 'POST']) {
    assert.equal((await fetch(`${base}/finance/internal-transfers`, { method, headers: userHeaders, body: method === 'POST' ? '{}' : undefined })).status, 403);
  }
  assert.equal((await fetch(`${base}/collections/finance_internal_transfers`, { method: 'POST', headers: userHeaders, body: '{"record":{"key":"fake"}}' })).status, 403);
});

test('invalid amounts, accounts, dates and overdrafts leave the ledger unchanged', async () => {
  const source = await bank(5000);
  const destination = await bank(0);
  const inactive = await bank(0, 'Đã khóa');
  const count = storage.prepare('SELECT COUNT(*) AS n FROM finance_cash_transactions').get().n;
  for (const patch of [
    { amount: 0 }, { amount: -1 }, { amount: 1.1 }, { amount: 1_000_000_000_001 }, { fee: -1 }, { fee: 0.5 },
    { amount: 5000, fee: 1 }, { sourceAccountId: 'missing' }, { destinationAccountId: source.key },
    { destinationAccountId: inactive.key }, { transferDate: '2026-02-30' }, { transferDate: '9999-12-31' },
    { purpose: '' }, { requestId: 'short' }, { transferMethod: 'made-up' },
  ]) await request('/finance/internal-transfers', 'POST', payload(source, destination, patch), 422);
  assert.equal(storage.prepare('SELECT COUNT(*) AS n FROM finance_cash_transactions').get().n, count);
  assert.equal(await balance(source.key), 5000);
  assert.equal(await balance(destination.key), 0);
});

test('a transfer records balanced legs, actual fee, real actor and audit; retries do not duplicate it', async () => {
  const source = await bank(50_000);
  const destination = await bank(10_000);
  const input = payload(source, destination, { amount: 12_000, fee: 500, executor: 'Spoof', approver: 'Spoof', status: 'Đã hủy' });
  const { transfer } = await request('/finance/internal-transfers', 'POST', input, 201);
  assert.equal(transfer.executorId, session.user.id);
  assert.equal(transfer.executor, session.user.name);
  assert.equal(transfer.approver, '');
  assert.equal(transfer.executionStatus, 'ledger_only');
  assert.equal(transfer.status, 'Thành công');
  const legs = storage.prepare('SELECT * FROM finance_cash_transactions WHERE code LIKE ? ORDER BY code').all(`${transfer.transferCode}-%`);
  assert.equal(legs.length, 3);
  assert.deepEqual(legs.map(row => [row.transaction_type, row.amount]), [['Chi', 500], ['Thu', 12_000], ['Chi', 12_000]]);
  assert.ok(legs.every(row => row.created_by === session.user.id));
  assert.equal(await balance(source.key), 37_500);
  assert.equal(await balance(destination.key), 22_000);
  const account = (await request('/finance/bank-accounts')).data.find(item => item.key === source.key);
  assert.equal(account.balance, 50_000, 'opening balance remains backward compatible');
  assert.equal(account.currentBalance, 37_500);
  assert.equal(storage.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE resource_id = ? AND action = 'record_internal_transfer'").get(transfer.key).n, 1);
  const retry = await request('/finance/internal-transfers', 'POST', input);
  assert.equal(retry.replayed, true);
  assert.equal(retry.transfer.key, transfer.key);
  await request('/finance/internal-transfers', 'POST', { ...input, amount: 12_001 }, 409);
  assert.equal(storage.prepare('SELECT COUNT(*) AS n FROM finance_cash_transactions WHERE code LIKE ?').get(`${transfer.transferCode}-%`).n, 3);
});

test('failure on the credit leg rolls back the debit, metadata and audit', async () => {
  const source = await bank(10_000);
  const destination = await bank(0);
  const before = storage.prepare('SELECT COUNT(*) AS n FROM finance_cash_transactions').get().n;
  storage.exec("CREATE TRIGGER transfer_credit_failure BEFORE INSERT ON finance_cash_transactions WHEN NEW.transaction_type = 'Thu' AND NEW.category = 'Chuyển tiền nội bộ' BEGIN SELECT RAISE(ABORT, 'injected credit failure'); END;");
  try {
    await request('/finance/internal-transfers', 'POST', payload(source, destination), 500);
  } finally {
    storage.exec('DROP TRIGGER transfer_credit_failure');
  }
  assert.equal(storage.prepare('SELECT COUNT(*) AS n FROM finance_cash_transactions').get().n, before);
  assert.equal(await balance(source.key), 10_000);
  assert.equal(await balance(destination.key), 0);
});

test('concurrent transfers cannot spend the same source balance twice', async () => {
  const source = await bank(10_000);
  const destination = await bank(0);
  const responses = await Promise.all(Array.from({ length: 2 }, () => fetch(`${base}/finance/internal-transfers`, { method: 'POST', headers, body: JSON.stringify(payload(source, destination, { amount: 7000 })) })));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 422]);
  assert.equal(await balance(source.key), 3000);
  assert.equal(await balance(destination.key), 7000);
});

test('simultaneous retries of the same request create one transfer', async () => {
  const source = await bank(10_000);
  const destination = await bank(0);
  const input = payload(source, destination, { amount: 7000 });
  const responses = await Promise.all(Array.from({ length: 2 }, () => fetch(`${base}/finance/internal-transfers`, { method: 'POST', headers, body: JSON.stringify(input) })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  const results = await Promise.all(responses.map(response => response.json()));
  assert.equal(results[0].transfer.key, results[1].transfer.key);
  assert.equal(await balance(source.key), 3000);
});

test('canceling a transfer restores both balances and fee atomically and cannot cancel one leg', async () => {
  const source = await bank(10_000);
  const destination = await bank(0);
  const { transfer } = await request('/finance/internal-transfers', 'POST', payload(source, destination, { amount: 4000, fee: 100 }), 201);
  await request(`/finance/cash-transactions/${transfer.transactionIds[0]}`, 'PATCH', { status: 'Đã hủy' }, 409);
  const { transfer: canceled } = await request(`/finance/internal-transfers/${encodeURIComponent(transfer.key)}/cancel`, 'POST', { reason: 'Duplicate original bank entry' });
  assert.equal(canceled.status, 'Đã hủy');
  assert.equal(canceled.canceledById, session.user.id);
  assert.ok(canceled.canceledAt);
  assert.equal(await balance(source.key), 10_000);
  assert.equal(await balance(destination.key), 0);
  assert.equal(storage.prepare("SELECT COUNT(*) AS n FROM finance_cash_transactions WHERE code LIKE ? AND status = 'Đã hủy'").get(`${transfer.transferCode}-%`).n, 3);
  await request(`/finance/internal-transfers/${encodeURIComponent(transfer.key)}/cancel`, 'POST', { reason: 'Retry cancellation' });
  assert.equal(storage.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE resource_id = ? AND action = 'cancel_internal_transfer'").get(transfer.key).n, 1);
});

test('canceling after destination funds are spent is rejected without partial changes', async () => {
  const source = await bank(10_000);
  const destination = await bank(0);
  const final = await bank(0);
  const { transfer } = await request('/finance/internal-transfers', 'POST', payload(source, destination, { amount: 4000 }), 201);
  await request('/finance/internal-transfers', 'POST', payload(destination, final, { amount: 4000 }), 201);
  await request(`/finance/internal-transfers/${encodeURIComponent(transfer.key)}/cancel`, 'POST', { reason: 'Attempt after spending' }, 422);
  assert.equal(await balance(source.key), 6000);
  assert.equal(storage.prepare("SELECT COUNT(*) AS n FROM finance_cash_transactions WHERE code LIKE ? AND status = 'Đã hoàn thành'").get(`${transfer.transferCode}-%`).n, 2);
});

test('bank to cash and cash to bank entries use the existing petty cash ledger', async () => {
  const source = await bank(10_000);
  const petty = { key: 'petty:Quỹ tiền mặt' };
  const before = await balance(petty.key);
  const { transfer } = await request('/finance/internal-transfers', 'POST', payload(source, petty, { amount: 3000 }), 201);
  assert.equal(transfer.destinationType, 'petty');
  assert.equal(await balance(petty.key), before + 3000);
  await request('/finance/internal-transfers', 'POST', payload(petty, source, { amount: 1000 }), 201);
  assert.equal(await balance(petty.key), before + 2000);
  assert.equal(await balance(source.key), 8000);
});

test('historical transfers stay readable; generic mutation cannot forge or erase linked entries', async () => {
  const timestamp = new Date().toISOString();
  storage.prepare("INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at) VALUES (?, 'finance_internal_transfers', ?, ?, ?, ?, ?)")
    .run('historical-transfer', 'historical-transfer', session.user.id, JSON.stringify({ key: 'historical-transfer', transferCode: 'OLD', amount: 200, status: 'Thành công' }), timestamp, timestamp);
  const historical = (await request('/finance/internal-transfers')).data.find(item => item.key === 'historical-transfer');
  assert.equal(historical.transferCode, 'OLD');
  assert.equal(historical.ledgerRecorded, undefined);
  await request('/collections/finance_internal_transfers', 'PUT', { records: [] }, 409);
  await request('/collections/finance_internal_transfers', 'POST', { record: { key: 'forged' } }, 409);
  await request('/collections/finance_internal_transfers/historical-transfer', 'PATCH', { patch: { amount: 900 } }, 409);
  await request('/collections/finance_internal_transfers/historical-transfer', 'DELETE', undefined, 409);
  await request('/finance/internal-transfers/historical-transfer/cancel', 'POST', { reason: 'Unlinked historical entry' }, 409);
  assert.equal((await request('/finance/internal-transfers')).data.find(item => item.key === 'historical-transfer').amount, 200);
});
