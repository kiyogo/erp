import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditOutlined, PaperClipOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { filesApi, financeCashApi, financePaymentsApi, FinanceCashTransaction, FinancePaymentAccount } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { Button, Input, message, Modal, Select, Tag } from '../../custom-ui';

type CountLine = { denomination: number; quantity: number; note: string };
type CountFile = { id: string; name: string; size: number; mimeType?: string };
type CashCount = {
  key: string; code: string; purpose: string; countDate: string; currency: string; reference: string;
  date: string; time: string; participants: string; lines: CountLine[]; bookBalance: number;
  actualBalance: number; difference: number; reconciliation: string; reason: string; conclusion: string;
  resolved: boolean; attachments: CountFile[]; status: string;
};

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const timeNow = () => new Date().toLocaleTimeString('vi-VN', { hour12: false });
const denominations = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000];
const cashCountCode = (index: number) => `KKQ${String(index).padStart(5, '0')}`;
const money = (amount: number) => `${Number(amount || 0).toLocaleString('vi-VN')} ₫`;
const blankLines = (): CountLine[] => denominations.map(denomination => ({ denomination, quantity: 0, note: `Loại mệnh giá ${denomination}` }));
const dateText = (value?: string) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('vi-VN') : '—';

export const CashCountModule: React.FC = () => {
  const [records, setRecords] = useState<CashCount[]>([]);
  const [accounts, setAccounts] = useState<FinancePaymentAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [referenceSearch, setReferenceSearch] = useState('');
  const [referenceFrom, setReferenceFrom] = useState('');
  const [referenceTo, setReferenceTo] = useState('');
  const [transactions, setTransactions] = useState<FinanceCashTransaction[]>([]);
  const [draft, setDraft] = useState<Partial<CashCount>>({});
  const [editing, setEditing] = useState<CashCount | null>(null);
  const [lines, setLines] = useState<CountLine[]>(blankLines());
  const [savedFiles, setSavedFiles] = useState<CountFile[]>([]);
  const [removedFiles, setRemovedFiles] = useState<CountFile[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rows, accountResponse] = await Promise.all([
        dataService.refreshGenericData('finance_cash_counts'),
        financePaymentsApi.getAccounts(),
      ]);
      setRecords(rows as CashCount[]);
      setAccounts(accountResponse.data.accounts.filter(account => account.source === 'petty' && account.status === 'Đang hoạt động'));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được sổ kiểm kê quỹ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const bookBalance = accounts.reduce((sum, account) => sum + Number(account.balance || 0), 0);
  const actualBalance = lines.reduce((sum, line) => sum + Number(line.denomination || 0) * Number(line.quantity || 0), 0);
  const difference = Number(draft.bookBalance ?? bookBalance) - actualBalance;
  const sortedRecords = useMemo(() => [...records].sort((a, b) => `${b.countDate}${b.time}`.localeCompare(`${a.countDate}${a.time}`)), [records]);

  const close = () => {
    if (saving) return;
    setOpen(false);
    setEditing(null);
    setDraft({});
    setLines(blankLines());
    setSavedFiles([]);
    setRemovedFiles([]);
    setPendingFiles([]);
  };

  const openCreate = () => {
    const date = today();
    const code = cashCountCode(records.length + 1);
    setEditing(null);
    setDraft({ key: crypto.randomUUID(), code, purpose: `Kiểm kê tiền mặt tại quỹ đến ngày ${dateText(date)}`, countDate: date, currency: 'VND', reference: '', date, time: timeNow(), participants: '', bookBalance, reconciliation: '', reason: '', conclusion: '', resolved: false, status: 'Đã ghi nhận' });
    setLines(blankLines());
    setSavedFiles([]);
    setRemovedFiles([]);
    setPendingFiles([]);
    setOpen(true);
  };

  const openEdit = (record: CashCount) => {
    setEditing(record);
    setDraft({ ...record });
    setLines(record.lines?.length ? record.lines.map(line => ({ ...line })) : blankLines());
    setSavedFiles(record.attachments || []);
    setRemovedFiles([]);
    setPendingFiles([]);
    setOpen(true);
  };

  const setField = (name: keyof CashCount, value: any) => setDraft(current => ({ ...current, [name]: value }));
  const setLine = (index: number, name: keyof CountLine, value: any) => setLines(current => current.map((line, i) => i === index ? { ...line, [name]: name === 'denomination' || name === 'quantity' ? Number(value) : value } : line));

  const addFiles = (files: File[]) => {
    const total = [...savedFiles, ...pendingFiles].reduce((sum, file) => sum + Number(file.size || 0), 0) + files.reduce((sum, file) => sum + file.size, 0);
    if (total > 5 * 1024 * 1024) { message.error('Tổng dung lượng tệp đính kèm tối đa 5 MB.'); return; }
    setPendingFiles(current => [...current, ...files]);
  };

  const save = async () => {
    if (!draft.countDate || !draft.date || !draft.time) { message.error('Vui lòng nhập ngày kiểm kê, ngày lập và giờ lập.'); return; }
    if (lines.some(line => !Number.isFinite(line.denomination) || line.denomination < 0 || !Number.isInteger(line.quantity) || line.quantity < 0)) { message.error('Mệnh giá và số lượng phải là số không âm; số lượng phải là số nguyên.'); return; }
    setSaving(true);
    const uploaded: CountFile[] = [];
    try {
      if (pendingFiles.length) {
        const root = await filesApi.list(null);
        for (const file of pendingFiles) {
          const result = (await filesApi.upload(file, file.name, root.data.context.parentId || undefined, 'finance_cash_counts')).data.file;
          uploaded.push({ id: result.id || result.key, name: result.name, size: Number(result.sizeBytes) || file.size, mimeType: result.mime || file.type });
        }
      }
      const currentBookBalance = Number(draft.bookBalance ?? bookBalance);
      const currentActualBalance = lines.reduce((sum, line) => sum + line.denomination * line.quantity, 0);
      const record: CashCount = {
        ...(editing || {} as CashCount),
        ...draft,
        key: editing?.key || String(draft.key || crypto.randomUUID()),
        code: String(draft.code || cashCountCode(records.length + 1)),
        purpose: String(draft.purpose || '').trim(),
        countDate: String(draft.countDate), currency: String(draft.currency || 'VND'), reference: String(draft.reference || ''),
        date: String(draft.date), time: String(draft.time), participants: String(draft.participants || ''), lines,
        bookBalance: currentBookBalance, actualBalance: currentActualBalance, difference: currentBookBalance - currentActualBalance,
        reconciliation: String(draft.reconciliation || ''), reason: String(draft.reason || ''), conclusion: String(draft.conclusion || ''),
        resolved: Boolean(draft.resolved), attachments: [...savedFiles, ...uploaded], status: String(draft.status || 'Đã ghi nhận'),
      };
      if (editing) await dataService.updateGenericRecord('finance_cash_counts', record);
      else await dataService.createGenericRecord('finance_cash_counts', record);
      const removals = await Promise.allSettled(removedFiles.map(file => filesApi.remove(file.id)));
      if (removals.some(result => result.status === 'rejected')) message.warning('Đã lưu phiếu, nhưng một số tệp đã bỏ chưa được xóa khỏi kho tệp.');
      message.success(`${editing ? 'Đã cập nhật' : 'Đã lưu'} phiếu ${record.code}.`);
      close();
    } catch (error: any) {
      await Promise.all(uploaded.map(file => filesApi.remove(file.id).catch(() => {})));
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu phiếu kiểm kê quỹ.');
    } finally { setSaving(false); }
  };

  const openReference = async () => {
    setReferenceSearch('');
    setReferenceFrom('');
    setReferenceTo('');
    setReferenceOpen(true);
    try { setTransactions((await financeCashApi.getAll()).data.data); }
    catch { message.error('Không tải được chứng từ thu chi để chọn tham chiếu.'); }
  };

  const referenceRows = transactions.filter(item => {
    const query = referenceSearch.trim().toLocaleLowerCase();
    const date = String(item.date || '').slice(0, 10);
    return (!query || [item.code, item.category, item.note, item.recipientOrPayer, item.account].some(value => String(value || '').toLocaleLowerCase().includes(query)))
      && (!referenceFrom || date >= referenceFrom) && (!referenceTo || date <= referenceTo);
  });

  const columns = [
    { title: 'Số kiểm kê', dataIndex: 'code', key: 'code', width: 150, render: (value: string) => <strong>{value}</strong> },
    { title: 'Kiểm kê đến ngày', dataIndex: 'countDate', key: 'countDate', width: 150, render: (value: string) => dateText(value) },
    { title: 'Ngày lập', dataIndex: 'date', key: 'date', width: 130, render: (value: string) => dateText(value) },
    { title: 'Loại tiền', dataIndex: 'currency', key: 'currency', width: 100 },
    { title: 'Số dư theo sổ', dataIndex: 'bookBalance', key: 'bookBalance', width: 160, render: (value: number) => money(value) },
    { title: 'Số kiểm kê thực tế', dataIndex: 'actualBalance', key: 'actualBalance', width: 170, render: (value: number) => money(value) },
    { title: 'Chênh lệch', dataIndex: 'difference', key: 'difference', width: 150, render: (value: number) => <Tag color={Number(value) === 0 ? 'success' : 'warning'}>{money(value)}</Tag> },
    { title: 'Thao tác', key: 'actions', width: 110, render: (_: unknown, record: CashCount) => <Button size="small" aria-label={`Sửa phiếu ${record.code}`} icon={<EditOutlined />} onClick={() => openEdit(record)}>Sửa</Button> },
  ];

  const refColumns = [
    { title: 'Ngày hạch toán', dataIndex: 'date', key: 'date', width: 130, render: (value: string) => dateText(value) },
    { title: 'Ngày chứng từ', dataIndex: 'voucherDate', key: 'voucherDate', width: 130, render: (value: string, row: FinanceCashTransaction) => dateText(value || row.date) },
    { title: 'Số chứng từ', dataIndex: 'code', key: 'code', width: 140 },
    { title: 'Diễn giải', dataIndex: 'note', key: 'note', render: (value: string, row: FinanceCashTransaction) => value || row.category },
    { title: 'Đối tượng', dataIndex: 'counterpartyType', key: 'counterpartyType', width: 110 },
    { title: 'Tên đối tượng', dataIndex: 'recipientOrPayer', key: 'recipientOrPayer', width: 160 },
    { title: 'TK Nợ', key: 'debit', width: 100, render: (_: unknown, row: FinanceCashTransaction) => row.journalLines?.[0]?.debitAccount || '—' },
    { title: 'TK Có', key: 'credit', width: 100, render: (_: unknown, row: FinanceCashTransaction) => row.journalLines?.[0]?.creditAccount || '—' },
    { title: 'Số tiền', dataIndex: 'amount', key: 'amount', width: 130, render: (value: number) => money(value) },
    { title: '', key: 'choose', width: 90, render: (_: unknown, row: FinanceCashTransaction) => <Button size="small" onClick={() => { setField('reference', row.code); setReferenceOpen(false); }}>Chọn</Button> },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div><h1 style={{ margin: 0, color: '#0F172A', fontSize: 20 }}>Kiểm kê quỹ</h1><div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Danh sách phiếu kiểm kê tiền mặt tại quỹ.</div></div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm</Button>
      </div>

      <KTable dataSource={sortedRecords} columns={columns} loading={loading} rowKey="key" pagination={{ pageSize: 10 }} locale={{ emptyText: 'Chưa có phiếu kiểm kê quỹ.' }} />

      <Modal title={`${editing ? 'Sửa' : 'Thêm'} phiếu kiểm kê quỹ${draft.code ? ` ${draft.code}` : ''}`} open={open} onCancel={close} footer={null} width="min(1120px, calc(100vw - 32px))">
        <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '3px 14px' }}>
            <label style={labelStyle}>Mục đích<Input value={draft.purpose || ''} onChange={event => setField('purpose', event.target.value)} /></label>
            <label style={labelStyle}>Kiểm kê đến ngày<Input type="date" value={draft.countDate || ''} onChange={event => { const value = event.target.value; setField('countDate', value); setField('purpose', `Kiểm kê tiền mặt tại quỹ đến ngày ${dateText(value)}`); }} /></label>
            <label style={labelStyle}>Loại tiền<Select value={draft.currency || 'VND'} onChange={value => setField('currency', value)} options={[{ label: 'VND', value: 'VND' }]} style={{ width: '100%' }} /></label>
            <label style={labelStyle}>Tham chiếu<div style={{ display: 'flex', gap: 4 }}><Input value={draft.reference || ''} onChange={event => setField('reference', event.target.value)} style={{ flex: 1, minWidth: 0 }} /><Button onClick={() => void openReference()}>Chọn</Button></div></label>
            <label style={labelStyle}>Số<Input value={draft.code || ''} onChange={event => setField('code', event.target.value)} /></label>
            <label style={labelStyle}>Ngày<Input type="date" value={draft.date || ''} onChange={event => setField('date', event.target.value)} /></label>
            <label style={labelStyle}>Giờ<Input type="time" value={draft.time || ''} onChange={event => setField('time', event.target.value)} /></label>
            <label style={labelStyle}>Thành viên tham gia<Input value={draft.participants || ''} onChange={event => setField('participants', event.target.value)} /></label>
          </div>

          <div><strong>Kết quả kiểm kê thực tế</strong></div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup><col style={{ width: 44 }} /><col style={{ width: 150 }} /><col style={{ width: 130 }} /><col style={{ width: 160 }} /><col /><col style={{ width: 80 }} /></colgroup>
              <thead><tr style={{ background: '#C5D9C2', textAlign: 'left' }}>{['#', 'Mệnh giá', 'Số lượng', 'Số tiền', 'Diễn giải', ''].map((heading, index) => <th key={index} scope="col" style={{ padding: '9px 8px', borderBottom: '1px solid #AFC9AC' }}>{heading}</th>)}</tr></thead>
              <tbody>{lines.map((line, index) => <tr key={index} style={{ background: '#FBF7E8', borderBottom: '1px solid #E7DFC7' }}>
                <td style={cellStyle}>{index + 1}</td>
                <td style={cellStyle}><Input aria-label={`Mệnh giá dòng ${index + 1}`} type="number" min={0} step={1000} value={line.denomination} onChange={event => setLine(index, 'denomination', event.target.value)} /></td>
                <td style={cellStyle}><Input aria-label={`Số lượng dòng ${index + 1}`} type="number" min={0} step={1} value={line.quantity} onChange={event => setLine(index, 'quantity', event.target.value)} /></td>
                <td style={{ ...cellStyle, textAlign: 'right', fontWeight: 600 }}>{money(line.denomination * line.quantity)}</td>
                <td style={cellStyle}><Input aria-label={`Diễn giải dòng ${index + 1}`} value={line.note} onChange={event => setLine(index, 'note', event.target.value)} /></td>
                <td style={cellStyle}><Button size="small" aria-label={`Xóa dòng ${index + 1}`} onClick={() => setLines(current => current.filter((_, rowIndex) => rowIndex !== index))}>Xóa</Button></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8 }}><Button icon={<PlusOutlined />} onClick={() => setLines(current => [...current, { denomination: 0, quantity: 0, note: '' }])}>Thêm dòng</Button><Button onClick={() => setLines([])}>Xóa hết dòng</Button></div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '3px 14px' }}>
            <label style={labelStyle}>I. Số dư theo sổ kế toán tiền mặt<Input type="number" min={0} value={draft.bookBalance ?? bookBalance} onChange={event => setField('bookBalance', Number(event.target.value))} /></label>
            <label style={labelStyle}>II. Số dư kiểm kê thực tế<Input value={actualBalance.toLocaleString('vi-VN')} readOnly /></label>
            <label style={labelStyle}>III. Chênh lệch (I - II)<Input value={difference.toLocaleString('vi-VN')} readOnly /></label>
            <label style={labelStyle}>Đối chiếu<Input value={draft.reconciliation || ''} onChange={event => setField('reconciliation', event.target.value)} /></label>
            <label style={labelStyle}>Lý do (thừa/thiếu)<Input value={draft.reason || ''} onChange={event => setField('reason', event.target.value)} /></label>
            <label style={labelStyle}>Kết luận<Input value={draft.conclusion || ''} onChange={event => setField('conclusion', event.target.value)} /></label>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: 13 }}><input type="checkbox" checked={Boolean(draft.resolved)} onChange={event => setField('resolved', event.target.checked)} /> Đã xử lý chênh lệch</label>

          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: '#475569', fontSize: 13 }}><PaperClipOutlined /> <strong>Đính kèm</strong> Dung lượng tối đa 5 MB</div>
            <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={event => { addFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
            <div role="button" tabIndex={0} onClick={() => fileRef.current?.click()} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') fileRef.current?.click(); }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); addFiles(Array.from(event.dataTransfer.files)); }} style={{ minHeight: 56, display: 'grid', placeItems: 'center', border: '1px dashed #94A3B8', borderRadius: 6, color: '#64748B', cursor: 'pointer' }}>Kéo/thả tệp vào đây hoặc bấm vào đây</div>
            {[...savedFiles.map(file => ({ ...file, saved: true })), ...pendingFiles.map((file, index) => ({ id: `pending-${index}`, name: file.name, size: file.size, saved: false }))].map(file => <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><span>{file.name} · {(file.size / 1024).toFixed(0)} KB</span><Button size="small" onClick={() => { if (file.saved) { setSavedFiles(current => current.filter(item => item.id !== file.id)); setRemovedFiles(current => [...current, file]); } else setPendingFiles(current => current.filter((_, index) => `pending-${index}` !== file.id)); }}>Xóa</Button></div>)}
            {!savedFiles.length && !pendingFiles.length && <span style={{ color: '#94A3B8', fontSize: 12 }}>Không có tệp nào được chọn</span>}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}><Button onClick={close}>Hủy</Button><Button type="primary" loading={saving} onClick={() => void save()}>Lưu</Button></div>
        </div>
      </Modal>

      <Modal title="Chọn chứng từ tham chiếu" open={referenceOpen} onCancel={() => setReferenceOpen(false)} footer={null} width="min(1200px, calc(100vw - 32px))">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 10, margin: '14px 0' }}><label style={labelStyle}>Tìm theo<Input prefix={<SearchOutlined />} value={referenceSearch} onChange={event => setReferenceSearch(event.target.value)} placeholder="Số chứng từ, nội dung, đối tượng" /></label><label style={labelStyle}>Từ<Input type="date" value={referenceFrom} onChange={event => setReferenceFrom(event.target.value)} /></label><label style={labelStyle}>Đến<Input type="date" value={referenceTo} onChange={event => setReferenceTo(event.target.value)} /></label><Button onClick={() => { void financeCashApi.getAll().then(response => setTransactions(response.data.data)).catch(() => message.error('Không tải được chứng từ thu chi.')); }}>Lấy dữ liệu</Button></div>
        <KTable dataSource={referenceRows} columns={refColumns} rowKey="key" pagination={{ pageSize: 10 }} locale={{ emptyText: 'Không có chứng từ thu chi.' }} />
      </Modal>
    </div>
  );
};

const labelStyle: React.CSSProperties = { display: 'grid', gap: 4, alignContent: 'start', color: '#334155', fontSize: 12, fontWeight: 600 };
const cellStyle: React.CSSProperties = { padding: 4, borderRight: '1px dotted #D8CFB6' };
