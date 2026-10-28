import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = path.resolve(apiDir, '..', 'web');
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-purchase-requests-'));
async function freePort() {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
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
  SEED_ADMIN_EMAIL: 'purchase-browser@example.test', SEED_ADMIN_PASSWORD: 'Purchase-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'PURCHASE-ADMIN', JWT_SECRET: 'purchase-request-isolated-browser-test-secret',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd: apiDir, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const api = spawn(process.execPath, ['index.mjs'], { cwd: apiDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const vite = spawn(process.execPath, [path.join(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(webPort), '--strictPort', '--host', '127.0.0.1'], {
  cwd: webDir, env: { ...process.env, VITE_API_URL: apiUrl }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
for (const child of [api, vite]) {
  child.stdout.on('data', (chunk) => { logs = (logs + chunk).slice(-12000); });
  child.stderr.on('data', (chunk) => { logs = (logs + chunk).slice(-12000); });
}
let browser;
const pageErrors = [];
const apiErrors = [];
try {
  for (const [url, child] of [[`${apiUrl}/health`, api], [webUrl, vite]]) {
    let ready = false;
    for (let attempt = 0; attempt < 450; attempt++) {
      try { ready = (await fetch(url)).ok; } catch {}
      if (ready) break;
      if (child.exitCode !== null) throw new Error(logs);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`Test server did not become ready: ${url}\n${logs}`);
  }

  const loginResponse = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }),
  });
  const admin = await loginResponse.json();
  assert.equal(loginResponse.status, 200, JSON.stringify(admin));
  const adminToken = admin.token || admin.access_token;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` };
  async function apiRequest(route, method = 'GET', payload, expected = 200) {
    const response = await fetch(`${apiUrl}${route}`, {
      method, headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  }

  const departmentKey = 'purchase-browser-department';
  await apiRequest('/collections/business_org_units', 'POST', {
    record: { key: departmentKey, name: 'Phòng thiết bị thử nghiệm', status: 'Hoạt động', isActive: true },
  }, 201);
  const supplierName = 'Nhà cung cấp trình duyệt thử nghiệm';
  const supplier = (await apiRequest('/crm/contacts', 'POST', {
    type: 'supplier', name: supplierName, status: 'Đang hợp tác',
  }, 201)).contact;

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/collections/finance_purchase_requests')) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ token, user }) => {
    localStorage.setItem('minepanel_token', token);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { token: adminToken, user: admin.user });
  await page.goto(`${webUrl}/admin/finance/purchasing/requests`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Yêu cầu mua sắm'));

  async function clickButton(label, selector = 'button') {
    await page.waitForFunction((text, query) => [...document.querySelectorAll(query)].some((button) => button.textContent.trim() === text && !button.disabled), { timeout: 15000 }, label, selector);
    await page.evaluate((text, query) => [...document.querySelectorAll(query)].find((button) => button.textContent.trim() === text && !button.disabled)?.click(), label, selector);
  }
  async function fill(input, value) {
    const element = await page.$(input);
    assert.ok(element, `Missing input ${input}`);
    await element.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.down(modifier);
    await page.keyboard.press('KeyA');
    await page.keyboard.up(modifier);
    await page.keyboard.press('Backspace');
    await element.type(String(value));
    await element.dispose();
  }
  async function chooseDepartment(name) {
    await page.evaluate(() => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
      .find((node) => node.querySelector('label')?.textContent.includes('Đơn vị yêu cầu'))?.querySelector('.ant-select')?.click());
    await page.waitForFunction((text) => [...document.querySelectorAll('.ant-select-dropdown .ant-select-item')].some((node) => node.textContent.trim() === text), { timeout: 10000 }, name);
    await page.evaluate((text) => [...document.querySelectorAll('.ant-select-item')].find((node) => node.textContent.trim() === text)?.click(), name);
  }

  await clickButton('Tạo yêu cầu');
  await page.waitForSelector('.ant-modal-root form');
  await chooseDepartment('Phòng thiết bị thử nghiệm');
  await fill('.ant-modal-root textarea', 'Mua thiết bị cho phòng thử nghiệm');
  await fill('input[aria-label="Tên hàng hóa 1"]', 'Máy đo nhiệt độ');
  await fill('input[aria-label="Đơn vị tính 1"]', 'Cái');
  await fill('input[aria-label="Số lượng 1"]', '3');
  await fill('input[aria-label="Đơn giá dự kiến 1"]', '250000');
  await clickButton('Lưu yêu cầu', '.ant-modal-root button');
  await page.waitForFunction(() => /YCMS-\d{4}-\d{4}/.test(document.body.innerText) && ![...document.querySelectorAll('.ant-modal-root')].some((node) => node.getBoundingClientRect().width > 0), { timeout: 20000 });
  const requestNumber = await page.evaluate(() => document.body.innerText.match(/YCMS-\d{4}-\d{4}/)?.[0] || '');
  assert.ok(requestNumber);
  const saved = (await apiRequest(`/collections/finance_purchase_requests/${requestNumber}`)).record;
  assert.equal(saved.estimatedTotal, 750000);
  assert.equal(saved.items[0].quantity, 3);
  assert.equal(saved.departmentName, 'Phòng thiết bị thử nghiệm');
  assert.match(saved.deliveryDeadline, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(saved.requesterId, admin.user.id);
  const headerText = await page.evaluate(() => [...document.querySelectorAll('thead th')].map((cell) => cell.textContent.trim()).join('|'));
  for (const label of ['Số yêu cầu', 'Trạng thái', 'Đơn vị yêu cầu', 'Người yêu cầu', 'Hạn giao hàng', 'Mục đích mua sắm', 'Ngày yêu cầu', 'Chức năng']) {
    assert.ok(headerText.includes(label), `Missing request list column: ${label}`);
  }

  await clickButton('Chi tiết');
  await page.waitForFunction((number) => document.body.innerText.includes(`Chi tiết ${number}`) && document.body.innerText.includes('Máy đo nhiệt độ'), { timeout: 10000 }, requestNumber);
  await clickButton('Tổng hợp yêu cầu và xác định nhà cung cấp');
  await page.waitForFunction(() => document.body.innerText.includes('Tổng hợp yêu cầu chưa xác định nhà cung cấp') && document.body.innerText.includes('Máy đo nhiệt độ'));
  await clickButton('Xác định NCC');
  await page.waitForSelector('.ant-modal-root');
  await page.evaluate(() => [...document.querySelectorAll('.ant-modal-root .ant-select')].at(-1)?.click());
  await page.waitForFunction((name) => [...document.querySelectorAll('.ant-select-dropdown .ant-select-item')].some((node) => node.textContent.includes(name)), { timeout: 10000 }, supplierName);
  await page.evaluate((name) => [...document.querySelectorAll('.ant-select-item')].find((node) => node.textContent.includes(name))?.click(), supplierName);
  await clickButton('Xác nhận nhà cung cấp', '.ant-modal-root button');
  await page.waitForFunction(() => document.body.innerText.includes('Đã xác định nhà cung cấp') && document.body.innerText.includes('Nhà cung cấp trình duyệt thử nghiệm'), { timeout: 15000 });
  const assigned = (await apiRequest(`/collections/finance_purchase_requests/${requestNumber}`)).record;
  assert.equal(assigned.supplierKey, supplier.key);
  assert.equal(assigned.status, 'Đã xác định nhà cung cấp');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction((number) => document.body.innerText.includes(number) && document.body.innerText.includes('Đã xác định nhà cung cấp'), { timeout: 20000 }, requestNumber);
  async function chooseFilter(currentLabel, nextLabel) {
    await page.evaluate((label) => [...document.querySelectorAll('.ant-select')]
      .find((node) => node.querySelector('.ant-select-selector')?.textContent.trim() === label)?.click(), currentLabel);
    await page.waitForFunction((label) => [...document.querySelectorAll('.ant-select-dropdown .ant-select-item')]
      .some((node) => node.textContent.trim() === label), { timeout: 10000 }, nextLabel);
    await page.evaluate((label) => [...document.querySelectorAll('.ant-select-item')]
      .find((node) => node.textContent.trim() === label)?.click(), nextLabel);
  }
  await chooseFilter('Tất cả năm', '2026');
  await page.waitForFunction((number) => document.body.innerText.includes(number), { timeout: 10000 }, requestNumber);
  await chooseFilter('Tất cả trạng thái', 'Đã xác định nhà cung cấp');
  await page.waitForFunction((number) => document.body.innerText.includes(number), { timeout: 10000 }, requestNumber);
  await chooseFilter('Đã xác định nhà cung cấp', 'Chờ xác định nhà cung cấp');
  await page.waitForFunction((number) => !document.body.innerText.includes(number), { timeout: 10000 }, requestNumber);
  await chooseFilter('Chờ xác định nhà cung cấp', 'Đã xác định nhà cung cấp');
  await page.waitForFunction((number) => document.body.innerText.includes(number), { timeout: 10000 }, requestNumber);
  const search = await page.$('input[placeholder^="Tìm số yêu cầu"]');
  assert.ok(search, 'Missing purchase request search input.');
  await search.type(requestNumber);
  await page.waitForFunction((number) => document.body.innerText.includes(number), { timeout: 10000 }, requestNumber);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(apiErrors, []);
  console.log(JSON.stringify({ checks: 'create/list columns, server identity and totals, search/year/status filters, detail panel, request aggregation, supplier selection, persisted reload', requestNumber }));
} catch (error) {
  console.error(`${error.stack || error}\n${logs}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of [vite, api]) if (child.exitCode === null) child.kill();
  await new Promise((resolve) => setTimeout(resolve, 100));
  for (const child of [vite, api]) if (child.exitCode === null) child.kill('SIGKILL');
}
