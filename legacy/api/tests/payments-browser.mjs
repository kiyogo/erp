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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-payments-browser-'));
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
  SEED_ADMIN_EMAIL: 'payments-browser@example.test', SEED_ADMIN_PASSWORD: 'Payments-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'PAYMENTS-BROWSER-ADMIN', JWT_SECRET: 'payments-browser-isolated-test-secret',
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
const paymentApiErrors = [];
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
    const response = await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  }
  const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
  const tokenOf = session => session.token || session.access_token;
  const headersOf = session => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tokenOf(session)}` });
  async function waitForPayment(session, key, status) {
    let latest;
    for (let attempt = 0; attempt < 100; attempt++) {
      const response = await fetch(`${apiUrl}/finance/payments`, { headers: headersOf(session) });
      const body = await response.json();
      assert.equal(response.status, 200, JSON.stringify(body));
      latest = body.data.find(item => item.key === key);
      if (latest?.status === status) return latest;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`Payment ${key} did not reach ${status}; latest was ${JSON.stringify(latest)}`);
  }
  const createUserResponse = await fetch(`${apiUrl}/users`, { method: 'POST', headers: headersOf(admin), body: JSON.stringify({
    email: 'payment-requester@example.test', name: 'Nhân viên đề nghị chi', password: 'Payment-Requester-26!Secure',
    employeeCode: 'PAY-REQUESTER-01', role: 'USER', department: 'Phòng kiểm thử', position: 'Nhân viên',
  }) });
  const createdUser = await createUserResponse.json();
  assert.equal(createUserResponse.status, 201, JSON.stringify(createdUser));
  const requester = await login('payment-requester@example.test', 'Payment-Requester-26!Secure');
  assert.equal(requester.user.id, (createdUser.user || createdUser).id);

  const accountResponse = await fetch(`${apiUrl}/finance/bank-accounts`, { method: 'POST', headers: headersOf(admin), body: JSON.stringify({
    bankName: 'Vietcombank', accountNumber: '9988776655', accountHolder: 'KIYOVN', balance: 5000000, status: 'Đang hoạt động',
  }) });
  const accountBody = await accountResponse.json();
  assert.equal(accountResponse.status, 201, JSON.stringify(accountBody));

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/finance/payments')) paymentApiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 1100 });
  let authScriptIdentifier = '';
  async function useSession(session, route) {
    if (page.url() === 'about:blank') await page.goto(webUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (authScriptIdentifier) await page.removeScriptToEvaluateOnNewDocument(authScriptIdentifier);
    const installed = await page.evaluateOnNewDocument(({ token, user }) => {
      localStorage.setItem('minepanel_token', token);
      localStorage.setItem('minepanel_user', JSON.stringify(user.role === 'ADMIN' ? user : { ...user, onboardingCompleted: true }));
      if (user.role !== 'ADMIN' && user.email) localStorage.setItem(`kiyovn_profile_wizard_v4:${encodeURIComponent(user.email.trim().toLowerCase())}:done`, 'true');
    }, { token: tokenOf(session), user: session.user });
    authScriptIdentifier = installed.identifier;
    await page.goto(`${webUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  async function navigateInApp(route) {
    await page.evaluate(nextRoute => {
      window.history.pushState({}, '', nextRoute);
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    }, route);
  }
  async function clickButton(label, modal = false, last = false) {
    const selector = modal ? '.ant-modal-root button' : 'button';
    await page.waitForFunction((text, query) => [...document.querySelectorAll(query)].some(button => button.textContent.trim() === text && !button.disabled), { timeout: 20000 }, label, selector);
    const buttonHandle = await page.evaluateHandle((text, query, useLast) => {
      const matches = [...document.querySelectorAll(query)].filter(button => button.textContent.trim() === text && !button.disabled);
      return (useLast ? matches.at(-1) : matches[0]) || null;
    }, label, selector, last);
    const button = buttonHandle.asElement();
    assert.ok(button, `Missing enabled button: ${label}`);
    await button.click();
    await buttonHandle.dispose();
  }
  async function fill(label, value, modal = true) {
    const prefix = modal ? '.ant-modal-root ' : '';
    const handle = await page.evaluateHandle((text, query) => [...document.querySelectorAll(`${query}.ant-form-item`)]
      .find(item => item.querySelector('label')?.textContent.includes(text))?.querySelector('input:not([disabled]), textarea') || null, label, prefix);
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
    await element.click();
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
  async function submitNewRequest(beneficiary, category) {
    await clickButton('Lập phiếu chi mới');
    await page.waitForSelector('.ant-modal-root form');
    await fill('Đơn vị / Người nhận tiền', beneficiary);
    await fill('Thông tin tài khoản nhận tiền', 'Vietcombank · 1234567890');
    await fill('Nội dung chi thanh toán chi tiết', category);
    await fill('Số tiền thanh toán', '1250000');
    assert.equal(await page.$eval('.ant-modal-root input[type="number"]', input => input.checkValidity()), true, 'A valid VND amount should pass browser validation.');
    await clickButton('Trình duyệt thanh toán', true);
    await page.waitForFunction(name => !document.querySelector('.ant-modal-root') && document.body.innerText.includes(name), { timeout: 20000 }, beneficiary);
    const response = await fetch(`${apiUrl}/finance/payments`, { headers: headersOf(requester) });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body.data.find(item => item.beneficiary === beneficiary);
  }

  await useSession(requester, '/employee/finance/payments');
  await page.waitForFunction(() => document.body.innerText.includes('Đề nghị thanh toán'), { timeout: 30000 });
  assert.ok(await page.evaluate(() => [...document.querySelectorAll('*')].some(item => item.childElementCount === 0 && item.textContent.trim() === 'Đề nghị thanh toán')), 'Employee portal menu is missing the payment request entry.');
  const paidRequest = await submitNewRequest('Nhà cung cấp thanh toán giao diện', 'Kiểm thử tạo, duyệt và ghi sổ');
  assert.ok(paidRequest?.key);
  assert.equal(paidRequest.creatorId, requester.user.id);
  assert.equal(paidRequest.status, 'Chờ duyệt');

  await useSession(admin, '/admin/finance/payments/approve');
  await page.waitForFunction(code => document.body.innerText.includes(code), { timeout: 30000 }, paidRequest.code);
  await clickButton('Duyệt');
  await page.waitForFunction(() => document.body.innerText.includes('Phê duyệt đề nghị'));
  await clickButton('Phê duyệt', true);
  const approved = await waitForPayment(admin, paidRequest.key, 'Đã phê duyệt');
  assert.equal(approved.approverId, admin.user.id);
  await useSession(admin, '/admin/finance/payments');
  await page.waitForFunction(code => document.body.innerText.includes(code), { timeout: 20000 }, paidRequest.code);
  await clickButton('Ghi nhận chi');
  await page.waitForSelector('.ant-modal-root form');
  await choose('Tài khoản nguồn', 'Vietcombank');
  await fill('Mã giao dịch hoặc chứng từ chi', 'VCB-UI-PAY-001');
  await clickButton('Ghi sổ và xác nhận chi', true);
  await page.waitForFunction(() => document.body.innerText.includes('Đã thanh toán'), { timeout: 20000 });
  const paid = await waitForPayment(admin, paidRequest.key, 'Đã thanh toán');
  assert.equal(paid.status, 'Đã thanh toán');
  assert.equal(paid.approverId, admin.user.id);
  assert.equal(paid.paidById, admin.user.id);
  assert.equal(paid.settlementReference, 'VCB-UI-PAY-001');
  assert.equal(paid.ledgerRecorded, true);
  assert.ok(paid.financeTransactionId);
  const cashResponse = await fetch(`${apiUrl}/finance/cash-transactions?source=bank`, { headers: headersOf(admin) });
  const cashBody = await cashResponse.json();
  assert.equal(cashResponse.status, 200, JSON.stringify(cashBody));
  assert.ok(cashBody.data.some(item => item.key === paid.financeTransactionId && item.amount === 1250000));

  await navigateInApp('/admin/finance/payments/history');
  await page.waitForFunction(code => document.body.innerText.includes(code), { timeout: 20000 }, paidRequest.code);
  await navigateInApp('/admin/finance/payments/approve');
  await page.waitForFunction(code => !document.body.innerText.includes(code), { timeout: 20000 }, paidRequest.code);
  await navigateInApp('/admin/finance/payments');
  await page.waitForFunction(code => document.body.innerText.includes(code), { timeout: 20000 }, paidRequest.code);
  await useSession(requester, '/employee/finance/payments');
  const rejectedRequest = await submitNewRequest('Nhà cung cấp bị từ chối giao diện', 'Kiểm thử lý do từ chối');
  assert.ok(rejectedRequest?.key);
  await useSession(admin, '/admin/finance/payments/approve');
  await page.waitForFunction(code => document.body.innerText.includes(code), { timeout: 20000 }, rejectedRequest.code);
  await clickButton('Từ chối', false, true);
  await page.waitForSelector('.ant-modal-root textarea');
  const reason = 'Thiếu hóa đơn hợp lệ trong hồ sơ.';
  await page.type('.ant-modal-root textarea', reason);
  await clickButton('Lưu quyết định từ chối', true);
  await page.waitForFunction(() => document.body.innerText.includes('Từ chối'), { timeout: 20000 });
  const rejected = await waitForPayment(admin, rejectedRequest.key, 'Từ chối');
  assert.equal(rejected.rejectionReason, reason);
  assert.equal(rejected.approverId, admin.user.id);
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(paymentApiErrors, []);
  console.log(JSON.stringify({ checks: 'employee menu, request create/persistence, admin approval/settlement, cash ledger, history route filter reset, rejection with reason', database: directory }));
} catch (error) {
  if (page) {
    console.error((await page.$eval('body', node => node.innerText).catch(() => '')).slice(-3000));
    console.error('Payment form state:', JSON.stringify(await page.evaluate(() => ({
      fields: [...document.querySelectorAll('.ant-modal-root .ant-form-item')].map(item => ({ label: item.querySelector('label')?.textContent, value: item.querySelector('input, textarea, .ant-select-selection-item')?.value || item.querySelector('.ant-select-selection-item')?.textContent, error: item.querySelector('.ant-form-item-explain-error')?.textContent })),
      forms: [...document.querySelectorAll('.ant-modal-root form')].map(form => ({ className: form.className, buttonTypes: [...form.querySelectorAll('button')].map(button => ({ text: button.textContent.trim(), type: button.type, disabled: button.disabled, ownsForm: button.form === form })) })),
    })).catch(() => null)));
    console.error('Browser errors:', JSON.stringify(pageErrors));
    console.error('Payment API errors:', JSON.stringify(paymentApiErrors));
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
