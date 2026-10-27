import type { EnterpriseEmployee } from '../../api/endpoints';

export function travelLocalDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function travelDateRangeDays(from: string, to: string): number {
  const parse = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) throw new Error('Vui lòng chọn ngày hợp lệ.');
    const timestamp = Date.parse(`${value}T00:00:00Z`);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== value) throw new Error('Ngày không tồn tại.');
    return timestamp;
  };
  const days = (parse(to) - parse(from)) / 86400000 + 1;
  if (days < 1) throw new Error('Ngày kết thúc phải từ ngày bắt đầu trở đi.');
  return days;
}

export function travelMoney(value: unknown, label: string): number {
  const amount = Number(value);
  if (value == null || String(value).trim() === '' || !Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`${label} phải là số nguyên không âm.`);
  }
  return amount;
}

export function travelEmployeeSnapshot(employees: EnterpriseEmployee[], employeeKey: string) {
  const employee = employees.find((item) => String(item.key || item.id) === employeeKey && item.status !== 'Đã nghỉ việc' && item.isActive !== false);
  if (!employee) throw new Error('Vui lòng chọn nhân viên đang làm việc từ danh sách nhân sự.');
  return {
    employeeId: String(employee.key || employee.id),
    employeeName: employee.fullName || employee.name,
    empCode: employee.employeeCode || employee.code,
    department: employee.department || '',
    position: employee.position || '',
  };
}

export function travelSettlementStatus(actualExpense: number, invoiceReference: string, hasInvoiceFile = false): 'Đã quyết toán xong' | 'Chờ nộp hóa đơn đỏ' | 'Chưa quyết toán' {
  if (actualExpense <= 0) return 'Chưa quyết toán';
  return invoiceReference.trim() || hasInvoiceFile ? 'Đã quyết toán xong' : 'Chờ nộp hóa đơn đỏ';
}

export function travelExportRows(items: Array<Record<string, any>>): Array<Array<string | number>> {
  return [
    ['Mã chuyến', 'Người lập', 'Nhân viên', 'Mã nhân viên', 'Phòng ban', 'Chức danh', 'Địa điểm', 'Loại chuyến', 'Ngày bắt đầu', 'Ngày kết thúc', 'Số ngày', 'Mục đích', 'Thông tin vé', 'Khách sạn', 'Dự toán (VND)', 'Tạm ứng đề xuất (VND)', 'Chi phí thực tế (VND)', 'Trạng thái quyết toán', 'Mã tham chiếu chứng từ', 'Tệp chứng từ', 'Ghi chú quyết toán', 'Trạng thái chuyến', 'Người xử lý', 'Thời điểm xử lý', 'Lý do từ chối'],
    ...items.map((item) => [
      String(item.travelCode || ''), String(item.requester || ''), String(item.employeeName || ''), String(item.empCode || ''), String(item.department || ''), String(item.position || ''), String(item.destination || ''), String(item.tripType || ''), String(item.startDate || ''), String(item.endDate || ''), Number(item.daysCount) || 0, String(item.purpose || ''), String(item.flightTicket || ''), String(item.hotelName || ''), Number(item.budgetEstimated) || 0, Number(item.advanceAmount) || 0, Number(item.actualExpense) || 0, String(item.settlementStatus || ''), String(item.invoiceReference || ''), String(item.invoiceFileName || ''), String(item.settlementNote || ''), String(item.status || ''), String(item.approver || ''), String(item.approvedAt || item.rejectedAt || ''), String(item.rejectionReason || ''),
    ]),
  ];
}
