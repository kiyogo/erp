import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeAdvance } from '../advanceRules.mjs';

const today = '2026-11-21';
const draft = { code: 'TU-1', advanceType: 'Công tác phí', purpose: 'Đi công tác', advancedAmount: 3_000_000, settleDeadline: '2026-12-01' };

test('đề nghị tạm ứng mới luôn ở trạng thái chờ cấp và số dư 0', () => {
  const created = normalizeAdvance({ ...draft, status: 'Đã quyết toán nội bộ', balance: 5 }, null, { today });
  assert.equal(created.status, 'Chờ cấp tạm ứng');
  assert.equal(created.balance, 0);
  assert.equal(created.requestDate, today);
  assert.throws(() => normalizeAdvance({ ...draft, settleDeadline: '2026-11-01' }, null, { today }), /Hạn hoàn ứng/);
  assert.throws(() => normalizeAdvance({ ...draft, advancedAmount: 0 }, null, { today }), /Số tiền tạm ứng/);
});

test('cấp tiền rồi quyết toán theo chứng từ, chênh lệch do máy chủ tính', () => {
  const created = normalizeAdvance(draft, null, { today });
  assert.throws(() => normalizeAdvance({ ...created, status: 'Đã quyết toán nội bộ' }, created, { today }), /cấp tiền/);
  const issued = normalizeAdvance({ ...created, status: 'Chờ thanh quyết toán', issuedAmount: 3_000_000, disbursementReference: 'PC-1' }, created, { today });
  assert.equal(issued.balance, 3_000_000);
  const overspent = normalizeAdvance({ ...issued, spentAmount: 3_400_000, invoicesSummary: 'HĐ 1' }, issued, { today });
  assert.equal(overspent.balance, -400_000);
  assert.equal(overspent.status, 'Chờ thanh quyết toán');
  const exact = normalizeAdvance({ ...issued, spentAmount: 3_000_000, invoicesSummary: 'HĐ 1' }, issued, { today });
  assert.equal(exact.status, 'Đã quyết toán nội bộ');
  assert.throws(() => normalizeAdvance({ ...exact, spentAmount: 1 }, exact, { today }), /đã quyết toán/);
  assert.throws(() => normalizeAdvance({ ...issued, spentAmount: 1 }, issued, { today }), /Bảng kê/);
});
