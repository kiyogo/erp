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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-admin-trash-'));
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
  SEED_ADMIN_EMAIL: 'admin-trash-browser@example.test', SEED_ADMIN_PASSWORD: 'Trash-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'TRASH-ADMIN', JWT_SECRET: 'isolated-admin-trash-browser-test-secret',
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
const apiErrors = [];

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
  const token = admin.token || admin.access_token;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  async function apiRequest(route, method = 'GET', payload, expected = 200, accessToken = token) {
    const response = await fetch(`${apiUrl}${route}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const body = await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
    return body;
  }

  const firstKey = `trash-restore-${Date.now()}`;
  const firstRecord = (await apiRequest('/collections/trash_browser_test', 'POST', { record: { key: firstKey, name: 'Hồ sơ cần khôi phục' } }, 201)).record;
  const firstDeletion = await apiRequest(`/collections/trash_browser_test/${encodeURIComponent(firstKey)}`, 'DELETE');
  await apiRequest('/users', 'POST', {
    email: 'trash-browser-user@example.test', name: 'Nhân viên kiểm tra quyền',
    password: 'Trash-Browser-User-26!Secure', employeeCode: 'TRASH-BROWSER-USER', role: 'USER',
  }, 201);
  const viewer = await apiRequest('/auth/login', 'POST', { email: 'trash-browser-user@example.test', password: 'Trash-Browser-User-26!Secure' });
  const viewerToken = viewer.token || viewer.access_token;
  await apiRequest('/admin/trash', 'GET', undefined, 403, viewerToken);

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/admin/trash')) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 950 });
  await page.evaluateOnNewDocument(({ accessToken, user }) => {
    localStorage.setItem('minepanel_token', accessToken);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { accessToken: token, user: admin.user });

  await page.goto(`${webUrl}/admin/trash`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Thùng rác'));
  await page.waitForFunction(value => [...document.querySelectorAll('tbody tr')].some(row => row.innerText.includes(value)), { timeout: 15000 }, firstKey);
  const firstRow = await page.$(`tbody tr`);
  assert.ok(firstRow);
  const restoreResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes(`/admin/trash/${firstDeletion.trashItemId}/restore`), { timeout: 10000 });
  await page.evaluate(value => {
    const row = [...document.querySelectorAll('tbody tr')].find(item => item.innerText.includes(value));
    [...(row?.querySelectorAll('button') || [])].find(button => button.textContent.trim() === 'Khôi phục')?.click();
  }, firstKey);
  const restoredResponse = await restoreResponse;
  assert.equal(restoredResponse.status(), 200);
  await page.waitForFunction(value => document.body.innerText.includes(`Đã khôi phục “Hồ sơ cần khôi phục”`) && ![...document.querySelectorAll('tbody tr')].some(row => row.innerText.includes(value)), { timeout: 15000 }, firstKey);
  assert.ok((await apiRequest('/collections/trash_browser_test')).data.some(item => item.key === firstKey && item.name === firstRecord.name));

  const secondKey = `trash-purge-${Date.now()}`;
  await apiRequest('/collections/trash_browser_test', 'POST', { record: { key: secondKey, name: 'Hồ sơ xóa vĩnh viễn' } }, 201);
  const secondDeletion = await apiRequest(`/collections/trash_browser_test/${encodeURIComponent(secondKey)}`, 'DELETE');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Làm mới')?.click());
  await page.waitForFunction(value => [...document.querySelectorAll('tbody tr')].some(row => row.innerText.includes(value)), { timeout: 15000 }, secondKey);
  await page.evaluate(value => {
    const row = [...document.querySelectorAll('tbody tr')].find(item => item.innerText.includes(value));
    [...(row?.querySelectorAll('button') || [])].find(button => button.textContent.trim() === 'Xóa vĩnh viễn')?.click();
  }, secondKey);
  await page.waitForFunction(() => document.body.innerText.includes('Xóa vĩnh viễn bản ghi?'));
  await page.evaluate(() => [...document.querySelectorAll('.ant-modal button')].find(button => button.textContent.trim() === 'Xóa vĩnh viễn')?.click());
  await page.waitForFunction(value => document.body.innerText.includes('Đã xóa vĩnh viễn “Hồ sơ xóa vĩnh viễn”') && ![...document.querySelectorAll('tbody tr')].some(row => row.innerText.includes(value)), { timeout: 15000 }, secondKey);
  assert.equal((await apiRequest(`/admin/trash?q=${encodeURIComponent(secondKey)}`)).pagination.total, 0);
  assert.equal((await apiRequest('/collections/trash_browser_test')).data.some(item => item.key === secondKey), false);
  await apiRequest(`/admin/trash/${encodeURIComponent(secondDeletion.trashItemId)}/restore`, 'POST', {}, 404);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(apiErrors, []);
  console.log(JSON.stringify({ checks: 'admin-only trash listing, browser restore and permanent delete, restored record persistence, removal from trash', restoredKey: firstKey, purgedKey: secondKey }));
} catch (error) {
  console.error(`${error.stack || error}\n${logs}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of [vite, api]) if (child.exitCode === null) child.kill();
  await delay(100);
  for (const child of [vite, api]) if (child.exitCode === null) child.kill('SIGKILL');
}
