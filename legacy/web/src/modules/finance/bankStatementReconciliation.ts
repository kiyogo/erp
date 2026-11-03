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
) {
  const { activeByTransaction } = getActiveBankStatementMatches(events);
  const account = accounts.find((item) => item.key === statement.bankAccountId);
  const bankNameIsUnique = account && accounts.filter((item) => item.bankName === account.bankName).length === 1;
  const legacyAccountAliases = account ? new Set([
    account.key,
    account.accountNumber,
    `${account.bankName} (${account.accountNumber})`,
    `${account.bankName} - ${account.accountNumber} (VND)`,
    ...(bankNameIsUnique ? [account.bankName] : []),
  ]) : new Set<string>();
  return transactions
    .filter((transaction) => transaction.status === 'Đã hoàn thành'
      && transaction.source === 'bank'
      && (transaction.sourceAccountId === statement.bankAccountId
        || (!transaction.sourceAccountId && legacyAccountAliases.has(transaction.account)))
      && transaction.type === line.direction
      && transaction.amount === line.amount
      && (transaction.currency || 'VND') === line.currency
      && !activeByTransaction.has(transaction.key))
    .sort((left, right) => Math.abs(Date.parse(`${left.date}T00:00:00Z`) - Date.parse(`${line.transactionDate}T00:00:00Z`))
      - Math.abs(Date.parse(`${right.date}T00:00:00Z`) - Date.parse(`${line.transactionDate}T00:00:00Z`))
      || left.code.localeCompare(right.code));
}

export function getStatementLineMatch(statementKey: string, lineKey: string, events: BankStatementMatchEvent[]) {
  return getActiveBankStatementMatches(events).activeByLine.get(`${statementKey}|${lineKey}`);
}

export function getStatementLineClassification(statementKey: string, lineKey: string, events: BankStatementMatchEvent[]) {
  return getActiveBankStatementMatches(events).classifications.get(`${statementKey}|${lineKey}`);
}
