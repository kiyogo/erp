export type LoanDirection = 'borrow' | 'lend';

export interface LoanIdentity {
  key?: string;
  contractCode?: string;
}

export interface LoanReportSource {
  key: string;
  contractCode: string;
  direction?: string;
  loanType?: string;
  counterpartyName?: string;
  bankName?: string;
  principalAmount: number;
  dueDate: string;
  loanSchedules?: Array<{ key: string; dueDate: string; principalAmount: number; interestAmount: number }>;
}

export interface LoanReportEvent {
  loanKey: string;
  eventType: 'disbursement' | 'repayment';
  eventDate: string;
  scheduleKey?: string | null;
  principalAmount: number;
  interestAmount: number;
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

export const loanAccountsFor = <T extends { accountingRegime?: string; status?: string; accountType?: string; code?: string; parentCode?: string }>(
  accounts: T[], regime: string, accountType: string,
): T[] => accounts.filter(account => account.accountingRegime === regime && account.status === 'Đang sử dụng'
  && account.accountType === accountType && !accounts.some(child => child.parentCode === account.code));

const loanEventsFor = (events: LoanReportEvent[], loanKey: string) => events.filter(event => event.loanKey === loanKey);

export const buildLoanDebtReport = (loans: LoanReportSource[], events: LoanReportEvent[]) => loans.map(loan => {
  const loanEvents = loanEventsFor(events, loan.key);
  const principalDrawn = loanEvents.filter(event => event.eventType === 'disbursement').reduce((sum, event) => sum + Number(event.principalAmount || 0), 0);
  const principalRepaid = loanEvents.filter(event => event.eventType === 'repayment').reduce((sum, event) => sum + Number(event.principalAmount || 0), 0);
  const interestSettled = loanEvents.filter(event => event.eventType === 'repayment').reduce((sum, event) => sum + Number(event.interestAmount || 0), 0);
  return {
    contractCode: loan.contractCode,
    direction: loan.direction === 'lend' || loan.loanType === 'Khế ước cho vay' ? 'Cho vay' : 'Đi vay',
    counterparty: loan.counterpartyName || loan.bankName || '',
    principalContracted: Number(loan.principalAmount) || 0,
    principalDrawn,
    principalRepaid,
    outstandingPrincipal: principalDrawn - principalRepaid,
    interestSettled,
    dueDate: loan.dueDate,
  };
});

export const buildLoanDueReport = (loans: LoanReportSource[], events: LoanReportEvent[], asOfDate: string) => loans.flatMap(loan => {
  const loanEvents = loanEventsFor(events, loan.key).filter(event => event.eventType === 'repayment');
  const counterparty = loan.counterpartyName || loan.bankName || '';
  const direction = loan.direction === 'lend' || loan.loanType === 'Khế ước cho vay' ? 'Thu nợ' : 'Trả nợ';
  if (!loan.loanSchedules?.length) {
    const principalDrawn = loanEventsFor(events, loan.key).filter(event => event.eventType === 'disbursement').reduce((sum, event) => sum + Number(event.principalAmount || 0), 0);
    const principalRepaid = loanEvents.reduce((sum, event) => sum + Number(event.principalAmount || 0), 0);
    return [{
      contractCode: loan.contractCode,
      direction,
      counterparty,
      dueDate: loan.dueDate,
      principalDue: Math.max(0, principalDrawn - principalRepaid),
      interestDue: null as number | null,
      status: 'Chưa lập lịch hợp đồng',
    }];
  }
  return loan.loanSchedules.map(schedule => {
    const payments = loanEvents.filter(event => event.scheduleKey === schedule.key);
    const principalDue = Math.max(0, Number(schedule.principalAmount) - payments.reduce((sum, event) => sum + Number(event.principalAmount || 0), 0));
    const interestDue = Math.max(0, Number(schedule.interestAmount) - payments.reduce((sum, event) => sum + Number(event.interestAmount || 0), 0));
    return {
      contractCode: loan.contractCode,
      direction,
      counterparty,
      dueDate: schedule.dueDate,
      principalDue,
      interestDue,
      status: principalDue === 0 && interestDue === 0 ? 'Đã thanh toán' : schedule.dueDate < asOfDate ? 'Quá hạn' : 'Chưa đến hạn',
    };
  });
});
