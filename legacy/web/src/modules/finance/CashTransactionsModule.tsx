import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  ReloadOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  DeleteOutlined,
  EyeOutlined,
  BankOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer } from '../../custom-ui';
import { financeCashApi, FinanceCashTransaction } from '../../api/endpoints';

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

  useEffect(() => {
    void loadData();
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

  const handleCreate = async (values: any) => {
    const formattedValues = {
      ...values,
      amount: Number(values.amount) || 0,
      date: values.date || new Date().toISOString().substring(0, 10),
      status: values.status || 'Đã hoàn thành',
      source: values.source || 'bank',
    };
    try {
      await financeCashApi.create(formattedValues);
      message.success(`Đã lập phiếu ${values.type}: ${values.code} thành công`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lập phiếu thu chi. Vui lòng kiểm tra lại dữ liệu.');
    }
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

    if (typeFilter === 'all') return matchSearch;
    if (typeFilter === 'pending') return matchSearch && item.status === 'Chờ duyệt';
    return matchSearch && item.type === typeFilter;
  });

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
          ].map((tab) => (
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
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                type: 'Thu',
                date: new Date().toISOString().substring(0, 10),
                status: 'Đã hoàn thành',
                source: 'bank',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập phiếu thu / chi
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Lập phiếu thu / chi */}
      <Modal
        title="Lập Chứng Từ Phiếu Thu / Phiếu Chi Tiền Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="type" label="Loại chứng từ" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Phiếu Thu Tiền', value: 'Thu' },
                  { label: 'Phiếu Chi Tiền', value: 'Chi' },
                ]}
              />
            </Form.Item>
            <Form.Item name="code" label="Số chứng từ" rules={[{ required: true, whitespace: true }]}>
              <Input placeholder="Nhập mã chứng từ theo sổ kế toán" />
            </Form.Item>
          </div>

          <Form.Item name="source" label="Nguồn tiền" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Tiền gửi ngân hàng', value: 'bank' },
                { label: 'Quỹ tiền mặt', value: 'petty' },
              ]}
            />
          </Form.Item>

          <Form.Item name="category" label="Nội dung thu / chi chi tiết" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Thu tiền quyết toán hợp đồng phần mềm hoặc Chi trả tiền thuê văn phòng..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="amount" label="Số tiền thanh toán (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={1000} step={500000} />
            </Form.Item>
            <Form.Item name="date" label="Ngày hạch toán" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Form.Item name="recipientOrPayer" label="Đối tác / Người nộp hoặc nhận" rules={[{ required: true }]}>
              <Input placeholder="Tên khách hàng, đối tác hoặc nhân sự" />
            </Form.Item>
            <Form.Item name="account" label="Tài khoản nguồn / Quỹ tiền" rules={[{ required: true, whitespace: true }]}>
              <Input placeholder="Nhập tài khoản ngân hàng hoặc tên quỹ" />
            </Form.Item>
          </div>

          <Form.Item name="status" label="Trạng thái phê duyệt" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Đã hoàn thành', value: 'Đã hoàn thành' },
                { label: 'Chờ duyệt', value: 'Chờ duyệt' },
              ]}
            />
          </Form.Item>

          <Form.Item name="note" label="Ghi chú & Số hóa đơn kèm theo">
            <Input.TextArea rows={2} placeholder="Hóa đơn GTGT số hoặc Số hợp đồng kinh tế liên quan..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận lập phiếu
            </Button>
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
                Ngày lập phiếu: <strong>{selectedTransaction.date}</strong> · Nguồn: {selectedTransaction.account}
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

            {selectedTransaction.status !== 'Đã hủy' && (
              <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(selectedTransaction)}>
                Hủy Phiếu
              </Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};
