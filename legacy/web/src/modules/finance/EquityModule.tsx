import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  BankOutlined,
  UserOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  PrinterOutlined,
  DollarOutlined,
  AuditOutlined,
  StarFilled,
  TeamOutlined,
  IdcardOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';

export interface EnterpriseShareholder {
  key: string;
  shareholderCode: string;
  fullName: string;
  idNumber: string; // CCCD / ĐKKD
  address: string;
  type: 'Cổ đông sáng lập' | 'Cổ đông chiến lược' | 'Cổ đông ESOP' | 'Cổ đông phổ thông';
  sharesCount: number; // Số lượng cổ phần
  ownershipPercentage: number; // Tỷ lệ sở hữu %
  capitalValue: number; // Giá trị vốn góp (VNĐ)
  paidDividends: number; // Cổ tức đã nhận lũy kế
  pendingDividend: number; // Cổ tức dự kiến đợt tới
  joinDate: string;
  certificateNumber: string; // Số sổ cổ đông
}

const INITIAL_SHAREHOLDERS: EnterpriseShareholder[] = [];

export const EquityModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseShareholder[]>(INITIAL_SHAREHOLDERS);

  useEffect(() => {
    const list = dataService.getGenericData('finance_equity');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_equity');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedShareholder, setSelectedShareholder] = useState<EnterpriseShareholder | null>(null);

  const totalCharterCapital = data.reduce((sum, item) => sum + item.capitalValue, 0); // Vốn điều lệ
  const totalShares = data.reduce((sum, item) => sum + item.sharesCount, 0);
  const totalDividends = data.reduce((sum, item) => sum + item.paidDividends, 0);
  const totalPendingDividends = data.reduce((sum, item) => sum + item.pendingDividend, 0);

  const handleCreate = (values: any) => {
    const shares = Number(values.sharesCount) || 10000;
    const capital = shares * 10000; // Mệnh giá 10,000 đ/cổ phần
    const newTotal = totalShares + shares;
    const pct = Math.round((shares / newTotal) * 1000) / 10;

    const newSh: EnterpriseShareholder = {
      ...values,
      key: String(Date.now()),
      sharesCount: shares,
      capitalValue: capital,
      ownershipPercentage: pct,
      paidDividends: 0,
      pendingDividend: Math.round(shares * 1000), // Dự kiến 1,000 đ/CP
      joinDate: new Date().toISOString().substring(0, 10),
      certificateNumber: `GCN-CĐ-2026-00${data.length + 1}`,
    };
    const nextItems = [newSh, ...data]; setData(nextItems); dataService.saveGenericData('finance_equity', nextItems);
    message.success(`Đã thêm cổ đông mới: ${values.fullName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchType = typeFilter === 'all' || item.type === typeFilter;
    const matchSearch =
      (item.fullName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.shareholderCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.type || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.idNumber || '').toLowerCase().includes(searchText.toLowerCase());

    return matchType && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Loại hình cổ đông',
      key: 'shareholderCode',
      render: (_: any, record: EnterpriseShareholder) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <SafetyCertificateOutlined /> {record.shareholderCode}
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', fontWeight: 600, marginTop: 2 }}>
            {record.type}
          </div>
        </div>
      ),
    },
    {
      title: 'Họ tên Cổ đông / Tổ chức & CCCD',
      key: 'fullName',
      render: (_: any, record: EnterpriseShareholder) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.fullName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            ĐKKD/CCCD: <code>{record.idNumber}</code> · Ngày vào: {record.joinDate}
          </div>
        </div>
      ),
    },
    {
      title: 'Cổ phần sở hữu',
      dataIndex: 'sharesCount',
      key: 'sharesCount',
      width: 170,
      render: (val: number) => (
        <span style={{ fontWeight: 800, color: '#1E40AF', fontSize: 13.5 }}>
          {val.toLocaleString('vi-VN')} CP
        </span>
      ),
    },
    {
      title: 'Tỷ lệ sở hữu (%)',
      dataIndex: 'ownershipPercentage',
      key: 'ownershipPercentage',
      width: 160,
      render: (pct: number) => (
        <div>
          <strong style={{ color: '#009688', fontSize: 14 }}>{pct}%</strong>
          <Progress percent={pct} size="small" strokeColor="#009688" showInfo={false} />
        </div>
      ),
    },
    {
      title: 'Giá trị vốn góp (Vốn ĐL)',
      dataIndex: 'capitalValue',
      key: 'capitalValue',
      width: 180,
      render: (val: number) => (
        <span style={{ fontWeight: 800, color: '#0F172A', fontSize: 13.5 }}>
          {val.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Cổ tức đã nhận lũy kế',
      dataIndex: 'paidDividends',
      key: 'paidDividends',
      width: 180,
      render: (val: number, record: EnterpriseShareholder) => (
        <div>
          <span style={{ color: '#16A34A', fontWeight: 700 }}>{val.toLocaleString('vi-VN')} ₫</span>
          <div style={{ fontSize: 11, color: '#D97706' }}>
            Dự kiến đợt tới: +{record.pendingDividend.toLocaleString('vi-VN')} ₫
          </div>
        </div>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseShareholder) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedShareholder(record);
            setDrawerOpen(true);
          }}
        >
          Sổ cổ đông
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Vốn điều lệ đăng ký kinh doanh</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalCharterCapital.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Mệnh giá niêm yết chuẩn: 10.000 ₫ / Cổ phần</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số lượng cổ phần phát hành</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {totalShares.toLocaleString('vi-VN')} CP
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Gồm 4 Cổ đông sáng lập &amp; Quỹ ESOP</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng cổ tức đã chi trả lũy kế</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalDividends.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tỷ suất cổ tức bình quân 20%/năm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Dự kiến chia cổ tức đợt tới</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {totalPendingDividends.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Dự kiến chi trả tháng 10/2026</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả cổ đông' },
            { key: 'Cổ đông sáng lập', label: 'Sáng lập', icon: <IdcardOutlined style={{ color: '#3B82F6' }} /> },
            { key: 'Cổ đông ESOP', label: 'ESOP', icon: <StarFilled style={{ color: '#F59E0B' }} /> },
            { key: 'Cổ đông chiến lược', label: 'Chiến lược', icon: <TeamOutlined style={{ color: '#10B981' }} /> },
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
            placeholder="Tìm theo tên cổ đông, mã, CCCD..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất sổ cổ đông ra Excel')}>
            Xuất Sổ Cổ Đông
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                shareholderCode: `CĐ-0${data.length + 1}`,
                type: 'Cổ đông chiến lược',
                sharesCount: 50000,
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Đăng ký cổ đông mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Đăng ký thêm cổ đông mới */}
      <Modal
        title="Đăng Ký Thêm Cổ Đông / Tăng Vốn Góp Điều Lệ"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="shareholderCode" label="Mã cổ đông" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="type" label="Loại hình cổ đông" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Cổ đông sáng lập', value: 'Cổ đông sáng lập' },
                  { label: 'Cổ đông chiến lược', value: 'Cổ đông chiến lược' },
                  { label: 'Cổ đông ESOP', value: 'Cổ đông ESOP' },
                  { label: 'Cổ đông phổ thông', value: 'Cổ đông phổ thông' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="fullName" label="Họ tên Cổ đông / Tên Quỹ đầu tư" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Quỹ Đầu Tư Công Nghệ NextTech" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="idNumber" label="Số CCCD / Mã số Doanh nghiệp ĐKKD" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: 001099008812" />
            </Form.Item>
            <Form.Item name="sharesCount" label="Số lượng cổ phần góp (10.000 ₫/CP)" rules={[{ required: true }]}>
              <Input type="number" min={1000} step={1000} />
            </Form.Item>
          </div>

          <Form.Item name="address" label="Địa chỉ thường trú / Trụ sở chính" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Tòa nhà Landmark 72, Hà Nội" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận ghi nhận vốn
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Giấy Chứng Nhận Cổ Phần & Cổ Tức */}
      <Drawer
        title="Giấy Chứng Nhận Sở Hữu Cổ Phần (Mẫu Chuẩn)"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedShareholder && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>SỔ CỔ ĐÔNG: {selectedShareholder.certificateNumber}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedShareholder.fullName}
                  </div>
                </div>
                <Tag color="cyan">{selectedShareholder.type}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                CCCD/ĐKKD: <code>{selectedShareholder.idNumber}</code> · Địa chỉ: {selectedShareholder.address}
              </div>
            </div>

            {/* Shares holding summary */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Tin Tỷ Lệ Sở Hữu Vốn Điều Lệ:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số cổ phần sở hữu:</span>
                  <strong style={{ color: '#1E40AF', fontSize: 14 }}>{selectedShareholder.sharesCount.toLocaleString('vi-VN')} Cổ phần</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tỷ lệ sở hữu biểu quyết:</span>
                  <strong style={{ color: '#009688', fontSize: 14 }}>{selectedShareholder.ownershipPercentage}% Vốn điều lệ</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Giá trị vốn điều lệ đăng ký:</span>
                  <strong style={{ color: '#0F172A', fontSize: 15 }}>{selectedShareholder.capitalValue.toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Cổ tức đã nhận lũy kế:</span>
                  <strong style={{ color: '#16A34A' }}>{selectedShareholder.paidDividends.toLocaleString('vi-VN')} ₫</strong>
                </div>
              </div>
            </div>

            {/* Dividend history */}
            <div style={{ border: '1px solid #BBF7D0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AuditOutlined /> Quyền Nhận Cổ Tức Đợt Tới (Năm 2026):
              </div>
              <div style={{ fontSize: 12.5, color: '#14532D', display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                <span>Cổ tức dự kiến chia:</span>
                <strong style={{ fontSize: 16, color: '#16A34A' }}>+{selectedShareholder.pendingDividend.toLocaleString('vi-VN')} ₫</strong>
              </div>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              icon={<PrinterOutlined />}
              onClick={() => message.success(`Đã in Giấy chứng nhận sở hữu cổ phần cho ${selectedShareholder.fullName}`)}
            >
              In Giấy Chứng Nhận Cổ Phần (Mẫu A4)
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

