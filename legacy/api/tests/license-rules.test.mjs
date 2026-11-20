import assert from 'node:assert/strict';
import { test } from 'node:test';
import { licenseAccounting, licenseTermMonths, normalizeLicenseLegal } from '../licenseRules.mjs';

const context = { purchaseDate: '2026-10-01', expireDate: '2027-09-30', licenseType: 'Thuê bao', billingCycle: 'Hàng năm', today: '2026-11-20' };
const input = { vendorOrigin: 'domestic', vendorTaxCode: '0100109106', contractNo: 'HĐ-01', invoiceNo: '123', invoiceSymbol: '1C26TAA', invoiceDate: '2026-10-02', purchaseCost: 12_000_000, vatRate: 10, paymentMethod: 'Chuyển khoản' };

test('số tháng của thời hạn bản quyền tính cả ngày cuối', () => {
  assert.equal(licenseTermMonths('2026-10-01', '2027-09-30'), 12);
  assert.equal(licenseTermMonths('2026-01-01', '2026-01-10'), 1);
  assert.equal(licenseTermMonths('2026-01-01', '2028-12-31'), 36);
});

test('cách hạch toán: tài sản cố định vô hình, chi phí trả trước, chi phí hàng tháng', () => {
  assert.equal(licenseAccounting({ ...context, licenseType: 'Vĩnh viễn', purchaseCost: 30_000_000 }).treatment, 'intangible_asset');
  const small = licenseAccounting({ ...context, billingCycle: 'Vĩnh viễn', purchaseCost: 29_999_999 });
  assert.deepEqual([small.treatment, small.amortizationMonths], ['prepaid', 36]);
  const yearly = licenseAccounting({ ...context, purchaseCost: 12_000_000 });
  assert.deepEqual([yearly.treatment, yearly.amortizationMonths, yearly.monthlyAmortization], ['prepaid', 12, 1_000_000]);
  assert.deepEqual(licenseAccounting({ ...context, billingCycle: 'Hàng tháng', purchaseCost: 500_000 }).monthlyAmortization, 500_000);
  assert.equal(licenseAccounting({ ...context, purchaseCost: 0 }).treatment, 'none');
});

test('chứng từ mua: thuế GTGT tính từ giá mua, mã số thuế và ngày hợp lệ', () => {
  const ok = normalizeLicenseLegal(input, context);
  assert.deepEqual([ok.legal.vatAmount, ok.legal.totalPayable], [1_200_000, 13_200_000]);
  assert.equal(ok.accounting.monthlyAmortization, 1_000_000);
  assert.deepEqual(ok.warnings, []);
  assert.throws(() => normalizeLicenseLegal({ ...input, vendorTaxCode: '0100109107' }, context), /không hợp lệ/);
  assert.throws(() => normalizeLicenseLegal({ ...input, invoiceDate: '2026-12-01' }, context), /tương lai/);
  assert.throws(() => normalizeLicenseLegal({ ...input, vatRate: 7 }, context), /không được áp dụng/);
  assert.throws(() => normalizeLicenseLegal({ ...input, purchaseCost: -1 }, context), /không âm/);
  assert.throws(() => normalizeLicenseLegal({ ...input, paymentMethod: 'Bitcoin' }, context), /không hợp lệ/);
});

test('cảnh báo: thiếu hóa đơn, trả tiền mặt từ ngưỡng, nhà cung cấp nước ngoài', () => {
  assert.match(normalizeLicenseLegal({ ...input, invoiceNo: '' }, context).warnings[0], /số hóa đơn/);
  assert.match(normalizeLicenseLegal({ ...input, paymentMethod: 'Tiền mặt' }, context).warnings[0], /không được khấu trừ/);
  assert.match(normalizeLicenseLegal({ ...input, paymentMethod: '' }, context).warnings[0], /không dùng tiền mặt/);
  const foreign = normalizeLicenseLegal({ ...input, vendorOrigin: 'foreign', vendorTaxCode: 'ABC', invoiceNo: '' }, context);
  assert.equal(foreign.legal.vatAmount, 0);
  assert.equal(foreign.legal.vendorTaxCode, '');
  assert.equal(foreign.warnings.length, 1);
  assert.match(foreign.warnings[0], /nhà thầu nước ngoài/);
  assert.equal(normalizeLicenseLegal({ ...input, purchaseCost: 3_000_000, paymentMethod: 'Tiền mặt' }, context).warnings.length, 0, 'dưới ngưỡng 5 triệu');
});
