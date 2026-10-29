import React, { useEffect, useMemo, useState } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Input, Select, Tag, message } from '../../custom-ui';
import { financeCashApi, financePaymentsApi, FinanceCashTransaction, FinancePaymentAccount } from '../../api/endpoints';

const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 8)}01`;
const money = (amount: number) => `${amount.toLocaleString('vi-VN')} ₫`;

export const CashCountModule: React.FC = () => {
  const [transactions, setTransactions] = useState<FinanceCashTransaction[]>([]);
  const [accounts, setAccounts] = useState<FinancePaymentAccount[]>([]);
  const [accountKey, setAccountKey] = useState('all');
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cashResponse, accountResponse] = await Promise.all([
        financeCashApi.getAll('petty'),
        financePaymentsApi.getAccounts(),
      ]);
      setTransactions(cashResponse.data.data);
      setAccounts(accountResponse.data.accounts.filter((account) => account.source === 'petty'));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được dữ liệu kiểm kê quỹ tiền mặt.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const filtered = useMemo(() => transactions.filter((item) => {
    const date = String(item.date || '').slice(0, 10);
    const matchesAccount = accountKey === 'all' || item.sourceAccountId === accountKey || item.account === accounts.find((account) => account.key === accountKey)?.name;
    return matchesAccount && (!from || date >= from) && (!to || date <= to);
  }), [transactions, accountKey, accounts, from, to]);
  const completed = filtered.filter((item) => item.status === 'Đã hoàn thành');
  const incoming = completed.filter((item) => item.type === 'Thu').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const outgoing = completed.filter((item) => item.type === 'Chi').reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const selectedAccount = accounts.find((account) => account.key === accountKey);

  const columns = [
    { title: 'Ngày', dataIndex: 'date', key: 'date', width: 120, render: (value: string) => value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('vi-VN') : '—' },
    { title: 'Số chứng từ', dataIndex: 'code', key: 'code', width: 150 },
    { title: 'Nội dung', dataIndex: 'category', key: 'category' },
    { title: 'Người nộp / nhận', dataIndex: 'recipientOrPayer', key: 'recipientOrPayer' },
    { title: 'Quỹ', dataIndex: 'account', key: 'account', width: 170 },
    { title: 'Loại', dataIndex: 'type', key: 'type', width: 90, render: (value: string) => <Tag color={value === 'Thu' ? 'success' : 'error'}>{value}</Tag> },
    { title: 'Số tiền', dataIndex: 'amount', key: 'amount', width: 150, align: 'right' as const, render: (value: number) => money(Number(value || 0)) },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 140, render: (value: string) => <Tag color={value === 'Đã hoàn thành' ? 'success' : value === 'Chờ duyệt' ? 'warning' : 'default'}>{value}</Tag> },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, color: '#0F172A', fontSize: 20 }}>Kiểm kê quỹ tiền mặt</h1>
          <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Đối chiếu các khoản thu, chi quỹ đã hoàn thành trong kỳ.</div>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
      </div>

      <div style={{ display: 'flex', alignItems: 'end', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <label style={{ display: 'grid', gap: 4, minWidth: 220, color: '#475569', fontSize: 12 }}>Quỹ tiền mặt
          <Select value={accountKey} onChange={setAccountKey} options={[{ label: 'Tất cả quỹ tiền mặt', value: 'all' }, ...accounts.map((account) => ({ label: account.name, value: account.key }))]} style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: 12 }}>Từ ngày<Input type="date" value={from} onChange={(event: any) => setFrom(event.target.value)} /></label>
        <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: 12 }}>Đến ngày<Input type="date" value={to} onChange={(event: any) => setTo(event.target.value)} /></label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 14 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}><div style={{ color: '#64748B', fontSize: 12.5 }}>Tổng thu đã hoàn thành</div><strong style={{ display: 'block', color: '#16A34A', fontSize: 22, marginTop: 4 }}>{money(incoming)}</strong></div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}><div style={{ color: '#64748B', fontSize: 12.5 }}>Tổng chi đã hoàn thành</div><strong style={{ display: 'block', color: '#DC2626', fontSize: 22, marginTop: 4 }}>{money(outgoing)}</strong></div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}><div style={{ color: '#64748B', fontSize: 12.5 }}>Thuần trong kỳ</div><strong style={{ display: 'block', color: incoming >= outgoing ? '#009688' : '#DC2626', fontSize: 22, marginTop: 4 }}>{money(incoming - outgoing)}</strong></div>
        {selectedAccount && <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}><div style={{ color: '#64748B', fontSize: 12.5 }}>Số dư sổ quỹ hiện tại</div><strong style={{ display: 'block', color: '#0F172A', fontSize: 22, marginTop: 4 }}>{money(selectedAccount.balance)}</strong></div>}
      </div>

      <KTable dataSource={filtered} columns={columns} loading={loading} rowKey="key" pagination={{ pageSize: 10 }} />
      {!loading && filtered.length === 0 && <div style={{ marginTop: 10, color: '#64748B', fontSize: 13 }}>Không có chứng từ quỹ tiền mặt trong kỳ đã chọn.</div>}
    </div>
  );
};
