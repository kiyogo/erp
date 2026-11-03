import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-finance-cash-forecast-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env,
  USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory,
  KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'),
  KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'cash-forecast@example.test',
  SEED_ADMIN_PASSWORD: 'Forecast-Test-26!Safe',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-FORECAST',
  JWT_SECRET: 'isolated-cash-forecast-test-secret-not-for-deployment',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000 });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) {
    const exit = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exit;
  }
});

const base = `http://127.0.0.1:${port}/api/v1`;
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (server.exitCode !== null || attempt === 99) throw new Error(logs);
  await new Promise(resolve => setTimeout(resolve, 100));
}
async function login(email, password) {
  const response = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200);
  const session = await response.json();
  return { session, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token || session.token}` } };
}
const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
async function request(route, method = 'GET', payload, expected = 200, headers = admin.headers) {
  const response = await fetch(`${base}${route}`, {
    method, headers, body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await response.json();
  if (response.status >= 500) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(response.status, expected, JSON.stringify({ body, server: response.status >= 500 ? logs : undefined }));
  return body;
}

const validScenario = {
  key: 'forecast-test-1',
  scenarioName: 'Kịch bản kiểm thử',
  startDate: '2026-11-01',
  endDate: '2026-11-07',
  openingBalance: 1000,
  condition: 'Căn cứ kiểm thử',
  receivableProbabilityPct: null,
  sourceFlows: [
    { key: 'receipt-1', source: 'receivable', direction: 'inflow', date: '2026-11-02', originalDate: '2026-11-02', reference: 'BH-TEST', amount: 500, originalAmount: 500 },
    { key: 'payment-1', source: 'payable', direction: 'outflow', date: '2026-11-03', originalDate: '2026-11-03', reference: 'MH-TEST', amount: 100, originalAmount: 100 },
  ],
  periods: [{ startDate: '2026-11-01', endDate: '2026-11-07', openingBalance: 1000, inflow: 500, outflow: 100, net: 400, closingBalance: 1400 }],
  expectedInflow: 500,
  expectedOutflow: 100,
  projectedBalance: 1400,
};

test('cash forecast snapshots validate totals, preserve author and remain append-only', async () => {
  const created = await request('/collections/finance_cash_forecast_scenarios', 'POST', { record: validScenario }, 201);
  assert.equal(created.record.scenarioName, validScenario.scenarioName);
  assert.equal(created.record.createdBy, admin.session.user.name);
  assert.equal(created.record.periods[0].closingBalance, 1400);
  await request('/collections/finance_cash_forecast_scenarios', 'POST', { record: validScenario }, 409);
  await request('/collections/finance_cash_forecast_scenarios/forecast-test-1', 'PATCH', { patch: { condition: 'changed' } }, 409);
  await request('/collections/finance_cash_forecast_scenarios/forecast-test-1', 'DELETE', undefined, 409);
  const mismatched = { ...validScenario, key: 'forecast-test-2', expectedInflow: 501 };
  await request('/collections/finance_cash_forecast_scenarios', 'POST', { record: mismatched }, 422);
  const overlong = { ...validScenario, key: 'forecast-test-3', endDate: '2027-11-02' };
  await request('/collections/finance_cash_forecast_scenarios', 'POST', { record: overlong }, 422);
});

test('non-admin users cannot read or create company cash forecast scenarios', async () => {
  await request('/users', 'POST', {
    email: 'forecast-user@example.test', name: 'Forecast User', password: 'Forecast-Test-26!Safe', role: 'USER', employeeCode: 'FORECAST-USER',
  }, 201);
  const user = await login('forecast-user@example.test', 'Forecast-Test-26!Safe');
  await request('/collections/finance_cash_forecast_scenarios', 'GET', undefined, 403, user.headers);
  await request('/collections/finance_cash_forecast_scenarios', 'POST', { record: { ...validScenario, key: 'user-forecast' } }, 403, user.headers);
});

