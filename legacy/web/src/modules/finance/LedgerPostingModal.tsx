import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Button, Input, Modal, message } from '../../custom-ui';
import { financeLedgerPostingApi, type LedgerPreviewLine, type LedgerSourceKind } from '../../api/endpoints';

const formatMoney = (value: number) => (value ? value.toLocaleString('vi-VN') : '');

/** Danh sách chứng từ, hồ sơ thanh lý đã ghi sổ cái (khóa nguồn dạng `document:<id>` hoặc `asset-disposal:<key>`). */
export function useLedgerPostings() {
  const [posted, setPosted] = useState<Set<string>>(new Set());
  const reload = useCallback(async () => {
    try {
      setPosted(new Set((await financeLedgerPostingApi.list()).data.data.map((item) => item.sourceReference)));
    } catch {
      setPosted(new Set());
    }
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { posted, reload };
}

export const ledgerReference = (kind: LedgerSourceKind, key: string) => (kind === 'documents' ? `document:${key}` : kind === 'asset-disposals' ? `asset-disposal:${key}` : kind === 'inventory-provisions' ? `inventory-provision:${key}` : `inventory-issue:${key}`);
/** Phiếu kho có thể ghi giá vốn (xuất) hoặc chênh lệch kiểm kê (kiểm kê), nên kiểm tra cả hai khóa nguồn. */
export const isLedgerPosted = (posted: Set<string>, kind: LedgerSourceKind, key: string) => posted.has(ledgerReference(kind, key)) || (kind === 'inventory-transactions' && posted.has(`inventory-count:${key}`));

/** Cột "Sổ cái" của bảng: nhãn đã ghi sổ hoặc nút mở hộp thoại ghi sổ. */
export const ledgerPostingColumn = (kind: LedgerSourceKind, posted: Set<string>, open: (key: string, title: string) => void, titleOf: (record: any) => string) => ({
  title: 'Sổ cái',
  key: 'ledger',
  width: 120,
  render: (_: unknown, record: any) => (record.status === 'Đã hủy' ? '—' : isLedgerPosted(posted, kind, record.key)
    ? <span style={{ color: '#16A34A' }}>Đã ghi sổ</span>
    : <Button onClick={() => open(record.key, titleOf(record))}>Ghi sổ</Button>),
});

type Props = { target: { kind: LedgerSourceKind; key: string; title: string } | null; onClose: () => void; onPosted: () => void };

/** Xem trước bút toán dựng từ chứng từ, cho đổi mã tài khoản chi tiết rồi ghi sổ cái. */
export const LedgerPostingModal: React.FC<Props> = ({ target, onClose, onPosted }) => {
  const [lines, setLines] = useState<LedgerPreviewLine[]>([]);
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [meta, setMeta] = useState<{ voucherCode: string; entryDate: string; amount: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setLines([]);
    setMeta(null);
    setLoading(true);
    financeLedgerPostingApi.preview(target.kind, target.key)
      .then((response) => {
        const preview = response.data.preview;
        setMeta({ voucherCode: preview.voucherCode, entryDate: preview.entryDate, amount: preview.amount });
        setLines(preview.lines);
        setAccounts(Object.fromEntries(preview.lines.map((line) => [line.defaultAccount, line.account])));
      })
      .catch((error: any) => {
        message.error(error?.response?.data?.message || 'Không dựng được bút toán.');
        onClose();
      })
      .finally(() => setLoading(false));
  }, [target]);

  const submit = async () => {
    if (!target || saving) return;
    setSaving(true);
    try {
      await financeLedgerPostingApi.post(target.kind, target.key, accounts);
      message.success('Đã ghi sổ cái.');
      onPosted();
      onClose();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không ghi được sổ cái.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Ghi sổ cái ${target?.title || ''}`} open={!!target} onCancel={onClose} footer={null} width={760}>
      <div style={{ marginTop: 14 }}>
        <Alert type="info" showIcon message="Bút toán dựng từ chứng từ; đổi mã tài khoản chi tiết nếu danh mục của bạn khác. Đã ghi sổ thì không ghi lại. Không ghi sổ cả đơn bán và hóa đơn đầu ra của cùng một giao dịch vì doanh thu sẽ bị ghi hai lần." />
        {meta && <div style={{ margin: '12px 0', color: '#64748B' }}>Số chứng từ {meta.voucherCode}, ngày hạch toán {meta.entryDate}, tổng {formatMoney(meta.amount)} ₫</div>}
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ color: '#64748B', textAlign: 'left' }}><th style={{ width: 150 }}>Tài khoản</th><th style={{ textAlign: 'right' }}>Nợ</th><th style={{ textAlign: 'right' }}>Có</th><th style={{ paddingLeft: 12 }}>Nội dung</th></tr></thead>
          <tbody>
            {lines.map((line, index) => (
              <tr key={`${line.defaultAccount}-${index}`}>
                <td style={{ padding: '4px 0' }}>
                  <Input value={accounts[line.defaultAccount] ?? line.account} onChange={(event: React.ChangeEvent<HTMLInputElement>) => setAccounts((current) => ({ ...current, [line.defaultAccount]: event.target.value }))} placeholder={line.alternatives.slice(0, 3).join(', ')} />
                </td>
                <td style={{ textAlign: 'right' }}>{formatMoney(line.debit)}</td>
                <td style={{ textAlign: 'right' }}>{formatMoney(line.credit)}</td>
                <td style={{ paddingLeft: 12, color: '#64748B' }}>{line.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <div style={{ color: '#64748B', marginTop: 12 }}>Đang dựng bút toán...</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <Button onClick={onClose}>Hủy</Button>
          <Button type="primary" loading={saving} disabled={!lines.length} onClick={() => void submit()} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Ghi sổ cái</Button>
        </div>
      </div>
    </Modal>
  );
};
