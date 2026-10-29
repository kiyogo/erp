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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-company-profile-browser-'));
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
  SEED_ADMIN_EMAIL: 'company-profile-browser@example.test', SEED_ADMIN_PASSWORD: 'Company-Profile-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'COMPANY-PROFILE-ADMIN', JWT_SECRET: 'isolated-company-profile-browser-secret',
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
  async function getProfile() {
    const response = await fetch(`${apiUrl}/system/company-profile`, { headers: { Authorization: `Bearer ${token}` } });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body.profile;
  }

  const values = {
    'Tên pháp nhân công ty': 'Công ty kiểm thử hồ sơ',
    'Mã số thuế doanh nghiệp': '0012345678',
    'Địa chỉ trụ sở chính': '12 Đường Kiểm Thử, Hà Nội',
    'Tên đầy đủ': 'Công ty Cổ phần Kiểm Thử Hệ Thống',
    'Tên viết tắt': 'KTS',
    'Mã công ty': 'KTS-001',
    'Loại hình kinh doanh': 'Công nghệ thông tin',
    'Ngày thành lập': new Date().toISOString().slice(0, 10),
    'Ngày cấp đăng ký kinh doanh': new Date().toISOString().slice(0, 10),
    'Mã đăng ký kinh doanh': 'DKKD-2020-001',
    'Nơi cấp': 'Sở Kế hoạch và Đầu tư Hà Nội',
    'Người đại diện pháp luật': 'Nguyễn An',
    'Chức danh người đại diện': 'Tổng giám đốc',
    'Điện thoại': '+84900000000',
    Fax: '02430000000',
    Email: 'legal@example.test',
    Website: 'https://example.test/company',
  };
  const fieldMap = {
    'Tên pháp nhân công ty': 'companyName',
    'Mã số thuế doanh nghiệp': 'taxCode',
    'Địa chỉ trụ sở chính': 'address',
    'Tên đầy đủ': 'fullName',
    'Tên viết tắt': 'shortName',
    'Mã công ty': 'companyCode',
    'Loại hình kinh doanh': 'businessType',
    'Ngày thành lập': 'establishedDate',
    'Ngày cấp đăng ký kinh doanh': 'registrationDate',
    'Mã đăng ký kinh doanh': 'registrationNo',
    'Nơi cấp': 'registrationIssuer',
    'Người đại diện pháp luật': 'representative',
    'Chức danh người đại diện': 'representativeTitle',
    'Điện thoại': 'phone', Fax: 'fax', Email: 'email', Website: 'website',
  };
  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe')
    ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('response', (response) => {
    if (response.status() >= 400 && response.url().includes('/system/company-profile')) profileApiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ accessToken, user }) => {
    localStorage.setItem('minepanel_token', accessToken);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
    localStorage.setItem(`kiyovn_profile_wizard_v4:${encodeURIComponent(user.email.trim().toLowerCase())}:done`, 'true');
  }, { accessToken: token, user: login.user });
  await page.goto(`${webUrl}/admin/settings/system`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('input[aria-label="Tên pháp nhân công ty"]', { timeout: 30000 });
  await page.waitForFunction(() => {
    const save = [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Lưu cấu hình hệ thống');
    return Boolean(save && !save.disabled);
  }, { timeout: 30000 });

  async function setDateField(label, value) {
    const selector = `[role="button"][aria-label="${label}"]`;
    await page.click(selector);
    await page.waitForSelector('.kiyovn-datepicker-popup');
    const selected = await page.evaluate((dateValue) => {
      const popup = document.querySelector('.kiyovn-datepicker-popup');
      const grid = [...(popup?.children || [])].find((child) => child.style.gridTemplateColumns === 'repeat(7, 1fr)' && child.children.length === 42);
      if (!grid) return { selected: false, grids: [...(popup?.children || [])].map((child) => child.style.gridTemplateColumns) };
      const day = String(Number(dateValue.slice(-2)));
      const cell = [...grid.children].find((child) => child.textContent.trim() === day && child.style.color !== 'rgb(203, 213, 225)');
      if (!cell) return { selected: false, day, colors: [...grid.children].filter((child) => child.textContent.trim() === day).map((child) => child.style.color) };
      cell.click();
      return { selected: true };
    }, value);
    assert.equal(selected.selected, true, `Could not select date for ${label}: ${JSON.stringify(selected)}`);
    await page.waitForFunction(([fieldLabel, expected]) => {
      const field = document.querySelector(`[role="button"][aria-label="${fieldLabel}"]`);
      return field?.textContent.trim().startsWith(expected);
    }, { timeout: 10000 }, [label, value]);
  }

  for (const [label, value] of Object.entries(values)) {
    if (label.startsWith('Ngày ')) {
      await setDateField(label, value);
      continue;
    }
    const found = await page.evaluate(({ labelText, nextValue }) => {
      const control = document.querySelector(`[aria-label="${labelText}"]`);
      if (!(control instanceof HTMLInputElement)) return false;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(control, nextValue);
      control.dispatchEvent(new Event('input', { bubbles: true }));
      control.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, { labelText: label, nextValue: value });
    assert.equal(found, true, `Company profile input is missing: ${label}`);
  }
  const saveResponse = page.waitForResponse((response) => response.url().includes('/system/company-profile') && response.request().method() === 'PUT');
  await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Lưu cấu hình hệ thống')?.click());
  const savedResponse = await saveResponse;
  assert.equal(savedResponse.status(), 200);
  const savedProfile = await getProfile();
  for (const [label, value] of Object.entries(values)) assert.equal(savedProfile[fieldMap[label]], value, label);
  assert.equal(savedProfile.revision, 1);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction((expected) => Object.entries(expected).every(([label, value]) => {
    const control = document.querySelector(`[aria-label="${label}"]`);
    return control instanceof HTMLInputElement ? control.value === value : control?.textContent.trim().startsWith(value);
  }), { timeout: 20000 }, values);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(profileApiErrors, []);
  console.log(JSON.stringify({ checks: 'legacy company profile UI fields; save to server; persisted values after reload; no page or company profile API errors', fields: Object.keys(values).length, revision: savedProfile.revision, database: directory }));
} catch (error) {
  console.error('Page errors:', JSON.stringify(pageErrors));
  console.error('Company profile API errors:', JSON.stringify(profileApiErrors));
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
