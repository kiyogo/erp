import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/settings/SystemSettingsModule.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } });
const imports = { react: 'react', '@ant-design/icons': 'icons', '../../custom-ui': 'ui', '../../api/endpoints': 'api', '../../api/axios': 'http', '../../utils/fileExporter': 'exporter' };
const executable = outputText.replace(/import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, names, path) => {
  assert.ok(imports[path], `Unexpected import ${path}`);
  const target = `globalThis.__settingsTest.${imports[path]}`;
  return names.startsWith('React,') ? `const React = ${target}; const ${names.slice(6).trim()} = ${target};` : names.startsWith('{') ? `const ${names} = ${target};` : `const ${names} = ${target};`;
});

let fixtureIndex = 0;
async function fixture(failLoad = false) {
  const states = [], effects = [], dependencies = [], messages = [], writes = [], downloads = [];
  let cursor = 0, effectCursor = 0, failSave = false, release;
  let stored = { companyName: 'Actual company', fullName: 'Actual full name', shortName: 'AC', companyCode: 'COMP-1', taxCode: '0012345678', address: 'Actual address', businessType: 'Actual type', establishedDate: '2020-01-01', registrationDate: '2020-01-02', registrationNo: 'REG-1', registrationIssuer: 'Actual issuer', representative: 'Actual representative', representativeTitle: 'Actual title', phone: '0123', fax: '0124', email: 'actual@example.test', website: 'https://example.test/', domain: 'portal.example.test', timezone: 'UTC', currency: 'VND', bankAccountId: 'bank-1', updatedAt: '2026-10-26T00:00:00Z', updatedBy: 'Actual Admin', revision: 4 };
  const email = { host: 'actual.smtp.test', port: 587, username: 'actual-smtp-user', senderEmail: 'sender@example.test', senderName: 'Actual sender', security: 'STARTTLS', portalUrl: 'https://portal.example.test', enabled: true, configured: true, passwordConfigured: true };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const index = cursor++; if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial; return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }]; },
    useEffect: (callback, deps) => { const index = effectCursor++; if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) { dependencies[index] = deps; effects.push(callback); } },
  };
  const ui = Object.fromEntries(['Button', 'Select', 'Tag', 'Card', 'Tooltip'].map(name => [name, name]));
  ui.Input = Object.assign(function Input() {}, { Password: 'Password' });
  ui.message = Object.fromEntries(['success', 'error', 'warning'].map(level => [level, text => messages.push({ level, text })]));
  globalThis.__settingsTest = {
    react, ui, icons: new Proxy({}, { get: (_, key) => String(key) }), http: { get: async route => { assert.equal(route, '/health'); return { data: { database: 'connected' } }; } },
    api: {
      systemApi: {
        getCompanyProfile: async () => { if (failLoad) throw new Error('offline'); return { data: { profile: structuredClone(stored) } }; },
        getEmailConfig: async () => ({ data: { config: structuredClone(email) } }),
        saveCompanyProfile: async profile => { writes.push({ type: 'company', profile: structuredClone(profile) }); if (failSave) throw new Error('write failed'); await new Promise(resolve => { release = resolve; }); stored = { ...profile, companyName: 'Authoritative saved name', revision: profile.revision + 1 }; return { data: { profile: structuredClone(stored) } }; },
        saveEmailConfig: async config => { writes.push({ type: 'email', config: structuredClone(config) }); if (failSave) throw new Error('mail write failed'); return { data: { config: { ...config, password: undefined } } }; },
      },
      financeBankAccountsApi: { getAll: async () => ({ data: { data: [{ key: 'bank-1', bankName: 'Actual Bank', accountNumber: '0001', status: 'Đang hoạt động' }, { key: 'locked', bankName: 'Locked Bank', accountNumber: '0002', status: 'Đã khóa' }] } }) },
    },
    exporter: { downloadFile: (name, content) => downloads.push({ name, content }), generateValidPdfBlob: (title, subtitle, lines) => new Blob([JSON.stringify({ title, subtitle, lines })]) },
  };
  const { SystemSettingsModule } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#fixture-${++fixtureIndex}`);
  let tree;
  const render = () => { cursor = 0; effectCursor = 0; tree = SystemSettingsModule(); for (const effect of effects.splice(0)) effect(); };
  const nodes = (node = tree) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(child => child ? nodes(child) : [])];
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props?.children?.flat(Infinity).map(text).join('') || '';
  const button = label => nodes().find(node => node.type === 'Button' && text(node).includes(label));
  const input = value => nodes().find(node => node.type === ui.Input && node.props.value === value);
  const tick = () => new Promise(resolve => setImmediate(resolve));
  render(); await tick(); render();
  return { render, button, input, nodes, text: (node = tree) => text(node), ui, writes, messages, downloads, tick, release: () => release(), failSave: value => { failSave = value; } };
}

