import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = path.resolve(apiDir, '..', 'web');
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-admin-usage-'));
const downloadDir = path.join(directory, 'downloads');
mkdirSync(downloadDir);
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
  SEED_ADMIN_EMAIL: 'usage-browser@example.test', SEED_ADMIN_PASSWORD: 'Usage-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'USAGE-ADMIN', JWT_SECRET: 'admin-usage-isolated-browser-test-secret',
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
const usageApiErrors = [];
try {
  for (const [url, child] of [[`${apiUrl}/health`, api], [webUrl, vite]]) {
    let ready = false;
    for (let attempt = 0; attempt < 450; attempt++) {
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
  async function usageReport(application, period = 'this_week') {
    const response = await fetch(`${apiUrl}/admin/usage?application=${application}&period=${period}`, { headers });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  }

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  const cdp = await page.target().createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/admin/usage')) usageApiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 950 });
  await page.evaluateOnNewDocument(({ accessToken, user }) => {
    localStorage.setItem('minepanel_token', accessToken);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { accessToken: token, user: admin.user });

  await page.goto(`${webUrl}/admin/finance/cash/flow`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.length > 0);
  let financeReport;
  for (let attempt = 0; attempt < 30; attempt++) {
    financeReport = await usageReport('finance');
    if (financeReport.data.some(row => row.userId === admin.user.id && row.operationCount > 0)) break;
    await delay(100);
  }
  const financeUse = financeReport.data.find(row => row.userId === admin.user.id);
  assert.ok(financeUse?.operationCount > 0, 'Finance route visit must be recorded against the authenticated admin.');
  assert.equal(financeUse.email, admin.user.email);
  assert.equal(financeUse.loginCount, 1);

  await page.goto(`${webUrl}/admin/system/usage`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('Tình hình sử dụng') && document.body.innerText.includes('Người đã đăng nhập'));
  await page.waitForFunction(email => document.body.innerText.includes(email), { timeout: 15000 }, admin.user.email);
  await page.evaluate(() => [...document.querySelectorAll('.ant-select')]
    .find(select => select.querySelector('.ant-select-selector')?.textContent.includes('Tất cả ứng dụng'))?.click());
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-select-dropdown .ant-select-item')].some(item => item.textContent.trim() === 'Tài chính'));
  await page.evaluate(() => [...document.querySelectorAll('.ant-select-dropdown .ant-select-item')].find(item => item.textContent.trim() === 'Tài chính')?.click());
  await page.waitForFunction(() => document.body.innerText.includes('Lần cuối sử dụng'));
  await page.waitForFunction(email => document.body.innerText.includes(email), { timeout: 15000 }, admin.user.email);
  await page.evaluate(() => [...document.querySelectorAll('.ant-select')]
    .find(select => select.querySelector('.ant-select-selector')?.textContent.includes('Tuần này'))?.click());
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-select-dropdown .ant-select-item')].some(item => item.textContent.trim() === 'Tất cả thời gian'));
  await page.evaluate(() => [...document.querySelectorAll('.ant-select-dropdown .ant-select-item')].find(item => item.textContent.trim() === 'Tất cả thời gian')?.click());
  await page.waitForFunction(() => document.body.innerText.includes('Khoảng thời gian: 1970-01-01'));

  const search = await page.$('input[placeholder="Tìm họ tên, email hoặc đơn vị..."]');
  assert.ok(search, 'Usage report search input must be visible.');
  await search.type(admin.user.email);
  await page.waitForFunction(email => [...document.querySelectorAll('tbody tr')].some(row => row.innerText.includes(email)), { timeout: 10000 }, admin.user.email);

  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Đã thao tác')?.click());
  await page.waitForFunction(email => document.body.innerText.includes(email), { timeout: 10000 }, admin.user.email);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Xuất dữ liệu')?.click());
  let downloaded = '';
  for (let attempt = 0; attempt < 100; attempt++) {
    downloaded = readdirSync(downloadDir).find(name => name.endsWith('.xlsx')) || '';
    if (downloaded) break;
    await delay(100);
  }
  assert.ok(downloaded, 'Export must download an XLSX file.');
  assert.ok(statSync(path.join(downloadDir, downloaded)).size > 100, 'Exported XLSX must contain data.');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(usageApiErrors, []);
  console.log(JSON.stringify({ checks: 'route activity capture, login/session aggregation, application and period filters, account search, activity tabs, XLSX export', financeOperationCount: financeUse.operationCount, exportedFileBytes: statSync(path.join(downloadDir, downloaded)).size }));
} catch (error) {
  console.error(`${error.stack || error}\n${logs}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of [vite, api]) if (child.exitCode === null) child.kill();
  await delay(100);
  for (const child of [vite, api]) if (child.exitCode === null) child.kill('SIGKILL');
}
