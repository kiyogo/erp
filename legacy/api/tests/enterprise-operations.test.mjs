import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-enterprise-operations-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'enterprise-operations@example.test', SEED_ADMIN_PASSWORD: 'Operations-Test-26!Safe',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-RECRUITMENT', JWT_SECRET: 'isolated-enterprise-operations-test-secret-not-for-deployment',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; }); server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exit; }
  console.log(`Operations API evidence: ${directory}`);
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
  if (response.status >= 500) await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(response.status, expected, JSON.stringify({ body, server: response.status >= 500 ? logs : undefined }));
  return body;
}

test('enterprise register persists metadata and exact original / Word files without fabricated signature claims', async () => {
  const record = { key: 'doc-1', docCode: 'VB-TEST-1', title: 'Actual test record', docCategory: 'Công văn điều hành', direction: 'Nội bộ ban hành', issuingAuthority: 'Test office', issuedDate: '2026-10-20', effectiveDate: '2026-10-21', securityLevel: 'Nội bộ công ty', status: 'Dự thảo thẩm định', tags: ['Test'], caSigned: true, fileSize: 'FAKE', sha256Hash: 'FAKE' };
  let saved = (await request('/collections/enterprise_documents', 'POST', { record }, 201)).record;
  assert.equal(saved.caSigned, false); assert.equal(saved.sha256Hash, ''); assert.equal(saved.fileSizeBytes, 0);
  const route = '/collections/enterprise_documents/doc-1';
  await request(route, 'PATCH', { patch: { effectiveDate: '2026-10-19' } }, 422);
  await request(route, 'PATCH', { patch: { expirationDate: '2026-10-01' } }, 422);
  await request(route, 'PATCH', { patch: { fileNodeId: 'missing' } }, 404);
  await request('/collections/enterprise_documents', 'POST', { record: { ...record, key: 'duplicate' } }, 409);
  await request('/collections/enterprise_documents', 'PUT', { records: [] }, 405);
  const workspace = await request('/files?scope=employee');
  async function upload(name, bytes, mime) {
    const response = await fetch(`${base}/files/upload`, { method: 'POST', headers: { Authorization: headers.Authorization, 'Content-Type': mime, 'X-File-Name': encodeURIComponent(name), 'X-Parent-Id': workspace.context.parentId }, body: bytes });
    assert.equal(response.status, 201); return (await response.json()).file;
  }
  const scan = Buffer.from('ORIGINAL PDF bytes including Tiếng Việt');
  const file = await upload('Tài liệu gốc.pdf', scan, 'application/pdf');
  const wordBytes = Buffer.from('PK actual byte equality fixture');
  const word = await upload('soan-thao.docx', wordBytes, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  saved = (await request(route, 'PATCH', { patch: { fileNodeId: file.id, wordFileNodeId: word.id, fileSizeBytes: 999, caSigned: true, summary: 'saved detail', status: 'Mới ban hành' } })).record;
  const { createHash } = await import('node:crypto');
  assert.equal(saved.fileName, file.name); assert.equal(saved.fileSizeBytes, scan.length);
  assert.equal(saved.sha256Hash, createHash('sha256').update(scan).digest('hex'));
  assert.equal(saved.wordSha256Hash, createHash('sha256').update(wordBytes).digest('hex'));
  assert.equal(saved.caSigned, false); assert.equal(saved.updatedBy, session.user.name);
  assert.ok(saved.history.every(item => item.actorId === session.user.id));
  for (const [id, bytes] of [[file.id, scan], [word.id, wordBytes]]) {
    const response = await fetch(`${base}/files/${id}/download`, { headers });
    assert.equal(response.status, 200); assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  }
  await request(route, 'DELETE');
  assert.equal((await request('/collections/enterprise_documents')).data.length, 0);
  assert.equal((await fetch(`${base}/files/${file.id}/download`, { headers })).status, 200, 'deleting metadata must retain physical attachments');
});

test('user administration preserves profile fields, paginates and retains an active administrator', async () => {
  await request(`/users/${session.user.id}`, 'PATCH', { role: 'USER' }, 422);
  await request(`/users/${session.user.id}`, 'PATCH', { isActive: false }, 422);
  await request('/users', 'POST', { email: 'invalid@example.test', name: 'Invalid role', password: 'Operations-Test-26!Safe', role: 'OWNER' }, 422);
  const created = (await request('/users', 'POST', {
    email: 'staff@example.test', name: 'Actual staff', password: 'Operations-Test-26!Safe', role: 'USER', employeeCode: 'STAFF-TEST',
    department: 'Old office', position: 'Assistant', phone: '0900000000', status: 'Thử việc',
    joinDate: '2026-11-01', avatar: 'data:image/png;base64,aGVsbG8=',
    details: {
      firstName: 'staff', middleLastName: 'Actual', birthDate: '1998-02-03', gender: 'Nữ',
      resAddress: 'Hà Nội', personalEmail: 'staff.personal@example.test', manager: session.user.name,
      managerId: session.user.id, jobTitle: 'Trợ lý', probationDate: '2026-10-01', officialDate: '2026-11-01',
      workPhone: '02430000000', workEmail: 'staff@example.test',
    },
  }, 201)).user;
  let employeeProfile = (await request(`/employees/${created.id}`)).employee;
  assert.equal(employeeProfile.status, 'Thử việc');
  assert.equal(employeeProfile.phone, '0900000000');
  assert.equal(employeeProfile.avatar, 'data:image/png;base64,aGVsbG8=');
  assert.equal(employeeProfile.details.firstName, 'staff');
  assert.equal(employeeProfile.details.middleLastName, 'Actual');
  assert.equal(employeeProfile.details.birthDate, '1998-02-03');
  assert.equal(employeeProfile.details.gender, 'Nữ');
  assert.equal(employeeProfile.details.resAddress, 'Hà Nội');
  assert.equal(employeeProfile.details.personalEmail, 'staff.personal@example.test');
  assert.equal(employeeProfile.details.managerId, session.user.id);
  assert.equal(employeeProfile.details.workEmail, 'staff@example.test');
  await request(`/users/${created.id}`, 'PATCH', { isActive: 'false' }, 422);
  const updated = (await request(`/users/${created.id}`, 'PATCH', {
    department: 'Updated office', position: 'Manager', phone: '0911111111', status: 'Chính thức',
    joinDate: '2026-11-02', details: {
      firstName: 'Staff', birthDate: '1998-02-04', gender: 'Nam', resAddress: 'Đà Nẵng',
      personalEmail: 'staff.updated@example.test', workEmail: 'staff@example.test',
      manager: session.user.name, managerId: session.user.id, jobTitle: 'Quản lý',
      probationDate: '2026-10-01', officialDate: '2026-11-02', workPhone: '02431111111',
    },
  })).user;
  assert.equal(updated.department, 'Updated office'); assert.equal(updated.position, 'Manager'); assert.equal(updated.isActive, true);
  employeeProfile = (await request(`/employees/${created.id}`)).employee;
  assert.equal(employeeProfile.status, 'Chính thức');
  assert.equal(employeeProfile.phone, '0911111111');
  assert.equal(employeeProfile.joinDate, '2026-11-02');
  assert.equal(employeeProfile.details.birthDate, '1998-02-04');
  assert.equal(employeeProfile.details.resAddress, 'Đà Nẵng');
  assert.equal(employeeProfile.details.personalEmail, 'staff.updated@example.test');
  assert.equal(employeeProfile.details.jobTitle, 'Quản lý');
  await request(`/users/${created.id}`, 'PATCH', { details: { birthDate: '31/02/1998' } }, 422);
  await request(`/users/${created.id}`, 'PATCH', { details: { workEmail: 'not-an-email' } }, 422);
  await request(`/users/${created.id}`, 'PATCH', { status: 'Đã nghỉ việc', isActive: true }, 422);
  employeeProfile = (await request(`/employees/${created.id}`)).employee;
  assert.equal(employeeProfile.details.birthDate, '1998-02-04', 'rejected updates must preserve the previous profile');
  const first = await request('/users?page=1&limit=1'); const second = await request('/users?page=2&limit=1');
  assert.equal(first.pagination.total, 2); assert.equal(first.data.length, 1); assert.equal(second.data.length, 1);
  assert.notEqual(first.data[0].id, second.data[0].id);
  assert.equal([first.data[0], second.data[0]].find(user => user.id === created.id).department, 'Updated office');
  await request(`/users/${created.id}`, 'PATCH', { isActive: false });
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: created.email, password: 'Operations-Test-26!Safe' }) });
  assert.equal(login.status, 403);
  await request(`/users/${created.id}`, 'PATCH', { isActive: true });
  const activeLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: created.email, password: 'Operations-Test-26!Safe' }) });
  assert.equal(activeLogin.status, 200);
  const stats = await request('/dashboard/stats');
  assert.equal(stats.totalUsers, 2); assert.equal(stats.activeUsers, 2);
  const active = await activeLogin.json();
  for (const route of ['/collections/enterprise_documents', '/admin/backups']) {
    assert.equal((await fetch(`${base}${route}`, { headers: { Authorization: `Bearer ${active.access_token}` } })).status, 403);
  }
  const retired = await request(`/users/${created.id}`, 'PATCH', { status: 'Đã nghỉ việc' });
  assert.equal(retired.user.isActive, false);
  assert.equal((await request(`/employees/${created.id}`)).employee.status, 'Đã nghỉ việc');
  const retiredLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: created.email, password: 'Operations-Test-26!Safe' }) });
  assert.equal(retiredLogin.status, 403, 'retirement must revoke account access');
  await request(`/users/${created.id}`, 'PATCH', { status: 'Chính thức', isActive: true });
});

