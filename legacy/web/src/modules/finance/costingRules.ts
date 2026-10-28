export const COSTING_CATEGORIES = [
  'Hợp đồng kinh tế B2B',
  'Đơn đặt hàng (Job-Order)',
  'Công trình thi công',
  'Dịch vụ duy trì SLA',
] as const;

export const COSTING_STATUSES = ['Đang thực hiện', 'Hoàn thành', 'Tạm dừng'] as const;

export interface CostingInput {
  code: unknown;
  projectName: unknown;
  category: unknown;
  constructionSite?: unknown;
  materialCost: unknown;
  directLabor: unknown;
  infrastructureCost: unknown;
  softwareLicense: unknown;
  overheadCost: unknown;
  revenue: unknown;
  status: unknown;
}

export interface CostingRecord {
  key: string;
  code: string;
  projectName: string;
  category: typeof COSTING_CATEGORIES[number];
  constructionSite?: string;
  materialCost: number;
  directLabor: number;
  infrastructureCost: number;
  softwareLicense: number;
  overheadCost: number;
  totalCost: number;
  revenue: number;
  profitMargin: number | null;
  status: typeof COSTING_STATUSES[number];
  createdDate?: string;
  createdBy?: string;
  createdById?: string;
}

function requiredText(value: unknown, label: string, maxLength = 300): string {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`${label} là thông tin bắt buộc.`);
  if (text.length > maxLength) throw new Error(`${label} không được vượt quá ${maxLength} ký tự.`);
  return text;
}

export function parseCostingAmount(value: unknown, label: string): number {
  if (value === undefined || value === null || String(value).trim() === '') throw new Error(`Vui lòng nhập ${label}; nhập 0 nếu không phát sinh.`);
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new Error(`${label} phải là số nguyên không âm hợp lệ.`);
  return amount;
}

export function createCostingRecord(input: CostingInput, existingCodes: string[] = []): Omit<CostingRecord, 'createdDate' | 'createdBy' | 'createdById'> {
  const code = requiredText(input.code, 'Mã giá thành', 80);
  if (existingCodes.some((existing) => existing.trim().toLocaleLowerCase() === code.toLocaleLowerCase())) {
    throw new Error('Mã giá thành đã tồn tại. Vui lòng dùng mã khác.');
  }
  const projectName = requiredText(input.projectName, 'Tên dự án', 300);
  if (!COSTING_CATEGORIES.includes(input.category as typeof COSTING_CATEGORIES[number])) throw new Error('Phân loại giá thành không hợp lệ.');
  if (!COSTING_STATUSES.includes(input.status as typeof COSTING_STATUSES[number])) throw new Error('Trạng thái giá thành không hợp lệ.');
  const category = input.category as typeof COSTING_CATEGORIES[number];
  const constructionSite = category === 'Công trình thi công' ? requiredText(input.constructionSite, 'Địa điểm công trình', 300) : '';
  const materialCost = parseCostingAmount(input.materialCost, 'chi phí vật tư trực tiếp');
  const directLabor = parseCostingAmount(input.directLabor, 'chi phí nhân công trực tiếp');
  const infrastructureCost = parseCostingAmount(input.infrastructureCost, 'chi phí hạ tầng');
  const softwareLicense = parseCostingAmount(input.softwareLicense, 'chi phí bản quyền phần mềm');
  const overheadCost = parseCostingAmount(input.overheadCost, 'chi phí chung khác');
  const revenue = parseCostingAmount(input.revenue, 'doanh thu dự kiến hoặc đã xác nhận');
  const totalCost = materialCost + directLabor + infrastructureCost + softwareLicense + overheadCost;
  if (!Number.isSafeInteger(totalCost)) throw new Error('Tổng chi phí vượt giới hạn số liệu an toàn.');
  return {
    key: code,
    code,
    projectName,
    category,
    ...(constructionSite ? { constructionSite } : {}),
    materialCost,
    directLabor,
    infrastructureCost,
    softwareLicense,
    overheadCost,
    totalCost,
    revenue,
    profitMargin: revenue > 0 ? Math.round(((revenue - totalCost) / revenue) * 1000) / 10 : null,
    status: input.status as typeof COSTING_STATUSES[number],
  };
}

export function costingMetrics(records: CostingRecord[]) {
  const totalCost = records.reduce((sum, item) => sum + item.totalCost, 0);
  const totalRevenue = records.reduce((sum, item) => sum + item.revenue, 0);
  return {
    totalCost,
    totalRevenue,
    grossMargin: totalRevenue > 0 ? Math.round(((totalRevenue - totalCost) / totalRevenue) * 1000) / 10 : null,
  };
}

export function costingExportRows(records: CostingRecord[]) {
  return [
    ['Mã giá thành', 'Dự án / Hợp đồng', 'Phân loại', 'Địa điểm', 'Vật tư trực tiếp', 'Nhân công trực tiếp', 'Hạ tầng', 'Bản quyền phần mềm', 'Chi phí chung khác', 'Tổng giá thành', 'Doanh thu', 'Biên lãi gộp (%)', 'Trạng thái'],
    ...records.map((item) => [
      item.code, item.projectName, item.category, item.constructionSite || '', item.materialCost, item.directLabor,
      item.infrastructureCost, item.softwareLicense, item.overheadCost, item.totalCost, item.revenue,
      item.profitMargin ?? '', item.status,
    ]),
  ];
}
