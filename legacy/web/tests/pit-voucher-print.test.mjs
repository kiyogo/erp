import test from 'node:test';
import assert from 'node:assert/strict';
import { pitVoucherHtml } from '../src/modules/finance/pitVoucherPrint.ts';

const voucher = {
  key: 'CTT56-AA-0000001', templateSymbol: 'CTT56', series: 'AA/25E', number: '0000001', employeeId: 'u1', year: 2025, fromMonth: 1, toMonth: 3,
  incomeType: 'Tiền lương, tiền công', paymentPeriod: 'Tháng 1 đến tháng 3 năm 2025', months: 3, totalIncome: 75_000_000, taxableIncome: 75_000_000, exemptIncome: 0,
  insurance: 7_875_000, charity: 0, taxWithheld: 1_800_000, company: { name: 'Công ty <A>', taxCode: '0012345672', address: 'Hà Nội', phone: '' },
  person: { name: 'Nguyễn Văn B', employeeCode: 'NV1', taxCode: '', identityNumber: '001203004567', address: 'Hà Nội', phone: '', nationality: 'Việt Nam', resident: true },
  contentIssues: [], issuedAt: '2026-11-21T03:00:00.000Z', issuedBy: 'Kế toán', status: 'Đã lập, chưa ký số',
};

test('PIT voucher print shows mandatory content, escapes HTML and marks unsigned or cancelled vouchers', () => {
  const html = pitVoucherHtml(voucher);
  assert.match(html, /CHỨNG TỪ KHẤU TRỪ THUẾ THU NHẬP CÁ NHÂN/);
  assert.match(html, /Số: 0000001/);
  assert.match(html, /1\.800\.000 đồng/);
  assert.match(html, /Khoản đóng bảo hiểm bắt buộc/);
  assert.match(html, /Công ty &lt;A&gt;/);
  assert.match(html, /Chứng từ chưa ký số/);
  assert.match(pitVoucherHtml({ ...voucher, status: 'Đã hủy', cancelReason: 'Sai kỳ' }), /Chứng từ đã hủy: Sai kỳ/);
});
