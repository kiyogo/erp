import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = path.resolve(apiDir, '..', 'web');
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-attendance-raw-browser-'));
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
  ...process.env,
  USE_SQLITE: 'true', DATABASE_URL: '', PORT: String(apiPort), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'attendance-raw-browser@example.test', SEED_ADMIN_PASSWORD: 'Attendance-Raw-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'ATTENDANCE-RAW-BROWSER-ADMIN', JWT_SECRET: 'attendance-raw-browser-isolated-test-secret',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd: apiDir, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const api = spawn(process.execPath, ['index.mjs'], { cwd: apiDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const vite = spawn(process.execPath, [path.join(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(webPort), '--strictPort', '--host', '127.0.0.1'], {
  cwd: webDir, env: { ...process.env, VITE_API_URL: apiUrl }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
for (const child of [api, vite]) {
  child.stdout.on('data', chunk => { logs = (logs + chunk).slice(-10000); });
  child.stderr.on('data', chunk => { logs = (logs + chunk).slice(-10000); });
}

let browser;
let page;
const pageErrors = [];
const apiErrors = [];
try {
  for (const [url, child] of [[`${apiUrl}/health`, api], [webUrl, vite]]) {
    let ready = false;
    for (let attempt = 0; attempt < 450; attempt++) {
      try { ready = (await fetch(url)).ok; } catch {}
      if (ready) break;
      if (child.exitCode !== null) throw new Error(logs);
      await new Promise(resolve => setTimeout(resolve, 100));
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
  const suffix = Date.now().toString(36).toUpperCase();
  const rows = [
    { key: `duplicate-${suffix}`, logId: `LOG-DUP-${suffix}`, terminalName: 'Import test terminal', terminalIp: '192.0.2.20', cardUid: 'DUP-UID', employeeCode: 'TEST-DUP', employeeName: 'Duplicate Test', department: 'QA', timestamp: '2026-02-01T08:00:00', verifyMode: 'Thẻ Từ NFC', matchScore: 100, status: 'Bản ghi trùng lặp (Đã lọc)' },
    { key: `pending-${suffix}`, logId: `LOG-PENDING-${suffix}`, terminalName: 'Import test terminal', terminalIp: '192.0.2.20', cardUid: 'PENDING-UID', employeeCode: 'TEST-PENDING', employeeName: 'Pending Test', department: 'QA', timestamp: '2026-02-01T08:05:00', verifyMode: 'Thẻ Từ NFC', matchScore: 98, status: 'Cần kiểm tra' },
  ];
  for (const record of rows) {
    const response = await fetch(`${apiUrl}/collections/attendance_raw_data`, { method: 'POST', headers, body: JSON.stringify({ record }) });
    assert.equal(response.status, 201, await response.text());
  }

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/collections/attendance_raw_data')) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: token, user: admin.user });
  await page.goto(`${webUrl}/admin/attendance/timesheet/data`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(logId => document.body.innerText.includes(logId) && document.body.innerText.includes('1 Bản ghi'), { timeout: 30000 }, rows[0].logId);
  assert.equal(await page.$eval('body', node => node.innerText.includes('Trích xuất trực tiếp từ các cổng kiểm soát')), false);
  const search = await page.$('input[placeholder="Tìm theo mã log, tên nhân sự, thiết bị..."]');
  assert.ok(search, 'Raw log search should be available.');
  await search.type(rows[0].logId);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Payload')?.click());
  await page.waitForFunction(logId => [...document.querySelectorAll('.ant-drawer-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes(logId)), { timeout: 15000 }, rows[0].logId);
  const duplicateActions = await page.$$('.ant-drawer-root button');
  const disabledDuplicate = await Promise.all(duplicateActions.map(button => button.evaluate(node => ({ text: node.textContent.trim(), disabled: node.disabled }))));
  assert.ok(disabledDuplicate.some(button => button.text.includes('Log trùng lặp không được tính công') && button.disabled), 'Legacy duplicate rows must not be eligible for workday confirmation.');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(([duplicateId, pendingId]) => document.body.innerText.includes(duplicateId) && document.body.innerText.includes(pendingId), { timeout: 30000 }, [rows[0].logId, rows[1].logId]);
  const pendingOpened = await page.evaluate(logId => {
    const row = [...document.querySelectorAll('tr')].find(item => item.innerText.includes(logId));
    const button = [...(row?.querySelectorAll('button') || [])].find(item => item.textContent.trim() === 'Payload');
    button?.click();
    return !!button;
  }, rows[1].logId);
  assert.equal(pendingOpened, true, 'The pending attendance log should be selectable in the table.');
  await page.waitForFunction(logId => [...document.querySelectorAll('.ant-drawer-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes(logId)), { timeout: 15000 }, rows[1].logId);
  await page.evaluate(() => [...document.querySelectorAll('.ant-drawer-root button')].find(button => button.textContent.trim() === 'Xác nhận hợp lệ để đối soát')?.click());

  let saved;
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await fetch(`${apiUrl}/collections/attendance_raw_data/${encodeURIComponent(rows[1].key)}`, { headers });
    assert.equal(response.status, 200);
    saved = (await response.json()).record;
    if (saved.status === 'Dữ liệu hợp lệ') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(saved?.status, 'Dữ liệu hợp lệ');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(apiErrors, []);
  console.log(JSON.stringify({ checks: 'legacy duplicate status and KPI count, duplicate confirmation disabled, pending log confirmed and persisted', duplicateKey: rows[0].key, confirmedKey: rows[1].key, database: directory }));
} catch (error) {
  if (page) {
    console.error((await page.$eval('body', node => node.innerText).catch(() => '')).slice(-3500));
    await page.screenshot({ path: path.join(directory, 'failure.png'), fullPage: true }).catch(() => {});
    console.error('Browser errors:', JSON.stringify(pageErrors));
    console.error('Collection API errors:', JSON.stringify(apiErrors));
  }
  throw error;
} finally {
  if (browser) await browser.close();
  for (const child of [vite, api]) {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
  }
}
