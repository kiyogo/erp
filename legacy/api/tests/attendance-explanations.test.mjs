import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-attendance-explanations-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'attendance-explanations-admin@example.test', SEED_ADMIN_PASSWORD: 'Attendance-Explanations-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'ATTENDANCE-EXPLANATIONS-ADMIN', JWT_SECRET: 'attendance-explanations-isolated-test-secret',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exit; }
  console.log(`Attendance explanations API evidence: ${directory}`);
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
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return { body, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${body.access_token || body.token}` } };
}

async function request(headers, route, method = 'GET', payload, expected = 200) {
  const response = await fetch(`${base}${route}`, {
    method, headers, body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = response.status === 204 ? null : await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}

const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
const adminName = admin.body.user.name;
const firstUserPassword = 'Attendance-Owner-26!Secure';
const otherUserPassword = 'Attendance-Other-26!Secure';
const firstUserResponse = await request(admin.headers, '/users', 'POST', {
  email: 'attendance-owner@example.test', name: 'Nhân viên gửi giải trình', employeeCode: 'ATTENDANCE-OWNER', role: 'USER', password: firstUserPassword,
}, 201);
const otherUserResponse = await request(admin.headers, '/users', 'POST', {
  email: 'attendance-other@example.test', name: 'Nhân viên khác', employeeCode: 'ATTENDANCE-OTHER', role: 'USER', password: otherUserPassword,
}, 201);
const employee = await login(firstUserResponse.user.email, firstUserPassword);
const otherEmployee = await login(otherUserResponse.user.email, otherUserPassword);

test('attendance explanations stay private to the employee and can only be reviewed once by an admin', async () => {
  const scope = '/collections/attendance_explanations';
  const key = `explanation-${Date.now().toString(36)}`;
  await request(employee.headers, scope, 'POST', { record: {
    key: `${key}-forged-status`, date: '2026-10-27', reason: 'Quên quẹt thẻ vào ca', status: 'Đã duyệt',
  } }, 422);
  const forged = await request(employee.headers, scope, 'POST', { record: {
    key, date: '2026-10-27', reason: 'Quên quẹt thẻ vào ca', note: 'Có mặt tại văn phòng',
    employeeId: otherEmployee.body.user.id, employeeName: 'Nhân viên giả mạo', status: 'Chờ duyệt',
    reviewedBy: 'Người duyệt giả', reviewedAt: '2026-10-27T10:00:00.000Z',
  } }, 201);
  assert.equal(forged.record.employeeId, employee.body.user.id);
  assert.equal(forged.record.employeeName, employee.body.user.name);
  assert.equal(forged.record.status, 'Chờ duyệt');
  assert.equal(forged.record.reviewedBy, undefined);
  assert.equal(forged.record.reviewedAt, undefined);

  await request(employee.headers, scope, 'PUT', { records: [] }, 405);
  await request(employee.headers, `${scope}/${key}`, 'PATCH', { patch: { status: 'Đã duyệt' } }, 403);
  await request(employee.headers, `${scope}/${key}`, 'PATCH', { patch: { employeeId: otherEmployee.body.user.id } }, 403);
  await request(admin.headers, `${scope}/${key}`, 'PATCH', { patch: { status: 'Đã duyệt', reviewedBy: 'Người duyệt giả' } }, 422);

  const ownList = await request(employee.headers, scope);
  const otherList = await request(otherEmployee.headers, scope);
  const adminList = await request(admin.headers, scope);
  assert.ok(ownList.data.some(record => record.key === key));
  assert.equal(otherList.data.some(record => record.key === key), false);
  assert.ok(adminList.data.some(record => record.key === key));
  await request(otherEmployee.headers, `${scope}/${key}`, 'GET', undefined, 404);

  const decided = await request(admin.headers, `${scope}/${key}`, 'PATCH', { patch: { status: 'Đã duyệt' } });
  assert.equal(decided.record.status, 'Đã duyệt');
  assert.equal(decided.record.reviewedBy, adminName);
  assert.ok(decided.record.reviewedAt);

  await request(employee.headers, `${scope}/${key}`, 'PATCH', { patch: { note: 'Sửa sau duyệt' } }, 409);
  await request(admin.headers, `${scope}/${key}`, 'PATCH', { patch: { status: 'Từ chối' } }, 409);
  await request(employee.headers, `${scope}/${key}`, 'DELETE', undefined, 409);
  await request(admin.headers, `${scope}/${key}`, 'DELETE', undefined, 409);
  assert.equal((await request(admin.headers, `${scope}/${key}`)).record.status, 'Đã duyệt');
});
