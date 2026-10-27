import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceStatus, calculateAdvanceSettlement } from '../src/modules/finance/advanceCalculations.ts';

test('advance settlement keeps refunds and company reimbursements as signed balances', () => {
  assert.deepEqual(calculateAdvanceSettlement(1000, 700, false), { balance: 300, status: 'Chờ thanh quyết toán' });
  assert.deepEqual(calculateAdvanceSettlement(1000, 1200, false), { balance: -200, status: 'Chờ thanh quyết toán' });
  assert.deepEqual(calculateAdvanceSettlement(1000, 1200, true), { balance: -200, status: 'Đã quyết toán nội bộ' });
  assert.deepEqual(calculateAdvanceSettlement(1000, 1000, false), { balance: 0, status: 'Đã quyết toán nội bộ' });
});

test('advance settlement rejects negative or non-finite amounts', () => {
  assert.throws(() => calculateAdvanceSettlement(-1, 0, false), /không âm/i);
  assert.throws(() => calculateAdvanceSettlement(1, Number.NaN, false), /không âm/i);
});

test('advance status derives overdue from actual deadline and preserves final states', () => {
  assert.equal(advanceStatus('Chờ thanh quyết toán', '2026-10-25', '2026-10-26'), 'Quá hạn quyết toán');
  assert.equal(advanceStatus('Chờ cấp tạm ứng', '2026-10-01', '2026-10-26'), 'Chờ cấp tạm ứng');
  assert.equal(advanceStatus('Đã quyết toán nội bộ', '2026-10-01', '2026-10-26'), 'Đã quyết toán nội bộ');
});
