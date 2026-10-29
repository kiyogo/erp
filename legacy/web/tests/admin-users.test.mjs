import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/admin/AdminUsersModule.tsx', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022, jsx: ts.JsxEmit.React } });
const imports = {
  react: 'globalThis.__adminUsersTest.react', '@ant-design/icons': 'globalThis.__adminUsersTest.icons',
  '../../components/KTable': 'globalThis.__adminUsersTest.ui', '../../custom-ui': 'globalThis.__adminUsersTest.ui',
  '../../api/endpoints': 'globalThis.__adminUsersTest.api', '../../services/dataService': 'globalThis.__adminUsersTest.services',
  '../../utils/fileExporter': 'globalThis.__adminUsersTest.exporter',
};
const executable = outputText.replace(/import\s+([^;]+?)\s+from\s+['"]([^'"]+)['"];?/g, (_, names, path) => {
  assert.ok(imports[path], `Unmocked import: ${path}`);
  return names.startsWith('React,') ? `const React = ${imports[path]}; const ${names.slice(6).trim()} = ${imports[path]};` : `const ${names} = ${imports[path]};`;
});

test('user roles, activation and MFA reflect server facts, with independent pending/locked filters', async () => {
  globalThis.__adminUsersTest = { react: {}, icons: {}, ui: {}, api: {}, services: {}, exporter: {} };
  const { normalizeAdminUser: normalize, filterAdminUsers: filter, validateAdminUser: validate, buildAdminUserProfilePayload: buildProfile } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#logic`);
  const employee = normalize({ id: 'employee', name: 'Actual Employee', role: 'USER', position: 'Giám Đốc', isActive: false, activationStatus: 'Chờ kích hoạt', twoFactor: true });
  assert.equal(employee.role, 'USER');
  assert.equal(employee.status, 'Chờ kích hoạt');
  assert.equal(employee.twoFactor, null, 'a stored browser flag is not proof of MFA enforcement');
  const admin = normalize({ id: 'admin', name: 'Actual Admin', role: 'ADMIN', isActive: true }, '2026-10-26T01:02:03Z');
  const locked = normalize({ id: 'locked', role: 'USER', isActive: false });
  assert.equal(filter([employee, admin, locked], 'admin', '').length, 1);
  assert.equal(filter([employee, admin, locked], 'locked', '').length, 1);
  assert.equal(filter([employee, admin, locked], 'pending', '').length, 1);
  assert.equal(filter([employee, admin, locked], 'all', ' giám đốc ')[0].key, 'employee');
  const input = { username: 'NV-NEW', fullName: 'New User', email: 'new@example.test', role: 'USER', password: 'Strong-Password-26!', twoFactor: 'unsupported' };
  assert.equal(validate(input), '');
  assert.match(validate({ ...input, role: 'Super Admin' }), /ADMIN hoặc USER/);
  assert.match(validate({ ...input, twoFactor: 'true' }), /MFA/);
  assert.match(validate({ ...input, password: 'short' }), /12 đến 256/);
  assert.match(validate({ ...input, email: 'broken' }), /Email/);
  const profile = buildProfile({
    ...input, fullName: 'Trần An Vy', middleLastName: 'Trần An', firstName: 'Vy',
    birthDate: '1998-02-03', gender: 'Nữ', address: 'Hà Nội', phone: '0900000000',
    personalEmail: 'vy.personal@example.test', managerId: 'manager-1', jobTitle: 'Chuyên viên',
    status: 'Thử việc', probationDate: '2026-10-01', officialDate: '2026-11-01',
    workPhone: '02430000000', workEmail: 'vy.work@example.test',
  }, 'data:image/png;base64,AA==', [{ key: 'manager-1', name: 'Quản lý thử', employeeCode: 'MANAGER-1' }]);
  assert.equal(profile.name, 'Trần An Vy');
  assert.equal(profile.details.firstName, 'Vy');
  assert.equal(profile.details.middleLastName, 'Trần An');
  assert.equal(profile.details.manager, 'Quản lý thử');
  assert.equal(profile.details.managerId, 'manager-1');
  assert.equal(profile.details.resAddress, 'Hà Nội');
  assert.equal(profile.avatar, 'data:image/png;base64,AA==');
  assert.equal(profile.joinDate, '2026-11-01');
  delete globalThis.__adminUsersTest;
});

