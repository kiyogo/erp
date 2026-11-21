import type { PitVoucher } from '../../api/endpoints';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
const money = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} đồng`;

/**
 * Chứng từ khấu trừ thuế TNCN dạng HTML để in hoặc lưu PDF từ trình duyệt, theo nội dung tại Nghị định 123/2020/NĐ-CP Điều 32 khoản 1 (sửa đổi bởi
 * Nghị định 70/2025/NĐ-CP). Chưa có chữ ký số của tổ chức nên in kèm dòng "chưa ký số"; chứng từ đã hủy in kèm dòng "Đã hủy".
 */
export function pitVoucherHtml(voucher: PitVoucher): string {
  const row = (label: string, value: string) => `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(value) || '..............................'}</td></tr>`;
  const notice = voucher.status === 'Đã hủy' ? `<div class="notice">Chứng từ đã hủy: ${escapeHtml(voucher.cancelReason)}</div>` : '<div class="notice">Chứng từ chưa ký số</div>';
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>Chứng từ khấu trừ thuế TNCN ${escapeHtml(voucher.series)}-${escapeHtml(voucher.number)}</title>
<style>@page{size:A4;margin:15mm}body{font-family:"Times New Roman",serif;font-size:13px;color:#000}h1{text-align:center;font-size:18px;margin:8px 0 2px}
.meta{text-align:right;font-size:12px}table{width:100%;border-collapse:collapse;margin:6px 0}td{padding:3px 4px;vertical-align:top}td:first-child{width:46%}
h2{font-size:14px;margin:10px 0 2px}.notice{text-align:center;color:#b45309;font-weight:bold;margin:6px 0}.sign{text-align:right;margin-top:24px}</style></head><body>
<div class="meta">Ký hiệu mẫu: ${escapeHtml(voucher.templateSymbol)} · Ký hiệu: ${escapeHtml(voucher.series)} · Số: ${escapeHtml(voucher.number)}</div>
<h1>CHỨNG TỪ KHẤU TRỪ THUẾ THU NHẬP CÁ NHÂN</h1>${notice}
<h2>I. Thông tin tổ chức trả thu nhập</h2><table>${row('Tên tổ chức', voucher.company.name)}${row('Mã số thuế', voucher.company.taxCode)}${row('Địa chỉ', voucher.company.address)}${row('Điện thoại', voucher.company.phone)}</table>
<h2>II. Thông tin người nộp thuế</h2><table>${row('Họ và tên', voucher.person.name)}${row('Mã số thuế', voucher.person.taxCode)}${row('Số định danh cá nhân', voucher.person.identityNumber)}${row('Quốc tịch', voucher.person.nationality)}${row('Cá nhân cư trú', voucher.person.resident ? 'Có' : 'Không')}${row('Địa chỉ', voucher.person.address)}${row('Điện thoại', voucher.person.phone)}</table>
<h2>III. Thông tin thuế thu nhập cá nhân khấu trừ</h2><table>${row('Khoản thu nhập', voucher.incomeType)}${row('Thời điểm trả thu nhập', voucher.paymentPeriod)}${row('Tổng thu nhập chịu thuế đã trả', money(voucher.taxableIncome))}${row('Khoản đóng bảo hiểm bắt buộc', money(voucher.insurance))}${row('Khoản từ thiện, nhân đạo, khuyến học', money(voucher.charity))}${row('Số thuế thu nhập cá nhân đã khấu trừ', money(voucher.taxWithheld))}</table>
<div class="sign">Ngày ${new Date(voucher.issuedAt).toLocaleDateString('vi-VN')}<br>Người lập: ${escapeHtml(voucher.issuedBy)}<br><i>Đại diện tổ chức trả thu nhập (chữ ký số)</i></div>
</body></html>`;
}

/** Mở cửa sổ in. Trả về false khi trình duyệt chặn cửa sổ bật lên. */
export function printPitVoucher(voucher: PitVoucher): boolean {
  const popup = window.open('', '_blank', 'width=900,height=700');
  if (!popup) return false;
  popup.document.write(pitVoucherHtml(voucher));
  popup.document.close();
  popup.setTimeout(() => popup.print(), 250);
  return true;
}
