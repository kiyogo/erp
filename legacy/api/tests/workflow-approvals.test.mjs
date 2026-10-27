import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-workflow-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'workflow@example.test', SEED_ADMIN_PASSWORD: 'Workflow-Test-26!Safe',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-WORKFLOW', JWT_SECRET: 'isolated-workflow-test-secret-not-for-deployment',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; });
server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exit; }
  console.log(`Workflow API evidence: ${directory}`);
});

const base = `http://127.0.0.1:${port}/api/v1`;
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (server.exitCode !== null || attempt === 99) throw new Error(logs);
  await new Promise(resolve => setTimeout(resolve, 100));
}
const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const adminSession = await login.json();
const adminHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${adminSession.access_token || adminSession.token}` };

async function request(route, method = 'GET', payload, expected = 200, headers = adminHeaders) {
  const response = await fetch(`${base}${route}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}

async function uploadWorkflowFile(name, headers = adminHeaders, content = '%PDF-1.7\nWorkflow attachment test\n%%EOF') {
  const workspaceResponse = await fetch(`${base}/files?scope=employee`, { headers });
  const workspaceBody = await workspaceResponse.json();
  assert.equal(workspaceResponse.status, 200, JSON.stringify(workspaceBody));
  const parentId = workspaceBody.context?.parentId;
  assert.ok(parentId, 'employee file workspace should provide an upload directory');
  const response = await fetch(`${base}/files/upload`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(name), 'X-Origin-Module': 'workflow-requests', 'X-Parent-Id': parentId },
    body: Buffer.from(content),
  });
  const body = await response.json();
  assert.equal(response.status, 201, JSON.stringify(body));
  return body.file;
}

