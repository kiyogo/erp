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

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-authz-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'),
  KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'authz@example.test', SEED_ADMIN_PASSWORD: 'Authz-Test-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-AUTHZ', JWT_SECRET: 'isolated-authz-test-secret',
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
  console.log(`Isolated authz evidence: ${directory}`);
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
const staffEmail = 'staff-authz@example.test';
const staffPassword = 'Staff-Authz-26!Secure';
await request('/users', 'POST', { email: staffEmail, name: 'Nhân viên thường', password: staffPassword, employeeCode: 'AUTHZ-USER', role: 'USER' }, 201);
const staffLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: staffEmail, password: staffPassword }) });
assert.equal(staffLogin.status, 200);
const staffSession = await staffLogin.json();
const staffHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${staffSession.access_token || staffSession.token}` };
async function asStaff(route, method = 'GET', payload) {
  const response = await fetch(`${base}${route}`, { method, headers: staffHeaders, body: payload === undefined ? undefined : JSON.stringify(payload) });
  return response.status;
}

const adminOnlyReads = [
  '/users', '/finance/bank-accounts', '/finance/cash-transactions', '/finance/internal-transfers', '/finance/chart-of-accounts',
  '/collections/payroll', '/collections/finance_cash_counts', '/collections/hr_rewards',
  '/admin/audit-logs', '/admin/system/status', '/system/company-profile', '/crm/contacts', '/finance/payroll/posted-periods',
];
test('nhân viên thường không đọc được dữ liệu quản trị tài chính, nhân sự và hệ thống', async () => {
  const exposed = [];
  for (const route of adminOnlyReads) {
    const status = await asStaff(route);
    if (status === 200) exposed.push(route);
  }
  assert.deepEqual(exposed, [], `Các đường dẫn nhân viên thường đọc được: ${exposed.join(', ')}`);
});

test('nhân viên thường không ghi hoặc tính được nghiệp vụ quản trị', async () => {
  const writes = [
    ['/finance/payroll/calculate', 'POST', { period: '2026-03', region: 'I' }],
    ['/finance/bank-accounts', 'POST', { bankName: 'X', accountNumber: '1', accountHolder: 'X', balance: 0 }],
    ['/finance/cash-transactions', 'POST', {}],
    ['/users', 'POST', { email: 'x@example.test', name: 'X', password: 'Xxxxxxxx-26!Secure', employeeCode: 'X', role: 'ADMIN' }],
    ['/crm/contacts', 'POST', { type: 'customer', name: 'X' }],
    ['/collections/payroll', 'POST', { record: { employeeCode: 'X' } }],
  ];
  const accepted = [];
  for (const [route, method, payload] of writes) {
    const status = await asStaff(route, method, payload);
    if (status < 400) accepted.push(`${method} ${route} -> ${status}`);
  }
  assert.deepEqual(accepted, []);
});

test('không có phiên đăng nhập thì mọi dữ liệu quản trị bị từ chối', async () => {
  const open = [];
  for (const route of ['/users', '/finance/bank-accounts', '/collections/payroll', '/employees', '/crm/contacts']) {
    const status = (await fetch(`${base}${route}`)).status;
    if (status !== 401) open.push(`${route} -> ${status}`);
  }
  assert.deepEqual(open, []);
});

test('nhân viên thường không tạo, sửa hoặc xóa được dữ liệu quản trị trong kho dữ liệu chung', async () => {
  const blocked = ['finance_loans', 'finance_equity', 'finance_budgets', 'hr_employees', 'hr_headcount_quotas', 'hr_training_courses', 'hr_certificates',
    'hr_uniforms', 'asset_items', 'asset_audits', 'business_org_units', 'payroll', 'attendance_shifts', 'attendance_shift_details',
    'crm_feedback', 'admin_roles', 'contract_templates', 'insurance_adjustments', 'insurance_regimes', 'plan_items', 'plan_milestones', 'plan_progress', 'reports_catalog'];
  const accepted = [];
  for (const scope of blocked) {
    for (const [method, route, payload] of [['POST', `/collections/${scope}`, { record: { key: 'x', name: 'x' } }], ['PUT', `/collections/${scope}`, { records: [] }], ['PATCH', `/collections/${scope}/x`, { patch: { name: 'y' } }], ['DELETE', `/collections/${scope}/x`]]) {
      const status = await asStaff(route, method, payload);
      if (status < 400 || status === 404) accepted.push(`${method} ${scope} -> ${status}`);
    }
  }
  assert.deepEqual(accepted, []);
});

test('quản trị viên tạo dữ liệu thì nhân viên thường không thấy bản ghi của người khác', async () => {
  await request('/collections/hr_training_courses', 'POST', { record: { key: 'admin-course', courseCode: 'KH-1', courseName: 'Khóa của quản trị' } }, 201);
  const response = await fetch(`${base}/collections/hr_training_courses?limit=50`, { headers: staffHeaders });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.length, 0);
});

test('nhân viên thường vẫn gửi được các yêu cầu thuộc nghiệp vụ của chính họ', async () => {
  for (const scope of ['leave_requests', 'attendance_overtime', 'attendance_explanations']) {
    const status = await asStaff(`/collections/${scope}`, 'POST', { record: { key: `own-${scope}`, employeeName: 'Nhân viên thường', status: 'Chờ duyệt' } });
    assert.ok(status < 400 || status === 422, `${scope} -> ${status}`);
  }
});

test('hội nhập không tự tạo tài khoản người dùng từ mã nhân viên mẫu', async () => {
  await request('/collections/hr_onboarding_tasks', 'POST', { record: { key: 'sample-task', employeeId: 'emp-sys-9', employeeName: 'Nhân viên giả', empCode: 'NV999999', department: 'Phòng A', position: 'Nhân viên', startDate: '2026-01-05', evaluationDate: '2026-03-05', mentor: 'Người hướng dẫn' } }, 422);
  const body = await request('/users');
  const users = body.data || body.users;
  assert.ok(Array.isArray(users) && users.length > 0, 'danh sách người dùng phải có dữ liệu để phép kiểm tra có ý nghĩa');
  assert.equal(users.some(user => user.employeeCode === 'NV999999' || user.id === 'emp-sys-9'), false);
});

test('nhân viên chỉ tạo được ticket hỗ trợ mới, không sửa hoặc xóa được', async () => {
  await request('/collections/business_org_units', 'POST', { record: { key: 'unit-it', code: 'IT', name: 'Phòng Công nghệ', status: 'Đang hoạt động' } }, 201);
  const created = await fetch(`${base}/collections/tickets`, { method: 'POST', headers: staffHeaders, body: JSON.stringify({ record: { code: 'IT-AUTHZ-1', title: 'Máy tính hỏng', description: 'Không khởi động được', priority: 'Trung bình', department: 'Phòng Công nghệ' } }) });
  assert.equal(created.status, 201);
  assert.equal((await created.json()).record.requester, 'Nhân viên thường');
  assert.equal(await asStaff('/collections/tickets/IT-AUTHZ-1', 'PATCH', { patch: { status: 'Đã hoàn thành' } }), 403);
  assert.equal(await asStaff('/collections/tickets/IT-AUTHZ-1', 'DELETE'), 403);
});

test('nhân viên thấy tài sản được bàn giao cho chính mình sau khi biên bản được xác nhận', async () => {
  const before = await fetch(`${base}/employees/me/assets`, { headers: staffHeaders });
  assert.equal(before.status, 200);
  assert.deepEqual((await before.json()).data, []);
  const asset = { key: 'authz-asset', code: 'TS-AUTHZ-1', name: 'Máy tính xách tay', category: 'Laptop', serialNo: 'SN-AUTHZ-1', status: 'Trong kho', location: 'Kho A', department: 'IT', assignedTo: '', originalPrice: 1000, history: [] };
  await request('/collections/asset_items', 'POST', { record: asset }, 201);
  const allocation = (await request('/assets/allocations', 'POST', { ticketCode: 'CP-AUTHZ-1', type: 'Cấp phát', assetCode: asset.code, employeeCode: 'AUTHZ-USER', department: 'Phòng Công nghệ', position: 'Nhân viên', handoverPerson: 'Thủ kho', allocatedDate: '2026-11-02', expectedReturnDate: 'Vô thời hạn', purpose: 'Cấp phát chính thức cho nhân viên mới', condition: 'Tốt', accessories: 'Sạc' }, 201)).record;
  assert.deepEqual((await (await fetch(`${base}/employees/me/assets`, { headers: staffHeaders })).json()).data, []);
  await request(`/assets/allocations/${allocation.key}/confirm`, 'POST', { receiverName: 'Nhân viên thường' });
  const own = (await (await fetch(`${base}/employees/me/assets`, { headers: staffHeaders })).json()).data;
  assert.equal(own.length, 1);
  assert.equal(own[0].code, 'TS-AUTHZ-1');
  assert.equal(own[0].serial, 'SN-AUTHZ-1');
  assert.equal(own[0].handoverDate, '2026-11-02');
});
