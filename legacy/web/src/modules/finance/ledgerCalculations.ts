import { getFiscalQuarterDates } from '../../../../shared/finance-periods.mjs';

export type LedgerCalculationRecord = {
  debitAccount?: string;
  creditAccount?: string;
  amount: number;
  lines?: Array<{ account: string; debit: number; credit: number }>;
  entryDate?: string;
  status?: string;
};

export type AccountMovement = { account: string; debit: number; credit: number };
export type ClosingLine = { description: string; debitAccount: string; creditAccount: string; amount: number };

function ledgerLines(record: LedgerCalculationRecord) {
  if (Array.isArray(record.lines) && record.lines.length) return record.lines;
  return [
    ...(record.debitAccount ? [{ account: record.debitAccount, debit: Number(record.amount) || 0, credit: 0 }] : []),
    ...(record.creditAccount ? [{ account: record.creditAccount, debit: 0, credit: Number(record.amount) || 0 }] : []),
  ];
}

export { getFiscalQuarterDates };

export function postedLedgerRecords<T extends LedgerCalculationRecord>(records: T[]): T[] {
  return records.filter((record) => record.status === 'Đã ghi sổ cái');
}

export function getFiscalQuarterPeriod(date: Date, startMonth = 1, startDay = 1) {
  const dateKey = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())).toISOString().slice(0, 10);
  let fiscalYear = date.getFullYear();
  for (let quarter = 1; quarter <= 4; quarter++) {
    const period = `${fiscalYear}-Q${quarter}`;
    const dates = getFiscalQuarterDates(period, startMonth, startDay)!;
    if (dateKey >= dates.startDate && dateKey < dates.endExclusive) return period;
  }
  fiscalYear--;
  for (let quarter = 1; quarter <= 4; quarter++) {
    const period = `${fiscalYear}-Q${quarter}`;
    const dates = getFiscalQuarterDates(period, startMonth, startDay)!;
    if (dateKey >= dates.startDate && dateKey < dates.endExclusive) return period;
  }
  return `${date.getFullYear()}-Q1`;
}

export function summarizeLedgerAccounts(records: LedgerCalculationRecord[]): AccountMovement[] {
  const accounts = new Map<string, AccountMovement>();
  for (const record of records) {
    for (const line of ledgerLines(record)) {
      const account = String(line.account || '').trim();
      if (!account) continue;
      const current = accounts.get(account) || { account, debit: 0, credit: 0 };
      accounts.set(account, { ...current, debit: current.debit + (Number(line.debit) || 0), credit: current.credit + (Number(line.credit) || 0) });
    }
  }
  return Array.from(accounts.values());
}

export function calculateQuarterLedger(records: LedgerCalculationRecord[], period: string, startMonth = 1, startDay = 1) {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  const dates = getFiscalQuarterDates(period, startMonth, startDay);
  if (!match || !dates) return { year: '', quarter: '', startMonth: 0, startDay: 0, startDate: '', endDate: '', endExclusive: '', records: [], accounts: new Map<string, { debit: number; credit: number }>(), revenue: 0, expenses: 0, netResult: 0, debits: 0, credits: 0 };
  const [, year, quarter] = match;
  const quarterRecords = records.filter((record) => {
    return record.status === 'Đã ghi sổ cái' && Boolean(record.entryDate) && record.entryDate! >= dates.startDate && record.entryDate! < dates.endExclusive;
  });
  const accounts = new Map<string, { debit: number; credit: number }>();
  for (const record of quarterRecords) {
    for (const line of ledgerLines(record)) {
      const account = String(line.account || '').match(/(?:TK\s*)?(\d{3,6})/i)?.[1] || '';
      if (!account) continue;
      const current = accounts.get(account) || { debit: 0, credit: 0 };
      accounts.set(account, { ...current, debit: current.debit + (Number(line.debit) || 0), credit: current.credit + (Number(line.credit) || 0) });
    }
  }
  const movements = Array.from(accounts.entries());
  const revenue = movements.filter(([code]) => ['5', '7'].includes(code[0])).reduce((sum, [, sides]) => sum + sides.credit - sides.debit, 0);
  const expenses = movements.filter(([code]) => ['6', '8'].includes(code[0])).reduce((sum, [, sides]) => sum + sides.debit - sides.credit, 0);
  return {
    year,
    quarter,
    startMonth: Number(startMonth),
    startDay: Number(startDay),
    ...dates,
    records: quarterRecords,
    accounts,
    revenue,
    expenses,
    netResult: revenue - expenses,
    debits: Array.from(accounts.values()).reduce((sum, sides) => sum + sides.debit, 0),
    credits: Array.from(accounts.values()).reduce((sum, sides) => sum + sides.credit, 0),
  };
}

export function buildQuarterClosingLines(summary: ReturnType<typeof calculateQuarterLedger>): ClosingLine[] {
  const lines: ClosingLine[] = [];
  for (const [code, sides] of summary.accounts) {
    const netRevenue = sides.credit - sides.debit;
    if (['5', '7'].includes(code[0]) && netRevenue > 0) {
      lines.push({ description: `Kết chuyển doanh thu TK ${code} quý ${summary.quarter}/${summary.year}`, debitAccount: `TK ${code}`, creditAccount: 'TK 911', amount: netRevenue });
    } else if (['5', '7'].includes(code[0]) && netRevenue < 0) {
      lines.push({ description: `Kết chuyển số dư Nợ TK ${code} quý ${summary.quarter}/${summary.year}`, debitAccount: 'TK 911', creditAccount: `TK ${code}`, amount: Math.abs(netRevenue) });
    }
    const netExpense = sides.debit - sides.credit;
    if (['6', '8'].includes(code[0]) && netExpense > 0) {
      lines.push({ description: `Kết chuyển chi phí TK ${code} quý ${summary.quarter}/${summary.year}`, debitAccount: 'TK 911', creditAccount: `TK ${code}`, amount: netExpense });
    } else if (['6', '8'].includes(code[0]) && netExpense < 0) {
      lines.push({ description: `Kết chuyển số dư Có TK ${code} quý ${summary.quarter}/${summary.year}`, debitAccount: `TK ${code}`, creditAccount: 'TK 911', amount: Math.abs(netExpense) });
    }
  }
  if (summary.netResult > 0) {
    lines.push({ description: `Kết chuyển lãi quý ${summary.quarter}/${summary.year}`, debitAccount: 'TK 911', creditAccount: 'TK 4212', amount: summary.netResult });
  } else if (summary.netResult < 0) {
    lines.push({ description: `Kết chuyển lỗ quý ${summary.quarter}/${summary.year}`, debitAccount: 'TK 4212', creditAccount: 'TK 911', amount: Math.abs(summary.netResult) });
  }
  return lines;
}
