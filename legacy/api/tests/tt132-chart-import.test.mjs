import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-tt132-chart-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'tt132-chart@example.test', SEED_ADMIN_PASSWORD: 'TT132-Chart-26!Safe',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-TT132', JWT_SECRET: 'isolated-tt132-chart-test-secret-not-for-deployment',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exit; }
  console.log(`TT132 chart API evidence: ${directory}`);
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

test('TT132 chart import is regime-specific, idempotent and rejects parent-account posting', async () => {
  const initial = (await request('/system/company-profile')).profile;
  await request('/system/company-profile', 'PUT', {
    ...initial, companyName: 'Doanh nghiệp siêu nhỏ kiểm thử', taxCode: '0012345678', legalForm: 'llc_single',
    companySize: 'micro', industry: 'Kiểm thử', accountingRegime: 'TT132', accountingEffectiveDate: '2026-01-01',
    fiscalYearStartMonth: 1, fiscalYearStartDay: 1, vatMethod: 'deduction',
  });
  const imported = await request('/finance/chart-of-accounts/templates/import', 'POST', {}, 201);
  assert.equal(imported.template.name, 'Thông tư 132/2018/TT-BTC');
  assert.equal(imported.createdCount, 30);
  const repeated = await request('/finance/chart-of-accounts/templates/import', 'POST', {}, 200);
  assert.equal(repeated.createdCount, 0);
  assert.equal(repeated.skippedCount, 30);
  await request('/finance/general-ledger/entries', 'POST', {
    voucherCode: 'TT132-PARENT-001', entryDate: '2026-10-30', description: 'Không ghi trực tiếp tài khoản tổng hợp',
    lines: [{ account: '111', debit: 100, credit: 0 }, { account: '911', debit: 0, credit: 100 }],
  }, 422);
});
