import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-archives-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'archives@example.test', SEED_ADMIN_PASSWORD: 'Archives-Test-26!Safe',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-ARCHIVES', JWT_SECRET: 'isolated-archives-test-secret-not-for-deployment',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; }); server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exit; }
  console.log(`Archive API evidence: ${directory}`);
});
const base = `http://127.0.0.1:${port}/api/v1`;
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (server.exitCode !== null || attempt === 99) throw new Error(logs);
  await new Promise(resolve => setTimeout(resolve, 100));
}
const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const session = await login.json();
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token || session.token}` };
async function request(route, method = 'GET', payload, expected = 200) {
  const response = await fetch(`${base}${route}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}

const record = (key, patch = {}) => ({
  key, dispatchType: 'Văn bản đến', bookNumber: '', originalCode: `CV-${key}`,
  docType: 'Công văn', partner: 'Integration Office', subject: 'Original archive integration record',
  signer: 'Integration Signer', signerPosition: 'Test Director', receiverOrAuthor: 'Integration Clerk',
  docDate: '2026-10-25', dateReceivedOrIssued: '2026-10-26', slaDeadline: '2026-11-02',
  urgency: 'Bình thường', securityLevel: 'Nội bộ', status: 'Đang xử lý đúng hạn', ...patch,
});

test('archive accepts records without scans, allocates unique book numbers and rejects invalid input', async () => {
  await request('/collections/doc_archives', 'POST', { record: record('invalid-date', { docDate: '2026-02-30' }) }, 422);
  await request('/collections/doc_archives', 'POST', { record: record('invalid-pages', { pageCount: -1 }) }, 422);
  await request('/collections/doc_archives', 'POST', { record: record('invalid-deadline', { slaDeadline: '2026-10-01' }) }, 422);
  await request('/collections/doc_archives', 'POST', { record: record('missing-file', { fileNodeId: 'file-that-does-not-exist' }) }, 404);
  const created = (await request('/collections/doc_archives', 'POST', { record: record('no-scan', { fileScan: 'fabricated.pdf', fileSize: '2.5 MB', fileSizeBytes: 2621440, digitalVerified: true }) }, 201)).record;
  assert.ok(created.bookNumber);
  assert.equal(created.status, 'Đang xử lý đúng hạn');
  assert.equal(created.digitalVerified, false);
  assert.ok(!created.fileNodeId);
  assert.ok(!created.fileScan);
  assert.equal(Number(created.fileSizeBytes || 0), 0);
  const concurrent = await Promise.all(Array.from({ length: 5 }, (_, index) => request('/collections/doc_archives', 'POST', { record: record(`concurrent-${index}`) }, 201)));
  assert.equal(new Set([created.bookNumber, ...concurrent.map(item => item.record.bookNumber)]).size, 6);
  await request('/collections/doc_archives', 'POST', { record: record('duplicate-book', { bookNumber: created.bookNumber }) }, 409);
});

test('archive persists the exact original scan bytes and derives file metadata without asserting signature verification', async () => {
  const workspace = await request('/files?scope=employee');
  const bytes = Buffer.from('%PDF-1.4\nOriginal scan evidence \u0111\u00fang b\u1ea3n g\u1ed1c\n%%EOF', 'utf8');
  const upload = await fetch(`${base}/files/upload`, { method: 'POST', headers: { Authorization: headers.Authorization, 'Content-Type': 'application/pdf', 'X-File-Name': 'original-archive-scan.pdf', 'X-Origin-Module': 'doc_archives', 'X-Parent-Id': workspace.context.parentId }, body: bytes });
  assert.equal(upload.status, 201);
  const file = (await upload.json()).file;
  const created = (await request('/collections/doc_archives', 'POST', { record: record('actual-scan', { fileNodeId: file.id, fileScan: 'wrong-name.pdf', fileSizeBytes: 1, fileSize: 'Fake 1 KB', digitalVerified: true, sha256Hash: 'forged-hash' }) }, 201)).record;
  assert.equal(created.fileNodeId, file.id);
  assert.equal(created.fileScan, file.name);
  assert.equal(created.fileSizeBytes, bytes.length);
  assert.equal(created.sha256Hash, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(created.digitalVerified, false);
  const downloaded = await fetch(`${base}/files/${file.id}/download`, { headers: { Authorization: headers.Authorization } });
  assert.equal(downloaded.status, 200);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);
  await request('/collections/doc_archives/actual-scan', 'PATCH', { patch: { subject: 'Updated actual record', receiverOrAuthor: 'Next Clerk', forwardNote: 'Please process original document' } });
  const persisted = (await request('/collections/doc_archives')).data.find(item => item.key === 'actual-scan');
  assert.equal(persisted.subject, 'Updated actual record');
  assert.equal(persisted.fileNodeId, file.id);
  assert.equal(persisted.receiverOrAuthor, 'Next Clerk');
  await request('/collections/doc_archives/actual-scan', 'PATCH', { patch: { status: 'Đã giải quyết xong' } });
  assert.equal((await request('/collections/doc_archives')).data.find(item => item.key === 'actual-scan').status, 'Đã giải quyết xong');
  await request('/collections/doc_archives/actual-scan', 'PATCH', { patch: { status: 'Đang xử lý đúng hạn' } }, 422);
  await request('/collections/doc_archives/actual-scan', 'DELETE');
  assert.equal((await request('/collections/doc_archives')).data.some(item => item.key === 'actual-scan'), false);
  const retained = await fetch(`${base}/files/${file.id}/download`, { headers: { Authorization: headers.Authorization } });
  assert.deepEqual(Buffer.from(await retained.arrayBuffer()), bytes, 'Deleting archive metadata retains the uploaded original in the file workspace');
});

test('archive writes require an authenticated administrator', async () => {
  assert.equal((await fetch(`${base}/collections/doc_archives`)).status, 401);
  await request('/users', 'POST', { email: 'archive-staff@example.test', name: 'Archive Staff', password: 'Archive-Staff-26!Safe', employeeCode: 'ARCHIVE-STAFF', role: 'USER' }, 201);
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'archive-staff@example.test', password: 'Archive-Staff-26!Safe' }) });
  assert.equal(login.status, 200);
  const staff = await login.json();
  const response = await fetch(`${base}/collections/doc_archives`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staff.access_token || staff.token}` }, body: JSON.stringify({ record: record('unauthorized') }) });
  assert.equal(response.status, 403);
});
