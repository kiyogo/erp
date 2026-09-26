import { randomBytes } from 'node:crypto';

/**
 * Script to generate high-entropy 256-bit CSPRNG master keys.
 * Usage:
 *   node server/keygen.mjs
 */
const keyHex = randomBytes(32).toString('hex');
const keyBase64Url = randomBytes(32).toString('base64url');

console.log('=== KIYOVN Secure Envelope v1 - Master Key Generator ===');
console.log('Generated 256-bit CSPRNG Master Key:');
console.log(`KIYOVN_MASTER_KEY=${keyHex}`);
console.log(`KIYOVN_KEY_VERSION=v1`);
console.log('\nBase64Url representation:');
console.log(`KIYOVN_MASTER_KEY=${keyBase64Url}`);
console.log('\n[!] Copy and add this key to your Environment Secrets / Docker Secrets / Vault.');
console.log('[!] NEVER commit this key into Git or expose it to frontend code.');
