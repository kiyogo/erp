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

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-payroll-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'),
  KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'payroll@example.test', SEED_ADMIN_PASSWORD: 'Payroll-Test-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-PAYROLL', JWT_SECRET: 'isolated-payroll-test-secret',
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
  console.log(`Isolated payroll evidence: ${directory}`);
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
await request('/auth/security-pin', 'POST', { pin: '789012', confirmPin: '789012', currentPassword: env.SEED_ADMIN_PASSWORD });
headers['X-Security-Pin'] = '789012';

async function createEmployee(code, salaryBase, familyMembers = []) {
  const user = (await request('/users', 'POST', { email: `${code.toLowerCase()}@example.test`, name: `Nhân viên ${code}`, password: 'Payroll-Staff-26!Secure', employeeCode: code, role: 'USER', department: 'Kế toán' }, 201)).user;
  await request(`/employees/${user.id}`, 'PATCH', { salaryBase, details: familyMembers.length ? { familyMembers } : undefined });
  return user;
}

test('tính lương theo hồ sơ nhân viên: bảo hiểm, người phụ thuộc và thuế TNCN kỳ 2026', async () => {
  await createEmployee('PAY-1', 30_000_000, [{ id: 'm1', name: 'Con', relation: 'Con', isDependent: true, dependentStartDate: '2026-01-01' }]);
  await createEmployee('PAY-2', 80_000_000);
  const result = await request('/finance/payroll/calculate', 'POST', { period: '2026-03', region: 'I' });
  const first = result.rows.find(row => row.employeeCode === 'PAY-1');
  assert.equal(first.dependents, 1);
  assert.equal(first.insuranceDeduction, 3_150_000);
  assert.equal(first.taxDeduction, 257_500);
  assert.equal(first.netSalary, 30_000_000 - 3_150_000 - 257_500);
  const second = result.rows.find(row => row.employeeCode === 'PAY-2');
  assert.equal(second.taxDeduction, 8_350_800);
  assert.equal(result.parameters.personalDeduction, 15_500_000);
  assert.ok(result.parameters.legalBasis.some(text => text.includes('109/2025/QH15')));
});

test('phụ cấp và thưởng được cộng vào thu nhập chịu thuế, và có thể lọc theo mã nhân viên', async () => {
  const result = await request('/finance/payroll/calculate', 'POST', { period: '2026-03', region: 'I', employeeCodes: ['pay-2'], items: [{ employeeCode: 'PAY-2', allowance: 2_000_000, bonus: 3_000_000, exemptIncome: 1_000_000 }] });
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].gross, 85_000_000);
  assert.equal(result.rows[0].taxableIncome, 85_000_000 - 1_000_000 - result.rows[0].insuranceDeduction - 15_500_000);
});

test('từ chối kỳ, vùng không hợp lệ và yêu cầu mã PIN', async () => {
  await request('/finance/payroll/calculate', 'POST', { period: '2024-01', region: 'I' }, 422);
  await request('/finance/payroll/calculate', 'POST', { period: '2026-03', region: 'X' }, 422);
  await request('/finance/payroll/calculate', 'POST', { period: '2026-03', region: 'I' }, 428, { 'X-Security-Pin': '' });
});

test('phiếu lương lưu kèm số bảo hiểm tính được và đọc lại đúng', async () => {
  const calculated = await request('/finance/payroll/calculate', 'POST', { period: '2026-03', region: 'I', employeeCodes: ['PAY-1'] });
  const row = calculated.rows[0];
  const record = {
    key: 'payroll-2026-03-pay-1', employeeCode: row.employeeCode, employeeName: row.employeeName, department: row.department, month: '2026-03', status: 'Chưa chi trả', workDays: 0,
    baseSalary: row.baseSalary, allowance: row.allowance, bonus: row.bonus, insuranceDeduction: row.insuranceDeduction, taxDeduction: row.taxDeduction, netSalary: row.netSalary,
    employeeSocial: row.employeeInsurance.social, employeeHealth: row.employeeInsurance.health, employeeUnemployment: row.employeeInsurance.unemployment,
    employerSocial: row.employerInsurance.social, employerHealth: row.employerInsurance.health, employerUnemployment: row.employerInsurance.unemployment,
  };
  const created = (await request('/collections/payroll', 'POST', { record }, 201)).record;
  assert.equal(created.employerHealth, row.employerInsurance.health);
  assert.equal(created.employeeSocial + created.employeeHealth + created.employeeUnemployment, created.insuranceDeduction);
  const listed = (await request('/collections/payroll?limit=50')).data.find(item => item.key === record.key);
  assert.equal(listed.employerSocial, row.employerInsurance.social);
});

test('xác minh mã PIN bảo mật bằng máy chủ, không dùng PIN mặc định phía trình duyệt', async () => {
  const verified = await request('/auth/security-pin/verify', 'POST', {});
  assert.equal(verified.verified, true);
  await request('/auth/security-pin/verify', 'POST', {}, 403, { 'X-Security-Pin': '123456' });
  await request('/auth/security-pin/verify', 'POST', {}, 428, { 'X-Security-Pin': '' });
});
