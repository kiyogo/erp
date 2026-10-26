import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/hr/OnboardingModule.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } });
const imports = {
  react: 'globalThis.__onboardingTest.react', '@ant-design/icons': 'globalThis.__onboardingTest.icons',
  '../../components/KTable': 'globalThis.__onboardingTest.ui', '../../custom-ui': 'globalThis.__onboardingTest.ui',
  'react-router-dom': 'globalThis.__onboardingTest.router', '../../api/endpoints': 'globalThis.__onboardingTest.api',
  '../../services/dataService': 'globalThis.__onboardingTest.services', '../../utils/fileExporter': 'globalThis.__onboardingTest.exporter',
};
const executable = outputText.replace(/import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, names, path) => {
  assert.ok(imports[path], `Unmocked import: ${path}`);
  return names.startsWith('React,') ? `const React = ${imports[path]}; const ${names.slice(6).trim()} = ${imports[path]};` : `const ${names} = ${imports[path]};`;
});

test('onboarding progress requires actual canonical confirmations and never infers from legacy percentage', async () => {
  globalThis.__onboardingTest = { react: {}, icons: {}, ui: {}, router: {}, api: {}, services: {}, exporter: {} };
  const { onboardingChecklist, onboardingProgress, onboardingSteps } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#logic`);
  assert.equal(onboardingProgress(onboardingChecklist({ progress: 100, laptopProvided: true, emailCreated: true })), 0);
  assert.equal(onboardingProgress([{ key: 'equipment', completed: true }, { key: 'equipment', completed: true }, { key: 'unknown', completed: true }]), 20);
  assert.equal(onboardingProgress(onboardingSteps.map(step => ({ key: step.key, completed: true }))), 100);
  assert.equal(onboardingChecklist({ checklist: [{ key: 'training', completed: true, completedAt: '2026-10-25T12:00:00Z' }] }).filter(item => item.completed).length, 1);
  delete globalThis.__onboardingTest;
});

test('onboarding persists each checkbox, handles failure, requires review before completion and opens real contract page', async () => {
  const state = [];
  let cursor = 0;
  const forms = [];
  let formCursor = 0;
  const effects = [];
  let effectCursor = 0;
  const dependencies = [];
  const messages = [];
  const writes = [];
  const downloads = [];
  const routes = [];
  let fail = false;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useEffect: (callback, deps) => { const index = effectCursor++; if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) { dependencies[index] = deps; effects.push(callback); } },
  };
  const ui = Object.fromEntries(['KTable', 'Modal', 'Input', 'Select', 'Button', 'Tag', 'Progress', 'Drawer', 'Checkbox'].map(name => [name, name]));
  ui.Input = Object.assign(function Input() {}, { TextArea: 'TextArea' });
  ui.Form = Object.assign(function Form() {}, { Item: 'FormItem', useForm: () => { const index = formCursor++; forms[index] ||= { values: {}, resetFields() { this.values = {}; }, setFieldsValue(values) { this.values = { ...this.values, ...values }; } }; return [forms[index]]; } });
  ui.message = Object.fromEntries(['success', 'warning', 'error'].map(level => [level, text => messages.push({ level, text })]));
  const icons = new Proxy({}, { get: (_, name) => String(name) });
  let record;
  globalThis.__onboardingTest = {
    react, ui, icons, router: { useNavigate: () => route => routes.push(route) },
    services: { dataService: { refreshGenericData: async () => [], fetchOrgUnitsList: async () => [], fetchDropdownOptions: async () => [] } },
    api: {
      employeesApi: { getAll: async () => ({ data: { data: [{ id: 'employee-1', userId: 'employee-1', employeeCode: 'NV-TEST', name: 'Real Employee', position: 'Engineer', department: 'Test', isActive: true, status: 'Thử việc' }] } }) },
      collectionsApi: {
        create: async (scope, value) => { writes.push({ scope, value: structuredClone(value) }); record = value; return { data: { record } }; },
        update: async (scope, key, patch) => { if (fail) throw new Error('offline'); writes.push({ scope, key, value: structuredClone(patch) }); record = { ...record, ...patch }; return { data: { record } }; },
      },
    },
    exporter: { generateValidXlsxBlob: rows => new Blob([JSON.stringify(rows)]), downloadFile: (filename, content) => downloads.push({ filename, content }) },
  };
  const { OnboardingModule } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#component`);
  let tree;
  const render = () => { cursor = 0; formCursor = 0; effectCursor = 0; tree = OnboardingModule(); effects.splice(0).forEach(callback => callback()); };
  const nodes = (node = tree) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(child => child ? nodes(child) : [])];
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props?.children?.flat(Infinity).map(text).join('') || '';
  const button = label => nodes().find(node => node.type === 'Button' && text(node).includes(label));
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const table = () => nodes().find(node => node.type === 'KTable');
  try {
    render(); await tick(); render();
    button('Tiếp nhận nhân sự mới').props.onClick(); render();
    const form = nodes().find(node => node.type === ui.Form);
    const values = { employeeId: 'employee-1', position: 'Engineer', department: 'Test', mentor: 'Actual Mentor', startDate: '2026-10-01' };
    await form.props.onFinish({ ...values, employeeId: '' }); render();
    assert.equal(writes.length, 0);
    await form.props.onFinish(values); render();
    assert.equal(writes[0].scope, 'hr_onboarding_tasks');
    assert.equal(writes[0].value.employeeName, 'Real Employee');
    assert.equal(writes[0].value.empCode, 'NV-TEST');
    assert.equal(writes[0].value.progress, 0);
    assert.equal(writes[0].value.emailCreated, false);
    assert.equal(writes[0].value.contractSigned, false);
    assert.equal(writes[0].value.evaluationDate, '2026-11-30');
    table().props.columns.find(column => column.key === 'actions').render(null, table().props.dataSource[0]).props.onClick(); render();
    assert.equal(button('Nghiệm thu hội nhập').props.disabled, true);
    fail = true;
    const before = messages.filter(item => item.level === 'success').length;
    nodes().find(node => node.type === 'Checkbox').props.onChange({ target: { checked: true } }); await tick(); render();
    assert.equal(table().props.dataSource[0].progress, 0, 'failed write cannot change the displayed progress');
    assert.equal(messages.filter(item => item.level === 'success').length, before);
    fail = false;
    for (let i = 0; i < 5; i++) { nodes().filter(node => node.type === 'Checkbox')[i].props.onChange({ target: { checked: true } }); await tick(); render(); }
    assert.equal(table().props.dataSource[0].progress, 100);
    button('Nghiệm thu hội nhập').props.onClick(); await tick(); render();
    assert.notEqual(table().props.dataSource[0].status, 'Đã hoàn thành', 'review notes are required');
    nodes().find(node => node.type === 'TextArea').props.onChange({ target: { value: 'Đã nghiệm thu đủ nội dung theo kế hoạch.' } }); render();
    button('Nghiệm thu hội nhập').props.onClick(); await tick(); render();
    assert.equal(table().props.dataSource[0].status, 'Đã hoàn thành');
    assert.equal(table().props.dataSource[0].contractSigned, false, 'completion does not pretend to sign a contract');
    button('Mở hợp đồng lao động').props.onClick();
    assert.deepEqual(routes, ['/admin/hr/contracts']);
    button('Xuất Báo Cáo').props.onClick();
    assert.ok((await downloads[0].content.text()).includes('Real Employee'));
    assert.ok(!JSON.stringify(writes).includes('Trần Tuấn Anh'));
  } finally { delete globalThis.__onboardingTest; }
});
