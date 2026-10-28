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
migrationFixture.prepare('INSERT INTO collection_records VALUES (?, ?, ?, ?, ?, ?, ?)').run('legacy-license-fixture', 'asset_licenses', 'legacy-license', fixtureActor.id, JSON.stringify({ key: 'legacy-license', licenseCode: 'LEGACY-LIC', softwareName: 'Bản cũ', productKey: 'OLD-SECRET-123', seatsTotal: 2, seatsAllocated: 0, annualCost: 0, expireDate: '2028-01-01', allocatedUsers: [] }), new Date().toISOString(), new Date().toISOString());
migrationFixture.prepare('INSERT INTO collection_records VALUES (?, ?, ?, ?, ?, ?, ?)').run('legacy-ledger-collision', 'finance_general_ledger', 'payroll:11-2030:2', fixtureActor.id, JSON.stringify({ key: 'payroll:11-2030:2', sourceModule: 'legacy', amount: 100 }), new Date().toISOString(), new Date().toISOString());
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

test('asset allocations and returns keep inventory and tickets atomic', async () => {
  await request('/users', 'POST', { email: 'asset-allocation-user@example.test', name: 'Nhân viên cấp phát', password: 'Asset-Allocation-26!Secure', employeeCode: 'ALLOCATION-USER', role: 'USER', department: 'Công nghệ', position: 'Kỹ sư' }, 201);
  const employees = await request('/employees');
  const employee = employees.data.find((item) => item.employeeCode === 'ALLOCATION-USER');
  assert.ok(employee);
  const asset = { key: 'allocation-asset-test', code: 'TS-ALLOCATION-API', name: 'Máy cấp phát', status: 'Trong kho', location: 'Kho A', department: 'IT', assignedTo: '', originalPrice: 1000, history: [] };
  await request('/collections/asset_items', 'POST', { record: asset }, 201);
  await request('/collections/asset_items', 'POST', { record: { ...asset, key: 'allocation-asset-date-test', code: 'TS-ALLOCATION-DATE', name: 'Máy kiểm tra ngày' } }, 201);
  const input = { ticketCode: 'CP-API-01', type: 'Cấp phát', assetCode: asset.code, employeeCode: employee.employeeCode, department: 'Giả mạo', position: 'Giả mạo', handoverPerson: 'Thủ kho', allocatedDate: '2030-01-01', expectedReturnDate: 'Vô thời hạn', purpose: 'Cấp phát chính thức cho nhân viên mới', condition: 'Tốt', accessories: 'Sạc', compensationAmount: 0, notes: 'Đủ phụ kiện', status: 'Đã bàn giao hoàn tất', signedByAccount: 'Giả mạo' };
  const created = (await request('/assets/allocations', 'POST', input, 201)).record;
  assert.equal(created.status, 'Chờ nhân viên ký xác nhận');
  assert.equal(created.signedByReceiver, false);
  assert.equal(created.employeeName, employee.name);
  assert.equal(created.department, 'Công nghệ');
  assert.equal(created.createdById, session.user.id);
  assert.equal((await request(`/collections/asset_items/${asset.key}`)).record.status, 'Trong kho');
  await request('/assets/allocations', 'POST', { ...input, ticketCode: 'CP-API-02' }, 409);
  await request('/assets/allocations', 'POST', { ...input, ticketCode: 'CP-API-03', assetCode: 'TS-ALLOCATION-DATE', expectedReturnDate: 'hôm sau' }, 422);
  await request('/collections/asset_allocations', 'PUT', { records: [] }, 409);
  await request(`/collections/asset_allocations/${created.key}`, 'PATCH', { patch: { status: 'Đã bàn giao hoàn tất' } }, 409);
  await request(`/assets/allocations/${created.key}/confirm`, 'POST', { receiverName: 'Người khác' }, 422);

  let fixture = new DatabaseSync(env.KIYOVN_DB_PATH);
  fixture.exec(`CREATE TRIGGER fail_allocation_update BEFORE UPDATE ON collection_records WHEN NEW.scope = 'asset_allocations' AND NEW.record_key = '${created.key}' BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
  await request(`/assets/allocations/${created.key}/confirm`, 'POST', { receiverName: created.employeeName }, 500);
  fixture.exec('DROP TRIGGER fail_allocation_update');
  fixture.close();
  assert.equal((await request(`/collections/asset_items/${asset.key}`)).record.status, 'Trong kho');
  assert.equal((await request(`/collections/asset_allocations/${created.key}`)).record.status, 'Chờ nhân viên ký xác nhận');

  const confirmations = await Promise.all([1, 2].map(async () => {
    const response = await fetch(`${base}/assets/allocations/${created.key}/confirm`, { method: 'POST', headers, body: JSON.stringify({ receiverName: created.employeeName, signedByAccount: 'Giả mạo' }) });
    return { status: response.status, body: await response.json() };
  }));
  assert.deepEqual(confirmations.map((item) => item.status).sort((a, b) => a - b), [200, 409]);
  const allocated = (await request(`/collections/asset_allocations/${created.key}`)).record;
  const allocatedAsset = (await request(`/collections/asset_items/${asset.key}`)).record;
  assert.equal(allocated.status, 'Đã bàn giao hoàn tất');
  assert.equal(allocated.signedByAccountId, session.user.id);
  assert.equal(allocatedAsset.status, 'Đang sử dụng');
  assert.equal(allocatedAsset.assignedTo, created.employeeName);
  assert.equal(allocatedAsset.history.filter((item) => item.action === 'Cấp phát tài sản').length, 1);

  const returnInput = { ...input, ticketCode: 'TH-API-01', type: 'Thu hồi', expectedReturnDate: '', purpose: 'Thu hồi định kỳ nâng cấp' };
  fixture = new DatabaseSync(env.KIYOVN_DB_PATH);
  fixture.exec("CREATE TRIGGER fail_allocation_insert BEFORE INSERT ON collection_records WHEN NEW.scope = 'asset_allocations' AND NEW.record_key != 'allocation-asset-test' BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
  await request('/assets/allocations', 'POST', returnInput, 500);
  fixture.exec('DROP TRIGGER fail_allocation_insert');
  fixture.close();
  assert.equal((await request(`/collections/asset_items/${asset.key}`)).record.status, 'Đang sử dụng');
  const returned = (await request('/assets/allocations', 'POST', returnInput, 201)).record;
  assert.equal(returned.status, 'Đã thu hồi về kho');
  assert.equal(returned.receivedByAccountId, session.user.id);
  const returnedAsset = (await request(`/collections/asset_items/${asset.key}`)).record;
  assert.equal(returnedAsset.status, 'Trong kho');
  assert.equal(returnedAsset.assignedTo, '');
  assert.equal(returnedAsset.history.filter((item) => item.action === 'Thu hồi tài sản').length, 1);

  const userLogin = await request('/auth/login', 'POST', { email: 'asset-allocation-user@example.test', password: 'Asset-Allocation-26!Secure' });
  const userHeaders = { ...headers, Authorization: `Bearer ${userLogin.access_token || userLogin.token}` };
  await request('/collections/asset_allocations', 'GET', undefined, 403, userHeaders);
  await request('/assets/allocations', 'POST', input, 403, userHeaders);
});

test('asset repair decisions update inventory and repair history atomically', async () => {
  const asset = { key: 'repair-asset-test', code: 'TS-REPAIR-API', name: 'Máy cần sửa', status: 'Đang sử dụng', location: 'Phòng máy', department: 'Công nghệ', assignedTo: 'Nhân viên A', history: [] };
  await request('/collections/asset_items', 'POST', { record: asset }, 201);
  const validationAsset = { ...asset, key: 'repair-validation-asset', code: 'TS-REPAIR-VALIDATION', name: 'Máy kiểm tra dữ liệu', assignedTo: '' };
  await request('/collections/asset_items', 'POST', { record: validationAsset }, 201);
  const input = {
    repairCode: 'SC-API-01', assetCode: asset.code, assetName: 'Giả mạo', serialNo: 'Giả mạo', requester: 'Nhân viên A', department: 'Công nghệ',
    severity: 'Cao (P2)', repairUnit: 'Trung tâm bảo hành chính hãng', vendor: 'Trung tâm sửa chữa', vendorContact: '0900000000',
    issueDescription: 'Máy không khởi động', rootCause: 'Chưa xác định', solution: 'Kiểm tra bo mạch', replacedParts: '',
    estimatedCost: 2500000, actualCost: 999999, costBearing: 'Công ty chi trả', startDate: '2030-01-01', expectedEndDate: '2030-01-04',
    warrantyAfterRepair: '90 ngày', status: 'Đã sửa xong & Bàn giao', approver: 'Giả mạo',
  };
  const created = (await request('/assets/repairs', 'POST', input, 201)).record;
  assert.equal(created.status, 'Chờ duyệt báo giá');
  assert.equal(created.assetName, asset.name);
  assert.equal(created.serialNo, '');
  assert.equal(created.actualCost, 0);
  assert.equal(created.createdById, session.user.id);
  assert.equal((await request(`/collections/asset_items/${asset.key}`)).record.status, 'Đang sửa chữa');
  await request('/assets/repairs', 'POST', { ...input, repairCode: 'SC-API-02' }, 409);
  await request('/assets/repairs', 'POST', { ...input, repairCode: 'SC-API-DATE', assetCode: validationAsset.code, expectedEndDate: 'bad' }, 422);
  await request('/assets/repairs', 'POST', { ...input, repairCode: 'SC-API-FRACTION', assetCode: validationAsset.code, estimatedCost: 1.5 }, 422);
  await request('/collections/asset_repairs', 'PUT', { records: [] }, 409);
  await request(`/collections/asset_repairs/${created.key}`, 'PATCH', { patch: { status: 'Đã sửa xong & Bàn giao' } }, 409);

  const approvalRace = await Promise.all([1, 2].map(async () => {
    const response = await fetch(`${base}/assets/repairs/${created.key}/approve`, { method: 'POST', headers, body: JSON.stringify({ approver: 'Giả mạo' }) });
    return response.status;
  }));
  assert.deepEqual(approvalRace.sort((a, b) => a - b), [200, 409]);
  let repair = (await request(`/collections/asset_repairs/${created.key}`)).record;
  assert.equal(repair.approver, session.user.name);
  assert.equal(repair.approverId, session.user.id);
  assert.equal(repair.status, 'Đang sửa chữa tại hãng');

  repair = (await request(`/assets/repairs/${created.key}/transition`, 'POST', { status: 'Chờ linh kiện thay thế' })).record;
  assert.equal(repair.status, 'Chờ linh kiện thay thế');
  assert.equal((await request(`/collections/asset_items/${asset.key}`)).record.history.filter(item => item.action === 'Chờ linh kiện thay thế').length, 1);
  repair = (await request(`/assets/repairs/${created.key}/transition`, 'POST', { status: 'Đang sửa chữa tại hãng' })).record;
  assert.equal(repair.status, 'Đang sửa chữa tại hãng');

  let fixture = new DatabaseSync(env.KIYOVN_DB_PATH);
  fixture.exec(`CREATE TRIGGER fail_repair_update BEFORE UPDATE ON collection_records WHEN NEW.scope = 'asset_repairs' AND NEW.record_key = '${created.key}' BEGIN SELECT RAISE(ABORT, 'injected failure'); END`);
  await request(`/assets/repairs/${created.key}/complete`, 'POST', { actualCost: 0, completionNotes: 'Nghiệm thu đạt' }, 500);
  fixture.exec('DROP TRIGGER fail_repair_update');
  fixture.close();
  assert.equal((await request(`/collections/asset_items/${asset.key}`)).record.status, 'Đang sửa chữa');
  assert.equal((await request(`/collections/asset_repairs/${created.key}`)).record.status, 'Đang sửa chữa tại hãng');

  repair = (await request(`/assets/repairs/${created.key}/complete`, 'POST', { actualCost: 0, completionNotes: 'Nghiệm thu đạt' })).record;
  assert.equal(repair.status, 'Đã sửa xong & Bàn giao');
  assert.equal(repair.actualCost, 0);
  assert.equal(repair.completedById, session.user.id);
  const restored = (await request(`/collections/asset_items/${asset.key}`)).record;
  assert.equal(restored.status, 'Đang sử dụng');
  assert.equal(restored.assignedTo, asset.assignedTo);
  assert.equal(restored.history.filter(item => item.action === 'Hoàn tất sửa chữa').length, 1);

  await request('/users', 'POST', { email: 'asset-repair-user@example.test', name: 'Người dùng sửa chữa', password: 'Asset-Repair-26!Secure', employeeCode: 'REPAIR-USER', role: 'USER' }, 201);
  const userLogin = await request('/auth/login', 'POST', { email: 'asset-repair-user@example.test', password: 'Asset-Repair-26!Secure' });
  const userHeaders = { ...headers, Authorization: `Bearer ${userLogin.access_token || userLogin.token}` };
  await request('/collections/asset_repairs', 'GET', undefined, 403, userHeaders);
  await request('/assets/repairs', 'POST', input, 403, userHeaders);
  await request(`/assets/repairs/${created.key}/approve`, 'POST', {}, 403, userHeaders);

  const unrepairableAsset = { ...asset, key: 'repair-unrepairable-asset', code: 'TS-REPAIR-UNREPAIRABLE', status: 'Trong kho', assignedTo: '' };
  await request('/collections/asset_items', 'POST', { record: unrepairableAsset }, 201);
  const unrepairable = (await request('/assets/repairs', 'POST', {
    ...input, repairCode: 'SC-API-UNREPAIRABLE', assetCode: unrepairableAsset.code, requester: 'Thủ kho',
  }, 201)).record;
  await request(`/assets/repairs/${unrepairable.key}/approve`, 'POST', {});
  const rejected = (await request(`/assets/repairs/${unrepairable.key}/transition`, 'POST', { status: 'Không thể sửa chữa', note: 'Thiếu linh kiện' })).record;
  assert.equal(rejected.status, 'Không thể sửa chữa');
  assert.equal((await request(`/collections/asset_items/${unrepairableAsset.key}`)).record.status, 'Chờ thanh lý');
  await request(`/assets/repairs/${unrepairable.key}/complete`, 'POST', { actualCost: 1, completionNotes: 'Không được nghiệm thu' }, 409);
});

test('asset transfers enforce decisions and receive asset and document atomically', async () => {
  const asset = { key: 'transfer-asset-test', code: 'TS-TRANSFER-API', name: 'Máy kiểm thử', status: 'Đang sử dụng', location: 'Kho A', department: 'IT', assignedTo: 'Người A', originalPrice: 1000, netBookValue: 700, history: [] };
  await request('/collections/asset_items', 'POST', { record: asset }, 201);
  const input = { transferCode: 'DC-API-01', assetCode: asset.code, fromLocation: 'Giả mạo', fromDepartment: 'Giả mạo', fromCustodian: 'Giả mạo', toLocation: 'Kho B', toDepartment: 'Kinh doanh', toCustodian: 'Người B', carrierName: 'Vận chuyển', trackingCode: 'VĐ-01', shippingCost: 0, transferDate: '2030-01-01', expectedDeliveryDate: '2030-01-02', reason: 'Điều chuyển', status: 'Đã điều chuyển hoàn tất', approver: 'Giả mạo' };
  const created = (await request('/assets/transfers', 'POST', input, 201)).transfer;
  assert.equal(created.status, 'Chờ phê duyệt');
  assert.equal(created.fromLocation, 'Kho A');
  assert.equal(created.createdById, session.user.id);
  await request('/assets/transfers', 'POST', { ...input, transferCode: 'DC-API-02' }, 409);
  await request('/assets/transfers', 'POST', { ...input, transferCode: 'DC-API-INVALID', assetCode: 'MISSING' }, 409);
  await request('/collections/asset_transfers', 'PUT', { records: [] }, 409);
  await request(`/collections/asset_transfers/${created.key}`, 'PATCH', { patch: { status: 'Đã điều chuyển hoàn tất' } }, 409);
  await request(`/assets/transfers/${created.key}/receive`, 'POST', { receiveCondition: 'Tốt' }, 409);
  const approved = (await request(`/assets/transfers/${created.key}/approve`, 'POST', { approver: 'Giả mạo' })).transfer;
  assert.equal(approved.approver, session.user.name);
  await request(`/assets/transfers/${created.key}/reject`, 'POST', {}, 409);
  await request(`/assets/transfers/${created.key}/receive`, 'POST', { receiveCondition: '' }, 422);
  await request(`/collections/asset_items/${asset.key}`, 'PATCH', { patch: { location: 'Kho khác' } });
  await request(`/assets/transfers/${created.key}/receive`, 'POST', { receiveCondition: 'Tốt' }, 409);
  assert.equal((await request(`/collections/asset_transfers/${created.key}`)).record.status, 'Đang vận chuyển');
  await request(`/collections/asset_items/${asset.key}`, 'PATCH', { patch: { location: 'Kho A' } });
  const fixture = new DatabaseSync(env.KIYOVN_DB_PATH);
  fixture.exec("CREATE TRIGGER fail_transfer_update BEFORE UPDATE ON collection_records WHEN NEW.scope = 'asset_transfers' BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
  await request(`/assets/transfers/${created.key}/receive`, 'POST', { receiveCondition: 'Tốt' }, 500);
  fixture.exec('DROP TRIGGER fail_transfer_update');
  fixture.close();
  assert.equal((await request(`/collections/asset_items/${asset.key}`)).record.location, 'Kho A');
  const race = await Promise.all([1, 2].map(async () => {
    const response = await fetch(`${base}/assets/transfers/${created.key}/receive`, { method: 'POST', headers, body: JSON.stringify({ receiveCondition: 'Tốt', receivedBy: 'Giả mạo' }) });
    return response.status;
  }));
  assert.deepEqual(race.sort((a, b) => a - b), [200, 409]);
  const received = (await request(`/collections/asset_transfers/${created.key}`)).record;
  const finalAsset = (await request(`/collections/asset_items/${asset.key}`)).record;
  assert.equal(received.status, 'Đã điều chuyển hoàn tất');
  assert.equal(received.receivedById, session.user.id);
  assert.equal(finalAsset.location, 'Kho B');
  assert.equal(finalAsset.department, 'Kinh doanh');
  assert.equal(finalAsset.assignedTo, 'Người B');
  assert.equal(finalAsset.history.filter((item) => item.action === 'Điều chuyển tài sản').length, 1);
  assert.equal(finalAsset.history.at(-1).actorId, session.user.id);
  await request('/assets/transfers', 'POST', input, 409);
  await request('/users', 'POST', { email: 'asset-transfer-user@example.test', name: 'Người thử', password: 'Asset-Transfer-26!Secure', employeeCode: 'TRANSFER-USER', role: 'USER' }, 201);
  const user = await request('/auth/login', 'POST', { email: 'asset-transfer-user@example.test', password: 'Asset-Transfer-26!Secure' });
  const userHeaders = { ...headers, Authorization: `Bearer ${user.access_token || user.token}` };
  await request('/collections/asset_transfers', 'GET', undefined, 403, userHeaders);
  await request('/assets/transfers', 'POST', input, 403, userHeaders);
});

test('payroll ledger posts reviewed figures atomically and prevents duplicate or forged entries', async () => {
  const record = { key: 'payroll-ledger-test-1', employeeCode: 'P-ONE', employeeName: 'Nhân viên', month: '2030-10', status: 'Đã chi trả', baseSalary: 1000, allowance: 100, bonus: 0, insuranceDeduction: 100, taxDeduction: 50, netSalary: 950 };
  await request('/collections/payroll', 'POST', { record }, 201);
  const input = { period: '10/2030', employerInsurance: 200 };
  const preview = await request('/finance/payroll/ledger-preview', 'POST', input);
  assert.deepEqual(preview.lines.map((line) => line.amount), [1100, 200, 100, 50, 950]);
  await request('/collections/payroll/payroll-ledger-test-1', 'PATCH', { patch: { allowance: 200, netSalary: 1050 } });
  await request('/finance/payroll/ledger-post', 'POST', { ...input, fingerprint: preview.fingerprint }, 409);
  const updatedPreview = await request('/finance/payroll/ledger-preview', 'POST', input);
  const race = await Promise.all([1, 2].map(async () => {
    const response = await fetch(`${base}/finance/payroll/ledger-post`, { method: 'POST', headers, body: JSON.stringify({ ...input, fingerprint: updatedPreview.fingerprint }) });
    return { status: response.status, body: await response.json() };
  }));
  assert.deepEqual(race.map((item) => item.status).sort((a, b) => a - b), [201, 409]);
  const ledger = (await request('/collections/finance_general_ledger')).data.filter((item) => item.sourceReference === 'payroll:10/2030');
  assert.equal(ledger.length, 5);
  const snapshot = (await request('/collections/finance_payroll_postings/10%2F2030')).record;
  assert.equal(snapshot.records[0].netSalary, 1050);
  assert.equal(snapshot.createdById, session.user.id);
  await request('/collections/finance_payroll_postings', 'PUT', { records: [] }, 409);
  assert.equal(ledger[0].author, session.user.name);
  await request(`/collections/finance_general_ledger/${encodeURIComponent(ledger[0].key)}`, 'PATCH', { patch: { amount: 999 } }, 409);
  await request(`/collections/finance_general_ledger/${encodeURIComponent(ledger[0].key)}`, 'DELETE', undefined, 409);
  await request('/collections/finance_general_ledger', 'PUT', { records: [] }, 409);
  await request('/collections/finance_general_ledger', 'POST', { record: { key: 'forged-payroll', sourceModule: 'payroll', sourceReference: 'payroll:10/2030' } }, 409);
  await request('/finance/payroll/ledger-preview', 'POST', { period: '13/2030', employerInsurance: 0 }, 422);
  await request('/finance/payroll/ledger-preview', 'POST', { period: '10/2031', employerInsurance: 0 }, 422);
  await request('/collections/payroll', 'POST', { record: { ...record, key: 'payroll-ledger-test-bad', month: '11/2030' } }, 201);
  const collision = await request('/finance/payroll/ledger-preview', 'POST', { period: '11/2030', employerInsurance: 200 });
  await request('/finance/payroll/ledger-post', 'POST', { period: '11/2030', employerInsurance: 200, fingerprint: collision.fingerprint }, 409);
  assert.equal((await request('/collections/finance_general_ledger')).data.filter((item) => item.sourceReference === 'payroll:11/2030').length, 0);
  await request('/users', 'POST', { email: 'payroll-ledger-user@example.test', name: 'Người thử', password: 'Payroll-Ledger-26!Secure', employeeCode: 'PAYROLL-TEST', role: 'USER' }, 201);
  const user = await request('/auth/login', 'POST', { email: 'payroll-ledger-user@example.test', password: 'Payroll-Ledger-26!Secure' });
  await request('/finance/payroll/ledger-preview', 'POST', input, 403, { ...headers, Authorization: `Bearer ${user.access_token || user.token}` });
});

test('payroll ledger adjustments preserve prior snapshots and post only reviewed differences', async () => {
  const record = { key: 'adjust-payroll-1', employeeCode: 'ADJ-ONE', employeeName: 'Điều chỉnh', month: '2032-01', status: 'Đã chi trả', baseSalary: 1000, allowance: 100, bonus: 0, insuranceDeduction: 100, taxDeduction: 50, netSalary: 950 };
  await request('/collections/payroll', 'POST', { record }, 201);
  const input = { period: '01/2032', employerInsurance: 200 };
  const initial = await request('/finance/payroll/ledger-preview', 'POST', input);
  await request('/finance/payroll/ledger-post', 'POST', { ...input, fingerprint: initial.fingerprint }, 201);
  await request('/finance/payroll/adjustment-preview', 'POST', input, 422);
  await request('/collections/payroll/adjust-payroll-1', 'PATCH', { patch: { status: 'Chưa chi trả', allowance: 0, netSalary: 850 } });
  const stale = await request('/finance/payroll/adjustment-preview', 'POST', input);
  assert.deepEqual(stale.lines.map((item) => [item.debitAccount, item.creditAccount, item.amount]), [['TK 334', 'TK 642', 100], ['TK 112', 'TK 334', 950]]);
  await request('/collections/payroll/adjust-payroll-1', 'PATCH', { patch: { bonus: 10, netSalary: 860 } });
  await request('/finance/payroll/adjustment-post', 'POST', { ...input, fingerprint: stale.fingerprint }, 409);
  const current = await request('/finance/payroll/adjustment-preview', 'POST', input);
  const race = await Promise.all([1, 2].map(async () => {
    const response = await fetch(`${base}/finance/payroll/adjustment-post`, { method: 'POST', headers, body: JSON.stringify({ ...input, fingerprint: current.fingerprint }) });
    return response.status;
  }));
  assert.deepEqual(race.sort((a, b) => a - b), [201, 422]);
  const snapshots = (await request('/collections/finance_payroll_adjustments')).data.filter((entry) => entry.period === input.period);
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].records[0].netSalary, 860);
  assert.equal((await request('/collections/finance_payroll_postings/01%2F2032')).record.records[0].netSalary, 950);
  await request(`/collections/finance_payroll_adjustments/${snapshots[0].key}`, 'DELETE', undefined, 409);
  await request('/collections/payroll/adjust-payroll-1', 'PATCH', { patch: { status: 'Đã chi trả' } });
  const next = await request('/finance/payroll/adjustment-preview', 'POST', input);
  assert.equal(next.sequence, 2);
  assert.deepEqual(next.lines.map((line) => [line.debitAccount, line.creditAccount, line.amount]), [['TK 334', 'TK 112', 860]]);
  await request('/finance/payroll/adjustment-post', 'POST', { ...input, fingerprint: next.fingerprint }, 201);
  await request('/collections/payroll/adjust-payroll-1', 'DELETE');
  assert.ok((await request('/finance/payroll/posted-periods')).periods.includes(input.period));
  await request('/finance/payroll/adjustment-preview', 'POST', input, 422);
  const emptyInput = { period: input.period, employerInsurance: 0 };
  const removed = await request('/finance/payroll/adjustment-preview', 'POST', emptyInput);
  assert.equal(removed.employeeCount, 0);
  assert.equal(removed.lines.length, 5);
  await request('/finance/payroll/adjustment-post', 'POST', { ...emptyInput, fingerprint: removed.fingerprint }, 201);
  await request('/finance/payroll/adjustment-preview', 'POST', emptyInput, 422);
  await request('/finance/payroll/adjustment-preview', 'POST', { period: '12/2031', employerInsurance: 0 }, 409);
  const user = await request('/auth/login', 'POST', { email: 'payroll-ledger-user@example.test', password: 'Payroll-Ledger-26!Secure' });
  await request('/finance/payroll/adjustment-preview', 'POST', input, 403, { ...headers, Authorization: `Bearer ${user.access_token || user.token}` });
});

test('software licenses persist protected keys and serialize seat allocation and renewal', async () => {
  assert.equal((await request('/assets/licenses')).data.find((item) => item.key === 'legacy-license').productKey, 'OLD-SECRET-123');
  assert.equal((await request('/assets/licenses/legacy-license/allocate', 'POST', { name: 'Người cũ', email: 'legacy@example.test', deviceCode: '' })).record.productKey, 'OLD-SECRET-123');
  const input = { licenseCode: 'LIC-TEST-ONE', softwareName: 'Ứng dụng thử', vendor: 'Hãng thử', category: 'Văn phòng & Cộng tác', licenseType: 'Theo người dùng', productKey: 'TEST-SECRET-123', seatsTotal: 2, seatsAllocated: 1, annualCost: 0, billingCycle: 'Hàng năm', purchaseDate: '2026-01-01', expireDate: '2027-01-01', assignedDepartment: 'IT', assignedAdmin: 'Quản trị', notes: '' };
  const created = (await request('/assets/licenses', 'POST', input, 201)).record;
  assert.equal(created.productKey, input.productKey);
  assert.equal(created.annualCost, 0);
  await request('/assets/licenses', 'POST', { ...input, licenseCode: 'lic-test-one' }, 409);
  await request('/assets/licenses', 'POST', { ...input, licenseCode: 'INVALID', seatsAllocated: 3 }, 422);
  await request('/assets/licenses', 'POST', { ...input, licenseCode: 'INVALID-DATE', expireDate: '2025-01-01' }, 422);
  await request('/collections/asset_licenses', 'GET', undefined, 409);
  await request('/collections/asset_licenses', 'PUT', { records: [] }, 409);
  const attempts = await Promise.all(['one@example.test', 'two@example.test'].map(async (email) => {
    const response = await fetch(`${base}/assets/licenses/${created.key}/allocate`, { method: 'POST', headers, body: JSON.stringify({ name: 'Người thử', email, deviceCode: '' }) });
    return { status: response.status, body: await response.json() };
  }));
  assert.deepEqual(attempts.map((item) => item.status).sort((a, b) => a - b), [200, 409]);
  const saved = attempts.find((item) => item.status === 200).body.record;
  assert.equal(saved.seatsAllocated, 2);
  assert.equal(saved.allocatedUsers[0].deviceCode, '');
  await request(`/assets/licenses/${created.key}/renew`, 'POST', { expireDate: '2026-12-31', annualCost: 0 }, 422);
  const renewed = (await request(`/assets/licenses/${created.key}/renew`, 'POST', { expireDate: '2028-01-01', annualCost: 0 })).record;
  assert.equal(renewed.renewals[0].previousExpireDate, '2027-01-01');
  assert.equal(renewed.expireDate, '2028-01-01');
  assert.equal((await request('/assets/licenses')).data.find((item) => item.key === created.key).productKey, input.productKey);
  const stored = new DatabaseSync(env.KIYOVN_DB_PATH, { readOnly: true });
  const persisted = stored.prepare('SELECT payload_json FROM collection_records WHERE scope = ? AND record_key = ?').get('asset_licenses', created.key).payload_json;
  stored.close();
  assert.ok(!persisted.includes(input.productKey));
  assert.match(JSON.parse(persisted).productKey, /^ENC:/);
  await request('/users', 'POST', { email: 'license-user@example.test', name: 'Người thử', password: 'License-Test-26!Secure', employeeCode: 'LICENSE-TEST', role: 'USER' }, 201);
  const loginUser = await request('/auth/login', 'POST', { email: 'license-user@example.test', password: 'License-Test-26!Secure' });
  const userHeaders = { ...headers, Authorization: `Bearer ${loginUser.access_token || loginUser.token}` };
  await request('/assets/licenses', 'GET', undefined, 403, userHeaders);
  await request('/collections/asset_licenses', 'GET', undefined, 403, userHeaders);
  await request(`/assets/licenses/${created.key}/allocate`, 'POST', { name: 'Test', email: 'x@example.test' }, 403, userHeaders);
});

test('anonymous access is rejected', async () => {
  assert.equal((await fetch(`${base}/collections/finance_budgets`)).status, 401);
});

test('loyalty ledger prevents duplicate points, overspending and unauthorized changes', async () => {
  const customer = (await request('/crm/contacts', 'POST', { name: 'Khách hàng kiểm thử điểm', type: 'customer' }, 201)).contact;
  const earn = { requestId: 'loyalty-earn-1', type: 'earn', customerId: customer.key, points: 100, reference: 'SALE-POINTS-1', note: '', createdBy: 'Giả mạo', delta: 5000 };
  const saved = await request('/crm/loyalty/entries', 'POST', earn, 201);
  assert.equal(saved.balance, 100);
  assert.equal(saved.entry.delta, 100);
  assert.equal(saved.entry.createdById, session.user.id);
  assert.equal((await request('/crm/loyalty/entries', 'POST', earn)).replayed, true);
  await request('/crm/loyalty/entries', 'POST', { ...earn, points: 101 }, 409);
  await request('/crm/loyalty/entries', 'POST', { ...earn, requestId: 'loyalty-earn-duplicate', reference: 'sale-points-1' }, 409);
  await request('/crm/loyalty/entries', 'POST', { ...earn, requestId: 'loyalty-invalid', points: -1 }, 422);
  await request('/crm/loyalty/entries', 'POST', { ...earn, requestId: 'loyalty-missing-customer', customerId: 'missing' }, 422);
  await request('/collections/crm_loyalty_ledger', 'POST', { record: { key: 'forged', delta: 9999 } }, 409);
  await request('/collections/crm_loyalty_ledger', 'PUT', { records: [] }, 409);
  await request('/collections/crm_loyalty_ledger/loyalty-earn-1', 'PATCH', { patch: { delta: 9999 } }, 409);
  await request('/collections/crm_loyalty_ledger/loyalty-earn-1', 'DELETE', undefined, 409);

  const attempts = await Promise.all(['loyalty-redeem-a', 'loyalty-redeem-b'].map(async (requestId) => {
    const response = await fetch(`${base}/crm/loyalty/entries`, {
      method: 'POST', headers, body: JSON.stringify({ requestId, type: 'redeem', customerId: customer.key, points: 70, reference: requestId, rewardName: 'Quà tặng', note: '' }),
    });
    return { status: response.status, body: await response.json() };
  }));
  assert.deepEqual(attempts.map((item) => item.status).sort((a, b) => a - b), [201, 422]);
  const redemption = attempts.find((item) => item.status === 201).body.entry;
  await request(`/crm/loyalty/entries/${redemption.key}/fulfill`, 'POST', { reference: '' }, 422);
  const fulfilled = (await request(`/crm/loyalty/entries/${redemption.key}/fulfill`, 'POST', { reference: 'PHIEU-TRA-QUA-1' })).entry;
  assert.equal(fulfilled.status, 'Đã trao');
  assert.equal(fulfilled.handledById, session.user.id);
  await request(`/crm/loyalty/entries/${redemption.key}/cancel`, 'POST', { reason: 'Đã trao' }, 409);
  await request('/crm/loyalty/entries/loyalty-earn-1/cancel', 'POST', { reason: 'Điểm đã dùng' }, 422);

  const pending = (await request('/crm/loyalty/entries', 'POST', { requestId: 'loyalty-redeem-c', type: 'redeem', customerId: customer.key, points: 20, reference: 'REDEEM-2', rewardName: 'Quà thứ hai' }, 201)).entry;
  assert.equal((await request(`/crm/loyalty/entries/${pending.key}/cancel`, 'POST', { reason: 'Khách hàng đổi ý' })).balance, 30);
  await request(`/crm/loyalty/entries/${pending.key}/cancel`, 'POST', { reason: 'Hủy lặp' }, 409);
  await request('/crm/loyalty/entries', 'POST', { ...earn, requestId: 'loyalty-earn-2', points: 10, reference: 'SALE-POINTS-2' }, 201);
  assert.equal((await request('/crm/loyalty/entries/loyalty-earn-2/cancel', 'POST', { reason: 'Ghi nhận nhầm' })).balance, 30);
  const ledger = await request('/crm/loyalty');
  assert.equal(ledger.customers.find((item) => item.key === customer.key).balance, 30);
  assert.equal(ledger.entries.filter((item) => item.customerId === customer.key && ['refund', 'reversal'].includes(item.type)).length, 2);

  await request('/users', 'POST', { email: 'loyalty-user@example.test', name: 'Nhân viên điểm', password: 'Loyalty-Test-26!Secure', employeeCode: 'LOYALTY-USER', role: 'USER' }, 201);
  const userSession = await request('/auth/login', 'POST', { email: 'loyalty-user@example.test', password: 'Loyalty-Test-26!Secure' });
  const userHeaders = { ...headers, Authorization: `Bearer ${userSession.access_token || userSession.token}` };
  await request('/crm/loyalty', 'GET', undefined, 403, userHeaders);
  await request('/crm/loyalty/entries', 'POST', earn, 403, userHeaders);
});

test('CRM promotion campaigns validate their rules and keep server-owned history', async () => {
  const customer = (await request('/crm/contacts', 'POST', { name: 'Khách hàng kiểm thử khuyến mại', type: 'customer' }, 201)).contact;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const campaign = (overrides = {}) => ({
    key: 'crm-promo-api-1', code: 'KM-API-01', name: 'Chương trình API', startDate: today, endDate: '2099-12-31',
    promotionType: 'Chiết khấu', target: 'Khách hàng thành viên', enabled: true, allowConcurrent: false,
    eligibleItemCodes: ['SKU-1'], amountBasis: 'Thành tiền trước thuế', orgUnitKeys: [], employeeIds: [],
    applyOnce: true, combinablePromotionKeys: [], taxCondition: 'Bất kỳ', minimumSubtotal: 100_000,
    unitPrice: 0, unit: 'đơn hàng', customerKeys: [customer.key], discountKind: 'Phần trăm', discountValue: 10,
    owner: 'Người giả mạo', ownerId: 'spoofed-user', createdBy: 'Người giả mạo', status: 'Đã kết thúc', ...overrides,
  });
  const saved = (await request('/collections/crm_promotions', 'POST', { record: campaign() }, 201)).record;
  assert.equal(saved.owner, session.user.name);
  assert.equal(saved.ownerId, session.user.id);
  assert.equal(saved.createdById, session.user.id);
  assert.equal(saved.status, 'Đang hoạt động');
  assert.equal(saved.customerKeys[0], customer.key);
  assert.equal(saved.history.length, 1);
  await request('/collections/crm_promotions', 'POST', { record: campaign({ key: 'crm-promo-api-duplicate', code: 'km-api-01' }) }, 409);
  await request('/collections/crm_promotions', 'POST', { record: campaign({ key: 'crm-promo-api-bad-dates', code: 'KM-API-02', endDate: '2026-01-01' }) }, 422);
  await request('/collections/crm_promotions', 'POST', { record: campaign({ key: 'crm-promo-api-bad-discount', code: 'KM-API-03', discountValue: 101 }) }, 422);
  await request('/collections/crm_promotions', 'POST', { record: campaign({ key: 'crm-promo-api-bad-customer', code: 'KM-API-04', customerKeys: ['missing-customer'] }) }, 422);
  await request('/collections/crm_promotions', 'PUT', { records: [] }, 405);
  await request('/collections/crm_promotions/crm-promo-api-1', 'PATCH', { patch: { ownerId: 'spoofed-user' } }, 422);
  const paused = (await request('/collections/crm_promotions/crm-promo-api-1', 'PATCH', { patch: { enabled: false } })).record;
  assert.equal(paused.status, 'Tạm dừng');
  assert.equal(paused.ownerId, session.user.id);
  assert.equal(paused.history.length, 2);
  await request('/collections/crm_promotions/crm-promo-api-1', 'DELETE', undefined, 409);
  await request('/users', 'POST', {
    email: 'crm-promotion-staff@example.test', name: 'Nhân viên CRM', password: 'CRM-Promotion-26!Secure', employeeCode: 'CRM-PROMO-STAFF', role: 'USER',
  }, 201);
  const staffSession = await request('/auth/login', 'POST', { email: 'crm-promotion-staff@example.test', password: 'CRM-Promotion-26!Secure' });
  const staffHeaders = { ...headers, Authorization: `Bearer ${staffSession.access_token || staffSession.token}` };
  await request('/collections/crm_promotions', 'POST', { record: campaign({ key: 'crm-promo-user-forbidden', code: 'KM-API-USER' }) }, 403, staffHeaders);
  await request('/collections/crm_promotions', 'GET', undefined, 403, staffHeaders);
});

test('loyalty points can reference only completed sales linked to the same CRM customer', async () => {
  const customer = (await request('/crm/contacts', 'POST', { name: 'Khách hàng liên kết chứng từ', type: 'customer' }, 201)).contact;
  const other = (await request('/crm/contacts', 'POST', { name: 'Khách hàng khác', type: 'customer' }, 201)).contact;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const saleInput = { documentType: 'sale', subtype: 'Đơn bán hàng', partnerName: 'Tên giả', description: 'Chứng từ kiểm thử', amount: 500000, paidAmount: 0, documentDate: today, dueDate: '', status: 'Đã bàn giao', taxCode: '', vatRate: 0, vatAmount: 0 };
  const beforeSales = (await request('/finance/documents?documentType=sale')).data.length;
  await request('/finance/documents', 'POST', { ...saleInput, customerId: customer.key, amount: 0 }, 422);
  await request('/finance/documents', 'POST', { ...saleInput, customerId: customer.key, documentType: 'purchase' }, 422);
  assert.equal((await request('/finance/documents?documentType=sale')).data.length, beforeSales);
  const sale = (await request('/finance/documents', 'POST', { ...saleInput, customerId: customer.key }, 201)).document;
  assert.equal(sale.customerId, customer.key);
  assert.equal(sale.customerCode, customer.code);
  assert.equal(sale.partnerName, customer.name);
  assert.equal((await request('/finance/documents?documentType=sale')).data.find((item) => item.key === sale.key).customerId, customer.key);
  const before = await request('/crm/loyalty');
  assert.equal(before.customers.find((item) => item.key === customer.key).balance, 0);
  assert.ok(before.sales.some((item) => item.key === sale.key && item.customerId === customer.key));
  const earn = { requestId: 'linked-sale-earn', type: 'earn', customerId: customer.key, points: 25, saleId: sale.key, reference: 'Mã giả', note: '' };
  const saved = (await request('/crm/loyalty/entries', 'POST', earn, 201)).entry;
  assert.equal(saved.reference, sale.code);
  assert.equal(saved.saleCode, sale.code);
  assert.equal(saved.saleAmount, sale.amount);
  assert.equal((await request('/crm/loyalty/entries', 'POST', earn)).replayed, true);
  await request('/crm/loyalty/entries', 'POST', { ...earn, requestId: 'linked-sale-duplicate', reference: 'Khác' }, 409);
  await request('/crm/loyalty/entries', 'POST', { ...earn, requestId: 'linked-sale-wrong-customer', customerId: other.key }, 422);
  await request('/crm/loyalty/entries', 'POST', { ...earn, requestId: 'linked-sale-missing', saleId: 'missing' }, 422);
  await request('/collections/finance_sale_customer_links', 'PUT', { records: [] }, 409);
  const pending = (await request('/finance/documents', 'POST', { ...saleInput, customerId: customer.key, status: 'Đang triển khai' }, 201)).document;
  const quote = (await request('/finance/documents', 'POST', { ...saleInput, customerId: customer.key, subtype: 'Báo giá' }, 201)).document;
  await request('/crm/loyalty/entries', 'POST', { ...earn, requestId: 'linked-sale-pending', saleId: pending.key }, 422);
  await request('/crm/loyalty/entries', 'POST', { ...earn, requestId: 'linked-sale-quote', saleId: quote.key }, 422);
  const legacy = (await request('/finance/documents', 'POST', { ...saleInput, partnerName: customer.name }, 201)).document;
  await request(`/finance/sales/${legacy.key}/customer`, 'POST', { customerId: other.key }, 422);
  assert.equal((await request(`/finance/sales/${legacy.key}/customer`, 'POST', { customerId: customer.key })).replayed, false);
  assert.equal((await request(`/finance/sales/${legacy.key}/customer`, 'POST', { customerId: customer.key })).replayed, true);
  await request(`/finance/sales/${legacy.key}/customer`, 'POST', { customerId: other.key }, 409);
  const race = await Promise.all(['legacy-sale-earn-a', 'legacy-sale-earn-b'].map(async (requestId) => {
    const response = await fetch(`${base}/crm/loyalty/entries`, { method: 'POST', headers, body: JSON.stringify({ ...earn, requestId, saleId: legacy.key }) });
    return response.status;
  }));
  assert.deepEqual(race.sort((a, b) => a - b), [201, 409]);
  await request('/users', 'POST', { email: 'sale-link-user@example.test', name: 'Nhân viên bán hàng', password: 'Sale-Link-Test-26!Secure', employeeCode: 'SALE-LINK-USER', role: 'USER' }, 201);
  const userSession = await request('/auth/login', 'POST', { email: 'sale-link-user@example.test', password: 'Sale-Link-Test-26!Secure' });
  const userHeaders = { ...headers, Authorization: `Bearer ${userSession.access_token || userSession.token}` };
  await request('/collections/finance_sale_customer_links', 'GET', undefined, 403, userHeaders);
  await request(`/finance/sales/${legacy.key}/customer`, 'POST', { customerId: customer.key }, 403, userHeaders);
  await request('/finance/documents', 'POST', { ...saleInput, customerId: customer.key }, 403, userHeaders);
});

test('sales apply eligible order discounts atomically and preserve the reviewed amount', async () => {
  const customer = (await request('/crm/contacts', 'POST', { name: 'Khách kiểm thử chiết khấu', type: 'customer' }, 201)).contact;
  const other = (await request('/crm/contacts', 'POST', { name: 'Khách ngoài phạm vi', type: 'customer' }, 201)).contact;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const promo = (key, overrides = {}) => ({
    key, code: key.toUpperCase(), name: key, startDate: today, endDate: '2099-12-31', promotionType: 'Chiết khấu',
    target: 'Tất cả khách hàng', enabled: true, allowConcurrent: false, eligibleItemCodes: [], amountBasis: 'Thành tiền trước thuế',
    orgUnitKeys: [], employeeIds: [], applyOnce: false, combinablePromotionKeys: [], taxCondition: 'Bất kỳ', minimumSubtotal: 0,
    unitPrice: 0, unit: 'đơn hàng', customerKeys: [], discountKind: 'Phần trăm', discountValue: 10, ...overrides,
  });
  const sale = { documentType: 'sale', subtype: 'Đơn bán hàng', status: 'Đã bàn giao', amount: 1000, paidAmount: 0, documentDate: today, dueDate: '', description: 'Kiểm thử chiết khấu', taxCode: '', vatRate: 0, vatAmount: 0, customerId: customer.key };
  const preview = (keys, overrides = {}) => request('/finance/sales/promotion-preview', 'POST', { ...sale, promotionKeys: keys, ...overrides });
  await request('/collections/crm_promotions', 'POST', { record: promo('promo-once', { applyOnce: true, customerKeys: [customer.key] }) }, 201);
  const calculated = await preview(['promo-once']);
  assert.equal(calculated.discountAmount, 100);
  assert.equal(calculated.netAmount, 900);
  await request('/finance/sales/promotion-preview', 'POST', { ...sale, customerId: other.key, promotionKeys: ['promo-once'] }, 422);
  const payload = { ...sale, promotionKeys: ['promo-once'], promotionFingerprint: calculated.fingerprint, requestId: 'promotion-sale-1', discountAmount: 999 };
  const saved = (await request('/finance/documents', 'POST', payload, 201)).document;
  assert.equal(saved.amount, 900);
  assert.equal(saved.grossAmount, 1000);
  assert.equal(saved.discountAmount, 100);
  assert.equal(saved.appliedPromotions[0].discount, 100);
  assert.equal((await request('/finance/documents', 'POST', payload)).replayed, true);
  await request('/finance/documents', 'POST', { ...payload, amount: 1100 }, 409);
  await request('/finance/sales/promotion-preview', 'POST', { ...sale, promotionKeys: ['promo-once'] }, 409);
  assert.equal((await request('/finance/documents?documentType=sale')).data.find((item) => item.key === saved.key).discountAmount, 100);
  await request('/collections/finance_sale_promotions', 'PUT', { records: [] }, 409);

  await request('/collections/crm_promotions', 'POST', { record: promo('promo-stack-a', { allowConcurrent: true }) }, 201);
  await request('/collections/crm_promotions', 'POST', { record: promo('promo-stack-b', { allowConcurrent: true, combinablePromotionKeys: ['promo-stack-a'], discountKind: 'Số tiền', discountValue: 100 }) }, 201);
  await request('/finance/sales/promotion-preview', 'POST', { ...sale, promotionKeys: ['promo-stack-a', 'promo-stack-b'] }, 422);
  await request('/collections/crm_promotions/promo-stack-a', 'PATCH', { patch: { combinablePromotionKeys: ['promo-stack-b'] } });
  const stacked = await preview(['promo-stack-a', 'promo-stack-b']);
  assert.deepEqual(stacked.applications.map((item) => [item.basis, item.discount]), [[1000, 100], [900, 100]]);
  assert.equal(stacked.netAmount, 800);
  await request('/finance/documents', 'POST', { ...sale, paidAmount: 850, promotionKeys: ['promo-stack-a', 'promo-stack-b'], promotionFingerprint: stacked.fingerprint, requestId: 'promo-overpaid' }, 422);
  await request('/finance/sales/promotion-preview', 'POST', { ...sale, subtype: 'Báo giá', promotionKeys: ['promo-stack-a'] }, 422);
  await request('/finance/sales/promotion-preview', 'POST', { ...sale, vatRate: 10, vatAmount: 90, promotionKeys: ['promo-stack-a'] }, 422);
  await request('/collections/crm_promotions', 'POST', { record: promo('promo-items', { eligibleItemCodes: ['SKU-1'] }) }, 201);
  await request('/finance/sales/promotion-preview', 'POST', { ...sale, promotionKeys: ['promo-items'] }, 422);

  await request('/collections/crm_promotions', 'POST', { record: promo('promo-stale') }, 201);
  const stale = await preview(['promo-stale']);
  await request('/collections/crm_promotions/promo-stale', 'PATCH', { patch: { discountValue: 20 } });
  await request('/finance/documents', 'POST', { ...sale, promotionKeys: ['promo-stale'], promotionFingerprint: stale.fingerprint, requestId: 'promo-stale-sale' }, 409);
  await request('/collections/crm_promotions', 'POST', { record: promo('promo-race', { applyOnce: true }) }, 201);
  const racingPreview = await preview(['promo-race']);
  const racing = await Promise.all(['promo-sale-race-a', 'promo-sale-race-b'].map(async (requestId) => {
    const response = await fetch(`${base}/finance/documents`, { method: 'POST', headers, body: JSON.stringify({ ...sale, promotionKeys: ['promo-race'], promotionFingerprint: racingPreview.fingerprint, requestId }) });
    return response.status;
  }));
  assert.deepEqual(racing.sort((a, b) => a - b), [201, 409]);
});

test('meeting rooms enforce server-owned booking identities, room policy, conflicts and cancellation history', async () => {
  const room = (await request('/collections/meeting_rooms', 'POST', { record: {
    key: 'meeting-room-api', name: 'Phòng họp API', capacity: 8, location: 'Tầng 4', equipment: ['Màn hình'], status: 'Tạm ngưng', createdBy: 'Giả mạo',
  } }, 201)).record;
  assert.equal(room.status, 'Trống');
  assert.equal(room.createdById, session.user.id);
  await request('/collections/meeting_rooms', 'POST', { record: { key: 'meeting-room-api-duplicate', name: 'phòng họp api', capacity: 8, location: 'Tầng 4' } }, 409);
  await request('/collections/meeting_rooms', 'POST', { record: { key: 'meeting-room-bad-capacity', name: 'Phòng sức chứa sai', capacity: 0, location: 'Tầng 4' } }, 422);
  await request('/collections/meeting_rooms', 'PUT', { records: [] }, 405);
  await request('/collections/meeting_rooms/meeting-room-api', 'DELETE', undefined, 409);

  const employee = (await request('/users', 'POST', { email: 'meeting-room-staff@example.test', name: 'Nhân viên đặt họp', password: 'Meeting-Room-26!Secure', employeeCode: 'MEETING-STAFF', role: 'USER' }, 201)).user;
  const employeeSession = await request('/auth/login', 'POST', { email: 'meeting-room-staff@example.test', password: 'Meeting-Room-26!Secure' });
  const employeeHeaders = { ...headers, Authorization: `Bearer ${employeeSession.access_token || employeeSession.token}` };
  const secondEmployee = (await request('/users', 'POST', { email: 'meeting-room-other@example.test', name: 'Nhân viên khác', password: 'Meeting-Room-Other-26!Secure', employeeCode: 'MEETING-OTHER', role: 'USER' }, 201)).user;
  const secondSession = await request('/auth/login', 'POST', { email: 'meeting-room-other@example.test', password: 'Meeting-Room-Other-26!Secure' });
  const secondHeaders = { ...headers, Authorization: `Bearer ${secondSession.access_token || secondSession.token}` };
  await request('/collections/meeting_rooms', 'POST', { record: { key: 'meeting-room-forbidden', name: 'Phòng không được tạo', capacity: 6, location: 'Tầng 5' } }, 403, employeeHeaders);
  assert.equal((await request('/collections/meeting_rooms', 'GET', undefined, 200, employeeHeaders)).data.some(item => item.key === room.key), true);
  await request('/collections/meeting_room_settings', 'GET', undefined, 403, employeeHeaders);
  const settings = (await request('/collections/meeting_room_settings', 'POST', { record: { key: 'forged-settings-key', maxDuration: 60, maxAdvanceDays: 10 } }, 201)).record;
  assert.equal(settings.key, 'default');
  assert.equal(settings.updatedById, session.user.id);
  await request('/collections/meeting_room_settings/default', 'PATCH', { patch: { maxDuration: 14 } }, 422);
  const futureDate = (days) => {
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }));
    now.setDate(now.getDate() + days);
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  };
  const date = futureDate(1);
  const booking = (key, timeSlot) => ({ key, roomKey: room.key, meetingTitle: 'Họp kiểm thử', date, timeSlot, participantsCount: 4, booker: 'Người giả', bookerId: 'spoofed', status: 'Đã hủy' });
  await request('/collections/room_bookings', 'POST', { record: booking('meeting-booking-too-long', '08:00 - 09:30') }, 422, employeeHeaders);
  await request('/collections/room_bookings', 'POST', { record: { ...booking('meeting-booking-too-many', '08:00 - 09:00'), participantsCount: 9 } }, 422, employeeHeaders);
  await request('/collections/room_bookings', 'POST', { record: { ...booking('meeting-booking-too-far', '08:00 - 09:00'), date: futureDate(11) } }, 422, employeeHeaders);
  await request('/collections/room_bookings', 'POST', { record: { ...booking('meeting-booking-fake-room', '08:00 - 09:00'), roomKey: 'missing-room' } }, 422, employeeHeaders);
  const first = await request('/collections/room_bookings', 'POST', { record: booking('meeting-booking-staff', '09:00 - 10:00') }, 201, employeeHeaders);
  assert.equal(first.record.booker, employee.name);
  assert.equal(first.record.bookerId, employee.id);
  assert.equal(first.record.status, 'Đã xác nhận');
  assert.equal(first.record.roomName, room.name);
  assert.equal((await request('/collections/room_bookings', 'GET', undefined, 200, secondHeaders)).data.some(item => item.key === first.record.key), true);
  await request(`/collections/room_bookings/${first.record.key}`, 'PATCH', { patch: { status: 'Đã hủy' } }, 404, secondHeaders);
  await request(`/collections/meeting_rooms/${room.key}`, 'PATCH', { patch: { status: 'Bảo trì' } }, 409);

  const concurrent = await Promise.all(['10:00 - 11:00', '10:30 - 11:30'].map(async (timeSlot, index) => {
    const response = await fetch(`${base}/collections/room_bookings`, { method: 'POST', headers: employeeHeaders, body: JSON.stringify({ record: booking(`meeting-booking-race-${index}`, timeSlot) }) });
    return { status: response.status, body: await response.json() };
  }));
  assert.deepEqual(concurrent.map(result => result.status).sort(), [201, 409]);
  const concurrentWinner = concurrent.find(result => result.status === 201).body.record;
  await request(`/collections/room_bookings/${concurrentWinner.key}`, 'PATCH', { patch: { status: 'Đã hủy' } }, 200, employeeHeaders);
  const canceled = (await request(`/collections/room_bookings/${first.record.key}`, 'PATCH', { patch: { status: 'Đã hủy' } }, 200, employeeHeaders)).record;
  assert.equal(canceled.canceledById, employee.id);
  assert.equal(canceled.history.at(-1).actorId, employee.id);
  await request(`/collections/room_bookings/${first.record.key}`, 'PATCH', { patch: { status: 'Đã hủy' } }, 409, employeeHeaders);
  await request('/collections/room_bookings', 'PUT', { records: [] }, 405);
  await request(`/collections/room_bookings/${first.record.key}`, 'DELETE', undefined, 409, employeeHeaders);
  await request(`/collections/meeting_rooms/${room.key}`, 'PATCH', { patch: { status: 'Bảo trì' } });
  const unavailable = (await request(`/collections/meeting_rooms/${room.key}`)).record;
  assert.equal(unavailable.status, 'Bảo trì');
  assert.equal(unavailable.history.at(-1).actorId, session.user.id);
  await request('/collections/room_bookings', 'POST', { record: booking('meeting-booking-maintenance', '13:00 - 14:00') }, 422, employeeHeaders);
});

test('payment requests persist actual actors and enforce approval, rejection and internal settlement transitions', async () => {
  await request('/users', 'POST', { email: 'payment-requester@example.test', name: 'Nhân viên đề nghị chi', password: 'Payment-Request-26!Secure', employeeCode: 'PAY-USER-01', role: 'USER' }, 201);
  const userLogin = await request('/auth/login', 'POST', { email: 'payment-requester@example.test', password: 'Payment-Request-26!Secure' });
  const userHeaders = { ...headers, Authorization: `Bearer ${userLogin.access_token || userLogin.token}` };
  const paymentSource = (await request('/finance/bank-accounts', 'POST', { bankName: 'Vietcombank', accountNumber: '0011223344', accountHolder: 'KIYOVN', balance: 3000000, status: 'Đang hoạt động' }, 201)).account;
  const payment = (await request('/finance/payments', 'POST', { beneficiary: 'Nhà cung cấp thật', bankAccountInfo: 'VCB 00112233', category: 'Phí dịch vụ tháng', amount: 2500000, paymentMethod: 'Chuyển khoản VCB', creator: 'Người giả', empCode: 'FAKE', status: 'Đã thanh toán', approver: 'Người giả' }, 201, userHeaders)).payment;
  assert.equal(payment.creator, 'Nhân viên đề nghị chi');
  assert.equal(payment.creatorId, userLogin.user.id);
  assert.equal(payment.empCode, 'PAY-USER-01');
  assert.equal(payment.status, 'Chờ duyệt');
  assert.equal(payment.approver, '');
  assert.equal(payment.history.length, 1);
  assert.equal((await request('/finance/payments', 'GET', undefined, 200, userHeaders)).data.length, 1);
  await request('/finance/payments', 'POST', { beneficiary: 'Sai số tiền', bankAccountInfo: 'VCB 00112233', category: 'Không hợp lệ', amount: 0, paymentMethod: 'Chuyển khoản VCB' }, 422, userHeaders);
  await request(`/finance/payments/${payment.key}/approve`, 'POST', {}, 403, userHeaders);
  await request(`/collections/finance_payments/${payment.key}`, 'PATCH', { patch: { status: 'Đã thanh toán' } }, 409, headers);
  await request('/collections/finance_payments', 'PUT', { records: [] }, 409, headers);
  await request(`/finance/payments/${payment.key}/reject`, 'POST', { reason: '' }, 422, headers);

  const createdSecond = (await request('/finance/payments', 'POST', { beneficiary: 'Nhà cung cấp hai', bankAccountInfo: 'TCB 77665544', category: 'Chi phí vận hành', amount: 900000, paymentMethod: 'Chuyển khoản VCB' }, 201)).payment;
  const competing = await Promise.all(['POST', 'POST'].map(() => fetch(`${base}/finance/payments/${createdSecond.key}/approve`, { method: 'POST', headers, body: '{}' })));
  assert.deepEqual(competing.map((response) => response.status).sort(), [200, 409]);
  const approved = (await request('/finance/payments')).data.find((record) => record.key === createdSecond.key);
  assert.equal(approved.status, 'Đã phê duyệt');
  assert.equal(approved.approverId, session.user.id);
  await request(`/finance/payments/${createdSecond.key}/execute`, 'POST', { sourceAccountId: paymentSource.key, settlementReference: 'AB' }, 422);
  await request(`/finance/payments/${createdSecond.key}/execute`, 'POST', { sourceAccountId: 'missing-account', settlementReference: 'VCB-TXN-2026-001' }, 422);
  const paid = (await request(`/finance/payments/${createdSecond.key}/execute`, 'POST', { sourceAccountId: paymentSource.key, settlementReference: 'VCB-TXN-2026-001' })).payment;
  assert.equal(paid.status, 'Đã thanh toán');
  assert.equal(paid.paidById, session.user.id);
  assert.equal(paid.settlementReference, 'VCB-TXN-2026-001');
  assert.equal(paid.settlementRecordedInternally, true);
  assert.equal(paid.ledgerRecorded, true);
  assert.equal(paid.sourceAccountId, paymentSource.key);
  assert.equal(paid.history.length, 3);
  const expenseVoucher = (await request('/finance/cash-transactions?source=bank')).data.find((item) => item.key === paid.financeTransactionId);
  assert.equal(expenseVoucher.code, `${createdSecond.code}-OUT`);
  assert.equal(expenseVoucher.type, 'Chi');
  assert.equal(expenseVoucher.amount, createdSecond.amount);
  assert.equal(expenseVoucher.account, `Vietcombank (${paymentSource.accountNumber})`);
  const balances = (await request('/finance/payment-accounts')).accounts;
  assert.equal(balances.find((item) => item.key === paymentSource.key).balance, 2100000);
  await request(`/finance/payments/${createdSecond.key}/execute`, 'POST', { sourceAccountId: paymentSource.key, settlementReference: 'VCB-TXN-2026-001' }, 409);

  const overBalance = (await request('/finance/payments', 'POST', { beneficiary: 'Nhà cung cấp vượt số dư', bankAccountInfo: 'VCB 77665544', category: 'Kiểm tra số dư', amount: 2500000, paymentMethod: 'Chuyển khoản VCB' }, 201)).payment;
  await request(`/finance/payments/${overBalance.key}/approve`, 'POST', {});
  await request(`/finance/payments/${overBalance.key}/execute`, 'POST', { sourceAccountId: paymentSource.key, settlementReference: 'VCB-INSUFFICIENT-01' }, 422);
  assert.equal((await request('/finance/payments')).data.find((item) => item.key === overBalance.key).status, 'Đã phê duyệt');
  assert.equal((await request('/finance/cash-transactions?source=bank')).data.length, 1);

  const rejected = (await request('/finance/payments', 'POST', { beneficiary: 'Nhà cung cấp ba', bankAccountInfo: 'VCB 88990011', category: 'Dịch vụ khác', amount: 1500000, paymentMethod: 'Chuyển khoản TCB' }, 201)).payment;
  const denied = (await request(`/finance/payments/${rejected.key}/reject`, 'POST', { reason: 'Thiếu hóa đơn hợp lệ.' })).payment;
  assert.equal(denied.status, 'Từ chối');
  assert.equal(denied.rejectionReason, 'Thiếu hóa đơn hợp lệ.');
  assert.equal((await request('/finance/payments')).data.length, 4);
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

test('CRM contacts can be updated without changing their identity or exposing invalid data', async () => {
  const created = (await request('/crm/contacts', 'POST', {
    name: 'Đối tác trước cập nhật', type: 'customer', taxCode: 'CRM-EDIT-001', contactPerson: 'Nguyễn An',
    phone: '0900000001', email: 'crm-before@example.test', address: 'Địa chỉ cũ', bankAccount: '0123456789',
    creditLimit: 1000000, totalValue: 200000, debtBalance: 50000, status: 'Đang hoạt động',
  }, 201)).contact;
  const updated = (await request(`/crm/contacts/${encodeURIComponent(created.key)}`, 'PATCH', { patch: {
    name: 'Đối tác sau cập nhật', contactPerson: 'Trần Bình', email: 'crm-after@example.test',
    address: 'Địa chỉ mới', creditLimit: 2000000, status: 'Tạm dừng',
  } })).contact;
  assert.equal(updated.key, created.key);
  assert.equal(updated.code, created.code);
  assert.equal(updated.type, 'customer');
  assert.equal(updated.name, 'Đối tác sau cập nhật');
  assert.equal(updated.contactPerson, 'Trần Bình');
  assert.equal(updated.email, 'crm-after@example.test');
  assert.equal(updated.phone, '0900000001');
  assert.equal(updated.address, 'Địa chỉ mới');
  assert.equal(updated.creditLimit, 2000000);
  assert.equal(updated.status, 'Tạm dừng');
  assert.ok(updated.updatedAt >= created.updatedAt);
  await request(`/crm/contacts/${created.key}`, 'PATCH', { patch: { type: 'supplier' } }, 422);
  await request(`/crm/contacts/${created.key}`, 'PATCH', { patch: { code: 'FORGED-CODE' } }, 422);
  await request(`/crm/contacts/${created.key}`, 'PATCH', { patch: { email: 'invalid-email' } }, 422);
  await request(`/crm/contacts/${created.key}`, 'PATCH', { patch: {} }, 422);
  await request('/crm/contacts/missing-crm-contact', 'PATCH', { patch: { name: 'Không tồn tại' } }, 404);
  const employee = (await request('/users', 'POST', { email: 'crm-contact-staff@example.test', name: 'Nhân viên CRM', password: 'Crm-Contact-26!Secure', employeeCode: 'CRM-CONTACT-STAFF', role: 'USER' }, 201)).user;
  const employeeLogin = await request('/auth/login', 'POST', { email: 'crm-contact-staff@example.test', password: 'Crm-Contact-26!Secure' });
  const employeeHeaders = { ...headers, Authorization: `Bearer ${employeeLogin.access_token || employeeLogin.token}` };
  assert.ok(employee.id);
  await request(`/crm/contacts/${created.key}`, 'PATCH', { patch: { name: 'Không được phép' } }, 403, employeeHeaders);
});

test('customer feedback creation and resolution enforce identity, validation, and an audit trail', async () => {
  const input = {
    key: 'feedback-api-lifecycle', feedbackCode: 'FB-API-LIFECYCLE', clientName: 'Khách hàng API',
    contactPerson: 'Người liên hệ', phone: '0901234567', serviceName: 'Dịch vụ kiểm thử', rating: 4,
    content: 'Phản ánh được ghi nhận từ kiểm thử API.', priority: 'Cao', assignedStaffId: session.user.id,
    status: 'Đã giải quyết thỏa đáng', resolutionAction: 'Không được nhận nội dung xử lý từ yêu cầu tạo.',
    receivedDate: '1999-01-01', resolvedBy: 'Người giả mạo',
  };
  const created = (await request('/collections/crm_feedback', 'POST', { record: input }, 201)).record;
  assert.equal(created.status, 'Đang xử lý');
  assert.equal(created.resolutionAction, '');
  assert.equal(created.assignedStaff, session.user.name);
  assert.equal(created.resolvedBy, '');
  assert.match(created.receivedDate, /^\d{4}-\d{2}-\d{2}$/);
  await request('/collections/crm_feedback', 'POST', { record: { ...input, key: 'feedback-api-duplicate-code' } }, 409);
  await request('/collections/crm_feedback', 'POST', { record: { ...input, key: 'feedback-api-invalid-rating', feedbackCode: 'FB-API-BAD-RATING', rating: 6 } }, 422);
  await request('/collections/crm_feedback', 'POST', { record: { ...input, key: 'feedback-api-invalid-staff', feedbackCode: 'FB-API-BAD-STAFF', assignedStaffId: 'missing-user' } }, 422);
  await request('/collections/crm_feedback', 'PUT', { records: [] }, 405);
  await request('/collections/crm_feedback/feedback-api-lifecycle', 'PATCH', { patch: { status: 'Đã giải quyết thỏa đáng' } }, 422);
  await request('/collections/crm_feedback/feedback-api-lifecycle', 'PATCH', { patch: { status: 'Đã giải quyết thỏa đáng', resolutionAction: 'Đã xử lý', assignedStaff: 'Forged' } }, 422);
  const resolved = (await request('/collections/crm_feedback/feedback-api-lifecycle', 'PATCH', {
    patch: { status: 'Đã giải quyết thỏa đáng', resolutionAction: 'Đã gọi khách hàng, triển khai biện pháp khắc phục và xác nhận kết quả.' },
  })).record;
  assert.equal(resolved.status, 'Đã giải quyết thỏa đáng');
  assert.equal(resolved.resolvedById, session.user.id);
  assert.ok(resolved.resolvedDate);
  await request('/collections/crm_feedback/feedback-api-lifecycle', 'PATCH', {
    patch: { status: 'Đã giải quyết thỏa đáng', resolutionAction: 'Đóng lặp.' },
  }, 422);
  await request('/collections/crm_feedback/feedback-api-lifecycle', 'DELETE', undefined, 422);

  await request('/users', 'POST', { email: 'feedback-staff@example.test', name: 'Nhân viên phản ánh', password: 'Feedback-Staff-26!Secure', employeeCode: 'FEEDBACK-STAFF', role: 'USER' }, 201);
  const employeeLogin = await request('/auth/login', 'POST', { email: 'feedback-staff@example.test', password: 'Feedback-Staff-26!Secure' });
  const employeeHeaders = { ...headers, Authorization: `Bearer ${employeeLogin.access_token || employeeLogin.token}` };
  await request('/collections/crm_feedback', 'GET', undefined, 403, employeeHeaders);
});

test('supplier evaluations use active supplier data, derive scores and actor, and preserve the stored result', async () => {
  const supplier = (await request('/crm/contacts', 'POST', { name: 'Nhà cung cấp API', type: 'supplier', industry: 'Hạ tầng', status: 'Đang hoạt động' }, 201)).contact;
  const input = {
    key: 'supplier-eval-api', evalCode: 'NCC-DG-API-001', supplierId: supplier.key, evalPeriod: 'Quý IV / 2026',
    qualityScore: 36, deliveryScore: 27, priceScore: 18, serviceScore: 9,
    supplierName: 'Nhà cung cấp giả', category: 'Lĩnh vực giả', totalScore: 1, tier: 'Hạng C',
    evaluator: 'Người đánh giá giả', evaluatorId: 'missing-user', decision: 'Duy trì đối tác chiến lược',
    strengths: 'Phản hồi nhanh', weaknesses: 'Cần cải thiện thời gian triển khai',
  };
  const created = (await request('/collections/crm_supplier_evaluations', 'POST', { record: input }, 201)).record;
  assert.equal(created.supplierName, supplier.name);
  assert.equal(created.category, supplier.industry);
  assert.equal(created.totalScore, 90);
  assert.equal(created.tier, 'Hạng A');
  assert.equal(created.evaluator, session.user.name);
  assert.equal(created.evaluatorId, session.user.id);
  await request('/collections/crm_supplier_evaluations', 'POST', { record: { ...input, key: 'supplier-eval-duplicate', evalCode: 'ncc-dg-api-001' } }, 409);
  await request('/collections/crm_supplier_evaluations', 'POST', { record: { ...input, key: 'supplier-eval-bad-score', evalCode: 'NCC-DG-API-BAD', qualityScore: 41 } }, 422);
  await request('/collections/crm_supplier_evaluations', 'POST', { record: { ...input, key: 'supplier-eval-bad-supplier', evalCode: 'NCC-DG-API-NO-SUPPLIER', supplierId: 'missing-supplier' } }, 422);
  await request('/collections/crm_supplier_evaluations', 'PUT', { records: [] }, 405);
  await request('/collections/crm_supplier_evaluations/supplier-eval-api', 'PATCH', { patch: { evaluator: 'Forged' } }, 422);
  await request('/collections/crm_supplier_evaluations/supplier-eval-api', 'DELETE', undefined, 422);

  await request('/users', 'POST', { email: 'supplier-eval-staff@example.test', name: 'Nhân viên nhà cung cấp', password: 'Supplier-Eval-26!Secure', employeeCode: 'SUPPLIER-EVAL-STAFF', role: 'USER' }, 201);
  const employeeLogin = await request('/auth/login', 'POST', { email: 'supplier-eval-staff@example.test', password: 'Supplier-Eval-26!Secure' });
  const employeeHeaders = { ...headers, Authorization: `Bearer ${employeeLogin.access_token || employeeLogin.token}` };
  await request('/collections/crm_supplier_evaluations', 'GET', undefined, 403, employeeHeaders);
});

test('business travel API derives requester and approver identity, protects decisions, and finalizes settlement from evidence', async () => {
  const employee = (await request('/users', 'POST', { email: 'travel-staff@example.test', name: 'Travel Staff', password: 'Travel-Test-26!Secure', employeeCode: 'TRAVEL-STAFF', role: 'USER' }, 201)).user;
  const employeeLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'travel-staff@example.test', password: 'Travel-Test-26!Secure' }) });
  assert.equal(employeeLogin.status, 200);
  const employeeSession = await employeeLogin.json();
  const employeeHeaders = { ...headers, Authorization: `Bearer ${employeeSession.access_token || employeeSession.token}` };
  const requestData = {
    key: 'travel-api-staff', travelCode: 'CT-2026-API-STAFF', employeeId: employee.id,
    employeeName: 'Forged name', empCode: 'FORGED', department: 'Forged', position: 'Forged',
    destination: 'Hồ Chí Minh', tripType: 'Nội địa', startDate: '2026-10-26', endDate: '2026-10-27',
    daysCount: 100, purpose: 'Gặp khách hàng', flightTicket: '', hotelName: '', budgetEstimated: 1200, advanceAmount: 300,
    status: 'Đã duyệt công tác', requesterId: session.user.id, requester: 'Forged requester', approvedBy: 'Forged approver', actualExpense: 900,
  };
  const created = await request('/collections/business_travels', 'POST', { record: requestData }, 201, employeeHeaders);
  assert.equal(created.record.status, 'Chờ lãnh đạo duyệt');
  assert.equal(created.record.requesterId, employee.id);
  assert.equal(created.record.requester, employee.name);
  assert.equal(created.record.employeeName, employee.name);
  assert.equal(created.record.empCode, employee.employeeCode);
  assert.equal(created.record.daysCount, 2);
  assert.equal(created.record.approvedBy, '');
  assert.equal(created.record.actualExpense, 0);
  await request('/collections/business_travels/travel-api-staff', 'PATCH', { patch: { status: 'Đã duyệt công tác' } }, 403, employeeHeaders);
  await request('/collections/business_travels/travel-api-admin', 'GET', undefined, 404, employeeHeaders);
  assert.deepEqual((await request('/collections/business_travels', 'GET', undefined, 200, employeeHeaders)).data.map(item => item.key), ['travel-api-staff']);

  const adminTravel = await request('/collections/business_travels', 'POST', { record: { ...requestData, key: 'travel-api-admin', travelCode: 'CT-2026-API-ADMIN', employeeId: session.user.id } }, 201);
  assert.equal(adminTravel.record.requesterId, session.user.id);
  await request('/collections/business_travels', 'POST', { record: { ...requestData, key: 'travel-duplicate-code', travelCode: 'ct-2026-api-staff', employeeId: session.user.id } }, 409);
  await request('/collections/business_travels', 'PUT', { records: [] }, 405);

  const approved = await request('/collections/business_travels/travel-api-staff', 'PATCH', { patch: { status: 'Đã duyệt công tác', rejectionReason: '' } });
  assert.equal(approved.record.status, 'Đã duyệt công tác');
  assert.equal(approved.record.approvedById, session.user.id);
  assert.equal(approved.record.approvedBy, session.user.name);
  assert.ok(approved.record.approvedAt);

  const waitingInvoice = await request('/collections/business_travels/travel-api-staff', 'PATCH', { patch: { actualExpense: 900, invoiceReference: '', invoiceFileId: '', invoiceFileName: '' } });
  assert.equal(waitingInvoice.record.actualExpense, 900);
  assert.equal(waitingInvoice.record.settlementStatus, 'Chờ nộp hóa đơn đỏ');
  assert.equal(waitingInvoice.record.settledAt, '');
  const settled = await request('/collections/business_travels/travel-api-staff', 'PATCH', { patch: { actualExpense: 900, invoiceReference: 'INV-TRAVEL-1' } });
  assert.equal(settled.record.settlementStatus, 'Đã quyết toán xong');
  assert.equal(settled.record.settlementRecordedById, session.user.id);
  assert.equal(settled.record.settledById, session.user.id);
  await request('/collections/business_travels/travel-api-staff', 'PATCH', { patch: { settlementNote: 'Attempted change' } }, 422);

  await request('/collections/business_travels', 'POST', { record: { ...requestData, key: 'travel-api-race', travelCode: 'CT-2026-API-RACE', employeeId: employee.id } }, 201, employeeHeaders);
  const competingDecisions = await Promise.all([
    fetch(`${base}/collections/business_travels/travel-api-race`, { method: 'PATCH', headers, body: JSON.stringify({ patch: { status: 'Đã duyệt công tác', rejectionReason: '' } }) }),
    fetch(`${base}/collections/business_travels/travel-api-race`, { method: 'PATCH', headers, body: JSON.stringify({ patch: { status: 'Từ chối', rejectionReason: 'Không phù hợp lịch trình.' } }) }),
  ]);
  assert.deepEqual(competingDecisions.map(response => response.status).sort((a, b) => a - b), [200, 422]);
});

test('asset disposal API snapshots inventory, records approval and finalization atomically', async () => {
  await request('/collections/asset_items', 'POST', { record: {
    key: 'disposal-asset-api', code: 'AST-DSP-API', name: 'Laptop kiểm thử', category: 'Thiết bị IT', model: 'SN-API',
    originalPrice: 3000, accumulatedDepreciation: 2500, netBookValue: 500, status: 'Đang sử dụng', history: [],
  } }, 201);
  const proposal = {
    key: 'disposal-api', disposalCode: 'TL-API-01', assetKey: 'disposal-asset-api',
    disposalMethod: 'Bán thanh lý cho đơn vị thu mua ngoài', reason: 'Thiết bị hết nhu cầu', disposalDate: '2026-10-27',
    startingAuctionPrice: 100, councilLeader: 'Chủ tịch hội đồng', councilMembers: 'Thành viên A, Thành viên B',
    originalCost: 999999, accumulatedDepreciation: 0, netBookValue: 999999, actualDisposalPrice: 900000,
    status: 'Đã thanh lý & Hoàn tất sổ sách', requester: 'Forged requester', approvedBy: 'Forged approver', completedBy: 'Forged finisher',
    securityDataWipeCertified: true, dataWipeOfficer: 'Forged officer',
  };
  const created = await request('/collections/asset_disposals', 'POST', { record: proposal }, 201);
  assert.equal(created.record.status, 'Chờ hội đồng phê duyệt');
  assert.equal(created.record.requesterId, session.user.id);
  assert.equal(created.record.requester, session.user.name);
  assert.equal(created.record.originalCost, 3000);
  assert.equal(created.record.accumulatedDepreciation, 2500);
  assert.equal(created.record.netBookValue, 500);
  assert.equal(created.record.actualDisposalPrice, 0);
  assert.equal(created.record.securityDataWipeCertified, false);
  assert.equal(created.record.approvedBy, '');
  await request('/collections/asset_disposals', 'POST', { record: { ...proposal, key: 'disposal-api-duplicate', disposalCode: 'TL-API-02' } }, 409);
  await request('/collections/asset_disposals/missing-asset', 'PATCH', { patch: { status: 'Đang thực hiện xử lý' } }, 404);
  await request('/collections/asset_disposals/disposal-api', 'PATCH', { patch: { status: 'Đang thực hiện xử lý', approvedBy: 'Forged' } }, 422);

  const approved = await request('/collections/asset_disposals/disposal-api', 'PATCH', { patch: { status: 'Đang thực hiện xử lý' } });
  assert.equal(approved.record.approvedById, session.user.id);
  assert.ok(approved.record.approvedAt);
  let asset = (await request('/collections/asset_items')).data.find(item => item.key === 'disposal-asset-api');
  assert.equal(asset.status, 'Chờ thanh lý');
  assert.equal(asset.history.at(-1).actor, session.user.name);

  const finalize = {
    status: 'Đã thanh lý & Hoàn tất sổ sách', actualDisposalPrice: 800, disposalCost: 100,
    disposalDate: '2026-10-27', buyerName: 'Đơn vị thu mua', buyerPhone: '',
    securityDataWipeCertified: true, dataWipeOfficer: 'Người ghi nhận',
  };
  await request('/collections/asset_disposals/disposal-api', 'PATCH', { patch: { ...finalize, securityDataWipeCertified: false, dataWipeOfficer: '' } }, 422);
  const completed = await request('/collections/asset_disposals/disposal-api', 'PATCH', { patch: finalize });
  assert.equal(completed.record.netGainLoss, 200);
  assert.equal(completed.record.completedById, session.user.id);
  assert.ok(completed.record.completedAt);
  asset = (await request('/collections/asset_items')).data.find(item => item.key === 'disposal-asset-api');
  assert.equal(asset.status, 'Đã thanh lý');
  assert.equal(asset.history.at(-1).action, 'Hoàn tất xử lý thanh lý');
  await request('/collections/asset_disposals/disposal-api', 'PATCH', { patch: { ...finalize, actualDisposalPrice: 999 } }, 422);
  await request('/collections/asset_disposals/disposal-api', 'DELETE', undefined, 422);
  await request('/collections/asset_disposals', 'PUT', { records: [] }, 405);
});

test('asset inventory rejects duplicate codes and barcodes on create and update', async () => {
  await request('/collections/asset_items', 'POST', { record: {
    key: 'asset-unique-first', code: 'TS-UNIQUE-01', barcode: 'BC 0001', name: 'Tài sản thứ nhất', category: 'Thiết bị IT',
  } }, 201);
  await request('/collections/asset_items', 'POST', { record: {
    key: 'asset-unique-second', code: 'TS-UNIQUE-02', barcode: 'BC-0002', name: 'Tài sản thứ hai',
  } }, 201);
  const concurrentCreates = await Promise.all(['asset-unique-race-a', 'asset-unique-race-b'].map((key) => fetch(`${base}/collections/asset_items`, {
    method: 'POST', headers,
    body: JSON.stringify({ record: { key, code: 'TS-UNIQUE-RACE', barcode: key, name: 'Tài sản tạo đồng thời' } }),
  })));
  assert.deepEqual(concurrentCreates.map((response) => response.status).sort((a, b) => a - b), [201, 409]);
  await request('/collections/asset_items', 'POST', { record: {
    key: 'asset-unique-code-duplicate', code: 'ts-unique-01', barcode: 'BC-0002', name: 'Trùng mã',
  } }, 409);
  await request('/collections/asset_items', 'POST', { record: {
    key: 'asset-unique-barcode-duplicate', code: 'TS-UNIQUE-02', barcode: 'BC0001', name: 'Trùng barcode',
  } }, 409);
  await request('/collections/asset_items/asset-unique-first', 'PATCH', { patch: { code: 'TS-UNIQUE-02' } }, 409);
  await request('/collections/asset_items/asset-unique-first', 'PATCH', { patch: { barcode: 'BC-0002' } }, 409);
  const current = (await request('/collections/asset_items/asset-unique-first')).record;
  assert.equal(current.code, 'TS-UNIQUE-01');
  assert.equal(current.barcode, 'BC0001');
});

test('asset depreciation setup links to inventory and rejects duplicate or mismatched snapshots', async () => {
  await request('/collections/asset_items', 'POST', { record: {
    key: 'depreciation-source-asset', code: 'AST-DEP-01', barcode: 'BC-DEP-01', name: 'Máy chủ liên kết',
    category: 'Máy chủ & Hạ tầng IDC', department: 'Phòng Hạ tầng', originalPrice: 60000000,
    depreciationMonths: 36, accumulatedDepreciation: 0, status: 'Trong kho', purchaseDate: '2026-01-15',
  } }, 201);
  const setup = {
    key: 'depreciation-source-record', assetKey: 'depreciation-source-asset', assetCode: 'FAKE-CODE', assetName: 'Tên giả',
    category: 'Tên nhóm giả', department: 'Phòng giả', originalCost: 1, lifeMonths: 1, residualValue: 1000000,
    startDate: '2026-01-15', depreciationMethod: 'Đường thẳng', costAccount: 'Nợ 6421 (CP Quản lý CNTT)',
    assetAccount: 'Có 2141 (Hao mòn TSCĐ hữu hình)', status: 'Đã trích hết 100%', accumulatedDeprec: 999,
  };
  const created = await request('/collections/asset_depreciations', 'POST', { record: setup }, 201);
  assert.equal(created.record.assetKey, 'depreciation-source-asset');
  assert.equal(created.record.assetCode, 'AST-DEP-01');
  assert.equal(created.record.assetName, 'Máy chủ liên kết');
  assert.equal(created.record.category, 'Máy chủ & Hạ tầng IDC');
  assert.equal(created.record.department, 'Phòng Hạ tầng');
  assert.equal(created.record.originalCost, 60000000);
  assert.equal(created.record.lifeMonths, 36);
  assert.equal(created.record.residualValue, 1000000);
  assert.equal(created.record.accumulatedDeprec, 0);
  assert.equal(created.record.netBookValue, 60000000);
  assert.equal(created.record.status, 'Đang trích khấu hao');
  await request('/collections/asset_depreciations', 'POST', { record: { ...setup, key: 'depreciation-source-record-duplicate' } }, 409);

  await request('/collections/asset_items', 'POST', { record: {
    key: 'depreciation-old-asset', code: 'AST-DEP-02', barcode: 'BC-DEP-02', name: 'Tài sản có số dư cũ',
    originalPrice: 60000000, depreciationMonths: 36, accumulatedDepreciation: 1000, status: 'Đang sử dụng',
  } }, 201);
  await request('/collections/asset_depreciations', 'POST', { record: { ...setup, key: 'depreciation-old-record', assetKey: 'depreciation-old-asset' } }, 422);

  const staff = (await request('/users', 'POST', { email: 'asset-depreciation-staff@example.test', name: 'Nhân viên khấu hao', password: 'Asset-Depreciation-26!Secure', employeeCode: 'ASSET-DEP-STAFF', role: 'USER' }, 201)).user;
  const staffSession = await request('/auth/login', 'POST', { email: 'asset-depreciation-staff@example.test', password: 'Asset-Depreciation-26!Secure' });
  const staffHeaders = { ...headers, Authorization: `Bearer ${staffSession.access_token || staffSession.token}` };
  await request('/collections/asset_depreciations', 'GET', undefined, 403, staffHeaders);
  assert.equal(staff.role, 'USER');
});

test('asset depreciation imports verified opening balances without creating backdated ledger entries', async () => {
  const businessDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const period = businessDate.slice(0, 7);
  const shiftPeriod = (value, offset) => {
    const date = new Date(`${value}-01T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    return date.toISOString().slice(0, 7);
  };
  const periodEndDate = (value) => {
    const [year, month] = value.split('-').map(Number);
    return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  };
  const addAsset = async (key, code, accumulatedDepreciation) => request('/collections/asset_items', 'POST', { record: {
    key, code, name: code, originalPrice: 60000000, accumulatedDepreciation,
    netBookValue: 60000000 - accumulatedDepreciation, depreciationMonths: 36, status: 'Trong kho',
  } }, 201);
  const setup = (key, assetKey, startDate, extra = {}) => ({
    key, assetKey, residualValue: 6000000, startDate, depreciationMethod: 'Đường thẳng',
    costAccount: 'Nợ 6421 (CP Quản lý CNTT)', assetAccount: 'Có 2141 (Hao mòn TSCĐ hữu hình)', ...extra,
  });

  const straightAssetKey = 'depreciation-opening-straight-asset';
  await addAsset(straightAssetKey, 'AST-DEP-OPEN-STRAIGHT', 3000000);
  const straightSetup = setup('depreciation-opening-straight', straightAssetKey, `${shiftPeriod(period, -2)}-01`, {
    openingDepreciatedMonths: 2,
  });
  await request('/collections/asset_depreciations', 'POST', { record: { ...straightSetup, openingDepreciatedMonths: 1 } }, 422);
  const straight = await request('/collections/asset_depreciations', 'POST', { record: {
    ...straightSetup, openingDepreciatedMonths: 2, accumulatedDeprec: 999, netBookValue: 1, status: 'Đã trích hết 100%',
  } }, 201);
  assert.equal(straight.record.assetCode, 'AST-DEP-OPEN-STRAIGHT');
  assert.equal(straight.record.depreciatedMonths, 2);
  assert.equal(straight.record.accumulatedDeprec, 3000000);
  assert.equal(straight.record.netBookValue, 57000000);
  assert.equal(straight.record.lastRunDate, periodEndDate(shiftPeriod(period, -1)));
  assert.equal(straight.record.openingBalanceImport.throughPeriod, shiftPeriod(period, -1));
  assert.equal(straight.record.openingBalanceImport.accumulatedDepreciation, 3000000);
  assert.equal(Object.hasOwn(straight.record, 'openingDepreciatedMonths'), false);
  assert.equal((await request('/collections/finance_general_ledger')).data.filter((item) => item.sourceModule === 'asset_depreciation').length, 0);

  const productionAssetKey = 'depreciation-opening-production-asset';
  await addAsset(productionAssetKey, 'AST-DEP-OPEN-PRODUCTION', 4050000);
  const productionStart = shiftPeriod(period, -3);
  const openingProductionByPeriod = Object.fromEntries([-3, -2, -1].map((offset) => [shiftPeriod(period, offset), 25]));
  const productionSetup = {
    ...setup('depreciation-opening-production', productionAssetKey, `${productionStart}-01`, {
      depreciationMethod: 'Theo sản lượng / Công suất', productionCapacity: 1000, openingDepreciatedMonths: 3,
    }),
    openingProductionByPeriod,
  };
  await request('/collections/asset_depreciations', 'POST', { record: {
    ...productionSetup, openingProductionByPeriod: { [shiftPeriod(period, -3)]: 25, [shiftPeriod(period, -2)]: 25 },
  } }, 422);
  await request('/collections/asset_depreciations', 'POST', { record: {
    ...productionSetup, openingProductionByPeriod: Object.fromEntries([-3, -2, -1].map((offset) => [shiftPeriod(period, offset), 400])),
  } }, 422);
  const production = await request('/collections/asset_depreciations', 'POST', { record: productionSetup }, 201);
  assert.equal(production.record.accumulatedDeprec, 4050000);
  assert.deepEqual(production.record.productionByPeriod, openingProductionByPeriod);
  assert.equal(production.record.openingBalanceImport.depreciatedMonths, 3);
  assert.equal((await request('/collections/finance_general_ledger')).data.filter((item) => item.sourceModule === 'asset_depreciation').length, 0);

  const fullyDepreciatedAssetKey = 'depreciation-opening-fully-depreciated-asset';
  await addAsset(fullyDepreciatedAssetKey, 'AST-DEP-OPEN-FULL', 60000000);
  const fullyDepreciated = await request('/collections/asset_depreciations', 'POST', { record: setup(
    'depreciation-opening-fully-depreciated', fullyDepreciatedAssetKey, `${shiftPeriod(period, -36)}-01`,
    { residualValue: 0, openingDepreciatedMonths: 36 },
  ) }, 201);
  assert.equal(fullyDepreciated.record.status, 'Đã trích hết 100%');
  assert.equal(fullyDepreciated.record.netBookValue, 0);
  assert.equal(fullyDepreciated.record.depreciatedMonths, 36);
  assert.equal((await request('/collections/finance_general_ledger')).data.filter((item) => item.sourceReference?.endsWith(`:${fullyDepreciated.record.key}`)).length, 0);

  const run = await request('/assets/depreciation-runs', 'POST', { period, entries: [
    { depreciationKey: straight.record.key, amount: 1500000 },
    { depreciationKey: production.record.key, amount: 1350000, productionUnits: 25 },
  ] });
  assert.equal(run.totalAmount, 2850000);
  for (const [depreciationKey, assetKey, accumulated, months] of [
    [straight.record.key, straightAssetKey, 4500000, 3],
    [production.record.key, productionAssetKey, 5400000, 4],
  ]) {
    const depreciation = (await request(`/collections/asset_depreciations/${depreciationKey}`)).record;
    const asset = (await request(`/collections/asset_items/${assetKey}`)).record;
    assert.equal(depreciation.depreciatedMonths, months);
    assert.equal(depreciation.accumulatedDeprec, accumulated);
    assert.equal(depreciation.openingBalanceImport.throughPeriod, shiftPeriod(period, -1));
    assert.equal(asset.accumulatedDepreciation, accumulated);
    assert.equal(asset.netBookValue, 60000000 - accumulated);
  }
  const ledger = (await request('/collections/finance_general_ledger')).data.filter((item) => item.sourceModule === 'asset_depreciation');
  assert.equal(ledger.length, 2);
  assert.ok(ledger.every((entry) => entry.sourceReference.startsWith(`asset-depreciation:${period}:`)));
});

