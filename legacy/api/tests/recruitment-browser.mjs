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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-recruitment-browser-'));
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
  SEED_ADMIN_EMAIL: 'recruitment-browser@example.test', SEED_ADMIN_PASSWORD: 'Recruitment-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'RECRUITMENT-BROWSER-ADMIN', JWT_SECRET: 'recruitment-browser-isolated-test-secret',
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
  const suffix = Date.now().toString(36).toUpperCase();
  const jobKey = `job-browser-${suffix}`;
  const jobResponse = await fetch(`${apiUrl}/collections/hr_job_openings`, {
    method: 'POST', headers,
    body: JSON.stringify({ record: { key: jobKey, jobCode: `TD-${suffix}`, title: 'Browser Status Regression', department: 'QA', level: 'Junior', headcountNeeded: 1, deadline: '2026-12-31', status: 'Đang tuyển dụng' } }),
  });
  assert.equal(jobResponse.status, 201, await jobResponse.text());
  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && /\/collections\/hr_(job_openings|recruitment_candidates)/.test(response.url())) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
    if (response.status() >= 400 && response.url().includes('/files/')) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: token, user: admin.user });
  await page.goto(`${webUrl}/hr/recruitment?job=${encodeURIComponent(jobKey)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(code => document.body.innerText.includes(code) && [...document.querySelectorAll('.ant-drawer-root')].some(root => getComputedStyle(root).display !== 'none' && root.innerText.includes('Phễu')), { timeout: 30000 }, `TD-${suffix}`);

  const clickButton = async (text, startsWith = false) => {
    const clicked = await page.evaluate(({ text, startsWith }) => {
      const button = [...document.querySelectorAll('button')].find(item => startsWith ? item.textContent.trim().startsWith(text) : item.textContent.trim() === text);
      if (!button) return false;
      button.click();
      return true;
    }, { text, startsWith });
    assert.equal(clicked, true, `Expected button: ${text}`);
  };
  const fillLabel = async (labelText, value) => {
    const filled = await page.evaluate(({ labelText, value }) => {
      const label = [...document.querySelectorAll('.ant-modal-root label')].find(item => item.textContent.trim().replace(/\s*\*$/, '') === labelText);
      const input = label?.htmlFor ? document.getElementById(label.htmlFor) : null;
      if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return false;
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set;
      if (!setter) return false;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, { labelText, value });
    assert.equal(filled, true, `Expected form field: ${labelText}`);
  };
  const chooseLabel = async (labelText, optionText) => {
    const opened = await page.evaluate(labelText => {
      const label = [...document.querySelectorAll('.ant-modal-root label')].find(item => item.textContent.trim().replace(/\s*\*$/, '') === labelText);
      const select = label?.closest('.ant-form-item')?.querySelector('.ant-select-selector');
      select?.click();
      return !!select;
    }, labelText);
    assert.equal(opened, true, `Expected selection field: ${labelText}`);
    await page.waitForFunction(text => [...document.querySelectorAll('.ant-select-dropdown')]
      .some(menu => menu.getBoundingClientRect().width > 0 && [...menu.querySelectorAll('.ant-select-item')].some(item => item.textContent.trim() === text)), {}, optionText);
    const selected = await page.evaluate(text => {
      const menus = [...document.querySelectorAll('.ant-select-dropdown')].filter(menu => menu.getBoundingClientRect().width > 0);
      const option = [...(menus.at(-1)?.querySelectorAll('.ant-select-item') || [])].find(item => item.textContent.trim() === text);
      option?.click();
      return !!option;
    }, optionText);
    assert.equal(selected, true, `Expected option: ${optionText}`);
  };

  await clickButton('Xem Hồ Sơ Ứng Viên', true);
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal-root')].some(root => root.innerText.includes('Tất cả giai đoạn')));
  await clickButton('Tiếp nhận ứng viên');
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal-root')].some(root => root.innerText.includes('Tiếp nhận hồ sơ ứng viên')));
  await fillLabel('Họ tên ứng viên', 'Ứng viên E2E');
  await fillLabel('Email ứng viên', `candidate-${suffix.toLowerCase()}@example.test`);
  await fillLabel('Điện thoại', '0900000123');
  await fillLabel('Nguồn ứng tuyển', 'Website tuyển dụng');
  await fillLabel('Khu vực', 'Miền Bắc');
  await fillLabel('Quốc gia', 'Việt Nam');
  await fillLabel('Tỉnh/Thành phố', 'Hà Nội');
  await fillLabel('Phường/Xã', 'Phường Dịch Vọng');
  await fillLabel('Tài khoản cá nhân', 'https://example.test/candidate');
  const cvPath = path.join(directory, 'candidate-cv.pdf');
  writeFileSync(cvPath, Buffer.from('%PDF-1.4\nRecruitment browser CV evidence\n%%EOF\n'));
  await (await page.$('#recruitment-cv-file')).uploadFile(cvPath);
  await clickButton('Lưu hồ sơ');
  await page.waitForFunction(email => document.body.innerText.includes(email), { timeout: 20000 }, `candidate-${suffix.toLowerCase()}@example.test`);

  const candidatesResponse = await fetch(`${apiUrl}/collections/hr_recruitment_candidates`, { headers });
  assert.equal(candidatesResponse.status, 200);
  const candidate = (await candidatesResponse.json()).data.find(item => item.email === `candidate-${suffix.toLowerCase()}@example.test`);
  assert.ok(candidate, 'The applicant submitted from the UI should be persisted.');
  assert.deepEqual([candidate.region, candidate.country, candidate.province, candidate.ward, candidate.personalAccount, candidate.source], ['Miền Bắc', 'Việt Nam', 'Hà Nội', 'Phường Dịch Vọng', 'https://example.test/candidate', 'Website tuyển dụng']);
  assert.ok(candidate.cvFileId, 'The uploaded CV must be attached to the applicant record.');
  const cvDownload = await fetch(`${apiUrl}/files/${candidate.cvFileId}/download`, { headers });
  assert.equal(cvDownload.status, 200);
  assert.match(await cvDownload.text(), /Recruitment browser CV evidence/);

  const searchInput = await page.$('input[placeholder*="email"]');
  assert.ok(searchInput, 'The candidate list should expose a search input.');
  await searchInput.click();
  await searchInput.type('Hà Nội');
  await page.waitForFunction(() => document.body.innerText.includes('Ứng viên E2E'));
  await searchInput.click({ clickCount: 3 });
  await searchInput.press('Backspace');
  await page.waitForFunction(email => document.body.innerText.includes(email), {}, `candidate-${suffix.toLowerCase()}@example.test`);

  const candidateRowOpened = await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(item => item.innerText.includes('Ứng viên E2E'));
    const button = [...(row?.querySelectorAll('button') || [])].find(item => item.textContent.trim() === 'Hồ sơ / Cập nhật');
    button?.click();
    return !!button;
  });
  assert.equal(candidateRowOpened, true, 'The persisted candidate should be editable from the list.');
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal-root')].some(root => root.innerText.includes('Cập nhật hồ sơ · Ứng viên E2E')));
  await chooseLabel('Giai đoạn', 'Không tiếp tục');
  await clickButton('Lưu hồ sơ');
  await page.waitForFunction(email => document.body.innerText.includes(email) && document.body.innerText.includes('Không tiếp tục'), { timeout: 20000 }, `candidate-${suffix.toLowerCase()}@example.test`);
  const rejectedCandidate = (await fetch(`${apiUrl}/collections/hr_recruitment_candidates`, { headers }).then(response => response.json())).data.find(item => item.key === candidate.key);
  assert.equal(rejectedCandidate.status, 'rejected');
  await clickButton('Xóa');
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal-root')].some(root => root.innerText.includes('Thùng rác')));
  await clickButton('Xóa hồ sơ');
  let remainingCandidates = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    remainingCandidates = (await fetch(`${apiUrl}/collections/hr_recruitment_candidates`, { headers }).then(response => response.json())).data;
    if (!remainingCandidates.some(item => item.key === candidate.key)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(remainingCandidates.some(item => item.key === candidate.key), false, 'Deleting a rejected candidate from the UI should move it out of active records.');
  const candidateListClosed = await page.evaluate(() => {
    const root = [...document.querySelectorAll('.ant-modal-root')].find(item => item.innerText.includes('Tất cả giai đoạn'));
    const button = root?.querySelector('button[aria-label="Close"]');
    button?.click();
    return !!button;
  });
  assert.equal(candidateListClosed, true, 'The candidate list dialog should be closable after deletion.');
  await page.waitForFunction(() => ![...document.querySelectorAll('.ant-modal-root')].some(root => root.innerText.includes('Tất cả giai đoạn')));

  const selector = await page.$('.ant-drawer-root .ant-select-selector');
  assert.ok(selector, 'Recruitment status selector should be present in the job funnel.');
  await selector.click();
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-select-dropdown')]
    .some(node => node.getBoundingClientRect().width > 0 && [...node.querySelectorAll('.ant-select-item')].some(option => option.textContent.trim() === 'Đã đóng')));
  const optionClicked = await page.evaluate(() => {
    const dropdowns = [...document.querySelectorAll('.ant-select-dropdown')].filter(node => node.getBoundingClientRect().width > 0);
    const option = [...(dropdowns.at(-1)?.querySelectorAll('.ant-select-item') || [])].find(item => item.textContent.trim() === 'Đã đóng');
    if (!option) return false;
    option.click();
    return true;
  });
  assert.equal(optionClicked, true, 'The close option should be available.');

  let persisted;
  for (let attempt = 0; attempt < 100; attempt++) {
    const response = await fetch(`${apiUrl}/collections/hr_job_openings/${encodeURIComponent(jobKey)}`, { headers });
    assert.equal(response.status, 200);
    persisted = (await response.json()).record;
    if (persisted?.status === 'Đã đóng') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(persisted?.status, 'Đã đóng', 'Closing a job from the recruitment UI must persist successfully.');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(apiErrors, []);
  console.log(JSON.stringify({ checks: 'open internal job link, add candidate and CV from UI, persist location/profile fields, search by location, reject/delete candidate, close job, no browser or API errors', jobKey, database: directory }));
} catch (error) {
  if (page) {
    console.error((await page.$eval('body', node => node.innerText).catch(() => '')).slice(-3000));
    await page.screenshot({ path: path.join(directory, 'failure.png'), fullPage: true }).catch(() => {});
    console.error('Browser errors:', JSON.stringify(pageErrors));
    console.error('Collection API errors:', JSON.stringify(apiErrors));
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
