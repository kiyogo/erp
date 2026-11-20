import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyAccountMap, documentLedgerLines, documentPostingProblem } from '../ledgerPostingRules.mjs';

const doc = (over) => ({ documentType: 'sale', subtype: 'Đơn bán hàng', status: 'Đã bàn giao', amount: 1_100_000, vatAmount: 100_000, ...over });
const totals = (lines) => [lines.reduce((s, l) => s + l.debit, 0), lines.reduce((s, l) => s + l.credit, 0)];

test('chỉ ghi sổ khi đã ghi nhận doanh thu, hàng đã về, hóa đơn đã phát hành', () => {
  assert.equal(documentPostingProblem(doc()), '');
  assert.match(documentPostingProblem(doc({ status: 'Đang triển khai' })), /đã bàn giao/);
  assert.match(documentPostingProblem(doc({ subtype: 'Báo giá', status: 'Báo giá' })), /Báo giá/);
  assert.match(documentPostingProblem(doc({ status: 'Đã hủy' })), /đã hủy/);
  assert.equal(documentPostingProblem(doc({ documentType: 'purchase', subtype: 'Đơn mua hàng', status: 'Đã nhận hàng' })), '');
  assert.match(documentPostingProblem(doc({ documentType: 'purchase', subtype: 'Đơn mua hàng', status: 'Chờ xử lý' })), /nhận hàng/);
  assert.equal(documentPostingProblem(doc({ documentType: 'purchase', subtype: 'Hóa đơn đầu vào', status: 'Chờ xử lý' })), '');
  assert.equal(documentPostingProblem(doc({ documentType: 'invoice', subtype: 'Đầu ra', status: 'Đã phát hành' })), '');
  assert.match(documentPostingProblem(doc({ documentType: 'invoice', subtype: 'Đầu ra', status: 'Hóa đơn nháp' })), /đã phát hành/);
  assert.equal(documentPostingProblem(doc({ subtype: 'Giảm giá hàng bán', status: 'Đã ghi nhận' })), '');
  assert.match(documentPostingProblem(doc({ documentType: 'invoice', subtype: 'Khác' })), /chưa có quy tắc/);
});

test('bút toán từ chứng từ luôn cân và đúng tài khoản', () => {
  const cases = [
    [doc(), ['131', '511', '3331']],
    [doc({ documentType: 'invoice', subtype: 'Đầu ra' }), ['131', '511', '3331']],
    [doc({ documentType: 'purchase', subtype: 'Đơn mua hàng' }), ['156', '1331', '331']],
    [doc({ subtype: 'Hàng bán bị trả lại' }), ['521', '3331', '131']],
    [doc({ documentType: 'purchase', subtype: 'Giảm giá hàng mua' }), ['331', '156', '1331']],
  ];
  for (const [document, accounts] of cases) {
    const lines = documentLedgerLines(document);
    assert.deepEqual(lines.map((l) => l.account), accounts);
    const [debit, credit] = totals(lines);
    assert.equal(debit, credit);
    assert.equal(debit, 1_100_000);
  }
  assert.deepEqual(documentLedgerLines(doc({ vatAmount: 0, amount: 500 })).map((l) => l.account), ['131', '511'], 'không thuế thì không có dòng thuế');
});

test('đổi mã tài khoản: chỉ nhận mã 3 đến 6 chữ số', () => {
  const lines = documentLedgerLines(doc());
  assert.deepEqual(applyAccountMap(lines, { 511: '5111' }).map((l) => l.account), ['131', '5111', '3331']);
  assert.deepEqual(applyAccountMap(lines, undefined).map((l) => l.account), ['131', '511', '3331']);
  assert.throws(() => applyAccountMap(lines, { 511: 'abc' }), /511/);
});
