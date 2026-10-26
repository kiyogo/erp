import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-user-lifecycle-test-'));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'lifecycle@example.test', SEED_ADMIN_PASSWORD: 'Lifecycle-Test-26!Safe',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-LIFECYCLE', JWT_SECRET: 'isolated-user-lifecycle-secret',
};
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
env.PORT = String(probe.address().port);
await new Promise(resolve => probe.close(resolve));
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const arm = path.join(directory, 'gate-arm');
const ready = path.join(directory, 'gate-ready');
const release = path.join(directory, 'gate-release');
const preload = path.join(directory, 'transaction-gate.mjs');
// The test gate lets both HTTP handlers finish their initial reads, then commits the second transaction first.
writeFileSync(preload, `import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import db from ${JSON.stringify(pathToFileURL(path.join(cwd, 'db.mjs')).href)};
const original = db.transaction.bind(db);
let completed = '', active = '', pending = [];
db.transaction = callback => {
  const token = existsSync(${JSON.stringify(arm)}) ? readFileSync(${JSON.stringify(arm)}, 'utf8') : '';
  if (!token || token === completed) return original(callback);
  if (token !== active) { active = token; pending = []; }
  return new Promise((resolve, reject) => {
    pending.push({ callback, resolve, reject });
    if (pending.length !== 2) return;
    completed = token;
    const pair = pending.slice().reverse();
    writeFileSync(${JSON.stringify(ready)}, token);
    const run = async () => {
      while (!existsSync(${JSON.stringify(release)}) || readFileSync(${JSON.stringify(release)}, 'utf8') !== token) await new Promise(done => setTimeout(done, 5));
      for (const entry of pair) { try { entry.resolve(await original(entry.callback)); } catch (error) { entry.reject(error); } }
    };
    void run();
  });
};
`);
const server = spawn(process.execPath, ['--import', pathToFileURL(preload).href, 'index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
const storage = new DatabaseSync(env.KIYOVN_DB_PATH);
after(async () => {
  storage.close();
  if (server.exitCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill('SIGKILL'); await exit; }
  console.log(`Isolated user lifecycle evidence: ${directory}`);
});
const base = `http://127.0.0.1:${env.PORT}/api/v1`;
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (server.exitCode !== null || attempt === 99) throw new Error(logs);
  await new Promise(resolve => setTimeout(resolve, 100));
}
async function login(email, password = env.SEED_ADMIN_PASSWORD, expected = 200) {
  const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const body = await response.json(); assert.equal(response.status, expected, JSON.stringify(body));
  return { ...body, token: body.access_token || body.token };
}
const control = await login(env.SEED_ADMIN_EMAIL);
async function raw(route, method = 'GET', payload, token = control.token) {
  const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  return { status: response.status, body: await response.json() };
}
async function request(route, method = 'GET', payload, expected = 200, token = control.token) {
  const result = await raw(route, method, payload, token); assert.equal(result.status, expected, JSON.stringify(result.body)); return result.body;
}
async function createUser(role = 'USER') {
  const id = randomUUID();
  return (await request('/users', 'POST', { email: `${id}@example.test`, name: `Actual ${role}`, password: env.SEED_ADMIN_PASSWORD, employeeCode: `TEST-${id}`, role }, 201)).user;
}
async function waitForGate(token) {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (existsSync(ready) && readFileSync(ready, 'utf8') === token) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Concurrent HTTP requests did not reach the test transaction gate.');
}
async function gatedPair(first, second, delaySecond = 0) {
  const token = randomUUID();
  writeFileSync(arm, token);
  const a = first();
  if (delaySecond) await new Promise(resolve => setTimeout(resolve, delaySecond));
  const b = second();
  try { await waitForGate(token); }
  finally { writeFileSync(release, token); }
  return Promise.all([a, b]);
}

test('concurrent name and password updates preserve both committed changes without restoring the old credential', async () => {
  const user = await createUser();
  const freshPassword = 'Fresh-Lifecycle-Password-26!';
  // Rename reaches the gate first; expensive password hashing reaches it second and is committed first.
  const results = await gatedPair(
    () => raw(`/users/${user.id}`, 'PATCH', { name: 'Renamed actual employee' }),
    () => raw(`/users/${user.id}`, 'PATCH', { password: freshPassword }),
  );
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  const saved = (await request(`/users/${user.id}`)).user;
  assert.equal(saved.name, 'Renamed actual employee');
  await login(user.email, freshPassword);
  await login(user.email, env.SEED_ADMIN_PASSWORD, 401);
});

test('concurrent profile update cannot reactivate an account locked by another committed request', async () => {
  const user = await createUser();
  const results = await gatedPair(
    () => raw(`/users/${user.id}`, 'PATCH', { department: 'Actual new office' }),
    () => raw(`/users/${user.id}`, 'PATCH', { isActive: false }),
  );
  assert.deepEqual(results.map(result => result.status), [200, 200]);
  const saved = (await request(`/users/${user.id}`)).user;
  assert.equal(saved.isActive, false);
  assert.equal(storage.prepare('SELECT department FROM employee_profiles WHERE user_id = ?').get(user.id).department, 'Actual new office');
  await login(user.email, env.SEED_ADMIN_PASSWORD, 403);
});

for (const operation of ['demote', 'delete', 'retire']) {
  test(`simultaneous administrators cannot ${operation} each other and leave zero active administrators`, async () => {
    const first = await createUser('ADMIN');
    const second = await createUser('ADMIN');
    const firstLogin = await login(first.email);
    const secondLogin = await login(second.email);
    await request(`/users/${control.user.id}`, 'PATCH', { role: 'USER' });
    const run = (target, token) => operation === 'demote' ? raw(`/users/${target.id}`, 'PATCH', { role: 'USER' }, token)
      : operation === 'delete' ? raw(`/users/${target.id}`, 'DELETE', undefined, token)
        : raw(`/employees/${target.id}`, 'DELETE', undefined, token);
    try {
      const results = await gatedPair(() => run(second, firstLogin.token), () => run(first, secondLogin.token));
      assert.equal(results.filter(result => result.status === 200).length, 1, JSON.stringify(results));
      assert.ok(results.some(result => [401, 403, 422].includes(result.status)), JSON.stringify(results));
      const active = storage.prepare("SELECT id FROM users WHERE role = 'ADMIN' AND is_active = 1").all();
      assert.equal(active.length, 1);
      assert.ok([first.id, second.id].includes(active[0].id));
      const survivor = active[0].id === first.id ? first : second;
      assert.ok((await login(survivor.email)).token);
    } finally {
      // Restore only this isolated fixture controller after the race; no live database is used.
      storage.prepare("UPDATE users SET role = 'ADMIN', is_active = 1 WHERE id = ?").run(control.user.id);
      for (const user of [first, second]) {
        if (storage.prepare('SELECT id FROM users WHERE id = ?').get(user.id)) await request(`/users/${user.id}`, 'PATCH', { role: 'USER' });
      }
    }
  });
}

test('deleting a former administrator cannot cascade-delete their shared enterprise records', async () => {
  const admin = await createUser('ADMIN');
  const session = await login(admin.email);
  await request('/collections/finance_budgets', 'POST', { record: { key: 'retained-budget', code: 'NS-RETAIN', department: 'Actual Department', fiscalYear: '2026', allocatedBudget: 1000, actualSpent: 200 } }, 201, session.token);
  await request(`/users/${admin.id}`, 'PATCH', { role: 'USER', isActive: false });
  await request(`/users/${admin.id}`, 'DELETE', undefined, 409);
  const saved = (await request('/collections/finance_budgets')).data.find(record => record.key === 'retained-budget');
  assert.equal(saved.allocatedBudget, 1000);
  assert.equal(saved.actualSpent, 200);
  assert.ok(storage.prepare('SELECT id FROM users WHERE id = ?').get(admin.id));
});
