// Xác minh WebAuthn (passkey) ở máy chủ bằng node:crypto, không phụ thuộc thư viện ngoài.
// Phạm vi: đăng ký khóa (attestation "none", không tin cậy bản khai chứng thực) và xác thực bằng chữ ký
// ES256, RS256, EdDSA. Tham chiếu: W3C WebAuthn Level 2, mục 7.1 (đăng ký) và 7.2 (xác thực).
import { createHash, createPublicKey, timingSafeEqual, verify as cryptoVerify } from 'node:crypto';

export class WebAuthnError extends Error {}

export const toBase64Url = (value) => Buffer.from(value).toString('base64url');
export const fromBase64Url = (value) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]*$/.test(value)) throw new WebAuthnError('Dữ liệu base64url không hợp lệ.');
  return Buffer.from(value, 'base64url');
};

const ALGORITHMS = new Set([-7, -257, -8]);
const FLAG_USER_PRESENT = 0x01;
const FLAG_USER_VERIFIED = 0x04;
const FLAG_BACKUP_ELIGIBLE = 0x08;
const FLAG_BACKED_UP = 0x10;
const FLAG_ATTESTED_DATA = 0x40;

// ===== CBOR (RFC 8949), phần cần cho attestationObject và COSE_Key =====
function readCbor(buffer, start, depth) {
  if (depth > 16) throw new WebAuthnError('Cấu trúc CBOR lồng quá sâu.');
  if (start >= buffer.length) throw new WebAuthnError('Dữ liệu CBOR bị cắt cụt.');
  let position = start;
  const initial = buffer[position++];
  const major = initial >> 5;
  const info = initial & 31;
  if (major === 7) {
    if (info === 20) return [false, position];
    if (info === 21) return [true, position];
    if (info === 22) return [null, position];
    throw new WebAuthnError('Giá trị CBOR đơn giản không được hỗ trợ.');
  }
  let argument;
  if (info < 24) argument = info;
  else if (info === 24) { argument = buffer.readUInt8(position); position += 1; }
  else if (info === 25) { argument = buffer.readUInt16BE(position); position += 2; }
  else if (info === 26) { argument = buffer.readUInt32BE(position); position += 4; }
  else if (info === 27) {
    const big = buffer.readBigUInt64BE(position);
    position += 8;
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new WebAuthnError('Số CBOR quá lớn.');
    argument = Number(big);
  } else throw new WebAuthnError('CBOR có độ dài không xác định không được hỗ trợ.');

  if (major === 0) return [argument, position];
  if (major === 1) return [-1 - argument, position];
  if (major === 2 || major === 3) {
    if (position + argument > buffer.length) throw new WebAuthnError('Chuỗi CBOR vượt quá dữ liệu.');
    const slice = buffer.subarray(position, position + argument);
    return [major === 2 ? slice : slice.toString('utf8'), position + argument];
  }
  if (major === 4) {
    if (argument > 1024) throw new WebAuthnError('Mảng CBOR quá lớn.');
    const items = [];
    for (let index = 0; index < argument; index++) {
      const [item, next] = readCbor(buffer, position, depth + 1);
      items.push(item);
      position = next;
    }
    return [items, position];
  }
  if (major === 5) {
    if (argument > 1024) throw new WebAuthnError('Bản đồ CBOR quá lớn.');
    const map = new Map();
    for (let index = 0; index < argument; index++) {
      const [key, afterKey] = readCbor(buffer, position, depth + 1);
      const [value, afterValue] = readCbor(buffer, afterKey, depth + 1);
      map.set(key, value);
      position = afterValue;
    }
    return [map, position];
  }
  throw new WebAuthnError('Kiểu CBOR không được hỗ trợ.');
}

export function decodeCbor(buffer) {
  const [value, end] = readCbor(buffer, 0, 0);
  if (end !== buffer.length) throw new WebAuthnError('CBOR có dữ liệu thừa phía sau.');
  return value;
}