test('admin backup endpoints produce a physical ZIP and refuse forged generic snapshots or unsupported restore', async () => {
  const listing = await request('/admin/backups');
  assert.equal(listing.data.length, 0); assert.equal(listing.capabilities.restore, false);
  assert.equal((await request('/admin/backups', 'POST', { name: 'Invalid', type: 'Invented' }, 422)).details, undefined);
  await request('/admin/backups/not-a-key/verify', 'POST', {}, 422);
  await request('/admin/backups/00000000-0000-0000-0000-000000000000/download', 'GET', undefined, 404);
  await request('/collections/admin_backups', 'POST', { record: { name: 'Fake', status: 'Success' } }, 409);
  const backup = (await request('/admin/backups', 'POST', { name: 'Actual API snapshot', type: 'Full System' }, 201)).backup;
  assert.ok(backup.sizeBytes > 100); assert.match(backup.checksumSha256, /^[0-9a-f]{64}$/);
  assert.equal(backup.createdBy, session.user.id);
  const verified = (await request(`/admin/backups/${backup.key}/verify`, 'POST', {})).backup;
  assert.equal(verified.checksumSha256, verified.actualChecksumSha256);
  const download = await fetch(`${base}/admin/backups/${backup.key}/download`, { headers });
  assert.equal(download.status, 200); assert.equal(download.headers.get('Content-Type'), 'application/zip');
  const bytes = Buffer.from(await download.arrayBuffer());
  assert.equal(bytes.readUInt32LE(), 0x04034b50); assert.equal(bytes.length, backup.sizeBytes);
  await request(`/admin/backups/${backup.key}/restore`, 'POST', {}, 409);
  assert.equal((await request('/admin/backups')).data.length, 1);
  const { appendFile } = await import('node:fs/promises');
  await appendFile(path.join(directory, 'backups', `${backup.key}.zip`), 'tampered');
  assert.equal((await request(`/admin/backups/${backup.key}/verify`, 'POST', {})).backup.status, 'Không khớp SHA-256');
  const rejected = await request(`/admin/backups/${backup.key}/download`, 'GET', undefined, 409);
  assert.equal(rejected.details, undefined);
});

