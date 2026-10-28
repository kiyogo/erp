import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-attendance-raw-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'attendance-raw@example.test', SEED_ADMIN_PASSWORD: 'Attendance-Raw-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'ATTENDANCE-RAW-ADMIN', JWT_SECRET: 'attendance-raw-isolated-test-secret',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; }); server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exit; }
  console.log(`Attendance raw API evidence: ${directory}`);
});

const base = `http://127.0.0.1:${port}/api/v1`;
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (server.exitCode !== null || attempt === 99) throw new Error(logs);
  await new Promise(resolve => setTimeout(resolve, 100));
}
const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const session = await login.json();
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token || session.token}` };
async function request(route, method = 'GET', payload, expected = 200) {
  const response = await fetch(`${base}${route}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}

test('raw attendance log statuses accept old duplicate labels and never promote duplicates into payroll attendance', async () => {
  const legacy = await request('/collections/attendance_raw_data', 'POST', { record: { key: 'legacy-duplicate', status: 'Bản ghi trùng lặp (Đã lọc)' } }, 201);
  assert.equal(legacy.record.status, 'Bản ghi trùng lặp (Đã lọc)');
  await request('/collections/attendance_raw_data/legacy-duplicate', 'PATCH', { patch: { status: 'Dữ liệu hợp lệ' } }, 422);

  const current = await request('/collections/attendance_raw_data', 'POST', { record: { key: 'current-duplicate', status: 'Bản ghi trùng lặp' } }, 201);
  assert.equal(current.record.status, 'Bản ghi trùng lặp');
  await request('/collections/attendance_raw_data/current-duplicate', 'PATCH', { patch: { status: 'Dữ liệu hợp lệ' } }, 422);

  const pending = await request('/collections/attendance_raw_data', 'POST', { record: { key: 'pending-log', status: 'Cần kiểm tra' } }, 201);
  assert.equal(pending.record.status, 'Cần kiểm tra');
  await request('/collections/attendance_raw_data/pending-log', 'PATCH', { patch: { status: 'Dữ liệu hợp lệ' } });
  assert.equal((await request('/collections/attendance_raw_data')).data.find(record => record.key === 'pending-log').status, 'Dữ liệu hợp lệ');
});
