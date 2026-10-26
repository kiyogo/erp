import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  PrinterOutlined,
  ProjectOutlined,
  ClockCircleOutlined,
  RiseOutlined,
  UserOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';
import { dataService, PlanItem } from '../../services/dataService';

export const PlansModule: React.FC = () => {
  const [data, setData] = useState<PlanItem[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'in_progress' | 'completed' | 'on_track'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanItem | null>(null);
  const [form] = Form.useForm();

  const loadData = () => {
    setData(dataService.getPlans());
    dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreate = (values: any) => {
    dataService.addPlan({
      ...values,
      progress: Number(values.progress) || 10,
      status: 'Đúng hạn',
    });
    message.success(`Đã thêm kế hoạch dự án mới: ${values.title}`);
    setModalOpen(false);
    form.resetFields();
    loadData();
  };

  const completedCount = data.filter((p) => p.status === 'Hoàn thành' || p.progress === 100).length;
  const onTrackCount = data.filter((p) => p.status === 'Đúng hạn').length;
  const avgProgress = data.length > 0 ? Math.round(data.reduce((sum, p) => sum + (p.progress || 0), 0) / data.length) : 0;

  const filteredData = data.filter((p) => {
    let matchTab = true;
    if (filterTab === 'completed') matchTab = p.status === 'Hoàn thành' || p.progress === 100;
    else if (filterTab === 'in_progress') matchTab = p.progress < 100;
    else if (filterTab === 'on_track') matchTab = p.status === 'Đúng hạn';

    const matchSearch =
      (p.title || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (p.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (p.manager || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (p.department || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const columns = [
    {
      title: 'Mã kế hoạch',
      dataIndex: 'code',
      key: 'code',
      width: 120,
      render: (code: string) => (
        <span style={{ fontWeight: 700, color: '#009688', fontFamily: 'monospace' }}>
          {code}
        </span>
      ),
    },
    {
      title: 'Tên kế hoạch & Mục tiêu chiến lược',
      key: 'title',
      render: (_: any, record: PlanItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ProjectOutlined style={{ color: '#009688' }} /> {record.title}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Phòng ban: <strong>{record.department}</strong></div>
        </div>
      ),
    },
    {
      title: 'Người phụ trách',
      dataIndex: 'manager',
      key: 'manager',
      width: 160,
      render: (m: string) => (
        <span style={{ fontWeight: 600, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: 6 }}>
          <UserOutlined /> {m}
        </span>
      ),
    },
    {
      title: 'Tiến độ thực hiện',
      dataIndex: 'progress',
      key: 'progress',
      width: 200,
      render: (pct: number) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, background: '#E2E8F0', height: 8, borderRadius: 4, overflow: 'hidden' }}>
            <div
              style={{
                width: `${pct}%`,
                background: pct === 100 ? '#16A34A' : '#009688',
                height: '100%',
                borderRadius: 4,
              }}
            />
          </div>
          <span style={{ fontWeight: 700, fontSize: 12.5, minWidth: 40, color: pct === 100 ? '#16A34A' : '#0F172A' }}>
            {pct}%
          </span>
        </div>
      ),
    },
    {
      title: 'Thời gian',
      key: 'dates',
      width: 180,
      render: (_: any, record: PlanItem) => (
        <span style={{ color: '#64748B', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
          <ClockCircleOutlined /> {record.startDate} → {record.endDate}
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => (
        <Tag color={status === 'Hoàn thành' ? 'success' : status === 'Đúng hạn' ? 'processing' : 'warning'}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: PlanItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedPlan(record);
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng kế hoạch chiến lược</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} kế hoạch
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Mục tiêu OKRs trọng tâm năm 2026</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tiến độ bình quân toàn doanh nghiệp</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {avgProgress}% hoàn thành
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>{onTrackCount} kế hoạch bám sát tiến độ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Kế hoạch đã về đích thành công</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {completedCount} kế hoạch
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Đạt 100% nghiệm thu từ Ban Giám Đốc</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ thực thi đúng hạn</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            94.8% cam kết
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Không có rủi ro chậm trễ critical</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả kế hoạch' },
            { key: 'in_progress', label: 'Đang triển khai', icon: <RocketOutlined style={{ color: '#6366F1' }} /> },
            { key: 'on_track', label: 'Đúng hạn', icon: <ClockCircleOutlined style={{ color: '#0284C7' }} /> },
            { key: 'completed', label: 'Đã hoàn thành', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
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
            placeholder="Tìm theo tên kế hoạch, mã dự án, người phụ trách..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<ReloadOutlined />} onClick={loadData}>
            Làm mới
          </Button>

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh mục kế hoạch ra Excel')}>
            Xuất Excel
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
            Lập kế hoạch mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={columns}
          rowKey="key"
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* Modal */}
      <Modal
        title="Lập Kế Hoạch / Dự Án Chiến Lược Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <Form.Item name="code" label="Mã kế hoạch" initialValue={`KH-2026-${String(Date.now()).slice(-3)}`}>
            <Input />
          </Form.Item>
          <Form.Item name="title" label="Tiêu đề kế hoạch / Dự án" rules={[{ required: true, message: 'Nhập tiêu đề' }]}>
            <Input placeholder="Ví dụ: Nâng cấp hệ thống bảo mật đám mây Q4" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="manager" label="Người phụ trách" rules={[{ required: true, message: 'Nhập người quản lý' }]}>
              <Input placeholder="Ví dụ: Trần Tuấn Anh" />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban chủ trì" rules={[{ required: true, message: 'Vui lòng chọn phòng ban' }]}>
              <Select
                placeholder="Chọn phòng ban chủ trì..."
                options={departmentOptions}
              />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="startDate" label="Ngày bắt đầu" initialValue="2026-09-01">
              <Input type="date" />
            </Form.Item>
            <Form.Item name="endDate" label="Hạn hoàn thành" initialValue="2026-12-31">
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item name="progress" label="Tiến độ ban đầu" initialValue={0}>
            <Input type="number" min={0} max={100} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Tạo kế hoạch
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi tiết kế hoạch */}
      <Drawer
        title="Hồ Sơ Kế Hoạch &amp; Mục Tiêu Chiến Lược"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedPlan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ KẾ HOẠCH: {selectedPlan.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedPlan.title}
                  </div>
                </div>
                <Tag color={selectedPlan.status === 'Hoàn thành' ? 'success' : 'processing'}>
                  {selectedPlan.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Đơn vị: <strong>{selectedPlan.department}</strong> · Quản lý: <strong>{selectedPlan.manager}</strong>
              </div>
            </div>

            {/* Progress Card */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Tiến Độ Tổng Thể &amp; Thời Gian Triển Khai:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <Progress percent={selectedPlan.progress} strokeColor="#009688" />
              </div>
              <div style={{ fontSize: 12.5, color: '#64748B' }}>
                Thời gian thực hiện: <strong>{selectedPlan.startDate}</strong> đến <strong>{selectedPlan.endDate}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => message.success(`Đang mở danh sách nhiệm vụ con của kế hoạch ${selectedPlan.code}`)}
              >
                Xem Nhiệm Vụ Con
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in bản kế hoạch dự án ${selectedPlan.code}`)}
              >
                In Kế Hoạch (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