test('asset depreciation posts inventory, schedule and ledger atomically and only once per period', async () => {
  const businessDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const period = businessDate.slice(0, 7);
  const ledgerBefore = (await request('/collections/finance_general_ledger')).data.filter((item) => item.sourceModule === 'asset_depreciation');
  const registration = async (suffix) => {
    const assetKey = `depreciation-batch-asset-${suffix}`;
    const depreciationKey = `depreciation-batch-record-${suffix}`;
    await request('/collections/asset_items', 'POST', { record: {
      key: assetKey, code: `AST-DEP-BATCH-${suffix}`, barcode: `BC-DEP-BATCH-${suffix}`, name: `Tài sản ${suffix}`,
      category: 'Thiết bị IT', department: 'Phòng Hạ tầng', originalPrice: 60000000,
      depreciationMonths: 36, accumulatedDepreciation: 0, netBookValue: 60000000, status: 'Trong kho',
    } }, 201);
    await request('/collections/asset_depreciations', 'POST', { record: {
      key: depreciationKey, assetKey, assetCode: 'Mã giả', originalCost: 1, lifeMonths: 1, residualValue: 6000000,
      startDate: `${period}-01`, depreciationMethod: 'Đường thẳng', costAccount: 'Nợ 6421 (CP Quản lý CNTT)',
      assetAccount: 'Có 2141 (Hao mòn TSCĐ hữu hình)',
    } }, 201);
    return { assetKey, depreciationKey, amount: 1500000 };
  };
  const first = await registration('A');
  const second = await registration('B');
  const payload = { period, entries: [first, second].map(({ depreciationKey, amount }) => ({ depreciationKey, amount })) };
  await request('/assets/depreciation-runs', 'POST', { ...payload, entries: [payload.entries[0], { ...payload.entries[1], amount: 1 }] }, 422);
  for (const { assetKey, depreciationKey } of [first, second]) {
    assert.equal((await request(`/collections/asset_items/${assetKey}`)).record.accumulatedDepreciation, 0);
    assert.equal((await request(`/collections/asset_depreciations/${depreciationKey}`)).record.depreciatedMonths, 0);
  }
  assert.equal((await request('/collections/finance_general_ledger')).data.filter((item) => item.sourceModule === 'asset_depreciation').length, ledgerBefore.length);

  const requests = await Promise.all([payload, payload].map((body) => fetch(`${base}/assets/depreciation-runs`, {
    method: 'POST', headers, body: JSON.stringify(body),
  })));
  assert.deepEqual(requests.map((response) => response.status).sort((a, b) => a - b), [200, 409]);
  const result = await Promise.all(requests.map((response) => response.json()));
  const successful = result.find((item) => item.count === 2);
  assert.equal(successful.totalAmount, 3000000);
  for (const { assetKey, depreciationKey } of [first, second]) {
    const asset = (await request(`/collections/asset_items/${assetKey}`)).record;
    const depreciation = (await request(`/collections/asset_depreciations/${depreciationKey}`)).record;
    assert.equal(asset.accumulatedDepreciation, 1500000);
    assert.equal(asset.netBookValue, 58500000);
    assert.equal(asset.history.at(-1).action, 'Ghi nhận khấu hao tài sản');
    assert.equal(depreciation.depreciatedMonths, 1);
    assert.equal(depreciation.accumulatedDeprec, 1500000);
  }
  const ledger = (await request('/collections/finance_general_ledger')).data.filter((item) => item.sourceModule === 'asset_depreciation');
  assert.equal(ledger.length, ledgerBefore.length + 2);
  const batchLedger = ledger.filter((entry) => [first.depreciationKey, second.depreciationKey].some((key) => entry.sourceReference.endsWith(`:${key}`)));
  assert.equal(batchLedger.length, 2);
  assert.ok(batchLedger.every((entry) => entry.author === session.user.name && entry.amount === 1500000));
  await request(`/collections/asset_depreciations/${first.depreciationKey}`, 'PATCH', { patch: { accumulatedDeprec: 0 } }, 422);
  await request(`/collections/asset_depreciations/${first.depreciationKey}`, 'DELETE', undefined, 422);
  await request('/assets/depreciation-runs', 'POST', payload, 409);

  const addMethodRecord = async (suffix, method, productionCapacity) => {
    const assetKey = `depreciation-method-asset-${suffix}`;
    const depreciationKey = `depreciation-method-record-${suffix}`;
    await request('/collections/asset_items', 'POST', { record: {
      key: assetKey, code: `AST-DEP-METHOD-${suffix}`, barcode: `BC-DEP-METHOD-${suffix}`, name: `Tài sản ${suffix}`,
      originalPrice: 60000000, depreciationMonths: 36, accumulatedDepreciation: 0, status: 'Đang sử dụng',
    } }, 201);
    await request('/collections/asset_depreciations', 'POST', { record: {
      key: depreciationKey, assetKey, residualValue: 6000000, startDate: `${period}-01`, depreciationMethod: method,
      productionCapacity, costAccount: 'Nợ 6421 (CP Quản lý CNTT)', assetAccount: 'Có 2141 (Hao mòn TSCĐ hữu hình)',
    } }, 201);
    return depreciationKey;
  };
  const decliningKey = await addMethodRecord('DECLINING', 'Số dư giảm dần có điều chỉnh');
  const productionKey = await addMethodRecord('PRODUCTION', 'Theo sản lượng / Công suất', 1000);
  const methodRun = await request('/assets/depreciation-runs', 'POST', { period, entries: [
    { depreciationKey: decliningKey, amount: 2250000 },
    { depreciationKey: productionKey, amount: 5400000, productionUnits: 100 },
  ] });
  assert.equal(methodRun.totalAmount, 7650000);
  assert.equal((await request(`/collections/asset_depreciations/${decliningKey}`)).record.accumulatedDeprec, 2250000);
  assert.equal((await request(`/collections/asset_depreciations/${productionKey}`)).record.productionByPeriod[period], 100);
});

