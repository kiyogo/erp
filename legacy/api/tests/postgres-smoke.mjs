import assert from 'node:assert/strict';
import pg from 'pg';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

// Opt-in integration run: creates and drops only its own randomly named database.
const database = `kiyovn_codex_test_${randomUUID().replaceAll('-', '')}`;
assert.match(database, /^kiyovn_codex_test_[a-f0-9]{32}$/);
const config = { host: process.env.PGHOST || '127.0.0.1', port: Number(process.env.PGPORT || 5432), user: process.env.PGUSER || 'postgres', password: process.env.PGPASSWORD || 'postgres', connectionTimeoutMillis: 3000 };
const admin = new pg.Client({ ...config, database: 'postgres' });
await admin.connect();
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-pg-test-'));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const env = { ...process.env, DATABASE_URL: '', USE_SQLITE: 'false', PGHOST: config.host, PGPORT: String(config.port), PGUSER: config.user, PGPASSWORD: config.password, PGDATABASE: database, HOST: '127.0.0.1', PORT: String(port), KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'fallback.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'), SEED_ADMIN_EMAIL: 'pg@example.test', SEED_ADMIN_PASSWORD: 'Postgres-Test-26!Secure', SEED_ADMIN_EMPLOYEE_CODE: 'PG-ADMIN', GOOGLE_ENFORCE_LOGIN: 'false' };
let server;
let created = false;
let logs = '';
let completed = 0;
try {
  await admin.query(`CREATE DATABASE "${database}"`);
  created = true;
  const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
  assert.equal(seed.status, 0, seed.stderr);
  assert.ok(seed.stdout.includes('Connected successfully to PostgreSQL'), 'SQLite fallback is not a PostgreSQL test');
  server = spawn(process.execPath, ['index.mjs'], { cwd, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', chunk => { logs += chunk; });
  server.stderr.on('data', chunk => { logs += chunk; });
  const base = `http://127.0.0.1:${port}/api/v1`;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
    if (server.exitCode !== null || i === 99) throw new Error(logs);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  let token = '';
  async function request(route, method = 'GET', payload, expected = 200) {
    const response = await fetch(`${base}${route}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: payload === undefined ? undefined : JSON.stringify(payload) });
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  }
  const login = await request('/auth/login', 'POST', { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD });
  token = login.token;
  await request('/auth/profile'); completed++;
  await request('/collections/pg_rows', 'PUT', { records: [{ key: 'a', title: 'Alpha' }, { key: 'b', title: 'Beta' }] });
  assert.equal((await request('/collections/pg_rows?sort=title&order=asc')).data[0].title, 'Alpha'); completed++;
  const { task } = await request('/tasks', 'POST', { taskTitle: 'PG task', priority: 'Trung bình', dueDate: '2026-12-31', assigneeId: login.user.id, checklist: ['First', 'Second'] }, 201);
  assert.equal((await request(`/tasks/${task.key}`)).task.subtasks.length, 2); completed++;
  const documents = await Promise.all(Array.from({ length: 5 }, (_, i) => request('/documents', 'POST', { title: `PG document ${i}` }, 201)));
  assert.equal(new Set(documents.map(result => result.document.id)).size, 5); completed++;
  const route = `/documents/${documents[0].document.id}`;
  const operation = { operations: [{ transactionId: 'pg-retry', clientId: 'pg', data: 'operation' }], snapshot: { data: { blocks: [] } } };
  assert.equal((await request(`${route}/operations`, 'POST', operation)).revision, 2);
  assert.equal((await request(`${route}/operations`, 'POST', operation)).revision, 2);
  await request(`${route}/snapshots`, 'POST', { revision: 2, data: { blocks: [], updated: true } }); completed++;
  async function bank(balance) {
    return (await request('/finance/bank-accounts', 'POST', { bankName: 'PG bank', accountNumber: randomUUID(), accountHolder: 'PG', balance, status: 'Đang hoạt động' }, 201)).account;
  }
  const source = await bank(100000);
  const destination = await bank(0);
  const transferInput = { requestId: randomUUID(), sourceAccountId: source.key, destinationAccountId: destination.key, amount: 1000, fee: 0, purpose: 'PG transfer', transferDate: new Date().toISOString().slice(0, 10), transferMethod: 'Ghi sổ nội bộ' };
  const transfer = await request('/finance/internal-transfers', 'POST', transferInput, 201);
  assert.equal((await request('/finance/internal-transfers', 'POST', transferInput)).replayed, true);
  await request(`/finance/internal-transfers/${transfer.transfer.key}/cancel`, 'POST', { reason: 'PG cancellation' }); completed++;
  await request('/attendance/check-in', 'POST', { type: 'in' });
  await request('/attendance/check-in', 'POST', { type: 'out' }); completed++;
  const archive = { dispatchType: 'Văn bản đến', docType: 'Công văn', subject: 'PG archive', partner: 'PG office', docDate: '2026-10-20', dateReceivedOrIssued: '2026-10-26', urgency: 'Bình thường', securityLevel: 'Nội bộ' };
  const archives = await Promise.all(Array.from({ length: 4 }, (_, i) => request('/collections/doc_archives', 'POST', { record: { ...archive, key: `pg-archive-${i}` } }, 201)));
  assert.equal(new Set(archives.map(item => item.record.bookNumber)).size, 4); completed++;
  const docRecord = { key: 'pg-doc-register', docCode: 'PG-VB-01', title: 'PG enterprise register', docCategory: 'Công văn điều hành', direction: 'Nội bộ ban hành', issuingAuthority: 'PG office', issuedDate: '2026-10-26', effectiveDate: '2026-10-26', securityLevel: 'Nội bộ công ty', status: 'Dự thảo thẩm định' };
  await request('/collections/enterprise_documents', 'POST', { record: docRecord }, 201);
  await request('/collections/enterprise_documents/pg-doc-register', 'PATCH', { patch: { status: 'Mới ban hành' } }); completed++;
  await request('/collections/hr_rewards', 'POST', { record: { key: 'pg-reward', rewardCode: 'PG-KT-1', employeeId: login.user.id, department: 'PG', title: 'PG award', rewardType: 'Bằng khen Ban Giám Đốc', rewardValue: 0, decisionNo: 'PG-QD-1', date: '2026-10-26', status: 'Chờ duyệt' } }, 201);
  await request('/collections/hr_rewards/pg-reward', 'PATCH', { patch: { status: 'Đã ký quyết định' } });
  const awarded = await request('/collections/hr_rewards/pg-reward', 'PATCH', { patch: { status: 'Đã trao giải' } });
  assert.equal(awarded.record.awardedById, login.user.id); completed++;
  await request(`/users/${login.user.id}`, 'PATCH', { role: 'USER' }, 422);
  assert.equal((await request('/admin/backups')).capabilities.database, false); completed++;
  await request('/admin/backups', 'POST', { name: 'Unavailable PG dump', type: 'Database' }, 422);
  const company = (await request('/system/company-profile')).profile;
  const companySaved = (await request('/system/company-profile', 'PUT', { ...company, companyName: 'PG company', fullName: 'Pháp nhân PostgreSQL', taxCode: '0012345678' })).profile;
  assert.equal(companySaved.revision, 1);
  assert.equal((await request('/system/company-profile')).profile.fullName, 'Pháp nhân PostgreSQL');
  await request('/system/company-profile', 'PUT', { ...company, companyName: 'Stale' }, 409); completed++;
  const contract = (await request('/contracts', 'POST', { code: 'PG-CONTRACT', name: 'Hợp đồng PostgreSQL', contractTemplate: 'PG template', employeeCode: login.user.employeeCode, employeeName: login.user.name }, 201)).contract;
  assert.ok(contract.fileNodeId);
  const word = await fetch(`${base}/files/${contract.fileNodeId}/download`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(word.status, 200);
  assert.equal(Buffer.from(await word.arrayBuffer()).readUInt32LE(0), 0x04034b50); completed++;
  await request('/collections/hr_performance_reviews', 'POST', { record: { key: 'pg-review', code: 'PG-DG-1', employeeId: login.user.id, evaluatorId: login.user.id, department: 'PG', period: 'PG period', selfScore: 0, managerScore: 100, productivityScore: 0, disciplineScore: 0, innovationScore: 0, kpiBonus: 0 } }, 201);
  const review = (await request('/collections/hr_performance_reviews/pg-review', 'PATCH', { patch: { status: 'Đã hoàn tất đánh giá' } })).record;
  assert.equal(review.managerScore, 0); assert.equal(review.grade, 'C (Cần cải thiện)'); assert.equal(review.approvedById, login.user.id);
  await request('/collections/hr_performance_reviews/pg-review', 'DELETE', undefined, 422); completed++;
  const sessions = await request('/admin/sessions');
  const current = sessions.data.find(item => item.current);
  assert.ok(current);
  await request(`/admin/sessions/${current.key}/revoke`, 'POST', { reason: 'PG revocation' });
  await request('/auth/profile', 'GET', undefined, 401); completed++;
  console.log(JSON.stringify({ databaseEngine: 'PostgreSQL', checksPassed: completed, evidence: directory }));
} finally {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exited;
  }
  if (created) {
    await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()', [database]);
    await admin.query(`DROP DATABASE "${database}"`);
  }
  await admin.end();
}
