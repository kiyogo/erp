import assert from 'node:assert/strict';
import { test } from 'node:test';
import { foreignContractProblem, isForeignNationality, workPermitProblem } from '../foreignWorkerRules.mjs';
import { calculatePayslip } from '../payrollRules.mjs';

const permit = { nationality: 'Hàn Quốc', passportNumber: 'M12345678', workPermitStatus: 'permit', workPermitNumber: 'GP-01', workPermitIssueDate: '2026-01-10', workPermitExpiryDate: '2028-01-09' };

test('quốc tịch Việt Nam không phải người nước ngoài', () => {
  assert.equal(isForeignNationality('Việt Nam'), false);
  assert.equal(isForeignNationality('vietnam'), false);
  assert.equal(isForeignNationality(''), false);
  assert.equal(isForeignNationality('Nhật Bản'), true);
});

test('giấy phép tối đa 2 năm, gia hạn một lần tối đa 2 năm, miễn phải ghi căn cứ', () => {
  assert.equal(workPermitProblem(permit), '');
  assert.match(workPermitProblem({ ...permit, workPermitExpiryDate: '2028-01-11' }), /tối đa 02 năm/);
  assert.equal(workPermitProblem({ ...permit, workPermitExtended: true, workPermitPreviousExpiryDate: '2028-01-09', workPermitExpiryDate: '2030-01-09' }), '');
  assert.match(workPermitProblem({ ...permit, workPermitExtended: true, workPermitPreviousExpiryDate: '2028-01-09', workPermitExpiryDate: '2030-02-09' }), /gia hạn một lần/);
  assert.match(workPermitProblem({ ...permit, passportNumber: '' }), /hộ chiếu/);
  assert.match(workPermitProblem({ nationality: 'Mỹ', passportNumber: 'X1', workPermitStatus: 'exempt' }), /không thuộc diện/);
  assert.equal(workPermitProblem({ nationality: 'Việt Nam' }), '');
  // Hồ sơ không đổi các trường giấy phép thì không kiểm lại.
  assert.equal(workPermitProblem({ ...permit, workPermitExpiryDate: '2029-01-01' }, { ...permit, workPermitExpiryDate: '2029-01-01' }), '');
});

test('hợp đồng phải xác định thời hạn và không vượt giấy phép', () => {
  assert.match(foreignContractProblem(permit, { endDate: '', status: 'Còn hiệu lực' }), /xác định thời hạn/);
  assert.match(foreignContractProblem(permit, { endDate: '2028-06-30', status: 'Còn hiệu lực' }), /không được vượt/);
  assert.equal(foreignContractProblem(permit, { endDate: '2027-12-31', status: 'Chờ ký' }), '');
  assert.match(foreignContractProblem({ nationality: 'Pháp', workPermitStatus: 'pending' }, { endDate: '2027-01-01', status: 'Chờ ký' }), /chưa có giấy phép/);
  assert.equal(foreignContractProblem({ nationality: 'Pháp' }, { endDate: '', status: 'Dự thảo' }), '');
});

test('người nước ngoài không đóng bảo hiểm thất nghiệp', () => {
  const base = { period: '2026-03', region: 'I', baseSalary: 30_000_000 };
  assert.equal(calculatePayslip({ ...base, unemploymentInsured: false }).employeeInsurance.unemployment, 0);
  assert.equal(calculatePayslip(base).employeeInsurance.unemployment, 300_000);
});

test('ngày nghỉ thêm của người nước ngoài: Tết cổ truyền và Quốc khánh nước họ, dời khi trùng ngày nghỉ', async () => {
  const { personalHolidays, setHolidayOverrides } = await import('../holidayRules.mjs');
  const { monthCalendar } = await import('../timesheetRules.mjs');
  const { overtimeMinMultiplier } = await import('../attendanceRules.mjs');
  setHolidayOverrides({});
  const korean = { ...permit, homeNewYearRule: 'lunar', homeNationalDay: '10-03' };
  assert.deepEqual(personalHolidays(korean, 2026).map((item) => item.date), ['2026-02-23', '2026-10-05']);
  assert.equal(monthCalendar('2026-02', korean).holidayDays, 6);
  assert.equal(monthCalendar('2026-02').holidayDays, 5);
  assert.equal(overtimeMinMultiplier('2026-10-05', korean), 3);
  assert.equal(overtimeMinMultiplier('2026-10-05'), 1.5);
  assert.match(workPermitProblem({ ...permit, homeNationalDay: '13-40' }), /MM-DD/);
  assert.match(workPermitProblem({ ...permit, homeNewYearRule: 'fixed' }), /cố định/);
});
