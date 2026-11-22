import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateCommissions, commissionBonusByEmployee, commissionPolicyProblem, preTaxNet } from '../commissionRules.mjs';

const policy = { key: 'p1', name: 'Hoa hồng 2026', rate: 2, basis: 'delivered', effectiveFrom: '2026-01-01', effectiveTo: '' };

test('chính sách hoa hồng: tỷ lệ, căn cứ, ngày và không trùng thời gian', () => {
  assert.equal(commissionPolicyProblem(policy), '');
  assert.match(commissionPolicyProblem({ ...policy, rate: 0 }), /Tỷ lệ/);
  assert.match(commissionPolicyProblem({ ...policy, rate: 1.234 }), /Tỷ lệ/);
  assert.match(commissionPolicyProblem({ ...policy, basis: 'x' }), /căn cứ/);
  assert.match(commissionPolicyProblem({ ...policy, effectiveTo: '2025-12-31' }), /Ngày kết thúc/);
  assert.match(commissionPolicyProblem({ ...policy, key: 'p2', effectiveFrom: '2026-06-01' }, [policy]), /trùng/);
  assert.equal(commissionPolicyProblem({ ...policy, key: 'p2', effectiveFrom: '2027-01-01' }, [{ ...policy, effectiveTo: '2026-12-31' }]), '');
});

test('hoa hồng tính trên doanh số chưa thuế, theo căn cứ của chính sách', () => {
  assert.equal(preTaxNet({ amount: 1_100_000, vatAmount: 100_000, adjustedAmount: 110_000 }), 900_000);
  const docs = [
    { key: 'a', code: 'S1', documentType: 'sale', subtype: 'Đơn bán hàng', status: 'Đã bàn giao', documentDate: '2026-03-05', amount: 1_100_000, vatAmount: 100_000, remainingAmount: 1_100_000, salespersonId: 'u1', salespersonName: 'Lan' },
    { key: 'b', code: 'S2', documentType: 'sale', subtype: 'Đơn bán hàng', status: 'Đang triển khai', documentDate: '2026-03-06', amount: 500_000, salespersonId: 'u1' },
    { key: 'c', code: 'S3', documentType: 'sale', subtype: 'Báo giá', status: 'Báo giá', documentDate: '2026-03-07', amount: 900_000, salespersonId: 'u1' },
    { key: 'd', code: 'S4', documentType: 'sale', subtype: 'Đơn bán hàng', status: 'Đã bàn giao', documentDate: '2026-03-08', amount: 300_000 },
    { key: 'e', code: 'S5', documentType: 'sale', subtype: 'Đơn bán hàng', status: 'Đã bàn giao', documentDate: '2025-12-30', amount: 300_000, salespersonId: 'u1' },
  ];
  const delivered = calculateCommissions({ docs, policies: [policy], month: '2026-03' });
  assert.deepEqual(delivered.rows.map((row) => [row.salespersonId, row.revenue, row.commission, row.documents.length]), [['u1', 1_000_000, 20_000, 1]]);
  assert.deepEqual(delivered.unassigned.map((item) => item.code), ['S4']);
  const paid = calculateCommissions({ docs, policies: [{ ...policy, basis: 'paid' }], month: '2026-03' });
  assert.equal(paid.rows.length, 0);
  assert.deepEqual(calculateCommissions({ docs, policies: [policy], month: '2025-12' }).noPolicy.map((item) => item.code), ['S5']);
  assert.equal(commissionBonusByEmployee([{ month: '2026-03', rows: delivered.rows }], '2026-03').get('u1'), 20_000);
});
