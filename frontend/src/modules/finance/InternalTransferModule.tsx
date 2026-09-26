import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  SwapOutlined,
  BankOutlined,
  CheckCircleOutlined,
  ArrowRightOutlined,
  EyeOutlined,
  AuditOutlined,
  PrinterOutlined,
  DollarOutlined,
  ClockCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseInternalTransferRecord {
  key: string;
  transferCode: string;
  sourceAccount: string;
  destinationAccount: string;
  amount: number;
  fee: number;
  transferDate: string;
  time: string;
  executor: string;
  approver: string;
  purpose: string;
  transferMethod: 'Napas 247' | 'CITAD Liên Ngân Hàng' | 'Rút séc / Nộp tiền mặt két';
  status: 'Thành công' | 'Đang chuyển' | 'Đã hủy';
}

const INITIAL_TRANSFERS: EnterpriseInternalTransferRecord[] = [];

export const InternalTransferModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseInternalTransferRecord[]>(INITIAL_TRANSFERS);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTransfer, setSelectedTransfer] = useState<EnterpriseInternalTransferRecord | null>(null);

  const totalTransferred = data.filter((d) => d.status === 'Thành công').reduce((sum, item) => sum + item.amount, 0);
  const totalFees = data.reduce((sum, item) => sum + item.fee, 0);
  const pendingCount = data.filter((d) => d.status === 'Đang chuyển').length;

  const handleCreate = (values: any) => {
    if (values.sourceAccount === values.destinationAccount) {
      message.error('Tài khoản nguồn và tài khoản đích không được trùng nhau!');
      return;
    }
    const val = Number(values.amount) || 0;
    const newItem: EnterpriseInternalTransferRecord = {
      ...values,
      key: String(Date.now()),
      transferCode: `TRF-2026-00${data.length + 1}`,
      amount: val,
      fee: values.transferMethod === 'Rút séc / Nộp tiền mặt két' ? 0 : 2200,
      transferDate: values.transferDate || new Date().toISOString().substring(0, 10),
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
      executor: 'Nguyễn Huy Tùng (Kế toán)',
      approver: 'Phạm Thu Hương (Kế toán trưởng)',
      status: 'Thành công',
    };
    setData([newItem, ...data]);
    message.success(`Đã thực hiện lệnh chuyển tiền nội bộ: ${newItem.transferCode}`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.transferCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.sourceAccount || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.destinationAccount || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.purpose || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã lệnh & Thời gian',
      key: 'transferCode',
      render: (_: any, record: EnterpriseInternalTransferRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <SwapOutlined /> {record.transferCode}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            {record.transferDate} ({record.time}) · {record.transferMethod}
          </div>
        </div>
      ),
    },
    {
      title: 'Tài khoản nguồn (Xuất) ➔ Tài khoản đích (Nhận)',
      key: 'accounts',
      render: (_: any, record: EnterpriseInternalTransferRecord) => (
        <div>
          <div style={{ fontWeight: 600, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
            <BankOutlined /> {record.sourceAccount}
          </div>
          <div style={{ fontWeight: 600, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, marginTop: 4 }}>
            <ArrowRightOutlined style={{ color: '#64748B', fontSize: 11 }} /> {record.destinationAccount}
          </div>
        </div>
      ),
    },
    {
      title: 'Số tiền chuyển (VNĐ)',
      dataIndex: 'amount',
      key: 'amount',
      width: 180,
      render: (v: number, record: EnterpriseInternalTransferRecord) => (
        <div>
          <strong style={{ fontWeight: 800, color: '#0F172A', fontSize: 14 }}>
            {v.toLocaleString('vi-VN')} ₫
          </strong>
          {record.fee > 0 && <div style={{ fontSize: 11, color: '#64748B' }}>Phí: {record.fee.toLocaleString()} ₫</div>}
        </div>
      ),
      sorter: (a: EnterpriseInternalTransferRecord, b: EnterpriseInternalTransferRecord) => a.amount - b.amount,
    },
    {
      title: 'Nội dung điều chuyển',
      dataIndex: 'purpose',
      key: 'purpose',
      render: (p: string) => <span style={{ color: '#334155', fontSize: 12.5 }}>{p}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (st: string) => {
        let color = 'default';
        if (st === 'Thành công') color = 'success';
        if (st === 'Đang chuyển') color = 'processing';
        if (st === 'Đã hủy') color = 'error';
        return <Tag color={color}>{st}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseInternalTransferRecord) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedTransfer(record);
            setDrawerOpen(true);
          }}
        >
          Lệnh UNC
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng luân chuyển vốn nội bộ tháng 8</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalTransferred.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Cân đối thanh khoản giữa các quỹ &amp; ngân hàng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Số lệnh chuyển tiền hoàn tất</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {data.filter((d) => d.status === 'Thành công').length} Lệnh giao dịch
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đã hạch toán đầy đủ vào Sổ Nhật Ký Chung</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Lệnh đang điều chuyển (Napas/Két)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: pendingCount > 0 ? '#D97706' : '#64748B', marginTop: 4 }}>
            {pendingCount} Giao dịch
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Tiền đang chuyển (TK 113)</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chi phí phí chuyển tiền phát sinh</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalFees.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Tối ưu qua kênh Napas247 nội địa</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả lệnh chuyển' },
            { key: 'Thành công', label: 'Thành công', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Đang chuyển', label: 'Đang điều chuyển', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setStatusFilter(tab.key)}
              style={{
                backgroundColor: statusFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: statusFilter === tab.key ? '#009688' : '#CBD5E1',
                color: statusFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: statusFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã lệnh, tài khoản nguồn/đích, nội dung..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất sổ chuyển tiền nội bộ')}>
            Xuất Sao Kê
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                sourceAccount: 'Vietcombank - 0011004589999 (VND)',
                destinationAccount: 'Techcombank - 1903456789001 (VND)',
                transferMethod: 'Napas 247',
                amount: 50000000,
                transferDate: new Date().toISOString().substring(0, 10),
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập lệnh chuyển tiền
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Lập Lệnh Chuyển Tiền Nội Bộ */}
      <Modal
        title="Lập Lệnh Chuyển Tiền &amp; Điều Phối Vốn Nội Bộ"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="sourceAccount" label="Tài khoản nguồn (Xuất tiền)" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Vietcombank - 0011004589999 (VND)', value: 'Vietcombank - 0011004589999 (VND)' },
                  { label: 'Techcombank - 1903456789001 (VND)', value: 'Techcombank - 1903456789001 (VND)' },
                  { label: 'MB Bank - 0888999999 (VND)', value: 'MB Bank - 0888999999 (VND)' },
                  { label: 'Quỹ Tiền Mặt Trụ Sở Chính (Két)', value: 'Quỹ Tiền Mặt Trụ Sở Chính (Két)' },
                ]}
              />
            </Form.Item>
            <Form.Item name="destinationAccount" label="Tài khoản đích (Nhận tiền)" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Vietcombank - 0011004589999 (VND)', value: 'Vietcombank - 0011004589999 (VND)' },
                  { label: 'Techcombank - 1903456789001 (VND)', value: 'Techcombank - 1903456789001 (VND)' },
                  { label: 'MB Bank - 0888999999 (VND)', value: 'MB Bank - 0888999999 (VND)' },
                  { label: 'Quỹ Tiền Mặt Trụ Sở Chính (Két)', value: 'Quỹ Tiền Mặt Trụ Sở Chính (Két)' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="amount" label="Số tiền điều chuyển (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={10000} step={10000000} />
            </Form.Item>
            <Form.Item name="transferMethod" label="Phương thức chuyển tiền" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Napas 247 (Tức thì)', value: 'Napas 247' },
                  { label: 'CITAD Liên Ngân Hàng', value: 'CITAD Liên Ngân Hàng' },
                  { label: 'Rút séc / Nộp tiền mặt két', value: 'Rút séc / Nộp tiền mặt két' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="purpose" label="Mục đích điều chuyển vốn chi tiết" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Ví dụ: Cân đối số dư thanh toán hợp đồng IDC hoặc Bổ sung quỹ két..." />
          </Form.Item>

          <Form.Item name="transferDate" label="Ngày thực hiện giao dịch" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận thực hiện lệnh chuyển
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Lệnh Chuyển & Định Khoản Nợ/Có */}
      <Drawer
        title="Lệnh Điều Chuyển Vốn Nội Bộ &amp; Hạch Toán"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedTransfer && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ LỆNH: {selectedTransfer.transferCode}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedTransfer.amount.toLocaleString('vi-VN')} ₫
                  </div>
                </div>
                <Tag color={selectedTransfer.status === 'Thành công' ? 'success' : 'processing'}>
                  {selectedTransfer.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedTransfer.transferMethod} · Thời gian: {selectedTransfer.transferDate} {selectedTransfer.time}
              </div>
            </div>

            {/* Account Flow */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Tuyến Điều Phối Dòng Tiền:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ background: '#FEF2F2', padding: '10px 12px', borderRadius: 6, border: '1px solid #FECACA' }}>
                  <div style={{ fontSize: 11, color: '#991B1B', fontWeight: 700 }}>TÀI KHOẢN NGUỒN (XUẤT TIỀN):</div>
                  <strong style={{ color: '#DC2626' }}>{selectedTransfer.sourceAccount}</strong>
                </div>
                <div style={{ background: '#F0FDF4', padding: '10px 12px', borderRadius: 6, border: '1px solid #BBF7D0' }}>
                  <div style={{ fontSize: 11, color: '#166534', fontWeight: 700 }}>TÀI KHOẢN ĐÍCH (NHẬN TIỀN):</div>
                  <strong style={{ color: '#16A34A' }}>{selectedTransfer.destinationAccount}</strong>
                </div>
                <div style={{ marginTop: 6, color: '#475569' }}>
                  Lý do: <em>"{selectedTransfer.purpose}"</em>
                </div>
              </div>
            </div>

            {/* Accounting Debit / Credit */}
            <div style={{ border: '1px solid #BFDBFE', borderRadius: 8, padding: 14, background: '#EFF6FF' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AuditOutlined /> Định Khoản Kế Toán Tự Động:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                <div><strong>Nợ TK {selectedTransfer.destinationAccount.includes('Két') ? '1111' : '1121'}</strong>: {selectedTransfer.amount.toLocaleString('vi-VN')} ₫</div>
                <div><strong>Có TK {selectedTransfer.sourceAccount.includes('Két') ? '1111' : '1121'}</strong>: {selectedTransfer.amount.toLocaleString('vi-VN')} ₫</div>
                {selectedTransfer.fee > 0 && <div><strong>Nợ TK 6425 / Có TK 1121</strong> (Phí chuyển tiền): {selectedTransfer.fee.toLocaleString()} ₫</div>}
              </div>
            </div>

            {/* Signatures */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, textAlign: 'center', fontSize: 12, padding: 12, background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div>
                <strong>Người Lập Biểu</strong>
                <div style={{ color: '#16A34A', fontWeight: 600, marginTop: 12 }}>Đã lập lệnh</div>
                <div style={{ color: '#64748B', marginTop: 2 }}>{selectedTransfer.executor}</div>
              </div>
              <div>
                <strong>Kế Toán Trưởng Duyệt</strong>
                <div style={{ color: '#16A34A', fontWeight: 600, marginTop: 12 }}>Đã ký số điện tử</div>
                <div style={{ color: '#64748B', marginTop: 2 }}>{selectedTransfer.approver}</div>
              </div>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              icon={<PrinterOutlined />}
              onClick={() => message.success(`Đã in Lệnh điều chuyển vốn nội bộ ${selectedTransfer.transferCode}`)}
            >
              In Phiếu Điều Chuyển Vốn (A5)
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

