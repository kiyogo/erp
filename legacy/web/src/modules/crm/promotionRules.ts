export type PromotionStatus = 'Nháp' | 'Đang hoạt động' | 'Tạm dừng' | 'Đã kết thúc';

export type PromotionRecord = {
  key: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  promotionType: 'Chiết khấu' | 'Tặng quà' | 'Tích điểm';
  target: string;
  enabled: boolean;
  allowConcurrent: boolean;
  eligibleItemCodes: string[];
  amountBasis: 'Thành tiền trước thuế' | 'Thành tiền sau thuế';
  orgUnitKeys: string[];
  employeeIds: string[];
  applyOnce: boolean;
  owner: string;
  ownerId: string;
  combinablePromotionKeys: string[];
  taxCondition: 'Bất kỳ' | 'Có thuế' | 'Không thuế';
  minimumSubtotal: number;
  unitPrice: number;
  unit: string;
  customerKeys: string[];
  discountKind: 'Phần trăm' | 'Số tiền';
  discountValue: number;
  status: PromotionStatus;
  createdAt: string;
  updatedAt: string;
};

export function derivePromotionStatus(record: Pick<PromotionRecord, 'enabled' | 'startDate' | 'endDate'>, today: string): PromotionStatus {
  if (record.endDate < today) return 'Đã kết thúc';
  if (!record.enabled) return 'Tạm dừng';
  if (record.startDate > today) return 'Nháp';
  return 'Đang hoạt động';
}

export function promotionMetrics(records: PromotionRecord[], today: string) {
  const statuses = records.map((record) => derivePromotionStatus(record, today));
  return {
    total: records.length,
    active: statuses.filter((status) => status === 'Đang hoạt động').length,
    scheduled: statuses.filter((status) => status === 'Nháp').length,
    ended: statuses.filter((status) => status === 'Đã kết thúc').length,
  };
}

export function promotionExportRows(records: PromotionRecord[], today: string) {
  return [
    ['Mã chương trình', 'Tên chương trình', 'Từ ngày', 'Đến ngày', 'Loại khuyến mại', 'Đối tượng', 'Trạng thái', 'Cho áp dụng đồng thời', 'Căn cứ', 'Điều kiện thuế', 'Điều kiện thành tiền', 'Kiểu chiết khấu', 'Giá trị', 'Đơn vị', 'Mã hàng áp dụng', 'Nhân viên áp dụng', 'Đơn vị áp dụng', 'Khách hàng', 'Chủ sở hữu'],
    ...records.map((record) => [
      record.code, record.name, record.startDate, record.endDate, record.promotionType, record.target,
      derivePromotionStatus(record, today), record.allowConcurrent ? 'Có' : 'Không', record.amountBasis,
      record.taxCondition, record.minimumSubtotal, record.discountKind, record.discountValue, record.unit,
      record.eligibleItemCodes.join(', '), record.employeeIds.join(', '), record.orgUnitKeys.join(', '),
      record.customerKeys.join(', '), record.owner,
    ]),
  ];
}
