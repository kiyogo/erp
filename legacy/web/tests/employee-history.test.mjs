import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/hr/EmployeeHistoryModule.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } });
const imports = {
  react: 'globalThis.__historyTest.react', '@ant-design/icons': 'globalThis.__historyTest.icons',
  '../../components/KTable': 'globalThis.__historyTest.ui', '../../custom-ui': 'globalThis.__historyTest.ui',
  '../../api/endpoints': 'globalThis.__historyTest.api', '../../services/dataService': 'globalThis.__historyTest.services', '../../utils/fileExporter': 'globalThis.__historyTest.exporter',
};
const executable = outputText.replace(/import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, names, path) => {
  assert.ok(imports[path], `Unmocked import: ${path}`);
  return names.startsWith('React,') ? `const React = ${imports[path]}; const ${names.slice(6).trim()} = ${imports[path]};` : `const ${names} = ${imports[path]};`;
});

test('employee history validates real identities and dates and filters all record details', async () => {
  globalThis.__historyTest = { react: {}, icons: {}, ui: {}, api: {}, services: {}, exporter: {} };
  const { validateEmployeeHistory: validate, filterEmployeeHistory: filter } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#logic`);
  const record = { key: 'history-1', code: 'LS-1', employeeId: 'employee-1', employeeCode: 'NV-1', employeeName: 'Người thật', type: 'Chức vụ', eventDate: '2026-10-25', oldValue: 'Engineer', newValue: 'Lead', decisionNumber: '', signer: 'Actual Signer', note: 'Nội dung quyết định' };
  assert.equal(validate(record), '');
  assert.match(validate({ ...record, employeeId: '' }), /chọn nhân viên/);
  assert.match(validate({ ...record, type: 'Ngân hàng' }), /Loại biến động/);
  assert.match(validate({ ...record, eventDate: '2026-02-30' }), /Ngày hiệu lực/);
  assert.match(validate({ ...record, newValue: ' ' }), /giá trị mới/);
  assert.equal(filter([record], 'all', ' actual signer ').length, 1);
  assert.equal(filter([record], 'all', 'nội dung').length, 1);
  assert.equal(filter([record], 'Thuyên chuyển', '').length, 0);
  assert.equal(filter([record], 'Chức vụ', 'NV-1').length, 1);
  delete globalThis.__historyTest;
});