function expectedFileSize(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const createRequest = (key, patch = {}) => ({
  key,
  code: `REQ-${key}`,
  workflowCode: 'WF-PURCHASE-01',
  workflowName: 'Purchase approval test',
  category: 'Mua sắm & Tài sản',
  department: 'Quality Assurance',
  priority: 'Cao (P2)',
  summaryDetails: 'Purchase request used to verify server-side approval lifecycle.',
  budgetAmount: 1200000,
  totalLevels: 3,
  requester: 'Forged requester',
  requesterId: 'forged-user',
  currentLevel: 3,
  status: 'Đã ký số phê duyệt',
  tokenRequired: true,
  attachments: [],
  approvalHistory: [{ txCode: 'forged-event' }],
  digitalSignatureInfo: { certificateId: 'FAKE-CA' },
  ...patch,
});

test('workflow requests ignore forged identity, status, attachment and signature data and cannot be replaced in bulk', async () => {
  await request('/collections/workflow_requests', 'POST', { record: createRequest('forged-attachment', { attachments: [{ fileName: 'invented.pdf' }] }) }, 422);
  await request('/collections/workflow_requests', 'POST', { record: createRequest('lifecycle') }, 201);
  const created = (await request('/collections/workflow_requests')).data.find(item => item.key === 'lifecycle');
  assert.equal(created.requester, adminSession.user.name);
  assert.equal(created.requesterId, adminSession.user.id);
  assert.equal(created.status, 'Chờ bạn ký duyệt');
  assert.equal(created.currentLevel, 1);
  assert.equal(created.totalLevels, 3);
  assert.equal(created.tokenRequired, false);
  assert.deepEqual(created.attachments, []);
  assert.deepEqual(created.approvalHistory, []);
  assert.equal(created.digitalSignatureInfo, undefined);
  await request('/collections/workflow_requests', 'POST', { record: createRequest('duplicate', { code: 'REQ-lifecycle' }) }, 409);
  await request('/collections/workflow_requests', 'PUT', { records: [] }, 405);
  await request('/collections/workflow_requests/lifecycle', 'PATCH', { patch: { status: 'Đã phê duyệt' } }, 422);
  await request('/collections/workflow_requests/lifecycle', 'PATCH', { patch: { decision: 'Đã phê duyệt', requester: 'Another forged identity' } }, 422);
});

test('workflow decisions progress by level, append chained hashes and become immutable after completion', async () => {
  const route = '/collections/workflow_requests/lifecycle';
  for (const level of [1, 2]) {
    const result = (await request(route, 'PATCH', { patch: { decision: 'Đã phê duyệt', approvalNote: `Approved level ${level}` } })).record;
    assert.equal(result.currentLevel, level + 1);
    assert.equal(result.status, 'Chờ bạn ký duyệt');
    const event = result.approvalHistory.at(-1);
    assert.equal(event.level, level);
    assert.equal(event.approver, adminSession.user.name);
    assert.equal(event.approverId, adminSession.user.id);
    assert.equal(event.certificateProvider, 'Chữ ký nội bộ');
    assert.equal(event.certificateSerial, '');
    assert.equal(event.validityStatus, 'Chưa kiểm tra');
    assert.equal(event.sha256Hash, createHash('sha256').update(JSON.stringify(event.hashPayload)).digest('hex'));
    if (level === 2) assert.equal(event.previousHash, result.approvalHistory[0].sha256Hash);
  }
  const completed = (await request(route, 'PATCH', { patch: { decision: 'Đã phê duyệt', approvalNote: 'Final approval' } })).record;
  assert.equal(completed.currentLevel, 3);
  assert.equal(completed.status, 'Đã phê duyệt');
  assert.equal(completed.approvalHistory.length, 3);
  await request(route, 'PATCH', { patch: { decision: 'Đã phê duyệt' } }, 422);
  await request(route, 'DELETE', undefined, 422);
});

test('rejection and supplement decisions require reasons and are recorded as internal decisions', async () => {
  await request('/collections/workflow_requests', 'POST', { record: createRequest('needs-revision') }, 201);
  const route = '/collections/workflow_requests/needs-revision';
  await request(route, 'PATCH', { patch: { decision: 'Yêu cầu bổ sung' } }, 422);
  const result = (await request(route, 'PATCH', { patch: { decision: 'Yêu cầu bổ sung', approvalNote: 'Attach the missing quote.' } })).record;
  assert.equal(result.status, 'Yêu cầu bổ sung');
  assert.equal(result.approvalHistory.length, 1);
  assert.equal(result.approvalHistory[0].comments, 'Attach the missing quote.');
  await request(route, 'PATCH', { patch: { decision: 'Từ chối', approvalNote: 'Late decision' } }, 422);
  await request(route, 'PATCH', { patch: { resubmission: { summaryDetails: 'Updated details', budgetAmount: 1300000 } } }, 422);
  await request(route, 'PATCH', { patch: { resubmission: { summaryDetails: 'Updated details', budgetAmount: 1300000, response: 'Updated the file.', status: 'Đã phê duyệt' } } }, 422);

  await request('/users', 'POST', { email: 'other-workflow-admin@example.test', name: 'Other Workflow Admin', employeeCode: 'OTHER-WORKFLOW-ADMIN', password: 'Other-Workflow-Admin-26!Safe', role: 'ADMIN' }, 201);
  const otherLogin = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'other-workflow-admin@example.test', password: 'Other-Workflow-Admin-26!Safe' }) });
  assert.equal(otherLogin.status, 200);
  const otherSession = await otherLogin.json();
  const otherAdminHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${otherSession.access_token || otherSession.token}` };
  await request(route, 'PATCH', { patch: { resubmission: { summaryDetails: 'Updated details', budgetAmount: 1300000, response: 'Updated the file.' } } }, 403, otherAdminHeaders);

  const resubmitted = (await request(route, 'PATCH', { patch: { resubmission: { summaryDetails: 'Updated details', budgetAmount: 1300000, response: 'Attached the requested quote.' } } })).record;
  assert.equal(resubmitted.status, 'Chờ bạn ký duyệt');
  assert.equal(resubmitted.currentLevel, 1);
  assert.equal(resubmitted.summaryDetails, 'Updated details');
  assert.equal(resubmitted.budgetAmount, 1300000);
  assert.equal(resubmitted.resubmissionNote, 'Attached the requested quote.');
  assert.equal(resubmitted.approvalHistory.length, 2);
  assert.equal(resubmitted.approvalHistory[1].decision, 'Đã nộp bổ sung');
  assert.equal(resubmitted.approvalHistory[1].actorType, 'requester');
  assert.equal(resubmitted.approvalHistory[1].previousHash, resubmitted.approvalHistory[0].sha256Hash);
  assert.equal(resubmitted.approvalHistory[1].sha256Hash, createHash('sha256').update(JSON.stringify(resubmitted.approvalHistory[1].hashPayload)).digest('hex'));
});

test('requesters see their own workflow, cannot decide approvals and can submit requested changes', async () => {
  await request('/collections/workflow_requests', 'POST', { record: createRequest('negative', { budgetAmount: -1 }) }, 422);
  await request('/users', 'POST', { email: 'workflow-user@example.test', name: 'Workflow User', employeeCode: 'WORKFLOW-USER', password: 'Workflow-User-26!Safe', role: 'USER' }, 201);
  const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'workflow-user@example.test', password: 'Workflow-User-26!Safe' }) });
  assert.equal(login.status, 200);
  const userSession = await login.json();
  const userHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${userSession.access_token || userSession.token}` };
  assert.equal((await request('/collections/workflow_requests', 'GET', undefined, 200, userHeaders)).data.length, 0);
  await request('/collections/workflow_blueprints', 'GET', undefined, 200, userHeaders);
  await request('/collections/workflow_blueprints', 'POST', { record: {} }, 403, userHeaders);
  const userOwnedAttachment = await uploadWorkflowFile('user-quote.pdf', userHeaders);
  await request('/collections/workflow_requests', 'POST', { record: createRequest('user-forged', { attachments: [{ fileNodeId: userOwnedAttachment.id }] }) }, 201, userHeaders);
  const ownRequest = (await request('/collections/workflow_requests', 'GET', undefined, 200, userHeaders)).data.find(item => item.key === 'user-forged');
  assert.equal(ownRequest.requester, userSession.user.name);
  assert.equal(ownRequest.requesterId, userSession.user.id);
  assert.equal(ownRequest.status, 'Chờ bạn ký duyệt');
  assert.equal(ownRequest.attachments[0].fileName, userOwnedAttachment.name);
  const fileDownload = await fetch(`${base}/files/${userOwnedAttachment.id}/download`, { headers: userHeaders });
  assert.equal(fileDownload.status, 200);
  assert.equal(Buffer.from(await fileDownload.arrayBuffer()).toString(), '%PDF-1.7\nWorkflow attachment test\n%%EOF');
  await request('/collections/workflow_requests/lifecycle', 'GET', undefined, 404, userHeaders);
  const adminOwnedAttachment = await uploadWorkflowFile('admin-only.pdf');
  await request('/collections/workflow_requests', 'POST', { record: createRequest('user-cannot-attach-admin-file', {
    code: 'REQ-user-cannot-attach-admin-file', attachments: [{ fileNodeId: adminOwnedAttachment.id }],
  }) }, 403, userHeaders);
  const route = '/collections/workflow_requests/user-forged';
  await request(route, 'PATCH', { patch: { decision: 'Đã phê duyệt', approvalNote: 'Forged approval' } }, 403, userHeaders);
  await request(route, 'PATCH', { patch: { decision: 'Yêu cầu bổ sung', approvalNote: 'Please update the quote.' } });
  const resubmitted = (await request(route, 'PATCH', { patch: { resubmission: { summaryDetails: 'Updated purchase details', budgetAmount: 1200000, response: 'Added the requested quote.' } } }, 200, userHeaders)).record;
  assert.equal(resubmitted.status, 'Chờ bạn ký duyệt');
  assert.equal(resubmitted.summaryDetails, 'Updated purchase details');
  assert.equal(resubmitted.approvalHistory[1].actorType, 'requester');
  assert.equal(resubmitted.attachments[0].fileNodeId, userOwnedAttachment.id);
});

