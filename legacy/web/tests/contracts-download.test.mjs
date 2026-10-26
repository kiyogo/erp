import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const text = readFileSync(new URL('../src/modules/hr/ContractsModule.tsx', import.meta.url), 'utf8');
const source = ts.createSourceFile('contracts.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleDownloadContract') handler = node.initializer.getText(source); ts.forEachChild(node, visit); };
visit(source);
assert.ok(handler);
const compiled = ts.transpile(`const download = ${handler}; download;`, { target: ts.ScriptTarget.ES2022 });

test('contract download uses authoritative Word bytes, resolves stale file ids and reports errors without fake fallback', async () => {
  const downloads = [], requests = [], messages = [];
  const bytes = new Blob(['PK actual Word fixture']);
  let fail = false, missing = false;
  const download = runInNewContext(compiled, {
    contractsApi: { getOne: async id => { requests.push({ type: 'metadata', id }); return { data: { contract: { fileNodeId: missing ? null : 'current-file' } } }; } },
    filesApi: { download: async id => { if (fail) throw new Error('offline'); requests.push({ type: 'file', id }); return { data: bytes }; } },
    downloadFile: (name, content) => { assert.ok(content instanceof Blob); downloads.push({ name, content }); },
    message: Object.fromEntries(['error', 'warning', 'success'].map(level => [level, message => messages.push({ level, message })])),
  });
  await download({ id: 'contract-id', code: 'HD/1', fileNodeId: 'saved-file' });
  assert.deepEqual(requests, [{ type: 'file', id: 'saved-file' }]);
  assert.equal(downloads[0].name, 'HD_1.docx'); assert.equal(downloads[0].content, bytes);
  await download({ key: 'logical-id', code: 'HD-2' });
  assert.deepEqual(requests.slice(1), [{ type: 'metadata', id: 'logical-id' }, { type: 'file', id: 'current-file' }]);
  fail = true; await download({ code: 'HD-3', fileNodeId: 'saved-file' });
  assert.equal(downloads.length, 2); assert.equal(messages.at(-1).level, 'error');
  fail = false; missing = true; await download({ key: 'missing', code: 'HD-4' });
  assert.equal(downloads.length, 2); assert.equal(messages.at(-1).level, 'warning');
  assert.ok(!messages.some(item => item.level === 'success'));
});
