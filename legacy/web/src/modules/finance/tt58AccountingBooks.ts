export type TT58VatMethod = 'direct_revenue' | 'deduction';
export type TT58CitMethod = 'revenue_percentage' | 'taxable_income';

export interface TT58Book {
  code: string;
  name: string;
}

const books: Record<string, TT58Book> = {
  S1: { code: 'S1-DNSN', name: 'Sổ doanh thu bán hàng hóa, dịch vụ' },
  S2a: { code: 'S2a-DNSN', name: 'Sổ doanh thu bán hàng hóa, dịch vụ' },
  S2b: { code: 'S2b-DNSN', name: 'Sổ chi tiết doanh thu, chi phí' },
  S2c: { code: 'S2c-DNSN', name: 'Sổ chi tiết vật liệu, dụng cụ, sản phẩm, hàng hóa' },
  S2d: { code: 'S2d-DNSN', name: 'Sổ chi tiết tiền' },
  S3a: { code: 'S3a-DNSN', name: 'Sổ doanh thu bán hàng hóa, dịch vụ' },
  S3b: { code: 'S3b-DNSN', name: 'Sổ theo dõi nghĩa vụ thuế GTGT' },
};

const booksByTaxMethod: Record<string, readonly string[]> = {
  'direct_revenue:revenue_percentage': ['S1'],
  'direct_revenue:taxable_income': ['S2a', 'S2b', 'S2c', 'S2d'],
  'deduction:revenue_percentage': ['S3a', 'S3b'],
  'deduction:taxable_income': ['S2b', 'S2c', 'S2d', 'S3b'],
};

export const tt58OptionalBooks: readonly TT58Book[] = [
  { code: 'S4a-DNSN', name: 'Sổ chi tiết thanh toán công nợ' },
  { code: 'S4b-DNSN', name: 'Sổ tài sản cố định' },
  { code: 'S4c-DNSN', name: 'Sổ theo dõi nghĩa vụ thuế khác' },
  { code: 'S4d-DNSN', name: 'Sổ theo dõi vốn chủ sở hữu' },
];

export function getTT58RequiredBooks(vatMethod: string, citMethod: string): TT58Book[] | null {
  const selected = booksByTaxMethod[`${vatMethod}:${citMethod}`];
  return selected ? selected.map((key) => books[key]) : null;
}
