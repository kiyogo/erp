import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addYears, normalizeCertificateLegal } from '../digitalSignatureRules.mjs';

const ctx = { today: '2026-11-20', companyTaxCode: '0100109106' };
const base = { validFrom: '2026-01-01', validTo: '2028-12-31', subjectTaxCode: '0100109106' };

test('cộng năm giữ ngày, 29/02 sang 28/02 khi không nhuận', () => {
  assert.equal(addYears('2026-01-01', 3), '2029-01-01');
  assert.equal(addYears('2024-02-29', 1), '2025-02-28');
  assert.equal(addYears('2024-02-29', 4), '2028-02-29');
});

test('chữ ký số công cộng tối đa 3 năm, chuyên dùng 10 năm', () => {
  assert.equal(normalizeCertificateLegal(base, null, ctx).fields.certKind, 'public');
  assert.equal(normalizeCertificateLegal({ ...base, validTo: '2029-01-01' }, null, ctx).fields.certKind, 'public', 'đúng 3 năm');
  assert.throws(() => normalizeCertificateLegal({ ...base, validTo: '2029-01-02' }, null, ctx), /tối đa 3 năm/);
  assert.doesNotThrow(() => normalizeCertificateLegal({ ...base, certKind: 'dedicated', validTo: '2036-01-01' }, null, ctx));
  assert.throws(() => normalizeCertificateLegal({ ...base, certKind: 'dedicated', validTo: '2036-01-02' }, null, ctx), /tối đa 10 năm/);
  assert.throws(() => normalizeCertificateLegal({ ...base, certKind: 'x' }, null, ctx), /Loại chữ ký/);
  const stored = { ...base, validTo: '2031-01-01', certKind: 'public' };
  assert.doesNotThrow(() => normalizeCertificateLegal({ ...stored, authorizedSigner: 'A' }, stored, ctx), 'bản ghi cũ không bị chặn khi không đổi thời hạn');
});

test('mã số thuế chủ thể: hợp lệ và khớp doanh nghiệp, nếu không thì cảnh báo', () => {
  assert.deepEqual(normalizeCertificateLegal(base, null, ctx).warnings, []);
  assert.throws(() => normalizeCertificateLegal({ ...base, subjectTaxCode: '0100109107' }, null, ctx), /không hợp lệ/);
  assert.match(normalizeCertificateLegal({ ...base, subjectTaxCode: '0101601092' }, null, ctx).warnings[0], /khác mã số thuế/);
  assert.match(normalizeCertificateLegal({ ...base, subjectTaxCode: '' }, null, ctx).warnings[0], /Chưa ghi mã số thuế/);
});

test('người ký được ủy quyền cần giấy ủy quyền hợp lệ', () => {
  assert.throws(() => normalizeCertificateLegal({ ...base, signerRole: 'authorized' }, null, ctx), /giấy ủy quyền/);
  assert.throws(() => normalizeCertificateLegal({ ...base, signerRole: 'authorized', authorizationNo: 'UQ-1', authorizationDate: '2027-01-01' }, null, ctx), /tương lai/);
  const ok = normalizeCertificateLegal({ ...base, signerRole: 'authorized', authorizationNo: 'UQ-1', authorizationDate: '2026-02-01' }, null, ctx);
  assert.deepEqual([ok.fields.signerRole, ok.fields.authorizationNo], ['authorized', 'UQ-1']);
  assert.equal(normalizeCertificateLegal({ ...base, authorizationNo: 'UQ-9' }, null, ctx).fields.authorizationNo, '', 'người đại diện pháp luật không cần ủy quyền');
});

test('thu hồi: cần ngày và lý do, không khôi phục, không gia hạn, không sửa', () => {
  const revoke = { ...base, lifecycle: 'revoked', revokedAt: '2026-06-01', revokeReason: 'Mất token' };
  const revoked = normalizeCertificateLegal(revoke, null, ctx).fields;
  assert.equal(revoked.revokedAt, '2026-06-01');
  assert.throws(() => normalizeCertificateLegal({ ...base, lifecycle: 'revoked', revokedAt: '2026-06-01' }, null, ctx), /lý do/);
  assert.throws(() => normalizeCertificateLegal({ ...revoke, revokedAt: '2025-12-31' }, null, ctx), /Ngày thu hồi/);
  assert.throws(() => normalizeCertificateLegal({ ...revoke, revokedAt: '2027-01-01' }, null, ctx), /Ngày thu hồi/);
  const stored = { ...base, ...revoked };
  assert.throws(() => normalizeCertificateLegal({ ...stored, lifecycle: 'active' }, stored, ctx), /không khôi phục/);
  assert.throws(() => normalizeCertificateLegal({ ...stored, validTo: '2029-01-01' }, stored, ctx), /không gia hạn/);
  assert.throws(() => normalizeCertificateLegal({ ...stored, revokeReason: 'Khác' }, stored, ctx), /Không sửa/);
  assert.equal(normalizeCertificateLegal({ ...stored }, stored, ctx).fields.lifecycle, 'revoked');
  assert.equal(normalizeCertificateLegal({ ...base, lifecycle: 'suspended' }, { ...base, lifecycle: 'active' }, ctx).fields.lifecycle, 'suspended');
});