// ===== Authenticator data =====
export function parseAuthenticatorData(authData) {
  if (!Buffer.isBuffer(authData) || authData.length < 37) throw new WebAuthnError('Dữ liệu authenticator quá ngắn.');
  const flags = authData[32];
  const parsed = {
    rpIdHash: authData.subarray(0, 32),
    flags,
    userPresent: Boolean(flags & FLAG_USER_PRESENT),
    userVerified: Boolean(flags & FLAG_USER_VERIFIED),
    backupEligible: Boolean(flags & FLAG_BACKUP_ELIGIBLE),
    backedUp: Boolean(flags & FLAG_BACKED_UP),
    signCount: authData.readUInt32BE(33),
    attested: null,
  };
  if (flags & FLAG_ATTESTED_DATA) {
    let position = 37;
    if (authData.length < position + 18) throw new WebAuthnError('Dữ liệu khóa đính kèm bị cắt cụt.');
    const aaguid = authData.subarray(position, position + 16).toString('hex');
    position += 16;
    const credentialIdLength = authData.readUInt16BE(position);
    position += 2;
    if (credentialIdLength < 1 || credentialIdLength > 1023 || authData.length < position + credentialIdLength) throw new WebAuthnError('Mã khóa không hợp lệ.');
    const credentialId = authData.subarray(position, position + credentialIdLength);
    position += credentialIdLength;
    const [coseKey] = readCbor(authData, position, 0);
    if (!(coseKey instanceof Map)) throw new WebAuthnError('Khóa công khai không đúng định dạng COSE.');
    parsed.attested = { aaguid, credentialId, coseKey };
  }
  return parsed;
}

// ===== COSE_Key sang JWK =====
export function coseKeyToJwk(coseKey) {
  const keyType = coseKey.get(1);
  const algorithm = coseKey.get(3);
  if (!ALGORITHMS.has(algorithm)) throw new WebAuthnError('Thuật toán khóa không được hỗ trợ.');
  let jwk;
  if (keyType === 2 && algorithm === -7) {
    const x = coseKey.get(-2);
    const y = coseKey.get(-3);
    if (coseKey.get(-1) !== 1 || !Buffer.isBuffer(x) || !Buffer.isBuffer(y) || x.length !== 32 || y.length !== 32) throw new WebAuthnError('Khóa ES256 không hợp lệ.');
    jwk = { kty: 'EC', crv: 'P-256', x: toBase64Url(x), y: toBase64Url(y) };
  } else if (keyType === 3 && algorithm === -257) {
    const n = coseKey.get(-1);
    const e = coseKey.get(-2);
    if (!Buffer.isBuffer(n) || !Buffer.isBuffer(e) || n.length < 256) throw new WebAuthnError('Khóa RS256 không hợp lệ hoặc ngắn hơn 2048 bit.');
    jwk = { kty: 'RSA', n: toBase64Url(n), e: toBase64Url(e) };
  } else if (keyType === 1 && algorithm === -8) {
    const x = coseKey.get(-2);
    if (coseKey.get(-1) !== 6 || !Buffer.isBuffer(x) || x.length !== 32) throw new WebAuthnError('Khóa EdDSA không hợp lệ.');
    jwk = { kty: 'OKP', crv: 'Ed25519', x: toBase64Url(x) };
  } else throw new WebAuthnError('Loại khóa không khớp với thuật toán.');
  try { createPublicKey({ key: jwk, format: 'jwk' }); } catch { throw new WebAuthnError('Khóa công khai không hợp lệ.'); }
  return { jwk, algorithm };
}

const sha256 = (value) => createHash('sha256').update(value).digest();
const sameBytes = (left, right) => left.length === right.length && timingSafeEqual(left, right);

function checkClientData(encoded, expectedType, expectedChallenge, allowedOrigins) {
  const raw = fromBase64Url(encoded);
  let data;
  try { data = JSON.parse(raw.toString('utf8')); } catch { throw new WebAuthnError('clientDataJSON không hợp lệ.'); }
  if (!data || data.type !== expectedType) throw new WebAuthnError('Loại thao tác WebAuthn không đúng.');
  if (typeof data.challenge !== 'string' || !sameBytes(Buffer.from(data.challenge), Buffer.from(expectedChallenge))) throw new WebAuthnError('Mã thử thách không khớp hoặc đã hết hạn.');
  if (!allowedOrigins.includes(data.origin)) throw new WebAuthnError('Nguồn gốc của trang không được phép dùng khóa truy cập.');
  if (data.crossOrigin === true) throw new WebAuthnError('Không chấp nhận yêu cầu từ khung nhúng khác nguồn.');
  return raw;
}

