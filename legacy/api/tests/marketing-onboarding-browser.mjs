import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = path.resolve(apiDir, '..', 'web');
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-marketing-onboarding-'));
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
  SEED_ADMIN_EMAIL: 'marketing-browser@example.test', SEED_ADMIN_PASSWORD: 'Marketing-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'MARKETING-ADMIN', JWT_SECRET: 'marketing-onboarding-isolated-browser-test-secret',
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
  async function apiRequest(method = 'GET', payload) {
    const response = await fetch(`${apiUrl}/marketing/onboarding`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  }

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/marketing/onboarding')) apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1365, height: 950 });
  await page.evaluateOnNewDocument(({ accessToken, user }) => {
    localStorage.setItem('minepanel_token', accessToken);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { accessToken: token, user: admin.user });
  await page.goto(`${webUrl}/admin/crm/marketing`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Bạn muốn đạt được điều gì?'));

  await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].find(button => button.innerText.includes('Email Marketing'))?.click());
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.innerText.trim() === 'Khám phá ngay')?.disabled), true, 'Khám phá ngay must stay disabled until a goal is selected.');
  await page.evaluate(() => [...document.querySelectorAll('[role="checkbox"]')].find(button => button.innerText.includes('Thu hút khách hàng'))?.click());
  assert.equal(await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.innerText.trim() === 'Khám phá ngay')?.disabled), false);
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.innerText.trim() === 'Khám phá ngay')?.click());
  await page.waitForFunction(() => document.body.innerText.includes('Mục tiêu marketing của bạn') && document.body.innerText.includes('Thu hút khách hàng'));
  const initial = (await apiRequest()).onboarding;
  assert.equal(initial.primaryProduct, 'email_marketing');
  assert.deepEqual(initial.selectedGoals, ['attract_customers']);

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.includes('Mục tiêu marketing của bạn') && document.body.innerText.includes('Email Marketing'));
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.innerText.trim() === 'Thay đổi mục tiêu')?.click());
  await page.evaluate(() => [...document.querySelectorAll('button[aria-pressed]')].find(button => button.innerText.includes('Marketing Automation'))?.click());
  await page.evaluate(() => [...document.querySelectorAll('[role="checkbox"]')].find(button => button.innerText.includes('Theo dõi hành vi'))?.click());
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.innerText.trim() === 'Khám phá ngay')?.click());
  await page.waitForFunction(() => document.body.innerText.includes('Mục tiêu marketing của bạn') && document.body.innerText.includes('Theo dõi hành vi'));
  const updated = (await apiRequest()).onboarding;
  assert.equal(updated.primaryProduct, 'marketing_automation');
  assert.deepEqual(updated.selectedGoals, ['track_behavior']);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(apiErrors, []);
  console.log(JSON.stringify({ checks: 'menu route, objective selection, required-goal gating, save, reload and update persistence', selectedProduct: updated.primaryProduct, selectedGoals: updated.selectedGoals }));
} catch (error) {
  console.error(`${error.stack || error}\n${logs}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of [vite, api]) if (child.exitCode === null) child.kill();
  await new Promise(resolve => setTimeout(resolve, 100));
  for (const child of [vite, api]) if (child.exitCode === null) child.kill('SIGKILL');
}
