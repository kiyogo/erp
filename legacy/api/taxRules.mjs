// Quy tắc thuế GTGT và TNDN: hạn nộp hồ sơ, thuế suất TNDN, thuế GTGT phải nộp theo kỳ, tiền chậm nộp.
import { isPublicNonWorkingDay } from './holidayRules.mjs';
// Căn cứ pháp lý ghi ở từng khối. Các căn cứ dưới đây được xác minh qua bài đăng tổng hợp văn bản và bản đăng
// nghị định trên luatvietnam.vn (Nghị định 252/2026/NĐ-CP đọc được một phần); chưa đối chiếu được bản gốc
// trên vbpl.vn, nên cần kiểm tra lại trước khi nộp tờ khai thật. Ngày lễ, Tết chưa được trừ khi tính hạn.

// Từ 01/07/2026 Luật Quản lý thuế 108/2025/QH15 và Nghị định 252/2026/NĐ-CP thay Luật 38/2019/QH14 và Nghị định 126/2020/NĐ-CP.
export const NEW_TAX_ADMINISTRATION_FROM = '2026-07-01';
// Luật Thuế GTGT 48/2024/QH15 (từ 01/07/2025) hạ ngưỡng thanh toán không dùng tiền mặt từ 20 triệu xuống 5 triệu đồng.
const VAT_NON_CASH_THRESHOLDS = [{ from: '0000-01-01', amount: 20_000_000 }, { from: '2025-07-01', amount: 5_000_000 }];

export const TAX_FILING_TYPES = {
  vat: 'Thuế GTGT',
  citProvisional: 'Thuế TNDN tạm tính',
  citFinalization: 'Quyết toán thuế TNDN',
  pitWithholding: 'Thuế TNCN khấu trừ',
};

const pad = (value) => String(value).padStart(2, '0');
const parseIso = (iso) => new Date(`${iso}T00:00:00Z`);
const formatIso = (date) => date.toISOString().slice(0, 10);
const lastDayOfMonth = (year, month) => formatIso(new Date(Date.UTC(year, month, 0)));
const addDays = (iso, days) => formatIso(new Date(parseIso(iso).getTime() + days * 86_400_000));

// Điều 3 khoản 7 Nghị định 252/2026/NĐ-CP, Luật Quản lý thuế: hạn trùng ngày nghỉ thì chuyển sang ngày làm việc liền kề sau (thứ bảy, chủ nhật và ngày
// nghỉ lễ, tết theo holidayRules.mjs).
export function nextWorkingDay(iso) {
  let day = iso;
  while (isPublicNonWorkingDay(day)) day = addDays(day, 1);
  return day;
}

function monthAfter(iso, offset) {
  const date = parseIso(iso);
  const index = date.getUTCFullYear() * 12 + date.getUTCMonth() + offset;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

// Trả về { deadline, basis } hoặc ném lỗi tiếng Việt. periodEnd là ngày cuối kỳ kê khai.
export function taxFilingDeadline({ taxType, filingMethod, periodEnd }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(periodEnd || '')) throw new Error('Ngày kết thúc kỳ không hợp lệ.');
  const next = monthAfter(periodEnd, 1);
  const lastOfNext = lastDayOfMonth(next.year, next.month);
  let deadline;
  let basis;
  if (taxType === TAX_FILING_TYPES.vat || taxType === TAX_FILING_TYPES.pitWithholding) {
    if (filingMethod === 'Tháng') {
      deadline = `${next.year}-${pad(next.month)}-20`;
      basis = 'Hạn nộp hồ sơ và nộp tiền: ngày 20 của tháng sau kỳ kê khai tháng (Luật Quản lý thuế 38/2019 Điều 44, Nghị định 252/2026 Điều 10)';
    } else if (filingMethod === 'Quý') {
      deadline = lastOfNext;
      basis = 'Hạn nộp hồ sơ và nộp tiền: ngày cuối của tháng đầu quý sau (Luật Quản lý thuế 38/2019 Điều 44, Nghị định 252/2026 Điều 10)';
    } else {
      throw new Error('Chọn chu kỳ kê khai Tháng hoặc Quý để tính hạn nộp.');
    }
  } else if (taxType === TAX_FILING_TYPES.citProvisional) {
    const old = `${next.year}-${pad(next.month)}-30`;
    if (old < NEW_TAX_ADMINISTRATION_FROM) {
      deadline = old;
      basis = 'Tạm nộp thuế TNDN quý: chậm nhất ngày thứ 30 của tháng đầu quý sau (Luật Quản lý thuế 38/2019 Điều 55)';
    } else {
      deadline = lastOfNext;
      basis = 'Tạm nộp thuế TNDN quý: ngày cuối của tháng đầu quý sau (Nghị định 252/2026 Điều 24 khoản 2)';
    }
  } else if (taxType === TAX_FILING_TYPES.citFinalization) {
    const old = addDays(periodEnd, 90);
    if (old < NEW_TAX_ADMINISTRATION_FROM) {
      deadline = old;
      basis = 'Quyết toán thuế TNDN: chậm nhất ngày thứ 90 kể từ ngày kết thúc năm tài chính (Luật Quản lý thuế 38/2019 Điều 44)';
    } else {
      const third = monthAfter(periodEnd, 3);
      deadline = lastDayOfMonth(third.year, third.month);
      basis = 'Quyết toán thuế TNDN: ngày cuối của tháng thứ ba sau kỳ quyết toán (Nghị định 252/2026 Điều 10)';
    }
  } else {
    throw new Error('Loại thuế này chưa có quy tắc tính hạn nộp.');
  }
  return { deadline: nextWorkingDay(deadline), basis };
}

