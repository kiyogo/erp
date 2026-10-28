export type DepreciationMethod = 'Đường thẳng' | 'Số dư giảm dần có điều chỉnh' | 'Theo sản lượng / Công suất';

export type DepreciationScheduleRow = {
  period: string;
  monthNumber: number;
  monthlyAmount: number;
  accumulatedAmount: number;
  remainingAmount: number;
  posted: boolean;
  imported?: boolean;
  productionUnits?: number;
};

export function buildDepreciationSchedule(input: {
  originalCost: number;
  residualValue: number;
  lifeMonths: number;
  startDate: string;
  depreciatedMonths?: number;
  method: DepreciationMethod;
  productionCapacity?: number;
  productionByPeriod?: Record<string, number>;
}): DepreciationScheduleRow[] {
  const { originalCost, residualValue, lifeMonths, startDate, method } = input;
  if (!Number.isFinite(originalCost) || originalCost <= 0 || !Number.isFinite(residualValue) || residualValue < 0 || residualValue >= originalCost) {
    throw new Error('Nguyên giá phải lớn hơn 0 và giá trị thu hồi phải nhỏ hơn nguyên giá.');
  }
  if (!Number.isInteger(lifeMonths) || lifeMonths < 1 || lifeMonths > 120) throw new Error('Thời gian khấu hao phải từ 1 đến 120 tháng.');
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  const year = Number(match?.[1]);
  const month = Number(match?.[2]);
  const day = Number(match?.[3]);
  const parsedDate = new Date(`${startDate}T00:00:00Z`);
  if (!match || month < 1 || month > 12 || day < 1 || !Number.isFinite(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== startDate) throw new Error('Ngày bắt đầu khấu hao không hợp lệ.');
  const capacity = Number(input.productionCapacity);
  if (method === 'Theo sản lượng / Công suất' && (!Number.isFinite(capacity) || capacity <= 0)) throw new Error('Nhập công suất sản lượng dự kiến lớn hơn 0.');

  const depreciableBase = originalCost - residualValue;
  const rows: DepreciationScheduleRow[] = [];
  let accumulatedAmount = 0;
  let remainingBase = depreciableBase;
  const depreciatedMonths = Math.max(0, Math.min(lifeMonths, Number(input.depreciatedMonths) || 0));
  const decliningRate = (lifeMonths <= 48 ? 1.5 : lifeMonths <= 72 ? 2 : 2.5) * 12 / lifeMonths;

  for (let index = 0; index < lifeMonths; index++) {
    const serialMonth = month - 1 + index;
    const periodYear = year + Math.floor(serialMonth / 12);
    const periodMonth = serialMonth % 12 + 1;
    const period = `${periodYear}-${String(periodMonth).padStart(2, '0')}`;
    let amount = 0;
    let productionUnits: number | undefined;

    if (remainingBase > 0) {
      if (method === 'Đường thẳng') {
        amount = Math.min(remainingBase, Math.round(depreciableBase / lifeMonths));
      } else if (method === 'Số dư giảm dần có điều chỉnh') {
        const monthsLeft = lifeMonths - index;
        const straightLine = remainingBase / monthsLeft;
        const declining = remainingBase * decliningRate / 12;
        amount = Math.min(remainingBase, Math.round(Math.max(straightLine, declining)));
      } else {
        productionUnits = Number(input.productionByPeriod?.[period]) || 0;
        if (!Number.isFinite(productionUnits) || productionUnits < 0 || productionUnits > capacity) throw new Error(`Sản lượng kỳ ${period} không hợp lệ.`);
        amount = Math.min(remainingBase, Math.round(depreciableBase * productionUnits / capacity));
      }
    }

    amount = Math.max(0, Math.min(remainingBase, amount));
    accumulatedAmount += amount;
    remainingBase = Math.max(0, depreciableBase - accumulatedAmount);
    rows.push({
      period,
      monthNumber: index + 1,
      monthlyAmount: amount,
      accumulatedAmount,
      remainingAmount: Math.max(residualValue, originalCost - accumulatedAmount),
      posted: index < depreciatedMonths,
      ...(productionUnits === undefined ? {} : { productionUnits }),
    });
  }
  return rows;
}

