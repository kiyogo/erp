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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-costing-browser-'));
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
  SEED_ADMIN_EMAIL: 'costing-browser@example.test', SEED_ADMIN_PASSWORD: 'Costing-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'COSTING-ADMIN', JWT_SECRET: 'costing-isolated-browser-test-secret',
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

  const loginResponse = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }),
  });
  const admin = await loginResponse.json();
  assert.equal(loginResponse.status, 200, JSON.stringify(admin));
  const adminToken = admin.token || admin.access_token;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` };
  async function apiRequest(route, method = 'GET', record, expected = 200) {
    const response = await fetch(`${apiUrl}${route}`, {
      method, headers,
      body: record === undefined ? undefined : JSON.stringify({ record }),
    });
    const result = await response.json();
    assert.equal(response.status, expected, JSON.stringify(result));
    return result;
  }
  const employeeResponse = await fetch(`${apiUrl}/users`, {
    method: 'POST', headers,
    body: JSON.stringify({ name: 'Nhân sự kiểm thử giá thành', email: 'costing-user@example.test', password: 'Costing-User-26!Secure', employeeCode: 'COSTING-USER', role: 'USER', department: 'Kế toán', position: 'Chuyên viên' }),
  });
  assert.equal(employeeResponse.status, 201, await employeeResponse.text());
  const userLogin = await fetch(`${apiUrl}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'costing-user@example.test', password: 'Costing-User-26!Secure' }),
  });
  const userSession = await userLogin.json();
  assert.equal(userLogin.status, 200, JSON.stringify(userSession));
  const unauthorized = await fetch(`${apiUrl}/collections/finance_costing`, {
    method: 'POST', headers: { ...headers, Authorization: `Bearer ${userSession.token || userSession.access_token}` },
    body: JSON.stringify({ record: {} }),
  });
  assert.equal(unauthorized.status, 403, await unauthorized.text());

  const forged = await apiRequest('/collections/finance_costing', 'POST', {
    code: 'GT-API-CANONICAL', projectName: 'Kiểm tra tính lại giá thành', category: 'Dịch vụ duy trì SLA',
    materialCost: 0, directLabor: 100, infrastructureCost: 200, softwareLicense: 300, overheadCost: 400, revenue: 2000,
    status: 'Đang thực hiện', totalCost: 999999, profitMargin: 99, createdBy: 'người giả', createdById: 'forged-user',
  }, 201);
  assert.equal(forged.record.totalCost, 1000);
  assert.equal(forged.record.profitMargin, 50);
  assert.equal(forged.record.createdById, admin.user.id);
  assert.notEqual(forged.record.createdBy, 'người giả');
  await apiRequest('/collections/finance_costing', 'POST', {
    code: 'gt-api-canonical', projectName: 'Mã trùng', category: 'Hợp đồng kinh tế B2B',
    materialCost: 0, directLabor: 0, infrastructureCost: 0, softwareLicense: 0, overheadCost: 0, revenue: 0, status: 'Hoàn thành',
  }, 409);
  await apiRequest('/collections/finance_costing/GT-API-CANONICAL', 'PATCH', { status: 'Hoàn thành' }, 405);
  await apiRequest('/collections/finance_costing/GT-API-CANONICAL', 'PUT', { status: 'Hoàn thành' }, 405);
  const deleteResponse = await fetch(`${apiUrl}/collections/finance_costing/GT-API-CANONICAL`, { method: 'DELETE', headers });
  assert.equal(deleteResponse.status, 405, await deleteResponse.text());
  for (const invalidValue of [undefined, null, -1, 1.2, Number.MAX_SAFE_INTEGER + 1]) {
    const invalid = {
      code: `GT-INVALID-${String(invalidValue)}`, projectName: 'Dữ liệu không hợp lệ', category: 'Hợp đồng kinh tế B2B',
      materialCost: 0, directLabor: 0, infrastructureCost: 0, softwareLicense: 0, overheadCost: 0, revenue: 0, status: 'Đang thực hiện',
    };
    if (invalidValue === undefined) delete invalid.materialCost;
    else invalid.materialCost = invalidValue;
    await apiRequest('/collections/finance_costing', 'POST', invalid, 422);
  }
  await apiRequest('/collections/finance_costing', 'POST', {
    code: 'GT-CONSTRUCTION-NO-SITE', projectName: 'Thiếu địa điểm', category: 'Công trình thi công',
    materialCost: 0, directLabor: 0, infrastructureCost: 0, softwareLicense: 0, overheadCost: 0, revenue: 0, status: 'Đang thực hiện',
  }, 422);
  await apiRequest('/collections/finance_costing', 'POST', {
    code: 'GT-COST-OVERFLOW', projectName: 'Tổng vượt giới hạn', category: 'Hợp đồng kinh tế B2B',
    materialCost: Number.MAX_SAFE_INTEGER, directLabor: 1, infrastructureCost: 0, softwareLicense: 0, overheadCost: 0, revenue: 0, status: 'Đang thực hiện',
  }, 422);

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : await puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  const page = await browser.newPage();
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400 && response.url().includes('/collections/finance_costing')) browserApiErrors.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.setViewport({ width: 1440, height: 1000 });
  await page.evaluateOnNewDocument(({ value, user }) => {
    localStorage.setItem('minepanel_token', value);
    localStorage.setItem('minepanel_user', JSON.stringify(user));
  }, { value: adminToken, user: admin.user });
  const cdp = await page.target().createCDPSession();
  await cdp.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: directory });

  async function clickButton(label, selector = 'button') {
    await page.waitForFunction((text, query) => [...document.querySelectorAll(query)].some(button => button.textContent.trim() === text && !button.disabled), { timeout: 15000 }, label, selector);
    await page.evaluate((text, query) => [...document.querySelectorAll(query)].find(button => button.textContent.trim() === text && !button.disabled)?.click(), label, selector);
  }
  async function fill(label, value) {
    const handle = await page.evaluateHandle(text => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
      .find(node => node.querySelector('label')?.textContent.includes(text))?.querySelector('input, textarea') || null, label);
    const element = handle.asElement();
    assert.ok(element, `Missing input: ${label}`);
    await element.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.down(modifier);
    await page.keyboard.press('KeyA');
    await page.keyboard.up(modifier);
    await page.keyboard.press('Backspace');
    await element.type(String(value));
    assert.equal(await element.evaluate(input => input.value), String(value), `Unexpected input value: ${label}`);
    await handle.dispose();
  }
  async function choose(label, option) {
    const item = await page.evaluateHandle(text => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
      .find(node => node.querySelector('label')?.textContent.includes(text)) || null, label);
    assert.ok(item.asElement(), `Missing select: ${label}`);
    const currentValue = await item.evaluate(node => node.querySelector('.ant-select-selector')?.textContent.trim() || '');
    if (currentValue.startsWith(option)) {
      await item.dispose();
      return;
    }
    await item.evaluate(node => node.querySelector('.ant-select')?.click());
    await page.waitForFunction(text => [...document.querySelectorAll('.ant-select-dropdown .ant-select-item')].some(node => node.textContent.trim().startsWith(text)), { timeout: 10000 }, option);
    await page.evaluate(text => [...document.querySelectorAll('.ant-select-item')].find(node => node.textContent.trim().startsWith(text))?.click(), option);
    await page.waitForFunction(({ label: fieldLabel, expected }) => {
      const item = [...document.querySelectorAll('.ant-modal-root .ant-form-item')].find(node => node.querySelector('label')?.textContent.includes(fieldLabel));
      return item?.querySelector('.ant-select-selector')?.textContent.trim().startsWith(expected);
    }, { timeout: 10000 }, { label, expected: option });
    await item.dispose();
  }
  async function createViaUi(pathname, label, category, projectName, site = '') {
    await page.goto(`${webUrl}/admin${pathname}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => document.body.innerText.includes('Sổ tập hợp chi phí') || document.body.innerText.includes('Tính giá thành'));
    await clickButton(label);
    await page.waitForSelector('.ant-modal-root form');
    const code = await page.evaluate(() => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
      .find(node => node.querySelector('label')?.textContent.includes('Mã giá thành'))?.querySelector('input')?.value || '');
    assert.match(code, /^GT-\d{4}-[A-F0-9]{8}$/);
    if (category) await choose('Phân loại', category);
    await fill('Tên dự án, hợp đồng hoặc công việc', projectName);
    if (site) await fill('Địa điểm công trình', site);
    await fill('Chi phí vật tư trực tiếp', 1000);
    await fill('Chi phí nhân công trực tiếp', 2000);
    await fill('Chi phí hạ tầng và Cloud', 3000);
    await fill('Chi phí bản quyền phần mềm', 4000);
    await fill('Chi phí chung khác', 5000);
    await fill('Doanh thu dự kiến hoặc đã xác nhận', 25000);
    await choose('Trạng thái hồ sơ', 'Đang thực hiện');
    await clickButton('Lưu hồ sơ giá thành', '.ant-modal-root button');
    try {
      await page.waitForFunction(value => ![...document.querySelectorAll('.ant-modal-root')].some(node => node.getBoundingClientRect().width > 0) && document.body.innerText.includes(value), { timeout: 20000 }, code);
    } catch {
      const diagnostics = await page.evaluate(() => ({ modal: document.querySelector('.ant-modal-root')?.innerText, page: document.body.innerText.slice(-1800) }));
      const stored = await apiRequest('/collections/finance_costing?limit=500');
      assert.fail(`Costing save did not finish for ${code}. UI ${JSON.stringify(diagnostics)} API rows ${(stored.data || []).map(item => ({ code: item.code, name: item.projectName }))} API errors ${browserApiErrors.join('; ')}`);
    }
    const row = await page.evaluate(value => [...document.querySelectorAll('tr')].find(node => node.textContent.includes(value))?.innerText || '', code);
    assert.ok(row.includes(projectName), `Saved costing row is missing: ${code}`);
    return code;
  }

  const contractCode = await createViaUi('/finance/costing/contracts', 'Tập hợp chi phí hợp đồng', 'Hợp đồng kinh tế B2B', 'Hợp đồng kiểm thử');
  const orderCode = await createViaUi('/finance/costing/orders', 'Tạo thẻ tính giá thành đơn', 'Đơn đặt hàng (Job-Order)', 'Đơn hàng kiểm thử');
  const constructionCode = await createViaUi('/finance/costing/construction', 'Thêm hạng mục công trình', 'Công trình thi công', 'Công trình kiểm thử', 'Khu công nghiệp Hà Nội');
  const savedConstruction = await apiRequest(`/collections/finance_costing/${encodeURIComponent(constructionCode)}`);
  assert.equal(savedConstruction.record.totalCost, 15000);
  assert.equal(savedConstruction.record.profitMargin, 40);
  assert.equal(savedConstruction.record.constructionSite, 'Khu công nghiệp Hà Nội');
  assert.equal(savedConstruction.record.createdById, admin.user.id);

  await page.goto(`${webUrl}/admin/finance/costing`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(codes => codes.every(code => document.body.innerText.includes(code)), { timeout: 20000 }, [contractCode, orderCode, constructionCode]);
  const total = await page.evaluate(() => document.body.innerText);
  assert.ok(total.includes('46.000 ₫'));
  await page.evaluate(() => [...document.querySelectorAll('.ant-select')].find(node => node.querySelector('.ant-select-selector')?.textContent.trim().startsWith('Tất cả phân loại'))?.click());
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-select-dropdown .ant-select-item')].some(node => node.textContent.trim().startsWith('Hợp đồng kinh tế B2B')), { timeout: 10000 });
  await page.evaluate(() => [...document.querySelectorAll('.ant-select-item')].find(node => node.textContent.trim().startsWith('Hợp đồng kinh tế B2B'))?.click());
  await page.waitForFunction(data => document.body.innerText.includes(data.contractCode) && !document.body.innerText.includes('Đơn hàng kiểm thử'), { timeout: 15000 }, { contractCode });
  await page.evaluate(() => [...document.querySelectorAll('.ant-select')].find(node => node.querySelector('.ant-select-selector')?.textContent.trim().startsWith('Hợp đồng kinh tế B2B'))?.click());
  await page.waitForFunction(() => [...document.querySelectorAll('.ant-select-dropdown .ant-select-item')].some(node => node.textContent.trim().startsWith('Tất cả phân loại')), { timeout: 10000 });
  await page.evaluate(() => [...document.querySelectorAll('.ant-select-item')].find(node => node.textContent.trim().startsWith('Tất cả phân loại'))?.click());
  await page.waitForFunction(data => document.body.innerText.includes(data.orderCode), { timeout: 15000 }, { orderCode });
  const search = await page.$('input[placeholder="Tìm mã, dự án, phân loại, địa điểm..."]');
  assert.ok(search);
  await search.type(constructionCode);
  await page.waitForFunction(code => document.body.innerText.includes(code) && !document.body.innerText.includes('Đơn hàng kiểm thử'), { timeout: 15000 }, constructionCode);
  await search.click();
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
  await page.keyboard.down(modifier);
  await page.keyboard.press('KeyA');
  await page.keyboard.up(modifier);
  await page.keyboard.press('Backspace');
  await page.waitForFunction(code => document.body.innerText.includes(code), { timeout: 15000 }, orderCode);
  await page.$eval('input[placeholder="Tìm mã, dự án, phân loại, địa điểm..."]', input => { input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); });
  await clickButton('Xuất báo cáo');
  const workbook = path.join(directory, 'Bao_cao_gia_thanh.xlsx');
  for (let attempt = 0; attempt < 100 && (!existsSync(workbook) || statSync(workbook).size === 0); attempt++) await new Promise(resolve => setTimeout(resolve, 100));
  assert.ok(existsSync(workbook) && statSync(workbook).size > 0, 'Costing workbook was not downloaded.');
  const workbookBytes = await (await import('node:fs/promises')).readFile(workbook);
  assert.equal(workbookBytes.readUInt32LE(0), 0x04034b50);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(data => document.body.innerText.includes(data.constructionCode) && document.body.innerText.includes('46.000 ₫'), { timeout: 20000 }, { constructionCode });
  assert.deepEqual(pageErrors, []);
  assert.deepEqual(browserApiErrors, []);
  console.log(JSON.stringify({ checks: 'API role, canonical totals, duplicate and invalid data, append-only records, contract/order/construction create, filters, XLSX, reload', database: directory }));
} catch (error) {
  console.error(`${error.stack || error}\n${logs}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  for (const child of [vite, api]) if (child.exitCode === null) child.kill();
  await new Promise(resolve => setTimeout(resolve, 100));
  for (const child of [vite, api]) if (child.exitCode === null) child.kill('SIGKILL');
}
