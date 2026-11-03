import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const apiDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = path.resolve(apiDir, '..', 'web');
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-payroll-browser-'));
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
  SEED_ADMIN_EMAIL: 'loyalty-browser@example.test', SEED_ADMIN_PASSWORD: 'Loyalty-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'BROWSER-ADMIN', JWT_SECRET: 'loyalty-browser-isolated-test-secret',
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
  const loginResponse = await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }) });
  assert.equal(loginResponse.status, 200);
  const session = await loginResponse.json();
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token || session.access_token}` };
  const profile = (await (await fetch(`${apiUrl}/system/company-profile`, { headers })).json()).profile;
  const configuredProfile = await fetch(`${apiUrl}/system/company-profile`, { method: 'PUT', headers, body: JSON.stringify({
    ...profile, companyName: 'Doanh nghiệp kiểm thử lương', taxCode: '0012345678', legalForm: 'llc_single',
    companySize: 'small', industry: 'Kiểm thử', accountingRegime: 'TT99', accountingEffectiveDate: '2026-01-01', fiscalYearStartMonth: 1,
    fiscalYearStartDay: 1, vatMethod: 'deduction',
  }) });
  assert.equal(configuredProfile.status, 200);
  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  const cdp = await page.createCDPSession();
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });
  await page.evaluateOnNewDocument(({ token, user }) => {
    localStorage.setItem('minepanel_token', token);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { token: session.token || session.access_token, user: session.user });
  const businessDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date());
  const period = businessDate.split('-').reverse().join('/');
  const payrollBank = (await (await fetch(`${apiUrl}/finance/bank-accounts`, { method: 'POST', headers, body: JSON.stringify({ bankName: 'Ngân hàng lương giao diện', accountNumber: '7000000001', accountHolder: 'Doanh nghiệp', balance: 5000000, status: 'Đang hoạt động' }) })).json()).account;
  const seedPayroll = await fetch(`${apiUrl}/collections/payroll`, { method: 'POST', headers, body: JSON.stringify({ record: { key: 'ui-payroll-post', employeeCode: 'UI-EMP-1', employeeName: 'Nhân viên thử', department: 'IT', month: period, status: 'Chưa chi trả', baseSalary: 1000000, allowance: 100000, bonus: 0, insuranceDeduction: 100000, taxDeduction: 50000, netSalary: 950000, workDays: 20 } }) });
  assert.equal(seedPayroll.status, 201);
  await page.goto(`${webUrl}/admin/finance/payroll/accounting`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('1.100.000'), { timeout: 30000 });
  async function clickButton(label, last = false, inModal = false) {
    await page.waitForFunction((text, modal) => [...document.querySelectorAll(modal ? '.ant-modal-root button' : 'button')].some(button => button.textContent.trim() === text && !button.disabled), { timeout: 15000 }, label, inModal);
    await page.evaluate((text, useLast, modal) => {
      const buttons = [...document.querySelectorAll(modal ? '.ant-modal-root button' : 'button')].filter(button => button.textContent.trim() === text && !button.disabled);
      (useLast ? buttons.at(-1) : buttons[0]).click();
    }, label, last, inModal);
  }

  await page.type('input[placeholder="Nhập số tiền"]', '200000');
  await clickButton('Hạch toán ghi Sổ Cái');
  await page.waitForFunction(() => document.body.innerText.includes('1 phiếu lương') && document.body.innerText.includes('200.000'), { timeout: 15000 });
  await clickButton('Ghi sổ');
  await page.waitForFunction(() => document.body.innerText.includes('Đã ghi 4 bút toán'), { timeout: 15000 });
  const result = await (await fetch(`${apiUrl}/collections/finance_general_ledger`, { headers })).json();
  const entries = result.data.filter((entry) => entry.sourceReference === `payroll:${period}`);
  assert.equal(entries.length, 4);
  assert.deepEqual(entries.map((item) => item.amount).sort((a, b) => a - b), [50000, 100000, 200000, 1100000]);
  await page.goto(`${webUrl}/admin/finance/payroll/disburse`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => document.body.innerText.includes('Thông tin trả lương'), { timeout: 30000 });
  async function chooseSelect(labelText, optionText) {
    const labels = await page.$$('label');
    let opened = false;
    for (const label of labels) {
      if (!(await label.evaluate((item, text) => item.innerText.trim().startsWith(text), labelText))) continue;
      const selector = await label.$('.ant-select-selector');
      if (selector) { await selector.click(); opened = true; break; }
    }
    assert.equal(opened, true, `Không tìm thấy ô chọn ${labelText}.`);
    await page.waitForFunction((text) => document.body.innerText.includes(text), { timeout: 10000 }, optionText);
    const selected = await page.evaluate((text) => {
      const matches = [...document.querySelectorAll('body *')].filter((item) => item.childElementCount === 0 && item.textContent.includes(text));
      const option = matches.at(-1);
      if (!option) return false;
      option.click();
      return true;
    }, optionText);
    assert.equal(selected, true, `Không tìm thấy lựa chọn ${optionText}.`);
  }
  await chooseSelect('Phương thức thanh toán', 'Tiền gửi');
  await chooseSelect('Tài khoản chi', 'Ngân hàng lương giao diện');
  await clickButton('Lấy dữ liệu');
  await page.waitForSelector('input[placeholder="Nhập mã giao dịch hoặc số phiếu chi"]', { timeout: 10000 });
  await page.type('input[placeholder="Nhập mã giao dịch hoặc số phiếu chi"]', 'UI-PAYROLL-TXN-01');
  await clickButton('Ghi nhận chi');
  await clickButton('Đã thực hiện giao dịch', false, true);
  await page.waitForFunction(() => document.body.innerText.includes('Đã lập phiếu chi và ghi Sổ Cái'), { timeout: 15000 });
  const disbursement = (await (await fetch(`${apiUrl}/collections/payroll/ui-payroll-post`, { headers })).json()).record;
  assert.equal(disbursement.status, 'Đã chi trả');
  assert.equal(disbursement.paymentReference, 'UI-PAYROLL-TXN-01');
  assert.ok(disbursement.financeTransactionId && disbursement.ledgerEntryKey);
  const cash = (await (await fetch(`${apiUrl}/finance/cash-transactions?source=bank`, { headers })).json()).data.find((item) => item.key === disbursement.financeTransactionId);
  assert.equal(cash.amount, 950000);
  assert.equal(cash.journalLines[0].debitAccount, 'TK 334');
  assert.equal(cash.journalLines[0].creditAccount, 'TK 112');
  const payoutLedger = (await (await fetch(`${apiUrl}/collections/finance_general_ledger`, { headers })).json()).data.find((item) => item.key === disbursement.ledgerEntryKey);
  assert.equal(payoutLedger.amount, 950000);
  assert.equal(payoutLedger.sourceModule, 'payroll_payment');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ checks: 'payroll preview, atomic posting, UI disbursement, cash balance and ledger posting', database: directory }));
} catch (error) {
  if (page) console.error((await page.$eval('body', node => node.innerText).catch(() => '')).slice(-3000));
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
