// Run the real reference and app APIs against new, disposable databases.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { root } from './inventory.mjs';
import { redactDiagnostics } from './redact.mjs';

const children = [];
const password = randomBytes(24).toString('base64url') + 'aA!1';
const email = 'visual-audit@kiyo.test';
const employeeEmail = 'visual-employee@kiyo.test';
const runtimeParent = path.join(root, 'build/visual-parity/runtime');
await fs.mkdir(runtimeParent, { recursive: true });
const runtime = await fs.mkdtemp(path.join(runtimeParent, 'revision4-'));
const args = process.argv.slice(2);
const employee = args.includes('--employee');
const cashFixture = args.includes('--cash-fixture');
if (employee && cashFixture) throw new Error('Cash mutation capture requires the ADMIN fixture');
const basePort = Number(args.find(arg => arg.startsWith('--base-port='))?.split('=')[1] || 3451);
if (!Number.isInteger(basePort) || basePort < 1024 || basePort > 65533) throw new Error('Invalid audit base port');
const referenceOrigin = `http://127.0.0.1:${basePort}`;
const appOrigin = `http://127.0.0.1:${basePort + 1}`;
const referenceApi = `http://127.0.0.1:${basePort + 2}`;
const captureArgs = args.filter(arg => !['--employee', '--fixture-check', '--cash-fixture'].includes(arg) && !arg.startsWith('--base-port='));

async function freePort(port) {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  await new Promise(resolve => server.close(resolve));
}
function start(label, executable, argv, env, cwd = root) {
  const child = spawn(executable, argv, { cwd, windowsHide: true, env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  child.on('error', error => { child.startError = error; });
  let log = '';
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => { log = redactDiagnostics(log + chunk.toString(),[password]).slice(-16000); });
  children.push(child);
  child.log = () => log;
  child.label = label;
  return child;
}
async function completed(child) {
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', resolve);
  });
  await fs.writeFile(path.join(runtime, child.label + '.log'), child.log());
  if (code !== 0) throw new Error(`${child.label} exited ${code}: ${child.log()}`);
}
async function ready(child, url) {
  for (let attempt = 0; attempt < 400; attempt++) {
    if (child.startError) throw child.startError;
    if (child.exitCode !== null) throw new Error(`${child.label} exited: ${child.log()}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(1500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`${child.label} did not become ready: ${child.log()}`);
}
async function request(origin, route, body, token) {
  const response = await fetch(origin + '/api/v1' + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${route} returned HTTP ${response.status}: ${(await response.text()).replaceAll(password, '[redacted]')}`);
  return response.json();
}

try {
  for (const port of [basePort, basePort + 1, basePort + 2]) await freePort(port);
  const legacyEnv = { USE_SQLITE: 'true', KIYOVN_DATA_DIR: path.join(runtime, 'reference'), KIYOVN_DB_PATH: path.join(runtime, 'reference/kiyo.sqlite'), KIYOVN_FILES_DIR: path.join(runtime, 'reference/files'), KIYOVN_MASTER_KEY: randomBytes(32).toString('hex'), JWT_SECRET: randomBytes(48).toString('hex'), SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: password, SEED_ADMIN_NAME: 'Kiyo Administrator', HOST: '127.0.0.1', PORT: String(basePort + 2) };
  await completed(start('reference-seed', process.execPath, ['legacy/api/index.mjs', '--seed-admin'], legacyEnv));
  const reference = start('reference-api', process.execPath, ['legacy/api/index.mjs'], legacyEnv);
  const app = start('app-api', process.env.PARITY_SERVER || path.join(root, 'target/debug/kiyo-server.exe'), [], { KIYO_API_HOST: '127.0.0.1', KIYO_API_PORT: String(basePort + 1), KIYO_API_DB_PATH: path.join(runtime, 'app/kiyo.sqlite'), KIYO_API_STORAGE_PATH: path.join(runtime, 'app/files'), KIYO_JWT_SECRET: randomBytes(48).toString('hex'), KIYOVN_MASTER_KEY: randomBytes(32).toString('hex'), KIYO_BOOTSTRAP_ADMIN_EMAIL: email, KIYO_BOOTSTRAP_ADMIN_PASSWORD: password, KIYO_STATIC_DIR: path.join(root, 'build/visual-parity/web') });
  const preview = start('reference-web', process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--host', '127.0.0.1', '--port', String(basePort), '--strictPort'], {}, path.join(root, 'legacy/web'));
  await Promise.all([ready(reference, referenceApi + '/api/health'), ready(app, appOrigin + '/api/health'), ready(preview, referenceOrigin + '/login')]);
  // Provision a real active USER on each isolated API; never relabel an ADMIN.
  for (const origin of [appOrigin, referenceApi]) {
    const login = await request(origin, '/auth/login', { email, password });
    await request(origin, '/users', { email: employeeEmail, password, name: 'Nhân viên kiểm thử', role: 'USER', employeeCode: 'VISUAL-001', department: 'Kiểm thử', position: 'Nhân viên', phone: '0900000000' }, login.access_token || login.token);
    const employeeLogin = await request(origin, '/auth/login', { email: employeeEmail, password });
    if (employeeLogin.user?.role !== 'USER') throw new Error('Employee fixture must authenticate as USER');
    if (cashFixture) {
      await request(origin, '/finance/cash-transactions', {type:'Thu',source:'bank',category:'Kiểm thử xác nhận hủy',amount:125000,date:'2026-10-25',recipientOrPayer:'Đối tác fixture',account:'Quỹ fixture',status:'Đã hoàn thành',note:'Disposable UI mutation fixture'}, login.access_token || login.token);
    }
  }
  console.log(`Disposable fixture ready: ${path.relative(root, runtime)} (${employee ? 'USER' : 'ADMIN'} capture)`);
  if (!args.includes('--fixture-check')) {
    const capture = start('capture', process.execPath, ['tools/visual-parity/capture.mjs', ...captureArgs], { PARITY_REFERENCE_ORIGIN: referenceOrigin, PARITY_APP_ORIGIN: appOrigin, PARITY_REFERENCE_API: referenceApi, PARITY_EMAIL: employee ? employeeEmail : email, PARITY_PASSWORD: password, PARITY_CAPTURE_ROLE: employee ? 'USER' : 'ADMIN', PARITY_EMPLOYEE_PROFILE_FIXTURE: employee ? 'USER provisioned through real API with phone; populated-profile state, not onboarding flow' : '', PARITY_CASH_FIXTURE: cashFixture ? 'true' : '' });
    capture.stdout.on('data', chunk => process.stdout.write(chunk));
    let stderrLines='';
    capture.stderr.on('data', chunk => {
      stderrLines+=chunk.toString();
      let end;
      while((end=stderrLines.indexOf('\n'))>=0){process.stderr.write(redactDiagnostics(stderrLines.slice(0,end+1),[password]));stderrLines=stderrLines.slice(end+1);}
    });
    capture.once('exit',()=>{if(stderrLines)process.stderr.write(redactDiagnostics(stderrLines,[password]));});
    await completed(capture);
  }
} finally {
  for (const child of children) if (child.exitCode === null) child.kill();
  await Promise.all(children.map(async child => {
    if (child.exitCode === null) await new Promise(resolve => { child.once('exit', resolve); setTimeout(resolve, 5000).unref(); });
    await fs.writeFile(path.join(runtime, child.label + '.log'), child.log());
  }));
  console.log('Fixture databases/logs retained; only this runner’s child processes were stopped.');
}
