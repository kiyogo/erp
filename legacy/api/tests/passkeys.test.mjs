import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { toBase64Url } from '../webauthn.mjs';
import { assertionCredential, createAuthenticator, registrationCredential } from './helpers/software-authenticator.mjs';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-passkeys-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'passkeys@example.test', SEED_ADMIN_PASSWORD: 'Passkeys-Test-26!Secure', SEED_ADMIN_EMPLOYEE_CODE: 'TEST-PK', JWT_SECRET: 'isolated-passkeys-test-secret',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
});
const base = `http://127.0.0.1:${port}/api/v1`;
for (let i = 0; i < 300; i++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (server.exitCode !== null || i === 299) throw new Error(logs);
  await new Promise(resolve => setTimeout(resolve, 100));
}

const origin = 'http://localhost:3012';
const rpId = 'localhost';
async function call(session, route, method = 'GET', payload, extraHeaders = {}) {
  const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', Origin: origin, ...(session ? session.headers : {}), ...extraHeaders }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}
async function login(email, password) {
  const response = await call(null, '/auth/login', 'POST', { email, password });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return { id: response.body.user.id, headers: { Authorization: `Bearer ${response.body.access_token || response.body.token}` } };
}
const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
const password = 'Staff-Passkeys-26!Secure';
assert.equal((await call(admin, '/users', 'POST', { email: 'pk-staff@example.test', name: 'Nhân viên khóa', password, employeeCode: 'PK-USER', role: 'USER' })).status, 201);
const staff = await login('pk-staff@example.test', password);
const authenticator = createAuthenticator('ES256');
let credentialId;
let counter = 0;

async function registerKey(name = 'Máy tính văn phòng', session = staff, currentPassword = password) {
  const options = await call(session, '/auth/passkeys/registration/options', 'POST', { currentPassword });
  assert.equal(options.status, 200, JSON.stringify(options.body));
  const { challenge } = options.body.publicKey;
  const made = registrationCredential(authenticator, { challenge, origin, rpId, transports: ['internal', 'bogus'] });
  const verified = await call(session, '/auth/passkeys/registration/verify', 'POST', { challengeId: options.body.challengeId, name, credential: made.credential });
  return { options, made, verified };
}

async function freshProof(userHandleFor) {
  const options = await call(staff, '/auth/passkeys/assertion/options', 'POST', {});
  assert.equal(options.status, 200, JSON.stringify(options.body));
  counter += 1;
  const credential = assertionCredential(authenticator, credentialId, { challenge: options.body.publicKey.challenge, origin, rpId, signCount: counter, userHandle: userHandleFor });
  return call(staff, '/auth/passkeys/assertion/verify', 'POST', { challengeId: options.body.challengeId, credential });
}

test('đăng ký khóa: máy chủ xác minh, chỉ nhận một lần và chỉ từ nguồn gốc được phép', async () => {
  assert.equal((await call(staff, '/auth/passkeys/registration/options', 'POST', {}, { Origin: 'https://evil.example' })).status, 403);
  const { options, made, verified } = await registerKey();
  assert.equal(verified.status, 201, JSON.stringify(verified.body));
  credentialId = made.credentialId;
  assert.equal(verified.body.passkey.id, toBase64Url(credentialId));
  assert.deepEqual(verified.body.passkey.transports, ['internal'], 'chỉ giữ các kiểu truyền tải hợp lệ');
  assert.equal(JSON.stringify(verified.body).includes('jwk'), false, 'không trả khóa công khai nội bộ về giao diện');
  const replay = await call(staff, '/auth/passkeys/registration/verify', 'POST', { challengeId: options.body.challengeId, name: 'Lặp lại', credential: made.credential });
  assert.equal(replay.status, 400, 'thử thách chỉ dùng một lần');
  const listed = await call(staff, '/auth/passkeys');
  assert.equal(listed.body.passkeys.length, 1);
  assert.equal(listed.body.policy.requireForSigning, false);

  // Chữ ký sai hoặc thử thách lạ bị từ chối ngay khi đăng ký.
  const second = await call(staff, '/auth/passkeys/registration/options', 'POST', { currentPassword: password });
  const forged = registrationCredential(createAuthenticator('ES256'), { challenge: toBase64Url(Buffer.alloc(32, 7)), origin, rpId });
  assert.equal((await call(staff, '/auth/passkeys/registration/verify', 'POST', { challengeId: second.body.challengeId, name: 'Giả', credential: forged.credential })).status, 422);
  assert.equal((await call(staff, '/auth/passkeys')).body.passkeys.length, 1);
});

test('chữ ký số cá nhân chỉ ghi được khi có bằng chứng passkey vừa xác thực, gắn với phiên hiện tại', async () => {
  const record = { key: 'signing-1', doc: 'Hợp đồng thử', signedAt: '2026-11-01' };
  assert.equal((await call(staff, '/collections/employee_signing_logs', 'POST', { record })).status, 201, 'chưa bật yêu cầu thì ghi bình thường');
  assert.equal((await call(staff, '/auth/passkeys/policy', 'PUT', { requireForSigning: 'yes' })).status, 422);
  const enabled = await call(staff, '/auth/passkeys/policy', 'PUT', { requireForSigning: true });
  assert.equal(enabled.status, 200, JSON.stringify(enabled.body));

  const blocked = await call(staff, '/collections/employee_signing_logs', 'POST', { record: { ...record, key: 'signing-2' } });
  assert.equal(blocked.status, 428);
  assert.equal(blocked.body.code, 'PASSKEY_PROOF_REQUIRED');
  assert.equal((await call(staff, '/collections/employee_digisigs', 'POST', { record: { key: 'sig-1' } })).status, 428);
  assert.equal((await call(staff, '/collections/employee_signing_logs', 'POST', { record: { ...record, key: 'signing-2' } }, { 'X-Passkey-Proof': 'gia-mao' })).status, 428);

  const proof = await freshProof();
  assert.equal(proof.status, 200, JSON.stringify(proof.body));
  const header = { 'X-Passkey-Proof': proof.body.proof };
  assert.equal((await call(staff, '/collections/employee_signing_logs', 'POST', { record: { ...record, key: 'signing-2' } }, header)).status, 201);
  assert.equal((await call(staff, '/collections/employee_signing_logs', 'POST', { record: { ...record, key: 'signing-3' } }, header)).status, 201, 'bằng chứng dùng lại được trong thời hạn ngắn');
  assert.equal((await call(staff, '/collections/employee_signing_logs/signing-3', 'DELETE', undefined, header)).status, 200);
  assert.equal((await call(staff, '/collections/employee_signing_logs', 'GET')).status, 200, 'đọc không cần bằng chứng');

  // Bằng chứng của phiên khác không dùng được.
  const otherSession = await login('pk-staff@example.test', password);
  assert.equal((await call(otherSession, '/collections/employee_signing_logs', 'POST', { record: { ...record, key: 'signing-4' } }, header)).status, 428);
});

test('xác thực khóa chống lặp lại: thử thách một lần, chữ ký sai và bộ đếm lùi đều bị từ chối', async () => {
  const options = await call(staff, '/auth/passkeys/assertion/options', 'POST', {});
  const challenge = options.body.publicKey.challenge;
  assert.equal(options.body.publicKey.userVerification, 'required');
  assert.equal(options.body.publicKey.allowCredentials[0].id, toBase64Url(credentialId));
  const tampered = assertionCredential(authenticator, credentialId, { challenge, origin, rpId, signCount: counter + 1, tamper: true });
  assert.equal((await call(staff, '/auth/passkeys/assertion/verify', 'POST', { challengeId: options.body.challengeId, credential: tampered })).status, 401);
  // Thử thách đã bị tiêu hao dù xác minh thất bại.
  const good = assertionCredential(authenticator, credentialId, { challenge, origin, rpId, signCount: counter + 1 });
  assert.equal((await call(staff, '/auth/passkeys/assertion/verify', 'POST', { challengeId: options.body.challengeId, credential: good })).status, 400);

  const regressed = await call(staff, '/auth/passkeys/assertion/options', 'POST', {});
  const old = assertionCredential(authenticator, credentialId, { challenge: regressed.body.publicKey.challenge, origin, rpId, signCount: counter });
  assert.equal((await call(staff, '/auth/passkeys/assertion/verify', 'POST', { challengeId: regressed.body.challengeId, credential: old })).status, 401, 'bộ đếm không tăng');
  // Khóa lạ không thuộc tài khoản.
  const stranger = await call(staff, '/auth/passkeys/assertion/options', 'POST', {});
  const foreign = assertionCredential(createAuthenticator('ES256'), Buffer.alloc(32, 9), { challenge: stranger.body.publicKey.challenge, origin, rpId, signCount: 1 });
  assert.equal((await call(staff, '/auth/passkeys/assertion/verify', 'POST', { challengeId: stranger.body.challengeId, credential: foreign })).status, 401);
});

test('đăng nhập không mật khẩu bằng passkey và từ chối chữ ký sai', async () => {
  const options = await call(null, '/auth/passkeys/login/options', 'POST', {});
  assert.equal(options.status, 200, JSON.stringify(options.body));
  assert.deepEqual(options.body.publicKey.allowCredentials, []);
  const handle = toBase64Url(Buffer.from(staff.id));
  counter += 1;
  const bad = assertionCredential(authenticator, credentialId, { challenge: options.body.publicKey.challenge, origin, rpId, signCount: counter, userHandle: handle, tamper: true });
  assert.equal((await call(null, '/auth/passkeys/login/verify', 'POST', { challengeId: options.body.challengeId, credential: bad })).status, 401);

  const again = await call(null, '/auth/passkeys/login/options', 'POST', {});
  counter += 1;
  const wrongHandle = assertionCredential(authenticator, credentialId, { challenge: again.body.publicKey.challenge, origin, rpId, signCount: counter, userHandle: toBase64Url(Buffer.from('nguoi-khac')) });
  assert.equal((await call(null, '/auth/passkeys/login/verify', 'POST', { challengeId: again.body.challengeId, credential: wrongHandle })).status, 401);

  const third = await call(null, '/auth/passkeys/login/options', 'POST', {});
  counter += 1;
  const good = assertionCredential(authenticator, credentialId, { challenge: third.body.publicKey.challenge, origin, rpId, signCount: counter, userHandle: handle });
  const logged = await call(null, '/auth/passkeys/login/verify', 'POST', { challengeId: third.body.challengeId, credential: good });
  assert.equal(logged.status, 200, JSON.stringify(logged.body));
  assert.equal(logged.body.user.email, 'pk-staff@example.test');
  const profile = await call({ headers: { Authorization: `Bearer ${logged.body.access_token}` } }, '/auth/profile');
  assert.equal(profile.status, 200);
  assert.equal((await call(null, '/auth/passkeys/login/verify', 'POST', { challengeId: third.body.challengeId, credential: good })).status, 400, 'không đăng nhập lại bằng cùng thử thách');
});

test('gỡ khóa cần bằng chứng khi đang yêu cầu passkey và tự tắt yêu cầu khi hết khóa', async () => {
  const target = toBase64Url(credentialId);
  assert.equal((await call(staff, `/auth/passkeys/${target}`, 'DELETE')).status, 428);
  const proof = await freshProof();
  assert.equal(proof.status, 200, JSON.stringify(proof.body));
  const removed = await call(staff, `/auth/passkeys/${target}`, 'DELETE', undefined, { 'X-Passkey-Proof': proof.body.proof });
  assert.equal(removed.status, 200, JSON.stringify(removed.body));
  const listed = await call(staff, '/auth/passkeys');
  assert.equal(listed.body.passkeys.length, 0);
  assert.equal(listed.body.policy.requireForSigning, false);
  assert.equal((await call(staff, '/collections/employee_signing_logs', 'POST', { record: { key: 'signing-5', doc: 'Sau khi gỡ khóa' } })).status, 201);
});

test('đăng ký khóa truy cập phải xác thực lại bằng mật khẩu hiện tại và không dò được mật khẩu', async () => {
  assert.equal((await call(staff, '/auth/passkeys/registration/options', 'POST', {})).status, 403, 'chỉ có token thì chưa đủ');
  assert.equal((await call(staff, '/auth/passkeys/registration/options', 'POST', { currentPassword: 'Sai-mat-khau-26!' })).status, 403);
  assert.equal((await call(staff, '/auth/passkeys/registration/options', 'POST', { currentPassword: password })).status, 200);

  assert.equal((await call(admin, '/users', 'POST', { email: 'pk-lock@example.test', name: 'Nhân viên thử mật khẩu', password, employeeCode: 'PK-LOCK', role: 'USER' })).status, 201);
  const locked = await login('pk-lock@example.test', password);
  for (let i = 0; i < 8; i++) assert.equal((await call(locked, '/auth/passkeys/registration/options', 'POST', { currentPassword: `Sai-${i}-26!Secure` })).status, 403);
  assert.equal((await call(locked, '/auth/passkeys/registration/options', 'POST', { currentPassword: password })).status, 429, 'quá số lần thử thì khóa tạm, kể cả khi nhập đúng');
});

test('đặt lại mật khẩu thu hồi mọi phiên và xóa khóa truy cập; tự đổi mật khẩu chỉ thu hồi phiên khác', async () => {
  assert.equal((await call(admin, '/users', 'POST', { email: 'pk-victim@example.test', name: 'Nhân viên bị lộ token', password, employeeCode: 'PK-VICTIM', role: 'USER' })).status, 201);
  const stolen = await login('pk-victim@example.test', password);
  const other = await login('pk-victim@example.test', password);
  const registered = await registerKey('Khóa của kẻ lấy token', stolen);
  assert.equal(registered.verified.status, 201, JSON.stringify(registered.verified.body));

  const newPassword = 'Victim-New-26!Secure';
  assert.equal((await call(admin, `/employees/${stolen.id}/password`, 'POST', { password: newPassword })).status, 200);
  assert.equal((await call(stolen, '/auth/profile')).status, 401, 'token cũ bị thu hồi');
  assert.equal((await call(other, '/auth/profile')).status, 401);

  const options = await call(null, '/auth/passkeys/login/options', 'POST', {});
  counter += 1;
  const assertion = assertionCredential(authenticator, registered.made.credentialId, { challenge: options.body.publicKey.challenge, origin, rpId, signCount: counter, userHandle: toBase64Url(Buffer.from(stolen.id)) });
  assert.equal((await call(null, '/auth/passkeys/login/verify', 'POST', { challengeId: options.body.challengeId, credential: assertion })).status, 401, 'khóa đã bị xóa nên không đăng nhập lại được');

  const fresh = await login('pk-victim@example.test', newPassword);
  assert.equal((await call(fresh, '/auth/passkeys')).body.passkeys.length, 0);

  // Tự đổi mật khẩu: giữ phiên đang dùng và khóa truy cập, chỉ thu hồi phiên khác.
  const second = await login('pk-victim@example.test', newPassword);
  assert.equal((await registerKey('Khóa hợp lệ', fresh, newPassword)).verified.status, 201);
  const changed = await call(fresh, '/auth/change-password', 'POST', { oldPassword: newPassword, newPassword: 'Victim-Newer-26!Secure', confirmPassword: 'Victim-Newer-26!Secure' });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal((await call(fresh, '/auth/profile')).status, 200);
  assert.equal((await call(second, '/auth/profile')).status, 401);
  assert.equal((await call(fresh, '/auth/passkeys')).body.passkeys.length, 1);
});

test('làm đầy thử thách đăng nhập không chặn người đã đăng nhập', async () => {
  for (let round = 0; round < 52; round++) await Promise.all(Array.from({ length: 100 }, () => call(null, '/auth/passkeys/login/options', 'POST', {})));
  const options = await call(staff, '/auth/passkeys/registration/options', 'POST', { currentPassword: password });
  assert.equal(options.status, 200, JSON.stringify(options.body));
  assert.equal((await call(null, '/auth/passkeys/login/options', 'POST', {})).status, 200, 'người dùng mới vẫn xin được thử thách đăng nhập');
});
