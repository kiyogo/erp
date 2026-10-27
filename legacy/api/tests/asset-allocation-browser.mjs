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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-allocation-browser-'));
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
  SEED_ADMIN_EMAIL: 'allocation-browser@example.test', SEED_ADMIN_PASSWORD: 'Allocation-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'ALLOCATION-BROWSER-ADMIN', JWT_SECRET: 'allocation-browser-isolated-test-secret',
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
  const token = session.token || session.access_token;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const employeeResponse = await fetch(`${apiUrl}/users`, { method: 'POST', headers, body: JSON.stringify({
    email: 'allocation-worker@example.test', name: 'Nhân viên kiểm thử', password: 'Allocation-Worker-26!Secure',
    employeeCode: 'ALLOCATION-WORKER', role: 'USER', department: 'Phòng công nghệ', position: 'Kỹ sư',
  }) });
  assert.equal(employeeResponse.status, 201, await employeeResponse.text());
  const asset = { key: 'ui-allocation-asset', code: 'UI-ALLOCATION-01', name: 'Thiết bị cấp phát thử', category: 'Thiết bị IT', serialNo: 'SN-ALLOCATION-01', status: 'Trong kho', location: 'Kho thử', department: 'Kho', assignedTo: '', history: [] };
  const assetResponse = await fetch(`${apiUrl}/collections/asset_items`, { method: 'POST', headers, body: JSON.stringify({ record: asset }) });
  assert.equal(assetResponse.status, 201, await assetResponse.text());

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: token, user: session.user });
  await page.goto(`${webUrl}/admin/assets/allocation`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Lập phiếu Cấp phát / Thu hồi'), { timeout: 30000 });

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
      return item?.querySelector('input:not([disabled]), textarea') || null;
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

  await clickButton('Lập phiếu Cấp phát / Thu hồi');
  await page.waitForSelector('.ant-modal-root form');
  const ticketCode = await page.$eval('.ant-modal-root input', input => input.value);
  await choose('Tài sản trong danh mục', 'UI-ALLOCATION-01');
  await choose('Nhân viên nhận / bàn giao', 'ALLOCATION-WORKER');
  await fill('Cán bộ bàn giao', 'Thủ kho kiểm thử');
  await fill('Tình trạng kỹ thuật', 'Thiết bị nguyên vẹn');
  await clickButton('Xác nhận lập biên bản', false, true);
  await page.waitForFunction(code => !document.querySelector('.ant-modal-root') && document.body.innerText.includes(code) && document.body.innerText.includes('Chờ nhân viên ký xác nhận'), { timeout: 20000 }, ticketCode);
  let allocations = (await (await fetch(`${apiUrl}/collections/asset_allocations`, { headers })).json()).data;
  let allocation = allocations.find(item => item.ticketCode === ticketCode);
  assert.ok(allocation);
  assert.ok(allocation.key);
  const persistedAllocation = await (await fetch(`${apiUrl}/collections/asset_allocations/${encodeURIComponent(allocation.key)}`, { headers })).json();
  assert.equal(persistedAllocation.record.ticketCode, ticketCode);
  assert.equal((await (await fetch(`${apiUrl}/collections/asset_items/${asset.key}`, { headers })).json()).record.status, 'Trong kho');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(code => document.body.innerText.includes(code), { timeout: 30000 }, ticketCode);
  await clickButton('Xác nhận');
  await page.waitForFunction(() => document.body.innerText.includes('Nhập lại họ tên người nhận để xác nhận'));
  await page.waitForSelector('.ant-modal-root input');
  await page.type('.ant-modal-root input', allocation.employeeName);
  await clickButton('Xác nhận bàn giao', false, true);
  await page.waitForFunction(() => !document.querySelector('.ant-modal-root') && document.body.innerText.includes('Đã bàn giao hoàn tất'), { timeout: 20000 });
  const allocatedAsset = (await (await fetch(`${apiUrl}/collections/asset_items/${asset.key}`, { headers })).json()).record;
  assert.equal(allocatedAsset.status, 'Đang sử dụng');
  assert.equal(allocatedAsset.assignedTo, allocation.employeeName);
  assert.equal(allocatedAsset.history.filter(item => item.action === 'Cấp phát tài sản').length, 1);

  await clickButton('Lập phiếu Cấp phát / Thu hồi');
  await page.waitForSelector('.ant-modal-root form');
  const returnCode = await page.$eval('.ant-modal-root input', input => input.value);
  await choose('Loại nghiệp vụ', 'Thu hồi về kho công ty');
  await choose('Mục đích thực hiện', 'Thu hồi định kỳ nâng cấp');
  await choose('Tài sản trong danh mục', 'UI-ALLOCATION-01');
  await choose('Nhân viên nhận / bàn giao', 'ALLOCATION-WORKER');
  await fill('Cán bộ bàn giao', 'Thủ kho kiểm thử');
  await fill('Tình trạng kỹ thuật', 'Đã kiểm tra để nhập kho');
  await clickButton('Xác nhận lập biên bản', false, true);
  await page.waitForFunction(() => !document.querySelector('.ant-modal-root') && document.body.innerText.includes('Đã thu hồi về kho'), { timeout: 20000 });
  const returned = (await (await fetch(`${apiUrl}/collections/asset_allocations`, { headers })).json()).data.find(item => item.ticketCode === returnCode);
  assert.ok(returned, `Could not find return ticket ${returnCode}`);
  const returnedAsset = (await (await fetch(`${apiUrl}/collections/asset_items/${asset.key}`, { headers })).json()).record;
  assert.equal(returnedAsset.status, 'Trong kho');
  assert.equal(returnedAsset.assignedTo, '');
  assert.equal(returnedAsset.history.filter(item => item.action === 'Thu hồi tài sản').length, 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: 'create, reload, confirm allocation, return asset and reload inventory', database: directory }));
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
