import assert from 'node:assert/strict';
import test from 'node:test';
import { documentLinesProblem, lineAmount, normalizeDocumentLines } from '../documentLineRules.mjs';

test('thành tiền dòng = làm tròn(số lượng × đơn giá) − chiết khấu', () => {
  const { lines, net } = normalizeDocumentLines([{ name: ' Thép ', unit: 'kg', quantity: '2.125', unitPrice: 15_333.5, discount: 1 }, { name: 'Vận chuyển', quantity: 1, unitPrice: 0 }]);
  assert.deepEqual(lines[0], { name: 'Thép', unit: 'kg', quantity: 2.125, unitPrice: 15_333.5, discount: 1, amount: 32_583 });
  assert.equal(net, 32_583);
  assert.equal(lineAmount(lines[0]), 32_583);
  assert.deepEqual(normalizeDocumentLines(undefined), { lines: [], net: 0 });
});

test('mặt hàng kho: lấy mã, đơn vị tính từ danh mục, tên được ghi đè', () => {
  const items = new Map([['i1', { sku: 'A4', name: 'Giấy A4', unit: 'Ram' }]]);
  assert.deepEqual(normalizeDocumentLines([{ itemKey: 'i1', unit: 'Thùng', quantity: 2, unitPrice: 10 }], items).lines[0], { itemKey: 'i1', sku: 'A4', name: 'Giấy A4', unit: 'Ram', quantity: 2, unitPrice: 10, amount: 20 });
  assert.equal(normalizeDocumentLines([{ itemKey: 'i1', name: 'Giấy in', quantity: 1, unitPrice: 1 }], items).lines[0].name, 'Giấy in');
  assert.throws(() => normalizeDocumentLines([{ itemKey: 'x', quantity: 1, unitPrice: 1 }], items), /không còn trong danh mục/);
});

test('chặn dòng sai', () => {
  assert.throws(() => normalizeDocumentLines([{ name: '', quantity: 1, unitPrice: 1 }]), /tên hàng hóa/);
  assert.throws(() => normalizeDocumentLines([{ name: 'A', quantity: 0, unitPrice: 1 }]), /số lượng/);
  assert.throws(() => normalizeDocumentLines([{ name: 'A', quantity: 1.0001, unitPrice: 1 }]), /số lượng/);
  assert.throws(() => normalizeDocumentLines([{ name: 'A', quantity: 1, unitPrice: -1 }]), /đơn giá/);
  assert.throws(() => normalizeDocumentLines([{ name: 'A', quantity: 1, unitPrice: 10, discount: 11 }]), /chiết khấu/);
  assert.throws(() => normalizeDocumentLines({}), /danh sách/);
});

test('tổng các dòng phải bằng tiền hàng chưa thuế', () => {
  assert.equal(documentLinesProblem(1_000_000, { amount: 1_100_000, vatAmount: 100_000 }), '');
  assert.match(documentLinesProblem(999_999, { amount: 1_100_000, vatAmount: 100_000 }), /phải bằng tiền hàng chưa thuế 1\.000\.000/);
});
