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
    if (response.status() >= 400 && response.url().includes('/collections/hr_job_openings')) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: token, user: admin.user });
  await page.goto(`${webUrl}/hr/recruitment?job=${encodeURIComponent(jobKey)}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(code => document.body.innerText.includes(code) && [...document.querySelectorAll('.ant-drawer-root')].some(root => getComputedStyle(root).display !== 'none' && root.innerText.includes('Phễu')), { timeout: 30000 }, `TD-${suffix}`);

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
  console.log(JSON.stringify({ checks: 'open job from internal link, close job from funnel UI, persisted status, no browser or collection API errors', jobKey, database: directory }));
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
