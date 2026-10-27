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
