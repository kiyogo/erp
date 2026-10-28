import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = path.resolve(apiDir, '..', 'web');
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-system-broadcast-'));

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

const apiPort = await freePort();
let webPort = await freePort();
while (webPort === apiPort) webPort = await freePort();
const apiUrl = `http://127.0.0.1:${apiPort}/api/v1`;
const webUrl = `http://127.0.0.1:${webPort}`;
const env = {
  ...process.env, USE_SQLITE: 'true', DATABASE_URL: '', PORT: String(apiPort), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'admin-broadcast-browser@example.test', SEED_ADMIN_PASSWORD: 'Broadcast-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'BROADCAST-ADMIN', JWT_SECRET: 'isolated-system-broadcast-browser-secret',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd: apiDir, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const api = spawn(process.execPath, ['index.mjs'], { cwd: apiDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const vite = spawn(process.execPath, [path.join(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(webPort), '--strictPort', '--host', '127.0.0.1'], {
  cwd: webDir, env: { ...process.env, VITE_API_URL: apiUrl }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
for (const child of [api, vite]) {
  child.stdout.on('data', chunk => { logs = (logs + chunk).slice(-12000); });
  child.stderr.on('data', chunk => { logs = (logs + chunk).slice(-12000); });
}
let browser;
const pageErrors = [];
const broadcastErrors = [];

try {
  for (const [url, child] of [[`${apiUrl}/health`, api], [webUrl, vite]]) {
    let ready = false;
    for (let attempt = 0; attempt < 450; attempt += 1) {
      try { ready = (await fetch(url)).ok; } catch {}
      if (ready) break;
      if (child.exitCode !== null) throw new Error(logs);
      await delay(100);
    }
    if (!ready) throw new Error(`Test server did not become ready: ${url}\n${logs}`);
  }

  const loginResponse = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }),
  });
  const admin = await loginResponse.json();
  assert.equal(loginResponse.status, 200, JSON.stringify(admin));
  const adminToken = admin.token || admin.access_token;
  async function apiRequest(route, method = 'GET', payload, expected = 200, token = adminToken) {
    const response = await fetch(`${apiUrl}${route}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const body = await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
    return body;
  }

  const suffix = Date.now();
  const employee = (await apiRequest('/users', 'POST', {
    email: `browser-broadcast-${suffix}@example.test`, name: 'Nhân viên nhận tin kiểm thử',
    password: 'Broadcast-Employee-26!Secure', employeeCode: `BROWSER-BROADCAST-${suffix}`, role: 'USER',
  }, 201)).user;
  const employeeSession = await apiRequest('/auth/login', 'POST', {
    email: employee.email, password: 'Broadcast-Employee-26!Secure',
  });
  const employeeToken = employeeSession.token || employeeSession.access_token;

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/admin/system/broadcasts')) broadcastErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 950 });
  await page.evaluateOnNewDocument(({ accessToken, user }) => {
    localStorage.setItem('minepanel_token', accessToken);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
    localStorage.setItem('kiyovn_cache_system_broadcasts', JSON.stringify([{
      id: 'legacy-broadcast-browser-check',
      title: 'Bản tin cũ cần giữ lại',
      content: 'Dữ liệu lưu từ phiên bản trước.',
      channels: ['In-app'],
      createdAt: '2026-10-01',
    }]));
  }, { accessToken: adminToken, user: admin.user });
  await page.goto(`${webUrl}/admin/system/notifications`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Phát thông báo mới'));
  await page.waitForFunction(() => {
    const row = [...document.querySelectorAll('tbody tr')].find(item => item.innerText.includes('Bản tin cũ cần giữ lại'));
    return row?.innerText.includes('Bản cũ · chưa xác minh')
      && [...row.querySelectorAll('button')].slice(1).every(button => button.disabled)
      && document.body.innerText.includes('Có 1 bản tin từ dữ liệu cũ');
  }, { timeout: 15000 });
  await page.evaluate(() => {
    const row = [...document.querySelectorAll('tbody tr')].find(item => item.innerText.includes('Bản tin cũ cần giữ lại'));
    row?.querySelectorAll('button')[0]?.click();
  });
  await page.waitForFunction(() => document.body.innerText.includes('Số người nhận, lượt đọc và trạng thái gửi chưa được xác minh'));
  await page.evaluate(() => [...document.querySelectorAll('.ant-modal button')].find(button => button.textContent.trim() === 'Đóng')?.click());

  const title = `Bản tin kiểm thử ${suffix}`;
  const content = 'Nội dung được lưu cho nhân sự nhận thật.';
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Phát thông báo mới')?.click());
  await page.waitForSelector('input[placeholder^="Ví dụ: Thông báo lịch bảo trì"]');
  await page.type('input[placeholder^="Ví dụ: Thông báo lịch bảo trì"]', title);
  await page.type('textarea[placeholder^="Nhập đầy đủ nội dung thông báo"]', content);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Gửi thông báo ngay')?.click());
  await page.waitForFunction(() => document.body.innerText.includes('Xác nhận phát hành thông báo mới'));
  const createResponsePromise = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith('/admin/system/broadcasts'), { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll('.ant-modal button')].find(button => button.textContent.trim() === 'Xác nhận phát thông báo')?.click());
  const createResponse = await createResponsePromise;
  assert.equal(createResponse.status(), 201);
  const created = (await createResponse.json()).broadcast;
  assert.equal(created.status, 'Gửi một phần');
  assert.equal(created.totalRecipients, 1);
  assert.equal(created.inAppSentCount, 1);
  assert.equal(created.emailFailedCount, 1);
  await page.waitForFunction(value => document.body.innerText.includes(value) && document.body.innerText.includes('Gửi một phần'), { timeout: 15000 }, title);

  const delivered = (await apiRequest('/notifications', 'GET', undefined, 200, employeeToken)).data.find(item => item.title === title);
  assert.ok(delivered);
  assert.equal(delivered.message, content);
  await apiRequest(`/notifications/${delivered.id}/read`, 'PATCH', {}, 200, employeeToken);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Làm mới')?.click());
  await page.waitForFunction(value => {
    const row = [...document.querySelectorAll('tbody tr')].find(item => item.innerText.includes(value));
    return row?.innerText.includes('1 / 1');
  }, { timeout: 10000 }, title);

  await page.evaluate(value => {
    const row = [...document.querySelectorAll('tbody tr')].find(item => item.innerText.includes(value));
    row?.querySelectorAll('button')[2]?.click();
  }, title);
  await page.waitForFunction(() => document.body.innerText.includes('Xác nhận phát lại thông báo'));
  const resendResponsePromise = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(`/admin/system/broadcasts/${created.id}/resend`), { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll('.ant-modal button')].find(button => button.textContent.trim() === 'Xác nhận phát lại')?.click());
  const resendResponse = await resendResponsePromise;
  assert.equal(resendResponse.status(), 200);
  await page.waitForFunction(value => {
    const row = [...document.querySelectorAll('tbody tr')].find(item => item.innerText.includes(value));
    return row?.innerText.includes('0 / 1');
  }, { timeout: 15000 }, title);
  const resentNotifications = (await apiRequest('/notifications', 'GET', undefined, 200, employeeToken)).data;
  assert.equal(resentNotifications.find(item => item.id === delivered.id).read, false);

  await page.evaluate(value => {
    const row = [...document.querySelectorAll('tbody tr')].find(item => item.innerText.includes(value));
    row?.querySelectorAll('button')[3]?.click();
  }, title);
  await page.waitForFunction(() => document.body.innerText.includes('Xác nhận xóa thông báo hệ thống'));
  const deleteResponsePromise = page.waitForResponse(response => response.request().method() === 'DELETE' && response.url().endsWith(`/admin/system/broadcasts/${created.id}`), { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll('.ant-modal button')].find(button => button.textContent.trim() === 'Xóa vĩnh viễn')?.click());
  const deleteResponse = await deleteResponsePromise;
  assert.equal(deleteResponse.status(), 200);
  await page.waitForFunction(value => ![...document.querySelectorAll('tbody tr')].some(row => row.innerText.includes(value)), { timeout: 10000 }, title);
  assert.ok((await apiRequest('/notifications', 'GET', undefined, 200, employeeToken)).data.some(item => item.id === delivered.id));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(broadcastErrors, []);
  console.log(JSON.stringify({ checks: 'legacy broadcast preservation and read-only display, server-backed broadcast creation, partial SMTP status, actual employee notification, read count, resend reset, delete record while retaining delivered inbox message', broadcastId: created.id }));
} catch (error) {
  console.error(`${error.stack || error}\n${logs}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of [vite, api]) if (child.exitCode === null) child.kill();
  await delay(100);
  for (const child of [vite, api]) if (child.exitCode === null) child.kill('SIGKILL');
}