test('asset todo API persists checklist transitions and derives completion identity', async () => {
  const employee = (await request('/users', 'POST', { email: 'asset-todo-staff@example.test', name: 'Nhân viên tài sản', password: 'Asset-Todo-26!Secure', employeeCode: 'ASSET-TODO-STAFF', role: 'USER' }, 201)).user;
  const task = {
    key: 'asset-todo-api', taskCode: 'CV-TS-API-01', taskTitle: 'Kiểm tra máy trạm',
    taskCategory: 'Kiểm kê đối soát', priority: 'Cao (P2)', deadline: '2026-10-29',
    assignedStaffId: employee.id, assignedStaff: 'Forged staff', requester: 'Phòng quản trị', relatedAssetCode: 'AST-01', location: 'Văn phòng',
    estimatedHours: 3, actualHours: 99, status: 'Đã hoàn thành', slaStatus: 'Trong hạn SLA',
    checklist: [{ item: 'Đối chiếu mã tài sản', done: true }, { item: 'Ghi nhận kết quả', done: true }],
    createdBy: 'Forged creator', completedBy: 'Forged approver', resolutionResult: 'Forged completion',
  };
  const created = await request('/collections/asset_todos', 'POST', { record: task }, 201);
  assert.equal(created.record.status, 'Chờ xử lý');
  assert.equal(created.record.actualHours, 0);
  assert.equal(created.record.checklist.every(item => !item.done), true);
  assert.equal(created.record.createdById, session.user.id);
  assert.equal(created.record.createdBy, session.user.name);
  assert.equal(created.record.completedBy, '');
  assert.equal(created.record.assignedStaffId, employee.id);
  assert.equal(created.record.assignedStaff, employee.name);
  await request('/collections/asset_todos', 'POST', { record: { ...task, key: 'asset-todo-duplicate', taskCode: 'cv-ts-api-01' } }, 409);
  await request('/collections/asset_todos', 'PUT', { records: [] }, 405);
  await request('/collections/asset_todos/asset-todo-api', 'PATCH', { patch: { status: 'Đã hoàn thành', actualHours: 2, resolutionResult: 'Forged' } }, 422);
  await request('/collections/asset_todos/asset-todo-api', 'PATCH', { patch: { checklist: [{ item: 'Forged', done: true }] } }, 422);
  await request('/collections/asset_todos/asset-todo-api', 'PATCH', { patch: { status: 'Đang thực hiện' } });
  const checklist = [{ item: 'Đối chiếu mã tài sản', done: true }, { item: 'Ghi nhận kết quả', done: true }];
  await request('/collections/asset_todos/asset-todo-api', 'PATCH', { patch: { checklist } });
  await request('/collections/asset_todos/asset-todo-api', 'PATCH', { patch: { status: 'Chờ phê duyệt cấp trên' } });
  await request('/collections/asset_todos/asset-todo-api', 'PATCH', { patch: { status: 'Đã hoàn thành', actualHours: 2.5, resolutionResult: 'Đã đối chiếu tài sản và lưu biên bản.' } });
  const completed = (await request('/collections/asset_todos/asset-todo-api')).record;
  assert.equal(completed.status, 'Đã hoàn thành');
  assert.equal(completed.actualHours, 2.5);
  assert.equal(completed.completedById, session.user.id);
  assert.ok(completed.completedAt);
  await request('/collections/asset_todos/asset-todo-api', 'PATCH', { patch: { status: 'Đang thực hiện' } }, 422);
  await request('/collections/asset_todos/asset-todo-api', 'DELETE', undefined, 422);
});

