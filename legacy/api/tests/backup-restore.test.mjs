import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, existsSync, writeFileSync, rmSync, openSync, readSync, writeSync, closeSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-restore-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const filesDir = path.join(directory, 'files');
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: filesDir,
  SEED_ADMIN_EMAIL: 'restore@example.test', SEED_ADMIN_PASSWORD: 'Restore-Test-26!Secure', SEED_ADMIN_EMPLOYEE_CODE: 'TEST-RST', JWT_SECRET: 'isolated-restore-test-secret',
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
const password = 'Staff-Restore-26!Secure';
const makeUser = async (suffix) => (await call(admin, '/users', 'POST', { email: `${suffix}@example.test`, name: `Người ${suffix}`, password, employeeCode: `RST-${suffix.toUpperCase()}`, role: 'USER' }));
const courseKeys = async () => (await call(admin, '/collections/hr_training_courses?limit=100')).body.data.map(item => item.key).sort();
const userEmails = async () => (await call(admin, '/users?limit=100')).body.data.map(item => item.email).sort();
const auditActions = () => {
  const db = new DatabaseSync(env.KIYOVN_DB_PATH, { readOnly: true });
  try { return db.prepare('SELECT action FROM audit_events').all().map(row => row.action); } finally { db.close(); }
};

let first;
test('khôi phục đưa dữ liệu và tệp về đúng thời điểm sao lưu, giữ nhật ký kiểm toán và phiên đang dùng', async () => {
  assert.equal((await makeUser('before')).status, 201);
  assert.equal((await call(admin, '/collections/hr_training_courses', 'POST', { record: { key: 'c-before', courseCode: 'KH-1', courseName: 'Trước sao lưu' } })).status, 201);
  mkdirSync(filesDir, { recursive: true });
  writeFileSync(path.join(filesDir, 'kept.txt'), 'bản gốc');
  first = (await call(admin, '/admin/backups', 'POST', { name: 'Bản kiểm thử', type: 'Full System' })).body.backup;
  assert.equal(first.restorable, true);

  // Thay đổi sau khi sao lưu.
  assert.equal((await call(admin, '/collections/hr_training_courses/c-before', 'DELETE')).status, 200);
  assert.equal((await call(admin, '/collections/hr_training_courses', 'POST', { record: { key: 'c-after', courseCode: 'KH-2', courseName: 'Sau sao lưu' } })).status, 201);
  assert.equal((await makeUser('after')).status, 201);
  writeFileSync(path.join(filesDir, 'kept.txt'), 'đã bị sửa');
  writeFileSync(path.join(filesDir, 'extra.txt'), 'tệp mới');
  assert.deepEqual(await courseKeys(), ['c-after']);

  // Sai mã xác nhận thì không đụng tới dữ liệu.
  const refused = await call(admin, `/admin/backups/${first.key}/restore`, 'POST', { confirmation: 'sai-ma' });
  assert.equal(refused.status, 422, JSON.stringify(refused.body));
  assert.deepEqual(await courseKeys(), ['c-after']);
  assert.equal(readFileSync(path.join(filesDir, 'kept.txt'), 'utf8'), 'đã bị sửa');

  // Nhân viên thường không khôi phục được.
  const staff = await login('before@example.test', password);
  assert.equal((await call(staff, `/admin/backups/${first.key}/restore`, 'POST', { confirmation: first.code })).status, 403);

  const restored = await call(admin, `/admin/backups/${first.key}/restore`, 'POST', { confirmation: first.code });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.equal(restored.body.restore.backup, first.code);
  assert.ok(restored.body.restore.restoredFiles >= 1);
  assert.match(restored.body.restore.safetyBackup.code, /^SNAP-/);
  assert.equal(restored.body.integrity.summary.errors, 0, JSON.stringify(restored.body.integrity.checks.filter(check => check.status === 'error')));

  assert.deepEqual(await courseKeys(), ['c-before']);
  const emails = await userEmails();
  assert.ok(emails.includes('before@example.test'));
  assert.ok(!emails.includes('after@example.test'));
  assert.equal(readFileSync(path.join(filesDir, 'kept.txt'), 'utf8'), 'bản gốc');
  assert.equal(existsSync(path.join(filesDir, 'extra.txt')), false);

  // Phiên của quản trị viên vẫn dùng được và nhật ký kiểm toán không bị lùi.
  assert.equal((await call(admin, '/auth/profile')).status, 200);
  const actions = auditActions();
  assert.ok(actions.includes('restore'), 'có dấu vết khôi phục');
  assert.ok(actions.includes('create'), 'nhật ký sinh ra sau thời điểm sao lưu vẫn còn');
});

