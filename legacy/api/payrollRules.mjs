// Quy tắc tính lương: bảo hiểm bắt buộc và thuế thu nhập cá nhân từ tiền lương, tiền công.
// Mỗi bộ tham số có căn cứ pháp lý và kỳ lương bắt đầu áp dụng (YYYY-MM). Khi pháp luật đổi,
// chỉ thêm một bộ tham số mới ở đây, không sửa bộ cũ để vẫn tính lại đúng các kỳ lương đã qua.
// Số tiền dùng đồng Việt Nam, làm tròn đến đồng ở từng khoản.

export const FIRST_SUPPORTED_PERIOD = '2024-07';

// Thuế TNCN từ tiền lương, tiền công của cá nhân cư trú. Biểu theo thu nhập tính thuế mỗi tháng.
const PIT_PARAMETER_SETS = [
  {
    from: '2020-07',
    personalDeduction: 11_000_000,
    dependentDeduction: 4_400_000,
    brackets: [
      { upTo: 5_000_000, rate: 0.05 }, { upTo: 10_000_000, rate: 0.10 }, { upTo: 18_000_000, rate: 0.15 },
      { upTo: 32_000_000, rate: 0.20 }, { upTo: 52_000_000, rate: 0.25 }, { upTo: 80_000_000, rate: 0.30 },
      { upTo: Infinity, rate: 0.35 },
    ],
    basis: 'Luật Thuế TNCN 04/2007/QH12 (sửa đổi), Nghị quyết 954/2020/UBTVQH14',
  },
  {
    from: '2026-01',
    personalDeduction: 15_500_000,
    dependentDeduction: 6_200_000,
    brackets: [
      { upTo: 10_000_000, rate: 0.05 }, { upTo: 30_000_000, rate: 0.10 }, { upTo: 60_000_000, rate: 0.20 },
      { upTo: 100_000_000, rate: 0.30 }, { upTo: Infinity, rate: 0.35 },
    ],
    basis: 'Luật Thuế TNCN 109/2025/QH15 (Điều 9), Nghị quyết 110/2025/UBTVQH15 (kỳ tính thuế 2026)',
  },
];

// Mức lương cơ sở. Mức tham chiếu của Luật BHXH 2024 bằng mức lương cơ sở khi chưa bãi bỏ lương cơ sở.
const BASE_SALARY_SETS = [
  { from: '2024-07', amount: 2_340_000, basis: 'Nghị định 73/2024/NĐ-CP' },
  { from: '2026-07', amount: 2_530_000, basis: 'Nghị định 161/2026/NĐ-CP' },
];

// Lương tối thiểu tháng theo vùng, dùng làm trần đóng bảo hiểm thất nghiệp (20 lần).
const REGIONAL_MINIMUM_WAGE_SETS = [
  { from: '2024-07', amounts: { I: 4_960_000, II: 4_410_000, III: 3_860_000, IV: 3_450_000 }, basis: 'Nghị định 74/2024/NĐ-CP' },
  { from: '2026-01', amounts: { I: 5_310_000, II: 4_730_000, III: 4_140_000, IV: 3_700_000 }, basis: 'Nghị định 293/2025/NĐ-CP' },
];

export const INSURANCE_RATES = {
  employee: { social: 0.08, health: 0.015, unemployment: 0.01 },
  employer: { social: 0.175, health: 0.03, unemployment: 0.01 },
  basis: 'Luật BHXH 41/2024/QH15, Luật BHYT, Luật Việc làm; tỷ lệ BHXH của doanh nghiệp gồm 0,5% tai nạn lao động, bệnh nghề nghiệp',
};

export const INSURANCE_CAP_MULTIPLIER = 20;
export const REGIONS = ['I', 'II', 'III', 'IV'];

export function normalizePeriod(value) {
  const text = String(value || '').trim();
  const iso = /^(\d{4})-(\d{1,2})$/.exec(text);
  const local = /^(\d{1,2})[/-](\d{4})$/.exec(text);
  const year = iso ? iso[1] : local ? local[2] : '';
  const month = Number(iso ? iso[2] : local ? local[1] : 0);
  if (!year || month < 1 || month > 12) throw new Error('Kỳ lương phải có dạng YYYY-MM hoặc MM/YYYY.');
  return `${year}-${String(month).padStart(2, '0')}`;
}

function pickSet(sets, period) {
  let chosen = null;
  for (const set of sets) if (set.from <= period) chosen = set;
  return chosen;
}