test('assigned employees can execute only their own asset tasks while admins retain approval', async () => {
  const first = (await request('/users', 'POST', { email: 'asset-todo-owner@example.test', name: 'Nhân viên nhận việc', password: 'Asset-Todo-Owner-26!Secure', employeeCode: 'ASSET-TODO-OWNER', role: 'USER' }, 201)).user;
  const second = (await request('/users', 'POST', { email: 'asset-todo-other@example.test', name: 'Nhân viên khác', password: 'Asset-Todo-Other-26!Secure', employeeCode: 'ASSET-TODO-OTHER', role: 'USER' }, 201)).user;
  const createTask = (key, taskCode, assignedStaffId) => ({
    key, taskCode, taskTitle: 'Kiểm tra tài sản được giao', taskCategory: 'Kiểm kê đối soát', priority: 'Trung bình (P3)',
    deadline: '2026-11-20', assignedStaffId, requester: 'Phòng quản trị', relatedAssetCode: 'AST-EMP-01', location: 'Văn phòng',
    estimatedHours: 2, actualHours: 0, status: 'Chờ xử lý', checklist: [{ item: 'Kiểm tra mã tài sản', done: false }], notes: '',
  });
  const ownTask = (await request('/collections/asset_todos', 'POST', { record: createTask('asset-todo-owner-task', 'CV-TS-EMP-01', first.id) }, 201)).record;
  const otherTask = (await request('/collections/asset_todos', 'POST', { record: createTask('asset-todo-other-task', 'CV-TS-EMP-02', second.id) }, 201)).record;
  const firstLogin = await request('/auth/login', 'POST', { email: first.email, password: 'Asset-Todo-Owner-26!Secure' });
  const secondLogin = await request('/auth/login', 'POST', { email: second.email, password: 'Asset-Todo-Other-26!Secure' });
  const firstHeaders = { ...headers, Authorization: `Bearer ${firstLogin.access_token || firstLogin.token}` };
  const secondHeaders = { ...headers, Authorization: `Bearer ${secondLogin.access_token || secondLogin.token}` };

  const firstList = await request('/collections/asset_todos', 'GET', undefined, 200, firstHeaders);
  assert.deepEqual(firstList.data.map((item) => item.key), [ownTask.key]);
  assert.equal((await request('/collections/asset_todos', 'GET', undefined, 200, secondHeaders)).data[0].key, otherTask.key);
  await request(`/collections/asset_todos/${otherTask.key}`, 'GET', undefined, 404, firstHeaders);
  await request(`/collections/asset_todos/${ownTask.key}`, 'PATCH', { patch: { status: 'Đã hoàn thành', actualHours: 1, resolutionResult: 'Giả mạo nghiệm thu' } }, 403, firstHeaders);
  await request(`/collections/asset_todos/${ownTask.key}`, 'PATCH', { patch: { status: 'Đang thực hiện', assignedStaffId: second.id } }, 403, firstHeaders);
  await request('/collections/asset_todos', 'POST', { record: createTask('asset-todo-forged-task', 'CV-TS-EMP-03', first.id) }, 403, firstHeaders);
  await request(`/collections/asset_todos/${ownTask.key}`, 'DELETE', undefined, 403, firstHeaders);

  const started = (await request(`/collections/asset_todos/${ownTask.key}`, 'PATCH', { patch: { status: 'Đang thực hiện' } }, 200, firstHeaders)).record;
  assert.equal(started.updatedById, first.id);
  const checklist = (await request(`/collections/asset_todos/${ownTask.key}`, 'PATCH', { patch: { checklist: [{ item: 'Kiểm tra mã tài sản', done: true }] } }, 200, firstHeaders)).record;
  assert.equal(checklist.checklist[0].done, true);
  await request(`/collections/asset_todos/${ownTask.key}`, 'PATCH', { patch: { status: 'Chờ phê duyệt cấp trên' } }, 200, firstHeaders);
  await request(`/collections/asset_todos/${ownTask.key}`, 'PATCH', { patch: { status: 'Đã hoàn thành', actualHours: 1, resolutionResult: 'Nhân viên không thể tự nghiệm thu' } }, 403, firstHeaders);

  const completed = (await request(`/collections/asset_todos/${ownTask.key}`, 'PATCH', {
    patch: { status: 'Đã hoàn thành', actualHours: 1.5, resolutionResult: 'Đã đối chiếu mã và tình trạng tài sản.' },
  }, 200)).record;
  assert.equal(completed.status, 'Đã hoàn thành');
  assert.equal(completed.completedById, session.user.id);
  assert.equal((await request('/collections/asset_todos', 'GET', undefined, 200, firstHeaders)).data[0].status, 'Đã hoàn thành');
});

