import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { after, test } from 'node:test';
import { createBackupManager } from '../backups.mjs';

const directory = await mkdtemp(path.join(tmpdir(), 'kiyovn-backups-test-'));
process.env.USE_SQLITE = 'true';
process.env.KIYOVN_DATA_DIR = directory;
process.env.KIYOVN_DB_PATH = path.join(directory, 'live.sqlite');
const { default: db } = await import('../db.mjs');
await db.exec('CREATE TABLE backup_test (id TEXT PRIMARY KEY, content TEXT NOT NULL)');
await db.prepare('INSERT INTO backup_test (id, content) VALUES (?, ?)').run('persisted', 'Actual database content');
const filesDir = path.join(directory, 'files');
await mkdir(path.join(filesDir, 'tài liệu'), { recursive: true });
await writeFile(path.join(filesDir, 'document.pdf'), Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 0xff]));
await writeFile(path.join(filesDir, 'tài liệu', 'hồ sơ.txt'), 'Actual uploaded file content — nội dung tiếng Việt');
await writeFile(path.join(directory, '.kiyovn-master.key'), 'test-secret-must-not-be-archived');
const manager = createBackupManager({ db, filesDir, dataDir: directory });
const actor = { id: 'actual-admin', name: 'Actual Administrator' };
after(async () => {
  await db.close();
  console.log(`Isolated backup evidence: ${directory}`);
});

function zipEntries(bytes) {
  const end = bytes.length - 22;
  assert.equal(bytes.readUInt32LE(end), 0x06054b50);
  const count = bytes.readUInt16LE(end + 10);
  let central = bytes.readUInt32LE(end + 16);
  const entries = new Map();
  for (let index = 0; index < count; index++) {
    assert.equal(bytes.readUInt32LE(central), 0x02014b50);
    assert.equal(bytes.readUInt16LE(central + 10), 0, 'ZIP store entries do not claim compression');
    const size = bytes.readUInt32LE(central + 24);
    const nameSize = bytes.readUInt16LE(central + 28);
    const extraSize = bytes.readUInt16LE(central + 30);
    const commentSize = bytes.readUInt16LE(central + 32);
    const name = bytes.subarray(central + 46, central + 46 + nameSize).toString('utf8');
    const local = bytes.readUInt32LE(central + 42);
    assert.equal(bytes.readUInt32LE(local), 0x04034b50);
    const dataOffset = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
    assert.equal(bytes.readUInt32LE(local + 22), size);
    assert.equal(bytes.readUInt32LE(local + 14), bytes.readUInt32LE(central + 16));
    entries.set(name, bytes.subarray(dataOffset, dataOffset + size));
    central += 46 + nameSize + extraSize + commentSize;
  }
  assert.equal(central, end);
  return entries;
}

test('an empty backup catalog has no fictional snapshots and exposes actual engine capabilities', async () => {
  const result = await manager.list();
  assert.deepEqual(result.data, []);
  assert.equal(result.capabilities.database, true);
  assert.equal(result.capabilities.engine, 'SQLite');
  assert.equal(result.capabilities.restore, false);
  assert.equal(result.capabilities.autoDaily, false);
});

test('full backup contains a real consistent SQLite image, uploaded bytes and a verifiable manifest', async () => {
  const created = await manager.create({ name: 'Actual full backup', type: 'Full System' }, actor);
  assert.equal(created.creator, actor.name);
  assert.equal(created.createdBy, actor.id);
  assert.equal(created.restorable, false);
  const download = await manager.download(created.key);
  const bytes = await readFile(download.filePath);
  assert.equal(bytes.length, created.sizeBytes);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), created.checksumSha256);
  assert.equal(download.fileName, `${created.code}.zip`);
  const entries = zipEntries(bytes);
  assert.deepEqual([...entries.keys()].sort(), ['database/kiyovn.sqlite', 'files/document.pdf', 'files/tài liệu/hồ sơ.txt', 'manifest.json'].sort());
  assert.equal(entries.get('files/tài liệu/hồ sơ.txt').toString(), 'Actual uploaded file content — nội dung tiếng Việt');
  assert.deepEqual(entries.get('files/document.pdf'), Buffer.from([0x25, 0x50, 0x44, 0x46, 0, 0xff]));
  const manifest = JSON.parse(entries.get('manifest.json').toString());
  assert.equal(manifest.encryptionKeysIncluded, false);
  assert.ok(manifest.restoreRequirements.includes('khóa mã hóa'));
  assert.ok(!bytes.includes(Buffer.from('test-secret-must-not-be-archived')));
  for (const file of manifest.files) {
    const content = entries.get(file.name);
    assert.equal(content.length, file.sizeBytes);
    assert.equal(createHash('sha256').update(content).digest('hex'), file.checksumSha256);
  }
  const extracted = path.join(directory, 'extracted.sqlite');
  await writeFile(extracted, entries.get('database/kiyovn.sqlite'));
  const snapshot = new DatabaseSync(extracted);
  try {
    assert.equal(snapshot.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(snapshot.prepare('SELECT content FROM backup_test WHERE id = ?').get('persisted').content, 'Actual database content');
    await db.prepare('INSERT INTO backup_test (id, content) VALUES (?, ?)').run('later', 'Later live change');
    assert.equal(snapshot.prepare('SELECT COUNT(*) AS total FROM backup_test').get().total, 1);
  } finally { snapshot.close(); }
  assert.ok((await manager.list()).data.some(item => item.key === created.key));
});

