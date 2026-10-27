import assert from 'node:assert/strict';
import { test } from 'node:test';
import { travelDateRangeDays, travelEmployeeSnapshot, travelExportRows, travelLocalDate, travelMoney, travelSettlementStatus } from '../src/modules/business/businessTravelRules.ts';

test('travel date range counts inclusive days and rejects impossible or backwards ranges', () => {
  assert.equal(travelLocalDate(new Date(2026, 9, 26, 0, 15)), '2026-10-26');
  assert.equal(travelDateRangeDays('2028-02-28', '2028-03-01'), 3);
  for (const [from, to] of [['2026-02-29', '2026-03-01'], ['2026-10-27', '2026-10-26'], ['', '2026-10-26']]) {
    assert.throws(() => travelDateRangeDays(from, to));
  }
});

test('travel money accepts zero without replacing missing, fractional or unsafe values', () => {
  assert.equal(travelMoney('0', 'Dự toán'), 0);
  assert.equal(travelMoney('1200000', 'Dự toán'), 1200000);
  for (const value of ['', undefined, '-1', '1.25', '9007199254740992', 'nope']) assert.throws(() => travelMoney(value, 'Dự toán'));
});

test('travel employee snapshot only accepts an active employee and stores the selected profile', () => {
  const employees = [
    { key: 'e1', id: 'e1', fullName: 'Nguyen An', name: 'An', employeeCode: 'NV01', code: 'NV01', department: 'Sales', position: 'Manager', status: 'Chính thức', isActive: true },
    { key: 'e2', id: 'e2', fullName: 'Nguyen Binh', name: 'Binh', employeeCode: 'NV02', code: 'NV02', department: 'Ops', position: 'Staff', status: 'Đã nghỉ việc', isActive: false },
  ];
  assert.deepEqual(travelEmployeeSnapshot(employees, 'e1'), { employeeId: 'e1', employeeName: 'Nguyen An', empCode: 'NV01', department: 'Sales', position: 'Manager' });
  assert.throws(() => travelEmployeeSnapshot(employees, 'e2'));
  assert.throws(() => travelEmployeeSnapshot(employees, 'missing'));
});

test('settlement status reflects actual expense and a recorded document reference', () => {
  assert.equal(travelSettlementStatus(0, 'INV-1'), 'Chưa quyết toán');
  assert.equal(travelSettlementStatus(120000, ''), 'Chờ nộp hóa đơn đỏ');
  assert.equal(travelSettlementStatus(120000, 'INV-1'), 'Đã quyết toán xong');
  assert.equal(travelSettlementStatus(120000, '', true), 'Đã quyết toán xong');
});

test('travel export contains an actual data row after its header', () => {
  const rows = travelExportRows([{ travelCode: 'CT-1', employeeName: 'Nguyen An', budgetEstimated: 500, status: 'Đã duyệt công tác' }]);
  assert.equal(rows.length, 2);
  assert.equal(rows[1][0], 'CT-1');
  assert.equal(rows[1][14], 500);
});
