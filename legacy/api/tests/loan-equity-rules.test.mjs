import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loanRateProblem, loanWarnings, shareholderProblem } from '../loanEquityRules.mjs';

test('trần lãi suất 20%/năm khi bên cho vay không phải tổ chức tín dụng, lãi quá hạn tối đa 150%', () => {
  assert.equal(loanRateProblem([{ rate: 25, overdueRate: null }], 'credit_institution'), '');
  assert.match(loanRateProblem([{ rate: 25, overdueRate: null }], 'individual'), /20%\/năm/);
  assert.equal(loanRateProblem([{ rate: 20, overdueRate: 30 }], 'enterprise'), '');
  assert.match(loanRateProblem([{ rate: 10, overdueRate: 16 }], 'credit_institution'), /150%/);
  assert.equal(loanRateProblem([{ rate: null, overdueRate: 30 }], 'enterprise'), '');
});

test('cảnh báo tiền mặt giữa doanh nghiệp, thuế TNCN lãi trả cá nhân và chi phí lãi vượt mức', () => {
  const base = { direction: 'borrow', rates: [{ rate: 10, overdueRate: null }], disbursementMethod: 'Chuyển khoản', repaymentMethod: 'Chuyển khoản' };
  assert.deepEqual(loanWarnings({ ...base, counterpartyType: 'credit_institution' }), []);
  assert.match(loanWarnings({ ...base, counterpartyType: 'enterprise', disbursementMethod: 'Tiền mặt' })[0], /tiền mặt/);
  assert.match(loanWarnings({ ...base, counterpartyType: 'individual' })[0], /5%/);
  assert.ok(loanWarnings({ ...base, counterpartyType: 'enterprise', rates: [{ rate: 15, overdueRate: null }] }).some((warning) => /13.5%/.test(warning)));
  assert.deepEqual(loanWarnings({ ...base, direction: 'lend', counterpartyType: 'individual' }), []);
});

test('sổ cổ đông: giấy tờ theo cá nhân hay tổ chức, ưu đãi biểu quyết, vốn đã góp', () => {
  const row = { shareClass: 'ordinary', holderKind: 'individual', nationality: 'Việt Nam', idNumber: '001099000777', type: 'Cổ đông phổ thông', capitalValue: 1_000_000 };
  assert.equal(shareholderProblem(row), '');
  assert.match(shareholderProblem({ ...row, shareClass: 'voting_preference' }), /Điều 116/);
  assert.equal(shareholderProblem({ ...row, shareClass: 'voting_preference', holderKind: 'organization', idNumber: 'X', governmentAuthorized: true }), '');
  assert.match(shareholderProblem({ ...row, paidValue: 2_000_000 }), /vốn đã góp/);
  assert.match(shareholderProblem({ ...row, nationality: 'Hàn Quốc', idNumber: '12' }), /hộ chiếu/);
});
