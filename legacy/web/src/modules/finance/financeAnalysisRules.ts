export interface AnalysisLedgerLine {
  account: string;
  debit: number;
  credit: number;
}

export interface AnalysisLedgerEntry {
  entryDate: string;
  status: string;
  lines?: AnalysisLedgerLine[];
  debitAccount?: string;
  creditAccount?: string;
  amount?: number;
}

export interface AnalysisCashTransaction {
  date: string;
  type: 'Thu' | 'Chi';
  amount: number;
  status: string;
}

export interface AnalysisDocument {
  documentType: string;
  subtype: string;
  partnerName: string;
  remainingAmount: number;
  dueDate: string;
  status: string;
}

export interface AnalysisRange {
  startDate: string;
  endExclusive: string;
}

export interface AnalysisBudget {
  fiscalYear: string | number;
  department: string;
  allocatedBudget: number;
  actualSpent: number;
}

export function quarterOptionsForFiscalYear(currentPeriod: string, count = 8): string[] {
  const match = /^(\d{4})-Q([1-4])$/.exec(currentPeriod);
  if (!match || !Number.isInteger(count) || count < 1) return [];
  const currentSerial = Number(match[1]) * 4 + Number(match[2]) - 1;
  return Array.from({ length: count }, (_, index) => {
    const serial = currentSerial - count + index + 1;
    return `${Math.floor(serial / 4)}-Q${(serial % 4) + 1}`;
  });
}

function accountCode(value: string): string {
  return String(value || '').match(/(?:TK\s*)?(\d{3,6})/i)?.[1] || '';
}

function linesFor(entry: AnalysisLedgerEntry): AnalysisLedgerLine[] {
  if (Array.isArray(entry.lines) && entry.lines.length) return entry.lines;
  const amount = Number(entry.amount);
  if (!Number.isSafeInteger(amount) || amount < 0) return [];
  return [
    ...(entry.debitAccount ? [{ account: entry.debitAccount, debit: amount, credit: 0 }] : []),
    ...(entry.creditAccount ? [{ account: entry.creditAccount, debit: 0, credit: amount }] : []),
  ];
}

export function summarizeAnalysisPeriod(
  ledger: AnalysisLedgerEntry[],
  cash: AnalysisCashTransaction[],
  range: AnalysisRange,
) {
  const entries = ledger.filter(entry => entry.status === 'Đã ghi sổ cái'
    && /^\d{4}-\d{2}-\d{2}$/.test(entry.entryDate)
    && entry.entryDate >= range.startDate && entry.entryDate < range.endExclusive);
  let revenue = 0;
  let expenses = 0;
  let hasRevenueAccount = false;
  let hasExpenseAccount = false;
  for (const entry of entries) {
    for (const line of linesFor(entry)) {
      const code = accountCode(line.account);
      const debit = Number(line.debit);
      const credit = Number(line.credit);
      if (!code || !Number.isSafeInteger(debit) || !Number.isSafeInteger(credit) || debit < 0 || credit < 0) continue;
      if (['5', '7'].includes(code[0])) {
        revenue += credit - debit;
        hasRevenueAccount = true;
      } else if (['6', '8'].includes(code[0])) {
        expenses += debit - credit;
        hasExpenseAccount = true;
      }
    }
  }
  const transactions = cash.filter(item => item.status === 'Đã hoàn thành'
    && /^\d{4}-\d{2}-\d{2}$/.test(item.date)
    && item.date >= range.startDate && item.date < range.endExclusive
    && Number.isSafeInteger(Number(item.amount)) && Number(item.amount) >= 0);
  const cashIn = transactions.filter(item => item.type === 'Thu').reduce((sum, item) => sum + Number(item.amount), 0);
  const cashOut = transactions.filter(item => item.type === 'Chi').reduce((sum, item) => sum + Number(item.amount), 0);
  return {
    entryCount: entries.length,
    revenue: hasRevenueAccount ? revenue : null,
    expenses: hasExpenseAccount ? expenses : null,
    profit: hasRevenueAccount && hasExpenseAccount ? revenue - expenses : null,
    netMargin: hasRevenueAccount && hasExpenseAccount && revenue > 0 ? (revenue - expenses) / revenue : null,
    cashIn,
    cashOut,
    netCash: cashIn - cashOut,
    cashTransactionCount: transactions.length,
  };
}

export function summarizeOutstandingDocuments(documents: AnalysisDocument[], today: string) {
  const receivables = documents.filter(document => document.status !== 'Đã hủy'
    && (document.documentType === 'sale' || String(document.subtype || '').includes('Đầu ra')));
  const payables = documents.filter(document => document.status !== 'Đã hủy'
    && (document.documentType === 'purchase' || String(document.subtype || '').includes('Đầu vào')));
  const total = (items: AnalysisDocument[]) => items.reduce((sum, document) => {
    const amount = Number(document.remainingAmount);
    return Number.isSafeInteger(amount) && amount > 0 ? sum + amount : sum;
  }, 0);
  const overdue = (items: AnalysisDocument[]) => total(items.filter(document =>
    /^\d{4}-\d{2}-\d{2}$/.test(document.dueDate) && document.dueDate < today));
  const receivablesByPartner = new Map<string, { partner: string; amount: number; overdue: number; count: number }>();
  for (const document of receivables) {
    const amount = Number(document.remainingAmount);
    if (!Number.isSafeInteger(amount) || amount <= 0) continue;
    const partner = String(document.partnerName || '').trim() || 'Chưa xác định đối tác';
    const current = receivablesByPartner.get(partner) || { partner, amount: 0, overdue: 0, count: 0 };
    current.amount += amount;
    if (/^\d{4}-\d{2}-\d{2}$/.test(document.dueDate) && document.dueDate < today) current.overdue += amount;
    current.count += 1;
    receivablesByPartner.set(partner, current);
  }
  return {
    receivable: total(receivables),
    overdueReceivable: overdue(receivables),
    payable: total(payables),
    overduePayable: overdue(payables),
    receivableCount: receivables.filter(document => Number(document.remainingAmount) > 0).length,
    payableCount: payables.filter(document => Number(document.remainingAmount) > 0).length,
    receivablesByPartner: Array.from(receivablesByPartner.values()).sort((a, b) => b.amount - a.amount),
  };
}

export function summarizeBudgetComparison(budgets: AnalysisBudget[], fiscalYear: string) {
  const rows = budgets.filter(budget => String(budget.fiscalYear).match(/\d{4}/)?.[0] === fiscalYear
    && Number.isSafeInteger(Number(budget.allocatedBudget)) && Number(budget.allocatedBudget) >= 0
    && Number.isSafeInteger(Number(budget.actualSpent)) && Number(budget.actualSpent) >= 0);
  const allocated = rows.reduce((sum, row) => sum + Number(row.allocatedBudget), 0);
  const actualSpent = rows.reduce((sum, row) => sum + Number(row.actualSpent), 0);
  return {
    recordCount: rows.length,
    allocated,
    actualSpent,
    variance: allocated - actualSpent,
    byDepartment: Array.from(rows.reduce((groups, row) => {
      const department = String(row.department || '').trim() || 'Chưa xác định phòng ban';
      const group = groups.get(department) || { department, allocated: 0, actualSpent: 0 };
      group.allocated += Number(row.allocatedBudget);
      group.actualSpent += Number(row.actualSpent);
      groups.set(department, group);
      return groups;
    }, new Map<string, { department: string; allocated: number; actualSpent: number }>()).values())
      .sort((left, right) => right.actualSpent - left.actualSpent),
  };
}