test('workflow blueprints validate their steps, derive metrics and control request category and level count', async () => {
  const blueprint = {
    key: 'WF-TEST-BP', workflowCode: 'WF-TEST-BP', workflowName: 'Test workflow', category: 'Tài chính & Thanh toán',
    description: 'Two-step approval test', scope: 'Quality Assurance', totalSteps: 2, slaTargetHours: 8, applicableBudgetLimit: 5000000,
    approvalFlow: [
      { level: 1, roleName: 'Department approver', defaultApprover: 'Department admin', slaHours: 4, canReject: true, requireTokenPKI: false },
      { level: 2, roleName: 'Finance approver', defaultApprover: 'Finance admin', slaHours: 4, canReject: true, requireTokenPKI: true },
    ],
    formFields: [
      { fieldName: 'summary', label: 'Summary', type: 'Text', required: true },
      { fieldName: 'amount', label: 'Amount', type: 'Number', required: false },
      { fieldName: 'dueDate', label: 'Due date', type: 'Date', required: false },
      { fieldName: 'attachments', label: 'Supporting PDF', type: 'PDF file', required: false },
    ],
    activeInstancesCount: 999, totalCompletedCount: 999, passRate: 100, createdBy: 'Forged owner', status: 'Đang áp dụng', version: 'v1.0',
  };
  const saved = (await request('/collections/workflow_blueprints', 'POST', { record: blueprint }, 201)).record;
  assert.equal(saved.createdBy, adminSession.user.name);
  assert.equal(saved.activeInstancesCount, 0);
  assert.equal(saved.totalCompletedCount, 0);
  assert.equal(saved.passRate, 0);
  await request('/collections/workflow_blueprints', 'POST', { record: { ...blueprint, key: 'WF-DUP-FIELDS', workflowCode: 'WF-DUP-FIELDS', formFields: [
    { fieldName: 'extra', label: 'Extra', type: 'Text', required: false },
    { fieldName: 'Extra', label: 'Duplicate', type: 'Text', required: false },
  ] } }, 422);
  await request('/collections/workflow_blueprints', 'POST', { record: { ...blueprint, key: 'WF-RESERVED-FIELD', workflowCode: 'WF-RESERVED-FIELD', formFields: [
    ...blueprint.formFields, { fieldName: 'workflowName', label: 'Override', type: 'Text', required: false },
  ] } }, 422);
  await request('/collections/workflow_requests', 'POST', { record: createRequest('required-custom-field', {
    workflowCode: 'WF-TEST-BP', category: 'Mua sắm & Tài sản',
  }) }, 422);
  await request('/collections/workflow_requests', 'POST', { record: createRequest('unknown-custom-field', {
    code: 'REQ-unknown-custom-field', workflowCode: 'WF-TEST-BP', formData: { summary: 'ok', forged: 'no' },
  }) }, 422);
  await request('/collections/workflow_requests', 'POST', { record: createRequest('invalid-custom-number', {
    code: 'REQ-invalid-custom-number', workflowCode: 'WF-TEST-BP', formData: { summary: 'ok', amount: 'not a number' },
  }) }, 422);
  await request('/collections/workflow_requests', 'POST', { record: createRequest('invalid-custom-date', {
    code: 'REQ-invalid-custom-date', workflowCode: 'WF-TEST-BP', formData: { summary: 'ok', dueDate: '2026-02-30' },
  }) }, 422);
  const fakePdf = await uploadWorkflowFile('fake.pdf', adminHeaders, 'not a PDF');
  await request('/collections/workflow_requests', 'POST', { record: createRequest('invalid-pdf-content', {
    code: 'REQ-invalid-pdf-content', workflowCode: 'WF-TEST-BP', formData: { summary: 'ok' }, attachments: [{ fileNodeId: fakePdf.id }],
  }) }, 422);
  const firstAttachment = await uploadWorkflowFile('quote.pdf');
  const created = (await request('/collections/workflow_requests', 'POST', { record: createRequest('blueprint-driven', {
    workflowCode: 'WF-TEST-BP', totalLevels: 7, category: 'Mua sắm & Tài sản', budgetAmount: 3000000,
    attachments: [{ fileNodeId: firstAttachment.id }], formData: { summary: 'Quarterly equipment need', amount: '250000', dueDate: '2026-12-01' },
  }) }, 201)).record;
  assert.equal(created.totalLevels, 2);
  assert.equal(created.category, 'Tài chính & Thanh toán');
  assert.deepEqual(created.approvalPKILevels, [false, true]);
  assert.equal(created.tokenRequired, false);
  assert.deepEqual(created.formData, { summary: 'Quarterly equipment need', amount: 250000, dueDate: '2026-12-01' });
  assert.deepEqual(created.approvalFormFields, blueprint.formFields);
  assert.equal(created.attachments.length, 1);
  assert.equal(created.attachments[0].fileNodeId, firstAttachment.id);
  assert.equal(created.attachments[0].fileName, firstAttachment.name);
  assert.equal(created.attachments[0].fileSizeBytes, firstAttachment.sizeBytes);
  assert.equal(created.attachments[0].fileSize, expectedFileSize(firstAttachment.sizeBytes));
  assert.equal(created.attachments[0].fileType, 'application/pdf');
  await request('/collections/workflow_requests/blueprint-driven', 'PATCH', { patch: { decision: 'Yêu cầu bổ sung', approvalNote: 'Please update the supporting PDF.' } });
  const secondAttachment = await uploadWorkflowFile('updated-quote.pdf');
  const resubmitted = (await request('/collections/workflow_requests/blueprint-driven', 'PATCH', { patch: { resubmission: {
    summaryDetails: 'Updated request details', budgetAmount: 3000000, response: 'Added the revised quote.',
    formData: { summary: 'Revised equipment need', amount: '270000', dueDate: '2026-12-15' }, attachments: [{ fileNodeId: secondAttachment.id }],
  } } })).record;
  assert.equal(resubmitted.status, 'Chờ bạn ký duyệt');
  assert.deepEqual(resubmitted.formData, { summary: 'Revised equipment need', amount: 270000, dueDate: '2026-12-15' });
  assert.deepEqual(resubmitted.attachments.map(file => file.fileNodeId), [firstAttachment.id, secondAttachment.id]);
  const nextLevel = (await request('/collections/workflow_requests/blueprint-driven', 'PATCH', { patch: { decision: 'Đã phê duyệt' } })).record;
  assert.equal(nextLevel.currentLevel, 2);
  assert.equal(nextLevel.tokenRequired, true);
  await request('/collections/workflow_requests/blueprint-driven', 'PATCH', { patch: { decision: 'Đã phê duyệt' } }, 409);
  await request('/collections/workflow_requests', 'POST', { record: createRequest('over-limit', {
    code: 'REQ-over-limit', workflowCode: 'WF-TEST-BP', budgetAmount: 6000000,
  }) }, 422);
  await request('/collections/workflow_blueprints/WF-TEST-BP', 'PATCH', { patch: { status: 'Tạm ngưng' } });
  await request('/collections/workflow_requests', 'POST', { record: createRequest('disabled-blueprint', {
    code: 'REQ-disabled-blueprint', workflowCode: 'WF-TEST-BP',
  }) }, 422);
});

