import { buildLoanDueReport, type LoanReportEvent, type LoanReportSource } from './loanRules.ts';

export type CashForecastDirection = 'inflow' | 'outflow';

export interface CashForecastFlow {
  key: string;
  source: 'receivable' | 'payable' | 'loan' | 'tax' | 'manual';
  reference: string;
  date: string;
  originalDate: string;
  direction: CashForecastDirection;
  amount: number;
  originalAmount: number;
  note?: string;
}

export interface CashForecastPeriod {
  startDate: string;
  endDate: string;
  openingBalance: number;
  inflow: number;
  outflow: number;
  net: number;
  closingBalance: number;
  flows: CashForecastFlow[];
}

export interface CashForecastSourceInput {
  documents: Array<{
    key: string;
    code: string;
    documentType: string;
    subtype?: string;
    status: string;
    dueDate: string;
    remainingAmount: number;
  }>;
  loans: LoanReportSource[];
  loanEvents: LoanReportEvent[];
  taxes: Array<{
    key: string;
    code: string;
    status?: string;
    deadline: string;
    amountPayable: number;
    amountPaid: number;
  }>;
}

export interface BuildCashForecastInput extends CashForecastSourceInput {
  startDate: string;
  endDate: string;
  openingBalance: number;
  receivableProbabilityPct?: number;
  manualAdjustment?: {
    date: string;
    direction: CashForecastDirection;
    amount: number;
    reference: string;
  };
}

const validIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const timestamp = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString().slice(0, 10) === value;
};

const safeAmount = (value: unknown): number | null => {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
};

const dateAt = (value: string) => new Date(`${value}T00:00:00Z`);
const isoDate = (value: Date) => value.toISOString().slice(0, 10);

