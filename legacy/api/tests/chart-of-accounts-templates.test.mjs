import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chartAccountType, chartOfAccountsTemplates, getChartOfAccountsTemplate } from '../chartOfAccountsTemplates.mjs';

test('TT99 template matches the published account catalog and forms a complete parent tree', () => {
  const template = getChartOfAccountsTemplate('TT99');
  assert.equal(template.name, 'Thông tư 99/2025/TT-BTC');
  assert.equal(template.effectiveDate, '2026-01-01');
  assert.equal(template.accounts.length, 184);

  const accounts = new Map(template.accounts.map((account) => [account.code, account]));
  assert.equal(accounts.size, template.accounts.length);
  assert.deepEqual(accounts.get('111'), { code: '111', name: 'Tiền mặt', parentCode: '' });
  assert.deepEqual(accounts.get('82112'), {
    code: '82112',
    name: 'Chi phí thuế thu nhập doanh nghiệp bổ sung theo quy định về thuế tối thiểu toàn cầu',
    parentCode: '8211',
  });
  assert.equal(accounts.get('911').name, 'Xác định kết quả kinh doanh');

  for (const account of template.accounts) {
    assert.match(account.code, /^\d{3,6}$/);
    assert.ok(account.name.trim());
    if (account.parentCode) {
      assert.ok(accounts.has(account.parentCode), `${account.code} must have parent ${account.parentCode}`);
      assert.ok(account.code.startsWith(account.parentCode));
    }
    assert.equal(chartAccountType(account.code), {
      '1': 'Tài sản', '2': 'Tài sản', '3': 'Nợ phải trả', '4': 'Vốn chủ sở hữu',
      '5': 'Doanh thu', '6': 'Chi phí', '7': 'Thu nhập khác', '8': 'Chi phí khác', '9': 'Xác định kết quả',
    }[account.code[0]]);
  }
  assert.equal(getChartOfAccountsTemplate('TT58'), null);
  assert.deepEqual(Object.keys(chartOfAccountsTemplates), ['TT99', 'TT133', 'TT132']);
});

test('TT133 template matches the published SME account catalog and forms a complete parent tree', () => {
  const template = getChartOfAccountsTemplate('TT133');
  assert.equal(template.name, 'Thông tư 133/2016/TT-BTC');
  assert.equal(template.effectiveDate, '2017-01-01');
  assert.equal(template.accounts.length, 123);

  const accounts = new Map(template.accounts.map((account) => [account.code, account]));
  assert.equal(accounts.size, template.accounts.length);
  assert.deepEqual(accounts.get('1121'), { code: '1121', name: 'Tiền Việt Nam', parentCode: '112' });
  assert.deepEqual(accounts.get('3386'), { code: '3386', name: 'Nhận ký quỹ, ký cược', parentCode: '338' });
  assert.equal(accounts.get('911').name, 'Xác định kết quả kinh doanh');

  for (const account of template.accounts) {
    assert.match(account.code, /^\d{3,6}$/);
    assert.ok(account.name.trim());
    if (account.parentCode) {
      assert.ok(accounts.has(account.parentCode), `${account.code} must have parent ${account.parentCode}`);
      assert.ok(account.code.startsWith(account.parentCode));
    }
    assert.equal(chartAccountType(account.code), {
      '1': 'Tài sản', '2': 'Tài sản', '3': 'Nợ phải trả', '4': 'Vốn chủ sở hữu',
      '5': 'Doanh thu', '6': 'Chi phí', '7': 'Thu nhập khác', '8': 'Chi phí khác', '9': 'Xác định kết quả',
    }[account.code[0]]);
  }
  assert.equal(getChartOfAccountsTemplate('TT58'), null);
  assert.deepEqual(Object.keys(chartOfAccountsTemplates), ['TT99', 'TT133', 'TT132']);
});

test('TT132 template matches the published micro-enterprise catalog and forms a complete parent tree', () => {
  const template = getChartOfAccountsTemplate('TT132');
  assert.equal(template.name, 'Thông tư 132/2018/TT-BTC');
  assert.equal(template.effectiveDate, '2019-04-01');
  assert.equal(template.accounts.length, 30);

  const accounts = new Map(template.accounts.map((account) => [account.code, account]));
  assert.equal(accounts.size, template.accounts.length);
  assert.deepEqual(accounts.get('1112'), { code: '1112', name: 'Tiền gửi ngân hàng', parentCode: '111' });
  assert.deepEqual(accounts.get('33134'), { code: '33134', name: 'Thuế thu nhập doanh nghiệp', parentCode: '3313' });
  assert.deepEqual(accounts.get('91122'), { code: '91122', name: 'Chi phí khác', parentCode: '9112' });
  for (const account of template.accounts) {
    assert.match(account.code, /^\d{3,6}$/);
    assert.ok(account.name.trim());
    if (account.parentCode) {
      assert.ok(accounts.has(account.parentCode), `${account.code} must have parent ${account.parentCode}`);
      assert.ok(account.code.startsWith(account.parentCode));
    }
    assert.equal(chartAccountType(account.code), {
      '1': 'Tài sản', '2': 'Tài sản', '3': 'Nợ phải trả', '4': 'Vốn chủ sở hữu',
      '5': 'Doanh thu', '6': 'Chi phí', '7': 'Thu nhập khác', '8': 'Chi phí khác', '9': 'Xác định kết quả',
    }[account.code[0]]);
  }
  assert.deepEqual(Object.keys(chartOfAccountsTemplates), ['TT99', 'TT133', 'TT132']);
});
