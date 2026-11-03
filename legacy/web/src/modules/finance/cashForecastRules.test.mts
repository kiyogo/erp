import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCashForecast } from './cashForecastRules.ts';

test('cash forecast uses actual outstanding documents, tax liabilities and loan schedule balances by due date', () => {
  const periods = buildCashForecast({
    startDate: '2026-11-01',
    endDate: '2026-11-14',
    openingBalance: 1_000_000,
    documents: [
      { key: 'sale-1', code: 'BH-01', documentType: 'sale', status: 'Chưa thanh toán', dueDate: '2026-11-02', remainingAmount: 500_000 },
      { key: 'purchase-1', code: 'MH-01', documentType: 'purchase', status: 'Chưa thanh toán', dueDate: '2026-11-09', remainingAmount: 200_000 },
      { key: 'cancelled', code: 'BH-02', documentType: 'sale', status: 'Đã hủy', dueDate: '2026-11-03', remainingAmount: 900_000 },
    ],
    loans: [{ key: 'loan-1', contractCode: 'VAY-01', direction: 'borrow', principalAmount: 100_000, dueDate: '2026-12-01', loanSchedules: [{ key: 'schedule-1', dueDate: '2026-11-10', principalAmount: 80_000, interestAmount: 10_000 }] }],
    loanEvents: [{ loanKey: 'loan-1', eventType: 'repayment', eventDate: '2026-11-01', scheduleKey: 'schedule-1', principalAmount: 20_000, interestAmount: 2_000 }],
    taxes: [{ key: 'tax-1', code: 'THUE-01', deadline: '2026-11-11', amountPayable: 30_000, amountPaid: 10_000 }],
  });

  assert.equal(periods.length, 2);
  assert.deepEqual(periods.map(period => [period.inflow, period.outflow, period.closingBalance]), [
    [500_000, 0, 1_500_000],
    [0, 288_000, 1_212_000],
  ]);
  assert.equal(periods[1].flows.some(flow => flow.source === 'tax' && flow.amount === 20_000), true);
});

test('receivable probability only changes estimated inflows and supports an explicitly dated manual adjustment', () => {
  const periods = buildCashForecast({
    startDate: '2026-11-01',
    endDate: '2026-11-07',
    openingBalance: 0,
    receivableProbabilityPct: 50,
    documents: [{ key: 'sale-1', code: 'BH-01', documentType: 'sale', status: 'Chưa thanh toán', dueDate: '2026-11-03', remainingAmount: 101 }],
    loans: [],
    loanEvents: [],
    taxes: [],
    manualAdjustment: { date: '2026-11-04', direction: 'outflow', amount: 20, reference: 'Lịch trả lương đã xác nhận' },
  });
  assert.equal(periods[0].inflow, 51);
  assert.equal(periods[0].outflow, 20);
  assert.equal(periods[0].closingBalance, 31);
  assert.equal(periods[0].flows.find(flow => flow.source === 'receivable')?.originalAmount, 101);
});

test('past-due balances are placed on the first forecast day and retain their original due date', () => {
  const periods = buildCashForecast({
    startDate: '2026-11-01', endDate: '2026-11-07', openingBalance: 0,
    documents: [{ key: 'sale-1', code: 'BH-01', documentType: 'sale', status: 'Chưa thanh toán', dueDate: '2026-10-20', remainingAmount: 100 }],
    loans: [], loanEvents: [], taxes: [],
  });
  assert.equal(periods[0].flows[0].date, '2026-11-01');
  assert.equal(periods[0].flows[0].originalDate, '2026-10-20');
  assert.match(periods[0].flows[0].note || '', /quá hạn/);
});

test('cash forecast rejects invalid dates, non-integer money and out-of-range probabilities', () => {
  const base = {
    startDate: '2026-11-01', endDate: '2026-11-07', openingBalance: 0,
    documents: [], loans: [], loanEvents: [], taxes: [],
  };
  assert.throws(() => buildCashForecast({ ...base, startDate: '2026-02-30' }), /Khoảng thời gian/);
  assert.throws(() => buildCashForecast({ ...base, openingBalance: 1.5 }), /Số dư đầu kỳ/);
  assert.throws(() => buildCashForecast({ ...base, receivableProbabilityPct: 101 }), /Xác suất thu/);
  assert.throws(() => buildCashForecast({ ...base, manualAdjustment: { date: '2026-11-03', direction: 'outflow', amount: 1.5, reference: 'Chi phí' } }), /số nguyên/);
  assert.throws(() => buildCashForecast({ ...base, endDate: '2027-11-02' }), /tối đa là 366 ngày/);
});
