import React, { useState, useEffect } from 'react';
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
  CrmContact,
  EnterpriseEmployee,
} from '../../api/endpoints';

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
    const formattedValues = {
      type: values.type,
      source: values.source,
      sourceAccountId: account.key,
      account: account.name,
      category: values.category,
      amount: Number(values.amount) || 0,
      date: values.date,
      recipientOrPayer,
      counterpartyType,
      counterpartyContactId,
      employeeCode,
      status: editingTransaction?.status || values.status || 'Chờ duyệt',
      note: values.note || '',
      department: values.department || '',
      journalLines,
    };
    if (journalLines.length && journalLines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0) !== formattedValues.amount) {
      message.error('Tổng tiền các dòng hạch toán phải bằng số tiền phiếu.');
      return;
    }
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
      message.error(error?.response?.data?.message || 'Không thể lưu phiếu thu chi. Vui lòng kiểm tra lại dữ liệu.');
    }
  };

  const openCreateForm = () => {
    setEditingTransaction(null);
    setPartyRefValue('other');
    setSourceFilter('bank');
    form.resetFields();
    setJournalLines([{ description: '', debitAccount: '', creditAccount: '', amount: 0 }]);
    form.setFieldsValue({
      type: pinnedType || (typeFilter === 'Chi' ? 'Chi' : 'Thu'),
      date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
      status: 'Chờ duyệt',
      source: 'bank',
      partyRef: 'other',
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
    setJournalLines(transaction.journalLines?.length ? transaction.journalLines.map(line => ({ ...line })) : [{ description: transaction.category, debitAccount: '', creditAccount: '', amount: transaction.amount }]);
    form.setFieldsValue({
      type: transaction.type,
      source: transaction.source,
      sourceAccountId: account?.key,
      category: transaction.category,
      amount: transaction.amount,
      date: transaction.date,
      status: transaction.status,
      note: transaction.note,
      department: transaction.department,
      partyRef,
      recipientOrPayer: transaction.recipientOrPayer,
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
  const updateJournalLine = (index: number, field: keyof FinanceCashJournalLine, value: string | number) => {
    setJournalLines(current => {
      const next = current.map((line, lineIndex) => lineIndex === index ? { ...line, [field]: value } : line);
      if (field === 'amount') form.setFieldsValue({ amount: next.reduce((sum, line) => sum + (Number(line.amount) || 0), 0) });
      return next;
    });
  };

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
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Lập phiếu thu / chi */}
      <Modal
        title={editingTransaction ? `Sửa phiếu ${editingTransaction.code}` : `Lập phiếu ${pinnedType === 'Chi' ? 'chi' : pinnedType === 'Thu' ? 'thu' : 'thu / chi'}`}
        open={modalOpen}
        onCancel={closeForm}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="type" label="Loại chứng từ" rules={[{ required: true }]}>
              <Select
                disabled={Boolean(editingTransaction) || isTypePinned}
                onChange={() => {
                  setPartyRefValue('other');
                  form.setFieldsValue({ partyRef: 'other', recipientOrPayer: '' });
                }}
                options={[
                  { label: 'Phiếu Thu Tiền', value: 'Thu' },
                  { label: 'Phiếu Chi Tiền', value: 'Chi' },
                ]}
              />
            </Form.Item>
            <Form.Item label="Số chứng từ">
              <Input disabled value={editingTransaction?.code || 'Hệ thống tự cấp khi lưu'} />
            </Form.Item>
          </div>

          <Form.Item name="source" label="Nguồn tiền" rules={[{ required: true }]}>
            <Select
              disabled={Boolean(editingTransaction && editingTransaction.status !== 'Chờ duyệt')}
              onChange={(value: 'bank' | 'petty') => {
                setSourceFilter(value);
                form.setFieldsValue({ source: value, sourceAccountId: undefined });
              }}
              options={[
                { label: 'Tiền gửi ngân hàng', value: 'bank' },
                { label: 'Quỹ tiền mặt', value: 'petty' },
              ]}
            />
          </Form.Item>

          <Form.Item name="sourceAccountId" label={sourceFilter === 'petty' ? 'Quỹ tiền mặt' : 'Tài khoản ngân hàng'} rules={[{ required: true, message: 'Hãy chọn tài khoản nguồn.' }]}>
            <Select
              placeholder={activeCashAccounts.length ? 'Chọn tài khoản đang hoạt động' : 'Chưa có tài khoản đang hoạt động'}
              options={activeCashAccounts.map(account => ({
                value: account.key,
                label: `${account.name} · Số dư ${Number(account.balance).toLocaleString('vi-VN')} ₫`,
              }))}
            />
          </Form.Item>

          <Form.Item label={activeVoucherType === 'Chi' ? 'Loại phiếu chi' : 'Loại phiếu thu'} required>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              <Form.Item name="category" rules={[{ required: true, message: 'Hãy chọn loại phiếu.' }]} style={{ flex: 1, marginBottom: 0 }}>
                <Select
                  showSearch
                  placeholder={cashCategories[activeVoucherType].length ? 'Chọn loại phiếu' : 'Chưa có loại phiếu; bấm dấu cộng để thêm'}
                  options={cashCategories[activeVoucherType].map(name => ({ label: name, value: name }))}
                  style={{ width: '100%' }}
                />
              </Form.Item>
              <Button
                aria-label={`Thêm loại phiếu ${activeVoucherType === 'Thu' ? 'thu' : 'chi'}`}
                title={`Thêm loại phiếu ${activeVoucherType === 'Thu' ? 'thu' : 'chi'}`}
                icon={<PlusOutlined />}
                onClick={() => { categoryForm.resetFields(); setCategoryModalOpen(true); }}
              />
            </div>
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="amount" label={activeVoucherType === 'Chi' ? 'Số tiền chi (VNĐ)' : 'Số tiền thu (VNĐ)'} rules={[{ required: true }]}>
              <Input type="number" min={1} step={1} />
            </Form.Item>
            <Form.Item name="date" label="Ngày hạch toán" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ margin: '4px 0 14px', border: '1px solid #CBD5E1', overflowX: 'auto' }}>
            <div style={{ minWidth: 760, display: 'grid', gridTemplateColumns: '36px minmax(180px, 2fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(130px, 1fr) 40px', background: '#C5D9C2', fontSize: 12, fontWeight: 700 }}>
              {['#', 'Diễn giải', 'TK Nợ', 'TK Có', 'Số tiền', ''].map((title, index) => <div key={`${title}-${index}`} style={{ padding: '7px 8px', borderRight: '1px solid #B3C8B0' }}>{title}</div>)}
            </div>
            {journalLines.map((line, index) => <div key={index} style={{ minWidth: 760, display: 'grid', gridTemplateColumns: '36px minmax(180px, 2fr) minmax(120px, 1fr) minmax(120px, 1fr) minmax(130px, 1fr) 40px', alignItems: 'center', gap: 6, padding: '6px 5px', borderBottom: '1px solid #E2E8F0' }}>
              <span style={{ textAlign: 'center', fontSize: 12 }}>{index + 1}</span>
              <Input aria-label={`Diễn giải hạch toán dòng ${index + 1}`} value={line.description} onChange={event => updateJournalLine(index, 'description', event.target.value)} maxLength={500} />
              <Input aria-label={`Tài khoản Nợ dòng ${index + 1}`} value={line.debitAccount} onChange={event => updateJournalLine(index, 'debitAccount', event.target.value)} placeholder="Ví dụ: 1111" maxLength={24} />
              <Input aria-label={`Tài khoản Có dòng ${index + 1}`} value={line.creditAccount} onChange={event => updateJournalLine(index, 'creditAccount', event.target.value)} placeholder="Nhập mã TK" maxLength={24} />
              <Input aria-label={`Số tiền hạch toán dòng ${index + 1}`} type="number" min={0} step={1} value={line.amount} onChange={event => updateJournalLine(index, 'amount', Number(event.target.value) || 0)} />
              <Button aria-label={`Xóa dòng hạch toán ${index + 1}`} icon={<DeleteOutlined />} disabled={journalLines.length <= 1} onClick={() => {
                const next = journalLines.filter((_, lineIndex) => lineIndex !== index);
                setJournalLines(next);
                form.setFieldsValue({ amount: next.reduce((sum, row) => sum + (Number(row.amount) || 0), 0) });
              }} />
            </div>)}
            <div style={{ padding: 8 }}><Button icon={<PlusOutlined />} onClick={() => setJournalLines(current => [...current, { description: '', debitAccount: '', creditAccount: '', amount: 0 }])}>Thêm dòng</Button></div>
          </div>

          <Form.Item name="partyRef" label={activeVoucherType === 'Chi' ? 'Đối tượng nhận tiền' : 'Đối tượng nộp tiền'} rules={[{ required: true, message: 'Hãy chọn loại đối tượng.' }]}>
            <Select
              showSearch
              onChange={(value: string) => {
                setPartyRefValue(value);
                if (value === 'other') { form.setFieldsValue({ recipientOrPayer: '' }); return; }
                if (value.startsWith('contact:')) {
                  const contact = contacts.find(item => item.key === value.split(':')[2]);
                  form.setFieldsValue({ recipientOrPayer: contact?.name || '' });
                } else if (value.startsWith('employee:')) {
                  const employeeCode = value.slice('employee:'.length);
                  const employee = employees.find(item => (item.employeeCode || item.code) === employeeCode);
                  form.setFieldsValue({ recipientOrPayer: employee?.name || employee?.fullName || '' });
                }
              }}
              options={partyOptionsFor(form.getFieldValue('type'))}
            />
          </Form.Item>
          {partyRefValue === 'other' && (
            <Form.Item name="recipientOrPayer" label={activeVoucherType === 'Chi' ? 'Người nhận tiền' : 'Người nộp tiền'} rules={[{ required: true, whitespace: true, message: 'Hãy nhập tên người nộp hoặc nhận.' }]}>
              <Input placeholder={activeVoucherType === 'Chi' ? 'Nhập tên người nhận tiền' : 'Nhập tên người nộp tiền'} />
            </Form.Item>
          )}

          <Form.Item name="status" label="Trạng thái phê duyệt" rules={[{ required: true }]}>
            <Select
              disabled={Boolean(editingTransaction)}
              options={[
                { label: 'Đã hoàn thành', value: 'Đã hoàn thành' },
                { label: 'Chờ duyệt', value: 'Chờ duyệt' },
              ]}
            />
          </Form.Item>

          <Form.Item name="department" label="Phòng ban (nếu có)">
            <Input placeholder="Chọn hoặc nhập phòng ban liên quan" />
          </Form.Item>

          <Form.Item name="note" label="Ghi chú / Số chứng từ liên quan">
            <Input.TextArea rows={2} placeholder="Ghi số hóa đơn, hợp đồng hoặc nội dung cần đối chiếu" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={closeForm}>Đóng</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingTransaction ? 'Lưu thay đổi' : `Lập phiếu ${activeVoucherType === 'Chi' ? 'chi' : 'thu'}`}
            </Button>
          </div>
        </Form>
      </Modal>

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
