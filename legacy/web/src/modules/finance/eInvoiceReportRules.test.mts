import test from 'node:test';
import assert from 'node:assert/strict';
import { filterEInvoiceReport } from './eInvoiceReportRules.ts';

const records = [
  { invoiceNumber: 'DRAFT-1', issueDate: '2026-10-04', status: 'Hóa đơn nháp', externalStatus: 'Chưa gửi nhà cung cấp', buyerName: 'Công ty Ánh Dương', buyerTaxCode: '0101001001' },
  { invoiceNumber: 'DRAFT-2', issueDate: '2026-10-10', status: 'Hóa đơn nháp', buyerName: 'Cửa hàng Bình Minh', buyerTaxCode: '0102002002' },
  { invoiceNumber: 'OLD-1', issueDate: '2026-09-30', status: 'Đã hủy', externalStatus: 'Từ chối', buyerName: 'Công ty Ánh Dương', buyerTaxCode: '0101001001' },
];

const defaults = { period: 'all', status: 'all', externalStatus: 'all', buyerSearch: '' };

test('e-invoice report combines period, internal and external status, and buyer filters', () => {
  assert.deepEqual(filterEInvoiceReport(records, { ...defaults, period: '2026-10', status: 'Hóa đơn nháp', buyerSearch: 'ánh dương' }).map(record => record.invoiceNumber), ['DRAFT-1']);
  assert.deepEqual(filterEInvoiceReport(records, { ...defaults, externalStatus: 'Chưa xác minh', buyerSearch: '0102002002' }).map(record => record.invoiceNumber), ['DRAFT-2']);
  assert.deepEqual(filterEInvoiceReport(records, { ...defaults, period: '2026-08' }), []);
});
