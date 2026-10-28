import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, statSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = path.resolve(apiDir, '..', 'web');
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-incidents-browser-'));
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
  SEED_ADMIN_EMAIL: 'incidents-browser@example.test', SEED_ADMIN_PASSWORD: 'Incidents-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'INCIDENTS-BROWSER-ADMIN', JWT_SECRET: 'incidents-browser-isolated-test-secret',
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
const apiErrors = [];
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
  let code = '';
  const getRecord = async () => {
    const response = await fetch(`${apiUrl}/collections/ticket_incidents?limit=500`, { headers });
    assert.equal(response.status, 200);
    const body = await response.json();
    return body.data.find(record => record.key === code);
  };

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/collections/ticket_incidents')) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: token, user: admin.user });
  const cdp = await page.target().createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
  await page.goto(`${webUrl}/admin/tickets/incidents`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  async function clickButton(label, selector = 'button') {
    await page.waitForFunction((text, query) => [...document.querySelectorAll(query)].some(button => button.textContent.trim() === text && !button.disabled), { timeout: 15000 }, label, selector);
    await page.evaluate((text, query) => [...document.querySelectorAll(query)].find(button => button.textContent.trim() === text && !button.disabled)?.click(), label, selector);
  }
  async function fill(label, value, root = '.ant-modal-root') {
    const handle = await page.evaluateHandle((text, selector) => {
      const item = [...document.querySelectorAll(`${selector} .ant-form-item`)].find(node => node.querySelector('label')?.textContent.includes(text));
      return item?.querySelector('input, textarea') || null;
    }, label, root);
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
  async function waitForFile(filename) {
    const file = path.join(directory, filename);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (existsSync(file) && statSync(file).size > 0) return file;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Expected report download was not created: ${filename}`);
  }

  await clickButton('Báo cáo sự cố khẩn cấp');
  await page.waitForSelector('.ant-modal-root form');
  code = await page.evaluate(() => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
    .find(node => node.querySelector('label')?.textContent.includes('Mã sự cố'))?.querySelector('input')?.value || '');
  assert.match(code, /^INC-\d{4}-[A-F0-9]{8}$/);
  await fill('Mô tả tóm tắt sự cố', 'Không truy cập được cổng kiểm thử');
  await fill('Hệ thống / Dịch vụ bị ảnh hưởng', 'Cổng kiểm thử');
  await fill('Kế hoạch hành động', 'Khôi phục cổng kiểm thử\nKiểm tra cảnh báo máy chủ');
  await clickButton('Phát cảnh báo NOC', '.ant-modal-root button');
  await page.waitForFunction(() => !document.querySelector('.ant-modal-root'), { timeout: 15000 });
  await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 15000 }, code);
  let record = await getRecord();
  assert.ok(record, 'Incident was not persisted by the API.');
  assert.equal(record.status, 'Đang xử lý khẩn cấp');
  assert.equal(record.severity, 'P2 - Cao');
  assert.equal(record.actionItems.length, 2);
  assert.equal(record.rootCause, '');

  const row = await page.evaluateHandle(value => [...document.querySelectorAll('tr')].find(item => item.textContent.includes(value)) || null, code);
  assert.ok(row.asElement(), 'Incident table row was not rendered.');
  await row.evaluate(node => [...node.querySelectorAll('button')].find(button => button.textContent.trim() === 'Hồ sơ RCA')?.click());
  await row.dispose();
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-drawer-root')].some(node => node.getBoundingClientRect().width > 0 && node.innerText.includes('Kế Hoạch Hành Động')));
  await page.evaluate(() => [...document.querySelectorAll('.ant-drawer-root .ant-checkbox-wrapper')].find(node => node.textContent.includes('Đang triển khai'))?.click());
  for (let attempt = 0; attempt < 100; attempt++) {
    record = await getRecord();
    if (record?.actionItems?.[0]?.status === 'Hoàn tất') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(record.actionItems[0].status, 'Hoàn tất', 'Corrective action update was not persisted.');

  await clickButton('Ghi kết quả khắc phục và hoàn tất RCA', '.ant-drawer-root button');
  await page.waitForSelector('.ant-modal-root form');
  await fill('Nguyên nhân gốc rễ', 'Cấu hình cổng kiểm thử bị sai');
  await fill('Kết quả khắc phục', 'Khôi phục cấu hình và xác nhận truy cập thành công');
  await clickButton('Lưu kết quả và khép hồ sơ', '.ant-modal-root button');
  await page.waitForFunction(() => !document.querySelector('.ant-modal-root'), { timeout: 15000 });
  for (let attempt = 0; attempt < 100; attempt++) {
    record = await getRecord();
    if (record?.status === 'Đã xử lý & Hoàn tất RCA') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(record.status, 'Đã xử lý & Hoàn tất RCA');
  assert.equal(record.rootCause, 'Cấu hình cổng kiểm thử bị sai');
  assert.equal(record.resolutionSummary, 'Khôi phục cấu hình và xác nhận truy cập thành công');
  assert.ok(record.resolvedAt);
  assert.ok(record.downtimeMinutes >= 0);

  await clickButton('In Báo Cáo Post-Mortem A4', '.ant-drawer-root button');
  await waitForFile(`${code}_bao_cao_RCA.pdf`);
  await page.evaluate(() => document.querySelector('.ant-drawer-root .ant-drawer-close')?.click());
  await page.waitForFunction(() => ![...document.querySelectorAll('.ant-drawer-root')].some(node => node.getBoundingClientRect().width > 0));
  await clickButton('Xuất Báo Cáo');
  await waitForFile('Bao_cao_su_co_va_RCA.xlsx');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(value => {
    const row = [...document.querySelectorAll('tr')].find(item => item.textContent.includes(value));
    return row?.textContent.includes('Đã xử lý & Hoàn tất RCA');
  }, { timeout: 30000 }, code);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(apiErrors, []);
  console.log(JSON.stringify({ checks: 'create incident, persist actions and RCA, calculate downtime, export XLSX/PDF, reload persisted status', code, database: directory }));
} catch (error) {
  console.error(`${error.stack || error}\n${logs}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of [vite, api]) {
    if (child.exitCode === null) child.kill();
  }
  await new Promise(resolve => setTimeout(resolve, 100));
  for (const child of [vite, api]) if (child.exitCode === null) child.kill('SIGKILL');
}
