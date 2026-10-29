import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/documents/DocumentsModule.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } });
const imports = { react: 'react', '@ant-design/icons': 'icons', 'react-router-dom': 'router', '../../components/KTable': 'ui', '../../custom-ui': 'ui', '../../api/endpoints': 'api', '../../services/dataService': 'services', '../../utils/fileExporter': 'exporter', '../../utils/fileStorage': 'storage', '../../components/editor/DocxEditorModal': 'editor' };
const executable = outputText.replace(/import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, names, path) => {
  assert.ok(imports[path], `Unexpected import ${path}`);
  const target = `globalThis.__enterpriseDocTest.${imports[path]}`;
  return names.startsWith('React,') ? `const React = ${target}; const ${names.slice(6).trim()} = ${target};` : `const ${names} = ${target};`;
});
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const metadata = { docCode: 'VB-NEW', title: 'Actual new document', docCategory: 'Công văn điều hành', direction: 'Nội bộ ban hành', issuingAuthority: 'Actual Office', signerName: 'Declared Signer', signerPosition: 'Director', issuedDate: '2026-10-25', effectiveDate: '2026-10-26', expirationDate: '', securityLevel: 'Nội bộ công ty', storageLocation: 'Actual Cabinet', tags: 'Actual, Original', summary: 'Actual document summary', status: 'Mới ban hành' };

async function setup(name) {
  const states = [], forms = [], effects = [], effectDependencies = [];
  const messages = [], writes = [], downloads = [], uploads = [], removed = [], cacheWrites = [], fetchedFiles = [], events = [];
  const files = new Map([['remote-word', { id: 'remote-word', name: 'remote-original.docx', blob: new Blob(['PK\x03\x04remote-word-bytes']) }]]);
  const listeners = new Set();
  const base = { ...metadata, fileFormat: '', fileName: '', fileSize: '', caSigned: false, sha256Hash: '', tags: [], expirationDate: 'Vĩnh viễn' };
  let records = [{ ...base, key: 'empty-logical', id: 'empty-physical', docCode: 'VB-EMPTY', title: 'Metadata only' }, { ...base, key: 'remote-logical', id: 'remote-physical', docCode: 'VB-REMOTE', title: 'Remote Word record', wordFileNodeId: 'remote-word', wordFileName: 'remote-original.docx' }];
  let cursor = 0, formCursor = 0, effectCursor = 0, failSave = false, saveGate = null, cacheGate = null;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    lazy: () => 'DocxEditorModal',
    useState: initial => { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useEffect: (fn, dependencies) => { const index = effectCursor++; if (!effectDependencies[index] || dependencies.some((value, i) => value !== effectDependencies[index][i])) { effectDependencies[index] = dependencies; effects.push(fn); } },
  };
  const ui = Object.fromEntries(['KTable', 'Select', 'Button', 'Tag', 'Drawer'].map(name => [name, name]));
  ui.Input = Object.assign(function Input() {}, { TextArea: 'TextArea' }); ui.Radio = {};
  ui.Modal = Object.assign(function Modal() {}, { confirm: options => options.onOk() });
  ui.Form = Object.assign(function Form() {}, { Item: 'FormItem', useForm: () => { const index = formCursor++; forms[index] ||= { values: {}, resetFields() { this.values = {}; }, setFieldsValue(values) { this.values = { ...this.values, ...values }; } }; return [forms[index]]; } });
  ui.message = Object.fromEntries(['success', 'error', 'info', 'warning'].map(level => [level, text => { messages.push({ level, text }); events.push(`message:${level}`); }]));
  const save = async (scope, key, record, method) => {
    assert.equal(scope, 'enterprise_documents'); events.push(`api:${method}:start`);
    if (saveGate) await saveGate.promise;
    if (failSave) throw new Error('record persistence failed');
    const previous = records.find(item => item.key === key);
    const stored = { ...previous, ...record, id: previous?.id || `physical-${records.length}`, createdBy: 'Actual Server Actor', caSigned: false };
    if (stored.fileNodeId) { const file = files.get(stored.fileNodeId); stored.fileName = file.name; stored.fileSizeBytes = file.blob.size; stored.fileFormat = file.name.split('.').at(-1).toUpperCase(); }
    else { stored.fileName = ''; stored.fileSizeBytes = 0; }
    if (stored.wordFileNodeId) stored.wordFileName = files.get(stored.wordFileNodeId).name;
    writes.push({ method, scope, key, record: structuredClone(stored) }); records = [stored, ...records.filter(item => item.key !== stored.key)]; events.push(`api:${method}:committed`);
    return { data: { record: stored } };
  };
  globalThis.__enterpriseDocTest = {
    react, ui, icons: new Proxy({}, { get: (_, key) => String(key) }), router: { useLocation: () => ({ pathname: '/admin/documents' }) }, editor: { DocxEditorModal: 'DocxEditorModal' },
    storage: { saveFileBlob: async (key, blob) => { cacheWrites.push({ key, blob }); if (cacheGate) await cacheGate.promise; } },
    services: { dataService: { getGenericData: () => records, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, refreshGenericData: async () => { for (const listener of listeners) listener(); return records; } } },
    api: {
      filesApi: {
        list: async (...args) => { assert.deepEqual(args, [null, false, true]); return { data: { context: { parentId: 'authorized-workspace' } } }; },
        upload: async (blob, name, parentId, origin) => { assert.ok(blob instanceof Blob); assert.equal(parentId, 'authorized-workspace'); assert.equal(origin, 'enterprise_documents'); const id = `uploaded-${uploads.length + 1}`; const file = { id, name, sizeBytes: blob.size }; uploads.push({ blob, name, ...file }); files.set(id, { ...file, blob }); return { data: { file } }; },
        download: async id => { fetchedFiles.push(id); assert.ok(files.has(id), 'Only download persisted file bytes'); return { data: files.get(id).blob }; },
        remove: async id => { removed.push(id); files.delete(id); },
      },
      collectionsApi: { create: (scope, record) => save(scope, record.key, record, 'create'), update: (scope, key, patch) => save(scope, key, patch, 'update'), remove: async (_, key) => { records = records.filter(item => item.key !== key); } },
    },
    exporter: { downloadFile: (name, content) => { assert.ok(content instanceof Blob, 'Original downloads cannot use generic generated content'); downloads.push({ name, content }); }, generateValidPdfBlob: (title, subtitle, lines) => new Blob([JSON.stringify({ title, subtitle, lines })]), generateValidXlsxBlob: rows => new Blob([JSON.stringify(rows)]) },
  };
  const { DocumentsModule } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#${name}`);
  let tree;
  const render = () => { cursor = 0; formCursor = 0; effectCursor = 0; tree = DocumentsModule(); for (const effect of effects.splice(0)) effect(); return tree; };
  const nodes = (node = tree) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(child => child ? nodes(child) : [])];
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props?.children?.flat(Infinity).map(text).join('') || '';
  const button = label => nodes().find(node => node.type === 'Button' && text(node).includes(label));
  const table = () => nodes().find(node => node.type === 'KTable');
  const action = (record, label) => nodes(table().props.columns.find(column => column.key === 'actions').render(null, record)).find(node => node.type === 'Button' && (text(node).includes(label) || node.props.title === label));
  const form = () => nodes().find(node => node.type === ui.Form);
  render(); await tick(); render();
  return { render, nodes, button, table, action, form, records: () => records, editor: () => nodes().find(node => node.type === 'DocxEditorModal'), messages, writes, downloads, uploads, removed, files, cacheWrites, fetchedFiles, events, forms, setFailSave: value => { failSave = value; }, setSaveGate: value => { saveGate = value; }, setCacheGate: value => { cacheGate = value; } };
}

