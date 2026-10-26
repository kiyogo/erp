import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/hr/RewardsModule.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } });
const imports = {
  react: 'globalThis.__rewardsTest.react', '@ant-design/icons': 'globalThis.__rewardsTest.icons',
  '../../components/KTable': 'globalThis.__rewardsTest.ui', '../../custom-ui': 'globalThis.__rewardsTest.ui',
  '../../api/endpoints': 'globalThis.__rewardsTest.api', '../../services/dataService': 'globalThis.__rewardsTest.services', '../../utils/fileExporter': 'globalThis.__rewardsTest.exporter',
};
const executable = outputText.replace(/import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, names, path) => {
  assert.ok(imports[path], `Unmocked import: ${path}`);
  return names.startsWith('React,') ? `const React = ${imports[path]}; const ${names.slice(6).trim()} = ${imports[path]};` : `const ${names} = ${imports[path]};`;
});

test('rewards require an approved state before award and validate actual nonnegative amounts', async () => {
  globalThis.__rewardsTest = { react: {}, icons: {}, ui: {}, api: {}, services: {}, exporter: {} };
  const { canAwardReward: canAward, isRewardAwarded: awarded, validateReward: validate } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#logic`);
  assert.equal(canAward('Chờ duyệt'), false);
  assert.equal(canAward('Đã ký quyết định'), true);
  assert.equal(canAward('Chờ trao thưởng trong lễ vinh danh'), true);
  assert.equal(canAward('Đã trao giải'), false);
  assert.equal(canAward('Đã trao thưởng'), false);
  assert.equal(awarded('Đã trao giải'), true);
  assert.equal(awarded('Đã trao thưởng'), true);
  const record = { employeeId: 'employee-1', rewardCode: 'KT-1', title: 'Actual Recognition', department: 'Test', decisionNo: 'QD-1', date: '2026-10-26', rewardValue: 0, rewardType: 'Bằng khen Ban Giám Đốc' };
  assert.equal(validate(record), '', 'zero is valid for a noncash commendation');
  assert.match(validate({ ...record, employeeId: '' }), /chọn nhân sự/);
  assert.match(validate({ ...record, rewardValue: -1 }), /không âm/);
  assert.match(validate({ ...record, rewardValue: Number.NaN }), /số nguyên/);
  assert.match(validate({ ...record, date: '2026-02-30' }), /Ngày quyết định/);
  delete globalThis.__rewardsTest;
});

