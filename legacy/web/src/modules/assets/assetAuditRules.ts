// Kiểm kê tài sản theo danh mục thật (asset_items): số theo sổ là các tài sản chưa thanh lý thuộc phạm vi đợt kiểm kê, quét mã (barcode hoặc mã tài sản)
// để ghi nhận từng tài sản thực tế. Trước đây màn hình tự bịa tài sản cho mỗi lần quét, luôn báo khớp và cộng 25 triệu đồng giá trị.

export const WHOLE_COMPANY_SCOPE = 'Toàn bộ công ty';

export interface AuditAsset {
  key?: string;
  code?: string;
  barcode?: string;
  name?: string;
  category?: string;
  department?: string;
  location?: string;
  assignedTo?: string;
  status?: string;
  originalPrice?: number;
  accumulatedDepreciation?: number;
  netBookValue?: number;
}

export interface AuditScanLine {
  code: string;
  name: string;
  barcode: string;
  category: string;
  holder: string;
  location: string;
  auditStatus: 'Khớp chuẩn' | 'Thừa' | 'Thiếu hụt' | 'Hỏng hóc';
  scannedAt: string;
  value?: number;
}

export interface AuditCounts {
  scope: string;
  bookCount: number;
  bookValue: number;
  itemsList: AuditScanLine[];
}

const normalize = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, '').toUpperCase();

export const assetBookValue = (asset: AuditAsset) =>
  Number.isFinite(Number(asset.netBookValue)) && asset.netBookValue !== undefined
    ? Number(asset.netBookValue)
    : Math.max(0, (Number(asset.originalPrice) || 0) - (Number(asset.accumulatedDepreciation) || 0));

/** Tài sản thuộc phạm vi đợt kiểm kê: chưa thanh lý, đúng đơn vị quản lý (toàn công ty thì lấy tất cả). */
export function auditScopeAssets(assets: AuditAsset[], scope: string): AuditAsset[] {
  return assets.filter((asset) => asset.status !== 'Đã thanh lý' && (!scope || scope === WHOLE_COMPANY_SCOPE || asset.department === scope));
}

export function auditBook(assets: AuditAsset[], scope: string) {
  const inScope = auditScopeAssets(assets, scope);
  return { bookCount: inScope.length, bookValue: inScope.reduce((sum, asset) => sum + assetBookValue(asset), 0) };
}

/** Số liệu tổng hợp của đợt kiểm kê tính lại từ danh sách đã quét. */
export function auditSummary(audit: AuditCounts) {
  const matched = audit.itemsList.filter((line) => line.auditStatus === 'Khớp chuẩn');
  const surplus = audit.itemsList.filter((line) => line.auditStatus === 'Thừa');
  const damaged = audit.itemsList.filter((line) => line.auditStatus === 'Hỏng hóc');
  const actualCount = matched.length + damaged.length + surplus.length;
  const actualValue = [...matched, ...damaged].reduce((sum, line) => sum + (Number(line.value) || 0), 0);
  return {
    actualCount,
    matchedCount: matched.length,
    surplusCount: surplus.length,
    damagedCount: damaged.length,
    missingCount: Math.max(0, audit.bookCount - matched.length - damaged.length),
    discrepancy: actualCount - audit.bookCount,
    actualValue,
    diffValue: actualValue - audit.bookValue,
  };
}

export type ScanOutcome = 'matched' | 'surplus' | 'unknown' | 'duplicate';

/** Ghi nhận một lần quét: tài sản trong phạm vi là khớp, tài sản thuộc đơn vị khác hoặc không có trong danh mục là thừa, quét lại là trùng. */
export function applyAuditScan(audit: AuditCounts, assets: AuditAsset[], scannedCode: string, scannedAt: string, damaged = false): { outcome: ScanOutcome; line?: AuditScanLine; itemsList: AuditScanLine[] } {
  const code = normalize(scannedCode);
  if (!code) throw new Error('Vui lòng nhập hoặc quét mã tài sản.');
  const asset = assets.find((item) => normalize(item.barcode) === code || normalize(item.code) === code);
  const lineKey = asset ? normalize(asset.code || asset.barcode) : code;
  if (audit.itemsList.some((line) => normalize(line.code) === lineKey || normalize(line.barcode) === code)) {
    return { outcome: 'duplicate', itemsList: audit.itemsList };
  }
  const inScope = asset && auditScopeAssets([asset], audit.scope).length === 1;
  const line: AuditScanLine = asset
    ? {
        code: asset.code || code, name: asset.name || '', barcode: asset.barcode || '', category: asset.category || '',
        holder: asset.assignedTo || '', location: asset.location || asset.department || '',
        auditStatus: inScope ? (damaged ? 'Hỏng hóc' : 'Khớp chuẩn') : 'Thừa', scannedAt, value: inScope ? assetBookValue(asset) : 0,
      }
    : { code, name: 'Không có trong danh mục tài sản', barcode: scannedCode.trim(), category: '', holder: '', location: '', auditStatus: 'Thừa', scannedAt, value: 0 };
  return { outcome: asset ? (inScope ? 'matched' : 'surplus') : 'unknown', line, itemsList: [line, ...audit.itemsList] };
}

/** Tài sản trong phạm vi chưa quét được: thiếu so với sổ. */
export function missingAssets(audit: AuditCounts, assets: AuditAsset[]): AuditAsset[] {
  const scanned = new Set(audit.itemsList.map((line) => normalize(line.code)));
  return auditScopeAssets(assets, audit.scope).filter((asset) => !scanned.has(normalize(asset.code || asset.barcode)));
}
