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
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { completePlanMilestone, createPlanMilestone, planMilestoneExportRows, planMilestoneMetrics } from './planMilestoneRules';

interface Milestone {
  key: string;
  code: string;
  quarter: string;
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('plan_milestones');
      if (active) setData(Array.isArray(updated) ? updated : []);
    });
    void dataService.refreshGenericData('plan_milestones')
      .catch((error: any) => message.error(error?.response?.data?.message || 'Không tải được danh sách mốc kế hoạch.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; unsub(); };
  }, []);

  const [searchText, setSearchText] = useState('');
  const [filterQuarter, setFilterQuarter] = useState<string>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedMilestone, setSelectedMilestone] = useState<Milestone | null>(null);
  const [form] = Form.useForm();

  const metrics = planMilestoneMetrics(data);
  const handleMarkCompleted = async (key: string) => {
    const record = data.find((item) => item.key === key);
    if (!record || record.status === 'Đã đạt mốc' || saving) return;
    setSaving(true);
    try {
      const saved = await dataService.updateGenericRecord('plan_milestones', completePlanMilestone(record)) as Milestone;
      setSelectedMilestone((current) => current?.key === saved.key ? saved : current);
      message.success('Đã lưu xác nhận nghiệm thu mốc quan trọng.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu nghiệm thu mốc.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const newMls = createPlanMilestone(values, data);
      await dataService.createGenericRecord('plan_milestones', newMls);
      message.success(`Đã thêm mốc quan trọng: ${newMls.name}`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu mốc kế hoạch.');
    } finally {
      setSaving(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const milestoneYears = [...new Set([currentYear - 1, currentYear, currentYear + 1, ...data.map((item) => Number(item.quarter.split('/')[1])).filter(Number.isFinite)])];
  const quarterOptions = [...new Set([...data.map((item) => item.quarter), ...milestoneYears.flatMap((year) => [1, 2, 3, 4].map((quarter) => `Q${quarter}/${year}`))])]
    .sort((a, b) => Number(b.split('/')[1]) - Number(a.split('/')[1]) || Number(b.slice(1, b.indexOf('/'))) - Number(a.slice(1, a.indexOf('/'))));
  const openCreate = () => {
    let sequence = data.length + 1;
    let code = '';
    do { code = `MLS-${currentYear}-${String(sequence++).padStart(3, '0')}`; }
    while (data.some((item) => item.code.toLowerCase() === code.toLowerCase()));
    form.resetFields();
    const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
    form.setFieldsValue({ code, quarter: `Q${currentQuarter}/${currentYear}` });
    setModalOpen(true);
  };

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
              loading={saving}
              disabled={saving}
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng mốc chiến lược</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {metrics.totalCount} mốc
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Theo hồ sơ đang lưu</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã nghiệm thu hoàn thành 100%</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {metrics.completedCount} mốc hoàn tất
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Có trạng thái nghiệm thu</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đang trong lộ trình triển khai</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#EA580C', marginTop: 4 }}>
            {metrics.pendingCount} mốc chiến lược
          </div>
          <div style={{ fontSize: 11.5, color: '#EA580C', marginTop: 2 }}>Chưa nghiệm thu</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Mốc quá hạn</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: metrics.overdueCount ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {metrics.overdueCount} mốc
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{metrics.completionRate === null ? 'Chưa có dữ liệu nghiệm thu' : `Tỷ lệ nghiệm thu ${metrics.completionRate}%`}</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả các mốc' },
            ...quarterOptions.map((quarter) => ({ key: quarter, label: `Quý ${quarter.slice(1, quarter.indexOf('/'))} / ${quarter.split('/')[1]}` })),
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
            disabled={!filteredData.length}
            onClick={() => downloadFile('Danh_muc_moc_chien_luoc.pdf', generateValidPdfBlob('DANH MỤC MỐC CHIẾN LƯỢC', `${filteredData.length} mốc`, filteredData.map((item) => `${item.code} | ${item.quarter} | ${item.name} | ${item.status} | Hạn ${item.deadline}`)))}
          >
            Tải PDF A4
          </Button>
          <Button
            icon={<DownloadOutlined />}
            disabled={!filteredData.length}
            onClick={() => downloadFile('Danh_muc_moc_chien_luoc.xlsx', generateValidXlsxBlob(planMilestoneExportRows(filteredData)))}
          >
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm mốc quan trọng
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          loading={loading}
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
            <Form.Item name="code" label="Mã mốc" rules={[{ required: true, whitespace: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="quarter" label="Kỳ / Quý" rules={[{ required: true }]}>
              <Select
                options={quarterOptions.map((quarter) => ({ label: quarter, value: quarter }))}
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
            <Form.Item name="owner" label="Người phụ trách" rules={[{ required: true, whitespace: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="deadline" label="Hạn chót hoàn thành" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
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
                  loading={saving}
                  disabled={saving}
                  style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                  onClick={() => { void handleMarkCompleted(selectedMilestone.key); }}
                >
                  Xác nhận đạt mốc
                </Button>
              )}
              <Button
                icon={<PrinterOutlined />}
                style={{ flex: 1 }}
                onClick={() => downloadFile(`${selectedMilestone.code}_bien_ban_nghiem_thu.pdf`, generateValidPdfBlob('BIÊN BẢN NGHIỆM THU MỐC', `${selectedMilestone.code} | ${selectedMilestone.name}`, [
                  `Kỳ: ${selectedMilestone.quarter}`,
                  `Hạn hoàn thành: ${selectedMilestone.deadline}`,
                  `Người phụ trách: ${selectedMilestone.owner}`,
                  `Tiến độ: ${selectedMilestone.progress}%`,
                  `Trạng thái: ${selectedMilestone.status}`,
                  `Tiêu chuẩn nghiệm thu: ${selectedMilestone.acceptanceCriteria}`,
                  'Tài liệu được tạo từ hồ sơ lưu trong hệ thống.',
                ]))}
              >
                Tải biên bản PDF
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