// Luật Thuế TNDN 67/2025/QH15 Điều 10 (kỳ tính thuế từ 2025): doanh thu kỳ liền trước tới 3 tỷ 15%, trên 3 đến 50 tỷ 17%, còn lại 20%.
// Trước 2025 thuế suất phổ thông 20% theo Luật Thuế TNDN 14/2008/QH12 (đã sửa đổi); ưu đãi theo ngành, địa bàn chưa được tính.
export function citRate({ taxYear, previousYearRevenue }) {
  if (!Number.isInteger(taxYear)) throw new Error('Năm tính thuế không hợp lệ.');
  if (taxYear < 2025) return { rate: 0.20, basis: 'Thuế suất phổ thông 20% (Luật Thuế TNDN 14/2008/QH12)' };
  if (!Number.isFinite(previousYearRevenue) || previousYearRevenue < 0) throw new Error('Doanh thu năm trước không hợp lệ.');
  if (previousYearRevenue <= 3_000_000_000) return { rate: 0.15, basis: 'Doanh thu kỳ trước tới 3 tỷ đồng: 15% (Luật 67/2025/QH15 Điều 10)' };
  if (previousYearRevenue <= 50_000_000_000) return { rate: 0.17, basis: 'Doanh thu kỳ trước trên 3 tỷ đến 50 tỷ đồng: 17% (Luật 67/2025/QH15 Điều 10)' };
  return { rate: 0.20, basis: 'Doanh thu kỳ trước trên 50 tỷ đồng: 20% (Luật 67/2025/QH15 Điều 10)' };
}

// Lợi nhuận kế toán trước thuế từ các bút toán sổ cái: doanh thu (5), thu nhập khác (7) trừ chi phí (6), chi phí khác (8).
// Tài khoản 821 (chi phí thuế TNDN) và bút toán kết chuyển 911 không tính. Chưa điều chỉnh chi phí không được trừ khi tính thuế.
export function ledgerProfit(entries, startDate, endDate) {
  let revenue = 0;
  let expense = 0;
  const digits = (account) => String(account || '').replace(/^TK\s*/i, '').replace(/\D.*$/, '');
  for (const entry of entries) {
    if (entry.status !== 'Đã ghi sổ cái' || entry.sourceModule === 'general_ledger_close') continue;
    if (!(entry.entryDate >= startDate && entry.entryDate <= endDate)) continue;
    const lines = Array.isArray(entry.lines) && entry.lines.length
      ? entry.lines.map(line => ({ account: digits(line.account), debit: Number(line.debit) || 0, credit: Number(line.credit) || 0 }))
      : [
        { account: digits(entry.debitAccount), debit: Number(entry.amount) || 0, credit: 0 },
        { account: digits(entry.creditAccount), debit: 0, credit: Number(entry.amount) || 0 },
      ];
    for (const line of lines) {
      if (line.account.startsWith('821')) continue;
      if (line.account[0] === '5' || line.account[0] === '7') revenue += line.credit - line.debit;
      else if (line.account[0] === '6' || line.account[0] === '8') expense += line.debit - line.credit;
    }
  }
  return { revenue, expense, profit: revenue - expense };
}

export function vatNonCashThreshold(isoDate) {
  return [...VAT_NON_CASH_THRESHOLDS].reverse().find(item => isoDate >= item.from).amount;
}

