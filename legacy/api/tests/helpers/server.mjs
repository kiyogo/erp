// Máy chủ API chạy riêng với cơ sở dữ liệu tạm cho các bài kiểm thử: mỗi bài chỉ cần gọi startServer() thay vì chép khối khởi động.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const apiDirectory = fileURLToPath(new URL('../..', import.meta.url));
export const STAFF_PASSWORD = 'Staff-Test-26!Secure';

export async function startServer(label, extraEnv = {}) {
  const directory = mkdtempSync(path.join(tmpdir(), `kiyovn-${label}-test-`));
  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  const env = {
    ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
    KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
    SEED_ADMIN_EMAIL: `${label}@example.test`, SEED_ADMIN_PASSWORD: 'Admin-Test-26!Secure', SEED_ADMIN_EMPLOYEE_CODE: `TEST-${label.toUpperCase().slice(0, 12)}`,
    JWT_SECRET: `isolated-${label}-test-secret`, ...extraEnv,
  };
  const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd: apiDirectory, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(seed.status, 0, seed.stderr);
  const server = spawn(process.execPath, ['index.mjs'], { cwd: apiDirectory, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let logs = '';
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  const base = `http://127.0.0.1:${port}/api/v1`;
  for (let i = 0; i < 300; i++) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
    if (server.exitCode !== null || i === 299) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  async function call(session, route, method = 'GET', payload, extraHeaders = {}) {
    const response = await fetch(`${base}${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...(session?.headers || {}), ...extraHeaders },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : {} };
  }
  async function login(email, password) {
    const response = await call(null, '/auth/login', 'POST', { email, password });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return { id: response.body.user.id, headers: { Authorization: `Bearer ${response.body.access_token || response.body.token}` } };
  }
  const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
  async function makeUser(suffix, extra = {}) {
    const created = await call(admin, '/users', 'POST', { email: `${suffix}@example.test`, name: `Người ${suffix}`, password: STAFF_PASSWORD, employeeCode: `${label.toUpperCase().slice(0, 4)}-${suffix.toUpperCase()}`, role: 'USER', ...extra });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    return { ...(await login(`${suffix}@example.test`, STAFF_PASSWORD)), email: `${suffix}@example.test`, password: STAFF_PASSWORD };
  }
  async function stop() {
    if (server.exitCode !== null) return;
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  return { base, directory, env, admin, call, login, makeUser, stop };
}
