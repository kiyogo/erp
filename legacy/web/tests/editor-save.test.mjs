import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/components/editor/DocxEditorModal.tsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('DocxEditorModal.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let callback;
function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(file) === 'handleSave' && ts.isCallExpression(node.initializer) && node.initializer.expression.getText(file) === 'useCallback') callback = node.initializer.arguments[0];
  ts.forEachChild(node, visit);
}
visit(file);
assert.ok(callback && ts.isArrowFunction(callback), 'Find the actual editor save callback');
const actualCallback = ts.createPrinter().printNode(ts.EmitHint.Expression, callback, file);
const { outputText } = ts.transpileModule(`export function createSave(dependencies) { const { saveInFlightRef, getDocumentHtml, docName, fileKey, generateValidDocxBlob, saveFileBlob, localStorage, onSaveSuccess, notify } = dependencies; return ${actualCallback}; }`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { createSave } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function dependencies(patch = {}) {
  const messages = [], localWrites = [], generated = [];
  const values = {
    saveInFlightRef: { current: false }, docName: ' Actual Document ', fileKey: 'logical-document-key',
    getDocumentHtml: () => '<p>Actual Word contents</p>',
    generateValidDocxBlob: (html, name) => { generated.push({ html, name }); return new Blob([html], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }); },
    saveFileBlob: async (key, blob) => localWrites.push({ key, blob }),
    localStorage: { getItem: () => null, setItem: () => {} },
    notify: text => messages.push(text),
    ...patch,
  };
  return { values, messages, localWrites, generated };
}

test('editor save awaits remote persistence before success and prevents concurrent repeated writes', async () => {
  const pending = deferred();
  const remoteWrites = [];
  const fixture = dependencies({ onSaveSuccess: async (name, blob) => { remoteWrites.push({ name, blob }); await pending.promise; } });
  const save = createSave(fixture.values);
  const first = save();
  await tick();
  assert.equal(fixture.values.saveInFlightRef.current, true);
  assert.equal(fixture.localWrites.length, 1);
  assert.equal(remoteWrites.length, 1);
  assert.equal(remoteWrites[0].name, 'Actual Document.docx');
  assert.equal(await remoteWrites[0].blob.text(), '<p>Actual Word contents</p>');
  assert.equal(fixture.messages.length, 0, 'No success while server promise is unresolved');
  await save();
  assert.equal(fixture.generated.length, 1, 'Second click does not generate or write a second file');
  assert.equal(remoteWrites.length, 1);
  pending.resolve(); await first;
  assert.equal(fixture.values.saveInFlightRef.current, false);
  assert.equal(fixture.messages.length, 1);
  assert.match(fixture.messages[0], /thành công/);
});

test('editor reports rejected persistence without success, preserves draft and unlocks a successful retry', async () => {
  let attempts = 0;
  const fixture = dependencies({ onSaveSuccess: async () => { attempts++; if (attempts === 1) throw { response: { data: { message: 'Server refused document' } } }; } });
  const save = createSave(fixture.values);
  await save();
  assert.deepEqual(fixture.messages, ['Server refused document']);
  assert.equal(fixture.values.saveInFlightRef.current, false);
  assert.equal(await fixture.localWrites[0].blob.text(), '<p>Actual Word contents</p>', 'Local draft remains available for retry');
  await save();
  assert.equal(attempts, 2);
  assert.equal(fixture.messages.length, 2);
  assert.match(fixture.messages[1], /thành công/);
});

test('editor stops remote save after a rejected local draft write and always releases the lock', async () => {
  let remoteCalls = 0;
  const fixture = dependencies({ saveFileBlob: async () => { throw new Error('Draft storage unavailable'); }, onSaveSuccess: async () => { remoteCalls++; } });
  await createSave(fixture.values)();
  assert.equal(remoteCalls, 0);
  assert.deepEqual(fixture.messages, ['Draft storage unavailable']);
  assert.equal(fixture.values.saveInFlightRef.current, false);
});

const storageSource = readFileSync(new URL('../src/utils/fileStorage.ts', import.meta.url), 'utf8');
const storageJs = ts.transpileModule(storageSource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;

test('actual draft storage waits for IndexedDB commit and propagates transaction abort', async () => {
  const originalIndexedDb = globalThis.indexedDB;
  const transactions = [], requests = [];
  const database = { transaction: () => { const request = {}; const transaction = { objectStore: () => ({ put: (blob, key) => { request.blob = blob; request.key = key; return request; } }) }; transactions.push(transaction); requests.push(request); return transaction; } };
  const open = { result: database };
  globalThis.indexedDB = { open: () => open };
  try {
    const { saveFileBlob } = await import(`data:text/javascript;base64,${Buffer.from(storageJs).toString('base64')}#transaction`);
    const blob = new Blob(['draft before commit']);
    let completed = false;
    const saving = saveFileBlob('real-draft-key', blob).then(() => { completed = true; });
    open.onsuccess(); await tick();
    assert.equal(requests[0].key, 'real-draft-key');
    assert.equal(requests[0].blob, blob);
    requests[0].onsuccess?.(); await tick();
    assert.equal(completed, false, 'Request success is not a transaction commit');
    transactions[0].oncomplete(); await saving;
    assert.equal(completed, true);
    const second = saveFileBlob('aborted-draft', blob);
    const rejected = assert.rejects(second, /Giao dịch lưu tệp bị hủy/);
    await tick(); transactions[1].onabort(); await rejected;
  } finally { if (originalIndexedDb === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = originalIndexedDb; }
});

test('actual draft storage rejects IndexedDB open failure instead of allowing false save success', async () => {
  const originalIndexedDb = globalThis.indexedDB;
  const originalError = console.error;
  const open = { error: new Error('IndexedDB permission denied') };
  globalThis.indexedDB = { open: () => open };
  console.error = () => {};
  try {
    const { saveFileBlob } = await import(`data:text/javascript;base64,${Buffer.from(storageJs).toString('base64')}#open-failure`);
    const failed = assert.rejects(saveFileBlob('denied-draft', new Blob(['draft'])), /permission denied/);
    open.onerror(); await failed;
  } finally { console.error = originalError; if (originalIndexedDb === undefined) delete globalThis.indexedDB; else globalThis.indexedDB = originalIndexedDb; }
});
