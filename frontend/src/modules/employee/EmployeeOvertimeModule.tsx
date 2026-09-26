import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  PrinterOutlined,
  EyeOutlined,
  DollarOutlined,
  CalendarOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';
import { dataService } from '../../services/dataService';

export const EmployeeOvertimeModule: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'weekday' | 'weekend' | 'holiday'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedOT, setSelectedOT] = useState<any | null>(null);
  const [form] = Form.useForm();

  const loadData = () => {
    setData(dataService.getEmployeeOvertime());
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = (values: any) => {
    dataService.addEmployeeOvertime({
      ...values,
      hours: Number(values.hours) || 1,
      approver: 'Chờ phân công duyệt',
    });
    message.success('Đã đăng ký làm thêm giờ (OT) thành công!');
    setModalOpen(false);
    form.resetFields();
    loadData();
  };

  const totalHours = data.filter((d) => d.status === 'Đã duyệt').reduce((acc, d) => acc + (d.hours || 0), 0);

  const filteredData = data.filter((d) => {
    let matchTab = true;
    if (filterTab === 'weekday') {
      matchTab = (d.multiplier || '').includes('150%');
    } else if (filterTab === 'weekend') {
      matchTab = (d.multiplier || '').includes('200%');
    } else if (filterTab === 'holiday') {
      matchTab = (d.multiplier || '').includes('300%');
    }

    const matchSearch =
      (d.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (d.reason || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (d.project || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const columns = [
    {
      title: 'Mã đăng ký',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (c: string) => (
        <span style={{ fontWeight: 700, color: '#009688', fontFamily: 'monospace' }}>
          {c}
        </span>
      ),
    },
    {
      title: 'Ngày làm thêm',
      dataIndex: 'date',
      key: 'date',
      width: 130,
      render: (d: string) => <span style={{ fontWeight: 600, color: '#0F172A' }}>{d}</span>,
    },
    {
      title: 'Khung giờ & Số tiếng',
      key: 'time',
      width: 200,
      render: (_: any, record: any) => (
        <span style={{ color: '#64748B', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <CalendarOutlined style={{ color: '#009688' }} />
          {record.fromTime || '18:00'} ➔ {record.toTime || '21:30'} (<strong>{record.hours}h</strong>)
        </span>
      ),
    },
    {
      title: 'Hệ số tính lương',
      dataIndex: 'multiplier',
      key: 'multiplier',
      width: 170,
      render: (m: string) => (
        <Tag color={m?.includes('300%') ? 'red' : m?.includes('200%') ? 'orange' : 'blue'}>
          {m || '150%'}
        </Tag>
      ),
    },
    {
      title: 'Dự án / Hạng mục',
      dataIndex: 'project',
      key: 'project',
      render: (p: string) => <span style={{ fontWeight: 600, color: '#1E40AF', fontSize: 13 }}>{p}</span>,
    },
    {
      title: 'Lý do & Nội dung OT',
      dataIndex: 'reason',
      key: 'reason',
      render: (r: string) => <span style={{ color: '#475569', fontSize: 12.5 }}>{r}</span>,
    },
    {
      title: 'Người duyệt',
      dataIndex: 'approver',
      key: 'approver',
      width: 160,
      render: (a: string) => <span style={{ color: '#009688', fontWeight: 500, fontSize: 12.5 }}>{a}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Tag color={status === 'Đã duyệt' ? 'success' : 'warning'}>
          {status || 'Chờ duyệt'}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: any) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedOT(record);
            setDrawerOpen(true);
          }}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giờ OT đã được phê duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalHours} Giờ
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Được tính thẳng vào kỳ trả lương tháng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hệ số làm thêm ngày thường</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            150% (x1.5)
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Áp dụng ngoài giờ hành chính</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hệ số ngày nghỉ cuối tuần</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#EA580C', marginTop: 4 }}>
            200% (x2.0)
          </div>
          <div style={{ fontSize: 11.5, color: '#EA580C', marginTop: 2 }}>Thứ Bảy &amp; Chủ Nhật theo phê duyệt</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hệ số ngày Lễ, Tết hưởng lương</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            300% (x3.0)
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Phụ cấp đặc thù ca trực hệ thống</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả đăng ký' },
            { key: 'weekday', label: 'Ngày thường (150%)', icon: <ClockCircleOutlined style={{ color: '#6366F1' }} /> },
            { key: 'weekend', label: 'Cuối tuần (200%)', icon: <ThunderboltOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'holiday', label: 'Ngày Lễ Tết (300%)', icon: <TrophyOutlined style={{ color: '#F59E0B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setFilterTab(tab.key as any)}
              style={{
                backgroundColor: filterTab === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: filterTab === tab.key ? '#009688' : '#CBD5E1',
                color: filterTab === tab.key ? '#00796B' : '#475569',
                fontWeight: filterTab === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã đăng ký, dự án, lý do..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />

          <Button icon={<ReloadOutlined />} onClick={loadData}>
            Làm mới
          </Button>

          <Button
            icon={<PrinterOutlined />}
            onClick={() => message.success('Đã in bảng tổng hợp làm thêm giờ OT (A4)')}
          >
            In Phiếu OT (A4)
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Đăng ký làm thêm (OT)
          </Button>
        </div>
      </div>

      {/* OT History Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={columns}
          rowKey="key"
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* Create Modal */}
      <Modal
        title="Đăng Ký Làm Thêm Giờ (Overtime - OT)"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={540}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <Form.Item name="date" label="Ngày làm thêm giờ" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="hours" label="Số giờ làm thêm dự kiến (tiếng)" rules={[{ required: true }]}>
            <Input type="number" min="0.5" step="0.5" placeholder="Ví dụ: 2.5 hoặc 4" />
          </Form.Item>
          <Form.Item name="multiplier" label="Loại ngày làm thêm & Hệ số tính lương" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Làm thêm ngày thường (150% lương)', value: '150% (Ngày thường)' },
                { label: 'Làm thêm ngày nghỉ hàng tuần / Thứ 7 & CN (200% lương)', value: '200% (Cuối tuần)' },
                { label: 'Làm thêm ngày Lễ, Tết có hưởng lương (300% lương)', value: '300% (Ngày Lễ/Tết)' },
              ]}
            />
          </Form.Item>
          <Form.Item name="project" label="Dự án / Hạng mục phát triển" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Triển khai Core Banking Q3/2026..." />
          </Form.Item>
          <Form.Item name="reason" label="Nội dung công việc & Mục tiêu OT" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="Mô tả công việc cần xử lý gấp trong ca OT..." />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Gửi đăng ký OT
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi tiết làm thêm giờ */}
      <Drawer
        title="Chi Tiết Ca Làm Thêm Giờ (OT)"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
      >
        {selectedOT && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ PHIẾU: {selectedOT.code}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                Dự án: {selectedOT.project}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Thời gian: <strong>{selectedOT.date}</strong> · Số giờ: <strong>{selectedOT.hours} giờ</strong> (Hệ số: {selectedOT.multiplier})
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Tin Phê Duyệt &amp; Thù Lao:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Người duyệt ca:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedOT.approver}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Trạng thái:</span>
                  <Tag color={selectedOT.status === 'Đã duyệt' ? 'success' : 'warning'}>
                    {selectedOT.status || 'Chờ duyệt'}
                  </Tag>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Nội dung chi tiết:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedOT.reason}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => message.success(`Đang in phiếu đăng ký làm thêm ${selectedOT.code} ra bản giấy A4...`)}
              >
                In Phiếu OT (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
