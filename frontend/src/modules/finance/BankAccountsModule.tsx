import React, { useState, useEffect } from 'react';
import {
  useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  BankOutlined,
  SwapOutlined,
  ClockCircleOutlined,
  UploadOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { FileUploadDialog } from '../../components/FileUploadDialog';
import { Modal, Form, Input, Select, Button, message, Card, Tag, Switch } from '../../custom-ui';
import { financeBankAccountsApi, FinanceBankAccount, financeCashApi, FinanceCashTransaction } from '../../api/endpoints';

export const BankAccountsModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isTransactions = currentPath === '/finance/cash/bank/transactions';
  const isStatements = currentPath === '/finance/cash/bank/statements';
  const isEBanking = currentPath === '/finance/cash/bank/e-banking';
  const isAccounts = !isTransactions && !isStatements && !isEBanking;

  const [data, setData] = useState<FinanceBankAccount[]>([]);
  const [transactions, setTransactions] = useState<FinanceCashTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [statementPickerOpen, setStatementPickerOpen] = useState(false);
  const [form] = Form.useForm();
  const [transferForm] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [accountsResponse, transactionsResponse] = await Promise.all([
        financeBankAccountsApi.getAll(),
        financeCashApi.getAll('bank'),
      ]);
      setData(accountsResponse.data.data);
      setTransactions(transactionsResponse.data.data);
    } catch (error: any) {
      setData([]);
      setTransactions([]);
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
  const totalBalance = data.reduce((sum, item) => sum + item.balance, 0) + ledgerBalance;
  const accountSummaries = Array.from(
    completedBankTransactions.reduce((map, item) => {
      const current = map.get(item.account) || { key: item.account, account: item.account, income: 0, expense: 0, balance: 0 };
      if (item.type === 'Thu') current.income += item.amount;
      else current.expense += item.amount;
      current.balance = current.income - current.expense;
      map.set(item.account, current);
      return map;
    }, new Map<string, { key: string; account: string; income: number; expense: number; balance: number }>()),
    ([, value]) => value,
  );

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

  const handleTransfer = () => {
    message.warning('Chưa có API chuyển khoản nội bộ và đối soát ngân hàng thật, nên chưa thực hiện giao dịch.');
  };

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
      render: (val: number) => (
        <span style={{ fontWeight: 700, fontSize: 14.5, color: '#2E7D32' }}>
          {val.toLocaleString('vi-VN')} ₫
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
      <FileUploadDialog open={statementPickerOpen} onClose={() => setStatementPickerOpen(false)} onSelect={(files) => message.success(`Đã chọn ${files.length} tệp sao kê để xử lý.`)} title="Chọn sao kê ngân hàng" accept=".xlsx,.xls,.csv,.mt940,.txt" confirmText="Tải lên sao kê" />
      {/* KPI Total Balance */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16, marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số dư tiền gửi tất cả tài khoản ngân hàng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalBalance.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<SwapOutlined />} onClick={() => setTransferModalOpen(true)}>
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
                  (d.bankName || '').toLowerCase().includes((searchText || '').toLowerCase()) || 
                  (d.accountNumber || '').includes(searchText || '') ||
                  (d.accountHolder || '').toLowerCase().includes((searchText || '').toLowerCase())
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
            <Button icon={<DownloadOutlined />} onClick={() => message.warning('Chưa có dịch vụ xuất Excel thật cho sổ tiền gửi.')}>
              Xuất sổ tiền gửi
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={transactions.filter(
                (t) =>
                  t.code.toLowerCase().includes(searchText.toLowerCase()) ||
                  t.recipientOrPayer.toLowerCase().includes(searchText.toLowerCase()) ||
                  t.category.toLowerCase().includes(searchText.toLowerCase()) ||
                  t.account.toLowerCase().includes(searchText.toLowerCase())
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
              <div style={{ fontSize: 12.5, color: '#166534', fontWeight: 600 }}>Sao kê ngân hàng thật</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
                Chưa có
              </div>
            </div>
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 12.5, color: '#1E40AF', fontWeight: 600 }}>Chênh lệch đối soát</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
                Cần sao kê để đối chiếu
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh sách bản sao kê &amp; Biên bản đối soát số dư</h3>
            <Button icon={<UploadOutlined />} onClick={() => setStatementPickerOpen(true)}>
              Tải lên sao kê ngân hàng
            </Button>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={accountSummaries}
              columns={[
                { title: 'Tài khoản ngân hàng', dataIndex: 'account', key: 'account', render: (value: string) => <strong>{value}</strong> },
                { title: 'Tổng thu', dataIndex: 'income', key: 'income', render: (value: number) => <span style={{ color: '#16A34A', fontWeight: 700 }}>{value.toLocaleString('vi-VN')} ₫</span> },
                { title: 'Tổng chi', dataIndex: 'expense', key: 'expense', render: (value: number) => <span style={{ color: '#DC2626', fontWeight: 700 }}>{value.toLocaleString('vi-VN')} ₫</span> },
                { title: 'Phát sinh ròng', dataIndex: 'balance', key: 'balance', render: (value: number) => <strong>{value.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Sao kê ngân hàng', key: 'statement', render: () => <Tag color="default">Chưa tải lên</Tag> },
                { title: 'Đối soát', key: 'status', render: () => <Tag color="warning">Chưa đối chiếu</Tag> },
              ]}
              locale={{ emptyText: 'Chưa có phát sinh ngân hàng để tổng hợp.' }}
            />
          </div>
        </div>
      )}

      {/* VIEW 4: E-BANKING (Tích hợp & Kết nối Ngân hàng điện tử) */}
      {isEBanking && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 880 }}>
          <Card title="Cổng Kết Nối Open Banking API Doanh Nghiệp" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { bank: 'Vietcombank Corporate API', status: 'Chưa cấu hình', desc: 'Thiếu Client ID, Secret và webhook xác nhận giao dịch.', icon: <ClockCircleOutlined style={{ color: '#94A3B8' }} /> },
                { bank: 'BIDV iBank Direct Gateway', status: 'Chưa cấu hình', desc: 'Chưa có thông tin sandbox/production được cấp quyền.', icon: <ClockCircleOutlined style={{ color: '#94A3B8' }} /> },
                { bank: 'Techcombank Business API', status: 'Chưa cấu hình', desc: 'Chưa có webhook biến động số dư thật.', icon: <ClockCircleOutlined style={{ color: '#94A3B8' }} /> },
                { bank: 'MB Bank Corporate Gateway', status: 'Chưa cấu hình', desc: 'Chưa cấu hình Secret Key OAuth2.', icon: <ClockCircleOutlined style={{ color: '#94A3B8' }} /> },
              ].map((eb, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '14px 16px', borderRadius: 8, border: '1px solid #E2E8F0' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A' }}>
                      {eb.icon} {eb.bank}
                    </div>
                    <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 4 }}>{eb.desc}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Tag color="default">{eb.status}</Tag>
                    <Switch defaultChecked={false} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={() => message.warning('Chưa có thông tin kết nối ngân hàng để kiểm tra thật.')}>Kiểm tra kết nối</Button>
              <Button type="primary" onClick={() => message.warning('Chưa có API lưu cấu hình ngân hàng ở backend.')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Lưu cấu hình API
              </Button>
            </div>
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
            <Input placeholder="Ví dụ: Ngân hàng TMCP Ngoại Thương VN (Vietcombank)" />
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
          <Form.Item name="fromAccount" label="Tài khoản nguồn (Trích tiền)" initialValue={data[0]?.bankName || ''}>
            <Select options={(data || []).filter(d => d != null).map((d) => ({ label: `${d.bankName || 'Ngân hàng'} (${d.accountNumber || ''})`, value: d.bankName || '' }))} />
          </Form.Item>
          <Form.Item name="toAccount" label="Tài khoản đích (Nhận tiền)" initialValue={data[1]?.bankName || ''}>
            <Select options={(data || []).filter(d => d != null).map((d) => ({ label: `${d.bankName || 'Ngân hàng'} (${d.accountNumber || ''})`, value: d.bankName || '' }))} />
          </Form.Item>
          <Form.Item name="amount" label="Số tiền chuyển (VNĐ)" rules={[{ required: true, message: 'Nhập số tiền' }]}>
            <Input type="number" min={10000} step={1000000} />
          </Form.Item>
          <Form.Item name="note" label="Nội dung điều chuyển" initialValue="Điều chuyển dòng tiền nội bộ phục vụ thanh toán hợp đồng">
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setTransferModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận chuyển khoản
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
