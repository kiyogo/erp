import type { CrmContact } from '../../api/endpoints';

const contactTypeLabels = {
  customer: 'Khách hàng',
  supplier: 'Nhà cung cấp',
  partner: 'Đối tác',
} as const;

export function crmContactExportRows(contacts: CrmContact[]) {
  return [
    ['Mã đối tác', 'Loại', 'Tên tổ chức', 'Mã số thuế', 'Ngành nghề', 'Người liên hệ', 'Điện thoại', 'Email', 'Địa chỉ', 'Tài khoản ngân hàng', 'Hạn mức', 'Giá trị giao dịch', 'Công nợ', 'Hạng', 'Người phụ trách', 'Trạng thái'],
    ...contacts.map((contact) => [
      contact.code, contactTypeLabels[contact.type], contact.name, contact.taxCode, contact.industry,
      contact.contactPerson, contact.phone, contact.email, contact.address, contact.bankAccount,
      contact.creditLimit, contact.totalValue, contact.debtBalance, contact.tier, contact.accountManager, contact.status,
    ]),
  ];
}
