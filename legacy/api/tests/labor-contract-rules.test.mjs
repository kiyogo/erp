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

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-labor-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'),
  KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'labor@example.test', SEED_ADMIN_PASSWORD: 'Labor-Test-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-LABOR', JWT_SECRET: 'isolated-labor-test-secret',
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
  console.log(`Isolated labor evidence: ${directory}`);
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
async function request(route, method = 'GET', payload, expected = 200, headerOverrides = {}) {
  const response = await fetch(`${base}${route}`, { method, headers: { ...headers, ...headerOverrides }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}

const base0 = { name: 'Hợp đồng lao động kiểm thử', contractTemplate: 'Mẫu thử', partyBType: 'employee', employeeCode: 'LABOR-1', employeeName: 'Nhân viên', salary: 10000000, signerName: 'Người đại diện' };

test('thời gian thử việc tối đa 6 tháng theo Bộ luật Lao động', async () => {
  await request('/contracts', 'POST', { ...base0, code: 'HD-LABOR-1', probationMonths: 7 }, 422);
  await request('/contracts', 'POST', { ...base0, code: 'HD-LABOR-2', probationMonths: 2 }, 201);
});

test('hợp đồng xác định thời hạn không quá 36 tháng và ngày kết thúc không trước ngày bắt đầu', async () => {
  await request('/contracts', 'POST', { ...base0, code: 'HD-LABOR-3', startDate: '2026-01-01', endDate: '2029-01-02' }, 422);
  await request('/contracts', 'POST', { ...base0, code: 'HD-LABOR-4', startDate: '2026-01-01', endDate: '2029-01-01' }, 201);
  await request('/contracts', 'POST', { ...base0, code: 'HD-LABOR-5', startDate: '2026-06-01', endDate: '2026-05-01' }, 422);
  await request('/contracts', 'POST', { ...base0, code: 'HD-LABOR-6', startDate: '2026-01-01' }, 201);
});

test('ngày phép năm tối thiểu 12 ngày và hợp đồng không phải lao động không bị áp giới hạn này', async () => {
  await request('/contracts', 'POST', { ...base0, code: 'HD-LABOR-7', annualLeaveDays: 10 }, 422);
  await request('/contracts', 'POST', { ...base0, code: 'HD-LABOR-8', annualLeaveDays: 14 }, 201);
  await request('/contracts', 'POST', { ...base0, code: 'HD-SERVICE-1', contractCategory: 'service', employeeCode: '', employeeName: '', partyBType: 'organization', partyBName: 'Đối tác', probationMonths: 9, annualLeaveDays: 0 }, 201);
});