test('history CRUD persists before UI success, includes former employees, exports current filter and preserves other views', async () => {
  const state = [];
  let cursor = 0;
  const forms = [];
  let formCursor = 0;
  const effects = [];
  let effectCursor = 0;
  const deps = [];
  const messages = [];
  const requests = [];
  const downloads = [];
  let confirm;
  let fail = false;
  let stored = [{ key: 'history-logical', id: 'physical-row', code: 'LS-SAVED', employeeId: 'employee-1', employeeName: 'Existing Employee', employeeCode: 'NV-1', type: 'Chức vụ', eventDate: '2026-10-01', oldValue: '', newValue: 'Engineer', decisionNumber: '', signer: '', note: '' }];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useEffect: (callback, dependencies) => { const index = effectCursor++; if (!deps[index] || dependencies.some((value, i) => value !== deps[index][i])) { deps[index] = dependencies; effects.push(callback); } },
  };
  const ui = Object.fromEntries(['KTable', 'Select', 'Button', 'Tag', 'Checkbox'].map(name => [name, name]));
  ui.Input = Object.assign(function Input() {}, { TextArea: 'TextArea' });
  ui.Modal = Object.assign(function Modal() {}, { confirm: options => { confirm = options; } });
  ui.Form = Object.assign(function Form() {}, { Item: 'FormItem', useForm: () => { const index = formCursor++; forms[index] ||= { values: {}, resetFields() { this.values = {}; }, setFieldsValue(values) { this.values = { ...this.values, ...values }; } }; return [forms[index]]; } });
  ui.message = Object.fromEntries(['success', 'warning', 'info', 'error'].map(level => [level, text => messages.push({ level, text })]));
  const icons = new Proxy({}, { get: (_, name) => String(name) });
  const bank = { id: 'bank-1', employeeCode: 'NV-1', employeeName: 'Existing Employee', bankName: 'Actual Bank', accountNumber: '001', status: 'Đã duyệt' };
  const staff = [{ id: 'employee-1', name: 'Existing Employee', employeeCode: 'NV-1', role: 'USER', status: 'Chính thức' }, { id: 'former-employee', name: 'Former Employee', employeeCode: 'NV-OLD', role: 'USER', status: 'Đã nghỉ việc' }];
  globalThis.__historyTest = {
    react, ui, icons,
    services: { dataService: { getEmployees: () => [], getEmployeeBankAccounts: () => [bank], getDropdownOptions: () => [], refreshGenericData: async scope => { requests.push({ action: 'read', scope }); if (fail) throw new Error('offline'); return structuredClone(stored); } } },
    api: {
      employeesApi: { getAll: async () => ({ data: { data: staff } }) },
      collectionsApi: {
        create: async (scope, record) => { if (fail) throw new Error('offline'); requests.push({ action: 'create', scope, record: structuredClone(record) }); stored = [record, ...stored]; return { data: { record } }; },
        update: async (scope, key, record) => { if (fail) throw new Error('offline'); requests.push({ action: 'update', scope, key, record: structuredClone(record) }); stored = stored.map(item => item.key === key ? record : item); return { data: { record } }; },
        remove: async (scope, key) => { if (fail) throw new Error('offline'); requests.push({ action: 'remove', scope, key }); stored = stored.filter(item => item.key !== key); return { data: { deleted: true } }; },
      },
    },
    exporter: { generateValidXlsxBlob: rows => new Blob([JSON.stringify(rows)]), downloadFile: (filename, content) => downloads.push({ filename, content }) },
  };
  const originalStorage = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  const { EmployeeHistoryModule } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#component`);
  let tree;
  let props = { defaultType: 'all' };
  const render = () => { cursor = 0; formCursor = 0; effectCursor = 0; tree = EmployeeHistoryModule(props); effects.splice(0).forEach(callback => callback()); };
  const nodes = (node = tree) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(child => child ? nodes(child) : [])];
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props?.children?.flat(Infinity).map(text).join('') || '';
  const button = label => nodes().find(node => node.type === 'Button' && text(node).includes(label));
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const table = () => nodes().find(node => node.type === 'KTable');
  const historyForm = () => nodes().find(node => node.type === ui.Form);
  const actions = record => nodes(table().props.columns.find(column => column.key === 'actions').render(null, record));
  try {
    render(); await tick(); render();
    assert.equal(table().props.dataSource[0].key, 'history-logical');
    button('Ghi nhận biến động mới').props.onClick(); render();
    const employeeField = nodes().find(node => node.type === 'FormItem' && node.props.name === 'employeeId');
    assert.ok(employeeField.props.children[0].props.options.some(item => item.value === 'former-employee'));
    const values = { employeeId: 'former-employee', employeeName: 'Forged Name', employeeCode: 'FORGED', type: 'Nghỉ việc', eventDate: '2026-10-25', newValue: 'Nghỉ theo quyết định đã ban hành' };
    fail = true;
    const before = messages.filter(item => item.level === 'success').length;
    await historyForm().props.onFinish(values); render();
    assert.equal(table().props.dataSource.length, 1);
    assert.equal(messages.filter(item => item.level === 'success').length, before);
    fail = false;
    await historyForm().props.onFinish(values); render();
    const created = requests.find(item => item.action === 'create');
    assert.equal(created.scope, 'hr_employee_history');
    assert.equal(created.record.employeeName, 'Former Employee');
    assert.equal(created.record.employeeCode, 'NV-OLD');
    assert.equal(created.record.signer, '');
    assert.equal(created.record.decisionNumber, '');
    assert.equal(created.record.createdBy, undefined);
    assert.equal(table().props.dataSource.length, 2);
    const record = table().props.dataSource[0];
    actions(record).find(node => node.type === 'Button' && text(node) === 'Sửa').props.onClick(); render();
    await historyForm().props.onFinish({ ...forms[0].values, newValue: 'Updated history detail', note: 'Actual decision notes' }); render();
    assert.equal(requests.find(item => item.action === 'update').key, record.key);
    assert.equal(table().props.dataSource[0].newValue, 'Updated history detail');
    actions(table().props.dataSource[0]).find(node => node.type === 'Button' && text(node) === 'Xem').props.onClick(); render();
    assert.ok(text(nodes().find(node => node.type === ui.Modal && node.props.title === 'Chi tiết biến động nhân sự')).includes('Actual decision notes'));
    nodes().find(node => node.type === ui.Input && node.props.placeholder?.startsWith('Tìm theo tên nhân viên')).props.onChange({ target: { value: 'NV-OLD' } }); render();
    assert.equal(table().props.dataSource.length, 1);
    button('Xuất Excel').props.onClick();
    const exportText = await downloads[0].content.text();
    assert.ok(exportText.includes('Former Employee'));
    assert.ok(!exportText.includes('Existing Employee'));
    actions(table().props.dataSource[0]).find(node => node.type === 'Button' && text(node) === 'Xóa').props.onClick();
    fail = true;
    await confirm.onOk(); render();
    assert.equal(table().props.dataSource.length, 1);
    fail = false;
    await confirm.onOk(); render();
    assert.equal(table().props.dataSource.length, 0);
    nodes().find(node => node.type === ui.Input && node.props.placeholder?.startsWith('Tìm theo tên nhân viên')).props.onChange({ target: { value: '' } }); render();
    await button('Làm mới').props.onClick(); render();
    assert.equal(table().props.dataSource.length, 1, 'reload reads persisted records after deletion');
    props = { defaultType: 'Ngân hàng' }; render(); render();
    assert.equal(table().props.dataSource[0].id, 'bank-1');
    assert.ok(button('Thêm ngân hàng'));
    props = { defaultType: 'Xác thực danh tính' }; render(); render();
    assert.equal(table().props.dataSource.length, 1);
    assert.ok(button('Gửi yêu cầu eKYC mới'));
  } finally { globalThis.localStorage = originalStorage; delete globalThis.__historyTest; }
});