test('contracts download real Unicode DOCX, keep previous bytes during updates and never attach an unknown recipient to an arbitrary user', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const { readFile } = await import('node:fs/promises');
  const payload = { code: 'HD-UNICODE-1', name: 'Hợp đồng kiểm thử tiếng Việt', contractTemplate: 'Mẫu thử', partyBType: 'employee', employeeCode: 'STAFF-TEST', employeeName: 'Actual staff', salary: 100, signerName: 'Người đại diện thật', signerPosition: 'Trưởng đơn vị' };
  const created = (await request('/contracts', 'POST', payload, 201)).contract;
  assert.ok(created.fileNodeId);
  const download = async id => {
    const response = await fetch(`${base}/files/${id}/download`, { headers });
    assert.equal(response.status, 200); return Buffer.from(await response.arrayBuffer());
  };
  function documentXml(bytes) {
    assert.equal(bytes.readUInt32LE(), 0x04034b50, 'DOCX must be a ZIP, not renamed text');
    for (let offset = 0; bytes.readUInt32LE(offset) === 0x04034b50;) {
      const size = bytes.readUInt32LE(offset + 18), nameSize = bytes.readUInt16LE(offset + 26), extraSize = bytes.readUInt16LE(offset + 28);
      const name = bytes.toString('utf8', offset + 30, offset + 30 + nameSize), start = offset + 30 + nameSize + extraSize;
      if (name === 'word/document.xml') return bytes.toString('utf8', start, start + size);
      offset = start + size;
    }
    throw new Error('Missing document XML');
  }
  const original = await download(created.fileNodeId);
  const xml = documentXml(original);
  assert.match(xml, /HỢP ĐỒNG KIỂM THỬ TIẾNG VIỆT/); assert.match(xml, /Người đại diện thật/);
  assert.ok(!xml.includes('Trần Tuấn Anh')); assert.ok(!xml.includes('Keangnam')); assert.match(xml, /Chưa ghi nhận/);
  const storage = new DatabaseSync(env.KIYOVN_DB_PATH, { readOnly: true });
  const oldFile = storage.prepare('SELECT storage_key FROM file_nodes WHERE id = ?').get(created.fileNodeId);
  storage.close();
  const edited = (await request(`/contracts/${created.id}`, 'PUT', { ...payload, salary: 200 })).contract;
  assert.equal(edited.fileNodeId, created.fileNodeId);
  const updated = await download(edited.fileNodeId);
  assert.match(documentXml(updated), /200 VNĐ/); assert.notDeepEqual(updated, original);
  assert.deepEqual(await readFile(path.join(directory, 'files', oldFile.storage_key)), original, 'previous bytes survive until the metadata transaction commits');
  await request('/contracts', 'POST', payload, 409);
  const unknown = (await request('/contracts', 'POST', { ...payload, code: 'HD-UNKNOWN', employeeCode: 'UNKNOWN', employeeName: 'Unknown person' }, 201)).contract;
  const check = new DatabaseSync(env.KIYOVN_DB_PATH, { readOnly: true });
  try { assert.equal(check.prepare('SELECT employee_user_id FROM contracts WHERE id = ?').get(unknown.id).employee_user_id, null); }
  finally { check.close(); }
});

