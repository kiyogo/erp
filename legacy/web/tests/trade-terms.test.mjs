import assert from 'node:assert/strict';
import test from 'node:test';
import { PAYMENT_METHODS as apiMethods } from '../../api/tradeRules.mjs';
import { PAYMENT_METHODS as webMethods, termsFromValues, vatOf } from '../src/modules/finance/tradeTerms.ts';

test('hình thức thanh toán ở web khớp với máy chủ', () => {
  assert.deepEqual(webMethods, apiMethods);
});

test('đọc ô điều khoản của form: bỏ ô trống, đổi số', () => {
  assert.deepEqual(termsFromValues({ terms_contractNo: ' HD-1 ', terms_penaltyRate: '5', terms_paymentTermDays: 0, terms_note: '   ', terms_warrantyMonths: '' }), { contractNo: 'HD-1', penaltyRate: 5, paymentTermDays: 0 });
  assert.equal(vatOf(1_000_000, 10), 100_000);
  assert.equal(vatOf(333, 8), 27);
});

import { ADJUSTMENT_SUBTYPES as apiAdjustments } from '../../api/tradeRules.mjs';
import { ADJUSTMENT_SUBTYPES as webAdjustments, adjustableOriginals, adjustmentSubtype, netTradeTotals } from '../src/modules/finance/tradeAdjustments.ts';

test('loại chứng từ điều chỉnh ở web khớp với máy chủ', () => {
  assert.deepEqual(webAdjustments, apiAdjustments);
  assert.equal(adjustmentSubtype('purchase', 'return'), 'Hàng mua trả lại');
  assert.equal(adjustmentSubtype('sale', 'discount'), 'Giảm giá hàng bán');
});

test('chứng từ gốc còn điều chỉnh được và tổng đã trừ điều chỉnh', () => {
  const doc = (over) => ({ key: 'k', documentType: 'sale', subtype: 'Đơn bán hàng', status: 'Đã bàn giao', amount: 1000, paidAmount: 0, remainingAmount: 1000, ...over });
  const list = [
    doc({ key: 'a', adjustedAmount: 400, remainingAmount: 600 }),
    doc({ key: 'b', adjustedAmount: 1000, remainingAmount: 0 }),
    doc({ key: 'c', subtype: 'Báo giá' }),
    doc({ key: 'd', status: 'Đã hủy' }),
    doc({ key: 'e', documentType: 'invoice', subtype: 'Hóa đơn đầu ra' }),
    doc({ key: 'f', documentType: 'purchase', subtype: 'Đơn mua hàng' }),
    doc({ key: 'g', subtype: 'Hàng bán bị trả lại', adjustsDocumentId: 'a', amount: 400, remainingAmount: 0 }),
  ];
  assert.deepEqual(adjustableOriginals('sale', list).map((item) => [item.document.key, item.room]), [['a', 600], ['e', 1000]]);
  assert.deepEqual(adjustableOriginals('purchase', list).map((item) => item.document.key), ['f']);
  assert.deepEqual(netTradeTotals(list.filter((item) => item.documentType === 'sale' && item.subtype !== 'Báo giá')), { total: 600, paid: 0, remaining: 600 });
});

import { documentPaymentInfo } from '../src/modules/finance/tradeAdjustments.ts';

test('hướng thanh toán và số còn thanh toán được của chứng từ', () => {
  const doc = (over) => ({ documentType: 'sale', subtype: 'Đơn bán hàng', status: 'Đã bàn giao', amount: 1000, paidAmount: 300, remainingAmount: 500, ...over });
  assert.deepEqual(documentPaymentInfo(doc()), { type: 'Thu', title: 'Thu tiền khách hàng', remaining: 500 });
  assert.equal(documentPaymentInfo(doc({ documentType: 'purchase', subtype: 'Đơn mua hàng' })).type, 'Chi');
  assert.equal(documentPaymentInfo(doc({ documentType: 'invoice', subtype: 'Hóa đơn đầu vào' })).type, 'Chi');
  assert.deepEqual(documentPaymentInfo(doc({ subtype: 'Hàng bán bị trả lại', remainingAmount: 0 })), { type: 'Chi', title: 'Hoàn tiền cho khách hàng', remaining: 700 });
  assert.equal(documentPaymentInfo(doc({ documentType: 'purchase', subtype: 'Giảm giá hàng mua' })).type, 'Thu');
  assert.equal(documentPaymentInfo(doc({ status: 'Đã hủy' })), null);
  assert.equal(documentPaymentInfo(doc({ subtype: 'Báo giá' })), null);
});