test('inventory receipts, FIFO issues, transfers and counts persist batch stock atomically', async () => {
  const itemKey = 'inventory-batch-api';
  const item = (await request('/collections/finance_inventory', 'POST', { record: {
    key: itemKey, sku: 'RAM-32-API', name: 'RAM máy chủ 32GB', category: 'Linh kiện', unit: 'Thanh',
    stockQty: 700, minQty: 2, maxQty: 20, unitPrice: 1000, warehouse: 'Kho A', barcode: 'BC-RAM-API',
    lotManaged: true, barcodeManaged: true, issueMethod: 'FIFO', lots: [{ lotCode: 'FORGED', warehouse: 'Kho A', quantity: 700, expiryDate: '2020-01-01' }],
  } }, 201)).record;
  assert.equal(item.stockQty, 0);
  assert.deepEqual(item.lots, []);
  assert.equal(item.status, 'Sắp hết hàng');
  const newItem = (key, sku, barcode) => ({ key, sku, barcode, name: 'Hàng kiểm tra trùng', category: 'Linh kiện', unit: 'Thanh', warehouse: 'Kho A', lotManaged: true, barcodeManaged: true });
  await request('/collections/finance_inventory', 'POST', { record: newItem('inventory-batch-duplicate', 'ram-32-api', 'BC-OTHER') }, 409);
  await request('/collections/finance_inventory', 'POST', { record: newItem('inventory-barcode-duplicate', 'RAM-OTHER-API', 'bc -ram-api') }, 409);

  const today = new Date().toISOString().slice(0, 10);
  const olderDate = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const receipt = { type: 'Nhập kho', transactionCode: 'NK-INV-API-01', transactionDate: olderDate, destinationWarehouse: 'Kho A', lines: [
    { productKey: itemKey, quantity: 8, unitCost: 1300, lotCode: 'LOT-EARLY', expiryDate: '2027-04-01' },
  ] };
  const received = await request('/finance/inventory/transactions', 'POST', receipt, 201);
  assert.equal(received.transaction.totalQuantity, 8);
  const replay = await request('/finance/inventory/transactions', 'POST', receipt, 200);
  assert.equal(replay.replayed, true);
  await request('/finance/inventory/transactions', 'POST', { ...receipt, lines: [{ productKey: itemKey, quantity: 1, unitCost: 1, lotCode: 'LOT-X', expiryDate: '2027-01-01' }] }, 409);
  await request('/finance/inventory/transactions', 'POST', { type: 'Nhập kho', transactionCode: 'NK-INV-API-02', transactionDate: today,
    destinationWarehouse: 'Kho A', lines: [{ productKey: itemKey, quantity: 5, unitCost: 1100, lotCode: 'LOT-LATE', expiryDate: '2027-05-01' }] }, 201);
  assert.equal((await request(`/collections/finance_inventory/${itemKey}`)).record.stockQty, 13);

  const issue = await request('/finance/inventory/transactions', 'POST', { type: 'Xuất kho', transactionCode: 'XK-INV-API-01', transactionDate: today,
    sourceWarehouse: 'Kho A', reason: 'Cấp cho phòng kỹ thuật', lines: [{ productKey: itemKey, quantity: 6 }] }, 201);
  assert.equal(issue.transaction.lines[0].allocatedLots[0].lotCode, 'LOT-EARLY');
  assert.equal(issue.transaction.lines[0].allocatedLots[0].quantity, 6);
  await request('/finance/inventory/transactions', 'POST', { type: 'Xuất kho', transactionCode: 'XK-INV-API-FAIL', transactionDate: today,
    sourceWarehouse: 'Kho A', reason: 'Thiếu hàng', lines: [{ productKey: itemKey, quantity: 100 }] }, 409);
  assert.equal((await request(`/collections/finance_inventory/${itemKey}`)).record.stockQty, 7);

  const transfer = await request('/finance/inventory/transactions', 'POST', { type: 'Điều chuyển', transactionCode: 'DC-INV-API-01', transactionDate: today,
    sourceWarehouse: 'Kho A', destinationWarehouse: 'Kho B', lines: [{ productKey: itemKey, quantity: 3 }] }, 201);
  assert.equal(transfer.transaction.lines[0].destinationWarehouse, 'Kho B');
  const moved = (await request(`/collections/finance_inventory/${itemKey}`)).record;
  assert.equal(moved.stockQty, 7);
  assert.deepEqual(moved.stockByWarehouse, [{ warehouse: 'Kho A', quantity: 4 }, { warehouse: 'Kho B', quantity: 3 }]);

  const audit = await request('/finance/inventory/transactions', 'POST', { type: 'Kiểm kê', transactionCode: 'KK-INV-API-01', transactionDate: today,
    sourceWarehouse: 'Kho A', lines: [{ productKey: itemKey, warehouse: 'Kho A', lotCode: 'LOT-EARLY', expiryDate: '2027-04-01', actualQty: 1 }] }, 201);
  assert.equal(audit.transaction.lines[0].difference, 1);
  assert.equal((await request(`/collections/finance_inventory/${itemKey}`)).record.stockQty, 8);

  const assemblyProduct = (await request('/collections/finance_inventory', 'POST', { record: {
    key: 'inventory-assembly-output-api', sku: 'KIT-API-01', name: 'Bộ kit kiểm thử', category: 'Bộ kit', unit: 'Bộ', warehouse: 'Kho B', unitPrice: 0,
  } }, 201)).record;
  const assembly = await request('/finance/inventory/transactions', 'POST', { type: 'Lắp ráp', transactionCode: 'LSX-INV-API-01', transactionDate: today,
    sourceWarehouse: 'Kho A', destinationWarehouse: 'Kho B', reason: 'Lắp bộ thiết bị', lines: [
      { productKey: itemKey, direction: 'Thành phần', quantity: 1, warehouse: 'Kho A' },
      { productKey: assemblyProduct.key, direction: 'Thành phẩm', quantity: 1, warehouse: 'Kho B' },
    ] }, 201);
  assert.equal(assembly.transaction.lines.find((line) => line.direction === 'Thành phẩm').unitCost,
    assembly.transaction.lines.find((line) => line.direction === 'Thành phần').allocatedLots[0].unitCost);
  assert.equal((await request(`/collections/finance_inventory/${assemblyProduct.key}`)).record.stockQty, 1);

  const shipment = await request('/finance/inventory/transactions', 'POST', { type: 'Giao hàng', transactionCode: 'GH-INV-API-01', transactionDate: today,
    sourceWarehouse: 'Kho A', recipient: 'Phòng kỹ thuật', deliveryAddress: 'Hà Nội', lines: [{ productKey: itemKey, quantity: 1 }] }, 201);
  assert.equal(shipment.transaction.shipmentStatus, 'Chờ giao');
  await request('/finance/inventory/transactions/GH-INV-API-01/shipment-status', 'POST', { status: 'Đang giao' }, 200);
  const delivered = await request('/finance/inventory/transactions/GH-INV-API-01/shipment-status', 'POST', { status: 'Đã giao' }, 200);
  assert.equal(delivered.transaction.shipmentHistory.length, 2);
  await request('/finance/inventory/transactions/GH-INV-API-01/shipment-status', 'POST', { status: 'Đang giao' }, 409);
  await request('/finance/inventory/transactions/GH-INV-API-01/returns', 'POST', { returnCode: 'TH-DELIVERED-API-01', receivedDate: today, lines: [{ lineIndex: 0, quantity: 1 }] }, 409);

  const failedShipment = await request('/finance/inventory/transactions', 'POST', { type: 'Giao hàng', transactionCode: 'GH-INV-API-RETURN-01', transactionDate: today,
    sourceWarehouse: 'Kho A', recipient: 'Phòng kỹ thuật', deliveryAddress: 'Hà Nội', lines: [{ productKey: itemKey, quantity: 2 }] }, 201);
  await request('/finance/inventory/transactions/GH-INV-API-RETURN-01/shipment-status', 'POST', { status: 'Đang giao' }, 200);
  await request('/finance/inventory/transactions/GH-INV-API-RETURN-01/shipment-status', 'POST', { status: 'Giao thất bại', reason: 'Người nhận không có mặt' }, 200);
  await request('/finance/inventory/transactions/GH-INV-API-RETURN-01/shipment-status', 'POST', { status: 'Đã giao' }, 409);
  const beforeReturn = (await request(`/collections/finance_inventory/${itemKey}`)).record;
  const returnPayload = { returnCode: 'TH-INV-API-RETURN-01', receivedDate: today, notes: 'Nhận một phần hàng còn nguyên', lines: [{ lineIndex: 0, quantity: 1 }] };
  const invalidReturn = await request('/finance/inventory/transactions/GH-INV-API-RETURN-01/returns', 'POST', { ...returnPayload, returnCode: 'TH-INV-API-INVALID', lines: [{ lineIndex: 99, quantity: 1 }] }, 422);
  assert.equal(invalidReturn.message, 'Dòng hàng nhận trả không hợp lệ hoặc bị lặp.');
  const returnOne = await request('/finance/inventory/transactions/GH-INV-API-RETURN-01/returns', 'POST', returnPayload, 201);
  assert.equal(returnOne.replayed, false);
  assert.equal(returnOne.receipt.type, 'Nhập kho');
  assert.equal(returnOne.receipt.shipmentReturnOf, 'GH-INV-API-RETURN-01');
  assert.equal(returnOne.receipt.lines[0].allocatedLots[0].lotCode, failedShipment.transaction.lines[0].allocatedLots[0].lotCode);
  assert.equal(returnOne.receipt.lines[0].allocatedLots[0].unitCost, failedShipment.transaction.lines[0].allocatedLots[0].unitCost);
  assert.equal(returnOne.receipt.lines[0].allocatedLots[0].warehouse, 'Kho A');
  assert.equal((await request(`/collections/finance_inventory/${itemKey}`)).record.stockQty, beforeReturn.stockQty + 1);
  const replayedReturn = await request('/finance/inventory/transactions/GH-INV-API-RETURN-01/returns', 'POST', returnPayload, 200);
  assert.equal(replayedReturn.replayed, true);
  assert.equal((await request(`/collections/finance_inventory/${itemKey}`)).record.stockQty, beforeReturn.stockQty + 1);
  await request('/finance/inventory/transactions/GH-INV-API-RETURN-01/returns', 'POST', { ...returnPayload, returnCode: 'TH-INV-API-TOO-MANY', lines: [{ lineIndex: 0, quantity: 2 }] }, 409);
  const returnTwo = await request('/finance/inventory/transactions/GH-INV-API-RETURN-01/returns', 'POST', { ...returnPayload, returnCode: 'TH-INV-API-RETURN-02', lines: [{ lineIndex: 0, quantity: 1 }] }, 201);
  assert.equal(returnTwo.transaction.shipmentReturns.length, 2);
  assert.equal((await request(`/collections/finance_inventory/${itemKey}`)).record.stockQty, beforeReturn.stockQty + 2);
  assert.equal((await request('/collections/finance_inventory_transactions/TH-INV-API-RETURN-01')).record.shipmentReturnOf, 'GH-INV-API-RETURN-01');

  const commonMethodItem = (await request('/collections/finance_inventory', 'POST', { record: {
    key: 'inventory-common-method-api', sku: 'COMMON-METHOD-API', name: 'Vật tư theo phương pháp chung', category: 'Linh kiện', unit: 'Cái', warehouse: 'Kho C',
    lotManaged: true, issueMethod: 'FIFO',
  } }, 201)).record;
  await request('/finance/inventory/transactions', 'POST', { type: 'Nhập kho', transactionCode: 'NK-COMMON-API-01', transactionDate: olderDate,
    destinationWarehouse: 'Kho C', lines: [{ productKey: commonMethodItem.key, quantity: 2, unitCost: 100, lotCode: 'COMMON-OLD', expiryDate: '2027-01-01' }] }, 201);
  await request('/finance/inventory/transactions', 'POST', { type: 'Nhập kho', transactionCode: 'NK-COMMON-API-02', transactionDate: today,
    destinationWarehouse: 'Kho C', lines: [{ productKey: commonMethodItem.key, quantity: 2, unitCost: 200, lotCode: 'COMMON-NEW', expiryDate: '2027-02-01' }] }, 201);
  const config = await request('/collections/finance_inventory_settings', 'POST', { record: {
    key: 'global', issueMethodMode: 'Dùng chung', issueMethod: 'LIFO', lotManagedDefault: false, barcodeManagedDefault: false,
    warehouseNames: ['Kho A', 'Kho B', 'Kho C'], categoryNames: ['Linh kiện', 'Bộ kit'],
  } }, 201);
  assert.equal(config.record.key, 'global');
  await request('/collections/finance_inventory_settings/global', 'PATCH', { patch: { issueMethodMode: 'Dùng chung', issueMethod: 'LIFO' } }, 200);
  const commonIssue = await request('/finance/inventory/transactions', 'POST', { type: 'Xuất kho', transactionCode: 'XK-COMMON-API-01', transactionDate: today,
    sourceWarehouse: 'Kho C', reason: 'Kiểm tra phương pháp dùng chung', lines: [{ productKey: commonMethodItem.key, quantity: 1 }] }, 201);
  assert.equal(commonIssue.transaction.lines[0].allocatedLots[0].lotCode, 'COMMON-NEW');

  const beforeEdit = (await request(`/collections/finance_inventory/${itemKey}`)).record;
  const edited = await request(`/collections/finance_inventory/${itemKey}`, 'PATCH', { patch: { category: 'Linh kiện cập nhật' } }, 200);
  assert.equal(edited.record.category, 'Linh kiện cập nhật');
  assert.equal(edited.record.stockQty, beforeEdit.stockQty);
  await request(`/collections/finance_inventory/${itemKey}`, 'PATCH', { patch: { stockQty: 999 } }, 422);
  await request(`/collections/finance_inventory/${itemKey}`, 'DELETE', undefined, 409);
  await request('/collections/finance_inventory_transactions', 'PUT', { records: [] }, 405);
  await request('/collections/finance_inventory_transactions', 'POST', { record: { key: 'forged' } }, 405);
  await request('/collections/finance_inventory_transactions/GH-INV-API-01', 'PATCH', { patch: { shipmentStatus: 'Đã giao' } }, 405);

  const employee = (await request('/users', 'POST', { email: 'inventory-user@example.test', name: 'Nhân viên kho', password: 'Inventory-User-26!Secure', employeeCode: 'INVENTORY-USER', role: 'USER' }, 201)).user;
  const login = await request('/auth/login', 'POST', { email: employee.email, password: 'Inventory-User-26!Secure' });
  const employeeHeaders = { ...headers, Authorization: `Bearer ${login.access_token || login.token}` };
  await request('/collections/finance_inventory', 'GET', undefined, 403, employeeHeaders);
  await request('/finance/inventory/transactions', 'POST', receipt, 403, employeeHeaders);
  await request('/finance/inventory/transactions/GH-INV-API-01/shipment-status', 'POST', { status: 'Giao thất bại', reason: 'Không liên hệ được' }, 403, employeeHeaders);
  await request('/finance/inventory/transactions/GH-INV-API-RETURN-01/returns', 'POST', returnPayload, 403, employeeHeaders);
});

