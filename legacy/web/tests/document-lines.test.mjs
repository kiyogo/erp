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

test('dòng trả lại ở web khớp máy chủ', async () => {
  const api = await import('../../api/documentLineRules.mjs');
  const web = await import('../src/modules/finance/documentLines.ts');
  const original = { quantity: 7, unitPrice: 33_333.33, discount: 10_001 };
  for (const quantity of [1, 2.5, 3.333, 7]) assert.equal(web.returnLineAmount(original, quantity), api.returnLineAmount(original, quantity));
  const lists = [[{ originalLine: 0, quantity: 1.1 }, { originalLine: 1, quantity: 2 }], undefined, [{ originalLine: 0, quantity: 2.2 }, { name: 'tự do', quantity: 9 }]];
  assert.deepEqual([...web.returnedQuantities(lists)], [...api.returnedQuantities(lists)]);
  assert.equal(web.returnedQuantities(lists).get(0), 3.3);
});
