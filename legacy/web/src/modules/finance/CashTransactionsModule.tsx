import React, { useState, useEffect, useRef } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  DeleteOutlined,
  EyeOutlined,
  EditOutlined,
  BankOutlined,
  ClockCircleOutlined,
  PaperClipOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer } from '../../custom-ui';
import {
  crmContactsApi,
  employeesApi,
  financeCashApi,
  financePaymentsApi,
  FinanceCashTransaction,
  FinancePaymentAccount,
  FinanceCashJournalLine,
  FinanceCashAttachment,
  filesApi,
  CrmContact,
  EnterpriseEmployee,
} from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { EmployeeQuickCreateDialog } from '../hr/EmployeeQuickCreateDialog';

export type EnterpriseCashTransaction = FinanceCashTransaction;

export const CashTransactionsModule: React.FC<{ typeFilterDefault?: 'Thu' | 'Chi' | 'all' }> = ({
  typeFilterDefault = 'all',
}) => {
  const [data, setData] = useState<EnterpriseCashTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'Thu' | 'Chi' | 'pending'>(typeFilterDefault);
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [categoryForm] = Form.useForm();
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [cashCategories, setCashCategories] = useState<Record<'Thu' | 'Chi', string[]>>({ Thu: [], Chi: [] });
  const [editingTransaction, setEditingTransaction] = useState<EnterpriseCashTransaction | null>(null);
  const [partyRefValue, setPartyRefValue] = useState('other');
  const [sourceFilter, setSourceFilter] = useState<'bank' | 'petty'>('bank');
  const [cashAccounts, setCashAccounts] = useState<FinancePaymentAccount[]>([]);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [employeeCreateOpen, setEmployeeCreateOpen] = useState(false);
  const [orgUnitOptions, setOrgUnitOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [positionOptions, setPositionOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [workStatusOptions, setWorkStatusOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  const [savedAttachments, setSavedAttachments] = useState<FinanceCashAttachment[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const [journalLines, setJournalLines] = useState<FinanceCashJournalLine[]>([]);

  const isTypePinned = typeFilterDefault === 'Thu' || typeFilterDefault === 'Chi';
  const pinnedType = isTypePinned ? typeFilterDefault : null;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<EnterpriseCashTransaction | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await financeCashApi.getAll();
      setData(response.data.data);
    } catch (error: any) {
      setData([]);
      message.error(error?.response?.data?.message || 'Không tải được sổ thu chi. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const [income, expense] = await Promise.all([
        financeCashApi.getCategories('Thu'),
        financeCashApi.getCategories('Chi'),
      ]);
      setCashCategories({ Thu: income.data.data, Chi: expense.data.data });
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được danh mục loại phiếu. Vui lòng thử lại.');
    }
  };

  useEffect(() => {
    void loadData();
    void loadCategories();
    void financePaymentsApi.getAccounts().then(response => setCashAccounts(response.data.accounts)).catch(() => setCashAccounts([]));
    void crmContactsApi.getAll().then(response => setContacts(response.data.data.filter(contact => ['Đang hoạt động', 'Đang hợp tác'].includes(contact.status)))).catch(() => setContacts([]));
    void employeesApi.getAll().then(response => setEmployees(response.data.data.filter(employee => employee.isActive))).catch(() => setEmployees([]));
    void Promise.all([dataService.fetchOrgUnitsList(), dataService.fetchDropdownOptions('positions'), dataService.fetchDropdownOptions('work_statuses')]).then(([units, positions, statuses]) => {
      setOrgUnitOptions(units.map(value => ({ label: value, value })));
      setPositionOptions(positions.filter(item => item.isActive !== false).map(item => ({ label: item.name, value: item.name })));
      setWorkStatusOptions(statuses.filter(item => item.isActive !== false).map(item => ({ label: item.name, value: item.name })));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setTypeFilter(typeFilterDefault);
  }, [typeFilterDefault]);

  const totalIncome = data
    .filter((d) => d.type === 'Thu' && d.status === 'Đã hoàn thành')
    .reduce((sum, d) => sum + d.amount, 0);
  const totalExpense = data
    .filter((d) => d.type === 'Chi' && d.status === 'Đã hoàn thành')
    .reduce((sum, d) => sum + d.amount, 0);
  const netCashFlow = totalIncome - totalExpense;
  const pendingCount = data.filter((d) => d.status === 'Chờ duyệt').length;

  const activeCashAccounts = cashAccounts.filter(account => account.source === sourceFilter && account.status === 'Đang hoạt động');
  const partyOptionsFor = (type: 'Thu' | 'Chi' | undefined) => [
    ...contacts
      .filter(contact => !type || contact.type === 'partner' || (type === 'Thu' ? contact.type === 'customer' : contact.type === 'supplier') || contact.key === editingTransaction?.counterpartyContactId)
      .map(contact => ({
        label: `${contact.type === 'customer' ? 'Khách hàng' : contact.type === 'supplier' ? 'Nhà cung cấp' : 'Đối tác'} · ${contact.name} (${contact.code})`,
        value: `contact:${contact.type}:${contact.key}`,
      })),
    ...employees.map(employee => ({
      label: `Nhân viên · ${employee.name || employee.fullName} (${employee.employeeCode || employee.code})`,
      value: `employee:${employee.employeeCode || employee.code}`,
    })),
    { label: 'Khác · Nhập tên người nộp hoặc nhận', value: 'other' },
  ];

  const getPartyRef = (transaction: EnterpriseCashTransaction) => {
    if (transaction.counterpartyContactId && transaction.counterpartyType && ['customer', 'supplier', 'partner'].includes(transaction.counterpartyType)) {
      return `contact:${transaction.counterpartyType}:${transaction.counterpartyContactId}`;
    }
    if (transaction.counterpartyType === 'employee' && transaction.employeeCode) return `employee:${transaction.employeeCode}`;
    return 'other';
  };

  const closeForm = () => {
    setModalOpen(false);
    setCategoryModalOpen(false);
    setEditingTransaction(null);
    setPartyRefValue('other');
    form.resetFields();
    categoryForm.resetFields();
    setJournalLines([]);
    setAttachmentFiles([]);
    setSavedAttachments([]);
  };

  const handleAddCategory = async (values: { name: string }) => {
    const type = form.getFieldValue('type') === 'Chi' ? 'Chi' : 'Thu';
    const name = String(values.name || '').trim();
    try {
      await financeCashApi.addCategory(type, name);
      setCashCategories(current => ({ ...current, [type]: [...current[type], name] }));
      form.setFieldsValue({ category: name });
      categoryForm.resetFields();
      setCategoryModalOpen(false);
      message.success('Đã thêm loại phiếu.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể thêm loại phiếu. Vui lòng thử lại.');
    }
  };

  const handleSave = async (values: any) => {
    const partyRef = String(values.partyRef || 'other');
    let counterpartyType: FinanceCashTransaction['counterpartyType'] = 'other';
    let counterpartyContactId = '';
    let employeeCode = '';
    let recipientOrPayer = String(values.recipientOrPayer || '').trim();
    if (partyRef.startsWith('contact:')) {
      const [, type, id] = partyRef.split(':');
      const contact = contacts.find(item => item.key === id && item.type === type);
      if (!contact) { message.error('Không tìm thấy đối tượng đã chọn. Hãy tải lại danh mục.'); return; }
      counterpartyType = type as FinanceCashTransaction['counterpartyType'];
      counterpartyContactId = id;
      recipientOrPayer = contact.name;
    } else if (partyRef.startsWith('employee:')) {
      employeeCode = partyRef.slice('employee:'.length);
      const employee = employees.find(item => (item.employeeCode || item.code) === employeeCode);
      if (!employee) { message.error('Không tìm thấy nhân viên đã chọn. Hãy tải lại danh mục.'); return; }
      counterpartyType = 'employee';
      recipientOrPayer = employee.name || employee.fullName;
    }
    const account = activeCashAccounts.find(item => item.key === values.sourceAccountId);
    if (!account) { message.error('Hãy chọn tài khoản đang hoạt động phù hợp với nguồn tiền.'); return; }
    if (journalLines.length && journalLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0) !== (Number(values.amount) || 0)) {
      message.error('Tổng tiền các dòng hạch toán phải bằng số tiền phiếu.');
      return;
    }
    const existingBytes = savedAttachments.reduce((sum, file) => sum + Number(file.size || 0), 0);
    const pendingBytes = attachmentFiles.reduce((sum, file) => sum + file.size, 0);
    if (existingBytes + pendingBytes > 5 * 1024 * 1024) { message.error('Tổng dung lượng tệp đính kèm tối đa 5 MB.'); return; }
    if (savedAttachments.length + attachmentFiles.length > 20) { message.error('Mỗi phiếu được đính kèm tối đa 20 tệp.'); return; }
    const uploadedAttachments: FinanceCashAttachment[] = [];
    if (attachmentFiles.length) {
      try {
        const root = await filesApi.list(null);
        for (const file of attachmentFiles) {
          const uploaded = (await filesApi.upload(file, file.name, root.data.context.parentId || undefined, 'finance_cash')).data.file;
          uploadedAttachments.push({ id: uploaded.id || uploaded.key, name: uploaded.name, size: Number(uploaded.sizeBytes) || file.size, mimeType: uploaded.mime || file.type });
        }
      } catch (error: any) {
        await Promise.all(uploadedAttachments.map(file => filesApi.remove(file.id).catch(() => {})));
        message.error(error?.response?.data?.message || 'Không tải được tệp đính kèm lên kho tệp.');
        return;
      }
    }
    const formattedValues = {
      type: values.type,
      source: values.source,
      sourceAccountId: account.key,
      account: account.name,
      category: values.category,
      amount: Number(values.amount) || 0,
      date: values.date,
      voucherDate: values.voucherDate,
      currency: values.currency || 'VND',
      reference: values.reference || '',
      payerName: values.payerName || '',
      counterpartyAddress: values.counterpartyAddress || '',
      attachmentCount: Number(values.attachmentCount) || 0,
      sourceDocument: values.sourceDocument || '',
      recipientOrPayer,
      counterpartyType,
      counterpartyContactId,
      employeeCode,
      status: editingTransaction?.status || values.status || 'Chờ duyệt',
      note: values.note || '',
      department: values.department || '',
      journalLines,
      attachments: [...savedAttachments, ...uploadedAttachments],
    };
    try {
      if (editingTransaction) {
        const response = await financeCashApi.update(editingTransaction.key, formattedValues);
        message.success(`Đã cập nhật phiếu ${response.data.transaction.code}`);
      } else {
        const response = await financeCashApi.create(formattedValues);
        message.success(`Đã lập phiếu ${response.data.transaction.code}`);
      }
      closeForm();
      if (selectedTransaction?.key === editingTransaction?.key) setSelectedTransaction(null);
      await loadData();
    } catch (error: any) {
      await Promise.all(uploadedAttachments.map(file => filesApi.remove(file.id).catch(() => {})));
      message.error(error?.response?.data?.message || 'Không thể lưu phiếu thu chi. Vui lòng kiểm tra lại dữ liệu.');
    }
  };

  const openCreateForm = () => {
    setEditingTransaction(null);
    setPartyRefValue('other');
    setSourceFilter('bank');
    form.resetFields();
    setAttachmentFiles([]);
    setSavedAttachments([]);
    setJournalLines([{ description: '', debitAccount: '', creditAccount: '', amount: 0 }]);
    form.setFieldsValue({
      type: pinnedType || (typeFilter === 'Chi' ? 'Chi' : 'Thu'),
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
      voucherDate: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
      currency: 'VND',
      status: 'Chờ duyệt',
      source: 'bank',
      partyRef: 'other',
      payerName: '',
      counterpartyAddress: '',
      attachmentCount: 0,
      sourceDocument: '',
    });
    setModalOpen(true);
  };

  const openEditForm = (transaction: EnterpriseCashTransaction) => {
    const account = cashAccounts.find(item => item.key === transaction.sourceAccountId)
      || cashAccounts.find(item => item.source === transaction.source && item.name === transaction.account);
    const partyRef = getPartyRef(transaction);
    setEditingTransaction(transaction);
    setDrawerOpen(false);
    setPartyRefValue(partyRef);
    setSourceFilter(transaction.source);
    form.resetFields();
    setAttachmentFiles([]);
    setSavedAttachments(transaction.attachments?.map(file => ({ ...file })) || []);
    setJournalLines(transaction.journalLines?.length ? transaction.journalLines.map(line => ({ ...line })) : [{ description: transaction.category, debitAccount: '', creditAccount: '', amount: transaction.amount }]);
    form.setFieldsValue({
      type: transaction.type,
      source: transaction.source,
      sourceAccountId: account?.key,
      category: transaction.category,
      amount: transaction.amount,
      date: transaction.date,
      voucherDate: transaction.voucherDate || transaction.date,
      currency: transaction.currency || 'VND',
      reference: transaction.reference || '',
      status: transaction.status,
      note: transaction.note,
      department: transaction.department,
      partyRef,
      recipientOrPayer: transaction.recipientOrPayer,
      payerName: transaction.payerName || '',
      counterpartyAddress: transaction.counterpartyAddress || '',
      attachmentCount: transaction.attachmentCount || 0,
      sourceDocument: transaction.sourceDocument || '',
    });
    setModalOpen(true);
  };

  const handleDelete = (trx: EnterpriseCashTransaction) => {
    Modal.confirm({
      title: `Xác nhận hủy phiếu ${trx.type}?`,
      content: `Chứng từ ${trx.code} sẽ được chuyển sang trạng thái Đã hủy để giữ vết sổ kế toán.`,
      okText: 'Xác nhận hủy',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await financeCashApi.cancel(trx.key);
          message.success('Đã hủy chứng từ thu chi');
          setDrawerOpen(false);
          await loadData();
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'Không thể hủy chứng từ thu chi.');
        }
      },
    });
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.recipientOrPayer || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.account || '').toLowerCase().includes(searchText.toLowerCase());

    if (typeFilter === 'all') return matchSearch && (!pinnedType || item.type === pinnedType);
    if (typeFilter === 'pending') return matchSearch && item.status === 'Chờ duyệt' && (!pinnedType || item.type === pinnedType);
    if (pinnedType) return matchSearch && item.type === pinnedType;
    return matchSearch && item.type === typeFilter;
  });

  const activeVoucherType: 'Thu' | 'Chi' = form.getFieldValue('type') === 'Chi' ? 'Chi' : 'Thu';
  const journalColumns = [
    { title: '#', key: 'lineNumber', width: 44, render: (_: any, record: any) => record.lineIndex + 1 },
    { title: 'Diễn giải', key: 'description', render: (_: any, record: any) => <Input aria-label={`Diễn giải hạch toán dòng ${record.lineIndex + 1}`} value={record.description} onChange={event => updateJournalLine(record.lineIndex, 'description', event.target.value)} maxLength={500} /> },
    { title: 'TK Nợ', key: 'debitAccount', width: 150, render: (_: any, record: any) => <Input aria-label={`Tài khoản Nợ dòng ${record.lineIndex + 1}`} value={record.debitAccount} onChange={event => updateJournalLine(record.lineIndex, 'debitAccount', event.target.value)} placeholder="Ví dụ: 1111" maxLength={24} /> },
    { title: 'TK Có', key: 'creditAccount', width: 150, render: (_: any, record: any) => <Input aria-label={`Tài khoản Có dòng ${record.lineIndex + 1}`} value={record.creditAccount} onChange={event => updateJournalLine(record.lineIndex, 'creditAccount', event.target.value)} placeholder="Nhập mã TK" maxLength={24} /> },
    { title: 'Số tiền', key: 'amount', width: 170, render: (_: any, record: any) => <Input aria-label={`Số tiền hạch toán dòng ${record.lineIndex + 1}`} type="number" min={0} step={1} value={record.amount} onChange={event => updateJournalLine(record.lineIndex, 'amount', Number(event.target.value) || 0)} /> },
    { title: 'Nghiệp vụ', key: 'business', render: (_: any, record: any) => <span>{record.business || ''}</span> },
    { title: '', key: 'actions', width: 48, render: (_: any, record: any) => <Button aria-label={`Xóa dòng hạch toán ${record.lineIndex + 1}`} icon={<DeleteOutlined />} disabled={journalLines.length <= 1} onClick={() => { const next = journalLines.filter((_, lineIndex) => lineIndex !== record.lineIndex); setJournalLines(next); form.setFieldsValue({ amount: next.reduce((sum, row) => sum + (Number(row.amount) || 0), 0) }); }} /> },
  ];
  function updateJournalLine(index: number, field: keyof FinanceCashJournalLine, value: string | number) {
    setJournalLines(current => {
      const next = current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line);
      if (field === 'amount') form.setFieldsValue({ amount: next.reduce((sum, line) => sum + (Number(line.amount) || 0), 0) });
      return next;
    });
  }

  const columns = [
    {
      title: 'Mã chứng từ & Loại phiếu',
      key: 'code',
      render: (_: any, record: EnterpriseCashTransaction) => (
        <div>
          <div style={{ fontWeight: 700, fontSize: 13.5, color: record.type === 'Thu' ? '#16A34A' : '#DC2626', display: 'flex', alignItems: 'center', gap: 6 }}>
            {record.type === 'Thu' ? <ArrowDownOutlined /> : <ArrowUpOutlined />}
            {record.code}
          </div>
          <Tag color={record.type === 'Thu' ? 'success' : 'error'} style={{ marginTop: 2 }}>
            {record.type === 'Thu' ? 'Phiếu Thu' : 'Phiếu Chi'}
          </Tag>
        </div>
      ),
    },
    {
      title: 'Nội dung hạch toán & Đối tác',
      key: 'category',
      render: (_: any, record: EnterpriseCashTransaction) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 13 }}>{record.category}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Đối tác: <strong>{record.recipientOrPayer}</strong>
          </div>
        </div>
      ),
    },
    {
      title: 'Số tiền giao dịch',
      dataIndex: 'amount',
      key: 'amount',
      width: 190,
      render: (val: number, record: EnterpriseCashTransaction) => (
        <span
          style={{
            fontWeight: 800,
            fontSize: 14.5,
            color: record.type === 'Thu' ? '#16A34A' : '#DC2626',
          }}
        >
          {record.type === 'Thu' ? '+' : '-'}
          {val.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Tài khoản nguồn / Quỹ',
      dataIndex: 'account',
      key: 'account',
      width: 190,
      render: (acc: string) => (
        <span style={{ color: '#2563EB', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <BankOutlined /> {acc}
        </span>
      ),
    },
    {
      title: 'Ngày hạch toán',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      render: (d: string) => <span style={{ fontSize: 12, color: '#475569' }}>{d}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => (
        <Tag color={status === 'Đã hoàn thành' ? 'success' : status === 'Đã hủy' ? 'error' : 'warning'}>{status}</Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseCashTransaction) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedTransaction(record);
            setDrawerOpen(true);
          }}
        >
          Phiếu
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng tiền thực thu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            +{totalIncome.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tính từ các chứng từ đã hoàn thành</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng tiền thực chi</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            -{totalExpense.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Tính từ các chứng từ đã hoàn thành</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chênh lệch dòng tiền thuần</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: netCashFlow >= 0 ? '#009688' : '#DC2626', marginTop: 4 }}>
            {netCashFlow >= 0 ? '+' : ''}{netCashFlow.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Thu trừ chi của các chứng từ đã hoàn thành</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chứng từ thu chi chờ duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingCount} Chứng từ
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Chưa được tính vào dòng tiền thực tế</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phiếu' },
            { key: 'Thu', label: 'Phiếu Thu', icon: <ArrowDownOutlined style={{ color: '#10B981' }} /> },
            { key: 'Chi', label: 'Phiếu Chi', icon: <ArrowUpOutlined style={{ color: '#EF4444' }} /> },
            { key: 'pending', label: 'Chờ duyệt', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
          ].filter(tab => !pinnedType || tab.key === pinnedType || tab.key === 'pending').map((tab) => (
            <Button
              key={tab.key}
              size="small"
              icon={tab.icon}
              onClick={() => setTypeFilter(tab.key as any)}
              style={{
                backgroundColor: typeFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: typeFilter === tab.key ? '#009688' : '#CBD5E1',
                color: typeFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: typeFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã phiếu, nội dung, đối tác..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>
            Làm mới
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreateForm}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            {pinnedType === 'Thu' ? 'Lập phiếu thu' : pinnedType === 'Chi' ? 'Lập phiếu chi' : 'Lập phiếu thu / chi'}
          </Button>
        </div>
      </div>

      {/* Main Table */}
          <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 20 }} />
      </div>

      {/* MODAL: Lập phiếu thu / chi */}
      <Modal
        title={null}
        className="cash-voucher-fullscreen"
        open={modalOpen}
        onCancel={closeForm}
        footer={null}
        width="100vw"
        style={{ maxWidth: '100vw', height: '100vh', maxHeight: '100vh', margin: 0, borderRadius: 0, padding: 14, gap: 8 }}
        bodyStyle={{ minHeight: 0, marginRight: -14, paddingRight: 0, overflowX: 'auto' }}
      >
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ minWidth: 0, paddingRight: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, minHeight: 42, margin: '-4px -8px 0', padding: '4px 8px', background: '#E5EAE9' }}>
            <strong style={{ fontSize: 22, whiteSpace: 'nowrap' }}>{editingTransaction ? `${activeVoucherType === 'Chi' ? 'Phiếu chi' : 'Phiếu thu'} ${editingTransaction.code}` : `Phiếu ${activeVoucherType === 'Chi' ? 'chi' : 'thu'}`}</strong>
            <Form.Item name="type" noStyle rules={[{ required: true }]}>
              <Select disabled={Boolean(editingTransaction) || isTypePinned} style={{ width: 330 }} onChange={() => { setPartyRefValue('other'); form.setFieldsValue({ partyRef: 'other', recipientOrPayer: '' }); }} options={[{ label: 'Phiếu thu tiền', value: 'Thu' }, { label: 'Phiếu chi tiền', value: 'Chi' }]} />
            </Form.Item>
            <Form.Item label={null} required style={{ margin: 0, flex: 1, maxWidth: 520 }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <Form.Item name="category" rules={[{ required: true, message: 'Hãy chọn loại phiếu.' }]} style={{ flex: 1, margin: 0 }}>
                  <Select showSearch placeholder={cashCategories[activeVoucherType].length ? 'Chọn loại phiếu' : 'Chưa có loại phiếu; bấm dấu cộng để thêm'} options={cashCategories[activeVoucherType].map(name => ({ label: name, value: name }))} />
                </Form.Item>
                <Button aria-label={`Thêm loại phiếu ${activeVoucherType === 'Thu' ? 'thu' : 'chi'}`} title="Thêm loại phiếu" icon={<PlusOutlined />} onClick={() => { categoryForm.resetFields(); setCategoryModalOpen(true); }} />
              </div>
            </Form.Item>
          </div>

          <div style={{ margin: '0 -8px 14px', padding: '10px 8px 6px', background: '#E5EAE9', display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) minmax(240px, 2.8fr) minmax(145px, 1fr) minmax(145px, 1fr) minmax(150px, 1.2fr)', columnGap: 10, rowGap: 0, alignItems: 'start' }}>
            <Form.Item name="partyRef" label={activeVoucherType === 'Chi' ? 'Mã nhà cung cấp' : 'Mã khách hàng'} rules={[{ required: true, message: 'Hãy chọn đối tượng.' }]} style={{ marginBottom: 6 }}>
              <Select showSearch onChange={(value: string) => {
                setPartyRefValue(value);
                if (value === 'other') { form.setFieldsValue({ recipientOrPayer: '', counterpartyAddress: '' }); return; }
                if (value.startsWith('contact:')) {
                  const contact = contacts.find(item => item.key === value.split(':')[2]);
                  form.setFieldsValue({ recipientOrPayer: contact?.name || '', counterpartyAddress: contact?.address || '' });
                } else if (value.startsWith('employee:')) {
                  const employee = employees.find(item => (item.employeeCode || item.code) === value.slice('employee:'.length));
                  form.setFieldsValue({ recipientOrPayer: employee?.name || employee?.fullName || '', counterpartyAddress: '' });
                }
              }} options={partyOptionsFor(form.getFieldValue('type'))} />
            </Form.Item>
            <Form.Item name="recipientOrPayer" label="Tên khách hàng / nhà cung cấp" rules={[{ required: true, whitespace: true, message: 'Hãy nhập tên đối tượng.' }]} style={{ marginBottom: 6 }}><Input /></Form.Item>
            <Form.Item name="date" label="Ngày hạch toán" rules={[{ required: true }]} style={{ marginBottom: 6 }}><Input type="date" /></Form.Item>
            <Form.Item name="voucherDate" label={activeVoucherType === 'Chi' ? 'Ngày phiếu chi' : 'Ngày phiếu thu'} rules={[{ required: true }]} style={{ marginBottom: 6 }}><Input type="date" /></Form.Item>
            <Form.Item name="amount" label={activeVoucherType === 'Chi' ? 'Tổng tiền chi' : 'Tổng tiền thu'} rules={[{ required: true }]} style={{ marginBottom: 6 }}><Input type="number" min={1} step={1} /></Form.Item>

            <Form.Item name="payerName" label={activeVoucherType === 'Chi' ? 'Người nhận' : 'Người nộp'} style={{ marginBottom: 6 }}><Input /></Form.Item>
            <Form.Item name="counterpartyAddress" label="Địa chỉ" style={{ marginBottom: 6 }}><Input /></Form.Item>
            <Form.Item name="source" label="Nguồn tiền" rules={[{ required: true }]} style={{ marginBottom: 6 }}><Select disabled={Boolean(editingTransaction && editingTransaction.status !== 'Chờ duyệt')} onChange={(value: 'bank' | 'petty') => { setSourceFilter(value); form.setFieldsValue({ source: value, sourceAccountId: undefined }); }} options={[{ label: 'Tiền gửi ngân hàng', value: 'bank' }, { label: 'Quỹ tiền mặt', value: 'petty' }]} /></Form.Item>
            <Form.Item name="sourceAccountId" label={sourceFilter === 'petty' ? 'Quỹ tiền mặt' : 'Tài khoản ngân hàng'} rules={[{ required: true, message: 'Hãy chọn tài khoản nguồn.' }]} style={{ marginBottom: 6 }}><Select placeholder={activeCashAccounts.length ? 'Chọn tài khoản' : 'Chưa có tài khoản'} options={activeCashAccounts.map(account => ({ value: account.key, label: `${account.name} · ${Number(account.balance).toLocaleString('vi-VN')} ₫` }))} /></Form.Item>
            <Form.Item label="Kèm theo" style={{ marginBottom: 6 }}><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Form.Item name="attachmentCount" noStyle><Input type="number" min={0} step={1} placeholder="Số lượng" /></Form.Item><span style={{ whiteSpace: 'nowrap' }}>chứng từ gốc</span></div></Form.Item>

            <Form.Item name="reference" label="Tham chiếu" style={{ marginBottom: 6 }}><Input maxLength={500} placeholder="Mã tham chiếu" /></Form.Item>
            <Form.Item name="sourceDocument" label="Chứng từ gốc" style={{ marginBottom: 6 }}><Input maxLength={500} /></Form.Item>
            <Form.Item name="department" label="Phòng ban" style={{ marginBottom: 6 }}><Input placeholder="Phòng ban liên quan" /></Form.Item>
            <Form.Item name="status" label="Trạng thái" rules={[{ required: true }]} style={{ marginBottom: 6 }}><Select disabled={Boolean(editingTransaction)} options={[{ label: 'Đã hoàn thành', value: 'Đã hoàn thành' }, { label: 'Chờ duyệt', value: 'Chờ duyệt' }]} /></Form.Item>
            <Form.Item name="note" label="Ghi chú" style={{ marginBottom: 6 }}><Input.TextArea rows={1} placeholder="Ghi chú" /></Form.Item>
          </div>

          <div style={{ margin: '4px 0 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><strong>Hạch toán</strong><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Loại tiền<Form.Item name="currency" noStyle rules={[{ required: true }]}><Select style={{ width: 110 }} options={[{ label: 'VND', value: 'VND' }]} /></Form.Item></div></div>
            <div style={{ overflowX: 'auto' }}><KTable dataSource={journalLines.map((line, lineIndex) => ({ ...line, lineIndex, key: String(lineIndex) }))} columns={journalColumns} pagination={{ pageSize: 20 }} disableCache /></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <div style={{ display: 'flex', gap: 8 }}><Button icon={<PlusOutlined />} onClick={() => setJournalLines(current => [...current, { description: '', debitAccount: '', creditAccount: '', amount: 0 }])}>Thêm dòng</Button><Button onClick={() => { setJournalLines([]); form.setFieldsValue({ amount: 0 }); }}>Xóa hết dòng</Button></div>
              <strong>Tổng: {journalLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0).toLocaleString('vi-VN')} ₫</strong>
            </div>
          </div>

          <div style={{ margin: '12px 0 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, color: '#475569', fontSize: 13 }}><PaperClipOutlined /> <strong>Đính kèm</strong><span>Dung lượng tổng tối đa 5 MB · {savedAttachments.length + attachmentFiles.length} tệp</span></div>
            <input ref={attachmentInputRef} type="file" multiple style={{ display: 'none' }} onChange={event => {
              const incoming = Array.from(event.target.files || []);
              const totalSize = savedAttachments.reduce((sum, file) => sum + Number(file.size || 0), 0) + attachmentFiles.reduce((sum, file) => sum + file.size, 0) + incoming.reduce((sum, file) => sum + file.size, 0);
              if (savedAttachments.length + attachmentFiles.length + incoming.length > 20) message.error('Mỗi phiếu được đính kèm tối đa 20 tệp.');
              else if (totalSize > 5 * 1024 * 1024) message.error('Tổng dung lượng tệp đính kèm tối đa 5 MB.');
              else setAttachmentFiles(current => [...current, ...incoming]);
              event.target.value = '';
            }} />
            <div role="button" tabIndex={0} onClick={() => attachmentInputRef.current?.click()} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') attachmentInputRef.current?.click(); }} onDragOver={event => event.preventDefault()} onDrop={event => {
              event.preventDefault();
              const incoming = Array.from(event.dataTransfer.files);
              const totalSize = savedAttachments.reduce((sum, file) => sum + Number(file.size || 0), 0) + attachmentFiles.reduce((sum, file) => sum + file.size, 0) + incoming.reduce((sum, file) => sum + file.size, 0);
              if (savedAttachments.length + attachmentFiles.length + incoming.length > 20 || totalSize > 5 * 1024 * 1024) message.error('Tệp vượt quá giới hạn 20 tệp hoặc tổng dung lượng 5 MB.');
              else setAttachmentFiles(current => [...current, ...incoming]);
            }} style={{ border: '1px dashed #86A883', padding: '16px 20px', color: '#64748B', cursor: 'pointer', maxWidth: 500, textAlign: 'center', background: '#FAFCFA' }}>Kéo/thả tệp vào đây hoặc bấm để chọn</div>
            {[...savedAttachments.map(file => ({ ...file, stored: true as const, file: undefined as File | undefined })), ...attachmentFiles.map(file => ({ id: `local-${file.name}-${file.lastModified}`, name: file.name, size: file.size, stored: false as const, file }))].map(item => {
              const lastModified = item.file?.lastModified;
              return <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12 }}><PaperClipOutlined /><span>{item.name} · {(item.size / 1024).toFixed(0)} KB</span><Button aria-label={`Bỏ tệp ${item.name}`} onClick={() => item.stored ? setSavedAttachments(current => current.filter(file => file.id !== item.id)) : setAttachmentFiles(current => current.filter(file => !(file.name === item.name && file.lastModified === lastModified)))}>Bỏ</Button></div>;
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={closeForm}>Đóng</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingTransaction ? 'Lưu thay đổi' : `Lập phiếu ${activeVoucherType === 'Chi' ? 'chi' : 'thu'}`}
            </Button>
          </div>
        </Form>
      </Modal>

      <EmployeeQuickCreateDialog
        open={employeeCreateOpen}
        onClose={() => setEmployeeCreateOpen(false)}
        orgUnitOptions={orgUnitOptions}
        positionOptions={positionOptions}
        workStatusOptions={workStatusOptions}
        onCreated={createdEmployee => {
          void employeesApi.getAll().then(response => {
            const refreshed = response.data.data.filter(employee => employee.isActive);
            setEmployees(refreshed);
            const created = refreshed.find(employee => employee.id === createdEmployee.id) || createdEmployee;
            if (created) {
              const ref = `employee:${created.employeeCode || created.code}`;
              setPartyRefValue(ref);
              form.setFieldsValue({ partyRef: ref, recipientOrPayer: created.name || created.fullName });
            }
          }).catch(() => message.error('Đã tạo nhân viên nhưng không tải lại được danh sách.'));
        }}
      />

      <Modal
        title={`Thêm loại phiếu ${activeVoucherType === 'Chi' ? 'chi' : 'thu'}`}
        open={categoryModalOpen}
        onCancel={() => { setCategoryModalOpen(false); categoryForm.resetFields(); }}
        footer={null}
        width={420}
      >
        <Form form={categoryForm} layout="vertical" onFinish={handleAddCategory}>
          <Form.Item name="name" label="Tên loại phiếu" rules={[{ required: true, whitespace: true, max: 100, message: 'Hãy nhập tên loại phiếu, tối đa 100 ký tự.' }]}>
            <Input maxLength={100} placeholder="Nhập tên loại phiếu" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={() => { setCategoryModalOpen(false); categoryForm.resetFields(); }}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu loại phiếu</Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi tiết chứng từ từ sổ thu chi */}
      <Drawer
        title="Chi tiết chứng từ thu chi"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedTransaction && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Voucher Header Box */}
            <div style={{ background: '#F8FAFC', padding: 18, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: selectedTransaction.type === 'Thu' ? '#16A34A' : '#DC2626', marginTop: 4 }}>
                    {selectedTransaction.type === 'Thu' ? 'PHIẾU THU TIỀN' : 'PHIẾU CHI TIỀN'} ({selectedTransaction.code})
                  </div>
                </div>
                <Tag color={selectedTransaction.status === 'Đã hoàn thành' ? 'success' : selectedTransaction.status === 'Đã hủy' ? 'error' : 'warning'}>
                  {selectedTransaction.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>
                Ngày lập phiếu: <strong>{selectedTransaction.date}</strong> · Nguồn: {selectedTransaction.source === 'petty' ? 'Quỹ tiền mặt' : 'Tiền gửi ngân hàng'} · {selectedTransaction.account}
              </div>
            </div>

            {/* Voucher Details */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Nội Dung Thanh Toán &amp; Số Tiền:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Họ tên người nộp/nhận:</span>
                  <strong>{selectedTransaction.recipientOrPayer}</strong>
                </div>
                {selectedTransaction.counterpartyType && selectedTransaction.counterpartyType !== 'other' && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#64748B' }}>Liên kết danh mục:</span>
                    <span>{selectedTransaction.counterpartyType === 'customer' ? 'Khách hàng' : selectedTransaction.counterpartyType === 'supplier' ? 'Nhà cung cấp' : selectedTransaction.counterpartyType === 'employee' ? 'Nhân viên' : 'Đối tác'}</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Lý do thu / chi:</span>
                  <span>{selectedTransaction.category}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
                  <span style={{ color: '#0F172A', fontWeight: 700 }}>Số tiền thanh toán:</span>
                  <strong style={{ color: selectedTransaction.type === 'Thu' ? '#16A34A' : '#DC2626', fontSize: 17 }}>
                    {selectedTransaction.amount.toLocaleString('vi-VN')} ₫
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Ghi chú:</span>
                  <span>{selectedTransaction.note || 'Không có'}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {selectedTransaction.status === 'Chờ duyệt' && !selectedTransaction.code.startsWith('AUTO-') && !selectedTransaction.code.startsWith('TRF-') && (
                <Button icon={<EditOutlined />} onClick={() => openEditForm(selectedTransaction)}>
                  Sửa phiếu
                </Button>
              )}
              {selectedTransaction.status !== 'Đã hủy' && (
                <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(selectedTransaction)}>
                  Hủy phiếu
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
