import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  BankOutlined,
  CheckCircleOutlined,
  FileProtectOutlined,
  EyeOutlined,
  CalendarOutlined,
  DollarOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
  BuildOutlined,
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseLoanItem {
  key: string;
  contractCode: string;
  bankName: string;
  loanType: 'Hạn mức tín dụng ngắn hạn' | 'Vay trung dài hạn đầu tư IDC' | 'Khế ước bảo lãnh thanh toán';
  principalAmount: number; // Tiền gốc vay (VNĐ)
  interestRate: number; // Lãi suất %/năm
  disbursedDate: string;
  dueDate: string;
  monthlyInterest: number; // Lãi hàng tháng
  monthlyPrincipal: number; // Gốc hàng tháng
  collateral: string; // Tài sản thế chấp
  purpose: string;
  status: 'Đang vay đúng hạn' | 'Đã tất toán toàn bộ' | 'Sắp đến hạn thanh toán';
}

const INITIAL_LOANS: EnterpriseLoanItem[] = [];

export const LoansModule: React.FC<{ defaultType?: string }> = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  let pageTitle = 'Khế Ước Khoản Vay & Tín Dụng Doanh Nghiệp';
  if (currentPath === '/finance/cash/loans/borrow') pageTitle = 'Quản Lý Khế Ước Đi Vay & Hạn Mức Tín Dụng Ngân Hàng';
  else if (currentPath === '/finance/cash/loans/lend') pageTitle = 'Quản Lý Hợp Đồng Cho Vay & Ủy Thác Đầu Tư Vốn';

  const [data, setData] = useState<EnterpriseLoanItem[]>(INITIAL_LOANS);

  useEffect(() => {
    const list = dataService.getGenericData('finance_loans');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_loans');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLoan, setSelectedLoan] = useState<EnterpriseLoanItem | null>(null);

  const activeLoans = data.filter((d) => d.status === 'Đang vay đúng hạn' || d.status === 'Sắp đến hạn thanh toán');
  const totalPrincipal = activeLoans.reduce((sum, item) => sum + item.principalAmount, 0);
  const totalMonthlyInterest = activeLoans.reduce((sum, item) => sum + item.monthlyInterest, 0);

  const handleCreate = (values: any) => {
    const principal = Number(values.principalAmount) || 1000000000;
    const rate = Number(values.interestRate) || 6.5;
    const interestMonthly = Math.round((principal * (rate / 100)) / 12);
    const newItem: EnterpriseLoanItem = {
      ...values,
      key: String(Date.now()),
      principalAmount: principal,
      interestRate: rate,
      monthlyInterest: interestMonthly,
      monthlyPrincipal: Math.round(principal / 24),
      collateral: values.collateral || 'Tài sản bảo đảm theo quy định',
      status: 'Đang vay đúng hạn',
    };
    const nextItems = [newItem, ...data]; setData(nextItems); dataService.saveGenericData('finance_loans', nextItems);
    message.success(`Đã thêm khế ước vay ngân hàng mới: ${values.contractCode}`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchType = typeFilter === 'all' || item.loanType === typeFilter || (typeFilter === 'settled' && item.status === 'Đã tất toán toàn bộ');
    const matchSearch =
      (item.contractCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.bankName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.loanType || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.purpose || '').toLowerCase().includes(searchText.toLowerCase());

    return matchType && matchSearch;
  });

  const columns = [
    {
      title: 'Mã khế ước & Loại vay',
      key: 'contractCode',
      render: (_: any, record: EnterpriseLoanItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <FileProtectOutlined /> {record.contractCode}
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', fontWeight: 600, marginTop: 2 }}>
            {record.loanType}
          </div>
        </div>
      ),
    },
    {
      title: 'Tổ chức tín dụng & Mục đích',
      key: 'bank',
      render: (_: any, record: EnterpriseLoanItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record?.bankName || '--'}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Mục đích: {record?.purpose || '--'}
          </div>
        </div>
      ),
    },
    {
      title: 'Dư nợ gốc (VNĐ)',
      dataIndex: 'principalAmount',
      key: 'principalAmount',
      width: 180,
      render: (val: number) => (
        <span style={{ fontWeight: 800, color: '#DC2626', fontSize: 14 }}>
          {val.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Lãi suất',
      key: 'interestRate',
      width: 190,
      render: (_: any, record: EnterpriseLoanItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13 }}>{record.interestRate}% / năm</div>
          <div style={{ fontSize: 11.5, color: '#D97706', fontWeight: 600 }}>
            Lãi: {record.monthlyInterest.toLocaleString('vi-VN')} ₫/tháng
          </div>
        </div>
      ),
    },
    {
      title: 'Thời hạn vay & Đáo hạn',
      key: 'dates',
      width: 190,
      render: (_: any, record: EnterpriseLoanItem) => (
        <div style={{ fontSize: 12 }}>
          <div style={{ color: '#64748B' }}>Giải ngân: {record.disbursedDate}</div>
          <div style={{ color: '#D97706', fontWeight: 700 }}>Đáo hạn: {record.dueDate}</div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Đang vay đúng hạn') color = 'success';
        if (status === 'Sắp đến hạn thanh toán') color = 'warning';
        if (status === 'Đã tất toán toàn bộ') color = 'default';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseLoanItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedLoan(record);
            setDrawerOpen(true);
          }}
        >
          Lịch trả nợ
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng dư nợ gốc tín dụng ngân hàng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {totalPrincipal.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Phục vụ mở rộng hạ tầng Cloud Server</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chi phí lãi vay trả hàng tháng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {totalMonthlyInterest.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Lãi suất bình quân: 6.45%/năm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hạn mức tín dụng chưa giải ngân</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            15.000.000.000 ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Sẵn sàng đáp ứng vốn cho dự án mới</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Xếp hạng tín dụng doanh nghiệp</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            Hạng AAA
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Được cấp hạn mức tín chấp tối đa</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả khế ước' },
            { key: 'Hạn mức tín dụng ngắn hạn', label: 'Tín dụng ngắn hạn', icon: <BankOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Vay trung dài hạn đầu tư IDC', label: 'Vay trung dài hạn', icon: <BuildOutlined style={{ color: '#64748B' }} /> },
            { key: 'Khế ước bảo lãnh thanh toán', label: 'Bảo lãnh LC', icon: <SafetyCertificateOutlined style={{ color: '#10B981' }} /> },
            { key: 'settled', label: 'Đã tất toán', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setTypeFilter(tab.key)}
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
            placeholder="Tìm theo mã khế ước, ngân hàng, mục đích..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh mục khế ước vay')}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                contractCode: `KU-BANK-2026-0${data.length + 1}`,
                loanType: 'Hạn mức tín dụng ngắn hạn',
                principalAmount: 1500000000,
                interestRate: 6.8,
                disbursedDate: new Date().toISOString().substring(0, 10),
                dueDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10),
                collateral: 'Hợp đồng tiền gửi kỳ hạn 2 tỷ tại Vietcombank',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm khế ước vay mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm khế ước vay mới */}
      <Modal
        title="Thêm Khế Ước Khoản Vay &amp; Tín Dụng Ngân Hàng Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="contractCode" label="Mã khế ước" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="loanType" label="Loại hình vay" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Hạn mức tín dụng ngắn hạn', value: 'Hạn mức tín dụng ngắn hạn' },
                  { label: 'Vay trung dài hạn đầu tư IDC', value: 'Vay trung dài hạn đầu tư IDC' },
                  { label: 'Khế ước bảo lãnh thanh toán', value: 'Khế ước bảo lãnh thanh toán' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="bankName" label="Tên tổ chức tín dụng / Ngân hàng" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Ngân Hàng TMCP Ngoại Thương Việt Nam" />
          </Form.Item>

          <Form.Item name="purpose" label="Mục đích sử dụng vốn vay" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Bổ sung vốn lưu động hoặc Mua sắm máy chủ Cloud" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="principalAmount" label="Số tiền gốc giải ngân (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={100000000} />
            </Form.Item>
            <Form.Item name="interestRate" label="Lãi suất vay" rules={[{ required: true }]}>
              <Input type="number" min={1} max={25} step={0.1} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="disbursedDate" label="Ngày giải ngân" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="dueDate" label="Ngày đáo hạn" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <Form.Item name="collateral" label="Tài sản thế chấp / Biện pháp bảo đảm" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Mô tả tài sản thế chấp hoặc thư bảo lãnh..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu khế ước vay
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Lịch Trả Nợ & Tài Sản Thế Chấp */}
      <Drawer
        title="Chi Tiết Khế Ước Vay &amp; Lịch Trả Nợ Phân Kỳ"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedLoan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedLoan.contractCode}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedLoan?.bankName || '--'}
                  </div>
                </div>
                <Tag color={selectedLoan.status === 'Đang vay đúng hạn' ? 'success' : selectedLoan.status === 'Sắp đến hạn thanh toán' ? 'warning' : 'default'}>
                  {selectedLoan.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedLoan.loanType} · Mục đích: {selectedLoan.purpose}
              </div>
            </div>

            {/* Loan parameters */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Số Hợp Đồng Tín Dụng:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Dư nợ gốc giải ngân:</span>
                  <strong style={{ color: '#DC2626', fontSize: 15 }}>{selectedLoan.principalAmount.toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Lãi suất áp dụng:</span>
                  <strong style={{ color: '#009688' }}>{selectedLoan.interestRate}% / năm</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Lãi vay trả hàng tháng:</span>
                  <strong style={{ color: '#D97706' }}>{selectedLoan.monthlyInterest.toLocaleString('vi-VN')} ₫ / tháng</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời hạn khế ước:</span>
                  <span>{selectedLoan.disbursedDate} ➔ {selectedLoan.dueDate}</span>
                </div>
              </div>
            </div>

            {/* Collateral box */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <SafetyCertificateOutlined style={{ color: '#009688' }} /> Biện Pháp Bảo Đảm &amp; Tài Sản Thế Chấp:
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', fontStyle: 'italic', background: '#FFFFFF', padding: '10px 12px', borderRadius: 4, border: '1px solid #E2E8F0' }}>
                "{selectedLoan.collateral}"
              </div>
            </div>

            {/* Repayment Schedule Simulation */}
            <div style={{ border: '1px solid #BBF7D0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 6 }}>
                Nghĩa Vụ Thanh Toán Kỳ Tới:
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
                <span>Ngày thanh toán: <strong>15/09/2026</strong></span>
                <strong style={{ fontSize: 17, color: '#16A34A' }}>
                  {(selectedLoan.monthlyPrincipal + selectedLoan.monthlyInterest).toLocaleString('vi-VN')} ₫
                </strong>
              </div>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              onClick={() => message.success(`Đã xuất bảng lịch trả nợ phân kỳ khế ước ${selectedLoan.contractCode}`)}
            >
              Xuất Bảng Phân Kỳ Lịch Trả Nợ
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

