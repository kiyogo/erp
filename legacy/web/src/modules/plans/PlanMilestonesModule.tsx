import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  FlagOutlined,
  TrophyOutlined,
  PrinterOutlined,
  EyeOutlined,
  CalendarOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer } from '../../custom-ui';

interface Milestone {
  key: string;
  code: string;
  quarter: 'Q1/2026' | 'Q2/2026' | 'Q3/2026' | 'Q4/2026';
  name: string;
  acceptanceCriteria: string;
  owner: string;
  deadline: string;
  progress: number;
  status: 'Đã đạt mốc' | 'Đang thực hiện' | 'Chưa bắt đầu';
}

const INITIAL_MILESTONES: Milestone[] = [];

export const PlanMilestonesModule: React.FC = () => {
  const [data, setData] = useState<Milestone[]>(INITIAL_MILESTONES);

  useEffect(() => {
    const list = dataService.getGenericData('plan_milestones');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('plan_milestones');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [filterQuarter, setFilterQuarter] = useState<'all' | 'Q1/2026' | 'Q2/2026' | 'Q3/2026' | 'Q4/2026' | 'done'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [form] = Form.useForm();

  const handleMarkCompleted = (key: string) => {
    const updated = data.map((item) =>
      item.key === key ? { ...item, progress: 100, status: 'Đã đạt mốc' as const } : item
    );
    setData(updated);
    dataService.saveGenericData('plan_milestones', updated);
    message.success('Đã xác nhận nghiệm thu mốc quan trọng!');
  };

  const handleCreate = (values: any) => {
    const newMls: Milestone = {
      ...values,
      key: String(Date.now()),
      progress: 0,
      status: 'Đang thực hiện',
    };
    const nextItems = [newMls, ...data]; setData(nextItems); dataService.saveGenericData('plan_milestones', nextItems);
    message.success(`Đã thêm mốc quan trọng: ${values.name}`);
    setModalOpen(false);
    form.resetFields();
  };

  const completedCount = data.filter((d) => d.status === 'Đã đạt mốc').length;
  const inProgressCount = data.filter((d) => d.status === 'Đang thực hiện').length;

  const filteredData = data.filter((item) => {
    let matchFilter = true;
    if (filterQuarter === 'done') {
      matchFilter = item.status === 'Đã đạt mốc';
    } else if (filterQuarter !== 'all') {
      matchFilter = item.quarter === filterQuarter;
    }

    const matchSearch =
      (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.owner || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.acceptanceCriteria || '').toLowerCase().includes(searchText.toLowerCase());

    return matchFilter && matchSearch;
  });

  const columns = [
    {
      title: 'Mã mốc',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (code: string) => (
        <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'monospace' }}>
          <FlagOutlined /> {code}
        </span>
      ),
    },
    {
      title: 'Kỳ / Quý',
      dataIndex: 'quarter',
      key: 'quarter',
      width: 110,
      render: (q: string) => (
        <Tag color="blue">{q}</Tag>
      ),
    },
    {
      title: 'Tên mốc quan trọng & Tiêu chuẩn nghiệm thu',
      key: 'nameCriteria',
      render: (_: any, record: Milestone) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.name}</div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>Tiêu chuẩn: {record.acceptanceCriteria}</div>
        </div>
      ),
    },
    {
      title: 'Người phụ trách',
      dataIndex: 'owner',
      key: 'owner',
      width: 180,
      render: (o: string) => <span style={{ fontWeight: 500, color: '#1E40AF', fontSize: 13 }}>{o}</span>,
    },
    {
      title: 'Hạn hoàn thành',
      dataIndex: 'deadline',
      key: 'deadline',
      width: 130,
      render: (d: string) => <span style={{ fontSize: 12.5, color: '#64748B' }}>{d}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => {
        const isDone = status === 'Đã đạt mốc';
        return (
          <Tag color={isDone ? 'success' : 'warning'}>
            {isDone ? <CheckCircleOutlined /> : <ClockCircleOutlined />} {status}
          </Tag>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 180,
      render: (_: any, record: Milestone) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedMilestone(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
          </Button>
          {record.status !== 'Đã đạt mốc' && (
            <Button
              size="small"
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              onClick={() => handleMarkCompleted(record.key)}
            >
              Nghiệm thu
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Mốc chiến lược năm 2026</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} mốc trọng điểm
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Phủ sóng toàn bộ 4 quý kinh doanh</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã nghiệm thu hoàn thành 100%</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {completedCount} mốc hoàn tất
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đạt chuẩn nghiệm thu hội đồng chuyên môn</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đang trong lộ trình triển khai</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#EA580C', marginTop: 4 }}>
            {inProgressCount} mốc chiến lược
          </div>
          <div style={{ fontSize: 11.5, color: '#EA580C', marginTop: 2 }}>Giám sát tiến độ định kỳ hàng tuần</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ đạt mục tiêu OKR quý</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            94.5% Đạt chuẩn
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Theo hệ quy chiếu hiệu suất ISO</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả các mốc' },
            { key: 'Q1/2026', label: 'Quý 1' },
            { key: 'Q2/2026', label: 'Quý 2' },
            { key: 'Q3/2026', label: 'Quý 3' },
            { key: 'Q4/2026', label: 'Quý 4' },
            { key: 'done', label: 'Đã nghiệm thu', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setFilterQuarter(tab.key as any)}
              style={{
                backgroundColor: filterQuarter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: filterQuarter === tab.key ? '#009688' : '#CBD5E1',
                color: filterQuarter === tab.key ? '#00796B' : '#475569',
                fontWeight: filterQuarter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mốc, tiêu chuẩn, người phụ trách..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />

          <Button
            icon={<PrinterOutlined />}
            onClick={() => message.success('Đã in danh mục mốc chiến lược & biên bản nghiệm thu (A4)')}
          >
            In Biên Bản (A4)
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
            Thêm mốc quan trọng
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

      {/* Modal Add Milestone */}
      <Modal
        title="Thêm mới mốc quan trọng"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={540}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã mốc" initialValue={`MLS-Q3-0${data.length + 1}`} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="quarter" label="Kỳ / Quý" initialValue="Q3/2026">
              <Select
                options={[
                  { label: 'Q1/2026', value: 'Q1/2026' },
                  { label: 'Q2/2026', value: 'Q2/2026' },
                  { label: 'Q3/2026', value: 'Q3/2026' },
                  { label: 'Q4/2026', value: 'Q4/2026' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="name" label="Tên mốc quan trọng" rules={[{ required: true, message: 'Nhập tên mốc' }]}>
            <Input placeholder="Ví dụ: Hoàn tất kiểm thử tải hệ thống Cloud 50,000 CCU" />
          </Form.Item>

          <Form.Item name="acceptanceCriteria" label="Tiêu chuẩn nghiệm thu" rules={[{ required: true, message: 'Nhập tiêu chuẩn' }]}>
            <Input.TextArea rows={3} placeholder="Điều kiện để được xem là hoàn thành mốc..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="owner" label="Người phụ trách" initialValue="Trần Tuấn Anh (CTO)" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="deadline" label="Hạn chót hoàn thành" initialValue="2026-09-30" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Tạo mốc quan trọng
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi tiết mốc quan trọng */}
      <Drawer
        title="Chi Tiết Mốc Chiến Lược & Nghiệm Thu"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
      >
        {selectedMilestone && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ MỐC: {selectedMilestone.code}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {selectedMilestone.name}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Kỳ: <strong>{selectedMilestone.quarter}</strong> · Hạn chót: <strong>{selectedMilestone.deadline}</strong>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Tiêu Chuẩn Nghiệm Thu &amp; Nhân Sự:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Người phụ trách chính:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedMilestone.owner}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Trạng thái:</span>
                  <Tag color={selectedMilestone.status === 'Đã đạt mốc' ? 'success' : 'warning'}>
                    {selectedMilestone.status}
                  </Tag>
                </div>
                <div style={{ marginTop: 6 }}>
                  <span style={{ color: '#64748B' }}>Tiêu chuẩn đánh giá:</span>
                  <div style={{ color: '#0F172A', marginTop: 4, background: '#F8FAFC', padding: 10, borderRadius: 6 }}>
                    {selectedMilestone.acceptanceCriteria}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              {selectedMilestone.status !== 'Đã đạt mốc' && (
                <Button
                  type="primary"
                  style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                  onClick={() => {
                    handleMarkCompleted(selectedMilestone.key);
                    setSelectedMilestone({ ...selectedMilestone, status: 'Đã đạt mốc', progress: 100 });
                  }}
                >
                  Xác nhận đạt mốc
                </Button>
              )}
              <Button
                icon={<PrinterOutlined />}
                style={{ flex: 1 }}
                onClick={() => message.success(`Đang in biên bản nghiệm thu ${selectedMilestone.code} ra bản giấy A4...`)}
              >
                In Biên Bản (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

