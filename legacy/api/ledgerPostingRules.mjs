// Dựng bút toán sổ cái từ chứng từ mua, bán, hóa đơn, hàng trả lại và giảm giá (tài khoản mặc định theo Thông tư 99/2025/TT-BTC):
//  - Bán hàng, hóa đơn đầu ra: Nợ 131 (tổng), Có 511 (tiền hàng chưa thuế), Có 3331 (thuế GTGT đầu ra).
//  - Mua hàng, hóa đơn đầu vào: Nợ 156 (tiền hàng chưa thuế), Nợ 1331 (thuế GTGT được khấu trừ), Có 331 (tổng).
//  - Hàng bán bị trả lại, giảm giá hàng bán: Nợ 521, Nợ 3331, Có 131.
//  - Hàng mua trả lại, giảm giá hàng mua: Nợ 331, Có 156, Có 1331.
// Tài khoản chi tiết phụ thuộc danh mục đang dùng nên người dùng được đổi mã tài khoản trước khi ghi (accountMap); máy chủ kiểm tra
// tài khoản có trong danh mục. Chưa ghi nhận giá vốn, nhập hoặc xuất kho, và thanh toán (phiếu thu chi ghi sổ riêng).

import { adjustmentSide, isAdjustmentSubtype } from './tradeRules.mjs';

const SALE_RECOGNIZED_STATUS = 'Đã bàn giao';
const PURCHASE_RECEIVED_STATUS = 'Đã nhận hàng';
const ISSUED_INVOICE_STATUSES = ['Đã phát hành', 'Đã thanh toán'];

function kindOf(document) {
  if (isAdjustmentSubtype(document.subtype)) return adjustmentSide(document.subtype) === 'sale' ? 'saleAdjustment' : 'purchaseAdjustment';
  if (document.documentType === 'sale' || (document.documentType === 'invoice' && /đầu ra/i.test(document.subtype))) return 'sale';
  if (document.documentType === 'purchase' || (document.documentType === 'invoice' && /đầu vào/i.test(document.subtype))) return 'purchase';
  return '';
}

// Trả về thông báo lỗi hoặc chuỗi rỗng: chỉ ghi sổ khi đã ghi nhận doanh thu hoặc hàng đã về, hóa đơn đã phát hành.
export function documentPostingProblem(document) {
  if (document.status === 'Đã hủy') return 'Chứng từ đã hủy không ghi sổ.';
  const kind = kindOf(document);
  if (!kind) return 'Loại chứng từ này chưa có quy tắc ghi sổ.';
  if (kind.endsWith('Adjustment')) return '';
  if (document.documentType === 'invoice') return ISSUED_INVOICE_STATUSES.includes(document.status) ? '' : 'Chỉ ghi sổ hóa đơn đã phát hành.';
  if (kind === 'sale') {
    if (document.subtype === 'Báo giá') return 'Báo giá chưa phát sinh doanh thu.';
    return document.status === SALE_RECOGNIZED_STATUS ? '' : 'Chỉ ghi sổ chứng từ bán đã bàn giao (doanh thu được ghi nhận khi chuyển giao hàng hóa, dịch vụ).';
  }
  if (document.subtype === 'Hóa đơn đầu vào') return '';
  return document.status === PURCHASE_RECEIVED_STATUS ? '' : 'Chỉ ghi sổ chứng từ mua đã nhận hàng hoặc hóa đơn đầu vào.';
}

export function documentLedgerLines(document) {
  const kind = kindOf(document);
  const vat = document.vatAmount;
  const net = document.amount - vat;
  const lines = [];
  const add = (account, debit, credit, note) => { if (debit > 0 || credit > 0) lines.push({ account, debit, credit, note }); };
  if (kind === 'sale') {
    add('131', document.amount, 0, 'Phải thu khách hàng');
    add('511', 0, net, 'Doanh thu bán hàng chưa thuế');
    add('3331', 0, vat, 'Thuế GTGT đầu ra');
  } else if (kind === 'purchase') {
    add('156', net, 0, 'Giá trị hàng mua chưa thuế (đổi sang 152, 153, 211, 642... theo mục đích mua)');
    add('1331', vat, 0, 'Thuế GTGT được khấu trừ');
    add('331', 0, document.amount, 'Phải trả nhà cung cấp');
  } else if (kind === 'saleAdjustment') {
    add('521', net, 0, 'Giảm trừ doanh thu (hàng bán bị trả lại, giảm giá)');
    add('3331', vat, 0, 'Giảm thuế GTGT đầu ra');
    add('131', 0, document.amount, 'Giảm phải thu khách hàng');
  } else if (kind === 'purchaseAdjustment') {
    add('331', document.amount, 0, 'Giảm phải trả nhà cung cấp');
    add('156', 0, net, 'Giảm giá trị hàng mua');
    add('1331', 0, vat, 'Giảm thuế GTGT được khấu trừ');
  }
  return lines;
}

// Đổi mã tài khoản mặc định sang mã chi tiết người dùng chọn. Ném Error tiếng Việt khi mã không hợp lệ.
export function applyAccountMap(lines, accountMap) {
  const map = accountMap && typeof accountMap === 'object' && !Array.isArray(accountMap) ? accountMap : {};
  for (const [from, to] of Object.entries(map)) {
    if (!/^\d{3,6}$/.test(String(to || '').trim())) throw new Error(`Mã tài khoản thay cho ${from} không hợp lệ (3 đến 6 chữ số).`);
  }
  return lines.map((line) => ({ ...line, account: map[line.account] ? String(map[line.account]).trim() : line.account }));
}