test('budget tiers reject invalid and overlapping active ranges', async () => {
  const tier = { key: 'tier-1', tierName: 'Tier One', minAmount: 0, maxAmount: 1000000, requiredLevels: 'Department approver', slaHours: 4, autoEscalateHours: 8, requirePKI: false, status: 'Kích hoạt' };
  const created = (await request('/collections/workflow_settings', 'POST', { record: tier }, 201)).record;
  assert.equal(created.createdBy, adminSession.user.name);
  await request('/collections/workflow_settings', 'POST', { record: { ...tier, key: 'tier-overlap', tierName: 'Overlap', minAmount: 500000, maxAmount: 1500000 } }, 409);
  await request('/collections/workflow_settings/tier-1', 'PATCH', { patch: { maxAmount: 0 } }, 422);
  await request('/collections/workflow_settings', 'PUT', { records: [] }, 405);
  await request('/collections/workflow_settings', 'POST', { record: { key: 'tier-2', tierName: 'Tier Two', minAmount: 1000001, maxAmount: 2000000, requiredLevels: 'Cấp 1: Finance', slaHours: 2, autoEscalateHours: 4, requirePKI: true, status: 'Kích hoạt' } }, 201);
  const protectedRequest = (await request('/collections/workflow_requests', 'POST', { record: createRequest('ca-required', { code: 'REQ-ca-required', budgetAmount: 1500000, totalLevels: 1 }) }, 201)).record;
  assert.equal(protectedRequest.tokenRequired, true);
  assert.equal(protectedRequest.slaHoursTarget, 2);
  await request('/collections/workflow_requests/ca-required', 'PATCH', { patch: { decision: 'Đã phê duyệt' } }, 409);
});

