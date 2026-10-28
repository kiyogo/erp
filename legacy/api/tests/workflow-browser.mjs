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
const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-workflow-browser-'));
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
  SEED_ADMIN_EMAIL: 'workflow-browser@example.test', SEED_ADMIN_PASSWORD: 'Workflow-Browser-26!Secure',
  SEED_ADMIN_EMPLOYEE_CODE: 'WORKFLOW-BROWSER-ADMIN', JWT_SECRET: 'workflow-browser-isolated-test-secret',
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

  async function login(email, password) {
    const response = await fetch(`${apiUrl}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body;
  }
  const admin = await login(env.SEED_ADMIN_EMAIL, env.SEED_ADMIN_PASSWORD);
  const tokenOf = session => session.token || session.access_token;
  const headersOf = session => ({ 'Content-Type': 'application/json', Authorization: `Bearer ${tokenOf(session)}` });
  async function createUser(email, name, employeeCode) {
    const response = await fetch(`${apiUrl}/users`, { method: 'POST', headers: headersOf(admin), body: JSON.stringify({
      email, name, password: 'Workflow-User-26!Secure', employeeCode, role: 'USER', department: 'Phòng kiểm thử', position: 'Kiểm thử nghiệp vụ',
    }) });
    const body = await response.json();
    assert.equal(response.status, 201, JSON.stringify(body));
    return body.user || body;
  }
  const requesterUser = await createUser('workflow-requester@example.test', 'Người gửi workflow', 'WF-REQUESTER');
  const approverUser = await createUser('workflow-approver@example.test', 'Người duyệt workflow', 'WF-APPROVER');
  const requester = await login('workflow-requester@example.test', 'Workflow-User-26!Secure');
  const approver = await login('workflow-approver@example.test', 'Workflow-User-26!Secure');
  assert.equal(requester.user.id, requesterUser.id);
  assert.equal(approver.user.id, approverUser.id);

  const chrome = process.env.TEST_CHROME_PATH || (existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : puppeteer.executablePath());
  browser = await puppeteer.launch({ headless: true, executablePath: chrome, args: ['--no-sandbox', '--disable-gpu'] });
  page = await browser.newPage();
  let authScriptIdentifier = '';
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1100 });

  async function useSession(session, url) {
    if (page.url() === 'about:blank') await page.goto(webUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    if (authScriptIdentifier) await page.removeScriptToEvaluateOnNewDocument(authScriptIdentifier);
    const authScript = await page.evaluateOnNewDocument(({ token, user }) => {
      localStorage.setItem('minepanel_token', token);
      localStorage.setItem('minepanel_user', JSON.stringify(user.role === 'ADMIN' ? user : { ...user, onboardingCompleted: true }));
      if (user.role !== 'ADMIN' && user.email) {
        localStorage.setItem(`kiyovn_profile_wizard_v4:${encodeURIComponent(user.email.trim().toLowerCase())}:done`, 'true');
      }
    }, { token: tokenOf(session), user: session.user });
    authScriptIdentifier = authScript.identifier;
    await page.goto(`${webUrl}${url}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  async function clickButton(label, modal = false) {
    const selector = modal ? '.ant-modal-root button' : 'button';
    await page.waitForFunction((text, query) => [...document.querySelectorAll(query)].some(button => button.textContent.trim() === text && !button.disabled), { timeout: 20000 }, label, selector);
    await page.evaluate((text, query) => [...document.querySelectorAll(query)].find(button => button.textContent.trim() === text && !button.disabled).click(), label, selector);
  }
  async function fillForm(label, value, modal = true) {
    const prefix = modal ? '.ant-modal-root ' : '';
    const handle = await page.evaluateHandle((text, query) => [...document.querySelectorAll(`${query}.ant-form-item`)]
      .find(item => item.querySelector('label')?.textContent.includes(text))?.querySelector('input:not([disabled]), textarea:not([disabled])') || null, label, prefix);
    const element = handle.asElement();
    assert.ok(element, `Missing editable form field: ${label}`);
    await element.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.down(modifier);
    await page.keyboard.press('A');
    await page.keyboard.up(modifier);
    await page.keyboard.press('Backspace');
    await element.type(value);
    assert.equal(await element.evaluate(input => input.value), value, `Unexpected field value: ${label}`);
    await handle.dispose();
  }
  async function chooseForm(label, option, modal = true) {
    const prefix = modal ? '.ant-modal-root ' : '';
    const handle = await page.evaluateHandle((text, query) => [...document.querySelectorAll(`${query}.ant-form-item`)]
      .find(item => item.querySelector('label')?.textContent.includes(text))?.querySelector('.ant-select-selector') || null, label, prefix);
    const element = handle.asElement();
    assert.ok(element, `Missing select: ${label}`);
    await element.click();
    await handle.dispose();
    await chooseVisibleOption(option);
  }
  async function chooseApprover(level, option) {
    const handle = await page.evaluateHandle(step => [...document.querySelectorAll('.ant-modal-root div')]
      .find(node => node.childElementCount === 0 && node.textContent.trim() === `Cấp ${step}`)
      ?.parentElement?.querySelector('.ant-select-selector') || null, level);
    const element = handle.asElement();
    assert.ok(element, `Missing approver selector for level ${level}`);
    await element.click();
    await handle.dispose();
    await chooseVisibleOption(option);
  }
  async function chooseFieldRequired(index, option) {
    const handle = await page.evaluateHandle(fieldIndex => {
      const input = document.querySelector(`[aria-label="Mã trường ${fieldIndex}"]`);
      return input?.parentElement?.querySelectorAll('.ant-select-selector')?.[1] || null;
    }, index);
    const element = handle.asElement();
    assert.ok(element, `Missing required selector for form field ${index}`);
    await element.click();
    await handle.dispose();
    await chooseVisibleOption(option);
    const selected = await page.evaluate(fieldIndex => {
      const input = document.querySelector(`[aria-label="Mã trường ${fieldIndex}"]`);
      return input?.parentElement?.querySelectorAll('.ant-select-selector')?.[1]?.textContent.trim();
    }, index);
    assert.ok(selected?.includes(option), `Form field ${index} should display ${option}, got ${selected}`);
  }
  async function chooseVisibleOption(option) {
    await page.waitForFunction(text => {
      const dropdowns = [...document.querySelectorAll('.ant-select-dropdown')].filter(item => item.getBoundingClientRect().width > 0);
      return dropdowns.at(-1)?.querySelectorAll('.ant-select-item') && [...dropdowns.at(-1).querySelectorAll('.ant-select-item')].some(item => item.textContent.includes(text));
    }, { timeout: 15000 }, option);
    await page.evaluate(text => {
      const dropdowns = [...document.querySelectorAll('.ant-select-dropdown')].filter(item => item.getBoundingClientRect().width > 0);
      const matches = [...(dropdowns.at(-1)?.querySelectorAll('.ant-select-item') || [])].filter(item => item.textContent.includes(text));
      matches[0].click();
    }, option);
    await new Promise(resolve => setTimeout(resolve, 180));
  }
  async function updateAriaInput(label, value) {
    const handle = await page.$(`[aria-label="${label}"]`);
    assert.ok(handle, `Missing accessible input: ${label}`);
    await handle.click();
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control';
    await page.keyboard.down(modifier);
    await page.keyboard.press('A');
    await page.keyboard.up(modifier);
    await page.keyboard.press('Backspace');
    await handle.type(value);
    assert.equal(await handle.evaluate(input => input.value), value, `Unexpected input value: ${label}`);
  }
  async function fillModalTextarea(value) {
    const handle = await page.$('.ant-modal-root textarea');
    assert.ok(handle, 'Missing modal text area');
    await handle.type(value);
  }
  async function apiRecord(scope, key, session) {
    const response = await fetch(`${apiUrl}/collections/${scope}/${encodeURIComponent(key)}`, { headers: headersOf(session) });
    const body = await response.json();
    assert.equal(response.status, 200, JSON.stringify(body));
    return body.record;
  }
  async function waitForRecord(scope, key, session, predicate, label) {
    let latest;
    for (let attempt = 0; attempt < 100; attempt++) {
      latest = await apiRecord(scope, key, session);
      if (predicate(latest)) return latest;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.fail(`${label}; latest record: ${JSON.stringify(latest)}`);
  }

  let workflowCode = '';
  const workflowName = 'Quy trình trình duyệt kiểm thử giao diện';
  await useSession(admin, '/admin/workflows/list');
  await page.waitForFunction(() => document.body.innerText.includes('Thiết kế quy trình mới'), { timeout: 30000 });
  await clickButton('Thiết kế quy trình mới');
  await page.waitForSelector('.ant-modal-root form');
  workflowCode = await page.evaluate(() => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
    .find(item => item.querySelector('label')?.textContent.includes('Mã quy trình'))?.querySelector('input')?.value || '');
  assert.match(workflowCode, /^WF-CUSTOM-/);
  await chooseForm('Số cấp phê duyệt', '1 Cấp');
  await chooseApprover(1, 'Người duyệt workflow');
  await fillForm('Tên quy trình nghiệp vụ', workflowName);
  await fillForm('Mục đích & Phạm vi áp dụng chi tiết', 'Kiểm tra tạo biểu mẫu, yêu cầu bổ sung, nộp lại và phê duyệt.');
  await fillForm('Cam kết SLA toàn quy trình', '4');
  await fillForm('Phiên bản quy trình', 'v1.0');
  await clickButton('Thêm trường', true);
  await updateAriaInput('Mã trường 4', 'request_ref');
  await updateAriaInput('Tên trường 4', 'Mã tham chiếu nghiệp vụ');
  await chooseFieldRequired(3, 'Bắt buộc');
  await chooseFieldRequired(4, 'Bắt buộc');
  await clickButton('Kích hoạt quy trình', true);
  await page.waitForFunction(code => !document.querySelector('.ant-modal-root') && document.body.innerText.includes(code), { timeout: 20000 }, workflowCode);
  const blueprintsResponse = await fetch(`${apiUrl}/collections/workflow_blueprints`, { headers: headersOf(admin) });
  const blueprint = (await blueprintsResponse.json()).data.find(item => item.workflowCode === workflowCode);
  assert.ok(blueprint, 'Workflow creator should persist its blueprint.');
  assert.equal(blueprint.status, 'Đang áp dụng');
  assert.equal(blueprint.approvalFlow.length, 1);
  assert.equal(blueprint.approvalFlow[0].approverId, approver.user.id);
  assert.equal(blueprint.formFields.find(field => field.fieldName === 'request_ref')?.required, true, JSON.stringify(blueprint.formFields));
  assert.equal(blueprint.formFields.find(field => field.fieldName === 'attachments')?.required, true, JSON.stringify(blueprint.formFields));

  const pdfPath = path.join(directory, 'workflow-attachment.pdf');
  const supplementalPdfPath = path.join(directory, 'workflow-supplement.pdf');
  writeFileSync(pdfPath, Buffer.from('%PDF-1.7\nBrowser workflow attachment\n%%EOF'));
  writeFileSync(supplementalPdfPath, Buffer.from('%PDF-1.7\nBrowser workflow supplement\n%%EOF'));
  let requestCode = '';
  await useSession(requester, '/employee/workflows/requests');
  await page.waitForFunction(() => document.body.innerText.includes('Tạo hồ sơ xin phê duyệt'), { timeout: 30000 });
  await clickButton('Tạo hồ sơ xin phê duyệt');
  await page.waitForSelector('.ant-modal-root form');
  requestCode = await page.evaluate(() => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
    .find(item => item.querySelector('label')?.textContent.includes('Mã hồ sơ trình ký'))?.querySelector('input')?.value || '');
  assert.match(requestCode, /^REQ-/);
  await fillForm('Tiêu đề đề xuất', 'Đề xuất cấp máy tính thử nghiệm');
  await fillForm('Nội dung chi tiết', 'Nội dung ban đầu gửi người duyệt.');
  await fillForm('Mã tham chiếu nghiệp vụ', 'REF-TEST-01');
  await fillForm('Đơn vị / Phòng ban', 'Phòng kiểm thử');
  await clickButton('Trình duyệt hồ sơ', true);
  await page.waitForFunction(() => document.body.innerText.includes('Tài liệu đính kèm là bắt buộc.'), { timeout: 10000 });
  assert.equal((await (await fetch(`${apiUrl}/collections/workflow_requests`, { headers: headersOf(requester) })).json()).data.length, 0, 'Required attachment validation must prevent creating the request.');
  await (await page.$('#workflow-request-attachments')).uploadFile(pdfPath);
  await clickButton('Trình duyệt hồ sơ', true);
  await page.waitForFunction(code => !document.querySelector('.ant-modal-root') && document.body.innerText.includes(`Đã gửi hồ sơ ${code}`), { timeout: 30000 }, requestCode);

  let request = await apiRecord('workflow_requests', requestCode, requester);
  assert.equal(request.requesterId, requester.user.id);
  assert.equal(request.currentApproverId, approver.user.id);
  assert.equal(request.totalLevels, 1);
  assert.equal(request.formData.request_ref, 'REF-TEST-01');
  assert.equal(request.attachments.length, 1);
  const initialAttachmentId = request.attachments[0].fileNodeId;
  assert.ok(initialAttachmentId);
  let attachmentResponse = await fetch(`${apiUrl}/files/${initialAttachmentId}/download`, { headers: headersOf(requester) });
  assert.equal(attachmentResponse.status, 200);
  assert.match(Buffer.from(await attachmentResponse.arrayBuffer()).toString(), /Browser workflow attachment/);

  await useSession(approver, '/employee/workflows/requests');
  await page.waitForFunction(code => document.body.innerText.includes(code) && document.body.innerText.includes('Phê duyệt'), { timeout: 30000 }, requestCode);
  request = await apiRecord('workflow_requests', requestCode, approver);
  assert.equal(request.canDecide, true);
  await clickButton('Yêu cầu bổ sung');
  await page.waitForFunction(() => document.body.innerText.includes('Yêu Cầu Bổ Sung Hồ Sơ'), { timeout: 10000 });
  await fillModalTextarea('Vui lòng bổ sung mã tài sản và chứng từ báo giá.');
  await clickButton('Gửi yêu cầu bổ sung', true);
  await page.waitForFunction(code => document.body.innerText.includes(code) && document.body.innerText.includes('Yêu cầu bổ sung'), { timeout: 20000 }, requestCode);
  request = await apiRecord('workflow_requests', requestCode, requester);
  assert.equal(request.status, 'Yêu cầu bổ sung');
  assert.equal(request.approvalHistory.at(-1).decision, 'Yêu cầu bổ sung');

  await useSession(requester, '/employee/workflows/requests');
  await page.waitForFunction(() => document.body.innerText.includes('Tất cả hồ sơ'), { timeout: 30000 });
  await clickButton('Tất cả hồ sơ');
  await page.waitForFunction(code => document.body.innerText.includes(code) && document.body.innerText.includes('Nộp bổ sung'), { timeout: 20000 }, requestCode);
  await clickButton('Nộp bổ sung');
  await page.waitForSelector('.ant-modal-root form');
  await fillForm('Nội dung hồ sơ đã cập nhật', 'Nội dung đã cập nhật theo yêu cầu.');
  await fillForm('Mã tham chiếu nghiệp vụ', 'REF-TEST-UPDATED');
  await fillForm('Phản hồi yêu cầu bổ sung', 'Đã cập nhật mã tài sản và tải thêm báo giá.');
  await (await page.$('#workflow-request-attachments')).uploadFile(supplementalPdfPath);
  await clickButton('Nộp bổ sung và gửi lại', true);
  await page.waitForFunction(code => !document.querySelector('.ant-modal-root') && document.body.innerText.includes(`Đã nộp bổ sung hồ sơ ${code}`), { timeout: 30000 }, requestCode);
  request = await apiRecord('workflow_requests', requestCode, requester);
  assert.equal(request.status, 'Chờ bạn ký duyệt');
  assert.equal(request.currentLevel, 1);
  assert.equal(request.formData.request_ref, 'REF-TEST-UPDATED');
  assert.equal(request.resubmissionNote, 'Đã cập nhật mã tài sản và tải thêm báo giá.');
  assert.equal(request.attachments.length, 2, 'Resubmission should retain the original file and append the new file.');
  assert.equal(request.attachments[0].fileNodeId, initialAttachmentId, 'Resubmission must keep the original attachment.');
  assert.notEqual(request.attachments[1].fileNodeId, initialAttachmentId, 'Resubmission should append the new attachment.');
  assert.equal(request.approvalHistory.at(-1).actorType, 'requester');
  for (const attachment of request.attachments) {
    attachmentResponse = await fetch(`${apiUrl}/files/${attachment.fileNodeId}/download`, { headers: headersOf(requester) });
    assert.equal(attachmentResponse.status, 200);
    assert.match(Buffer.from(await attachmentResponse.arrayBuffer()).toString(), /Browser workflow/);
  }

  await useSession(approver, '/employee/workflows/requests');
  await page.waitForFunction(code => document.body.innerText.includes(code) && document.body.innerText.includes('Phê duyệt'), { timeout: 30000 }, requestCode);
  await clickButton('Phê duyệt');
  await page.waitForFunction(() => document.body.innerText.includes('Ghi nhận quyết định phê duyệt'), { timeout: 10000 });
  await fillModalTextarea('Đã kiểm tra hồ sơ và chứng từ.');
  await clickButton('Ghi nhận phê duyệt nội bộ', true);
  await page.waitForFunction(() => !document.querySelector('.ant-modal-root'), { timeout: 20000 });
  request = await waitForRecord('workflow_requests', requestCode, requester, item => item.status === 'Đã phê duyệt', 'Internal approval should complete the one-level workflow');
  assert.equal(request.status, 'Đã phê duyệt');
  assert.equal(request.approvalHistory.at(-1).approverId, approver.user.id);
  assert.equal(request.approvalHistory.at(-1).comments, 'Đã kiểm tra hồ sơ và chứng từ.');
  assert.equal(request.approvalHistory.length, 3, 'Approval, resubmission and final approval should all be recorded.');

  await useSession(requester, '/employee/workflows/requests');
  await page.waitForFunction(() => document.body.innerText.includes('Tất cả hồ sơ'), { timeout: 30000 });
  await clickButton('Tất cả hồ sơ');
  await page.waitForFunction(code => document.body.innerText.includes(code) && document.body.innerText.includes('Đã phê duyệt'), { timeout: 30000 }, requestCode);

  await clickButton('Tạo hồ sơ xin phê duyệt');
  await page.waitForSelector('.ant-modal-root form');
  const rejectedRequestCode = await page.evaluate(() => [...document.querySelectorAll('.ant-modal-root .ant-form-item')]
    .find(item => item.querySelector('label')?.textContent.includes('Mã hồ sơ trình ký'))?.querySelector('input')?.value || '');
  assert.match(rejectedRequestCode, /^REQ-/);
  await fillForm('Tiêu đề đề xuất', 'Đề xuất cần từ chối trong kiểm thử');
  await fillForm('Nội dung chi tiết', 'Hồ sơ dùng để xác minh nhánh từ chối.');
  await fillForm('Mã tham chiếu nghiệp vụ', 'REF-REJECT-01');
  await fillForm('Đơn vị / Phòng ban', 'Phòng kiểm thử');
  await (await page.$('#workflow-request-attachments')).uploadFile(pdfPath);
  await clickButton('Trình duyệt hồ sơ', true);
  await page.waitForFunction(code => !document.querySelector('.ant-modal-root') && document.body.innerText.includes(`Đã gửi hồ sơ ${code}`), { timeout: 30000 }, rejectedRequestCode);

  await useSession(approver, '/employee/workflows/requests');
  await page.waitForFunction(code => document.body.innerText.includes(code) && document.body.innerText.includes('Từ chối'), { timeout: 30000 }, rejectedRequestCode);
  await clickButton('Từ chối');
  await page.waitForFunction(() => document.body.innerText.includes('Từ Chối Phê Duyệt Hồ Sơ'), { timeout: 10000 });
  await fillModalTextarea('Hồ sơ không đáp ứng điều kiện áp dụng trong kiểm thử.');
  await clickButton('Xác nhận từ chối', true);
  await page.waitForFunction(code => document.body.innerText.includes(`Đã ghi nhận quyết định “Từ chối” cho hồ sơ ${code}.`), { timeout: 20000 }, rejectedRequestCode);
  const rejected = await waitForRecord('workflow_requests', rejectedRequestCode, requester, item => item.status === 'Đã từ chối', 'Rejection should persist after leaving the approver queue');
  assert.equal(rejected.status, 'Đã từ chối');
  assert.equal(rejected.approvalHistory.length, 1);
  assert.equal(rejected.approvalHistory[0].decision, 'Từ chối');
  assert.equal(rejected.approvalHistory[0].approverId, approver.user.id);
  assert.equal(rejected.approvalHistory[0].comments, 'Hồ sơ không đáp ứng điều kiện áp dụng trong kiểm thử.');

  await useSession(requester, '/employee/workflows/requests');
  await page.waitForFunction(() => document.body.innerText.includes('Tất cả hồ sơ'), { timeout: 30000 });
  await clickButton('Tất cả hồ sơ');
  await page.waitForFunction(code => {
    const row = [...document.querySelectorAll('tbody tr')].find(item => item.innerText.includes(code));
    return row?.innerText.includes('Đã từ chối') && row.innerText.includes('Đã hoàn tất') && !row.innerText.includes('Nộp bổ sung');
  }, { timeout: 30000 }, rejectedRequestCode);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({
    checks: 'workflow UI creator, required custom fields and PDF, requester submission, assigned approver supplement, requester resubmission, file retention, internal approval, rejection with reason, terminal requester view and reload persistence',
    requestCode, rejectedRequestCode, workflowCode, database: directory,
  }));
} catch (error) {
  if (page) console.error((await page.$eval('body', node => node.innerText).catch(() => '')).slice(-4000));
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
