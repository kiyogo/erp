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

test('báo cáo sử dụng lao động nước ngoài: người làm trong kỳ, thống kê và các vấn đề cần xử lý', async () => {
  const { buildForeignWorkerReport, foreignReportPeriod } = await import('../foreignWorkerRules.mjs');
  assert.equal(foreignReportPeriod('2026-h1').deadline, '2026-07-05');
  assert.equal(foreignReportPeriod('2026').deadline, '2027-01-05');
  assert.throws(() => foreignReportPeriod('2026-H3'), /Kỳ báo cáo/);
  const people = [
    { name: 'Kim', employeeCode: 'FW-1', details: { ...permit, foreignJobCategory: 'expert' }, joinDate: '2026-02-01', contract: { code: 'HD1', startDate: '2026-02-01', endDate: '2028-06-30' } },
    { name: 'Tanaka', employeeCode: 'FW-2', details: { nationality: 'Nhật Bản', workPermitStatus: 'pending' }, joinDate: '2026-05-01' },
    { name: 'Lan', employeeCode: 'VN-1', details: { nationality: 'Việt Nam' } },
    { name: 'Smith', employeeCode: 'FW-3', details: { nationality: 'Anh', workPermitStatus: 'exempt', workPermitExemptReason: 'Dưới 90 ngày' }, joinDate: '2026-08-01' },
  ];
  const report = buildForeignWorkerReport(people, '2026-H1');
  assert.equal(report.total, 2);
  assert.deepEqual(report.byNationality.map((item) => item.key).sort(), ['Hàn Quốc', 'Nhật Bản']);
  assert.ok(report.rows[0].issues.includes('Hợp đồng vượt thời hạn giấy phép'));
  assert.ok(report.rows[1].issues.includes('Chưa có giấy phép hoặc xác nhận miễn'));
  assert.equal(buildForeignWorkerReport(people, '2026').total, 3);
  assert.match(workPermitProblem({ ...permit, foreignJobCategory: 'intern' }), /Vị trí công việc/);
});

test('thị thực, thẻ tạm trú LĐ1 hoặc LĐ2 tối đa 02 năm, hết hạn trước hộ chiếu ít nhất 30 ngày, đúng ký hiệu với giấy phép', async () => {
  const { immigrationExpiries, buildForeignWorkerReport } = await import('../foreignWorkerRules.mjs');
  const withCard = { ...permit, passportExpiryDate: '2031-05-01', residenceCardType: 'LĐ2', residenceCardNumber: 'TT123', residenceCardIssueDate: '2026-02-01', residenceCardExpiryDate: '2028-01-09' };
  assert.equal(workPermitProblem(withCard), '');
  assert.match(workPermitProblem({ ...withCard, residenceCardType: 'LĐ1' }), /LĐ2, không phải LĐ1/);
  assert.match(workPermitProblem({ ...withCard, residenceCardExpiryDate: '2028-03-01' }), /không quá 02 năm/);
  assert.match(workPermitProblem({ ...withCard, passportExpiryDate: '2028-01-20' }), /trước hộ chiếu ít nhất 30 ngày/);
  assert.match(workPermitProblem({ ...withCard, visaType: 'LĐ2', visaNumber: '' }), /số thị thực/);
  assert.match(workPermitProblem({ ...withCard, residenceCardType: 'XX' }), /Chọn ký hiệu thẻ tạm trú/);
  assert.deepEqual(immigrationExpiries(withCard).map((item) => item.kind), ['passport', 'residence_card']);
  const report = buildForeignWorkerReport([{ name: 'Kim', employeeCode: 'FW-1', details: { ...permit, foreignJobCategory: 'expert' } }], '2026');
  assert.ok(report.rows[0].issues.includes('Chưa có thị thực hoặc thẻ tạm trú'));
});

test('cư trú thuế: 183 ngày trong năm, 12 tháng liên tục, thẻ tạm trú; không cư trú chịu 20% không giảm trừ', async () => {
  const { presenceDays, taxResidency, stayPeriodsProblem } = await import('../foreignWorkerRules.mjs');
  const stays = [{ entry: '2026-01-10', exit: '2026-04-10' }, { entry: '2026-05-01', exit: '2026-08-15' }];
  assert.equal(presenceDays(stays, '2026-01-01', '2026-12-31'), 196);
  assert.equal(taxResidency({ nationality: 'Hàn Quốc', stayPeriods: stays }, 2026).resident, true);
  const short = { nationality: 'Nhật Bản', stayPeriods: [{ entry: '2026-10-01' }] };
  assert.equal(taxResidency(short, 2026, '2026-11-22').resident, false);
  assert.equal(taxResidency(short, 2027, '2027-04-15').resident, true);
  assert.equal(taxResidency({ ...short, residenceCardNumber: 'TT', residenceCardIssueDate: '2026-10-05', residenceCardExpiryDate: '2028-10-01' }, 2026, '2026-11-22').resident, true);
  assert.equal(taxResidency({ ...short, taxResidentOverride: 'resident' }, 2026).resident, true);
  assert.equal(taxResidency({ nationality: 'Việt Nam' }, 2026).resident, true);
  const unknown = taxResidency({ nationality: 'Pháp' }, 2026);
  assert.equal(unknown.resident, true);
  assert.equal(unknown.unknown, true);
  assert.match(stayPeriodsProblem({ stayPeriods: [{ entry: '2026-01-10', exit: '2026-05-01' }, { entry: '2026-04-01', exit: '2026-06-01' }] }), /chồng thời gian/);
  assert.match(stayPeriodsProblem({ stayPeriods: [{ entry: '2026-01-10' }, { entry: '2026-04-01', exit: '2026-06-01' }] }), /lần ở cuối cùng/);
  const base = { period: '2026-03', region: 'I', baseSalary: 50_000_000, insuranceSalary: 0 };
  const nonResident = calculatePayslip({ ...base, residency: 'non_resident' });
  assert.equal(nonResident.tax, 10_000_000);
  assert.equal(nonResident.familyDeduction, 0);
  assert.ok(calculatePayslip(base).tax < 10_000_000);
});
