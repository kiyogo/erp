import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = path.resolve(apiDir, '..', 'web');
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-admin-user-profile-browser-'));
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
  SEED_ADMIN_EMAIL: 'admin-user-profile-browser@example.test', SEED_ADMIN_PASSWORD: 'Admin-User-Profile-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'PROFILE-ADMIN', JWT_SECRET: 'isolated-admin-user-profile-browser-secret',
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
const pageErrors = [];
const profileApiErrors = [];
try {
  for (const [url, child] of [[`${apiUrl}/health`, api], [webUrl, vite]]) {
    let ready = false;
    for (let attempt = 0; attempt < 450; attempt += 1) {
      try { ready = (await fetch(url)).ok; } catch {}
      if (ready) break;
      if (child.exitCode !== null) throw new Error(logs);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`Test server did not become ready: ${url}\n${logs}`);
  }

  const loginResponse = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }),
  });
  const login = await loginResponse.json();
  assert.equal(loginResponse.status, 200, JSON.stringify(login));
  const token = login.token || login.access_token;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  async function request(route, method = 'GET', payload, expected = 200) {
    const response = await fetch(`${apiUrl}${route}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
    const body = await response.json();
    assert.equal(response.status, expected, JSON.stringify(body));
    return body;
  }
  await request('/collections/business_org_units', 'POST', { record: { key: 'profile-test-unit', code: 'PT-01', name: 'Phòng Kiểm thử' } }, 201);
  const manager = (await request('/users', 'POST', {
    email: 'profile-manager@example.test', name: 'Nguyễn Quản lý', employeeCode: 'PROFILE-MANAGER',
    password: 'Profile-Manager-26!Secure', role: 'USER', department: 'Phòng Kiểm thử',
  }, 201)).user;
  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/users')) profileApiErrors.push(`HTTP ${response.status()} ${response.url()}`);
    if (response.status() >= 400 && response.url().includes('/employees/')) profileApiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 1100 });
  await page.evaluateOnNewDocument(({ accessToken, user }) => {
    localStorage.setItem('minepanel_token', accessToken);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
    localStorage.setItem(`kiyovn_profile_wizard_v4:${encodeURIComponent(user.email.trim().toLowerCase())}:done`, 'true');
  }, { accessToken: token, user: login.user });
  await page.goto(`${webUrl}/admin/users`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Thêm tài khoản'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Thêm tài khoản')?.click());
  await page.waitForFunction(() => document.querySelector('input[placeholder="Nhập họ và tên đầy đủ"]'));
  const accountsBeforeCancel = (await request('/users')).pagination.total;
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Hủy')?.click());
  await page.waitForFunction(() => !document.querySelector('.ant-modal-wrap'));
  assert.equal((await request('/users')).pagination.total, accountsBeforeCancel, 'cancel must discard the draft without creating a user');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Thêm tài khoản')?.click());
  await page.waitForFunction(() => document.querySelector('input[placeholder="Nhập họ và tên đầy đủ"]'));

  async function fillItem(labelText, value) {
    const found = await page.evaluate(({ label, nextValue }) => {
      const item = [...document.querySelectorAll('.ant-form-item')].find((node) => node.querySelector('.ant-form-item-label label')?.textContent.replace(/\s*\*$/, '').trim() === label);
      const input = item?.querySelector('input:not([type="file"])');
      if (!(input instanceof HTMLInputElement)) return false;
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
      descriptor?.set?.call(input, nextValue);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, { label: labelText, nextValue: value });
    assert.equal(found, true, `Company user form input is missing: ${labelText}`);
  }
  async function selectOption(labelText, optionText) {
    const opened = await page.evaluate((label) => {
      const item = [...document.querySelectorAll('.ant-form-item')].find((node) => node.querySelector('.ant-form-item-label label')?.textContent.replace(/\s*\*$/, '').trim() === label);
      const select = item?.querySelector('.ant-select');
      if (!(select instanceof HTMLElement)) return false;
      select.click();
      return true;
    }, labelText);
    assert.equal(opened, true, `Select is missing: ${labelText}`);
    await page.waitForSelector('.ant-select-dropdown');
    const selected = await page.evaluate((optionLabel) => {
      const option = [...document.querySelectorAll('.ant-select-dropdown .ant-select-item')].find((item) => item.textContent.trim() === optionLabel);
      if (!(option instanceof HTMLElement)) return false;
      option.click();
      return true;
    }, optionText);
    assert.equal(selected, true, `Option is missing: ${optionText}`);
  }
  async function selectDate(label, value) {
    await page.click(`[role="button"][aria-label="${label}"]`);
    await page.waitForSelector('.kiyovn-datepicker-popup');
    const result = await page.evaluate((dateValue) => {
      const popup = document.querySelector('.kiyovn-datepicker-popup');
      const grid = [...(popup?.children || [])].find((child) => child.style.gridTemplateColumns === 'repeat(7, 1fr)' && child.children.length === 42);
      const day = String(Number(dateValue.slice(-2)));
      const cell = [...(grid?.children || [])].find((child) => child.textContent.trim() === day && child.style.color !== 'rgb(203, 213, 225)');
      if (!cell) return false;
      cell.click();
      return true;
    }, value);
    assert.equal(result, true, `Date picker has no selectable day: ${label}`);
    await page.waitForFunction(([fieldLabel, expected]) => document.querySelector(`[role="button"][aria-label="${fieldLabel}"]`)?.textContent.trim().startsWith(expected), { timeout: 10000 }, [label, value]);
  }
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const fullName = 'Trần Minh An';
  const profileValues = {
    'Mã nhân viên / Tên đăng nhập': 'PROFILE-NEW-01',
    'Họ và đệm': 'Trần Minh',
    'Tên': 'An',
    'Họ và tên đầy đủ': fullName,
    'Email công ty': 'profile-new@example.test',
    'Mật khẩu khởi tạo': 'Profile-New-User-26!Secure',
    'Địa chỉ': '12 Phố Kiểm thử, Hà Nội',
    'Điện thoại cá nhân': '0900000001',
    'Email cá nhân': 'profile.personal@example.test',
    'Vị trí công việc': 'Chuyên viên kiểm thử',
    'Chức danh': 'Chuyên viên',
    'Điện thoại cơ quan': '02430000001',
    'Email công ty hồ sơ': 'profile-new@example.test',
  };
  for (const [label, value] of Object.entries(profileValues)) {
    if (label === 'Email công ty hồ sơ') {
      const result = await page.evaluate((nextValue) => {
        const label = (node) => node.querySelector('.ant-form-item-label label')?.textContent.replace(/\s*\*$/, '').trim();
        const item = [...document.querySelectorAll('.ant-form-item')].find((node) => label(node) === 'Email công ty' && node.querySelector('input')?.getAttribute('placeholder') === 'Nhập email công ty');
        const candidates = [...document.querySelectorAll('.ant-form-item')].filter((node) => label(node) === 'Email công ty');
        const input = candidates.at(-1)?.querySelector('input');
        if (!(input instanceof HTMLInputElement)) return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, nextValue);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        return Boolean(item || candidates.length === 2);
      }, value);
      assert.equal(result, true, 'Separate work-email field is missing.');
    } else {
      await fillItem(label, value);
    }
  }
  await selectDate('Ngày sinh', today);
  await selectDate('Ngày thử việc', today);
  await selectDate('Ngày chính thức', today);
  await selectOption('Giới tính', 'Nữ');
  await selectOption('Đơn vị công tác', 'Phòng Kiểm thử');
  await selectOption('Quản lý trực tiếp', `${manager.name} (${manager.employeeCode})`);
  await selectOption('Trạng thái lao động', 'Thử việc');
  const avatarPath = path.join(directory, 'avatar.png');
  writeFileSync(avatarPath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8YQAAAAASUVORK5CYII=', 'base64'));
  await (await page.$('#admin-user-avatar')).uploadFile(avatarPath);
  await page.waitForFunction(() => document.querySelector('img[alt="Ảnh đại diện"]')?.src.startsWith('data:image/png;base64,'));

  const createResponse = page.waitForResponse((response) => response.url().endsWith('/users') && response.request().method() === 'POST');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Lưu và phân quyền')?.click());
  const savedResponse = await createResponse;
  assert.equal(savedResponse.status(), 201);
  const created = (await savedResponse.json()).user;
  assert.equal(created.role, 'USER');
  const readProfile = async () => {
    const response = await fetch(`${apiUrl}/employees/${created.id}`, { headers });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body.employee;
  };
  let savedProfile = await readProfile();
  assert.equal(savedProfile.code, 'PROFILE-NEW-01');
  assert.equal(savedProfile.name, fullName);
  assert.equal(savedProfile.status, 'Thử việc');
  assert.equal(savedProfile.department, 'Phòng Kiểm thử');
  assert.equal(savedProfile.position, 'Chuyên viên kiểm thử');
  assert.equal(savedProfile.phone, '0900000001');
  assert.equal(savedProfile.avatar.startsWith('data:image/png;base64,'), true);
  assert.equal(savedProfile.details.firstName, 'An');
  assert.equal(savedProfile.details.middleLastName, 'Trần Minh');
  assert.equal(savedProfile.details.birthDate, today);
  assert.equal(savedProfile.details.gender, 'Nữ');
  assert.equal(savedProfile.details.resAddress, '12 Phố Kiểm thử, Hà Nội');
  assert.equal(savedProfile.details.personalEmail, 'profile.personal@example.test');
  assert.equal(savedProfile.details.managerId, manager.id);
  assert.equal(savedProfile.details.manager, manager.name);
  assert.equal(savedProfile.details.probationDate, today);
  assert.equal(savedProfile.details.officialDate, today);
  assert.equal(savedProfile.details.workPhone, '02430000001');
  assert.equal(savedProfile.details.workEmail, 'profile-new@example.test');
  assert.equal(savedProfile.details.jobTitle, 'Chuyên viên');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction((name) => document.body.innerText.includes(name), { timeout: 20000 }, fullName);
  const rowActions = await page.evaluate((name) => {
    const row = [...document.querySelectorAll('tr')].find((item) => item.innerText.includes(name));
    return row ? [...row.querySelectorAll('button')].map((button) => button.textContent.trim()) : [];
  }, fullName);
  assert.ok(rowActions.includes('Hồ sơ'), `Created employee is missing from the table: ${JSON.stringify(rowActions)}`);
  await page.evaluate((name) => {
    const row = [...document.querySelectorAll('tr')].find((item) => item.innerText.includes(name));
    [...(row?.querySelectorAll('button') || [])].find((button) => button.textContent.trim() === 'Hồ sơ')?.click();
  }, fullName);
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((button) => button.textContent.trim() === 'Sửa tài khoản'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Sửa tài khoản')?.click());
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-form-item')].some((item) => item.querySelector('label')?.textContent.replace(/\s*\*$/, '').trim() === 'Email cá nhân' && item.querySelector('input')?.value === 'profile.personal@example.test'));
  await fillItem('Điện thoại cá nhân', '0900000002');
  const updateResponse = page.waitForResponse((response) => response.url().endsWith(`/users/${created.id}`) && response.request().method() === 'PATCH');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Lưu')?.click());
  assert.equal((await updateResponse).status(), 200);
  await page.waitForFunction(() => !document.querySelector('.ant-modal-wrap'));
  savedProfile = await readProfile();
  assert.equal(savedProfile.phone, '0900000002');
  assert.equal(savedProfile.details.personalEmail, 'profile.personal@example.test');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(profileApiErrors, []);
  console.log(JSON.stringify({ checks: 'legacy user and employee creation, cancel, avatar upload, employment/profile fields, role assignment, reload, full profile edit and persistence', fields: Object.keys(profileValues).length + 12, role: created.role, database: directory }));
} catch (error) {
  console.error('Page errors:', JSON.stringify(pageErrors));
  console.error('Profile API errors:', JSON.stringify(profileApiErrors));
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
