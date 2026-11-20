import assert from 'node:assert/strict';
import { test } from 'node:test';
import { accountBalance, applyAccountMap, documentLedgerLines, documentPostingProblem, inventoryCountLedgerLines, inventoryCountPostingProblem, inventoryIssueLedgerLines, inventoryIssuePostingProblem, provisionLedgerLines, provisionPostingProblem } from '../ledgerPostingRules.mjs';

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

test('giá vốn xuất kho: chỉ phiếu xuất hoặc giao đã giao, Nợ 632 Có 156', () => {
  assert.equal(inventoryIssuePostingProblem({ type: 'Xuất kho', totalAmount: 100 }), '');
  assert.equal(inventoryIssuePostingProblem({ type: 'Giao hàng', shipmentStatus: 'Đã giao', totalAmount: 100 }), '');
  assert.match(inventoryIssuePostingProblem({ type: 'Giao hàng', shipmentStatus: 'Đang giao', totalAmount: 100 }), /đã giao/);
  assert.match(inventoryIssuePostingProblem({ type: 'Nhập kho', totalAmount: 100 }), /xuất kho/);
  assert.match(inventoryIssuePostingProblem({ type: 'Xuất kho', totalAmount: 0 }), /giá trị/);
  assert.deepEqual(inventoryIssueLedgerLines({ totalAmount: 4000 }).map((l) => [l.account, l.debit, l.credit]), [['632', 4000, 0], ['156', 0, 4000]]);
});

test('số dư tài khoản hàng tồn kho từ sổ cái gồm tài khoản con và bút toán nhiều dòng', () => {
  const entries = [
    { status: 'Đã ghi sổ cái', lines: [{ account: '1561', debit: 500, credit: 0 }, { account: '331', debit: 0, credit: 500 }] },
    { status: 'Đã ghi sổ cái', debitAccount: 'TK 632', creditAccount: 'TK 156', amount: 200 },
    { status: 'Nháp', debitAccount: 'TK 156', creditAccount: 'TK 331', amount: 999 },
  ];
  assert.deepEqual(accountBalance(entries, ['152', '156']), [{ account: '152', balance: 0 }, { account: '156', balance: 300 }]);
});

test('chênh lệch kiểm kê: thiếu Nợ 1381, thừa Có 3381, cân Nợ Có', () => {
  assert.match(inventoryCountPostingProblem({ shortageAmount: 0, surplusAmount: 0 }), /không có chênh lệch/);
  const lines = inventoryCountLedgerLines({ shortageAmount: 2000, surplusAmount: 500 });
  assert.deepEqual(lines.map((l) => [l.account, l.debit, l.credit]), [['1381', 2000, 0], ['156', 0, 2000], ['156', 500, 0], ['3381', 0, 500]]);
  assert.equal(lines.reduce((s, l) => s + l.debit, 0), lines.reduce((s, l) => s + l.credit, 0));
});

test('dự phòng giảm giá hàng tồn kho: tăng Nợ 632 Có 2294, hoàn nhập ngược lại', () => {
  assert.match(provisionPostingProblem({ totalAdjustment: 0 }), /không thay đổi/);
  assert.deepEqual(provisionLedgerLines({ totalAdjustment: 700 }).map((l) => [l.account, l.debit, l.credit]), [['632', 700, 0], ['2294', 0, 700]]);
  assert.deepEqual(provisionLedgerLines({ totalAdjustment: -300 }).map((l) => [l.account, l.debit, l.credit]), [['2294', 300, 0], ['632', 0, 300]]);
});
