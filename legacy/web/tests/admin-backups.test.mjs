import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/admin/AdminBackupModule.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } });
const imports = {
  react: 'globalThis.__adminBackupsTest.react', '@ant-design/icons': 'globalThis.__adminBackupsTest.icons',
  '../../components/KTable': 'globalThis.__adminBackupsTest.ui', '../../custom-ui': 'globalThis.__adminBackupsTest.ui',
  '../../api/axios': 'globalThis.__adminBackupsTest.api', '../../utils/fileExporter': 'globalThis.__adminBackupsTest.exporter',
  '../../utils/fileStorage': 'globalThis.__adminBackupsTest.storage',
};
const executable = outputText.replace(/import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, names, path) => {
  assert.ok(imports[path], `Unmocked import: ${path}`);
  return names.startsWith('React,') ? `const React = ${imports[path]}; const ${names.slice(6).trim()} = ${imports[path]};` : `const ${names} = ${imports[path]};`;
});

test('backup UI starts empty, uses physical backup API and never fabricates successful creation, restore or download', async () => {
  const state = []; let cursor = 0;
  const forms = []; let formCursor = 0;
  const effects = []; let effectCursor = 0;
  const dependencies = [];
  const messages = []; const requests = []; const downloads = []; const infoDialogs = [];
  let stored = []; let fail = false; let mismatch = false;
  const capabilities = { database: true, fullSystem: true, storageBlob: true, restore: false, autoDaily: false, engine: 'SQLite', maxArchiveBytes: 0xffffffff - 1, maxEntries: 65534 };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useEffect: (callback, deps) => { const index = effectCursor++; if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) { dependencies[index] = deps; effects.push(callback); } },
  };
  const ui = Object.fromEntries(['KTable', 'Button', 'Input', 'Select', 'Tag', 'Drawer', 'Card', 'Tooltip', 'Progress'].map(name => [name, name]));
  ui.Modal = Object.assign(function Modal() {}, { confirm: options => infoDialogs.push(options), info: options => infoDialogs.push(options) });
  ui.Form = Object.assign(function Form() {}, { Item: 'FormItem', useForm: () => { const index = formCursor++; forms[index] ||= { values: {}, resetFields() { this.values = {}; }, setFieldsValue(values) { this.values = { ...this.values, ...values }; } }; return [forms[index]]; } });
  ui.message = Object.fromEntries(['success', 'warning', 'info', 'error'].map(level => [level, text => messages.push({ level, text })]));
  globalThis.__adminBackupsTest = {
    react, ui, icons: new Proxy({}, { get: (_, name) => String(name) }),
    storage: { formatFileSize: bytes => `${bytes} bytes` },
    exporter: { downloadFile: (filename, content) => downloads.push({ filename, content }) },
    api: {
      get: async (route, options) => {
        requests.push({ method: 'GET', route, options });
        if (route === '/admin/backups') return { data: { data: structuredClone(stored), capabilities } };
        if (route.endsWith('/download')) {
          if (fail || mismatch) throw { response: { data: new Blob([JSON.stringify({ message: 'Archive integrity check failed' })], { type: 'application/json' }) } };
          return { data: new Blob([Uint8Array.from([0x50, 0x4b, 3, 4, 1, 2, 3])], { type: 'application/zip' }) };
        }
        throw new Error(`Unexpected route ${route}`);
      },
      post: async (route, payload, options) => {
        requests.push({ method: 'POST', route, payload, options });
        if (fail) throw new Error('Actual backup creation failed');
        if (route === '/admin/backups') {
          const backup = { key: 'backup-real', code: 'SNAP-REAL', name: payload.name, type: payload.type, sizeBytes: 1024, size: '1 KB', creator: 'Actual Administrator', createdAt: '2026-10-26T01:02:03Z', location: 'Local server backup store', checksumSha256: 'a'.repeat(64), rtoEstimated: 'Chưa đo kiểm khôi phục', status: 'Đã xác minh SHA-256', available: true, restorable: false, verifiedAt: '2026-10-26T01:02:04Z' };
          stored = [backup]; return { data: { backup } };
        }
        if (route.endsWith('/verify')) {
          stored = stored.map(item => ({ ...item, status: mismatch ? 'Không khớp SHA-256' : 'Đã xác minh SHA-256', actualChecksumSha256: (mismatch ? 'b' : 'a').repeat(64) }));
          return { data: { backup: stored[0] } };
        }
        throw new Error(`Unexpected route ${route}`);
      },
    },
  };
  const { AdminBackupModule } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#component`);
  let tree;
  const render = () => { cursor = 0; formCursor = 0; effectCursor = 0; tree = AdminBackupModule(); effects.splice(0).forEach(callback => callback()); };
  const nodes = (node = tree) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(child => child ? nodes(child) : [])];
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props?.children?.flat(Infinity).map(text).join('') || '';
  const button = label => nodes().find(node => node.type === 'Button' && text(node) === label);
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const table = () => nodes().find(node => node.type === 'KTable');
  const actions = record => nodes(table().props.columns.find(column => column.key === 'actions').render(null, record));
  try {
    render(); await tick(); render();
    assert.equal(table().props.dataSource.length, 0);
    assert.equal(requests.filter(item => item.method === 'POST').length, 0, 'opening the screen must not seed fictional backup rows');
    button('Tạo Snapshot thủ công').props.onClick(); render();
    const form = () => nodes().find(node => node.type === ui.Form);
    fail = true;
    await form().props.onFinish({ name: 'Real backup', type: 'Full System' }); render();
    assert.equal(table().props.dataSource.length, 0);
    assert.equal(messages.filter(item => item.level === 'success').length, 0);
    fail = false;
    await form().props.onFinish({ name: 'Real backup', type: 'Full System' }); render();
    assert.equal(table().props.dataSource.length, 1);
    const record = table().props.dataSource[0];
    assert.equal(record.creator, 'Actual Administrator');
    assert.equal(requests.find(item => item.method === 'POST').options.timeout, 0);
    actions(record).find(node => node.type === 'Button' && text(node) === 'Khôi phục').props.onClick(); render();
    assert.ok(infoDialogs[0].content.includes('chưa hỗ trợ khôi phục tự động'));
    assert.ok(!requests.some(item => item.route.endsWith('/restore')));
    assert.ok(!messages.some(item => item.level === 'success' && item.text.includes('khôi phục')));
    fail = true;
    actions(record).find(node => node.type === 'Button' && text(node) === 'Tải tệp').props.onClick(); await tick(); render();
    assert.equal(downloads.length, 0);
    assert.ok(messages.some(item => item.level === 'error' && item.text === 'Archive integrity check failed'));
    fail = false;
    actions(record).find(node => node.type === 'Button' && text(node) === 'Tải tệp').props.onClick(); await tick(); render();
    assert.equal(downloads[0].filename, 'SNAP-REAL.zip');
    assert.equal(downloads[0].content.type, 'application/zip');
    assert.equal(requests.find(item => item.route.endsWith('/download')).options.responseType, 'blob');
    actions(record).find(node => node.type === 'Button' && text(node) === 'Hồ sơ').props.onClick(); render();
    mismatch = true;
    button('Xác minh SHA-256 lại').props.onClick(); await tick(); render();
    assert.equal(table().props.dataSource[0].status, 'Không khớp SHA-256');
    assert.ok(messages.some(item => item.level === 'error' && item.text.includes('không khớp')));
    capabilities.database = false; capabilities.fullSystem = false; capabilities.engine = 'PostgreSQL'; capabilities.reason = 'No PostgreSQL dump configured';
    button('Làm mới').props.onClick(); await tick(); render();
    button('Tạo Snapshot thủ công').props.onClick(); render();
    assert.equal(forms[0].values.type, 'Storage Blob');
    const before = requests.filter(item => item.method === 'POST').length;
    await form().props.onFinish({ name: 'Unsupported DB backup', type: 'Database' }); render();
    assert.equal(requests.filter(item => item.method === 'POST').length, before);
  } finally { delete globalThis.__adminBackupsTest; }
});