// Thuế GTGT phương pháp khấu trừ của một kỳ từ hóa đơn đầu ra và đầu vào (chứng từ loại hóa đơn, đã loại bản đã hủy).
// Hóa đơn đầu vào từ ngưỡng trở lên (đã gồm thuế) phải có chứng từ thanh toán không dùng tiền mặt mới được khấu trừ
// (Luật 48/2024 Điều 14, Nghị định 181/2025 Điều 26); cùng một ngày, cùng một đối tác thì cộng gộp các hóa đơn để so với ngưỡng.
// Chứng từ có paymentProof (hình thức thanh toán không dùng tiền mặt đã ghi) được khấu trừ luôn; phần còn lại cộng gộp theo
// ngày và đối tác, từ ngưỡng trở lên được tách riêng, không tính vào số khấu trừ. Chưa cộng gộp chứng từ có chứng từ chuyển khoản
// vào tổng so ngưỡng, và chưa kiểm tra chứng từ chuyển khoản có thật.
export function vatSummary(documents, startDate, endDate) {
  const inPeriod = documents.filter(doc => doc.status !== 'Đã hủy' && doc.documentDate >= startDate && doc.documentDate <= endDate);
  const output = inPeriod.filter(doc => doc.subtype === 'Đầu ra');
  const input = inPeriod.filter(doc => doc.subtype === 'Đầu vào' || doc.subtype === 'Hóa đơn đầu vào');
  const byRate = new Map();
  for (const doc of output) {
    const rate = Number(doc.vatRate) || 0;
    const row = byRate.get(rate) || { rate, base: 0, vat: 0 };
    row.vat += Number(doc.vatAmount) || 0;
    row.base += (Number(doc.amount) || 0) - (Number(doc.vatAmount) || 0);
    byRate.set(rate, row);
  }
  const groups = new Map();
  let deductibleInputVat = 0;
  for (const doc of input) {
    if (!(Number(doc.vatAmount) > 0)) continue;
    if (doc.paymentProof === true) {
      deductibleInputVat += Number(doc.vatAmount) || 0;
      continue;
    }
    const key = `${String(doc.partnerName || '').trim().toLowerCase()}|${doc.documentDate}`;
    const group = groups.get(key) || { total: 0, vat: 0, date: doc.documentDate, partnerName: doc.partnerName, count: 0 };
    group.total += Number(doc.amount) || 0;
    group.vat += Number(doc.vatAmount) || 0;
    group.count += 1;
    groups.set(key, group);
  }
  let inputVatNeedingProof = 0;
  const needsProof = [];
  for (const group of groups.values()) {
    if (group.total >= vatNonCashThreshold(group.date)) {
      inputVatNeedingProof += group.vat;
      needsProof.push({ partnerName: group.partnerName, date: group.date, total: group.total, vat: group.vat, invoices: group.count });
    } else {
      deductibleInputVat += group.vat;
    }
  }
  // Hàng trả lại, giảm giá có hóa đơn điều chỉnh: trừ thuế đầu ra, hoặc trừ thuế đầu vào được khấu trừ, ở kỳ lập chứng từ điều chỉnh
  // (kỳ kê khai điều chỉnh chưa đối chiếu được văn bản gốc). Không đối chiếu với việc gốc có đủ chứng từ thanh toán hay không.
  for (const doc of inPeriod.filter(item => item.adjustment?.onTaxInvoice)) {
    const vat = Number(doc.vatAmount) || 0;
    if (doc.adjustment.side === 'sale') {
      const rate = Number(doc.vatRate) || 0;
      const row = byRate.get(rate) || { rate, base: 0, vat: 0 };
      row.vat -= vat;
      row.base -= (Number(doc.amount) || 0) - vat;
      byRate.set(rate, row);
    } else {
      deductibleInputVat -= vat;
    }
  }
  const outputVat = [...byRate.values()].reduce((sum, row) => sum + row.vat, 0);
  const net = outputVat - deductibleInputVat;
  return {
    outputByRate: [...byRate.values()].sort((a, b) => a.rate - b.rate),
    outputVat,
    deductibleInputVat,
    inputVatNeedingProof,
    needsProof,
    amountPayable: Math.max(0, net),
    carriedForward: Math.max(0, -net),
  };
}

// Tiền chậm nộp 0,03% mỗi ngày trên số thuế chậm nộp (Luật Quản lý thuế 108/2025/QH15 Điều 16 khoản 2).
export function lateInterest(amount, daysLate) {
  if (!Number.isSafeInteger(amount) || amount < 0 || !Number.isInteger(daysLate) || daysLate < 0) throw new Error('Số tiền hoặc số ngày chậm nộp không hợp lệ.');
  return Math.round(amount * 0.0003 * daysLate);
}