test('delegation settings bind to active users and derive status from the actual date', async () => {
  const delegator = (await request('/users', 'POST', { email: 'delegator@example.test', name: 'Delegator', employeeCode: 'DELEGATOR', password: 'Delegator-Test-26!Safe', role: 'USER' }, 201)).user;
  const delegatee = (await request('/users', 'POST', { email: 'delegatee@example.test', name: 'Delegatee', employeeCode: 'DELEGATEE', password: 'Delegatee-Test-26!Safe', role: 'USER' }, 201)).user;
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rule = { key: 'delegation-1', delegatorId: delegator.id, delegateeId: delegatee.id, fromDate: tomorrow, toDate: nextWeek, scope: 'Approval requests', reason: 'Planned leave', notifySlack: false };
  const created = (await request('/collections/workflow_delegations', 'POST', { record: rule }, 201)).record;
  assert.equal(created.delegator, delegator.name);
  assert.equal(created.delegatee, delegatee.name);
  assert.equal(created.status, 'Sắp tới');
  assert.equal(created.notifySlack, false);
  await request('/collections/workflow_delegations', 'POST', { record: { ...rule, key: 'same-person', delegateeId: delegator.id } }, 422);
  await request('/collections/workflow_delegations', 'POST', { record: { ...rule, key: 'slack-not-configured', notifySlack: true } }, 409);
});

