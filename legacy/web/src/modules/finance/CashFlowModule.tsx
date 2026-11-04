import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, DatePicker, Select, Tag, message } from '../../custom-ui';
import { crmContactsApi, CrmContact, financeOverviewApi, FinanceOverviewSummary } from '../../api/endpoints';
import { FinanceOverviewPeriod, getFinanceOverviewDateRange } from './financeOverviewRules';

type CashFlowRow = FinanceOverviewSummary['cash']['flows'][number] & { key: string; net: number };

const formatMoney = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;
const todayInVietnam = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

const emptySummary: FinanceOverviewSummary = {
  cash: { income: 0, expense: 0, pending: 0, categories: [], monthly: [], flows: [], accounts: [] },
  documents: { receivable: 0, overdueReceivable: 0, payable: 0, overduePayable: 0, sales: 0, purchases: 0 },
};

const periodOptions: Array<{ label: string; value: FinanceOverviewPeriod }> = [
  { label: 'Tất cả thời gian', value: 'all' },
  { label: 'Hôm nay', value: 'day' },
  { label: 'Tuần này', value: 'week' },
  { label: 'Tháng này', value: 'month' },
  { label: 'Quý này', value: 'quarter' },
  { label: 'Năm nay', value: 'year' },
  { label: 'Tùy chọn', value: 'custom' },
];