export function payrollParameters(periodInput, region) {
  const period = normalizePeriod(periodInput);
  if (period < FIRST_SUPPORTED_PERIOD) throw new Error(`Chưa hỗ trợ tính lương cho kỳ trước ${FIRST_SUPPORTED_PERIOD}.`);
  if (!REGIONS.includes(region)) throw new Error('Vùng lương tối thiểu phải là I, II, III hoặc IV.');
  const pit = pickSet(PIT_PARAMETER_SETS, period);
  const baseSalary = pickSet(BASE_SALARY_SETS, period);
  const minimumWage = pickSet(REGIONAL_MINIMUM_WAGE_SETS, period);
  return {
    period, region, pit,
    baseSalaryReference: baseSalary.amount,
    socialHealthCap: INSURANCE_CAP_MULTIPLIER * baseSalary.amount,
    regionalMinimumWage: minimumWage.amounts[region],
    unemploymentCap: INSURANCE_CAP_MULTIPLIER * minimumWage.amounts[region],
    legalBasis: [pit.basis, baseSalary.basis, minimumWage.basis, INSURANCE_RATES.basis],
  };
}

export function progressiveTax(taxableIncome, brackets) {
  let remaining = Math.max(0, taxableIncome);
  let previousLimit = 0;
  let tax = 0;
  for (const bracket of brackets) {
    const width = bracket.upTo - previousLimit;
    const part = Math.min(remaining, width);
    tax += part * bracket.rate;
    remaining -= part;
    previousLimit = bracket.upTo;
    if (remaining <= 0) break;
  }
  return Math.round(tax);
}

