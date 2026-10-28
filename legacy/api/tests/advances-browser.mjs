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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-advances-browser-'));
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
  SEED_ADMIN_EMAIL: 'advances-browser@example.test', SEED_ADMIN_PASSWORD: 'Advances-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'ADVANCES-BROWSER-ADMIN', JWT_SECRET: 'advances-browser-isolated-test-secret',
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
const advancesApiErrors = [];
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
  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/collections/finance_advances')) {
      advancesApiErrors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  await page.setViewport({ width: 1440, height: 1100 });
  await page.goto(webUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: token, user: admin.user });
  await page.goto(`${webUrl}/admin/finance/advances`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Lập phiếu tạm ứng mới'), { timeout: 30000 });

  async function clickButton(label, modal = false) {
    const selector = modal ? '.ant-modal-root button' : 'button';
    await page.waitForFunction((text, query) => [...document.querySelectorAll(query)].some(button => button.textContent.trim() === text && !button.disabled), { timeout: 20000 }, label, selector);
    const handle = await page.evaluateHandle((text, query) => [...document.querySelectorAll(query)].find(button => button.textContent.trim() === text && !button.disabled) || null, label, selector);
    const element = handle.asElement();
    assert.ok(element, `Missing enabled button: ${label}`);
    await element.evaluate(button => button.click());
    await handle.dispose();
  }
  async function fill(label, value) {
    const handle = await page.evaluateHandle(text => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
      .filter(item => item.querySelector('label')?.textContent.includes(text))
      .map(item => item.querySelector('input, textarea'))
      .find(input => input && input.getBoundingClientRect().width > 0) || null, label);
    const element = handle.asElement();
    assert.ok(element, `Missing input: ${label}`);
    await element.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.down(modifier);
    await page.keyboard.press('A');
    await page.keyboard.up(modifier);
    await page.keyboard.press('Backspace');
    await element.type(value);
    assert.equal(await element.evaluate(input => input.value), value, `Unexpected input value: ${label}`);
    await handle.dispose();
  }
  async function choose(label, option) {
    const handle = await page.evaluateHandle(text => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
      .find(item => item.querySelector('label')?.textContent.includes(text))?.querySelector('.ant-select-selector') || null, label);
    const element = handle.asElement();
    assert.ok(element, `Missing select: ${label}`);
    await element.click();
    await handle.dispose();
    await page.waitForFunction(text => {
      const dropdowns = [...document.querySelectorAll('.ant-select-dropdown')].filter(item => item.getBoundingClientRect().width > 0);
      return [...(dropdowns.at(-1)?.querySelectorAll('.ant-select-item') || [])].some(item => item.textContent.includes(text));
    }, { timeout: 15000 }, option);
    await page.evaluate(text => {
      const dropdowns = [...document.querySelectorAll('.ant-select-dropdown')].filter(item => item.getBoundingClientRect().width > 0);
      [...(dropdowns.at(-1)?.querySelectorAll('.ant-select-item') || [])].find(item => item.textContent.includes(text)).click();
    }, option);
  }
  async function chooseDate(label, date) {
    const handle = await page.evaluateHandle(text => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
      .find(item => item.querySelector('label')?.textContent.includes(text))?.querySelector('.kiyovn-datepicker-input') || null, label);
    const element = handle.asElement();
    assert.ok(element, `Missing date picker: ${label}`);
    await element.click();
    await handle.dispose();
    const [year, month, day] = date.split('-').map(Number);
    const monthName = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'][month - 1];
    for (let attempt = 0; attempt < 13; attempt++) {
      const inTargetMonth = await page.$eval('.kiyovn-datepicker-popup', (popup, target) => {
        const text = popup.innerText;
        return text.includes(target.month) && text.includes(String(target.year));
      }, { month: monthName, year });
      if (inTargetMonth) break;
      await page.click('.kiyovn-datepicker-popup button[title="Tháng sau"]');
      if (attempt === 12) assert.fail(`Date picker did not reach ${date}.`);
    }
    const selected = await page.evaluate(targetDay => {
      const popup = document.querySelector('.kiyovn-datepicker-popup');
      const grid = [...popup.querySelectorAll('div')].find(node => node.style.gridTemplateColumns === 'repeat(7, 1fr)' && node.children.length === 42);
      const cell = [...(grid?.children || [])].find(node => node.textContent.trim() === String(targetDay) && getComputedStyle(node).color === 'rgb(30, 41, 59)');
      if (!cell) return false;
      cell.click();
      return true;
    }, day);
    assert.equal(selected, true, `Could not select ${date} in the date picker.`);
  }
  async function collection() {
    const response = await fetch(`${apiUrl}/collections/finance_advances?limit=500`, { headers });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body.data;
  }
  async function waitForRecord(key, predicate) {
    let record;
    for (let attempt = 0; attempt < 100; attempt++) {
      record = (await collection()).find(item => item.key === key);
      if (record && predicate(record)) return record;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`Advance ${key} did not update as expected: ${JSON.stringify(record)}`);
  }

  const suffix = Date.now().toString(36).toUpperCase();
  const employeeCode = `EMP-${suffix}`;
  const deadline = new Date(Date.now() + 10 * 86400000).toLocaleDateString('sv-SE');
  await clickButton('Lập phiếu tạm ứng mới');
  await page.waitForSelector('.ant-modal-root form');
  const code = await page.$eval('.ant-modal-root .ant-form-item', item => item.querySelector('label')?.textContent.includes('Mã phiếu tạm ứng') ? item.querySelector('input')?.value : [...document.querySelectorAll('.ant-modal-root .ant-form-item')].find(field => field.querySelector('label')?.textContent.includes('Mã phiếu tạm ứng'))?.querySelector('input')?.value);
  assert.ok(code, 'The form should generate a unique advance code.');
  await choose('Loại hình tạm ứng', 'Công tác phí');
  await fill('Họ tên nhân viên tạm ứng', 'Nhân viên kiểm thử tạm ứng');
  await fill('Mã nhân viên', employeeCode);
  await choose('Phòng ban', 'Phòng Tài Chính - Kế Toán');
  await fill('Mục đích tạm ứng chi tiết', 'Kiểm tra tạo, cấp tiền, quyết toán và tải lại dữ liệu.');
  await fill('Số tiền tạm ứng', '1500000');
  assert.equal(await page.$eval('.ant-modal-root input[type="number"]', input => input.checkValidity()), true, 'A valid VND advance amount should pass browser validation.');
  await chooseDate('Hạn hoàn ứng / Nộp hóa đơn', deadline);
  await clickButton('Lưu phiếu tạm ứng', true);
  await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 20000 }, code);
  await page.waitForFunction(() => !document.body.innerText.includes('Lập Phiếu Đề Nghị Tạm Ứng Tiền Mặt / Chuyển Khoản'), { timeout: 5000 });
  let record = (await collection()).find(item => item.code === code);
  assert.ok(record?.key, 'The new advance was not persisted.');
  assert.equal(record.status, 'Chờ cấp tạm ứng');
  assert.equal(Number(record.advancedAmount), 1500000);
  assert.equal(record.empCode, employeeCode);

  await clickButton('Chứng từ');
  await page.waitForFunction(() => document.body.innerText.includes('Đối Chiếu Số Liệu Tạm Ứng'), { timeout: 15000 });
  await clickButton('Ghi nhận cấp tiền');
  await page.waitForFunction(() => document.body.innerText.includes('Số tiền đã cấp thực tế'), { timeout: 15000 });
  await fill('Số tiền đã cấp thực tế', '1200000');
  await fill('Mã phiếu chi hoặc tham chiếu giao dịch', `CASH-${suffix}`);
  await choose('Đã giao/chuyển tiền thực tế?', 'Đã giao/chuyển tiền');
  await clickButton('Lưu xác nhận', true);
  record = await waitForRecord(record.key, item => item.status === 'Chờ thanh quyết toán');
  assert.equal(Number(record.issuedAmount), 1200000);
  assert.equal(record.disbursementReference, `CASH-${suffix}`);
  assert.equal(Number(record.balance), 1200000);

  await page.waitForFunction(() => document.body.innerText.includes('Ghi nhận quyết toán'), { timeout: 15000 });
  await clickButton('Ghi nhận quyết toán');
  await page.waitForSelector('.ant-modal-root form');
  await fill('Tổng thực chi theo chứng từ', '950000');
  await fill('Bảng kê hoặc số tham chiếu chứng từ', `Hóa đơn hợp lệ INV-${suffix}`);
  await choose('Chênh lệch tiền đã thực sự hoàn trả/chi bổ sung?', 'Có, đã đối chiếu giao nhận tiền');
  await clickButton('Lưu quyết toán', true);
  record = await waitForRecord(record.key, item => item.status === 'Đã quyết toán nội bộ');
  assert.equal(Number(record.spentAmount), 950000);
  assert.equal(Number(record.balance), 250000);
  assert.equal(record.balanceReconciled, true);
  assert.ok(record.settledAt);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 20000 }, code);
  await clickButton('Chứng từ');
  await page.waitForFunction(value => document.body.innerText.includes(value) && document.body.innerText.includes('250.000'), { timeout: 15000 }, code);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(advancesApiErrors, []);
  console.log(JSON.stringify({ checks: 'create and persist request, real disbursement confirmation, settlement balance, final status, reload persistence, server record key', recordKey: record.key, database: directory }));
} catch (error) {
  if (page) {
    console.error((await page.$eval('body', node => node.innerText).catch(() => '')).slice(-3000));
    console.error('Drawer state:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.ant-drawer-root')].map(root => ({ text: root.innerText, display: getComputedStyle(root).display, opacity: getComputedStyle(root).opacity, buttons: [...root.querySelectorAll('button')].map(button => button.textContent.trim()) }))).catch(() => null)));
    await page.screenshot({ path: path.join(directory, 'failure.png'), fullPage: true }).catch(() => {});
    console.error('Advance form state:', JSON.stringify(await page.evaluate(() => ({
      fields: [...document.querySelectorAll('.ant-modal-root .ant-form-item')].map(item => ({ label: item.querySelector('label')?.textContent, value: item.querySelector('input, textarea, .ant-select-selection-item')?.value || item.querySelector('.ant-select-selection-item')?.textContent, error: item.querySelector('.ant-form-item-explain-error')?.textContent })),
    })).catch(() => null)));
    console.error('Browser errors:', JSON.stringify(pageErrors));
    console.error('Advance API errors:', JSON.stringify(advancesApiErrors));
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
