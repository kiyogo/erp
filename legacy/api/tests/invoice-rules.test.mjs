import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buyerTaxCodeProblem, invoiceContentIssues, isValidTaxCode, vatBreakdown, vndInWords } from '../invoiceRules.mjs';

test('mã số thuế: đủ 10 hoặc 13 số và đúng số kiểm tra', () => {
  assert.ok(isValidTaxCode('0100109106') && isValidTaxCode('0101601092') && isValidTaxCode('0300588569'));
  assert.ok(isValidTaxCode('0100109106-001'));
  assert.ok(!isValidTaxCode('0100109106-000') && !isValidTaxCode('0100109107') && !isValidTaxCode('0100109106-01') && !isValidTaxCode('') && !isValidTaxCode('abc'));
});

test('người mua cá nhân dùng được số định danh, doanh nghiệp thì không', () => {
  assert.equal(buyerTaxCodeProblem('', 'organization'), '');
  assert.equal(buyerTaxCodeProblem('079123456789', 'person'), '');
  assert.notEqual(buyerTaxCodeProblem('079123456789', 'organization'), '');
  assert.notEqual(buyerTaxCodeProblem('12345', 'person'), '');
  assert.notEqual(buyerTaxCodeProblem('123456789', 'person'), '', 'chứng minh nhân dân 9 số không còn dùng');
});

test('số tiền bằng chữ', () => {
  assert.equal(vndInWords(0), 'Không đồng');
  assert.equal(vndInWords(1_234_567), 'Một triệu hai trăm ba mươi tư nghìn năm trăm sáu mươi bảy đồng chẵn');
  assert.equal(vndInWords(21), 'Hai mươi mốt đồng chẵn');
  assert.equal(vndInWords(15), 'Mười lăm đồng chẵn');
  assert.equal(vndInWords(1_005), 'Một nghìn không trăm lẻ năm đồng chẵn');
  assert.equal(vndInWords(2_500_000_000), 'Hai tỷ năm trăm triệu đồng chẵn');
  assert.throws(() => vndInWords(-1));
  assert.throws(() => vndInWords(1.5));
});

test('thuế theo từng thuế suất cộng gộp các dòng cùng mức', () => {
  assert.deepEqual(vatBreakdown([
    { vatRate: 10, amount: 1000, vatAmount: 100 }, { vatRate: 8, amount: 500, vatAmount: 40 }, { vatRate: 10, amount: 200, vatAmount: 20 },
  ]), [{ rate: 8, base: 500, vat: 40 }, { rate: 10, base: 1200, vat: 120 }]);
});

test('nội dung bắt buộc còn thiếu được liệt kê', () => {
  const seller = { name: 'Công ty A', taxCode: '0100109106', address: 'Hà Nội' };
  assert.deepEqual(invoiceContentIssues({ seller, invoice: { buyerType: 'person', templateCode: '1', symbol: 'C26TAA' } }), []);
  const issues = invoiceContentIssues({ seller: { name: '', taxCode: '', address: '' }, invoice: { buyerType: 'organization' } });
  assert.equal(issues.length, 4);
});
