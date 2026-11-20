import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-roles-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'),
  KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'roles@example.test', SEED_ADMIN_PASSWORD: 'Roles-Test-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-ROLES', JWT_SECRET: 'isolated-roles-test-secret',
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
for (let i = 0; i < 300; i++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (server.exitCode !== null || i === 299) throw new Error(logs);
  await new Promise(resolve => setTimeout(resolve, 100));
}

async function login(email, password) {
  const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  assert.equal(response.status, 200, await response.clone().text());
  const body = await response.json();
  return { body, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${body.access_token || body.token}` } };
}
const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
async function call(headers, route, method = 'GET', payload) {
  const response = await fetch(`${base}${route}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}
async function asAdmin(route, method = 'GET', payload, expected = 200) {
  const result = await call(admin.headers, route, method, payload);
  assert.equal(result.status, expected, JSON.stringify(result.body));
  return result.body;
}
const password = 'Staff-Roles-26!Secure';
async function createStaff(email, employeeCode, roleCode) {
  const created = await asAdmin('/users', 'POST', { email, name: `Nhân viên ${employeeCode}`, password, employeeCode, role: 'USER', ...(roleCode ? { roleCode } : {}) }, 201);
  return { id: created.user.id, user: created.user, session: await login(email, password) };
}

test('quản trị viên tạo vai trò hợp lệ, từ chối mã trùng và mã của hệ thống', async () => {
  const created = await asAdmin('/collections/admin_roles', 'POST', { record: { roleCode: 'nhan_su', name: 'Nhân sự', description: 'Quản lý hồ sơ nhân sự', permissions: { hr: { create: true }, finance: { read: true }, bogus: { read: true } } } }, 201);
  assert.equal(created.record.key, 'NHAN_SU');
  assert.equal(created.record.roleCode, 'NHAN_SU');
  assert.equal(created.record.status, 'Kích hoạt');
  assert.equal(created.record.permissions.hr.create, true);
  assert.equal(created.record.permissions.hr.read, true, 'tạo hồ sơ kéo theo quyền xem');
  assert.equal(created.record.permissions.hr.edit, false);
  assert.equal(created.record.permissions.bogus, undefined, 'module lạ bị loại bỏ');
  await asAdmin('/collections/admin_roles', 'POST', { record: { roleCode: 'NHAN_SU', name: 'Trùng' } }, 409);
  await asAdmin('/collections/admin_roles', 'POST', { record: { roleCode: 'ADMIN', name: 'Giả quản trị' } }, 422);
  await asAdmin('/collections/admin_roles', 'POST', { record: { roleCode: 'x', name: 'Mã quá ngắn' } }, 422);
  await asAdmin('/collections/admin_roles', 'PUT', { records: [] }, 405);
});

test('gán vai trò: chỉ nhận vai trò tồn tại và chỉ cho tài khoản USER', async () => {
  const staff = await createStaff('assign@example.test', 'RL-ASSIGN');
  await asAdmin(`/users/${staff.id}`, 'PATCH', { roleCode: 'KHONG_TON_TAI' }, 422);
  const patched = await asAdmin(`/users/${staff.id}`, 'PATCH', { roleCode: 'nhan_su' });
  assert.equal(patched.user.roleCode, 'NHAN_SU');
  const promoted = await asAdmin(`/users/${staff.id}`, 'PATCH', { role: 'ADMIN' });
  assert.equal(promoted.user.roleCode, '', 'quản trị viên không giữ vai trò ủy quyền');
});

test('vai trò cấp đúng module và hành động, đổi quyền có hiệu lực ngay', async () => {
  const course = await asAdmin('/collections/hr_training_courses', 'POST', { record: { key: 'admin-course', courseCode: 'KH-1', courseName: 'Khóa của quản trị' } }, 201);
  assert.equal(course.record.key, 'admin-course');
  const hr = await createStaff('hr@example.test', 'RL-HR', 'NHAN_SU');
  assert.equal(hr.session.body.user.delegatedPermissions.hr.create, true);
  assert.equal(hr.session.body.user.delegatedPermissions.finance.read, true);
  assert.equal(hr.session.body.user.delegatedPermissions.crm.read, false);

  // Được cấp: xem mọi bản ghi nhân sự và tạo mới.
  const list = await call(hr.session.headers, '/collections/hr_training_courses?limit=50');
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some(item => item.key === 'admin-course'), 'vai trò có quyền xem thấy bản ghi của người khác');
  const own = await call(hr.session.headers, '/collections/hr_training_courses', 'POST', { record: { key: 'hr-course', courseCode: 'KH-2', courseName: 'Khóa của nhân sự' } });
  assert.equal(own.status, 201, JSON.stringify(own.body));
  assert.equal((await call(hr.session.headers, '/finance/bank-accounts')).status, 200, 'quyền xem tài chính được cấp');

  // Không được cấp: sửa, xóa, module khác và hành động ghi tài chính.
  assert.equal((await call(hr.session.headers, '/collections/hr_training_courses/admin-course', 'PATCH', { patch: { courseName: 'Sửa trái phép' } })).status, 403);
  assert.equal((await call(hr.session.headers, '/collections/hr_training_courses/admin-course', 'DELETE')).status, 403);
  assert.equal((await call(hr.session.headers, '/finance/bank-accounts', 'POST', { bankName: 'X', accountNumber: '1', accountHolder: 'X', balance: 0 })).status, 403);
  assert.equal((await call(hr.session.headers, '/crm/contacts')).status, 403);
  assert.equal((await call(hr.session.headers, '/collections/payroll', 'POST', { record: { employeeCode: 'X' } })).status, 403);

  // Cấp thêm quyền sửa: có hiệu lực ngay, không cần đăng nhập lại.
  const role = (await asAdmin('/admin/roles/overview')).roles.find(item => item.roleCode === 'NHAN_SU');
  await asAdmin('/collections/admin_roles/NHAN_SU', 'PATCH', { patch: { permissions: { ...role.permissions, hr: { ...role.permissions.hr, edit: true } } } });
  const edited = await call(hr.session.headers, '/collections/hr_training_courses/admin-course', 'PATCH', { patch: { courseName: 'Được sửa' } });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal((await call(hr.session.headers, '/collections/hr_training_courses/admin-course', 'DELETE')).status, 403, 'vẫn chưa có quyền xóa');

  // Tạm khóa vai trò: mọi quyền ủy quyền biến mất.
  await asAdmin('/collections/admin_roles/NHAN_SU', 'PATCH', { patch: { status: 'Tạm khóa' } });
  assert.equal((await call(hr.session.headers, '/collections/hr_training_courses?limit=50')).status, 200, 'dữ liệu của chính họ vẫn đọc được');
  const afterLock = await call(hr.session.headers, '/collections/hr_training_courses?limit=50');
  assert.ok(!afterLock.body.data.some(item => item.key === 'admin-course'), 'không còn thấy bản ghi của người khác');
  assert.equal((await call(hr.session.headers, '/finance/bank-accounts')).status, 403);
  assert.equal((await call(hr.session.headers, '/auth/profile')).body.user.delegatedPermissions, null);
  await asAdmin('/collections/admin_roles/NHAN_SU', 'PATCH', { patch: { status: 'Kích hoạt' } });
});

