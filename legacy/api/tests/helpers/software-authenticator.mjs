// Thiết bị xác thực giả lập dùng khóa thật của node:crypto, để kiểm thử WebAuthn mà không cần trình duyệt.
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { fromBase64Url, toBase64Url } from '../../webauthn.mjs';

export function encodeCbor(value) {
  const head = (major, argument) => {
    if (argument < 24) return Buffer.from([(major << 5) | argument]);
    if (argument < 256) return Buffer.from([(major << 5) | 24, argument]);
    if (argument < 65536) { const out = Buffer.alloc(3); out[0] = (major << 5) | 25; out.writeUInt16BE(argument, 1); return out; }
    const out = Buffer.alloc(5); out[0] = (major << 5) | 26; out.writeUInt32BE(argument, 1); return out;
  };
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') { const bytes = Buffer.from(value); return Buffer.concat([head(3, bytes.length), bytes]); }
  if (Array.isArray(value)) return Buffer.concat([head(4, value.length), ...value.map(encodeCbor)]);
  if (value instanceof Map) return Buffer.concat([head(5, value.size), ...[...value].flatMap(([key, item]) => [encodeCbor(key), encodeCbor(item)])]);
  throw new Error('kiểu không hỗ trợ trong bộ mã hóa thử');
}

export const sha256 = (value) => createHash('sha256').update(value).digest();

export function createAuthenticator(kind = 'ES256') {
  if (kind === 'ES256') {
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const jwk = publicKey.export({ format: 'jwk' });
    return { privateKey, algorithm: -7, hash: 'sha256', cose: new Map([[1, 2], [3, -7], [-1, 1], [-2, fromBase64Url(jwk.x)], [-3, fromBase64Url(jwk.y)]]) };
  }
  if (kind === 'RS256') {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = publicKey.export({ format: 'jwk' });
    return { privateKey, algorithm: -257, hash: 'sha256', cose: new Map([[1, 3], [3, -257], [-1, fromBase64Url(jwk.n)], [-2, fromBase64Url(jwk.e)]]) };
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const jwk = publicKey.export({ format: 'jwk' });
  return { privateKey, algorithm: -8, hash: null, cose: new Map([[1, 1], [3, -8], [-1, 6], [-2, fromBase64Url(jwk.x)]]) };
}

export function authenticatorData({ flags, signCount, attested, rpId }) {
  const counter = Buffer.alloc(4); counter.writeUInt32BE(signCount);
  const parts = [sha256(rpId), Buffer.from([flags]), counter];
  if (attested) {
    const idLength = Buffer.alloc(2); idLength.writeUInt16BE(attested.credentialId.length);
    parts.push(Buffer.alloc(16, 1), idLength, attested.credentialId, encodeCbor(attested.cose));
  }
  return Buffer.concat(parts);
}

const clientData = ({ type, challenge, origin, clientOverrides }) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false, ...clientOverrides }));

export function registrationCredential(authenticator, { challenge, origin, rpId, credentialId = randomBytes(32), flags = 0x45, signCount = 0, type = 'webauthn.create', clientOverrides, idInResponse = credentialId, transports }) {
  const authData = authenticatorData({ flags, signCount, rpId, attested: { credentialId, cose: authenticator.cose } });
  const attestation = encodeCbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
  return {
    credentialId,
    credential: { id: toBase64Url(idInResponse), rawId: toBase64Url(idInResponse), type: 'public-key', response: { clientDataJSON: toBase64Url(clientData({ type, challenge, origin, clientOverrides })), attestationObject: toBase64Url(attestation), ...(transports ? { transports } : {}) } },
  };
}

export function assertionCredential(authenticator, credentialId, { challenge, origin, rpId, flags = 0x05, signCount = 1, type = 'webauthn.get', clientOverrides, tamper = false, userHandle }) {
  const authData = authenticatorData({ flags, signCount, rpId });
  const rawClientData = clientData({ type, challenge, origin, clientOverrides });
  const signature = sign(authenticator.hash, Buffer.concat([authData, sha256(rawClientData)]), authenticator.privateKey);
  if (tamper) signature[signature.length - 1] ^= 0xff;
  return {
    id: toBase64Url(credentialId), rawId: toBase64Url(credentialId), type: 'public-key',
    response: { clientDataJSON: toBase64Url(rawClientData), authenticatorData: toBase64Url(authData), signature: toBase64Url(signature), ...(userHandle ? { userHandle } : {}) },
  };
}
