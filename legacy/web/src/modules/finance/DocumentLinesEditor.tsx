import React, { useEffect, useState } from 'react';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Button, Input, Modal, Select } from '../../custom-ui';
import { dataService } from '../../services/dataService';
import type { FinanceDocument } from '../../api/endpoints';
import { emptyLine, lineAmount, linesNet, type DocumentLine, type DocumentLineDraft } from './documentLines';

type InventoryItem = { key: string; sku?: string; name: string; unit?: string; unitPrice?: number };
const money = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;
const GRID = '1.3fr 1.6fr 0.7fr 0.7fr 1fr 0.9fr 1fr 32px';

/** Nhập dòng hàng của chứng từ. Có dòng thì tiền hàng chưa thuế của chứng từ bằng tổng thành tiền các dòng (máy chủ kiểm tra lại). */
export const DocumentLinesEditor: React.FC<{ value: DocumentLineDraft[]; onChange: (lines: DocumentLineDraft[]) => void }> = ({ value, onChange }) => {
  const [items, setItems] = useState<InventoryItem[]>([]);
  useEffect(() => {
    void dataService.refreshGenericData('finance_inventory').catch(() => undefined).then(() => setItems(dataService.getGenericData('finance_inventory') as InventoryItem[]));
  }, []);
  const update = (id: string, patch: Partial<DocumentLineDraft>) => onChange(value.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  const pickItem = (id: string, itemKey?: string) => {
    const item = items.find((entry) => entry.key === itemKey);
    update(id, item ? { itemKey: item.key, name: item.name, unit: item.unit || '', ...(item.unitPrice ? { unitPrice: String(item.unitPrice) } : {}) } : { itemKey: undefined });
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ marginBottom: 8, color: '#0F172A' }}>Dòng hàng hóa, dịch vụ</div>
      {value.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 6, fontSize: 12, color: '#64748B', marginBottom: 4 }}>
          <span>Mặt hàng kho</span><span>Tên hàng hóa, dịch vụ</span><span>Đơn vị tính</span><span>Số lượng</span><span>Đơn giá</span><span>Chiết khấu</span><span style={{ textAlign: 'right' }}>Thành tiền</span><span />
        </div>
      )}
      {value.map((line) => (
        <div key={line.id} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 6, alignItems: 'center', marginBottom: 6 }}>
          <Select showSearch allowClear value={line.itemKey} placeholder="Không chọn" onChange={(key: string) => pickItem(line.id, key || undefined)}
            options={items.map((item) => ({ value: item.key, label: `${item.sku ? `${item.sku} · ` : ''}${item.name}` }))} />
          <Input value={line.name} onChange={(event) => update(line.id, { name: event.target.value })} />
          <Input value={line.unit} disabled={!!line.itemKey} onChange={(event) => update(line.id, { unit: event.target.value })} />
          <Input type="number" min={0} step="0.001" value={line.quantity} onChange={(event) => update(line.id, { quantity: event.target.value })} />
          <Input type="number" min={0} step="0.01" value={line.unitPrice} onChange={(event) => update(line.id, { unitPrice: event.target.value })} />
          <Input type="number" min={0} step="1" value={line.discount} onChange={(event) => update(line.id, { discount: event.target.value })} />
          <span style={{ textAlign: 'right', color: lineAmount(line) < 0 ? '#DC2626' : '#0F172A' }}>{money(lineAmount(line))}</span>
          <Button icon={<DeleteOutlined />} aria-label="Xóa dòng" onClick={() => onChange(value.filter((entry) => entry.id !== line.id))} />
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <Button icon={<PlusOutlined />} onClick={() => onChange([...value, emptyLine()])}>Thêm dòng hàng</Button>
        {value.length > 0 && <span style={{ color: '#64748B' }}>Tổng thành tiền {money(linesNet(value))}</span>}
      </div>
    </div>
  );
};

/** Xem dòng hàng đã lưu của chứng từ. */
export const DocumentLinesModal: React.FC<{ document: FinanceDocument | null; onClose: () => void }> = ({ document, onClose }) => {
  const lines: DocumentLine[] = document?.lines || [];
  return (
    <Modal title={`Dòng hàng của chứng từ ${document?.code || ''}`} open={!!document} onCancel={onClose} footer={null} width={860}>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 14, fontSize: 13 }}>
        <thead>
          <tr style={{ color: '#64748B', textAlign: 'left' }}>
            <th style={{ padding: 6, fontWeight: 400 }}>STT</th><th style={{ padding: 6, fontWeight: 400 }}>Tên hàng hóa, dịch vụ</th><th style={{ padding: 6, fontWeight: 400 }}>Đơn vị tính</th>
            <th style={{ padding: 6, fontWeight: 400, textAlign: 'right' }}>Số lượng</th><th style={{ padding: 6, fontWeight: 400, textAlign: 'right' }}>Đơn giá</th>
            <th style={{ padding: 6, fontWeight: 400, textAlign: 'right' }}>Chiết khấu</th><th style={{ padding: 6, fontWeight: 400, textAlign: 'right' }}>Thành tiền</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={index} style={{ borderTop: '1px solid #E2E8F0' }}>
              <td style={{ padding: 6 }}>{index + 1}</td>
              <td style={{ padding: 6 }}>{line.sku ? `${line.sku} · ` : ''}{line.name}</td>
              <td style={{ padding: 6 }}>{line.unit}</td>
              <td style={{ padding: 6, textAlign: 'right' }}>{line.quantity.toLocaleString('vi-VN')}</td>
              <td style={{ padding: 6, textAlign: 'right' }}>{money(line.unitPrice)}</td>
              <td style={{ padding: 6, textAlign: 'right' }}>{line.discount ? money(line.discount) : '—'}</td>
              <td style={{ padding: 6, textAlign: 'right' }}>{money(line.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {document && (
        <div style={{ marginTop: 12, textAlign: 'right', color: '#64748B' }}>
          Tiền hàng chưa thuế {money(document.amount - document.vatAmount)}, thuế GTGT {document.vatRate}% {money(document.vatAmount)}, tổng {money(document.amount)}
        </div>
      )}
    </Modal>
  );
};

/** Nút "N dòng hàng" trong cột nội dung của danh sách chứng từ. */
export const DocumentLinesLink: React.FC<{ document: FinanceDocument; onOpen: (document: FinanceDocument) => void }> = ({ document, onOpen }) =>
  document.lines?.length ? <a style={{ fontSize: 12 }} onClick={() => onOpen(document)}>{document.lines.length} dòng hàng</a> : null;