// Đếm người phụ thuộc đang được giảm trừ trong kỳ lương, theo ngày bắt đầu và kết thúc đăng ký.
export function countActiveDependents(familyMembers, periodInput) {
  const period = normalizePeriod(periodInput);
  const [year, month] = period.split('-').map(Number);
  const periodStart = `${period}-01`;
  const periodEnd = `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
  if (!Array.isArray(familyMembers)) return 0;
  return familyMembers.filter((member) => {
    if (!member || member.isDependent !== true) return false;
    const start = String(member.dependentStartDate || '').slice(0, 10);
    const end = String(member.dependentEndDate || '').slice(0, 10);
    if (start && start > periodEnd) return false;
    if (end && end < periodStart) return false;
    return true;
  }).length;
}

function readAmount(value, label) {
  const number = value === undefined || value === null || value === '' ? 0 : Number(value);
  if (!Number.isFinite(number) || number < 0 || !Number.isSafeInteger(Math.round(number))) throw new Error(`${label} phải là số tiền không âm hợp lệ.`);
  return Math.round(number);
}

// Lương theo ngày công và làm thêm giờ.
// Làm thêm giờ: Bộ luật Lao động 2019 Điều 98 (ít nhất 150% ngày thường, 200% ngày nghỉ hằng tuần) và Nghị định 145/2020/NĐ-CP Điều 55
// (tiền lương giờ lấy lương thực trả chia cho số giờ làm việc bình thường của tháng). Phần trả cao hơn lương giờ bình thường được miễn thuế TNCN.
export const STANDARD_DAILY_HOURS = 8;
export const OVERTIME_RATES = { weekday: 1.5, weekend: 2 };
export const OVERTIME_LEGAL_BASIS = ['Bộ luật Lao động 2019 Điều 98', 'Nghị định 145/2020/NĐ-CP Điều 55'];

function readQuantity(value, label, { positive = false, max = Infinity } = {}) {
  const number = value === undefined || value === null || value === '' ? 0 : Number(value);
  if (!Number.isFinite(number) || number < 0 || number > max || (positive && number <= 0)) throw new Error(`${label} không hợp lệ.`);
  return number;
}

/**
 * Lương cơ bản theo ngày công thực tế và tiền làm thêm giờ của một tháng.
 * - Lương tính theo ngày công = lương cơ bản x ngày hưởng lương / ngày công chuẩn; ngày hưởng lương vượt ngày công chuẩn không
 *   làm tăng lương cơ bản (phần làm thêm phải ghi vào giờ làm thêm).
 * - Tiền làm thêm = lương giờ x số giờ x hệ số; lương giờ = lương cơ bản của hợp đồng / ngày công chuẩn / 8 giờ.
 */
export function workdayPay({ baseSalary, standardDays, payDays, otHoursWeekday, otHoursWeekend }) {
  const base = readAmount(baseSalary, 'Lương cơ bản');
  const standard = readQuantity(standardDays, 'Ngày công chuẩn', { positive: true, max: 31 });
  const paid = readQuantity(payDays, 'Ngày công hưởng lương', { max: 31 });
  const weekdayHours = readQuantity(otHoursWeekday, 'Giờ làm thêm ngày thường', { max: 744 });
  const weekendHours = readQuantity(otHoursWeekend, 'Giờ làm thêm ngày nghỉ', { max: 744 });
  const warnings = [];
  const counted = Math.min(paid, standard);
  if (paid > standard) warnings.push(`Ngày hưởng lương ${paid} vượt ngày công chuẩn ${standard}; chỉ tính ${standard} ngày, phần còn lại cần ghi nhận là giờ làm thêm.`);
  const proratedBase = Math.round(base * counted / standard);
  const hourly = base / standard / STANDARD_DAILY_HOURS;
  const normalWeekday = Math.round(hourly * weekdayHours);
  const normalWeekend = Math.round(hourly * weekendHours);
  const weekdayPay = Math.round(hourly * weekdayHours * OVERTIME_RATES.weekday);
  const weekendPay = Math.round(hourly * weekendHours * OVERTIME_RATES.weekend);
  return {
    standardDays: standard, payDays: counted, proratedBase, hourlyWage: Math.round(hourly),
    overtime: {
      weekdayHours, weekendHours, weekdayPay, weekendPay, pay: weekdayPay + weekendPay,
      exempt: (weekdayPay - normalWeekday) + (weekendPay - normalWeekend),
      legalBasis: OVERTIME_LEGAL_BASIS,
    },
    warnings,
  };
}

/**
 * Tính một phiếu lương tháng.
 * - baseSalary, allowance, bonus, overtimePay: thu nhập chịu thuế trong tháng.
 * - insuranceSalary: tiền lương đóng bảo hiểm, mặc định bằng baseSalary.
 * - exemptIncome: phần thu nhập miễn thuế trong tổng thu nhập (ví dụ phụ cấp được miễn theo quy định).
 */
export function calculatePayslip(input) {
  const params = payrollParameters(input.period, input.region);
  const baseSalary = readAmount(input.baseSalary, 'Lương cơ bản');
  const allowance = readAmount(input.allowance, 'Phụ cấp');
  const bonus = readAmount(input.bonus, 'Thưởng');
  const overtimePay = readAmount(input.overtimePay, 'Tiền làm thêm giờ');
  const exemptIncome = readAmount(input.exemptIncome, 'Thu nhập miễn thuế');
  const insuranceSalary = input.insuranceSalary === undefined || input.insuranceSalary === null || input.insuranceSalary === ''
    ? baseSalary : readAmount(input.insuranceSalary, 'Lương đóng bảo hiểm');
  const dependents = Math.max(0, Math.floor(Number(input.dependents) || 0));
  const gross = baseSalary + allowance + bonus + overtimePay;
  if (exemptIncome > gross) throw new Error('Thu nhập miễn thuế không được lớn hơn tổng thu nhập.');

  const socialBase = Math.min(insuranceSalary, params.socialHealthCap);
  const unemploymentBase = Math.min(insuranceSalary, params.unemploymentCap);
  const employee = {
    social: Math.round(socialBase * INSURANCE_RATES.employee.social),
    health: Math.round(socialBase * INSURANCE_RATES.employee.health),
    unemployment: Math.round(unemploymentBase * INSURANCE_RATES.employee.unemployment),
  };
  const employer = {
    social: Math.round(socialBase * INSURANCE_RATES.employer.social),
    health: Math.round(socialBase * INSURANCE_RATES.employer.health),
    unemployment: Math.round(unemploymentBase * INSURANCE_RATES.employer.unemployment),
  };
  const employeeInsurance = employee.social + employee.health + employee.unemployment;
  const employerInsurance = employer.social + employer.health + employer.unemployment;

  const familyDeduction = params.pit.personalDeduction + dependents * params.pit.dependentDeduction;
  const taxableIncome = Math.max(0, gross - exemptIncome - employeeInsurance - familyDeduction);
  const tax = progressiveTax(taxableIncome, params.pit.brackets);
  const warnings = [];
  if (insuranceSalary > 0 && insuranceSalary < params.regionalMinimumWage) {
    warnings.push(`Lương đóng bảo hiểm thấp hơn lương tối thiểu vùng ${params.region} (${params.regionalMinimumWage.toLocaleString('vi-VN')} đồng).`);
  }
  if (insuranceSalary === 0) warnings.push('Lương đóng bảo hiểm bằng 0, không phát sinh bảo hiểm bắt buộc.');
  return {
    period: params.period, region: params.region, gross, baseSalary, allowance, bonus, overtimePay, exemptIncome,
    insuranceSalary, socialHealthBase: socialBase, unemploymentBase,
    employeeInsurance: { ...employee, total: employeeInsurance },
    employerInsurance: { ...employer, total: employerInsurance },
    dependents, familyDeduction, taxableIncome, tax,
    insuranceDeduction: employeeInsurance, taxDeduction: tax,
    netSalary: gross - employeeInsurance - tax,
    warnings, legalBasis: params.legalBasis,
  };
}
