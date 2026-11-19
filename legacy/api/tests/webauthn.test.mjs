import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';
import { decodeCbor, toBase64Url, verifyAssertion, verifyRegistration, WebAuthnError } from '../webauthn.mjs';
import { assertionCredential as makeAssertion, createAuthenticator, encodeCbor, registrationCredential as makeRegistration } from './helpers/software-authenticator.mjs';

const rpId = 'localhost';
const origin = 'http://localhost:3012';
const allowedOrigins = [origin];
const challenge = toBase64Url(randomBytes(32));
const coseFor = createAuthenticator;
const registrationCredential = (authenticator, options = {}) => makeRegistration(authenticator, { challenge, origin, rpId, ...options });
const assertionCredential = (authenticator, credentialId, options = {}) => makeAssertion(authenticator, credentialId, { challenge, origin, rpId, ...options });

const registerFlow = (authenticator, options) => {
  const { credential, credentialId } = registrationCredential(authenticator, options);
  return { credentialId, stored: verifyRegistration({ credential, expectedChallenge: challenge, allowedOrigins, rpId }) };
};
const rejects = (action, pattern) => assert.throws(action, (error) => error instanceof WebAuthnError && pattern.test(error.message), String(pattern));

test('đăng ký khóa hợp lệ: lấy đúng mã khóa, thuật toán, khóa công khai và cờ xác minh người dùng', () => {
  const authenticator = coseFor('ES256');
  const { credentialId, stored } = registerFlow(authenticator);
  assert.equal(stored.credentialId, toBase64Url(credentialId));
  assert.equal(stored.algorithm, -7);
  assert.equal(stored.jwk.kty, 'EC');
  assert.equal(stored.signCount, 0);
  assert.equal(stored.userVerified, true);
});

test('đăng ký bị từ chối khi thử thách, nguồn gốc, tên miền, hiện diện, mã khóa hoặc thuật toán sai', () => {
  const authenticator = coseFor('ES256');
  const ok = () => registrationCredential(authenticator);
  const verify = (credential, extra = {}) => verifyRegistration({ credential, expectedChallenge: challenge, allowedOrigins, rpId, ...extra });
  rejects(() => verify(ok().credential, { expectedChallenge: toBase64Url(randomBytes(32)) }), /thử thách/);
  rejects(() => verify(registrationCredential(authenticator, { clientOverrides: { origin: 'https://evil.example' } }).credential), /Nguồn gốc/);
  rejects(() => verify(registrationCredential(authenticator, { clientOverrides: { crossOrigin: true } }).credential), /khác nguồn/);
  rejects(() => verify(registrationCredential(authenticator, { type: 'webauthn.get' }).credential), /Loại thao tác/);
  rejects(() => verify(registrationCredential(authenticator, { rpId: 'other.example' }).credential), /tên miền khác/);
  rejects(() => verify(registrationCredential(authenticator, { flags: 0x44 }).credential), /hiện diện/);
  rejects(() => verify(registrationCredential(authenticator, { flags: 0x05 }).credential), /khóa công khai/);
  rejects(() => verify(registrationCredential(authenticator, { idInResponse: randomBytes(32) }).credential), /Mã khóa không khớp/);
  const unsupported = { cose: new Map([[1, 2], [3, -36], [-1, 2], [-2, randomBytes(66)], [-3, randomBytes(66)]]) };
  rejects(() => verify(registrationCredential(unsupported).credential), /Thuật toán/);
  const garbage = ok().credential;
  garbage.response.attestationObject = toBase64Url(Buffer.from([0xa3, 0x63]));
  rejects(() => verify(garbage), /CBOR|attestationObject/);
});

test('xác thực hợp lệ bằng ES256, RS256 và EdDSA, bộ đếm chữ ký tăng dần', () => {
  for (const kind of ['ES256', 'RS256', 'EdDSA']) {
    const authenticator = coseFor(kind);
    const { credentialId, stored } = registerFlow(authenticator);
    const result = verifyAssertion({
      credential: assertionCredential(authenticator, credentialId, { signCount: 5 }), expectedChallenge: challenge, allowedOrigins, rpId,
      jwk: stored.jwk, algorithm: stored.algorithm, signCount: stored.signCount, requireUserVerification: true,
    });
    assert.equal(result.signCount, 5, kind);
    assert.equal(result.userVerified, true, kind);
  }
});

test('xác thực bị từ chối khi chữ ký bị sửa, khóa khác, thử thách, nguồn gốc, tên miền, xác minh hoặc bộ đếm sai', () => {
  const authenticator = coseFor('ES256');
  const { credentialId, stored } = registerFlow(authenticator);
  const verify = (credential, extra = {}) => verifyAssertion({ credential, expectedChallenge: challenge, allowedOrigins, rpId, jwk: stored.jwk, algorithm: stored.algorithm, signCount: 3, requireUserVerification: false, ...extra });
  assert.equal(verify(assertionCredential(authenticator, credentialId, { signCount: 4 })).signCount, 4);
  rejects(() => verify(assertionCredential(authenticator, credentialId, { signCount: 4, tamper: true })), /Chữ ký/);
  rejects(() => verify(assertionCredential(coseFor('ES256'), credentialId, { signCount: 4 })), /Chữ ký/);
  rejects(() => verify(assertionCredential(authenticator, credentialId, { signCount: 4 }), { expectedChallenge: toBase64Url(randomBytes(32)) }), /thử thách/);
  rejects(() => verify(assertionCredential(authenticator, credentialId, { signCount: 4, clientOverrides: { origin: 'http://localhost:9999' } })), /Nguồn gốc/);
  rejects(() => verify(assertionCredential(authenticator, credentialId, { signCount: 4, rpId: 'other.example' })), /tên miền khác/);
  rejects(() => verify(assertionCredential(authenticator, credentialId, { signCount: 4, flags: 0x00 })), /hiện diện/);
  rejects(() => verify(assertionCredential(authenticator, credentialId, { signCount: 4, flags: 0x01 }), { requireUserVerification: true }), /xác minh người dùng/);
  rejects(() => verify(assertionCredential(authenticator, credentialId, { signCount: 3 })), /Bộ đếm/);
  rejects(() => verify(assertionCredential(authenticator, credentialId, { signCount: 2 })), /Bộ đếm/);
  // Thiết bị không dùng bộ đếm (luôn bằng 0) vẫn được chấp nhận.
  assert.equal(verify(assertionCredential(authenticator, credentialId, { signCount: 0 }), { signCount: 0 }).signCount, 0);
});

test('bộ giải mã CBOR từ chối dữ liệu cắt cụt, độ dài không xác định và dữ liệu thừa', () => {
  assert.deepEqual([...decodeCbor(encodeCbor(new Map([['a', 1], ['b', -5]]))).entries()], [['a', 1], ['b', -5]]);
  assert.throws(() => decodeCbor(Buffer.from([0x58, 0x20, 1, 2])), WebAuthnError);
  assert.throws(() => decodeCbor(Buffer.from([0x5f, 0x41, 1, 0xff])), WebAuthnError);
  assert.throws(() => decodeCbor(Buffer.concat([encodeCbor(1), Buffer.from([0])])), WebAuthnError);
});