test('workflow security settings persist without returning the encrypted Slack webhook', async () => {
  const webhook = 'https://hooks.slack.com/services/T123/B456/secret-test-hook';
  await request('/collections/workflow_security_settings', 'POST', { record: {
    key: 'forged-key', caProvider: 'vnpt_ca', encryptionStandard: 'rsa_4096', sessionTimeout: 15,
    autoEscalate: 'yes', requireOtpForLargeBudget: 'yes', dailyDigestTime: '09:30', slackWebhook: webhook,
  } }, 201);
  const saved = (await request('/collections/workflow_security_settings')).data[0];
  assert.equal(saved.key, 'security');
  assert.equal(saved.slackWebhook, '');
  assert.equal(saved.slackWebhookConfigured, true);
  assert.equal(saved.caProvider, 'vnpt_ca');
  assert.equal(saved.sessionTimeout, 15);
  await request('/collections/workflow_security_settings/security', 'PATCH', { patch: { sessionTimeout: 20, slackWebhook: '' } });
  const updated = (await request('/collections/workflow_security_settings')).data[0];
  assert.equal(updated.sessionTimeout, 20);
  assert.equal(updated.slackWebhookConfigured, true);
  assert.equal(updated.slackWebhookEncrypted, undefined);
  await request('/collections/workflow_security_settings/security', 'PATCH', { patch: { sessionTimeout: 3 } }, 422);
});

