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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-inventory-browser-'));
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
  SEED_ADMIN_EMAIL: 'inventory-browser@example.test', SEED_ADMIN_PASSWORD: 'Inventory-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'INV-BROWSER-ADMIN', JWT_SECRET: 'inventory-browser-isolated-test-secret',
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
let page;
const pageErrors = [];
const inventoryApiErrors = [];
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
    return { status: response.status, body: await response.json() };
  }
  const login = await request('/auth/login', '', 'POST', { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const token = login.body.token || login.body.access_token;
  const user = login.body.user;
  const suffix = Date.now().toString(36).toUpperCase();
  const sku = `BROWSER-${suffix}`;
  const receiptCode = `PNK-BROWSER-${suffix}`;
  const deliveryCode = `GH-BROWSER-${suffix}`;
  const failedDeliveryCode = `GH-FAIL-BROWSER-${suffix}`;

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && /finance_inventory|finance\/inventory/.test(response.url())) inventoryApiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ accessToken, currentUser }) => {
    localStorage.setItem('minepanel_token', accessToken);
    localStorage.setItem('minepanel_user', JSON.stringify(currentUser));
    localStorage.setItem(`kiyovn_profile_wizard_v4:${encodeURIComponent(currentUser.email.trim().toLowerCase())}:done`, 'true');
  }, { accessToken: token, currentUser: user });

  async function setModalField(labelText, value) {
    const found = await page.evaluate(({ labelText: label, value: nextValue }) => {
      const field = [...document.querySelectorAll('.ant-modal label')].find((element) => element.innerText.trim().startsWith(label));
      const control = field?.querySelector('input:not([type="checkbox"]), select, textarea');
      if (!control) return false;
      const descriptor = control instanceof HTMLSelectElement
        ? Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')
        : control instanceof HTMLTextAreaElement
          ? Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')
          : Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor?.set?.call(control, nextValue);
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, { labelText, value: String(value) });
    assert.equal(found, true, `Could not find modal field: ${labelText}`);
  }
  async function clickModalButton(label) {
    const clicked = await page.evaluate((text) => {
      const button = [...document.querySelectorAll('.ant-modal button')].find((element) => element.textContent.trim() === text);
      button?.click();
      return Boolean(button);
    }, label);
    assert.equal(clicked, true, `Could not click modal button: ${label}`);
  }
  async function waitForInventory(predicate, label) {
    let last;
    for (let attempt = 0; attempt < 100; attempt++) {
      last = await predicate();
      if (last) return last;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
    throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(last)}`);
  }
  async function waitForShipmentAction(code, label) {
    await page.waitForFunction(([shipmentCode, actionText]) => {
      const row = [...document.querySelectorAll('tr')].find((item) => item.innerText.includes(shipmentCode));
      const button = [...(row?.querySelectorAll('button') || [])].find((item) => item.textContent.trim() === actionText);
      return Boolean(button && !button.disabled);
    }, { timeout: 15000 }, [code, label]);
  }

  await page.goto(`${webUrl}/admin/finance/inventory`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Tổng quan kho hàng'), { timeout: 30000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Thêm mặt hàng')?.click());
  await page.waitForSelector('.ant-modal form');
  await setModalField('Mã SKU', sku);
  await setModalField('Tên mặt hàng', 'Thiết bị kiểm thử trình duyệt');
  await setModalField('Nhóm danh mục', 'Thiết bị kiểm thử');
  await setModalField('Đơn vị tính', 'Cái');
  await setModalField('Tồn tối thiểu', '1');
  await setModalField('Tồn tối đa', '25');
  await setModalField('Đơn giá vốn', '0');
  await setModalField('Vị trí lưu trữ', 'Kệ A · Ngăn 2');
  await clickModalButton('Lưu mặt hàng');
  const product = await waitForInventory(async () => {
    const result = await request('/collections/finance_inventory', token);
    return result.status === 200 ? result.body.data?.find((item) => item.sku === sku) : null;
  }, 'new item persisted by the catalog screen');
  assert.equal(product.stockQty, 0, 'New catalog items must start with zero stock.');
  assert.equal(product.storageLocation, 'Kệ A · Ngăn 2');

  await page.goto(`${webUrl}/admin/finance/inventory/import`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Phiếu nhập kho'), { timeout: 20000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Tạo phiếu')?.click());
  await page.waitForSelector('.ant-modal form');
  await setModalField('Mã phiếu', receiptCode);
  await setModalField('Nhà cung cấp / tham chiếu', 'Kiểm thử trình duyệt');
  await setModalField('Mặt hàng', product.key);
  await setModalField('Số lượng', '5');
  await setModalField('Đơn giá nhập', '25000');
  await clickModalButton('Ghi nhận phiếu');
  await waitForInventory(async () => {
    const record = await request(`/collections/finance_inventory/${encodeURIComponent(product.key)}`, token);
    return record.status === 200 && record.body.record.stockQty === 5 ? record.body.record : null;
  }, 'receipt stock update');

  await page.goto(`${webUrl}/admin/finance/inventory/delivery`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Quản lý giao hàng'), { timeout: 20000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Tạo phiếu')?.click());
  await page.waitForSelector('.ant-modal form');
  await setModalField('Mã phiếu', deliveryCode);
  await setModalField('Người nhận', 'Nhân viên thử nghiệm');
  await setModalField('Địa chỉ giao hàng', 'Hà Nội');
  await setModalField('Mặt hàng', product.key);
  await setModalField('Số lượng', '1');
  await clickModalButton('Ghi nhận phiếu');
  await waitForInventory(async () => {
    const result = await request(`/collections/finance_inventory_transactions/${encodeURIComponent(deliveryCode)}`, token);
    return result.status === 200 && result.body.record.shipmentStatus === 'Chờ giao' ? result.body.record : null;
  }, 'shipment creation and persisted initial state');
  await page.waitForFunction((code) => document.body.innerText.includes(code), { timeout: 15000 }, deliveryCode);
  await page.evaluate((code) => {
    const row = [...document.querySelectorAll('tr')].find((item) => item.innerText.includes(code));
    [...(row?.querySelectorAll('button') || [])].find((button) => button.textContent.trim() === 'Bắt đầu giao')?.click();
  }, deliveryCode);
  await waitForInventory(async () => {
    const result = await request(`/collections/finance_inventory_transactions/${encodeURIComponent(deliveryCode)}`, token);
    return result.status === 200 && result.body.record.shipmentStatus === 'Đang giao' ? result.body.record : null;
  }, 'shipment in transit state');
  await page.evaluate((code) => {
    const row = [...document.querySelectorAll('tr')].find((item) => item.innerText.includes(code));
    [...(row?.querySelectorAll('button') || [])].find((button) => button.textContent.trim() === 'Đã giao')?.click();
  }, deliveryCode);
  const finalShipment = await waitForInventory(async () => {
    const result = await request(`/collections/finance_inventory_transactions/${encodeURIComponent(deliveryCode)}`, token);
    return result.status === 200 && result.body.record.shipmentStatus === 'Đã giao' ? result.body.record : null;
  }, 'delivered status and history');
  const finalProduct = await request(`/collections/finance_inventory/${encodeURIComponent(product.key)}`, token);
  assert.equal(finalProduct.body.record.stockQty, 4);
  assert.equal(finalShipment.shipmentHistory.length, 2);

  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Tạo phiếu')?.click());
  await page.waitForSelector('.ant-modal form');
  await setModalField('Mã phiếu', failedDeliveryCode);
  await setModalField('Người nhận', 'Người nhận vắng mặt');
  await setModalField('Địa chỉ giao hàng', 'Hà Nội');
  await setModalField('Mặt hàng', product.key);
  await setModalField('Số lượng', '2');
  await clickModalButton('Ghi nhận phiếu');
  const failedShipment = await waitForInventory(async () => {
    const result = await request(`/collections/finance_inventory_transactions/${encodeURIComponent(failedDeliveryCode)}`, token);
    return result.status === 200 && result.body.record.shipmentStatus === 'Chờ giao' ? result.body.record : null;
  }, 'failed delivery shipment creation');
  await waitForShipmentAction(failedDeliveryCode, 'Bắt đầu giao');
  await page.evaluate((code) => {
    const row = [...document.querySelectorAll('tr')].find((item) => item.innerText.includes(code));
    [...(row?.querySelectorAll('button') || [])].find((button) => button.textContent.trim() === 'Bắt đầu giao')?.click();
  }, failedDeliveryCode);
  await waitForInventory(async () => {
    const result = await request(`/collections/finance_inventory_transactions/${encodeURIComponent(failedDeliveryCode)}`, token);
    return result.status === 200 && result.body.record.shipmentStatus === 'Đang giao' ? result.body.record : null;
  }, 'failed delivery in-transit state');
  await waitForShipmentAction(failedDeliveryCode, 'Thất bại');
  page.once('dialog', (dialog) => dialog.accept('Người nhận vắng mặt'));
  await page.evaluate((code) => {
    const row = [...document.querySelectorAll('tr')].find((item) => item.innerText.includes(code));
    [...(row?.querySelectorAll('button') || [])].find((button) => button.textContent.trim() === 'Thất bại')?.click();
  }, failedDeliveryCode);
  const failedShipmentRecord = await waitForInventory(async () => {
    const result = await request(`/collections/finance_inventory_transactions/${encodeURIComponent(failedDeliveryCode)}`, token);
    return result.status === 200 && result.body.record.shipmentStatus === 'Giao thất bại' ? result.body.record : null;
  }, 'failed delivery state');
  const stockBeforeReturn = (await request(`/collections/finance_inventory/${encodeURIComponent(product.key)}`, token)).body.record.stockQty;
  let completedShipmentAfterReturn = failedShipmentRecord;
  for (const expectedReceiptCount of [1, 2]) {
    await waitForShipmentAction(failedDeliveryCode, 'Nhận hàng về');
    await page.evaluate((code) => {
      const row = [...document.querySelectorAll('tr')].find((item) => item.innerText.includes(code));
      [...(row?.querySelectorAll('button') || [])].find((button) => button.textContent.trim() === 'Nhận hàng về')?.click();
    }, failedDeliveryCode);
    await page.waitForFunction(() => document.body.innerText.includes('Nhận hàng giao thất bại về kho'), { timeout: 10000 });
    await setModalField('SL nhận lại dùng được', '1');
    await clickModalButton('Ghi nhận hàng về kho');
    completedShipmentAfterReturn = await waitForInventory(async () => {
      const result = await request(`/collections/finance_inventory_transactions/${encodeURIComponent(failedDeliveryCode)}`, token);
      return result.status === 200 && result.body.record.shipmentReturns?.length === expectedReceiptCount ? result.body.record : null;
    }, `shipment return ${expectedReceiptCount}`);
    const returnedProduct = await waitForInventory(async () => {
      const result = await request(`/collections/finance_inventory/${encodeURIComponent(product.key)}`, token);
      return result.status === 200 && result.body.record.stockQty === stockBeforeReturn + expectedReceiptCount ? result.body.record : null;
    }, `stock increase after shipment return ${expectedReceiptCount}`);
    assert.equal(returnedProduct.stockQty, stockBeforeReturn + expectedReceiptCount);
  }
  await page.waitForFunction((code) => {
    const row = [...document.querySelectorAll('tr')].find((item) => item.innerText.includes(code));
    return row?.innerText.includes('Đã nhận đủ');
  }, { timeout: 15000 }, failedDeliveryCode);
  await page.waitForFunction(() => !document.body.innerText.includes('Nhận hàng giao thất bại về kho'), { timeout: 10000 });
  assert.equal(failedShipment.lines[0].quantity, 2);
  assert.equal(completedShipmentAfterReturn.shipmentStatus, 'Giao thất bại');
  assert.equal(completedShipmentAfterReturn.shipmentReturns.length, 2);

  await page.goto(`${webUrl}/admin/finance/inventory/reports`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Báo cáo giao dịch kho'), { timeout: 20000 });
  await page.waitForFunction((code) => document.body.innerText.includes(code), { timeout: 15000 }, receiptCode);
  await page.evaluate((value) => {
    const label = [...document.querySelectorAll('label')].find((element) => element.innerText.trim().startsWith('Loại phiếu'));
    const control = label?.querySelector('select');
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    if (control) { setter?.call(control, value); control.dispatchEvent(new Event('change', { bubbles: true })); }
  }, 'Giao hàng');
  await page.waitForFunction(([delivery, receipt]) => document.body.innerText.includes(delivery) && !document.body.innerText.includes(receipt), { timeout: 15000 }, [deliveryCode, receiptCode]);
  await page.goto(`${webUrl}/admin/finance/inventory/charts`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Luân chuyển hàng 12 tháng'), { timeout: 20000 });
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(inventoryApiErrors, []);
  console.log(JSON.stringify({ checks: 'legacy web product creation; persisted receipt; shipment creation and status transitions; partial failed-shipment returns; stock and delivery history; no page or inventory API errors', sku, receiptCode, deliveryCode, failedDeliveryCode, database: directory }));
} catch (error) {
  if (page) {
    console.error('Browser page:', (await page.$eval('body', (node) => node.innerText).catch(() => '')).slice(-3000));
    await page.screenshot({ path: path.join(directory, 'inventory-failure.png'), fullPage: true }).catch(() => {});
  }
  console.error('Browser errors:', JSON.stringify(pageErrors));
  console.error('Inventory API errors:', JSON.stringify(inventoryApiErrors));
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
