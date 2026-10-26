import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/hr/PerformanceReviewModule.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } });
const imports = {
  react: 'globalThis.__performanceTest.react', '@ant-design/icons': 'globalThis.__performanceTest.icons',
  '../../components/KTable': 'globalThis.__performanceTest.ui', '../../custom-ui': 'globalThis.__performanceTest.ui',
  '../../api/endpoints': 'globalThis.__performanceTest.api', '../../services/dataService': 'globalThis.__performanceTest.services', '../../utils/fileExporter': 'globalThis.__performanceTest.exporter',
};
const executable = outputText.replace(/import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, names, path) => {
  assert.ok(imports[path], `Unmocked import: ${path}`);
  return names.startsWith('React,') ? `const React = ${imports[path]}; const ${names.slice(6).trim()} = ${imports[path]};` : `const ${names} = ${imports[path]};`;
});

test('performance validation preserves zero and unknown scores and rejects incomplete pillars and invalid amounts', async () => {
  globalThis.__performanceTest = { react: {}, icons: {}, ui: {}, api: {}, services: {}, exporter: {} };
  const { validatePerformanceReview: validate } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#logic`);
  try {
    const record = { employeeId: 'employee', evaluatorId: 'evaluator', code: 'DG-1', period: 'Actual period', department: 'Actual department', selfScore: 0, managerScore: 0, kpiBonus: 0 };
    assert.equal(validate(record), '');
    assert.equal(validate({ ...record, selfScore: null }), '');
    for (const patch of [{ employeeId: '' }, { evaluatorId: '' }, { code: '' }, { department: '' }, { period: '' }, { managerScore: NaN }, { managerScore: -1 }, { managerScore: 100.001 }, { managerScore: undefined }, { kpiBonus: -1 }, { kpiBonus: 0.5 }, { productivityScore: 60 }, { productivityScore: 61, disciplineScore: 20, innovationScore: 20 }]) assert.notEqual(validate({ ...record, ...patch }), '', JSON.stringify(patch));
    assert.equal(validate({ ...record, managerScore: undefined, productivityScore: 0, disciplineScore: 0, innovationScore: 0 }), '');
  } finally { delete globalThis.__performanceTest; }
});