test('company settings load real fields, await persistence, preserve failure state and export actual profile without passwords', async () => {
  const f = await fixture();
  try {
    assert.ok(f.input('Actual company')); assert.ok(f.input('0012345678')); assert.ok(f.input('Actual full name'));
    assert.ok(!f.text().includes('99.99%')); assert.ok(!f.text().includes('Vốn ĐL 50 tỷ')); assert.ok(!f.text().includes('TLS v1.3 Verified'));
    f.input('Actual company').props.onChange({ target: { value: 'Edited company' } }); f.render();
    const count = f.messages.filter(item => item.level === 'success').length;
    const pending = f.button('Lưu cấu hình hệ thống').props.onClick();
    assert.equal(f.writes.at(-1).profile.companyName, 'Edited company'); assert.equal(f.writes.at(-1).profile.revision, 4);
    assert.equal(f.messages.filter(item => item.level === 'success').length, count);
    f.release(); await pending; f.render();
    assert.ok(f.input('Authoritative saved name'));
    f.input('Actual address').props.onChange({ target: { value: 'Unsaved address' } }); f.render();
    f.failSave(true); await f.button('Lưu cấu hình hệ thống').props.onClick(); f.render();
    assert.equal(f.messages.at(-1).level, 'error'); assert.ok(f.input('Unsaved address'));
    f.button('In Thông Số').props.onClick();
    assert.match(await f.downloads.at(-1).content.text(), /Unsaved address/);
    assert.ok(!(await f.downloads.at(-1).content.text()).includes('actual-smtp-user'));
    f.button('Đơn vị tiền tệ & Ngân hàng').props.onClick(); f.render();
    const account = f.nodes().find(node => node.type === 'Select' && node.props.value === 'bank-1');
    assert.ok(account.props.options.some(option => option.label.includes('Actual Bank')));
    assert.ok(!account.props.options.some(option => option.label.includes('Locked Bank')));
  } finally { delete globalThis.__settingsTest; }
});

test('SMTP tab saves through the real email endpoint and failed company reads cannot overwrite existing settings', async () => {
  const f = await fixture();
  try {
    f.button('Email SMTP & Thông báo').props.onClick(); f.render();
    f.input('actual.smtp.test').props.onChange({ target: { value: 'updated.smtp.test' } }); f.render();
    await f.button('Lưu cấu hình hệ thống').props.onClick(); f.render();
    assert.equal(f.writes.at(-1).type, 'email'); assert.equal(f.writes.at(-1).config.host, 'updated.smtp.test');
    assert.equal(f.writes.at(-1).config.password, ''); assert.equal(f.writes.at(-1).config.senderEmail, 'sender@example.test');
    f.failSave(true); const count = f.messages.filter(item => item.level === 'success').length;
    await f.button('Lưu cấu hình hệ thống').props.onClick(); f.render();
    assert.equal(f.messages.filter(item => item.level === 'success').length, count); assert.equal(f.messages.at(-1).level, 'error');
  } finally { delete globalThis.__settingsTest; }
  const failed = await fixture(true);
  try {
    assert.equal(failed.button('Lưu cấu hình hệ thống').props.disabled, true);
    await failed.button('Lưu cấu hình hệ thống').props.onClick();
    assert.equal(failed.writes.length, 0);
  } finally { delete globalThis.__settingsTest; }
});
