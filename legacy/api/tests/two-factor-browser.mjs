import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = path.resolve(apiDir, '..', 'web');
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-two-factor-browser-'));
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
  SEED_ADMIN_EMAIL: 'two-factor-browser@example.test', SEED_ADMIN_PASSWORD: 'Two-Factor-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'TWO-FACTOR-ADMIN', JWT_SECRET: 'isolated-two-factor-browser-secret',
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
function totpCode(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of secret) bits += alphabet.indexOf(character).toString(2).padStart(5, '0');
  const bytes = [];
  for (let offset = 0; offset + 8 <= bits.length; offset += 8) bytes.push(parseInt(bits.slice(offset, offset + 8), 2));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac('sha1', Buffer.from(bytes)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

try {
  for (const [url, child] of [[`${apiUrl}/health`, api], [webUrl, vite]]) {
    let ready = false;
    for (let attempt = 0; attempt < 450; attempt += 1) {
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
  const token = login.access_token || login.token;
  browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath()),
    args: ['--no-sandbox', '--disable-gpu'],
  });
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('request', request => {
    if (request.url().startsWith('https://api.qrserver.com/')) pageErrors.push('The TOTP secret was sent to an external QR service.');
  });
  await page.setViewport({ width: 1280, height: 900 });
  await page.evaluateOnNewDocument(({ accessToken, user }) => {
    localStorage.setItem('minepanel_token', accessToken);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { accessToken: token, user: login.user });
  await page.goto(webUrl + '/admin/settings/security', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Mã PIN bảo mật cá nhân'), { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Thiết lập mã PIN'), { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Thiết lập mã PIN').click());
  await page.waitForSelector('input[placeholder="Bỏ trống nếu vừa đăng nhập bằng Google"]');
  await page.type('input[placeholder="Bỏ trống nếu vừa đăng nhập bằng Google"]', env.SEED_ADMIN_PASSWORD);
  await page.waitForSelector('input[placeholder="VD: 123456"]');
  await page.type('input[placeholder="VD: 123456"]', '123456');
  await page.type('input[placeholder="Nhập lại mã PIN mới..."]', '123456');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Lưu mã PIN').click());
  await page.waitForFunction(() => document.body.innerText.includes('Đã lưu mã PIN bảo mật trên máy chủ.'), { timeout: 15000 });
  const pinStatus = await fetch(apiUrl + '/auth/security-pin', { headers: { Authorization: 'Bearer ' + token } }).then(response => response.json());
  assert.equal(pinStatus.configured, true);
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Đổi mã PIN bảo mật'), { timeout: 15000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Đổi mã PIN bảo mật').click());
  await page.waitForSelector('input[placeholder="Nhập mã PIN hiện tại"]');
  await page.type('input[placeholder="Nhập mã PIN hiện tại"]', '123456');
  await page.type('input[placeholder="VD: 123456"]', '654321');
  await page.type('input[placeholder="Nhập lại mã PIN mới..."]', '654321');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Lưu mã PIN').click());
  await page.waitForFunction(() => document.body.innerText.includes('Đã lưu mã PIN bảo mật trên máy chủ.'), { timeout: 15000 });
  assert.deepEqual(pageErrors, []);
  await page.goto(`${webUrl}/admin/settings/security/twosv/authenticator`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Tiếp tục'), { timeout: 30000 });
  await page.waitForSelector('img[alt="Mã QR ứng dụng xác thực"]', { timeout: 30000 });
  const qrSource = await page.$eval('img[alt="Mã QR ứng dụng xác thực"]', image => image.getAttribute('src'));
  assert.match(qrSource, /^data:image\/png;base64,/);
  const secret = await page.$eval('code', element => element.textContent.trim());
  assert.match(secret, /^[A-Z2-7]{32}$/);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Tiếp tục').click());
  await page.waitForSelector('input[maxlength="1"]');
  const setupOtp = totpCode(secret);
  const digits = await page.$$('input[maxlength="1"]');
  for (let index = 0; index < digits.length; index += 1) await digits[index].type(setupOtp[index]);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Xác nhận').click());
  try {
    await page.waitForFunction(() => {
      const text = document.body.innerText;
      return text.includes('Kích Hoạt Authenticator Thành Công!') || text.includes('Mã xác minh không chính xác') || text.includes('Yêu cầu thiết lập đã hết hạn');
    }, { timeout: 15000 });
  } catch (error) {
    const screen = await page.$eval('body', element => element.innerText);
    const values = await page.$$eval('input[maxlength="1"]', inputs => inputs.map(input => input.value));
    console.error(JSON.stringify({ screen: screen.slice(-1000), values, setupOtp, logs }));
    throw error;
  }
  const setupText = await page.$eval('body', element => element.innerText);
  assert.ok(setupText.includes('Kích Hoạt Authenticator Thành Công!'), `TOTP setup failed: ${setupText.slice(-700)}\n${logs}`);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Hoàn tất').click());
  await page.waitForFunction(() => window.location.pathname === '/admin/settings/security/twosv', { timeout: 15000 });

  await page.evaluate(() => localStorage.clear());
  await page.close();
  const loginPage = await browser.newPage();
  loginPage.on('pageerror', error => pageErrors.push(error.message));
  await loginPage.setViewport({ width: 1280, height: 900 });
  await loginPage.goto(`${webUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await loginPage.waitForSelector('input[placeholder="Email hoặc tên đăng nhập"]');
  await loginPage.type('input[placeholder="Email hoặc tên đăng nhập"]', env.SEED_ADMIN_EMAIL);
  await loginPage.type('input[type="password"]', env.SEED_ADMIN_PASSWORD);
  await loginPage.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Đăng nhập hệ thống').click());
  await loginPage.waitForSelector('#login-mfa-code', { timeout: 15000 });
  assert.equal(await loginPage.evaluate(() => localStorage.getItem('minepanel_token')), null, 'password alone must not create an access token');
  await loginPage.type('#login-mfa-code', totpCode(secret));
  await loginPage.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Xác minh và tiếp tục').click());
  await loginPage.waitForFunction(() => window.location.pathname === '/admin/dashboard', { timeout: 20000 });
  const accessToken = await loginPage.evaluate(() => localStorage.getItem('minepanel_token'));
  assert.ok(accessToken, 'an access token is issued only after the second factor');
  const sessionsResponse = await fetch(`${apiUrl}/admin/sessions`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const sessions = await sessionsResponse.json();
  assert.equal(sessionsResponse.status, 200, JSON.stringify(sessions));
  assert.ok(sessions.data.some(item => item.current && item.mfaVerified));
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ browser: 'Chromium', flow: 'server-side PIN setup and update, TOTP setup, local QR generation and enforced password-login challenge', evidence: directory }));
} finally {
  await browser?.close();
  for (const child of [api, vite]) {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
  }
}