test('performance UI uses logical keys, persists real identities and zero scores, exports filtered data and never claims payment', async () => {
  const states = [], forms = [], effects = [], dependencies = [], messages = [], writes = [], downloads = [];
  let cursor = 0, formCursor = 0, effectCursor = 0, fail = false;
  const employee = { id: 'employee-1', name: 'Actual Employee', employeeCode: 'NV-1', department: 'Actual department', position: 'Actual position' };
  const manager = { id: 'manager-1', name: 'Actual Manager', employeeCode: 'NV-2' };
  let records = [{ key: 'logical-review', id: 'physical-row', employeeId: employee.id, evaluatorId: manager.id, employeeName: employee.name, evaluator: manager.name, empCode: employee.employeeCode, department: 'Actual department', position: 'Actual position', code: 'DG-SAVED', period: 'Actual period', selfScore: null, managerScore: 0, kpiBonus: 0, grade: 'C (Cần cải thiện)', managerComment: '', status: 'Chờ phê duyệt điểm' }];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useEffect: (callback, deps) => { const index = effectCursor++; if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) { dependencies[index] = deps; effects.push(callback); } },
  };
  const ui = Object.fromEntries(['KTable', 'Button', 'Select', 'Tag', 'Progress', 'Drawer', 'Card', 'Tooltip'].map(name => [name, name]));
  ui.Input = Object.assign(function Input() {}, { TextArea: 'TextArea' });
  ui.Modal = Object.assign(function Modal() {}, { confirm: options => options.onOk() });
  ui.Form = Object.assign(function Form() {}, { Item: 'FormItem', useForm: () => { const index = formCursor++; forms[index] ||= { values: {}, resetFields() { this.values = {}; }, setFieldsValue(values) { this.values = { ...this.values, ...values }; } }; return [forms[index]]; } });
  ui.message = Object.fromEntries(['success', 'error', 'warning'].map(level => [level, text => messages.push({ level, text })]));
  globalThis.__performanceTest = {
    react, ui, icons: new Proxy({}, { get: (_, key) => String(key) }),
    services: { dataService: { refreshGenericData: async () => structuredClone(records), fetchOrgUnitsList: async () => [], fetchDropdownOptions: async () => [] } },
    api: {
      employeesApi: { getAll: async () => ({ data: { data: [employee, manager] } }) },
      collectionsApi: {
        create: async (scope, record) => { if (fail) throw new Error('offline'); const saved = { ...record, grade: 'C (Cần cải thiện)', managerComment: record.managerComment || '' }; records = [saved, ...records]; writes.push({ scope, record }); return { data: { record: saved } }; },
        update: async (scope, key, patch) => { if (fail) throw new Error('offline'); const saved = { ...records.find(item => item.key === key), ...patch, ...(patch.status === 'Đã hoàn tất đánh giá' ? { approvedBy: 'Server Approver', approvedAt: '2026-10-26T01:00:00Z' } : {}) }; records = records.map(item => item.key === key ? saved : item); writes.push({ scope, key, patch }); return { data: { record: saved } }; },
        remove: async (scope, key) => { if (fail) throw new Error('offline'); writes.push({ scope, key, action: 'delete' }); records = records.filter(item => item.key !== key); },
      },
    },
    exporter: { downloadFile: (filename, content) => { assert.ok(content instanceof Blob); downloads.push({ filename, content }); }, generateValidXlsxBlob: rows => new Blob([JSON.stringify(rows)]), generateValidPdfBlob: (title, subtitle, lines) => new Blob([JSON.stringify({ title, subtitle, lines })]) },
  };
  const { PerformanceReviewModule } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#component`);
  let tree;
  const render = () => { cursor = 0; formCursor = 0; effectCursor = 0; tree = PerformanceReviewModule(); for (const effect of effects.splice(0)) effect(); };
  const nodes = (node = tree) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(child => child ? nodes(child) : [])];
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props?.children?.flat(Infinity).map(text).join('') || '';
  const button = label => nodes().find(node => node.type === 'Button' && text(node).includes(label));
  const table = () => nodes().find(node => node.type === 'KTable');
  const actions = record => nodes(table().props.columns.find(column => column.key === 'actions').render(null, record));
  const action = (record, label) => actions(record).find(node => node.type === 'Button' && text(node) === label);
  const tick = () => new Promise(resolve => setImmediate(resolve));
  try {
    render(); await tick(); render();
    assert.equal(table().props.dataSource[0].key, 'logical-review');
    action(records[0], 'Chi tiết').props.onClick(); render();
    assert.ok(text(tree).includes('Chưa có nhận xét quản lý.')); assert.ok(text(tree).includes('Chưa chấm'));
    assert.ok(!text(tree).includes('Hoàn thành xuất sắc nhiệm vụ được giao'));
    fail = true; const successes = messages.filter(item => item.level === 'success').length;
    await action(records[0], 'Duyệt').props.onClick(); render();
    assert.equal(table().props.dataSource[0].status, 'Chờ phê duyệt điểm'); assert.equal(messages.filter(item => item.level === 'success').length, successes);
    fail = false; await action(records[0], 'Duyệt').props.onClick(); render();
    assert.equal(writes.at(-1).key, 'logical-review'); assert.equal(table().props.dataSource[0].status, 'Đã hoàn tất đánh giá');
    assert.ok(text(tree).includes('Server Approver')); assert.ok(!messages.some(item => item.level === 'success' && item.text.includes('chi thưởng KPI')));
    assert.equal(action(records[0], 'Sửa'), undefined); assert.equal(action(records[0], 'Xóa'), undefined);
    button('Lập phiếu đánh giá').props.onClick(); render();
    assert.equal(forms[0].values.selfScore, undefined); assert.equal(forms[0].values.managerScore, undefined); assert.equal(forms[0].values.kpiBonus, 0);
    const form = () => nodes().find(node => node.type === ui.Form);
    const values = { employeeId: employee.id, evaluatorId: manager.id, employeeName: 'forged', code: 'DG-ZERO', period: 'Another period', department: 'Actual department', selfScore: 0, managerScore: 0, kpiBonus: 0 };
    fail = true; await form().props.onFinish(values); render(); assert.equal(messages.at(-1).level, 'error');
    fail = false; await form().props.onFinish(values); render();
    const created = writes.find(item => item.record).record;
    assert.equal(created.employeeName, employee.name); assert.equal(created.evaluator, manager.name); assert.equal(created.selfScore, 0); assert.equal(created.managerScore, 0); assert.equal(created.kpiBonus, 0);
    assert.equal(created.productivityScore, null); assert.equal(created.disciplineScore, null); assert.equal(created.innovationScore, null);
    const search = nodes().find(node => node.type === ui.Input && node.props.placeholder?.startsWith('Tìm theo mã'));
    search.props.onChange({ target: { value: 'DG-ZERO' } }); render();
    button('Xuất Báo Cáo').props.onClick(); const report = await downloads.at(-1).content.text();
    assert.ok(report.includes('DG-ZERO')); assert.ok(!report.includes('DG-SAVED'));
    action(records[0], 'Chi tiết').props.onClick(); render(); button('Xuất phiếu PDF').props.onClick();
    assert.ok((await downloads.at(-1).content.text()).includes('Another period'));
    action(records[0], 'Sửa').props.onClick(); render(); await form().props.onFinish({ ...values, managerComment: 'Actual review comment' }); render();
    assert.equal(writes.at(-1).key, created.key);
    await action(records[0], 'Xóa').props.onClick(); render(); assert.equal(writes.at(-1).key, created.key); assert.equal(table().props.dataSource.length, 0);
    assert.ok(!text(tree).includes('NaN'));
  } finally { delete globalThis.__performanceTest; }
});

