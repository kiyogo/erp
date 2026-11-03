import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getFiscalQuarterDates } from '../../shared/finance-periods.mjs';

test('fiscal quarter boundaries clamp to month end and stay contiguous', () => {
  const first = getFiscalQuarterDates('2026-Q1', 5, 31);
  const second = getFiscalQuarterDates('2026-Q2', 5, 31);
  const third = getFiscalQuarterDates('2026-Q3', 5, 31);
  const fourth = getFiscalQuarterDates('2026-Q4', 5, 31);

  assert.deepEqual(first, {
    year: '2026', quarter: '1', startDate: '2026-05-31', endDate: '2026-08-30', endExclusive: '2026-08-31',
  });
  assert.equal(second.startDate, first.endExclusive);
  assert.equal(second.endExclusive, '2026-11-30');
  assert.equal(third.startDate, second.endExclusive);
  assert.equal(third.endExclusive, '2027-02-28');
  assert.equal(fourth.startDate, third.endExclusive);
  assert.equal(fourth.endExclusive, '2027-05-31');
});

test('fiscal quarter boundaries preserve leap day and reject invalid profiles', () => {
  const leapQuarter = getFiscalQuarterDates('2027-Q3', 5, 31);

  assert.equal(leapQuarter.startDate, '2027-11-30');
  assert.equal(leapQuarter.endExclusive, '2028-02-29');
  assert.equal(getFiscalQuarterDates('2026-Q5', 1, 1), null);
  assert.equal(getFiscalQuarterDates('2026-Q1', 13, 1), null);
});
