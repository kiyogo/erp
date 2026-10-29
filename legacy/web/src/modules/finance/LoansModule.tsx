import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileProtectOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { KTable } from '../../components/KTable';
import { filesApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import { Button, Drawer, Form, Input, message, Modal, Select, Tabs } from '../../custom-ui';
import { hasUniqueLoanContractCode, isValidLoanDateRange, loanDirectionOf, type LoanDirection } from './loanRules';

type InterestRateRow = { rate: string; overdueRate: string; effectiveFrom: string; note: string };
type LoanAttachment = { id: string; name: string; size: number; mimeType?: string };

export interface EnterpriseLoanItem {
  key: string;
  direction?: LoanDirection;
  contractCode: string;
  counterpartyName?: string;
  bankName?: string;
  creditContract?: string;
  purpose?: string;
  principalAccount?: string;
  interestAccount?: string;
  currency?: string;
  principalAmount: number;
  termMonths?: number;
  disbursedDate: string;
  dueDate: string;
  disbursementMethod?: string;
  beneficiaryAccount?: string;
  rateType?: string;
  interestDayBase?: string;
  adjustmentMethod?: string;
  rates?: Array<{ rate: number | null; overdueRate: number | null; effectiveFrom: string; note: string }>;
  interestRate?: number;
  principalRepayment?: string;
  firstPrincipalDate?: string;
  interestRepayment?: string;
  firstInterestDate?: string;
  repaymentMethod?: string;
  repaymentAccount?: string;
  repaymentBankName?: string;
  project?: string;
  purchaseOrder?: string;
  purchaseContract?: string;
  salesOrder?: string;
  salesContract?: string;
  expenseItem?: string;
  cashflowItem?: string;
  attachments?: LoanAttachment[];
  loanType?: string;
  monthlyInterest?: number;
  monthlyPrincipal?: number;
  collateral?: string;
  status?: string;
  [field: string]: unknown;
}

const todayIso = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};
const blankRate = (date = todayIso()): InterestRateRow => ({ rate: '', overdueRate: '', effectiveFrom: date, note: '' });
const emptyLoan = (direction: LoanDirection, contractCode = '') => ({
  direction,
  contractCode,
  counterpartyName: '',
  creditContract: '',
  purpose: '',
  principalAccount: direction === 'borrow' ? '341' : '1218',
  interestAccount: direction === 'borrow' ? '658' : '558',
  currency: 'VND',
  principalAmount: 0,
  termMonths: 0,
  disbursedDate: todayIso(),
  dueDate: todayIso(),
  disbursementMethod: direction === 'borrow' ? 'Chuyển khoản vào tài khoản DN' : 'Chuyển khoản',
  beneficiaryAccount: '',
  bankName: '',
  rateType: 'Lãi suất trên dư nợ giảm dần',
  interestDayBase: 'Lãi năm/365',
  adjustmentMethod: 'Cố định',
  principalRepayment: '',
  firstPrincipalDate: todayIso(),
  interestRepayment: '',
  firstInterestDate: todayIso(),
  repaymentMethod: '',
  repaymentAccount: '',
  repaymentBankName: '',
  project: '',
  purchaseOrder: '',
  purchaseContract: '',
  salesOrder: '',
  salesContract: '',
  expenseItem: '',
  cashflowItem: '',
});

const money = (value: unknown) => `${(Number(value) || 0).toLocaleString('vi-VN')} ₫`;
const loanCounterparty = (loan: EnterpriseLoanItem) => loan.counterpartyName || loan.bankName || '—';

