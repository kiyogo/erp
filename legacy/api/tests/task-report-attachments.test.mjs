import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-task-report-attachments-'));
mkdirSync(path.join(directory, 'files'));
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
  KIYOVN_DATA_DIR: directory,
  KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'),
  KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'task-report-attachments@example.test',
  SEED_ADMIN_PASSWORD: 'Task-Report-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-TASK-REPORT-ATTACHMENTS',
  JWT_SECRET: 'isolated-task-report-attachments-test-secret',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs = (logs + chunk).slice(-10000); });
server.stderr.on('data', chunk => { logs = (logs + chunk).slice(-10000); });
after(async () => {
  if (server.exitCode === null) {
    const exit = new Promise(resolve => server.once('exit', resolve));
    server.kill();
    await exit;
  }
  rmSync(directory, { recursive: true, force: true });
});

const base = `http://127.0.0.1:${port}/api/v1`;
for (let attempt = 0; attempt < 100; attempt += 1) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (server.exitCode !== null || attempt === 99) throw new Error(logs || 'Task report attachment API did not start.');
  await new Promise(resolve => setTimeout(resolve, 100));
}

async function jsonRequest(route, { token, method = 'GET', payload, expected = 200 } = {}) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  const body = await response.json();
  assert.equal(response.status, expected, `${JSON.stringify(body)}\n${logs}`);
  return body;
}

async function login(email, password) {
  const result = await jsonRequest('/auth/login', { method: 'POST', payload: { email, password } });
  return result.access_token || result.token;
}

async function createUser(adminToken, suffix) {
  const result = await jsonRequest('/users', {
    token: adminToken,
    method: 'POST',
    expected: 201,
    payload: {
      name: `Nhân sự kiểm tra ${suffix}`,
      email: `task-report-${suffix}@example.test`,
      employeeCode: `TASK-REPORT-${suffix.toUpperCase()}`,
      password: 'Task-User-26!Secure',
      role: 'USER',
    },
  });
  return result.user;
}