export const buildCashForecast = (input: BuildCashForecastInput): CashForecastPeriod[] => {
  if (!validIsoDate(input.startDate) || !validIsoDate(input.endDate) || input.endDate < input.startDate) {
    throw new Error('Khoảng thời gian dự báo không hợp lệ.');
  }
  const dayCount = Math.floor((dateAt(input.endDate).getTime() - dateAt(input.startDate).getTime()) / 86_400_000) + 1;
  if (dayCount > 366) throw new Error('Khoảng dự báo tối đa là 366 ngày.');
  if (!Number.isSafeInteger(input.openingBalance)) throw new Error('Số dư đầu kỳ phải là số nguyên hợp lệ.');
  if (input.receivableProbabilityPct !== undefined
    && (!Number.isInteger(input.receivableProbabilityPct) || input.receivableProbabilityPct < 0 || input.receivableProbabilityPct > 100)) {
    throw new Error('Xác suất thu phải nằm trong khoảng từ 0 đến 100%.');
  }

  const flows: CashForecastFlow[] = [];
  const addFlow = (flow: Omit<CashForecastFlow, 'originalDate'>) => {
    if (!validIsoDate(flow.date) || flow.date > input.endDate || flow.amount <= 0) return;
    const overdue = flow.date < input.startDate;
    flows.push({
      ...flow,
      originalDate: flow.date,
      date: overdue ? input.startDate : flow.date,
      note: [flow.note, overdue ? `Đã quá hạn từ ${flow.date}; tạm xếp vào ngày đầu kỳ.` : ''].filter(Boolean).join(' '),
    });
  };

  input.documents.forEach(document => {
    if (document.status === 'Đã hủy' || !validIsoDate(document.dueDate)) return;
    const remaining = safeAmount(document.remainingAmount);
    if (!remaining) return;
    const isReceivable = document.documentType === 'sale' || (document.documentType !== 'purchase' && String(document.subtype || '').includes('Đầu ra'));
    const isPayable = document.documentType === 'purchase' || (document.documentType !== 'sale' && String(document.subtype || '').includes('Đầu vào'));
    if (!isReceivable && !isPayable) return;
    const amount = isReceivable && input.receivableProbabilityPct !== undefined
      ? Number((BigInt(remaining) * BigInt(input.receivableProbabilityPct) + 50n) / 100n)
      : remaining;
    addFlow({
      key: `document:${document.key}`,
      source: isReceivable ? 'receivable' : 'payable',
      reference: document.code,
      date: document.dueDate,
      direction: isReceivable ? 'inflow' : 'outflow',
      amount,
      originalAmount: remaining,
    });
  });

  const loanDues = buildLoanDueReport(input.loans, input.loanEvents, input.startDate);
  input.loans.forEach(loan => {
    const loanDirection = loan.direction === 'lend' || loan.loanType === 'Khế ước cho vay' ? 'inflow' : 'outflow';
    loanDues.filter(due => due.contractCode === loan.contractCode && due.status !== 'Đã thanh toán').forEach((due, index) => {
      const amount = (safeAmount(due.principalDue) ?? 0) + (safeAmount(due.interestDue) ?? 0);
      addFlow({
        key: `loan:${loan.key}:${due.dueDate}:${index}`,
        source: 'loan',
        reference: loan.contractCode,
        date: due.dueDate,
        direction: loanDirection,
        amount,
        originalAmount: amount,
        note: due.status === 'Chưa lập lịch hợp đồng' ? 'Chỉ tính dư nợ gốc còn lại; chưa tính lãi do chưa có lịch trả nợ.' : undefined,
      });
    });
  });

  input.taxes.forEach(tax => {
    if (tax.status === 'Đã hủy' || !validIsoDate(tax.deadline)) return;
    const payable = safeAmount(tax.amountPayable);
    const paid = safeAmount(tax.amountPaid);
    if (payable === null || paid === null) return;
    const remaining = Math.max(0, payable - paid);
    addFlow({
      key: `tax:${tax.key}`,
      source: 'tax',
      reference: tax.code,
      date: tax.deadline,
      direction: 'outflow',
      amount: remaining,
      originalAmount: remaining,
    });
  });

  if (input.manualAdjustment) {
    const amount = safeAmount(input.manualAdjustment.amount);
    if (amount === null) throw new Error('Khoản điều chỉnh phải là số nguyên không âm.');
    if (amount > 0) {
      if (!validIsoDate(input.manualAdjustment.date) || input.manualAdjustment.date < input.startDate || input.manualAdjustment.date > input.endDate) {
        throw new Error('Ngày điều chỉnh phải nằm trong khoảng dự báo.');
      }
      addFlow({
        key: `manual:${input.manualAdjustment.date}:${input.manualAdjustment.reference.trim()}`,
        source: 'manual',
        reference: input.manualAdjustment.reference.trim(),
        date: input.manualAdjustment.date,
        direction: input.manualAdjustment.direction,
        amount,
        originalAmount: amount,
      });
    }
  }

  const periods: CashForecastPeriod[] = [];
  let cursor = dateAt(input.startDate);
  const lastDate = dateAt(input.endDate);
  let balance = input.openingBalance;
  while (cursor <= lastDate) {
    const periodEnd = new Date(cursor);
    periodEnd.setUTCDate(periodEnd.getUTCDate() + 6);
    if (periodEnd > lastDate) periodEnd.setTime(lastDate.getTime());
    const periodStartText = isoDate(cursor);
    const periodEndText = isoDate(periodEnd);
    const periodFlows = flows.filter(flow => flow.date >= periodStartText && flow.date <= periodEndText);
    const inflow = periodFlows.filter(flow => flow.direction === 'inflow').reduce((sum, flow) => sum + flow.amount, 0);
    const outflow = periodFlows.filter(flow => flow.direction === 'outflow').reduce((sum, flow) => sum + flow.amount, 0);
    const net = inflow - outflow;
    const closingBalance = balance + net;
    if (![inflow, outflow, net, closingBalance].every(Number.isSafeInteger)) throw new Error('Tổng dự báo vượt giới hạn số tiền hợp lệ.');
    periods.push({ startDate: periodStartText, endDate: periodEndText, openingBalance: balance, inflow, outflow, net, closingBalance, flows: periodFlows });
    balance = closingBalance;
    cursor = new Date(periodEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return periods;
};

