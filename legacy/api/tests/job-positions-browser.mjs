import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = path.resolve(apiDir, '..', 'web');
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-job-positions-'));
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
  SEED_ADMIN_EMAIL: 'job-positions-browser@example.test', SEED_ADMIN_PASSWORD: 'Job-Positions-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'JOB-POSITIONS-ADMIN', JWT_SECRET: 'isolated-job-position-browser-test-secret',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd: apiDir, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const api = spawn(process.execPath, ['index.mjs'], { cwd: apiDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
const vite = spawn(process.execPath, [path.join(webDir, 'node_modules', 'vite', 'bin', 'vite.js'), '--port', String(webPort), '--strictPort', '--host', '127.0.0.1'], {
  cwd: webDir, env: { ...process.env, VITE_API_URL: apiUrl }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
for (const child of [api, vite]) {
  child.stdout.on('data', chunk => { logs = (logs + chunk).slice(-12000); });
  child.stderr.on('data', chunk => { logs = (logs + chunk).slice(-12000); });
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
      await delay(100);
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
  async function apiRequest(route, method = 'GET', payload, expected = 200, token = adminToken) {
    const response = await fetch(`${apiUrl}${route}`, {
      method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    const body = await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
    return body;
  }

  const employeeEmail = 'job-positions-staff@example.test';
  await apiRequest('/users', 'POST', {
    email: employeeEmail, name: 'Nhân viên kiểm tra danh mục', password: 'Job-Positions-Staff-26!Secure',
    employeeCode: 'JOB-POSITIONS-STAFF', role: 'USER',
  }, 201);
  const employeeSession = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: employeeEmail, password: 'Job-Positions-Staff-26!Secure' }),
  }).then(response => response.json());
  const employeeToken = employeeSession.token || employeeSession.access_token;

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/collections/dropdown_positions')) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 950 });
  await page.evaluateOnNewDocument(({ accessToken, user }) => {
    localStorage.setItem('minepanel_token', accessToken);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { accessToken: adminToken, user: admin.user });
  await page.goto(`${webUrl}/admin/system/job-positions`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Quản lý vị trí công việc'));
  await page.waitForFunction(() => document.querySelectorAll('tbody tr').length > 0, { timeout: 15000 });
  assert.ok((await apiRequest('/collections/dropdown_positions', 'GET', undefined, 200, employeeToken)).data.length > 0);
  await apiRequest('/collections/dropdown_positions', 'POST', { record: { id: 'forbidden-position', name: 'Không được tạo' } }, 403, employeeToken);
  for (const label of ['Mã vị trí', 'Tên vị trí', 'Đơn vị công tác', 'Nhóm vị trí', 'Chức danh']) {
    assert.ok(await page.evaluate(value => document.body.innerText.includes(value), label), `Missing field/column: ${label}`);
  }

  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Thêm chức danh')?.click());
  await page.waitForFunction(() => document.body.innerText.includes('Lưu vị trí'));
  await page.waitForFunction(() => document.querySelector('input[placeholder="Nhập mã vị trí..."]')?.value.startsWith('POS-'));
  const code = await page.$eval('input[placeholder="Nhập mã vị trí..."]', input => input.value);
  assert.equal(await page.$eval('input[placeholder="Nhập mã vị trí..."]', input => input.readOnly), true);
  const fields = [
    ['input[placeholder^="Ví dụ: Kỹ sư Phần mềm"]', 'Kỹ sư QA trình duyệt'],
    ['input[placeholder="Nhập đơn vị công tác..."]', 'Khối Công nghệ'],
    ['input[placeholder="Nhập nhóm vị trí..."]', 'Chuyên môn'],
    ['input[placeholder="Nhập chức danh..."]', 'Kỹ sư đảm bảo chất lượng'],
  ];
  for (const [selector, value] of fields) {
    const input = await page.$(selector);
    assert.ok(input, `Missing input ${selector}`);
    await input.type(value);
  }
  const createResponse = page.waitForResponse(response => response.request().method() === 'POST' && response.url().includes('/collections/dropdown_positions'), { timeout: 10000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Lưu vị trí')?.click());
  const createdResponse = await createResponse;
  const createBody = await createdResponse.json();
  assert.equal(createdResponse.status(), 201, JSON.stringify(createBody));
  let positions = (await apiRequest('/collections/dropdown_positions')).data;
  let saved = positions.find(item => item.code === code);
  assert.ok(saved, `Position must be returned by the persisted collection API: ${JSON.stringify({ created: createBody.record, positions })}`);
  await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 15000 }, code).catch(async error => {
    throw new Error(`${error.message}\nBrowser content after save:\n${await page.evaluate(() => document.body.innerText)}`);
  });
  assert.equal(saved.department, 'Khối Công nghệ');
  assert.equal(saved.positionGroup, 'Chuyên môn');
  assert.equal(saved.title, 'Kỹ sư đảm bảo chất lượng');

  await page.evaluate(value => {
    const row = [...document.querySelectorAll('tbody tr')].find(item => item.innerText.includes(value));
    row?.querySelector('button[title="Chỉnh sửa"]')?.click();
  }, code);
  await page.waitForFunction(() => document.body.innerText.includes('Lưu chỉnh sửa'));
  const titleInput = await page.$('input[placeholder="Nhập chức danh..."]');
  await titleInput.click();
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await titleInput.type('Trưởng nhóm QA');
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Lưu chỉnh sửa')?.click());
  await page.waitForFunction(value => [...document.querySelectorAll('tbody tr')].some(row => row.innerText.includes(value)), { timeout: 15000 }, 'Trưởng nhóm QA');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(value => [...document.querySelectorAll('tbody tr')].some(row => row.innerText.includes(value)), { timeout: 15000 }, 'Trưởng nhóm QA');
  saved = (await apiRequest('/collections/dropdown_positions')).data.find(item => item.code === code);
  assert.equal(saved.title, 'Trưởng nhóm QA');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(apiErrors, []);
  console.log(JSON.stringify({ checks: 'job-position fields, admin-only writes, create, update and reload persistence', positionCode: code, savedTitle: saved.title }));
} catch (error) {
  console.error(`${error.stack || error}\n${logs}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of [vite, api]) if (child.exitCode === null) child.kill();
  await delay(100);
  for (const child of [vite, api]) if (child.exitCode === null) child.kill('SIGKILL');
}
