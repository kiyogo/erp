import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getTT58RequiredBooks, tt58OptionalBooks } from './tt58AccountingBooks.ts';

test('TT58 required books follow the VAT and corporate income tax methods', () => {
  assert.deepEqual(getTT58RequiredBooks('direct_revenue', 'revenue_percentage')?.map(book => book.code), ['S1-DNSN']);
  assert.deepEqual(getTT58RequiredBooks('direct_revenue', 'taxable_income')?.map(book => book.code), ['S2a-DNSN', 'S2b-DNSN', 'S2c-DNSN', 'S2d-DNSN']);
  assert.deepEqual(getTT58RequiredBooks('deduction', 'revenue_percentage')?.map(book => book.code), ['S3a-DNSN', 'S3b-DNSN']);
  assert.deepEqual(getTT58RequiredBooks('deduction', 'taxable_income')?.map(book => book.code), ['S2b-DNSN', 'S2c-DNSN', 'S2d-DNSN', 'S3b-DNSN']);
  assert.equal(getTT58RequiredBooks('direct_added_value', 'taxable_income'), null);
  assert.deepEqual(tt58OptionalBooks.map(book => book.code), ['S4a-DNSN', 'S4b-DNSN', 'S4c-DNSN', 'S4d-DNSN']);
});
