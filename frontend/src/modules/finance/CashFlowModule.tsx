import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownOutlined, ArrowUpOutlined, ReloadOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Tag, message } from '../../custom-ui';
import { financeCashApi, FinanceCashTransaction } from '../../api/endpoints';

interface CashFlowRow {
  key: string;
  category: string;
  receipts: number;
  disbursements: number;
  net: number;
  vouchers: number;
}

const formatMoney = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;

export const CashFlowModule: React.FC = () => {
  const [transactions, setTransactions] = useState<FinanceCashTransaction[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await financeCashApi.getAll();
      setTransactions(response.data.data);
    } catch (error: any) {
      setTransactions([]);
      message.error(error?.response?.data?.message || 'Không tải được dữ liệu dòng tiền. Vui lòng thử lại.');
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

  const totals = useMemo(() => {
    const receipts = completedTransactions
      .filter((transaction) => transaction.type === 'Thu')
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const disbursements = completedTransactions
      .filter((transaction) => transaction.type === 'Chi')
      .reduce((sum, transaction) => sum + transaction.amount, 0);
    const pending = transactions.filter((transaction) => transaction.status === 'Chờ duyệt').length;
    return { receipts, disbursements, net: receipts - disbursements, pending };
  }, [completedTransactions, transactions]);

  const rows = useMemo<CashFlowRow[]>(() => {
    const categories = new Map<string, CashFlowRow>();
    completedTransactions.forEach((transaction) => {
      const current = categories.get(transaction.category) || {
        key: transaction.category,
        category: transaction.category,
        receipts: 0,
        disbursements: 0,
        net: 0,
        vouchers: 0,
      };
      if (transaction.type === 'Thu') current.receipts += transaction.amount;
      else current.disbursements += transaction.amount;
      current.net = current.receipts - current.disbursements;
      current.vouchers += 1;
      categories.set(transaction.category, current);
    });
    return Array.from(categories.values()).sort((left, right) => Math.abs(right.net) - Math.abs(left.net));
  }, [completedTransactions]);

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: '#0F172A', fontSize: 20 }}>Tổng quan dòng tiền</h1>
          <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Tổng hợp trực tiếp từ các phiếu thu, phiếu chi và quỹ tiền mặt đã hoàn thành.</div>
        </div>
        <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ color: '#64748B', fontSize: 12.5 }}>Tổng tiền thực thu</div>
          <div style={{ color: '#16A34A', fontSize: 24, fontWeight: 800, marginTop: 4 }}>+{formatMoney(totals.receipts)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ color: '#64748B', fontSize: 12.5 }}>Tổng tiền thực chi</div>
          <div style={{ color: '#DC2626', fontSize: 24, fontWeight: 800, marginTop: 4 }}>-{formatMoney(totals.disbursements)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ color: '#64748B', fontSize: 12.5 }}>Dòng tiền thuần phát sinh</div>
          <div style={{ color: totals.net >= 0 ? '#009688' : '#DC2626', fontSize: 24, fontWeight: 800, marginTop: 4 }}>{totals.net >= 0 ? '+' : ''}{formatMoney(totals.net)}</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ color: '#64748B', fontSize: 12.5 }}>Chứng từ chờ duyệt</div>
          <div style={{ color: '#D97706', fontSize: 24, fontWeight: 800, marginTop: 4 }}>{totals.pending}</div>
        </div>
      </div>

      <div className="transparent-table-card">
        <KTable
          dataSource={rows}
          columns={[
            { title: 'Nội dung thu chi', dataIndex: 'category', key: 'category', render: (value: string) => <strong style={{ color: '#0F172A' }}>{value}</strong> },
            { title: 'Số phiếu hoàn thành', dataIndex: 'vouchers', key: 'vouchers', width: 160, render: (value: number) => `${value} phiếu` },
            { title: 'Thu', dataIndex: 'receipts', key: 'receipts', width: 180, render: (value: number) => <span style={{ color: '#16A34A', fontWeight: 700 }}>{value ? `+${formatMoney(value)}` : '—'}</span> },
            { title: 'Chi', dataIndex: 'disbursements', key: 'disbursements', width: 180, render: (value: number) => <span style={{ color: '#DC2626', fontWeight: 700 }}>{value ? `-${formatMoney(value)}` : '—'}</span> },
            {
              title: 'Thuần',
              dataIndex: 'net',
              key: 'net',
              width: 180,
              render: (value: number) => <Tag color={value >= 0 ? 'success' : 'error'}>{value >= 0 ? '+' : ''}{formatMoney(value)}</Tag>,
            },
          ]}
          pagination={{ pageSize: 10 }}
        />
      </div>

      {!loading && rows.length === 0 && (
        <div style={{ marginTop: 12, color: '#64748B', fontSize: 13 }}>Chưa có chứng từ hoàn thành để tính dòng tiền.</div>
      )}
    </div>
  );
};
