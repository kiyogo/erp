import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ekycVerificationProblem, isEkycToken } from '../ekycRules.mjs';

test('kết quả eKYC cần đồng ý sinh trắc học, số định danh 12 chữ số và họ tên', () => {
  const data = { biometricConsent: true, idNumber: '001203004567', name: 'NGUYỄN VĂN A' };
  assert.equal(ekycVerificationProblem(data), '');
  assert.match(ekycVerificationProblem({ ...data, biometricConsent: undefined }), /đồng ý/);
  assert.match(ekycVerificationProblem({ ...data, idNumber: '001095012' }), /12 chữ số/);
  assert.match(ekycVerificationProblem({ ...data, name: ' ' }), /họ tên/);
  assert.equal(isEkycToken('ab'.repeat(32)), true);
  assert.equal(isEkycToken('xyz'), false);
});