test('asset maintenance API binds real inventory and employee data and records the full maintenance cycle', async () => {
  const employee = (await request('/users', 'POST', { email: 'asset-maintenance-staff@example.test', name: 'Kỹ sư bảo trì', password: 'Asset-Maintenance-26!Secure', employeeCode: 'ASSET-MAINTENANCE', role: 'USER' }, 201)).user;
  await request('/collections/asset_items', 'POST', { record: {
    key: 'maintenance-asset-api', code: 'AST-MNT-API', name: 'Máy chủ kiểm thử', category: 'Máy chủ', model: 'SN-MNT',
    status: 'Đang sử dụng', location: 'Phòng máy chủ', history: [],
  } }, 201);
  const today = new Date().toISOString().slice(0, 10);
  const futureDate = new Date(Date.parse(`${today}T00:00:00Z`) + 35 * 86_400_000).toISOString().slice(0, 10);
  const planInput = {
    key: 'asset-maintenance-api', maintCode: 'BD-API-01', assetKey: 'maintenance-asset-api', systemName: 'Tên bị giả mạo', assetCodes: 'FAKE',
    frequency: 'Hàng quý (3 tháng)', maintenanceType: 'Phòng ngừa định kỳ', slaLevel: 'SLA Standard (24h)', nextDate: futureDate,
    responsibleEngineerId: employee.id, responsibleEngineer: 'Kỹ sư giả mạo', vendorPartner: 'Đối tác do người dùng khai báo',
    estimatedBudget: 1500000, actualCost: 999999, healthScore: 100, status: 'Đã hoàn thành đúng lịch',
    checklist: [{ item: 'Giả mạo', done: true }], certificateCode: 'CERT-FAKE',
  };
  const created = (await request('/collections/asset_maintenances', 'POST', { record: planInput }, 201)).record;
  assert.equal(created.assetCodes, 'AST-MNT-API');
  assert.equal(created.systemName, 'Máy chủ kiểm thử');
  assert.equal(created.responsibleEngineer, employee.name);
  assert.equal(created.status, 'Đã lên lịch');
  assert.equal(created.actualCost, 0);
  assert.equal(created.healthScore, 0);
  assert.equal(created.certificateCode, '');
  assert.ok(created.checklist.length > 0 && created.checklist.every(entry => !entry.done));
  await request('/collections/asset_maintenances', 'POST', { record: { ...planInput, key: 'maintenance-duplicate', maintCode: 'BD-API-02' } }, 409);
  await request('/collections/asset_maintenances', 'PUT', { records: [] }, 405);
  const staffLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: employee.email, password: 'Asset-Maintenance-26!Secure' }) });
  const staffSession = await staffLogin.json();
  await request('/collections/asset_maintenances', 'GET', undefined, 403, { ...headers, Authorization: `Bearer ${staffSession.access_token || staffSession.token}` });
  await request('/collections/asset_maintenances/asset-maintenance-api', 'PATCH', { patch: { status: 'Đang tiến hành bảo dưỡng', startedBy: 'Forged' } }, 422);
  await request('/collections/asset_maintenances/asset-maintenance-api', 'PATCH', { patch: { status: 'Đang tiến hành bảo dưỡng' } });
  await request('/collections/asset_maintenances/asset-maintenance-api', 'PATCH', { patch: {
    status: 'Đã hoàn thành đúng lịch', performedDate: today, actualCost: 1200, healthScore: 98,
    checklist: created.checklist, notes: 'Nghiệm thu', certificateCode: '',
  } }, 422);
  const checklist = created.checklist.map(entry => ({ ...entry, done: true }));
  await request('/collections/asset_maintenances/asset-maintenance-api', 'PATCH', { patch: { checklist } });
  await request('/collections/asset_maintenances/asset-maintenance-api', 'PATCH', { patch: {
    status: 'Đã hoàn thành đúng lịch', performedDate: today, actualCost: 1200, healthScore: 101,
    checklist, notes: 'Nghiệm thu', certificateCode: '',
  } }, 422);
  const completed = (await request('/collections/asset_maintenances/asset-maintenance-api', 'PATCH', { patch: {
    status: 'Đã hoàn thành đúng lịch', performedDate: today, actualCost: 1200, healthScore: 98,
    checklist, notes: 'Nghiệm thu', certificateCode: '',
  } })).record;
  assert.equal(completed.status, 'Đã lên lịch');
  assert.equal(completed.lastDate, today);
  assert.equal(completed.nextDate, new Date(Date.parse(`${today}T00:00:00Z`) + 90 * 86_400_000).toISOString().slice(0, 10));
  assert.equal(completed.maintenanceHistory.length, 1);
  assert.equal(completed.maintenanceHistory[0].completedById, session.user.id);
  assert.ok(completed.checklist.every(entry => !entry.done));
  assert.ok(completed.maintenanceHistory[0].checklist.every(entry => entry.done));
  const asset = (await request('/collections/asset_items')).data.find(item => item.key === 'maintenance-asset-api');
  assert.equal(asset.history.at(-1).action, 'Hoàn tất bảo dưỡng định kỳ');
  await request('/collections/asset_maintenances/asset-maintenance-api', 'PATCH', { patch: { checklist } }, 422);
  await request('/collections/asset_maintenances/asset-maintenance-api', 'DELETE', undefined, 422);
});

