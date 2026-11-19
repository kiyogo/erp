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

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-ot-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'),
  KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'ot@example.test', SEED_ADMIN_PASSWORD: 'Ot-Test-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-OT', JWT_SECRET: 'isolated-ot-test-secret',
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
  console.log(`Isolated ot evidence: ${directory}`);
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

const users = {};
for (const code of ['OT-1', 'OT-2']) {
  users[code] = (await request('/users', 'POST', { email: code.toLowerCase() + '@example.test', name: 'Nhân viên ' + code, password: 'Ot-Staff-26!Secure', employeeCode: code, role: 'USER' }, 201)).user;
}
let counter = 0;
const overtime = (otDate, timeRange, totalHours, extra = {}) => ({ key: 'ot-' + (++counter), code: 'OTR-' + counter, employeeId: users['OT-1'].id, employeeCode: 'OT-1', empCode: 'OT-1', employeeName: users['OT-1'].name, otDate, timeRange, totalHours, reason: 'Phát hành hệ thống', status: 'Chờ phê duyệt', ...extra });
const create = (record, expected = 201) => request('/collections/attendance_overtime', 'POST', { record }, expected);

test('ngày làm việc bình thường chỉ làm thêm tối đa 4 giờ, ngày nghỉ tối đa 12 giờ', async () => {
  await create(overtime('2026-03-02', '18:00 - 22:00', 4));
  await create(overtime('2026-03-03', '18:00 - 23:00', 5), 422);
  await create(overtime('2026-03-07', '08:00 - 18:00', 10));
  await create(overtime('2026-03-08', '06:00 - 19:00', 13), 422);
});

test('tổng giờ làm thêm một tháng của một nhân viên không quá 40 giờ', async () => {
  // tháng 4: 12 + 12 + 12 = 36 giờ ở các ngày nghỉ, thêm 4 giờ là 40, thêm nữa là vượt
  await create(overtime('2026-04-04', '06:00 - 18:00', 12));
  await create(overtime('2026-04-05', '06:00 - 18:00', 12));
  await create(overtime('2026-04-11', '06:00 - 18:00', 12));
  await create(overtime('2026-04-13', '18:00 - 22:00', 4));
  await create(overtime('2026-04-14', '18:00 - 19:00', 1), 422);
  const rejected = await create(overtime('2026-05-02', '08:00 - 20:00', 12, { status: 'Chờ phê duyệt' }));
  assert.equal(rejected.record.employeeCode, 'OT-1');
});

test('nhân viên khác có hạn mức riêng', async () => {
  await create(overtime('2026-04-15', '18:00 - 22:00', 4, { employeeId: users['OT-2'].id, employeeCode: 'OT-2', empCode: 'OT-2', employeeName: users['OT-2'].name }));
});