// Giá vốn hàng xuất kho: Nợ 632, Có 156 theo giá trị xuất đã tính ở kho (FIFO hoặc bình quân gia quyền). Xuất dùng nội bộ có thể đổi 632
// sang 641, 642... khi ghi sổ. Hàng giao đi chỉ ghi giá vốn khi đã giao (chuyển giao quyền sở hữu); điều chuyển, kiểm kê, nhập kho không ghi.
export function inventoryIssuePostingProblem(transaction) {
  if (!['Xuất kho', 'Giao hàng'].includes(transaction.type)) return 'Chỉ ghi giá vốn cho phiếu xuất kho hoặc giao hàng.';
  if (transaction.type === 'Giao hàng' && transaction.shipmentStatus !== 'Đã giao') return 'Chỉ ghi giá vốn phiếu giao hàng đã giao.';
  if (!(Number(transaction.totalAmount) > 0)) return 'Phiếu không có giá trị xuất để ghi sổ.';
  return '';
}

export function inventoryIssueLedgerLines(transaction) {
  const amount = Math.round(Number(transaction.totalAmount));
  return [
    { account: '632', debit: amount, credit: 0, note: 'Giá vốn hàng xuất kho' },
    { account: '156', debit: 0, credit: amount, note: 'Giảm giá trị hàng tồn kho (đổi sang 152, 153, 155 theo loại hàng)' },
  ];
}

// Số dư Nợ trừ Có theo tài khoản đầu mã (kể cả tài khoản con) của các bút toán đã ghi sổ cái.
export function accountBalance(entries, prefixes) {
  const digits = (account) => String(account || '').replace(/^TK\s*/i, '').replace(/\D.*$/, '');
  const totals = new Map(prefixes.map(prefix => [prefix, 0]));
  for (const entry of entries) {
    if (entry.status !== 'Đã ghi sổ cái') continue;
    const lines = Array.isArray(entry.lines) && entry.lines.length
      ? entry.lines.map(line => ({ account: digits(line.account), debit: Number(line.debit) || 0, credit: Number(line.credit) || 0 }))
      : [{ account: digits(entry.debitAccount), debit: Number(entry.amount) || 0, credit: 0 }, { account: digits(entry.creditAccount), debit: 0, credit: Number(entry.amount) || 0 }];
    for (const line of lines) {
      const prefix = prefixes.find(item => line.account.startsWith(item));
      if (prefix) totals.set(prefix, totals.get(prefix) + line.debit - line.credit);
    }
  }
  return prefixes.map(prefix => ({ account: prefix, balance: totals.get(prefix) }));
}

// Chênh lệch kiểm kê: thiếu Nợ 1381 Có 156 (tài sản thiếu chờ xử lý), thừa Nợ 156 Có 3381 (tài sản thừa chờ giải quyết). Khi đã xác định
// nguyên nhân (hao hụt trong định mức, bồi thường, tính vào chi phí khác...) đổi mã 1381 sang 632, 1388, 811... khi ghi sổ.
export function inventoryCountPostingProblem(transaction) {
  if (!(Number(transaction.shortageAmount) > 0) && !(Number(transaction.surplusAmount) > 0)) return 'Phiếu kiểm kê không có chênh lệch giá trị để ghi sổ.';
  return '';
}

export function inventoryCountLedgerLines(transaction) {
  const shortage = Math.round(Number(transaction.shortageAmount) || 0);
  const surplus = Math.round(Number(transaction.surplusAmount) || 0);
  const lines = [];
  if (shortage > 0) {
    lines.push({ account: '1381', debit: shortage, credit: 0, note: 'Hàng thiếu khi kiểm kê chờ xử lý' });
    lines.push({ account: '156', debit: 0, credit: shortage, note: 'Giảm hàng tồn kho do thiếu' });
  }
  if (surplus > 0) {
    lines.push({ account: '156', debit: surplus, credit: 0, note: 'Tăng hàng tồn kho do thừa' });
    lines.push({ account: '3381', debit: 0, credit: surplus, note: 'Hàng thừa khi kiểm kê chờ giải quyết' });
  }
  return lines;
}

// Dự phòng giảm giá hàng tồn kho: tăng Nợ 632 Có 2294, hoàn nhập Nợ 2294 Có 632 (chênh lệch so với kỳ lập trước).
export function provisionPostingProblem(record) {
  return Number(record.totalAdjustment) === 0 ? 'Kỳ lập dự phòng không thay đổi so với kỳ trước, không có bút toán.' : '';
}

export function provisionLedgerLines(record) {
  const adjustment = Math.round(Number(record.totalAdjustment) || 0);
  if (adjustment > 0) return [{ account: '632', debit: adjustment, credit: 0, note: 'Trích lập thêm dự phòng giảm giá hàng tồn kho' }, { account: '2294', debit: 0, credit: adjustment, note: 'Dự phòng giảm giá hàng tồn kho' }];
  if (adjustment < 0) return [{ account: '2294', debit: -adjustment, credit: 0, note: 'Dự phòng giảm giá hàng tồn kho' }, { account: '632', debit: 0, credit: -adjustment, note: 'Hoàn nhập dự phòng giảm giá hàng tồn kho' }];
  return [];
}
