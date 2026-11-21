import assert from 'node:assert/strict';
import { test } from 'node:test';
import { citRate, ledgerProfit, lateInterest, nextWorkingDay, taxFilingDeadline, vatNonCashThreshold, vatSummary } from '../taxRules.mjs';

test('hạn nộp theo kỳ: GTGT tháng ngày 20, quý ngày cuối tháng đầu quý sau, chuyển sang ngày làm việc kế tiếp', () => {
  const deadline = (taxType, periodEnd, filingMethod = '') => taxFilingDeadline({ taxType, filingMethod, periodEnd }).deadline;
  assert.equal(deadline('Thuế GTGT', '2026-10-31', 'Tháng'), '2026-11-20');
  assert.equal(deadline('Thuế GTGT', '2026-11-30', 'Tháng'), '2026-12-21', '20/12/2026 là chủ nhật');
  assert.equal(deadline('Thuế GTGT', '2026-09-30', 'Quý'), '2026-11-02', '31/10/2026 là thứ bảy');
  assert.throws(() => deadline('Thuế GTGT', '2026-09-30'), /Tháng hoặc Quý/);
  assert.equal(nextWorkingDay('2026-07-31'), '2026-07-31');
});

test('tạm nộp TNDN quý và quyết toán năm đổi cách tính từ 01/07/2026', () => {
  const deadline = (taxType, periodEnd) => taxFilingDeadline({ taxType, filingMethod: '', periodEnd }).deadline;
  assert.equal(deadline('Thuế TNDN tạm tính', '2026-03-31'), '2026-05-04', 'trước 01/07/2026: ngày thứ 30, 30/4 và 01/5 là ngày lễ nên dời sang thứ hai 04/5');
  assert.equal(deadline('Thuế TNDN tạm tính', '2026-06-30'), '2026-07-31', 'từ 01/07/2026: ngày cuối tháng');
  assert.equal(deadline('Thuế TNDN tạm tính', '2026-12-31'), '2027-02-01', '31/01/2027 là chủ nhật');
  assert.equal(deadline('Quyết toán thuế TNDN', '2025-12-31'), '2026-03-31');
  assert.equal(deadline('Quyết toán thuế TNDN', '2026-12-31'), '2027-03-31');
  assert.throws(() => taxFilingDeadline({ taxType: 'Lệ phí Môn bài', periodEnd: '2025-12-31' }), /chưa có quy tắc/);
});

test('thuế suất TNDN theo doanh thu năm trước từ kỳ tính thuế 2025', () => {
  assert.equal(citRate({ taxYear: 2024, previousYearRevenue: 1 }).rate, 0.20);
  assert.equal(citRate({ taxYear: 2026, previousYearRevenue: 3_000_000_000 }).rate, 0.15);
  assert.equal(citRate({ taxYear: 2026, previousYearRevenue: 3_000_000_001 }).rate, 0.17);
  assert.equal(citRate({ taxYear: 2026, previousYearRevenue: 50_000_000_000 }).rate, 0.17);
  assert.equal(citRate({ taxYear: 2026, previousYearRevenue: 50_000_000_001 }).rate, 0.20);
  assert.throws(() => citRate({ taxYear: 2026, previousYearRevenue: -1 }));
});

test('lợi nhuận từ sổ cái bỏ bút toán kết chuyển, tài khoản 821 và ngoài kỳ', () => {
  const entry = (extra) => ({ status: 'Đã ghi sổ cái', entryDate: '2026-05-10', ...extra });
  const result = ledgerProfit([
    entry({ debitAccount: 'TK 112', creditAccount: 'TK 511', amount: 1_000_000 }),
    entry({ debitAccount: 'TK 642', creditAccount: 'TK 111', amount: 300_000 }),
    entry({ lines: [{ account: 'TK 811', debit: 50_000, credit: 0 }, { account: 'TK 112', debit: 0, credit: 50_000 }] }),
    entry({ debitAccount: 'TK 821', creditAccount: 'TK 333', amount: 99_000 }),
    entry({ debitAccount: 'TK 511', creditAccount: 'TK 911', amount: 1_000_000, sourceModule: 'general_ledger_close' }),
    entry({ debitAccount: 'TK 112', creditAccount: 'TK 511', amount: 777, entryDate: '2025-12-31' }),
  ], '2026-01-01', '2026-12-31');
  assert.deepEqual(result, { revenue: 1_000_000, expense: 350_000, profit: 650_000 });
});

test('GTGT phải nộp: đầu ra trừ đầu vào, hóa đơn đầu vào từ 5 triệu cần chứng từ chuyển khoản', () => {
  assert.equal(vatNonCashThreshold('2025-06-30'), 20_000_000);
  assert.equal(vatNonCashThreshold('2025-07-01'), 5_000_000);
  const doc = (subtype, partnerName, documentDate, amount, vatRate, vatAmount, status = 'Đã phát hành') => ({ subtype, partnerName, documentDate, amount, vatRate, vatAmount, status });
  const summary = vatSummary([
    doc('Đầu ra', 'Khách A', '2026-10-05', 110_000_000, 10, 10_000_000),
    doc('Đầu ra', 'Khách B', '2026-10-06', 5_400_000, 8, 400_000),
    doc('Đầu ra', 'Khách C', '2026-10-07', 999, 10, 99, 'Đã hủy'),
    doc('Đầu vào', 'NCC 1', '2026-10-08', 3_300_000, 10, 300_000),
    doc('Đầu vào', 'NCC 2', '2026-10-09', 2_200_000, 10, 200_000),
    doc('Đầu vào', 'NCC 2', '2026-10-09', 3_300_000, 10, 300_000),
    doc('Đầu vào', 'NCC 3', '2026-11-01', 9_900_000, 10, 900_000),
  ], '2026-10-01', '2026-10-31');
  assert.equal(summary.outputVat, 10_400_000);
  assert.deepEqual(summary.outputByRate.map(row => row.rate), [8, 10]);
  assert.equal(summary.deductibleInputVat, 300_000);
  assert.equal(summary.inputVatNeedingProof, 500_000, 'NCC 2 cùng ngày cộng gộp 5,5 triệu');
  assert.equal(summary.amountPayable, 10_100_000);
  assert.equal(vatSummary([doc('Đầu vào', 'NCC', '2026-10-08', 3_300_000, 10, 300_000)], '2026-10-01', '2026-10-31').carriedForward, 300_000);
});

test('tiền chậm nộp 0,03% mỗi ngày', () => {
  assert.equal(lateInterest(10_000_000, 10), 30_000);
  assert.throws(() => lateInterest(-1, 1));
});
