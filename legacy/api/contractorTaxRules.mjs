// Thuế nhà thầu nước ngoài (bên Việt Nam khấu trừ, nộp thay theo phương pháp tỷ lệ % trên doanh thu): thuế GTGT và thuế TNDN.
// Căn cứ: Thông tư 103/2014/TT-BTC Điều 12, 13 (tỷ lệ % theo ngành và công thức quy đổi khi giá hợp đồng chưa gồm thuế), từ 01/7/2025 phần thuế GTGT
// thực hiện theo Thông tư 69/2025/TT-BTC Điều 9 (Luật Thuế GTGT 48/2024/QH15), từ 12/3/2026 phần thuế TNDN theo Thông tư 20/2026/TT-BTC Điều 7 và
// Nghị định 320/2025/NĐ-CP Điều 12 (1% hàng hóa, 5% dịch vụ); khai theo từng lần phát sinh hạn ngày thứ 10 kể từ ngày phát sinh nghĩa vụ, hoặc khai
// tháng hạn ngày 20 tháng sau khi có nhiều lần thanh toán (Luật Quản lý thuế 38/2019/QH14 Điều 44, Nghị định 126/2020/NĐ-CP Điều 8), mẫu 01/NTNN.
// Bảng tỷ lệ dưới đây lấy theo Thông tư 103/2014 qua bài tổng hợp (misa.vn, crowe.com, thuvienphapluat.vn); chưa đối chiếu được bảng tỷ lệ của
// Thông tư 69/2025 và Thông tư 20/2026 nên mỗi phép tính đều kèm cảnh báo. Phương pháp kê khai khấu trừ (nhà thầu tự nộp) và hỗn hợp chưa hỗ trợ.
import { nextWorkingDay } from './taxRules.mjs';

export const CONTRACTOR_BUSINESS_TYPES = {
  services: { label: 'Dịch vụ, cho thuê máy móc thiết bị, bảo hiểm', vat: 0.05, cit: 0.05 },
  goods_with_services: { label: 'Cung cấp hàng hóa tại Việt Nam (gắn dịch vụ)', vat: 0, cit: 0.01 },
  construction_with_materials: { label: 'Xây dựng, lắp đặt có bao thầu nguyên vật liệu', vat: 0.03, cit: 0.02 },
  construction_without_materials: { label: 'Xây dựng, lắp đặt không bao thầu nguyên vật liệu', vat: 0.05, cit: 0.02 },
  transport_other: { label: 'Vận tải, sản xuất kinh doanh khác', vat: 0.03, cit: 0.02 },
  hotel_management: { label: 'Quản lý nhà hàng, khách sạn, casino', vat: 0.05, cit: 0.10 },
  royalty: { label: 'Tiền bản quyền', vat: 0, cit: 0.10 },
  interest: { label: 'Lãi tiền vay', vat: 0, cit: 0.05 },
  aircraft_ship_lease: { label: 'Cho thuê tàu bay, tàu biển, động cơ, phụ tùng', vat: 0.05, cit: 0.02 },
  reinsurance: { label: 'Tái bảo hiểm ra nước ngoài, hoa hồng nhượng tái bảo hiểm', vat: 0, cit: 0.001 },
};

const isoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const addDays = (iso, days) => { const date = new Date(`${iso}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };

export function contractorFilingDeadline(paymentDate, filingMode) {
  if (filingMode === 'monthly') {
    const [year, month] = paymentDate.split('-').map(Number);
    return nextWorkingDay(month === 12 ? `${year + 1}-01-20` : `${year}-${String(month + 1).padStart(2, '0')}-20`);
  }
  return nextWorkingDay(addDays(paymentDate, 10));
}

// amount: số tiền hợp đồng thanh toán lần này (VND). priceIncludesTax: giá đã gồm thuế nhà thầu (bên nước ngoài chịu) hay giá thực nhận (bên Việt Nam
// chịu thuế, phải quy đổi ngược). vatApplicable: false khi dịch vụ không chịu thuế GTGT (ví dụ phần mềm) hoặc đã nộp thuế GTGT ở khâu nhập khẩu.
export function calculateContractorTax({ businessType, amount, priceIncludesTax, vatApplicable = true, paymentDate, filingMode = 'occurrence' }) {
  const type = CONTRACTOR_BUSINESS_TYPES[businessType];
  if (!type) throw new Error('Ngành nghề của nhà thầu không hợp lệ.');
  const value = Number(amount);
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Số tiền thanh toán phải là số nguyên dương (VND).');
  if (!isoDate(paymentDate)) throw new Error('Ngày thanh toán không hợp lệ.');
  if (!['occurrence', 'monthly'].includes(filingMode)) throw new Error('Kỳ khai phải là theo từng lần phát sinh hoặc theo tháng.');
  const vatRate = vatApplicable ? type.vat : 0;
  const citRate = type.cit;
  // Giá chưa gồm thuế: doanh thu tính thuế GTGT = số thực nhận / ((1 - tỷ lệ TNDN) × (1 - tỷ lệ GTGT)); doanh thu tính thuế TNDN = doanh thu GTGT - thuế GTGT.
  const vatRevenue = priceIncludesTax ? value : Math.round(value / ((1 - citRate) * (1 - vatRate)));
  const vat = Math.round(vatRevenue * vatRate);
  const citRevenue = vatRevenue - vat;
  const cit = Math.round(citRevenue * citRate);
  const netPayment = vatRevenue - vat - cit;
  const warnings = ['Tỷ lệ theo Thông tư 103/2014; cần đối chiếu Thông tư 69/2025 (thuế GTGT) và Thông tư 20/2026 (thuế TNDN) trước khi nộp.'];
  if (!vatApplicable && type.vat > 0) warnings.push('Đã bỏ thuế GTGT theo lựa chọn: cần căn cứ dịch vụ không chịu thuế hoặc đã nộp ở khâu nhập khẩu.');
  return {
    businessType, businessLabel: type.label, vatRate, citRate, amount: value, priceIncludesTax: Boolean(priceIncludesTax), vatApplicable: Boolean(vatApplicable),
    vatRevenue, vat, citRevenue, cit, totalTax: vat + cit, netPayment, grossCost: vatRevenue,
    filingMode, deadline: contractorFilingDeadline(paymentDate, filingMode),
    // Bút toán gợi ý: chi phí hoặc tài sản theo giá gồm thuế; thuế GTGT nhà thầu là thuế đầu vào được khấu trừ khi đã nộp; thuế TNDN nhà thầu ghi 3338.
    journal: [
      { account: '642', debit: vatRevenue - vat, credit: 0, note: 'Chi phí hoặc tài sản (đổi tài khoản theo mục đích)' },
      ...(vat ? [{ account: '1331', debit: vat, credit: 0, note: 'Thuế GTGT nhà thầu được khấu trừ' }, { account: '33311', debit: 0, credit: vat, note: 'Thuế GTGT nộp thay nhà thầu' }] : []),
      { account: '3338', debit: 0, credit: cit, note: 'Thuế TNDN nộp thay nhà thầu' },
      { account: '331', debit: 0, credit: vatRevenue - vat - cit, note: 'Phải trả nhà thầu (số thực trả)' },
    ],
    warnings,
  };
}