test('document metadata saves only after server confirmation, preserves original upload on retry and exports filtered actual records', async () => {
  const fixture = await setup('metadata');
  try {
    const missing = fixture.records().find(record => record.key === 'empty-logical');
    await fixture.action(missing, 'Tải tệp gốc').props.onClick();
    assert.equal(fixture.downloads.length, 0); assert.equal(fixture.messages.at(-1).level, 'warning');
    fixture.button('Ban hành văn bản').props.onClick(); fixture.render();
    fixture.nodes().find(node => node.type === 'input' && node.props.type === 'file').props.onChange({ target: { files: [new File(['actual-original-bytes'], 'actual-original.pdf', { type: 'application/pdf' })] } }); fixture.render();
    fixture.setFailSave(true);
    await fixture.form().props.onFinish(metadata); fixture.render();
    assert.equal(fixture.uploads.length, 1); assert.equal(fixture.writes.length, 0); assert.equal(fixture.messages.at(-1).level, 'error');
    assert.equal(fixture.messages.filter(item => item.level === 'success').length, 0);
    fixture.setFailSave(false); const pending = deferred(); fixture.setSaveGate(pending);
    const saving = fixture.form().props.onFinish(metadata); await tick(); fixture.render();
    assert.equal(fixture.messages.filter(item => item.level === 'success').length, 0);
    assert.equal(fixture.records().some(record => record.docCode === 'VB-NEW'), false);
    pending.resolve(); await saving; fixture.setSaveGate(null); fixture.render();
    assert.equal(fixture.uploads.length, 1, 'Retry reuses the successfully uploaded original');
    const created = fixture.records().find(record => record.docCode === 'VB-NEW');
    assert.equal(created.createdBy, 'Actual Server Actor'); assert.equal(created.fileNodeId, 'uploaded-1'); assert.equal(created.caSigned, false);
    assert.ok(fixture.events.indexOf('api:create:committed') < fixture.events.indexOf('message:success'));
    fixture.action(created, 'Xem').props.onClick(); fixture.render();
    await fixture.button('Tải tệp gốc / Word').props.onClick(); assert.equal(await fixture.downloads.at(-1).content.text(), 'actual-original-bytes');
    fixture.button('Sửa hồ sơ').props.onClick(); fixture.render();
    const gate = deferred(); fixture.setSaveGate(gate); const previousSuccess = fixture.messages.filter(item => item.level === 'success').length;
    const updating = fixture.form().props.onFinish({ ...fixture.forms[0].values, title: 'Updated actual document' }); await tick();
    assert.equal(fixture.messages.filter(item => item.level === 'success').length, previousSuccess);
    gate.resolve(); await updating; fixture.setSaveGate(null); fixture.render();
    assert.equal(fixture.writes.at(-1).key, created.key); assert.notEqual(fixture.writes.at(-1).key, created.id);
    assert.equal(fixture.records().find(record => record.key === created.key).fileNodeId, created.fileNodeId);
    const search = fixture.nodes().find(node => node.props?.placeholder === 'Tìm theo số hiệu, trích yếu, người ký...');
    search.props.onChange({ target: { value: 'Updated actual' } }); fixture.render(); fixture.button('Xuất Excel').props.onClick();
    const rows = JSON.parse(await fixture.downloads.at(-1).content.text());
    assert.equal(rows.length, 2); assert.equal(rows[1][0], 'VB-NEW'); assert.equal(rows[1][1], 'Updated actual document'); assert.equal(rows[1][11], 'actual-original.pdf');
    fixture.button('In Phiếu Văn Thư').props.onClick(); assert.match(await fixture.downloads.at(-1).content.text(), /Updated actual document/);
  } finally { delete globalThis.__enterpriseDocTest; }
});

