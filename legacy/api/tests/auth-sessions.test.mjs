import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHmac, generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-sessions-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'isolated-google-test-key', alg: 'RS256', use: 'sig' };
const preload = path.join(directory, 'google-keys-fixture.mjs');
writeFileSync(preload, `const fetchOriginal = globalThis.fetch;
globalThis.fetch = async (url, options) => String(url) === 'https://www.googleapis.com/oauth2/v3/certs'
  ? new Response(JSON.stringify({ keys: [${JSON.stringify(jwk)}] }), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' } })
  : fetchOriginal(url, options);
`);
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'),
  KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'session-admin@gmail.com', SEED_ADMIN_PASSWORD: 'Sessions-Test-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-SESSIONS', JWT_SECRET: 'isolated-session-test-secret',
  GOOGLE_CLIENT_ID: 'isolated-test.apps.googleusercontent.com', GOOGLE_ALLOWED_DOMAIN: '',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
let server;
let logs = '';
const storage = new DatabaseSync(env.KIYOVN_DB_PATH);
const base = `http://127.0.0.1:${port}/api/v1`;
async function startServer() {
  server = spawn(process.execPath, ['--import', pathToFileURL(preload).href, 'index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/health`)).ok) return; } catch {}
    if (server.exitCode !== null || i === 99) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
async function stopServer() {
  if (server?.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
}
after(async () => {
  storage.close();
  await stopServer();
  console.log(`Isolated auth/session evidence: ${directory}`);
});
await startServer();
async function login(email = env.SEED_ADMIN_EMAIL, agent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0.0.0 Safari/537.36') {
  const response = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': agent, 'X-Forwarded-For': '8.8.8.8' }, body: JSON.stringify({ email, password: env.SEED_ADMIN_PASSWORD }) });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  return { ...body, token: body.access_token || body.token };
}
const control = await login();
async function request(route, method = 'GET', payload, expected = 200, token = control.token) {
  const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}
const claimsOf = token => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
function legacyToken(extra = {}) {
  const current = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ sub: control.user.id, role: 'ADMIN', iat: current - 10, exp: current + 3600, ...extra })).toString('base64url');
  return `${header}.${body}.${createHmac('sha256', env.JWT_SECRET).update(`${header}.${body}`).digest('base64url')}`;
}
function googleToken(extra = {}) {
  const current = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: env.GOOGLE_CLIENT_ID, sub: 'verified-google-admin', email: env.SEED_ADMIN_EMAIL, email_verified: true, name: 'Verified Google User', iat: current, exp: current + 3600, ...extra })).toString('base64url');
  return `${header}.${body}.${sign('RSA-SHA256', Buffer.from(`${header}.${body}`), privateKey).toString('base64url')}`;
}

test('logins issue unique persistent sessions with actual IP, agent, expiry and current-session marker', async () => {
  const first = await login();
  const second = await login();
  assert.notEqual(first.token, second.token);
  const claims = claimsOf(first.token);
  assert.equal(claims.scope, 'access');
  assert.ok(claims.sid);
  const list = (await request('/admin/sessions', 'GET', undefined, 200, first.token)).data;
  const item = list.find(row => row.key === claims.sid);
  assert.equal(item.userId, first.user.id);
  assert.equal(item.ip, '127.0.0.1', 'untrusted forwarded IP is not accepted');
  assert.equal(item.browser, 'Chrome');
  assert.equal(item.device, 'Windows');
  assert.equal(item.current, true);
  assert.equal(item.mfaVerified, false);
  assert.equal(item.tlsProtocol, '');
  assert.equal(item.expiresAt, new Date(claims.exp * 1000).toISOString());
  const stored = storage.prepare("SELECT payload_json FROM collection_records WHERE scope = 'admin_sessions' AND record_key = ?").get(claims.sid).payload_json;
  assert.ok(!stored.includes(first.token), 'bearer credentials must not be stored');
});

