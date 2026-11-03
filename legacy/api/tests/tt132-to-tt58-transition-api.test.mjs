import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-tt132-to-tt58-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'tt132-transition@example.test', SEED_ADMIN_PASSWORD: 'TT132-Transition-26!Safe',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-TT132-TRANSITION', JWT_SECRET: 'isolated-tt132-transition-test-secret-not-for-deployment',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exit; }
  console.log(`TT132 to TT58 transition API evidence: ${directory}`);
});

const base = `http://127.0.0.1:${port}/api/v1`;
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (server.exitCode !== null || attempt === 99) throw new Error(logs);
  await new Promise(resolve => setTimeout(resolve, 100));
}
const login = await fetch(`${base}/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }),
});
assert.equal(login.status, 200);
const session = await login.json();
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token || session.token}` };
async function request(route, method = 'GET', payload, expected = 200) {
  const response = await fetch(`${base}${route}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify({ body, server: response.status >= 500 ? logs : undefined }));
  return body;
}
function seedLedger(records) {
  const db = new DatabaseSync(env.KIYOVN_DB_PATH);
  try {
    const insert = db.prepare(`INSERT INTO collection_records (id, scope, record_key, owner_id, payload_json, created_at, updated_at)
      VALUES (?, 'finance_general_ledger', ?, ?, ?, ?, ?)`);
    for (const record of records) insert.run(randomUUID(), record.key, session.user.id, JSON.stringify(record), '2026-11-03T00:00:00.000Z', '2026-11-03T00:00:00.000Z');
  } finally { db.close(); }
}

test('TT132 year-end balance preview maps official opening books and flags missing detail reconciliation', async () => {
  const initial = (await request('/system/company-profile')).profile;
  await request('/system/company-profile', 'PUT', {
    ...initial, companyName: 'Doanh nghiệp siêu nhỏ chuyển đổi', taxCode: '0012345678', legalForm: 'llc_single',
    companySize: 'micro', industry: 'Thương mại', accountingRegime: 'TT58', accountingEffectiveDate: '2026-07-01',
    fiscalYearStartMonth: 7, fiscalYearStartDay: 1, vatMethod: 'deduction', citMethod: 'taxable_income',
  });
  seedLedger([
    { key: 'TT132-1', voucherCode: 'TT132-1', entryDate: '2026-06-30', accountingRegime: 'TT132', status: 'Đã ghi sổ cái', amount: 100, debitAccount: '1111', creditAccount: '4111' },
    { key: 'TT132-2', voucherCode: 'TT132-2', entryDate: '2026-06-29', accountingRegime: 'TT132', status: 'Đã ghi sổ cái', amount: 40, lines: [{ account: '1526', debit: 40, credit: 0 }, { account: '3318', debit: 0, credit: 40 }] },
  ]);
  const preview = (await request('/finance/accounting-transitions/tt132-to-tt58')).preview;
  assert.equal(preview.openingDate, '2026-07-01');
  assert.equal(preview.sourceEntryCount, 2);
  assert.equal(preview.balanced, true);
  assert.deepEqual(preview.accounts.map(({ accountCode, debitBalanceCents, creditBalanceCents, targetBookCode, detailRequired }) => [accountCode, debitBalanceCents, creditBalanceCents, targetBookCode, detailRequired]), [
    ['1111', 10000, 0, 'S2d-DNSN', false],
    ['1526', 4000, 0, 'S2c-DNSN', true],
    ['3318', 0, 4000, 'S4a-DNSN', true],
    ['4111', 0, 10000, 'S4d-DNSN', false],
  ]);
  seedLedger([{ key: 'TT132-after', voucherCode: 'TT132-AFTER', entryDate: '2026-07-01', accountingRegime: 'TT132', status: 'Đã ghi sổ cái', amount: 1, debitAccount: '1111', creditAccount: '4111' }]);
  await request('/finance/accounting-transitions/tt132-to-tt58', 'GET', undefined, 409);
});