test('users load all pages, persist CRUD before success, reset actual passwords and export current filter', async () => {
  const state = []; let cursor = 0;
  const refs = []; let refCursor = 0;
  const forms = []; let formCursor = 0;
  const effects = []; let effectCursor = 0;
  const dependencies = [];
  const requests = []; const messages = []; const downloads = [];
  let confirm; let fail = false; let auxFail = false;
  let stored = [
    { id: 'admin-1', employeeCode: 'ADMIN-1', name: 'Actual Admin', email: 'admin@example.test', role: 'ADMIN', isActive: true, department: 'Operations', position: 'Administrator' },
    { id: 'pending-1', employeeCode: 'NV-PENDING', name: 'Pending User', email: 'pending@example.test', role: 'USER', isActive: false, activationStatus: 'Chờ kích hoạt' },
    { id: 'user-1', employeeCode: 'NV-1', name: 'Actual Employee', email: 'employee@example.test', role: 'USER', isActive: true, position: 'Giám Đốc' },
  ];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState: initial => { const index = cursor++; if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial; return [state[index], value => { state[index] = typeof value === 'function' ? value(state[index]) : value; }]; },
    useRef: initial => { const index = refCursor++; refs[index] ||= { current: initial }; return refs[index]; },
    useEffect: (callback, deps) => { const index = effectCursor++; if (!dependencies[index] || deps.some((value, i) => value !== dependencies[index][i])) { dependencies[index] = deps; effects.push(callback); } },
  };
  const ui = Object.fromEntries(['KTable', 'Button', 'Select', 'Tag', 'Drawer', 'Card', 'Tooltip', 'Progress'].map(name => [name, name]));
  ui.Input = Object.assign(function Input() {}, { Password: 'Password', TextArea: 'TextArea' });
  ui.Modal = Object.assign(function Modal() {}, { confirm: options => { confirm = options; } });
  ui.Form = Object.assign(function Form() {}, { Item: 'FormItem', useForm: () => { const index = formCursor++; forms[index] ||= { values: {}, resetFields() { this.values = {}; }, setFieldsValue(values) { this.values = { ...this.values, ...values }; } }; return [forms[index]]; } });
  ui.message = Object.fromEntries(['success', 'warning', 'info', 'error'].map(level => [level, text => messages.push({ level, text })]));
  const icons = new Proxy({}, { get: (_, name) => String(name) });
  globalThis.__adminUsersTest = {
    react, ui, icons,
    services: { dataService: { fetchOrgUnitsList: async () => { if (auxFail) throw new Error('org offline'); return ['Operations']; } } },
    exporter: { generateValidXlsxBlob: rows => new Blob([JSON.stringify(rows)]), downloadFile: (filename, content) => downloads.push({ filename, content }) },
    api: {
      adminSessionsApi: { getAll: async () => { if (auxFail) throw new Error('sessions offline'); return { data: { data: [{ userId: 'admin-1', loginTime: '2026-10-25T10:00:00Z' }, { userId: 'admin-1', loginTime: '2026-10-26T10:00:00Z' }] } }; } },
      usersApi: {
        getAll: async ({ page }) => { requests.push({ action: 'read', page }); return { data: { data: structuredClone(stored.slice((page - 1) * 2, page * 2)), pagination: { total: stored.length, limit: 2 } } }; },
        create: async record => { if (fail) throw new Error('create failed'); requests.push({ action: 'create', record }); stored.push({ ...record, id: 'new-user', isActive: true }); return { data: { user: stored.at(-1) } }; },
        update: async (key, patch) => { if (fail) throw new Error('update failed'); requests.push({ action: 'update', key, patch }); stored = stored.map(item => item.id === key ? { ...item, ...patch } : item); return { data: { user: stored.find(item => item.id === key) } }; },
        remove: async key => { if (fail) throw new Error('delete failed'); requests.push({ action: 'remove', key }); stored = stored.filter(item => item.id !== key); return { data: { deleted: true } }; },
      },
      employeesApi: {
        getOne: async key => ({ data: { employee: { id: key, code: 'NV-NEW', employeeCode: 'NV-NEW', name: 'New User', fullName: 'New User', email: 'new@example.test', role: 'USER', isActive: true, department: 'Operations', position: 'Kế Toán Trưởng', status: 'Chính thức', phone: '0900000000', joinDate: '2026-11-01', avatar: '', details: { firstName: 'User', middleLastName: 'New', gender: 'Nam', birthDate: '1998-02-03', resAddress: 'Hà Nội', personalEmail: 'new.personal@example.test', managerId: 'user-1', manager: 'Actual Employee', probationDate: '2026-10-01', officialDate: '2026-11-01', workPhone: '02430000000', workEmail: 'new@example.test', jobTitle: 'Kế Toán Trưởng' } } } }),
        changePassword: async (key, payload) => { if (fail) throw new Error('password failed'); requests.push({ action: 'password', key, payload }); return { data: { success: true } }; },
        resendActivation: async key => { requests.push({ action: 'activation', key }); return { data: { delivery: { status: 'not_configured', message: 'SMTP is not configured' } } }; },
      },
    },
  };
  const { AdminUsersModule } = await import(`data:text/javascript;base64,${Buffer.from(executable).toString('base64')}#component`);
  let tree;
  const render = () => { cursor = 0; refCursor = 0; formCursor = 0; effectCursor = 0; tree = AdminUsersModule(); effects.splice(0).forEach(callback => callback()); };
  const nodes = (node = tree) => !node || typeof node !== 'object' ? [] : [node, ...(node.props?.children || []).flat(Infinity).flatMap(child => child ? nodes(child) : [])];
  const text = node => typeof node === 'string' || typeof node === 'number' ? String(node) : node?.props?.children?.flat(Infinity).map(text).join('') || '';
  const button = label => nodes().find(node => node.type === 'Button' && text(node) === label);
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const table = () => nodes().find(node => node.type === 'KTable');
  const form = () => nodes().filter(node => node.type === ui.Form)[0];
  const actions = record => nodes(table().props.columns.find(column => column.key === 'actions').render(null, record));
  try {
    render(); await tick(); render();
    assert.equal(table().props.dataSource.length, 3, 'all server pages must be loaded');
    assert.ok(requests.some(item => item.action === 'read' && item.page === 2));
    assert.equal(table().props.dataSource.find(item => item.key === 'admin-1').lastLogin, '2026-10-26T10:00:00Z');
    button('Thêm tài khoản').props.onClick(); render();
    const values = {
      username: 'NV-NEW', fullName: 'New User', firstName: 'User', middleLastName: 'New',
      email: 'new@example.test', workEmail: 'new@example.test', role: 'USER',
      position: 'Kế Toán Trưởng', jobTitle: 'Kế Toán Trưởng', department: 'Operations',
      phone: '0900000000', address: 'Hà Nội', personalEmail: 'new.personal@example.test',
      gender: 'Nam', birthDate: '1998-02-03', managerId: 'user-1', status: 'Thử việc',
      probationDate: '2026-10-01', officialDate: '2026-11-01', workPhone: '02430000000',
      password: 'New-Password-26!', twoFactor: 'unsupported',
    };
    fail = true;
    const successCount = messages.filter(item => item.level === 'success').length;
    await form().props.onFinish(values); render();
    assert.equal(table().props.dataSource.length, 3);
    assert.equal(messages.filter(item => item.level === 'success').length, successCount);
    fail = false;
    button('Lưu và phân quyền').props.onClick();
    await form().props.onFinish(values); render();
    assert.equal(nodes().find(node => node.type === ui.Drawer).props.open, true, 'save and assign permissions opens the saved account details');
    assert.equal(requests.find(item => item.action === 'create').record.role, 'USER');
    assert.equal(requests.find(item => item.action === 'create').record.position, 'Kế Toán Trưởng');
    assert.equal(requests.find(item => item.action === 'create').record.details.personalEmail, 'new.personal@example.test');
    assert.equal(requests.find(item => item.action === 'create').record.details.manager, 'Actual Employee');
    assert.equal(requests.find(item => item.action === 'create').record.details.birthDate, '1998-02-03');
    assert.equal(requests.find(item => item.action === 'create').record.twoFactor, undefined);
    assert.equal(table().props.dataSource.length, 4);
    const created = table().props.dataSource.find(item => item.key === 'new-user');
    actions(created).find(node => node.type === 'Button' && text(node) === 'Hồ sơ').props.onClick(); render();
    await button('Sửa tài khoản').props.onClick(); render();
    assert.equal(forms[0].values.personalEmail, 'new.personal@example.test');
    assert.equal(forms[0].values.managerId, 'user-1');
    await form().props.onFinish({ ...forms[0].values, fullName: 'Updated User', department: 'Operations', role: 'USER' }); render();
    assert.equal(requests.find(item => item.action === 'update').patch.name, 'Updated User');
    assert.equal(table().props.dataSource.find(item => item.key === 'new-user').fullName, 'Updated User');
    const pending = table().props.dataSource.find(item => item.key === 'pending-1');
    actions(pending).find(node => node.type === 'Button' && text(node) === 'Gửi kích hoạt').props.onClick(); await tick(); render();
    assert.ok(requests.some(item => item.action === 'activation'));
    assert.ok(!requests.some(item => item.action === 'update' && item.key === 'pending-1'), 'pending invitation must not be silently activated');
    assert.ok(messages.some(item => item.level === 'warning' && item.text === 'SMTP is not configured'));
    const latest = table().props.dataSource.find(item => item.key === 'new-user');
    actions(latest).find(node => node.type === 'Button' && text(node) === 'Đổi MK').props.onClick(); await tick(); render();
    const passwordForm = () => nodes().filter(node => node.type === ui.Form)[1];
    await passwordForm().props.onFinish({ newPassword: 'Fresh-Password-26!', confirmPassword: 'mismatch' }); render();
    assert.ok(!requests.some(item => item.action === 'password'));
    fail = true;
    await passwordForm().props.onFinish({ newPassword: 'Fresh-Password-26!', confirmPassword: 'Fresh-Password-26!' }); render();
    assert.ok(!requests.some(item => item.action === 'password'));
    fail = false;
    await passwordForm().props.onFinish({ newPassword: 'Fresh-Password-26!', confirmPassword: 'Fresh-Password-26!' }); render();
    assert.equal(requests.find(item => item.action === 'password').key, 'new-user');
    await actions(latest).find(node => node.type === 'Button' && text(node) === 'Khóa').props.onClick(); render();
    assert.equal(table().props.dataSource.find(item => item.key === 'new-user').status, 'Đã khóa');
    nodes().find(node => node.type === ui.Input && node.props.placeholder?.startsWith('Tìm theo username')).props.onChange({ target: { value: 'NV-NEW' } }); render();
    button('Xuất Excel').props.onClick();
    const exported = await downloads[0].content.text();
    assert.ok(exported.includes('Updated User'));
    assert.ok(!exported.includes('Actual Admin'));
    assert.ok(!exported.includes('Fresh-Password-26!'));
    nodes().find(node => node.type === ui.Input && node.props.placeholder?.startsWith('Tìm theo username')).props.onChange({ target: { value: '' } }); render();
    auxFail = true;
    button('Làm mới').props.onClick(); await tick(); render();
    assert.equal(table().props.dataSource.length, 4, 'unavailable organization/session metadata must not hide actual users');
    assert.ok(table().props.dataSource.every(item => item.lastLogin === 'Chưa có dữ liệu phiên'));
    auxFail = false;
    actions(table().props.dataSource.find(item => item.key === 'new-user')).find(node => node.type === 'Button' && text(node) === 'Hồ sơ').props.onClick(); render();
    button('Xóa tài khoản').props.onClick();
    fail = true;
    await confirm.onOk(); render();
    assert.equal(table().props.dataSource.length, 4);
    fail = false;
    await confirm.onOk(); render();
    assert.equal(table().props.dataSource.length, 3);
  } finally { delete globalThis.__adminUsersTest; }
});
