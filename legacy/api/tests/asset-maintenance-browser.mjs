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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-maintenance-browser-'));
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
  SEED_ADMIN_EMAIL: 'maintenance-browser@example.test', SEED_ADMIN_PASSWORD: 'Maintenance-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'MAINTENANCE-BROWSER-ADMIN', JWT_SECRET: 'maintenance-browser-isolated-test-secret',
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
    email: 'maintenance-worker@example.test', name: 'Kỹ sư bảo dưỡng thử', password: 'Maintenance-Worker-26!Secure',
    employeeCode: 'MAINTENANCE-WORKER', role: 'USER', department: 'Vận hành', position: 'Kỹ sư',
  }) });
  const employeePayload = await employeeResponse.json();
  assert.equal(employeeResponse.status, 201, JSON.stringify(employeePayload));
  const employee = employeePayload.user || employeePayload;
  const asset = {
    key: 'ui-maintenance-asset', code: 'UI-MAINTENANCE-01', name: 'Thiết bị bảo dưỡng thử', category: 'Thiết bị văn phòng',
    model: 'SN-MAINTENANCE-01', status: 'Đang sử dụng', location: 'Tầng 2', department: 'Vận hành', history: [],
  };
  const assetResponse = await fetch(`${apiUrl}/collections/asset_items`, { method: 'POST', headers, body: JSON.stringify({ record: asset }) });
  assert.equal(assetResponse.status, 201, await assetResponse.text());

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  const errors = [];
  const workflowResponses = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', async response => {
    if (response.url().includes('/collections/asset_maintenances') && ['PATCH', 'POST'].includes(response.request().method())) {
      workflowResponses.push({ status: response.status(), body: await response.text().catch(() => '') });
    }
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: token, user: session.user });
  await page.goto(`${webUrl}/admin/assets/maintenance`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Thiết lập lịch bảo dưỡng'), { timeout: 30000 });

  async function clickButton(label, modal = false) {
    await page.waitForFunction((text, inModal) => [...document.querySelectorAll(inModal ? '.ant-modal-root button' : 'button')]
      .some(button => button.textContent.trim() === text && !button.disabled), { timeout: 15000 }, label, modal);
    await page.evaluate((text, inModal) => [...document.querySelectorAll(inModal ? '.ant-modal-root button' : 'button')]
      .find(button => button.textContent.trim() === text && !button.disabled).click(), label, modal);
  }
  async function fillForm(label, value) {
    const handle = await page.evaluateHandle(text => {
      const item = [...document.querySelectorAll('.ant-modal-root .ant-form-item')].find(node => node.querySelector('label')?.textContent.includes(text));
      return item?.querySelector('input:not([disabled]), textarea') || null;
    }, label);
    const element = handle.asElement();
    if (!element) {
      const labels = await page.$$eval('.ant-modal-root .ant-form-item', items => items.map(item => ({ label: item.querySelector('label')?.textContent, inputs: [...item.querySelectorAll('input,textarea')].map(input => input.type || input.tagName) })));
      throw new Error(`Missing form input: ${label}; fields: ${JSON.stringify(labels)}`);
    }
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
  async function chooseDate(label, dateValue) {
    const wrapper = await page.evaluateHandle(text => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
      .find(item => item.querySelector('label')?.textContent.includes(text))?.querySelector('.kiyovn-datepicker-input'), label);
    assert.ok(wrapper.asElement(), `Missing date picker: ${label}`);
    await wrapper.asElement().click();
    await wrapper.dispose();
    const [year, month, day] = dateValue.split('-').map(Number);
    const monthNames = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
    for (let attempt = 0; attempt < 24; attempt++) {
      const current = await page.$eval('.kiyovn-datepicker-popup', popup => popup.innerText);
      if (current.includes(monthNames[month - 1]) && current.includes(String(year))) break;
      await page.click('.kiyovn-datepicker-popup button[title="Tháng sau"]');
    }
    await page.waitForFunction((targetDay) => [...document.querySelectorAll('.kiyovn-datepicker-popup div[style*="height: 28px"]')]
      .some(cell => cell.textContent.trim() === String(targetDay) && getComputedStyle(cell).color === 'rgb(30, 41, 59)'), { timeout: 15000 }, day);
    await page.evaluate(targetDay => [...document.querySelectorAll('.kiyovn-datepicker-popup div[style*="height: 28px"]')]
      .find(cell => cell.textContent.trim() === String(targetDay) && getComputedStyle(cell).color === 'rgb(30, 41, 59)').click(), day);
    await page.waitForFunction((text, expected) => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
      .find(item => item.querySelector('label')?.textContent.includes(text))?.querySelector('.kiyovn-datepicker-input')?.innerText.includes(expected), { timeout: 10000 }, label, dateValue);
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
    const response = await fetch(`${apiUrl}/collections/asset_maintenances`, { headers });
    assert.equal(response.status, 200);
    return (await response.json()).data;
  }

  await clickButton('Thiết lập lịch bảo dưỡng');
  await page.waitForSelector('.ant-modal-root form');
  const maintenanceCode = await page.$eval('.ant-modal-root input', input => input.value);
  await choose('Tài sản trong danh mục', 'UI-MAINTENANCE-01');
  await choose('Kỹ sư phụ trách', 'MAINTENANCE-WORKER');
  const addDays = (days) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const scheduledDate = addDays(30);
  await fillForm('Đối tác kỹ thuật', 'Đơn vị bảo dưỡng thử');
  await chooseDate('Ngày bảo dưỡng tiếp theo', scheduledDate);
  await fillForm('Dự toán', '250000');
  await clickButton('Lưu kế hoạch', true);
  await page.waitForFunction(code => !document.querySelector('.ant-modal-root') && document.body.innerText.includes(code), { timeout: 20000 }, maintenanceCode);
  let plan = (await records()).find(item => item.maintCode === maintenanceCode);
  assert.ok(plan);
  assert.equal(plan.assetKey, asset.key);
  assert.equal(plan.assetCodes, asset.code);
  assert.equal(plan.responsibleEngineerId, employee.id);
  assert.equal(plan.responsibleEngineer, employee.name);
  assert.equal(plan.vendorPartner, 'Đơn vị bảo dưỡng thử');
  assert.equal(plan.status, 'Đã lên lịch');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(code => document.body.innerText.includes(code), { timeout: 30000 }, maintenanceCode);
  await clickInRow('Bắt đầu', maintenanceCode);
  await page.waitForSelector('.ant-modal-root');
  await page.waitForFunction(() => document.querySelectorAll('.ant-modal-root .ant-checkbox-wrapper').length >= 4);
  assert.equal(await page.$$eval('.ant-modal-root .ant-checkbox-wrapper', items => items.length), 4);
  for (let index = 0; index < 4; index++) {
    await page.waitForFunction(index => {
      const item = document.querySelectorAll('.ant-modal-root .ant-checkbox-wrapper')[index];
      return item && !item.querySelector('input')?.disabled;
    }, { timeout: 15000 }, index);
    const checked = await page.$$eval('.ant-modal-root .ant-checkbox-wrapper', (items, currentIndex) => items[currentIndex].querySelector('.ant-checkbox-checked') !== null, index);
    if (!checked) {
      const checkbox = await page.$$('.ant-modal-root .ant-checkbox-wrapper');
      await checkbox[index].click();
      await page.waitForFunction(index => {
        const item = document.querySelectorAll('.ant-modal-root .ant-checkbox-wrapper')[index];
        return item?.querySelector('.ant-checkbox-checked') && !item.querySelector('input')?.disabled;
      }, { timeout: 15000 }, index);
    }
  }
  plan = (await records()).find(item => item.maintCode === maintenanceCode);
  assert.ok(plan.checklist.every(item => item.done), 'Checklist changes must finish saving before completion.');
  await page.waitForFunction(() => document.querySelectorAll('.ant-modal-root input[type="number"]').length >= 2);
  for (const [index, value] of [[0, '92'], [1, '125000']]) {
    const numbers = await page.$$('.ant-modal-root input[type="number"]');
    await numbers[index].focus();
    await page.keyboard.down(process.platform === 'darwin' ? 'Meta' : 'Control');
    await page.keyboard.press('KeyA');
    await page.keyboard.up(process.platform === 'darwin' ? 'Meta' : 'Control');
    await page.keyboard.press('Backspace');
    await numbers[index].type(value);
    await page.waitForFunction((field, expected) => document.querySelectorAll('.ant-modal-root input[type="number"]')[field]?.value === expected, { timeout: 10000 }, index, value);
  }
  const certificate = await page.$('.ant-modal-root input[maxlength="160"]');
  assert.ok(certificate, 'Missing certificate input');
  await certificate.type('CERT-MAINTENANCE-01');
  const note = await page.$('.ant-modal-root textarea');
  assert.ok(note, 'Missing completion note');
  await note.type('Đã vệ sinh và kiểm tra tải');
  assert.deepEqual(await page.$$eval('.ant-modal-root input[type="number"]', items => items.map(input => input.value)), ['92', '125000']);
  assert.equal(await certificate.evaluate(input => input.value), 'CERT-MAINTENANCE-01');
  assert.equal(await note.evaluate(input => input.value), 'Đã vệ sinh và kiểm tra tải');
  await clickButton('Lưu biên bản nghiệm thu', true);
  try {
    await page.waitForFunction(() => !document.querySelector('.ant-modal-root'), { timeout: 7000 });
  } catch {
    const current = (await records()).find(item => item.maintCode === maintenanceCode);
    const notices = await page.$$eval('.ant-message-notice', items => items.map(item => item.innerText));
    const entered = await page.$$eval('.ant-modal-root input[type="number"]', items => items.map(input => input.value));
    throw new Error(`Completion modal did not close; status=${current?.status}; checklist=${current?.checklist?.filter(item => item.done).length}; values=${JSON.stringify(entered)}; notices=${JSON.stringify(notices)}; responses=${JSON.stringify(workflowResponses)}`);
  }
  await page.waitForFunction(code => document.body.innerText.includes(code), { timeout: 10000 }, maintenanceCode);
  plan = (await records()).find(item => item.maintCode === maintenanceCode);
  assert.equal(plan.status, 'Đã lên lịch');
  assert.equal(plan.lastCompletionStatus, 'Đúng hạn');
  assert.equal(plan.actualCost, 125000);
  assert.equal(plan.healthScore, 92);
  assert.equal(plan.certificateCode, 'CERT-MAINTENANCE-01');
  assert.equal(plan.maintenanceHistory.length, 1);
  assert.equal(plan.maintenanceHistory[0].completedById, session.user.id);
  assert.equal(plan.maintenanceHistory[0].notes, 'Đã vệ sinh và kiểm tra tải');
  assert.equal(plan.maintenanceHistory[0].completedOnTime, true);
  assert.equal(plan.checklist.length, 4);
  assert.ok(plan.maintenanceHistory[0].checklist.every(item => item.done));
  assert.ok(plan.checklist.every(item => !item.done), 'A newly scheduled maintenance cycle must start with a fresh checklist.');
  const updatedAsset = (await (await fetch(`${apiUrl}/collections/asset_items/${asset.key}`, { headers })).json()).record;
  assert.equal(updatedAsset.history.filter(item => item.action === 'Hoàn tất bảo dưỡng định kỳ').length, 1);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(code => document.body.innerText.includes(code) && document.body.innerText.includes('Đã lên lịch'), { timeout: 30000 }, maintenanceCode);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: 'create plan, reload, start, persist checklist, complete and update asset history', database: directory }));
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
