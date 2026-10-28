import assert from 'node:assert/strict';
import { test } from 'node:test';
import { costingExportRows, costingMetrics, createCostingRecord, parseCostingAmount } from '../src/modules/finance/costingRules.ts';

const validCosting = {
  code: 'GT-2026-001', projectName: 'Triển khai hệ thống ERP', category: 'Hợp đồng kinh tế B2B',
  materialCost: 0, directLabor: 100000, infrastructureCost: 50000, softwareLicense: 0, overheadCost: 20000,
  revenue: 250000, status: 'Đang thực hiện',
};

test('costing keeps explicit zero amounts and computes total cost and gross margin from entered components', () => {
  const record = createCostingRecord(validCosting);
  assert.equal(record.key, 'GT-2026-001');
  assert.equal(record.totalCost, 170000);
  assert.equal(record.profitMargin, 32);
  assert.equal(record.materialCost, 0);
  assert.equal(record.softwareLicense, 0);
});

test('costing requires valid nonnegative integer amounts and rejects overflow', () => {
  for (const value of ['', null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 'not a number']) {
    assert.throws(() => parseCostingAmount(value, 'doanh thu'));
  }
  assert.throws(() => createCostingRecord({ ...validCosting, materialCost: Number.MAX_SAFE_INTEGER }));
});

test('costing rejects duplicate codes, invalid statuses and missing real construction sites', () => {
  assert.throws(() => createCostingRecord(validCosting, ['gt-2026-001']), /đã tồn tại/);
  assert.throws(() => createCostingRecord({ ...validCosting, status: 'Tự hoàn thành' }), /Trạng thái/);
  assert.throws(() => createCostingRecord({ ...validCosting, category: 'Công trình thi công', constructionSite: '' }), /Địa điểm/);
  assert.equal(createCostingRecord({ ...validCosting, category: 'Công trình thi công', constructionSite: 'Trung tâm dữ liệu Hà Nội' }).constructionSite, 'Trung tâm dữ liệu Hà Nội');
});

test('costing metrics and exports use actual records and keep unknown margins blank', () => {
  const first = createCostingRecord(validCosting);
  const second = createCostingRecord({ ...validCosting, code: 'GT-2026-002', revenue: 0, totalCost: undefined });
  assert.deepEqual(costingMetrics([first, second]), { totalCost: 340000, totalRevenue: 250000, grossMargin: -36 });
  const rows = costingExportRows([second]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'GT-2026-002');
  assert.equal(rows[1][10], 0);
  assert.equal(rows[1][11], '');
});
