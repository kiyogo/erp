import assert from 'node:assert/strict';
import { test } from 'node:test';
import { crmContactExportRows } from '../src/modules/crm/crmContactExports.ts';

test('CRM workbook rows preserve the supplied filtered contacts and all export columns', () => {
  const contact = {
    key: 'contact-1', code: 'KH-0001', name: 'Công ty Ánh Dương', type: 'customer', taxCode: '0312345678',
    industry: 'Phân phối', contactPerson: 'Nguyễn An', phone: '0900000001', email: 'an@example.test',
    address: 'Hồ Chí Minh', bankAccount: '0123456789', creditLimit: 5000000, totalValue: 1200000,
    debtBalance: 300000, tier: 'A', accountManager: 'Trần Bình', status: 'Đang hoạt động',
    createdAt: '2026-10-27T00:00:00.000Z', updatedAt: '2026-10-27T00:00:00.000Z',
  };
  const rows = crmContactExportRows([contact]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].length, 16);
  assert.deepEqual(rows[1], [
    'KH-0001', 'Khách hàng', 'Công ty Ánh Dương', '0312345678', 'Phân phối', 'Nguyễn An', '0900000001',
    'an@example.test', 'Hồ Chí Minh', '0123456789', 5000000, 1200000, 300000, 'A', 'Trần Bình', 'Đang hoạt động',
  ]);
  assert.equal(crmContactExportRows([]).length, 1);
});
