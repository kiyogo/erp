import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTaxFiling } from './taxWorkflowRules.ts';

const validFiling = {
  code: 'TAX-2026-Q3',
  taxType: 'Thuế GTGT',
  period: 'Quý 3/2026',
  filingMethod: 'Quý',
  taxYear: 2026,
  periodStart: '2026-07-01',
  periodEnd: '2026-09-30',
  filingDeadline: '2026-10-31',
  deadline: '2026-11-10',
  amountPayable: 0,
};

test('tax filing accepts a complete user-entered period and separate deadlines', () => {
  assert.equal(validateTaxFiling(validFiling, []), null);
});

test('tax filing rejects invalid period dates, reversed dates, and unsupported filing cycles', () => {
  assert.equal(validateTaxFiling({ ...validFiling, periodStart: '2026-02-30' }, []), 'Khoảng ngày của kỳ kê khai không hợp lệ.');
  assert.equal(validateTaxFiling({ ...validFiling, periodStart: '2026-10-01' }, []), 'Ngày bắt đầu kỳ không được sau ngày kết thúc kỳ.');
  assert.equal(validateTaxFiling({ ...validFiling, filingMethod: 'Tự suy đoán' }, []), 'Chọn phương pháp kê khai hợp lệ.');
});
