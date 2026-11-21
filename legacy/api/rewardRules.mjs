// Tiền thưởng là thu nhập chịu thuế TNCN từ tiền lương, tiền công (Luật Thuế TNCN Điều 3, Thông tư 111/2013/TT-BTC Điều 2 khoản 2 điểm e),
// trừ thưởng kèm danh hiệu, giải thưởng do Nhà nước trao. Quyết định khen thưởng nội bộ đã trao bằng tiền hoặc hiện vật được cộng vào khoản
// thưởng của kỳ lương có ngày trao. Cổ phần thưởng chưa tính (thời điểm và giá tính thuế chưa xác định), xác minh qua trí nhớ văn bản.

export const AWARDED_STATUSES = ['Đã trao giải', 'Đã trao thưởng'];
export const NON_CASH_TAX_DEFERRED_TYPES = ['Cổ phần thưởng ESOP'];

// Kỳ lương theo giờ Việt Nam của thời điểm trao thưởng (máy chủ lưu giờ UTC).
const monthFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' });
function vietnamMonth(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? monthFormat.format(new Date(time)) : '';
}

export function rewardBonusByEmployee(rewards, period) {
  const totals = new Map();
  for (const reward of rewards) {
    const awardedPeriod = vietnamMonth(reward.awardedAt);
    const value = Number(reward.rewardValue) || 0;
    if (!AWARDED_STATUSES.includes(reward.status) || awardedPeriod !== period || value <= 0 || NON_CASH_TAX_DEFERRED_TYPES.includes(reward.rewardType)) continue;
    const entry = totals.get(reward.employeeId) || { amount: 0, codes: [] };
    entry.amount += Math.round(value);
    entry.codes.push(reward.rewardCode);
    totals.set(reward.employeeId, entry);
  }
  return totals;
}