test('successful API activity updates the persisted last-active timestamp', async () => {
  const session = await login();
  const key = claimsOf(session.token).sid;
  const row = storage.prepare("SELECT * FROM collection_records WHERE scope = 'admin_sessions' AND record_key = ?").get(key);
  const payload = JSON.parse(row.payload_json);
  payload.lastActive = '2020-01-01T00:00:00.000Z';
  storage.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(payload), payload.lastActive, row.id);
  await request('/auth/profile', 'GET', undefined, 200, session.token);
  const updated = JSON.parse(storage.prepare('SELECT payload_json FROM collection_records WHERE id = ?').get(row.id).payload_json);
  assert.ok(Date.parse(updated.lastActive) > Date.now() - 5000);
});

test('session revoke immediately rejects the chosen token and keeps other sessions valid', async () => {
  const target = await login();
  const key = claimsOf(target.token).sid;
  const revoked = await request(`/admin/sessions/${key}/revoke`, 'POST', { reason: 'Security test' });
  assert.equal(revoked.session.status, 'Đã thu hồi');
  assert.equal(revoked.session.revokeReason, 'Security test');
  await request('/auth/profile', 'GET', undefined, 401, target.token);
  await request('/finance/bank-accounts', 'GET', undefined, 401, target.token);
  await request('/ekyc/session', 'POST', {}, 401, target.token);
  await request('/auth/profile');
  await request(`/admin/sessions/${key}/revoke`, 'POST', { reason: 'Retry' });
  assert.equal(storage.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action = 'revoke_session' AND resource_id = ?").get(key).n, 1);
});

test('logout revokes the current server session instead of only clearing browser data', async () => {
  const session = await login();
  assert.equal((await request('/auth/logout', 'POST', {}, 200, session.token)).loggedOut, true);
  await request('/auth/profile', 'GET', undefined, 401, session.token);
  const item = (await request('/admin/sessions')).data.find(row => row.key === claimsOf(session.token).sid);
  assert.equal(item.status, 'Đã thu hồi');
});

test('legacy JWTs remain compatible, are registered once under concurrent access, and can be revoked', async () => {
  const token = legacyToken();
  await Promise.all(Array.from({ length: 4 }, () => request('/auth/profile', 'GET', undefined, 200, token)));
  const records = (await request('/admin/sessions')).data.filter(row => row.method === 'legacy');
  assert.equal(records.length, 1);
  assert.ok(records[0].key.startsWith('legacy-'));
  await request(`/admin/sessions/${records[0].key}/revoke`, 'POST', { reason: 'Legacy token revoked' });
  await request('/auth/profile', 'GET', undefined, 401, token);
});

test('activation tokens and access tokens without a stored session cannot authorize API calls', async () => {
  await request('/auth/profile', 'GET', undefined, 401, legacyToken({ scope: 'activation', activationId: 'not-access' }));
  await request('/auth/profile', 'GET', undefined, 401, legacyToken({ scope: 'access', sid: randomUUID() }));
  await request('/auth/profile', 'GET', undefined, 401, legacyToken({ exp: Math.floor(Date.now() / 1000) - 1 }));
});

test('only administrators can inspect or revoke sessions and generic writes cannot resurrect tokens', async () => {
  const admin = storage.prepare('SELECT * FROM users WHERE id = ?').get(control.user.id);
  storage.prepare("INSERT INTO users (id, email, name, employee_code, role, password_hash, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, 'USER', ?, 1, ?, ?)")
    .run('session-user', 'session-user@example.test', 'Session User', 'SESSION-USER', admin.password_hash, admin.created_at, admin.updated_at);
  const user = await login('session-user@example.test');
  await request('/admin/sessions', 'GET', undefined, 403, user.token);
  await request(`/admin/sessions/${claimsOf(control.token).sid}/revoke`, 'POST', {}, 403, user.token);
  const key = claimsOf(user.token).sid;
  await request('/collections/admin_sessions', 'PUT', { records: [] }, 409);
  await request('/collections/admin_sessions', 'POST', { record: { key } }, 409);
  await request(`/collections/admin_sessions/${key}`, 'PATCH', { patch: { revokedAt: '' } }, 409);
  await request(`/collections/admin_sessions/${key}`, 'DELETE', undefined, 409);
  await request('/admin/sessions/missing/revoke', 'POST', {}, 404);
});

test('unverified Google payloads, tampered signatures and invalid claims cannot log in', async () => {
  await request('/auth/google', 'POST', {}, 422, '');
  await request('/auth/google', 'POST', { email: env.SEED_ADMIN_EMAIL }, 422, '');
  const valid = googleToken();
  const [header, body] = valid.split('.');
  const tampered = Buffer.from(JSON.stringify({ ...claimsOf(valid), email: 'attacker@gmail.com' })).toString('base64url');
  await request('/auth/google', 'POST', { credential: `${header}.${tampered}.${valid.split('.')[2]}` }, 422, '');
  await request('/auth/google', 'POST', { credential: `${header}.${body}.invalid` }, 422, '');
  for (const patch of [{ aud: 'other-client' }, { iss: 'https://attacker.test' }, { exp: 1 }, { email_verified: false }, { iat: Math.floor(Date.now() / 1000) + 1000 }]) {
    await request('/auth/google', 'POST', { credential: googleToken(patch) }, 422, '');
  }
});

test('verified Google identity creates a real session and preserves signup without granting admin', async () => {
  const config = await request('/auth/google/config', 'GET', undefined, 200, '');
  assert.equal(config.clientId, env.GOOGLE_CLIENT_ID);
  const signed = await request('/auth/google', 'POST', { credential: googleToken() }, 200, '');
  assert.equal(signed.user.id, control.user.id);
  const item = (await request('/admin/sessions')).data.find(row => row.key === claimsOf(signed.access_token).sid);
  assert.equal(item.method, 'google');
  const signup = await request('/auth/google', 'POST', { credential: googleToken({ email: 'new-verified@gmail.com', sub: 'verified-new-user' }) }, 200, '');
  assert.equal(signup.user.role, 'USER');
  assert.notEqual(signup.user.id, control.user.id);
  await request('/auth/profile', 'GET', undefined, 200, signup.access_token);
  const prefix = await request('/auth/google', 'POST', { credential: googleToken({ email: 'session-admin@different.test', sub: 'other-email-same-prefix' }) }, 200, '');
  assert.equal(prefix.user.role, 'USER');
  assert.notEqual(prefix.user.id, control.user.id);
  await request('/auth/google', 'POST', { credential: googleToken({ sub: 'different-google-account' }) }, 403, '');
  storage.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(signup.user.id);
  await request('/auth/google', 'POST', { credential: googleToken({ email: 'new-verified@gmail.com', sub: 'verified-new-user' }) }, 403, '');
});

test('Google-only login requires a verified admin session and can safely return to password mode', async () => {
  const google = await request('/auth/google', 'POST', { credential: googleToken() }, 200, '');
  const config = { clientKey: env.GOOGLE_CLIENT_ID, redirectUri: 'http://localhost:3011', allowedDomain: '', enforceGoogleLogin: '100' };
  await request('/system/google-config', 'PUT', config, 422);
  await request('/system/google-config', 'PUT', config, 200, google.token);
  try {
    await request('/auth/login', 'POST', { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }, 403, '');
    await request('/auth/google', 'POST', { credential: googleToken() }, 200, '');
  } finally {
    await request('/system/google-config', 'PUT', { ...config, enforceGoogleLogin: 'optional' }, 200, google.token);
  }
  const restored = await login();
  assert.ok(restored.token);
});

test('revocation survives API restart and configured Google Workspace domain is enforced', async () => {
  const target = await login();
  const key = claimsOf(target.token).sid;
  await request(`/admin/sessions/${key}/revoke`, 'POST', { reason: 'Persistent revocation' });
  await stopServer();
  env.GOOGLE_ALLOWED_DOMAIN = 'example.test';
  await startServer();
  await request('/auth/profile', 'GET', undefined, 401, target.token);
  await request('/auth/profile');
  await request('/auth/google', 'POST', { credential: googleToken() }, 403, '');
  const allowed = await request('/auth/google', 'POST', { credential: googleToken({ email: 'workspace@example.test', hd: 'example.test', sub: 'workspace-user' }) }, 200, '');
  assert.equal(allowed.user.role, 'USER');
});
