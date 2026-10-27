import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  listReportPeriods,
  normalizeReportPeriod,
  reportPeriodLabel,
  reportXlsxRows,
  REPORT_SOURCE_CONFIG,
  selectReportPeriodRows,
  summarizeReportRows,
} from '../src/modules/reports/reportData.ts';

test('report period options include the current and prior three quarters across year boundaries', () => {
  assert.deepEqual(listReportPeriods(new Date('2026-01-12T00:00:00Z')), [
    { value: '2026-Q1', label: 'Quý 1 / 2026' },
    { value: '2025-Q4', label: 'Quý 4 / 2025' },
    { value: '2025-Q3', label: 'Quý 3 / 2025' },
    { value: '2025-Q2', label: 'Quý 2 / 2025' },
    { value: '2026-ALL', label: 'Cả năm 2026' },
  ]);
});

test('legacy report period labels normalize to valid filter keys', () => {
  assert.equal(normalizeReportPeriod('Quý III / 2026'), '2026-Q3');
  assert.equal(normalizeReportPeriod('Quý 4 / 2025'), '2025-Q4');
  assert.equal(normalizeReportPeriod('Cả năm 2024'), '2024-ALL');
  assert.equal(reportPeriodLabel('2026-Q3'), 'Quý 3 / 2026');
});

test('report periods include only valid dated source rows and count missing or malformed dates', () => {
  const source = [
    { key: 'inside-start', date: '2026-04-01' },
    { key: 'inside-end', date: '2026-06-30T14:25:00Z' },
    { key: 'before', date: '2026-03-31' },
    { key: 'after', date: '2026-07-01' },
    { key: 'missing', date: '' },
    { key: 'bad', date: '2026-02-31' },
  ];
  const result = selectReportPeriodRows(source, '2026-Q2', 'date');
  assert.deepEqual(result.rows.map((item) => item.key), ['inside-start', 'inside-end']);
  assert.equal(result.missingDateCount, 2);
  assert.throws(() => selectReportPeriodRows(source, '2026-Q5', 'date'), /không hợp lệ/);
});

test('report exports keep configured columns, serialize nested values and avoid unrelated PII fields', () => {
  assert.ok(!REPORT_SOURCE_CONFIG['Kinh doanh & CRM'].fields.includes('bankAccount'));
  assert.ok(!REPORT_SOURCE_CONFIG['Kinh doanh & CRM'].fields.includes('taxCode'));
  assert.ok(!REPORT_SOURCE_CONFIG['Nhân sự & Tiền lương'].fields.includes('phone'));
  assert.deepEqual(reportXlsxRows([{ code: 'A-1', details: { count: 2 }, excluded: 'secret' }], ['code', 'details']), [
    ['code', 'details'],
    ['A-1', '{"count":2}'],
  ]);
});

test('report summary derives counts from actual rows and their saved statuses', () => {
  const result = summarizeReportRows([
    { status: 'Đã ghi sổ cái' },
    { status: 'Đã ghi sổ cái' },
    { status: 'Chờ duyệt' },
  ], 'entryDate', 1);
  assert.match(result.summary, /3 hồ sơ/);
  assert.match(result.summary, /1 hồ sơ thiếu/);
  assert.deepEqual(result.metrics, [
    { label: 'Hồ sơ trong kỳ', value: '3' },
    { label: 'Thiếu ngày hợp lệ', value: '1' },
    { label: 'Trạng thái: Đã ghi sổ cái', value: '2' },
    { label: 'Trạng thái: Chờ duyệt', value: '1' },
  ]);
});
