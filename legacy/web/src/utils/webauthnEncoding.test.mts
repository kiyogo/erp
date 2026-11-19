import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PasskeyCancelled, base64UrlToBuffer, bufferToBase64Url, creationOptionsFromJson, explainPasskeyError,
  requestOptionsFromJson, serializeAssertion, serializeAttestation,
} from './webauthnEncoding.ts';

const bytes = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)];

test('base64url đổi qua lại đúng với mọi độ dài và chỉ dùng ký tự an toàn cho URL', () => {
  for (let length = 0; length <= 70; length++) {
    const original = Uint8Array.from({ length }, (_, index) => (index * 37 + length) % 256);
    const encoded = bufferToBase64Url(original.buffer);
    assert.match(encoded, /^[A-Za-z0-9_-]*$/);
    assert.deepEqual(bytes(base64UrlToBuffer(encoded)), [...original]);
  }
  assert.equal(bufferToBase64Url(Uint8Array.from([0xfb, 0xff, 0xfe]).buffer), '-__-');
});

test('tùy chọn của máy chủ được đổi sang bộ đệm mà trình duyệt cần', () => {
  const creation = creationOptionsFromJson({
    challenge: 'AQID', rp: { id: 'localhost', name: 'KIYOVN' }, user: { id: 'BAUG', name: 'a@b.c', displayName: 'A' },
    excludeCredentials: [{ type: 'public-key', id: 'BwgJ', transports: ['internal'] }], timeout: 60000,
  });
  assert.deepEqual(bytes(creation.challenge as ArrayBuffer), [1, 2, 3]);
  assert.deepEqual(bytes(creation.user.id as ArrayBuffer), [4, 5, 6]);
  assert.deepEqual(bytes(creation.excludeCredentials![0].id as ArrayBuffer), [7, 8, 9]);
  assert.equal(creation.excludeCredentials![0].transports?.[0], 'internal');
  assert.equal(creation.timeout, 60000);

  const request = requestOptionsFromJson({ challenge: 'AQID', rpId: 'localhost', allowCredentials: [], userVerification: 'required' });
  assert.deepEqual(bytes(request.challenge as ArrayBuffer), [1, 2, 3]);
  assert.deepEqual(request.allowCredentials, []);
  assert.equal(request.userVerification, 'required');
  assert.deepEqual(requestOptionsFromJson({ challenge: 'AQID' }).allowCredentials, []);
});

test('thông tin gửi lên máy chủ mang đủ dữ liệu và bỏ userHandle khi không có', () => {
  const buffer = (...values: number[]) => Uint8Array.from(values).buffer;
  const assertion = serializeAssertion({
    id: 'abc', rawId: buffer(1, 2), type: 'public-key',
    response: { clientDataJSON: buffer(3), authenticatorData: buffer(4), signature: buffer(5), userHandle: null },
  } as unknown as PublicKeyCredential);
  assert.deepEqual(assertion, { id: 'abc', rawId: 'AQI', type: 'public-key', response: { clientDataJSON: 'Aw', authenticatorData: 'BA', signature: 'BQ', userHandle: undefined } });
  const withHandle = serializeAssertion({ id: 'abc', rawId: buffer(1), type: 'public-key', response: { clientDataJSON: buffer(3), authenticatorData: buffer(4), signature: buffer(5), userHandle: buffer(9, 9) } } as unknown as PublicKeyCredential);
  assert.equal(withHandle.response.userHandle, 'CQk');

  const attestation = serializeAttestation({
    id: 'abc', rawId: buffer(1), type: 'public-key',
    response: { clientDataJSON: buffer(3), attestationObject: buffer(6), getTransports: () => ['internal', 'hybrid'] },
  } as unknown as PublicKeyCredential);
  assert.deepEqual(attestation.response.transports, ['internal', 'hybrid']);
  const noTransports = serializeAttestation({ id: 'abc', rawId: buffer(1), type: 'public-key', response: { clientDataJSON: buffer(3), attestationObject: buffer(6) } } as unknown as PublicKeyCredential);
  assert.deepEqual(noTransports.response.transports, []);
});

test('lỗi của trình duyệt và máy chủ được đổi thành thông báo dễ hiểu, hủy bỏ tách riêng', () => {
  assert.ok(explainPasskeyError({ name: 'NotAllowedError' }) instanceof PasskeyCancelled);
  assert.ok(explainPasskeyError({ name: 'AbortError' }) instanceof PasskeyCancelled);
  const cancelled = new PasskeyCancelled('đã hủy');
  assert.equal(explainPasskeyError(cancelled), cancelled);
  assert.match(explainPasskeyError({ name: 'InvalidStateError' }).message, /đã được đăng ký/);
  assert.match(explainPasskeyError({ name: 'SecurityError' }).message, /không được phép/);
  assert.equal(explainPasskeyError({ response: { data: { message: 'Bộ đếm của khóa bị lùi.' } } }).message, 'Bộ đếm của khóa bị lùi.');
  assert.equal(explainPasskeyError({}).message, 'Không thực hiện được thao tác khóa truy cập.');
});
