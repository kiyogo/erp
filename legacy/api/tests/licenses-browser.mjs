import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = path.resolve(apiDir, '..', 'web');
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-licenses-browser-'));
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
let page;
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
  const loginResponse = await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }) });
  assert.equal(loginResponse.status, 200);
  const session = await loginResponse.json();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token || session.access_token}` };
  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
  await page.evaluateOnNewDocument(({ token, user }) => {
    localStorage.setItem('minepanel_token', token);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { token: session.token || session.access_token, user: session.user });
  await page.goto(`${webUrl}/admin/assets/licenses`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Đăng ký License mới'), { timeout: 30000 });
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
    await element.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.down(modifier);
    await page.keyboard.press('KeyA');
    await page.keyboard.up(modifier);
    await page.keyboard.press('Backspace');
    await element.type(value);
    assert.equal(await element.evaluate(input => input.value), value, `Unexpected input value: ${label}`);
    await handle.dispose();
  }
  async function choose(label, option) {
    const handle = await page.evaluateHandle(text => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
      .find(item => item.querySelector('label')?.textContent.includes(text))?.querySelector('.ant-select-selector'), label);
    const element = handle.asElement();
    assert.ok(element, `Missing select: ${label}`);
    await element.click();
    await handle.dispose();
    await page.waitForFunction(text => [...document.querySelectorAll('.ant-select-item')].some(item => item.textContent.includes(text)), { timeout: 15000 }, option);
    await page.evaluate(text => [...document.querySelectorAll('.ant-select-item')].find(item => item.textContent.includes(text)).click(), option);
  }

  await clickButton('Đăng ký License mới');
  await page.waitForSelector('.ant-modal-root form');
  const licenseCode = await page.$eval('.ant-modal-root input[readonly]', input => input.value);
  assert.ok(licenseCode);
  await fill('Tên phần mềm', 'Phần mềm thử');
  await fill('Hãng phát triển', 'Nhà cung cấp thử');
  await fill('Product Key', 'UI-SECRET-01');
  await fill('Số ghế đã dùng', '0');
  await fill('Tổng số ghế mua', '1');
  await fill('Chi phí', '0');
  await fill('Phòng ban thụ hưởng', 'Phòng IT');
  await fill('Người quản trị', 'Nhân viên IT');
  const expiryPicker = await page.evaluateHandle(() => [...document.querySelectorAll('.ant-modal-root .ant-form-item')].find(node => node.querySelector('label')?.textContent.includes('Ngày hết hạn')).querySelector('.kiyovn-datepicker-input'));
  await expiryPicker.asElement().click();
  await page.click('.kiyovn-datepicker-popup button[title="Năm sau"]');
  await page.evaluate(() => [...document.querySelectorAll('.kiyovn-datepicker-popup div')].find(node => node.textContent.trim() === '15' && node.children.length === 0).click());
  await clickButton('Đăng ký bản quyền', false, true);
  await page.waitForFunction(code => !document.querySelector('.ant-modal-root') && document.body.innerText.includes(code), { timeout: 15000 }, licenseCode);
  let records = (await (await fetch(`${apiUrl}/assets/licenses`, { headers })).json()).data;
  assert.equal(records.find(item => item.licenseCode === licenseCode).annualCost, 0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(code => document.body.innerText.includes(code), { timeout: 30000 }, licenseCode);
  await clickButton('Xuất Excel');
  const workbook = path.join(directory, 'kiem_ke_ban_quyen.xlsx');
  for (let i = 0; i < 100 && !existsSync(workbook); i++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.equal(readFileSync(workbook).subarray(0, 2).toString(), 'PK');
  await clickButton('Xem ghế');
  await clickButton('In phiếu theo dõi PDF');
  const pdf = path.join(directory, `${licenseCode}_ban_quyen.pdf`);
  for (let i = 0; i < 100 && !existsSync(pdf); i++) await new Promise(resolve => setTimeout(resolve, 100));
  const pdfBytes = readFileSync(pdf);
  assert.equal(pdfBytes.subarray(0, 5).toString(), '%PDF-');
  assert.ok(!pdfBytes.includes(Buffer.from('UI-SECRET-01')));

  await clickButton('Cấp ghế mới');
  await page.waitForSelector('.ant-modal-root');
  await page.type('input[placeholder="Ví dụ: Lê Minh Trọng"]', 'Nhân viên thử');
  await page.type('input[placeholder="Ví dụ: trong.lm@kiyovn.com"]', 'user@example.test');
  await clickButton('Xác nhận cấp phát', false, true);
  await page.waitForFunction(() => !document.querySelector('.ant-modal-root') && document.body.innerText.includes('user@example.test'), { timeout: 15000 });
  await clickButton('Gia hạn hợp đồng');
  await page.waitForSelector('.ant-modal-root');
  await page.click('.ant-modal-root .kiyovn-datepicker-input');
  await page.click('.kiyovn-datepicker-popup button[title="Năm sau"]');
  await page.click('.kiyovn-datepicker-popup button[title="Năm sau"]');
  await page.evaluate(() => [...document.querySelectorAll('.kiyovn-datepicker-popup div')].find(node => node.textContent.trim() === '15' && node.children.length === 0).click());
  await clickButton('Ghi nhận', false, true);
  await page.waitForFunction(() => !document.querySelector('.ant-modal-root'), { timeout: 15000 });
  records = (await (await fetch(`${apiUrl}/assets/licenses`, { headers })).json()).data;
  const saved = records.find(item => item.licenseCode === licenseCode);
  assert.equal(saved.seatsAllocated, 1);
  assert.equal(saved.renewals.length, 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: 'create, reload, export workbook and PDF, allocate seat, renew license', database: directory }));
} catch (error) {
  if (page) console.error((await page.$eval('body', node => node.innerText).catch(() => '')).slice(-3000));
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
