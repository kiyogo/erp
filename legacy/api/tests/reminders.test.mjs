import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-reminders-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'reminders@example.test', SEED_ADMIN_PASSWORD: 'Reminders-Test-26!Secure', SEED_ADMIN_EMPLOYEE_CODE: 'TEST-REM', JWT_SECRET: 'isolated-reminders-test-secret',
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
  const body = await (await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) })).json();
  return { id: body.user.id, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${body.access_token || body.token}` } };
}
async function call(session, route, method = 'GET', payload) {
  const response = await fetch(`${base}${route}`, { method, headers: session.headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}
const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
const password = 'Staff-Reminders-26!Secure';
const makeUser = async (suffix, extra = {}) => {
  const created = await call(admin, '/users', 'POST', { email: `${suffix}@example.test`, name: `Người ${suffix}`, password, employeeCode: `REM-${suffix.toUpperCase()}`, role: 'USER', ...extra });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  return { ...(await login(`${suffix}@example.test`, password)), code: `REM-${suffix.toUpperCase()}` };
};
const notificationsOf = async (session) => (await call(session, '/notifications')).body.data.filter(item => item.type === 'expiry_reminder');
const dayFromToday = (offset) => new Date(Date.now() + offset * 86_400_000 + 7 * 3_600_000).toISOString().slice(0, 10);

test('nhắc việc theo hạn gửi đúng người, đúng mốc và không gửi trùng', async () => {
  await call(admin, '/collections/admin_roles', 'POST', { record: { roleCode: 'NHAN_SU', name: 'Nhân sự', permissions: { hr: { read: true } } } });
  const employee = await makeUser('nv');
  const hr = await makeUser('hr', { roleCode: 'NHAN_SU' });
  const outsider = await makeUser('ngoai');

  const db = new DatabaseSync(env.KIYOVN_DB_PATH);
  const insert = db.prepare("INSERT INTO contracts (id, code, name, employee_code, employee_name, employee_user_id, contract_type, status, start_date, end_date, probation_months, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const stamp = new Date().toISOString();
  const addContract = (id, status, endDate, extra = {}) => insert.run(id, `HD-${id}`, `Hợp đồng ${id}`, employee.code, 'Người nv', employee.id, extra.type || 'Hợp đồng lao động xác định thời hạn', status, extra.start || '2026-01-01', endDate, extra.probation || 0, stamp, stamp);
  addContract('c1', 'Còn hiệu lực', dayFromToday(10));
  addContract('c2', 'Còn hiệu lực', dayFromToday(60));
  addContract('c3', 'Chờ ký', dayFromToday(3));
  addContract('c4', 'Còn hiệu lực', dayFromToday(-5));
  addContract('c5', 'Còn hiệu lực', '', { start: dayFromToday(-57), probation: 2 }); // thử việc 2 tháng kết thúc sau khoảng 4 ngày
  const probationEnd = new Date(Date.parse(`${dayFromToday(-57)}T00:00:00Z`));
  probationEnd.setUTCMonth(probationEnd.getUTCMonth() + 2);
  const probationDays = Math.round((probationEnd.getTime() - Date.parse(`${dayFromToday(0)}T00:00:00Z`)) / 86_400_000);
  assert.ok(probationDays >= 0 && probationDays <= 7, `thử việc phải sắp kết thúc, thực tế còn ${probationDays} ngày`);
  db.close();

  assert.equal((await call(admin, '/collections/finance_digital_signatures', 'POST', { record: { certNumber: 'REM-CERT', provider: 'Nhà cung cấp thử', subjectName: 'Công ty', signType: 'Cloud CA', authorizedSigner: 'Giám đốc', validFrom: '2026-01-01', validTo: dayFromToday(25) } })).status, 201);
  assert.equal((await call(admin, '/collections/hr_certificates', 'POST', { record: { key: 'cert-1', certName: 'Chứng chỉ an toàn', employeeName: 'Người nv', empCode: employee.code, expireDate: dayFromToday(2), status: 'Sắp hết hạn' } })).status, 201);

  const first = await call(admin, '/admin/reminders/run', 'POST', {});
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.ok(first.body.created > 0);

  const adminNotes = await notificationsOf(admin);
  const titles = adminNotes.map(item => item.title);
  assert.ok(titles.includes('Hợp đồng sắp hết hạn'), 'hợp đồng c1');
  assert.ok(titles.includes('Hợp đồng đã hết hạn'), 'hợp đồng c4 đã quá hạn');
  assert.ok(titles.includes('Sắp hết thời gian thử việc'), 'thử việc c5');
  assert.ok(titles.includes('Chứng thư số sắp hết hạn'));
  assert.ok(titles.includes('Chứng chỉ sắp hết hiệu lực'));
  const joined = adminNotes.map(item => item.message).join('\n');
  assert.ok(joined.includes('HD-c1') && joined.includes('HD-c4') && joined.includes('HD-c5'));
  assert.ok(!joined.includes('HD-c2'), 'còn hơn 30 ngày thì chưa nhắc');
  assert.ok(!joined.includes('HD-c3'), 'hợp đồng chưa có hiệu lực không nhắc');
  assert.ok(joined.includes('Điều 20 Bộ luật Lao động 2019') && joined.includes('Điều 27 Bộ luật Lao động 2019'));

  // Nhân viên chỉ nhận nhắc việc liên quan tới chính mình; người giữ vai trò nhân sự nhận phần nhân sự; người ngoài không nhận gì.
  const employeeTitles = (await notificationsOf(employee)).map(item => item.title);
  assert.ok(employeeTitles.includes('Hợp đồng sắp hết hạn') && employeeTitles.includes('Chứng chỉ sắp hết hiệu lực'));
  assert.ok(!employeeTitles.includes('Chứng thư số sắp hết hạn'), 'chứng thư số của doanh nghiệp không gửi cho nhân viên');
  const hrTitles = (await notificationsOf(hr)).map(item => item.title);
  assert.ok(hrTitles.includes('Hợp đồng sắp hết hạn') && !hrTitles.includes('Chứng thư số sắp hết hạn'));
  assert.equal((await notificationsOf(outsider)).length, 0);

  // Chạy lại không gửi trùng; sang mốc mới thì gửi thêm đúng một lần.
  assert.equal((await call(admin, '/admin/reminders/run', 'POST', {})).body.created, 0);
  const move = new DatabaseSync(env.KIYOVN_DB_PATH);
  move.prepare('UPDATE contracts SET end_date = ? WHERE id = ?').run(dayFromToday(5), 'c1');
  move.close();
  const next = await call(admin, '/admin/reminders/run', 'POST', {});
  assert.ok(next.body.created >= 2, 'quản trị viên và nhân viên nhận thêm nhắc ở mốc 7 ngày');
  assert.equal((await call(admin, '/admin/reminders/run', 'POST', {})).body.created, 0);
  assert.equal((await notificationsOf(admin)).filter(item => item.message.includes('HD-c1')).length, 2);

  // Gia hạn chứng thư số: cùng bản ghi nhưng ngày hết hạn mới thì kỳ sau được nhắc lại; chạy lại trong cùng kỳ thì không gửi trùng.
  const certNotices = async () => (await notificationsOf(admin)).filter(item => item.title.startsWith('Chứng thư số')).length;
  const setCertExpiry = (validTo) => {
    const handle = new DatabaseSync(env.KIYOVN_DB_PATH);
    handle.prepare("UPDATE collection_records SET payload_json = json_set(payload_json, '$.validTo', ?) WHERE scope = 'finance_digital_signatures'").run(validTo);
    handle.close();
  };
  assert.equal(await certNotices(), 1);
  setCertExpiry(dayFromToday(400));
  assert.equal((await call(admin, '/admin/reminders/run', 'POST', {})).body.created, 0, 'đã gia hạn, chưa tới hạn mới');
  setCertExpiry(dayFromToday(26));
  assert.ok((await call(admin, '/admin/reminders/run', 'POST', {})).body.created >= 1);
  assert.equal(await certNotices(), 2, 'chu kỳ hết hạn sau của cùng chứng thư được nhắc lại');
  assert.equal((await call(admin, '/admin/reminders/run', 'POST', {})).body.created, 0);
});

test('chỉ quản trị viên chạy được nhắc việc và nhật ký nhắc việc do máy chủ quản lý', async () => {
  const staff = await login('nv@example.test', password);
  assert.equal((await call(staff, '/admin/reminders/run', 'POST', {})).status, 403);
  assert.equal((await call(staff, '/collections/reminder_log')).status, 403);
  assert.equal((await call(admin, '/collections/reminder_log')).status, 403);
});
