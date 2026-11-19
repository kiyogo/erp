import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-sla-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'sla@example.test', SEED_ADMIN_PASSWORD: 'Sla-Test-26!Secure', SEED_ADMIN_EMPLOYEE_CODE: 'TEST-SLA', JWT_SECRET: 'isolated-sla-test-secret',
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
const login = await (await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }) })).json();
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.access_token || login.token}` };
async function call(route, method = 'GET', payload) {
  const response = await fetch(`${base}${route}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}
const commitment = { slaCode: 'sla-001', serviceName: 'Máy chủ lưu trữ', clientTier: 'Vàng', uptimeTarget: 99.9, responseTimeTarget: '15 phút', mttrTarget: '2 giờ', penaltyClause: 'Hoàn 10% phí tháng', measurements: [] };

test('cam kết SLA mới chưa có số liệu đo thì trạng thái là chưa có số liệu, không tự điền uptime', async () => {
  const created = await call('/collections/services_sla', 'POST', { record: commitment });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.record.slaCode, 'SLA-001');
  assert.equal(created.body.record.status, 'Chưa có số liệu đo');
  assert.deepEqual(created.body.record.measurements, []);
  assert.equal(created.body.record.actualUptime, undefined);
  assert.equal((await call('/collections/services_sla', 'POST', { record: commitment })).status, 409, 'mã trùng bị từ chối');
});

test('trạng thái luôn suy ra từ kỳ đo gần nhất và kỳ đo được kiểm tra', async () => {
  const key = (await call('/collections/services_sla?limit=10')).body.data[0].key;
  const measure = (entry) => call(`/collections/services_sla/${key}`, 'PATCH', { patch: { measurements: entry } });
  const good = await measure([{ period: '2026-09', uptime: 99.95, incidents: 0, compensation: 0, mttr: '30 phút' }]);
  assert.equal(good.status, 200, JSON.stringify(good.body));
  assert.equal(good.body.record.status, 'Đạt cam kết');
  assert.ok(good.body.record.measurements[0].recordedAt);
  const bad = await measure([...good.body.record.measurements, { period: '2026-10', uptime: 99.1, incidents: 3, compensation: 5000000 }]);
  assert.equal(bad.body.record.status, 'Vi phạm cam kết');
  assert.equal(bad.body.record.measurements[0].recordedAt, good.body.record.measurements[0].recordedAt, 'kỳ cũ giữ nguyên dấu vết ghi nhận');
  for (const invalid of [
    [{ period: '2026-13', uptime: 99, incidents: 0 }],
    [{ period: '2026-09', uptime: 101, incidents: 0 }],
    [{ period: '2026-09', uptime: 99, incidents: -1 }],
    [{ period: '2026-09', uptime: 99, incidents: 0, compensation: -5 }],
    [{ period: '2026-09', uptime: 99, incidents: 0 }, { period: '2026-09', uptime: 98, incidents: 1 }],
  ]) assert.equal((await measure(invalid)).status, 422, JSON.stringify(invalid));
  assert.equal((await call(`/collections/services_sla/${key}`, 'PATCH', { patch: { uptimeTarget: 50 } })).status, 422);
});
