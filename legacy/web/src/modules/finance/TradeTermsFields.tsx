import React from 'react';
import { Form, Input, Select } from '../../custom-ui';
import { PAYMENT_METHOD_OPTIONS } from './tradeTerms';

/** Ô nhập hình thức thanh toán: dùng riêng ở hóa đơn, kèm trong khối điều khoản ở đơn và hợp đồng. */
export const PaymentMethodField: React.FC = () => (
  <Form.Item name="terms_paymentMethod" label="Hình thức thanh toán">
    <Select allowClear options={PAYMENT_METHOD_OPTIONS} placeholder="Chọn hình thức thanh toán" />
  </Form.Item>
);

const row = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } as const;

/** Khối điều khoản thương mại của đơn hàng, hợp đồng mua hoặc bán (Luật Thương mại 2005). Mọi ô đều tùy chọn. */
export const TradeTermsFields: React.FC<{ withInvoice?: boolean }> = ({ withInvoice }) => (
  <>
    {withInvoice && (
      <div style={row}>
        <Form.Item name="terms_invoiceNo" label="Số hóa đơn của nhà cung cấp"><Input /></Form.Item>
        <Form.Item name="terms_invoiceSymbol" label="Ký hiệu hóa đơn"><Input /></Form.Item>
      </div>
    )}
    <div style={row}>
      <Form.Item name="terms_contractNo" label="Số hợp đồng"><Input /></Form.Item>
      <Form.Item name="terms_signedDate" label="Ngày ký"><Input type="date" /></Form.Item>
    </div>
    <div style={row}>
      <Form.Item name="terms_effectiveDate" label="Ngày hiệu lực"><Input type="date" /></Form.Item>
      <Form.Item name="terms_expiryDate" label="Ngày hết hạn"><Input type="date" /></Form.Item>
    </div>
    <div style={row}>
      <Form.Item name="terms_deliveryDate" label="Ngày giao hàng"><Input type="date" /></Form.Item>
      <Form.Item name="terms_deliveryAddress" label="Địa điểm giao hàng"><Input /></Form.Item>
    </div>
    <div style={row}>
      <PaymentMethodField />
      <Form.Item name="terms_paymentTermDays" label="Thời hạn thanh toán (ngày)"><Input type="number" min={0} max={720} /></Form.Item>
    </div>
    <div style={row}>
      <Form.Item name="terms_penaltyRate" label="Phạt vi phạm (%, tối đa 8)"><Input type="number" min={0} max={8} step="0.01" /></Form.Item>
      <Form.Item name="terms_lateInterestRate" label="Lãi chậm thanh toán (%/năm)"><Input type="number" min={0} max={100} step="0.01" /></Form.Item>
    </div>
    <Form.Item name="terms_warrantyMonths" label="Thời gian bảo hành (tháng)"><Input type="number" min={0} max={600} /></Form.Item>
    <Form.Item name="terms_note" label="Ghi chú điều khoản"><Input.TextArea rows={2} /></Form.Item>
  </>
);
