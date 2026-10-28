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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-asset-todo-employee-browser-'));
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
  SEED_ADMIN_EMAIL: 'asset-todo-browser@example.test', SEED_ADMIN_PASSWORD: 'Asset-Todo-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'ASSET-TODO-BROWSER-ADMIN', JWT_SECRET: 'asset-todo-browser-isolated-test-secret',
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
let employeePage;
let adminPage;
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

  async function request(route, token, method = 'GET', payload) {
    const response = await fetch(`${apiUrl}${route}`, {
      method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    return { status: response.status, body: await response.json() };
  }
  async function login(email, password) {
    const result = await request('/auth/login', '', 'POST', { email, password });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    return { token: result.body.token || result.body.access_token, user: result.body.user };
  }
  async function waitForRecord(token, key, predicate) {
    let latest;
    for (let attempt = 0; attempt < 150; attempt++) {
      latest = await request(`/collections/asset_todos/${encodeURIComponent(key)}`, token);
      if (latest.status === 200 && predicate(latest.body.record)) return latest.body.record;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error(`Asset task did not reach the expected state: ${JSON.stringify(latest?.body)}`);
  }

  const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
  const suffix = Date.now().toString(36).toUpperCase();
  const employeePassword = 'Asset-Todo-Employee-26!Secure';
  const created = await request('/users', admin.token, 'POST', {
    email: `asset-todo-${suffix.toLowerCase()}@example.test`, name: `NV nhận việc ${suffix}`,
    employeeCode: `AST-TODO-${suffix}`, role: 'USER', password: employeePassword,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const employee = await login(created.body.user.email, employeePassword);
  const otherEmployeePassword = 'Asset-Todo-Other-26!Secure';
  const otherCreated = await request('/users', admin.token, 'POST', {
    email: `asset-todo-other-${suffix.toLowerCase()}@example.test`, name: `NV khác ${suffix}`,
    employeeCode: `AST-OTHER-${suffix}`, role: 'USER', password: otherEmployeePassword,
  });
  assert.equal(otherCreated.status, 201, JSON.stringify(otherCreated.body));
  const taskKey = `asset-todo-browser-${suffix}`;
  const taskCode = `CV-TS-${suffix}`;
  const otherTaskCode = `CV-TS-OTHER-${suffix}`;
  const taskTitle = `Kiểm kê máy trạm ${suffix}`;
  const newTask = await request('/collections/asset_todos', admin.token, 'POST', { record: {
    key: taskKey, taskCode, taskTitle, taskCategory: 'Kiểm kê đối soát', priority: 'Trung bình (P3)', deadline: '2026-11-20',
    assignedStaffId: employee.user.id, requester: 'Phòng quản trị', relatedAssetCode: 'AST-BROWSER-01', location: 'Văn phòng',
    estimatedHours: 2, actualHours: 0, status: 'Chờ xử lý',
    checklist: [
      { item: 'Kiểm tra mã tài sản', done: false },
      { item: 'Kiểm tra hiện trạng thiết bị', done: false },
      { item: 'Ghi nhận kết quả kiểm kê', done: false },
    ], notes: 'Nhiệm vụ kiểm tra luồng cổng nhân viên.',
  } });
  assert.equal(newTask.status, 201, JSON.stringify(newTask.body));
  const otherTask = await request('/collections/asset_todos', admin.token, 'POST', { record: {
    key: `asset-todo-other-browser-${suffix}`, taskCode: otherTaskCode, taskTitle: 'Nhiệm vụ của nhân viên khác',
    taskCategory: 'Kiểm kê đối soát', priority: 'Thấp (P4)', deadline: '2026-11-20', assignedStaffId: otherCreated.body.user.id,
    requester: 'Phòng quản trị', relatedAssetCode: 'AST-OTHER-01', location: 'Văn phòng', estimatedHours: 1,
    checklist: [{ item: 'Kiểm tra tài sản khác', done: false }],
  } });
  assert.equal(otherTask.status, 201, JSON.stringify(otherTask.body));

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  const employeeContext = await browser.createBrowserContext();
  const adminContext = await browser.createBrowserContext();
  employeePage = await employeeContext.newPage();
  adminPage = await adminContext.newPage();
  for (const page of [employeePage, adminPage]) {
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', response => {
      if (response.status() >= 400 && response.url().includes('/collections/asset_todos')) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
    });
    await page.setViewport({ width: 1440, height: 1000 });
  }

  await employeePage.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
    localStorage.setItem(`kiyovn_profile_wizard_v4:${encodeURIComponent(user.email.trim().toLowerCase())}:done`, 'true');
  }, { value: employee.token, user: employee.user });
  await employeePage.goto(`${webUrl}/employee/assets/tasks`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await employeePage.waitForFunction(([code, title]) => document.body.innerText.includes(code) && document.body.innerText.includes(title), { timeout: 30000 }, [taskCode, taskTitle]);
  assert.equal(await employeePage.evaluate(code => document.body.innerText.includes(code), otherTaskCode), false, 'The employee must not see tasks assigned to someone else.');
  const employeeControls = await employeePage.evaluate(() => ({
    createButton: [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Tạo nhiệm vụ mới'),
    row: [...document.querySelectorAll('tr')].find(item => item.innerText.includes(document.body.innerText.match(/CV-TS-[A-Z0-9]+/)?.[0] || ''))?.innerText || '',
  }));
  assert.equal(employeeControls.createButton, false, 'Employees must not see the admin create action.');
  assert.ok(employeeControls.row.includes('Bắt đầu'), `Expected the assigned employee to see their start action: ${employeeControls.row}`);

  await employeePage.evaluate(code => {
    const row = [...document.querySelectorAll('tr')].find(item => item.innerText.includes(code));
    [...(row?.querySelectorAll('button') || [])].find(button => button.textContent.trim() === 'Bắt đầu')?.click();
  }, taskCode);
  await waitForRecord(employee.token, taskKey, record => record?.status === 'Đang thực hiện');

  await employeePage.evaluate(code => {
    const row = [...document.querySelectorAll('tr')].find(item => item.innerText.includes(code));
    [...(row?.querySelectorAll('button') || [])].find(button => button.textContent.trim() === 'Chi tiết')?.click();
  }, taskCode);
  await employeePage.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Gửi duyệt nghiệm thu'), { timeout: 15000 });
  for (let index = 0; index < 3; index++) {
    const clicked = await employeePage.evaluate(index => {
      const inputs = [...document.querySelectorAll('.ant-drawer-root input.ant-checkbox-input')];
      if (inputs.length !== 3 || inputs[index]?.disabled) return false;
      inputs[index].click();
      return true;
    }, index);
    assert.equal(clicked, true, 'All assigned checklist items should be available to the employee.');
    await waitForRecord(employee.token, taskKey, record => record?.checklist?.[index]?.done === true);
  }
  await employeePage.evaluate(() => [...document.querySelectorAll('.ant-drawer-root button')].find(button => button.textContent.trim() === 'Gửi duyệt nghiệm thu')?.click());
  await waitForRecord(employee.token, taskKey, record => record?.status === 'Chờ phê duyệt cấp trên');
  await employeePage.waitForFunction(() => document.body.innerText.includes('Đã gửi cấp trên nghiệm thu'), { timeout: 15000 });
  assert.equal(await employeePage.evaluate(() => [...document.querySelectorAll('.ant-drawer-root button')].some(button => button.textContent.trim() === 'Nghiệm thu hoàn tất')), false);

  await adminPage.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: admin.token, user: admin.user });
  await adminPage.goto(`${webUrl}/admin/assets/todo`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await adminPage.waitForFunction(code => document.body.innerText.includes(code), { timeout: 30000 }, taskCode);
  await adminPage.evaluate(code => {
    const row = [...document.querySelectorAll('tr')].find(item => item.innerText.includes(code));
    [...(row?.querySelectorAll('button') || [])].find(button => button.textContent.trim() === 'Nghiệm thu')?.click();
  }, taskCode);
  await adminPage.waitForFunction(() => [...document.querySelectorAll('.ant-modal button')].some(button => button.textContent.trim() === 'Xác nhận hoàn tất'), { timeout: 15000 });
  await adminPage.evaluate(() => {
    const modal = document.querySelector('.ant-modal');
    const numberInput = modal?.querySelector('input[type="number"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (numberInput) {
      setter?.call(numberInput, '1.5');
      numberInput.dispatchEvent(new Event('input', { bubbles: true }));
      numberInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const textarea = modal?.querySelector('textarea');
    const textSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (textarea) {
      textSetter?.call(textarea, 'Đã đối chiếu mã và tình trạng tài sản.');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
    }
    [...(modal?.querySelectorAll('button') || [])].find(button => button.textContent.trim() === 'Xác nhận hoàn tất')?.click();
  });
  const completed = await waitForRecord(admin.token, taskKey, record => record?.status === 'Đã hoàn thành' && record.actualHours === 1.5 && Boolean(record.completedById));

  const final = await request(`/collections/asset_todos/${taskKey}`, admin.token);
  assert.equal(final.status, 200);
  assert.equal(completed.actualHours, 1.5);
  assert.equal(final.body.record.completedById, admin.user.id);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(apiErrors, []);
  console.log(JSON.stringify({ checks: 'employee sees only the assigned task, starts it, completes checklist and submits; admin approves; final actor persists; no browser or asset-todo API errors', key: taskKey, database: directory }));
} catch (error) {
  for (const [label, page] of [['Employee', employeePage], ['Admin', adminPage]]) {
    if (page) {
      console.error(`${label} page:`, (await page.$eval('body', node => node.innerText).catch(() => '')).slice(-3000));
      await page.screenshot({ path: path.join(directory, `${label.toLowerCase()}-failure.png`), fullPage: true }).catch(() => {});
    }
  }
  console.error('Browser errors:', JSON.stringify(pageErrors));
  console.error('Asset todo API errors:', JSON.stringify(apiErrors));
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
