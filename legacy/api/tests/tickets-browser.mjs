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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-tickets-browser-'));
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
  SEED_ADMIN_EMAIL: 'tickets-browser@example.test', SEED_ADMIN_PASSWORD: 'Tickets-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'TICKETS-BROWSER-ADMIN', JWT_SECRET: 'tickets-browser-isolated-test-secret',
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
  const departmentResponse = await fetch(`${apiUrl}/collections/business_org_units`, {
    method: 'POST', headers, body: JSON.stringify({ record: { key: 'tickets-browser-dept', name: 'Đơn vị kiểm thử ticket', status: 'Hoạt động' } }),
  });
  assert.equal(departmentResponse.status, 201, await departmentResponse.text());
  let code = '';
  const getTicket = async () => {
    const response = await fetch(`${apiUrl}/collections/tickets?limit=500`, { headers });
    assert.equal(response.status, 200);
    const body = await response.json();
    return body.data.find(ticket => ticket.key === code);
  };

  const canonicalResponse = await fetch(`${apiUrl}/collections/tickets`, {
    method: 'POST', headers, body: JSON.stringify({ record: {
      key: 'forged-ticket-key', code: 'TK-2026-SERVER-AUTH', title: 'Kiểm tra lưu ticket phía máy chủ', description: 'Ticket thử tính toàn vẹn dữ liệu.',
      requester: 'Người gửi giả', requesterId: 'attacker', department: 'Đơn vị kiểm thử ticket', priority: 'Cao', status: 'Đã hoàn thành',
      createdDate: '2000-01-01T00:00:00.000Z', createdBy: 'Người tạo giả', createdById: 'attacker', history: [{ action: 'Giả lịch sử', actor: 'attacker', actorId: 'attacker', at: '2000-01-01T00:00:00.000Z' }],
    } }),
  });
  const canonicalBody = await canonicalResponse.json();
  assert.equal(canonicalResponse.status, 201, JSON.stringify(canonicalBody));
  let canonicalTicket = canonicalBody.record;
  assert.equal(canonicalTicket.key, canonicalTicket.code);
  assert.equal(canonicalTicket.status, 'Mới tạo');
  assert.equal(canonicalTicket.requester, admin.user.name);
  assert.equal(canonicalTicket.requesterId, admin.user.id);
  assert.equal(canonicalTicket.createdById, admin.user.id);
  assert.notEqual(canonicalTicket.createdDate, '2000-01-01T00:00:00.000Z');
  assert.equal(canonicalTicket.history[0].actorId, admin.user.id);

  const forgedTransition = await fetch(`${apiUrl}/collections/tickets/${encodeURIComponent(canonicalTicket.key)}`, {
    method: 'PATCH', headers, body: JSON.stringify({ patch: { status: 'Đã hoàn thành', updatedBy: 'Người khác', history: [] } }),
  });
  assert.equal(forgedTransition.status, 422);
  let transition = await fetch(`${apiUrl}/collections/tickets/${encodeURIComponent(canonicalTicket.key)}`, {
    method: 'PATCH', headers, body: JSON.stringify({ patch: { status: 'Đang xử lý' } }),
  });
  let transitionBody = await transition.json();
  assert.equal(transition.status, 200, JSON.stringify(transitionBody));
  canonicalTicket = transitionBody.record;
  assert.equal(canonicalTicket.updatedById, admin.user.id);
  assert.ok(canonicalTicket.acceptedAt);
  assert.equal(canonicalTicket.history.at(-1).actorId, admin.user.id);
  transition = await fetch(`${apiUrl}/collections/tickets/${encodeURIComponent(canonicalTicket.key)}`, {
    method: 'PATCH', headers, body: JSON.stringify({ patch: { status: 'Đã hoàn thành' } }),
  });
  transitionBody = await transition.json();
  assert.equal(transition.status, 200, JSON.stringify(transitionBody));
  canonicalTicket = transitionBody.record;
  assert.ok(canonicalTicket.resolvedAt);
  assert.equal(canonicalTicket.history.at(-1).action, 'Hoàn tất yêu cầu');
  transition = await fetch(`${apiUrl}/collections/tickets/${encodeURIComponent(canonicalTicket.key)}`, {
    method: 'PATCH', headers, body: JSON.stringify({ patch: { status: 'Đang xử lý' } }),
  });
  assert.equal(transition.status, 409);

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && (response.url().includes('/collections/tickets') || response.url().includes('/collections/business_org_units'))) {
      apiErrors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: token, user: admin.user });
  const cdp = await page.target().createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
  await page.goto(`${webUrl}/admin/tickets`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  async function clickButton(label, selector = 'button') {
    await page.waitForFunction((text, query) => [...document.querySelectorAll(query)].some(button => button.textContent.trim() === text && !button.disabled), { timeout: 15000 }, label, selector);
    await page.evaluate((text, query) => [...document.querySelectorAll(query)].find(button => button.textContent.trim() === text && !button.disabled)?.click(), label, selector);
  }
  async function fill(label, value) {
    const handle = await page.evaluateHandle((text) => {
      const item = [...document.querySelectorAll('.ant-modal-root .ant-form-item')].find(node => node.querySelector('label')?.textContent.includes(text));
      return item?.querySelector('input, textarea') || null;
    }, label);
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

  await clickButton('Tạo Ticket mới');
  await page.waitForSelector('.ant-modal-root form');
  code = await page.evaluate(() => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
    .find(node => node.querySelector('label')?.textContent.includes('Mã ticket'))?.querySelector('input')?.value || '');
  assert.match(code, /^TK-\d{4}-[A-F0-9]{8}$/);
  await fill('Tiêu đề yêu cầu', 'Không truy cập được mạng văn phòng');
  await fill('Mô tả chi tiết', 'Mất kết nối tại tầng hai sau khi khởi động lại thiết bị.');
  await clickButton('Gửi ticket', '.ant-modal-root button');
  await page.waitForFunction(() => !document.querySelector('.ant-modal-root'), { timeout: 15000 });
  await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 15000 }, code);
  let ticket = await getTicket();
  assert.ok(ticket, 'Ticket was not persisted by the API.');
  assert.equal(ticket.status, 'Mới tạo');
  assert.equal(ticket.requester, admin.user.name);
  assert.equal(ticket.requesterId, admin.user.id);
  assert.equal(ticket.department, 'Đơn vị kiểm thử ticket');
  assert.equal(ticket.history[0].actorId, admin.user.id);
  assert.equal(await page.$eval('body', node => node.innerText.includes('98.6%')), false);
  assert.equal(await page.$eval('body', node => node.innerText.includes('≤ 10 phút')), false);

  const row = await page.evaluateHandle(value => [...document.querySelectorAll('tr')].find(item => item.textContent.includes(value)) || null, code);
  assert.ok(row.asElement(), 'Ticket table row was not rendered.');
  await row.evaluate(node => [...node.querySelectorAll('button')].find(button => button.textContent.trim() === 'Chi tiết')?.click());
  await row.dispose();
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-drawer-root')].some(node => node.getBoundingClientRect().width > 0 && node.innerText.includes('Lịch sử ticket')));
  await clickButton('Tiếp nhận ticket', '.ant-drawer-root button');
  for (let attempt = 0; attempt < 100; attempt++) {
    ticket = await getTicket();
    if (ticket?.status === 'Đang xử lý') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ticket.status, 'Đang xử lý');
  assert.ok(ticket.acceptedAt);
  assert.equal(ticket.history.at(-1).actorId, admin.user.id);
  await clickButton('Đánh dấu hoàn tất', '.ant-drawer-root button');
  for (let attempt = 0; attempt < 100; attempt++) {
    ticket = await getTicket();
    if (ticket?.status === 'Đã hoàn thành') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(ticket.status, 'Đã hoàn thành');
  assert.ok(ticket.resolvedAt);
  assert.equal(ticket.history.at(-1).action, 'Hoàn tất yêu cầu');

  await clickButton('In phiếu A4', '.ant-drawer-root button');
  await waitForFile(`${code}_phieu_ho_tro.pdf`);
  await page.evaluate(() => document.querySelector('.ant-drawer-root .ant-drawer-close')?.click());
  await page.waitForFunction(() => ![...document.querySelectorAll('.ant-drawer-root')].some(node => node.getBoundingClientRect().width > 0));
  await clickButton('Xuất Excel');
  await waitForFile('Danh_sach_ticket.xlsx');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(value => {
    const row = [...document.querySelectorAll('tr')].find(item => item.textContent.includes(value));
    return row?.textContent.includes('Đã hoàn thành');
  }, { timeout: 30000 }, code);
  await clickButton('Đã hoàn tất');
  await page.waitForFunction(value => [...document.querySelectorAll('tr')].some(row => row.textContent.includes(value)), { timeout: 15000 }, code);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(apiErrors, []);
  console.log(JSON.stringify({ checks: 'create, accept, complete, persist actor and timestamps, filter, export XLSX/PDF, reload', code, database: directory }));
} catch (error) {
  console.error(`${error.stack || error}\n${logs}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of [vite, api]) if (child.exitCode === null) child.kill();
  await new Promise(resolve => setTimeout(resolve, 100));
  for (const child of [vite, api]) if (child.exitCode === null) child.kill('SIGKILL');
}
