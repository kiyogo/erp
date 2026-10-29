export type LoanDirection = 'borrow' | 'lend';

export interface LoanIdentity {
  key?: string;
  contractCode?: string;
}

export const hasUniqueLoanContractCode = (
  loans: LoanIdentity[],
  contractCode: string,
  excludeKey?: string,
): boolean => {
  const normalized = contractCode.trim().toLocaleLowerCase();
  return Boolean(normalized) && !loans.some(loan =>
    loan.key !== excludeKey && String(loan.contractCode || '').trim().toLocaleLowerCase() === normalized,
  );
};

export const isValidLoanDateRange = (disbursedDate: string, dueDate: string): boolean => {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return Number.NaN;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : Number.NaN;
  };
  const start = parse(disbursedDate);
  const end = parse(dueDate);
  return Number.isFinite(start) && Number.isFinite(end) && end >= start;
};

export const loanDirectionOf = (loan: { direction?: string; loanType?: string }): LoanDirection => {
  if (loan.direction === 'lend' || loan.loanType === 'Khế ước cho vay') return 'lend';
  return 'borrow';
};
