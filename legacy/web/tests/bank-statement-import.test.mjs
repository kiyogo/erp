import test from 'node:test';
import assert from 'node:assert/strict';
import { bankStatementLineFingerprint, parseBankStatementRows } from '../src/modules/finance/bankStatementImport.ts';

test('parses Vietnamese bank statement columns and detects signed outflows', () => {
  const lines = parseBankStatementRows([
    ['Ngày giao dịch', 'Số tiền', 'Số dư', 'Nội dung', 'Mã tham chiếu'],
    ['03/11/2026', '-1.250.000', '8.750.000', 'Thanh toán nhà cung cấp', 'REF-1'],
  ]);

  assert.equal(lines.length, 1);
  assert.equal(lines[0].transactionDate, '2026-11-03');
  assert.equal(lines[0].direction, 'Chi');
  assert.equal(lines[0].amount, 1250000);
  assert.equal(lines[0].balance, 8750000);
  assert.equal(lines[0].reference, 'REF-1');
});

test('parses split debit and credit columns and rejects invalid rows', () => {
  const lines = parseBankStatementRows([
    ['Date', 'Debit', 'Credit', 'Description'],
    ['2026-11-01', '250,000', '', 'Supplier payment'],
    ['2026-11-02', '', '1,500,000', 'Customer receipt'],
  ]);

  assert.deepEqual(lines.map(({ direction, amount }) => [direction, amount]), [['Chi', 250000], ['Thu', 1500000]]);
  assert.throws(() => parseBankStatementRows([
    ['Date', 'Amount'],
    ['invalid-date', '1200'],
  ]), /ngày giao dịch hoặc số tiền không hợp lệ/);
});

test('fingerprints normalize description spacing and case', () => {
  const [first] = parseBankStatementRows([
    ['Date', 'Amount', 'Description', 'Reference'],
    ['2026-11-03', '12.50', '  Transfer   ABC ', 'REF'],
  ]);
  const [second] = parseBankStatementRows([
    ['Date', 'Amount', 'Description', 'Reference'],
    ['2026-11-03', '12.50', 'transfer abc', 'ref'],
  ]);

  assert.equal(bankStatementLineFingerprint(first), bankStatementLineFingerprint(second));
});
