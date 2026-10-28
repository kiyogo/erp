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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-depreciation-browser-'));
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
  SEED_ADMIN_EMAIL: 'depreciation-browser@example.test', SEED_ADMIN_PASSWORD: 'Depreciation-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'DEPRECIATION-BROWSER-ADMIN', JWT_SECRET: 'depreciation-browser-isolated-test-secret',
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
const depreciationApiErrors = [];
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
  const businessDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  const period = businessDate.slice(0, 7);
  const shiftPeriod = (value, offset) => {
    const date = new Date(`${value}-01T00:00:00.000Z`);
    date.setUTCMonth(date.getUTCMonth() + offset);
    return date.toISOString().slice(0, 7);
  };
  const assets = [
    { suffix: 'STRAIGHT', method: 'Đường thẳng', residualValue: 7_000_000 },
    { suffix: 'DECLINING', method: 'Số dư giảm dần có điều chỉnh', residualValue: 5_000_000 },
    { suffix: 'PRODUCTION', method: 'Theo sản lượng / Công suất', residualValue: 4_000_000, productionCapacity: 1_000 },
    { suffix: 'OPENING', method: 'Đường thẳng', residualValue: 7_000_000, openingMonths: 1 },
  ].map(({ suffix, openingMonths = 0, ...details }) => ({
    key: `depreciation-ui-${suffix.toLowerCase()}`,
    code: `AST-DEP-UI-${suffix}`,
    barcode: `BC-DEP-UI-${suffix}`,
    name: `Tài sản khấu hao ${suffix}`,
    category: 'Thiết bị IT',
    department: 'Phòng Hạ tầng',
    originalPrice: 60_000_000,
    accumulatedDepreciation: openingMonths ? 1_472_222 : 0,
    netBookValue: openingMonths ? 58_527_778 : 60_000_000,
    depreciationMonths: 36,
    status: 'Trong kho',
    purchaseDate: `${shiftPeriod(period, -openingMonths)}-01`,
    history: [],
    openingMonths,
    ...details,
  }));
  for (const asset of assets) {
    const inventoryRecord = { ...asset };
    delete inventoryRecord.openingMonths;
    const response = await fetch(`${apiUrl}/collections/asset_items`, { method: 'POST', headers, body: JSON.stringify({ record: inventoryRecord }) });
    assert.equal(response.status, 201, await response.text());
  }

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && (response.url().includes('/collections/asset_depreciations') || response.url().includes('/assets/depreciation-runs'))) {
      depreciationApiErrors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  await page.setViewport({ width: 1440, height: 1050 });
  await page.goto(webUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const authScript = await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: token, user: admin.user });
  await page.goto(`${webUrl}/admin/assets/depreciation`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Chạy trích khấu hao tháng này'), { timeout: 30000 });

  async function clickButton(label, modal = false) {
    const selector = modal ? '.ant-modal-root button' : 'button';
    await page.waitForFunction((text, query) => [...document.querySelectorAll(query)].some(button => button.textContent.trim() === text && !button.disabled), { timeout: 20000 }, label, selector);
    const handle = await page.evaluateHandle((text, query) => [...document.querySelectorAll(query)].find(button => button.textContent.trim() === text && !button.disabled) || null, label, selector);
    const button = handle.asElement();
    assert.ok(button, `Missing enabled button: ${label}`);
    await button.click();
    await handle.dispose();
  }
  async function openRunModal() {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'Chạy trích khấu hao tháng này');
      if (!button) throw new Error('Missing depreciation run button.');
      button.click();
    });
    await page.waitForFunction(text => document.body.innerText.includes(text), { timeout: 15000 }, `Kỳ khấu hao ${period}`);
  }
  async function openAssetPlan(assetCode) {
    const opened = await page.evaluate(code => {
      const row = [...document.querySelectorAll('tr, .ant-table-row')].find(item => item.innerText.includes(code));
      const button = [...(row?.querySelectorAll('button') || [])].find(item => item.textContent.trim() === 'Kế hoạch');
      button?.click();
      return Boolean(button);
    }, assetCode);
    assert.ok(opened, `Missing depreciation plan action for ${assetCode}`);
  }
  async function fill(label, value) {
    const handle = await page.evaluateHandle(text => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
      .find(item => item.querySelector('label')?.textContent.includes(text))?.querySelector('input:not([disabled]), textarea') || null, label);
    const input = handle.asElement();
    assert.ok(input, `Missing input: ${label}`);
    await input.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.down(modifier);
    await page.keyboard.press('A');
    await page.keyboard.up(modifier);
    await page.keyboard.press('Backspace');
    await input.type(value);
    assert.equal(await input.evaluate(element => element.value), value, `Unexpected input value: ${label}`);
    await handle.dispose();
  }
  async function choose(label, option) {
    const currentValue = await page.evaluate(text => {
      const item = [...document.querySelectorAll('.ant-modal-root .ant-form-item')].find(field => field.querySelector('label')?.textContent.includes(text));
      return item?.querySelector('.ant-select-selection-item')?.textContent || '';
    }, label);
    if (currentValue.includes(option)) return;
    const handle = await page.evaluateHandle(text => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
      .find(item => item.querySelector('label')?.textContent.includes(text))?.querySelector('.ant-select-selector') || null, label);
    const selector = handle.asElement();
    assert.ok(selector, `Missing selector: ${label}`);
    await selector.click();
    await handle.dispose();
    await page.waitForFunction(text => {
      const dropdowns = [...document.querySelectorAll('.ant-select-dropdown')].filter(item => item.getBoundingClientRect().width > 0 && !item.classList.contains('k-select-exit'));
      return [...(dropdowns.at(-1)?.querySelectorAll('.ant-select-item') || [])].some(item => item.textContent.includes(text));
    }, { timeout: 15000 }, option);
    const selected = await page.evaluate(text => {
      const dropdowns = [...document.querySelectorAll('.ant-select-dropdown')].filter(item => item.getBoundingClientRect().width > 0 && !item.classList.contains('k-select-exit'));
      const item = [...(dropdowns.at(-1)?.querySelectorAll('.ant-select-item') || [])].find(optionItem => optionItem.textContent.includes(text));
      if (!item) return false;
      item.click();
      return true;
    }, option);
    assert.ok(selected, `Missing visible option: ${option}`);
    await page.waitForFunction((text, selectedOption) => {
      const item = [...document.querySelectorAll('.ant-modal-root .ant-form-item')].find(field => field.querySelector('label')?.textContent.includes(text));
      return item?.querySelector('.ant-select-selection-item')?.textContent.includes(selectedOption);
    }, { timeout: 10000 }, label, option);
  }
  async function getCollection(scope) {
    const response = await fetch(`${apiUrl}/collections/${scope}?limit=500`, { headers });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body.data;
  }
  async function waitForDepreciation(assetKey) {
    for (let attempt = 0; attempt < 100; attempt++) {
      const rows = await getCollection('asset_depreciations');
      const record = rows.find(item => item.assetKey === assetKey);
      if (record) return record;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`No depreciation schedule was saved for ${assetKey}`);
  }

  for (const asset of assets) {
    await clickButton('Thiết lập trích khấu hao');
    await page.waitForSelector('.ant-modal-root form');
    await choose('Tài sản trong danh mục', `${asset.code} — ${asset.name}`);
    await choose('Phương pháp trích khấu hao', asset.method);
    await fill('Giá trị thanh lý ước tính', String(asset.residualValue));
    if (asset.openingMonths) await fill('Số tháng đã khấu hao đầu kỳ', String(asset.openingMonths));
    if (asset.method === 'Theo sản lượng / Công suất') {
      await fill('Tổng sản lượng dự kiến', String(asset.productionCapacity));
    }
    assert.equal(await page.$eval('.ant-modal-root input[min="0"]', input => input.checkValidity()), true, 'Valid integer-VND residual value should pass browser validation.');
    await clickButton('Lưu cấu hình khấu hao', true);
    await page.waitForFunction(code => !document.querySelector('.ant-modal-root') && document.body.innerText.includes(code), { timeout: 20000 }, asset.code);
    const saved = await waitForDepreciation(asset.key);
    assert.equal(saved.assetCode, asset.code);
    assert.equal(saved.assetName, asset.name);
    assert.equal(saved.originalCost, asset.originalPrice);
    assert.equal(saved.lifeMonths, asset.depreciationMonths);
    assert.equal(saved.residualValue, asset.residualValue);
    assert.equal(saved.depreciationMethod, asset.method);
    assert.equal(saved.status, 'Đang trích khấu hao');
    assert.equal(saved.scheduleList[asset.openingMonths].period, period);
    if (asset.openingMonths) {
      assert.equal(saved.depreciatedMonths, asset.openingMonths);
      assert.equal(saved.openingBalanceImport.throughPeriod, shiftPeriod(period, -1));
      assert.equal(saved.openingBalanceImport.accumulatedDepreciation, asset.accumulatedDepreciation);
    }
    if (asset.productionCapacity) assert.equal(saved.productionCapacity, asset.productionCapacity);
  }

  const setups = await getCollection('asset_depreciations');
  assert.equal(setups.length, 4);
  assert.equal((await getCollection('finance_general_ledger')).filter(item => item.sourceModule === 'asset_depreciation').length, 0, 'Importing the opening balance must not create historic ledger entries.');
  await openRunModal();
  const productionInput = await page.$('.ant-modal-root input[placeholder="Sản lượng kỳ này"]');
  assert.ok(productionInput, 'Production-based depreciation requires actual units for this period.');
  await productionInput.type('100');
  assert.equal(await productionInput.evaluate(input => input.checkValidity()), true);
  await clickButton('Chấp nhận trích & Ghi sổ kế toán', true);

  let postedRecords;
  const setupByKey = new Map(setups.map(item => [item.key, item]));
  for (let attempt = 0; attempt < 100; attempt++) {
    postedRecords = await getCollection('asset_depreciations');
    if (postedRecords.every(item => item.depreciatedMonths === setupByKey.get(item.key).depreciatedMonths + 1)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(postedRecords.length, 4);
  assert.ok(postedRecords.every(item => item.depreciatedMonths === setupByKey.get(item.key).depreciatedMonths + 1 && String(item.lastRunDate).startsWith(period)));
  const expectedTotal = setups.reduce((sum, item) => sum + (item.depreciationMethod === 'Theo sản lượng / Công suất'
    ? Math.round((item.originalCost - item.residualValue) * 100 / item.productionCapacity)
    : item.scheduleList.find(row => row.period === period).monthlyAmount), 0);
  const postedTotal = postedRecords.reduce((sum, item) => sum + item.accumulatedDeprec - setupByKey.get(item.key).accumulatedDeprec, 0);
  assert.equal(postedTotal, expectedTotal);
  const productionRecord = postedRecords.find(item => item.depreciationMethod === 'Theo sản lượng / Công suất');
  assert.equal(productionRecord.productionByPeriod[period], 100);
  const openingRecord = postedRecords.find(item => item.assetCode.endsWith('-OPENING'));
  assert.equal(openingRecord.openingBalanceImport.throughPeriod, shiftPeriod(period, -1));
  assert.equal(openingRecord.depreciatedMonths, 2);

  const inventory = await getCollection('asset_items');
  for (const depreciation of postedRecords) {
    const asset = inventory.find(item => item.key === depreciation.assetKey);
    assert.ok(asset, `Missing linked asset ${depreciation.assetKey}`);
    assert.equal(asset.accumulatedDepreciation, depreciation.accumulatedDeprec);
    assert.equal(asset.netBookValue, asset.originalPrice - depreciation.accumulatedDeprec);
    assert.ok(asset.history.some(entry => entry.action === 'Ghi nhận khấu hao tài sản'));
  }
  const ledger = (await getCollection('finance_general_ledger')).filter(item => item.sourceModule === 'asset_depreciation');
  assert.equal(ledger.length, 4);
  assert.ok(ledger.every(entry => String(entry.sourceReference).startsWith(`asset-depreciation:${period}:`)), 'Only the current period should create ledger entries.');
  assert.equal(ledger.reduce((sum, entry) => sum + Number(entry.amount), 0), expectedTotal);
  assert.ok(ledger.every(entry => entry.author === admin.user.name));

  await page.waitForFunction(() => !document.querySelector('.ant-modal-root'), { timeout: 20000 });
  await openRunModal();
  await clickButton('Chấp nhận trích & Ghi sổ kế toán', true);
  await new Promise(resolve => setTimeout(resolve, 500));
  const ledgerAfterRepeat = (await getCollection('finance_general_ledger')).filter(item => item.sourceModule === 'asset_depreciation');
  assert.equal(ledgerAfterRepeat.length, 4, 'Running the same current period again must not duplicate ledger entries.');
  await clickButton('Hủy', true);
  await page.waitForFunction(() => !document.querySelector('.ant-modal-root'), { timeout: 20000 });
  await openAssetPlan(openingRecord.assetCode);
  await page.waitForFunction(() => document.body.innerText.includes('Số dư đầu kỳ'), { timeout: 15000 });
  assert.ok((await page.$eval('body', node => node.innerText)).includes(`Đã nhập số dư đầu kỳ đến ${shiftPeriod(period, -1)}`));
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(depreciationApiErrors, []);
  console.log(JSON.stringify({ checks: 'register three methods and a verified opening balance, reject backdated ledger entries, run the current period with actual production, verify inventory/history/ledger and replay, inspect imported schedule rows', period, totalPosted: expectedTotal, database: directory }));
} catch (error) {
  if (page) {
    console.error((await page.$eval('body', node => node.innerText).catch(() => '')).slice(-3000));
    console.error('Browser errors:', JSON.stringify(pageErrors));
    console.error('Depreciation API errors:', JSON.stringify(depreciationApiErrors));
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
