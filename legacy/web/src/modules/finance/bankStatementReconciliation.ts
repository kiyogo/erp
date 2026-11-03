import type { FinanceBankAccount, FinanceBankStatement, FinanceBankStatementLine, FinanceCashTransaction } from '../../api/endpoints';

export type BankStatementMatchEvent = {
  key: string;
  action: 'match' | 'unmatch' | 'classify';
  statementKey: string;
  bankAccountId: string;
  lineKey: string;
  cashTransactionId?: string;
  cashTransactionCode?: string;
  reversesMatchKey?: string;
  classification?: BankStatementClassification;
  reason?: string;
  eventSequence: number;
  createdAt: string;
  createdBy: string;
};

export type BankStatementClassification =
  | 'Thu khách hàng'
  | 'Thanh toán nhà cung cấp'
  | 'Phí ngân hàng'
  | 'Lãi tiền gửi'
  | 'Chuyển khoản nội bộ'
  | 'Khác';

export const BANK_STATEMENT_CLASSIFICATIONS: BankStatementClassification[] = [
  'Thu khách hàng',
  'Thanh toán nhà cung cấp',
  'Phí ngân hàng',
  'Lãi tiền gửi',
  'Chuyển khoản nội bộ',
  'Khác',
];

function legacyBankAccountAliases(account: FinanceBankAccount, accounts: FinanceBankAccount[]) {
  const bankNameIsUnique = accounts.filter((item) => item.bankName === account.bankName).length === 1;
  return new Set([
    account.key,
    account.accountNumber,
    `${account.bankName} (${account.accountNumber})`,
    `${account.bankName} - ${account.accountNumber} (VND)`,
    ...(bankNameIsUnique ? [account.bankName] : []),
  ]);
}

function transactionBelongsToStatementAccount(
  transaction: FinanceCashTransaction,
  statement: FinanceBankStatement,
  accounts: FinanceBankAccount[],
) {
  if (transaction.sourceAccountId) return transaction.sourceAccountId === statement.bankAccountId;
  const account = accounts.find((item) => item.key === statement.bankAccountId);
  return Boolean(account && legacyBankAccountAliases(account, accounts).has(transaction.account));
}

export function getActiveBankStatementMatches(events: BankStatementMatchEvent[]) {
  const activeByLine = new Map<string, BankStatementMatchEvent>();
  const activeByTransaction = new Map<string, BankStatementMatchEvent>();
  const classifications = new Map<string, BankStatementClassification>();
  const lineKey = (event: BankStatementMatchEvent) => `${event.statementKey}|${event.lineKey}`;
  for (const event of [...events].sort((left, right) => left.eventSequence - right.eventSequence)) {
    const key = lineKey(event);
    if (event.action === 'match' && event.cashTransactionId) {
      activeByLine.set(key, event);
      activeByTransaction.set(event.cashTransactionId, event);
    } else if (event.action === 'unmatch' && event.reversesMatchKey) {
      const current = activeByLine.get(key);
      if (current?.key === event.reversesMatchKey) {
        activeByLine.delete(key);
        if (current.cashTransactionId) activeByTransaction.delete(current.cashTransactionId);
      }
    } else if (event.action === 'classify' && event.classification) {
      classifications.set(key, event.classification);
    }
  }
  return { activeByLine, activeByTransaction, classifications };
}

export function getBankStatementMatchCandidates(
  line: FinanceBankStatementLine,
  statement: FinanceBankStatement,
  transactions: FinanceCashTransaction[],
  events: BankStatementMatchEvent[],
  accounts: FinanceBankAccount[] = [],
  matchState: ReturnType<typeof getActiveBankStatementMatches> = getActiveBankStatementMatches(events),
) {
  const { activeByTransaction } = matchState;
  return transactions
    .filter((transaction) => transaction.status === 'Đã hoàn thành'
      && transaction.source === 'bank'
      && transactionBelongsToStatementAccount(transaction, statement, accounts)
      && transaction.type === line.direction
      && transaction.amount === line.amount
      && (transaction.currency || 'VND') === line.currency
      && !activeByTransaction.has(transaction.key))
    .sort((left, right) => Math.abs(Date.parse(`${left.date}T00:00:00Z`) - Date.parse(`${line.transactionDate}T00:00:00Z`))
      - Math.abs(Date.parse(`${right.date}T00:00:00Z`) - Date.parse(`${line.transactionDate}T00:00:00Z`))
      || left.code.localeCompare(right.code));
}

export function summarizeBankStatementReconciliation(
  statement: FinanceBankStatement,
  transactions: FinanceCashTransaction[],
  events: BankStatementMatchEvent[],
  accounts: FinanceBankAccount[] = [],
  matchState: ReturnType<typeof getActiveBankStatementMatches> = getActiveBankStatementMatches(events),
) {
  const { activeByLine, activeByTransaction, classifications } = matchState;
  const eligibleLines = statement.lines.filter((line) => !line.duplicate);
  const matchedLines = eligibleLines.filter((line) => activeByLine.has(`${statement.key}|${line.key}`));
  const unmatchedLines = eligibleLines.filter((line) => !activeByLine.has(`${statement.key}|${line.key}`));
  const classifiedUnmatchedCount = unmatchedLines.filter((line) => classifications.has(`${statement.key}|${line.key}`)).length;
  const dates = eligibleLines.map((line) => line.transactionDate).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
  const firstDate = dates[0] || '';
  const lastDate = dates[dates.length - 1] || '';
  const outstandingVouchers = firstDate ? transactions.filter((transaction) => transaction.status === 'Đã hoàn thành'
    && transaction.source === 'bank'
    && transaction.date >= firstDate && transaction.date <= lastDate
    && transactionBelongsToStatementAccount(transaction, statement, accounts)
    && activeByTransaction.get(transaction.key)?.statementKey !== statement.key) : [];
  const statementNet = eligibleLines.reduce((sum, line) => sum + (line.direction === 'Thu' ? line.amount : -line.amount), 0);
  const balanceDifference = statement.openingBalance === undefined || statement.closingBalance === undefined
    ? null
    : Math.round((statement.openingBalance + statementNet - statement.closingBalance) * 100) / 100;
  let status = 'Đã đối soát';
  if (!eligibleLines.length) status = 'Không có dòng đủ điều kiện';
  else if (unmatchedLines.length || outstandingVouchers.length) status = 'Còn giao dịch chưa khớp';
  else if (balanceDifference !== null && Math.abs(balanceDifference) >= 0.005) status = 'Lệch số dư sao kê';
  else if (balanceDifference === null) status = 'Đã khớp chứng từ · thiếu số dư';
  return {
    matchedLineCount: matchedLines.length,
    unmatchedLineCount: unmatchedLines.length,
    classifiedUnmatchedCount,
    duplicateLineCount: statement.lines.length - eligibleLines.length,
    outstandingVoucherCount: outstandingVouchers.length,
    outstandingVoucherAmount: outstandingVouchers.reduce((sum, transaction) => sum + transaction.amount, 0),
    firstDate,
    lastDate,
    statementNet,
    balanceDifference,
    status,
    reconciled: status === 'Đã đối soát',
  };
}

export function getStatementLineMatch(statementKey: string, lineKey: string, events: BankStatementMatchEvent[]) {
  return getActiveBankStatementMatches(events).activeByLine.get(`${statementKey}|${lineKey}`);
}

export function getStatementLineClassification(statementKey: string, lineKey: string, events: BankStatementMatchEvent[]) {
  return getActiveBankStatementMatches(events).classifications.get(`${statementKey}|${lineKey}`);
}
