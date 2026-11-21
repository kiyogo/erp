import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-registers-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'registers@example.test', SEED_ADMIN_PASSWORD: 'Registers-Test-26!Secure', SEED_ADMIN_EMPLOYEE_CODE: 'TEST-REG', JWT_SECRET: 'isolated-registers-test-secret',
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
const login = await (await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }) })).json();
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.access_token || login.token}` };
async function call(route, method = 'GET', payload) {
  const response = await fetch(`${base}${route}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}
const create = (scope, record) => call(`/collections/${scope}`, 'POST', { record });
const patch = (scope, key, body) => call(`/collections/${scope}/${key}`, 'PATCH', { patch: body });

test('sổ kế toán cần hồ sơ kế toán đầy đủ trước khi ghi nhận', async () => {
  assert.equal((await create('finance_equity', { shareholderCode: 'CD-1' })).status, 409);
  const initial = (await call('/system/company-profile')).body.profile;
  const bank = (await call('/finance/bank-accounts', 'POST', { bankName: 'Ngân hàng thử', accountNumber: '0012345', accountHolder: 'Công ty thử', balance: 0, status: 'Đang hoạt động' })).body.account;
  const profile = { ...initial, companyName: 'Công ty thử nghiệm', fullName: 'Công ty thử nghiệm đầy đủ', shortName: 'CTTN', companyCode: 'CT-001', taxCode: '0012345672', businessType: 'Công nghệ', establishedDate: '2020-02-29', registrationDate: '2020-03-01', registrationNo: 'DK-001', registrationIssuer: 'Sở thử', representative: 'Người đại diện', representativeTitle: 'Giám đốc', address: 'Địa chỉ thử', phone: '+84900000000', fax: '0100000000', email: 'office@example.test', website: 'https://example.test', domain: 'portal.example.test', timezone: 'UTC', currency: 'VND', bankAccountId: bank.key, legalForm: 'llc_single', companySize: 'small', industry: 'Công nghệ', accountingRegime: 'TT99', accountingEffectiveDate: '2026-01-01', fiscalYearStartMonth: 1, fiscalYearStartDay: 1, vatMethod: 'deduction' };
  const saved = await call('/system/company-profile', 'PUT', profile);
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
});

test('sổ cổ đông: vốn góp là số cổ phần nhân mệnh giá, không lưu tỷ lệ và cổ tức tự bịa', async () => {
  const created = await create('finance_equity', { shareholderCode: 'cd-001', type: 'Cổ đông sáng lập', fullName: 'Nguyễn Văn A', idNumber: '001099000001', address: 'Hà Nội', sharesCount: 1200, parValue: 10000, joinDate: '2026-01-15', ownershipPercentage: 99, pendingDividend: 123456 });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.record.shareholderCode, 'CD-001');
  assert.equal(created.body.record.capitalValue, 12_000_000);
  for (const field of ['ownershipPercentage', 'pendingDividend', 'paidDividends']) assert.equal(created.body.record[field], undefined, field);
  assert.equal((await create('finance_equity', { shareholderCode: 'CD-001', type: 'Cổ đông phổ thông', fullName: 'B', idNumber: '1', address: 'x', sharesCount: 1, parValue: 1, joinDate: '2026-01-01' })).status, 409);
  const base = { type: 'Cổ đông phổ thông', fullName: 'B', idNumber: '1', address: 'x', joinDate: '2026-01-01' };
  for (const [index, bad] of [{ sharesCount: 0, parValue: 10000 }, { sharesCount: 10.5, parValue: 10000 }, { sharesCount: 100, parValue: -1 }, { sharesCount: 1e9, parValue: 1e12 }].entries()) {
    assert.equal((await create('finance_equity', { ...base, shareholderCode: `BAD-${index}`, ...bad })).status, 422, JSON.stringify(bad));
  }
});

