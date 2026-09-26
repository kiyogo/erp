import { createCipheriv, createDecipheriv, createHash, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(process.env.KIYOVN_DATA_DIR || path.join(__dirname, '../data'));

const DEFAULT_KEY_VERSION = process.env.KIYOVN_KEY_VERSION || 'v1';

/**
 * Get or load Master Key (256-bit CSPRNG).
 * Never hardcoded. Loaded from environment or secure local store in dev.
 */
export async function getMasterKey() {
  const envKey = process.env.KIYOVN_MASTER_KEY?.trim();
  if (envKey) {
    if (/^[0-9a-fA-F]{64}$/.test(envKey)) {
      return Buffer.from(envKey, 'hex');
    }
    if (/^[A-Za-z0-9_-]{43,44}$/.test(envKey)) {
      return Buffer.from(envKey, 'base64url');
    }
    return createHash('sha256').update(envKey).digest();
  }

  const keyPath = path.join(DATA_DIR, '.kiyovn-master.key');
  try {
    const raw = (await readFile(keyPath, 'utf8')).trim();
    if (raw.length === 64) return Buffer.from(raw, 'hex');
  } catch {}

  // Generate 256-bit CSPRNG key for local dev if not present
  const generated = randomBytes(32);
  try {
    await writeFile(keyPath, `${generated.toString('hex')}\n`, { encoding: 'utf8', mode: 0o600 });
  } catch {}
  return generated;
}

const masterKeyBuffer = await getMasterKey();

/**
 * Derive domain-specific subkeys using standard HKDF-SHA256 (RFC 5869).
 * Compromising one domain key does NOT compromise other domains or the master key.
 */
export function deriveSubkey(domain, version = DEFAULT_KEY_VERSION) {
  const info = `KIYOVN-Secure-Envelope-${domain}-${version}`;
  const salt = Buffer.from(`kiyovn-salt-${version}`, 'utf8');
  const derived = hkdfSync('sha256', masterKeyBuffer, salt, Buffer.from(info, 'utf8'), 32);
  return Buffer.from(derived);
}

// Pre-derived domain subkeys for performance
const DOMAIN_SUBKEYS = {
  employee: deriveSubkey('employee-data'),
  profile: deriveSubkey('user-profile'),
  salary: deriveSubkey('salary-data'),
  contract: deriveSubkey('contract-data'),
  finance: deriveSubkey('finance-data'),
  crm: deriveSubkey('crm-data'),
  document: deriveSubkey('document-data'),
  system: deriveSubkey('system-data'),
  blind_index: deriveSubkey('blind-index'),
};

/**
 * Standard AES-256-GCM Encryption with fresh 12-byte IV for every encryption.
 * Returns KIYOVN Secure Envelope v1 structure.
 */
export function encryptField(plainText, domain = 'employee', version = DEFAULT_KEY_VERSION) {
  if (plainText === null || plainText === undefined || plainText === '') return plainText;
  const str = String(plainText);
  const key = DOMAIN_SUBKEYS[domain] || deriveSubkey(domain, version);
  const iv = randomBytes(12); // 96-bit IV standard for AES-GCM

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(str, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  const envelope = {
    v: 1,
    kid: `${domain}-${version}`,
    alg: 'A256GCM',
    iv: iv.toString('base64url'),
    ciphertext: encrypted.toString('base64url'),
    tag: tag.toString('base64url'),
  };

  return `ENC:${JSON.stringify(envelope)}`;
}

/**
 * Standard AES-256-GCM Decryption with Authentication Tag verification.
 */
export function decryptField(encryptedString, domain = 'employee') {
  if (!isEncrypted(encryptedString)) return encryptedString;

  try {
    const rawJson = encryptedString.startsWith('ENC:') ? encryptedString.slice(4) : encryptedString;
    const envelope = JSON.parse(rawJson);

    if (envelope.alg !== 'A256GCM' || !envelope.iv || !envelope.ciphertext || !envelope.tag) {
      return encryptedString;
    }

    const keyDomain = envelope.kid ? envelope.kid.split('-')[0] : domain;
    const keyVersion = envelope.kid ? envelope.kid.split('-')[1] || 'v1' : 'v1';
    const key = DOMAIN_SUBKEYS[keyDomain] || deriveSubkey(keyDomain, keyVersion);

    const iv = Buffer.from(envelope.iv, 'base64url');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64url');
    const tag = Buffer.from(envelope.tag, 'base64url');

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (error) {
    // If decryption fails (e.g. data corrupt or tag mismatch), return fallback safely
    return encryptedString;
  }
}

/**
 * Check if string is formatted as an encrypted envelope.
 */
export function isEncrypted(value) {
  if (typeof value !== 'string') return false;
  return value.startsWith('ENC:{"v":1,"kid":') || (value.startsWith('{"v":1,"kid":') && value.includes('"alg":"A256GCM"'));
}

/**
 * Blind Index for exact search without revealing plaintext.
 * Uses HMAC-SHA256 with domain-isolated search key.
 */
export function computeBlindIndex(value, fieldName = 'phone') {
  if (!value) return '';
  const normalized = String(value).trim().toLowerCase().replace(/[\s.-]/g, '');
  const blindKey = deriveSubkey(`blind-${fieldName}`);
  return createHmac('sha256', blindKey).update(normalized).digest('hex');
}

export default {
  getMasterKey,
  deriveSubkey,
  encryptField,
  decryptField,
  isEncrypted,
  computeBlindIndex,
};
