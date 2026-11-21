// Khấu trừ thuế TNCN khi trả tiền công, tiền thù lao cho cá nhân không ký hợp đồng lao động hoặc hợp đồng dưới 3 tháng (thu nhập vãng lai).
// Căn cứ: Thông tư 111/2013/TT-BTC Điều 25 khoản 1 điểm i (cá nhân cư trú: khấu trừ 10% trên thu nhập khi tổng mức trả từ 2.000.000 đồng/lần trở lên;
// cá nhân chỉ có một nguồn thu nhập, ước tính tổng thu nhập chịu thuế sau giảm trừ gia cảnh chưa đến mức phải nộp thuế được làm cam kết mẫu 08/CK-TNCN
// (Thông tư 80/2021/TT-BTC) để tạm thời chưa khấu trừ, phải có mã số thuế tại thời điểm cam kết), Luật Thuế TNCN Điều 18, 25 (cá nhân không cư trú: 20%
// trên thu nhập từ tiền lương, tiền công, không giảm trừ). Luật 109/2025/QH15 có hiệu lực từ 01/7/2026 và Nghị định 253/2026/NĐ-CP hướng dẫn; dự thảo
// từng đề xuất nâng ngưỡng lên 3.000.000 đồng/lần nhưng chưa xác nhận văn bản chính thức nên từ 01/7/2026 vẫn dùng 2.000.000 đồng kèm cảnh báo.
// Xác minh qua bài tổng hợp (thuvienphapluat.vn, ey.com), chưa đối chiếu bản gốc.

const THRESHOLD_SETS = [
  { from: '2013-09-01', threshold: 2_000_000, verified: true },
  { from: '2026-07-01', threshold: 2_000_000, verified: false },
];
export const RESIDENT_RATE = 0.10;
export const NON_RESIDENT_RATE = 0.20;

const isoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export function casualThreshold(paymentDate) {
  return THRESHOLD_SETS.filter((set) => set.from <= paymentDate).at(-1);
}

export function calculateCasualIncomeTax({ amount, paymentDate, residency, commitment, taxCode }) {
  const value = Number(amount);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Số tiền chi trả phải là số nguyên dương (VND).');
  if (!isoDate(paymentDate)) throw new Error('Ngày chi trả không hợp lệ.');
  if (!['resident', 'non_resident'].includes(residency)) throw new Error('Chọn cá nhân cư trú hoặc không cư trú.');
  const set = casualThreshold(paymentDate);
  const warnings = [];
  if (!set.verified) warnings.push('Ngưỡng 2.000.000 đồng/lần cho kỳ từ 01/7/2026 chưa đối chiếu được Nghị định 253/2026; kiểm tra trước khi nộp.');
  let rate = 0;
  let basis = '';
  if (residency === 'non_resident') {
    if (commitment) throw new Error('Cá nhân không cư trú không được làm cam kết 08/CK-TNCN.');
    rate = NON_RESIDENT_RATE;
    basis = 'Cá nhân không cư trú: 20% trên thu nhập.';
  } else if (commitment) {
    if (!/^\d{10}$|^\d{12}$/.test(String(taxCode || '').trim())) throw new Error('Cá nhân làm cam kết 08/CK-TNCN phải có mã số thuế (10 số hoặc số định danh 12 số).');
    basis = 'Có cam kết 08/CK-TNCN: tạm thời chưa khấu trừ.';
  } else if (value >= set.threshold) {
    rate = RESIDENT_RATE;
    basis = `Cá nhân cư trú, mức trả từ ${set.threshold.toLocaleString('vi-VN')} đồng/lần: khấu trừ 10%.`;
  } else {
    basis = `Mức trả dưới ${set.threshold.toLocaleString('vi-VN')} đồng/lần: không khấu trừ.`;
  }
  const tax = Math.round(value * rate);
  return {
    amount: value, residency, commitment: Boolean(commitment), rate, tax, netPayment: value - tax, threshold: set.threshold, basis, warnings,
    // Bút toán gợi ý: chi phí theo số tiền trả, Có 3335 thuế TNCN khấu trừ, Có 111/112 số thực chi.
    journal: [
      { account: '642', debit: value, credit: 0, note: 'Chi phí thuê ngoài (đổi tài khoản theo mục đích)' },
      ...(tax ? [{ account: '3335', debit: 0, credit: tax, note: 'Thuế TNCN đã khấu trừ' }] : []),
      { account: '111', debit: 0, credit: value - tax, note: 'Tiền thực chi (đổi 112 nếu chuyển khoản)' },
    ],
  };
}

// Người có cam kết 08/CK-TNCN mà tổng tiền nhận trong năm vượt mức giảm trừ bản thân cả năm thì cam kết không còn phù hợp.
export function commitmentOverLimit(totalInYear, personalDeductionYear) {
  return totalInYear > personalDeductionYear;
}
