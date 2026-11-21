// Tờ khai khấu trừ thuế TNCN mẫu 05/KK-TNCN (tổ chức trả thu nhập từ tiền lương, tiền công), khai theo tháng hoặc quý; chỉ phải khai khi trong kỳ có
// khấu trừ thuế (Nghị định 126/2020/NĐ-CP Điều 8). Chỉ tiêu theo mẫu của Thông tư 80/2021/TT-BTC: [21] tổng số người lao động, [22] cá nhân cư trú có hợp
// đồng lao động, [23]-[25] số cá nhân đã khấu trừ thuế (cư trú, không cư trú), [26]-[28] tổng thu nhập chịu thuế trả cho cá nhân, [29] thu nhập từ phí
// mua bảo hiểm nhân thọ, bảo hiểm không bắt buộc khác của doanh nghiệp không thành lập tại Việt Nam, [30]-[32] thu nhập chịu thuế trả cho cá nhân thuộc
// diện khấu trừ, [33]-[35] số thuế đã khấu trừ, [36] thuế trên phí bảo hiểm ở [29]. Thu nhập chịu thuế là tổng thu nhập trừ thu nhập miễn thuế (chưa trừ
// giảm trừ gia cảnh, bảo hiểm). Số và tên chỉ tiêu xác minh qua trí nhớ mẫu biểu và bài tổng hợp, chưa đối chiếu phụ lục gốc của Thông tư 80/2021.

const money = (value) => (Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value))) : 0);

// period: 'YYYY-MM' hoặc 'YYYY-Qn'. Trả về { months, periodEnd, filingMethod }.
export function declarationPeriod(period) {
  const text = String(period || '').trim().toUpperCase();
  const monthly = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(text);
  const quarterly = /^(\d{4})-Q([1-4])$/.exec(text);
  if (!monthly && !quarterly) throw new Error('Kỳ kê khai phải có dạng YYYY-MM (tháng) hoặc YYYY-Qn (quý).');
  const year = Number((monthly || quarterly)[1]);
  const months = monthly ? [Number(monthly[2])] : [1, 2, 3].map((offset) => (Number(quarterly[2]) - 1) * 3 + offset);
  const last = months.at(-1);
  const periodEnd = new Date(Date.UTC(year, last, 0)).toISOString().slice(0, 10);
  return { period: text, year, months: months.map((month) => `${year}-${String(month).padStart(2, '0')}`), periodEnd, filingMethod: monthly ? 'Tháng' : 'Quý' };
}

// people: [{ key, name, resident, hasLaborContract, lines: [{ month: 'YYYY-MM', gross, exemptIncome, taxDeduction }] }].
export function buildPitDeclaration({ period, people }) {
  const info = declarationPeriod(period);
  const inPeriod = new Set(info.months);
  const rows = people.map((person) => {
    const lines = person.lines.filter((line) => inPeriod.has(String(line.month || '')));
    const gross = lines.reduce((sum, line) => sum + money(line.gross), 0);
    const taxable = gross - Math.min(gross, lines.reduce((sum, line) => sum + money(line.exemptIncome), 0));
    const tax = lines.reduce((sum, line) => sum + money(line.taxDeduction), 0);
    return { key: person.key, name: person.name, source: person.source, resident: person.resident !== false, hasLaborContract: Boolean(person.hasLaborContract), payments: lines.length, taxable, tax };
  }).filter((row) => row.payments > 0);
  const sum = (filter, field) => rows.filter(filter).reduce((total, row) => total + (field ? row[field] : 1), 0);
  const resident = (row) => row.resident;
  const nonResident = (row) => !row.resident;
  const withheld = (row) => row.tax > 0;
  const indicators = {
    21: rows.length,
    22: sum((row) => row.resident && row.hasLaborContract),
    24: sum((row) => resident(row) && withheld(row)),
    25: sum((row) => nonResident(row) && withheld(row)),
    27: sum(resident, 'taxable'),
    28: sum(nonResident, 'taxable'),
    29: 0,
    31: sum((row) => resident(row) && withheld(row), 'taxable'),
    32: sum((row) => nonResident(row) && withheld(row), 'taxable'),
    34: sum(resident, 'tax'),
    35: sum(nonResident, 'tax'),
    36: 0,
  };
  indicators[23] = indicators[24] + indicators[25];
  indicators[26] = indicators[27] + indicators[28];
  indicators[30] = indicators[31] + indicators[32];
  indicators[33] = indicators[34] + indicators[35];
  return { ...info, indicators, rows, mustFile: indicators[33] > 0 };
}

export const DECLARATION_LABELS = {
  21: 'Tổng số người lao động',
  22: 'Trong đó: cá nhân cư trú có hợp đồng lao động',
  23: 'Tổng số cá nhân đã khấu trừ thuế',
  24: 'Cá nhân cư trú',
  25: 'Cá nhân không cư trú',
  26: 'Tổng thu nhập chịu thuế trả cho cá nhân',
  27: 'Cá nhân cư trú',
  28: 'Cá nhân không cư trú',
  29: 'Trong đó: thu nhập từ phí mua bảo hiểm nhân thọ, bảo hiểm không bắt buộc khác của doanh nghiệp bảo hiểm không thành lập tại Việt Nam',
  30: 'Tổng thu nhập chịu thuế trả cho cá nhân thuộc diện phải khấu trừ thuế',
  31: 'Cá nhân cư trú',
  32: 'Cá nhân không cư trú',
  33: 'Tổng số thuế thu nhập cá nhân đã khấu trừ',
  34: 'Cá nhân cư trú',
  35: 'Cá nhân không cư trú',
  36: 'Trong đó: số thuế trên phí mua bảo hiểm nhân thọ, bảo hiểm không bắt buộc khác ở chỉ tiêu [29]',
};
