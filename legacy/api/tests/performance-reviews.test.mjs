import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-performance-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'performance@example.test', SEED_ADMIN_PASSWORD: 'Performance-Test-26!Safe',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-RECRUITMENT', JWT_SECRET: 'isolated-performance-test-secret-not-for-deployment',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; }); server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exit; }
  console.log(`Performance API evidence: ${directory}`);
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

let target;
const scope = '/collections/hr_performance_reviews';
const initial = () => ({ key: 'review-zero', code: 'DG-ZERO', employeeId: target.id, evaluatorId: session.user.id, employeeName: 'forged', empCode: 'forged', evaluator: 'forged', department: 'Actual department', position: 'Actual position', period: 'Quý 4 / 2026', selfScore: 0, managerScore: 0, kpiBonus: 0, managerComment: '', grade: 'A+ (Xuất sắc)', status: 'Chờ phê duyệt điểm', approvedBy: 'forged', payrollTransferred: true, history: [{ actor: 'forged' }] });

test('performance reviews use real staff and evaluator identity, preserve zero and missing scores and reject invalid amounts', async () => {
  target = (await request('/users', 'POST', { email: 'review-staff@example.test', name: 'Actual employee', employeeCode: 'REVIEW-STAFF', password: 'Performance-Test-26!Safe', role: 'USER', department: 'Actual department' }, 201)).user;
  const saved = (await request(scope, 'POST', { record: initial() }, 201)).record;
  assert.equal(saved.key, 'review-zero'); assert.notEqual(saved.id, saved.key);
  assert.equal(saved.employeeName, target.name); assert.equal(saved.empCode, target.employeeCode); assert.equal(saved.evaluator, session.user.name);
  assert.equal(saved.selfScore, 0); assert.equal(saved.managerScore, 0); assert.equal(saved.kpiBonus, 0); assert.equal(saved.grade, 'C (Cần cải thiện)');
  assert.equal(saved.productivityScore, null); assert.equal(saved.disciplineScore, null); assert.equal(saved.innovationScore, null); assert.equal(saved.approvedBy, undefined);
  assert.equal(saved.payrollTransferred, false); assert.equal(saved.managerComment, '');
  assert.ok(saved.history.every(item => item.actorId === session.user.id && item.actor !== 'forged'));
  for (const patch of [{ employeeId: 'missing' }, { evaluatorId: 'missing' }, { managerScore: '' }, { managerScore: null }, { managerScore: 101 }, { managerScore: -1 }, { managerScore: 'Infinity' }, { selfScore: -1 }, { selfScore: 100.001 }, { kpiBonus: -1 }, { kpiBonus: 0.5 }, { productivityScore: 61 }, { disciplineScore: 21 }, { innovationScore: 20.1 }, { productivityScore: 50 }, { period: ' ' }]) await request(`${scope}/review-zero`, 'PATCH', { patch }, 422);
  await request(scope, 'POST', { record: { ...initial(), key: 'duplicate-code', code: 'dg-zero', period: 'Other' } }, 409);
  await request(scope, 'POST', { record: { ...initial(), key: 'duplicate-period', code: 'Other', period: 'quý 4 / 2026' } }, 409);
});

test('score bands are calculated from actual totals and measured pillars override forged totals without inventing evidence', async () => {
  for (const [score, grade] of [[69.99, 'C (Cần cải thiện)'], [70, 'B (Đạt)'], [84.99, 'B (Đạt)'], [85, 'A (Tốt)'], [94.99, 'A (Tốt)'], [95, 'A+ (Xuất sắc)'], [100, 'A+ (Xuất sắc)']]) {
    const record = (await request(`${scope}/review-zero`, 'PATCH', { patch: { managerScore: score } })).record;
    assert.equal(record.managerScore, score); assert.equal(record.grade, grade);
  }
  const measured = (await request(`${scope}/review-zero`, 'PATCH', { patch: { productivityScore: 54.5, disciplineScore: 18.25, innovationScore: 18.25, managerScore: 999, selfScore: null } })).record;
  assert.equal(measured.managerScore, 91); assert.equal(measured.selfScore, null); assert.equal(measured.grade, 'A (Tốt)');
  assert.equal(measured.kpiBonus, 0);
});

test('review approval derives the actual actor, is terminal, retains history and never creates a payment', async () => {
  await request(scope, 'POST', { record: { ...initial(), key: 'forged-terminal', code: 'OTHER', period: 'Other', status: 'Đã hoàn tất đánh giá' } }, 422);
  const before = (await request('/finance/cash-transactions')).data.length;
  const approved = (await request(`${scope}/review-zero`, 'PATCH', { patch: { status: 'Đã hoàn tất đánh giá', approvedBy: 'forged', approvedById: 'forged', approvedAt: '1900-01-01', payrollTransferred: true } })).record;
  assert.equal(approved.approvedBy, session.user.name); assert.equal(approved.approvedById, session.user.id); assert.ok(Date.parse(approved.approvedAt) > Date.parse('2026-01-01'));
  assert.equal(approved.payrollTransferred, false); assert.equal(approved.history.at(-1).status, 'Đã hoàn tất đánh giá');
  assert.equal((await request('/finance/cash-transactions')).data.length, before);
  for (const patch of [{ status: 'Chờ phê duyệt điểm' }, { managerScore: 10 }, { status: 'Đã hoàn tất đánh giá' }, { kpiBonus: 100 }]) await request(`${scope}/review-zero`, 'PATCH', { patch }, 422);
  await request(`${scope}/review-zero`, 'DELETE', undefined, 422);
  await request(scope, 'PUT', { records: [] }, 405);
  const pending = (await request(scope, 'POST', { record: { ...initial(), key: 'review-delete', code: 'DG-DELETE', period: 'Other period' } }, 201)).record;
  await request(`${scope}/${pending.key}`, 'DELETE');
});

test('USER cannot inspect, create, change or delete HR evaluation records', async () => {
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: target.email, password: 'Performance-Test-26!Safe' }) });
  assert.equal(login.status, 200); const staff = await login.json();
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    const response = await fetch(`${base}${scope}${['PATCH', 'DELETE'].includes(method) ? '/review-zero' : ''}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staff.access_token}` }, body: ['POST', 'PATCH'].includes(method) ? JSON.stringify(method === 'POST' ? { record: initial() } : { patch: { managerScore: 100 } }) : undefined });
    assert.equal(response.status, 403);
  }
});

