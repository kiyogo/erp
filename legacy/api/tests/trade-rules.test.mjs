import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidTaxCode } from '../invoiceRules.mjs';
import { isNonCashPayment, normalizeTradeTerms, partnerTaxCodeProblem, tradeWarnings, vatConsistencyProblem } from '../tradeRules.mjs';
import { vatSummary } from '../taxRules.mjs';

test('thuế GTGT phải khớp tiền hàng chưa thuế', () => {
  assert.equal(vatConsistencyProblem({ amount: 1_100_000, vatRate: 10, vatAmount: 100_000 }), '');
  assert.equal(vatConsistencyProblem({ amount: 1000, vatRate: 10, vatAmount: 90 }), '', 'lệch 1 đồng do làm tròn');
  assert.match(vatConsistencyProblem({ amount: 1_100_000, vatRate: 10, vatAmount: 0 }), /không khớp/);
  assert.match(vatConsistencyProblem({ amount: 1_100_000, vatRate: 10, vatAmount: 150_000 }), /đúng là/);
  assert.equal(vatConsistencyProblem({ amount: 500, vatRate: 0, vatAmount: 0 }), '');
  assert.match(vatConsistencyProblem({ amount: 500, vatRate: 0, vatAmount: 50 }), /0%/);
});

test('mã số thuế đối tác: mã đúng số kiểm tra hoặc số định danh 12 số', () => {
  assert.equal(partnerTaxCodeProblem('0100109106', isValidTaxCode), '');
  assert.equal(partnerTaxCodeProblem('079123456789', isValidTaxCode), '');
  assert.equal(partnerTaxCodeProblem('', isValidTaxCode), '');
  assert.match(partnerTaxCodeProblem('0100109107', isValidTaxCode), /không hợp lệ/);
});

test('điều khoản thương mại: phạt vi phạm tối đa 8%, ngày theo thứ tự, hình thức thanh toán hợp lệ', () => {
  assert.deepEqual(normalizeTradeTerms({ contractNo: ' HD-01 ', penaltyRate: '8', paymentTermDays: '30', note: '' }), { contractNo: 'HD-01', penaltyRate: 8, paymentTermDays: 30 });
  assert.deepEqual(normalizeTradeTerms(undefined), {});
  assert.throws(() => normalizeTradeTerms({ penaltyRate: 8.5 }), /Mức phạt/);
  assert.throws(() => normalizeTradeTerms({ paymentTermDays: 1.5 }), /số nguyên/);
  assert.throws(() => normalizeTradeTerms({ paymentMethod: 'Bitcoin' }), /Hình thức/);
  assert.throws(() => normalizeTradeTerms({ signedDate: '2026-02-30' }), /Ngày ký/);
  assert.throws(() => normalizeTradeTerms({ signedDate: '2026-05-10', deliveryDate: '2026-05-01' }), /giao hàng/);
  assert.throws(() => normalizeTradeTerms({ effectiveDate: '2026-05-10', expiryDate: '2026-05-01' }), /hết hạn/);
});

test('cảnh báo: hợp đồng thiếu số, lãi quá trần, mua từ 5 triệu trả tiền mặt', () => {
  const purchase = { documentType: 'purchase', subtype: 'Hợp đồng mua', amount: 6_000_000, vatAmount: 545_455, documentDate: '2026-10-01' };
  assert.equal(tradeWarnings(purchase, { contractNo: 'A', signedDate: '2026-09-30', paymentMethod: 'Chuyển khoản' }).length, 0);
  assert.equal(tradeWarnings(purchase, {}).length, 3, 'thiếu số, ngày ký, hình thức thanh toán');
  assert.match(tradeWarnings(purchase, { contractNo: 'A', signedDate: '2026-09-30', paymentMethod: 'Tiền mặt' })[0], /không được khấu trừ/);
  assert.match(tradeWarnings({ ...purchase, subtype: 'Đơn mua hàng' }, { paymentMethod: 'Chuyển khoản', lateInterestRate: 25 })[0], /20%\/năm/);
  assert.equal(tradeWarnings({ ...purchase, amount: 4_000_000 }, { contractNo: 'A', signedDate: '2026-09-30' }).length, 0, 'dưới ngưỡng không cần chuyển khoản');
  assert.ok(isNonCashPayment('Chuyển khoản') && !isNonCashPayment('Tiền mặt'));
});

test('thuế đầu vào có hình thức thanh toán không dùng tiền mặt được khấu trừ dù từ ngưỡng', () => {
  const doc = (paymentProof) => ({ subtype: 'Đầu vào', partnerName: 'NCC', documentDate: '2026-10-08', amount: 11_000_000, vatRate: 10, vatAmount: 1_000_000, status: 'Đã phát hành', paymentProof });
  assert.equal(vatSummary([doc(true)], '2026-10-01', '2026-10-31').deductibleInputVat, 1_000_000);
  const without = vatSummary([doc(false)], '2026-10-01', '2026-10-31');
  assert.equal(without.deductibleInputVat, 0);
  assert.equal(without.inputVatNeedingProof, 1_000_000);
});