test('vai trò toàn quyền vẫn không mở được quản trị tài khoản, hệ thống và nhật ký', async () => {
  const modules = (await asAdmin('/admin/roles/overview')).modules.map(item => item.key);
  const everything = Object.fromEntries(modules.map(key => [key, { read: true, create: true, edit: true, delete: true }]));
  await asAdmin('/collections/admin_roles', 'POST', { record: { roleCode: 'TOAN_QUYEN', name: 'Toàn quyền nghiệp vụ', permissions: everything } }, 201);
  const power = await createStaff('power@example.test', 'RL-POWER', 'TOAN_QUYEN');
  const denied = [
    ['/users', 'GET'], ['/users', 'POST', { email: 'y@example.test', name: 'Y', password, employeeCode: 'RL-Y', role: 'ADMIN' }],
    [`/users/${power.id}`, 'PATCH', { role: 'ADMIN' }], [`/users/${power.id}`, 'DELETE'],
    ['/admin/audit-logs', 'GET'], ['/admin/roles/overview', 'GET'], ['/admin/system/status', 'GET'], ['/system/company-profile', 'GET'],
    ['/admin/backups', 'GET'], ['/collections/admin_roles', 'POST', { record: { roleCode: 'LEO_THANG', name: 'Tự cấp quyền' } }],
    ['/collections/admin_roles/TOAN_QUYEN', 'PATCH', { patch: { status: 'Tạm khóa' } }], ['/collections/admin_sessions', 'GET'],
  ];
  const opened = [];
  for (const [route, method, payload] of denied) {
    const result = await call(power.session.headers, route, method, payload);
    if (result.status < 400) opened.push(`${method} ${route} -> ${result.status}`);
  }
  assert.deepEqual(opened, []);
  // Chính tài khoản đó vẫn thao tác được trong phạm vi nghiệp vụ.
  assert.equal((await call(power.session.headers, '/crm/contacts')).status, 200);
  assert.equal((await call(power.session.headers, '/collections/asset_items')).status, 200);
});