test('database-only and storage-only scopes contain exactly their intended physical data', async () => {
  const database = await manager.create({ name: 'Database only', type: 'Database' }, actor);
  const dbEntries = zipEntries(await readFile((await manager.download(database.key)).filePath));
  assert.deepEqual([...dbEntries.keys()].sort(), ['database/kiyovn.sqlite', 'manifest.json']);
  const storage = await manager.create({ name: 'Files only', type: 'Storage Blob' }, actor);
  const storageEntries = zipEntries(await readFile((await manager.download(storage.key)).filePath));
  assert.ok(storageEntries.has('files/document.pdf'));
  assert.ok(!storageEntries.has('database/kiyovn.sqlite'));
});

test('archive tampering is detected and download refuses mismatched bytes', async () => {
  const created = await manager.create({ name: 'Integrity test', type: 'Database' }, actor);
  const download = await manager.download(created.key);
  const bytes = await readFile(download.filePath);
  bytes[40] ^= 0xff;
  await writeFile(download.filePath, bytes);
  const verified = await manager.verify(created.key);
  assert.equal(verified.status, 'Không khớp SHA-256');
  assert.notEqual(verified.actualChecksumSha256, verified.checksumSha256);
  await assert.rejects(() => manager.download(created.key), error => error.statusCode === 409);
});

test('missing archives remain visible as missing and path traversal cannot access arbitrary server files', async () => {
  const created = await manager.create({ name: 'Missing test', type: 'Database' }, actor);
  await rm((await manager.download(created.key)).filePath);
  const item = (await manager.list()).data.find(item => item.key === created.key);
  assert.equal(item.available, false);
  assert.equal(item.status, 'Thiếu tệp sao lưu');
  await assert.rejects(() => manager.download(created.key), error => error.statusCode === 404);
  await assert.rejects(() => manager.download('../live.sqlite'), error => error.statusCode === 422);
  await assert.rejects(() => manager.verify('not-a-backup-key'), error => error.statusCode === 422);
});

test('invalid or failed snapshots never leave a successful catalog entry or partial archive', async () => {
  await assert.rejects(() => manager.create({ name: ' ', type: 'Database' }, actor), error => error.statusCode === 422);
  await assert.rejects(() => manager.create({ name: 'Unsupported', type: 'Incremental' }, actor), error => error.statusCode === 422);
  const failingDir = path.join(directory, 'failing');
  const failing = createBackupManager({ db: { pool: null, backupTo: async () => { throw new Error('Real snapshot failed'); } }, filesDir, dataDir: failingDir });
  await assert.rejects(() => failing.create({ name: 'Failure', type: 'Database' }, actor), /Real snapshot failed/);
  assert.deepEqual((await failing.list()).data, []);
  assert.deepEqual(await readdir(path.join(failingDir, 'backups')), []);
});

test('PostgreSQL without a configured dump mechanism reports database backup unavailable but retains file backup', async () => {
  const pgManager = createBackupManager({ db: { pool: {} }, filesDir, dataDir: path.join(directory, 'pg') });
  assert.equal(pgManager.capabilities().database, false);
  assert.equal(pgManager.capabilities().fullSystem, false);
  await assert.rejects(() => pgManager.create({ name: 'No PostgreSQL dump', type: 'Database' }, actor), error => error.statusCode === 422);
  const storage = await pgManager.create({ name: 'Actual PostgreSQL file store', type: 'Storage Blob' }, actor);
  assert.ok((await pgManager.download(storage.key)).sizeBytes > 0);
});