/** Xác minh một lần đăng ký khóa mới. Trả về dữ liệu cần lưu; ném WebAuthnError nếu có điểm nào không hợp lệ. */
export function verifyRegistration({ credential, expectedChallenge, allowedOrigins, rpId }) {
  if (!credential || credential.type !== 'public-key' || !credential.response) throw new WebAuthnError('Thông tin khóa không hợp lệ.');
  checkClientData(credential.response.clientDataJSON, 'webauthn.create', expectedChallenge, allowedOrigins);
  let attestation;
  try { attestation = decodeCbor(fromBase64Url(credential.response.attestationObject)); } catch (error) {
    throw error instanceof WebAuthnError ? error : new WebAuthnError('attestationObject không hợp lệ.');
  }
  const authData = attestation instanceof Map ? attestation.get('authData') : null;
  const parsed = parseAuthenticatorData(authData);
  if (!sameBytes(parsed.rpIdHash, sha256(rpId))) throw new WebAuthnError('Khóa được tạo cho một tên miền khác.');
  if (!parsed.userPresent) throw new WebAuthnError('Chưa có xác nhận hiện diện người dùng trên thiết bị.');
  if (!parsed.attested) throw new WebAuthnError('Thiếu dữ liệu khóa công khai.');
  const credentialId = parsed.attested.credentialId;
  if (!sameBytes(credentialId, fromBase64Url(credential.rawId))) throw new WebAuthnError('Mã khóa không khớp.');
  const { jwk, algorithm } = coseKeyToJwk(parsed.attested.coseKey);
  return {
    credentialId: toBase64Url(credentialId), jwk, algorithm, signCount: parsed.signCount, aaguid: parsed.attested.aaguid,
    userVerified: parsed.userVerified, backupEligible: parsed.backupEligible, backedUp: parsed.backedUp,
  };
}

/** Xác minh một lần xác thực bằng khóa đã đăng ký. Trả về bộ đếm mới cần lưu. */
export function verifyAssertion({ credential, expectedChallenge, allowedOrigins, rpId, jwk, algorithm, signCount, requireUserVerification }) {
  if (!credential || credential.type !== 'public-key' || !credential.response) throw new WebAuthnError('Thông tin xác thực không hợp lệ.');
  const clientData = checkClientData(credential.response.clientDataJSON, 'webauthn.get', expectedChallenge, allowedOrigins);
  const authData = fromBase64Url(credential.response.authenticatorData);
  const parsed = parseAuthenticatorData(authData);
  if (!sameBytes(parsed.rpIdHash, sha256(rpId))) throw new WebAuthnError('Khóa thuộc về một tên miền khác.');
  if (!parsed.userPresent) throw new WebAuthnError('Chưa có xác nhận hiện diện người dùng trên thiết bị.');
  if (requireUserVerification && !parsed.userVerified) throw new WebAuthnError('Thiết bị chưa xác minh người dùng bằng sinh trắc học hoặc mã mở khóa.');
  const signedData = Buffer.concat([authData, sha256(clientData)]);
  let valid = false;
  try {
    const key = createPublicKey({ key: jwk, format: 'jwk' });
    const signature = fromBase64Url(credential.response.signature);
    valid = algorithm === -8 ? cryptoVerify(null, signedData, key, signature) : cryptoVerify('sha256', signedData, key, signature);
  } catch { valid = false; }
  if (!valid) throw new WebAuthnError('Chữ ký của khóa không hợp lệ.');
  // Bộ đếm phải tăng; cả hai bằng 0 nghĩa là thiết bị không dùng bộ đếm (nhiều khóa đồng bộ).
  if ((parsed.signCount !== 0 || signCount !== 0) && parsed.signCount <= signCount) throw new WebAuthnError('Bộ đếm của khóa bị lùi, khóa có thể đã bị sao chép.');
  return { signCount: parsed.signCount, userVerified: parsed.userVerified, backedUp: parsed.backedUp };
}