export const LoansModule: React.FC<{ defaultType?: string }> = () => {
  const currentPath = useLocation().pathname.replace(/^\/admin/, '');
  const routeDirection: LoanDirection | 'all' = currentPath.endsWith('/borrow') ? 'borrow' : currentPath.endsWith('/lend') ? 'lend' : 'all';
  const [data, setData] = useState<EnterpriseLoanItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingLoan, setEditingLoan] = useState<EnterpriseLoanItem | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<EnterpriseLoanItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm();
  const [draftDirection, setDraftDirection] = useState<LoanDirection>(routeDirection === 'lend' ? 'lend' : 'borrow');
  const [rateRows, setRateRows] = useState<InterestRateRow[]>([blankRate()]);
  const [savedAttachments, setSavedAttachments] = useState<LoanAttachment[]>([]);
  const [removedAttachments, setRemovedAttachments] = useState<LoanAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const refresh = () => {
      const rows = dataService.getGenericData('finance_loans');
      setData(Array.isArray(rows) ? rows : []);
    };
    refresh();
    const unsubscribe = dataService.subscribe(refresh);
    return unsubscribe;
  }, []);

  const visibleData = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    return data.filter(loan => {
      if (routeDirection !== 'all' && loanDirectionOf(loan) !== routeDirection) return false;
      return !query || [loan.contractCode, loanCounterparty(loan), loan.creditContract, loan.purpose]
        .some(value => String(value || '').toLocaleLowerCase().includes(query));
    });
  }, [data, routeDirection, searchText]);
  const totalPrincipal = visibleData.reduce((sum, loan) => sum + (Number(loan.principalAmount) || 0), 0);

  const closeForm = () => {
    setModalOpen(false);
    setEditingLoan(null);
    setPendingFiles([]);
    setRemovedAttachments([]);
    form.resetFields();
  };

  const openCreate = () => {
    const direction: LoanDirection = routeDirection === 'lend' ? 'lend' : 'borrow';
    setDraftDirection(direction);
    form.resetFields();
    form.setFieldsValue(emptyLoan(direction, `KU${direction === 'borrow' ? 'V' : 'CV'}${String(data.length + 1).padStart(5, '0')}`));
    setEditingLoan(null);
    setRateRows([blankRate()]);
    setSavedAttachments([]);
    setRemovedAttachments([]);
    setPendingFiles([]);
    setModalOpen(true);
  };

  const openEdit = (loan: EnterpriseLoanItem) => {
    const direction = loanDirectionOf(loan);
    setDraftDirection(direction);
    setEditingLoan(loan);
    form.resetFields();
    form.setFieldsValue({ ...emptyLoan(direction), ...loan, counterpartyName: loanCounterparty(loan) });
    const oldRateRows = Array.isArray(loan.rates) ? loan.rates : [];
    setRateRows(oldRateRows.length
      ? oldRateRows.map(row => ({ rate: row.rate == null ? '' : String(row.rate), overdueRate: row.overdueRate == null ? '' : String(row.overdueRate), effectiveFrom: row.effectiveFrom || todayIso(), note: row.note || '' }))
      : [blankRate(), ...(Number.isFinite(Number(loan.interestRate)) && loan.interestRate ? [{ rate: String(loan.interestRate), overdueRate: '', effectiveFrom: loan.disbursedDate || todayIso(), note: '' }] : [])]);
    setSavedAttachments(Array.isArray(loan.attachments) ? loan.attachments : []);
    setRemovedAttachments([]);
    setPendingFiles([]);
    setModalOpen(true);
  };

  const processFiles = (files: File[]) => {
    const size = [...savedAttachments, ...pendingFiles].reduce((sum, file) => sum + Number(file.size || 0), 0)
      + files.reduce((sum, file) => sum + file.size, 0);
    if (size > 5 * 1024 * 1024) {
      message.error('Tổng dung lượng tệp đính kèm tối đa 5 MB.');
      return;
    }
    setPendingFiles(current => [...current, ...files]);
  };

  const handleSave = async (values: Record<string, any>) => {
    if (saving) return;
    const direction = (values.direction === 'lend' ? 'lend' : 'borrow') as LoanDirection;
    const contractCode = String(values.contractCode || '').trim();
    const principalAmount = Number(values.principalAmount);
    const termMonths = Number(values.termMonths);
    if (!hasUniqueLoanContractCode(data, contractCode, editingLoan?.key)) {
      message.error('Số khế ước đã tồn tại. Hãy nhập số khác.');
      return;
    }
    if (!Number.isFinite(principalAmount) || principalAmount < 0 || !Number.isFinite(termMonths) || termMonths < 0) {
      message.error('Giá trị khoản vay và thời hạn vay phải là số không âm hợp lệ.');
      return;
    }
    if (!isValidLoanDateRange(values.disbursedDate, values.dueDate)) {
      message.error('Ngày đáo hạn phải bằng hoặc sau ngày giải ngân.');
      return;
    }
    const normalizedRates: NonNullable<EnterpriseLoanItem['rates']> = [];
    for (const row of rateRows) {
      const rate = row.rate.trim() ? Number(row.rate) : null;
      const overdueRate = row.overdueRate.trim() ? Number(row.overdueRate) : null;
      if ([rate, overdueRate].some(value => value !== null && (!Number.isFinite(value) || value < 0 || value > 100))) {
        message.error('Lãi suất phải nằm trong khoảng từ 0 đến 100%.');
        return;
      }
      if (row.rate || row.overdueRate || row.note) normalizedRates.push({ rate, overdueRate, effectiveFrom: row.effectiveFrom, note: row.note.trim() });
    }
    const uploadedAttachments: LoanAttachment[] = [];
    setSaving(true);
    try {
      if (pendingFiles.length) {
        const root = await filesApi.list(null);
        for (const file of pendingFiles) {
          const uploaded = (await filesApi.upload(file, file.name, root.data.context.parentId || undefined, 'finance_loans')).data.file;
          uploadedAttachments.push({ id: uploaded.id || uploaded.key, name: uploaded.name, size: Number(uploaded.sizeBytes) || file.size, mimeType: uploaded.mime || file.type });
        }
      }
      const firstRate = normalizedRates.find(row => row.rate !== null)?.rate ?? null;
      const item: EnterpriseLoanItem = {
        ...(editingLoan || {}),
        ...values,
        key: editingLoan?.key || crypto.randomUUID(),
        direction,
        contractCode,
        disbursedDate: String(values.disbursedDate || ''),
        dueDate: String(values.dueDate || ''),
        counterpartyName: String(values.counterpartyName || '').trim(),
        bankName: String(values.bankName || '').trim(),
        principalAmount,
        termMonths,
        currency: values.currency || 'VND',
        rates: normalizedRates,
        interestRate: firstRate ?? undefined,
        monthlyInterest: firstRate === null ? 0 : Math.round(principalAmount * firstRate / 100 / 12),
        monthlyPrincipal: termMonths > 0 ? Math.round(principalAmount / termMonths) : 0,
        attachments: [...savedAttachments, ...uploadedAttachments],
        loanType: direction === 'borrow' ? 'Khế ước đi vay' : 'Khế ước cho vay',
      };
      if (editingLoan) {
        await dataService.updateGenericRecord('finance_loans', item);
        message.success(`Đã cập nhật khế ước ${contractCode}.`);
      } else {
        await dataService.createGenericRecord('finance_loans', item);
        message.success(`Đã lưu khế ước ${contractCode}.`);
      }
      const removalResults = await Promise.allSettled(removedAttachments.map(file => filesApi.remove(file.id)));
      if (removalResults.some(result => result.status === 'rejected')) message.warning('Khế ước đã lưu, nhưng một số tệp đã bỏ chưa được xóa khỏi kho tệp.');
      closeForm();
    } catch (error: any) {
      await Promise.all(uploadedAttachments.map(file => filesApi.remove(file.id).catch(() => {})));
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu khế ước.');
    } finally {
      setSaving(false);
    }
  };

  const downloadAttachment = async (file: LoanAttachment) => {
    try {
      downloadFile(file.name, (await filesApi.download(file.id)).data);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được tệp đính kèm.');
    }
  };

  const columns = [
    { title: 'Số khế ước', dataIndex: 'contractCode', key: 'contractCode', width: 160, render: (value: string) => <strong><FileProtectOutlined /> {value}</strong> },
    { title: routeDirection === 'lend' ? 'Đối tượng vay' : 'Đối tượng cho vay', key: 'counterparty', render: (_: unknown, loan: EnterpriseLoanItem) => loanCounterparty(loan) },
    { title: 'Hợp đồng tín dụng', dataIndex: 'creditContract', key: 'creditContract' },
    { title: 'Giá trị khoản vay', dataIndex: 'principalAmount', key: 'principalAmount', width: 170, render: (value: number, loan: EnterpriseLoanItem) => <span>{money(value)} {loan.currency && loan.currency !== 'VND' ? `(${loan.currency})` : ''}</span> },
    { title: 'Lãi suất', key: 'interest', width: 130, render: (_: unknown, loan: EnterpriseLoanItem) => { const rate = loan.rates?.find(row => row.rate != null)?.rate ?? loan.interestRate; return rate == null ? '—' : `${rate}%`; } },
    { title: 'Ngày giải ngân', dataIndex: 'disbursedDate', key: 'disbursedDate', width: 130 },
    { title: 'Ngày đáo hạn', dataIndex: 'dueDate', key: 'dueDate', width: 130 },
    { title: 'Thao tác', key: 'actions', width: 150, render: (_: unknown, loan: EnterpriseLoanItem) => <div style={{ display: 'flex', gap: 4 }}><Button size="small" aria-label="Xem khế ước" icon={<EyeOutlined />} onClick={() => { setSelectedLoan(loan); setDrawerOpen(true); }} /><Button size="small" aria-label="Sửa khế ước" icon={<EditOutlined />} onClick={() => openEdit(loan)} /></div> },
  ];

  const directionLabel = routeDirection === 'lend' ? 'cho vay' : 'đi vay';
  const formDirection = draftDirection;
  const isLend = formDirection === 'lend';

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: '#0F172A' }}>{routeDirection === 'all' ? 'Khoản vay' : `Khế ước ${directionLabel}`}</h1>
          <div style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Quản lý thông tin khế ước, giải ngân, lãi suất và lịch trả/thu nợ.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Input prefix={<SearchOutlined />} placeholder="Tìm số khế ước, đối tượng..." value={searchText} onChange={event => setSearchText(event.target.value)} allowClear style={{ width: 280 }} />
          <Button icon={<DownloadOutlined />} disabled={!visibleData.length} onClick={() => downloadFile(`khue_uoc_${routeDirection}.xlsx`, generateValidXlsxBlob([
            ['Số khế ước', 'Loại khế ước', 'Đối tượng', 'Hợp đồng tín dụng', 'Mục đích vay', 'Giá trị khoản vay', 'Loại tiền', 'Tài khoản nợ gốc', 'Tài khoản lãi vay', 'Ngày giải ngân', 'Ngày đáo hạn'],
            ...visibleData.map(loan => [loan.contractCode, loanDirectionOf(loan) === 'borrow' ? 'Đi vay' : 'Cho vay', loanCounterparty(loan), loan.creditContract || '', loan.purpose || '', loan.principalAmount, loan.currency || 'VND', loan.principalAccount || '', loan.interestAccount || '', loan.disbursedDate, loan.dueDate]),
          ]))}>Xuất Excel</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm khế ước</Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 12, color: '#475569', fontSize: 13 }}>
        <span>Số khế ước: <strong>{visibleData.length}</strong></span>
        <span>Tổng giá trị: <strong>{money(totalPrincipal)}</strong></span>
      </div>
      <div className="transparent-table-card">
        <KTable dataSource={visibleData} columns={columns} rowKey="key" pagination={{ pageSize: 10 }} locale={{ emptyText: 'Chưa có khế ước.' }} />
      </div>

      <Modal
        title={`${editingLoan ? 'Sửa' : 'Thêm'} khế ước ${isLend ? 'cho vay' : 'đi vay'}`}
        open={modalOpen}
        onCancel={closeForm}
        footer={[
          <Button key="cancel" onClick={closeForm}>Hủy</Button>,
          <Button key="save" type="primary" loading={saving} onClick={() => form.submit()}>Lưu</Button>,
        ]}
        width="min(1120px, calc(100vw - 32px))"
      >
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 14 }}>
          {routeDirection === 'all' && <Form.Item name="direction" label="Loại khế ước" rules={[{ required: true }]}><Select options={[{ label: 'Khế ước đi vay', value: 'borrow' }, { label: 'Khế ước cho vay', value: 'lend' }]} onChange={(value: LoanDirection) => { setDraftDirection(value); form.setFieldsValue({ principalAccount: value === 'borrow' ? '341' : '1218', interestAccount: value === 'borrow' ? '658' : '558', disbursementMethod: value === 'borrow' ? 'Chuyển khoản vào tài khoản DN' : 'Chuyển khoản' }); }} /></Form.Item>}
          <strong>Thông tin giải ngân</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '3px 4px' }}>
            <Form.Item name="contractCode" label="Số khế ước" rules={[{ required: true, whitespace: true }]}><Input maxLength={80} /></Form.Item>
            <Form.Item name="counterpartyName" label={isLend ? 'Đối tượng vay' : 'Đối tượng cho vay'} rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            <Form.Item name="creditContract" label="Hợp đồng tín dụng"><Input /></Form.Item>
            <Form.Item name="purpose" label="Mục đích vay"><Input /></Form.Item>
            <Form.Item name="principalAccount" label="TK hạch toán nợ gốc" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            <Form.Item name="interestAccount" label="TK hạch toán lãi vay" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            <Form.Item name="currency" label="Loại tiền" rules={[{ required: true }]}><Select options={[{ label: 'VND', value: 'VND' }]} /></Form.Item>
            <Form.Item name="principalAmount" label="Giá trị khoản vay" rules={[{ required: true }]}><Input type="number" min={0} step={1} /></Form.Item>
            <Form.Item name="termMonths" label="Thời hạn vay (tháng)" rules={[{ required: true }]}><Input type="number" min={0} step={1} /></Form.Item>
            <Form.Item name="disbursedDate" label="Ngày giải ngân" rules={[{ required: true }]}><Input type="date" /></Form.Item>
            <Form.Item name="dueDate" label="Ngày đáo hạn" rules={[{ required: true }]}><Input type="date" /></Form.Item>
            <Form.Item name="disbursementMethod" label="Phương thức giải ngân" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            <Form.Item name="beneficiaryAccount" label="TK thụ hưởng"><Input /></Form.Item>
            <Form.Item name="bankName" label="Tên ngân hàng"><Input /></Form.Item>
          </div>

          <Tabs items={[
            { key: 'interest', label: 'Lãi suất', children: <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '3px 4px' }}>
                <Form.Item name="rateType" label="Loại lãi suất" rules={[{ required: true }]}><Select options={['Lãi suất trên dư nợ giảm dần', 'Lãi suất trên dư nợ gốc'].map(value => ({ label: value, value }))} /></Form.Item>
                <Form.Item name="interestDayBase" label="Cơ sở tính lãi ngày" rules={[{ required: true }]}><Select options={['Lãi năm/365', 'Lãi năm/360'].map(value => ({ label: value, value }))} /></Form.Item>
                <Form.Item name="adjustmentMethod" label="Phương thức điều chỉnh" rules={[{ required: true }]}><Select options={['Có điều chỉnh', 'Cố định'].map(value => ({ label: value, value }))} /></Form.Item>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 900, tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                  <colgroup><col style={{ width: 34 }} /><col style={{ width: '25%' }} /><col style={{ width: '25%' }} /><col style={{ width: 150 }} /><col style={{ width: '25%' }} /><col style={{ width: 72 }} /></colgroup>
                  <thead><tr style={{ background: '#C5D9C2', textAlign: 'left' }}>{['#', 'Lãi suất (%)', 'Lãi suất quá hạn (%)', 'Hiệu lực từ', 'Ghi chú', ''].map((label, index) => <th key={index} scope="col" style={{ padding: '9px 8px', borderBottom: '1px solid #AFC9AC', fontWeight: 700 }}>{label}</th>)}</tr></thead>
                  <tbody>{rateRows.map((row, index) => <tr key={index} style={{ background: '#FBF7E8', borderBottom: '1px solid #E7DFC7' }}>
                    <td style={{ padding: 4, textAlign: 'center', borderRight: '1px dotted #D8CFB6' }}>{index + 1}</td>
                    <td style={{ padding: 4, borderRight: '1px dotted #D8CFB6' }}><Input aria-label={`Lãi suất dòng ${index + 1}`} type="number" min={0} max={100} step="any" value={row.rate} onChange={event => setRateRows(current => current.map((item, rowIndex) => rowIndex === index ? { ...item, rate: event.target.value } : item))} style={{ width: '100%', boxSizing: 'border-box' }} /></td>
                    <td style={{ padding: 4, borderRight: '1px dotted #D8CFB6' }}><Input aria-label={`Lãi suất quá hạn dòng ${index + 1}`} type="number" min={0} max={100} step="any" value={row.overdueRate} onChange={event => setRateRows(current => current.map((item, rowIndex) => rowIndex === index ? { ...item, overdueRate: event.target.value } : item))} style={{ width: '100%', boxSizing: 'border-box' }} /></td>
                    <td style={{ padding: 4, borderRight: '1px dotted #D8CFB6' }}><Input aria-label={`Ngày hiệu lực dòng ${index + 1}`} type="date" value={row.effectiveFrom} onChange={event => setRateRows(current => current.map((item, rowIndex) => rowIndex === index ? { ...item, effectiveFrom: event.target.value } : item))} style={{ width: '100%', boxSizing: 'border-box' }} /></td>
                    <td style={{ padding: 4, borderRight: '1px dotted #D8CFB6' }}><Input aria-label={`Ghi chú dòng ${index + 1}`} value={row.note} onChange={event => setRateRows(current => current.map((item, rowIndex) => rowIndex === index ? { ...item, note: event.target.value } : item))} style={{ width: '100%', boxSizing: 'border-box' }} /></td>
                    <td style={{ padding: 4, textAlign: 'center' }}><Button aria-label={`Xóa lãi suất dòng ${index + 1}`} disabled={rateRows.length === 1} onClick={() => setRateRows(current => current.filter((_, rowIndex) => rowIndex !== index))}>Xóa</Button></td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8 }}><Button icon={<PlusOutlined />} onClick={() => setRateRows(current => [...current, blankRate()])}>Thêm dòng</Button><Button onClick={() => setRateRows([blankRate()])}>Xóa hết dòng</Button></div>
            </div> },
            { key: 'repayment', label: isLend ? 'Hình thức thu nợ' : 'Hình thức trả nợ', children: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '3px 4px', alignContent: 'start' }}>
              <Form.Item name="principalRepayment" label={isLend ? 'Thu gốc' : 'Trả gốc'} rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
              <Form.Item name="firstPrincipalDate" label={isLend ? 'Ngày thu gốc đầu tiên' : 'Ngày trả gốc đầu tiên'} rules={[{ required: true }]}><Input type="date" /></Form.Item>
              <Form.Item name="interestRepayment" label={isLend ? 'Thu lãi' : 'Trả lãi'} rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
              <Form.Item name="firstInterestDate" label={isLend ? 'Ngày thu lãi đầu tiên' : 'Ngày trả lãi đầu tiên'} rules={[{ required: true }]}><Input type="date" /></Form.Item>
              <Form.Item name="repaymentMethod" label={isLend ? 'Phương thức thu nợ' : 'Phương thức trả nợ'} rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
              <Form.Item name="repaymentAccount" label="Chuyển vào tài khoản"><Input /></Form.Item>
              <Form.Item name="repaymentBankName" label="Tên ngân hàng"><Input /></Form.Item>
            </div> },
            { key: 'statistics', label: 'Thống kê khác', children: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '3px 4px', alignContent: 'start' }}>
              <Form.Item name="project" label="Công trình"><Input /></Form.Item>
              <Form.Item name={isLend ? 'salesOrder' : 'purchaseOrder'} label={isLend ? 'Đơn đặt hàng' : 'Đơn mua hàng'}><Input /></Form.Item>
              <Form.Item name={isLend ? 'salesContract' : 'purchaseContract'} label={isLend ? 'Hợp đồng bán' : 'Hợp đồng mua'}><Input /></Form.Item>
              <Form.Item name="expenseItem" label="Khoản mục chi phí"><Input /></Form.Item>
              <Form.Item name="cashflowItem" label="Mục thu/chi"><Input /></Form.Item>
            </div> },
            { key: 'attachments', label: 'Đính kèm', children: <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ color: '#64748B', fontSize: 13 }}>Dung lượng tối đa 5 MB</div>
              <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={event => { processFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
              <div role="button" tabIndex={0} onClick={() => fileInputRef.current?.click()} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click(); }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); processFiles(Array.from(event.dataTransfer.files)); }} style={{ minHeight: 56, display: 'grid', placeItems: 'center', border: '1px dashed #94A3B8', borderRadius: 6, color: '#64748B', cursor: 'pointer' }}><span><UploadOutlined /> Kéo/thả tệp vào đây hoặc bấm vào đây</span></div>
              {[...savedAttachments.map(file => ({ ...file, saved: true })), ...pendingFiles.map((file, index) => ({ id: `pending-${index}`, name: file.name, size: file.size, saved: false }))].map(file => <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><span>{file.name} · {(file.size / 1024).toFixed(0)} KB</span><div style={{ display: 'flex', gap: 6 }}>{file.saved && <Button size="small" onClick={() => void downloadAttachment(file)}>Tải xuống</Button>}<Button size="small" onClick={() => { if (file.saved) { setSavedAttachments(current => current.filter(item => item.id !== file.id)); setRemovedAttachments(current => [...current, file]); } else setPendingFiles(current => current.filter((_, index) => `pending-${index}` !== file.id)); }}>Xóa</Button></div></div>)}
              <div style={{ color: '#64748B', fontSize: 12 }}>{[...savedAttachments, ...pendingFiles].length} tệp · {([...savedAttachments, ...pendingFiles].reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2)} MB / 5 MB</div>
            </div> },
          ]} />

        </Form>
      </Modal>

      <Drawer title="Chi tiết khế ước" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={560}>
        {selectedLoan && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><strong>{selectedLoan.contractCode}</strong> · {loanDirectionOf(selectedLoan) === 'borrow' ? 'Khế ước đi vay' : 'Khế ước cho vay'}</div>
          <div>{loanDirectionOf(selectedLoan) === 'lend' ? 'Đối tượng vay' : 'Đối tượng cho vay'}: {loanCounterparty(selectedLoan)}</div>
          <div>Hợp đồng tín dụng: {selectedLoan.creditContract || '—'}</div>
          <div>Mục đích vay: {selectedLoan.purpose || '—'}</div>
          <div>Giá trị khoản vay: {money(selectedLoan.principalAmount)} · {selectedLoan.currency || 'VND'}</div>
          <div>Thời hạn: {Number(selectedLoan.termMonths) || 0} tháng</div>
          <div>Ngày giải ngân: {selectedLoan.disbursedDate} · Đáo hạn: {selectedLoan.dueDate}</div>
          <div>Phương thức giải ngân: {selectedLoan.disbursementMethod || '—'}</div>
          <div>TK nợ gốc: {selectedLoan.principalAccount || '—'} · TK lãi: {selectedLoan.interestAccount || '—'}</div>
          <Button icon={<EditOutlined />} onClick={() => { setDrawerOpen(false); openEdit(selectedLoan); }}>Sửa khế ước</Button>
        </div>}
      </Drawer>
    </div>
  );
};