test('asset system configuration persists one record at a time and derives the real responsible employee', async () => {
  const employee = (await request('/users', 'POST', { email: 'asset-config-owner@example.test', name: 'Người phụ trách cấu hình', password: 'Asset-Config-Owner-26!Secure', employeeCode: 'ASSET-CONFIG-OWNER', role: 'USER' }, 201)).user;
  const input = {
    key: 'asset-system-config-api', code: 'AS-CFG-API-01', name: 'Quy tắc mã tài sản', category: 'Quy tắc sinh mã tự động',
    details: 'Quy tắc được lưu để xem trước mã.', scope: 'Kho tài sản', allocatedRole: 'Nhân viên IT', standardPackage: 'Máy tính tiêu chuẩn',
    budgetLimit: 25000000, depreciationMonthsDefault: 36, prefixPattern: 'TS-IT-{YYYY}-{####}',
    responsiblePersonId: employee.id, responsiblePerson: 'Tên giả', status: 'Tạm ngưng', createdBy: 'Người giả',
  };
  const created = (await request('/collections/asset_systems', 'POST', { record: input }, 201)).record;
  assert.equal(created.status, 'Đang áp dụng');
  assert.equal(created.responsiblePersonId, employee.id);
  assert.equal(created.responsiblePerson, employee.name);
  assert.equal(created.createdById, session.user.id);
  await request('/collections/asset_systems', 'POST', { record: { ...input, key: 'asset-system-config-duplicate', code: 'as-cfg-api-01' } }, 409);
  await request('/collections/asset_systems', 'POST', { record: { ...input, key: 'asset-system-config-invalid', code: 'AS-CFG-INVALID', prefixPattern: 'TS-{####}' } }, 422);
  await request('/collections/asset_systems', 'POST', { record: { ...input, key: 'asset-system-config-repeated-token', code: 'AS-CFG-REPEATED', prefixPattern: 'TS-{YYYY}-{YYYY}-{####}' } }, 422);
  await request('/collections/asset_systems', 'PUT', { records: [] }, 405);
  const paused = (await request('/collections/asset_systems/asset-system-config-api', 'PATCH', { patch: { status: 'Tạm ngưng' } })).record;
  assert.equal(paused.status, 'Tạm ngưng');
  assert.equal(paused.updatedById, session.user.id);
  await request('/collections/asset_systems/asset-system-config-api', 'PATCH', { patch: { status: 'Đang áp dụng', name: 'Forged change' } }, 422);
  await request('/collections/asset_systems/asset-system-config-api', 'PATCH', { patch: { status: 'Đang áp dụng' } });
  assert.equal((await request('/collections/asset_systems/asset-system-config-api')).record.status, 'Đang áp dụng');
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
