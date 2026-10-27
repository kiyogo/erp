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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-repairs-browser-'));
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
  SEED_ADMIN_EMAIL: 'repairs-browser@example.test', SEED_ADMIN_PASSWORD: 'Repairs-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'REPAIRS-BROWSER-ADMIN', JWT_SECRET: 'repairs-browser-isolated-test-secret',
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
const repairResponses = [];
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
  const asset = { key: 'ui-repair-asset', code: 'UI-REPAIR-01', name: 'Thiết bị cần sửa', category: 'Thiết bị IT', serialNo: 'SN-REPAIR-01', status: 'Đang sử dụng', location: 'Văn phòng thử', department: 'Phòng Kỹ Thuật', assignedTo: 'Nhân viên thử', history: [] };
  const assetResponse = await fetch(`${apiUrl}/collections/asset_items`, { method: 'POST', headers, body: JSON.stringify({ record: asset }) });
  assert.equal(assetResponse.status, 201, await assetResponse.text());

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => {
    if (response.url().includes('/assets/repairs/')) repairResponses.push({ status: response.status(), url: response.url(), body: await response.text().catch(() => '') });
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: token, user: session.user });
  await page.goto(`${webUrl}/admin/assets/repairs`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Lập phiếu báo hỏng & sửa chữa'), { timeout: 30000 });

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
  async function setDateToToday(label) {
    const handle = await page.evaluateHandle(text => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
      .find(node => node.querySelector('label')?.textContent.includes(text))?.querySelector('.kiyovn-datepicker-input'), label);
    const element = handle.asElement();
    assert.ok(element, `Missing date input: ${label}`);
    await element.click();
    await handle.dispose();
    await clickButton('Hôm nay');
    await page.waitForFunction(text => {
      const field = [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
        .find(node => node.querySelector('label')?.textContent.includes(text))?.querySelector('.kiyovn-datepicker-input');
      const value = field?.textContent.trim();
      return Boolean(value && !value.includes('YYYY-MM-DD'));
    }, { timeout: 10000 }, label);
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

  await clickButton('Lập phiếu báo hỏng & sửa chữa');
  await page.waitForSelector('.ant-modal-root form');
  const repairCode = await page.$eval('.ant-modal-root input', input => input.value);
  await choose('Tài sản trong danh mục', 'UI-REPAIR-01');
  await fill('Mô tả hiện tượng hư hỏng', 'Máy không khởi động');
  await fill('Đơn vị / Trung tâm sửa chữa', 'Trung tâm thử nghiệm');
  await fill('Dự toán kinh phí sửa', '0');
  await setDateToToday('Ngày dự kiến hoàn thành');
  await fill('Người báo hỏng', 'Nhân viên thử');
  await choose('Phòng ban', 'Phòng Kỹ Thuật');
  await clickButton('Xác nhận gửi phiếu sửa chữa', false, true);
  await page.waitForFunction(code => !document.querySelector('.ant-modal-root') && document.body.innerText.includes(code) && document.body.innerText.includes('Chờ duyệt báo giá'), { timeout: 20000 }, repairCode);
  const repairs = (await (await fetch(`${apiUrl}/collections/asset_repairs`, { headers })).json()).data;
  const repair = repairs.find(item => item.repairCode === repairCode);
  assert.ok(repair);
  assert.equal(repair.assetKey, asset.key);
  assert.equal(repair.estimatedCost, 0);
  assert.equal((await (await fetch(`${apiUrl}/collections/asset_items/${asset.key}`, { headers })).json()).record.status, 'Đang sửa chữa');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(code => document.body.innerText.includes(code), { timeout: 30000 }, repairCode);
  await clickButton('Duyệt');
  await page.waitForFunction(() => document.body.innerText.includes('Đang sửa chữa tại hãng'), { timeout: 15000 });
  await clickButton('Chờ linh kiện');
  await page.waitForFunction(() => document.body.innerText.includes('Chờ linh kiện thay thế'), { timeout: 15000 });
  await clickButton('Tiếp tục sửa');
  await page.waitForFunction(() => document.body.innerText.includes('Đang sửa chữa tại hãng'), { timeout: 15000 });
  await clickButton('Nghiệm thu');
  await page.waitForSelector('.ant-modal-root input[type="number"]');
  await page.type('.ant-modal-root input[type="number"]', '0');
  await page.type('.ant-modal-root textarea', 'Đã kiểm tra, thiết bị hoạt động tốt.');
  await clickButton('Xác nhận nghiệm thu & Bàn giao', false, true);
  await page.waitForFunction(() => !document.querySelector('.ant-modal-root') && document.body.innerText.includes('Đã sửa xong & Bàn giao'), { timeout: 20000 });
  const completedRepair = (await (await fetch(`${apiUrl}/collections/asset_repairs/${encodeURIComponent(repair.key)}`, { headers })).json()).record;
  assert.equal(completedRepair.status, 'Đã sửa xong & Bàn giao');
  assert.equal(completedRepair.actualCost, 0);
  assert.equal(completedRepair.approverId, session.user.id);
  assert.equal(completedRepair.completedById, session.user.id);
  const restoredAsset = (await (await fetch(`${apiUrl}/collections/asset_items/${asset.key}`, { headers })).json()).record;
  assert.equal(restoredAsset.status, 'Đang sử dụng');
  assert.equal(restoredAsset.assignedTo, asset.assignedTo);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: 'create, reload, approve, wait for parts, resume, complete repair and restore asset', database: directory }));
} catch (error) {
  if (page) console.error((await page.$eval('body', node => node.innerText).catch(() => '')).slice(-3000));
  if (repairResponses.length) console.error(JSON.stringify(repairResponses));
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
