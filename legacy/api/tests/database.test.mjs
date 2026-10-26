import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, test } from 'node:test';

const directory = mkdtempSync(path.join(tmpdir(), 'kiyovn-db-test-'));
process.env.USE_SQLITE = 'true';
process.env.KIYOVN_DATA_DIR = directory;
process.env.KIYOVN_DB_PATH = path.join(directory, 'test.sqlite');
const { default: db, convertSql } = await import('../db.mjs');
await db.exec('CREATE TABLE sample (id TEXT PRIMARY KEY, value INTEGER NOT NULL)');
after(async () => {
  await db.close();
  rmSync(process.env.KIYOVN_DB_PATH);
  rmdirSync(directory);
});

test('PostgreSQL conversion casts stored JSON text and keeps literal question marks', () => {
  assert.equal(convertSql("SELECT json_extract(payload_json, '$.name') FROM sample WHERE id = ? AND '?' = '?'"), "SELECT (payload_json::jsonb->>'name') FROM sample WHERE id = $1 AND '?' = '?'");
});

test('simultaneous transactions commit independently and support nested helpers', async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) => db.transaction(async () => {
    await db.prepare('INSERT INTO sample VALUES (?, ?)').run(`parallel-${i}`, i);
    await new Promise(resolve => setImmediate(resolve));
    await db.transaction(async () => {
      await db.prepare('UPDATE sample SET value = value + 1 WHERE id = ?').run(`parallel-${i}`);
    });
  })));
  const rows = await db.prepare("SELECT * FROM sample WHERE id LIKE 'parallel-%'").all();
  assert.equal(rows.length, 20);
  assert.equal(rows.reduce((sum, row) => sum + row.value, 0), 210);
});

test('rollback excludes unrelated writes and uncommitted reads', async () => {
  let entered;
  const started = new Promise(resolve => { entered = resolve; });
  let release;
  const hold = new Promise(resolve => { release = resolve; });
  const failing = db.transaction(async () => {
    await db.prepare('INSERT INTO sample VALUES (?, ?)').run('rollback', 99);
    entered();
    await hold;
    throw new Error('deliberate failure');
  });
  const rejected = assert.rejects(failing, /deliberate failure/);
  await started;
  const externalWrite = db.prepare('INSERT INTO sample VALUES (?, ?)').run('outside', 7);
  const externalRead = db.prepare('SELECT * FROM sample WHERE id = ?').get('rollback');
  release();
  await rejected;
  await externalWrite;
  assert.equal(await externalRead, null);
  assert.equal((await db.prepare('SELECT value FROM sample WHERE id = ?').get('outside')).value, 7);
});