test('document Word editor loads persisted bytes before opening and saves true blobs with cleanup after record failure', async () => {
  const fixture = await setup('word');
  try {
    const remote = fixture.records().find(record => record.key === 'remote-logical');
    const cache = deferred(); fixture.setCacheGate(cache);
    const opening = fixture.action(remote, 'Soạn Word').props.onClick(); await tick(); fixture.render();
    assert.deepEqual(fixture.fetchedFiles, ['remote-word']); assert.equal(fixture.cacheWrites[0].key, remote.key); assert.equal(await fixture.cacheWrites[0].blob.text(), 'PK\x03\x04remote-word-bytes');
    assert.equal(fixture.editor(), undefined, 'Editor does not open before remote content reaches draft storage');
    cache.resolve(); await opening; fixture.setCacheGate(null); fixture.render();
    assert.equal(fixture.editor().props.fileKey, remote.key);
    const word = new Blob(['PK\x03\x04actual-edited-word'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    await assert.rejects(fixture.editor().props.onSaveSuccess('missing.docx'), /Chưa tạo/);
    await fixture.editor().props.onSaveSuccess('edited.docx', word); fixture.render();
    assert.equal(fixture.uploads[0].blob, word); assert.equal(fixture.writes.at(-1).method, 'update'); assert.equal(fixture.writes.at(-1).key, remote.key);
    const savedWordId = fixture.records().find(record => record.key === remote.key).wordFileNodeId;
    assert.equal(savedWordId, fixture.uploads[0].id);
    fixture.setFailSave(true); const failedWord = new Blob(['PK\x03\x04unsaved-word']);
    await assert.rejects(fixture.editor().props.onSaveSuccess('failed.docx', failedWord), /record persistence failed/); fixture.render();
    assert.deepEqual(fixture.removed, [fixture.uploads.at(-1).id]); assert.ok(fixture.files.has(savedWordId)); assert.ok(fixture.files.has('remote-word'));
    assert.equal(fixture.records().find(record => record.key === remote.key).wordFileNodeId, savedWordId);
    fixture.setFailSave(false); fixture.editor().props.onClose(); fixture.render();
    fixture.button('Soạn Word (.docx)').props.onClick(); fixture.render();
    await fixture.editor().props.onSaveSuccess('new-draft.docx', word); fixture.render();
    assert.equal(fixture.writes.at(-1).method, 'create'); assert.equal(fixture.writes.at(-1).record.caSigned, false); assert.equal(fixture.writes.at(-1).record.status, 'Dự thảo thẩm định');
  } finally { delete globalThis.__enterpriseDocTest; }
});
