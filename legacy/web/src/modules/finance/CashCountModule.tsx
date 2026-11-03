import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EditOutlined, PaperClipOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { filesApi, financeCashApi, financeCashCountsApi, financePaymentAccountsApi, FinanceCashTransaction, FinancePaymentAccount } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { Button, DatePicker, Input, message, Modal, Select, Tag } from '../../custom-ui';

type CountLine = { key: string; denomination: number; quantity: number; note: string };
type CountFile = { id: string; name: string; size: number; mimeType?: string };
type CashCount = {
  key: string; code: string; purpose: string; countDate: string; currency: string; reference: string;
  date: string; time: string; participants: string; cashAccountId: string; cashAccountName: string; counterName: string; witnessName: string; lines: CountLine[]; bookBalance: number;
  actualBalance: number; difference: number; reconciliation: string; reason: string; handlingDirection: string; conclusion: string;
  attachments: CountFile[]; status: string; createdById?: string; approvedBy?: string; approvedById?: string; approvedAt?: string;
};

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const timeNow = () => {
  const current = new Date();
  const minute = Math.floor(current.getMinutes() / 5) * 5;
  return `${String(current.getHours()).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};
const timeOptions = Array.from({ length: 288 }, (_, index) => {
  const minutes = index * 5;
  const value = `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return { value, label: value };
});
const denominations = [500000, 200000, 100000, 50000, 20000, 10000, 5000, 2000, 1000];
const cashCountCode = (index: number) => `KKQ${String(index).padStart(5, '0')}`;
const nextCashCountCode = (rows: CashCount[]) => cashCountCode(Math.max(0, ...rows.map(row => Number(/^KKQ(\d+)$/i.exec(row.code || '')?.[1]) || 0)) + 1);
const money = (amount: number) => `${Number(amount || 0).toLocaleString('vi-VN')} ₫`;
const blankLines = (): CountLine[] => denominations.map(denomination => ({ key: `denomination-${denomination}`, denomination, quantity: 0, note: `Loại mệnh giá ${denomination}` }));
const dateText = (value?: string) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('vi-VN') : '—';

