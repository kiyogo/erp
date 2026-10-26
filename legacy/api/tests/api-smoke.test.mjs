import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-api-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'),
  KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'audit@example.test', SEED_ADMIN_PASSWORD: 'Audit-Test-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-ADMIN', JWT_SECRET: 'isolated-test-secret-not-for-deployment',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const migrationFixture = new DatabaseSync(env.KIYOVN_DB_PATH);
const fixtureActor = migrationFixture.prepare('SELECT id FROM users WHERE email = ?').get(env.SEED_ADMIN_EMAIL);
migrationFixture.prepare('DELETE FROM system_settings WHERE setting_key = ?').run('attendance_canonical_scopes_v1');
migrationFixture.prepare('INSERT INTO collection_records VALUES (?, ?, ?, ?, ?, ?, ?)').run('migration-fixture', 'employee_leaves', 'legacy-leave', fixtureActor.id, JSON.stringify({ key: 'legacy-leave', employeeId: fixtureActor.id, code: 'NP-OLD', fromDate: '2026-10-01', toDate: '2026-10-01', days: 1, type: 'Nghỉ phép năm', reason: 'Legacy request', status: 'Chờ duyệt' }), new Date().toISOString(), new Date().toISOString());
migrationFixture.close();
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
  console.log(`Isolated API test evidence: ${directory}`);
});
const base = `http://127.0.0.1:${port}/api/v1`;
for (let i = 0; i < 100; i++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (server.exitCode !== null || i === 99) throw new Error(logs);
  await new Promise(resolve => setTimeout(resolve, 100));
}
const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const session = await login.json();
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token || session.token}` };
async function request(route, method = 'GET', payload, expected = 200, authHeaders = headers) {
  const response = await fetch(`${base}${route}`, { method, headers: authHeaders, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}

test('anonymous access is rejected', async () => {
  assert.equal((await fetch(`${base}/collections/finance_budgets`)).status, 401);
});

test('legacy attendance mirrors migrate without removing source records', async () => {
  const canonical = (await request('/collections/leave_requests')).data.find(record => record.key === 'legacy-leave');
  assert.equal(canonical.startDate, '2026-10-01');
  assert.equal(canonical.daysCount, 1);
  assert.equal((await request('/collections/employee_leaves')).data.length, 1);
});

test('collections support create, read, patch, replacement, delete and concurrent scopes', async () => {
  await request('/collections/audit_test', 'POST', { record: { key: 'first', title: 'Initial' } }, 201);
  await request('/collections/audit_test/first', 'PATCH', { patch: { title: 'Updated' } });
  assert.equal((await request('/collections/audit_test')).data[0].title, 'Updated');
  await Promise.all(Array.from({ length: 10 }, (_, i) => request(`/collections/audit_parallel_${i}`, 'PUT', { records: [{ key: 'row', value: i }] })));
  for (let i = 0; i < 10; i++) assert.equal((await request(`/collections/audit_parallel_${i}`)).data[0].value, i);
  await request('/collections/audit_test', 'PUT', { records: [{ key: 'replacement', title: 'Saved' }] });
  const list = await request('/collections/audit_test');
  assert.equal(list.data.length, 1);
  assert.equal(list.data[0].title, 'Saved');
  await request('/collections/audit_test/replacement', 'DELETE');
  assert.equal((await request('/collections/audit_test')).data.length, 0);
});

test('task checklist is persisted before response, then task can be deleted', async () => {
  const { task } = await request('/tasks', 'POST', {
    taskTitle: 'Integration task', priority: 'Trung bình', dueDate: '2026-12-31',
    assigneeId: session.user.id, checklist: ['First item', 'Second item'],
  }, 201);
  const key = task.key || task.id;
  const result = await request(`/tasks/${key}`);
  assert.equal(result.task.subtasks.length, 2);
  await request(`/tasks/${key}`, 'DELETE');
  await request(`/tasks/${key}`, 'GET', undefined, 404);
});

test('canvas documents can be created simultaneously', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, (_, i) => request('/documents', 'POST', { title: `Audit canvas ${i}` }, 201)));
  assert.equal(new Set(results.map(result => result.document.id)).size, 5);
});

test('budget API validates amounts and recomputes balances instead of trusting the browser', async () => {
  const record = { key: 'budget-test', code: 'NS-TEST', department: 'Test', fiscalYear: '2026', allocatedBudget: 1000, actualSpent: 850, remainingBudget: 99999, utilizationRate: 0, status: 'fake' };
  const created = await request('/collections/finance_budgets', 'POST', { record }, 201);
  assert.equal(created.record.remainingBudget, 150);
  assert.equal(created.record.utilizationRate, 85);
  assert.equal(created.record.status, 'Cảnh báo hạn mức');
  await request('/collections/finance_budgets/budget-test', 'PATCH', { patch: { allocatedBudget: 0 } }, 422);
  await request('/collections/finance_budgets/budget-test', 'PATCH', { patch: { actualSpent: -1 } }, 422);
  const updated = await request('/collections/finance_budgets/budget-test', 'PATCH', { patch: { actualSpent: 1200 } });
  assert.equal(updated.record.remainingBudget, -200);
  assert.equal(updated.record.status, 'Vượt ngân sách');
});

test('canvas operation retries are idempotent and snapshots can be updated', async () => {
  const { document } = await request('/documents', 'POST', { title: 'Idempotency test' }, 201);
  const route = `/documents/${document.id}`;
  const payload = { operations: [{ transactionId: 'retry-1', clientId: 'test', data: { kind: 'test-operation' } }] };
  const first = await request(`${route}/operations`, 'POST', payload);
  const retry = await request(`${route}/operations`, 'POST', payload);
  assert.equal(first.revision, 2);
  assert.equal(retry.revision, 2);
  await request(`${route}/snapshots`, 'POST', { revision: 2, data: { blocks: [] } });
  await request(`${route}/snapshots`, 'POST', { revision: 2, data: { blocks: [], updated: true } });
});

test('recruitment persists pipeline, rejects duplicate email and invalid transitions', async () => {
  await request('/collections/hr_job_openings', 'POST', { record: { key: 'job-1', jobCode: 'TD-1', title: 'Developer', department: 'Engineering', headcountNeeded: 1, deadline: '2026-12-31' } }, 201);
  const candidate = { key: 'candidate-1', jobKey: 'job-1', name: 'Candidate', email: 'candidate@example.test', status: 'applied', appliedAt: '2026-10-01' };
  await request('/collections/hr_recruitment_candidates', 'POST', { record: candidate }, 201);
  await request('/collections/hr_recruitment_candidates', 'POST', { record: { ...candidate, key: 'candidate-2', email: 'CANDIDATE@example.test' } }, 409);
  const route = '/collections/hr_recruitment_candidates/candidate-1';
  await request(route, 'PATCH', { patch: { status: 'hired', hiredDate: '2026-10-20' } }, 422);
  await request(route, 'PATCH', { patch: { status: 'screening' } });
  await request(route, 'PATCH', { patch: { status: 'interview', interviewAt: '2026-02-31T10:00' } }, 422);
  await request(route, 'PATCH', { patch: { status: 'interview', interviewAt: '2026-10-10T10:00', interviewer: 'Hiring manager' } });
  await request(route, 'PATCH', { patch: { status: 'offer', offerDate: '2026-10-12' } });
  const hired = await request(route, 'PATCH', { patch: { status: 'hired', hiredDate: '2026-10-20' } });
  assert.equal(hired.record.history.length, 5);
  assert.equal(hired.record.history[4].actorId, session.user.id);
});

test('employee leave is visible to admins and approval cannot be forged or overwritten', async () => {
  const employee = (await request('/users', 'POST', { email: 'staff@example.test', name: 'Staff User', password: 'Staff-Test-26!Secure', employeeCode: 'TEST-STAFF', role: 'USER' }, 201)).user;
  const employeeSession = await request('/auth/login', 'POST', { email: 'staff@example.test', password: 'Staff-Test-26!Secure' });
  const employeeHeaders = { ...headers, Authorization: `Bearer ${employeeSession.access_token || employeeSession.token}` };
  const record = { key: 'leave-test', code: 'NP-TEST', employeeId: session.user.id, employeeName: 'Forged', startDate: '2026-10-26', endDate: '2026-10-27', daysCount: 1.5, reason: 'Family', leaveType: 'Nghỉ phép năm', status: 'Chờ duyệt' };
  const created = await request('/collections/leave_requests', 'POST', { record }, 201, employeeHeaders);
  assert.equal(created.record.employeeId, employee.id);
  assert.equal(created.record.employeeName, employee.name);
  const route = '/collections/leave_requests/leave-test';
  await request(route, 'PATCH', { patch: { status: 'Đã duyệt' } }, 403, employeeHeaders);
  const approved = await request(route, 'PATCH', { patch: { status: 'Đã duyệt' } });
  assert.equal(approved.record.approverId, session.user.id);
  assert.equal((await request('/collections/leave_requests', 'GET', undefined, 200, employeeHeaders)).data[0].status, 'Đã duyệt');
  await request(route, 'PATCH', { patch: { status: 'Từ chối' } }, 422);
  await request(route, 'DELETE', undefined, 422, employeeHeaders);
  await request('/collections/leave_requests', 'POST', { record: { ...record, key: 'invalid-date', startDate: '2026-02-31' } }, 422, employeeHeaders);
});

test('overtime hours and compensation derive from validated values', async () => {
  const record = { key: 'ot-test', code: 'OT-TEST', employeeId: session.user.id, otDate: '2026-10-27', timeRange: '22:00 - 02:00', totalHours: 4, reason: 'Maintenance', multiplier: 1.5, baseHourlyRate: 100000, status: 'Chờ phê duyệt' };
  const result = await request('/collections/attendance_overtime', 'POST', { record }, 201);
  assert.equal(result.record.totalAmount, 600000);
  await request('/collections/attendance_overtime/ot-test', 'PATCH', { patch: { totalHours: 10 } }, 422);
  const approved = await request('/collections/attendance_overtime/ot-test', 'PATCH', { patch: { status: 'Đã duyệt OT' } });
  assert.equal(approved.record.approver, session.user.name);
});

test('shift approval swaps both assignments atomically', async () => {
  const employee = (await request('/users', 'POST', { email: 'shift@example.test', name: 'Shift User', password: 'Shift-Test-26!Secure', employeeCode: 'TEST-SHIFT', role: 'USER' }, 201)).user;
  for (const [key, startTime, endTime] of [['day', '08:00', '16:00'], ['night', '22:00', '06:00']]) {
    await request('/collections/attendance_shifts', 'POST', { record: { key, shiftCode: key, shiftName: key, startTime, endTime, timeRange: `${startTime} - ${endTime}`, workingHours: 8, workUnits: 1, status: 'Đang áp dụng' } }, 201);
  }
  const baseAssignment = { code: 'PC', effectiveFrom: '2026-10-26', effectiveTo: '2026-10-31', status: 'Đang áp dụng' };
  await request('/collections/attendance_shift_assignments', 'POST', { record: { ...baseAssignment, key: 'assign-a', employeeId: session.user.id, shiftKey: 'day' } }, 201);
  await request('/collections/attendance_shift_assignments', 'POST', { record: { ...baseAssignment, key: 'assign-b', employeeId: employee.id, shiftKey: 'night' } }, 201);
  await request('/collections/attendance_shift_assignments/assign-a', 'PATCH', { patch: { status: 'Chờ duyệt đổi ca', swapTargetKey: 'assign-b', swapReason: 'Schedule' } });
  const approved = await request('/collections/attendance_shift_assignments/assign-a', 'PATCH', { patch: { status: 'Đang áp dụng', swapDecision: 'Đã duyệt' } });
  assert.equal(approved.record.shiftKey, 'night');
  const assignments = (await request('/collections/attendance_shift_assignments')).data;
  assert.equal(assignments.find(item => item.key === 'assign-b').shiftKey, 'day');
});

test('check-in uses server identity and timestamps and rejects duplicate events', async () => {
  await request('/attendance/check-in', 'POST', { type: 'out' }, 422);
  const entered = await request('/attendance/check-in', 'POST', { type: 'in', employeeId: 'fake', checkIn: '00:00:00' });
  assert.equal(entered.record.employeeId, session.user.id);
  assert.equal(entered.record.locationVerified, false);
  assert.ok(Number.isFinite(Date.parse(entered.record.checkInAt)));
  await request('/attendance/check-in', 'POST', { type: 'in' }, 409);
  const exited = await request('/attendance/check-in', 'POST', { type: 'out' });
  assert.ok(Number.isFinite(exited.record.durationMinutes));
  await request('/attendance/check-in', 'POST', { type: 'out' }, 409);
  await request('/collections/employee_timesheets', 'PUT', { records: [] }, 405);
});

test('employment history persists real employee identity and authoritative actors', async () => {
  const record = { key: 'history-test', code: 'LS-TEST', employeeId: session.user.id, employeeName: 'Forged', employeeCode: 'FAKE', type: 'Chức vụ', eventDate: '2026-10-26', oldValue: 'Engineer', newValue: 'Lead', createdBy: 'Forged' };
  const created = await request('/collections/hr_employee_history', 'POST', { record }, 201);
  assert.equal(created.record.employeeName, session.user.name);
  assert.equal(created.record.createdBy, session.user.name);
  await request('/collections/hr_employee_history/history-test', 'PATCH', { patch: { eventDate: '2026-02-31' } }, 422);
  await request('/collections/hr_employee_history/history-test', 'PATCH', { patch: { newValue: 'Manager', updatedBy: 'Forged' } });
  const saved = (await request('/collections/hr_employee_history')).data.find(item => item.key === 'history-test');
  assert.equal(saved.updatedBy, session.user.name);
  assert.equal(saved.newValue, 'Manager');
  await request('/collections/hr_employee_history/history-test', 'DELETE');
});

test('contracts create, update and delete against the authoritative API', async () => {
  const payload = { code: 'HD-TEST', name: 'Integration contract', contractTemplate: 'Template', partyBType: 'individual', partyBName: 'Partner', partyBPhone: '0901234567', partyBEmail: 'partner@example.test', employeeCode: 'TEST-ADMIN', employeeName: session.user.name, employeeEmail: 'audit@example.test' };
  const created = await request('/contracts', 'POST', payload, 201);
  const route = `/contracts/${created.contract.id}`;
  const edited = await request(route, 'PUT', { ...payload, name: 'Updated contract', partyBPhone: '0909999999' });
  assert.equal(edited.contract.partyBPhone, '0909999999');
  const storage = new DatabaseSync(env.KIYOVN_DB_PATH, { readOnly: true });
  try { assert.notEqual(storage.prepare('SELECT party_b_phone FROM contracts WHERE id = ?').get(created.contract.id).party_b_phone, '0909999999'); } finally { storage.close(); }
  await request(route, 'DELETE');
  await request(route, 'GET', undefined, 404);
  assert.ok(!(await request('/contracts')).data.some(item => item.id === created.contract.id));
});

test('Google settings persist on the server without a client secret and prevent password lockout', async () => {
  const payload = { clientKey: '123456-test.apps.googleusercontent.com', clientSecret: 'must-not-store', redirectUri: 'http://localhost:3011', allowedDomain: '@example.test', enforceGoogleLogin: 'optional' };
  await request('/system/google-config', 'PUT', { ...payload, clientKey: 'invalid' }, 422);
  await request('/system/google-config', 'PUT', { ...payload, enforceGoogleLogin: '100' }, 422);
  const saved = await request('/system/google-config', 'PUT', payload);
  assert.equal(saved.config.clientKey, payload.clientKey);
  assert.equal(saved.config.allowedDomain, 'example.test');
  assert.equal(saved.config.clientSecret, '');
  const publicConfig = await (await fetch(`${base}/auth/google/config`)).json();
  assert.equal(publicConfig.configured, true);
  assert.equal(publicConfig.clientId, payload.clientKey);
  const storage = new DatabaseSync(env.KIYOVN_DB_PATH, { readOnly: true });
  try { assert.ok(!storage.prepare('SELECT setting_value FROM system_settings WHERE setting_key = ?').get('google_sso_config').setting_value.includes(payload.clientSecret)); } finally { storage.close(); }
  await request('/auth/login', 'POST', { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD });
});
