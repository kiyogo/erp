import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-rewards-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'rewards@example.test', SEED_ADMIN_PASSWORD: 'Rewards-Test-26!Safe',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-REWARDS', JWT_SECRET: 'isolated-rewards-test-secret-not-for-deployment',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; }); server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exit; }
  console.log(`Rewards API evidence: ${directory}`);
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

const recipient = (await request('/users', 'POST', { email: 'reward-recipient@example.test', name: 'Actual Reward Recipient', employeeCode: 'REWARD-RECIPIENT', password: 'Recipient-Test-26!Safe', role: 'USER' }, 201)).user;
const reward = (key, patch = {}) => ({ key, rewardCode: `KT-${key}`, employeeId: recipient.id, employeeName: 'Forged name', empCode: 'FORGED-CODE', department: 'Actual Test Department', title: 'Actual contribution recognition', rewardType: 'Bằng khen Ban Giám Đốc', rewardValue: 0, decisionNo: `QD-${key}`, date: '2026-10-26', achievementSummary: 'Integration contribution', signer: 'Forged Signer', approvedBy: 'Forged Approver', approvedById: 'forged-admin', approvedAt: '1900-01-01T00:00:00Z', awardedBy: 'Forged Presenter', awardedById: 'forged-presenter', awardedAt: '1900-01-01T00:00:00Z', status: 'Chờ duyệt', ...patch });

test('rewards require a real recipient and valid nonnegative amounts while preserving zero-value recognition', async () => {
  await request('/collections/hr_rewards', 'POST', { record: reward('missing-employee', { employeeId: 'not-an-employee' }) }, 422);
  await request('/collections/hr_rewards', 'POST', { record: reward('negative', { rewardValue: -1 }) }, 422);
  await request('/collections/hr_rewards', 'POST', { record: reward('decimal', { rewardValue: 0.5 }) }, 422);
  await request('/collections/hr_rewards', 'POST', { record: reward('bad-date', { date: '2026-02-30' }) }, 422);
  const created = (await request('/collections/hr_rewards', 'POST', { record: reward('zero') }, 201)).record;
  assert.equal(created.rewardValue, 0);
  assert.equal(created.employeeId, recipient.id);
  assert.equal(created.employeeName, recipient.name);
  assert.equal(created.empCode, recipient.employeeCode);
  assert.equal(created.status, 'Chờ duyệt');
  assert.equal(created.signer, '');
  for (const field of ['approvedBy', 'approvedById', 'approvedAt', 'awardedBy', 'awardedById', 'awardedAt']) assert.equal(created[field], undefined, `New pending record ignores forged ${field}`);
  assert.notEqual(created.id, created.key, 'Physical database ID is distinct from logical key');
  await request('/collections/hr_rewards', 'POST', { record: reward('duplicate', { rewardCode: created.rewardCode.toLowerCase() }) }, 409);
  assert.equal((await request('/collections/hr_rewards')).data.length, 1);
});

test('rewards start pending, require approval before award and derive approval/presenter identity from the authenticated actor', async () => {
  for (const status of ['Đã ký quyết định', 'Đã trao giải', 'Đã trao thưởng', 'Chờ trao thưởng trong lễ vinh danh']) await request('/collections/hr_rewards', 'POST', { record: reward(`premature-${status}`, { status }) }, 422);
  const route = '/collections/hr_rewards/zero';
  await request(route, 'PATCH', { patch: { status: 'Đã trao giải' } }, 422);
  await request(route, 'PATCH', { patch: { status: 'Chờ trao thưởng trong lễ vinh danh' } }, 422);
  const approved = (await request(route, 'PATCH', { patch: { status: 'Đã ký quyết định', signer: 'Forged Signer', approvedBy: 'Forged Approver', approvedById: 'forged-admin', approvedAt: '1900-01-01T00:00:00Z' } })).record;
  assert.equal(approved.status, 'Đã ký quyết định');
  assert.equal(approved.rewardValue, 0);
  assert.equal(approved.approvedBy, session.user.name);
  assert.equal(approved.approvedById, session.user.id);
  assert.equal(approved.signer, session.user.name);
  assert.ok(Number.isFinite(Date.parse(approved.approvedAt)));
  assert.notEqual(approved.approvedAt, '1900-01-01T00:00:00Z');
  await request(route, 'PATCH', { patch: { rewardValue: 500000 } }, 422);
  await request(route, 'PATCH', { patch: { status: 'Đã trao giải', rewardValue: 500000 } }, 422);
  const awarded = (await request(route, 'PATCH', { patch: { status: 'Đã trao giải', awardedBy: 'Forged Presenter', awardedById: 'forged-presenter', awardedAt: '1900-01-01T00:00:00Z' } })).record;
  assert.equal(awarded.rewardValue, 0);
  assert.equal(awarded.approvedById, session.user.id);
  assert.equal(awarded.approvedAt, approved.approvedAt);
  assert.equal(awarded.awardedBy, session.user.name);
  assert.equal(awarded.awardedById, session.user.id);
  assert.ok(Number.isFinite(Date.parse(awarded.awardedAt)));
  assert.notEqual(awarded.awardedAt, '1900-01-01T00:00:00Z');
  await request(route, 'PATCH', { patch: { status: 'Đã trao giải' } }, 422);
  await request(route, 'PATCH', { patch: { status: 'Chờ duyệt' } }, 422);
  await request(route, 'PATCH', { patch: { rewardValue: 1000000 } }, 422);
  const saved = (await request('/collections/hr_rewards')).data.find(item => item.key === 'zero');
  assert.equal(saved.status, 'Đã trao giải');
  assert.equal(saved.rewardValue, 0);
  assert.equal(saved.awardedById, session.user.id);
});

