import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-recruitment-test-'));
const probe = createServer();
await new Promise(resolve => probe.listen(0, '127.0.0.1', resolve));
const port = probe.address().port;
await new Promise(resolve => probe.close(resolve));
const cwd = fileURLToPath(new URL('..', import.meta.url));
const env = {
  ...process.env, USE_SQLITE: 'true', PORT: String(port), HOST: '127.0.0.1',
  KIYOVN_DATA_DIR: directory, KIYOVN_DB_PATH: path.join(directory, 'test.sqlite'), KIYOVN_FILES_DIR: path.join(directory, 'files'),
  SEED_ADMIN_EMAIL: 'recruitment@example.test', SEED_ADMIN_PASSWORD: 'Recruitment-Test-26!Safe',
  SEED_ADMIN_EMPLOYEE_CODE: 'TEST-RECRUITMENT', JWT_SECRET: 'isolated-recruitment-test-secret-not-for-deployment',
};
const seed = spawnSync(process.execPath, ['index.mjs', '--seed-admin'], { cwd, env, encoding: 'utf8', timeout: 30000, windowsHide: true });
assert.equal(seed.status, 0, seed.stderr);
const server = spawn(process.execPath, ['index.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
server.stdout.on('data', chunk => { logs += chunk; }); server.stderr.on('data', chunk => { logs += chunk; });
after(async () => {
  if (server.exitCode === null) { const exit = new Promise(resolve => server.once('exit', resolve)); server.kill(); await exit; }
  console.log(`Recruitment API evidence: ${directory}`);
});
const base = `http://127.0.0.1:${port}/api/v1`;
for (let attempt = 0; attempt < 100; attempt++) {
  try { if ((await fetch(`${base}/health`)).ok) break; } catch {}
  if (server.exitCode !== null || attempt === 99) throw new Error(logs);
  await new Promise(resolve => setTimeout(resolve, 100));
}
const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD }) });
assert.equal(login.status, 200);
const session = await login.json();
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token || session.token}` };
async function request(route, method = 'GET', payload, expected = 200) {
  const response = await fetch(`${base}${route}`, { method, headers, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}

test('recruitment persists jobs, actual CV bytes and candidate stages; rejects invalid writes', async () => {
  const job = { key: 'job-test', jobCode: 'TD-TEST', title: 'Integration role', department: 'Test', level: 'Junior', headcountNeeded: 1, deadline: '2026-12-31', status: 'Đang tuyển dụng' };
  const created = await request('/collections/hr_job_openings', 'POST', { record: job }, 201);
  assert.equal(created.record.key, 'job-test');
  assert.notEqual(created.record.id, 'job-test', 'record key and physical row ID are distinct');
  await request('/collections/hr_job_openings/job-test', 'PATCH', { patch: { headcountNeeded: 0 } }, 422);
  await request('/collections/hr_job_openings/job-test', 'PATCH', { patch: { status: 'Đã đóng' } });
  assert.equal((await request('/collections/hr_job_openings')).data[0].status, 'Đã đóng', 'The close option shown in the UI must be accepted by the API.');
  await request('/collections/hr_job_openings/job-test', 'PATCH', { patch: { status: 'Đang tuyển dụng' } });
  const publicJobsResponse = await fetch(`${base}/public/recruitment/jobs`);
  assert.equal(publicJobsResponse.status, 200);
  const publicJobs = await publicJobsResponse.json();
  assert.equal(publicJobs.data.some(item => item.key === job.key), true);
  assert.equal('recruiter' in publicJobs.data.find(item => item.key === job.key), false, 'Public job listings expose only applicant-facing fields.');
  const publicJobResponse = await fetch(`${base}/public/recruitment/jobs/${encodeURIComponent(job.key)}`);
  assert.equal(publicJobResponse.status, 200);
  const honeypotResponse = await fetch(`${base}/public/recruitment/jobs/${encodeURIComponent(job.key)}/applications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ website: 'spam.example', name: 'Bot', email: 'bot@example.test' }),
  });
  assert.equal(honeypotResponse.status, 202, 'The hidden spam field is accepted without creating an applicant record.');
  assert.equal((await request('/collections/hr_recruitment_candidates')).data.length, 0);
  const publicCv = Buffer.from('%PDF-1.4\nPublic recruitment CV\n%%EOF\n');
  const publicApplicationResponse = await fetch(`${base}/public/recruitment/jobs/${encodeURIComponent(job.key)}/applications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Public Applicant', email: 'public@example.test', phone: '0900000000', region: 'Miền Bắc', country: 'Việt Nam', province: 'Hà Nội', ward: 'Phường Dịch Vọng', personalAccount: 'https://example.test/public-applicant', message: 'Tôi quan tâm đến vị trí này.', cv: { name: 'public-cv.pdf', contentBase64: publicCv.toString('base64') } }),
  });
  assert.equal(publicApplicationResponse.status, 201, 'The public application should be accepted.');
  const publicApplication = await publicApplicationResponse.json();
  assert.equal(publicApplication.submitted, true);
  const publicCandidate = (await request('/collections/hr_recruitment_candidates')).data.find(item => item.key === publicApplication.applicationCode);
  assert.equal(publicCandidate.email, 'public@example.test');
  assert.equal(publicCandidate.status, 'applied');
  assert.equal(publicCandidate.source, 'Website tuyển dụng');
  assert.equal(publicCandidate.talentPool, false);
  assert.deepEqual(publicCandidate.history.map(item => item.actor), ['Website tuyển dụng']);
  assert.ok(publicCandidate.cvFileId);
  const publicCvResponse = await fetch(`${base}/files/${publicCandidate.cvFileId}/download`, { headers: { Authorization: headers.Authorization } });
  assert.equal(publicCvResponse.status, 200);
  assert.deepEqual(Buffer.from(await publicCvResponse.arrayBuffer()), publicCv);
  const duplicatePublicApplication = await fetch(`${base}/public/recruitment/jobs/${encodeURIComponent(job.key)}/applications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Public Applicant', email: 'PUBLIC@example.test' }),
  });
  assert.equal(duplicatePublicApplication.status, 409);
  const invalidPublicCv = await fetch(`${base}/public/recruitment/jobs/${encodeURIComponent(job.key)}/applications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Invalid CV', email: 'invalid-cv@example.test', cv: { name: 'invalid.pdf', contentBase64: Buffer.from('not a PDF').toString('base64') } }),
  });
  assert.equal(invalidPublicCv.status, 422);
  const workspace = await request('/files?scope=employee');
  const upload = await fetch(`${base}/files/upload`, { method: 'POST', headers: { Authorization: headers.Authorization, 'Content-Type': 'application/pdf', 'X-File-Name': 'test-cv.pdf', 'X-Origin-Module': 'hr_recruitment', 'X-Parent-Id': workspace.context.parentId }, body: 'isolated-test-cv-bytes' });
  assert.equal(upload.status, 201);
  const file = (await upload.json()).file;
  const candidate = {
    key: 'candidate-test', jobKey: job.key, name: 'Integration Candidate', email: 'candidate@example.test', appliedAt: '2026-10-01', status: 'applied',
    region: 'Miền Bắc', country: 'Việt Nam', province: 'Hà Nội', ward: 'Phường Dịch Vọng', personalAccount: 'https://example.test/candidate', source: 'Website tuyển dụng',
    talentPool: true,
    cvFileId: file.id, cvFileName: file.name,
  };
  await request('/collections/hr_recruitment_candidates', 'POST', { record: candidate }, 201);
  assert.equal((await request('/collections/hr_recruitment_candidates')).data[0].talentPool, true, 'Talent pool membership is persisted with the candidate profile.');
  await request('/collections/hr_recruitment_candidates', 'POST', { record: { ...candidate, key: 'duplicate', email: 'CANDIDATE@example.test' } }, 409);
  await request('/collections/hr_recruitment_candidates', 'POST', { record: { ...candidate, key: 'missing-job', email: 'other@example.test', jobKey: 'missing' } }, 422);
  await request('/collections/hr_recruitment_candidates', 'POST', { record: { ...candidate, key: 'long-personal-account', email: 'long-account@example.test', personalAccount: 'x'.repeat(501) } }, 422);
  const route = '/collections/hr_recruitment_candidates/candidate-test';
  await request(route, 'DELETE', undefined, 409);
  await request(route, 'PATCH', { patch: { status: 'hired', hiredDate: '2026-10-11' } }, 422);
  await request(route, 'PATCH', { patch: { status: 'screening' } });
  await request(route, 'PATCH', { patch: { status: 'interview', interviewAt: '2026-09-30T09:00' } }, 422);
  await request(route, 'PATCH', { patch: { status: 'interview', interviewAt: '2026-10-03T09:00', interviewer: 'Integration HR' } });
  await request(route, 'PATCH', { patch: { talentPool: 'true' } }, 422);
  await request(route, 'PATCH', { patch: { talentPool: false } });
  await request(route, 'PATCH', { patch: { status: 'offer', offerDate: '2026-10-04' } });
  await request(route, 'PATCH', { patch: { status: 'hired', hiredDate: '2026-10-03' } }, 422);
  await request(route, 'PATCH', { patch: { status: 'hired', hiredDate: '2026-10-11' } });
  await request(route, 'PATCH', { patch: { status: 'applied' } }, 422);
  const saved = (await request('/collections/hr_recruitment_candidates')).data;
  assert.equal(saved.length, 2);
  const savedInternalCandidate = saved.find(record => record.key === 'candidate-test');
  assert.equal(saved.filter(record => record.status === 'hired').length, 1);
  assert.deepEqual([savedInternalCandidate.region, savedInternalCandidate.country, savedInternalCandidate.province, savedInternalCandidate.ward, savedInternalCandidate.personalAccount, savedInternalCandidate.source], ['Miền Bắc', 'Việt Nam', 'Hà Nội', 'Phường Dịch Vọng', 'https://example.test/candidate', 'Website tuyển dụng']);
  assert.deepEqual(savedInternalCandidate.history.map(item => item.status), ['applied', 'screening', 'interview', 'offer', 'hired']);
  assert.equal(savedInternalCandidate.talentPool, false, 'Talent pool membership can be removed without changing pipeline status.');
  assert.ok(savedInternalCandidate.history.every(item => item.actorId === session.user.id));
  const downloaded = await fetch(`${base}/files/${file.id}/download`, { headers: { Authorization: headers.Authorization } });
  assert.equal(downloaded.status, 200);
  assert.equal(await downloaded.text(), 'isolated-test-cv-bytes');
  await request('/collections/hr_recruitment_candidates', 'POST', { record: { key: 'candidate-rejected', jobKey: job.key, name: 'Rejected Candidate', email: 'rejected@example.test', appliedAt: '2026-10-02', status: 'applied', cvFileId: file.id, cvFileName: file.name } }, 201);
  await request('/collections/hr_recruitment_candidates/candidate-rejected', 'PATCH', { patch: { status: 'rejected' } });
  const deletion = await request('/collections/hr_recruitment_candidates/candidate-rejected', 'DELETE');
  assert.equal(deletion.deleted, true);
  assert.ok(deletion.trashItemId);
  assert.equal((await request('/collections/hr_recruitment_candidates')).data.some(record => record.key === 'candidate-rejected'), false);
  assert.equal((await fetch(`${base}/files/${file.id}/download`, { headers: { Authorization: headers.Authorization } })).status, 200, 'soft deletion retains the CV for recovery with the candidate record');
  const restored = await request(`/admin/trash/${encodeURIComponent(deletion.trashItemId)}/restore`, 'POST', {});
  assert.equal(restored.restored, true);
  assert.equal(restored.record.status, 'rejected');
  assert.equal(restored.record.cvFileId, file.id);
  assert.equal((await request('/collections/hr_recruitment_candidates')).data.some(record => record.key === 'candidate-rejected'), true);
  const deletedAgain = await request('/collections/hr_recruitment_candidates/candidate-rejected', 'DELETE');
  assert.ok(deletedAgain.trashItemId);
  assert.equal((await request('/collections/hr_recruitment_candidates')).data.some(record => record.key === 'candidate-rejected'), false);
  await request('/collections/hr_job_openings/job-test', 'PATCH', { patch: { status: 'Tạm dừng' } });
  assert.equal((await request('/collections/hr_job_openings')).data[0].status, 'Tạm dừng');
  const unavailablePublicJob = await fetch(`${base}/public/recruitment/jobs/${encodeURIComponent(job.key)}`);
  assert.equal(unavailablePublicJob.status, 404, 'Paused jobs must disappear from public application detail.');
  const applicationForPausedJob = await fetch(`${base}/public/recruitment/jobs/${encodeURIComponent(job.key)}/applications`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Late Applicant', email: 'late@example.test' }),
  });
  assert.equal(applicationForPausedJob.status, 409, 'Paused jobs must reject public applications.');
});
