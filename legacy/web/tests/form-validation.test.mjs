import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/custom-ui/index.tsx', import.meta.url), 'utf8');
const file = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const node = file.statements.find(statement => ts.isClassDeclaration(statement) && statement.name?.text === 'FormStore');
assert.ok(node, 'Existing custom FormStore must remain present');
const { outputText } = ts.transpileModule(`export ${node.getText(file)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const { FormStore } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

test('required, email, URL and length rules block invalid values', async () => {
  const form = new FormStore();
  form.registerField('name', [{ required: true }], 'Tên');
  form.registerField('email', [{ type: 'email' }], 'Email');
  form.registerField('portal', [{ required: true, type: 'url' }], 'Cổng');
  form.registerField('password', [{ required: true, min: 12 }], 'Mật khẩu');
  form.setFieldsValue({ name: '   ', email: 'invalid', portal: 'javascript:alert(1)', password: 'short' });
  await assert.rejects(form.validateFields(), error => error.errorFields.length === 4);
  assert.ok(form.getFieldError('name').length);
  form.setFieldsValue({ name: 'Valid name', email: 'valid@example.test', portal: 'https://example.test', password: 'Long-enough-26!' });
  const values = await form.validateFields();
  assert.equal(values.email, 'valid@example.test');
  assert.deepEqual(form.getFieldError('name'), []);
});

test('defaults, zero values, reset and unmounted fields behave correctly', async () => {
  const form = new FormStore();
  form.setInitialValues({ department: 'Accounting' });
  form.registerField('amount', [{ required: true, type: 'number', min: 0 }], 'Số tiền', 0);
  const unregister = form.registerField('conditional', [{ required: true }]);
  await assert.rejects(form.validateFields(), error => error.errorFields[0].name[0] === 'conditional');
  unregister();
  assert.equal((await form.validateFields()).amount, 0);
  form.setFieldsValue({ amount: 100, department: 'Changed' });
  form.resetFields();
  assert.equal(form.getFieldValue('amount'), 0);
  assert.equal(form.getFieldValue('department'), 'Accounting');
});

test('optional blank values, patterns and async validators are respected', async () => {
  const form = new FormStore();
  form.registerField('email', [{ type: 'email' }]);
  form.registerField('code', [{ pattern: /^[A-Z]{2}$/ }]);
  form.registerField('verified', [{ validator: async (_, value) => { if (value !== 'yes') throw new Error('Chưa xác minh'); } }]);
  form.setFieldsValue({ code: 'a', verified: 'no' });
  await assert.rejects(form.validateFields(), error => error.errorFields.length === 2);
  form.setFieldsValue({ code: 'AB', verified: 'yes' });
  assert.equal((await form.validateFields()).code, 'AB');
});

test('modal footer submit calls the mounted form and unregisters on close', async () => {
  const form = new FormStore();
  let called = 0;
  const detach = form.setSubmitHandler(async () => { called++; });
  await form.submit();
  assert.equal(called, 1);
  detach();
  await assert.rejects(form.submit(), /chưa được mở/);
});
