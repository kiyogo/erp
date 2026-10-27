import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

test('payslip confirmation persists by record key and does not claim success after API failure', async () => {
  let reject = false;
  let saved;
  let payrollRecord = { key: 'pay-01', month: 'October', status: 'Chưa chi trả' };
  const api = {
    collectionsApi: {
      get: async () => ({ data: { data: [{ ...payrollRecord }] } }),
      update: async (scope, key, patch) => {
        if (reject) throw new Error('offline');
        saved = { scope, key, patch };
        if (scope === 'payroll') payrollRecord = { ...payrollRecord, ...patch };
      },
      replace: async () => ({}),
    },
    auditLogsApi: { record: async () => ({}) },
  };
  const source = readFileSync(new URL('../src/services/dataService.ts', import.meta.url), 'utf8');
  let { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } });
  outputText = outputText.replace(/import\s*\{([^}]+)\}\s*from ['"]\.\.\/api\/endpoints['"];?/, (_, names) => `const {${names}} = globalThis.__payslipTestApi;`);
  globalThis.__payslipTestApi = api;
  try {
    const { dataService } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
    dataService.getEmployeePayslips();
    await new Promise(resolve => setImmediate(resolve));
    await assert.rejects(dataService.signEmployeePayslip('October', 'Test'), /Không tìm thấy/);
    await dataService.signEmployeePayslip('pay-01', 'Test User');
    assert.equal(saved.key, 'pay-01');
    assert.equal(saved.scope, 'employee_payslips');
    assert.equal(saved.patch.signedStatus, 'Đã xác nhận');
    dataService.getPayroll();
    await new Promise(resolve => setImmediate(resolve));
    await dataService.updatePayrollStatus('pay-01', 'Đã chi trả');
    assert.deepEqual(saved, { scope: 'payroll', key: 'pay-01', patch: { status: 'Đã chi trả' } });
    assert.equal(dataService.getPayroll()[0].status, 'Đã chi trả');
    const before = JSON.stringify(dataService.getEmployeePayslips());
    reject = true;
    const payrollBeforeFailure = JSON.stringify(dataService.getPayroll());
    await assert.rejects(dataService.updatePayrollStatus('pay-01', 'Chưa chi trả'), /offline/);
    assert.equal(JSON.stringify(dataService.getPayroll()), payrollBeforeFailure);
    await assert.rejects(dataService.signEmployeePayslip('pay-01', 'Other User'), /offline/);
    assert.equal(JSON.stringify(dataService.getEmployeePayslips()), before);
    const requestedPages = [];
    api.collectionsApi.get = async (_, params) => {
      requestedPages.push(params.page);
      return { data: { data: [{ key: `page-${params.page}` }], pagination: { totalPages: 3 } } };
    };
    dataService.getGenericData('paged_test');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(requestedPages, [1, 2, 3]);
    assert.equal(dataService.getGenericData('paged_test').length, 3);

    let finishRead;
    api.collectionsApi.get = () => new Promise(resolve => { finishRead = resolve; });
    dataService.getGenericData('late_read_test');
    dataService.saveGenericData('late_read_test', [{ key: 'newer-change' }]);
    finishRead({ data: { data: [{ key: 'stale' }] } });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(dataService.getGenericData('late_read_test')[0].key, 'newer-change');
  } finally {
    delete globalThis.__payslipTestApi;
  }
});