export const CashFlowModule: React.FC = () => {
  const today = todayInVietnam();
  const [summary, setSummary] = useState<FinanceOverviewSummary>(emptySummary);
  const [contacts, setContacts] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<FinanceOverviewPeriod>('month');
  const [dateRange, setDateRange] = useState(() => getFinanceOverviewDateRange('month', today));
  const [source, setSource] = useState<'all' | 'bank' | 'petty'>('all');
  const [transactionType, setTransactionType] = useState<'all' | 'Thu' | 'Chi'>('all');
  const [accountId, setAccountId] = useState('all');
  const [counterpartyId, setCounterpartyId] = useState('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const response = await financeOverviewApi.getSummary({
        dateFrom: dateRange.dateFrom || undefined,
        dateTo: dateRange.dateTo || undefined,
        source,
        type: transactionType,
        currency: 'VND',
        accountId: accountId === 'all' ? undefined : accountId,
        counterpartyId: counterpartyId === 'all' ? undefined : counterpartyId,
      });
      if (!Array.isArray(response.data?.cash?.flows) || !Array.isArray(response.data?.cash?.accounts)) {
        throw new Error('Dữ liệu dòng tiền không hợp lệ.');
      }
      setSummary(response.data);
    } catch (error: any) {
      setSummary(emptySummary);
      message.error(error?.response?.data?.message || error?.message || 'Không tải được dữ liệu dòng tiền. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  }, [accountId, counterpartyId, dateRange.dateFrom, dateRange.dateTo, source, transactionType]);

  useEffect(() => { void loadData(); }, [loadData]);
  useEffect(() => {
    void crmContactsApi.getAll().then(response => setContacts(Array.isArray(response.data?.data) ? response.data.data : []));
  }, []);

  const totals = useMemo(() => ({
    receipts: summary.cash.income,
    disbursements: summary.cash.expense,
    net: summary.cash.income - summary.cash.expense,
    pending: summary.cash.pending,
  }), [summary.cash]);

  const rows = useMemo<CashFlowRow[]>(() => summary.cash.flows.map(flow => ({
    ...flow,
    key: `${flow.source}:${flow.accountId}:${flow.accountName}:${flow.category}`,
    net: flow.income - flow.expense,
  })).sort((left, right) => Math.abs(right.net) - Math.abs(left.net)), [summary.cash.flows]);

  const periodChange = (value: FinanceOverviewPeriod) => {
    setPeriod(value);
    if (value !== 'custom') setDateRange(getFinanceOverviewDateRange(value, today));
  };

  const visibleAccounts = summary.cash.accounts.filter(account => source === 'all' || account.source === source);

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: '#0F172A', fontSize: 20, fontWeight: 400 }}>Tổng quan dòng tiền</h1>
          <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Tổng hợp từ các phiếu thu, phiếu chi đã hoàn thành. Số liệu hiện hỗ trợ VND.</div>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 10, marginBottom: 14 }}>
        <label style={{ display: 'grid', gap: 3, color: '#64748B', fontSize: 13 }}>Kỳ báo cáo
          <Select value={period} onChange={periodChange} options={periodOptions} style={{ width: '100%' }} />
        </label>
        {period === 'custom' && <>
          <label style={{ display: 'grid', gap: 3, color: '#64748B', fontSize: 13 }}>Từ ngày
            <DatePicker aria-label="Từ ngày" value={dateRange.dateFrom || undefined} onChange={value => setDateRange(range => ({ ...range, dateFrom: value || '' }))} />
          </label>
          <label style={{ display: 'grid', gap: 3, color: '#64748B', fontSize: 13 }}>Đến ngày
            <DatePicker aria-label="Đến ngày" value={dateRange.dateTo || undefined} onChange={value => setDateRange(range => ({ ...range, dateTo: value || '' }))} />
          </label>
        </>}
        <label style={{ display: 'grid', gap: 3, color: '#64748B', fontSize: 13 }}>Nguồn tiền
          <Select value={source} onChange={value => { setSource(value); setAccountId('all'); }} options={[
            { label: 'Tất cả nguồn', value: 'all' }, { label: 'Ngân hàng', value: 'bank' }, { label: 'Quỹ tiền mặt', value: 'petty' },
          ]} style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'grid', gap: 3, color: '#64748B', fontSize: 13 }}>Tài khoản
          <Select value={accountId} onChange={setAccountId} options={[
            { label: 'Tất cả tài khoản', value: 'all' },
            ...summary.cash.accounts.filter(account => source === 'all' || account.source === source).map(account => ({ label: account.name, value: account.key })),
          ]} style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'grid', gap: 3, color: '#64748B', fontSize: 13 }}>Loại giao dịch
          <Select value={transactionType} onChange={setTransactionType} options={[
            { label: 'Thu và chi', value: 'all' }, { label: 'Thu', value: 'Thu' }, { label: 'Chi', value: 'Chi' },
          ]} style={{ width: '100%' }} />
        </label>
        <label style={{ display: 'grid', gap: 3, color: '#64748B', fontSize: 13 }}>Đối tượng giao dịch
          <Select value={counterpartyId} onChange={setCounterpartyId} showSearch options={[
            { label: 'Tất cả đối tượng', value: 'all' },
            ...contacts.map(contact => ({ label: `${contact.name} · ${contact.code}`, value: contact.key })),
          ]} style={{ width: '100%' }} />
        </label>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(210px, 100%), 1fr))', gap: 10, marginBottom: 14 }}>
        {[
          { label: 'Tổng tiền thực thu', value: `+${formatMoney(totals.receipts)}`, color: '#16A34A' },
          { label: 'Tổng tiền thực chi', value: `-${formatMoney(totals.disbursements)}`, color: '#DC2626' },
          { label: 'Dòng tiền thuần phát sinh', value: `${totals.net >= 0 ? '+' : ''}${formatMoney(totals.net)}`, color: totals.net >= 0 ? '#009688' : '#DC2626' },
          { label: 'Chứng từ chờ duyệt', value: String(totals.pending), color: '#D97706' },
        ].map(card => <div key={card.label} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ color: '#64748B', fontSize: 12.5 }}>{card.label}</div>
          <div style={{ color: card.color, fontSize: 22, fontWeight: 400, marginTop: 4 }}>{card.value}</div>
        </div>)}
      </div>

      <div style={{ marginBottom: 14, color: '#64748B', fontSize: 12.5 }}>Số dư đầu kỳ và cuối kỳ tính theo toàn bộ phiếu đã hoàn thành trên tài khoản; bộ lọc loại giao dịch và đối tượng chỉ áp dụng cho số thu chi trong kỳ.</div>
      <div className="transparent-table-card" style={{ marginBottom: 14 }}>
        <KTable
          dataSource={visibleAccounts}
          loading={loading}
          columns={[
            { title: 'Quỹ hoặc tài khoản ngân hàng', dataIndex: 'name', key: 'name' },
            { title: 'Số dư đầu kỳ', dataIndex: 'openingBalance', key: 'openingBalance', width: 170, render: (value: number) => formatMoney(value) },
            { title: 'Thu trong kỳ', dataIndex: 'income', key: 'income', width: 160, render: (value: number) => value ? `+${formatMoney(value)}` : '—' },
            { title: 'Chi trong kỳ', dataIndex: 'expense', key: 'expense', width: 160, render: (value: number) => value ? `-${formatMoney(value)}` : '—' },
            { title: 'Số dư cuối kỳ', dataIndex: 'closingBalance', key: 'closingBalance', width: 170, render: (value: number) => formatMoney(value) },
          ]}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'Chưa có tài khoản phù hợp với bộ lọc.' }}
        />
      </div>

      <div className="transparent-table-card">
        <KTable
          dataSource={rows}
          loading={loading}
          columns={[
            { title: 'Nguồn', dataIndex: 'source', key: 'source', width: 130, render: (value: string) => value === 'bank' ? 'Ngân hàng' : 'Quỹ tiền mặt' },
            { title: 'Tài khoản', dataIndex: 'accountName', key: 'accountName', width: 220 },
            { title: 'Nội dung thu chi', dataIndex: 'category', key: 'category' },
            { title: 'Số phiếu', dataIndex: 'voucherCount', key: 'voucherCount', width: 120, render: (value: number) => `${value} phiếu` },
            { title: 'Thu', dataIndex: 'income', key: 'income', width: 170, render: (value: number) => value ? <span style={{ color: '#16A34A' }}>+{formatMoney(value)}</span> : '—' },
            { title: 'Chi', dataIndex: 'expense', key: 'expense', width: 170, render: (value: number) => value ? <span style={{ color: '#DC2626' }}>-{formatMoney(value)}</span> : '—' },
            { title: 'Thuần', dataIndex: 'net', key: 'net', width: 170, render: (value: number) => <Tag color={value >= 0 ? 'success' : 'error'}>{value >= 0 ? '+' : ''}{formatMoney(value)}</Tag> },
          ]}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'Chưa có chứng từ hoàn thành trong kỳ.' }}
        />
      </div>
      <div style={{ marginTop: 10, color: '#64748B', fontSize: 12.5 }}>Bộ lọc tiền tệ: VND. Hệ thống chưa hỗ trợ tổng hợp ngoại tệ trong báo cáo dòng tiền.</div>
    </div>
  );
};