test('company profile stores all legal fields, validates dates and settings, rejects stale writes and feeds generated Word contracts', async () => {
  const initial = (await request('/system/company-profile')).profile;
  assert.equal(initial.companyName, ''); assert.equal(initial.taxCode, ''); assert.equal(initial.address, '');
  assert.equal(initial.accountingProfileComplete, false);
  assert.ok(initial.accountingProfileMissing.includes('Loại hình pháp nhân'));
  await request('/finance/general-ledger/entries', 'POST', { voucherCode: 'NO-PROFILE', entryDate: '2026-10-01', description: 'Thiếu hồ sơ', debitAccount: 'TK 642', creditAccount: 'TK 112', amount: 100 }, 409);
  await request('/collections/finance_advances', 'POST', { record: { key: 'advance-no-profile' } }, 409);
  for (const [route, payload] of [
    ['/finance/payments', {}], ['/finance/cash-transactions', {}], ['/finance/internal-transfers', {}],
    ['/finance/inventory/transactions', {}], ['/finance/payroll/ledger-preview', {}],
    ['/finance/payroll/adjustment-preview', {}], ['/finance/documents', {}],
  ]) await request(route, 'POST', payload, 409);
  await request('/system/company-profile', 'PUT', { ...initial, companyName: '' }, 422);
  const bank = (await request('/finance/bank-accounts', 'POST', { bankName: 'Configured Bank', accountNumber: '0012345', accountHolder: 'Configured Company', balance: 0, status: 'Đang hoạt động' }, 201)).account;
  const profile = { ...initial, companyName: 'Doanh nghiệp cấu hình', fullName: 'Tên pháp nhân đầy đủ', shortName: 'DN', companyCode: 'DN-001', taxCode: '0012345678', businessType: 'Công nghệ', establishedDate: '2020-02-29', registrationDate: '2020-03-01', registrationNo: 'DK-001', registrationIssuer: 'Nơi cấp đã nhập', representative: 'Đại diện đã nhập', representativeTitle: 'Giám đốc đã nhập', address: 'Địa chỉ đã nhập', phone: '+84900000000', fax: '0100000000', email: 'office@example.test', website: 'https://example.test/vi', domain: 'portal.example.test', timezone: 'UTC', currency: 'USD', bankAccountId: bank.key, legalForm: 'llc_single', companySize: 'small', industry: 'Công nghệ', accountingRegime: 'TT99', fiscalYearStartMonth: 1, fiscalYearStartDay: 1, vatMethod: 'deduction', updatedBy: 'forged' };
  for (const invalid of [
    { establishedDate: '2026-02-30' }, { email: 'invalid' }, { website: 'javascript:alert(1)' },
    { domain: 'user:password@example.test' }, { domain: 'example.test/path' }, { timezone: 'Invented' },
    { currency: 'Invented' }, { bankAccountId: 'missing' }, { legalForm: 'invented' },
    { accountingRegime: 'TT58' }, { legalForm: 'household_business', accountingRegime: 'TT99' },
    { companySize: 'medium', accountingRegime: 'TT132' },
    { legalForm: 'cooperative', companySize: 'small', accountingRegime: 'TT133' },
    { fiscalYearStartMonth: 2, fiscalYearStartDay: 30 }, { fiscalYearStartMonth: 1, fiscalYearStartDay: null },
  ]) await request('/system/company-profile', 'PUT', { ...profile, ...invalid }, 422);
  const household = (await request('/system/company-profile', 'PUT', { ...profile, legalForm: 'household_business', companySize: 'micro', accountingRegime: 'TT152' })).profile;
  assert.equal(household.accountingProfileComplete, true);
  const cooperative = (await request('/system/company-profile', 'PUT', { ...household, legalForm: 'cooperative', companySize: 'large', accountingRegime: 'TT24' })).profile;
  assert.equal(cooperative.accountingProfileComplete, true);
  const cooperativeDraft = (await request('/system/company-profile', 'PUT', { ...cooperative, accountingRegime: 'TT133' })).profile;
  assert.equal(cooperativeDraft.accountingProfileComplete, false);
  assert.ok(cooperativeDraft.accountingProfileMissing.includes('Xác nhận điều kiện HTX quy mô lớn áp dụng TT133'));
  const cooperativeTT133 = (await request('/system/company-profile', 'PUT', { ...cooperativeDraft, cooperativeUsesTT133: true })).profile;
  assert.equal(cooperativeTT133.accountingProfileComplete, true);
  const saved = (await request('/system/company-profile', 'PUT', { ...profile, updatedAt: cooperativeTT133.updatedAt, revision: cooperativeTT133.revision })).profile;
  assert.equal(saved.taxCode, '0012345678'); assert.equal(saved.updatedBy, session.user.name); assert.equal(saved.revision, 5);
  assert.equal(saved.accountingProfileComplete, true);
  for (const key of ['fullName', 'shortName', 'companyCode', 'businessType', 'establishedDate', 'registrationDate', 'registrationNo', 'registrationIssuer', 'representative', 'representativeTitle', 'phone', 'fax', 'email', 'website', 'domain', 'timezone', 'currency', 'bankAccountId', 'legalForm', 'companySize', 'industry', 'accountingRegime', 'cooperativeUsesTT133', 'fiscalYearStartMonth', 'fiscalYearStartDay', 'vatMethod']) assert.equal(saved[key], profile[key], key);
  assert.deepEqual((await request('/system/company-profile')).profile, saved);
  await request('/system/company-profile', 'PUT', { ...profile, companyName: 'Stale' }, 409);
  const second = (await request('/system/company-profile', 'PUT', { ...saved, shortName: 'NEW' })).profile;
  assert.equal(second.revision, 6);
  await request('/system/company-profile', 'PUT', { ...saved, companyName: 'Stale again' }, 409);
  assert.equal((await request('/system/company-profile')).profile.shortName, 'NEW');
  const taxDraft = (await request('/collections/finance_tax', 'POST', { record: { key: 'tax-draft-profile', code: 'TAX-TEST', taxType: 'Thuế GTGT', period: 'Quý IV/2026', deadline: '2027-01-30', amountPayable: 1200, amountPaid: 1200, status: 'Đã nộp đủ' } }, 201)).record;
  assert.equal(taxDraft.amountPaid, 0);
  assert.equal(taxDraft.status, 'Chờ nộp thuế');
  await request('/collections/finance_tax', 'POST', { record: { key: 'tax-invalid', code: 'TAX-INVALID', taxType: 'Thuế GTGT', period: 'Quý IV/2026', deadline: '2027-02-30', amountPayable: 1200 } }, 422);
  const invoiceDraft = (await request('/collections/finance_einvoices', 'POST', { record: { key: 'invoice-draft-profile', invoiceNumber: 'DRAFT-1', buyerName: 'Khách kiểm thử', buyerTaxCode: '0012345678', issueDate: '2026-10-10', totalAmount: 1000, vatRate: '10%', vatAmount: 5, finalAmount: 9999, status: 'Đã phát hành & Ký số', cqtCode: 'forged' } }, 201)).record;
  assert.equal(invoiceDraft.status, 'Hóa đơn nháp');
  assert.equal(invoiceDraft.externalStatus, 'Chưa gửi nhà cung cấp');
  assert.equal(invoiceDraft.vatAmount, 100);
  assert.equal(invoiceDraft.finalAmount, 1100);
  assert.equal(invoiceDraft.cqtCode, undefined);
  await request('/collections/finance_einvoices', 'POST', { record: { key: 'invoice-invalid', invoiceNumber: 'DRAFT-INVALID', buyerName: 'Khách kiểm thử', issueDate: '2026-10-10', totalAmount: 1000, vatRate: '20%' } }, 422);
  const journalEntry = async (voucherCode, debitAccount, creditAccount, amount) => request('/finance/general-ledger/entries', 'POST', {
    voucherCode, entryDate: '2026-10-10', description: `Kiểm thử ${voucherCode}`, debitAccount, creditAccount, amount,
  }, 201);
  await request('/finance/general-ledger/entries', 'POST', { voucherCode: 'INVALID-JOURNAL', entryDate: '2026-10-10', description: 'Sai', debitAccount: 'TK 642', creditAccount: 'TK 642', amount: 100 }, 422);
  await journalEntry('SALE-Q4-1', 'TK 131', 'TK 511', 1000);
  await journalEntry('EXPENSE-Q4-1', 'TK 642', 'TK 112', 400);
  await request('/finance/general-ledger/entries', 'POST', { voucherCode: 'SALE-Q4-1', entryDate: '2026-10-10', description: 'Trùng', debitAccount: 'TK 131', creditAccount: 'TK 511', amount: 1000 }, 409);
  const closeResult = await request('/finance/general-ledger/close', 'POST', { period: '2026-Q4' }, 201);
  assert.equal(closeResult.entries, 3);
  assert.ok(closeResult.records.every(record => record.status === 'Đã ghi sổ cái'));
  await request('/finance/general-ledger/close', 'POST', { period: '2026-Q4' }, 409);
  await request('/collections/finance_general_ledger', 'PUT', { records: [] }, 409);
  await request('/collections/finance_general_ledger/SALE-Q4-1', 'DELETE', undefined, 409);
  const currentProfile = (await request('/system/company-profile')).profile;
  await request('/system/company-profile', 'PUT', { ...currentProfile, accountingRegime: 'TT133' }, 409);
  const contract = (await request('/contracts', 'POST', { code: 'HD-COMPANY-CONFIG', name: 'Company profile output', contractTemplate: 'Test', employeeCode: 'STAFF-TEST', employeeName: 'Actual staff' }, 201)).contract;
  const word = await fetch(`${base}/files/${contract.fileNodeId}/download`, { headers });
  const bytes = Buffer.from(await word.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  for (const field of ['fullName', 'taxCode', 'representative', 'representativeTitle', 'address']) assert.ok(bytes.toString('utf8').includes(profile[field]), field);
  const staffLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'staff@example.test', password: 'Operations-Test-26!Safe' }) });
  const staff = await staffLogin.json();
  for (const method of ['GET', 'PUT']) assert.equal((await fetch(`${base}/system/company-profile`, { method, headers: { Authorization: `Bearer ${staff.access_token}`, 'Content-Type': 'application/json' }, body: method === 'PUT' ? JSON.stringify(second) : undefined })).status, 403);
});

