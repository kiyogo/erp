import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isValidTaxCode } from '../invoiceRules.mjs';
import { adjustmentAmountProblem, adjustmentOriginalProblem, adjustmentSide, isAdjustmentSubtype, isNonCashPayment, normalizeTradeTerms, partnerTaxCodeProblem, tradeWarnings, vatConsistencyProblem } from '../tradeRules.mjs';
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

test('chứng từ gốc của hàng trả lại, giảm giá: đúng phía, còn hiệu lực, không phải chứng từ điều chỉnh', () => {
  const sale = { key: 'a', documentType: 'sale', subtype: 'Đơn bán hàng', status: 'Đã bàn giao' };
  assert.ok(isAdjustmentSubtype('Hàng mua trả lại') && !isAdjustmentSubtype('Đơn bán hàng'));
  assert.equal(adjustmentSide('Giảm giá hàng bán'), 'sale');
  assert.equal(adjustmentOriginalProblem('Hàng bán bị trả lại', sale), '');
  assert.equal(adjustmentOriginalProblem('Hàng bán bị trả lại', { documentType: 'invoice', subtype: 'Hóa đơn đầu ra', status: 'Đã phát hành' }), '');
  assert.match(adjustmentOriginalProblem('Hàng bán bị trả lại', { ...sale, subtype: 'Báo giá' }), /bán hàng/);
  assert.match(adjustmentOriginalProblem('Hàng mua trả lại', sale), /mua hàng/);
  assert.match(adjustmentOriginalProblem('Hàng bán bị trả lại', { ...sale, status: 'Đã hủy' }), /đã hủy/);
  assert.match(adjustmentOriginalProblem('Hàng bán bị trả lại', { ...sale, adjustsDocumentId: 'x' }), /điều chỉnh/);
  assert.match(adjustmentOriginalProblem('Hàng bán bị trả lại', null), /không tồn tại/);
});

test('chứng từ điều chỉnh: cùng thuế suất, không trước gốc, tổng không quá giá trị gốc', () => {
  const original = { documentType: 'sale', documentDate: '2026-10-01', vatRate: 10, amount: 1_100_000 };
  const adjustment = { documentType: 'sale', documentDate: '2026-10-05', vatRate: 10, amount: 330_000 };
  assert.equal(adjustmentAmountProblem(adjustment, original, 0), '');
  assert.equal(adjustmentAmountProblem({ ...adjustment, amount: 770_000 }, original, 330_000), '');
  assert.match(adjustmentAmountProblem({ ...adjustment, amount: 770_001 }, original, 330_000), /vượt/);
  assert.match(adjustmentAmountProblem({ ...adjustment, documentDate: '2026-09-30' }, original, 0), /trước ngày/);
  assert.match(adjustmentAmountProblem({ ...adjustment, vatRate: 8 }, original, 0), /thuế suất/);
  assert.match(adjustmentAmountProblem({ ...adjustment, documentType: 'invoice' }, original, 0), /cùng loại/);
});

test('hóa đơn điều chỉnh: cảnh báo thiếu số khi gốc có thuế; không áp quy tắc thanh toán của hóa đơn mua', () => {
  const adjustment = { documentType: 'purchase', subtype: 'Hàng mua trả lại', adjustsDocumentId: 'x', amount: 9_000_000, vatAmount: 818_182, documentDate: '2026-10-01' };
  assert.equal(tradeWarnings(adjustment, {}).length, 1);
  assert.equal(tradeWarnings(adjustment, { invoiceNo: '12' }).length, 0);
  assert.equal(tradeWarnings({ ...adjustment, vatAmount: 0 }, {}).length, 0);
});

test('thuế GTGT: hóa đơn điều chỉnh giảm trừ thuế đầu ra và thuế đầu vào được khấu trừ', () => {
  const base = { status: 'Đã phát hành', partnerName: 'A', documentDate: '2026-10-08', paymentProof: false };
  const summary = vatSummary([
    { ...base, subtype: 'Đầu ra', amount: 11_000_000, vatRate: 10, vatAmount: 1_000_000 },
    { ...base, subtype: 'Giảm giá hàng bán', amount: 1_100_000, vatRate: 10, vatAmount: 100_000, adjustment: { side: 'sale', onTaxInvoice: true } },
    { ...base, subtype: 'Giảm giá hàng bán', amount: 550_000, vatRate: 10, vatAmount: 50_000, adjustment: { side: 'sale', onTaxInvoice: false } },
    { ...base, subtype: 'Đầu vào', amount: 3_300_000, vatRate: 10, vatAmount: 300_000 },
    { ...base, subtype: 'Hàng mua trả lại', amount: 1_100_000, vatRate: 10, vatAmount: 100_000, adjustment: { side: 'purchase', onTaxInvoice: true } },
  ], '2026-10-01', '2026-10-31');
  assert.equal(summary.outputVat, 900_000);
  assert.deepEqual(summary.outputByRate, [{ rate: 10, base: 9_000_000, vat: 900_000 }]);
  assert.equal(summary.deductibleInputVat, 200_000);
  assert.equal(summary.amountPayable, 700_000);
});
