// Chứng từ khấu trừ thuế TNCN (tiền lương, tiền công) do doanh nghiệp tự lập dạng điện tử cho người lao động.
// Căn cứ: Nghị định 123/2020/NĐ-CP Điều 32 khoản 1 (sửa đổi bởi khoản 18 Điều 1 Nghị định 70/2025/NĐ-CP, từ 01/6/2025): tên chứng từ, ký hiệu mẫu,
// ký hiệu, số thứ tự; tên, địa chỉ, mã số thuế, số điện thoại của tổ chức trả thu nhập; tên, địa chỉ, mã số thuế hoặc số định danh, số điện thoại,
// quốc tịch của cá nhân; khoản thu nhập, thời điểm trả thu nhập, tổng thu nhập chịu thuế, khoản đóng bảo hiểm bắt buộc, khoản từ thiện, khuyến học,
// số thuế đã khấu trừ; ngày lập; người lập và chữ ký số của tổ chức. Thông tư 111/2013/TT-BTC Điều 25 khoản 2: cá nhân ủy quyền quyết toán thì tổ
// chức không cấp chứng từ khấu trừ cho năm đó. Xác minh qua bài tổng hợp (meinvoice.vn, misa.vn, thuvienphapluat.vn, sapo.vn), chưa đối chiếu bản
// gốc; định dạng ký hiệu mẫu, ký hiệu và dữ liệu XML gửi cơ quan thuế chưa xác nhận nên hệ thống chưa ký số, chưa gửi cơ quan thuế.

const money = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0);

export function voucherNumber(sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 9_999_999) throw new Error('Số chứng từ vượt giới hạn 7 chữ số.');
  return String(sequence).padStart(7, '0');
}

// payslips: phiếu lương đã chốt của người lao động ({ month: 'YYYY-MM', gross, exemptIncome, insuranceDeduction, taxDeduction }).
export function buildPitVoucher({ company, person, payslips, year, fromMonth, toMonth }) {
  if (!Number.isInteger(year) || year < 2024 || year > 2200) throw new Error('Năm trả thu nhập không hợp lệ.');
  if (!Number.isInteger(fromMonth) || !Number.isInteger(toMonth) || fromMonth < 1 || toMonth > 12 || fromMonth > toMonth) throw new Error('Kỳ trả thu nhập phải từ tháng 1 đến tháng 12, tháng bắt đầu không sau tháng kết thúc.');
  const inPeriod = payslips.filter((slip) => {
    const [slipYear, slipMonth] = String(slip.month || '').split('-').map(Number);
    return slipYear === year && slipMonth >= fromMonth && slipMonth <= toMonth;
  });
  if (!inPeriod.length) throw new Error('Không có phiếu lương đã chốt trong kỳ đã chọn.');
  const totalIncome = inPeriod.reduce((sum, slip) => sum + money(slip.gross), 0);
  const exemptIncome = Math.min(totalIncome, inPeriod.reduce((sum, slip) => sum + money(slip.exemptIncome), 0));
  const contentIssues = [];
  if (!company.name) contentIssues.push('Thiếu tên tổ chức trả thu nhập trong hồ sơ doanh nghiệp.');
  if (!company.taxCode) contentIssues.push('Thiếu mã số thuế tổ chức trả thu nhập.');
  if (!company.address) contentIssues.push('Thiếu địa chỉ tổ chức trả thu nhập.');
  if (!person.taxCode && !person.identityNumber) contentIssues.push('Người lao động chưa có mã số thuế hoặc số định danh cá nhân.');
  if (!person.address) contentIssues.push('Người lao động chưa có địa chỉ.');
  return {
    year, fromMonth, toMonth,
    incomeType: 'Tiền lương, tiền công',
    paymentPeriod: `Tháng ${fromMonth}${fromMonth === toMonth ? '' : ` đến tháng ${toMonth}`} năm ${year}`,
    months: inPeriod.length,
    totalIncome,
    taxableIncome: totalIncome - exemptIncome,
    exemptIncome,
    insurance: inPeriod.reduce((sum, slip) => sum + money(slip.insuranceDeduction), 0),
    charity: 0,
    taxWithheld: inPeriod.reduce((sum, slip) => sum + money(slip.taxDeduction), 0),
    company, person, contentIssues,
  };
}
