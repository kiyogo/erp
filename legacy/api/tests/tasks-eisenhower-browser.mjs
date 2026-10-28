import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, mkdirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = path.resolve(apiDir, '..', 'web');
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-task-eisenhower-'));
mkdirSync(path.join(directory, 'files'));
mkdirSync(path.join(directory, 'downloads'));

async function freePort() {
  const server = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function vietnamDateOffset(offset) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, Number(part.value)]));
  const shifted = new Date(Date.UTC(values.year, values.month - 1, values.day + offset, 12));
  const shiftedParts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(shifted);
  const date = Object.fromEntries(shiftedParts.map(part => [part.type, part.value]));
  return `${date.year}-${date.month}-${date.day}`;
}

const apiPort = await freePort();
let webPort = await freePort();
while (webPort === apiPort) webPort = await freePort();
const apiUrl = `http://127.0.0.1:${apiPort}/api/v1`;
const webUrl = `http://127.0.0.1:${webPort}`;
const env = {
  ...process.env,
  USE_SQLITE: 'true', DATABASE_URL: '', PORT: String(apiPort), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'),
  KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'admin-task-matrix@example.test',
  SEED_ADMIN_PASSWORD: 'Task-Matrix-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'TASK-MATRIX-ADMIN',
  JWT_SECRET: 'isolated-task-eisenhower-browser-test-secret',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], {
  cwd: apiDir, env, encoding: 'utf8', timeout: 30000, windowsHide: true,
});
assert.equal(seed.status, 0, seed.stderr);
const api = spawn(process.execPath, ['index.mjs'], {
  cwd: apiDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
});
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
const taskApiErrors = [];

