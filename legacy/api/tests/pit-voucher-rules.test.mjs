import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildPitVoucher, voucherNumber } from '../pitVoucherRules.mjs';

const company = { name: 'Công ty A', taxCode: '0012345672', address: 'Hà Nội', phone: '0241234567' };
const person = { name: 'Nguyễn Văn B', taxCode: '', identityNumber: '001203004567', address: 'Hà Nội' };
const payslips = [
  { month: '2025-01', gross: 20_000_000, exemptIncome: 1_000_000, insuranceDeduction: 2_100_000, taxDeduction: 300_000 },
  { month: '2025-02', gross: 20_000_000, exemptIncome: 0, insuranceDeduction: 2_100_000, taxDeduction: 400_000 },
  { month: '2025-05', gross: 20_000_000, exemptIncome: 0, insuranceDeduction: 2_100_000, taxDeduction: 500_000 },
];

test('chứng từ khấu trừ cộng thu nhập, bảo hiểm và thuế đã khấu trừ trong kỳ', () => {
  const voucher = buildPitVoucher({ company, person, payslips, year: 2025, fromMonth: 1, toMonth: 3 });
  assert.equal(voucher.months, 2);
  assert.equal(voucher.totalIncome, 40_000_000);
  assert.equal(voucher.taxableIncome, 39_000_000);
  assert.equal(voucher.insurance, 4_200_000);
  assert.equal(voucher.taxWithheld, 700_000);
  assert.equal(voucher.paymentPeriod, 'Tháng 1 đến tháng 3 năm 2025');
  assert.deepEqual(voucher.contentIssues, []);
});

test('báo thiếu nội dung bắt buộc, chặn kỳ sai hoặc không có phiếu lương', () => {
  const voucher = buildPitVoucher({ company: { name: 'A' }, person: { name: 'B' }, payslips, year: 2025, fromMonth: 5, toMonth: 5 });
  assert.equal(voucher.contentIssues.length, 4);
  assert.throws(() => buildPitVoucher({ company, person, payslips, year: 2025, fromMonth: 4, toMonth: 3 }), /tháng bắt đầu/);
  assert.throws(() => buildPitVoucher({ company, person, payslips, year: 2025, fromMonth: 6, toMonth: 12 }), /Không có phiếu lương/);
  assert.equal(voucherNumber(12), '0000012');
});
