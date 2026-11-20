import assert from 'node:assert/strict';
import test from 'node:test';
import { vndInWords as apiWords } from '../../api/invoiceRules.mjs';
import { vndInWords as webWords } from '../src/utils/vndInWords.ts';
import { cashVoucherHtml } from '../src/modules/finance/cashVoucherPrint.ts';

test('số tiền bằng chữ ở web khớp với máy chủ', () => {
  for (const amount of [0, 1, 5, 10, 11, 15, 21, 25, 101, 105, 110, 1000, 1005, 1_234_567, 10_000_000, 1_000_000_001, 999_999_999_999]) {
    assert.equal(webWords(amount), apiWords(amount), String(amount));
  }
  assert.equal(webWords(1_234_567), 'Một triệu hai trăm ba mươi tư nghìn năm trăm sáu mươi bảy đồng chẵn');
  assert.throws(() => webWords(-1));
  assert.throws(() => webWords(1.5));
});

const company = { fullName: 'Công ty <Thử> & Nghiệm', address: 'Hà Nội', taxCode: '0100109106' };
const voucher = (over) => ({ key: 'k', code: 'PT-20261120-AB12', type: 'Thu', source: 'bank', category: 'Thu tiền khách hàng theo chứng từ', amount: 1_100_000, date: '2026-11-20', voucherDate: '2026-11-19',
  recipientOrPayer: 'Khách A', payerName: 'Nguyễn Văn A', counterpartyAddress: '1 Phố Huế', attachmentCount: 2, sourceDocument: 'SALE-1', note: 'Đợt 1', account: 'NH', status: 'Đã hoàn thành',
  journalLines: [{ description: 'x', debitAccount: 'TK 112', creditAccount: '131', amount: 1_100_000 }], ...over });

test('phiếu thu: đủ nội dung bắt buộc, số tiền bằng chữ, chữ ký và thoát ký tự HTML', () => {
  const html = cashVoucherHtml(voucher(), company);
  for (const text of ['PHIẾU THU', 'Mẫu số 01 - TT', 'Ngày 19 tháng 11 năm 2026', 'PT-20261120-AB12', 'Nợ: 112', 'Có: 131', 'Nguyễn Văn A', '1 Phố Huế',
    'Một triệu một trăm nghìn đồng chẵn', '1.100.000 đồng', '2 chứng từ gốc (SALE-1)', 'Người nộp tiền', 'Thủ quỹ', 'đóng dấu']) assert.ok(html.includes(text), text);
  assert.ok(html.includes('Công ty &lt;Thử&gt; &amp; Nghiệm'));
  assert.ok(!html.includes('Phiếu chưa ghi sổ'));
});

test('phiếu chi: mẫu 02-TT, người nhận tiền, phiếu chờ duyệt đánh dấu chưa ghi sổ', () => {
  const html = cashVoucherHtml(voucher({ type: 'Chi', status: 'Chờ duyệt', payerName: '', journalLines: [{ description: 'y', debitAccount: '331', creditAccount: '1121', amount: 1_100_000 }] }), company);
  for (const text of ['PHIẾU CHI', 'Mẫu số 02 - TT', 'Họ và tên người nhận tiền', 'Khách A', 'Nợ: 331', 'Có: 1121', 'Người nhận tiền', 'Phiếu chưa ghi sổ', 'Lý do chi']) assert.ok(html.includes(text), text);
  assert.ok(!html.includes('Họ và tên người nộp tiền'));
});
