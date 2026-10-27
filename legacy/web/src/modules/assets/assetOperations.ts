export interface AssetOperationRecord {
  key?: string;
  id?: string;
  code?: string;
  assetCode?: string;
  name?: string;
  assetName?: string;
  status?: string;
  assignedTo?: string;
  department?: string;
  location?: string;
  history?: Array<{ key: string; date: string; action: string; actor: string; note: string }>;
  [key: string]: unknown;
}

export function findAssetByCode<T extends AssetOperationRecord>(assets: T[], code: string): T {
  const normalizedCode = String(code || '').trim().toLocaleLowerCase();
  if (!normalizedCode) throw new Error('Nhập mã tài sản.');
  const matches = assets.filter((asset) => String(asset.code || asset.assetCode || '').trim().toLocaleLowerCase() === normalizedCode);
  if (matches.length === 0) throw new Error(`Không tìm thấy tài sản ${code} trong danh mục đang lưu.`);
  if (matches.length > 1) throw new Error(`Mã tài sản ${code} bị trùng trong danh mục; cần xử lý trùng mã trước.`);
  return matches[0];
}

export function appendAssetHistory<T extends AssetOperationRecord>(asset: T, date: string, action: string, actor: string, note: string): T {
  const history = Array.isArray(asset.history) ? asset.history : [];
  return {
    ...asset,
    history: [...history, { key: `asset-event-${crypto.randomUUID()}`, date, action, actor, note }],
  };
}

export function buildAllocationAssetUpdate<T extends AssetOperationRecord>(
  asset: T,
  type: 'Cấp phát' | 'Thu hồi',
  employeeName: string,
  department: string,
  actor: string,
  date: string,
  ticketCode: string,
  condition: string,
): T {
  if (asset.status === 'Đã thanh lý') throw new Error('Không thể cấp phát hoặc thu hồi tài sản đã thanh lý.');
  const assignee = String(asset.assignedTo || '').trim().toLocaleLowerCase();
  const employee = String(employeeName || '').trim().toLocaleLowerCase();
  if (!employee) throw new Error('Thiếu nhân viên liên quan đến biên bản.');

  if (type === 'Cấp phát') {
    if (asset.status !== 'Trong kho') {
      throw new Error('Chỉ cấp phát tài sản đang ở kho; hãy kiểm tra trạng thái hoặc hoàn tất thu hồi trước.');
    }
    return appendAssetHistory({
      ...asset,
      status: 'Đang sử dụng',
      assignedTo: employeeName.trim(),
      department: String(department || '').trim(),
    }, date, 'Cấp phát tài sản', actor, `Biên bản ${ticketCode}; người nhận ${employeeName.trim()}; tình trạng: ${String(condition || '').trim()}`);
  }

  if (assignee && assignee !== employee) {
    throw new Error(`Tài sản hiện được giao cho ${String(asset.assignedTo)}; không khớp người trong biên bản.`);
  }
  if (!assignee && asset.status === 'Trong kho') throw new Error('Tài sản đã ở trong kho; không thể lập thêm một biên bản thu hồi cho cùng trạng thái.');
  if (asset.status !== 'Đang sử dụng') throw new Error('Chỉ thu hồi tài sản đang sử dụng; tài sản đang sửa chữa hoặc chờ thanh lý cần hoàn tất luồng hiện tại trước.');
  if (!assignee) throw new Error('Chưa có người giữ tài sản trong danh mục để đối chiếu biên bản thu hồi.');
  return appendAssetHistory({ ...asset, status: 'Trong kho', assignedTo: '' }, date, 'Thu hồi tài sản', actor,
    `Biên bản ${ticketCode}; thu hồi từ ${employeeName.trim()}; tình trạng: ${String(condition || '').trim()}`);
}

export function buildRepairAssetUpdate<T extends AssetOperationRecord>(
  asset: T,
  actor: string,
  date: string,
  repairCode: string,
  action: 'Bắt đầu sửa chữa' | 'Chờ linh kiện thay thế' | 'Hoàn tất sửa chữa' | 'Không thể sửa chữa',
  note: string,
): T {
  if (asset.status === 'Đã thanh lý') throw new Error('Không thể sửa chữa tài sản đã thanh lý.');
  if (action === 'Bắt đầu sửa chữa' && asset.status === 'Đang sửa chữa') {
    throw new Error('Tài sản đang có trạng thái sửa chữa; hãy đối chiếu phiếu hiện có trước khi tạo phiếu mới.');
  }
  const status = action === 'Bắt đầu sửa chữa' || action === 'Chờ linh kiện thay thế'
    ? 'Đang sửa chữa'
    : action === 'Không thể sửa chữa'
      ? 'Chờ thanh lý'
      : String(asset.assignedTo || '').trim() ? 'Đang sử dụng' : 'Trong kho';
  return appendAssetHistory({ ...asset, status }, date, action, actor, `Phiếu ${repairCode}; ${String(note || '').trim()}`);
}
