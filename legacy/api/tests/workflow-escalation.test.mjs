import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-workflow-escalation-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env,
  USE_SQLITE: 'true',
  PORT: String(port),
  HOST: '127.0.0.1',
  WORKFLOW_ESCALATION_INTERVAL_MS: '100',
  KIYOVN_DATA_DIR: directory,
  KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'),
  KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'workflow-escalation@example.test',
  SEED_ADMIN_PASSWORD: 'Workflow-Escalation-26!Safe',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-WORKFLOW-ESCALATION',
  JWT_SECRET: 'isolated-workflow-escalation-test-secret',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) {
    const exit = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exit;
  }
  console.log(`Workflow escalation evidence: ${directory}`);
});

const base = `http://127.0.0.1:${port}/api/v1`;
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (server.exitCode !== null || attempt === 99) throw new Error(logs);
  await new Promise(resolve => setTimeout(resolve, 100));
}
const login = await fetch(`${base}/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }),
});
assert.equal(login.status, 200);
const adminSession = await login.json();
const adminHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminSession.access_token || adminSession.token}` };

async function request(route, method = 'GET', payload, expected = 200) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: adminHeaders,
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}

test('overdue workflow sends one admin alert and preserves approval authority', async () => {
  await request('/collections/workflow_security_settings', 'POST', { record: {
    caProvider: 'not_configured', encryptionStandard: 'rsa_2048', sessionTimeout: 15,
    autoEscalate: 'yes', requireOtpForLargeBudget: 'no', dailyDigestTime: '08:00',
  } }, 201);

  const created = (await request('/collections/workflow_requests', 'POST', { record: {
    key: 'overdue-alert',
    code: 'REQ-OVERDUE-ALERT',
    workflowCode: 'WF-OVERDUE-ALERT',
    workflowName: 'Kiểm tra thông báo quá hạn',
    category: 'Tài chính & Thanh toán',
    department: 'Kiểm thử',
    summaryDetails: 'Hồ sơ dùng để kiểm tra cảnh báo SLA.',
    budgetAmount: 0,
    priority: 'Cao (P2)',
    totalLevels: 1,
    attachments: [],
    formData: {},
  } }, 201)).record;
  assert.equal(created.status, 'Chờ bạn ký duyệt');
  assert.ok(created.autoEscalateAt);

  const fixtureDb = new DatabaseSync(env.KIYOVN_DB_PATH);
  const stored = fixtureDb.prepare("SELECT id, payload_json FROM collection_records WHERE scope = 'workflow_requests' AND record_key = ?").get('overdue-alert');
  assert.ok(stored);
  const overdue = JSON.parse(stored.payload_json);
  const expiredAt = new Date(Date.now() - 60_000).toISOString();
  overdue.autoEscalateAt = expiredAt;
  overdue.slaDeadlineAt = expiredAt;
  fixtureDb.prepare('UPDATE collection_records SET payload_json = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(overdue), expiredAt, stored.id);
  fixtureDb.close();

  let alerts = [];
  for (let attempt = 0; attempt < 40; attempt++) {
    alerts = (await request('/notifications')).data.filter(notification => notification.type === 'workflow_escalation');
    if (alerts.length) break;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal(alerts.length, 1);
  assert.match(alerts[0].message, /đã quá hạn SLA tại cấp 1\/1/);
  assert.equal(alerts[0].link, '/admin/workflows/requests');

  await new Promise(resolve => setTimeout(resolve, 300));
  alerts = (await request('/notifications')).data.filter(notification => notification.type === 'workflow_escalation');
  assert.equal(alerts.length, 1, 'repeated scheduler passes must not duplicate the alert');

  const current = (await request('/collections/workflow_requests/overdue-alert')).record;
  assert.equal(current.status, 'Chờ bạn ký duyệt');
  assert.equal(current.currentLevel, 1);
  assert.equal(current.currentApproverId, created.currentApproverId);
  assert.equal(current.autoEscalationHistory.length, 1);
  assert.equal(current.autoEscalationHistory[0].recipientCount, 1);

  const auditDb = new DatabaseSync(env.KIYOVN_DB_PATH);
  const audit = auditDb.prepare("SELECT action FROM audit_events WHERE resource_scope = 'workflow_requests' AND resource_id = ? AND action = ?")
    .get('overdue-alert', 'auto_escalation_alert');
  auditDb.close();
  assert.equal(audit?.action, 'auto_escalation_alert');
});
