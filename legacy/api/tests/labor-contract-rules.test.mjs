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

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-labor-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'),
  KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'labor@example.test', SEED_ADMIN_PASSWORD: 'Labor-Test-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-LABOR', JWT_SECRET: 'isolated-labor-test-secret',
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
  console.log(`Isolated labor evidence: ${directory}`);
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

const base0 = { name: 'Hợp đồng lao động kiểm thử', contractTemplate: 'Mẫu thử', partyBType: 'employee', employeeCode: 'LABOR-1', employeeName: 'Nhân viên', salary: 10000000, signerName: 'Người đại diện' };

const probation = { ...base0, probationSalary: 8_500_000 };

test('thử việc theo Điều 25: phải chọn loại công việc và không vượt giới hạn ngày của loại đó', async () => {
  await request('/contracts', 'POST', { ...probation, code: 'HD-LABOR-1', probationMonths: 7 }, 422);
  await request('/contracts', 'POST', { ...probation, code: 'HD-TV-1', probationDays: 30 }, 422);
  await request('/contracts', 'POST', { ...probation, code: 'HD-TV-2', probationCategory: 'manager', probationDays: 181 }, 422);
  await request('/contracts', 'POST', { ...probation, code: 'HD-TV-3', probationCategory: 'college', probationDays: 61 }, 422);
  await request('/contracts', 'POST', { ...probation, code: 'HD-TV-4', probationCategory: 'intermediate', probationDays: 31 }, 422);
  await request('/contracts', 'POST', { ...probation, code: 'HD-TV-5', probationCategory: 'other', probationDays: 7 }, 422);
  await request('/contracts', 'POST', { ...probation, code: 'HD-TV-X', probationCategory: 'bogus', probationDays: 5 }, 422);
  const manager = await request('/contracts', 'POST', { ...probation, code: 'HD-TV-6', employeeCode: 'TV-6', probationCategory: 'manager', probationDays: 180 }, 201);
  assert.equal(manager.contract.probationCategory, 'manager');
  assert.equal(manager.contract.probationDays, 180);
  assert.equal(manager.contract.probationSalary, 8_500_000);
  await request('/contracts', 'POST', { ...probation, code: 'HD-TV-7', employeeCode: 'TV-7', probationCategory: 'other', probationDays: 6 }, 201);
  // Số tháng cũ quy đổi theo lịch: 2 tháng từ 01/07 là 62 ngày, vượt 60 ngày; từ 01/01 là 59 ngày.
  await request('/contracts', 'POST', { ...probation, code: 'HD-TV-8', employeeCode: 'TV-8', probationCategory: 'college', probationMonths: 2, startDate: '2026-07-01' }, 422);
  await request('/contracts', 'POST', { ...probation, code: 'HD-TV-9', employeeCode: 'TV-9', probationCategory: 'college', probationMonths: 2, startDate: '2026-01-01' }, 201);
  // Hợp đồng không phải lao động không bị áp giới hạn thử việc.
  await request('/contracts', 'POST', { ...base0, code: 'HD-TV-10', contractCategory: 'service', employeeCode: '', employeeName: '', partyBType: 'organization', partyBName: 'Đối tác', probationDays: 400 }, 201);
});

test('lương thử việc ít nhất 85% mức lương của công việc theo Điều 26', async () => {
  const terms = { ...base0, probationCategory: 'college', probationDays: 60 };
  await request('/contracts', 'POST', { ...terms, code: 'HD-TV-11', employeeCode: 'TV-11' }, 422);
  await request('/contracts', 'POST', { ...terms, code: 'HD-TV-12', employeeCode: 'TV-12', probationSalary: 8_499_999 }, 422);
  await request('/contracts', 'POST', { ...terms, code: 'HD-TV-13', employeeCode: 'TV-13', probationSalary: 8_500_000 }, 201);
  await request('/contracts', 'POST', { ...terms, code: 'HD-TV-14', employeeCode: 'TV-14', salary: 0, probationSalary: 8_500_000 }, 422);
});

test('hợp đồng lao động dưới 1 tháng không được thử việc theo Điều 24', async () => {
  const terms = { ...probation, probationCategory: 'other', probationDays: 3, startDate: '2026-01-01' };
  await request('/contracts', 'POST', { ...terms, code: 'HD-TV-15', employeeCode: 'TV-15', endDate: '2026-01-20' }, 422);
  await request('/contracts', 'POST', { ...terms, code: 'HD-TV-16', employeeCode: 'TV-16', endDate: '2026-01-31' }, 201);
});

test('hợp đồng thử việc riêng tính thời gian theo ngày bắt đầu đến ngày kết thúc', async () => {
  const terms = { ...probation, contractTemplate: 'Hợp đồng thử việc', contractType: 'Hợp đồng thử việc', probationCategory: 'college', startDate: '2026-01-01' };
  await request('/contracts', 'POST', { ...terms, code: 'HD-TV-17', employeeCode: 'TV-17' }, 422);
  await request('/contracts', 'POST', { ...terms, code: 'HD-TV-18', employeeCode: 'TV-18', endDate: '2026-03-02' }, 422);
  await request('/contracts', 'POST', { ...terms, code: 'HD-TV-19', employeeCode: 'TV-19', endDate: '2026-03-01' }, 201);
});

test('chỉ được thử việc một lần đối với một công việc', async () => {
  const terms = { ...probation, employeeCode: 'TV-20', position: 'Kế toán', probationCategory: 'college', probationDays: 60 };
  const first = await request('/contracts', 'POST', { ...terms, code: 'HD-TV-20' }, 201);
  await request('/contracts', 'POST', { ...terms, code: 'HD-TV-21', position: 'kế toán' }, 409);
  await request('/contracts', 'POST', { ...terms, code: 'HD-TV-22', position: 'Nhân sự' }, 201);
  await request(`/contracts/${first.contract.id}`, 'PATCH', { ...terms, code: 'HD-TV-20', note: 'Cập nhật' }, 200);
  // Hợp đồng chính thức không có điều khoản thử việc cho cùng vị trí vẫn được ký.
  await request('/contracts', 'POST', { ...base0, code: 'HD-TV-23', employeeCode: 'TV-20', position: 'Kế toán' }, 201);
});

test('hợp đồng xác định thời hạn không quá 36 tháng và ngày kết thúc không trước ngày bắt đầu', async () => {
  await request('/contracts', 'POST', { ...base0, code: 'HD-LABOR-3', startDate: '2026-01-01', endDate: '2029-01-02' }, 422);
  await request('/contracts', 'POST', { ...base0, code: 'HD-LABOR-4', startDate: '2026-01-01', endDate: '2029-01-01' }, 201);
  await request('/contracts', 'POST', { ...base0, code: 'HD-LABOR-5', startDate: '2026-06-01', endDate: '2026-05-01' }, 422);
  await request('/contracts', 'POST', { ...base0, code: 'HD-LABOR-6', startDate: '2026-01-01' }, 201);
});

test('ngày phép năm tối thiểu 12 ngày và hợp đồng không phải lao động không bị áp giới hạn này', async () => {
  await request('/contracts', 'POST', { ...base0, code: 'HD-LABOR-7', annualLeaveDays: 10 }, 422);
  await request('/contracts', 'POST', { ...base0, code: 'HD-LABOR-8', annualLeaveDays: 14 }, 201);
  await request('/contracts', 'POST', { ...base0, code: 'HD-SERVICE-1', contractCategory: 'service', employeeCode: '', employeeName: '', partyBType: 'organization', partyBName: 'Đối tác', probationMonths: 9, annualLeaveDays: 0 }, 201);
});
