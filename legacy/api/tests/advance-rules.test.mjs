import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeAdvance, settlementLedgerLines } from '../advanceRules.mjs';

const today = '2026-11-21';
const step = { today, transition: true };
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
  const created = normalizeAdvance(draft, null, step);
  assert.throws(() => normalizeAdvance({ ...created, status: 'Đã quyết toán nội bộ' }, created, step), /cấp tiền/);
  const issued = normalizeAdvance({ ...created, status: 'Chờ thanh quyết toán', issuedAmount: 3_000_000, disbursementReference: 'PC-1' }, created, step);
  assert.equal(issued.balance, 3_000_000);
  const overspent = normalizeAdvance({ ...issued, spentAmount: 3_400_000, invoicesSummary: 'HĐ 1' }, issued, step);
  assert.equal(overspent.balance, -400_000);
  assert.equal(overspent.status, 'Chờ thanh quyết toán');
  const exact = normalizeAdvance({ ...issued, spentAmount: 3_000_000, invoicesSummary: 'HĐ 1' }, issued, step);
  assert.equal(exact.status, 'Đã quyết toán nội bộ');
  assert.throws(() => normalizeAdvance({ ...exact, spentAmount: 1 }, exact, step), /đã quyết toán/);
  assert.throws(() => normalizeAdvance({ ...issued, spentAmount: 1 }, issued, step), /Bảng kê/);
});

test('sửa phiếu qua kho chung không chuyển bước và giữ số liệu máy chủ', () => {
  const created = normalizeAdvance(draft, null, { today });
  assert.throws(() => normalizeAdvance({ ...created, status: 'Chờ thanh quyết toán', issuedAmount: 3_000_000, disbursementReference: 'PC-1' }, created, { today }), /nút Cấp tạm ứng/);
  const issued = normalizeAdvance({ ...created, status: 'Chờ thanh quyết toán', issuedAmount: 3_000_000, disbursementReference: 'PC-1' }, created, step);
  const edited = normalizeAdvance({ ...issued, purpose: 'Đi Đà Nẵng', spentAmount: 3_000_000, balance: 0 }, issued, { today });
  assert.equal(edited.purpose, 'Đi Đà Nẵng');
  assert.equal(edited.status, 'Chờ thanh quyết toán');
  assert.equal(edited.spentAmount, 0);
  assert.equal(edited.balance, 3_000_000);
});

test('bút toán quyết toán: Nợ chi phí, Nợ 1331, Có 141', () => {
  assert.deepEqual(settlementLedgerLines({ spentAmount: 1_100_000, vatAmount: 100_000, expenseAccount: '6428' }), [
    { account: '6428', debit: 1_000_000, credit: 0 }, { account: '1331', debit: 100_000, credit: 0 }, { account: '141', debit: 0, credit: 1_100_000 },
  ]);
  assert.throws(() => settlementLedgerLines({ spentAmount: 1000, expenseAccount: '1111' }), /Tài khoản ghi Nợ/);
  assert.throws(() => settlementLedgerLines({ spentAmount: 1000, vatAmount: 2000, expenseAccount: '642' }), /Thuế GTGT/);
});
