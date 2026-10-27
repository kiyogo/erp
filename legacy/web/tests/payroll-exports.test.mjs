import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/modules/finance/payrollExports.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
const exports = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const payroll = (patch = {}) => ({
  key: 'pay-01', employeeCode: 'E-01', employeeName: 'Nguyễn An', department: 'Kế toán',
  baseSalary: 20_000_000, workDays: 21, allowance: 1_000_000, bonus: 2_000_000,
  insuranceDeduction: 2_100_000, taxDeduction: 500_000, netSalary: 20_400_000,
  month: '2026-08', status: 'Chưa chi trả', ...patch,
});

test('payroll periods normalize supported month formats and filter dated records', () => {
  assert.equal(exports.normalizePayrollMonth('2026-08-31'), '08/2026');
  assert.equal(exports.normalizePayrollMonth('08/2026'), '08/2026');
  assert.deepEqual(exports.filterPayrollForMonth([payroll(), payroll({ key: 'pay-02', month: '07/2026' })], '08/2026').map((item) => item.key), ['pay-01']);
  assert.equal(exports.filterPayrollForMonth([payroll({ month: '' })], '08/2026').length, 1);
});

test('payroll workbook rows contain only stored attendance and calculated deductions', () => {
  const record = payroll();
  const attendance = exports.payrollReportRows([record], 'attendance', '08/2026');
  assert.deepEqual(attendance.at(-1), ['E-01', 'Nguyễn An', 'Kế toán', 21]);
  assert.ok(!JSON.stringify(attendance).includes('22'));
  const insurance = exports.payrollReportRows([record], 'insurance', '08/2026');
  assert.deepEqual(insurance.at(-1), ['E-01', 'Nguyễn An', 20_000_000, 1_600_000, 300_000, 200_000, 2_100_000, 4_300_000]);
  assert.ok(!JSON.stringify(exports.payrollReportRows([record], 'tax', '08/2026')).includes('11.000.000'));
});

test('bank transfer export includes only unpaid staff with approved real bank accounts', () => {
  const result = exports.payrollBankRows([
    payroll(),
    payroll({ key: 'pay-02', employeeCode: 'E-02', status: 'Đã chi trả' }),
    payroll({ key: 'pay-03', employeeCode: 'E-03' }),
  ], [
    { employeeCode: 'E-01', bankName: 'VCB', accountNumber: '123456', accountHolder: 'NGUYEN AN', status: 'Đã duyệt', isPrimary: true },
    { employeeCode: 'E-02', bankName: 'VCB', accountNumber: '654321', accountHolder: 'PAID', status: 'Đã duyệt' },
    { employeeCode: 'E-03', bankName: 'VCB', accountNumber: '111111', accountHolder: 'PENDING', status: 'Chờ duyệt' },
  ], '08/2026');
  assert.deepEqual(result.rows.at(-1), ['NGUYEN AN', '123456', 'VCB', 20_400_000, 'Luong 08-2026']);
  assert.equal(result.rows.length, 3);
  assert.equal(result.skipped, 1);
});
