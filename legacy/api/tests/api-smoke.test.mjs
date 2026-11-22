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
const profile = (await request('/system/company-profile')).profile;
await request('/system/company-profile', 'PUT', {
  ...profile, companyName: 'Doanh nghiệp kiểm thử', taxCode: '0012345672', legalForm: 'llc_single',
  companySize: 'small', industry: 'Kiểm thử', accountingRegime: 'TT133', accountingEffectiveDate: '2026-01-01',
  fiscalYearStartMonth: 1, fiscalYearStartDay: 1, vatMethod: 'deduction',
});

test('ledger posting requires an accounting chart for the active regime before accepting entries', async () => {
  await request('/finance/general-ledger/entries', 'POST', {
    voucherCode: 'NO-CHART-001', entryDate: '2026-10-30', description: 'Kiểm tra bắt buộc có danh mục tài khoản',
    lines: [{ account: '111', debit: 100, credit: 0 }, { account: '511', debit: 0, credit: 100 }],
  }, 422);
  const imported = await request('/finance/chart-of-accounts/templates/import', 'POST', {}, 201);
  assert.equal(imported.template.name, 'Thông tư 133/2016/TT-BTC');
  assert.equal(imported.createdCount, 123);
  const repeated = await request('/finance/chart-of-accounts/templates/import', 'POST', {}, 200);
  assert.equal(repeated.createdCount, 0);
  assert.equal(repeated.skippedCount, 123);
});

test('e-invoice drafts can be edited without allowing forged issue state or duplicate draft numbers', async () => {
  const firstNumber = `DRAFT-EDIT-${Date.now()}`;
  const productKey = `einvoice-product-${Date.now()}`;
  await request('/collections/finance_inventory', 'POST', { record: {
    key: productKey, sku: `INV-${Date.now()}`, name: 'Thiết bị kiểm thử', unit: 'Cái',
  } }, 201);
  const customer = (await request('/crm/contacts', 'POST', {
    type: 'customer', name: 'Khách hàng hóa đơn thử', taxCode: '0101234565', address: 'Hà Nội', email: 'hoa-don@example.vn', status: 'Đang hoạt động',
  }, 201)).contact;
  const first = (await request('/collections/finance_einvoices', 'POST', { record: {
    key: `einvoice-edit-${Date.now()}`, invoiceNumber: firstNumber, buyerName: 'Khách hàng thử', buyerTaxCode: '0101234565',
    buyerType: 'organization', buyerCustomerKey: customer.key, buyerEntityName: customer.name, buyerAddress: customer.address, buyerEmail: customer.email,
    issueDate: '2026-11-04', totalAmount: 1, vatRate: '100%', status: 'Đã phát hành', externalStatus: 'CQT đã cấp mã',
    items: [{ key: 'line-1', productKey, sku: 'MA-GIA', name: 'Tên giả', unit: 'Sai', quantity: 2, unitPrice: 50000, discountAmount: 0, vatRate: 8, amount: 1, vatAmount: 999999, finalAmount: 1000000 }],
  } }, 201)).record;
  assert.equal(first.status, 'Hóa đơn nháp');
  assert.equal(first.externalStatus, 'Chưa gửi nhà cung cấp');
  assert.equal(first.buyerCustomerKey, customer.key);
  assert.equal(first.buyerEmail, 'hoa-don@example.vn');
  assert.equal(first.totalAmount, 100000);
  assert.equal(first.vatAmount, 8000);
  assert.equal(first.items[0].sku.startsWith('INV-'), true);
  assert.equal(first.items[0].name, 'Thiết bị kiểm thử');
  assert.equal(first.items[0].unit, 'Cái');

  const validation = await request('/collections/finance_einvoices/validate', 'POST', { currentKey: first.key, record: {
    key: first.key, invoiceNumber: `${firstNumber}-KIEM-TRA`, buyerName: first.buyerName, buyerType: first.buyerType,
    buyerCustomerKey: customer.key, buyerTaxCode: first.buyerTaxCode, buyerEmail: first.buyerEmail, issueDate: first.issueDate,
    items: first.items,
  } });
  assert.equal(validation.valid, true);
  assert.equal(validation.record.totalAmount, 100000);
  const afterValidation = (await request('/collections/finance_einvoices')).data.find(record => record.key === first.key);
  assert.equal(afterValidation.invoiceNumber, firstNumber);

  const updated = (await request(`/collections/finance_einvoices/${first.key}`, 'PATCH', { patch: {
    key: first.key, invoiceNumber: `${firstNumber}-SUA`, buyerName: 'Khách hàng đã cập nhật', buyerTaxCode: '0101234565',
    buyerType: 'person', buyerEntityName: '', buyerCustomerKey: customer.key, buyerPhone: '0900000000',
    items: [{ key: 'line-1', productKey, quantity: 5, unitPrice: 50000, discountAmount: 0, vatRate: 0 }],
  } })).record;
  assert.equal(updated.invoiceNumber, `${firstNumber}-SUA`);
  assert.equal(updated.buyerName, 'Khách hàng đã cập nhật');
  assert.equal(updated.buyerType, 'person');
  assert.equal(updated.buyerPhone, '0900000000');
  assert.equal(updated.vatRate, 0);
  assert.equal(updated.vatAmount, 0);
  assert.equal(updated.finalAmount, 250000);
  assert.equal(updated.status, 'Hóa đơn nháp');
  assert.equal(updated.externalStatus, 'Chưa gửi nhà cung cấp');

  await request(`/collections/finance_einvoices/${first.key}`, 'PATCH', { patch: { status: 'Đã phát hành' } }, 422);
  await request(`/collections/finance_einvoices/${first.key}`, 'PATCH', { patch: {
    items: [{ key: 'line-1', productKey, quantity: -1, unitPrice: 50000, vatRate: 0 }],
  } }, 422);
  await request(`/collections/finance_einvoices/${first.key}`, 'PATCH', { patch: { buyerCustomerKey: 'missing-einvoice-customer' } }, 422);
  await request(`/collections/finance_einvoices/${first.key}`, 'PATCH', { patch: { buyerEmail: 'khong-phai-email' } }, 422);
  await request(`/collections/finance_einvoices/${first.key}`, 'PATCH', { patch: { buyerType: 'loai-khac' } }, 422);
  const second = (await request('/collections/finance_einvoices', 'POST', { record: {
    key: `einvoice-edit-duplicate-${Date.now()}`, invoiceNumber: `DRAFT-OTHER-${Date.now()}`, buyerName: 'Khách hàng khác',
    issueDate: '2026-11-04', totalAmount: 100000, vatRate: '0%',
  } }, 201)).record;
  await request(`/collections/finance_einvoices/${first.key}`, 'PATCH', { patch: { invoiceNumber: second.invoiceNumber } }, 409);
  await request('/collections/finance_einvoices/validate', 'POST', { currentKey: first.key, record: {
    key: first.key, invoiceNumber: second.invoiceNumber, buyerName: first.buyerName, buyerType: first.buyerType, issueDate: first.issueDate,
    items: first.items,
  } }, 409);
});

test('e-invoice template records remain internal drafts and enforce uniqueness and field permissions', async () => {
  const stamp = Date.now();
  const key = `einvoice-template-${stamp}`;
  const record = {
    key, templateName: 'Mẫu thử nội bộ', templateType: 'Hóa đơn giá trị gia tăng', templateCode: '1', symbol: 'C26TAA', version: '1.0',
    providerTaxId: '0101243150', providerName: 'Nhà cung cấp thử', providerWebsite: 'https://example.vn',
    effectiveFrom: '2026-01-01', effectiveTo: '2026-12-31', internalNote: 'Chưa đối chiếu',
    status: 'Đã đăng ký', externalStatus: 'CQT đã chấp thuận',
  };
  const created = (await request('/collections/finance_einvoice_templates', 'POST', { record }, 201)).record;
  assert.equal(created.status, 'Nháp nội bộ · chưa xác minh');
  assert.equal(created.externalStatus, 'Chưa gửi nhà cung cấp');
  assert.equal((await request('/collections/finance_einvoice_templates')).data.some(item => item.key === key), true);
  await request('/collections/finance_einvoice_templates', 'POST', { record: { ...record, key: `${key}-duplicate` } }, 409);
  await request(`/collections/finance_einvoice_templates/${key}`, 'PATCH', { patch: { status: 'Đã xác minh' } }, 422);
  const updated = (await request(`/collections/finance_einvoice_templates/${key}`, 'PATCH', { patch: { version: '1.1' } })).record;
  assert.equal(updated.version, '1.1');
  assert.equal(updated.status, 'Nháp nội bộ · chưa xác minh');
  const invoiceKey = `einvoice-template-reference-${stamp}`;
  const invoice = (await request('/collections/finance_einvoices', 'POST', { record: {
    key: invoiceKey, invoiceNumber: invoiceKey, templateKey: key, buyerName: 'Người mua thử', issueDate: '2026-11-04', totalAmount: 10000, vatRate: 0,
  } }, 201)).record;
  assert.equal(invoice.templateType, 'Hóa đơn giá trị gia tăng');
  assert.equal(invoice.templateCode, '1');
  assert.equal(invoice.symbol, 'C26TAA');
  assert.equal(invoice.providerTaxId, '0101243150');
  await request(`/collections/finance_einvoice_templates/${key}`, 'DELETE', {}, 409);
  const unlinked = (await request(`/collections/finance_einvoices/${invoiceKey}`, 'PATCH', { patch: { templateKey: '' } })).record;
  assert.equal(unlinked.templateType, '');
  assert.equal(unlinked.templateCode, '');
  assert.equal(unlinked.symbol, '');
  await request(`/collections/finance_einvoice_templates/${key}`, 'DELETE', {}, 200);
  await request(`/collections/finance_einvoices/${invoiceKey}`, 'DELETE', {}, 200);
  assert.equal((await request('/collections/finance_einvoice_templates')).data.some(item => item.key === key), false);
});

test('tax type profiles are internal references and only active saved profiles can create tax filings', async () => {
  const stamp = Date.now();
  const key = `tax-type-${stamp}`;
  const profile = {
    key, taxCode: `TEST-${stamp}`, taxName: `Sắc thuế kiểm thử ${stamp}`, taxGroup: 'Nghĩa vụ khác',
    calculationMethod: 'Theo căn cứ được doanh nghiệp đối chiếu', taxpayerScope: 'Đối tượng được xác định trong hồ sơ doanh nghiệp',
    taxRateReference: 'Chỉ tham chiếu; không tính tự động', effectiveFrom: '2026-01-01', effectiveTo: '',
    legalBasis: 'Văn bản do người dùng khai báo, chưa được xác minh', conditions: '', exceptions: '',
    debitAccount: '3338', creditAccount: '1121', status: 'Đang theo dõi', verificationStatus: 'Đã xác minh', rateUsedForCalculation: true,
  };
  const created = (await request('/collections/finance_tax_types', 'POST', { record: profile }, 201)).record;
  assert.equal(created.verificationStatus, 'Chưa xác minh');
  assert.equal(created.rateUsedForCalculation, false);
  await request('/collections/finance_tax_types', 'POST', { record: { ...profile, key: `${key}-duplicate` } }, 409);
  const filingKey = `tax-custom-filing-${stamp}`;
  const filing = (await request('/collections/finance_tax', 'POST', { record: {
    key: filingKey, code: filingKey.toUpperCase(), taxType: created.taxName, period: 'Kỳ thử nghiệm',
    filingMethod: 'Quý', taxYear: 2026, periodStart: '2026-07-01', periodEnd: '2026-09-30',
    filingDeadline: '2026-10-31', deadline: '2026-11-10', businessUnit: 'Chi nhánh thử nghiệm',
    assignee: 'Kế toán thử nghiệm', notes: 'Kỳ nhập thủ công để kiểm thử', amountPayable: 0,
  } }, 201)).record;
  assert.equal(filing.taxType, created.taxName);
  assert.equal(filing.filingMethod, 'Quý');
  assert.equal(filing.periodStart, '2026-07-01');
  assert.equal(filing.filingDeadline, '2026-10-31');
  assert.equal(filing.assignee, 'Kế toán thử nghiệm');
  await request('/collections/finance_tax', 'POST', { record: {
    key: `${filingKey}-invalid-range`, code: `${filingKey}-invalid-range`, taxType: created.taxName,
    period: 'Kỳ thử nghiệm', filingMethod: 'Quý', taxYear: 2026, periodStart: '2026-10-01', periodEnd: '2026-09-30',
    deadline: '2026-12-31', amountPayable: 0,
  } }, 422);
  await request(`/collections/finance_tax_types/${key}`, 'PATCH', { patch: { taxName: `${created.taxName} đổi tên` } }, 409);
  await request('/collections/finance_tax', 'POST', { record: {
    key: `${filingKey}-unknown`, code: `${filingKey}-unknown`, taxType: 'Sắc thuế chưa được khai báo',
    period: 'Kỳ thử nghiệm', deadline: '2026-12-31', amountPayable: 0,
  } }, 422);
  const paused = (await request(`/collections/finance_tax_types/${key}`, 'PATCH', { patch: { status: 'Tạm ngưng' } })).record;
  assert.equal(paused.status, 'Tạm ngưng');
  await request('/collections/finance_tax', 'POST', { record: {
    key: `${filingKey}-paused`, code: `${filingKey}-paused`, taxType: created.taxName,
    period: 'Kỳ thử nghiệm', deadline: '2026-12-31', amountPayable: 0,
  } }, 422);
  await request(`/collections/finance_tax_types/${key}`, 'DELETE', {}, 409);
});

test('supplier tax reviews require a real CRM supplier and evidence before recording a reviewed source', async () => {
  const stamp = Date.now();
  const supplier = (await request('/crm/contacts', 'POST', {
    type: 'supplier', name: `Nhà cung cấp rà soát ${stamp}`, taxCode: '0109876532', status: 'Đang hoạt động',
  }, 201)).contact;
  const workspace = await request('/files?scope=employee');
  const evidenceFolder = (await request('/files/folders', 'POST', {
    name: `tax-review-${stamp}`, parentId: workspace.context.parentId, originModule: 'finance_tax',
  }, 201)).file;
  const upload = await fetch(`${base}/files/upload`, {
    method: 'POST',
    headers: { Authorization: headers.Authorization, 'Content-Type': 'application/pdf', 'X-File-Name': `tax-review-${stamp}.pdf`, 'X-Origin-Module': 'finance_tax', 'X-Parent-Id': evidenceFolder.id },
    body: Buffer.from('isolated test evidence'),
  });
  assert.equal(upload.status, 201);
  const evidence = (await upload.json()).file;
  const key = `tax-supplier-review-${stamp}`;
  const record = {
    key, supplierKey: supplier.key, supplierName: 'Giá trị giả', taxCode: '0000000000', sourceCode: 'SRC-TEST',
    sourceName: 'Nguồn kiểm thử nội bộ', sourceReference: 'Mã tham chiếu nguồn SRC-TEST', verifiedAt: '2026-11-04',
    verificationStatus: 'Đã rà soát nguồn', riskIndicators: 'Ghi nhận nội dung cần đối chiếu theo nguồn',
    invoiceReference: 'INV-TEST-01', internalSeverity: 'Trung bình', assignee: 'Người xử lý kiểm thử',
    reviewOutcome: 'Đang rà soát nội bộ', notes: 'Không kết luận vi phạm.', evidenceFileId: evidence.id, evidenceFileName: evidence.name,
  };
  const saved = (await request('/collections/finance_tax_supplier_reviews', 'POST', { record }, 201)).record;
  assert.equal(saved.supplierName, supplier.name);
  assert.equal(saved.taxCode, supplier.taxCode);
  assert.equal(saved.status, 'Theo dõi nội bộ');
  assert.equal(typeof saved.reviewedBy, 'string');
  assert.ok(saved.reviewedAt);
  await request('/collections/finance_tax_supplier_reviews', 'POST', { record: { ...record, key: `${key}-missing-evidence`, evidenceFileId: '' } }, 422);
  await request(`/collections/finance_tax_supplier_reviews/${key}`, 'PATCH', { patch: { reviewOutcome: 'Đã cập nhật ghi chú' } }, 200);
  await request(`/files/${evidence.id}`, 'PATCH', { name: 'evidence-renamed.pdf' }, 409);
  await request(`/files/${evidence.id}`, 'DELETE', {}, 409);
  await request(`/collections/finance_tax_supplier_reviews/${key}`, 'DELETE', {}, 405);
});

