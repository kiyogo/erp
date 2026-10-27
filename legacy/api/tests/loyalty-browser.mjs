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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-loyalty-browser-'));
async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
const apiPort = await freePort();
const webPort = await freePort();
const apiUrl = `http://127.0.0.1:${apiPort}/api/v1`;
const webUrl = `http://127.0.0.1:${webPort}`;
const env = {
  ...process.env, USE_SQLITE: 'true', DATABASE_URL: '', PORT: String(apiPort), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'loyalty-browser@example.test', SEED_ADMIN_PASSWORD: 'Loyalty-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'BROWSER-ADMIN', JWT_SECRET: 'loyalty-browser-isolated-test-secret',
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
try {
  for (const [url, process] of [[`${apiUrl}/health`, api], [webUrl, vite]]) {
    let ready = false;
    for (let attempt = 0; attempt < 150; attempt++) {
      try { ready = (await fetch(url)).ok; } catch {}
      if (ready) break;
      if (process.exitCode !== null) throw new Error(logs);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`Test server did not become ready: ${url}\n${logs}`);
  }
  const loginResponse = await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }) });
  assert.equal(loginResponse.status, 200);
  const session = await loginResponse.json();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token || session.access_token}` };
  const customerResponse = await fetch(`${apiUrl}/crm/contacts`, { method: 'POST', headers, body: JSON.stringify({ name: 'Khách hàng kiểm thử giao diện', type: 'customer' }) });
  assert.equal(customerResponse.status, 201);
  const customer = (await customerResponse.json()).contact;
  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ token, user }) => {
    localStorage.setItem('minepanel_token', token);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { token: session.token || session.access_token, user: session.user });
  await page.goto(`${webUrl}/admin/crm/loyalty`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Khách hàng kiểm thử giao diện'), { timeout: 60000 });
  async function clickButton(label, last = false, inModal = false) {
    await page.waitForFunction((text, modal) => [...document.querySelectorAll(modal ? '.ant-modal-root button' : 'button')].some(button => button.textContent.trim() === text && !button.disabled), { timeout: 15000 }, label, inModal);
    await page.evaluate((text, useLast, modal) => {
      const buttons = [...document.querySelectorAll(modal ? '.ant-modal-root button' : 'button')].filter(button => button.textContent.trim() === text && !button.disabled);
      (useLast ? buttons.at(-1) : buttons[0]).click();
    }, label, last, inModal);
  }
  async function fill(label, value) {
    const handle = await page.evaluateHandle(text => {
      const item = [...document.querySelectorAll('.ant-modal-root .ant-form-item')].find(node => node.querySelector('label')?.textContent.includes(text));
      return item?.querySelector('input, textarea') || null;
    }, label);
    const element = handle.asElement();
    assert.ok(element, `Missing input: ${label}`);
    await element.click({ clickCount: 3 });
    await page.keyboard.press('Backspace');
    await element.type(value);
    await handle.dispose();
  }
  async function balance() {
    const response = await fetch(`${apiUrl}/crm/loyalty`, { headers });
    assert.equal(response.status, 200);
    return (await response.json()).customers.find(item => item.key === customer.key).balance;
  }
  await clickButton('Tích điểm', true);
  await page.waitForSelector('.ant-modal-root form');
  await fill('Số điểm', '100');
  await fill('Mã tham chiếu', 'UI-SALE-1');
  await clickButton('Lưu giao dịch', false, true);
  await page.waitForFunction(() => !document.querySelector('.ant-modal-root'), { timeout: 15000 });
  await page.waitForFunction(() => [...document.querySelectorAll('tr')].some(row => row.textContent.includes('Khách hàng kiểm thử giao diện') && row.textContent.includes('100')), { timeout: 15000 });
  assert.equal(await balance(), 100);

  await clickButton('Đổi điểm', true);
  await page.waitForSelector('.ant-modal-root form');
  await fill('Số điểm', '101');
  await fill('Mã tham chiếu', 'UI-FAIL');
  await fill('Phần thưởng', 'Quà kiểm thử');
  await clickButton('Lưu giao dịch', false, true);
  await page.waitForFunction(() => document.body.innerText.includes('không đủ điểm'), { timeout: 15000 });
  assert.equal(await balance(), 100);
  await clickButton('Hủy', false, true);
  await page.waitForFunction(() => !document.querySelector('.ant-modal-root'), { timeout: 15000 });

  await clickButton('Đổi điểm', true);
  await page.waitForSelector('.ant-modal-root form');
  await fill('Số điểm', '30');
  await fill('Mã tham chiếu', 'UI-REDEEM-1');
  await fill('Phần thưởng', 'Quà kiểm thử');
  await clickButton('Lưu giao dịch', false, true);
  await page.waitForFunction(() => !document.querySelector('.ant-modal-root'), { timeout: 15000 });
  await page.waitForFunction(() => document.body.innerText.includes('Chờ trao'), { timeout: 15000 });
  assert.equal(await balance(), 70);
  await clickButton('Xác nhận trao');
  await page.waitForSelector('.ant-modal-root form');
  await fill('Mã xác nhận trao thưởng', 'UI-GIFT-1');
  await clickButton('Xác nhận', false, true);
  await page.waitForFunction(() => !document.querySelector('.ant-modal-root'), { timeout: 15000 });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('Đã trao') && document.body.innerText.includes('UI-REDEEM-1'), { timeout: 30000 });
  assert.equal(await balance(), 70);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: 'earn, insufficient balance, redeem, fulfill, reload', database: directory }));
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
