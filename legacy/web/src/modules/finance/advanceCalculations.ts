export type AdvanceReconciliationStatus = 'Đã quyết toán nội bộ' | 'Chờ thanh quyết toán';

export function calculateAdvanceSettlement(issuedAmount: number, spentAmount: number, balanceReconciled: boolean): {
  balance: number;
  status: AdvanceReconciliationStatus;
} {
  if (!Number.isFinite(issuedAmount) || issuedAmount < 0 || !Number.isFinite(spentAmount) || spentAmount < 0) {
    throw new Error('Số tiền đã cấp và thực chi phải là số không âm.');
  }
  const balance = issuedAmount - spentAmount;
  return {
    balance,
    status: Math.abs(balance) < 0.5 || balanceReconciled ? 'Đã quyết toán nội bộ' : 'Chờ thanh quyết toán',
  };
}

export function advanceStatus(status: string, deadline: string, today: string): string {
  if (status === 'Chờ cấp tạm ứng' || status === 'Đã hoàn ứng' || status === 'Đã quyết toán nội bộ') return status;
  return deadline < today ? 'Quá hạn quyết toán' : 'Chờ thanh quyết toán';
}

// Tài khoản chi tiết được ghi Nợ khi quyết toán tạm ứng, khớp ADVANCE_EXPENSE_ACCOUNT ở legacy/api/advanceRules.mjs.
export const ADVANCE_EXPENSE_ACCOUNT = /^(15[2-6]|21[13]|242|6\d|811)/;

export function advanceExpenseAccounts<T extends { code?: string; parentCode?: string; accountingRegime?: string; status?: string }>(accounts: T[], regime: string): T[] {
  return accounts.filter((account) => account.accountingRegime === regime && account.status === 'Đang sử dụng'
    && ADVANCE_EXPENSE_ACCOUNT.test(String(account.code || '')) && !accounts.some((child) => child.parentCode === account.code && child.accountingRegime === regime));
}
