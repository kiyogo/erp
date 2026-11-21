import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ekycVerificationProblem, isEkycToken, withdrawBiometricData } from '../ekycRules.mjs';

test('kết quả eKYC cần đồng ý sinh trắc học, số định danh 12 chữ số và họ tên', () => {
  const data = { biometricConsent: true, idNumber: '001203004567', name: 'NGUYỄN VĂN A' };
  assert.equal(ekycVerificationProblem(data), '');
  assert.match(ekycVerificationProblem({ ...data, biometricConsent: undefined }), /đồng ý/);
  assert.match(ekycVerificationProblem({ ...data, idNumber: '001095012' }), /12 chữ số/);
  assert.match(ekycVerificationProblem({ ...data, name: ' ' }), /họ tên/);
  assert.equal(isEkycToken('ab'.repeat(32)), true);
  assert.equal(isEkycToken('xyz'), false);
});

test('rút đồng ý xóa ảnh, video, điểm so khớp và giữ số giấy tờ', () => {
  const details = { docNumber: '001203004567', livePhotoUrl: 'data:image/jpeg;base64,AAA', liveVideoUrl: 'data:video/webm;base64,BBB', cardFrontUrl: 'data:image/jpeg;base64,CCC', avatarUrl: 'data:image/jpeg;base64,AAA', faceMatchScore: 91, ekycVerified: true, biometricConsent: true };
  const { details: cleaned, removed } = withdrawBiometricData(details, { at: '2026-11-21T00:00:00Z', by: 'Nhân viên' });
  assert.equal(removed.length, 4);
  assert.equal(cleaned.docNumber, '001203004567');
  for (const field of ['livePhotoUrl', 'liveVideoUrl', 'cardFrontUrl', 'avatarUrl', 'faceMatchScore']) assert.equal(cleaned[field], undefined);
  assert.equal(cleaned.ekycVerified, false);
  assert.equal(cleaned.biometricConsent, false);
  assert.equal(cleaned.biometricConsentWithdrawnAt, '2026-11-21T00:00:00Z');
});
