// Giữ khớp với legacy/api/loanEquityRules.mjs; tests/loan-equity-options.test.mjs so khớp hai bản.
export const COUNTERPARTY_TYPES: Record<string, string> = {
  credit_institution: 'Tổ chức tín dụng, chi nhánh ngân hàng nước ngoài',
  enterprise: 'Doanh nghiệp, tổ chức khác',
  individual: 'Cá nhân',
};
export const SHARE_CLASSES: Record<string, string> = {
  ordinary: 'Cổ phần phổ thông',
  voting_preference: 'Cổ phần ưu đãi biểu quyết',
  dividend_preference: 'Cổ phần ưu đãi cổ tức',
  redeemable_preference: 'Cổ phần ưu đãi hoàn lại',
};
export const HOLDER_KINDS: Record<string, string> = { individual: 'Cá nhân', organization: 'Tổ chức' };
const toOptions = (map: Record<string, string>) => Object.entries(map).map(([value, label]) => ({ value, label }));
export const COUNTERPARTY_TYPE_OPTIONS = toOptions(COUNTERPARTY_TYPES);
export const SHARE_CLASS_OPTIONS = toOptions(SHARE_CLASSES);
export const HOLDER_KIND_OPTIONS = toOptions(HOLDER_KINDS);