test('rewards await approval and award, preserve failure state, show authoritative actors and export real records', async () => {
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
  let fail = false;
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useEffect: (callback, deps) => { const index = effectCursor++; if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) { dependencies[index] = deps; effects.push(callback); } },
  };
  const ui = Object.fromEntries(['KTable', 'Modal', 'Select', 'Button', 'Tag', 'Drawer'].map(name => [name, name]));
  ui.Input = Object.assign(function Input() {}, { TextArea: 'TextArea' });
  ui.Form = Object.assign(function Form() {}, { Item: 'FormItem', useForm: () => { const index = formCursor++; forms[index] ||= { values: {}, resetFields() { this.values = {}; }, setFieldsValue(values) { this.values = { ...this.values, ...values }; } }; return [forms[index]]; } });
  ui.message = Object.fromEntries(['success', 'warning', 'error'].map(level => [level, text => messages.push({ level, text })]));
  const icons = new Proxy({}, { get: (_, name) => String(name) });
  let records = [{ key: 'reward-logical', id: 'physical-row', employeeId: 'employee-1', rewardCode: 'KT-SAVED', employeeName: 'Actual Employee', empCode: 'NV-1', department: 'Test', title: 'Saved Recognition', rewardType: 'Bằng khen Ban Giám Đốc', rewardValue: 0, decisionNo: 'QD-SAVED', date: '2026-10-26', status: 'Chờ duyệt', achievementSummary: 'Actual achievement' }];
  const employee = { id: 'employee-1', userId: 'employee-1', name: 'Actual Employee', employeeCode: 'NV-1', department: 'Test' };
  globalThis.__rewardsTest = {
    react, ui, icons,
    services: { dataService: { refreshGenericData: async () => structuredClone(records), fetchOrgUnitsList: async () => [] } },
    api: {
      employeesApi: { getAll: async () => ({ data: { data: [employee] } }) },
      collectionsApi: {
        create: async (scope, record) => { if (fail) throw new Error('offline'); writes.push({ scope, record: structuredClone(record) }); records = [record, ...records]; return { data: { record } }; },
        update: async (scope, key, patch) => {
          if (fail) throw new Error('offline');
          const record = { ...records.find(item => item.key === key), ...patch, ...(patch.status === 'Đã ký quyết định' ? { approvedBy: 'Server Approver', approvedAt: '2026-10-26T01:00:00Z' } : {}), ...(patch.status === 'Đã trao giải' ? { awardedBy: 'Server Awarder', awardedAt: '2026-10-26T02:00:00Z' } : {}) };
          writes.push({ scope, key, patch: structuredClone(patch) }); records = records.map(item => item.key === key ? record : item); return { data: { record } };
        },
      },
    },
    exporter: { generateValidXlsxBlob: rows => new Blob([JSON.stringify(rows)]), generateValidPdfBlob: (title, subtitle, lines) => new Blob([JSON.stringify({ title, subtitle, lines })]), downloadFile: (filename, content) => downloads.push({ filename, content }) },
  };
  const { RewardsModule } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#component`);
  let tree;
  const render = () => { cursor = 0; formCursor = 0; effectCursor = 0; tree = RewardsModule(); effects.splice(0).forEach(callback => callback()); };
  const nodes = (node = tree) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(child => child ? nodes(child) : [])];
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props?.children?.flat(Infinity).map(text).join('') || '';
  const button = label => nodes().find(node => node.type === 'Button' && text(node).includes(label));
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const table = () => nodes().find(node => node.type === 'KTable');
  const actions = record => nodes(table().props.columns.find(column => column.key === 'actions').render(null, record));
  try {
    render(); await tick(); render();
    assert.equal(table().props.dataSource[0].key, 'reward-logical');
    assert.equal(actions(table().props.dataSource[0]).some(node => node.type === 'Button' && text(node) === 'Trao giải'), false);
    actions(table().props.dataSource[0]).find(node => node.type === 'Button' && text(node) === 'Bằng khen').props.onClick(); render();
    assert.equal(button('Xác Nhận Đã Trao Thưởng'), undefined);
    fail = true;
    const successes = messages.filter(item => item.level === 'success').length;
    await actions(table().props.dataSource[0]).find(node => node.type === 'Button' && text(node) === 'Duyệt').props.onClick(); render();
    assert.equal(table().props.dataSource[0].status, 'Chờ duyệt');
    assert.equal(messages.filter(item => item.level === 'success').length, successes);
    fail = false;
    await actions(table().props.dataSource[0]).find(node => node.type === 'Button' && text(node) === 'Duyệt').props.onClick(); render();
    assert.equal(writes[0].key, 'reward-logical');
    assert.deepEqual(writes[0].patch, { status: 'Đã ký quyết định' });
    assert.ok(text(nodes().find(node => node.type === 'Drawer')).includes('Server Approver'));
    assert.ok(button('Xác Nhận Đã Trao Thưởng'));
    fail = true;
    await actions(table().props.dataSource[0]).find(node => node.type === 'Button' && text(node) === 'Trao giải').props.onClick(); render();
    assert.equal(table().props.dataSource[0].status, 'Đã ký quyết định');
    fail = false;
    await actions(table().props.dataSource[0]).find(node => node.type === 'Button' && text(node) === 'Trao giải').props.onClick(); render();
    assert.equal(table().props.dataSource[0].status, 'Đã trao giải');
    assert.equal(button('Xác Nhận Đã Trao Thưởng'), undefined);
    assert.ok(text(nodes().find(node => node.type === 'Drawer')).includes('Server Awarder'));
    button('In Bằng Khen').props.onClick();
    assert.match(downloads[0].filename, /\.pdf$/);
    assert.ok((await downloads[0].content.text()).includes('Server Approver'));
    button('Quyết định khen thưởng').props.onClick(); render();
    const form = nodes().find(node => node.type === ui.Form);
    await form.props.onFinish({ employeeId: employee.id, employeeName: 'Fake Name', rewardCode: 'KT-ZERO', department: 'Test', title: 'No cash recognition', decisionNo: 'QD-ZERO', date: '2026-10-26', rewardType: 'Bằng khen Ban Giám Đốc', rewardValue: 0 }); render();
    const created = writes.find(item => item.record);
    assert.equal(created.record.rewardValue, 0);
    assert.equal(created.record.employeeName, 'Actual Employee');
    assert.equal(created.record.signerName, undefined);
    assert.equal(created.record.status, 'Chờ duyệt');
    assert.ok(!text(tree).includes('+72'));
    assert.ok(!text(tree).includes('94%'));
    nodes().find(node => node.type === ui.Input && node.props.placeholder?.startsWith('Tìm theo mã')).props.onChange({ target: { value: 'KT-ZERO' } }); render();
    button('Xuất Sổ Vàng').props.onClick();
    const report = await downloads.at(-1).content.text();
    assert.ok(report.includes('No cash recognition'));
    assert.ok(!report.includes('Saved Recognition'));
  } finally { delete globalThis.__rewardsTest; }
});
