import React, { useState, useEffect, useRef } from 'react';
import {
  useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  BankOutlined,
  SwapOutlined,
  UploadOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { FileUploadDialog } from '../../components/FileUploadDialog';
import { Modal, Form, Input, Select, Button, message, Card, Tag, Alert } from '../../custom-ui';
import { financeBankAccountsApi, FinanceBankAccount, financeBankStatementsApi, FinanceBankStatement, financeCashApi, FinanceCashTransaction, financeTransfersApi } from '../../api/endpoints';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import { bankStatementLineFingerprint, ImportedBankStatementLine, parseBankStatementFile } from './bankStatementImport';

const markStatementDuplicates = (
  lines: ImportedBankStatementLine[],
  accountId: string,
  importedStatements: FinanceBankStatement[],
) => {
  const existing = new Set(importedStatements
    .filter((statement) => statement.bankAccountId === accountId)
    .flatMap((statement) => statement.lines.map(bankStatementLineFingerprint)));
  const seen = new Set<string>();
  return lines.map((line) => {
    const fingerprint = bankStatementLineFingerprint(line);
    const duplicate = existing.has(fingerprint) || seen.has(fingerprint);
    seen.add(fingerprint);
    return { ...line, duplicate };
  });
};

export const BankAccountsModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isTransactions = currentPath === '/finance/cash/bank/transactions';
  const isStatements = currentPath === '/finance/cash/bank/statements';
  const isEBanking = currentPath === '/finance/cash/bank/e-banking';
  const isAccounts = !isTransactions && !isStatements && !isEBanking;

  const [data, setData] = useState<FinanceBankAccount[]>([]);
  const [transactions, setTransactions] = useState<FinanceCashTransaction[]>([]);
  const [statementImports, setStatementImports] = useState<FinanceBankStatement[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [statementPickerOpen, setStatementPickerOpen] = useState(false);
  const [statementPreview, setStatementPreview] = useState<{ fileName: string; fileHash: string; lines: ImportedBankStatementLine[] } | null>(null);
  const [statementAccountId, setStatementAccountId] = useState('');
  const [statementCurrency, setStatementCurrency] = useState('VND');
  const [statementOpeningBalance, setStatementOpeningBalance] = useState('');
  const [statementClosingBalance, setStatementClosingBalance] = useState('');
  const [savingStatement, setSavingStatement] = useState(false);
  const [form] = Form.useForm();
  const [transferForm] = Form.useForm();
  const [transferring, setTransferring] = useState(false);
  const transferRequestId = useRef('');
  const transferPending = useRef(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [accountsResponse, transactionsResponse, statementsResponse] = await Promise.all([
        financeBankAccountsApi.getAll(),
        financeCashApi.getAll('bank'),
        financeBankStatementsApi.getAll(),
      ]);
      setData(accountsResponse.data.data);
      setTransactions(transactionsResponse.data.data);
      setStatementImports(statementsResponse.data.data);
    } catch (error: any) {
      setData([]);
      setTransactions([]);
      setStatementImports([]);
      message.error(error?.response?.data?.message || 'Không tải được dữ liệu ngân hàng.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const completedBankTransactions = transactions.filter((item) => item.status === 'Đã hoàn thành');
  const ledgerBalance = completedBankTransactions.reduce((sum, item) => sum + (item.type === 'Thu' ? item.amount : -item.amount), 0);
  const totalBalance = data.reduce((sum, item) => sum + (item.currentBalance ?? item.balance), 0);
  const importedStatementLines = statementImports.reduce((sum, statement) => sum + statement.lines.length, 0);

  useEffect(() => {
    if (!statementAccountId) setStatementAccountId(data.find((account) => account.status === 'Đang hoạt động')?.key || '');
  }, [data, statementAccountId]);

  const handleCreate = async (values: any) => {
    try {
      await financeBankAccountsApi.create({
        ...values,
        balance: Number(values.balance) || 0,
        status: 'Đang hoạt động',
      });
      message.success(`Đã thêm tài khoản ngân hàng: ${values.bankName}`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể thêm tài khoản ngân hàng.');
    }
  };

  const handleTransfer = async (values: any) => {
    if (transferPending.current) return;
    const amt = Number(values.amount);
    if (!Number.isSafeInteger(amt) || amt <= 0) {
      message.error('Vui lòng nhập số tiền chuyển hợp lệ.');
      return;
    }
    if (values.fromAccount === values.toAccount) {
      message.error('Tài khoản nguồn và tài khoản đích không được trùng nhau.');
      return;
    }
    transferPending.current = true;
    setTransferring(true);
    try {
      transferRequestId.current ||= crypto.randomUUID();
      await financeTransfersApi.create({
        requestId: transferRequestId.current,
        sourceAccountId: values.fromAccount,
        destinationAccountId: values.toAccount,
        amount: amt,
        transferDate: new Date().toISOString().slice(0, 10),
        purpose: values.note,
        transferMethod: 'Ghi sổ nội bộ',
      });
      message.success(`Đã ghi sổ điều chuyển nội bộ ${amt.toLocaleString('vi-VN')} ₫.`);
      setTransferModalOpen(false);
      transferForm.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể thực hiện chuyển tiền nội bộ.');
    } finally {
      transferPending.current = false;
      setTransferring(false);
    }
  };

  const handleStatementFiles = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    try {
      const parsed = await parseBankStatementFile(file);
      const lines = markStatementDuplicates(parsed.lines, statementAccountId, statementImports);
      setStatementPreview({ fileName: file.name, fileHash: parsed.fileHash, lines });
      setStatementCurrency('VND');
      setStatementOpeningBalance('');
      setStatementClosingBalance('');
    } catch (error: any) {
      message.error(error?.message || 'Không thể đọc tệp sao kê.');
    }
  };

  const saveStatement = async () => {
    if (!statementPreview || !statementAccountId) {
      message.error('Chọn tài khoản ngân hàng trước khi nhập sao kê.');
      return;
    }
    const openingBalance = statementOpeningBalance.trim() === '' ? undefined : Number(statementOpeningBalance);
    const closingBalance = statementClosingBalance.trim() === '' ? undefined : Number(statementClosingBalance);
    if ([openingBalance, closingBalance].some((value) => value !== undefined && (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER / 100 || (statementCurrency === 'VND' && !Number.isSafeInteger(value))))) {
      message.error('Số dư đầu kỳ hoặc cuối kỳ không hợp lệ.');
      return;
    }
    setSavingStatement(true);
    const key = `statement-${statementAccountId}-${statementPreview.fileHash}`;
    try {
      await financeBankStatementsApi.create({
        key,
        bankAccountId: statementAccountId,
        fileHash: statementPreview.fileHash,
        fileName: statementPreview.fileName,
        currency: statementCurrency,
        openingBalance,
        closingBalance,
        lines: statementPreview.lines.map((line) => ({ ...line, currency: statementCurrency })),
        importedAt: new Date().toISOString(),
        importedBy: '',
        status: 'Đã nhập · chưa đối soát',
      });
      message.success(`Đã nhập ${statementPreview.lines.length} giao dịch từ sao kê. Chưa tạo bút toán kế toán.`);
      setStatementPreview(null);
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu sao kê.');
    } finally {
      setSavingStatement(false);
    }
  };

  const exportStatement = (statement: FinanceBankStatement) => downloadFile(
    `sao_ke_${statement.fileName.replace(/[^a-z0-9._-]/gi, '_')}.xlsx`,
    generateValidXlsxBlob([
      ['Ngày giao dịch', 'Ngày giá trị', 'Loại', 'Số tiền', 'Tiền tệ', 'Số dư sau giao dịch', 'Nội dung', 'Đối tác', 'Tài khoản đối tác', 'Mã tham chiếu', 'Mã giao dịch', 'Trùng giao dịch'],
      ...statement.lines.map((line) => [line.transactionDate, line.valueDate, line.direction, line.amount, line.currency, line.balance ?? '', line.description, line.counterparty, line.counterpartyAccount, line.reference, line.transactionId, line.duplicate ? 'Có' : 'Không']),
    ]),
  );

  const columns = [
    {
      title: 'Ngân hàng',
      dataIndex: 'bankName',
      key: 'bankName',
      render: (name: string) => (
        <span style={{ fontWeight: 600, color: '#212121', display: 'flex', alignItems: 'center', gap: 6 }}>
          <BankOutlined style={{ color: '#009688' }} />
          {name}
        </span>
      ),
    },
    {
      title: 'Số tài khoản',
      dataIndex: 'accountNumber',
      key: 'accountNumber',
      render: (acc: string) => <span style={{ fontWeight: 600, color: '#009688', fontSize: 13.5 }}>{acc}</span>,
    },
    {
      title: 'Chủ tài khoản',
      dataIndex: 'accountHolder',
      key: 'accountHolder',
      render: (holder: string) => <span style={{ color: '#374151', fontSize: 12.5 }}>{holder}</span>,
    },
    {
      title: 'Chi nhánh mở',
      dataIndex: 'branch',
      key: 'branch',
      render: (b: string) => <span style={{ color: '#757575' }}>{b}</span>,
    },
    {
      title: 'Số dư khả dụng',
      dataIndex: 'balance',
      key: 'balance',
      render: (val: number, record: FinanceBankAccount) => (
        <span style={{ fontWeight: 700, fontSize: 14.5, color: '#2E7D32' }}>
          {(record.currentBalance ?? val).toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color="success">
          {status}
        </Tag>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <FileUploadDialog open={statementPickerOpen} onClose={() => setStatementPickerOpen(false)} onSelect={(files) => { setStatementPickerOpen(false); void handleStatementFiles(files); }} title="Chọn sao kê ngân hàng" accept=".xlsx,.xls,.csv" confirmText="Xem trước sao kê" multiple={false} />
      <Modal
        title="Xem trước sao kê ngân hàng"
        open={Boolean(statementPreview)}
        onCancel={() => setStatementPreview(null)}
        footer={null}
        width={1180}
        style={{ top: 50, maxWidth: '96vw' }}
      >
        {statementPreview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Alert type="info" showIcon message="Dữ liệu chỉ được lưu để đối chiếu. Nhập sao kê không tạo giao dịch tiền gửi hoặc bút toán kế toán." />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
              <div>
                <div style={{ marginBottom: 6 }}>Tài khoản ngân hàng</div>
                <Select
                  value={statementAccountId || undefined}
                  onChange={(accountId) => {
                    setStatementAccountId(accountId);
                    setStatementPreview((preview) => preview ? { ...preview, lines: markStatementDuplicates(preview.lines, accountId, statementImports) } : preview);
                  }}
                  placeholder="Chọn tài khoản"
                  options={data.filter((account) => account.status === 'Đang hoạt động').map((account) => ({ label: `${account.bankName} · ${account.accountNumber}`, value: account.key }))}
                  style={{ width: '100%' }}
                />
              </div>
              <div>
                <div style={{ marginBottom: 6 }}>Tiền tệ</div>
                <Select value={statementCurrency} onChange={setStatementCurrency} style={{ width: '100%' }} options={['VND', 'USD', 'EUR', 'JPY', 'CNY'].map((currency) => ({ label: currency, value: currency }))} />
              </div>
              <div>
                <div style={{ marginBottom: 6 }}>Số dư đầu kỳ</div>
                <Input type="number" value={statementOpeningBalance} onChange={(event) => setStatementOpeningBalance(event.target.value)} placeholder="Không bắt buộc" />
              </div>
              <div>
                <div style={{ marginBottom: 6 }}>Số dư cuối kỳ</div>
                <Input type="number" value={statementClosingBalance} onChange={(event) => setStatementClosingBalance(event.target.value)} placeholder="Không bắt buộc" />
              </div>
            </div>
            <div style={{ color: '#64748B' }}>
              Tệp: {statementPreview.fileName} · {statementPreview.lines.length.toLocaleString('vi-VN')} giao dịch · {statementPreview.lines.filter((line) => line.duplicate).length.toLocaleString('vi-VN')} dòng trùng
            </div>
            <div className="transparent-table-card">
              <KTable
                dataSource={statementPreview.lines.map((line, index) => ({ ...line, key: `${index}` }))}
                pagination={{ pageSize: 10 }}
                scroll={{ x: 1200 }}
                columns={[
                  { title: 'Ngày giao dịch', dataIndex: 'transactionDate', key: 'transactionDate' },
                  { title: 'Loại', dataIndex: 'direction', key: 'direction', render: (value: string) => value === 'Thu' ? 'Tiền vào' : 'Tiền ra' },
                  { title: 'Số tiền', dataIndex: 'amount', key: 'amount', render: (value: number) => value.toLocaleString('vi-VN') },
                  { title: 'Số dư', dataIndex: 'balance', key: 'balance', render: (value?: number) => value == null ? '—' : value.toLocaleString('vi-VN') },
                  { title: 'Nội dung', dataIndex: 'description', key: 'description' },
                  { title: 'Đối tác', dataIndex: 'counterparty', key: 'counterparty' },
                  { title: 'Mã tham chiếu', dataIndex: 'reference', key: 'reference' },
                  { title: 'Trùng', dataIndex: 'duplicate', key: 'duplicate', render: (value: boolean) => <Tag color={value ? 'warning' : 'default'}>{value ? 'Có' : 'Không'}</Tag> },
                ]}
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={() => setStatementPreview(null)}>Hủy</Button>
              <Button type="primary" loading={savingStatement} onClick={() => void saveStatement()} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu sao kê</Button>
            </div>
          </div>
        )}
      </Modal>
      {/* KPI Total Balance */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số dư tiền gửi tất cả tài khoản ngân hàng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalBalance.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<SwapOutlined />} onClick={() => {
            transferForm.resetFields();
            transferRequestId.current = crypto.randomUUID();
            transferForm.setFieldsValue({ fromAccount: data[0]?.key, toAccount: data[1]?.key });
            setTransferModalOpen(true);
          }}>
            Chuyển tiền nội bộ
          </Button>
          {isAccounts && (
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields();
                setModalOpen(true);
              }}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Thêm tài khoản mới
            </Button>
          )}
        </div>
      </div>

      {/* VIEW 1: ACCOUNTS LIST */}
      {isAccounts && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo tên ngân hàng, số tài khoản..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 320, borderRadius: 6 }}
              allowClear
            />
          </div>
          <div className="transparent-table-card" style={{ width: '100%' }}>
            <KTable
              dataSource={(data || []).filter(d => 
                d != null && (
                  (d?.bankName || '').toLowerCase().includes((searchText || '').toLowerCase()) || 
                  (d?.accountNumber || '').includes(searchText || '') ||
                  (d?.accountHolder || '').toLowerCase().includes((searchText || '').toLowerCase())
                )
              )}
              columns={columns}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* VIEW 2: TRANSACTIONS (Lịch sử giao dịch ngân hàng) */}
      {isTransactions && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo mã FT, đối tác, nội dung chuyển tiền..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 340, borderRadius: 6 }}
              allowClear
            />
            <Button icon={<DownloadOutlined />} onClick={() => downloadFile('So_tien_gui.xlsx', generateValidXlsxBlob([
              ['Mã chứng từ', 'Tài khoản', 'Loại', 'Số tiền (VNĐ)', 'Đối tác', 'Nội dung', 'Ngày', 'Trạng thái'],
              ...transactions.filter(item => !searchText || [item.code, item.account, item.recipientOrPayer, item.category].some(value => value.toLowerCase().includes(searchText.toLowerCase())))
                .map(item => [item.code, item.account, item.type, item.amount, item.recipientOrPayer, item.category, item.date, item.status]),
            ]))}>
              Xuất sổ tiền gửi
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={transactions.filter(
                (t) =>
                  !searchText ||
                  (t.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
                  (t.recipientOrPayer || '').toLowerCase().includes(searchText.toLowerCase()) ||
                  (t.category || '').toLowerCase().includes(searchText.toLowerCase()) ||
                  (t.account || '').toLowerCase().includes(searchText.toLowerCase())
              )}
              loading={loading}
              columns={[
                { title: 'Mã chứng từ', dataIndex: 'code', key: 'code', render: (c: string) => <code>{c}</code> },
                { title: 'Tài khoản ngân hàng', dataIndex: 'account', key: 'account', render: (acc: string) => <strong>{acc}</strong> },
                { title: 'Loại GD', dataIndex: 'type', key: 'type', render: (t: string) => <Tag color={t === 'Thu' ? 'success' : 'error'}>{t === 'Thu' ? 'Thu tiền vào' : 'Chi tiền ra'}</Tag> },
                { title: 'Số tiền', dataIndex: 'amount', key: 'amount', render: (val: number, r: FinanceCashTransaction) => <strong style={{ color: r.type === 'Thu' ? '#16A34A' : '#DC2626', fontSize: 13.5 }}>{r.type === 'Thu' ? '+' : '-'}{val.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Đối tác / Người thụ hưởng', dataIndex: 'recipientOrPayer', key: 'recipientOrPayer', render: (p: string) => <span style={{ color: '#1E293B', fontWeight: 500 }}>{p}</span> },
                { title: 'Nội dung giao dịch', dataIndex: 'category', key: 'category' },
                { title: 'Ngày hạch toán', dataIndex: 'date', key: 'date', render: (d: string) => <span style={{ fontSize: 12, color: '#64748B' }}>{d}</span> },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag icon={s === 'Đã hoàn thành' ? <CheckOutlined /> : undefined} color={s === 'Đã hoàn thành' ? 'success' : s === 'Đã hủy' ? 'error' : 'warning'}>{s}</Tag> },
              ]}
              locale={{ emptyText: 'Chưa có giao dịch ngân hàng từ sổ thu chi.' }}
            />
          </div>
        </div>
      )}

      {/* VIEW 3: STATEMENTS (Sao kê & Đối chiếu số dư) */}
      {isStatements && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 600 }}>Phát sinh theo sổ thu/chi ngân hàng</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {ledgerBalance.toLocaleString('vi-VN')} ₫
              </div>
            </div>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12.5, color: '#166534', fontWeight: 600 }}>Sao kê đã nhập</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{statementImports.length} tệp · {importedStatementLines} giao dịch</div>
            </div>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12.5, color: '#1E40AF', fontWeight: 600 }}>Chênh lệch đối soát</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
                Chưa đối chiếu
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Sao kê đã nhập</h3>
            <Button icon={<UploadOutlined />} onClick={() => setStatementPickerOpen(true)}>
              Tải lên sao kê ngân hàng
            </Button>
          </div>

          <Alert type="info" showIcon message="Hiện chưa có kết nối API ngân hàng đã xác minh. Có thể nhập sao kê CSV, XLS hoặc XLSX để xem và chuẩn bị đối chiếu. Các dòng nhập chưa được khớp chứng từ kế toán." />
          <div className="transparent-table-card">
            <KTable
              dataSource={statementImports.map((statement) => ({ ...statement, key: statement.key }))}
              columns={[
                { title: 'Tài khoản ngân hàng', dataIndex: 'bankAccountId', key: 'bankAccountId', render: (value: string) => { const account = data.find((item) => item.key === value); return account ? `${account.bankName} · ${account.accountNumber}` : 'Tài khoản không còn hoạt động'; } },
                { title: 'Tệp sao kê', dataIndex: 'fileName', key: 'fileName' },
                { title: 'Giao dịch', dataIndex: 'lines', key: 'lineCount', render: (lines: FinanceBankStatement['lines']) => lines.length.toLocaleString('vi-VN') },
                { title: 'Dòng trùng', dataIndex: 'lines', key: 'duplicates', render: (lines: FinanceBankStatement['lines']) => lines.filter((line) => line.duplicate).length.toLocaleString('vi-VN') },
                { title: 'Tiền tệ', dataIndex: 'currency', key: 'currency' },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (status: string) => <Tag color="warning">{status}</Tag> },
                { title: 'Thao tác', key: 'action', render: (_: unknown, record: FinanceBankStatement) => <Button onClick={() => exportStatement(record)}>Xuất Excel</Button> },
              ]}
              pagination={{ pageSize: 10 }}
              locale={{ emptyText: 'Chưa nhập sao kê ngân hàng.' }}
            />
          </div>
        </div>
      )}

      {/* VIEW 4: E-BANKING (Tích hợp & Kết nối Ngân hàng điện tử) */}
      {isEBanking && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 880 }}>
          <Card title="Kết nối ngân hàng điện tử">
            <Alert
              type="warning"
              showIcon
              message="Chưa có tích hợp API ngân hàng được xác minh trong hệ thống."
              description="Không có kết nối trực tiếp hoặc môi trường sandbox ngân hàng đang hoạt động. Để tránh hiển thị cấu hình giả, trang này chưa cung cấp nút bật kết nối. Bạn có thể nhập sao kê CSV, XLS hoặc XLSX tại mục Sao kê để lưu dữ liệu chờ đối chiếu."
            />
          </Card>
        </div>
      )}

      {/* Modal Add Bank Account */}
      <Modal
        title="Thêm tài khoản ngân hàng doanh nghiệp mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item name="bankName" label="Tên ngân hàng" rules={[{ required: true, message: 'Nhập tên ngân hàng' }]}>
            <Input placeholder="Ví dụ: Ngân hàng TMCP Ngoại Thương VN" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="accountNumber" label="Số tài khoản" rules={[{ required: true, message: 'Nhập số tài khoản' }]}>
              <Input placeholder="0011 0042 8888" />
            </Form.Item>
            <Form.Item name="balance" label="Số dư ban đầu (VNĐ)" initialValue={1000000000}>
              <Input type="number" min={0} step={10000000} />
            </Form.Item>
          </div>
          <Form.Item name="accountHolder" label="Tên chủ tài khoản" initialValue="CONG TY CP CONG NGHE KIYOVN" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="branch" label="Chi nhánh mở tài khoản" initialValue="Sở Giao Dịch Hà Nội">
            <Input />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Thêm tài khoản
            </Button>
          </div>
        </Form>
      </Modal>

      {/* Modal Internal Transfer */}
      <Modal
        title="Chuyển tiền nội bộ giữa các tài khoản"
        open={transferModalOpen}
        onCancel={() => setTransferModalOpen(false)}
        footer={null}
        width={480}
      >
        <Form form={transferForm} layout="vertical" onFinish={handleTransfer} style={{ marginTop: 16 }}>
          <p>Ghi nhận điều chuyển vào sổ quỹ sau khi giao dịch thực tế đã được thực hiện.</p>
          <Form.Item name="fromAccount" label="Tài khoản nguồn" rules={[{ required: true }]}>
            <Select options={data.filter(d => d.status === 'Đang hoạt động').map(d => ({ label: `${d.bankName} (${d.accountNumber})`, value: d.key }))} />
          </Form.Item>
          <Form.Item name="toAccount" label="Tài khoản đích" rules={[{ required: true }]}>
            <Select options={data.filter(d => d.status === 'Đang hoạt động').map(d => ({ label: `${d.bankName} (${d.accountNumber})`, value: d.key }))} />
          </Form.Item>
          <Form.Item name="amount" label="Số tiền chuyển (VNĐ)" rules={[{ required: true, message: 'Nhập số tiền' }]}>
            <Input type="number" min={1} step={1} />
          </Form.Item>
          <Form.Item name="note" label="Nội dung điều chuyển" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setTransferModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={transferring} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận ghi sổ điều chuyển
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
