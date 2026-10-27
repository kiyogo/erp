import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/crm/LoyaltyModule.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } });
const imports = {
  react: 'globalThis.__loyaltyTest.react', '@ant-design/icons': 'globalThis.__loyaltyTest.icons',
  '../../components/KTable': 'globalThis.__loyaltyTest.ui', '../../custom-ui': 'globalThis.__loyaltyTest.ui',
  '../../api/endpoints': 'globalThis.__loyaltyTest.api', '../../utils/fileExporter': 'globalThis.__loyaltyTest.exporter',
};
const executable = outputText.replace(/import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, names, path) => {
  assert.ok(imports[path], `Unmocked import: ${path}`);
  return names.startsWith('React,') ? `const React = ${imports[path]}; const ${names.slice(6).trim()} = ${imports[path]};` : `const ${names} = ${imports[path]};`;
});

test('loyalty UI preserves a request after failure and refreshes actual balances and reward status', async () => {
  const state = [];
  let cursor = 0;
  const forms = [];
  let formCursor = 0;
  const effects = [];
  let effectCursor = 0;
  const dependencies = [];
  const messages = [];
  const attempts = [];
  const downloads = [];
  let failWrite = true;
  let failRead = false;
  const customers = [{ key: 'customer-1', code: 'KH-1', name: 'Khách thật', status: 'Đang hoạt động', balance: 0 }];
  const entries = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const index = cursor++; if (!(index in state)) state[index] = initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useMemo: callback => callback(),
    useEffect: (callback, deps) => { const index = effectCursor++; if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) { dependencies[index] = deps; effects.push(callback); } },
  };
  const ui = Object.fromEntries(['KTable', 'Modal', 'Select', 'Button', 'Tag'].map(name => [name, name]));
  ui.Input = Object.assign(function Input() {}, { TextArea: 'TextArea' });
  ui.Form = Object.assign(function Form() {}, { Item: 'FormItem', useForm: () => { const index = formCursor++; forms[index] ||= { values: {}, resetFields() { this.values = {}; }, setFieldsValue(values) { this.values = { ...this.values, ...values }; } }; return [forms[index]]; } });
  ui.message = Object.fromEntries(['success', 'error'].map(level => [level, text => messages.push({ level, text })]));
  globalThis.__loyaltyTest = {
    react, ui, icons: new Proxy({}, { get: (_, name) => String(name) }),
    api: { crmLoyaltyApi: {
      getAll: async () => { if (failRead) throw new Error('offline'); return { data: { customers: structuredClone(customers), entries: structuredClone(entries) } }; },
      create: async input => {
        attempts.push(structuredClone(input));
        if (failWrite) throw new Error('offline');
        const delta = input.type === 'earn' ? input.points : -input.points;
        customers[0].balance += delta;
        const entry = { ...input, key: input.requestId, customerCode: customers[0].code, customerName: customers[0].name, delta, balanceAfter: customers[0].balance, status: input.type === 'earn' ? 'Đã ghi nhận' : 'Chờ trao', createdAt: '2026-10-27T10:00:00Z', createdBy: 'Admin', createdById: 'admin' };
        entries.unshift(entry);
        return { data: { entry, balance: customers[0].balance } };
      },
      fulfill: async (key, reference) => { const entry = entries.find(item => item.key === key); entry.status = 'Đã trao'; entry.fulfillmentReference = reference; return { data: { entry } }; },
      cancel: async () => { throw new Error('not exercised'); },
    } },
    exporter: { generateValidXlsxBlob: rows => new Blob([JSON.stringify(rows)]), downloadFile: (name, content) => downloads.push({ name, content }) },
  };
  const { LoyaltyModule } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#ui`);
  let tree;
  const render = () => { cursor = 0; formCursor = 0; effectCursor = 0; tree = LoyaltyModule(); effects.splice(0).forEach(callback => callback()); };
  const nodes = (node = tree) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(child => child ? nodes(child) : [])];
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props?.children?.flat(Infinity).map(text).join('') || '';
  const button = label => nodes().find(node => node.type === 'Button' && text(node).includes(label));
  const openForm = () => nodes(nodes().find(node => node.type === 'Modal' && node.props.open)).find(node => node.type === ui.Form);
  const tick = () => new Promise(resolve => setImmediate(resolve));
  try {
    render(); await tick(); render();
    button('Tích điểm').props.onClick(); render();
    const earnValues = { customerId: 'customer-1', points: '100', reference: 'SALE-1', note: '' };
    await openForm().props.onFinish(earnValues); render();
    assert.equal(messages.filter(item => item.level === 'success').length, 0);
    assert.equal(nodes().find(node => node.type === 'Modal' && node.props.open).props.title, 'Ghi nhận tích điểm');
    failWrite = false;
    await openForm().props.onFinish(earnValues); render();
    assert.equal(attempts[0].requestId, attempts[1].requestId);
    assert.equal(nodes().filter(node => node.type === 'KTable')[0].props.dataSource[0].balance, 100);
    button('Đổi điểm').props.onClick(); render();
    await openForm().props.onFinish({ customerId: 'customer-1', points: '30', reference: 'REDEEM-1', rewardName: 'Quà thật', note: '' }); render();
    const table = nodes().filter(node => node.type === 'KTable')[1];
    const redemption = table.props.dataSource.find(item => item.type === 'redeem');
    const actionCell = table.props.columns.find(column => column.key === 'actions').render(null, redemption);
    nodes(actionCell).find(node => node.type === 'Button' && text(node).includes('Xác nhận trao')).props.onClick(); render();
    await openForm().props.onFinish({ detail: 'PHIEU-TRA-1' }); render();
    assert.equal(nodes().filter(node => node.type === 'KTable')[0].props.dataSource[0].balance, 70);
    assert.equal(entries.find(item => item.type === 'redeem').fulfillmentReference, 'PHIEU-TRA-1');
    button('Xuất Excel').props.onClick();
    assert.match(await downloads[0].content.text(), /Quà thật/);
    failRead = true;
    button('Làm mới').props.onClick(); await tick(); render();
    assert.equal(button('Tích điểm').props.disabled, true);
    assert.ok(nodes().some(node => node.props?.role === 'alert'));
  } finally { delete globalThis.__loyaltyTest; }
});
