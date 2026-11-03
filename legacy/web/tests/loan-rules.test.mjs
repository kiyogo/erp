import test from 'node:test';
import assert from 'node:assert/strict';
import { loanAccountsFor } from '../src/modules/finance/loanRules.ts';

test('loan account choices use active leaf accounts from the company accounting regime and expected account group', () => {
  const accounts = [
    { code: '341', name: 'Vay', accountingRegime: 'TT99', status: 'Đang sử dụng', accountType: 'Nợ phải trả' },
    { code: '3411', name: 'Vay ngắn hạn', parentCode: '341', accountingRegime: 'TT99', status: 'Đang sử dụng', accountType: 'Nợ phải trả' },
    { code: '331', name: 'Nhà cung cấp', accountingRegime: 'TT99', status: 'Ngừng sử dụng', accountType: 'Nợ phải trả' },
    { code: '3411', name: 'Tài khoản chế độ khác', accountingRegime: 'TT133', status: 'Đang sử dụng', accountType: 'Nợ phải trả' },
    { code: '635', name: 'Chi phí tài chính', accountingRegime: 'TT99', status: 'Đang sử dụng', accountType: 'Chi phí' },
  ];

  assert.deepEqual(loanAccountsFor(accounts, 'TT99', 'Nợ phải trả').map(account => account.code), ['3411']);
  assert.deepEqual(loanAccountsFor(accounts, 'TT99', 'Chi phí').map(account => account.code), ['635']);
  assert.deepEqual(loanAccountsFor(accounts, 'TT133', 'Nợ phải trả').map(account => account.code), ['3411']);
});