test('SMTP configuration keeps credentials encrypted, supports updates without revealing the saved password and reports failed delivery', async () => {
  const initial = (await request('/system/email-config')).config;
  assert.equal(initial.password, '');
  assert.equal(initial.passwordConfigured, false);
  const password = 'SMTP-Secret-26!NeverReturn';
  const payload = {
    host: 'smtp.example.test', port: 587, username: 'mailer@example.test', senderEmail: 'mailer@example.test',
    senderName: 'KIYOVN test mailer', security: 'STARTTLS', portalUrl: 'https://portal.example.test', enabled: true, password,
  };
  const saved = (await request('/system/email-config', 'PUT', payload)).config;
  assert.equal(saved.password, '');
  assert.equal(saved.passwordConfigured, true);
  assert.equal(saved.configured, true);
  const { DatabaseSync } = await import('node:sqlite');
  const check = new DatabaseSync(env.KIYOVN_DB_PATH, { readOnly: true });
  let encryptedSetting;
  try {
    encryptedSetting = JSON.parse(check.prepare("SELECT setting_value FROM system_settings WHERE setting_key = 'email_config'").get().setting_value);
  } finally { check.close(); }
  assert.ok(encryptedSetting.passwordEncrypted);
  assert.ok(!JSON.stringify(encryptedSetting).includes(password), 'database settings must not contain the SMTP password as plaintext');
  assert.ok(!JSON.stringify(saved).includes(password), 'API responses must never return the SMTP password');
  const updated = (await request('/system/email-config', 'PUT', { ...payload, host: 'mail2.example.test', password: '' })).config;
  assert.equal(updated.host, 'mail2.example.test');
  assert.equal(updated.password, '');
  assert.equal(updated.passwordConfigured, true, 'empty password update must retain the encrypted server credential');
  await request('/system/email-config', 'PUT', { ...payload, senderEmail: 'invalid-email', password: '' }, 422);
  assert.equal((await request('/system/email-config')).config.host, 'mail2.example.test');

  const user = (await request('/users', 'POST', {
    email: 'smtp-user@example.test', name: 'SMTP settings user', employeeCode: 'SMTP-USER', role: 'USER', password: 'SMTP-User-26!Strong',
  }, 201)).user;
  const userLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: user.email, password: 'SMTP-User-26!Strong' }) });
  const userSession = await userLogin.json();
  const userHeaders = { Authorization: `Bearer ${userSession.access_token || userSession.token}`, 'Content-Type': 'application/json' };
  for (const [method, route, body] of [['GET', '/system/email-config'], ['PUT', '/system/email-config', payload]]) {
    const response = await fetch(`${base}${route}`, { method, headers: userHeaders, body: body === undefined ? undefined : JSON.stringify(body) });
    assert.equal(response.status, 403);
  }

  const probe = createServer();
  await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
  const unusedPort = probe.address().port;
  await new Promise(resolve => probe.close(resolve));
  await request('/system/email-config', 'PUT', { ...payload, host: '127.0.0.1', port: unusedPort, security: 'SSL', password: '' });
  await request('/system/email-config/test', 'POST', { recipient: 'mailer@example.test' }, 422);
});

