import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-onboarding-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'onboarding@example.test', SEED_ADMIN_PASSWORD: 'Onboarding-Test-26!Safe',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-ONBOARDING', JWT_SECRET: 'isolated-onboarding-test-secret-not-for-deployment',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; }); server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exit; }
  console.log(`Onboarding API evidence: ${directory}`);
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

test('onboarding persists real confirmations and completion and rejects forged progress, signature and actor', async () => {
  const keys = ['equipment', 'orientation', 'training', 'trialTasks', 'probationReview'];
  const checklist = keys.map(key => ({ key, completed: false, completedAt: '1900-01-01', completedBy: 'Forged approver' }));
  const record = { key: 'onboarding-test', employeeId: session.user.id, employeeName: 'Forged Employee', empCode: 'FAKE-CODE', department: 'Test', position: 'Test', mentor: 'Integration Mentor', startDate: '2026-10-01', evaluationDate: '2026-11-30', status: 'Đang hội nhập', progress: 100, contractSigned: true, completedAt: '1900-01-01', completedBy: 'Forged approver', checklist };
  await request('/collections/hr_onboarding_tasks', 'POST', { record: { ...record, employeeId: 'missing' } }, 422);
  await request('/collections/hr_onboarding_tasks', 'POST', { record: { ...record, checklist: [...checklist.slice(0, 4), checklist[0]] } }, 422);
  const created = (await request('/collections/hr_onboarding_tasks', 'POST', { record }, 201)).record;
  assert.equal(created.employeeName, session.user.name);
  assert.equal(created.empCode, env.SEED_ADMIN_EMPLOYEE_CODE);
  assert.equal(created.progress, 0);
  assert.equal(created.contractSigned, false);
  assert.equal(created.completedAt, undefined);
  assert.ok(created.checklist.every(item => item.completedBy === undefined));
  const route = '/collections/hr_onboarding_tasks/onboarding-test';
  await request(route, 'PATCH', { patch: { status: 'Đã hoàn thành', progress: 100, reviewNotes: 'Premature completion' } }, 422);
  let saved;
  for (let index = 0; index < keys.length; index++) {
    const nextChecklist = keys.map((key, i) => ({ key, completed: i <= index, completedAt: '1900-01-01', completedBy: 'Forged approver' }));
    saved = (await request(route, 'PATCH', { patch: { checklist: nextChecklist, progress: -999, contractSigned: true } })).record;
    assert.equal(saved.progress, (index + 1) * 20);
    assert.equal(saved.contractSigned, false);
    assert.equal(saved.checklist[index].completedBy, session.user.name);
    assert.notEqual(saved.checklist[index].completedAt, '1900-01-01');
  }
  await request(route, 'PATCH', { patch: { status: 'Đã hoàn thành', reviewNotes: '' } }, 422);
  const finished = (await request(route, 'PATCH', { patch: { status: 'Đã hoàn thành', reviewNotes: 'All checklist items reviewed.', completedBy: 'Forged approver', completedAt: '1900-01-01' } })).record;
  assert.equal(finished.progress, 100);
  assert.equal(finished.completedBy, session.user.name);
  assert.notEqual(finished.completedAt, '1900-01-01');
  assert.equal(finished.contractSigned, false);
  const persisted = (await request('/collections/hr_onboarding_tasks')).data.find(item => item.key === record.key);
  assert.equal(persisted.status, 'Đã hoàn thành');
  assert.equal(persisted.reviewNotes, 'All checklist items reviewed.');
  assert.deepEqual(persisted.checklist, finished.checklist);
});