try {
  for (const [url, child] of [[`${apiUrl}/health`, api], [webUrl, vite]]) {
    let ready = false;
    for (let attempt = 0; attempt < 450; attempt += 1) {
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
  const token = admin.token || admin.access_token;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
  const today = vietnamDateOffset(0);
  const cases = [
    { title: 'Ma trận cần làm ngay', priority: 'Khẩn cấp', dueDate: vietnamDateOffset(20), quadrant: 'do-now', projectName: 'Dự án ERP' },
    { title: 'Ma trận lên lịch', priority: 'Cao', dueDate: vietnamDateOffset(20), quadrant: 'schedule', projectName: 'Dự án ERP' },
    { title: 'Ma trận cần giao', priority: 'Trung bình', dueDate: today, quadrant: 'delegate' },
    { title: 'Ma trận ít ưu tiên', priority: 'Thấp', dueDate: vietnamDateOffset(20), quadrant: 'low-priority' },
    { title: 'Ma trận đã hoàn thành', priority: 'Khẩn cấp', dueDate: today, completed: true },
  ];
  for (const item of cases) {
    const response = await fetch(`${apiUrl}/tasks`, {
      method: 'POST', headers,
      body: JSON.stringify({ taskTitle: item.title, priority: item.priority, dueDate: item.dueDate, assigneeId: admin.user.id, projectName: item.projectName }),
    });
    const result = await response.json();
    assert.equal(response.status, 201, JSON.stringify(result));
    if (item.completed) {
      const update = await fetch(`${apiUrl}/tasks/${encodeURIComponent(result.task.key)}`, {
        method: 'PATCH', headers, body: JSON.stringify({ status: 'Hoàn thành', progress: 100 }),
      });
      assert.equal(update.status, 200, await update.text());
    }
  }

  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && /\/tasks(?:\/|\?|$)/.test(new URL(response.url()).pathname)) {
      taskApiErrors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  await page.setViewport({ width: 1440, height: 950 });
  await page.evaluateOnNewDocument(({ accessToken, user }) => {
    localStorage.setItem('minepanel_token', accessToken);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { accessToken: token, user: admin.user });
  await page.goto(`${webUrl}/admin/tasks`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Tổng nhiệm vụ'), { timeout: 20000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Ma trận Eisenhower')?.click());
  await page.waitForSelector('[data-testid="eisenhower-matrix"]', { timeout: 10000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid^="eisenhower-quadrant-"]').length === 4, { timeout: 10000 });

  const quadrants = await page.$$eval('[data-testid^="eisenhower-quadrant-"]', elements => Object.fromEntries(
    elements.map(element => [element.getAttribute('data-testid'), element.innerText]),
  ));
  for (const item of cases.filter(entry => entry.quadrant)) {
    const zone = quadrants[`eisenhower-quadrant-${item.quadrant}`];
    assert.ok(zone.includes(item.title), `${item.title} must appear in ${item.quadrant}.`);
    assert.match(zone, /1 nhiệm vụ/, `${item.quadrant} must show its real count.`);
  }
  assert.ok(!Object.values(quadrants).some(zone => zone.includes('Ma trận đã hoàn thành')), 'Completed tasks must not appear in the action matrix.');

  await page.evaluate(() => document.querySelector('[data-testid="eisenhower-quadrant-do-now"] button')?.click());
  await page.waitForFunction(() => document.body.innerText.includes('Chi tiết nhiệm vụ') && document.body.innerText.includes('Ma trận cần làm ngay'), { timeout: 10000 });

  await page.goto(`${webUrl}/admin/tasks`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Tổng nhiệm vụ'), { timeout: 20000 });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.trim() === 'Báo cáo')?.click());
  await page.waitForSelector('[data-testid="task-reports"]', { timeout: 10000 });
  await page.waitForFunction(() => document.querySelector('[data-testid="task-reports"]')?.innerText.includes('Chưa bắt đầu'), { timeout: 10000 });
  let reportText = await page.$eval('[data-testid="task-reports"]', element => element.innerText);
  assert.match(reportText, /Chưa bắt đầu\s+4\s+80%/);
  assert.match(reportText, /Hoàn thành\s+1\s+20%/);

  const chooseReport = async label => {
    await page.evaluate(() => document.querySelector('[data-testid="task-reports"] .ant-select')?.click());
    await page.waitForFunction(text => [...document.querySelectorAll('.ant-select-item')].some(item => item.textContent.includes(text)), { timeout: 10000 }, label);
    await page.evaluate(text => [...document.querySelectorAll('.ant-select-item')].find(item => item.textContent.includes(text))?.click(), label);
    await page.waitForFunction(text => document.querySelector('[data-testid="task-reports"]')?.innerText.includes(text), { timeout: 10000 }, label);
  };
  await chooseReport('Theo người thực hiện');
  reportText = await page.$eval('[data-testid="task-reports"]', element => element.innerText);
  assert.ok(reportText.includes(admin.user.name), 'Assignee report must use the real task assignee.');
  assert.match(reportText, /5\s+100%/);
  await chooseReport('Theo dự án / đơn vị');
  reportText = await page.$eval('[data-testid="task-reports"]', element => element.innerText);
  assert.match(reportText, /Dự án ERP\s+2\s+40%\s+0%/);
  assert.match(reportText, /Chưa thuộc dự án \/ đơn vị\s+3\s+60%\s+33%/);
  await chooseReport('Nhiệm vụ tạo theo tháng');
  reportText = await page.$eval('[data-testid="task-reports"]', element => element.innerText);
  assert.ok(reportText.includes(today.slice(0, 7)), 'Creation trend must group real task creation dates by month.');

  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: path.join(directory, 'downloads') });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(button => button.textContent.includes('Xuất Excel'))?.click());
  let downloaded = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (readdirSync(path.join(directory, 'downloads')).some(name => name.endsWith('.xlsx'))) { downloaded = true; break; }
    await delay(100);
  }
  assert.ok(downloaded, 'Report export must download a real XLSX file.');
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(taskApiErrors, []);
  console.log(JSON.stringify({ checks: 'real task data in all four Eisenhower quadrants, Vietnam-date urgency, completed-task exclusion, task detail opening, status/assignee/project/month reports and XLSX download', quadrants: Object.keys(quadrants).length }));
} catch (error) {
  console.error(`${error.stack || error}\n${logs}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of [vite, api]) if (child.exitCode === null) child.kill();
  await delay(100);
  for (const child of [vite, api]) if (child.exitCode === null) child.kill('SIGKILL');
}
