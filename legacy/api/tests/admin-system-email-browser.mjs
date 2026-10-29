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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-admin-system-email-browser-'));
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
  SEED_ADMIN_EMAIL: 'admin-system-email-browser@example.test', SEED_ADMIN_PASSWORD: 'Admin-System-Email-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'MAIL-ADMIN', JWT_SECRET: 'isolated-admin-system-email-browser-secret',
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
const pageErrors = [];
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
  const login = await loginResponse.json();
  assert.equal(loginResponse.status, 200, JSON.stringify(login));
  const token = login.token || login.access_token;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  async function request(route, method = 'GET', payload, expected = 200) {
    const response = await fetch(`${apiUrl}${route}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
    const body = await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
    return body;
  }
  const initial = (await request('/system/email-config')).config;
  assert.equal(initial.password, '');
  assert.equal(initial.passwordConfigured, false);

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ accessToken, user }) => {
    localStorage.setItem('minepanel_token', accessToken);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
    localStorage.setItem(`kiyovn_profile_wizard_v4:${encodeURIComponent(user.email.trim().toLowerCase())}:done`, 'true');
  }, { accessToken: token, user: login.user });
  await page.goto(`${webUrl}/admin/system`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Cấu Hình Cổng Gửi Email Doanh Nghiệp'));

  async function fill(labelText, value) {
    const found = await page.evaluate(({ label, nextValue }) => {
      const item = [...document.querySelectorAll('.ant-form-item')].find(node => node.querySelector('.ant-form-item-label label')?.textContent.replace(/\s*\*$/, '').trim() === label);
      const input = item?.querySelector('input');
      if (!(input instanceof HTMLInputElement)) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, nextValue);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, { label: labelText, nextValue: value });
    assert.equal(found, true, `Missing SMTP form field: ${labelText}`);
  }
  async function select(labelText, optionText) {
    const opened = await page.evaluate(label => {
      const item = [...document.querySelectorAll('.ant-form-item')].find(node => node.querySelector('.ant-form-item-label label')?.textContent.replace(/\s*\*$/, '').trim() === label);
      const select = item?.querySelector('.ant-select');
      if (!(select instanceof HTMLElement)) return false;
      select.click(); return true;
    }, labelText);
    assert.equal(opened, true, `Missing SMTP select: ${labelText}`);
    await page.waitForSelector('.ant-select-dropdown');
    const picked = await page.evaluate(label => {
      const option = [...document.querySelectorAll('.ant-select-dropdown .ant-select-item')].find(node => node.textContent.trim() === label);
      if (!(option instanceof HTMLElement)) return false;
      option.click(); return true;
    }, optionText);
    assert.equal(picked, true, `Missing SMTP option: ${optionText}`);
  }
  async function save() {
    const responsePromise = page.waitForResponse(response => response.url().endsWith('/system/email-config') && response.request().method() === 'PUT');
    await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Lưu cấu hình email')?.click());
    const response = await responsePromise;
    const raw = await response.text();
    assert.equal(response.status(), 200, raw);
    const body = JSON.parse(raw);
    assert.equal(body.config.password, '', 'SMTP password must not be returned to the browser');
    assert.equal(body.config.passwordConfigured, true);
    return body.config;
  }

  const password = 'Browser-SMTP-26!KeepSecret';
  for (const [label, value] of [
    ['Máy chủ SMTP', 'smtp.example.test'], ['Cổng SMTP', '587'], ['Email người gửi', 'mailer@example.test'],
    ['Tên hiển thị người gửi', 'KIYOVN test mailer'], ['Tài khoản SMTP', 'mailer@example.test'],
    ['App Password SMTP', password], ['Địa chỉ cổng nhân viên', 'https://portal.example.test'],
  ]) await fill(label, value);
  let saved = await save();
  assert.equal(saved.host, 'smtp.example.test');
  assert.equal(saved.configured, true);
  assert.equal(JSON.stringify(saved).includes(password), false);
  await page.waitForFunction(() => document.querySelector('input[placeholder="Để trống để giữ mật khẩu đã lưu"]')?.value === '');
  let stored = (await request('/system/email-config')).config;
  assert.equal(stored.password, '');
  assert.equal(stored.passwordConfigured, true);
  assert.equal(JSON.stringify(stored).includes(password), false);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('Cấu Hình Cổng Gửi Email Doanh Nghiệp'));
  await fill('Máy chủ SMTP', 'mail2.example.test');
  saved = await save();
  assert.equal(saved.host, 'mail2.example.test');
  assert.equal(saved.configured, true, 'saving another setting without a password must preserve the stored credential');

  await fill('Máy chủ SMTP', '127.0.0.1');
  await fill('Cổng SMTP', '1');
  await select('Bảo mật kết nối', 'SSL/TLS');
  saved = await save();
  assert.equal(saved.security, 'SSL');
  const testPromise = page.waitForResponse(response => response.url().endsWith('/system/email-config/test') && response.request().method() === 'POST');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Gửi thử email')?.click());
  const testResponse = await testPromise;
  assert.equal(testResponse.status(), 422, 'an unavailable local SMTP service must be reported as a delivery failure');
  const testBody = await testResponse.json();
  assert.ok(testBody.message);
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ checks: 'legacy SMTP setup and save, encrypted server persistence, secret-free API/UI, password-preserving update, unavailable SMTP error handling', database: directory }));
} catch (error) {
  console.error('Page errors:', JSON.stringify(pageErrors));
  console.error('Server logs:', logs);
  throw error;
} finally {
  if (browser) await browser.close();
  for (const child of [vite, api]) {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill(); await exited;
    }
  }
}
