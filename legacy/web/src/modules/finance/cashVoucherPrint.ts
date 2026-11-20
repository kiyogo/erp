import type { CompanyProfile, FinanceCashTransaction } from '../../api/endpoints';
import { vndInWords } from '../../utils/vndInWords.ts';

const escapeHtml = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));

const dateParts = (iso: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return match ? `Ngày ${Number(match[3])} tháng ${Number(match[2])} năm ${match[1]}` : 'Ngày ..... tháng ..... năm .....';
};

const uniqueAccounts = (lines: FinanceCashTransaction['journalLines'] | undefined, side: 'debitAccount' | 'creditAccount') =>
  [...new Set((lines || []).map((line) => String(line[side] || '').replace(/^TK\s*/i, '').trim()).filter(Boolean))].join(', ');

/**
 * Phiếu thu (mẫu 01-TT) hoặc phiếu chi (mẫu 02-TT) dạng HTML để in hoặc lưu PDF từ trình duyệt (giữ đủ dấu tiếng Việt).
 * Nội dung theo Luật Kế toán 88/2015/QH13 Điều 16: tên, số hiệu, ngày lập, người nộp hoặc nhận và địa chỉ, nội dung nghiệp vụ,
 * số tiền bằng số và bằng chữ, chứng từ gốc kèm theo, chữ ký. Bố cục và số mẫu 01-TT, 02-TT theo mẫu quen thuộc của chế độ kế toán
 * trước đây; chưa đối chiếu được phụ lục mẫu chứng từ của Thông tư 99/2025/TT-BTC (có hiệu lực từ 01/01/2026) nên không ghi số thông tư lên phiếu.
 */
export function cashVoucherHtml(transaction: FinanceCashTransaction, company: Partial<CompanyProfile>): string {
  const isReceipt = transaction.type === 'Thu';
  const title = isReceipt ? 'PHIẾU THU' : 'PHIẾU CHI';
  const form = isReceipt ? 'Mẫu số 01 - TT' : 'Mẫu số 02 - TT';
  const debit = uniqueAccounts(transaction.journalLines, 'debitAccount');
  const credit = uniqueAccounts(transaction.journalLines, 'creditAccount');
  const partyLabel = isReceipt ? 'Họ và tên người nộp tiền' : 'Họ và tên người nhận tiền';
  const party = transaction.payerName || transaction.recipientOrPayer;
  const signatures = isReceipt
    ? ['Giám đốc', 'Kế toán trưởng', 'Người nộp tiền', 'Người lập phiếu', 'Thủ quỹ']
    : ['Giám đốc', 'Kế toán trưởng', 'Thủ quỹ', 'Người lập phiếu', 'Người nhận tiền'];
  const pending = transaction.status === 'Chờ duyệt' ? '<div class="pending">Phiếu chưa ghi sổ</div>' : '';
  const words = vndInWords(transaction.amount);
  const line = (label: string, value: string) => `<p>${escapeHtml(label)}: <span class="value">${escapeHtml(value) || '.................................'}</span></p>`;
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>${escapeHtml(title)} ${escapeHtml(transaction.code)}</title>
<style>@page{size:A5 landscape;margin:10mm}body{font-family:"Times New Roman",serif;font-size:13px;color:#000;margin:0}
.head{display:flex;justify-content:space-between;gap:16px}.org{max-width:60%}.org b{text-transform:uppercase}.form{text-align:center;font-size:12px}
h1{text-align:center;margin:10px 0 2px;font-size:20px}.date{text-align:center;font-style:italic;margin:0 0 8px}
.meta{display:flex;justify-content:space-between;gap:16px}p{margin:4px 0}.value{font-weight:bold}.amount{font-weight:bold}
.sign{display:flex;justify-content:space-between;text-align:center;margin-top:12px}.sign div{flex:1}.sign i{display:block;font-size:11px}.pending{color:#b45309;text-align:center;font-weight:bold}
</style></head><body>
<div class="head"><div class="org"><b>${escapeHtml(company.fullName || company.companyName || 'Tên đơn vị')}</b><br>Địa chỉ: ${escapeHtml(company.address || '')}${company.taxCode ? `<br>Mã số thuế: ${escapeHtml(company.taxCode)}` : ''}</div>
<div class="form"><b>${escapeHtml(form)}</b></div></div>
<h1>${title}</h1><p class="date">${escapeHtml(dateParts(transaction.voucherDate || transaction.date))}</p>${pending}
<div class="meta"><div>Số: <b>${escapeHtml(transaction.code)}</b></div><div>${debit ? `Nợ: ${escapeHtml(debit)}` : ''}<br>${credit ? `Có: ${escapeHtml(credit)}` : ''}</div></div>
${line(partyLabel, party)}
${line('Địa chỉ', transaction.counterpartyAddress || '')}
${line(isReceipt ? 'Lý do nộp' : 'Lý do chi', transaction.category + (transaction.note ? ` - ${transaction.note}` : ''))}
<p>Số tiền: <span class="amount">${escapeHtml(transaction.amount.toLocaleString('vi-VN'))} đồng</span> (Viết bằng chữ): <span class="value">${escapeHtml(words)}</span></p>
${line('Kèm theo', `${transaction.attachmentCount || 0} chứng từ gốc${transaction.sourceDocument ? ` (${transaction.sourceDocument})` : ''}${transaction.reference ? `, tham chiếu ${transaction.reference}` : ''}`)}
<p>Đã nhận đủ số tiền (viết bằng chữ): ${isReceipt ? `<span class="value">${escapeHtml(words)}</span>` : '.................................'}</p>
<p style="text-align:right;font-style:italic">${escapeHtml(dateParts(transaction.voucherDate || transaction.date))}</p>
<div class="sign">${signatures.map((name) => `<div><b>${escapeHtml(name)}</b><i>(Ký, họ tên${name === 'Giám đốc' ? ', đóng dấu' : ''})</i></div>`).join('')}</div>
</body></html>`;
}

/** Mở cửa sổ in. Trả về false khi trình duyệt chặn cửa sổ bật lên. */
export function printCashVoucher(transaction: FinanceCashTransaction, company: Partial<CompanyProfile>): boolean {
  const popup = window.open('', '_blank', 'width=900,height=650');
  if (!popup) return false;
  popup.document.write(cashVoucherHtml(transaction, company));
  popup.document.close();
  popup.setTimeout(() => popup.print(), 250);
  return true;
}