async function uploadReportFile(token, name, bytes) {
  const response = await fetch(`${base}/files/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      'X-File-Name': encodeURIComponent(name),
      'X-Origin-Module': 'task-report',
    },
    body: bytes,
  });
  const result = await response.json();
  assert.equal(response.status, 201, `${JSON.stringify(result)}\n${logs}`);
  return result.file;
}

test('task report attachments require real owned files and obey task access', async () => {
  const adminToken = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
  const assignee = await createUser(adminToken, 'assignee');
  const collaborator = await createUser(adminToken, 'collaborator');
  const outsider = await createUser(adminToken, 'outsider');
  const taskResult = await jsonRequest('/tasks', {
    token: adminToken,
    method: 'POST',
    expected: 201,
    payload: {
      taskTitle: 'Kiểm tra tệp báo cáo nhiệm vụ',
      priority: 'Cao',
      dueDate: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      assigneeId: assignee.id,
      collaboratorIds: [collaborator.id],
    },
  });
  const task = taskResult.task;
  const assigneeToken = await login(assignee.email, 'Task-User-26!Secure');
  const collaboratorToken = await login(collaborator.email, 'Task-User-26!Secure');
  const outsiderToken = await login(outsider.email, 'Task-User-26!Secure');
  const bytes = Buffer.from('Nội dung tệp báo cáo thật\nDữ liệu bàn giao.');
  const uploadedFile = await uploadReportFile(assigneeToken, 'bien-ban.txt', bytes);

  const savedReport = await jsonRequest(`/tasks/${encodeURIComponent(task.key)}/reports`, {
    token: assigneeToken,
    method: 'POST',
    expected: 201,
    payload: {
      content: 'Đã đính kèm biên bản.',
      progress: 35,
      status: 'Đang thực hiện',
      attachments: [{ id: 'metadata-do-client-gui', key: uploadedFile.id, name: 'ten-gia.txt', size: 1, type: 'text/plain' }],
    },
  });
  const attachment = savedReport.task.reports[0].attachments[0];
  assert.deepEqual(attachment, {
    id: uploadedFile.id,
    key: uploadedFile.id,
    name: 'bien-ban.txt',
    size: bytes.length,
    type: 'application/octet-stream',
  }, 'saved attachment metadata must come from the server-side file node');

  const assigneeDownload = await fetch(`${base}/files/${uploadedFile.id}/download`, { headers: { Authorization: `Bearer ${assigneeToken}` } });
  assert.equal(assigneeDownload.status, 200);
  assert.deepEqual(Buffer.from(await assigneeDownload.arrayBuffer()), bytes);
  const collaboratorDownload = await fetch(`${base}/files/${uploadedFile.id}/download`, { headers: { Authorization: `Bearer ${collaboratorToken}` } });
  assert.equal(collaboratorDownload.status, 200, 'task collaborators can download report attachments');
  assert.deepEqual(Buffer.from(await collaboratorDownload.arrayBuffer()), bytes);
  const outsiderDownload = await fetch(`${base}/files/${uploadedFile.id}/download`, { headers: { Authorization: `Bearer ${outsiderToken}` } });
  assert.equal(outsiderDownload.status, 404, 'users outside the task cannot download its attachments');

  await jsonRequest(`/tasks/${encodeURIComponent(task.key)}/reports`, {
    token: assigneeToken,
    method: 'POST',
    expected: 404,
    payload: { content: '', progress: 35, status: 'Đang thực hiện', attachments: [{ key: 'missing-file-id' }] },
  });

  const outsiderFile = await uploadReportFile(outsiderToken, 'tep-nguoi-khac.bin', Buffer.from('private'));
  await jsonRequest(`/tasks/${encodeURIComponent(task.key)}/reports`, {
    token: assigneeToken,
    method: 'POST',
    expected: 404,
    payload: { content: '', progress: 35, status: 'Đang thực hiện', attachments: [{ key: outsiderFile.id }] },
  });

  for (const [method, payload, expectedMessage] of [
    ['DELETE', undefined, /không thể xóa tệp/i],
    ['PATCH', { name: 'doi-ten.txt' }, /không thể đổi tên tệp/i],
  ]) {
    const response = await fetch(`${base}/files/${uploadedFile.id}`, {
      method,
      headers: { Authorization: `Bearer ${assigneeToken}`, ...(payload ? { 'Content-Type': 'application/json' } : {}) },
      body: payload ? JSON.stringify(payload) : undefined,
    });
    assert.equal(response.status, 409);
    assert.match((await response.json()).message, expectedMessage);
  }
  const updateContent = await fetch(`${base}/files/${uploadedFile.id}/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${assigneeToken}`, 'Content-Type': 'application/octet-stream' },
    body: Buffer.from('changed'),
  });
  assert.equal(updateContent.status, 409, 'report file bytes cannot be changed after submission');

  const missingBytesFile = await uploadReportFile(assigneeToken, 'thieu-noi-dung.txt', Buffer.from('temporary'));
  unlinkSync(path.join(env.KIYOVN_FILES_DIR, `${missingBytesFile.id}.bin`));
  await jsonRequest(`/tasks/${encodeURIComponent(task.key)}/reports`, {
    token: assigneeToken,
    method: 'POST',
    expected: 422,
    payload: { content: '', progress: 35, status: 'Đang thực hiện', attachments: [{ key: missingBytesFile.id }] },
  });

  const adminFile = await uploadReportFile(adminToken, 'bien-ban-quan-tri.txt', Buffer.from('Tệp do quản trị viên tải lên.'));
  const adminReport = await jsonRequest(`/tasks/${encodeURIComponent(task.key)}/reports`, {
    token: adminToken,
    method: 'POST',
    expected: 201,
    payload: { content: 'Quản trị viên bổ sung biên bản.', progress: 50, status: 'Đang thực hiện', attachments: [{ key: adminFile.id }] },
  });
  assert.equal(adminReport.task.reports[0].attachments[0].name, 'bien-ban-quan-tri.txt');
});