test('bản sao lưu trước khi khôi phục cho phép quay lại trạng thái trước đó', async () => {
  const list = (await call(admin, '/admin/backups')).body.data;
  const safety = list.find(item => item.name.startsWith('Trước khi khôi phục'));
  assert.ok(safety && safety.restorable);
  const undone = await call(admin, `/admin/backups/${safety.key}/restore`, 'POST', { confirmation: safety.code });
  assert.equal(undone.status, 200, JSON.stringify(undone.body));
  assert.deepEqual(await courseKeys(), ['c-after']);
  assert.ok((await userEmails()).includes('after@example.test'));
  assert.equal(readFileSync(path.join(filesDir, 'kept.txt'), 'utf8'), 'đã bị sửa');
  assert.equal(readFileSync(path.join(filesDir, 'extra.txt'), 'utf8'), 'tệp mới');
});

test('tệp sao lưu bị sửa đổi bị từ chối trước khi đụng tới dữ liệu đang chạy', async () => {
  const created = (await call(admin, '/admin/backups', 'POST', { name: 'Bản sẽ bị sửa', type: 'Database' })).body.backup;
  const archive = path.join(directory, 'backups', `${created.key}.zip`);
  const handle = openSync(archive, 'r+');
  const size = statSync(archive).size;
  const byte = Buffer.alloc(1);
  readSync(handle, byte, 0, 1, Math.floor(size / 2));
  byte[0] ^= 0xff;
  writeSync(handle, byte, 0, 1, Math.floor(size / 2));
  closeSync(handle);
  const before = await courseKeys();
  const refused = await call(admin, `/admin/backups/${created.key}/restore`, 'POST', { confirmation: created.code });
  assert.equal(refused.status, 409, JSON.stringify(refused.body));
  assert.deepEqual(await courseKeys(), before);
});

test('kiểm tra toàn vẹn chỉ báo lỗi thật: phát hiện tệp thiếu và chỉ quản trị viên được xem', async () => {
  const staff = await login('before@example.test', password);
  assert.equal((await call(staff, '/admin/integrity')).status, 403);
  const clean = (await call(admin, '/admin/integrity')).body;
  assert.ok(clean.checks.length >= 8);
  assert.equal(clean.summary.errors, 0, JSON.stringify(clean.checks.filter(check => check.status === 'error')));

  // Tạo nút tệp trỏ tới nội dung không có trên đĩa.
  const db = new DatabaseSync(env.KIYOVN_DB_PATH);
  try {
    const owner = db.prepare('SELECT id FROM users WHERE role = ? LIMIT 1').get('ADMIN');
    const root = db.prepare('SELECT id FROM file_nodes LIMIT 1').get();
    const stamp = new Date().toISOString();
    db.prepare("INSERT INTO file_nodes (id, parent_id, employee_id, owner_id, name, node_type, mime_type, size, storage_key, origin_module, is_hidden, is_system, is_protected, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'file', 'text/plain', 5, ?, 'files', 0, 0, 0, ?, ?)")
      .run('node-missing', root?.id ?? null, owner.id, owner.id, 'mat-tich.txt', 'khong-co-tren-dia.bin', stamp, stamp);
  } finally { db.close(); }
  const broken = (await call(admin, '/admin/integrity')).body;
  const missing = broken.checks.find(check => check.key === 'files_missing');
  assert.equal(missing.status, 'error');
  assert.ok(missing.samples.some(sample => sample.includes('mat-tich.txt')));
  assert.ok(broken.summary.errors >= 1);
});

test('khôi phục bản sao lưu kho tệp chỉ thay tệp, không đụng tới cơ sở dữ liệu', async () => {
  mkdirSync(filesDir, { recursive: true });
  writeFileSync(path.join(filesDir, 'doc.txt'), 'bản trong sao lưu');
  const blob = (await call(admin, '/admin/backups', 'POST', { name: 'Chỉ kho tệp', type: 'Storage Blob' })).body.backup;
  assert.equal(blob.restorable, true);

  writeFileSync(path.join(filesDir, 'doc.txt'), 'đã bị sửa');
  writeFileSync(path.join(filesDir, 'later.txt'), 'tệp thêm sau');
  assert.equal((await call(admin, '/collections/hr_training_courses', 'POST', { record: { key: 'c-blob', courseCode: 'KH-9', courseName: 'Tạo sau sao lưu kho tệp' } })).status, 201);

  const restored = await call(admin, `/admin/backups/${blob.key}/restore`, 'POST', { confirmation: blob.code });
  assert.equal(restored.status, 200, JSON.stringify(restored.body));
  assert.equal(readFileSync(path.join(filesDir, 'doc.txt'), 'utf8'), 'bản trong sao lưu');
  assert.equal(existsSync(path.join(filesDir, 'later.txt')), false);
  assert.ok((await courseKeys()).includes('c-blob'), 'cơ sở dữ liệu giữ nguyên');
  assert.deepEqual(restored.body.restore.restoredTables, {}, 'không khôi phục bảng nào');
});
