import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/documents/DocumentArchivesModule.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } });
const imports = { react: 'react', '@ant-design/icons': 'icons', '../../components/KTable': 'ui', '../../custom-ui': 'ui', '../../api/endpoints': 'api', '../../services/dataService': 'services', '../../utils/fileExporter': 'exporter', '../../utils/fileStorage': 'storage' };
const executable = outputText.replace(/import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, names, path) => {
  assert.ok(imports[path], `Unexpected import ${path}`);
  const target = `globalThis.__archiveTest.${imports[path]}`;
  return names.startsWith('React,') ? `const React = ${target}; const ${names.slice(6).trim()} = ${target};` : `const ${names} = ${target};`;
});

test('archive form preserves uploaded scans after record errors, downloads original bytes, exports real data and persists processing', async () => {
  const states = [], forms = [], effects = [], effectDependencies = [];
  const messages = [], writes = [], downloads = [], uploads = [], confirms = [];
  const listeners = new Set();
  let cursor = 0, formCursor = 0, effectCursor = 0, records = [], failSave = false, failUpload = false, copied = '';
  const bytes = new Blob(['actual-scan-bytes'], { type: 'application/pdf' });
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useEffect: (fn, dependencies) => { const index = effectCursor++; if (!effectDependencies[index] || dependencies.some((value, i) => value !== effectDependencies[index][i])) { effectDependencies[index] = dependencies; effects.push(fn); } },
  };
  const ui = Object.fromEntries(['KTable', 'Select', 'Button', 'Tag', 'Drawer', 'Card', 'Tooltip'].map(name => [name, name]));
  ui.Input = Object.assign(function Input() {}, { TextArea: 'TextArea' });
  ui.Radio = {};
  ui.Modal = Object.assign(function Modal() {}, { confirm: options => { confirms.push(options); return options.onOk(); } });
  ui.Form = Object.assign(function Form() {}, { Item: 'FormItem', useForm: () => { const index = formCursor++; forms[index] ||= { values: {}, resetFields() { this.values = {}; }, setFieldsValue(values) { this.values = { ...this.values, ...values }; } }; return [forms[index]]; } });
  ui.message = Object.fromEntries(['success', 'error', 'info', 'warning'].map(level => [level, text => messages.push({ level, text })]));
  globalThis.__archiveTest = {
    react, ui, icons: new Proxy({}, { get: (_, key) => String(key) }),
    storage: { formatFileSize: value => `${value} B` },
    services: { dataService: { getGenericData: () => records, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); }, refreshGenericData: async () => { for (const listener of listeners) listener(); return records; } } },
    api: {
      filesApi: {
        list: async (...args) => { assert.deepEqual(args, [undefined, false, true]); return { data: { context: { parentId: 'authorized-own-workspace' } } }; },
        upload: async (file, name, parentId, scope) => { if (failUpload) throw new Error('upload failed'); uploads.push({ file, name, parentId, scope }); assert.equal(parentId, 'authorized-own-workspace'); assert.equal(scope, 'doc_archives'); return { data: { file: { id: 'stored-original', name: 'server-original.pdf', sizeBytes: file.size } } }; },
        download: async id => { assert.equal(id, 'stored-original'); return { data: bytes }; },
      },
      collectionsApi: {
        create: async (scope, record) => { if (failSave) throw new Error('record failed'); const stored = { ...record, id: `physical-${records.length}`, bookNumber: `000${records.length + 1}/2026`, digitalVerified: false }; writes.push({ scope, record: structuredClone(stored) }); records = [stored, ...records]; return { data: { record: stored } }; },
        update: async (scope, key, patch) => { const stored = { ...records.find(item => item.key === key), ...patch }; writes.push({ scope, key, patch }); records = records.map(item => item.key === key ? stored : item); return { data: { record: stored } }; },
        remove: async (_, key) => { records = records.filter(item => item.key !== key); },
      },
    },
    exporter: { downloadFile: (name, content) => { assert.ok(content instanceof Blob, 'No generic/fabricated download fallback'); downloads.push({ name, content }); }, generateValidPdfBlob: (title, subtitle, lines) => new Blob([JSON.stringify({ title, subtitle, lines })]), generateValidXlsxBlob: rows => new Blob([JSON.stringify(rows)]) },
  };
  const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText: async value => { copied = value; } } } });
  const { DocumentArchivesModule } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#component`);
  let tree;
  const render = () => { cursor = 0; formCursor = 0; effectCursor = 0; tree = DocumentArchivesModule(); for (const effect of effects.splice(0)) effect(); return tree; };
  const nodes = (node = tree) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(child => child ? nodes(child) : [])];
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props?.children?.flat(Infinity).map(text).join('') || '';
  const button = label => nodes().find(node => node.type === 'Button' && text(node).includes(label));
  const form = () => nodes().find(node => node.type === ui.Form && node.props.form === forms[1]);
  const table = () => nodes().find(node => node.type === 'KTable');
  const openRecord = record => { const actions = table().props.columns.find(column => column.key === 'actions').render(null, record); nodes(actions).find(node => node.type === 'Button' && text(node).includes('Trích lục')).props.onClick(); render(); };
  const values = { dispatchType: 'Văn bản đến', bookNumber: '', docType: 'Công văn', originalCode: 'CV-1', partner: 'Actual Office', subject: 'Actual document subject', signer: 'Actual Signer', signerPosition: 'Director', receiverOrAuthor: 'Actual Clerk', docDate: '2026-10-25', dateReceivedOrIssued: '2026-10-26', urgency: 'Bình thường', securityLevel: 'Nội bộ', slaDeadline: '2026-11-02' };
  try {
    render(); await new Promise(resolve => setImmediate(resolve)); render();
    button('Vào sổ văn thư').props.onClick(); render();
    await form().props.onFinish({ ...values, docDate: '2026-02-30' }); render();
    assert.equal(writes.length, 0); assert.equal(messages.at(-1).level, 'error');
    await form().props.onFinish(values); render();
    assert.equal(records[0].fileScan, ''); assert.equal(records[0].digitalVerified, false); assert.equal(records[0].status, 'Đang xử lý đúng hạn');
    const missing = records[0];
    openRecord(missing); await button('Tải tệp gốc').props.onClick(); assert.equal(downloads.length, 0); assert.equal(messages.at(-1).level, 'info');
    button('Vào sổ văn thư').props.onClick(); render();
    const input = () => nodes().find(node => node.type === ui.Input && node.props.type === 'file');
    input().props.onChange({ target: { files: [new File(['actual-scan-bytes'], 'original.pdf', { type: 'application/pdf' })] } }); render();
    failUpload = true; await form().props.onFinish({ ...values, originalCode: 'CV-2' }); render();
    assert.equal(writes.length, 1); assert.equal(messages.at(-1).level, 'error');
    failUpload = false; failSave = true;
    const successCount = messages.filter(item => item.level === 'success').length;
    await form().props.onFinish({ ...values, originalCode: 'CV-2' }); render();
    assert.equal(uploads.length, 1); assert.equal(writes.length, 1); assert.equal(messages.filter(item => item.level === 'success').length, successCount);
    failSave = false; await form().props.onFinish({ ...values, originalCode: 'CV-2' }); render();
    assert.equal(uploads.length, 1, 'Retry record save reuses uploaded original');
    const actual = records[0]; assert.equal(actual.fileNodeId, 'stored-original'); assert.equal(actual.fileScan, 'server-original.pdf'); assert.equal(actual.fileSizeBytes, bytes.size);
    openRecord(actual); await button('Tải tệp gốc').props.onClick(); assert.equal(await downloads.at(-1).content.text(), 'actual-scan-bytes');
    button('In Phiếu Trích Lục').props.onClick(); assert.match(await downloads.at(-1).content.text(), /Actual document subject/);
    button('Xuất Sổ').props.onClick(); assert.match(await downloads.at(-1).content.text(), /CV-2/); assert.match(await downloads.at(-1).content.text(), /server-original.pdf/);
    await button('Sao chép trích yếu').props.onClick(); assert.match(copied, /CV-2/);
    button('Chuyển Tiếp Xử Lý').props.onClick(); render();
    const forwarding = nodes().find(node => node.type === ui.Form && node.props.form === forms[0]);
    await forwarding.props.onFinish({ receiverOrAuthor: 'Next Clerk', forwardNote: 'Process actual original' }); render();
    assert.equal(records[0].receiverOrAuthor, 'Next Clerk'); assert.equal(writes.at(-1).key, actual.key, 'Uses logical archive key, not physical DB id');
    await button('Hoàn tất xử lý').props.onClick(); render(); assert.equal(records[0].status, 'Đã giải quyết xong');
    await button('Xóa hồ sơ').props.onClick(); render(); assert.equal(records.some(item => item.key === actual.key), false); assert.equal(confirms.length, 2);
  } finally {
    if (originalNavigator) Object.defineProperty(globalThis, 'navigator', originalNavigator); else delete globalThis.navigator;
    delete globalThis.__archiveTest;
  }
});
