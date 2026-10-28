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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-asset-system-browser-'));
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
  ...process.env, USE_SQLITE: 'true', DATABASE_URL: '', PORT: String(apiPort), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'asset-system-browser@example.test', SEED_ADMIN_PASSWORD: 'Asset-System-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'ASSET-SYSTEM-BROWSER-ADMIN', JWT_SECRET: 'asset-system-browser-isolated-test-secret',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd: apiDir, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const api = spawn(process.execPath, ['index.mjs'], { cwd: apiDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const vite = spawn(process.execPath, [path.join(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(webPort), '--strictPort', '--host', '127.0.0.1'], {
  cwd: webDir, env: { ...process.env, VITE_API_URL: apiUrl }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
for (const child of [api, vite]) {
  child.stdout.on('data', (chunk) => { logs = (logs + chunk).slice(-10000); });
  child.stderr.on('data', (chunk) => { logs = (logs + chunk).slice(-10000); });
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
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`Test server did not become ready: ${url}\n${logs}`);
  }

  async function request(route, token, method = 'GET', payload) {
    const response = await fetch(`${apiUrl}${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const body = await response.json();
    if (response.status >= 400) apiErrors.push(`${method} ${route}: ${response.status} ${JSON.stringify(body)}`);
    return { status: response.status, body };
  }
  const login = await request('/auth/login', '', 'POST', { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const token = login.body.token || login.body.access_token;
  const admin = login.body.user;
  const suffix = Date.now().toString(36).toUpperCase();
  const employeeCode = `ASSET-RULE-${suffix}`;
  const employeeResponse = await request('/users', token, 'POST', {
    email: `asset-rule-${suffix.toLowerCase()}@example.test`, name: 'Nhân viên kiểm thử quy chuẩn',
    password: 'Asset-Rule-Worker-26!Secure', employeeCode, role: 'USER', department: 'Phòng công nghệ', position: 'Kỹ sư kiểm thử',
  });
  assert.equal(employeeResponse.status, 201, JSON.stringify(employeeResponse.body));
  const employee = employeeResponse.body.user;

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && /asset_(systems|items|allocations)|\/employees/.test(response.url())) {
      apiErrors.push(`Browser HTTP ${response.status()} ${response.url()}`);
    }
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ accessToken, user }) => {
    localStorage.setItem('minepanel_token', accessToken);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { accessToken: token, user: admin });

  async function clickButton(label, inModal = false) {
    await page.waitForFunction((text, modal) => [...document.querySelectorAll(modal ? '.ant-modal-root button' : 'button')]
      .some((button) => button.textContent.trim() === text && !button.disabled), { timeout: 15000 }, label, inModal);
    await page.evaluate((text, modal) => {
      [...document.querySelectorAll(modal ? '.ant-modal-root button' : 'button')]
        .find((button) => button.textContent.trim() === text && !button.disabled)?.click();
    }, label, inModal);
  }
  async function fill(label, value, inModal = true) {
    const result = await page.evaluate(({ text, modal, nextValue }) => {
      const root = modal ? '.ant-modal-root .ant-form-item' : '.ant-form-item';
      const control = [...document.querySelectorAll(root)].find((item) => item.querySelector('label')?.textContent.includes(text))
        ?.querySelector('input:not([disabled]), textarea');
      if (!control) return null;
      const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(control, String(nextValue));
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, { text: label, modal: inModal, nextValue: String(value) });
    assert.equal(result, true, `Missing input: ${label}`);
  }
  async function choose(label, option, inModal = true) {
    const handle = await page.evaluateHandle(({ text, modal }) => {
      const root = modal ? '.ant-modal-root .ant-form-item' : '.ant-form-item';
      return [...document.querySelectorAll(root)].find((item) => item.querySelector('label')?.textContent.includes(text))
        ?.querySelector('.ant-select-selector') || null;
    }, { text: label, modal: inModal });
    const element = handle.asElement();
    assert.ok(element, `Missing select: ${label}`);
    await element.click();
    await handle.dispose();
    await page.waitForFunction((text) => [...document.querySelectorAll('.ant-select-item')].some((item) => item.textContent.includes(text)), { timeout: 15000 }, option);
    await page.evaluate((text) => [...document.querySelectorAll('.ant-select-item')].find((item) => item.textContent.includes(text))?.click(), option);
  }
  async function chooseToday(label) {
    const opened = await page.evaluate((text) => {
      const item = [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
        .find((candidate) => candidate.querySelector('label')?.textContent.includes(text));
      const picker = item?.querySelector('.kiyovn-datepicker-input');
      picker?.click();
      return Boolean(picker);
    }, label);
    assert.equal(opened, true, `Missing date picker: ${label}`);
    await clickButton('Hôm nay');
  }
  async function waitForRecord(route, predicate, label) {
    let last;
    for (let attempt = 0; attempt < 100; attempt++) {
      last = await request(route, token);
      const record = last.body.record || last.body.data;
      const found = Array.isArray(record) ? record.find(predicate) : predicate(record) ? record : null;
      if (found) return found;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last?.body)}`);
  }

  await page.goto(`${webUrl}/admin/assets/system`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Thêm thiết lập mới'), { timeout: 30000 });
  await clickButton('Thêm thiết lập mới');
  await page.waitForSelector('.ant-modal-root form');
  const configCode = await page.evaluate(() => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
    .find((item) => item.querySelector('label')?.textContent.includes('Mã cấu hình'))?.querySelector('input')?.value || '');
  assert.match(configCode, /^AS-CFG-[A-F0-9]{8}$/);
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
    .find((item) => item.querySelector('label')?.textContent.includes('Mã cấu hình'))?.querySelector('input')?.readOnly), true);
  await choose('Phân loại thiết lập', 'Quy tắc sinh mã tự động');
  await fill('Tên danh mục', 'Thiết bị IT');
  await fill('Nội dung quy định', 'Quy tắc sinh mã tài sản kiểm thử');
  await fill('Phạm vi áp dụng', 'Toàn công ty');
  await fill('Chức danh', 'Kỹ sư kiểm thử');
  await fill('Gói thiết bị', 'Laptop tiêu chuẩn');
  await fill('Hạn mức kinh phí', '25000000');
  await fill('Khấu hao mặc định', '36');
  await fill('Pattern sinh mã', 'TS-E2E-{YYYY}-{####}');
  await choose('Người phụ trách', employeeCode);
  await clickButton('Lưu thiết lập quy chuẩn', true);
  const savedConfig = await waitForRecord('/collections/asset_systems?limit=500', (item) => item?.code === configCode, 'configuration saved from browser');
  assert.equal(savedConfig.responsiblePersonId, employee.id);
  assert.equal(savedConfig.responsiblePerson, employee.name);
  assert.equal(savedConfig.status, 'Đang áp dụng');

  await page.waitForFunction((code) => document.body.innerText.includes(code), { timeout: 15000 }, configCode);
  const row = await page.evaluateHandle((code) => [...document.querySelectorAll('tr')].find((item) => item.innerText.includes(code)) || null, configCode);
  assert.ok(row.asElement(), 'Saved configuration should be visible in the table.');
  await row.dispose();
  await page.evaluate((code) => {
    const rowElement = [...document.querySelectorAll('tr')].find((item) => item.innerText.includes(code));
    [...(rowElement?.querySelectorAll('button') || [])].find((button) => button.textContent.trim() === 'Xem')?.click();
  }, configCode);
  await page.waitForFunction(() => document.body.innerText.includes('Sinh mã thử nghiệm'), { timeout: 15000 });
  await clickButton('Sinh mã thử nghiệm');
  await page.waitForFunction(() => document.body.innerText.includes('TS-E2E-'), { timeout: 10000 });
  const preview = await page.evaluate(() => document.body.innerText.match(/TS-E2E-\d{4}-\d{4}/)?.[0] || '');
  assert.match(preview, /^TS-E2E-\d{4}-\d{4}$/);

  await page.evaluate((code) => {
    const rowElement = [...document.querySelectorAll('tr')].find((item) => item.innerText.includes(code));
    rowElement?.querySelectorAll('button')[1]?.click();
  }, configCode);
  await page.waitForFunction(async ({ url, accessToken, code }) => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await response.json();
    return body.data?.find((item) => item.code === code)?.status === 'Tạm ngưng';
  }, { timeout: 15000 }, { url: `${apiUrl}/collections/asset_systems?limit=500`, accessToken: token, code: configCode });
  await page.evaluate((code) => {
    const rowElement = [...document.querySelectorAll('tr')].find((item) => item.innerText.includes(code));
    rowElement?.querySelectorAll('button')[1]?.click();
  }, configCode);
  await page.waitForFunction(async ({ url, accessToken, code }) => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const body = await response.json();
    return body.data?.find((item) => item.code === code)?.status === 'Đang áp dụng';
  }, { timeout: 15000 }, { url: `${apiUrl}/collections/asset_systems?limit=500`, accessToken: token, code: configCode });

  async function createConfig(config) {
    const result = await request('/collections/asset_systems', token, 'POST', { record: {
      key: `asset-config-${suffix}-${config.category.replace(/\W/g, '').slice(0, 18)}`,
      code: `AS-${suffix}-${config.category.replace(/\W/g, '').slice(0, 12).toUpperCase()}`,
      name: config.name, category: config.category, details: config.details || 'Quy chuẩn kiểm thử.',
      scope: config.scope || 'Toàn công ty', allocatedRole: config.allocatedRole || 'Kỹ sư kiểm thử',
      standardPackage: config.standardPackage || '', budgetLimit: config.budgetLimit || 0,
      depreciationMonthsDefault: config.depreciationMonthsDefault || 0, prefixPattern: '', responsiblePersonId: employee.id,
    } });
    assert.equal(result.status, 201, JSON.stringify(result.body));
    return result.body.record;
  }
  await createConfig({ category: 'Nhóm & Loại tài sản', name: 'Thiết bị IT', depreciationMonthsDefault: 36 });
  await createConfig({ category: 'Vị trí & Tủ Rack', name: 'Kho tài sản E2E' });
  await createConfig({ category: 'Nhà cung cấp', name: 'Nhà cung cấp E2E' });
  await createConfig({ category: 'Định mức cấp phát chức danh', name: 'Gói IT E2E', allocatedRole: 'Kỹ sư kiểm thử', scope: 'Phòng công nghệ', standardPackage: 'Laptop 16GB RAM', budgetLimit: 25000000 });

  await page.goto(`${webUrl}/admin/assets/list`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Thêm tài sản mới'), { timeout: 20000 });
  await clickButton('Thêm tài sản mới');
  await page.waitForSelector('.ant-modal-root form');
  await choose('Nhóm tài sản', 'Thiết bị IT');
  const assetCode = await page.evaluate(() => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
    .find((item) => item.querySelector('label')?.textContent.includes('Mã tài sản'))?.querySelector('input')?.value || '');
  assert.match(assetCode, /^TS-E2E-\d{4}-\d{4}$/);
  const depreciationDefault = await page.evaluate(() => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
    .find((item) => item.querySelector('label')?.textContent.includes('Thời gian khấu hao'))?.querySelector('input')?.value || '');
  assert.equal(depreciationDefault, '36');
  const supplierSuggestions = await page.$$eval('#asset-supplier-options option', (items) => items.map((item) => item.value));
  const locationSuggestions = await page.$$eval('#asset-location-options option', (items) => items.map((item) => item.value));
  assert.ok(supplierSuggestions.includes('Nhà cung cấp E2E'));
  assert.ok(locationSuggestions.includes('Kho tài sản E2E'));
  await fill('Mã Barcode', `ASSET-${suffix}`);
  await fill('Tên tài sản', 'Laptop kiểm thử quy chuẩn');
  await fill('Model', 'MODEL-E2E');
  await fill('Nhà cung cấp', 'Nhà cung cấp E2E');
  await chooseToday('Ngày mua');
  await fill('Nguyên giá mua vào', '50000000');
  await choose('Phòng ban', 'Ban Giám Đốc');
  await fill('Vị trí lắp đặt', 'Kho tài sản E2E');
  await clickButton('Tạo mới tài sản', true);
  const savedAsset = await waitForRecord('/collections/asset_items?limit=500', (item) => item?.code === assetCode, 'asset created using active system rules');
  assert.equal(Number(savedAsset.depreciationMonths), 36);
  assert.equal(savedAsset.supplier, 'Nhà cung cấp E2E');
  assert.equal(savedAsset.location, 'Kho tài sản E2E');
  assert.equal(Number(savedAsset.originalPrice), 50000000);

  await page.goto(`${webUrl}/admin/assets/allocation`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Lập phiếu Cấp phát / Thu hồi'), { timeout: 20000 });
  await clickButton('Lập phiếu Cấp phát / Thu hồi');
  await page.waitForSelector('.ant-modal-root form');
  await choose('Tài sản trong danh mục', assetCode);
  await choose('Nhân viên nhận / bàn giao', employeeCode);
  await page.waitForFunction(() => document.body.innerText.includes('Định mức áp dụng cho Kỹ sư kiểm thử'), { timeout: 15000 });
  const quotaNotice = await page.evaluate(() => [...document.querySelectorAll('.ant-alert')].map((item) => item.innerText).find((text) => text.includes('Định mức áp dụng')) || '');
  assert.match(quotaNotice, /Laptop 16GB RAM/);
  assert.match(quotaNotice, /25\.000\.000/);
  assert.match(quotaNotice, /vượt hạn mức/);

  assert.deepEqual(pageErrors, []);
  assert.deepEqual(apiErrors, []);
  console.log(JSON.stringify({
    checks: 'legacy asset system config create, responsible employee snapshot, code preview, status transitions and persistence; active code/depreciation/location/supplier rules applied in asset creation; role/department quota warning on allocation',
    configCode, assetCode, employeeCode, database: directory,
  }));
} catch (error) {
  if (page) {
    console.error('Browser page:', (await page.$eval('body', (node) => node.innerText).catch(() => '')).slice(-4000));
    await page.screenshot({ path: path.join(directory, 'asset-system-failure.png'), fullPage: true }).catch(() => {});
  }
  console.error('Page errors:', JSON.stringify(pageErrors));
  console.error('Relevant API errors:', JSON.stringify(apiErrors));
  console.error('Server logs:', logs);
  throw error;
} finally {
  if (browser) await browser.close();
  for (const child of [vite, api]) {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once('exit', resolve));
      child.kill();
      await exited;
    }
  }
}
