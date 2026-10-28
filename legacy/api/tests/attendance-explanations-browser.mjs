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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-attendance-explanations-browser-'));
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
  SEED_ADMIN_EMAIL: 'attendance-explanations-browser@example.test', SEED_ADMIN_PASSWORD: 'Attendance-Explanations-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'ATTENDANCE-EXPLANATIONS-BROWSER-ADMIN', JWT_SECRET: 'attendance-explanations-browser-isolated-test-secret',
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
let employeePage;
let adminPage;
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

  async function login(email, password) {
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return { token: body.token || body.access_token, user: body.user };
  }
  const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
  const suffix = Date.now().toString(36).toUpperCase();
  const employeePassword = 'Attendance-Explanation-Employee-26!Secure';
  const createUser = await fetch(`${apiUrl}/users`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` },
    body: JSON.stringify({ email: `attendance-explanation-${suffix.toLowerCase()}@example.test`, name: `NV giải trình ${suffix}`, employeeCode: `ATT-EXPL-${suffix}`, role: 'USER', password: employeePassword }),
  });
  const createdUser = await createUser.json();
  assert.equal(createUser.status, 201, JSON.stringify(createdUser));
  const employee = await login(createdUser.user.email, employeePassword);

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  const employeeContext = await browser.createBrowserContext();
  const adminContext = await browser.createBrowserContext();
  employeePage = await employeeContext.newPage();
  adminPage = await adminContext.newPage();
  for (const page of [employeePage, adminPage]) {
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400 && response.url().includes('/collections/attendance_explanations')) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
    });
    await page.setViewport({ width: 1440, height: 1050 });
  }

  await employeePage.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
    localStorage.setItem(`kiyovn_profile_wizard_v4:${encodeURIComponent(user.email.trim().toLowerCase())}:done`, 'true');
  }, { value: employee.token, user: employee.user });
  await employeePage.goto(`${webUrl}/employee/timesheet`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await employeePage.waitForFunction(() => document.body.innerText.includes('Đơn giải trình của tôi') && [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Giải trình công'), { timeout: 30000 });
  await employeePage.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Giải trình công')?.click());
  await employeePage.waitForSelector('.ant-modal-root .kiyovn-datepicker-input', { visible: true, timeout: 15000 });
  const date = await employeePage.$eval('.ant-modal-root .kiyovn-datepicker-input', node => node.textContent.trim());
  const note = 'Có mặt tại văn phòng, quên quẹt thẻ đầu ca.';
  await employeePage.$eval('.ant-modal-root textarea', (node, value) => {
    const input = node;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, note);
  await employeePage.evaluate(() => [...document.querySelectorAll('.ant-modal-root button')].find(button => button.textContent.trim() === 'Gửi đơn giải trình')?.click());
  await employeePage.waitForFunction(([value, submittedNote]) => document.body.innerText.includes(value)
    && document.body.innerText.includes('Chờ duyệt') && document.body.innerText.includes(submittedNote), { timeout: 30000 }, [date, note]);

  await adminPage.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: admin.token, user: admin.user });
  await adminPage.goto(`${webUrl}/admin/attendance/alerts`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await adminPage.waitForFunction(([employeeName, day, submittedNote]) => document.body.innerText.includes('Giải trình nhân viên gửi')
    && document.body.innerText.includes(employeeName) && document.body.innerText.includes(day) && document.body.innerText.includes(submittedNote), { timeout: 30000 }, [createdUser.user.name, date, note]);
  const approvedFromUi = await adminPage.evaluate(employeeName => {
    const row = [...document.querySelectorAll('tr')].find(item => item.innerText.includes(employeeName));
    const button = [...(row?.querySelectorAll('button') || [])].find(item => item.textContent.trim() === 'Duyệt');
    button?.click();
    return Boolean(button);
  }, createdUser.user.name);
  assert.equal(approvedFromUi, true, 'Admin should be able to approve a pending employee submission.');
  await adminPage.waitForFunction(([employeeName, adminName]) => {
    const row = [...document.querySelectorAll('tr')].find(item => item.innerText.includes(employeeName));
    return Boolean(row && row.innerText.includes('Đã duyệt') && row.innerText.includes(adminName));
  }, { timeout: 30000 }, [createdUser.user.name, admin.user.name]);

  const recordResponse = await fetch(`${apiUrl}/collections/attendance_explanations?limit=100`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  assert.equal(recordResponse.status, 200);
  const savedRecord = (await recordResponse.json()).data.find(record => record.employeeId === employee.user.id && record.date === date);
  assert.equal(savedRecord?.status, 'Đã duyệt');
  assert.equal(savedRecord?.reviewedBy, admin.user.name);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(apiErrors, []);
  console.log(JSON.stringify({ checks: 'employee submits and tracks an explanation; admin reviews it in the legacy web; reviewer and status persist; no browser or collection API errors', key: savedRecord.key, database: directory }));
} catch (error) {
  if (employeePage) {
    console.error('Employee page:', (await employeePage.$eval('body', node => node.innerText).catch(() => '')).slice(-2500));
    await employeePage.screenshot({ path: path.join(directory, 'employee-failure.png'), fullPage: true }).catch(() => {});
  }
  if (adminPage) {
    console.error('Admin page:', (await adminPage.$eval('body', node => node.innerText).catch(() => '')).slice(-2500));
    await adminPage.screenshot({ path: path.join(directory, 'admin-failure.png'), fullPage: true }).catch(() => {});
  }
  console.error('Browser errors:', JSON.stringify(pageErrors));
  console.error('Collection API errors:', JSON.stringify(apiErrors));
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