test('không xóa được vai trò đang gán và đếm đúng số tài khoản', async () => {
  const holder = await createStaff('holder@example.test', 'RL-HOLD', 'TOAN_QUYEN');
  const roles = (await asAdmin('/admin/roles/overview')).roles;
  assert.equal(roles.find(role => role.roleCode === 'TOAN_QUYEN').usersCount, 2);
  assert.ok(roles.find(role => role.roleCode === 'ADMIN').system);
  assert.ok(roles.find(role => role.roleCode === 'USER').usersCount >= 3);
  const blocked = await call(admin.headers, '/collections/admin_roles/TOAN_QUYEN', 'DELETE');
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  const list = (await asAdmin('/users?limit=100')).data;
  for (const user of list.filter(item => item.roleCode === 'TOAN_QUYEN')) await asAdmin(`/users/${user.id}`, 'PATCH', { roleCode: '' });
  assert.equal(holder.id.length > 0, true);
  await asAdmin('/collections/admin_roles/TOAN_QUYEN', 'DELETE');
  const after = (await asAdmin('/admin/roles/overview')).roles;
  assert.equal(after.some(role => role.roleCode === 'TOAN_QUYEN'), false);
});

test('vai trò nhân sự không chiếm được tài khoản quản trị hay đổi thông tin đăng nhập của ai', async () => {
  await asAdmin('/collections/admin_roles', 'POST', { record: { roleCode: 'NHAN_SU_MO', name: 'Nhân sự mở rộng', permissions: { hr: { read: true, create: true, edit: true, delete: true } } } }, 201);
  const hr = await createStaff('hr2@example.test', 'RL-HR2', 'NHAN_SU_MO');
  const victim = await createStaff('victim@example.test', 'RL-VICTIM');
  const adminId = admin.body.user.id;
  const attempts = [
    [`/employees/${adminId}/password`, 'POST', { password: 'Hacker-26!Secure' }],
    [`/employees/${adminId}/activation`, 'POST'],
    [`/employees/${adminId}`, 'PATCH', { password: 'Hacker-26!Secure' }],
    [`/employees/${adminId}`, 'PATCH', { department: 'X' }],
    [`/employees/${adminId}`, 'GET'],
    [`/employees/${adminId}`, 'DELETE'],
    [`/employees/${victim.id}/password`, 'POST', { password: 'Hacker-26!Secure' }],
    [`/employees/${victim.id}/activation`, 'POST'],
    [`/employees/${victim.id}`, 'PATCH', { password: 'Hacker-26!Secure' }],
    [`/employees/${victim.id}`, 'PATCH', { email: 'owned@example.test' }],
    [`/employees/${victim.id}`, 'PATCH', { employeeCode: 'RL-OWNED' }],
  ];
  const opened = [];
  for (const [route, method, payload] of attempts) {
    const result = await call(hr.session.headers, route, method, payload);
    if (result.status < 400) opened.push(`${method} ${route} -> ${result.status}`);
  }
  assert.deepEqual(opened, []);
  // Sửa hồ sơ thông thường vẫn được, kể cả khi biểu mẫu gửi lại email hiện tại.
  const edited = await call(hr.session.headers, `/employees/${victim.id}`, 'PATCH', { department: 'Phòng Nhân sự', phone: '0901234567', email: 'victim@example.test' });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  // Mật khẩu cũ của cả hai tài khoản vẫn còn hiệu lực.
  await login('victim@example.test', password);
  await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
});

test('vai trò chỉ có quyền thêm không làm được các thao tác đổi trạng thái của bản ghi đã có', async () => {
  await asAdmin('/collections/admin_roles', 'POST', { record: { roleCode: 'CHI_THEM', name: 'Chỉ được thêm', permissions: { crm: { create: true }, assets: { create: true }, finance: { create: true } } } }, 201);
  const adder = await createStaff('adder@example.test', 'RL-ADD', 'CHI_THEM');
  const statusRoutes = ['/crm/loyalty/entries/x/fulfill', '/assets/licenses/x/renew', '/assets/licenses/x/allocate', '/finance/inventory/transactions/x/shipment-status'];
  for (const route of statusRoutes) assert.equal((await call(adder.session.headers, route, 'POST', {})).status, 403, `${route} cần quyền sửa`);

  // Được cấp quyền sửa thì yêu cầu tới được bộ xử lý (không có bản ghi nên báo lỗi dữ liệu hoặc 404), không còn bị chặn quyền.
  await asAdmin('/collections/admin_roles/CHI_THEM', 'PATCH', { patch: { permissions: { crm: { create: true, edit: true }, assets: { create: true, edit: true }, finance: { create: true, edit: true } } } });
  for (const route of statusRoutes) assert.notEqual((await call(adder.session.headers, route, 'POST', {})).status, 403, `${route} mở khi có quyền sửa`);
});
