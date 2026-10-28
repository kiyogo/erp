import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = path.resolve(apiDir, '..', 'web');
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-admin-audit-'));
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
  SEED_ADMIN_EMAIL: 'admin-audit-browser@example.test', SEED_ADMIN_PASSWORD: 'Audit-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'AUDIT-ADMIN', JWT_SECRET: 'isolated-admin-audit-browser-test-secret',
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
  const marker = `browser-audit-${Date.now()}`;
  for (const [action, suffix, details] of [
    ['create_audit_probe', '', { marker, source: 'browser-test' }],
    ['update_audit_probe', '-updated', { marker, changed: true }],
  ]) {
    const response = await fetch(`${apiUrl}/audit-events`, {
      method: 'POST', headers, body: JSON.stringify({ action, module: 'audit_browser_test', detail: `${marker}${suffix}`, details }),
    });
    assert.equal(response.status, 201, await response.text());
  }

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  const cdp = await page.target().createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/admin/audit-logs')) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 950 });
  await page.evaluateOnNewDocument(({ accessToken, user }) => {
    localStorage.setItem('minepanel_token', accessToken);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { accessToken: token, user: admin.user });

  await page.goto(`${webUrl}/admin/audit-logs`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 15000 }, marker);

  const search = await page.$('input[placeholder="Tìm tài khoản, hành động, mã sự kiện, phân hệ..."]');
  assert.ok(search, 'Audit search input must be visible.');
  await search.type(marker);
  await page.waitForFunction(value => document.querySelectorAll('tbody tr').length === 2 && document.body.innerText.includes(value), { timeout: 10000 }, marker);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Thao tác nhạy cảm')?.click());
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1 && document.body.innerText.includes('update_audit_probe'), { timeout: 10000 });
  await page.evaluate(() => document.querySelector('tbody tr button')?.click());
  await page.waitForFunction(() => document.body.innerText.includes('Dữ liệu chi tiết do máy chủ ghi nhận') && document.body.innerText.includes('changed'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Tải dữ liệu JSON')?.click());
  let jsonFile = '';
  for (let attempt = 0; attempt < 100; attempt += 1) {
    jsonFile = readdirSync(downloadDir).find(name => name.endsWith('.json')) || '';
    if (jsonFile) break;
    await delay(100);
  }
  assert.ok(jsonFile, 'Event detail must download as JSON.');
  assert.equal(JSON.parse(readFileSync(path.join(downloadDir, jsonFile), 'utf8')).action, 'update_audit_probe');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Tải biên bản PDF')?.click());
  let pdfFile = '';
  for (let attempt = 0; attempt < 100; attempt += 1) {
    pdfFile = readdirSync(downloadDir).find(name => name.endsWith('.pdf')) || '';
    if (pdfFile) break;
    await delay(100);
  }
  assert.ok(pdfFile, 'Event detail must download as PDF.');
  assert.ok(readFileSync(path.join(downloadDir, pdfFile)).subarray(0, 8).toString('ascii').startsWith('%PDF-1.4'), 'PDF export must be a valid PDF document.');

  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Xuất nhật ký')?.click());
  let xlsxFile = '';
  for (let attempt = 0; attempt < 100; attempt += 1) {
    xlsxFile = readdirSync(downloadDir).find(name => name.endsWith('.xlsx')) || '';
    if (xlsxFile) break;
    await delay(100);
  }
  assert.ok(xlsxFile, 'Filtered audit events must download as XLSX.');
  assert.ok(statSync(path.join(downloadDir, xlsxFile)).size > 100, 'XLSX export must contain event data.');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(apiErrors, []);
  console.log(JSON.stringify({ checks: 'audit route, server search and category filter, real event detail, JSON/PDF downloads, filtered XLSX export', jsonBytes: statSync(path.join(downloadDir, jsonFile)).size, pdfBytes: statSync(path.join(downloadDir, pdfFile)).size, xlsxBytes: statSync(path.join(downloadDir, xlsxFile)).size }));
} catch (error) {
  console.error(`${error.stack || error}\n${logs}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of [vite, api]) if (child.exitCode === null) child.kill();
  await delay(100);
  for (const child of [vite, api]) if (child.exitCode === null) child.kill('SIGKILL');
}
