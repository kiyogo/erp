import assert from 'node:assert/strict';
import { test } from 'node:test';
import { statementPostingProblem, suggestedStatementAccounts } from '../bankStatementRules.mjs';

test('ghi sổ theo sao kê kiểm tra phân loại, chiều giao dịch và tài khoản đối ứng', () => {
  assert.equal(statementPostingProblem({ classification: 'Phí ngân hàng', direction: 'Chi', counterAccount: '6422' }), '');
  assert.match(statementPostingProblem({ classification: 'Phí ngân hàng', direction: 'Thu', counterAccount: '6422' }), /không thể phân loại/);
  assert.match(statementPostingProblem({ classification: 'Lãi tiền gửi', direction: 'Thu', counterAccount: '1121' }), /chuyển tiền nội bộ/);
  assert.match(statementPostingProblem({ classification: '', direction: 'Thu', counterAccount: '515' }), /phân loại/);
  assert.match(statementPostingProblem({ classification: 'Khác', direction: 'Thu', counterAccount: 'abc' }), /dạng số/);
});

test('tài khoản gợi ý: khoản chưa rõ treo 1388 khi tiền ra, 3388 khi tiền vào', () => {
  assert.deepEqual(suggestedStatementAccounts('Khác', 'Chi'), ['1388', '138']);
  assert.deepEqual(suggestedStatementAccounts('Khác', 'Thu'), ['3388', '338']);
  assert.deepEqual(suggestedStatementAccounts('Lãi tiền gửi', 'Thu'), ['515']);
});
