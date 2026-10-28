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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-attendance-summary-browser-'));
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
  SEED_ADMIN_EMAIL: 'attendance-summary@example.test', SEED_ADMIN_PASSWORD: 'Attendance-Summary-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'ATTENDANCE-SUMMARY-ADMIN', JWT_SECRET: 'attendance-summary-isolated-test-secret',
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
  const key = `timesheet-${Date.now().toString(36)}`;
  const createRecord = async record => fetch(`${apiUrl}/collections/attendance_timesheet_summary`, {
    method: 'POST', headers, body: JSON.stringify({ record }),
  });
  const invalid = await createRecord({ key: `${key}-invalid`, employeeId: admin.user.id, month: '2026-02', standardDays: 29, actualDays: 0, paidLeaveDays: 0, unpaidLeaveDays: 0 });
  assert.equal(invalid.status, 422, 'Standard workdays must not exceed the calendar days in the selected month.');
  const created = await createRecord({
    key, employeeId: admin.user.id, month: '2026-02', position: 'QA',
    standardDays: 20, actualDays: 17, paidLeaveDays: 2, unpaidLeaveDays: 1,
    otHoursWeekday: 1.5, otHoursWeekend: 2, status: 'Chờ đối soát',
  });
  const createdBody = await created.json();
  assert.equal(created.status, 201, JSON.stringify(createdBody));
  const employeeCode = createdBody.record.employeeCode || createdBody.record.empCode;
  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/collections/attendance_timesheet_summary')) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 1050 });
  await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: token, user: admin.user });
  await page.goto(`${webUrl}/admin/attendance/timesheet/summary`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(code => document.body.innerText.includes(code) && document.body.innerText.includes('19 / 20 Công'), { timeout: 30000 }, employeeCode);
  assert.equal(await page.$eval('body', node => node.innerText.includes('Được trích xuất từ 31 ngày chấm công chi tiết')), false);

  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Chi tiết')?.click());
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-drawer-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Cấu Thành Ngày Công Tính Lương')));
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-drawer-root')].some(root => root.innerText.includes('19 / 20 Công') && root.innerText.includes('Chờ đối soát')));
  await page.evaluate(() => [...document.querySelectorAll('.ant-drawer-root button')].find(button => button.textContent.trim() === 'Khóa Số Liệu & Chuẩn Bị Bảng Lương')?.click());

  let saved;
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await fetch(`${apiUrl}/collections/attendance_timesheet_summary?limit=500`, { headers });
    assert.equal(response.status, 200);
    saved = (await response.json()).data.find(item => item.key === key);
    if (saved?.status === 'Đã khóa công') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(saved?.status, 'Đã khóa công');
  assert.equal(saved.lockedBy, admin.user.name);
  assert.ok(saved.lockedAt);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(code => document.body.innerText.includes(code) && document.body.innerText.includes('Đã khóa công'), { timeout: 30000 }, employeeCode);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(apiErrors, []);
  console.log(JSON.stringify({ checks: 'month-specific workday validation, variable standard-day display, truthful KPI text, server-side lock actor/time and reload persistence', key, database: directory }));
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
