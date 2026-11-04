import test from 'node:test';
import assert from 'node:assert/strict';
import { getFinanceOverviewDateRange } from './financeOverviewRules.ts';

test('finance overview presets calculate calendar ranges without local-time shifts', () => {
  assert.deepEqual(getFinanceOverviewDateRange('day', '2026-11-04'), { dateFrom: '2026-11-04', dateTo: '2026-11-04' });
  assert.deepEqual(getFinanceOverviewDateRange('week', '2026-11-04'), { dateFrom: '2026-11-02', dateTo: '2026-11-08' });
  assert.deepEqual(getFinanceOverviewDateRange('month', '2026-02-12'), { dateFrom: '2026-02-01', dateTo: '2026-02-28' });
  assert.deepEqual(getFinanceOverviewDateRange('quarter', '2026-11-04'), { dateFrom: '2026-10-01', dateTo: '2026-12-31' });
  assert.deepEqual(getFinanceOverviewDateRange('year', '2026-11-04'), { dateFrom: '2026-01-01', dateTo: '2026-12-31' });
  assert.deepEqual(getFinanceOverviewDateRange('all', '2026-11-04'), { dateFrom: '', dateTo: '' });
});

test('custom overview range leaves user dates untouched for the form to supply', () => {
  assert.deepEqual(getFinanceOverviewDateRange('custom', '2026-11-04'), { dateFrom: '', dateTo: '' });
  assert.throws(() => getFinanceOverviewDateRange('day', '2026-02-30'));
});
