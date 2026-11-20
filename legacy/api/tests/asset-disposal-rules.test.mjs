import assert from 'node:assert/strict';
import { test } from 'node:test';
import { disposalFigures, disposalFinalProblem, disposalJournal, disposalWarnings, isSaleDisposal } from '../assetDisposalRules.mjs';

const sale = 'Bán thanh lý cho đơn vị thu mua ngoài';

test('giá bán chưa thuế, thuế GTGT, lãi lỗ theo giá trị còn lại', () => {
  assert.deepEqual(disposalFigures({ originalCost: 100_000_000, accumulatedDepreciation: 90_000_000, price: 20_000_000, vatRate: 10, cost: 1_000_000, method: sale }),
    { vatAmount: 2_000_000, totalReceived: 22_000_000, netBookValue: 10_000_000, netGainLoss: 9_000_000 });
  const destroyed = disposalFigures({ originalCost: 5_000_000, accumulatedDepreciation: 2_000_000, price: 0, vatRate: 10, cost: 100_000, method: 'Tiêu hủy an toàn (Data Wiping / Shredding)' });
  assert.equal(destroyed.vatAmount, 0);
  assert.equal(destroyed.netGainLoss, -3_100_000);
  assert.ok(isSaleDisposal(sale) && !isSaleDisposal('Tặng / Quyên góp từ thiện'));
});

test('hồ sơ hoàn tất: ngày hợp lệ, bán phải có hóa đơn, thuế suất và mã số thuế hợp lệ', () => {
  const base = { method: sale, disposalDate: '2026-10-10', proposalDate: '2026-10-01', today: '2026-11-20', assetStartDate: '2025-01-01', vatRate: 10, invoiceNo: '15', invoiceDate: '2026-10-10', buyerTaxCode: '0100109106' };
  assert.equal(disposalFinalProblem(base), '');
  assert.match(disposalFinalProblem({ ...base, disposalDate: '2026-12-01' }), /tương lai/);
  assert.match(disposalFinalProblem({ ...base, disposalDate: '2026-09-30' }), /đề xuất/);
  assert.match(disposalFinalProblem({ ...base, assetStartDate: '2026-10-11' }), /đưa tài sản vào sử dụng/);
  assert.match(disposalFinalProblem({ ...base, invoiceNo: '' }), /hóa đơn/);
  assert.match(disposalFinalProblem({ ...base, vatRate: 7 }), /không được áp dụng/);
  assert.match(disposalFinalProblem({ ...base, buyerTaxCode: '0100109107' }), /không hợp lệ/);
  assert.equal(disposalFinalProblem({ ...base, method: 'Báo mất / Thất lạc do rủi ro', invoiceNo: '', vatRate: 0 }), '', 'không bán thì không cần hóa đơn');
});

test('bút toán gợi ý cân Nợ Có và đủ khoản: hao mòn, giá trị còn lại, thu nhập, thuế, chi phí', () => {
  const lines = disposalJournal({ method: sale, originalCost: 100, accumulatedDepreciation: 90, netBookValue: 10, price: 20, vatAmount: 2, cost: 1, intangible: false, paymentMethod: 'Chuyển khoản' });
  const sum = (key) => lines.reduce((total, line) => total + line[key], 0);
  assert.equal(sum('debit'), sum('credit'));
  assert.deepEqual(lines.map((line) => line.account), ['214', '811', '211', '112', '711', '3331', '811', '112']);
  const lost = disposalJournal({ method: 'Báo mất / Thất lạc do rủi ro', originalCost: 100, accumulatedDepreciation: 40, netBookValue: 60, price: 0, vatAmount: 0, cost: 0, intangible: true, paymentMethod: '' });
  assert.deepEqual(lost.map((line) => line.account), ['214', '811', '213']);
});

test('cảnh báo: thiếu quyết định, bán dưới giá trị còn lại, tặng, báo mất', () => {
  const base = { method: sale, councilDecisionNo: '12/QĐ-TL', price: 10, netBookValue: 5, invoiceDate: '2026-10-10', disposalDate: '2026-10-10' };
  assert.deepEqual(disposalWarnings(base), []);
  assert.equal(disposalWarnings({ ...base, councilDecisionNo: '' }).length, 1);
  assert.match(disposalWarnings({ ...base, price: 1 })[0], /lỗ/);
  assert.match(disposalWarnings({ ...base, invoiceDate: '2026-10-12' })[0], /Ngày hóa đơn/);
  assert.match(disposalWarnings({ ...base, method: 'Tặng / Quyên góp từ thiện' })[0], /GTGT/);
  assert.match(disposalWarnings({ ...base, method: 'Báo mất / Thất lạc do rủi ro' })[0], /Tổn thất/);
});