test('purchase requests validate real departments and suppliers and preserve supplier-selection history', async () => {
  const departmentKey = `purchase-dept-${Date.now()}`;
  await request('/collections/business_org_units', 'POST', {
    record: { key: departmentKey, name: 'Đơn vị thử mua hàng', status: 'Hoạt động', isActive: true },
  }, 201);
  const supplier = (await request('/crm/contacts', 'POST', {
    type: 'supplier', name: `Nhà cung cấp thử ${Date.now()}`, status: 'Đang hợp tác',
  }, 201)).contact;

  const created = (await request('/collections/finance_purchase_requests', 'POST', {
    record: {
      requestNumber: 'YEU-CAU-GIA-MAO', status: 'Đã xác định nhà cung cấp', requester: 'Người giả mạo', requesterId: 'forged',
      departmentKey, deliveryDeadline: '2026-11-15', purpose: 'Mua thiết bị kiểm thử', notes: 'Đủ thông tin',
      estimatedTotal: 0, supplierKey: '', history: [{ action: 'giả mạo' }],
      items: [{ itemName: 'Máy tính', unit: 'Bộ', quantity: 2, estimatedUnitPrice: 12500000 }],
    },
  }, 201)).record;
  assert.match(created.requestNumber, /^YCMS-\d{4}-\d{4}$/);
  assert.equal(created.key, created.requestNumber);
  assert.equal(created.status, 'Chờ xác định nhà cung cấp');
  assert.equal(created.requesterId, session.user.id);
  assert.notEqual(created.requester, 'Người giả mạo');
  assert.equal(created.estimatedTotal, 25000000);
  assert.equal(created.items[0].lineTotal, 25000000);
  assert.equal(created.history.length, 1);
  assert.equal(created.history[0].actorId, session.user.id);

  await request('/collections/finance_purchase_requests', 'POST', { record: {
    departmentKey: 'missing-department', deliveryDeadline: '2026-11-15', purpose: 'Sai đơn vị',
    items: [{ itemName: 'Bút', unit: 'Cái', quantity: 1, estimatedUnitPrice: 0 }],
  } }, 422);
  const inactiveDepartmentKey = `purchase-inactive-dept-${Date.now()}`;
  await request('/collections/business_org_units', 'POST', { record: {
    key: inactiveDepartmentKey, name: 'Đơn vị đã tạm ngưng', status: 'Tạm ngưng', isActive: false,
  } }, 201);
  await request('/collections/finance_purchase_requests', 'POST', { record: {
    departmentKey: inactiveDepartmentKey, deliveryDeadline: '2026-11-15', purpose: 'Đơn vị đã ngừng',
    items: [{ itemName: 'Bút', unit: 'Cái', quantity: 1, estimatedUnitPrice: 0 }],
  } }, 422);
  await request('/collections/finance_purchase_requests', 'POST', { record: {
    departmentKey, deliveryDeadline: '2026-11-15', purpose: 'Số lượng sai',
    items: [{ itemName: 'Bút', unit: 'Cái', quantity: 1.5, estimatedUnitPrice: 0 }],
  } }, 422);
  await request(`/collections/finance_purchase_requests/${created.key}`, 'PATCH', { patch: { status: 'Đã xác định nhà cung cấp' } }, 422);
  await request(`/collections/finance_purchase_requests/${created.key}`, 'PATCH', { patch: { supplierKey: 'supplier-not-found' } }, 422);
  const inactiveSupplier = (await request('/crm/contacts', 'POST', {
    type: 'supplier', name: `Nhà cung cấp tạm ngưng ${Date.now()}`, status: 'Tạm ngưng',
  }, 201)).contact;
  await request(`/collections/finance_purchase_requests/${created.key}`, 'PATCH', { patch: { supplierKey: inactiveSupplier.key } }, 422);
  await request('/collections/finance_purchase_requests', 'PUT', { records: [] }, 405);
  await request(`/collections/finance_purchase_requests/${created.key}`, 'DELETE', undefined, 409);

  const assigned = (await request(`/collections/finance_purchase_requests/${created.key}`, 'PATCH', {
    patch: { supplierKey: supplier.key },
  })).record;
  assert.equal(assigned.status, 'Đã xác định nhà cung cấp');
  assert.equal(assigned.supplierKey, supplier.key);
  assert.equal(assigned.supplierName, supplier.name);
  assert.equal(assigned.supplierSelectedById, session.user.id);
  assert.equal(assigned.history.length, 2);
  assert.equal(assigned.history[1].action, 'Xác định nhà cung cấp');
  await request(`/collections/finance_purchase_requests/${created.key}`, 'PATCH', { patch: { supplierKey: supplier.key } }, 409);

  const raceRequest = (await request('/collections/finance_purchase_requests', 'POST', { record: {
    departmentKey, deliveryDeadline: '2026-11-15', purpose: 'Kiểm tra hai lần chọn nhà cung cấp đồng thời',
    items: [{ itemName: 'Màn hình', unit: 'Cái', quantity: 1, estimatedUnitPrice: 3000000 }],
  } }, 201)).record;
  const assignmentRace = await Promise.all([1, 2].map(async () => {
    const response = await fetch(`${base}/collections/finance_purchase_requests/${raceRequest.key}`, {
      method: 'PATCH', headers, body: JSON.stringify({ patch: { supplierKey: supplier.key } }),
    });
    return { status: response.status, body: await response.json() };
  }));
  assert.deepEqual(assignmentRace.map((item) => item.status).sort((a, b) => a - b), [200, 409]);
  const raceSaved = (await request(`/collections/finance_purchase_requests/${raceRequest.key}`)).record;
  assert.equal(raceSaved.history.length, 2);
  assert.equal(raceSaved.status, 'Đã xác định nhà cung cấp');

  await request('/users', 'POST', {
    email: `purchase-user-${Date.now()}@example.test`, name: 'Nhân viên thử mua hàng',
    password: 'Purchase-User-26!Secure', employeeCode: `PUR-${Date.now()}`, role: 'USER',
  }, 201);
  const userEmail = (await request('/employees')).data.find((item) => item.name === 'Nhân viên thử mua hàng')?.email;
  assert.ok(userEmail);
  const userLogin = await fetch(`${base}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: userEmail, password: 'Purchase-User-26!Secure' }),
  });
  const userSession = await userLogin.json();
  assert.equal(userLogin.status, 200);
  const userHeaders = { ...headers, Authorization: `Bearer ${userSession.access_token || userSession.token}` };
  await request('/collections/finance_purchase_requests', 'GET', undefined, 403, userHeaders);
  await request('/collections/finance_purchase_requests', 'POST', { record: {} }, 403, userHeaders);
  await request(`/collections/finance_purchase_requests/${created.key}`, 'PATCH', { patch: { supplierKey: supplier.key } }, 403, userHeaders);
});

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
  await request('/auth/security-pin', 'POST', { pin: '246810', confirmPin: '246810', currentPassword: env.SEED_ADMIN_PASSWORD });
  Object.assign(headers, { 'X-Security-Pin': '246810' });
  const record = { key: 'payroll-ledger-test-1', employeeCode: 'P-ONE', employeeName: 'Nhân viên', month: '2030-10', status: 'Chưa chi trả', baseSalary: 1000, allowance: 100, bonus: 0, insuranceDeduction: 100, taxDeduction: 50, netSalary: 950 };
  await request('/collections/payroll', 'POST', { record: { ...record, key: 'payroll-forged-paid', status: 'Đã chi trả' } }, 409);
  await request('/collections/payroll', 'POST', { record }, 201);
  const insuranceBreakdown = { employerSocial: 100, employerHealth: 50, employerUnemployment: 50, employeeSocial: 50, employeeHealth: 25, employeeUnemployment: 25 };
  const input = { period: '10/2030', employerInsurance: 200, insuranceBreakdown, costAccount: '6422' };
  const preview = await request('/finance/payroll/ledger-preview', 'POST', input);
  assert.deepEqual(preview.lines.map((line) => line.amount), [1100, 100, 50, 50, 50, 25, 25, 50]);
  await request('/collections/payroll/payroll-ledger-test-1', 'PATCH', { patch: { allowance: 200, netSalary: 1050 } });
  await request('/finance/payroll/ledger-post', 'POST', { ...input, fingerprint: preview.fingerprint }, 409);
  const updatedPreview = await request('/finance/payroll/ledger-preview', 'POST', input);
  const race = await Promise.all([1, 2].map(async () => {
    const response = await fetch(`${base}/finance/payroll/ledger-post`, { method: 'POST', headers, body: JSON.stringify({ ...input, fingerprint: updatedPreview.fingerprint }) });
    return { status: response.status, body: await response.json() };
  }));
  assert.deepEqual(race.map((item) => item.status).sort((a, b) => a - b), [201, 409]);
  const ledger = (await request('/collections/finance_general_ledger')).data.filter((item) => item.sourceReference === 'payroll:10/2030');
  assert.equal(ledger.length, 8);
  const snapshot = (await request('/collections/finance_payroll_postings/10%2F2030')).record;
  assert.equal(snapshot.records[0].netSalary, 1050);
  assert.equal(snapshot.createdById, session.user.id);
  await request('/collections/finance_payroll_postings', 'PUT', { records: [] }, 409);
  assert.equal(ledger[0].author, session.user.name);
  await request(`/collections/finance_general_ledger/${encodeURIComponent(ledger[0].key)}`, 'PATCH', { patch: { amount: 999 } }, 409);
  await request(`/collections/finance_general_ledger/${encodeURIComponent(ledger[0].key)}`, 'DELETE', undefined, 409);
  await request('/collections/finance_general_ledger', 'PUT', { records: [] }, 409);
  await request('/collections/finance_general_ledger', 'POST', { record: { key: 'forged-payroll', sourceModule: 'payroll', sourceReference: 'payroll:10/2030' } }, 409);
  const payrollSource = (await request('/finance/bank-accounts', 'POST', { bankName: 'Ngân hàng lương', accountNumber: '1234567001', accountHolder: 'Doanh nghiệp', balance: 5000, status: 'Đang hoạt động' }, 201)).account;
  const lowBalanceSource = (await request('/finance/bank-accounts', 'POST', { bankName: 'Ngân hàng số dư thấp', accountNumber: '1234567002', accountHolder: 'Doanh nghiệp', balance: 500, status: 'Đang hoạt động' }, 201)).account;
  await request('/finance/payroll/payroll-ledger-test-1/disburse', 'POST', { sourceAccountId: payrollSource.key, paymentDate: '2030-10-30', settlementReference: 'AB' }, 422);
  await request('/finance/payroll/payroll-ledger-test-1/disburse', 'POST', { sourceAccountId: 'missing-account', paymentDate: '2030-10-30', settlementReference: 'PAYROLL-TXN-001' }, 422);
  await request('/finance/payroll/payroll-ledger-test-1/disburse', 'POST', { sourceAccountId: payrollSource.key, paymentDate: '2030-02-30', settlementReference: 'PAYROLL-TXN-002' }, 422);
  await request('/finance/payroll/payroll-ledger-test-1/disburse', 'POST', { sourceAccountId: lowBalanceSource.key, paymentDate: '2030-10-30', settlementReference: 'PAYROLL-TXN-003' }, 422);
  await request('/collections/payroll/payroll-ledger-test-1', 'PATCH', { patch: { status: 'Đã chi trả' } }, 409);
  await request('/collections/payroll/payroll-ledger-test-1', 'PATCH', { patch: { paymentReference: 'FORGED-TXN' } }, 409);
  const disbursement = await request('/finance/payroll/payroll-ledger-test-1/disburse', 'POST', { sourceAccountId: payrollSource.key, paymentDate: '2030-10-30', settlementReference: 'PAYROLL-TXN-004' }, 201);
  assert.equal(disbursement.payroll.status, 'Đã chi trả');
  assert.equal(disbursement.payroll.paymentMethod, 'Tiền gửi');
  assert.equal(disbursement.payroll.paidById, session.user.id);
  assert.equal(disbursement.transaction.type, 'Chi');
  assert.equal(disbursement.transaction.amount, 1050);
  assert.equal(disbursement.transaction.reference, 'PAYROLL-TXN-004');
  assert.equal(disbursement.transaction.journalLines[0].debitAccount, 'TK 334');
  assert.equal(disbursement.transaction.journalLines[0].creditAccount, 'TK 1121');
  assert.equal(disbursement.ledgerEntry.sourceModule, 'payroll_payment');
  assert.equal(disbursement.ledgerEntry.amount, 1050);
  assert.equal((await request('/finance/payment-accounts')).accounts.find((item) => item.key === payrollSource.key).balance, 3950);
  await request('/finance/payroll/payroll-ledger-test-1/disburse', 'POST', { sourceAccountId: payrollSource.key, paymentDate: '2030-10-30', settlementReference: 'PAYROLL-TXN-004' }, 409);
  await request('/collections/payroll/payroll-ledger-test-1', 'PATCH', { patch: { status: 'Chưa chi trả' } }, 409);
  await request('/collections/payroll/payroll-ledger-test-1', 'DELETE', undefined, 409);
  assert.equal((await request('/collections/finance_general_ledger')).data.filter((item) => item.sourceReference === 'payroll:10/2030').length, 8);
  await request('/finance/payroll/ledger-preview', 'POST', { period: '13/2030', employerInsurance: 0 }, 422);
  await request('/finance/payroll/ledger-preview', 'POST', { period: '10/2031', employerInsurance: 0 }, 422);
  await request('/collections/payroll', 'POST', { record: { ...record, key: 'payroll-ledger-test-bad', month: '11/2030' } }, 201);
  const collision = await request('/finance/payroll/ledger-preview', 'POST', { ...input, period: '11/2030' });
  await request('/finance/payroll/ledger-post', 'POST', { ...input, period: '11/2030', fingerprint: collision.fingerprint }, 409);
  assert.equal((await request('/collections/finance_general_ledger')).data.filter((item) => item.sourceReference === 'payroll:11/2030').length, 0);
  await request('/users', 'POST', { email: 'payroll-ledger-user@example.test', name: 'Người thử', password: 'Payroll-Ledger-26!Secure', employeeCode: 'PAYROLL-TEST', role: 'USER' }, 201);
  const user = await request('/auth/login', 'POST', { email: 'payroll-ledger-user@example.test', password: 'Payroll-Ledger-26!Secure' });
  await request('/finance/payroll/ledger-preview', 'POST', input, 403, { ...headers, Authorization: `Bearer ${user.access_token || user.token}` });
});

test('payroll ledger adjustments preserve prior snapshots and post only reviewed differences', async () => {
  const record = { key: 'adjust-payroll-1', employeeCode: 'ADJ-ONE', employeeName: 'Điều chỉnh', month: '2032-01', status: 'Chưa chi trả', baseSalary: 1000, allowance: 100, bonus: 0, insuranceDeduction: 100, taxDeduction: 50, netSalary: 950 };
  await request('/collections/payroll', 'POST', { record }, 201);
  const insuranceBreakdown = { employerSocial: 100, employerHealth: 50, employerUnemployment: 50, employeeSocial: 50, employeeHealth: 25, employeeUnemployment: 25 };
  const input = { period: '01/2032', employerInsurance: 200, insuranceBreakdown, costAccount: '6422' };
  const initial = await request('/finance/payroll/ledger-preview', 'POST', input);
  await request('/finance/payroll/ledger-post', 'POST', { ...input, fingerprint: initial.fingerprint }, 201);
  await request('/finance/payroll/adjustment-preview', 'POST', input, 422);
  await request('/collections/payroll/adjust-payroll-1', 'PATCH', { patch: { status: 'Chưa chi trả' } }, 409);
  await request('/collections/payroll/adjust-payroll-1', 'PATCH', { patch: { allowance: 0, netSalary: 850 } });
  const stale = await request('/finance/payroll/adjustment-preview', 'POST', input);
  assert.deepEqual(stale.lines.map((item) => [item.debitAccount, item.creditAccount, item.amount]), [['TK 334', 'TK 6422', 100]]);
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
  await request('/collections/payroll/adjust-payroll-1', 'DELETE', undefined, 409);
  assert.ok((await request('/finance/payroll/posted-periods')).periods.includes(input.period));
  await request('/finance/payroll/adjustment-preview', 'POST', input, 422);
  const employerInsuranceCorrection = { ...input, employerInsurance: 0, insuranceBreakdown: { ...insuranceBreakdown, employerSocial: 0, employerHealth: 0, employerUnemployment: 0 } };
  const correction = await request('/finance/payroll/adjustment-preview', 'POST', employerInsuranceCorrection);
  assert.deepEqual(correction.lines.map((line) => [line.debitAccount, line.creditAccount, line.amount]), [
    ['TK 3383', 'TK 6422', 100], ['TK 3384', 'TK 6422', 50], ['TK 3385', 'TK 6422', 50],
  ]);
  await request('/finance/payroll/adjustment-post', 'POST', { ...employerInsuranceCorrection, fingerprint: correction.fingerprint }, 201);
  await request('/finance/payroll/adjustment-preview', 'POST', employerInsuranceCorrection, 422);
  await request('/finance/payroll/adjustment-preview', 'POST', { period: '12/2031', employerInsurance: 0 }, 409);
  await request('/users', 'POST', { email: 'payroll-adjustment-user@example.test', name: 'Người thử điều chỉnh', password: 'Payroll-Adjustment-26!Secure', employeeCode: 'PAYROLL-ADJUSTMENT', role: 'USER' }, 201);
  const user = await request('/auth/login', 'POST', { email: 'payroll-adjustment-user@example.test', password: 'Payroll-Adjustment-26!Secure' });
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

test('sale documents record a salesperson snapshot and it can be reassigned', async () => {
  const seller = (await request('/users', 'POST', { email: 'seller@example.test', name: 'Người Bán', password: 'Seller-Test-26!Secure', employeeCode: 'TEST-SELLER', role: 'USER', department: 'Kinh doanh' }, 201)).user;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const saleInput = { documentType: 'sale', subtype: 'Đơn bán hàng', partnerName: 'Khách bán lẻ', description: 'Có nhân viên bán', amount: 300000, paidAmount: 0, documentDate: today, dueDate: '', status: 'Đã bàn giao', taxCode: '', vatRate: 0, vatAmount: 0 };
  await request('/finance/documents', 'POST', { ...saleInput, documentType: 'purchase', salespersonId: seller.id }, 422);
  await request('/finance/documents', 'POST', { ...saleInput, salespersonId: 'khong-co' }, 422);
  const sale = (await request('/finance/documents', 'POST', { ...saleInput, salespersonId: seller.id }, 201)).document;
  const listed = (await request('/finance/documents?documentType=sale')).data.find((item) => item.key === sale.key);
  assert.deepEqual([listed.salespersonId, listed.salespersonName, listed.salespersonCode], [seller.id, 'Người Bán', 'TEST-SELLER']);
  const plain = (await request('/finance/documents', 'POST', saleInput, 201)).document;
  assert.equal((await request(`/finance/documents/${plain.key}/salesperson`, 'POST', { salespersonId: seller.id })).document.salespersonName, 'Người Bán');
  assert.equal((await request(`/finance/documents/${plain.key}/salesperson`, 'POST', { salespersonId: '' })).document.salespersonId, undefined);
  assert.equal((await request('/finance/documents?documentType=sale')).data.find((item) => item.key === plain.key).salespersonId, undefined);
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

test('purchase documents keep VAT consistent and store supplier and contract terms', async () => {
  const supplier = (await request('/crm/contacts', 'POST', { name: 'Nhà cung cấp điều khoản', type: 'supplier', taxCode: '0100109106' }, 201)).contact;
  const customer = (await request('/crm/contacts', 'POST', { name: 'Khách không phải nhà cung cấp', type: 'customer' }, 201)).contact;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const input = { documentType: 'purchase', subtype: 'Hợp đồng mua', partnerName: 'Tên giả', description: 'Mua theo hợp đồng', amount: 11_000_000, paidAmount: 0, documentDate: today, dueDate: '', status: 'Chờ xử lý', taxCode: '', vatRate: 10, vatAmount: 1_000_000, supplierId: supplier.key };
  const terms = { contractNo: 'HD-MUA-01', signedDate: today, deliveryDate: today, deliveryAddress: 'Kho trung tâm', paymentMethod: 'Chuyển khoản', paymentTermDays: 30, penaltyRate: 8, lateInterestRate: 10, warrantyMonths: 12 };
  const before = (await request('/finance/documents?documentType=purchase')).data.length;
  await request('/finance/documents', 'POST', { ...input, vatAmount: 500_000, terms }, 422);
  await request('/finance/documents', 'POST', { ...input, terms: { ...terms, penaltyRate: 9 } }, 422);
  await request('/finance/documents', 'POST', { ...input, terms: { ...terms, paymentMethod: 'Bitcoin' } }, 422);
  await request('/finance/documents', 'POST', { ...input, taxCode: '0100109107', terms }, 422);
  await request('/finance/documents', 'POST', { ...input, supplierId: customer.key, terms }, 422);
  await request('/finance/documents', 'POST', { ...input, documentType: 'sale', customerId: undefined, terms }, 422);
  assert.equal((await request('/finance/documents?documentType=purchase')).data.length, before);
  const saved = (await request('/finance/documents', 'POST', { ...input, terms }, 201)).document;
  assert.equal(saved.partnerName, supplier.name);
  assert.equal(saved.taxCode, '0100109106');
  assert.equal(saved.supplierId, supplier.key);
  assert.equal(saved.paymentMethod, 'Chuyển khoản');
  assert.equal(saved.terms.penaltyRate, 8);
  assert.deepEqual(saved.termWarnings, []);
  const listed = (await request('/finance/documents?documentType=purchase')).data.find((item) => item.key === saved.key);
  assert.equal(listed.terms.contractNo, 'HD-MUA-01');
  const cash = (await request('/finance/documents', 'POST', { ...input, subtype: 'Đơn mua hàng', terms: { paymentMethod: 'Tiền mặt' } }, 201)).document;
  assert.match(cash.termWarnings.join(' '), /không được khấu trừ/);
  await request('/collections/finance_document_terms', 'PUT', { records: [] }, 409);
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
  const vnClock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  if (vnClock >= '00:05') await request('/collections/room_bookings', 'POST', { record: { ...booking('meeting-booking-past-slot', '00:00 - 00:15'), date: futureDate(0) } }, 422, employeeHeaders);
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
  await request('/auth/security-pin', 'POST', { pin: '246810', confirmPin: '246810', currentPin: '246810' });
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
  const ownPayments = await request('/finance/payments?page=1&limit=1', 'GET', undefined, 200, userHeaders);
  assert.equal(ownPayments.data.length, 1);
  assert.deepEqual(ownPayments.pagination, { page: 1, limit: 1, total: 1, totalPages: 1 });
  await request('/finance/payments', 'POST', { beneficiary: 'Sai số tiền', bankAccountInfo: 'VCB 00112233', category: 'Không hợp lệ', amount: 0, paymentMethod: 'Chuyển khoản VCB' }, 422, userHeaders);
  await request('/finance/payments', 'POST', { beneficiary: 'Không hỗ trợ', bankAccountInfo: 'Thẻ 1234', category: 'Thanh toán thẻ', amount: 1000, paymentMethod: 'Thẻ tín dụng DN' }, 422, userHeaders);
  await request(`/finance/payments/${payment.key}/approve`, 'POST', {}, 403, userHeaders);
  const noPinHeaders = { 'Content-Type': 'application/json', Authorization: headers.Authorization };
  const pinRequired = await request(`/finance/payments/${payment.key}/approve`, 'POST', {}, 428, noPinHeaders);
  assert.equal(pinRequired.code, 'SECURITY_PIN_REQUIRED');
  const pinRejected = await request(`/finance/payments/${payment.key}/approve`, 'POST', {}, 403, { ...headers, 'X-Security-Pin': '000000' });
  assert.equal(pinRejected.code, 'SECURITY_PIN_INVALID');
  Object.assign(headers, { 'X-Security-Pin': '246810' });
  const payrollPinRequired = await request('/collections/payroll', 'GET', undefined, 428, { Authorization: headers.Authorization });
  assert.equal(payrollPinRequired.code, 'SECURITY_PIN_REQUIRED');
  await request('/collections/payroll', 'GET');
  await request(`/collections/finance_payments/${payment.key}`, 'PATCH', { patch: { status: 'Đã thanh toán' } }, 409, headers);
  await request('/collections/finance_payments', 'PUT', { records: [] }, 409, headers);
  await request(`/finance/payments/${payment.key}/reject`, 'POST', { reason: '' }, 422, headers);

  const createdSecond = (await request('/finance/payments', 'POST', { beneficiary: 'Nhà cung cấp hai', bankAccountInfo: 'VCB 77665544', category: 'Chi phí vận hành', amount: 900000, paymentMethod: 'Chuyển khoản VCB', debitAccount: 'TK 6422' }, 201, userHeaders)).payment;
  const competing = await Promise.all(['POST', 'POST'].map(() => fetch(`${base}/finance/payments/${createdSecond.key}/approve`, { method: 'POST', headers, body: '{}' })));
  assert.deepEqual(competing.map((response) => response.status).sort(), [200, 409]);
  const approved = (await request('/finance/payments')).data.find((record) => record.key === createdSecond.key);
  assert.equal(approved.status, 'Đã phê duyệt');
  assert.equal(approved.approverId, session.user.id);
  await request('/users', 'POST', { email: 'payment-poster@example.test', name: 'Kế toán thanh toán', password: 'Payment-Poster-26!Secure', employeeCode: 'PAY-POSTER-01', role: 'ADMIN' }, 201);
  const posterLogin = await request('/auth/login', 'POST', { email: 'payment-poster@example.test', password: 'Payment-Poster-26!Secure' });
  const posterHeaders = { ...headers, Authorization: `Bearer ${posterLogin.access_token || posterLogin.token}` };
  await request('/auth/security-pin', 'POST', { pin: '135790', confirmPin: '135790', currentPassword: 'Payment-Poster-26!Secure' }, 200, posterHeaders);
  Object.assign(posterHeaders, { 'X-Security-Pin': '135790' });
  const selfApproval = (await request('/finance/payments', 'POST', { beneficiary: 'Người lập tự duyệt', bankAccountInfo: 'VCB 99887766', category: 'Phân tách nhiệm vụ', amount: 100000, paymentMethod: 'Chuyển khoản VCB' }, 201)).payment;
  await request(`/finance/payments/${selfApproval.key}/approve`, 'POST', {}, 403, headers);
  const reviewedSelfApproval = (await request(`/finance/payments/${selfApproval.key}/reject`, 'POST', { reason: 'Kiểm thử phân tách nhiệm vụ.' }, 200, posterHeaders)).payment;
  assert.equal(reviewedSelfApproval.status, 'Từ chối');
  await request(`/finance/payments/${createdSecond.key}/execute`, 'POST', { sourceAccountId: paymentSource.key, settlementReference: 'AB' }, 422, posterHeaders);
  await request(`/finance/payments/${createdSecond.key}/execute`, 'POST', { sourceAccountId: 'missing-account', settlementReference: 'VCB-TXN-2026-001' }, 422, posterHeaders);
  const paid = (await request(`/finance/payments/${createdSecond.key}/execute`, 'POST', { sourceAccountId: paymentSource.key, settlementReference: 'VCB-TXN-2026-001' }, 200, posterHeaders)).payment;
  assert.equal(paid.status, 'Đã thanh toán');
  assert.equal(paid.paidById, posterLogin.user.id);
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
  assert.equal(expenseVoucher.journalLines.length, 1);
  assert.equal(expenseVoucher.journalLines[0].debitAccount, 'TK 6422');
  assert.equal(expenseVoucher.journalLines[0].creditAccount, 'TK 1121');
  const ledgerEntry = (await request('/collections/finance_general_ledger')).data.find((item) => item.key === paid.ledgerEntryKey);
  assert.equal(ledgerEntry.sourceModule, 'finance_payment');
  assert.equal(ledgerEntry.amount, createdSecond.amount);
  assert.equal(ledgerEntry.debitAccount, 'TK 6422');
  assert.equal(ledgerEntry.creditAccount, 'TK 1121');
  const balances = (await request('/finance/payment-accounts')).accounts;
  assert.equal(balances.find((item) => item.key === paymentSource.key).balance, 2100000);
  await request(`/finance/payments/${createdSecond.key}/execute`, 'POST', { sourceAccountId: paymentSource.key, settlementReference: 'VCB-TXN-2026-001' }, 409, posterHeaders);

  const overBalance = (await request('/finance/payments', 'POST', { beneficiary: 'Nhà cung cấp vượt số dư', bankAccountInfo: 'VCB 77665544', category: 'Kiểm tra số dư', amount: 2500000, paymentMethod: 'Chuyển khoản VCB', debitAccount: 'TK 6422' }, 201, userHeaders)).payment;
  await request(`/finance/payments/${overBalance.key}/approve`, 'POST', {});
  await request(`/finance/payments/${overBalance.key}/execute`, 'POST', { sourceAccountId: paymentSource.key, settlementReference: 'VCB-INSUFFICIENT-01' }, 422, posterHeaders);
  assert.equal((await request('/finance/payments')).data.find((item) => item.key === overBalance.key).status, 'Đã phê duyệt');
  assert.equal((await request('/finance/cash-transactions?source=bank')).data.length, 2);

  const rejected = (await request('/finance/payments', 'POST', { beneficiary: 'Nhà cung cấp ba', bankAccountInfo: 'TCB 88990011', category: 'Dịch vụ khác', amount: 1500000, paymentMethod: 'Chuyển khoản TCB' }, 201, userHeaders)).payment;
  const denied = (await request(`/finance/payments/${rejected.key}/reject`, 'POST', { reason: 'Thiếu hóa đơn hợp lệ.' })).payment;
  assert.equal(denied.status, 'Từ chối');
  assert.equal(denied.rejectionReason, 'Thiếu hóa đơn hợp lệ.');
  assert.equal((await request('/finance/payments?status=Từ%20chối')).pagination.total, 2);
  assert.equal((await request('/finance/payments')).pagination.total, 5);

  const taxKey = `tax-payment-${Date.now()}`;
  const taxRecord = (await request('/collections/finance_tax', 'POST', { record: {
    key: taxKey, code: taxKey.toUpperCase(), taxType: 'Thuế GTGT', period: 'Tháng 10/2026', taxAuthority: 'Cơ quan thuế kiểm thử',
    deadline: '2026-11-20', amountPayable: 200000,
  } }, 201)).record;
  assert.equal(taxRecord.amountPaid, 0);
  const taxPayment = (await request('/finance/payments', 'POST', {
    beneficiary: 'Cơ quan thuế kiểm thử', bankAccountInfo: 'Nộp ngân sách Nhà nước theo hồ sơ thuế nội bộ',
    category: 'Nộp Thuế GTGT kỳ Tháng 10/2026', amount: 150000, paymentMethod: 'Nộp ngân sách nhà nước',
    debitAccount: '33311', sourceModule: 'finance_tax', sourceReference: taxKey,
  }, 201, userHeaders)).payment;
  assert.equal(taxPayment.sourceReference, taxKey);
  await request('/finance/payments', 'POST', {
    beneficiary: 'Cơ quan thuế kiểm thử', bankAccountInfo: 'Nộp ngân sách Nhà nước theo hồ sơ thuế nội bộ',
    category: 'Nộp Thuế GTGT kỳ Tháng 10/2026', amount: 100000, paymentMethod: 'Nộp ngân sách nhà nước',
    debitAccount: '33311', sourceModule: 'finance_tax', sourceReference: taxKey,
  }, 422, userHeaders);
  await request(`/finance/payments/${taxPayment.key}/approve`, 'POST', {}, 200, headers);
  const settledTaxPayment = (await request(`/finance/payments/${taxPayment.key}/execute`, 'POST', {
    sourceAccountId: paymentSource.key, settlementReference: 'TAX-BANK-2026-001',
  }, 200, posterHeaders)).payment;
  assert.equal(settledTaxPayment.status, 'Đã ghi nhận nội bộ');
  const updatedTax = (await request('/collections/finance_tax')).data.find(item => item.key === taxKey);
  assert.equal(updatedTax.amountPaid, 150000);
  assert.equal(updatedTax.status, 'Đã ghi nhận một phần theo chứng từ nội bộ');
  assert.equal(updatedTax.externalStatus, 'Chưa xác minh với cơ quan thuế');
  assert.equal(updatedTax.paymentEvidence[0].settlementReference, 'TAX-BANK-2026-001');
  const finalTaxPayment = (await request('/finance/payments', 'POST', {
    beneficiary: 'Cơ quan thuế kiểm thử', bankAccountInfo: 'Nộp ngân sách Nhà nước theo hồ sơ thuế nội bộ',
    category: 'Nộp Thuế GTGT kỳ Tháng 10/2026', amount: 50000, paymentMethod: 'Nộp ngân sách nhà nước',
    debitAccount: '33311', sourceModule: 'finance_tax', sourceReference: taxKey,
  }, 201, userHeaders)).payment;
  await request('/finance/payments', 'POST', {
    beneficiary: 'Cơ quan thuế kiểm thử', bankAccountInfo: 'Nộp ngân sách Nhà nước theo hồ sơ thuế nội bộ',
    category: 'Nộp Thuế GTGT kỳ Tháng 10/2026', amount: 1, paymentMethod: 'Nộp ngân sách nhà nước',
    debitAccount: '33311', sourceModule: 'finance_tax', sourceReference: taxKey,
  }, 422, userHeaders);
  await request(`/finance/payments/${finalTaxPayment.key}/approve`, 'POST', {}, 200, headers);
  await request(`/finance/payments/${finalTaxPayment.key}/execute`, 'POST', {
    sourceAccountId: paymentSource.key, settlementReference: 'TAX-BANK-2026-002',
  }, 200, posterHeaders);
  const fullyPaidTax = (await request('/collections/finance_tax')).data.find(item => item.key === taxKey);
  assert.equal(fullyPaidTax.amountPaid, 200000);
  assert.equal(fullyPaidTax.status, 'Đã ghi nhận đủ theo chứng từ nội bộ');
  assert.equal(fullyPaidTax.externalStatus, 'Chưa xác minh với cơ quan thuế');
  assert.equal(fullyPaidTax.paymentEvidence.length, 2);
});

test('cash vouchers link active accounts and CRM contacts, allow pending edits and preserve posted history', async () => {
  const incomeCategories = (await request('/finance/cash-categories?type=Thu')).data;
  assert.deepEqual(incomeCategories, [
    '1. Thu tiền khách hàng (không theo hóa đơn)',
    '2. Thu hoàn ứng nhân viên',
    '3. Rút tiền gửi về nhập quỹ',
    '4. Thu hồi các khoản cho vay',
    '5. Thu vốn góp thành viên',
    '6. Thu khác',
  ]);
  const priorExpenseCategories = (await request('/finance/cash-categories?type=Chi')).data;
  const expenseCategory = (await request('/finance/cash-categories', 'POST', { type: 'Chi', name: 'Chi mua vật tư' }, 201)).category;
  assert.equal(expenseCategory.name, 'Chi mua vật tư');
  const expenseCategories = (await request('/finance/cash-categories?type=Chi')).data;
  assert.ok(expenseCategories.includes('Chi mua vật tư'));
  assert.ok(priorExpenseCategories.every(name => expenseCategories.includes(name)));
  await request('/finance/cash-categories', 'POST', { type: 'Chi', name: 'Chi mua vật tư' }, 409);

  const suffix = Date.now().toString();
  const account = (await request('/finance/bank-accounts', 'POST', {
    bankName: 'Vietcombank', accountNumber: `CASH${suffix.slice(-8)}`, accountHolder: 'HTX kiểm thử', balance: 5000, status: 'Đang hoạt động',
  }, 201)).account;
  const contact = (await request('/crm/contacts', 'POST', {
    type: 'customer', name: `Khách hàng thu tiền ${suffix}`, status: 'Đang hoạt động',
  }, 201)).contact;
  await request('/users', 'POST', { email: 'cash-staff@example.test', name: 'Nhân viên phụ trách', password: 'Cash-Staff-26!Secure', employeeCode: 'CASH-STAFF', role: 'USER' }, 201);
  const baseVoucher = {
    type: 'Thu', source: 'bank', sourceAccountId: account.key, account: 'Tên tài khoản giả',
    category: 'Thu tiền hàng', amount: 1200, date: '2026-10-29', voucherDate: '2026-10-28', currency: 'VND', reference: 'HD-01', recipientOrPayer: 'Tên giả',
    counterpartyType: 'customer', counterpartyContactId: contact.key, status: 'Chờ duyệt', note: 'Hóa đơn HD-01',
    staffEmployeeCode: 'CASH-STAFF', payerName: 'Nguyễn Văn A', counterpartyAddress: 'Số 1, Hà Nội', attachmentCount: 2, sourceDocument: 'PT-001',
    journalLines: [{ description: 'Thu tiền hàng', debitAccount: '1121', creditAccount: '131', amount: 1200, business: 'Thanh toán hóa đơn' }],
  };
  const usdAccount = (await request('/finance/bank-accounts', 'POST', { bankName: 'Vietcombank USD', accountNumber: `USD${suffix.slice(-8)}`, accountHolder: 'HTX kiểm thử', currency: 'USD', balance: 1000, status: 'Đang hoạt động' }, 201)).account;
  await request('/finance/cash-transactions', 'POST', { ...baseVoucher, sourceAccountId: usdAccount.key }, 422);
  const created = (await request('/finance/cash-transactions', 'POST', baseVoucher, 201)).transaction;
  assert.equal(created.account, `Vietcombank (${account.accountNumber})`);
  assert.equal(created.sourceAccountId, account.key);
  assert.equal(created.recipientOrPayer, contact.name);
  assert.equal(created.counterpartyType, 'customer');
  assert.equal(created.counterpartyContactId, contact.key);
  assert.equal(created.voucherDate, baseVoucher.voucherDate);
  assert.equal(created.currency, baseVoucher.currency);
  assert.equal(created.reference, baseVoucher.reference);
  assert.equal(created.staffEmployeeCode, baseVoucher.staffEmployeeCode);
  assert.equal(created.payerName, baseVoucher.payerName);
  assert.equal(created.counterpartyAddress, baseVoucher.counterpartyAddress);
  assert.equal(created.attachmentCount, baseVoucher.attachmentCount);
  assert.equal(created.sourceDocument, baseVoucher.sourceDocument);
  assert.deepEqual(created.journalLines, baseVoucher.journalLines);
  const searchedCash = await request(`/finance/cash-transactions?page=1&limit=1&type=Thu&q=${encodeURIComponent(created.code)}`);
  assert.equal(searchedCash.pagination.total, 1);
  assert.equal(searchedCash.data[0].key, created.key);
  const searchedParty = await request(`/finance/cash-transactions?page=1&limit=10&searchBy=party&q=${encodeURIComponent(contact.name)}`);
  assert.equal(searchedParty.pagination.total, 1);
  assert.equal(searchedParty.data[0].key, created.key);
  const searchedDescription = await request('/finance/cash-transactions?page=1&limit=10&searchBy=description&q=HD-01');
  assert.equal(searchedDescription.pagination.total, 1);
  assert.equal(searchedDescription.data[0].key, created.key);
  await request('/finance/cash-transactions?page=1&limit=10&searchBy=invalid', 'GET', undefined, 422);
  assert.deepEqual(Object.keys(searchedCash.summary).sort(), ['pendingCount', 'totalExpense', 'totalIncome']);
  const referenceCash = await request(`/finance/document-references?page=1&limit=1&type=cash&q=${encodeURIComponent(created.code)}`);
  assert.equal(referenceCash.pagination.total, 1);
  assert.equal(referenceCash.data[0].key, `cash:${created.key}`);
  await request('/finance/document-references?page=1&limit=5&dateFrom=2026-11-02&dateTo=2026-10-01', 'GET', undefined, 422);
  const filteredCash = await request(`/finance/cash-transactions?page=1&limit=5&accountId=${encodeURIComponent(account.key)}&counterpartyId=${encodeURIComponent(contact.key)}&employeeCode=CASH-STAFF&dateFrom=2026-10-29&dateTo=2026-10-29&q=${encodeURIComponent(created.code)}`);
  assert.equal(filteredCash.pagination.total, 1);
  assert.equal(filteredCash.data[0].key, created.key);
  await request('/finance/cash-transactions?page=1&limit=5&dateFrom=2026-11-01&dateTo=2026-10-01', 'GET', undefined, 422);
  await request('/finance/cash-transactions?page=0&limit=1', 'GET', undefined, 422);
  await request('/finance/cash-transactions?page=1&limit=101', 'GET', undefined, 422);
  await request('/finance/cash-transactions', 'POST', { ...baseVoucher, staffEmployeeCode: 'NOT-FOUND' }, 422);
  await request('/finance/cash-transactions', 'POST', { ...baseVoucher, currency: 'EUR' }, 422);
  await request('/finance/cash-transactions', 'POST', { ...baseVoucher, attachmentCount: 1.5 }, 422);
  await request('/finance/cash-transactions', 'POST', { ...baseVoucher, journalLines: [{ ...baseVoucher.journalLines[0], amount: 1000 }] }, 422);
  await request('/finance/cash-transactions', 'POST', { ...baseVoucher, journalLines: [{ ...baseVoucher.journalLines[0], debitAccount: 'abc' }] }, 422);
  const insuranceVoucher = {
    ...baseVoucher, type: 'Chi', category: 'Nộp bảo hiểm', reference: 'BH-2026-10-001',
    counterpartyType: 'other', counterpartyContactId: '', recipientOrPayer: 'Cơ quan Bảo hiểm xã hội',
    journalLines: [{ description: 'Nộp bảo hiểm kỳ 10/2026', debitAccount: '3383', creditAccount: '1121', amount: 1200 }],
  };
  await request('/finance/cash-transactions', 'POST', insuranceVoucher, 201);
  await request('/finance/cash-transactions', 'POST', { ...insuranceVoucher, reference: 'bh-2026-10-001' }, 409);

  const updated = (await request(`/finance/cash-transactions/${created.key}`, 'PATCH', {
    ...baseVoucher, category: 'Thu tiền theo hóa đơn', amount: 1400, journalLines: [{ ...baseVoucher.journalLines[0], amount: 1400 }], recipientOrPayer: 'Không được ghi đè danh mục',
  })).transaction;
  assert.equal(updated.code, created.code);
  assert.equal(updated.category, 'Thu tiền theo hóa đơn');
  assert.equal(updated.amount, 1400);
  assert.equal(updated.sourceDocument, baseVoucher.sourceDocument);
  assert.equal(updated.staffEmployeeCode, baseVoucher.staffEmployeeCode);
  assert.equal(updated.recipientOrPayer, contact.name);
  await request(`/finance/cash-transactions/${created.key}`, 'PATCH', { ...baseVoucher, counterpartyType: 'supplier' }, 422);
  await request(`/finance/cash-transactions/${created.key}`, 'PATCH', { ...baseVoucher, status: 'Đã hoàn thành' }, 409);
  const cancelled = (await request(`/finance/cash-transactions/${created.key}`, 'PATCH', { status: 'Đã hủy' })).transaction;
  assert.equal(cancelled.status, 'Đã hủy');

  const accountsBefore = (await request('/finance/payment-accounts')).accounts;
  const accountBefore = accountsBefore.find(item => item.key === account.key);
  const completed = (await request('/finance/cash-transactions', 'POST', { ...baseVoucher, status: 'Đã hoàn thành', category: 'Thu tiền theo hóa đơn' }, 201)).transaction;
  assert.equal(completed.status, 'Đã hoàn thành');
  await request('/finance/documents', 'POST', {
    documentType: 'sale', subtype: 'Bán hàng tổng quan', partnerName: `Khách hàng tổng quan ${suffix}`,
    description: 'Chứng từ tổng quan phải thu', amount: 5000, paidAmount: 0, documentDate: '2026-10-29', dueDate: '2026-10-29', status: 'Chưa thanh toán', taxCode: '', vatRate: 0, vatAmount: 0,
  }, 201);
  await request('/finance/documents', 'POST', {
    documentType: 'purchase', subtype: 'Mua hàng tổng quan', partnerName: `Nhà cung cấp tổng quan ${suffix}`,
    description: 'Chứng từ tổng quan phải trả', amount: 9000, paidAmount: 0, documentDate: '2026-10-29', dueDate: '2026-10-29', status: 'Chưa thanh toán', taxCode: '', vatRate: 0, vatAmount: 0,
  }, 201);
  const overview = await request('/finance/overview?dateFrom=2026-10-29&dateTo=2026-10-29');
  assert.ok(overview.cash.income >= completed.amount);
  assert.ok(overview.cash.categories.some(item => item.type === 'Thu' && item.name === 'Thu tiền theo hóa đơn' && item.amount >= completed.amount));
  assert.ok(overview.cash.monthly.some(item => item.month === '2026-10' && item.income >= completed.amount));
  const cashFlow = await request(`/finance/overview?dateFrom=2026-10-29&dateTo=2026-10-29&source=bank&type=Thu&currency=VND&accountId=${encodeURIComponent(account.key)}&counterpartyId=${encodeURIComponent(contact.key)}`);
  const flowAccount = cashFlow.cash.accounts.find(item => item.key === account.key);
  assert.equal(flowAccount.openingBalance, account.balance);
  assert.equal(flowAccount.income, completed.amount);
  assert.equal(flowAccount.closingBalance, account.balance + completed.amount);
  assert.equal(cashFlow.cash.flows.find(item => item.category === 'Thu tiền theo hóa đơn')?.income, completed.amount);
  assert.ok(overview.documents.sales >= 5000);
  assert.ok(overview.documents.purchases >= 9000);
  assert.ok(overview.documents.receivable >= 5000);
  assert.ok(overview.documents.payable >= 9000);
  await request('/finance/documents', 'POST', { documentType: 'sale', subtype: 'Bán hàng tổng quan', partnerName: 'Khách đã thu sẵn', description: 'Nhập đã thu', amount: 5000, paidAmount: 1500, documentDate: '2026-10-29', dueDate: '', status: 'Chưa thanh toán', taxCode: '', vatRate: 0, vatAmount: 0 }, 422);
  await request('/finance/overview?dateFrom=2026-02-30', 'GET', undefined, 422);
  await request('/finance/overview?dateFrom=2026-11-01&dateTo=2026-10-01', 'GET', undefined, 422);
  await request('/finance/cash-transactions', 'POST', {
    ...baseVoucher, status: 'Đã hoàn thành', reference: 'CASH-INVALID-ACCOUNT',
    journalLines: [{ ...baseVoucher.journalLines[0], debitAccount: '999999' }],
  }, 422);
  const firstCashPage = await request('/finance/cash-transactions?page=1&limit=1&type=Thu&q=Thu%20ti%E1%BB%81n%20theo%20h%C3%B3a%20%C4%91%C6%A1n');
  const secondCashPage = await request('/finance/cash-transactions?page=2&limit=1&type=Thu&q=Thu%20ti%E1%BB%81n%20theo%20h%C3%B3a%20%C4%91%C6%A1n');
  assert.equal(firstCashPage.pagination.total, 2);
  assert.equal(secondCashPage.pagination.total, 2);
  assert.notEqual(firstCashPage.data[0].key, secondCashPage.data[0].key);
  assert.equal((await request('/finance/payment-accounts')).accounts.find(item => item.key === account.key).balance, accountBefore.balance + 1200);
  const postedLines = (await request('/collections/finance_general_ledger')).data.filter(item => item.sourceReference === `cash-voucher:${completed.key}`);
  assert.equal(postedLines.length, 1);
  assert.equal(postedLines[0].sourceModule, 'cash_voucher');
  await request('/finance/cash-transactions', 'POST', { ...baseVoucher, status: 'Đã hoàn thành', journalLines: [] }, 422);
  await request('/finance/cash-transactions', 'POST', {
    ...baseVoucher, type: 'Chi', status: 'Đã hoàn thành', amount: 100000, reference: 'CASH-OVER-BALANCE',
    counterpartyType: 'other', counterpartyContactId: '',
    journalLines: [{ description: 'Chi vượt số dư', debitAccount: '331', creditAccount: '1121', amount: 100000 }],
  }, 422);
  await request(`/finance/cash-transactions/${completed.key}`, 'PATCH', { ...baseVoucher, category: 'Sửa phiếu đã ghi sổ' }, 409);
  await request(`/finance/cash-transactions/${completed.key}`, 'PATCH', { status: 'Đã hủy' }, 409);
  await request(`/collections/finance_general_ledger/${encodeURIComponent(postedLines[0].key)}`, 'PATCH', { patch: { description: 'Sửa bút toán đã ghi sổ' } }, 409);

  const pendingBefore = (await request('/finance/payment-accounts')).accounts.find(item => item.key === account.key).balance;
  const pending = (await request('/finance/cash-transactions', 'POST', { ...baseVoucher, reference: 'HD-PENDING-02', category: 'Thu chờ duyệt' }, 201)).transaction;
  assert.equal(pending.status, 'Chờ duyệt');
  assert.equal((await request('/finance/payment-accounts')).accounts.find(item => item.key === account.key).balance, pendingBefore);
  const approved = (await request(`/finance/cash-transactions/${pending.key}/approve`, 'POST', {})).transaction;
  assert.equal(approved.status, 'Đã hoàn thành');
  assert.equal((await request('/finance/payment-accounts')).accounts.find(item => item.key === account.key).balance, pendingBefore + 1200);
  await request(`/finance/cash-transactions/${pending.key}/approve`, 'POST', {}, 409);
  await request(`/finance/cash-transactions/${pending.key}`, 'PATCH', { status: 'Đã hủy' }, 409);
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

test('cash counts require a real petty cash account and recompute book balance and discrepancy on the server', async () => {
  const record = (await request('/collections/finance_cash_counts', 'POST', { record: {
    key: 'cash-count-server-check', code: 'KKQ-SERVER-001', purpose: 'Kiểm kê quỹ tiền mặt', countDate: '2026-10-30', date: '2026-10-30', time: '16:30',
    cashAccountId: 'petty:Quỹ tiền mặt', counterName: 'Người kiểm kê', witnessName: 'Người chứng kiến', currency: 'VND',
    lines: [{ key: 'note-1000', denomination: 1000, quantity: 2, note: 'Mệnh giá 1.000' }], bookBalance: 999999, actualBalance: 999999, difference: 0,
    status: 'Đã phê duyệt', approvedBy: 'Người giả mạo', approvedById: 'forged', approvedAt: '2020-01-01T00:00:00.000Z',
  } }, 201)).record;
  assert.equal(record.cashAccountName, 'Quỹ tiền mặt');
  assert.equal(record.bookBalance, 0);
  assert.equal(record.actualBalance, 2000);
  assert.equal(record.difference, -2000);
  assert.equal(record.status, 'Chờ phê duyệt');
  assert.equal(record.approvedBy, '');
  assert.equal(record.approvedById, '');
  assert.ok(record.createdById);
  const bookBalance = await request(`/finance/cash-count-book-balance?accountId=${encodeURIComponent(record.cashAccountId)}&date=${record.countDate}&time=${record.time}`);
  assert.equal(bookBalance.balance, record.bookBalance);
  await request(`/finance/cash-count-book-balance?accountId=${encodeURIComponent(record.cashAccountId)}&date=2026-02-30&time=${record.time}`, 'GET', undefined, 422);
  await request(`/finance/cash-count-book-balance?accountId=${encodeURIComponent(record.cashAccountId)}&date=${record.countDate}&time=25:00`, 'GET', undefined, 422);
  await request('/finance/cash-transactions', 'POST', {
    type: 'Thu', source: 'petty', category: '6. Thu khác', amount: 1000, date: record.countDate,
    voucherDate: record.countDate, currency: 'VND', reference: 'CASH-COUNT-AFTER-CUTOFF',
    recipientOrPayer: 'Khoản thu sau giờ kiểm kê', account: record.cashAccountName, sourceAccountId: record.cashAccountId,
    counterpartyType: 'other', note: 'Giao dịch được ghi sổ sau thời điểm chốt kiểm kê', status: 'Đã hoàn thành',
    journalLines: [{ description: 'Thu khác', debitAccount: '1111', creditAccount: '711', amount: 1000 }],
  }, 201);
  assert.equal((await request(`/finance/cash-count-book-balance?accountId=${encodeURIComponent(record.cashAccountId)}&date=${record.countDate}&time=${record.time}`)).balance, record.bookBalance);
  await request('/finance/cash-counts/cash-count-server-check/approve', 'POST', {}, 409);
  const forgedApproval = (await request('/collections/finance_cash_counts/cash-count-server-check', 'PATCH', { patch: { status: 'Đã phê duyệt', approvedBy: 'Người giả mạo' } })).record;
  assert.equal(forgedApproval.status, 'Chờ phê duyệt');
  assert.equal(forgedApproval.approvedBy, '');
  await request('/collections/finance_cash_counts/cash-count-server-check', 'DELETE', undefined, 409);
  await request('/collections/finance_cash_counts', 'PUT', { records: [] }, 405);
  const approver = (await request('/users', 'POST', {
    email: 'cash-count-approver@example.test', name: 'Kế toán trưởng kiểm thử', password: 'Cash-Count-Approver-26!Secure', employeeCode: 'CASH-COUNT-APPROVER', role: 'ADMIN',
  }, 201)).user;
  const approverLogin = await request('/auth/login', 'POST', { email: approver.email, password: 'Cash-Count-Approver-26!Secure' });
  const approverHeaders = { ...headers, Authorization: `Bearer ${approverLogin.access_token || approverLogin.token}` };
  await request('/finance/cash-counts/cash-count-server-check/approve', 'POST', {}, 422, approverHeaders);
  await request('/collections/finance_cash_counts/cash-count-server-check', 'PATCH', {
    patch: { reason: 'Sai lệch do chứng từ chi đang được đối chiếu', handlingDirection: 'Đối chiếu chứng từ nguồn trước khi lập phiếu điều chỉnh' },
  });
  const approved = (await request('/finance/cash-counts/cash-count-server-check/approve', 'POST', {}, 200, approverHeaders)).record;
  assert.equal(approved.status, 'Đã phê duyệt');
  assert.equal(approved.approvedById, approver.id);
  assert.equal(approved.approvedBy, approver.name);
  assert.ok(approved.approvedAt);
  await request('/finance/cash-counts/cash-count-server-check/approve', 'POST', {}, 409, approverHeaders);
  await request('/collections/finance_cash_counts/cash-count-server-check', 'PATCH', { patch: { conclusion: 'Sửa sau duyệt' } }, 409, approverHeaders);
  await request('/collections/finance_cash_counts/cash-count-server-check', 'DELETE', undefined, 409, approverHeaders);
  await request('/collections/finance_cash_counts', 'POST', { record: {
    key: 'cash-count-invalid-account', code: 'KKQ-SERVER-002', purpose: 'Kiểm kê quỹ tiền mặt', countDate: '2026-10-30', date: '2026-10-30', time: '16:30',
    cashAccountId: 'missing', counterName: 'Người kiểm kê', lines: [],
  } }, 422);
  await request('/collections/finance_cash_counts', 'POST', { record: {
    key: 'cash-count-invalid-quantity', code: 'KKQ-SERVER-003', purpose: 'Kiểm kê quỹ tiền mặt', countDate: '2026-10-30', date: '2026-10-30', time: '16:30',
    cashAccountId: 'petty:Quỹ tiền mặt', counterName: 'Người kiểm kê', lines: [{ key: 'bad-note', denomination: 1000, quantity: 1.5 }],
  } }, 422);
});

test('CRM contacts can be updated without changing their identity or exposing invalid data', async () => {
  const created = (await request('/crm/contacts', 'POST', {
    name: 'Đối tác trước cập nhật', type: 'customer', taxCode: '0100109106', contactPerson: 'Nguyễn An',
    phone: '0900000001', email: 'crm-before@example.test', address: 'Địa chỉ cũ', bankAccount: '0123456789',
    creditLimit: 1000000, totalValue: 200000, debtBalance: 50000, status: 'Đang hoạt động',
    details: { entityKind: 'person', isSupplier: true, isMember: true, citizenId: '012345678901', paymentTerm: 'NET30', creditDays: 30,
      bankAccounts: [{ accountNumber: '024680', bankName: 'Ngân hàng A', branch: 'Hà Nội', province: 'Hà Nội' }], addresses: ['Địa chỉ giao hàng'],
      customFields: [{ name: 'Mã nội bộ', value: 'CRM-01' }] },
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
  assert.equal(updated.details.citizenId, '012345678901');
  assert.equal(updated.details.bankAccounts[0].accountNumber, '024680');
  assert.deepEqual(updated.details.addresses, ['Địa chỉ giao hàng']);
  assert.ok(updated.updatedAt >= created.updatedAt);
  await request(`/crm/contacts/${created.key}`, 'PATCH', { patch: { type: 'supplier' } }, 422);
  await request(`/crm/contacts/${created.key}`, 'PATCH', { patch: { code: 'FORGED-CODE' } }, 422);
  await request(`/crm/contacts/${created.key}`, 'PATCH', { patch: { email: 'invalid-email' } }, 422);
  // Mã số thuế, số căn cước, điện thoại và đồng ý xử lý dữ liệu được kiểm tra; giá trị cũ không bị chặn khi sửa trường khác.
  const newContact = (extra, details = {}) => ({ name: 'Khách kiểm tra quy tắc', type: 'customer', details: { entityKind: 'organization', ...details }, ...extra });
  await request('/crm/contacts', 'POST', newContact({ taxCode: '0100109107' }), 422);
  await request('/crm/contacts', 'POST', newContact({ taxCode: '0100109106' }), 409);
  await request('/crm/contacts', 'POST', newContact({ phone: '12345' }), 422);
  await request('/crm/contacts', 'POST', newContact({}, { citizenId: '123456789' }), 422);
  await request('/crm/contacts', 'POST', newContact({}, { dateOfBirth: '2999-01-01' }), 422);
  await request('/crm/contacts', 'POST', newContact({}, { invoiceRecipientEmails: 'a@b.vn; hong-hop-le' }), 422);
  await request('/crm/contacts', 'POST', newContact({}, { dataConsent: true }), 422);
  await request('/crm/contacts', 'POST', newContact({}, { marketingOptIn: true }), 422);
  const consented = (await request('/crm/contacts', 'POST', newContact({ taxCode: '079123456789', phone: '+84 90 123 4567' }, {
    entityKind: 'person', gender: 'Nữ', dateOfBirth: '1990-05-20', citizenId: '079123456789', province: 'Thành phố Hồ Chí Minh', ward: 'Phường Bến Nghé',
    dataConsent: true, dataConsentDate: '2026-01-02', dataConsentPurposes: 'Chăm sóc khách hàng', marketingOptIn: true, invoiceRecipientEmails: 'a@b.vn; c@d.vn',
  }), 201)).contact;
  assert.equal(consented.details.dataConsentPurposes, 'Chăm sóc khách hàng');
  assert.equal(consented.details.marketingOptIn, true);
  assert.equal(consented.details.province, 'Thành phố Hồ Chí Minh');
  await request(`/crm/contacts/${created.key}`, 'PATCH', { patch: { details: { bankAccounts: Array.from({ length: 21 }, (_, index) => ({ accountNumber: `BA-${index}` })) } } }, 422);
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
    invoiceNo: 'HD-TL-01', invoiceSymbol: '1C26TAA', vatRate: 10, paymentMethod: 'Chuyển khoản', buyerTaxCode: '0100109106',
  };
  await request('/collections/asset_disposals/disposal-api', 'PATCH', { patch: { ...finalize, securityDataWipeCertified: false, dataWipeOfficer: '' } }, 422);
  await request('/collections/asset_disposals/disposal-api', 'PATCH', { patch: { ...finalize, invoiceNo: '' } }, 422);
  await request('/collections/asset_disposals/disposal-api', 'PATCH', { patch: { ...finalize, vatRate: 7 } }, 422);
  await request('/collections/asset_disposals/disposal-api', 'PATCH', { patch: { ...finalize, buyerTaxCode: '0100109107' } }, 422);
  await request('/collections/asset_disposals/disposal-api', 'PATCH', { patch: { ...finalize, disposalDate: '2026-10-26' } }, 422);
  await request('/collections/asset_disposals/disposal-api', 'PATCH', { patch: { ...finalize, disposalDate: '2099-01-01' } }, 422);
  const completed = await request('/collections/asset_disposals/disposal-api', 'PATCH', { patch: finalize });
  assert.equal(completed.record.netGainLoss, 200);
  assert.equal(completed.record.vatAmount, 80);
  assert.equal(completed.record.totalReceived, 880);
  assert.equal(completed.record.journal.reduce((sum, line) => sum + line.debit, 0), completed.record.journal.reduce((sum, line) => sum + line.credit, 0));
  assert.ok(completed.record.journal.some((line) => line.account === '3331' && line.credit === 80));
  assert.match(completed.record.disposalWarnings.join(' '), /quyết định thanh lý/);
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

  await request('/finance/inventory/transactions', 'POST', { type: 'Kiểm kê', transactionCode: 'KK-INV-API-01', transactionDate: today,
    sourceWarehouse: 'Kho A', lines: [{ productKey: itemKey, warehouse: 'Kho A', lotCode: 'LOT-EARLY', expiryDate: '2027-04-01', actualQty: 1 }] }, 422);
  const audit = await request('/finance/inventory/transactions', 'POST', { type: 'Kiểm kê', transactionCode: 'KK-INV-API-01', transactionDate: today, reason: 'Biên bản kiểm kê quý',
    sourceWarehouse: 'Kho A', lines: [{ productKey: itemKey, warehouse: 'Kho A', lotCode: 'LOT-EARLY', expiryDate: '2027-04-01', actualQty: 1 }] }, 201);
  assert.equal(audit.transaction.lines[0].difference, 1);
  assert.ok(audit.transaction.surplusAmount > 0 && audit.transaction.shortageAmount === 0);
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
    key: 'global', issueMethodMode: 'Dùng chung', issueMethod: 'Bình quân', lotManagedDefault: false, barcodeManagedDefault: false,
    warehouseNames: ['Kho A', 'Kho B', 'Kho C'], categoryNames: ['Linh kiện', 'Bộ kit'],
  } }, 201);
  assert.equal(config.record.key, 'global');
  await request('/collections/finance_inventory_settings/global', 'PATCH', { patch: { issueMethodMode: 'Dùng chung', issueMethod: 'LIFO' } }, 422);
  await request('/collections/finance_inventory', 'POST', { record: { key: 'inventory-lifo-api', sku: 'LIFO-API', name: 'Hàng LIFO', category: 'Linh kiện', unit: 'Cái', warehouse: 'Kho C', issueMethod: 'LIFO' } }, 422);
  await request('/collections/finance_inventory_settings/global', 'PATCH', { patch: { issueMethodMode: 'Dùng chung', issueMethod: 'Bình quân' } }, 200);
  const commonIssue = await request('/finance/inventory/transactions', 'POST', { type: 'Xuất kho', transactionCode: 'XK-COMMON-API-01', transactionDate: today,
    sourceWarehouse: 'Kho C', reason: 'Kiểm tra phương pháp dùng chung', lines: [{ productKey: commonMethodItem.key, quantity: 1 }] }, 201);
  assert.equal(commonIssue.transaction.lines[0].allocatedLots[0].unitCost, 150, 'bình quân gia quyền (2 x 100 + 2 x 200) / 4');
  assert.equal(commonIssue.transaction.totalAmount, 150);

  const locationA = (await request('/collections/finance_inventory_locations', 'POST', { record: {
    key: 'inventory-location-a1', warehouse: 'Kho A', code: 'a-01', zone: 'A', shelf: '01', capacityItems: 1, pickOrder: 1,
  } }, 201)).record;
  assert.equal(locationA.code, 'A-01');
  assert.equal(locationA.status, 'Đang hoạt động');
  await request('/collections/finance_inventory_locations', 'POST', { record: {
    key: 'inventory-location-a2', warehouse: 'Kho A', code: 'A-02', zone: 'A', shelf: '02', capacityItems: 10, pickOrder: 2,
  } }, 201);
  await request('/collections/finance_inventory_locations', 'POST', { record: {
    key: 'inventory-location-b1', warehouse: 'Kho B', code: 'B-01', capacityItems: 10, pickOrder: 1,
  } }, 201);
  await request('/collections/finance_inventory_locations', 'POST', { record: {
    key: 'inventory-location-a-paused', warehouse: 'Kho A', code: 'A-STOP', capacityItems: 10, pickOrder: 4, status: 'Tạm ngưng',
  } }, 201);
  await request('/collections/finance_inventory_locations', 'POST', { record: {
    key: 'inventory-location-duplicate', warehouse: 'Kho A', code: 'A-01', capacityItems: 1, pickOrder: 3,
  } }, 409);
  await request('/collections/finance_inventory_locations', 'POST', { record: {
    key: 'inventory-location-invalid-warehouse', warehouse: 'Kho không khai báo', code: 'X-01', capacityItems: 1, pickOrder: 1,
  } }, 422);
  await request('/collections/finance_inventory_locations', 'POST', { record: {
    key: 'inventory-location-invalid-capacity', warehouse: 'Kho A', code: 'A-99', capacityItems: 0, pickOrder: 1,
  } }, 422);
  await request('/collections/finance_inventory_locations/inventory-location-a1', 'DELETE', undefined, 409);
  const assignedItem = (await request(`/collections/finance_inventory/${itemKey}`, 'PATCH', { patch: {
    storageLocation: 'A-01', storageAssignments: [{ warehouse: 'Kho A', locationCode: 'A-01' }, { warehouse: 'Kho B', locationCode: 'B-01' }],
  } }, 200)).record;
  assert.equal(assignedItem.storageLocation, 'A-01');
  assert.deepEqual(assignedItem.storageAssignments, [{ warehouse: 'Kho A', locationCode: 'A-01' }, { warehouse: 'Kho B', locationCode: 'B-01' }]);
  await request('/collections/finance_inventory_locations/inventory-location-a1', 'PATCH', { patch: { code: 'A-CHANGED' } }, 409);
  await request(`/collections/finance_inventory/${itemKey}`, 'PATCH', { patch: {
    storageAssignments: [{ warehouse: 'Kho A', locationCode: 'A-STOP' }], storageLocation: 'A-STOP',
  } }, 422);
  await request(`/collections/finance_inventory/${itemKey}`, 'PATCH', { patch: {
    storageAssignments: [{ warehouse: 'Kho B', locationCode: 'MISSING' }],
  } }, 422);
  await request('/collections/finance_inventory_locations', 'PUT', { records: [] }, 405);

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
  await request('/collections/finance_inventory_locations', 'GET', undefined, 403, employeeHeaders);
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
  assert.equal(task.createdById, session.user.id);
  const postponed = await request(`/tasks/${key}`, 'PATCH', { dueDate: '2027-01-07' });
  assert.equal(postponed.task.dueDatePostponementCount, 1);
  assert.deepEqual(postponed.task.dueDateHistory.map(change => [change.previousDueDate, change.newDueDate, change.isPostponement]), [
    ['2026-12-31', '2027-01-07', true],
  ]);
  assert.equal(postponed.task.dueDateHistory[0].actor, session.user.name);
  const broughtForward = await request(`/tasks/${key}`, 'PATCH', { dueDate: '2026-12-01' });
  assert.equal(broughtForward.task.dueDatePostponementCount, 1);
  assert.equal(broughtForward.task.dueDateHistory.length, 2);
  assert.equal(broughtForward.task.dueDateHistory[1].isPostponement, false);
  const listed = await request('/tasks');
  assert.equal(listed.data.find(item => item.key === key).dueDatePostponementCount, 1);
  const result = await request(`/tasks/${key}`);
  assert.equal(result.task.subtasks.length, 2);
  await request(`/tasks/${key}`, 'DELETE');
  await request(`/tasks/${key}`, 'GET', undefined, 404);
});

test('task collaborators are saved, can access shared tasks, and cannot change task progress', async () => {
  const collaborator = (await request('/users', 'POST', {
    email: 'task-collaborator@example.test', name: 'Người phối hợp', password: 'Collaborator-26!Secure',
    employeeCode: 'TASK-COLLABORATOR', role: 'USER',
  }, 201)).user;
  const { task } = await request('/tasks', 'POST', {
    taskTitle: 'Nhiệm vụ phối hợp', priority: 'Cao', dueDate: '2026-12-31',
    assigneeId: session.user.id, collaboratorIds: [collaborator.id, collaborator.id],
  }, 201);
  assert.deepEqual(task.collaborators, [{ id: collaborator.id, name: collaborator.name, employeeCode: collaborator.employeeCode }]);
  await request('/tasks', 'POST', {
    taskTitle: 'Không cho trùng người thực hiện', priority: 'Cao', dueDate: '2026-12-31',
    assigneeId: session.user.id, collaboratorIds: [session.user.id],
  }, 422);
  await request('/tasks', 'POST', {
    taskTitle: 'Không nhận người liên quan không tồn tại', priority: 'Cao', dueDate: '2026-12-31',
    assigneeId: session.user.id, collaboratorIds: ['missing-collaborator'],
  }, 422);
  await request('/tasks', 'POST', {
    taskTitle: 'Không cho danh sách liên quan quá dài', priority: 'Cao', dueDate: '2026-12-31',
    assigneeId: session.user.id, collaboratorIds: Array.from({ length: 51 }, (_, index) => `invalid-${index}`),
  }, 422);

  const collaboratorSession = await request('/auth/login', 'POST', {
    email: 'task-collaborator@example.test', password: 'Collaborator-26!Secure',
  });
  const collaboratorHeaders = { ...headers, Authorization: `Bearer ${collaboratorSession.access_token || collaboratorSession.token}` };
  const visibleTasks = await request('/tasks', 'GET', undefined, 200, collaboratorHeaders);
  assert.ok(visibleTasks.data.some(item => item.key === task.key));
  const sharedTask = await request(`/tasks/${task.key}`, 'GET', undefined, 200, collaboratorHeaders);
  assert.equal(sharedTask.task.collaborators[0].id, collaborator.id);
  await request(`/tasks/${task.key}`, 'PATCH', { progress: 20 }, 403, collaboratorHeaders);
  const commented = await request(`/tasks/${task.key}/comments`, 'POST', { content: 'Đã trao đổi với người thực hiện.' }, 201, collaboratorHeaders);
  assert.equal(commented.task.comments[0].author, collaborator.name);
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
  for (const [key, startTime, endTime, breakTime, nightAllowancePct] of [['day', '08:00', '17:00', '12:00 - 13:00', 0], ['night', '22:00', '07:00', '02:00 - 03:00', 30]]) {
    await request('/collections/attendance_shifts', 'POST', { record: { key, shiftCode: key, shiftName: key, startTime, endTime, breakTime, nightAllowancePct, timeRange: `${startTime} - ${endTime}`, workingHours: 8, workUnits: 1, status: 'Đang áp dụng' } }, 201);
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

test('aiMarketing onboarding validates goals, persists the admin choice and rejects non-admin access', async () => {
  const route = '/marketing/onboarding';
  const anonymousHeaders = { 'Content-Type': 'application/json' };
  await request(route, 'GET', undefined, 401, anonymousHeaders);
  assert.equal((await request(route)).onboarding, null);
  await request(route, 'PUT', { primaryProduct: 'email_marketing', selectedGoals: [] }, 422);
  await request(route, 'PUT', { primaryProduct: 'email_marketing', selectedGoals: ['track_behavior'] }, 422);
  await request(route, 'PUT', { primaryProduct: 'email_marketing', selectedGoals: ['attract_customers', 'attract_customers'] }, 422);

  const employee = (await request('/users', 'POST', { email: 'marketing-staff@example.test', name: 'Marketing Staff', password: 'Marketing-Test-26!Secure', employeeCode: 'TEST-MARKETING', role: 'USER' }, 201)).user;
  const employeeSession = await request('/auth/login', 'POST', { email: 'marketing-staff@example.test', password: 'Marketing-Test-26!Secure' });
  const employeeHeaders = { ...headers, Authorization: `Bearer ${employeeSession.access_token || employeeSession.token}` };
  await request(route, 'GET', undefined, 403, employeeHeaders);
  await request(route, 'PUT', { primaryProduct: 'email_marketing', selectedGoals: ['attract_customers'] }, 403, employeeHeaders);

  const saved = await request(route, 'PUT', { primaryProduct: 'marketing_automation', selectedGoals: ['collect_leads', 'track_behavior', 'automate_customer_care', 'automate_marketing'] });
  assert.equal(saved.onboarding.key, 'primary-goals');
  assert.equal(saved.onboarding.primaryProduct, 'marketing_automation');
  assert.deepEqual(saved.onboarding.selectedGoals, ['collect_leads', 'track_behavior', 'automate_customer_care', 'automate_marketing']);
  assert.equal(saved.onboarding.createdBy, session.user.name);
  assert.ok(Number.isFinite(Date.parse(saved.onboarding.updatedAt)));
  const loaded = await request(route);
  assert.deepEqual(loaded.onboarding.selectedGoals, saved.onboarding.selectedGoals);
  const updated = await request(route, 'PUT', { primaryProduct: 'email_marketing', selectedGoals: ['nurture_leads', 'send_email_marketing'] });
  assert.equal(updated.onboarding.createdAt, saved.onboarding.createdAt);
  assert.equal(updated.onboarding.primaryProduct, 'email_marketing');
  assert.deepEqual((await request(route)).onboarding.selectedGoals, ['nurture_leads', 'send_email_marketing']);
});

test('application usage combines real login sessions and tracked visits with admin-only filtered reporting', async () => {
  const reportRoute = '/admin/usage';
  const visitRoute = '/admin/usage/activity';
  const anonymousHeaders = { 'Content-Type': 'application/json' };
  await request(reportRoute, 'GET', undefined, 401, anonymousHeaders);
  await request(`${reportRoute}?application=invalid`, 'GET', undefined, 422, headers);
  await request(`${reportRoute}?period=invalid`, 'GET', undefined, 422, headers);
  const marketingSession = await request('/auth/login', 'POST', { email: 'marketing-staff@example.test', password: 'Marketing-Test-26!Secure' });
  const marketingHeaders = { ...headers, Authorization: `Bearer ${marketingSession.access_token || marketingSession.token}` };
  await request(reportRoute, 'GET', undefined, 403, marketingHeaders);
  await request(visitRoute, 'POST', { application: 'unknown' }, 422);

  const employee = (await request('/users', 'POST', { email: 'usage-staff@example.test', name: 'Usage Staff', password: 'Usage-Test-26!Secure', employeeCode: 'TEST-USAGE', role: 'USER' }, 201)).user;
  const employeeSession = await request('/auth/login', 'POST', { email: 'usage-staff@example.test', password: 'Usage-Test-26!Secure' });
  const employeeHeaders = { ...headers, Authorization: `Bearer ${employeeSession.access_token || employeeSession.token}` };
  const firstVisit = await request(visitRoute, 'POST', { application: 'hr' }, 201, employeeHeaders);
  assert.equal(firstVisit.recorded, true);
  const duplicateVisit = await request(visitRoute, 'POST', { application: 'hr' }, 201, employeeHeaders);
  assert.equal(duplicateVisit.recorded, false);

  const report = await request(`${reportRoute}?application=hr&period=this_week`);
  const usage = report.data.find(item => item.userId === employee.id);
  assert.ok(usage);
  assert.equal(usage.name, employee.name);
  assert.equal(usage.email, employee.email);
  assert.equal(usage.loginCount, 1);
  assert.equal(usage.operationCount, 1);
  assert.ok(Number.isFinite(Date.parse(usage.lastUsedAt)));
  assert.equal(report.summary.loggedInPeople, report.data.filter(item => item.loginCount > 0).length);
  assert.equal(report.summary.operatedPeople, report.data.filter(item => item.operationCount > 0).length);
  assert.match(report.fromDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(report.toDate, /^\d{4}-\d{2}-\d{2}$/);
  await request(`${reportRoute}?application=invalid&period=this_week`, 'GET', undefined, 422);
  const allApplications = await request(`${reportRoute}?application=all&period=all_time`);
  assert.ok(allApplications.data.some(item => item.userId === employee.id));
});

test('job position catalog validates fields, persists edits and restricts shared writes to admins', async () => {
  const scope = '/collections/dropdown_positions';
  const position = (await request(scope, 'POST', { record: {
    id: 'position-qa-01', code: 'POS-QA-01', name: 'Kỹ sư đảm bảo chất lượng',
    department: 'Khối Công nghệ', positionGroup: 'Chuyên môn', title: 'Kỹ sư QA',
  } }, 201)).record;
  assert.equal(position.key, 'position-qa-01');
  assert.equal(position.code, 'POS-QA-01');
  assert.equal(position.department, 'Khối Công nghệ');
  assert.equal(position.positionGroup, 'Chuyên môn');
  assert.equal(position.title, 'Kỹ sư QA');
  await request(scope, 'POST', { record: {
    id: 'position-duplicate-code', code: 'pos-qa-01', name: 'Vị trí trùng mã',
  } }, 409);
  const updated = (await request(`${scope}/${position.key}`, 'PATCH', { patch: {
    department: 'Trung tâm Sản phẩm', positionGroup: 'Quản lý', title: 'Trưởng nhóm QA',
  } })).record;
  assert.equal(updated.department, 'Trung tâm Sản phẩm');
  assert.equal(updated.positionGroup, 'Quản lý');
  assert.equal(updated.title, 'Trưởng nhóm QA');
  assert.equal((await request(scope)).data.find(item => item.key === position.key).title, 'Trưởng nhóm QA');

  await request('/users', 'POST', {
    email: 'position-catalog-staff@example.test', name: 'Nhân viên xem danh mục',
    password: 'Position-Catalog-26!Secure', employeeCode: 'POSITION-STAFF', role: 'USER',
  }, 201);
  const employeeSession = await request('/auth/login', 'POST', {
    email: 'position-catalog-staff@example.test', password: 'Position-Catalog-26!Secure',
  });
  const employeeHeaders = { ...headers, Authorization: `Bearer ${employeeSession.access_token || employeeSession.token}` };
  assert.ok((await request(scope, 'GET', undefined, 200, employeeHeaders)).data.some(item => item.key === position.key));
  await request(scope, 'POST', { record: { id: 'position-forbidden', name: 'Không được ghi' } }, 403, employeeHeaders);
  await request(`${scope}/${position.key}`, 'PATCH', { patch: { title: 'Không được sửa' } }, 403, employeeHeaders);
  await request(`${scope}/${position.key}`, 'DELETE', undefined, 403, employeeHeaders);
  await request(`${scope}/${position.key}`, 'DELETE');
});

test('admin audit logs support server search and category filters with admin-only access', async () => {
  const marker = `audit-search-${Date.now()}`;
  await request('/audit-events', 'POST', { action: 'create_audit_probe', module: 'audit_test', detail: marker, details: { marker, count: 3 } }, 201);
  await request('/audit-events', 'POST', { action: 'update_audit_probe', module: 'audit_test', detail: `${marker}-updated`, details: { marker, changed: true } }, 201);
  await request('/audit-events', 'POST', { action: 'Cấu hình 2FA', module: 'Bảo mật', detail: `${marker}-security` }, 201);

  const created = await request(`/admin/audit-logs?q=${marker}&category=create&page=1&limit=1`);
  assert.equal(created.pagination.total, 1);
  assert.equal(created.pagination.page, 1);
  assert.equal(created.data[0].action, 'create_audit_probe');
  assert.equal(created.data[0].role, 'ADMIN');
  assert.equal(created.data[0].resourceId, marker);
  assert.deepEqual(created.data[0].details, { marker, count: 3, source: 'client' });

  const sensitive = await request(`/admin/audit-logs?q=${marker}&category=sensitive`);
  assert.equal(sensitive.pagination.total, 1);
  assert.equal(sensitive.data[0].action, 'update_audit_probe');
  const security = await request(`/admin/audit-logs?q=${marker}-security&category=auth`);
  assert.equal(security.pagination.total, 1);
  assert.equal(security.data[0].module, 'Bảo mật');
  await request('/admin/audit-logs?category=unknown', 'GET', undefined, 422);

  await request('/users', 'POST', {
    email: 'audit-viewer@example.test', name: 'Nhân viên xem nhật ký',
    password: 'Audit-Viewer-26!Secure', employeeCode: 'AUDIT-VIEWER', role: 'USER',
  }, 201);
  const viewerSession = await request('/auth/login', 'POST', { email: 'audit-viewer@example.test', password: 'Audit-Viewer-26!Secure' });
  const viewerHeaders = { ...headers, Authorization: `Bearer ${viewerSession.access_token || viewerSession.token}` };
  await request('/admin/audit-logs', 'GET', undefined, 403, viewerHeaders);
});

test('admin trash preserves deleted collection records and supports safe restore or permanent deletion', async () => {
  const scope = '/collections/trash_probe';
  const recordKey = `trash-record-${Date.now()}`;
  const created = (await request(scope, 'POST', { record: { key: recordKey, name: 'Hồ sơ kiểm tra thùng rác', code: 'TRASH-01' } }, 201)).record;
  const deletion = await request(`${scope}/${encodeURIComponent(recordKey)}`, 'DELETE');
  assert.ok(deletion.trashItemId);
  assert.equal((await request(scope)).data.some(item => item.key === recordKey), false);

  const listed = await request(`/admin/trash?q=${encodeURIComponent(recordKey)}`);
  assert.equal(listed.pagination.total, 1);
  assert.equal(listed.data[0].id, deletion.trashItemId);
  assert.equal(listed.data[0].scope, 'trash_probe');
  assert.equal(listed.data[0].recordKey, recordKey);
  assert.equal(listed.data[0].label, created.name);

  const restored = await request(`/admin/trash/${encodeURIComponent(deletion.trashItemId)}/restore`, 'POST', {});
  assert.equal(restored.restored, true);
  assert.equal(restored.record.key, recordKey);
  assert.equal(restored.record.code, 'TRASH-01');
  assert.equal((await request(scope)).data.some(item => item.key === recordKey), true);
  await request(`${scope}/${encodeURIComponent(recordKey)}`, 'DELETE');
  const secondTrashItem = (await request(`/admin/trash?q=${encodeURIComponent(recordKey)}`)).data[0];
  await request(`/admin/trash/${encodeURIComponent(secondTrashItem.id)}`, 'DELETE');
  assert.equal((await request(`/admin/trash?q=${encodeURIComponent(recordKey)}`)).pagination.total, 0);

  await request('/users', 'POST', {
    email: 'trash-viewer@example.test', name: 'Nhân viên không có quyền thùng rác',
    password: 'Trash-Viewer-26!Secure', employeeCode: 'TRASH-VIEWER', role: 'USER',
  }, 201);
  const viewerSession = await request('/auth/login', 'POST', { email: 'trash-viewer@example.test', password: 'Trash-Viewer-26!Secure' });
  const viewerHeaders = { ...headers, Authorization: `Bearer ${viewerSession.access_token || viewerSession.token}` };
  await request('/admin/trash', 'GET', undefined, 403, viewerHeaders);
});

test('system broadcasts persist server-side and track real in-app recipients and reads', async () => {
  const suffix = Date.now();
  const employee = (await request('/users', 'POST', {
    email: `broadcast-${suffix}@example.test`, name: 'Nhân viên nhận thông báo',
    password: 'Broadcast-26!Secure', employeeCode: `BROADCAST-${suffix}`, role: 'USER', department: 'Công nghệ',
  }, 201)).user;
  const employeeSession = await request('/auth/login', 'POST', {
    email: employee.email, password: 'Broadcast-26!Secure',
  });
  const employeeHeaders = { ...headers, Authorization: `Bearer ${employeeSession.access_token || employeeSession.token}` };

  await request('/admin/system/broadcasts', 'GET', undefined, 403, employeeHeaders);
  await request('/admin/system/broadcasts', 'POST', {
    title: 'Thông báo SMS không hỗ trợ', content: 'Nội dung thử', type: 'info', sender: 'Quản trị viên',
    targetType: 'employee', targetIds: [employee.id], channels: ['SMS'],
  }, 422);

  const created = (await request('/admin/system/broadcasts', 'POST', {
    title: 'Thông báo kiểm thử', content: 'Nội dung được lưu cho đúng nhân sự.', type: 'info', sender: 'Quản trị viên',
    targetType: 'employee', targetIds: [employee.id], channels: ['In-app', 'Email'],
  }, 201)).broadcast;
  assert.equal(created.status, 'Gửi một phần');
  assert.equal(created.targetAudience, `${employee.name} (${employee.employeeCode})`);
  assert.equal(created.totalRecipients, 1);
  assert.equal(created.inAppSentCount, 1);
  assert.equal(created.emailFailedCount, 1);
  assert.equal(created.readCount, 0);

  const notifications = await request('/notifications', 'GET', undefined, 200, employeeHeaders);
  const delivered = notifications.data.find(item => item.title === created.title);
  assert.ok(delivered);
  assert.equal(delivered.message, created.content);
  await request(`/notifications/${delivered.id}/read`, 'PATCH', {}, 200, employeeHeaders);
  const readBroadcast = (await request('/admin/system/broadcasts')).data.find(item => item.id === created.id);
  assert.equal(readBroadcast.readCount, 1);

  const resent = (await request(`/admin/system/broadcasts/${created.id}/resend`, 'POST')).broadcast;
  assert.equal(resent.status, 'Gửi một phần');
  assert.equal(resent.totalRecipients, 1);
  assert.equal(resent.readCount, 0);
  assert.equal((await request('/notifications', 'GET', undefined, 200, employeeHeaders)).data.find(item => item.id === delivered.id).read, false);

  await request(`/admin/system/broadcasts/${created.id}`, 'PATCH', {
    title: 'Thông báo đã cập nhật', content: 'Nội dung cập nhật', type: 'warning', sender: 'Phòng hệ thống',
  });
  const updatedNotification = (await request('/notifications', 'GET', undefined, 200, employeeHeaders)).data.find(item => item.id === delivered.id);
  assert.equal(updatedNotification.title, 'Thông báo đã cập nhật');
  assert.equal(updatedNotification.message, 'Nội dung cập nhật');
  await request(`/admin/system/broadcasts/${created.id}`, 'DELETE', undefined, 200);
  assert.ok((await request('/notifications', 'GET', undefined, 200, employeeHeaders)).data.some(item => item.id === delivered.id));
});

test('returns and discounts adjust the original document, debts, sales totals, cash and VAT', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const sale = { documentType: 'sale', subtype: 'Đơn bán hàng', partnerName: 'Khách có hàng trả lại', description: 'Bán hàng', amount: 1_100_000, paidAmount: 0, documentDate: today, dueDate: '', status: 'Đã bàn giao', taxCode: '0100109106', vatRate: 10, vatAmount: 100_000 };
  const original = (await request('/finance/documents', 'POST', sale, 201)).document;
  const ret = { documentType: 'sale', subtype: 'Hàng bán bị trả lại', partnerName: 'Tên giả', description: 'Khách trả hàng lỗi', amount: 330_000, paidAmount: 0, documentDate: today, dueDate: '', status: 'Đã ghi nhận', taxCode: '', vatRate: 10, vatAmount: 30_000, adjustsDocumentId: original.key, terms: { reason: 'Hàng lỗi', invoiceNo: 'DC-01' } };
  const quote = (await request('/finance/documents', 'POST', { ...sale, subtype: 'Báo giá', status: 'Báo giá' }, 201)).document;
  const overviewBefore = (await request(`/finance/overview?dateFrom=${today}&dateTo=${today}`)).documents;
  await request('/finance/documents', 'POST', { ...ret, terms: { invoiceNo: 'DC-01' } }, 422);
  await request('/finance/documents', 'POST', { ...ret, vatRate: 0, vatAmount: 0 }, 422);
  await request('/finance/documents', 'POST', { ...ret, amount: 1_210_000, vatAmount: 110_000 }, 422);
  await request('/finance/documents', 'POST', { ...ret, adjustsDocumentId: undefined }, 422);
  await request('/finance/documents', 'POST', { ...ret, subtype: 'Đơn bán hàng' }, 422);
  await request('/finance/documents', 'POST', { ...ret, subtype: 'Hàng mua trả lại', documentType: 'purchase' }, 422);
  await request('/finance/documents', 'POST', { ...ret, adjustsDocumentId: 'missing' }, 422);
  await request('/finance/documents', 'POST', { ...ret, documentDate: '2000-01-01' }, 422);
  await request('/finance/documents', 'POST', { ...ret, adjustsDocumentId: quote.key }, 422);
  const saved = (await request('/finance/documents', 'POST', ret, 201)).document;
  assert.equal(saved.partnerName, 'Khách có hàng trả lại');
  assert.equal(saved.taxCode, '0100109106');
  assert.equal(saved.adjustsDocumentId, original.key);
  assert.equal(saved.remainingAmount, 0);
  assert.deepEqual(saved.termWarnings, []);
  await request('/finance/documents', 'POST', { ...ret, adjustsDocumentId: saved.key }, 422);
  await request('/finance/documents', 'POST', { ...ret, amount: 770_001, vatAmount: 70_000, terms: { reason: 'Quá mức' } }, 422);
  const refunded = (await request('/finance/documents', 'POST', { ...ret, amount: 110_000, vatAmount: 10_000, paidAmount: 0, description: 'Giảm giá sau bán' , subtype: 'Giảm giá hàng bán', terms: { reason: 'Giảm giá', invoiceNo: 'DC-02' } }, 201)).document;
  const listed = (await request('/finance/documents?documentType=sale')).data;
  const updated = listed.find((item) => item.key === original.key);
  assert.equal(updated.adjustedAmount, 440_000);
  assert.equal(updated.remainingAmount, 660_000);
  const overviewAfter = (await request(`/finance/overview?dateFrom=${today}&dateTo=${today}`)).documents;
  assert.equal(overviewBefore.sales - overviewAfter.sales, 440_000, 'doanh số giảm đúng phần điều chỉnh');
  assert.equal(overviewBefore.receivable - overviewAfter.receivable, 440_000, 'công nợ phải thu giảm đúng phần điều chỉnh');

  const invoice = (await request('/finance/documents', 'POST', { documentType: 'invoice', subtype: 'Đầu ra', partnerName: 'Khách VAT', description: 'Hóa đơn', amount: 11_000_000, paidAmount: 0, documentDate: '2026-03-10', dueDate: '', status: 'Đã phát hành', taxCode: '', vatRate: 10, vatAmount: 1_000_000 }, 201)).document;
  const estimate = async () => (await request('/finance/tax/estimate?taxType=Thu%E1%BA%BF%20GTGT&periodStart=2026-03-01&periodEnd=2026-03-31&filingMethod=Th%C3%A1ng')).data.vat.outputVat;
  assert.equal(await estimate(), 1_000_000);
  await request('/finance/documents', 'POST', { documentType: 'invoice', subtype: 'Giảm giá hàng bán', partnerName: 'x', description: 'Điều chỉnh giảm', amount: 1_100_000, paidAmount: 0, documentDate: '2026-03-20', dueDate: '', status: 'Đã ghi nhận', taxCode: '', vatRate: 10, vatAmount: 100_000, adjustsDocumentId: invoice.key, terms: { reason: 'Chiết khấu thương mại', invoiceNo: 'DC-03' } }, 201);
  assert.equal(await estimate(), 900_000);
});

test('ledger entries are built from documents and disposals with leaf accounts and cannot be posted twice', async () => {
  await request('/finance/chart-of-accounts/templates/import', 'POST', {}, 201).catch(() => request('/finance/chart-of-accounts/templates/import', 'POST', {}, 200));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const sale = { documentType: 'sale', subtype: 'Đơn bán hàng', partnerName: 'Khách ghi sổ', description: 'Bán', amount: 1_100_000, paidAmount: 0, documentDate: today, dueDate: '', status: 'Đã bàn giao', taxCode: '', vatRate: 10, vatAmount: 100_000 };
  const delivered = (await request('/finance/documents', 'POST', sale, 201)).document;
  const preview = (await request(`/finance/documents/${delivered.key}/ledger-entry`, 'POST', { preview: true })).preview;
  assert.equal(preview.amount, 1_100_000);
  assert.equal(preview.lines.reduce((sum, line) => sum + line.debit, 0), preview.lines.reduce((sum, line) => sum + line.credit, 0));
  assert.ok(preview.lines.find((line) => line.defaultAccount === '3331').account.startsWith('3331'));
  assert.equal((await request(`/finance/documents/${delivered.key}/ledger-entry`, 'POST', { accountMap: { 511: 'abc' } }, 422)).message.includes('511'), true);
  const posted = (await request(`/finance/documents/${delivered.key}/ledger-entry`, 'POST', {}, 201)).record;
  assert.equal(posted.sourceReference, `document:${delivered.key}`);
  assert.equal(posted.amount, 1_100_000);
  await request(`/finance/documents/${delivered.key}/ledger-entry`, 'POST', {}, 409);
  assert.ok((await request('/finance/ledger-postings')).data.some((item) => item.sourceReference === `document:${delivered.key}`));
  const ledger = (await request('/collections/finance_general_ledger')).data;
  assert.ok(ledger.some((item) => item.sourceReference === `document:${delivered.key}`));

  const pending = (await request('/finance/documents', 'POST', { ...sale, status: 'Đang triển khai' }, 201)).document;
  await request(`/finance/documents/${pending.key}/ledger-entry`, 'POST', {}, 422);
  const quote = (await request('/finance/documents', 'POST', { ...sale, subtype: 'Báo giá', status: 'Báo giá' }, 201)).document;
  await request(`/finance/documents/${quote.key}/ledger-entry`, 'POST', {}, 422);
  const order = (await request('/finance/documents', 'POST', { documentType: 'purchase', subtype: 'Đơn mua hàng', partnerName: 'NCC ghi sổ', description: 'Mua', amount: 550_000, paidAmount: 0, documentDate: today, dueDate: '', status: 'Chờ xử lý', taxCode: '', vatRate: 10, vatAmount: 50_000 }, 201)).document;
  await request(`/finance/documents/${order.key}/ledger-entry`, 'POST', {}, 422);
  const received = (await request('/finance/documents', 'POST', { documentType: 'purchase', subtype: 'Đơn mua hàng', partnerName: 'NCC ghi sổ', description: 'Mua', amount: 550_000, paidAmount: 0, documentDate: today, dueDate: '', status: 'Đã nhận hàng', taxCode: '', vatRate: 10, vatAmount: 50_000 }, 201)).document;
  const purchasePreview = (await request(`/finance/documents/${received.key}/ledger-entry`, 'POST', { preview: true })).preview;
  assert.deepEqual(purchasePreview.lines.map((line) => [line.defaultAccount, line.debit, line.credit]), [['156', 500_000, 0], ['1331', 50_000, 0], ['331', 0, 550_000]]);
  await request(`/finance/documents/${received.key}/ledger-entry`, 'POST', {}, 201);

  const returned = (await request('/finance/documents', 'POST', { ...sale, subtype: 'Hàng bán bị trả lại', status: 'Đã ghi nhận', amount: 110_000, vatAmount: 10_000, adjustsDocumentId: delivered.key, terms: { reason: 'Trả hàng' } }, 201)).document;
  const missing = await request(`/finance/documents/${returned.key}/ledger-entry`, 'POST', {}, 422);
  assert.match(missing.message, /521/);
  assert.equal((await request(`/finance/documents/${returned.key}/ledger-entry`, 'POST', { accountMap: { 521: '511' } }, 201)).record.amount, 110_000);

  await request('/collections/asset_items', 'POST', { record: { key: 'ledger-asset', code: 'AST-LEDGER', name: 'Thiết bị ghi sổ', category: 'Máy móc', originalPrice: 10_000_000, accumulatedDepreciation: 4_000_000, netBookValue: 6_000_000, status: 'Đang sử dụng', history: [] } }, 201);
  await request('/collections/asset_disposals', 'POST', { record: { key: 'ledger-disposal', disposalCode: 'TL-LEDGER', assetKey: 'ledger-asset', disposalMethod: 'Báo mất / Thất lạc do rủi ro', reason: 'Mất', disposalDate: '2026-10-27', councilLeader: 'A', councilMembers: 'B' } }, 201);
  await request('/finance/asset-disposals/ledger-disposal/ledger-entry', 'POST', {}, 422);
  await request('/collections/asset_disposals/ledger-disposal', 'PATCH', { patch: { status: 'Đang thực hiện xử lý' } });
  await request('/collections/asset_disposals/ledger-disposal', 'PATCH', { patch: { status: 'Đã xử lý mất', actualDisposalPrice: 0, disposalCost: 0, disposalDate: '2026-10-28', buyerName: '' } });
  const lost = (await request('/finance/asset-disposals/ledger-disposal/ledger-entry', 'POST', { preview: true })).preview;
  assert.equal(lost.amount, 10_000_000);
  assert.ok(lost.lines.find((line) => line.defaultAccount === '214').account.startsWith('214'));
  assert.equal((await request('/finance/asset-disposals/ledger-disposal/ledger-entry', 'POST', {}, 201)).record.sourceReference, 'asset-disposal:ledger-disposal');
  await request('/finance/asset-disposals/ledger-disposal/ledger-entry', 'POST', {}, 409);
  await request('/finance/asset-disposals/missing/ledger-entry', 'POST', {}, 404);
});

test('inventory issues post cost of goods sold once and reconcile with the ledger', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  await request('/collections/finance_inventory_settings/global', 'PATCH', { patch: { warehouseNames: ['Kho A', 'Kho B', 'Kho C', 'Kho giá vốn'] } }, 200);
  const product = (await request('/collections/finance_inventory', 'POST', { record: { key: 'cogs-item', sku: 'COGS-ITEM', name: 'Hàng giá vốn', category: 'Linh kiện', unit: 'Cái', warehouse: 'Kho giá vốn', issueMethod: 'FIFO' } }, 201)).record;
  await request('/finance/inventory/transactions', 'POST', { type: 'Nhập kho', transactionCode: 'NK-COGS-01', transactionDate: today, destinationWarehouse: 'Kho giá vốn', lines: [{ productKey: product.key, quantity: 10, unitCost: 1000 }] }, 201);
  const issue = (await request('/finance/inventory/transactions', 'POST', { type: 'Xuất kho', transactionCode: 'XK-COGS-01', transactionDate: today, sourceWarehouse: 'Kho giá vốn', reason: 'Bán hàng', lines: [{ productKey: product.key, quantity: 4 }] }, 201)).transaction;
  assert.equal(issue.totalAmount, 4000);
  const preview = (await request('/finance/inventory-transactions/XK-COGS-01/ledger-entry', 'POST', { preview: true })).preview;
  assert.deepEqual(preview.lines.map((line) => [line.defaultAccount, line.debit, line.credit]), [['632', 4000, 0], ['156', 0, 4000]]);
  const posted = (await request('/finance/inventory-transactions/XK-COGS-01/ledger-entry', 'POST', {}, 201)).record;
  assert.equal(posted.sourceReference, 'inventory-issue:XK-COGS-01');
  await request('/finance/inventory-transactions/XK-COGS-01/ledger-entry', 'POST', {}, 409);
  assert.ok((await request('/finance/ledger-postings')).data.some((item) => item.sourceReference === 'inventory-issue:XK-COGS-01'));
  await request('/finance/inventory-transactions/NK-COGS-01/ledger-entry', 'POST', {}, 422);
  await request('/finance/inventory-transactions/MISSING/ledger-entry', 'POST', {}, 404);
  const shipment = (await request('/finance/inventory/transactions', 'POST', { type: 'Giao hàng', transactionCode: 'GH-COGS-01', transactionDate: today, sourceWarehouse: 'Kho giá vốn', reason: 'Khách A', deliveryAddress: 'Hà Nội', lines: [{ productKey: product.key, quantity: 1 }] }, 201)).transaction;
  assert.equal(shipment.shipmentStatus, 'Chờ giao');
  await request('/finance/inventory-transactions/GH-COGS-01/ledger-entry', 'POST', {}, 422);
  const reconciliation = await request('/finance/inventory/ledger-reconciliation');
  assert.equal(typeof reconciliation.inventoryValue, 'number');
  assert.equal(reconciliation.difference, reconciliation.inventoryValue - reconciliation.ledgerBalance);
  assert.deepEqual(reconciliation.byAccount.map((row) => row.account), ['152', '153', '155', '156']);
});

test('stock count differences and inventory write-down provisions post to the ledger', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const countBody = { type: 'Kiểm kê', transactionDate: today, sourceWarehouse: 'Kho giá vốn', lines: [{ productKey: 'cogs-item', warehouse: 'Kho giá vốn', actualQty: 3 }] };
  await request('/finance/inventory/transactions', 'POST', { ...countBody, transactionCode: 'KK-COGS-NOREASON' }, 422);
  const count = (await request('/finance/inventory/transactions', 'POST', { ...countBody, transactionCode: 'KK-COGS-01', reason: 'Biên bản kiểm kê cuối quý' }, 201)).transaction;
  assert.equal(count.lines[0].difference, -2);
  assert.equal(count.shortageAmount, 2000);
  assert.equal(count.surplusAmount, 0);
  const preview = (await request('/finance/inventory-transactions/KK-COGS-01/ledger-entry', 'POST', { preview: true })).preview;
  assert.deepEqual(preview.lines.map((line) => [line.defaultAccount, line.debit, line.credit]), [['1381', 2000, 0], ['156', 0, 2000]]);
  assert.equal((await request('/finance/inventory-transactions/KK-COGS-01/ledger-entry', 'POST', { accountMap: { 1381: '632' } }, 201)).record.sourceReference, 'inventory-count:KK-COGS-01');
  await request('/finance/inventory-transactions/KK-COGS-01/ledger-entry', 'POST', {}, 409);
  const even = (await request('/finance/inventory/transactions', 'POST', { ...countBody, transactionCode: 'KK-COGS-02', lines: [{ productKey: 'cogs-item', warehouse: 'Kho giá vốn', actualQty: 3 }] }, 201)).transaction;
  assert.equal(even.lines[0].difference, 0);
  await request('/finance/inventory-transactions/KK-COGS-02/ledger-entry', 'POST', {}, 422);

  const provision = { asOfDate: today, evidence: 'Báo giá thị trường ngày hôm nay', lines: [{ productKey: 'cogs-item', nrvUnit: 600 }] };
  await request('/finance/inventory/provisions', 'POST', { ...provision, asOfDate: '2026-01-01' }, 422);
  await request('/finance/inventory/provisions', 'POST', { ...provision, evidence: '' }, 422);
  await request('/finance/inventory/provisions', 'POST', { ...provision, lines: [{ productKey: 'missing', nrvUnit: 1 }] }, 404);
  await request('/finance/inventory/provisions', 'POST', { ...provision, lines: [{ productKey: 'cogs-item', nrvUnit: -1 }] }, 422);
  const created = (await request('/finance/inventory/provisions', 'POST', provision, 201)).record;
  assert.equal(created.lines[0].cost, 3000);
  assert.equal(created.lines[0].nrv, 1800);
  assert.equal(created.totalRequired, 1200);
  assert.equal(created.totalAdjustment, 1200);
  await request('/finance/inventory/provisions', 'POST', provision, 409);
  await request('/collections/finance_inventory_provisions', 'POST', { record: { key: 'forged' } }, 409);
  assert.equal((await request('/finance/inventory/provisions')).data[0].key, created.key);
  const provisionPreview = (await request(`/finance/inventory-provisions/${created.key}/ledger-entry`, 'POST', { preview: true })).preview;
  assert.deepEqual(provisionPreview.lines.map((line) => [line.defaultAccount, line.debit, line.credit]), [['632', 1200, 0], ['2294', 0, 1200]]);
  assert.equal((await request(`/finance/inventory-provisions/${created.key}/ledger-entry`, 'POST', {}, 201)).record.sourceReference, `inventory-provision:${created.key}`);
  await request(`/finance/inventory-provisions/${created.key}/ledger-entry`, 'POST', {}, 409);
});

test('document payments create posted receipts and payments, update debts and respect returns', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const bank = (await request('/finance/bank-accounts', 'POST', { bankName: 'Ngân hàng thanh toán', accountNumber: '9988776655', accountHolder: 'Công ty thanh toán', balance: 50_000_000, status: 'Đang hoạt động' }, 201)).account;
  const balanceOf = async () => (await request('/finance/payment-accounts')).accounts.find((item) => item.key === bank.key).balance;
  const sale = { documentType: 'sale', subtype: 'Đơn bán hàng', partnerName: 'Khách thanh toán', description: 'Bán', amount: 1_100_000, paidAmount: 0, documentDate: today, dueDate: '', status: 'Đã bàn giao', taxCode: '', vatRate: 10, vatAmount: 100_000 };
  const delivered = (await request('/finance/documents', 'POST', sale, 201)).document;
  const pay = (id, body, expected = 201) => request(`/finance/documents/${id}/payments`, 'POST', { sourceAccountId: bank.key, date: today, ...body }, expected);
  await pay(delivered.key, { amount: 1_200_000 }, 422);
  await pay(delivered.key, { amount: 0 }, 422);
  await pay(delivered.key, { amount: 1000, date: '2099-01-01' }, 422);
  await pay(delivered.key, { amount: 1000, date: '2000-01-01' }, 422);
  await pay(delivered.key, { amount: 1000, sourceAccountId: 'missing' }, 422);
  await pay('missing', { amount: 1000 }, 404);
  const before = await balanceOf();
  const first = await pay(delivered.key, { amount: 600_000, reference: 'UNC-001' });
  assert.equal(first.document.paidAmount, 600_000);
  assert.equal(first.document.remainingAmount, 500_000);
  assert.equal(first.transaction.type, 'Thu');
  assert.equal(first.transaction.status, 'Đã hoàn thành');
  assert.equal(first.transaction.sourceDocument, delivered.code);
  assert.equal(await balanceOf(), before + 600_000);
  const ledger = (await request('/collections/finance_general_ledger')).data.filter((item) => item.voucherCode === first.transaction.code);
  assert.equal(ledger.length, 1);
  assert.match(ledger[0].debitAccount, /^112/);
  assert.match(ledger[0].creditAccount, /^131/);

  const returned = (await request('/finance/documents', 'POST', { ...sale, subtype: 'Hàng bán bị trả lại', status: 'Đã ghi nhận', amount: 110_000, vatAmount: 10_000, adjustsDocumentId: delivered.key, terms: { reason: 'Trả hàng' } }, 201)).document;
  await pay(delivered.key, { amount: 400_000 }, 422);
  assert.equal((await pay(delivered.key, { amount: 390_000 })).document.remainingAmount, 0);
  const refund = await pay(returned.key, { amount: 50_000 });
  assert.equal(refund.transaction.type, 'Chi');
  assert.equal(refund.document.paidAmount, 50_000);
  await pay(returned.key, { amount: 60_001 }, 422);

  const purchase = (await request('/finance/documents', 'POST', { documentType: 'purchase', subtype: 'Hóa đơn đầu vào', partnerName: 'NCC thanh toán', description: 'Mua', amount: 550_000, paidAmount: 0, documentDate: today, dueDate: '', status: 'Đã nhận hàng', taxCode: '', vatRate: 10, vatAmount: 50_000 }, 201)).document;
  const paid = await pay(purchase.key, { amount: 550_000 });
  assert.equal(paid.transaction.type, 'Chi');
  assert.equal(paid.document.remainingAmount, 0);
  await pay(purchase.key, { amount: 1 }, 422);

  const invoice = (await request('/finance/documents', 'POST', { documentType: 'invoice', subtype: 'Đầu ra', partnerName: 'Khách hóa đơn', description: 'HĐ', amount: 2_200_000, paidAmount: 0, documentDate: today, dueDate: '', status: 'Đã phát hành', taxCode: '', vatRate: 10, vatAmount: 200_000 }, 201)).document;
  assert.equal((await pay(invoice.key, { amount: 2_200_000 })).document.status, 'Đã thanh toán');
  const quote = (await request('/finance/documents', 'POST', { ...sale, subtype: 'Báo giá', status: 'Báo giá' }, 201)).document;
  await pay(quote.key, { amount: 1000 }, 422);
});

test('bank statement lines without a voucher are posted from the statement and matched automatically', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const bank = (await request('/finance/bank-accounts', 'POST', { bankName: 'Ngân hàng sao kê', accountNumber: '5566778899', accountHolder: 'Công ty sao kê', balance: 1_000_000, status: 'Đang hoạt động' }, 201)).account;
  const fileHash = 'a'.repeat(64);
  const key = `statement-${bank.key}-${fileHash}`;
  const lines = [
    { key: 'l1', rowNumber: 1, transactionDate: today, direction: 'Chi', amount: 11_000, description: 'Phí SMS banking', reference: 'FT001' },
    { key: 'l2', rowNumber: 2, transactionDate: today, direction: 'Thu', amount: 2_500, description: 'Lãi không kỳ hạn' },
    { key: 'l3', rowNumber: 3, transactionDate: today, direction: 'Thu', amount: 300_000, description: 'Không rõ người chuyển' },
  ];
  await request('/collections/finance_bank_statements', 'POST', { key, record: { key, bankAccountId: bank.key, fileHash, fileName: 'saoke.csv', currency: 'VND', lines } }, 201);
  const post = (lineKey, body, expected = 201) => request(`/finance/bank-statements/${encodeURIComponent(key)}/lines/${lineKey}/post`, 'POST', body, expected);
  await post('l1', { classification: 'Phí ngân hàng', counterAccount: '1121' }, 422);
  await post('l1', { classification: 'Lãi tiền gửi', counterAccount: '515' }, 422);
  await post('missing', { classification: 'Khác', counterAccount: '1388' }, 404);
  const fee = await post('l1', { classification: 'Phí ngân hàng', counterAccount: '6422' });
  assert.equal(fee.transaction.type, 'Chi');
  assert.equal(fee.transaction.status, 'Đã hoàn thành');
  assert.equal(fee.match.cashTransactionCode, fee.transaction.code);
  await post('l1', { classification: 'Phí ngân hàng', counterAccount: '6422' }, 409);
  await post('l2', { classification: 'Lãi tiền gửi', counterAccount: '515' });
  await post('l3', { classification: 'Khác', counterAccount: '3388' });
  const balance = (await request('/finance/payment-accounts')).accounts.find((item) => item.key === bank.key).balance;
  assert.equal(balance, 1_000_000 - 11_000 + 2_500 + 300_000);
  const ledger = (await request('/collections/finance_general_ledger')).data.filter((item) => item.voucherCode === fee.transaction.code);
  assert.match(ledger[0].debitAccount, /^6422/);
  assert.match(ledger[0].creditAccount, /^112/);
  const matches = (await request('/collections/finance_bank_statement_matches')).data.filter((item) => item.statementKey === key && item.action === 'match');
  assert.equal(matches.length, 3);
});

test('enterprise service catalog validates code, category, status and price', async () => {
  const service = { key: 'svc-1', code: 'cloud-01', name: 'Máy chủ ảo', category: 'Hạ tầng Cloud & IDC', status: 'Đang cung cấp', priceMonthly: 1_500_000, features: ['SSD', ''], specs: [{ label: 'CPU', value: '4 vCPU' }], iconType: 'forged' };
  await request('/collections/enterprise_services', 'POST', { record: { ...service, key: 'svc-bad', category: 'Khác' } }, 422);
  await request('/collections/enterprise_services', 'POST', { record: { ...service, key: 'svc-neg', priceMonthly: -1 } }, 422);
  const created = (await request('/collections/enterprise_services', 'POST', { record: service }, 201)).record;
  assert.equal(created.code, 'CLOUD-01');
  assert.equal(created.iconType, 'cloud');
  assert.deepEqual(created.features, ['SSD']);
  await request('/collections/enterprise_services', 'POST', { record: { ...service, key: 'svc-2' } }, 409);
  assert.equal((await request('/collections/enterprise_services/svc-1', 'PATCH', { patch: { priceMonthly: 2_000_000 } })).record.priceMonthly, 2_000_000);
});

test('ekyc sessions only write to the employee who created them, need consent and do not leak identity data', async () => {
  const staff = (await request('/users', 'POST', { email: 'ekyc-staff@example.test', name: 'Nhân viên eKYC', password: 'Ekyc-Staff-26!Secure', employeeCode: 'EKYC-1', role: 'USER' }, 201)).user;
  const other = (await request('/users', 'POST', { email: 'ekyc-other@example.test', name: 'Nhân viên khác eKYC', password: 'Ekyc-Other-26!Secure', employeeCode: 'EKYC-2', role: 'USER' }, 201)).user;
  const login = async (email, password) => { const session = await request('/auth/login', 'POST', { email, password }); return { ...headers, Authorization: `Bearer ${session.access_token || session.token}` }; };
  const staffHeaders = await login('ekyc-staff@example.test', 'Ekyc-Staff-26!Secure');
  const otherHeaders = await login('ekyc-other@example.test', 'Ekyc-Other-26!Secure');
  const token = 'a1'.repeat(32);
  await request('/ekyc/session', 'POST', { token: 'short' }, 422, staffHeaders);
  await request('/ekyc/session', 'POST', { token, userId: other.id }, 403, staffHeaders);
  await request('/ekyc/session', 'POST', { token }, 200, staffHeaders);
  await request('/ekyc/session', 'POST', { token }, 409, otherHeaders);
  const anonymous = { 'Content-Type': 'application/json' };
  const card = { idNumber: '001203004567', name: 'NGUYỄN VĂN EKYC', birthDate: '2000-01-02', biometricConsent: true, livePhotoUrl: 'data:image/jpeg;base64,AAAA' };
  await request(`/ekyc/session/${'b2'.repeat(32)}/verify`, 'POST', { data: card }, 404, anonymous);
  await request(`/ekyc/session/${token}/verify`, 'POST', { data: { ...card, biometricConsent: false } }, 422, anonymous);
  await request(`/ekyc/session/${token}/verify`, 'POST', { data: { ...card, idNumber: '12345' } }, 422, anonymous);
  await request(`/ekyc/session/${token}/verify`, 'POST', { data: { ...card, userId: other.id } }, 403, anonymous);
  await request(`/ekyc/session/${token}/verify`, 'POST', { data: card }, 200, anonymous);
  await request(`/ekyc/session/${token}/verify`, 'POST', { data: card }, 409, anonymous);
  const stored = new DatabaseSync(env.KIYOVN_DB_PATH, { readOnly: true });
  const raw = JSON.parse(stored.prepare('SELECT details_json FROM employee_profiles WHERE user_id = ?').get(staff.id).details_json);
  stored.close();
  assert.match(raw.livePhotoUrl, /^ENC:.*"kid":"biometric-v1"/);
  assert.match(raw.docNumber, /^ENC:/);
  assert.equal((await request(`/employees/${staff.id}`)).employee.details.livePhotoUrl, card.livePhotoUrl);
  // Hồ sơ đã có số căn cước mã hóa vẫn sửa được các trường khác.
  assert.equal((await request(`/employees/${staff.id}`, 'PATCH', { details: { nationality: 'Việt Nam', gender: 'Nam' } })).employee.details.docNumber, '001203004567');
  const authProfile = (await request('/auth/profile', 'GET', undefined, 200, staffHeaders)).user;
  assert.equal(authProfile.details.ekycVerified, true);
  assert.equal(authProfile.details.livePhotoUrl, undefined);
  await request(`/ekyc/session/${token}/status?userId=${staff.id}`, 'GET', undefined, 401, anonymous);
  await request(`/ekyc/session/${'c3'.repeat(32)}/status?userId=${staff.id}`, 'GET', undefined, 403, otherHeaders);
  const status = await request(`/ekyc/session/${token}/status`, 'GET', undefined, 200, staffHeaders);
  assert.equal(status.verified, true);
  assert.equal(status.data.docNumber, '001203004567');
  assert.equal(status.data.biometricConsent, true);
  const otherStatus = await request(`/ekyc/session/${'d4'.repeat(32)}/status`, 'GET', undefined, 200, otherHeaders);
  assert.equal(otherStatus.verified, false);
  await request('/ekyc/withdraw', 'POST', { userId: staff.id }, 403, otherHeaders);
  assert.equal((await request('/ekyc/withdraw', 'POST', {}, 200, staffHeaders)).withdrawn, true);
  const after = await request(`/ekyc/session/${token}/status`, 'GET', undefined, 200, staffHeaders);
  assert.equal(after.verified, false);
  const profile = (await request(`/employees/${staff.id}`)).employee;
  assert.equal(profile.details.docNumber, '001203004567');
  assert.equal(profile.details.biometricConsent, false);
  assert.equal(profile.details.livePhotoUrl, undefined);
});

test('annual PIT finalization sums closed payslips, applies 12-month personal deduction and records authorizations', async () => {
  const staff = (await request('/users', 'POST', { email: 'pit-staff@example.test', name: 'Nhân viên quyết toán', password: 'Pit-Staff-26!Secure', employeeCode: 'PIT-1', role: 'USER' }, 201)).user;
  const login = await request('/auth/login', 'POST', { email: 'pit-staff@example.test', password: 'Pit-Staff-26!Secure' });
  const staffHeaders = { ...headers, Authorization: `Bearer ${login.access_token || login.token}` };
  for (const month of ['03', '04', '05']) {
    await request('/collections/payroll', 'POST', { record: { key: `pit-${month}`, employeeCode: 'PIT-1', employeeName: 'Nhân viên quyết toán', month: `2025-${month}`, gross: 30_000_000, exemptIncome: 0, insuranceDeduction: 2_100_000, taxDeduction: 1_000_000, netSalary: 26_900_000, status: 'Chưa chi trả' } }, 201);
  }
  await request('/collections/payroll', 'POST', { record: { key: 'pit-draft', employeeCode: 'PIT-1', month: '2025-06', gross: 99_000_000, taxDeduction: 0, status: 'Chờ duyệt' } }, 201);
  const own = (await request('/employees/me/pit-finalization?year=2025', 'GET', undefined, 200, staffHeaders)).finalization;
  assert.equal(own.months, 3);
  assert.equal(own.totalIncome, 90_000_000);
  assert.equal(own.personalDeduction, 132_000_000);
  assert.equal(own.annualTax, 0);
  assert.equal(own.difference, -3_000_000);
  assert.ok(own.authorizationProblems.some((item) => item.includes('3 tháng')));
  await request('/finance/pit-finalization?year=2025', 'GET', undefined, 403, staffHeaders);
  await request('/finance/pit-finalization/authorizations', 'POST', { year: 2025, onlyIncomeConfirmed: true }, 422, staffHeaders);
  const storage = new DatabaseSync(env.KIYOVN_DB_PATH);
  const stamp = new Date().toISOString();
  storage.prepare("INSERT INTO contracts (id, code, name, employee_user_id, contract_category, contract_type, start_date, end_date, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'labor', 'Hợp đồng lao động xác định thời hạn', '2025-01-01', '2026-12-31', 'Đang hiệu lực', ?, ?)")
    .run('pit-contract', 'HD-PIT-1', 'Hợp đồng quyết toán', staff.id, stamp, stamp);
  storage.close();
  await request('/finance/pit-finalization/authorizations', 'POST', { year: 2025, employeeId: session.user.id }, 403, staffHeaders);
  await request('/finance/pit-finalization/authorizations', 'POST', { year: 2025 }, 422, staffHeaders);
  await request('/finance/pit-finalization/authorizations', 'POST', { year: 2025, onlyIncomeConfirmed: true, otherIncomeMonthlyAverage: 12_000_000 }, 422, staffHeaders);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const expected = today > '2026-03-31' ? 409 : 200;
  await request('/finance/pit-finalization/authorizations', 'POST', { year: 2025, onlyIncomeConfirmed: true }, expected, staffHeaders);
  const thisYear = Number(today.slice(0, 4));
  await request('/collections/payroll', 'POST', { record: { key: 'pit-current', employeeCode: 'PIT-1', month: `${thisYear}-01`, gross: 20_000_000, insuranceDeduction: 0, taxDeduction: 100_000, status: 'Chưa chi trả' } }, 201);
  const authorized = await request('/finance/pit-finalization/authorizations', 'POST', { year: thisYear, onlyIncomeConfirmed: true }, 200, staffHeaders);
  assert.equal(authorized.authorization.selfAuthorized, true);
  const company = await request(`/finance/pit-finalization?year=${thisYear}`);
  const row = company.data.find((item) => item.employeeCode === 'PIT-1');
  assert.equal(row.authorization.authorized, true);
  assert.equal(company.summary.authorized >= 1, true);
  await request('/collections/hr_pit_authorizations', 'POST', { record: { key: 'forged' } }, 409);
});

test('PIT withholding vouchers are numbered, snapshot payslips, refuse authorized years and can only be cancelled', async () => {
  const staff = (await request('/users', 'POST', { email: 'voucher-staff@example.test', name: 'Nhân viên chứng từ', password: 'Voucher-Staff-26!Secure', employeeCode: 'VCH-1', role: 'USER' }, 201)).user;
  const login = await request('/auth/login', 'POST', { email: 'voucher-staff@example.test', password: 'Voucher-Staff-26!Secure' });
  const staffHeaders = { ...headers, Authorization: `Bearer ${login.access_token || login.token}` };
  for (const month of ['01', '02', '03']) {
    await request('/collections/payroll', 'POST', { record: { key: `vch-${month}`, employeeCode: 'VCH-1', month: `2025-${month}`, gross: 25_000_000, insuranceDeduction: 2_625_000, taxDeduction: 600_000, status: 'Chưa chi trả' } }, 201);
  }
  const issue = (body, expected = 201) => request('/finance/pit-vouchers', 'POST', { employeeId: staff.id, year: 2025, series: 'AA/25E', ...body }, expected);
  await request('/finance/pit-vouchers', 'POST', { employeeId: staff.id, year: 2025, fromMonth: 1, toMonth: 3, series: 'AA/25E' }, 403, staffHeaders);
  await issue({ fromMonth: 4, toMonth: 6 }, 422);
  const first = (await issue({ fromMonth: 1, toMonth: 3 })).voucher;
  assert.equal(first.number, '0000001');
  assert.equal(first.totalIncome, 75_000_000);
  assert.equal(first.taxWithheld, 1_800_000);
  assert.equal(first.person.name, 'Nhân viên chứng từ');
  assert.equal(first.status, 'Đã lập, chưa ký số');
  await issue({ fromMonth: 2, toMonth: 2 }, 409);
  await request(`/finance/pit-vouchers/${encodeURIComponent(first.key)}/cancel`, 'POST', {}, 422);
  assert.equal((await request(`/finance/pit-vouchers/${encodeURIComponent(first.key)}/cancel`, 'POST', { reason: 'Sai kỳ' })).voucher.status, 'Đã hủy');
  const second = (await issue({ fromMonth: 1, toMonth: 2 })).voucher;
  assert.equal(second.number, '0000002');
  const own = (await request('/employees/me/pit-vouchers', 'GET', undefined, 200, staffHeaders)).data;
  assert.equal(own.length, 2);
  await request('/collections/finance_pit_vouchers', 'POST', { record: { key: 'forged' } }, 409);
  const thisYear = Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric' }).format(new Date()));
  const pitRow = (await request(`/finance/pit-finalization?year=${thisYear}`)).data.find((item) => item.employeeCode === 'PIT-1');
  assert.equal(pitRow.authorization.authorized, true);
  const refused = await request('/finance/pit-vouchers', 'POST', { employeeId: pitRow.employeeId, year: thisYear, fromMonth: 1, toMonth: 1, series: 'AA/25E' }, 409);
  assert.match(refused.message, /ủy quyền quyết toán/);
});

test('foreign contractor tax records compute VAT and CIT on the server, gross up net prices and track payment', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const body = { contractorName: 'Overseas Software Ltd', country: 'Singapore', contractNo: 'HĐ-NN-01', businessType: 'services', amount: 100_000_000, priceIncludesTax: false, paymentDate: today, vat: 1, cit: 1 };
  const preview = (await request('/finance/contractor-taxes', 'POST', { ...body, preview: true })).result;
  assert.equal(preview.netPayment, 100_000_000);
  assert.equal((await request('/finance/contractor-taxes')).data.length, 0);
  await request('/finance/contractor-taxes', 'POST', { ...body, businessType: 'unknown' }, 422);
  await request('/finance/contractor-taxes', 'POST', { ...body, contractorName: '' }, 422);
  const created = (await request('/finance/contractor-taxes', 'POST', body, 201)).record;
  assert.equal(created.vat, 5_540_166);
  assert.equal(created.cit, 5_263_158);
  assert.equal(created.status, 'Chưa nộp thuế');
  const route = `/finance/contractor-taxes/${encodeURIComponent(created.key)}/paid`;
  await request(route, 'POST', { paidDate: today }, 422);
  assert.equal((await request(route, 'POST', { paidDate: today, reference: 'GNT-01' })).record.status, 'Đã nộp thuế');
  await request(route, 'POST', { paidDate: today, reference: 'GNT-01' }, 409);
  await request('/collections/finance_contractor_taxes', 'POST', { record: { key: 'forged' } }, 409);
});

test('casual income payments withhold 10% from 2 million, honour 08/CK-TNCN commitments and summarise by month', async () => {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const base = { payeeName: 'Cộng tác viên A', identityNumber: '001203004567', description: 'Dịch bài viết', contractType: 'none', paymentDate: today, residency: 'resident', amount: 3_000_000, tax: 0 };
  assert.equal((await request('/finance/casual-income', 'POST', { ...base, preview: true })).result.tax, 300_000);
  await request('/finance/casual-income', 'POST', { ...base, contractType: 'labor' }, 422);
  await request('/finance/casual-income', 'POST', { ...base, identityNumber: '123' }, 422);
  await request('/finance/casual-income', 'POST', { ...base, paymentDate: '2999-01-01' }, 422);
  const first = (await request('/finance/casual-income', 'POST', base, 201)).record;
  assert.equal(first.tax, 300_000);
  assert.equal(first.netPayment, 2_700_000);
  await request('/finance/casual-income', 'POST', { ...base, payeeName: 'Cộng tác viên B', commitment: true }, 422);
  const committed = (await request('/finance/casual-income', 'POST', { ...base, payeeName: 'Cộng tác viên B', identityNumber: '', taxCode: '0012345672', commitment: true, amount: 190_000_000 }, 201)).record;
  assert.equal(committed.tax, 0);
  const foreign = (await request('/finance/casual-income', 'POST', { ...base, payeeName: 'Foreign Expert', identityNumber: 'P1234567', residency: 'non_resident', amount: 1_000_000 }, 201)).record;
  assert.equal(foreign.tax, 200_000);
  const summary = await request(`/finance/casual-income?year=${today.slice(0, 4)}`);
  const month = summary.months.find((item) => item.month === today.slice(0, 7));
  assert.equal(month.payments, 3);
  assert.equal(month.tax, 500_000);
  assert.equal(summary.commitmentWarnings.length, 1);
  await request('/collections/finance_casual_income_payments', 'POST', { record: { key: 'forged' } }, 409);
  // Chứng từ khấu trừ cho thu nhập vãng lai: lấy các lần chi trả của cùng người nhận trong kỳ.
  const payee = summary.payees.find((item) => item.name === 'Cộng tác viên A');
  const monthNumber = Number(today.slice(5, 7));
  const voucher = (await request('/finance/pit-vouchers', 'POST', { source: 'casual', payeeKey: payee.key, year: Number(today.slice(0, 4)), fromMonth: monthNumber, toMonth: monthNumber, series: 'VL/26E' }, 201)).voucher;
  assert.equal(voucher.incomeType, 'Tiền công, tiền thù lao (thu nhập vãng lai)');
  assert.equal(voucher.totalIncome, 3_000_000);
  assert.equal(voucher.taxWithheld, 300_000);
  assert.equal(voucher.insurance, 0);
  assert.equal(voucher.person.identityNumber, '001203004567');
  await request('/finance/pit-vouchers', 'POST', { source: 'casual', payeeKey: payee.key, year: Number(today.slice(0, 4)), fromMonth: monthNumber, toMonth: monthNumber, series: 'VL/26E' }, 409);
  await request('/finance/pit-vouchers', 'POST', { source: 'casual', payeeKey: 'không có', year: Number(today.slice(0, 4)), fromMonth: monthNumber, toMonth: monthNumber, series: 'VL/26E' }, 404);
  // Tờ khai 05/KK-TNCN của tháng gồm cả thu nhập vãng lai (cư trú và không cư trú).
  const declaration = await request(`/finance/pit-declaration?period=${today.slice(0, 7)}`);
  assert.equal(declaration.filingMethod, 'Tháng');
  assert.ok(declaration.indicators['25'] >= 1);
  assert.ok(declaration.indicators['35'] >= 200_000);
  assert.ok(declaration.indicators['33'] >= 500_000);
  assert.equal(declaration.mustFile, true);
  assert.match(declaration.deadline, /^\d{4}-\d{2}-\d{2}$/);
  await request('/finance/pit-declaration?period=2026-13', 'GET', undefined, 422);
});

test('holiday calendar includes lunar Tết and Giỗ Tổ, keeps 11 statutory days and feeds deadlines', async () => {
  const calendar = await request('/attendance/holidays?year=2026');
  const dates = calendar.holidays.map((item) => item.date);
  for (const date of ['2026-01-01', '2026-02-16', '2026-02-17', '2026-02-20', '2026-04-26', '2026-04-30', '2026-05-01', '2026-09-02']) assert.ok(dates.includes(date), date);
  assert.ok(calendar.holidays.some((item) => item.kind === 'compensation' && item.date === '2026-04-27'));
  await request('/attendance/holidays', 'PUT', { year: 2026, removedDates: ['2026-09-01'] }, 422);
  await request('/attendance/holidays', 'PUT', { year: 2026, weeklyRestDays: [] }, 422);
  const updated = await request('/attendance/holidays', 'PUT', { year: 2026, removedDates: ['2026-09-01'], extraDays: [{ date: '2026-09-03', name: 'Quốc khánh (ngày liền kề theo thông báo)' }] });
  assert.ok(updated.holidays.some((item) => item.date === '2026-09-03'));
  assert.ok(!updated.holidays.some((item) => item.date === '2026-09-01'));
  await request('/attendance/holidays', 'PUT', { year: 2026, removedDates: [], extraDays: [] });
});

test('timesheet summaries add paid holidays from the calendar and suggestions classify approved overtime by day type', async () => {
  const staff = (await request('/users', 'POST', { email: 'holiday-ts@example.test', name: 'Nhân viên bảng công', password: 'Holiday-Ts-26!Secure', employeeCode: 'TS-HOL', role: 'USER' }, 201)).user;
  const ot = { key: 'ts-hol-ot', code: 'TS-HOL-OT', employeeId: staff.id, employeeCode: 'TS-HOL', empCode: 'TS-HOL', otDate: '2026-02-18', timeRange: '08:00 - 16:00', totalHours: 8, reason: 'Trực Tết', multiplier: 3, baseHourlyRate: 0, status: 'Chờ phê duyệt' };
  await request('/collections/attendance_overtime', 'POST', { record: ot }, 201);
  await request('/collections/attendance_overtime/ts-hol-ot', 'PATCH', { patch: { status: 'Đã duyệt OT' } });
  const suggestion = await request('/attendance/timesheet-suggestion?month=2026-02&employeeCode=TS-HOL');
  assert.equal(suggestion.calendar.standardDays, 20);
  assert.equal(suggestion.calendar.holidayDays, 5);
  assert.equal(suggestion.overtime.otHoursHoliday, 8);
  const summary = (await request('/collections/attendance_timesheet_summary', 'POST', { record: { key: 'ts-hol-2026-02', empCode: 'TS-HOL', employeeName: 'Nhân viên bảng công', month: '2026-02', standardDays: 20, actualDays: 15, paidLeaveDays: 0, unpaidLeaveDays: 0, holidayDays: 0, totalPayDays: 15, otHoursHoliday: 8, status: 'Chờ đối soát' } }, 201)).record;
  assert.equal(summary.holidayDays, 5);
  assert.equal(summary.totalPayDays, 20);
  await request('/collections/attendance_timesheet_summary', 'POST', { record: { key: 'ts-hol-over', empCode: 'TS-HOL', month: '2026-02', standardDays: 20, actualDays: 24, status: 'Chờ đối soát' } }, 422);
});

test('foreign workers need a work permit within legal terms and fixed-term contracts no longer than the permit', async () => {
  const staff = (await request('/users', 'POST', { email: 'foreign@example.test', name: 'Kim Min Su', password: 'Foreign-Staff-26!Secure', employeeCode: 'FW-01', role: 'USER' }, 201)).user;
  const route = `/employees/${staff.id}`;
  const permit = { nationality: 'Hàn Quốc', passportNumber: 'M12345678', workPermitStatus: 'permit', workPermitNumber: 'GP-01', workPermitIssueDate: '2026-01-10', workPermitExpiryDate: '2028-01-09' };
  await request(route, 'PATCH', { details: { ...permit, workPermitExpiryDate: '2029-01-09' } }, 422);
  await request(route, 'PATCH', { details: { ...permit, passportNumber: '' } }, 422);
  await request(route, 'PATCH', { details: permit });
  const contract = { code: 'HD-FW-01', name: 'Hợp đồng chuyên gia', contractCategory: 'labor', contractTemplate: 'Hợp đồng lao động xác định thời hạn', contractType: 'Hợp đồng lao động xác định thời hạn', partyBType: 'employee', partyBName: 'Kim Min Su', employeeCode: 'FW-01', employeeName: 'Kim Min Su', startDate: '2026-02-01', salary: 40_000_000, annualLeaveDays: 12, probationMonths: 0, status: 'Chờ ký' };
  assert.match((await request('/contracts', 'POST', { ...contract, endDate: '' }, 422)).message, /xác định thời hạn/);
  assert.match((await request('/contracts', 'POST', { ...contract, endDate: '2028-06-30' }, 422)).message, /không được vượt thời hạn giấy phép/);
  await request('/contracts', 'POST', { ...contract, endDate: '2027-12-31' }, 201);
  await request(route, 'PATCH', { details: { foreignJobCategory: 'expert' } });
  const card = { passportExpiryDate: '2031-05-01', residenceCardType: 'LĐ2', residenceCardNumber: 'TT-01', residenceCardIssueDate: '2026-02-01', residenceCardExpiryDate: '2028-01-09' };
  assert.match((await request(route, 'PATCH', { details: { ...card, residenceCardType: 'LĐ1' } }, 422)).message, /LĐ2/);
  await request(route, 'PATCH', { details: card });
  const report = await request('/hr/foreign-workers/report?period=2026');
  const row = report.rows.find((item) => item.employeeCode === 'FW-01');
  assert.equal(row.jobCategory, 'Chuyên gia');
  assert.equal(row.contractEnd, '2027-12-31');
  assert.equal(row.permitExpiryDate, '2028-01-09');
  assert.equal(row.residenceCard, 'LĐ2 TT-01');
  await request('/hr/foreign-workers/report?period=2026-H3', 'GET', undefined, 422);
});

test('costing runs are recalculated by the server, previewed without saving and not overlapping', async () => {
  const input = { method: 'simple', periodStart: '2026-09-01', periodEnd: '2026-09-30', productName: 'Sản phẩm giá thành', unit: 'cái', openingWipMaterial: 0, openingWipConversion: 0,
    materialCost: 60_000_000, laborCost: 20_000_000, variableOverhead: 10_000_000, fixedOverhead: 10_000_000, completedQuantity: 80, wipQuantity: 20, wipCompletionRate: 50, normalCapacity: 200 };
  const before = (await request('/finance/costing/runs')).data.length;
  const preview = (await request('/finance/costing/runs', 'POST', { ...input, preview: true })).result;
  assert.equal(preview.fixedUnallocated, 6_000_000);
  assert.equal((await request('/finance/costing/runs')).data.length, before);
  await request('/finance/costing/runs', 'POST', { ...input, materialCost: -1 }, 422);
  await request('/finance/costing/runs', 'POST', { ...input, periodEnd: '2026-08-01' }, 422);
  const saved = (await request('/finance/costing/runs', 'POST', { ...input, totalCost: 1, unitCost: 1, code: 'GT-RUN-API-1' }, 201)).record;
  assert.equal(saved.code, 'GT-RUN-API-1');
  assert.equal(saved.totalCost, preview.totalCost);
  assert.notEqual(saved.totalCost, 1);
  assert.equal(saved.journal.reduce((sum, line) => sum + line.debit, 0), saved.journal.reduce((sum, line) => sum + line.credit, 0));
  await request('/finance/costing/runs', 'POST', { ...input, code: 'GT-RUN-API-1', periodStart: '2026-10-01', periodEnd: '2026-10-31' }, 409);
  await request('/finance/costing/runs', 'POST', { ...input, code: 'GT-RUN-API-2', periodStart: '2026-09-15', periodEnd: '2026-10-15' }, 409);
  const coefficient = (await request('/finance/costing/runs', 'POST', { ...input, method: 'coefficient', completedQuantity: undefined, code: 'GT-RUN-API-3', products: [{ name: 'Loại 1', quantity: 40, coefficient: 1 }, { name: 'Loại 2', quantity: 40, coefficient: 1.5 }] }, 201)).record;
  assert.equal(coefficient.productResults.reduce((sum, product) => sum + product.totalCost, 0), coefficient.totalCost);
  assert.equal((await request('/finance/costing/runs')).data[0].method !== undefined, true);
  await request('/collections/finance_costing_runs', 'POST', { record: { key: 'forged' } }, 409);
});

test('software licenses keep purchase documents, VAT and the accounting treatment computed by the server', async () => {
  const license = { licenseCode: 'LIC-LEGAL-01', softwareName: 'Phần mềm kế toán', vendor: 'Nhà cung cấp phần mềm', category: 'Văn phòng & Cộng tác', licenseType: 'Thuê bao', productKey: 'KEY-LEGAL-1', seatsTotal: 5, seatsAllocated: 0,
    annualCost: 12_000_000, billingCycle: 'Hàng năm', purchaseDate: '2026-10-01', expireDate: '2027-09-30', assignedDepartment: 'Kế toán', assignedAdmin: 'Quản trị',
    vendorOrigin: 'domestic', vendorTaxCode: '0100109106', contractNo: 'HĐ-LIC-01', invoiceNo: '0000321', invoiceSymbol: '1C26TAA', invoiceDate: '2026-10-02', purchaseCost: 12_000_000, vatRate: 10, paymentMethod: 'Chuyển khoản' };
  await request('/assets/licenses', 'POST', { ...license, licenseCode: 'LIC-LEGAL-BAD-TAX', vendorTaxCode: '0100109107' }, 422);
  await request('/assets/licenses', 'POST', { ...license, licenseCode: 'LIC-LEGAL-BAD-VAT', vatRate: 7 }, 422);
  await request('/assets/licenses', 'POST', { ...license, licenseCode: 'LIC-LEGAL-BAD-DATE', invoiceDate: '2099-01-01' }, 422);
  await request('/assets/licenses', 'POST', { ...license, licenseCode: 'LIC-LEGAL-BAD-COST', purchaseCost: -1 }, 422);
  const saved = (await request('/assets/licenses', 'POST', { ...license, vatAmount: 1, totalPayable: 1, accounting: { treatment: 'none' }, warnings: [] }, 201)).record;
  assert.equal(saved.vatAmount, 1_200_000);
  assert.equal(saved.totalPayable, 13_200_000);
  assert.equal(saved.accounting.treatment, 'prepaid');
  assert.equal(saved.accounting.amortizationMonths, 12);
  assert.equal(saved.accounting.monthlyAmortization, 1_000_000);
  assert.deepEqual(saved.warnings, []);
  assert.equal(saved.invoiceNo, '0000321');
  const perpetual = (await request('/assets/licenses', 'POST', { ...license, licenseCode: 'LIC-LEGAL-02', licenseType: 'Vĩnh viễn', billingCycle: 'Vĩnh viễn', purchaseCost: 40_000_000, invoiceNo: '', paymentMethod: 'Tiền mặt' }, 201)).record;
  assert.equal(perpetual.accounting.treatment, 'intangible_asset');
  assert.equal(perpetual.warnings.length, 2);
  const foreign = (await request('/assets/licenses', 'POST', { ...license, licenseCode: 'LIC-LEGAL-03', vendorOrigin: 'foreign', vendorTaxCode: 'abc', vatRate: 10 }, 201)).record;
  assert.equal(foreign.vatAmount, 0);
  assert.equal(foreign.vendorTaxCode, '');
  assert.match(foreign.warnings.join(' '), /nhà thầu nước ngoài/);
  const listed = (await request('/assets/licenses')).data.find((item) => item.licenseCode === 'LIC-LEGAL-01');
  assert.equal(listed.productKey, 'KEY-LEGAL-1');
  assert.equal(listed.accounting.monthlyAmortization, 1_000_000);
  await request('/assets/licenses', 'POST', { ...license }, 409);
});

test('digital certificates enforce the 3-year limit, tax code, authorization and revocation lifecycle', async () => {
  const cert = (key, extra = {}) => ({ certNumber: `CTS-${key}`, provider: 'Nhà cung cấp CTS', subjectName: 'Công ty chứng thư', signType: 'USB Token', authorizedSigner: 'Giám đốc', validFrom: '2026-01-01', validTo: '2028-12-31', subjectTaxCode: '0100109106', ...extra });
  const post = (record, expected = 201) => request('/collections/finance_digital_signatures', 'POST', { record }, expected);
  await post(cert('LONG', { validTo: '2029-01-02' }), 422);
  await post(cert('BADTAX', { subjectTaxCode: '0100109107' }), 422);
  await post(cert('AUTH', { signerRole: 'authorized' }), 422);
  await post(cert('REVOKE', { lifecycle: 'revoked' }), 422);
  const saved = (await post(cert('OK', { warnings: [], lifecycle: 'active' }))).record;
  assert.equal(saved.certKind, 'public');
  assert.equal(saved.signerRole, 'legal_representative');
  assert.equal(saved.lifecycle, 'active');
  assert.ok(Array.isArray(saved.warnings));
  const authorized = (await post(cert('AUTHOK', { signerRole: 'authorized', authorizationNo: 'UQ-01', authorizationDate: '2026-01-15', certKind: 'dedicated', validTo: '2034-12-31' }))).record;
  assert.equal(authorized.authorizationNo, 'UQ-01');
  assert.equal(authorized.certKind, 'dedicated');
  const patch = (key, body, expected = 200) => request(`/collections/finance_digital_signatures/${key}`, 'PATCH', { patch: body }, expected);
  assert.equal((await patch(saved.key, { lifecycle: 'suspended' })).record.lifecycle, 'suspended');
  assert.equal((await patch(saved.key, { lifecycle: 'active' })).record.lifecycle, 'active');
  await patch(saved.key, { lifecycle: 'revoked', revokedAt: '2099-01-01', revokeReason: 'Mất' }, 422);
  const revoked = (await patch(saved.key, { lifecycle: 'revoked', revokedAt: '2026-06-01', revokeReason: 'Mất token' })).record;
  assert.equal(revoked.lifecycle, 'revoked');
  await patch(saved.key, { lifecycle: 'active' }, 422);
  await patch(saved.key, { validTo: '2029-01-01' }, 422);
  await patch(saved.key, { revokeReason: 'Sửa' }, 422);
});

test('resignation records settle notice, severance and leave pay on the server', async () => {
  const base = { employeeId: session.user.id, type: 'mutual', workStartDate: '2022-01-15', lastWorkingDate: '2026-09-30', averageSalary: 20_000_000, contractKind: 'indefinite' };
  const preview = await request('/contracts/termination-settlement', 'POST', base);
  assert.equal(preview.settlement.severanceYears, 5);
  assert.equal(preview.settlement.allowance, 50_000_000);
  assert.equal(preview.settlement.settlementDueDate, '2026-10-20');
  await request('/contracts/termination-settlement', 'POST', { ...base, type: 'x' }, 422);
  await request('/contracts/termination-settlement', 'POST', { ...base, averageSalary: 0 }, 422);
  await request('/contracts/termination-settlement', 'POST', { ...base, employeeId: 'missing' }, 422);
  await request('/contracts/termination-settlement', 'POST', { employeeId: session.user.id, type: 'mutual', lastWorkingDate: '2026-09-30' }, 422);
  const quit = (await request('/contracts/termination-settlement', 'POST', { ...base, type: 'employee_unilateral', noticeGivenDate: '2026-09-20', unusedLeaveDays: 2 })).settlement;
  assert.equal(quit.allowance, 0);
  assert.equal(quit.shortNoticeDays, 35);
  assert.ok(quit.employeeOwes > 10_000_000);

  const history = { key: 'resign-api-1', code: 'LS-RESIGN-1', employeeId: session.user.id, type: 'Nghỉ việc', eventDate: '2020-01-01', newValue: 'Nghỉ việc theo thỏa thuận', termination: { ...base, employeeId: undefined }, settlement: { allowance: 1 } };
  const saved = (await request('/collections/hr_employee_history', 'POST', { record: history }, 201)).record;
  assert.equal(saved.settlement.allowance, 50_000_000);
  assert.equal(saved.eventDate, '2026-09-30');
  assert.equal(saved.termination.type, 'mutual');
  await request('/collections/hr_employee_history', 'POST', { record: { ...history, key: 'resign-api-2', code: 'LS-RESIGN-2', termination: { ...base, lastWorkingDate: '2021-01-01' } } }, 422);
  const plain = (await request('/collections/hr_employee_history', 'POST', { record: { key: 'resign-api-3', code: 'LS-RESIGN-3', employeeId: session.user.id, type: 'Nghỉ việc', eventDate: '2026-10-01', newValue: 'Nghỉ việc', settlement: { allowance: 9 } } }, 201)).record;
  assert.equal(plain.settlement, undefined);
});


test('leave requests follow legal types, caps and the annual leave balance', async () => {
  const employee = (await request('/users', 'POST', { email: 'leave-law@example.test', name: 'Leave Law', password: 'Leave-Test-26!Secure', employeeCode: 'TEST-LEAVE-LAW', role: 'USER' }, 201)).user;
  const base = { code: 'NP-LAW', employeeId: employee.id, startDate: '2027-03-01', endDate: '2027-03-31', daysCount: 1, reason: 'Test', leaveType: 'Nghỉ phép năm', status: 'Chờ duyệt' };
  const create = (key, extra, expected = 201) => request('/collections/leave_requests', 'POST', { record: { ...base, key, ...extra } }, expected);
  await create('law-type', { leaveType: 'Du lịch' }, 422);
  await create('law-marriage', { leaveType: 'Nghỉ kết hôn', daysCount: 4 }, 422);
  await create('law-over', { daysCount: 13 }, 422);
  assert.equal((await create('law-alias', { leaveType: 'Nghỉ ốm', daysCount: 2 })).record.leaveType, 'Nghỉ ốm BHXH');
  assert.equal((await request(`/attendance/leave-entitlement?employeeId=${employee.id}&year=2027`)).entitled, 12);
  await create('law-ten', { daysCount: 10 });
  await request('/collections/leave_requests/law-ten', 'PATCH', { patch: { status: 'Đã duyệt' } });
  const summary = (await request('/collections/attendance_leave_summary')).data.find(item => item.employeeId === employee.id && item.year === 2027);
  assert.equal(summary.standardQuota, 12);
  assert.equal(summary.usedLeaves, 10);
  assert.equal(summary.remainingLeaves, 2);
  await create('law-three', { daysCount: 3 }, 422);
  await create('law-one', { daysCount: 1 });
  const login = await request('/auth/login', 'POST', { email: 'leave-law@example.test', password: 'Leave-Test-26!Secure' });
  const staffHeaders = { ...headers, Authorization: `Bearer ${login.access_token || login.token}` };
  const own = await request('/employees/me/leave-balance?year=2027', 'GET', undefined, 200, staffHeaders);
  assert.deepEqual([own.source, own.entitled, own.used, own.remaining, own.pendingDays], ['ledger', 12, 10, 2, 1]);
  const lawOnly = await request('/employees/me/leave-balance?year=2028', 'GET', undefined, 200, staffHeaders);
  assert.deepEqual([lawOnly.source, lawOnly.entitled, lawOnly.remaining, lawOnly.pendingDays], ['law', 12, 12, 0]);
  // Đơn chờ duyệt 1 ngày giữ chỗ: chỉ gửi thêm được 1 ngày, sửa chính đơn đó lên 2 ngày vẫn được.
  await create('law-pending-over', { daysCount: 2 }, 422);
  await request('/collections/leave_requests/law-one', 'PATCH', { patch: { daysCount: 2 } });
  await request('/collections/leave_requests/law-one', 'PATCH', { patch: { daysCount: 3 } }, 422);
  await request('/collections/leave_requests/law-one', 'PATCH', { patch: { status: 'Từ chối' } });
  await create('law-two', { daysCount: 2 });
  await request('/collections/leave_requests/law-two', 'PATCH', { patch: { status: 'Đã duyệt' } });
  assert.equal((await request('/collections/attendance_leave_summary')).data.find(item => item.employeeId === employee.id && item.year === 2027).remainingLeaves, 0);
});

test('unused annual leave carries over to the next year by agreement within the legal limit', async () => {
  const employee = (await request('/users', 'POST', { email: 'leave-carry@example.test', name: 'Leave Carry', password: 'Leave-Carry-26!Secure', employeeCode: 'TEST-LEAVE-CARRY', role: 'USER' }, 201)).user;
  const leave = (key, startDate, endDate, daysCount, expected = 201) => request('/collections/leave_requests', 'POST', { record: { key, code: key, employeeId: employee.id, startDate, endDate, daysCount, reason: 'Test', leaveType: 'Nghỉ phép năm', status: 'Chờ duyệt' } }, expected);
  await leave('carry-used', '2026-03-02', '2026-03-06', 4);
  await request('/collections/leave_requests/carry-used', 'PATCH', { patch: { status: 'Đã duyệt' } });
  await leave('carry-pending', '2026-12-01', '2026-12-01', 1);
  const body = { fromYear: 2026, maxDays: 5, employeeIds: [employee.id] };
  const preview = (await request('/attendance/leave-carryover', 'POST', { ...body, preview: true })).rows[0];
  assert.deepEqual([preview.status, preview.remaining, preview.pending, preview.days, preview.forfeited], ['ready', 8, 1, 5, 2]);
  await request('/attendance/leave-carryover', 'POST', body, 422);
  await request('/attendance/leave-carryover', 'POST', { ...body, fromYear: 2027, basis: 'Thỏa thuận' }, 422);
  assert.equal((await request('/attendance/leave-carryover', 'POST', { ...body, basis: 'Thỏa thuận nghỉ gộp ngày 20/11/2026' })).carried, 1);
  const ledgers = (await request('/collections/attendance_leave_summary')).data.filter((item) => item.employeeId === employee.id);
  const from = ledgers.find((item) => item.year === 2026);
  const to = ledgers.find((item) => item.year === 2027);
  assert.deepEqual([from.carriedForward, from.remainingLeaves], [5, 3]);
  assert.deepEqual([to.carriedOver, to.totalEntitled, to.carryOverFrom, to.carryOverBasis], [5, 17, 2026, 'Thỏa thuận nghỉ gộp ngày 20/11/2026']);
  assert.equal((await request('/attendance/leave-carryover', 'POST', { ...body, preview: true })).rows[0].status, 'done');
  // Còn 3 ngày, 1 ngày đang chờ duyệt: không gửi thêm được 3 ngày phép năm 2026.
  await leave('carry-over-limit', '2026-12-07', '2026-12-09', 3, 422);
  // Sửa sổ phép bằng tay không ghi đè được thông tin chuyển phép.
  await request(`/collections/attendance_leave_summary/${from.key}`, 'PATCH', { patch: { carriedForward: 0 } });
  assert.equal((await request('/collections/attendance_leave_summary')).data.find((item) => item.key === from.key).carriedForward, 5);
});

test('employees cannot approve their own payroll bank account and see their real account overview', async () => {
  await request('/users', 'POST', { email: 'bank-self@example.test', name: 'Bank Self', password: 'Bank-Self-26!Secure', employeeCode: 'TEST-BANK-SELF', role: 'USER' }, 201);
  const login = await request('/auth/login', 'POST', { email: 'bank-self@example.test', password: 'Bank-Self-26!Secure' });
  const staff = { ...headers, Authorization: `Bearer ${login.access_token || login.token}` };
  const account = { id: 'ba-self-1', bankName: 'Vietcombank', accountNumber: '0011001234567', accountHolder: 'BANK SELF', status: 'Đã duyệt', approvedAt: '2026-01-01' };
  const created = (await request('/collections/employee_bank_accounts', 'POST', { record: account }, 201, staff)).record;
  assert.deepEqual([created.status, created.approvedAt], ['Chờ duyệt', undefined]);
  await request('/collections/employee_bank_accounts/ba-self-1', 'PATCH', { patch: { status: 'Đã duyệt' } });
  assert.equal((await request('/collections/employee_bank_accounts/ba-self-1', 'PATCH', { patch: { note: 'x', status: 'Từ chối' } }, 200, staff)).record.status, 'Đã duyệt');
  assert.equal((await request('/collections/employee_bank_accounts/ba-self-1', 'PATCH', { patch: { accountNumber: '0011009999999' } }, 200, staff)).record.status, 'Chờ duyệt');
  // Sửa theo mã dòng (trường id) cũng tìm đúng bản ghi và giữ khóa thật.
  await request('/collections/employee_bank_accounts', 'POST', { record: { key: 'ba-self-2', bankName: 'BIDV', accountNumber: '1200001111', accountHolder: 'BANK SELF' } }, 201, staff);
  const rowId = (await request('/collections/employee_bank_accounts', 'GET', undefined, 200, staff)).data.find((item) => item.key === 'ba-self-2').id;
  assert.notEqual(rowId, 'ba-self-2');
  assert.equal((await request(`/collections/employee_bank_accounts/${rowId}`, 'PATCH', { patch: { note: 'theo mã dòng' } }, 200, staff)).record.key, 'ba-self-2');

  const overview = await request('/auth/account-overview', 'GET', undefined, 200, staff);
  assert.deepEqual([overview.role, overview.twoFactorEnabled, overview.passkeyCount, overview.securityPinConfigured], ['USER', false, 0, false]);
  assert.ok(overview.currentSession?.loginTime);
  assert.ok(Array.isArray((await request('/auth/activity', 'GET', undefined, 200, staff)).data));
  // Thiết bị tin cậy: phiên thật của chính người dùng, đăng xuất được phiên ở thiết bị khác, không đăng xuất phiên đang dùng qua route này.
  const second = await request('/auth/login', 'POST', { email: 'bank-self@example.test', password: 'Bank-Self-26!Secure' });
  const secondHeaders = { ...headers, Authorization: `Bearer ${second.access_token || second.token}` };
  const sessions = (await request('/auth/sessions', 'GET', undefined, 200, staff)).data;
  assert.equal(sessions.length, 2);
  const current = sessions.find((item) => item.current);
  const other = sessions.find((item) => !item.current);
  await request(`/auth/sessions/${encodeURIComponent(current.key)}/revoke`, 'POST', {}, 409, staff);
  await request(`/auth/sessions/${encodeURIComponent(other.key)}/revoke`, 'POST', {}, 200, staff);
  await request('/auth/account-overview', 'GET', undefined, 401, secondHeaders);
  assert.equal((await request('/auth/sessions', 'GET', undefined, 200, staff)).data.length, 1);
});

test('monthly sales targets are keyed by period and validated', async () => {
  const saved = (await request('/collections/crm_sales_targets', 'POST', { record: { period: '2026-03', amount: 120_000_000, note: 'Quý 1' } }, 201)).record;
  assert.deepEqual([saved.key, saved.amount], ['2026-03', 120_000_000]);
  await request('/collections/crm_sales_targets', 'POST', { record: { period: '2026-13', amount: 1 } }, 422);
  await request('/collections/crm_sales_targets', 'POST', { record: { period: '2026-04', amount: -5 } }, 422);
  assert.equal((await request('/collections/crm_sales_targets/2026-03', 'PATCH', { patch: { amount: 150_000_000 } })).record.amount, 150_000_000);
  await request('/collections/crm_sales_targets/2026-03', 'PATCH', { patch: { period: '2026-05' } }, 422);
  await request('/users', 'POST', { email: 'target-staff@example.test', name: 'Target Staff', password: 'Target-Staff-26!Secure', employeeCode: 'TEST-TARGET', role: 'USER' }, 201);
  const login = await request('/auth/login', 'POST', { email: 'target-staff@example.test', password: 'Target-Staff-26!Secure' });
  await request('/collections/crm_sales_targets', 'POST', { record: { period: '2026-06', amount: 1 } }, 403, { ...headers, Authorization: `Bearer ${login.access_token || login.token}` });
});

test('shifts need a legal break and night pay, and consecutive shifts need 12 hours of rest', async () => {
  const employee = (await request('/users', 'POST', { email: 'rest-law@example.test', name: 'Rest Law', password: 'Rest-Test-26!Secure', employeeCode: 'TEST-REST-LAW', role: 'USER' }, 201)).user;
  const shift = (key, startTime, endTime, extra = {}) => ({ key, shiftCode: key, shiftName: key, startTime, endTime, timeRange: `${startTime} - ${endTime}`, workingHours: 8, workUnits: 1, status: 'Đang áp dụng', ...extra });
  await request('/collections/attendance_shifts', 'POST', { record: shift('law-nobreak', '08:00', '16:00') }, 422);
  await request('/collections/attendance_shifts', 'POST', { record: shift('law-night-pay', '22:00', '07:00', { breakTime: '02:00 - 03:00', nightAllowancePct: 10 }) }, 422);
  await request('/collections/attendance_shifts', 'POST', { record: shift('law-early', '06:00', '15:00', { breakTime: '10:00 - 11:00' }) }, 201);
  await request('/collections/attendance_shifts', 'POST', { record: shift('law-late', '14:00', '23:00', { breakTime: '18:00 - 19:00', nightAllowancePct: 30 }) }, 201);
  const assignment = (key, shiftKey, effectiveFrom, effectiveTo) => ({ key, code: key, employeeId: employee.id, shiftKey, effectiveFrom, effectiveTo, status: 'Đang áp dụng' });
  await request('/collections/attendance_shift_assignments', 'POST', { record: assignment('law-a1', 'law-late', '2027-01-04', '2027-01-10') }, 201);
  await request('/collections/attendance_shift_assignments', 'POST', { record: assignment('law-a2', 'law-early', '2027-01-11', '2027-01-17') }, 422);
  await request('/collections/attendance_shift_assignments', 'POST', { record: assignment('law-a3', 'law-early', '2027-01-12', '2027-01-17') }, 201);
});

test('overtime approval enforces the legal minimum pay multiplier for the day type', async () => {
  const overtime = (key, otDate, extra = {}) => ({ key, code: key, employeeId: session.user.id, otDate, timeRange: '18:00 - 20:00', totalHours: 2, reason: 'Test', multiplier: 1, baseHourlyRate: 100000, status: 'Chờ phê duyệt', ...extra });
  await request('/collections/attendance_overtime', 'POST', { record: overtime('law-ot-weekday', '2027-02-02') }, 201);
  await request('/collections/attendance_overtime/law-ot-weekday', 'PATCH', { patch: { status: 'Đã duyệt OT' } }, 422);
  await request('/collections/attendance_overtime/law-ot-weekday', 'PATCH', { patch: { status: 'Đã duyệt OT', multiplier: 1.5 } });
  await request('/collections/attendance_overtime', 'POST', { record: overtime('law-ot-sunday', '2027-02-14', { multiplier: 1.5 }) }, 201);
  await request('/collections/attendance_overtime/law-ot-sunday', 'PATCH', { patch: { status: 'Đã duyệt OT' } }, 422);
  await request('/collections/attendance_overtime/law-ot-sunday', 'PATCH', { patch: { status: 'Đã duyệt OT', multiplier: 2 } });
  // Mùng 3 Tết Đinh Mùi (08/02/2027) là ngày lễ theo lịch âm: tối thiểu 300%.
  await request('/collections/attendance_overtime', 'POST', { record: overtime('law-ot-tet', '2027-02-08', { multiplier: 2 }) }, 201);
  await request('/collections/attendance_overtime/law-ot-tet', 'PATCH', { patch: { status: 'Đã duyệt OT' } }, 422);
  await request('/collections/attendance_overtime/law-ot-tet', 'PATCH', { patch: { status: 'Đã duyệt OT', multiplier: 3 } });
});

test('strategic plans are validated on the server and only administrators can write them', async () => {
  const staff = (await request('/users', 'POST', { email: 'plan-staff@example.test', name: 'Plan Staff', password: 'Plan-Test-26!Secure', employeeCode: 'TEST-PLAN', role: 'USER' }, 201)).user;
  const staffSession = await request('/auth/login', 'POST', { email: 'plan-staff@example.test', password: 'Plan-Test-26!Secure' });
  const staffHeaders = { ...headers, Authorization: `Bearer ${staffSession.access_token || staffSession.token}` };
  const plan = { key: 'KH-LAW-1', code: 'KH-LAW-1', name: 'Kế hoạch thử', department: 'Kinh doanh', manager: 'An', startDate: '2027-01-01', endDate: '2027-12-31', budget: 5000000, priority: 'Thường xuyên' };
  assert.ok(staff.id);
  await request('/collections/plan_items', 'POST', { record: plan }, 403, staffHeaders);
  await request('/collections/plan_items', 'POST', { record: { ...plan, key: 'KH-LAW-2', code: 'KH-LAW-2', endDate: '2026-12-31' } }, 422);
  assert.equal((await request('/collections/plan_items', 'POST', { record: plan }, 201)).record.status, 'Đang triển khai');
  await request('/collections/plan_items', 'POST', { record: { ...plan, key: 'KH-LAW-3', code: 'kh-law-1' } }, 409);
  const progress = { key: 'T-LAW-1', code: 'T-LAW-1', planName: 'Kế hoạch thử', taskTitle: 'Thiết kế', assignee: 'An', dueDate: '2020-01-01', progressPercent: 30, weightPercent: 20, status: 'Hoàn thành' };
  assert.equal((await request('/collections/plan_progress', 'POST', { record: progress }, 201)).record.status, 'Chậm tiến độ');
});

test('accounting records cannot be purged from the trash within the retention period, notification links stay internal and client audit events are tagged', async () => {
  const scope = '/collections/finance_retention_probe';
  const recordKey = `retention-${Date.now()}`;
  await request(scope, 'POST', { record: { key: recordKey, name: 'Chứng từ kiểm tra lưu trữ', code: 'RET-01' } }, 201);
  const deletion = await request(`${scope}/${encodeURIComponent(recordKey)}`, 'DELETE');
  const blocked = await request(`/admin/trash/${encodeURIComponent(deletion.trashItemId)}`, 'DELETE', undefined, 409);
  assert.match(blocked.message, /Điều 41 Luật Kế toán/);
  assert.equal((await request('/admin/trash/' + encodeURIComponent(deletion.trashItemId) + '/restore', 'POST', {})).restored, true);

  await request('/notifications', 'POST', { title: 'Liên kết ngoài', message: 'Thử', link: 'https://evil.example/login' }, 422);
  await request('/notifications', 'POST', { title: 'Liên kết ngoài', message: 'Thử', link: '//evil.example' }, 422);
  assert.equal((await request('/notifications', 'POST', { title: 'Liên kết trong', message: 'Thử', link: '/admin/documents/notes' }, 201)).notification.link, '/admin/documents/notes');

  const marker = `forged-${Date.now()}`;
  await request('/audit-events', 'POST', { action: 'approve_payment', module: 'finance_payments', detail: marker, details: { source: 'server' } }, 201);
  const logged = (await request(`/admin/audit-logs?q=${marker}`)).data[0];
  assert.equal(logged.details.source, 'client');
});

test('discipline records are assessed on the server and one violation gets one measure', async () => {
  const staff = (await request('/users', 'POST', { email: 'discipline@example.test', name: 'Discipline Staff', password: 'Discipline-26!Secure', employeeCode: 'TEST-DISC', role: 'USER' }, 201)).user;
  const discipline = { form: 'warning', violationKind: 'general', violationDate: '2026-10-01', discoveredDate: '2026-10-02', noticeDate: '2026-10-05', hearingDate: '2026-10-12', decisionDate: '2026-10-13', attendance: 'attended', unionParticipated: true, minutesRecorded: true };
  const history = (key, patch = {}, disciplinePatch = {}) => ({ key, code: key, employeeId: staff.id, type: 'Kỷ luật sự cố', eventDate: '2000-01-01', newValue: 'Khiển trách', discipline: { ...discipline, ...disciplinePatch }, ...patch });
  await request('/collections/hr_employee_history', 'POST', { record: history('disc-short-notice', {}, { hearingDate: '2026-10-08' }) }, 422);
  await request('/collections/hr_employee_history', 'POST', { record: history('disc-expired', {}, { violationDate: '2026-01-01', discoveredDate: '2026-01-02' }) }, 422);
  await request('/collections/hr_employee_history', 'POST', { record: history('disc-no-minutes', {}, { minutesRecorded: false }) }, 422);
  const saved = (await request('/collections/hr_employee_history', 'POST', { record: history('disc-ok') }, 201)).record;
  assert.equal(saved.eventDate, '2026-10-13');
  assert.equal(saved.disciplineAssessment.limitationDeadline, '2027-04-01');
  const second = await request('/collections/hr_employee_history', 'POST', { record: history('disc-second', {}, { form: 'delay_raise', delayMonths: 3 }) }, 409);
  assert.match(second.message, /chỉ bị xử lý một hình thức/);
  assert.equal((await request('/collections/hr_employee_history', 'POST', { record: history('disc-other-violation', {}, { violationDate: '2026-10-02', discoveredDate: '2026-10-02' }) }, 201)).record.key, 'disc-other-violation');
});

test('insurance records link real employees, respect the regional minimum and benefit day limits', async () => {
  const staff = (await request('/users', 'POST', { email: 'insured@example.test', name: 'Insured Staff', password: 'Insured-26!Secure', employeeCode: 'TEST-INS', role: 'USER' }, 201)).user;
  const adjustment = (key, extra = {}) => ({ key, d02Code: key, adjustType: 'Báo tăng mới', employeeId: staff.id, empName: 'Forged', newSalary: 10_000_000, workRegion: 'I', effectiveMonth: '2026-09', filingDate: '2026-09-10', ...extra });
  await request('/collections/insurance_adjustments', 'POST', { record: adjustment('D02-LOW', { newSalary: 3_000_000 }) }, 422);
  await request('/collections/insurance_adjustments', 'POST', { record: adjustment('D02-NOREGION', { workRegion: '' }) }, 422);
  const saved = (await request('/collections/insurance_adjustments', 'POST', { record: adjustment('D02-OK', { newSalary: 60_000_000 }) }, 201)).record;
  assert.equal(saved.empName, 'Insured Staff');
  assert.ok(saved.legalWarnings.some(item => /mức trần/.test(item)));
  await request('/collections/insurance_adjustments', 'POST', { record: adjustment('d02-ok') }, 409);
  const regime = (key, extra = {}) => ({ key, claimCode: key, regimeType: 'Ốm đau ngắn ngày', employeeId: staff.id, leaveDays: 30, startDate: '2026-03-02', calculatedAmount: 1_000_000, bankAccount: '0123456789 - Ngân hàng thử', ...extra });
  await request('/collections/insurance_regimes', 'POST', { record: regime('CD-1') }, 201);
  await request('/collections/insurance_regimes', 'POST', { record: regime('CD-2', { startDate: '2026-06-01' }) }, 201);
  await request('/collections/insurance_regimes', 'POST', { record: regime('CD-3', { startDate: '2026-09-01', leaveDays: 1 }) }, 422);
  await request('/collections/insurance_regimes', 'POST', { record: regime('CD-4', { startDate: '2027-01-04', leaveDays: 1 }) }, 201);
  await request('/collections/insurance_regimes', 'POST', { record: regime('CD-5', { regimeType: 'Dưỡng sức sau sinh', leaveDays: 12 }) }, 422);
});

test('advances go to real employees, settle before the next advance and keep server computed balances', async () => {
  const staff = (await request('/users', 'POST', { email: 'advance@example.test', name: 'Advance Staff', password: 'Advance-26!Secure', employeeCode: 'TEST-ADV', role: 'USER' }, 201)).user;
  const advance = (key, extra = {}) => ({ key, code: key, employeeId: staff.id, employeeName: 'Forged', advanceType: 'Công tác phí', purpose: 'Công tác Hà Nội', advancedAmount: 5_000_000, settleDeadline: '2999-12-31', status: 'Đã quyết toán nội bộ', balance: 99, ...extra });
  await request('/collections/finance_advances', 'POST', { record: advance('TU-NOEMP', { employeeId: '' }) }, 422);
  const created = (await request('/collections/finance_advances', 'POST', { record: advance('TU-1') }, 201)).record;
  assert.equal(created.status, 'Chờ cấp tạm ứng');
  assert.equal(created.employeeName, 'Advance Staff');
  assert.equal(created.balance, 0);
  await request('/collections/finance_advances', 'POST', { record: advance('TU-2') }, 409);
  const route = '/collections/finance_advances/TU-1';
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const bank = (await request('/finance/bank-accounts', 'POST', { bankName: 'Ngân hàng tạm ứng', accountNumber: '7788990011', accountHolder: 'Công ty tạm ứng', balance: 20_000_000, status: 'Đang hoạt động' }, 201)).account;
  const balanceOf = async () => (await request('/finance/payment-accounts')).accounts.find((item) => item.key === bank.key).balance;
  const ledgerOf = async (code) => (await request('/collections/finance_general_ledger')).data.filter((item) => item.voucherCode === code);
  await request(route, 'PATCH', { patch: { status: 'Chờ thanh quyết toán', issuedAmount: 5_000_000, disbursementReference: 'PC-1' } }, 422);
  const disburse = (body, expected = 200) => request('/finance/advances/TU-1/disburse', 'POST', { sourceAccountId: bank.key, date: today, ...body }, expected);
  await disburse({ amount: 6_000_000 }, 422);
  await disburse({ amount: 5_000_000, date: '2099-01-01' }, 422);
  await request('/finance/advances/TU-1/settle', 'POST', { sourceAccountId: bank.key, date: today, spentAmount: 1, invoicesSummary: 'x', expenseAccount: '6422' }, 409);
  const before = await balanceOf();
  const issued = await disburse({ amount: 5_000_000, reference: 'UNC-TU' });
  assert.equal(issued.advance.status, 'Chờ thanh quyết toán');
  assert.equal(issued.advance.balance, 5_000_000);
  assert.equal(issued.vouchers[0].type, 'Chi');
  assert.equal(await balanceOf(), before - 5_000_000);
  const pc = await ledgerOf(issued.advance.disbursementVoucherCode);
  assert.equal(pc.length, 1);
  assert.match(pc[0].debitAccount, /^141/);
  assert.match(pc[0].creditAccount, /^112/);
  await disburse({ amount: 5_000_000 }, 409);
  await request(route, 'PATCH', { patch: { advancedAmount: 9_000_000 } }, 422);
  await request(route, 'PATCH', { patch: { spentAmount: 5_000_000, balanceReconciled: true, status: 'Đã quyết toán nội bộ' } }, 422);
  const settle = (body, expected = 200) => request('/finance/advances/TU-1/settle', 'POST', { sourceAccountId: bank.key, date: today, invoicesSummary: 'HĐ 0001, 0002', expenseAccount: '6422', ...body }, expected);
  await settle({ spentAmount: 4_200_000, expenseAccount: '1121' }, 422);
  await settle({ spentAmount: 4_200_000, invoicesSummary: '' }, 422);
  const settled = await settle({ spentAmount: 4_400_000, vatAmount: 400_000 });
  assert.equal(settled.advance.status, 'Đã quyết toán nội bộ');
  assert.equal(settled.advance.balance, 600_000);
  assert.equal(settled.vouchers[0].type, 'Thu');
  assert.equal(await balanceOf(), before - 4_400_000);
  const journal = await ledgerOf('TU-1-QT');
  assert.deepEqual(journal[0].lines.map((line) => [line.account, line.debit, line.credit]), [['6422', 4_000_000, 0], ['1331', 400_000, 0], ['141', 0, 4_400_000]]);
  await settle({ spentAmount: 1 }, 409);
  await request(route, 'PATCH', { patch: { spentAmount: 1 } }, 422);
  await request('/collections/finance_advances', 'POST', { record: advance('TU-3') }, 201);
});