test('pending reward content is editable, approved financial content remains unchanged, and USER access is forbidden', async () => {
  await request('/collections/hr_rewards', 'POST', { record: reward('cash', { rewardType: 'Tiền mặt & Cúp pha lê', rewardValue: 200000 }) }, 201);
  const route = '/collections/hr_rewards/cash';
  await request(route, 'PATCH', { patch: { rewardValue: 300000, title: 'Updated pending contribution' } });
  await request(route, 'PATCH', { patch: { status: 'Đã ký quyết định' } });
  await request(route, 'PATCH', { patch: { status: 'Đã trao giải', employeeId: session.user.id } }, 422);
  const saved = (await request('/collections/hr_rewards')).data.find(item => item.key === 'cash');
  assert.equal(saved.rewardValue, 300000);
  assert.equal(saved.title, 'Updated pending contribution');
  assert.equal(saved.employeeId, recipient.id);
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'reward-recipient@example.test', password: 'Recipient-Test-26!Safe' }) });
  assert.equal(login.status, 200);
  const staff = await login.json();
  const staffHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${staff.access_token || staff.token}` };
  for (const [method, path, body] of [['GET', '/collections/hr_rewards'], ['POST', '/collections/hr_rewards', { record: reward('unauthorized') }], ['PATCH', route, { patch: { status: 'Đã trao giải' } }], ['DELETE', route]]) {
    const response = await fetch(`${base}${path}`, { method, headers: staffHeaders, body: body ? JSON.stringify(body) : undefined });
    assert.equal(response.status, 403, `${method} ${path} must reject ordinary user`);
  }
});

test('approved reward identity stays frozen after employee rename and approved/awarded records cannot be erased', async () => {
  const key = 'frozen-approved-identity';
  const route = `/collections/hr_rewards/${key}`;
  await request('/collections/hr_rewards', 'POST', { record: reward(key) }, 201);
  const approved = (await request(route, 'PATCH', { patch: { status: 'Đã ký quyết định' } })).record;
  await request(route, 'DELETE', undefined, 422);
  await request(`/users/${recipient.id}`, 'PATCH', { name: 'Renamed employee after reward approval' });
  const awarded = (await request(route, 'PATCH', { patch: { status: 'Đã trao giải' } })).record;
  assert.equal(awarded.employeeName, approved.employeeName);
  assert.equal(awarded.empCode, approved.empCode);
  assert.equal(awarded.approvedById, approved.approvedById);
  assert.equal(awarded.approvedAt, approved.approvedAt);
  await request(route, 'DELETE', undefined, 422);
  assert.ok((await request('/collections/hr_rewards')).data.some(item => item.key === key));
  await request(`/users/${recipient.id}`, 'PATCH', { name: recipient.name });
  await request('/collections/hr_rewards', 'POST', { record: reward('deletable-pending') }, 201);
  await request('/collections/hr_rewards/deletable-pending', 'DELETE');
  assert.ok(!(await request('/collections/hr_rewards')).data.some(item => item.key === 'deletable-pending'));
});