test('assigned approvers and active delegates can see and decide only their current workflow level', async () => {
  async function createUser(email, name, employeeCode) {
    const result = await request('/users', 'POST', {
      email, name, employeeCode, password: `${employeeCode}-Test-26!Safe`, role: 'USER',
    }, 201);
    const login = await fetch(`${base}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: `${employeeCode}-Test-26!Safe` }),
    });
    assert.equal(login.status, 200);
    const session = await login.json();
    return { user: result.user, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token || session.token}` } };
  }

  const requester = await createUser('assigned-requester@example.test', 'Assigned Requester', 'ASSIGNED-REQUESTER');
  const assignedApprover = await createUser('assigned-approver@example.test', 'Assigned Approver', 'ASSIGNED-APPROVER');
  const delegate = await createUser('assigned-delegate@example.test', 'Assigned Delegate', 'ASSIGNED-DELEGATE');
  const inactiveDelegate = await createUser('inactive-delegate@example.test', 'Inactive Delegate', 'INACTIVE-DELEGATE');
  const nextApprover = await createUser('assigned-final@example.test', 'Assigned Final Approver', 'ASSIGNED-FINAL');
  const outsider = await createUser('assigned-outsider@example.test', 'Unassigned User', 'ASSIGNED-OUTSIDER');
  const workflowCode = 'WF-ASSIGNED-TEST';
  await request('/collections/workflow_blueprints', 'POST', { record: {
    key: workflowCode, workflowCode, workflowName: 'Assigned approval test', category: 'Tài chính & Thanh toán',
    description: 'Two-level workflow with named approvers', scope: 'Quality Assurance', totalSteps: 2,
    slaTargetHours: 8, applicableBudgetLimit: 5000000, status: 'Đang áp dụng', version: 'v1.0', formFields: [],
    approvalFlow: [
      { level: 1, roleName: 'Department approver', defaultApprover: 'Pending canonical name', approverId: assignedApprover.user.id, slaHours: 3, canReject: true, requireTokenPKI: false },
      { level: 2, roleName: 'Final approver', defaultApprover: 'Pending canonical name', approverId: nextApprover.user.id, slaHours: 2, canReject: false, requireTokenPKI: false },
    ],
  } }, 201);

  const today = new Date().toISOString().slice(0, 10);
  await request('/collections/workflow_delegations', 'POST', { record: {
    key: 'active-assigned-delegation', delegatorId: assignedApprover.user.id, delegateeId: delegate.user.id,
    fromDate: today, toDate: today, scope: workflowCode, maxBudgetAmount: 2000000,
    reason: 'Cover the assigned approval queue', notifySlack: false,
  } }, 201);
  const quote = await uploadWorkflowFile('assigned-quote.pdf', requester.headers);
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await request('/collections/workflow_delegations', 'POST', { record: {
    key: 'expired-assigned-delegation', delegatorId: assignedApprover.user.id, delegateeId: inactiveDelegate.user.id,
    fromDate: yesterday, toDate: yesterday, scope: workflowCode, reason: 'Expired cover', notifySlack: false,
  } }, 201);
  await request('/collections/workflow_delegations', 'POST', { record: {
    key: 'future-assigned-delegation', delegatorId: assignedApprover.user.id, delegateeId: inactiveDelegate.user.id,
    fromDate: tomorrow, toDate: nextWeek, scope: workflowCode, reason: 'Future cover', notifySlack: false,
  } }, 201);

  const overDelegatedLimit = (await request('/collections/workflow_requests', 'POST', { record: createRequest('delegation-limit', {
    code: 'REQ-delegation-limit', workflowCode, budgetAmount: 2500000, totalLevels: 2,
  }) }, 201, requester.headers)).record;
  const limitedDelegateQueue = await request('/collections/workflow_requests', 'GET', undefined, 200, delegate.headers);
  assert.equal(limitedDelegateQueue.data.some((item) => item.key === overDelegatedLimit.key), false);
  assert.equal((await request('/collections/workflow_requests', 'GET', undefined, 200, assignedApprover.headers)).data.some((item) => item.key === overDelegatedLimit.key), true);
  const dateRestrictedRequest = (await request('/collections/workflow_requests', 'POST', { record: createRequest('delegation-date', {
    code: 'REQ-delegation-date', workflowCode, budgetAmount: 900000, totalLevels: 2,
  }) }, 201, requester.headers)).record;
  assert.equal((await request('/collections/workflow_requests', 'GET', undefined, 200, inactiveDelegate.headers)).data.some((item) => item.key === dateRestrictedRequest.key), false);
  await request(`/collections/workflow_requests/${dateRestrictedRequest.key}`, 'PATCH', { patch: { decision: 'Đã phê duyệt' } }, 404, inactiveDelegate.headers);

  const created = (await request('/collections/workflow_requests', 'POST', { record: createRequest('assigned-approval', {
    code: 'REQ-assigned-approval', workflowCode, budgetAmount: 900000, totalLevels: 2, attachments: [{ fileNodeId: quote.id }],
  }) }, 201, requester.headers)).record;
  assert.equal(created.requesterId, requester.user.id);
  assert.equal(created.currentApproverId, assignedApprover.user.id);
  assert.equal(created.currentApprover, assignedApprover.user.name);
  assert.deepEqual(created.approvalAssignees.map((person) => person.userId), [assignedApprover.user.id, nextApprover.user.id]);
  assert.deepEqual(created.approvalSlaHours, [3, 2]);
  assert.equal(created.slaHoursTarget, 3);

  const requesterList = await request('/collections/workflow_requests', 'GET', undefined, 200, requester.headers);
  assert.equal(requesterList.data.find((item) => item.key === created.key).canDecide, false);
  await request(`/collections/workflow_requests/${created.key}`, 'PATCH', { patch: { decision: 'Đã phê duyệt' } }, 403, requester.headers);
  await request(`/collections/workflow_requests/${created.key}`, 'GET', undefined, 404, outsider.headers);
  await request(`/collections/workflow_requests/${created.key}`, 'PATCH', { patch: { decision: 'Đã phê duyệt' } }, 404, outsider.headers);
  const outsiderFile = await fetch(`${base}/files/${quote.id}/download`, { headers: outsider.headers });
  assert.equal(outsiderFile.status, 404);

  const delegateQueue = await request('/collections/workflow_requests', 'GET', undefined, 200, delegate.headers);
  const delegatedItem = delegateQueue.data.find((item) => item.key === created.key);
  assert.equal(delegatedItem.canDecide, true);
  assert.equal(delegatedItem.delegatedFor, assignedApprover.user.name);
  const delegatedDownload = await fetch(`${base}/files/${quote.id}/download`, { headers: delegate.headers });
  assert.equal(delegatedDownload.status, 200);
  assert.equal(Buffer.from(await delegatedDownload.arrayBuffer()).toString(), '%PDF-1.7\nWorkflow attachment test\n%%EOF');
  const delegatedDecision = (await request(`/collections/workflow_requests/${created.key}`, 'PATCH', {
    patch: { decision: 'Đã phê duyệt', approvalNote: 'Approved under the active delegation.' },
  }, 200, delegate.headers)).record;
  assert.equal(delegatedDecision.approvalHistory[0].approverId, delegate.user.id);
  assert.equal(delegatedDecision.currentLevel, 2);
  assert.equal(delegatedDecision.currentApproverId, nextApprover.user.id);
  assert.equal(delegatedDecision.currentApprover, nextApprover.user.name);
  assert.equal(delegatedDecision.slaHoursTarget, 2);
  await request(`/collections/workflow_requests/${created.key}`, 'GET', undefined, 404, delegate.headers);
  await request(`/collections/workflow_requests/${created.key}`, 'GET', undefined, 404, assignedApprover.headers);

  const finalQueue = await request('/collections/workflow_requests', 'GET', undefined, 200, nextApprover.headers);
  assert.equal(finalQueue.data.find((item) => item.key === created.key).canDecide, true);
  await request(`/collections/workflow_requests/${created.key}`, 'PATCH', {
    patch: { decision: 'Từ chối', approvalNote: 'This level is approval-only.' },
  }, 422, nextApprover.headers);
  const completed = (await request(`/collections/workflow_requests/${created.key}`, 'PATCH', {
    patch: { decision: 'Đã phê duyệt', approvalNote: 'Final approval.' },
  }, 200, nextApprover.headers)).record;
  assert.equal(completed.status, 'Đã phê duyệt');
  assert.equal(completed.approvalHistory[1].approverId, nextApprover.user.id);
  assert.equal((await request('/collections/workflow_requests', 'GET', undefined, 200, delegate.headers)).data.some((item) => item.key === created.key), false);

  const directRequest = (await request('/collections/workflow_requests', 'POST', { record: createRequest('direct-assigned', {
    code: 'REQ-direct-assigned', workflowCode, budgetAmount: 900000, totalLevels: 2,
  }) }, 201, requester.headers)).record;
  const directQueue = await request('/collections/workflow_requests', 'GET', undefined, 200, assignedApprover.headers);
  const directItem = directQueue.data.find((item) => item.key === directRequest.key);
  assert.equal(directItem.canDecide, true);
  assert.equal(directItem.delegatedFor, '');
  const directDecision = (await request(`/collections/workflow_requests/${directRequest.key}`, 'PATCH', {
    patch: { decision: 'Đã phê duyệt', approvalNote: 'Approved by the assigned approver.' },
  }, 200, assignedApprover.headers)).record;
  assert.equal(directDecision.approvalHistory[0].approverId, assignedApprover.user.id);
  assert.equal(directDecision.currentApproverId, nextApprover.user.id);
  const directFinal = (await request(`/collections/workflow_requests/${directRequest.key}`, 'PATCH', {
    patch: { decision: 'Đã phê duyệt', approvalNote: 'Final approval.' },
  }, 200, nextApprover.headers)).record;
  assert.equal(directFinal.status, 'Đã phê duyệt');
});
