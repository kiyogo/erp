import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownOutlined, ArrowUpOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Button, Input, Progress, Select, message } from '../../custom-ui';
import { financeOverviewApi, FinanceOverviewSummary, financePaymentAccountsApi, FinancePaymentAccount } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { FinanceOverviewPeriod, getFinanceOverviewDateRange } from './financeOverviewRules';

interface CategoryTotal {
  name: string;
  amount: number;
}

const formatMoney = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;

const todayInVietnam = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

const emptySummary: FinanceOverviewSummary = {
  cash: { income: 0, expense: 0, pending: 0, categories: [], monthly: [] },
  documents: { receivable: 0, overdueReceivable: 0, payable: 0, overduePayable: 0, sales: 0, purchases: 0 },
};

export const FinanceOverviewModule: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<FinanceOverviewSummary>(emptySummary);
  const [paymentAccounts, setPaymentAccounts] = useState<FinancePaymentAccount[]>([]);
  const [inventory, setInventory] = useState<Array<{ key: string; name: string; stockQty: number; unitPrice: number }>>([]);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<FinanceOverviewPeriod>('month');
  const [dateRange, setDateRange] = useState(() => getFinanceOverviewDateRange('month', todayInVietnam()));

  const loadData = async () => {
    setLoading(true);
    try {
      const [summaryResponse, accountResponse] = await Promise.all([
        financeOverviewApi.getSummary({ dateFrom: dateRange.dateFrom || undefined, dateTo: dateRange.dateTo || undefined }),
        financePaymentAccountsApi.getAccounts(),
      ]);
      if (!Array.isArray(summaryResponse.data?.cash?.categories) || !Array.isArray(summaryResponse.data?.cash?.monthly) || !Array.isArray(accountResponse.data?.accounts)) {
        throw new Error('Dữ liệu tổng quan tài chính không hợp lệ.');
      }
      setSummary(summaryResponse.data);
      setPaymentAccounts(accountResponse.data.accounts);
      try {
        await dataService.refreshGenericData('finance_inventory');
        setInventory(dataService.getGenericData('finance_inventory') as Array<{ key: string; name: string; stockQty: number; unitPrice: number }>);
      } catch {
        setInventory(dataService.getGenericData('finance_inventory') as Array<{ key: string; name: string; stockQty: number; unitPrice: number }>);
      }
    } catch (error: any) {
      setSummary(emptySummary);
      setPaymentAccounts([]);
      setInventory([]);
      message.error(error?.response?.data?.message || 'Không tải được tổng quan tài chính. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [dateRange.dateFrom, dateRange.dateTo]);

  const income = Number(summary.cash.income) || 0;
  const expense = Number(summary.cash.expense) || 0;
  const pending = Number(summary.cash.pending) || 0;
  const revenueBreakdown = useMemo(() => summary.cash.categories.filter(item => item.type === 'Thu').map(({ name, amount }) => ({ name, amount })).sort((a, b) => b.amount - a.amount), [summary.cash.categories]);
  const expenseBreakdown = useMemo(() => summary.cash.categories.filter(item => item.type === 'Chi').map(({ name, amount }) => ({ name, amount })).sort((a, b) => b.amount - a.amount), [summary.cash.categories]);
  const outstandingReceivable = Number(summary.documents.receivable) || 0;
  const overdueReceivable = Number(summary.documents.overdueReceivable) || 0;
  const outstandingPayable = Number(summary.documents.payable) || 0;
  const overduePayable = Number(summary.documents.overduePayable) || 0;
  const cashBalance = paymentAccounts.filter((account) => account.source === 'petty').reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
  const bankBalance = paymentAccounts.filter((account) => account.source === 'bank').reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
  const salesTotal = Number(summary.documents.sales) || 0;
  const purchaseTotal = Number(summary.documents.purchases) || 0;
  const monthlyCash = summary.cash.monthly.slice(-12).map(item => ({ ...item, label: item.month }));
  const inventoryRows = useMemo(() => inventory.filter(item => Number(item.stockQty) > 0)
    .map(item => ({ ...item, value: Number(item.stockQty) * Number(item.unitPrice) }))
    .sort((a, b) => b.value - a.value), [inventory]);
  const inventoryValue = inventoryRows.reduce((sum, item) => sum + item.value, 0);

  const changePeriod = (value: string) => {
    const nextPeriod = value as FinanceOverviewPeriod;
    setPeriod(nextPeriod);
    if (nextPeriod !== 'custom') setDateRange(getFinanceOverviewDateRange(nextPeriod, todayInVietnam()));
  };

  const renderBreakdown = (items: CategoryTotal[], total: number, color: string, emptyText: string) => (
    items.length ? (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {items.map((item) => {
          const percentage = total > 0 ? Math.round((item.amount / total) * 1000) / 10 : 0;
          return (
            <div key={item.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, marginBottom: 4 }}>
                <span style={{ fontWeight: 600, color: '#0F172A' }}>{item.name}</span>
                <span style={{ fontWeight: 700, color, whiteSpace: 'nowrap' }}>{formatMoney(item.amount)} ({percentage}%)</span>
              </div>
              <Progress percent={percentage} strokeColor={color} showInfo={false} />
            </div>
          );
        })}
      </div>
    ) : <div style={{ color: '#64748B', fontSize: 13 }}>{emptyText}</div>
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: '#0F172A', fontSize: 20 }}>Tổng quan tài chính</h1>
          <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Số liệu được tính từ các giao dịch tài chính đã hoàn thành.</div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <Select aria-label="Khoảng thời gian tổng quan" value={period} onChange={changePeriod} style={{ minWidth: 160 }} options={[
            { value: 'all', label: 'Toàn thời gian' }, { value: 'day', label: 'Hôm nay' }, { value: 'week', label: 'Tuần này' },
            { value: 'month', label: 'Tháng này' }, { value: 'quarter', label: 'Quý này' }, { value: 'year', label: 'Năm nay' }, { value: 'custom', label: 'Tùy chọn' },
          ]} />
          <Input aria-label="Từ ngày tổng quan" type="date" disabled={period !== 'custom'} value={dateRange.dateFrom} onChange={event => { setPeriod('custom'); setDateRange(current => ({ ...current, dateFrom: event.target.value })); }} style={{ width: 160 }} />
          <Input aria-label="Đến ngày tổng quan" type="date" disabled={period !== 'custom'} value={dateRange.dateTo} onChange={event => { setPeriod('custom'); setDateRange(current => ({ ...current, dateTo: event.target.value })); }} style={{ width: 160 }} />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
        </div>
      </div>
      <div style={{ color: '#64748B', fontSize: 12, marginBottom: 12 }}>Phiếu thu, chi đã hoàn thành theo ngày hạch toán; giá trị bán, mua là tổng chứng từ chưa hủy theo ngày chứng từ. Công nợ là số dư còn lại hiện tại.</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Thực thu trong khoảng chọn</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>+{formatMoney(income)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Thực chi trong khoảng chọn</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>-{formatMoney(expense)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Dòng tiền thuần trong khoảng chọn</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: income - expense >= 0 ? '#009688' : '#DC2626', marginTop: 4 }}>{income - expense >= 0 ? '+' : ''}{formatMoney(income - expense)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Chứng từ chờ duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>{pending}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tiền mặt tại quỹ</div>
          <div style={{ fontSize: 21, color: '#0F172A', marginTop: 4 }}>{formatMoney(cashBalance)}</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{paymentAccounts.filter((account) => account.source === 'petty').length} tài khoản đang hoạt động</div>
          <Button type="link" onClick={() => navigate('/admin/finance/cash/flow')} style={{ paddingLeft: 0, marginTop: 4 }}>Mở dòng tiền</Button>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tiền gửi ngân hàng</div>
          <div style={{ fontSize: 21, color: '#0F172A', marginTop: 4 }}>{formatMoney(bankBalance)}</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>{paymentAccounts.filter((account) => account.source === 'bank').length} tài khoản đang hoạt động</div>
          <Button type="link" onClick={() => navigate('/admin/finance/cash/flow')} style={{ paddingLeft: 0, marginTop: 4 }}>Mở dòng tiền</Button>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Phải thu còn lại</div>
          <div style={{ fontSize: 21, color: '#0F172A', marginTop: 4 }}>{formatMoney(outstandingReceivable)}</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Quá hạn hiện tại: {formatMoney(overdueReceivable)}</div>
          <Button type="link" onClick={() => navigate('/admin/finance/invoices')} style={{ paddingLeft: 0, marginTop: 4 }}>Mở chứng từ phải thu</Button>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Phải trả còn lại</div>
          <div style={{ fontSize: 21, color: '#0F172A', marginTop: 4 }}>{formatMoney(outstandingPayable)}</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Quá hạn hiện tại: {formatMoney(overduePayable)}</div>
          <Button type="link" onClick={() => navigate('/admin/finance/invoices')} style={{ paddingLeft: 0, marginTop: 4 }}>Mở chứng từ phải trả</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Giá trị chứng từ bán hàng</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>{formatMoney(salesTotal)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Giá trị chứng từ mua hàng</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>{formatMoney(purchaseTotal)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 18 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
          <div style={{ color: '#0F172A', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}><ArrowDownOutlined style={{ color: '#16A34A' }} /> Cơ cấu thực thu</div>
          {renderBreakdown(revenueBreakdown, income, '#16A34A', 'Chưa có phiếu thu hoàn thành.')}
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
          <div style={{ color: '#0F172A', fontWeight: 700, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 7 }}><ArrowUpOutlined style={{ color: '#DC2626' }} /> Cơ cấu thực chi</div>
          {renderBreakdown(expenseBreakdown, expense, '#DC2626', 'Chưa có phiếu chi hoàn thành.')}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, marginBottom: 18 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
          <div style={{ color: '#0F172A', fontWeight: 700, marginBottom: 14 }}>Dòng tiền theo tháng trong khoảng chọn</div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, monthlyCash.length)}, minmax(20px, 1fr))`, alignItems: 'end', gap: 8, height: 180, borderBottom: '1px solid #CBD5E1', paddingTop: 12 }}>
            {monthlyCash.map(month => {
              const ceiling = Math.max(1, ...monthlyCash.flatMap(item => [item.income, item.expense]));
              return <div key={month.label} title={`${month.label}: Thu ${formatMoney(month.income)} · Chi ${formatMoney(month.expense)}`} style={{ height: '100%', display: 'flex', alignItems: 'end', justifyContent: 'center', gap: 3 }}>
                <div style={{ width: '38%', minHeight: month.income ? 2 : 0, height: `${month.income / ceiling * 100}%`, background: '#10B981', borderRadius: '3px 3px 0 0' }} />
                <div style={{ width: '38%', minHeight: month.expense ? 2 : 0, height: `${month.expense / ceiling * 100}%`, background: '#FB923C', borderRadius: '3px 3px 0 0' }} />
              </div>;
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(1, monthlyCash.length)}, minmax(20px, 1fr))`, gap: 8, marginTop: 6, fontSize: 10, color: '#64748B', textAlign: 'center' }}>{monthlyCash.map(month => <span key={month.label}>{month.label}</span>)}</div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, marginTop: 12 }}><span style={{ color: '#059669' }}>● Thu hoàn thành</span><span style={{ color: '#F97316' }}>● Chi hoàn thành</span></div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
          <div style={{ color: '#0F172A', fontWeight: 700, marginBottom: 8 }}>Hàng hóa tồn kho</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{formatMoney(inventoryValue)}</div>
          <div style={{ color: '#64748B', fontSize: 12, marginBottom: 12 }}>Giá trị theo tồn kho × đơn giá vốn bình quân trên danh mục</div>
          {inventoryRows.slice(0, 5).map(item => <div key={item.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid #F1F5F9', fontSize: 12 }}><span>{item.name}</span><span>{Number(item.stockQty).toLocaleString('vi-VN')} · {formatMoney(item.value)}</span></div>)}
          {!inventoryRows.length && <div style={{ color: '#64748B', fontSize: 13 }}>Chưa có hàng tồn kho.</div>}
          <Button type="link" onClick={() => navigate('/admin/finance/inventory')} style={{ paddingLeft: 0, marginTop: 8 }}>Mở kho hàng</Button>
        </div>
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>Nghiệp vụ tiền</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button onClick={() => navigate('/admin/finance/cash/income')}>Khoản thu</Button>
          <Button onClick={() => navigate('/admin/finance/cash/expense')}>Khoản chi</Button>
          <Button onClick={() => navigate('/admin/finance/cash/flow')}>Dòng tiền</Button>
          <Button onClick={() => navigate('/admin/finance/sales')}>Bán hàng</Button>
          <Button onClick={() => navigate('/admin/finance/purchasing')}>Mua hàng</Button>
          <Button onClick={() => navigate('/admin/finance/invoices')}>Hóa đơn</Button>
        </div>
      </div>
    </div>
  );
};
