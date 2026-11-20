import assert from 'node:assert/strict';
import { test } from 'node:test';
import { documentPaymentPlan, paymentJournalLines } from '../paymentRules.mjs';

const doc = (over) => ({ documentType: 'sale', subtype: 'Đơn bán hàng', status: 'Đã bàn giao', amount: 1000, paidAmount: 300, ...over });

test('kế hoạch thanh toán: hướng thu chi, tài khoản đối ứng và số còn thanh toán được', () => {
  assert.deepEqual(documentPaymentPlan(doc()), { type: 'Thu', partnerAccount: '131', category: 'Thu tiền khách hàng theo chứng từ', note: 'Thu tiền khách hàng', limit: 1000, remaining: 700 });
  assert.equal(documentPaymentPlan(doc(), 200).remaining, 500, 'trừ hàng trả lại, giảm giá');
  assert.equal(documentPaymentPlan(doc({ documentType: 'purchase', subtype: 'Hóa đơn đầu vào' })).type, 'Chi');
  assert.equal(documentPaymentPlan(doc({ documentType: 'invoice', subtype: 'Đầu ra' })).partnerAccount, '131');
  const refund = documentPaymentPlan(doc({ subtype: 'Hàng bán bị trả lại' }), 999);
  assert.deepEqual([refund.type, refund.partnerAccount, refund.remaining], ['Chi', '131', 700], 'hoàn tiền khách không trừ credit');
  const supplierRefund = documentPaymentPlan(doc({ documentType: 'purchase', subtype: 'Giảm giá hàng mua' }));
  assert.deepEqual([supplierRefund.type, supplierRefund.partnerAccount], ['Thu', '331']);
  assert.equal(documentPaymentPlan(doc({ paidAmount: 1000 })).remaining, 0);
});

test('không thanh toán chứng từ đã hủy, báo giá hoặc loại chưa hỗ trợ', () => {
  assert.match(documentPaymentPlan(doc({ status: 'Đã hủy' })).problem, /đã hủy/);
  assert.match(documentPaymentPlan(doc({ subtype: 'Báo giá' })).problem, /Báo giá/);
  assert.match(documentPaymentPlan(doc({ documentType: 'invoice', subtype: 'Khác' })).problem, /chưa có quy tắc/);
});

test('dòng hạch toán thu và chi', () => {
  const thu = documentPaymentPlan(doc());
  assert.deepEqual(paymentJournalLines(thu, '1121', 500, 'x'), [{ description: 'x', debitAccount: '1121', creditAccount: '131', amount: 500 }]);
  const chi = documentPaymentPlan(doc({ documentType: 'purchase', subtype: 'Đơn mua hàng' }));
  assert.deepEqual(paymentJournalLines(chi, '1121', 500, 'y'), [{ description: 'y', debitAccount: '331', creditAccount: '1121', amount: 500 }]);
});
