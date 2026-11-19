import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-secscopes-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'secscopes@example.test', SEED_ADMIN_PASSWORD: 'SecScopes-Test-26!Secure', SEED_ADMIN_EMPLOYEE_CODE: 'TEST-SEC', JWT_SECRET: 'isolated-secscopes-test-secret',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
});
const base = `http://127.0.0.1:${port}/api/v1`;
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (server.exitCode !== null || i === 99) throw new Error(logs);
  await new Promise(resolve => setTimeout(resolve, 100));
}
async function login(email, password) {
  const body = await (await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  return { id: body.user.id, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${body.access_token || body.token}` } };
}
async function call(session, route, method = 'GET', payload, extraHeaders = {}) {
  const response = await fetch(`${base}${route}`, { method, headers: { ...session.headers, ...extraHeaders }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}
const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
const staffPassword = 'Staff-SecScopes-26!Secure';
const created = await call(admin, '/users', 'POST', { email: 'staff-sec@example.test', name: 'Nhân viên bảo mật', password: staffPassword, employeeCode: 'SEC-USER', role: 'USER' });
assert.equal(created.status, 201, JSON.stringify(created.body));
const staff = await login('staff-sec@example.test', staffPassword);

test('phạm vi bảo mật do máy chủ quản lý không đọc hay ghi được qua kho dữ liệu chung, kể cả quản trị viên', async () => {
  assert.equal((await call(staff, '/auth/security-pin', 'POST', { pin: '135790', confirmPin: '135790', currentPassword: staffPassword })).status, 200);
  assert.equal((await call(staff, '/collections/employee_payslips')).status, 428, 'PIN đã bật nên đọc phiếu lương cần PIN');

  const serverOnly = ['user_security_pin', 'user_two_factor_auth', 'mfa_login_challenges', 'user_passkeys', 'user_passkey_policy'];
  const reachable = [];
  for (const session of [staff, admin]) {
    for (const scope of serverOnly) {
      for (const [method, route, payload] of [
        ['GET', `/collections/${scope}`], ['GET', `/collections/${scope}/${staff.id}`],
        ['POST', `/collections/${scope}`, { record: { key: staff.id, pinHash: '', enabled: false } }],
        ['PATCH', `/collections/${scope}/${staff.id}`, { patch: { pinHash: '', enabled: false } }],
        ['PUT', `/collections/${scope}`, { records: [] }], ['DELETE', `/collections/${scope}/${staff.id}`],
      ]) {
        const result = await call(session, route, method, payload);
        if (result.status !== 403) reachable.push(`${session === admin ? 'admin' : 'staff'} ${method} ${scope} -> ${result.status}`);
      }
    }
  }
  assert.deepEqual(reachable, []);
  assert.equal((await call(staff, '/collections/employee_payslips')).status, 428, 'PIN vẫn còn hiệu lực sau các lần thử phá');
  assert.equal((await call(staff, '/auth/security-pin')).body.configured, true);
});
