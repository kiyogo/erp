export type FinanceOverviewPeriod = 'all' | 'day' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface FinanceOverviewDateRange {
  dateFrom: string;
  dateTo: string;
}

export function getFinanceOverviewDateRange(period: FinanceOverviewPeriod, today: string): FinanceOverviewDateRange {
  if (period === 'all' || period === 'custom') return { dateFrom: '', dateTo: '' };
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
  if (!match) throw new Error('Ngày hiện tại không hợp lệ.');
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const current = new Date(Date.UTC(year, month - 1, day));
  if (current.toISOString().slice(0, 10) !== today) throw new Error('Ngày hiện tại không tồn tại.');
  const format = (date: Date) => date.toISOString().slice(0, 10);
  if (period === 'day') return { dateFrom: today, dateTo: today };
  if (period === 'week') {
    const start = new Date(current);
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    return { dateFrom: format(start), dateTo: format(end) };
  }
  if (period === 'month') {
    return { dateFrom: `${match[1]}-${match[2]}-01`, dateTo: format(new Date(Date.UTC(year, month, 0))) };
  }
  if (period === 'quarter') {
    const firstMonth = Math.floor((month - 1) / 3) * 3 + 1;
    return {
      dateFrom: `${year}-${String(firstMonth).padStart(2, '0')}-01`,
      dateTo: format(new Date(Date.UTC(year, firstMonth + 2, 0))),
    };
  }
  return { dateFrom: `${year}-01-01`, dateTo: `${year}-12-31` };
}
