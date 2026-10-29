import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownOutlined, ArrowUpOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Button, Progress, message } from '../../custom-ui';
import { financeCashApi, FinanceCashTransaction, financeDocumentsApi, FinanceDebt, FinanceDocument } from '../../api/endpoints';
import { dataService } from '../../services/dataService';

interface CategoryTotal {
  name: string;
  amount: number;
}

const formatMoney = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;

const toCategoryTotals = (transactions: FinanceCashTransaction[], type: 'Thu' | 'Chi'): CategoryTotal[] => {
  const totals = new Map<string, number>();
  transactions
    .filter((transaction) => transaction.type === type)
    .forEach((transaction) => totals.set(transaction.category, (totals.get(transaction.category) || 0) + transaction.amount));
  return Array.from(totals, ([name, amount]) => ({ name, amount })).sort((left, right) => right.amount - left.amount);
};

export const FinanceOverviewModule: React.FC = () => {
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<FinanceCashTransaction[]>([]);
  const [documents, setDocuments] = useState<FinanceDocument[]>([]);
  const [debts, setDebts] = useState<FinanceDebt[]>([]);
  const [inventory, setInventory] = useState<Array<{ key: string; name: string; stockQty: number; unitPrice: number }>>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [cashResponse, documentResponse, debtResponse] = await Promise.all([
        financeCashApi.getAll(),
        financeDocumentsApi.getAll(),
        financeDocumentsApi.getDebts(),
      ]);
      setTransactions(cashResponse.data.data);
      setDocuments(documentResponse.data.data);
      setDebts(debtResponse.data.data);
      try {
        await dataService.refreshGenericData('finance_inventory');
        setInventory(dataService.getGenericData('finance_inventory') as Array<{ key: string; name: string; stockQty: number; unitPrice: number }>);
      } catch {
        setInventory(dataService.getGenericData('finance_inventory') as Array<{ key: string; name: string; stockQty: number; unitPrice: number }>);
      }
    } catch (error: any) {
      setTransactions([]);
      setDocuments([]);
      setDebts([]);
      setInventory([]);
      message.error(error?.response?.data?.message || 'Không tải được tổng quan tài chính. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const completedTransactions = useMemo(
    () => transactions.filter((transaction) => transaction.status === 'Đã hoàn thành'),
    [transactions],
  );
  const income = useMemo(
    () => completedTransactions.filter((transaction) => transaction.type === 'Thu').reduce((sum, transaction) => sum + transaction.amount, 0),
    [completedTransactions],
  );
  const expense = useMemo(
    () => completedTransactions.filter((transaction) => transaction.type === 'Chi').reduce((sum, transaction) => sum + transaction.amount, 0),
    [completedTransactions],
  );
  const pending = useMemo(() => transactions.filter((transaction) => transaction.status === 'Chờ duyệt').length, [transactions]);
  const revenueBreakdown = useMemo(() => toCategoryTotals(completedTransactions, 'Thu'), [completedTransactions]);
  const expenseBreakdown = useMemo(() => toCategoryTotals(completedTransactions, 'Chi'), [completedTransactions]);
  const validDocuments = useMemo(() => documents.filter((document) => document.status !== 'Đã hủy'), [documents]);
  const salesTotal = useMemo(
    () => validDocuments.filter((document) => document.documentType === 'sale' || document.subtype.includes('Đầu ra')).reduce((sum, document) => sum + document.amount, 0),
    [validDocuments],
  );
  const purchaseTotal = useMemo(
    () => validDocuments.filter((document) => document.documentType === 'purchase' || document.subtype.includes('Đầu vào')).reduce((sum, document) => sum + document.amount, 0),
    [validDocuments],
  );
  const receivable = useMemo(() => debts.filter((debt) => debt.type === 'Phải thu').reduce((sum, debt) => sum + debt.remainingAmount, 0), [debts]);
  const payable = useMemo(() => debts.filter((debt) => debt.type === 'Phải trả').reduce((sum, debt) => sum + debt.remainingAmount, 0), [debts]);
  const debtAging = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return (['Phải thu', 'Phải trả'] as const).map(type => {
      const entries = debts.filter(debt => debt.type === type && debt.remainingAmount > 0);
      const overdue = entries.filter(debt => debt.dueDate && new Date(`${debt.dueDate}T00:00:00`) < today).reduce((sum, debt) => sum + debt.remainingAmount, 0);
      const current = entries.reduce((sum, debt) => sum + debt.remainingAmount, 0) - overdue;
      return { type, overdue, current, total: overdue + current };
    });
  }, [debts]);
  const monthlyCash = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 12 }, (_, index) => {
      const month = new Date(now.getFullYear(), now.getMonth() - 11 + index, 1);
      const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;
      const rows = completedTransactions.filter(item => item.date.startsWith(prefix));
      return {
        label: `Th ${month.getMonth() + 1}`,
        income: rows.filter(item => item.type === 'Thu').reduce((sum, item) => sum + item.amount, 0),
        expense: rows.filter(item => item.type === 'Chi').reduce((sum, item) => sum + item.amount, 0),
      };
    });
  }, [completedTransactions]);
  const inventoryRows = useMemo(() => inventory.filter(item => Number(item.stockQty) > 0)
    .map(item => ({ ...item, value: Number(item.stockQty) * Number(item.unitPrice) }))
    .sort((a, b) => b.value - a.value), [inventory]);
  const inventoryValue = inventoryRows.reduce((sum, item) => sum + item.value, 0);

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
          <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Số liệu được tính từ sổ Thu, Chi và Quỹ tiền mặt đã hoàn thành.</div>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tổng thực thu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>+{formatMoney(income)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tổng thực chi</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>-{formatMoney(expense)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Dòng tiền thuần phát sinh</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: income - expense >= 0 ? '#009688' : '#DC2626', marginTop: 4 }}>{income - expense >= 0 ? '+' : ''}{formatMoney(income - expense)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Chứng từ chờ duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>{pending}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Doanh số theo chứng từ</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>{formatMoney(salesTotal)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Chi phí mua hàng theo chứng từ</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>{formatMoney(purchaseTotal)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Công nợ phải thu</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{formatMoney(receivable)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Công nợ phải trả</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>{formatMoney(payable)}</div>
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
          <div style={{ color: '#0F172A', fontWeight: 700, marginBottom: 14 }}>Dòng tiền theo tháng · 12 tháng gần nhất</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(20px, 1fr))', alignItems: 'end', gap: 8, height: 180, borderBottom: '1px solid #CBD5E1', paddingTop: 12 }}>
            {monthlyCash.map(month => {
              const ceiling = Math.max(1, ...monthlyCash.flatMap(item => [item.income, item.expense]));
              return <div key={month.label} title={`${month.label}: Thu ${formatMoney(month.income)} · Chi ${formatMoney(month.expense)}`} style={{ height: '100%', display: 'flex', alignItems: 'end', justifyContent: 'center', gap: 3 }}>
                <div style={{ width: '38%', minHeight: month.income ? 2 : 0, height: `${month.income / ceiling * 100}%`, background: '#10B981', borderRadius: '3px 3px 0 0' }} />
                <div style={{ width: '38%', minHeight: month.expense ? 2 : 0, height: `${month.expense / ceiling * 100}%`, background: '#FB923C', borderRadius: '3px 3px 0 0' }} />
              </div>;
            })}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, minmax(20px, 1fr))', gap: 8, marginTop: 6, fontSize: 10, color: '#64748B', textAlign: 'center' }}>{monthlyCash.map(month => <span key={month.label}>{month.label}</span>)}</div>
          <div style={{ display: 'flex', gap: 16, fontSize: 12, marginTop: 12 }}><span style={{ color: '#059669' }}>● Thu hoàn thành</span><span style={{ color: '#F97316' }}>● Chi hoàn thành</span></div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
          <div style={{ color: '#0F172A', fontWeight: 700, marginBottom: 14 }}>Công nợ theo hạn thanh toán</div>
          {debtAging.map(item => <div key={item.type} style={{ padding: '12px 0', borderBottom: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 700, marginBottom: 8 }}>{item.type}<span>{formatMoney(item.total)}</span></div>
            <Progress percent={item.total ? Math.round(item.overdue / item.total * 100) : 0} strokeColor="#FB923C" showInfo={false} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748B', marginTop: 4 }}><span>Quá hạn {formatMoney(item.overdue)}</span><span>Trong hạn {formatMoney(item.current)}</span></div>
          </div>)}
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
          <div style={{ color: '#0F172A', fontWeight: 700, marginBottom: 8 }}>Hàng hóa tồn kho</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{formatMoney(inventoryValue)}</div>
          <div style={{ color: '#64748B', fontSize: 12, marginBottom: 12 }}>Giá trị theo tồn kho × đơn giá bán trên danh mục</div>
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
          <Button onClick={() => navigate('/admin/finance/cash/petty')}>Quỹ tiền mặt</Button>
          <Button onClick={() => navigate('/admin/finance/cash/flow')}>Dòng tiền</Button>
          <Button onClick={() => navigate('/admin/finance/sales')}>Bán hàng</Button>
          <Button onClick={() => navigate('/admin/finance/purchasing')}>Mua hàng</Button>
          <Button onClick={() => navigate('/admin/finance/debts')}>Công nợ</Button>
          <Button onClick={() => navigate('/admin/finance/invoices')}>Hóa đơn</Button>
        </div>
      </div>
    </div>
  );
};
