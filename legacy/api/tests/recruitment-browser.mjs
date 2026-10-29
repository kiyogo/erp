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
let publicContext;
let publicPage;
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
    if (response.status() >= 400 && response.url().includes('/public/recruitment/')) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__publicRecruitmentLink = text; } } });
  }, { value: token, user: admin.user });
  await page.goto(`${webUrl}/hr/recruitment?job=${encodeURIComponent(jobKey)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(code => document.body.innerText.includes(code) && [...document.querySelectorAll('.ant-drawer-root')].some(root => getComputedStyle(root).display !== 'none' && root.innerText.includes('Phễu')), { timeout: 30000 }, `TD-${suffix}`);

  const clickButton = async (text, startsWith = false) => {
    const clicked = await page.evaluate(({ text, startsWith }) => {
      const button = [...document.querySelectorAll('button')].find(item => {
        const visible = item.getBoundingClientRect().width > 0 && item.getBoundingClientRect().height > 0;
        return visible && (startsWith ? item.textContent.trim().startsWith(text) : item.textContent.trim() === text);
      });
      if (!button) return false;
      button.click();
      return true;
    }, { text, startsWith });
    assert.equal(clicked, true, `Expected button: ${text}`);
  };
  const fillLabel = async (labelText, value) => {
    const filled = await page.evaluate(({ labelText, value }) => {
      const visibleRoots = [...document.querySelectorAll('.ant-modal-root')].filter(root => root.getBoundingClientRect().width > 0);
      const label = visibleRoots.flatMap(root => [...root.querySelectorAll('label')]).find(item => item.textContent.trim().replace(/\s*\*$/, '') === labelText);
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
      const visibleRoots = [...document.querySelectorAll('.ant-modal-root')].filter(root => root.getBoundingClientRect().width > 0);
      const label = visibleRoots.flatMap(root => [...root.querySelectorAll('label')]).find(item => item.textContent.trim().replace(/\s*\*$/, '') === labelText);
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

  await clickButton('Sao chép liên kết ứng tuyển');
  await page.waitForFunction(() => typeof window.__publicRecruitmentLink === 'string' && window.__publicRecruitmentLink.length > 0);
  const publicLink = await page.evaluate(() => window.__publicRecruitmentLink);
  assert.equal(new URL(publicLink).pathname, `/careers/${encodeURIComponent(jobKey)}`, 'The management drawer should copy the public application route.');
  publicContext = await browser.createBrowserContext();
  publicPage = await publicContext.newPage();
  await publicPage.setViewport({ width: 375, height: 812 });
  publicPage.on('pageerror', error => pageErrors.push(error.message));
  publicPage.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/public/recruitment/')) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await publicPage.goto(publicLink, { waitUntil: 'domcontentloaded', timeout: 60000 });
  try { await publicPage.waitForSelector('input[autocomplete="name"]', { timeout: 20000 }); }
  catch (error) {
    console.error('Public application URL:', publicPage.url());
    console.error('Public application page:', (await publicPage.$eval('body', node => node.innerText).catch(() => '')).slice(0, 3000));
    throw error;
  }
  assert.equal(await publicPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, 'The public application form should fit a mobile-width viewport.');
  assert.equal(await publicPage.evaluate(() => localStorage.getItem('minepanel_token')), null, 'The application form should work without an authenticated session.');
  const publicEmail = `public-${suffix.toLowerCase()}@example.test`;
  await publicPage.type('input[autocomplete="name"]', 'Ứng viên Website E2E');
  await publicPage.type('input[autocomplete="email"]', publicEmail);
  await publicPage.type('input[autocomplete="tel"]', '0900000456');
  await publicPage.type('input[autocomplete="address-level1"]', 'Huế');
  await publicPage.type('input[autocomplete="address-level2"]', 'Phường Vĩnh Ninh');
  const publicCvPath = path.join(directory, 'public-candidate-cv.pdf');
  const publicCvBytes = Buffer.from('%PDF-1.4\nPublic recruitment browser CV evidence\n%%EOF\n');
  writeFileSync(publicCvPath, publicCvBytes);
  await (await publicPage.$('input[type="file"]')).uploadFile(publicCvPath);
  await publicPage.type('textarea', 'Hồ sơ gửi từ website tuyển dụng công khai.');
  await publicPage.click('button[type="submit"]');
  await publicPage.waitForFunction(() => document.body.innerText.includes('Đã nhận hồ sơ ứng tuyển'), { timeout: 20000 });
  const publicCandidate = (await fetch(`${apiUrl}/collections/hr_recruitment_candidates`, { headers }).then(response => response.json())).data.find(item => item.email === publicEmail);
  assert.ok(publicCandidate, 'A public application should appear in internal recruitment records.');
  assert.deepEqual([publicCandidate.name, publicCandidate.jobKey, publicCandidate.status, publicCandidate.source, publicCandidate.province, publicCandidate.ward], ['Ứng viên Website E2E', jobKey, 'applied', 'Website tuyển dụng', 'Huế', 'Phường Vĩnh Ninh']);
  assert.ok(publicCandidate.cvFileId, 'A CV uploaded through the public site should be linked to the internal candidate.');
  const publicCvResponse = await fetch(`${apiUrl}/files/${publicCandidate.cvFileId}/download`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(publicCvResponse.status, 200);
  assert.deepEqual(Buffer.from(await publicCvResponse.arrayBuffer()), publicCvBytes);

  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(code => document.body.innerText.includes(code) && [...document.querySelectorAll('.ant-drawer-root')].some(root => getComputedStyle(root).display !== 'none' && root.innerText.includes('Phễu')), { timeout: 30000 }, `TD-${suffix}`);
  await clickButton('Xem Hồ Sơ Ứng Viên', true);
  await page.waitForFunction(email => [...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes(email)), { timeout: 20000 }, publicEmail);
  const publicCandidateListClosed = await page.evaluate(() => {
    const root = [...document.querySelectorAll('.ant-modal-root')].find(item => item.getBoundingClientRect().width > 0 && item.innerText.includes('Tất cả giai đoạn'));
    const button = root?.querySelector('button[aria-label="Close"]');
    button?.click();
    return !!button;
  });
  assert.equal(publicCandidateListClosed, true, 'The public applicant should be visible in the internal candidate list.');
  await page.waitForFunction(() => ![...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Tất cả giai đoạn')));

  await clickButton('Xem Hồ Sơ Ứng Viên', true);
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Tất cả giai đoạn')));
  await clickButton('Tiếp nhận ứng viên');
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Tiếp nhận hồ sơ ứng viên')));
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

  const addToTalentPool = await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(item => item.innerText.includes('Ứng viên E2E'));
    const button = [...(row?.querySelectorAll('button') || [])].find(item => item.textContent.trim() === 'Thêm vào kho tiềm năng');
    button?.click();
    return !!button;
  });
  assert.equal(addToTalentPool, true, 'An applicant can be added to the talent pool from the candidate list.');
  let pooledCandidate;
  for (let attempt = 0; attempt < 100; attempt++) {
    pooledCandidate = (await fetch(`${apiUrl}/collections/hr_recruitment_candidates`, { headers }).then(response => response.json())).data.find(item => item.key === candidate.key);
    if (pooledCandidate?.talentPool) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(pooledCandidate?.talentPool, true, 'Talent pool membership should persist on the server.');
  const candidateListClosedForPool = await page.evaluate(() => {
    const root = [...document.querySelectorAll('.ant-modal-root')].find(item => item.getBoundingClientRect().width > 0 && item.innerText.includes('Tất cả giai đoạn'));
    const button = root?.querySelector('button[aria-label="Close"]');
    button?.click();
    return !!button;
  });
  assert.equal(candidateListClosedForPool, true);
  await page.waitForFunction(() => ![...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Tất cả giai đoạn')));
  await clickButton('Kho tiềm năng', true);
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Kho tiềm năng · 1 ứng viên') && root.innerText.includes('Ứng viên E2E')));
  const poolClosed = await page.evaluate(() => {
    const root = [...document.querySelectorAll('.ant-modal-root')].find(item => item.getBoundingClientRect().width > 0 && item.innerText.includes('Kho tiềm năng ·'));
    const button = root?.querySelector('button[aria-label="Close"]');
    button?.click();
    return !!button;
  });
  assert.equal(poolClosed, true, 'The persisted applicant should be discoverable in the talent pool.');
  await page.waitForFunction(() => ![...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Kho tiềm năng ·')));
  await clickButton('Xem Hồ Sơ Ứng Viên', true);
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Tất cả giai đoạn')));

  const candidateRowOpened = await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(item => item.innerText.includes('Ứng viên E2E'));
    const button = [...(row?.querySelectorAll('button') || [])].find(item => item.textContent.trim() === 'Hồ sơ / Cập nhật');
    button?.click();
    return !!button;
  });
  assert.equal(candidateRowOpened, true, 'The persisted candidate should be editable from the list.');
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Cập nhật hồ sơ · Ứng viên E2E')));
  await chooseLabel('Giai đoạn', 'Sàng lọc');
  await clickButton('Lưu hồ sơ');
  await page.waitForFunction(email => document.body.innerText.includes(email) && document.body.innerText.includes('Sàng lọc'), { timeout: 20000 }, `candidate-${suffix.toLowerCase()}@example.test`);
  const candidateReopenedForInterview = await page.evaluate(() => {
    const row = [...document.querySelectorAll('tr')].find(item => item.innerText.includes('Ứng viên E2E'));
    const button = [...(row?.querySelectorAll('button') || [])].find(item => item.textContent.trim() === 'Hồ sơ / Cập nhật');
    button?.click();
    return !!button;
  });
  assert.equal(candidateReopenedForInterview, true, 'The screened candidate should be editable for interview scheduling.');
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Cập nhật hồ sơ · Ứng viên E2E')));
  await chooseLabel('Giai đoạn', 'Phỏng vấn');
  const interviewAt = await page.evaluate(() => {
    const date = new Date(Date.now() + 30 * 60000);
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  });
  await fillLabel('Lịch phỏng vấn', interviewAt);
  await fillLabel('Người phỏng vấn', 'Quản lý tuyển dụng');
  await clickButton('Lưu hồ sơ');
  await page.waitForFunction(email => document.body.innerText.includes(email) && document.body.innerText.includes('Phỏng vấn'), { timeout: 20000 }, `candidate-${suffix.toLowerCase()}@example.test`);
  const interviewCandidate = (await fetch(`${apiUrl}/collections/hr_recruitment_candidates`, { headers }).then(response => response.json())).data.find(item => item.key === candidate.key);
  assert.equal(interviewCandidate.status, 'interview');
  assert.equal(interviewCandidate.interviewAt, interviewAt);
  assert.equal(interviewCandidate.interviewer, 'Quản lý tuyển dụng');

  const candidateListClosedBeforeCalendar = await page.evaluate(() => {
    const root = [...document.querySelectorAll('.ant-modal-root')].find(item => item.getBoundingClientRect().width > 0 && item.innerText.includes('Tất cả giai đoạn'));
    const button = root?.querySelector('button[aria-label="Close"]');
    button?.click();
    return !!button;
  });
  assert.equal(candidateListClosedBeforeCalendar, true, 'The candidate list dialog should close before opening the calendar.');
  await page.waitForFunction(() => ![...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Tất cả giai đoạn')));
  await clickButton('Lịch phỏng vấn');
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Lịch phỏng vấn') && root.innerText.includes('Quản lý tuyển dụng')));
  await clickButton('Mở hồ sơ · Ứng viên E2E');
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Cập nhật hồ sơ · Ứng viên E2E')));
  await chooseLabel('Giai đoạn', 'Không tiếp tục');
  await clickButton('Lưu hồ sơ');
  let rejectedCandidate;
  for (let attempt = 0; attempt < 100; attempt++) {
    rejectedCandidate = (await fetch(`${apiUrl}/collections/hr_recruitment_candidates`, { headers }).then(response => response.json())).data.find(item => item.key === candidate.key);
    if (rejectedCandidate?.status === 'rejected') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(rejectedCandidate.status, 'rejected');
  assert.equal(rejectedCandidate.interviewAt, interviewAt, 'Rejecting the candidate from the calendar should preserve the interview record.');
  await clickButton('Xem Hồ Sơ Ứng Viên', true);
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Tất cả giai đoạn')));
  await clickButton('Xóa');
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Thùng rác')));
  await clickButton('Xóa hồ sơ');
  let remainingCandidates = [];
  for (let attempt = 0; attempt < 100; attempt++) {
    remainingCandidates = (await fetch(`${apiUrl}/collections/hr_recruitment_candidates`, { headers }).then(response => response.json())).data;
    if (!remainingCandidates.some(item => item.key === candidate.key)) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(remainingCandidates.some(item => item.key === candidate.key), false, 'Deleting a rejected candidate from the UI should move it out of active records.');
  const candidateListClosed = await page.evaluate(() => {
    const root = [...document.querySelectorAll('.ant-modal-root')].find(item => item.getBoundingClientRect().width > 0 && item.innerText.includes('Tất cả giai đoạn'));
    const button = root?.querySelector('button[aria-label="Close"]');
    button?.click();
    return !!button;
  });
  assert.equal(candidateListClosed, true, 'The candidate list dialog should be closable after deletion.');
  await page.waitForFunction(() => ![...document.querySelectorAll('.ant-modal-root')].some(root => root.getBoundingClientRect().width > 0 && root.innerText.includes('Tất cả giai đoạn')));

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
  console.log(JSON.stringify({ checks: 'copy public application link, submit application and CV without login, verify public applicant and CV in internal records, add internal candidate and CV from UI, persist location/profile fields, search by location, add/discover talent pool applicant, schedule interview, open/edit applicant from calendar, reject/delete candidate, close job, no browser or API errors', jobKey, database: directory }));
} catch (error) {
  if (page) {
    console.error((await page.$eval('body', node => node.innerText).catch(() => '')).slice(-3000));
    await page.screenshot({ path: path.join(directory, 'failure.png'), fullPage: true }).catch(() => {});
    console.error('Browser errors:', JSON.stringify(pageErrors));
    console.error('Collection API errors:', JSON.stringify(apiErrors));
  }
  throw error;
} finally {
  if (publicContext) await publicContext.close();
  if (browser) await browser.close();
  for (const child of [vite, api]) {
    if (child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill();
      await exited;
    }
  }
}
