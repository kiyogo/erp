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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-disposal-browser-'));
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
  SEED_ADMIN_EMAIL: 'disposal-browser@example.test', SEED_ADMIN_PASSWORD: 'Disposal-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'DISPOSAL-BROWSER-ADMIN', JWT_SECRET: 'disposal-browser-isolated-test-secret',
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
  const asset = {
    key: 'ui-disposal-asset', code: 'UI-DISPOSAL-01', name: 'Thiết bị thanh lý thử', category: 'Thiết bị văn phòng',
    model: 'SN-DISPOSAL-01', status: 'Đang sử dụng', originalPrice: 5000000, accumulatedDepreciation: 1000000,
    history: [], assignedTo: 'Nhân viên thử', department: 'Vận hành',
  };
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
  await page.goto(`${webUrl}/admin/assets/disposal`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Lập biên bản thanh lý mới'), { timeout: 30000 });

  async function clickButton(label, modal = false) {
    await page.waitForFunction((text, inModal) => [...document.querySelectorAll(inModal ? '.ant-modal-root button' : 'button')]
      .some(button => button.textContent.trim() === text && !button.disabled), { timeout: 15000 }, label, modal);
    await page.evaluate((text, inModal) => [...document.querySelectorAll(inModal ? '.ant-modal-root button' : 'button')]
      .find(button => button.textContent.trim() === text && !button.disabled).click(), label, modal);
  }
  async function fill(label, value, modal = true) {
    const handle = await page.evaluateHandle((text, inModal) => {
      const root = inModal ? '.ant-modal-root ' : '';
      const item = [...document.querySelectorAll(`${root}.ant-form-item`)].find(node => node.querySelector('label')?.textContent.includes(text));
      return item?.querySelector('input:not([disabled]), textarea') || null;
    }, label, modal);
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
  async function clickInRow(label, code) {
    await page.waitForFunction((text, rowCode) => [...document.querySelectorAll('tr')]
      .some(row => row.innerText.includes(rowCode) && [...row.querySelectorAll('button')].some(button => button.textContent.trim() === text && !button.disabled)),
    { timeout: 20000 }, label, code);
    await page.evaluate((text, rowCode) => {
      const row = [...document.querySelectorAll('tr')].find(item => item.innerText.includes(rowCode));
      [...row.querySelectorAll('button')].find(button => button.textContent.trim() === text && !button.disabled).click();
    }, label, code);
  }
  async function records() {
    const response = await fetch(`${apiUrl}/collections/asset_disposals`, { headers });
    assert.equal(response.status, 200);
    return (await response.json()).data;
  }

  await clickButton('Lập biên bản thanh lý mới');
  await page.waitForSelector('.ant-modal-root form');
  const disposalCode = await page.$eval('.ant-modal-root input', input => input.value);
  await choose('Hình thức thanh lý', 'Bán đấu giá nội bộ CBNV');
  await choose('Tài sản trong danh mục', 'UI-DISPOSAL-01');
  await fill('Lý do đề xuất', 'Chi phí bảo trì không còn phù hợp');
  await fill('Giá khởi điểm', '3000000');
  await fill('Chủ tịch Hội đồng', 'Chủ tịch thử');
  await fill('Thành viên Hội đồng', 'Thành viên A, Thành viên B');
  await clickButton('Trình Hội đồng thanh lý', true);
  await page.waitForFunction(code => !document.querySelector('.ant-modal-root') && document.body.innerText.includes(code), { timeout: 20000 }, disposalCode);
  let disposal = (await records()).find(item => item.disposalCode === disposalCode);
  assert.ok(disposal);
  assert.equal(disposal.assetCode, asset.code);
  assert.equal(disposal.originalCost, 5000000);
  assert.equal(disposal.accumulatedDepreciation, 1000000);
  assert.equal(disposal.netBookValue, 4000000);
  assert.equal(disposal.status, 'Chờ hội đồng phê duyệt');
  assert.equal((await (await fetch(`${apiUrl}/collections/asset_items/${asset.key}`, { headers })).json()).record.status, 'Đang sử dụng');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(code => document.body.innerText.includes(code), { timeout: 30000 }, disposalCode);
  await clickInRow('Duyệt', disposalCode);
  await clickButton('Chấp thuận và chuyển sang xử lý', true);
  await page.waitForFunction(code => document.body.innerText.includes(code) && document.body.innerText.includes('Đang thực hiện xử lý'), { timeout: 20000 }, disposalCode);
  disposal = (await records()).find(item => item.disposalCode === disposalCode);
  assert.equal(disposal.status, 'Đang thực hiện xử lý');
  assert.equal(disposal.approvedBy, session.user.name);
  assert.equal((await (await fetch(`${apiUrl}/collections/asset_items/${asset.key}`, { headers })).json()).record.status, 'Chờ thanh lý');

  await clickInRow('Hoàn tất', disposalCode);
  await page.waitForSelector('.ant-modal-root form');
  await fill('Số tiền thu thực tế', '3000000');
  await fill('Chi phí xử lý', '200000');
  await fill('Bên mua', 'Đơn vị thu mua thử');
  await fill('Số điện thoại liên hệ', '0900000000');
  await clickButton('Lưu kết quả xử lý', true);
  await page.waitForFunction(code => !document.querySelector('.ant-modal-root') && document.body.innerText.includes(code) && document.body.innerText.includes('Đã thanh lý & Hoàn tất sổ sách'), { timeout: 20000 }, disposalCode);
  disposal = (await records()).find(item => item.disposalCode === disposalCode);
  assert.equal(disposal.actualDisposalPrice, 3000000);
  assert.equal(disposal.disposalCost, 200000);
  assert.equal(disposal.netGainLoss, -1200000);
  assert.equal(disposal.completedBy, session.user.name);
  const disposedAsset = (await (await fetch(`${apiUrl}/collections/asset_items/${asset.key}`, { headers })).json()).record;
  assert.equal(disposedAsset.status, 'Đã thanh lý');
  assert.deepEqual(disposedAsset.history.map(entry => entry.action), ['Đưa vào xử lý thanh lý', 'Hoàn tất xử lý thanh lý']);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(code => document.body.innerText.includes(code) && document.body.innerText.includes('Đã thanh lý & Hoàn tất sổ sách'), { timeout: 30000 }, disposalCode);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: 'create, snapshot, reload, approve, finalize sale and verify asset history', database: directory }));
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
