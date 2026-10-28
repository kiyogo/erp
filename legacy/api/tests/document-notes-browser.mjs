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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-document-notes-browser-'));
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
  SEED_ADMIN_EMAIL: 'document-notes-browser@example.test', SEED_ADMIN_PASSWORD: 'Directive-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'DOCUMENT-NOTES-ADMIN', JWT_SECRET: 'document-notes-isolated-test-secret',
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
const browserApiErrors = [];
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

  async function login(email, password) {
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return { token: body.token || body.access_token, user: body.user };
  }
  const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${admin.token}` };
  const deptName = 'Đơn vị kiểm thử sổ chỉ đạo';
  const noteDept = 'Phòng thử nghiệm chỉ đạo';
  const departmentResponse = await fetch(`${apiUrl}/collections/business_org_units`, {
    method: 'POST', headers, body: JSON.stringify({ record: { key: 'document-notes-browser-dept', name: deptName, status: 'Hoạt động' } }),
  });
  assert.equal(departmentResponse.status, 201, await departmentResponse.text());
  const secondDepartmentResponse = await fetch(`${apiUrl}/collections/business_org_units`, {
    method: 'POST', headers, body: JSON.stringify({ record: { key: 'document-notes-browser-note-dept', name: noteDept, status: 'Hoạt động' } }),
  });
  assert.equal(secondDepartmentResponse.status, 201, await secondDepartmentResponse.text());
  const departmentsRead = await fetch(`${apiUrl}/collections/business_org_units?limit=500`, { headers });
  assert.equal(departmentsRead.status, 200);
  assert.ok((await departmentsRead.json()).data.some(unit => unit.name === noteDept));

  const employeeEmail = 'document-notes-recipient@example.test';
  const employeePassword = 'Recipient-26!Secure';
  const employeeResponse = await fetch(`${apiUrl}/users`, {
    method: 'POST', headers,
    body: JSON.stringify({ name: 'Nhân sự nhận nhắc việc', email: employeeEmail, password: employeePassword, employeeCode: 'DIRECTIVE-RECIPIENT', role: 'USER', department: noteDept, position: 'Chuyên viên' }),
  });
  const employeeBody = await employeeResponse.json();
  assert.equal(employeeResponse.status, 201, JSON.stringify(employeeBody));

  const nonAdminResponse = await fetch(`${apiUrl}/collections/doc_notes`, {
    method: 'POST', headers: { ...headers, Authorization: `Bearer ${(await login(employeeEmail, employeePassword)).token}` },
    body: JSON.stringify({ record: { key: 'UNAUTHORIZED-NOTE' } }),
  });
  assert.equal(nonAdminResponse.status, 403, await nonAdminResponse.text());

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && (response.url().includes('/collections/doc_notes') || response.url().includes('/collections/business_org_units') || response.url().includes('/document-notes/'))) {
      browserApiErrors.push(`HTTP ${response.status()} ${response.url()}`);
    }
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: admin.token, user: admin.user });
  const cdp = await page.target().createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
  await page.goto(`${webUrl}/admin/documents/notes`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  async function clickButton(label, selector = 'button') {
    await page.waitForFunction((text, query) => [...document.querySelectorAll(query)].some(button => button.textContent.trim() === text && !button.disabled), { timeout: 15000 }, label, selector);
    await page.evaluate((text, query) => [...document.querySelectorAll(query)].find(button => button.textContent.trim() === text && !button.disabled)?.click(), label, selector);
  }
  async function fill(label, value, type = 'text') {
    const handle = await page.evaluateHandle(({ label: text, fieldType }) => {
      const item = [...document.querySelectorAll('.ant-modal-root .ant-form-item')].find(node => node.querySelector('label')?.textContent.includes(text));
      if (fieldType === 'date') return item?.querySelector('.kiyovn-datepicker-input') || null;
      return item?.querySelector('input, textarea') || null;
    }, { label, fieldType: type });
    const element = handle.asElement();
    assert.ok(element, `Missing input: ${label}`);
    if (type === 'date') {
      await element.click();
      await page.waitForFunction(() => [...document.querySelectorAll('.kiyovn-datepicker-popup button')].some(button => button.textContent.trim() === 'Hôm nay'), { timeout: 15000 });
      await page.evaluate(() => [...document.querySelectorAll('.kiyovn-datepicker-popup button')].find(button => button.textContent.trim() === 'Hôm nay')?.click());
      const chosenDate = await element.evaluate(node => node.textContent.trim());
      assert.match(chosenDate, /^\d{4}-\d{2}-\d{2}$/);
      await handle.dispose();
      return chosenDate;
    } else {
      await element.click();
      const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
      await page.keyboard.down(modifier);
      await page.keyboard.press('KeyA');
      await page.keyboard.up(modifier);
      await page.keyboard.press('Backspace');
      await element.type(value);
    }
    assert.equal(await element.evaluate(input => input.value), value, `Unexpected input value: ${label}`);
    await handle.dispose();
  }
  async function choose(label, option) {
    const item = await page.evaluateHandle(text => [...document.querySelectorAll('.ant-modal-root .ant-form-item')].find(node => node.querySelector('label')?.textContent.includes(text)) || null, label);
    assert.ok(item.asElement(), `Missing select: ${label}`);
    const currentValue = await item.evaluate(node => node.querySelector('.ant-select-selector')?.textContent.trim() || '');
    if (currentValue.startsWith(option)) {
      await item.dispose();
      return;
    }
    await item.evaluate(node => node.querySelector('.ant-select')?.click());
    await new Promise(resolve => setTimeout(resolve, 180));
    const visibleOptions = await page.evaluate(() => [...document.querySelectorAll('.ant-select-dropdown .ant-select-item')].map(node => node.textContent.trim()));
    if (!visibleOptions.some(text => text.startsWith(option))) {
      const diagnostics = await page.evaluate(() => ({
        text: document.querySelector('.ant-modal-root')?.innerText,
        selects: [...document.querySelectorAll('.ant-modal-root .ant-select')].map(node => ({ open: node.classList.contains('ant-select-open'), text: node.innerText })),
      }));
      assert.fail(`Select option not available: ${option}. UI: ${JSON.stringify({ options: visibleOptions, ...diagnostics })}`);
    }
    await page.evaluate(text => [...document.querySelectorAll('.ant-select-item')].find(node => node.textContent.trim().startsWith(text))?.click(), option);
    await item.dispose();
  }
  async function waitForFile(filename) {
    const file = path.join(directory, filename);
    for (let attempt = 0; attempt < 100; attempt++) {
      if (existsSync(file) && statSync(file).size > 0) return file;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Expected report download was not created: ${filename}`);
  }
  async function getNote(code) {
    const response = await fetch(`${apiUrl}/collections/doc_notes?limit=500`, { headers });
    assert.equal(response.status, 200);
    return (await response.json()).data.find(note => note.key === code);
  }

  await clickButton('Tạo chỉ đạo mới');
  await page.waitForSelector('.ant-modal-root form');
  const code = await page.evaluate(() => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
    .find(node => node.querySelector('label')?.textContent.includes('Mã chỉ đạo'))?.querySelector('input')?.value || '');
  assert.match(code, /^CD-\d{4}-[A-F0-9]{8}$/);
  await fill('Tiêu đề chỉ đạo', 'Kiểm tra an toàn tủ điện');
  await fill('Người chỉ đạo', 'Người ban hành kiểm thử');
  await fill('Chức danh', 'Giám đốc kiểm thử');
  await choose('Đơn vị thực thi', noteDept);
  const deadline = await fill('Hạn chót hoàn thành', '', 'date');
  await choose('Ghim ưu tiên', 'Ghim lên đầu trang');
  await fill('Nội dung chi tiết', 'Kiểm tra, lập biên bản và phản hồi kết quả.');
  await fill('Các đầu việc cụ thể', 'Kiểm tra tải điện\nLập biên bản');
  await clickButton('Ban hành chỉ đạo', '.ant-modal-root button');
  let note;
  for (let attempt = 0; attempt < 100; attempt++) {
    note = await getNote(code);
    if (note) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!note) {
    const diagnostics = await page.evaluate(() => ({ modal: document.querySelector('.ant-modal-root')?.innerText, page: document.body.innerText.slice(-1200) }));
    assert.fail(`Directive was not persisted. UI: ${JSON.stringify(diagnostics)} API errors: ${browserApiErrors.join('; ')}`);
  }
  await page.waitForFunction(value => ![...document.querySelectorAll('.ant-modal-root')].some(node => node.getBoundingClientRect().width > 0) && document.body.innerText.includes(value), { timeout: 15000 }, code);

  assert.ok(note, 'Directive was not persisted by the API.');
  assert.equal(note.key, note.noteCode);
  assert.equal(note.createdById, admin.user.id);
  assert.equal(note.completionRate, 0);
  assert.equal(note.status, 'Đang thực hiện');
  assert.equal(note.isPinned, true);
  assert.deepEqual(note.actionItems.map(item => item.done), [false, false]);
  assert.equal(note.assignedToDept, noteDept);

  let row = await page.evaluateHandle(value => [...document.querySelectorAll('tr')].find(item => item.textContent.includes(value)) || null, code);
  assert.ok(row.asElement(), 'Directive table row was not rendered.');
  await row.evaluate(node => [...node.querySelectorAll('button')].find(button => button.textContent.trim() === 'Xem')?.click());
  await row.dispose();
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-drawer-root')].some(node => node.getBoundingClientRect().width > 0 && node.innerText.includes('Lịch sử xử lý')));
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-drawer-root button[aria-pressed="false"]')].length === 2);
  await page.evaluate(() => [...document.querySelectorAll('.ant-drawer-root button[aria-pressed="false"]')][0]?.click());
  for (let attempt = 0; attempt < 100; attempt++) {
    note = await getNote(code);
    if (note?.completionRate === 50) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(note.completionRate, 50);
  assert.equal(note.status, 'Đang thực hiện');
  assert.equal(note.history.at(-1).actorId, admin.user.id);
  assert.match(note.history.at(-1).action, /1\/2/);

  await clickButton('Gửi nhắc việc nội bộ', '.ant-drawer-root button');
  for (let attempt = 0; attempt < 100; attempt++) {
    note = await getNote(code);
    if (note?.reminderHistory?.length === 1) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(note.reminderHistory.length, 1);
  assert.equal(note.reminderHistory[0].recipientCount, 1);
  assert.equal(note.reminderHistory[0].actorId, admin.user.id);
  const employee = await login(employeeEmail, employeePassword);
  const employeeNotifications = await fetch(`${apiUrl}/notifications`, { headers: { Authorization: `Bearer ${employee.token}` } });
  assert.equal(employeeNotifications.status, 200);
  const notificationList = (await employeeNotifications.json()).data;
  assert.ok(notificationList.some(item => item.type === 'document_note' && item.title === `Nhắc việc: ${code}` && item.link === '/admin/documents/notes'));

  await page.evaluate(() => [...document.querySelectorAll('.ant-drawer-root button[aria-pressed="false"]')][0]?.click());
  for (let attempt = 0; attempt < 100; attempt++) {
    note = await getNote(code);
    if (note?.completionRate === 100) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.equal(note.completionRate, 100);
  assert.equal(note.status, 'Đã hoàn thành');
  assert.ok(note.completedAt);
  assert.equal(note.history.at(-1).actorId, admin.user.id);
  const completedReminder = await fetch(`${apiUrl}/document-notes/${encodeURIComponent(code)}/remind`, { method: 'POST', headers });
  assert.equal(completedReminder.status, 409, await completedReminder.text());
  assert.equal(browserApiErrors.length, 0, browserApiErrors.join('\n'));

  await clickButton('In phiếu chỉ đạo', '.ant-drawer-root button');
  await waitForFile(`${code}_chi_dao.pdf`);
  await page.evaluate(() => document.querySelector('.ant-drawer-root .ant-drawer-close')?.click());
  await page.waitForFunction(() => ![...document.querySelectorAll('.ant-drawer-root')].some(node => node.getBoundingClientRect().width > 0));
  await clickButton('Xuất sổ');
  await waitForFile('So_chi_dao_dieu_hanh.xlsx');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(value => {
    const row = [...document.querySelectorAll('tr')].find(item => item.textContent.includes(value));
    return row?.textContent.includes('Đã hoàn thành');
  }, { timeout: 30000 }, code);
  await page.waitForFunction(() => document.body.innerText.includes('Tỷ lệ chỉ đạo hoàn tất: 100%'));
  assert.deepEqual(pageErrors, []);
  console.log(JSON.stringify({ checks: 'API authorization, create and persist, actual action progress and history, department notification, complete lifecycle, PDF/XLSX downloads, reload', code, database: directory }));
} catch (error) {
  console.error(`${error.stack || error}\n${logs}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of [vite, api]) if (child.exitCode === null) child.kill();
  await new Promise(resolve => setTimeout(resolve, 100));
  for (const child of [vite, api]) if (child.exitCode === null) child.kill('SIGKILL');
}
