export type LedgerCalculationRecord = {
  debitAccount?: string;
  creditAccount?: string;
  amount: number;
  entryDate?: string;
  status?: string;
};

export type AccountMovement = { account: string; debit: number; credit: number };
export type ClosingLine = { description: string; debitAccount: string; creditAccount: string; amount: number };

export function getFiscalQuarterDates(period: string, startMonth = 1, startDay = 1) {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const start = new Date(Date.UTC(year, startMonth - 1 + (quarter - 1) * 3, startDay));
  const endExclusive = new Date(Date.UTC(year, startMonth - 1 + quarter * 3, startDay));
  const end = new Date(endExclusive.getTime() - 86_400_000);
  const toIso = (value: Date) => value.toISOString().slice(0, 10);
  return { year: String(year), quarter: String(quarter), startDate: toIso(start), endDate: toIso(end), endExclusive: toIso(endExclusive) };
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
    const amount = Number(record.amount) || 0;
    const debit = String(record.debitAccount || '').trim();
    const credit = String(record.creditAccount || '').trim();
    if (debit) {
      const current = accounts.get(debit) || { account: debit, debit: 0, credit: 0 };
      accounts.set(debit, { ...current, debit: current.debit + amount });
    }
    if (credit) {
      const current = accounts.get(credit) || { account: credit, debit: 0, credit: 0 };
      accounts.set(credit, { ...current, credit: current.credit + amount });
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
    const amount = Number(record.amount) || 0;
    const debit = String(record.debitAccount || '').match(/(?:TK\s*)?(\d{3,4})/i)?.[1] || '';
    const credit = String(record.creditAccount || '').match(/(?:TK\s*)?(\d{3,4})/i)?.[1] || '';
    if (debit) {
      const current = accounts.get(debit) || { debit: 0, credit: 0 };
      accounts.set(debit, { ...current, debit: current.debit + amount });
    }
    if (credit) {
      const current = accounts.get(credit) || { debit: 0, credit: 0 };
      accounts.set(credit, { ...current, credit: current.credit + amount });
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
    debits: quarterRecords.filter((record) => record.debitAccount).reduce((sum, record) => sum + (Number(record.amount) || 0), 0),
    credits: quarterRecords.filter((record) => record.creditAccount).reduce((sum, record) => sum + (Number(record.amount) || 0), 0),
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
