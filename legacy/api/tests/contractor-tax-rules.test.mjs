import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateContractorTax, contractorFilingDeadline } from '../contractorTaxRules.mjs';

test('giá chưa gồm thuế: quy đổi ngược để nhà thầu nhận đủ số thực nhận', () => {
  const result = calculateContractorTax({ businessType: 'services', amount: 100_000_000, priceIncludesTax: false, paymentDate: '2026-11-02' });
  assert.equal(result.vatRevenue, 110_803_324);
  assert.equal(result.vat, 5_540_166);
  assert.equal(result.cit, 5_263_158);
  assert.equal(result.netPayment, 100_000_000);
  const debit = result.journal.reduce((sum, line) => sum + line.debit, 0);
  assert.equal(debit, result.journal.reduce((sum, line) => sum + line.credit, 0));
});

test('giá đã gồm thuế, dịch vụ không chịu thuế GTGT và bản quyền', () => {
  const gross = calculateContractorTax({ businessType: 'construction_with_materials', amount: 1_000_000_000, priceIncludesTax: true, paymentDate: '2026-11-02' });
  assert.equal(gross.vat, 30_000_000);
  assert.equal(gross.cit, 19_400_000);
  assert.equal(gross.netPayment, 950_600_000);
  const software = calculateContractorTax({ businessType: 'services', amount: 50_000_000, priceIncludesTax: true, vatApplicable: false, paymentDate: '2026-11-02' });
  assert.equal(software.vat, 0);
  assert.equal(software.cit, 2_500_000);
  assert.equal(calculateContractorTax({ businessType: 'royalty', amount: 10_000_000, priceIncludesTax: true, paymentDate: '2026-11-02' }).cit, 1_000_000);
  assert.throws(() => calculateContractorTax({ businessType: 'x', amount: 1, paymentDate: '2026-11-02' }), /Ngành nghề/);
});

test('hạn khai: 10 ngày theo lần phát sinh hoặc ngày 20 tháng sau, dời khỏi cuối tuần', () => {
  assert.equal(contractorFilingDeadline('2026-11-02', 'occurrence'), '2026-11-12');
  assert.equal(contractorFilingDeadline('2026-11-04', 'occurrence'), '2026-11-16');
  assert.equal(contractorFilingDeadline('2026-12-15', 'monthly'), '2027-01-20');
});