export const CashCountModule: React.FC = () => {
  const [records, setRecords] = useState<CashCount[]>([]);
  const [accounts, setAccounts] = useState<FinancePaymentAccount[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDate, setConfirmDate] = useState(today());
  const [confirmCurrency, setConfirmCurrency] = useState('VND');
  const [confirmAccountId, setConfirmAccountId] = useState('');
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [referenceSearch, setReferenceSearch] = useState('');
  const [referenceSearchBy, setReferenceSearchBy] = useState('code');
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
      const [rows, accountResponse, cashResponse] = await Promise.all([
        dataService.refreshGenericData('finance_cash_counts'),
        financePaymentAccountsApi.getAccounts(),
        financeCashApi.getAll(),
      ]);
      setRecords(rows as CashCount[]);
      setAccounts(accountResponse.data.accounts.filter(account => account.source === 'petty' && account.status === 'Đang hoạt động'));
      setTransactions(cashResponse.data.data);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được sổ kiểm kê quỹ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const bookBalanceAt = (accountId: string, date: string) => Number(accounts.find(account => account.key === accountId)?.balance || 0) - transactions
    .filter(item => item.source === 'petty' && item.sourceAccountId === accountId && item.status === 'Đã hoàn thành' && String(item.date || '').slice(0, 10) > date)
    .reduce((sum, item) => sum + (item.type === 'Thu' ? Number(item.amount || 0) : -Number(item.amount || 0)), 0);
  const actualBalance = lines.reduce((sum, line) => sum + Number(line.denomination || 0) * Number(line.quantity || 0), 0);
  const difference = Number(draft.bookBalance ?? bookBalanceAt(String(draft.cashAccountId || ''), String(draft.countDate || ''))) - actualBalance;
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
    const code = nextCashCountCode(records);
    setConfirmDate(date);
    setConfirmCurrency('VND');
    setConfirmAccountId(accounts[0]?.key || '');
    setEditing(null);
    setDraft({ key: crypto.randomUUID(), code, purpose: `Kiểm kê tiền mặt tại quỹ đến ngày ${dateText(date)}`, countDate: date, currency: 'VND', reference: '', date, time: timeNow(), participants: '', cashAccountId: accounts[0]?.key || '', cashAccountName: accounts[0]?.name || '', counterName: '', witnessName: '', bookBalance: bookBalanceAt(accounts[0]?.key || '', date), reconciliation: '', reason: '', handlingDirection: '', conclusion: '', status: 'Chờ phê duyệt' });
    setLines(blankLines());
    setSavedFiles([]);
    setRemovedFiles([]);
    setPendingFiles([]);
    setConfirmOpen(true);
  };

  const confirmCreate = () => {
    const account = accounts.find(item => item.key === confirmAccountId);
    if (!account) { message.error('Vui lòng chọn quỹ tiền mặt đang hoạt động.'); return; }
    setField('countDate', confirmDate);
    setField('currency', confirmCurrency);
    setField('cashAccountId', account.key);
    setField('cashAccountName', account.name);
    setField('purpose', `Kiểm kê tiền mặt tại quỹ đến ngày ${dateText(confirmDate)}`);
    setField('bookBalance', bookBalanceAt(account.key, confirmDate));
    setConfirmOpen(false);
    setOpen(true);
  };

  const openEdit = (record: CashCount) => {
    setEditing(record);
    setDraft({ ...record });
    setLines(record.lines?.length ? record.lines.map((line, index) => ({ ...line, key: line.key || `saved-${record.key}-${index}` })) : blankLines());
    setSavedFiles(record.attachments || []);
    setRemovedFiles([]);
    setPendingFiles([]);
    setOpen(true);
  };

  const setField = (name: keyof CashCount, value: any) => setDraft(current => ({ ...current, [name]: value }));
  const setLine = (key: string, name: keyof CountLine, value: any) => setLines(current => current.map(line => line.key === key ? { ...line, [name]: name === 'denomination' || name === 'quantity' ? Number(value) : value } : line));

  const addFiles = (files: File[]) => {
    const total = [...savedFiles, ...pendingFiles].reduce((sum, file) => sum + Number(file.size || 0), 0) + files.reduce((sum, file) => sum + file.size, 0);
    if (total > 5 * 1024 * 1024) { message.error('Tổng dung lượng tệp đính kèm tối đa 5 MB.'); return; }
    setPendingFiles(current => [...current, ...files]);
  };

  const save = async () => {
    if (!draft.countDate || !draft.date || !draft.time) { message.error('Vui lòng nhập ngày kiểm kê, ngày lập và giờ lập.'); return; }
    if (!draft.cashAccountId || !String(draft.counterName || '').trim()) { message.error('Vui lòng chọn quỹ và nhập người kiểm kê.'); return; }
    if (!String(draft.code || '').trim() || records.some(record => record.key !== editing?.key && record.code.toLocaleLowerCase() === String(draft.code).trim().toLocaleLowerCase())) { message.error('Số phiếu kiểm kê đang trống hoặc đã được sử dụng.'); return; }
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
      const cashAccount = accounts.find(item => item.key === draft.cashAccountId);
      if (!cashAccount || cashAccount.source !== 'petty' || cashAccount.status !== 'Đang hoạt động') throw new Error('Quỹ tiền mặt không tồn tại hoặc đã ngừng hoạt động.');
      const currentBookBalance = bookBalanceAt(cashAccount.key, String(draft.countDate));
      const currentActualBalance = lines.reduce((sum, line) => sum + line.denomination * line.quantity, 0);
      const record: CashCount = {
        ...(editing || {} as CashCount),
        ...draft,
        key: editing?.key || String(draft.key || crypto.randomUUID()),
        code: String(draft.code || nextCashCountCode(records)),
        purpose: String(draft.purpose || '').trim(),
        countDate: String(draft.countDate), currency: String(draft.currency || 'VND'), reference: String(draft.reference || ''),
        date: String(draft.date), time: String(draft.time), participants: String(draft.participants || ''), cashAccountId: cashAccount.key, cashAccountName: cashAccount.name,
        counterName: String(draft.counterName || '').trim(), witnessName: String(draft.witnessName || '').trim(), lines,
        bookBalance: currentBookBalance, actualBalance: currentActualBalance, difference: currentBookBalance - currentActualBalance,
        reconciliation: String(draft.reconciliation || ''), reason: String(draft.reason || ''), handlingDirection: String(draft.handlingDirection || ''), conclusion: String(draft.conclusion || ''),
        attachments: [...savedFiles, ...uploaded], status: String(draft.status || 'Đã ghi nhận'),
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
    setReferenceSearchBy('code');
    setReferenceFrom('');
    setReferenceTo('');
    setReferenceOpen(true);
    try { setTransactions((await financeCashApi.getAll()).data.data); }
    catch { message.error('Không tải được chứng từ thu chi để chọn tham chiếu.'); }
  };

  const approve = async (record: CashCount) => {
    try {
      await financeCashCountsApi.approve(record.key);
      message.success(`Đã phê duyệt biên bản ${record.code}.`);
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể phê duyệt biên bản kiểm kê.');
    }
  };

  const referenceRows = transactions.filter(item => {
    const query = referenceSearch.trim().toLocaleLowerCase();
    const date = String(item.date || '').slice(0, 10);
    const searchValue = referenceSearchBy === 'code' ? item.code : referenceSearchBy === 'description' ? (item.note || item.category) : item.recipientOrPayer;
    return (!query || String(searchValue || '').toLocaleLowerCase().includes(query))
      && (!referenceFrom || date >= referenceFrom) && (!referenceTo || date <= referenceTo);
  });

  const columns = [
    { title: 'Số kiểm kê', dataIndex: 'code', key: 'code', width: 150, render: (value: string) => <strong>{value}</strong> },
    { title: 'Kiểm kê đến ngày', dataIndex: 'countDate', key: 'countDate', width: 150, render: (value: string) => dateText(value) },
    { title: 'Quỹ', dataIndex: 'cashAccountName', key: 'cashAccountName', width: 180 },
    { title: 'Người kiểm kê', dataIndex: 'counterName', key: 'counterName', width: 180 },
    { title: 'Ngày lập', dataIndex: 'date', key: 'date', width: 130, render: (value: string) => dateText(value) },
    { title: 'Loại tiền', dataIndex: 'currency', key: 'currency', width: 100 },
    { title: 'Số dư theo sổ', dataIndex: 'bookBalance', key: 'bookBalance', width: 160, render: (value: number) => money(value) },
    { title: 'Số kiểm kê thực tế', dataIndex: 'actualBalance', key: 'actualBalance', width: 170, render: (value: number) => money(value) },
    { title: 'Chênh lệch', dataIndex: 'difference', key: 'difference', width: 150, render: (value: number) => <Tag color={Number(value) === 0 ? 'success' : 'warning'}>{money(value)}</Tag> },
    { title: 'Người phê duyệt', dataIndex: 'approvedBy', key: 'approvedBy', width: 160, render: (value: string) => value || '—' },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 150, render: (value: string) => <Tag color={value === 'Đã phê duyệt' ? 'success' : 'warning'}>{value}</Tag> },
    { title: 'Thao tác', key: 'actions', width: 230, render: (_: unknown, record: CashCount) => <div style={{ display: 'flex', gap: 6 }}><Button aria-label={`Sửa phiếu ${record.code}`} icon={<EditOutlined />} disabled={record.status === 'Đã phê duyệt'} onClick={() => openEdit(record)}>Sửa</Button>{record.status === 'Chờ phê duyệt' && <Button type="primary" onClick={() => void approve(record)}>Phê duyệt</Button>}</div> },
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

  const lineColumns = [
    { title: '#', key: 'number', width: 48, render: (_: unknown, _line: CountLine, index: number) => index + 1 },
    { title: 'Mệnh giá', dataIndex: 'denomination', key: 'denomination', width: 190, render: (value: number, line: CountLine) => <Input aria-label={`Mệnh giá dòng ${line.key}`} type="number" min={0} step={1000} value={value} onChange={event => setLine(line.key, 'denomination', event.target.value)} style={{ width: '100%', height: 32, boxSizing: 'border-box' }} /> },
    { title: 'Số lượng', dataIndex: 'quantity', key: 'quantity', width: 160, render: (value: number, line: CountLine) => <Input aria-label={`Số lượng dòng ${line.key}`} type="number" min={0} step={1} value={value} onChange={event => setLine(line.key, 'quantity', event.target.value)} style={{ width: '100%', height: 32, boxSizing: 'border-box' }} /> },
    { title: 'Số tiền', key: 'amount', width: 180, render: (_: unknown, line: CountLine) => money(line.denomination * line.quantity) },
    { title: 'Diễn giải', dataIndex: 'note', key: 'note', render: (value: string, line: CountLine) => <Input aria-label={`Diễn giải dòng ${line.key}`} value={value} onChange={event => setLine(line.key, 'note', event.target.value)} style={{ width: '100%', height: 32, boxSizing: 'border-box' }} /> },
    { title: '', key: 'actions', width: 88, render: (_: unknown, line: CountLine) => <Button aria-label="Xóa dòng" onClick={() => setLines(current => current.filter(item => item.key !== line.key))} style={{ height: 32 }}>Xóa</Button> },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div><h1 style={{ margin: 0, color: '#0F172A', fontSize: 20 }}>Kiểm kê quỹ</h1><div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Danh sách phiếu kiểm kê tiền mặt tại quỹ.</div></div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm</Button>
      </div>

      <KTable dataSource={sortedRecords} columns={columns} loading={loading} rowKey="key" pagination={{ pageSize: 10 }} locale={{ emptyText: 'Chưa có phiếu kiểm kê quỹ.' }} />

      <Modal title={`Kiểm kê quỹ${draft.code ? ` ${draft.code}` : ''}`} open={open} onCancel={close} footer={null} width="min(1380px, calc(100vw - 24px))">
        <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '3px 14px' }}>
            <label style={labelStyle}>Mục đích<Input value={draft.purpose || ''} onChange={event => setField('purpose', event.target.value)} /></label>
            <label style={labelStyle}>Kiểm kê đến ngày<DatePicker aria-label="Kiểm kê đến ngày" value={draft.countDate || undefined} onChange={value => { setField('countDate', value); setField('purpose', `Kiểm kê tiền mặt tại quỹ đến ngày ${dateText(value)}`); setField('bookBalance', bookBalanceAt(String(draft.cashAccountId || ''), value)); }} /></label>
            <label style={labelStyle}>Loại tiền<Select value={draft.currency || 'VND'} onChange={value => setField('currency', value)} options={[{ label: 'VND', value: 'VND' }]} style={{ width: '100%' }} /></label>
            <label style={labelStyle}>Quỹ tiền mặt<Select aria-label="Quỹ tiền mặt" value={draft.cashAccountId || undefined} onChange={value => { const account = accounts.find(item => item.key === value); setField('cashAccountId', value); setField('cashAccountName', account?.name || ''); setField('bookBalance', bookBalanceAt(value, String(draft.countDate || ''))); }} options={accounts.map(account => ({ value: account.key, label: account.name }))} style={{ width: '100%' }} /></label>
            <label style={labelStyle}>Tham chiếu<div style={{ display: 'flex', gap: 4 }}><Input value={draft.reference || ''} onChange={event => setField('reference', event.target.value)} style={{ flex: 1, minWidth: 0 }} /><Button onClick={() => void openReference()}>Chọn</Button></div></label>
            <label style={labelStyle}>Số<Input value={draft.code || ''} onChange={event => setField('code', event.target.value)} /></label>
            <label style={labelStyle}>Ngày<DatePicker aria-label="Ngày lập" value={draft.date || undefined} onChange={value => setField('date', value)} /></label>
            <label style={labelStyle}>Giờ<Select aria-label="Giờ kiểm kê" value={draft.time || undefined} onChange={value => setField('time', value)} options={timeOptions} /></label>
            <label style={labelStyle}>Người kiểm kê<Input value={draft.counterName || ''} onChange={event => setField('counterName', event.target.value)} /></label>
            <label style={labelStyle}>Người chứng kiến<Input value={draft.witnessName || ''} onChange={event => setField('witnessName', event.target.value)} /></label>
            <label style={labelStyle}>Người phê duyệt<Input value={draft.approvedBy || 'Chưa phê duyệt'} disabled /></label>
            <label style={labelStyle}>Thành viên tham gia<Input value={draft.participants || ''} onChange={event => setField('participants', event.target.value)} /></label>
          </div>

          <div><strong>Kết quả kiểm kê thực tế</strong></div>
          <KTable dataSource={lines} columns={lineColumns} rowKey="key" pagination={false} scroll={{ x: 1120 }} enableColumnResizing={false} />
          <div style={{ display: 'flex', gap: 8 }}><Button icon={<PlusOutlined />} onClick={() => setLines(current => [...current, { key: crypto.randomUUID(), denomination: 0, quantity: 0, note: '' }])}>Thêm dòng</Button><Button onClick={() => setLines([])}>Xóa hết dòng</Button></div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '3px 14px' }}>
            <label style={labelStyle}>Số dư theo sổ kế toán tiền mặt<Input value={Number(draft.bookBalance || 0).toLocaleString('vi-VN')} readOnly /></label>
            <label style={labelStyle}>Số dư kiểm kê thực tế<Input value={actualBalance.toLocaleString('vi-VN')} readOnly /></label>
            <label style={labelStyle}>Chênh lệch<Input value={difference.toLocaleString('vi-VN')} readOnly /></label>
            <label style={labelStyle}>Đối chiếu<Input value={draft.reconciliation || ''} onChange={event => setField('reconciliation', event.target.value)} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: '3px 14px' }}>
            <label style={labelStyle}>Lý do<Input.TextArea rows={4} value={draft.reason || ''} onChange={event => setField('reason', event.target.value)} /></label>
            <label style={labelStyle}>Hướng xử lý<Input.TextArea rows={4} value={draft.handlingDirection || ''} onChange={event => setField('handlingDirection', event.target.value)} /></label>
            <label style={labelStyle}>Kết luận<Input.TextArea rows={4} value={draft.conclusion || ''} onChange={event => setField('conclusion', event.target.value)} /></label>
          </div>

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

      <Modal title="Kiểm kê quỹ" open={confirmOpen} onCancel={() => setConfirmOpen(false)} footer={null} width={480}>
        <div style={{ display: 'grid', gap: 14, marginTop: 14 }}>
          <label style={labelStyle}>Đến ngày<DatePicker aria-label="Đến ngày" value={confirmDate} onChange={setConfirmDate} /></label>
          <label style={labelStyle}>Quỹ tiền mặt<Select aria-label="Quỹ tiền mặt" value={confirmAccountId || undefined} onChange={setConfirmAccountId} options={accounts.map(account => ({ value: account.key, label: account.name }))} style={{ width: '100%' }} /></label>
          <label style={labelStyle}>Loại tiền<Select value={confirmCurrency} onChange={setConfirmCurrency} options={[{ label: 'VND', value: 'VND' }]} style={{ width: '100%' }} /></label>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button onClick={() => setConfirmOpen(false)}>Hủy</Button><Button type="primary" onClick={confirmCreate}>Đồng ý</Button></div>
        </div>
      </Modal>

      <Modal title="Chọn chứng từ tham chiếu" open={referenceOpen} onCancel={() => setReferenceOpen(false)} footer={null} width="min(1200px, calc(100vw - 32px))">
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'end', gap: 10, margin: '14px 0' }}><label style={{ ...labelStyle, width: 160, flex: '0 0 160px' }}>Tìm theo<Select value={referenceSearchBy} onChange={setReferenceSearchBy} options={[{ label: 'Số chứng từ', value: 'code' }, { label: 'Diễn giải', value: 'description' }, { label: 'Đối tượng', value: 'party' }]} /></label><label style={labelStyle}>Giá trị<Input prefix={<SearchOutlined />} value={referenceSearch} onChange={event => setReferenceSearch(event.target.value)} /></label><label style={labelStyle}>Từ<DatePicker aria-label="Từ ngày" value={referenceFrom || undefined} onChange={setReferenceFrom} /></label><label style={labelStyle}>Đến<DatePicker aria-label="Đến ngày" value={referenceTo || undefined} onChange={setReferenceTo} /></label><Button onClick={() => { void financeCashApi.getAll().then(response => setTransactions(response.data.data)).catch(() => message.error('Không tải được chứng từ thu chi.')); }}>Lấy dữ liệu</Button></div>
        <KTable dataSource={referenceRows} columns={refColumns} rowKey="key" pagination={{ pageSize: 10 }} locale={{ emptyText: 'Không có chứng từ thu chi.' }} />
      </Modal>
    </div>
  );
};

const labelStyle: React.CSSProperties = { display: 'grid', gap: 4, alignContent: 'start', color: '#334155', fontSize: 12, fontWeight: 600 };
