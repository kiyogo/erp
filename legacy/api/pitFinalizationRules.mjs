// Quyết toán thuế TNCN năm từ tiền lương, tiền công do tổ chức trả thu nhập quyết toán thay cá nhân cư trú đã ủy quyền.
// Căn cứ: Luật Thuế TNCN (Thông tư 111/2013/TT-BTC Điều 9: giảm trừ bản thân tính đủ 12 tháng khi quyết toán, người phụ thuộc tính theo số
// tháng thực tế được giảm trừ), Nghị định 126/2020/NĐ-CP Điều 8 khoản 6 điểm d (điều kiện ủy quyền: hợp đồng lao động từ 3 tháng trở lên tại tổ
// chức và thực tế đang làm việc tại thời điểm quyết toán, kể cả chưa đủ 12 tháng; thu nhập vãng lai nơi khác bình quân tháng không quá 10 triệu
// đồng đã khấu trừ 10% và không yêu cầu quyết toán phần này), Thông tư 80/2021/TT-BTC (mẫu 05/QTT-TNCN, 08/UQ-QTT-TNCN), Luật Quản lý thuế
// 38/2019/QH14 Điều 44 (hạn nộp hồ sơ quyết toán năm của tổ chức: ngày cuối cùng của tháng thứ 3 sau năm; trùng ngày nghỉ thì dời sang ngày làm
// việc kế tiếp). Biểu thuế và mức giảm trừ lấy theo payrollRules.mjs của kỳ tính thuế (năm 2025: 11 triệu, 4,4 triệu, 7 bậc; năm 2026: 15,5 triệu,
// 6,2 triệu, 5 bậc theo Luật 109/2025/QH15 và Nghị quyết 110/2025/UBTVQH15); biểu năm bằng biểu tháng nhân 12. Xác minh qua bài tổng hợp
// (thuvienphapluat.vn, vneconomy.vn, ey.com), chưa đối chiếu bản gốc; giảm trừ từ thiện, khuyến học, nhân đạo và bảo hiểm hưu trí tự nguyện chưa có.
import { countActiveDependents, payrollParameters, progressiveTax } from './payrollRules.mjs';
import { nextWorkingDay } from './taxRules.mjs';

const money = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0);

export function finalizationDeadline(year) {
  return nextWorkingDay(`${year + 1}-03-31`);
}

// Điều kiện được ủy quyền: trả về danh sách lý do không đủ điều kiện (rỗng là đủ).
export function authorizationProblems({ employed, contractMonths, otherIncomeMonthlyAverage = 0 }) {
  const problems = [];
  if (!employed) problems.push('Người lao động không còn làm việc tại thời điểm quyết toán.');
  if (!(contractMonths >= 3)) problems.push('Chưa có hợp đồng lao động từ 3 tháng trở lên (hoặc không xác định thời hạn) tại doanh nghiệp.');
  if (money(otherIncomeMonthlyAverage) > 10_000_000) problems.push('Thu nhập vãng lai nơi khác bình quân trên 10 triệu đồng một tháng: cá nhân phải tự quyết toán.');
  return problems;
}

// payslips: phiếu lương trong năm của một người ({ month: 'YYYY-MM', gross, exemptIncome, insuranceDeduction, taxDeduction }).
export function annualPitFinalization({ year, payslips, familyMembers }) {
  if (!Number.isInteger(year) || year < 2024 || year > 2200) throw new Error('Năm quyết toán không hợp lệ.');
  const params = payrollParameters(`${year}-12`, 'I').pit;
  const lines = payslips.filter((slip) => String(slip.month || '').startsWith(`${year}-`));
  const totalIncome = lines.reduce((sum, slip) => sum + money(slip.gross), 0);
  const exemptIncome = Math.min(totalIncome, lines.reduce((sum, slip) => sum + money(slip.exemptIncome), 0));
  const insurance = lines.reduce((sum, slip) => sum + money(slip.insuranceDeduction), 0);
  const withheld = lines.reduce((sum, slip) => sum + money(slip.taxDeduction), 0);
  let dependentMonths = 0;
  for (let month = 1; month <= 12; month++) dependentMonths += countActiveDependents(familyMembers, `${year}-${String(month).padStart(2, '0')}`);
  const personalDeduction = params.personalDeduction * 12;
  const dependentDeduction = params.dependentDeduction * dependentMonths;
  const taxableIncome = Math.max(0, totalIncome - exemptIncome - insurance - personalDeduction - dependentDeduction);
  const annualBrackets = params.brackets.map((bracket) => ({ ...bracket, upTo: bracket.upTo * 12 }));
  const annualTax = progressiveTax(taxableIncome, annualBrackets);
  const difference = annualTax - withheld;
  return {
    year, months: lines.length, totalIncome, exemptIncome, insurance, personalDeduction, dependentMonths, dependentDeduction, taxableIncome,
    annualTax, withheld, difference, result: difference > 0 ? 'Nộp thêm' : difference < 0 ? 'Nộp thừa' : 'Đã nộp đủ',
    deadline: finalizationDeadline(year), legalBasis: params.basis,
  };
}
