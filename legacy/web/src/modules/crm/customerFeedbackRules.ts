export type FeedbackMetricRecord = {
  rating: number | null;
  status: string;
  priority: string;
};

export function customerFeedbackMetrics(records: FeedbackMetricRecord[]) {
  const rated = records.filter((record) => Number.isInteger(record.rating) && record.rating !== null);
  const resolvedCount = records.filter((record) => record.status === 'Đã giải quyết thỏa đáng').length;
  const inProgressCount = records.filter((record) => record.status === 'Đang xử lý').length;
  return {
    feedbackCount: records.length,
    averageRating: rated.length ? rated.reduce((sum, record) => sum + (record.rating || 0), 0) / rated.length : null,
    resolvedCount,
    resolutionRate: records.length ? Math.round((resolvedCount / records.length) * 100) : null,
    inProgressCount,
    urgentCount: records.filter((record) => record.status === 'Đang xử lý' && record.priority === 'Khẩn cấp').length,
  };
}

export type FeedbackExportRecord = {
  feedbackCode: string;
  receivedDate: string;
  clientName: string;
  contactPerson: string;
  phone: string;
  serviceName: string;
  rating: number | null;
  priority: string;
  assignedStaff: string;
  status: string;
  resolutionAction: string;
};

export function customerFeedbackExportRows(records: FeedbackExportRecord[]) {
  return [
    ['Mã phản ánh', 'Ngày nhận', 'Khách hàng', 'Người phản ánh', 'Điện thoại', 'Dịch vụ', 'Đánh giá', 'Ưu tiên', 'Cán bộ phụ trách', 'Trạng thái', 'Biện pháp xử lý'],
    ...records.map((record) => [
      record.feedbackCode,
      record.receivedDate,
      record.clientName,
      record.contactPerson,
      record.phone,
      record.serviceName,
      record.rating ?? '',
      record.priority,
      record.assignedStaff,
      record.status,
      record.resolutionAction,
    ]),
  ];
}
