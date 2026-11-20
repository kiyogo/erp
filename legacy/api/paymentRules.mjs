// Thanh toán theo chứng từ công nợ: phiếu thu (khách trả tiền, nhà cung cấp hoàn tiền) và phiếu chi (trả nhà cung cấp, hoàn tiền khách)
// gắn với chứng từ bán, mua, hóa đơn, hàng trả lại, giảm giá. Định khoản: thu từ khách Nợ tiền Có 131; trả nhà cung cấp Nợ 331 Có tiền;
// hoàn tiền khách Nợ 131 Có tiền; nhà cung cấp hoàn Nợ tiền Có 331. Mã tiền mặt 111, tiền gửi ngân hàng 112 (đổi sang tài khoản chi tiết
// theo danh mục khi ghi sổ). Số còn thanh toán được của chứng từ gốc đã trừ hàng trả lại, giảm giá.

import { documentKind } from './ledgerPostingRules.mjs';

const PLANS = {
  sale: { type: 'Thu', partnerAccount: '131', category: 'Thu tiền khách hàng theo chứng từ', note: 'Thu tiền khách hàng' },
  purchase: { type: 'Chi', partnerAccount: '331', category: 'Chi trả nhà cung cấp theo chứng từ', note: 'Trả tiền nhà cung cấp' },
  saleAdjustment: { type: 'Chi', partnerAccount: '131', category: 'Hoàn tiền cho khách hàng', note: 'Hoàn tiền cho khách hàng (hàng trả lại, giảm giá)' },
  purchaseAdjustment: { type: 'Thu', partnerAccount: '331', category: 'Nhà cung cấp hoàn tiền', note: 'Nhà cung cấp hoàn tiền (hàng trả lại, giảm giá)' },
};

// credit: tổng hàng trả lại, giảm giá đã trừ vào chứng từ gốc. Trả về { problem } hoặc kế hoạch thanh toán kèm số còn thanh toán được.
export function documentPaymentPlan(document, credit = 0) {
  if (document.status === 'Đã hủy') return { problem: 'Chứng từ đã hủy, không thanh toán.' };
  if (document.subtype === 'Báo giá') return { problem: 'Báo giá chưa phát sinh công nợ.' };
  const plan = PLANS[documentKind(document)];
  if (!plan) return { problem: 'Loại chứng từ này chưa có quy tắc thanh toán.' };
  const adjustment = documentKind(document).endsWith('Adjustment');
  const limit = adjustment ? document.amount : document.amount - credit;
  return { ...plan, limit, remaining: Math.max(0, limit - document.paidAmount) };
}

// cashAccount: mã tài khoản tiền (111 hoặc 112 hoặc chi tiết). Dòng hạch toán theo mẫu của phiếu thu chi.
export function paymentJournalLines(plan, cashAccount, amount, description) {
  const debit = plan.type === 'Thu' ? cashAccount : plan.partnerAccount;
  const credit = plan.type === 'Thu' ? plan.partnerAccount : cashAccount;
  return [{ description, debitAccount: debit, creditAccount: credit, amount }];
}
