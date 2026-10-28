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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-meeting-rooms-browser-'));
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
  SEED_ADMIN_EMAIL: 'meeting-rooms-browser@example.test', SEED_ADMIN_PASSWORD: 'Meeting-Rooms-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'MEETING-ROOMS-BROWSER-ADMIN', JWT_SECRET: 'meeting-rooms-browser-isolated-test-secret',
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
const meetingApiErrors = [];
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
  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && /\/collections\/(meeting_rooms|room_bookings|meeting_room_settings)/.test(response.url())) {
      meetingApiErrors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  await page.setViewport({ width: 1440, height: 1050 });
  await page.goto(webUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: token, user: admin.user });
  await page.goto(`${webUrl}/admin/meeting-rooms/settings`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Quy định & Chính sách Đặt phòng họp'), { timeout: 30000 });

  async function clickButton(label, modal = false) {
    const selector = modal ? '.ant-modal-root button' : 'button';
    await page.waitForFunction((text, query) => [...document.querySelectorAll(query)].some(button => button.textContent.trim() === text && !button.disabled), { timeout: 20000 }, label, selector);
    const handle = await page.evaluateHandle((text, query) => [...document.querySelectorAll(query)].find(button => button.textContent.trim() === text && !button.disabled) || null, label, selector);
    const element = handle.asElement();
    assert.ok(element, `Missing enabled button: ${label}`);
    await element.evaluate(button => button.click());
    await handle.dispose();
  }
  async function fill(label, value, modal = false) {
    const handle = await page.evaluateHandle((text, inModal) => {
      const scope = inModal ? '.ant-modal-root ' : '';
      return [...document.querySelectorAll(`${scope}.ant-form-item`)]
        .filter(item => item.querySelector('label')?.textContent.includes(text))
        .map(item => item.querySelector('input, textarea'))
        .find(input => input && input.getBoundingClientRect().width > 0) || null;
    }, label, modal);
    const element = handle.asElement();
    assert.ok(element, `Missing input: ${label}`);
    await element.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.down(modifier);
    await page.keyboard.press('A');
    await page.keyboard.up(modifier);
    await page.keyboard.press('Backspace');
    await element.type(value);
    assert.equal(await element.evaluate(input => input.value), value, `Unexpected input value: ${label}`);
    await handle.dispose();
  }
  async function choose(label, option) {
    const handle = await page.evaluateHandle(text => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
      .find(item => item.querySelector('label')?.textContent.includes(text))?.querySelector('.ant-select-selector') || null, label);
    const element = handle.asElement();
    assert.ok(element, `Missing select: ${label}`);
    await element.evaluate(node => node.click());
    await handle.dispose();
    await page.waitForFunction(text => {
      const dropdowns = [...document.querySelectorAll('.ant-select-dropdown')].filter(item => item.getBoundingClientRect().width > 0);
      return [...(dropdowns.at(-1)?.querySelectorAll('.ant-select-item') || [])].some(item => item.textContent.includes(text));
    }, { timeout: 15000 }, option);
    await page.evaluate(text => {
      const dropdowns = [...document.querySelectorAll('.ant-select-dropdown')].filter(item => item.getBoundingClientRect().width > 0);
      [...(dropdowns.at(-1)?.querySelectorAll('.ant-select-item') || [])].find(item => item.textContent.includes(text)).click();
    }, option);
  }
  async function getCollection(scope) {
    const response = await fetch(`${apiUrl}/collections/${scope}?limit=500`, { headers });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body.data;
  }
  async function navigateInApp(route) {
    await page.evaluate(nextRoute => {
      window.history.pushState({}, '', nextRoute);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    }, route);
  }

  await fill('Thời lượng họp tối đa một lượt', '60');
  await fill('Số ngày được phép đặt trước tối đa', '21');
  await clickButton('Lưu thiết lập');
  await page.waitForFunction(() => document.body.innerText.includes('Đã lưu giới hạn đặt phòng.'), { timeout: 15000 });
  const settings = (await getCollection('meeting_room_settings')).find(item => item.key === 'default');
  assert.equal(Number(settings.maxDuration), 60);
  assert.equal(Number(settings.maxAdvanceDays), 21);

  const suffix = Date.now().toString(36).toUpperCase();
  const roomName = `Phòng họp E2E ${suffix}`;
  const meetingTitle = `Kiểm tra lịch họp ${suffix}`;
  await navigateInApp('/admin/meeting-rooms/list');
  await page.waitForFunction(() => document.body.innerText.includes('Thêm phòng họp mới'), { timeout: 20000 });
  await clickButton('Thêm phòng họp mới');
  await page.waitForFunction(() => document.body.innerText.includes('Thêm phòng họp mới vào hệ thống'), { timeout: 10000 });
  await fill('Tên phòng họp', roomName, true);
  await fill('Sức chứa', '8', true);
  await fill('Vị trí lắp đặt', 'Tầng E2E', true);
  await fill('Thiết bị hội nghị', 'Màn hình, Camera', true);
  assert.equal(await page.$eval('.ant-modal-root input[type="number"]', input => input.checkValidity()), true);
  await clickButton('Lưu phòng họp', true);
  await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 15000 }, roomName);
  await page.waitForFunction(() => !document.body.innerText.includes('Thêm phòng họp mới vào hệ thống'), { timeout: 5000 });
  let room = (await getCollection('meeting_rooms')).find(item => item.name === roomName);
  assert.ok(room?.key);
  assert.equal(Number(room.capacity), 8);
  assert.deepEqual(room.equipment, ['Màn hình', 'Camera']);

  await navigateInApp('/admin/meeting-rooms');
  await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 20000 }, roomName);
  await clickButton('Đặt phòng này ngay');
  await page.waitForFunction(() => document.body.innerText.includes('Đặt phòng họp mới'), { timeout: 10000 });
  await fill('Tiêu đề cuộc họp', meetingTitle, true);
  await fill('Số người tham gia', '4', true);
  await choose('Khung giờ', '10:00 - 11:00');
  const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const displayedDate = await page.$eval('.ant-modal-root .kiyovn-datepicker-input', element => element.textContent.trim());
  assert.equal(displayedDate, businessDate, 'A new booking should default to the current business day.');
  await clickButton('Xác nhận đặt phòng', true);
  await page.waitForFunction(value => document.body.innerText.includes(`Đã đặt phòng ${value} thành công.`), { timeout: 15000 }, roomName);
  let booking = (await getCollection('room_bookings')).find(item => item.meetingTitle === meetingTitle);
  assert.ok(booking?.key);
  assert.equal(booking.roomKey, room.key);
  assert.equal(booking.bookerId, admin.user.id);
  assert.equal(booking.booker, admin.user.name);
  assert.equal(booking.date, businessDate);
  assert.equal(booking.timeSlot, '10:00 - 11:00');
  assert.equal(Number(booking.participantsCount), 4);
  assert.equal(booking.status, 'Đã xác nhận');

  await navigateInApp('/admin/meeting-rooms/calendar');
  await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 15000 }, meetingTitle);
  assert.ok((await page.$eval('body', node => node.innerText)).includes(businessDate));
  await navigateInApp('/admin/meeting-rooms');
  await page.waitForFunction(value => document.body.innerText.includes(value), { timeout: 15000 }, meetingTitle);
  await clickButton('Hủy lịch');
  for (let attempt = 0; attempt < 100; attempt++) {
    booking = (await getCollection('room_bookings')).find(item => item.key === booking.key);
    if (booking.status === 'Đã hủy') break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(booking.status, 'Đã hủy');
  await navigateInApp('/admin/meeting-rooms/history');
  await page.waitForFunction(value => document.body.innerText.includes(value) && document.body.innerText.includes('Đã hủy'), { timeout: 15000 }, meetingTitle);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(meetingApiErrors, []);
  console.log(JSON.stringify({ checks: 'save room policy, create room and equipment, book as authenticated admin, preserve room/date/time/participants, cancel and retain history', roomKey: room.key, bookingKey: booking.key, database: directory }));
} catch (error) {
  if (page) {
    console.error((await page.$eval('body', node => node.innerText).catch(() => '')).slice(-3000));
    console.error('Meeting room form state:', JSON.stringify(await page.evaluate(() => ({
      fields: [...document.querySelectorAll('.ant-form-item')].map(item => ({ label: item.querySelector('label')?.textContent, value: item.querySelector('input, textarea, .ant-select-selection-item, .kiyovn-datepicker-input')?.value || item.querySelector('.ant-select-selection-item, .kiyovn-datepicker-input')?.textContent, error: item.querySelector('[role="alert"]')?.textContent })),
    })).catch(() => null)));
    console.error('Browser errors:', JSON.stringify(pageErrors));
    console.error('Meeting API errors:', JSON.stringify(meetingApiErrors));
    await page.screenshot({ path: path.join(directory, 'failure.png'), fullPage: true }).catch(() => {});
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
