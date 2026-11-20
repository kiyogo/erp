import assert from 'node:assert/strict';
import { test } from 'node:test';
import { contactTaxCodeProblem, dataConsentProblem, invoiceEmailsProblem, isValidPhone, isValidWebsite, pastDateProblem } from '../contactRules.mjs';

test('điện thoại trong nước 10 đến 11 số hoặc dạng quốc tế', () => {
  for (const ok of ['0901234567', '0243 123 4567', '090.123.4567', '+84901234567', '+1 415 555 0100']) assert.ok(isValidPhone(ok), ok);
  for (const bad of ['', '12345', '090123456', '84901234567', 'abcdefghij']) assert.ok(!isValidPhone(bad), bad);
});

test('mã số thuế của tổ chức và cá nhân', () => {
  assert.equal(contactTaxCodeProblem('0100109106', 'organization'), '');
  assert.notEqual(contactTaxCodeProblem('079123456789', 'organization'), '');
  assert.equal(contactTaxCodeProblem('079123456789', 'person'), '');
  assert.equal(contactTaxCodeProblem('', 'organization'), '');
});

test('website, email hóa đơn và ngày không ở tương lai', () => {
  assert.ok(isValidWebsite('https://example.vn/trang') && isValidWebsite('example.com.vn') && !isValidWebsite('khong hop le'));
  assert.equal(invoiceEmailsProblem('a@b.vn; c@d.vn'), '');
  assert.match(invoiceEmailsProblem('a@b.vn; xyz'), /xyz/);
  assert.match(invoiceEmailsProblem(Array.from({ length: 11 }, (_, i) => `a${i}@b.vn`).join(';')), /tối đa 10/);
  assert.equal(pastDateProblem('2026-01-01', 'Ngày sinh', '2026-11-20'), '');
  assert.match(pastDateProblem('2026-12-01', 'Ngày sinh', '2026-11-20'), /không được sau/);
  assert.match(pastDateProblem('2026-02-30', 'Ngày sinh', '2026-11-20'), /không phải ngày hợp lệ/);
});

test('đồng ý xử lý dữ liệu cần ngày, mục đích; quảng cáo cần đã đồng ý', () => {
  assert.equal(dataConsentProblem({}), '');
  assert.match(dataConsentProblem({ marketingOptIn: true }), /đồng ý xử lý/);
  assert.match(dataConsentProblem({ dataConsent: true }), /ngày/);
  assert.match(dataConsentProblem({ dataConsent: true, dataConsentDate: '2026-01-02' }), /mục đích/);
  assert.equal(dataConsentProblem({ dataConsent: true, dataConsentDate: '2026-01-02', dataConsentPurposes: 'Chăm sóc' }, '2026-11-20'), '');
});
