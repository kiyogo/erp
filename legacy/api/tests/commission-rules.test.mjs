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

test('hoa hồng bậc thang: kiểm tra bậc, lũy tiến từng phần và toàn bộ theo bậc đạt được', async () => {
  const { tierCommission } = await import('../commissionRules.mjs');
  const tiers = [{ from: 0, rate: 1 }, { from: 100_000_000, rate: 2 }, { from: 300_000_000, rate: 3 }];
  const tiered = { ...policy, rate: 1, tiers, tierMode: 'progressive' };
  assert.equal(commissionPolicyProblem(tiered), '');
  assert.match(commissionPolicyProblem({ ...tiered, tierMode: '' }), /cách tính bậc thang/);
  assert.match(commissionPolicyProblem({ ...tiered, tiers: [{ from: 10, rate: 1 }] }), /Bậc 1 phải bắt đầu từ doanh số 0/);
  assert.match(commissionPolicyProblem({ ...tiered, tiers: [tiers[0], { from: 0, rate: 2 }] }), /Bậc 2: mức doanh số phải lớn hơn/);
  assert.match(commissionPolicyProblem({ ...tiered, tiers: [tiers[0], { from: 5, rate: 0 }] }), /Bậc 2: tỷ lệ/);
  // 350 triệu: lũy tiến 100tr×1% + 200tr×2% + 50tr×3% = 6,5 triệu; toàn bộ theo bậc 3: 350tr×3% = 10,5 triệu.
  assert.equal(tierCommission(350_000_000, tiers, 'progressive'), 6_500_000);
  assert.equal(tierCommission(350_000_000, tiers, 'whole'), 10_500_000);
  assert.equal(tierCommission(100_000_000, tiers, 'whole'), 2_000_000);
  assert.equal(tierCommission(99_999_999, tiers, 'progressive'), 1_000_000);
  assert.equal(tierCommission(0, tiers, 'whole'), 0);

  // Hai chứng từ của cùng nhân viên: bậc tính trên tổng 150 triệu rồi chia lại theo doanh số chứng từ.
  const sale = (key, amount) => ({ key, code: key, documentType: 'sale', subtype: 'Đơn bán hàng', status: 'Đã bàn giao', documentDate: '2026-03-10', amount, vatAmount: 0, salespersonId: 'u1' });
  const result = calculateCommissions({ docs: [sale('A', 50_000_000), sale('B', 100_000_000)], policies: [tiered], month: '2026-03' });
  const [row] = result.rows;
  assert.equal(row.commission, 2_000_000);
  assert.deepEqual(row.documents.map((item) => [item.code, item.commission, item.rate]), [['A', 666_667, 1.33], ['B', 1_333_333, 1.33]]);
  assert.equal(calculateCommissions({ docs: [sale('A', 50_000_000), sale('B', 100_000_000)], policies: [{ ...tiered, tierMode: 'whole' }], month: '2026-03' }).rows[0].commission, 3_000_000);
});
