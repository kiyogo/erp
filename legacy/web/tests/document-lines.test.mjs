import assert from 'node:assert/strict';
import test from 'node:test';
import { lineAmount as apiLineAmount, normalizeDocumentLines } from '../../api/documentLineRules.mjs';
import { lineAmount, linesDraftProblem, linesNet, linesPayload } from '../src/modules/finance/documentLines.ts';

const draft = (patch) => ({ id: 'x', name: 'Thép', unit: 'kg', quantity: '2.125', unitPrice: '15333.5', discount: '1', ...patch });

test('thành tiền dòng ở web khớp máy chủ', () => {
  for (const line of [draft({}), draft({ quantity: '3', unitPrice: '0.5', discount: '' }), draft({ quantity: '7', unitPrice: '99999.99', discount: '5' })]) {
    const [payload] = linesPayload([line]);
    assert.equal(lineAmount(line), apiLineAmount(payload));
    assert.equal(lineAmount(line), normalizeDocumentLines([payload]).lines[0].amount);
  }
  assert.equal(linesNet([draft({}), draft({ quantity: '1', unitPrice: '100', discount: '' })]), 32_683);
});

test('dữ liệu gửi và lỗi nhập ở trình duyệt', () => {
  assert.deepEqual(linesPayload([draft({ itemKey: 'i1', discount: '' })]), [{ itemKey: 'i1', name: 'Thép', unit: 'kg', quantity: 2.125, unitPrice: 15333.5 }]);
  assert.equal(linesDraftProblem([draft({})]), '');
  assert.match(linesDraftProblem([draft({ name: ' ' })]), /Dòng 1: nhập tên/);
  assert.match(linesDraftProblem([draft({}), draft({ quantity: '0' })]), /Dòng 2: số lượng/);
  assert.match(linesDraftProblem([draft({ unitPrice: '' })]), /đơn giá/);
  assert.match(linesDraftProblem([draft({ discount: '999999' })]), /chiết khấu/);
});