test('tài sản cố định và chi phí trả trước: số phái sinh do máy chủ tính, tài khoản trả trước là 242', async () => {
  const asset = await create('finance_fixed_assets', { code: 'tscd-1', name: 'Máy chủ', category: 'Máy móc và thiết bị', department: 'Kỹ thuật', originalValue: 36_000_000, depreciationMonths: 36, accumulatedDepreciation: 3_000_000, commissioningDate: '2026-01-01', bookValue: 1, monthlyDepreciation: 1, status: 'Sai' });
  assert.equal(asset.status, 201, JSON.stringify(asset.body));
  assert.equal(asset.body.record.monthlyDepreciation, 1_000_000);
  assert.equal(asset.body.record.bookValue, 33_000_000);
  assert.equal(asset.body.record.status, 'Đang trích khấu hao');
  const finished = await patch('finance_fixed_assets', asset.body.record.key, { accumulatedDepreciation: 36_000_000 });
  assert.equal(finished.body.record.status, 'Đã khấu hao hết');
  assert.equal((await patch('finance_fixed_assets', asset.body.record.key, { accumulatedDepreciation: 37_000_000 })).status, 422);
  assert.equal((await create('finance_fixed_assets', { code: 'TSCD-1', name: 'Trùng', category: 'x', department: 'x', originalValue: 1, depreciationMonths: 1, commissioningDate: '2026-01-01' })).status, 409);

  const prepaid = await create('finance_prepaid', { code: 'cptt-1', name: 'Thuê văn phòng', category: 'Chi phí thuê địa điểm', department: 'Hành chính', totalAmount: 100_000_000, allocationMonths: 24, allocatedAmount: 0, startDate: '2026-02-01', accountCode: 'TK 2422' });
  assert.equal(prepaid.status, 201, JSON.stringify(prepaid.body));
  assert.equal(prepaid.body.record.accountCode, '242');
  assert.equal(prepaid.body.record.monthlyAmount, 4_166_667);
  assert.equal(prepaid.body.record.remainingAmount, 100_000_000);
  assert.equal(prepaid.body.record.status, 'Đang phân bổ');
  assert.equal((await create('finance_prepaid', { code: 'CPTT-2', name: 'x', category: 'x', department: 'x', totalAmount: 1000, allocationMonths: 0, startDate: '2026-02-01' })).status, 422);
});

test('chứng thư số: không lưu trạng thái, không trùng serial, lịch sử gia hạn chỉ thêm', async () => {
  const cert = { certNumber: '5401ABCD', provider: 'Nhà cung cấp thử', subjectName: 'Công ty thử nghiệm', signType: 'Cloud CA', authorizedSigner: 'Giám đốc', validFrom: '2026-01-01', validTo: '2027-01-01', renewals: [], status: 'Còn hiệu lực' };
  const created = await create('finance_digital_signatures', cert);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.record.status, undefined, 'trạng thái suy ra theo ngày hết hạn, không lưu');
  assert.equal((await create('finance_digital_signatures', cert)).status, 409);
  assert.equal((await create('finance_digital_signatures', { ...cert, certNumber: 'X2', validTo: '2025-12-31' })).status, 422);
  assert.equal((await create('finance_digital_signatures', { ...cert, certNumber: 'X3', signType: 'Khác' })).status, 422);

  const key = created.body.record.key;
  const renewed = await patch('finance_digital_signatures', key, {
    certNumber: '5401EFGH', validFrom: '2027-01-01', validTo: '2029-01-01',
    renewals: [{ previousCertNumber: '5401ABCD', previousValidFrom: '2026-01-01', previousValidTo: '2027-01-01', note: 'Gia hạn 2 năm' }],
  });
  assert.equal(renewed.status, 200, JSON.stringify(renewed.body));
  assert.equal(renewed.body.record.renewals.length, 1);
  assert.equal(renewed.body.record.renewals[0].recordedBy.length > 0, true);
  assert.equal((await patch('finance_digital_signatures', key, { renewals: [] })).status, 422, 'không được xóa lịch sử gia hạn');
});
