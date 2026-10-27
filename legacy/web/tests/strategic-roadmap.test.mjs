import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  createStrategicOkr,
  strategicOkrExportRows,
  strategicOkrMetrics,
  strategicOkrStatus,
  updateStrategicOkrProgress,
} from '../src/modules/plans/strategicRoadmapRules.ts';

const values = {
  okrCode: 'OKR-2026-001',
  title: 'Hoàn thiện nền tảng dữ liệu',
  pillar: 'Hạ tầng Công nghệ & AI',
  owner: 'Nguyễn An',
  targetMetric: 'Hoàn thành 3 hạng mục',
  progressPct: 0,
  deadline: '2026-12-31',
};

test('OKR creation preserves zero progress and derives a stable key and status', () => {
  const record = createStrategicOkr(values, []);
  assert.equal(record.key, values.okrCode);
  assert.equal(record.progressPct, 0);
  assert.equal(record.status, 'Đang đúng tiến độ');
});

test('OKR creation rejects missing values, duplicate codes, invalid pillars, dates and progress', () => {
  const existing = [createStrategicOkr(values, [])];
  assert.throws(() => createStrategicOkr(values, existing), /Mã OKR/);
  assert.throws(() => createStrategicOkr({ ...values, owner: '' }, []), /Nhập đủ/);
  assert.throws(() => createStrategicOkr({ ...values, pillar: 'Khác' }, []), /Trụ cột/);
  assert.throws(() => createStrategicOkr({ ...values, deadline: '2026-02-30' }, []), /Hạn chót/);
  for (const progressPct of ['', -1, 101, 1.5, 'abc']) {
    assert.throws(() => createStrategicOkr({ ...values, progressPct }, []), /Tiến độ/);
  }
});

test('OKR progress updates validate values and derive completion or overdue status', () => {
  const record = createStrategicOkr({ ...values, deadline: '2026-10-01' }, []);
  assert.equal(strategicOkrStatus(0, record.deadline, new Date('2026-10-27T12:00:00')), 'Cần tăng tốc');
  assert.deepEqual(updateStrategicOkrProgress(record, 0, new Date('2026-10-27T12:00:00')), {
    ...record, progressPct: 0, status: 'Cần tăng tốc',
  });
  assert.equal(updateStrategicOkrProgress(record, '100').status, 'Hoàn thành');
  assert.throws(() => updateStrategicOkrProgress(record, ''), /Tiến độ/);
});

test('OKR metrics handle empty data and count only persisted records', () => {
  assert.deepEqual(strategicOkrMetrics([]), {
    totalCount: 0, averageProgress: null, completedCount: 0, overdueCount: 0, pillarCount: 0,
  });
  const records = [
    createStrategicOkr(values, []),
    createStrategicOkr({ ...values, okrCode: 'OKR-2026-002', progressPct: 100, pillar: 'Mở rộng Thị phần B2B' }, []),
  ];
  assert.deepEqual(strategicOkrMetrics(records, new Date('2026-10-27T12:00:00')), {
    totalCount: 2, averageProgress: 50, completedCount: 1, overdueCount: 0, pillarCount: 2,
  });
});

test('OKR export includes the supplied filtered records and preserves zero progress', () => {
  const record = createStrategicOkr(values, []);
  const rows = strategicOkrExportRows([record]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], record.okrCode);
  assert.equal(rows[1][5], 0);
  assert.equal(rows[1][7], record.status);
});
