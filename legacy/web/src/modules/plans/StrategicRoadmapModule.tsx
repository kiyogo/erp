import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  AimOutlined,
  PrinterOutlined,
  EyeOutlined,
  DollarOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer } from '../../custom-ui';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { createStrategicOkr, strategicOkrExportRows, strategicOkrMetrics, strategicOkrStatus, updateStrategicOkrProgress } from './strategicRoadmapRules';

type OKRItem = import('./strategicRoadmapRules').StrategicOkrRecord;

const INITIAL_OKRS: OKRItem[] = [];

export const StrategicRoadmapModule: React.FC = () => {
  const [data, setData] = useState<OKRItem[]>(INITIAL_OKRS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('plan_okrs');
      if (active) setData(Array.isArray(updated) ? updated : []);
    });
    void dataService.refreshGenericData('plan_okrs')
      .catch((error: any) => message.error(error?.response?.data?.message || 'Không tải được danh sách OKR.'))
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; unsub(); };
  }, []);

  const [searchText, setSearchText] = useState('');
  const [filterPillar, setFilterPillar] = useState<string>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedOkr, setSelectedOkr] = useState<OKRItem | null>(null);
  const [form] = Form.useForm();
  const [progressForm] = Form.useForm();

  const [progressModalOpen, setProgressModalOpen] = useState(false);
  const metrics = strategicOkrMetrics(data);

  const handleCreate = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const newItem = createStrategicOkr(values, data);
      await dataService.createGenericRecord('plan_okrs', newItem);
      message.success(`Đã thêm mục tiêu chiến lược OKR: ${newItem.title}`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu mục tiêu OKR.');
    } finally {
      setSaving(false);
    }
  };

  const handleProgressUpdate = async (values: any) => {
    if (!selectedOkr || saving) return;
    setSaving(true);
    try {
      const updated = updateStrategicOkrProgress(selectedOkr, values.progressPct);
      const saved = await dataService.updateGenericRecord('plan_okrs', updated) as OKRItem;
      setSelectedOkr(saved);
      setProgressModalOpen(false);
      message.success(`Đã lưu tiến độ OKR ${saved.okrCode}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể cập nhật tiến độ OKR.');
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    let sequence = data.length + 1;
    let code = '';
    do { code = `OKR-${new Date().getFullYear()}-${String(sequence++).padStart(3, '0')}`; }
    while (data.some((item) => item.okrCode.trim().toLowerCase() === code.toLowerCase()));
    form.resetFields();
    form.setFieldsValue({ okrCode: code, pillar: 'Tăng trưởng Doanh thu', progressPct: 0 });
    setModalOpen(true);
  };

  const exportPdf = (records: OKRItem[], filename: string) => downloadFile(filename, generateValidPdfBlob(
    'LỘ TRÌNH CHIẾN LƯỢC OKR', `${records.length} mục tiêu`, records.map((record) =>
      `${record.okrCode} | ${record.title} | ${record.pillar} | ${record.owner} | ${record.progressPct}% | Hạn ${record.deadline} | ${strategicOkrStatus(Number(record.progressPct), record.deadline)}`,
    ),
  ));

  const filteredData = data.filter((item) => {
    const matchPillar = filterPillar === 'all' || item.pillar === filterPillar;
    const matchSearch =
      (item.okrCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.title || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.pillar || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.owner || '').toLowerCase().includes(searchText.toLowerCase());

    return matchPillar && matchSearch;
  });

  const columns = [
    {
      title: 'Mã OKR',
      dataIndex: 'okrCode',
      key: 'okrCode',
      width: 140,
      render: (code: string) => (
        <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'monospace' }}>
          <AimOutlined /> {code}
        </span>
      ),
    },
    {
      title: 'Mục tiêu chiến lược & Trụ cột',
      key: 'okr',
      render: (_: any, record: OKRItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.title}</div>
          <div style={{ fontSize: 12, color: '#1E40AF', marginTop: 2 }}>
            Trụ cột: <strong>{record.pillar}</strong> · Người phụ trách: <strong>{record.owner}</strong>
          </div>
        </div>
      ),
    },
    {
      title: 'Chỉ số đo lường',
      dataIndex: 'targetMetric',
      key: 'targetMetric',
      width: 260,
      render: (met: string) => (
        <span style={{ fontWeight: 600, color: '#334155', fontSize: 12.5 }}>
          {met}
        </span>
      ),
    },
    {
      title: 'Tiến độ thực hiện',
      key: 'progress',
      width: 180,
      render: (_: any, record: OKRItem) => (
        <div style={{ width: 150 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
            <span style={{ fontWeight: 800, color: '#009688' }}>{Number(record.progressPct) || 0}%</span>
            <span style={{ color: '#64748B' }}>Hạn: {record.deadline}</span>
          </div>
          <div style={{ background: '#E2E8F0', height: 6, borderRadius: 3, overflow: 'hidden' }}>
            <div
              style={{
                width: `${Math.max(0, Math.min(100, Number(record.progressPct) || 0))}%`,
                background: Number(record.progressPct) >= 90 ? '#16A34A' : Number(record.progressPct) >= 70 ? '#009688' : '#EA580C',
                height: '100%',
                borderRadius: 3,
              }}
            />
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (_status: string, record: OKRItem) => {
        const status = strategicOkrStatus(Number(record.progressPct), record.deadline);
        let color: any = 'processing';
        if (status === 'Hoàn thành') color = 'success';
        if (status === 'Cần tăng tốc') color = 'warning';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: OKRItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedOkr(record);
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
      {/* KPI metric cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tiến độ hoàn thành OKR bình quân</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {metrics.averageProgress === null ? 'Chưa có dữ liệu' : `${metrics.averageProgress}%`}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>{metrics.totalCount} mục tiêu có dữ liệu</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Mục tiêu hoàn thành</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {metrics.completedCount} mục tiêu
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tiến độ đạt 100%</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Trụ cột chiến lược then chốt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {metrics.pillarCount} trụ cột có mục tiêu
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>{metrics.totalCount} mục tiêu chiến lược</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Mục tiêu cần tăng tốc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {metrics.overdueCount} mục tiêu
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Hạn chót đã qua, tiến độ dưới 100%</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả OKR' },
            { key: 'Tăng trưởng Doanh thu', label: 'Doanh thu', icon: <DollarOutlined style={{ color: '#10B981' }} /> },
            { key: 'Hạ tầng Công nghệ & AI', label: 'Hạ tầng & AI', icon: <ThunderboltOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Tuân thủ An ninh & ISO', label: 'An ninh & ISO', icon: <SafetyCertificateOutlined style={{ color: '#10B981' }} /> },
            { key: 'Mở rộng Thị phần B2B', label: 'Thị phần B2B', icon: <TeamOutlined style={{ color: '#10B981' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setFilterPillar(tab.key)}
              style={{
                backgroundColor: filterPillar === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: filterPillar === tab.key ? '#009688' : '#CBD5E1',
                color: filterPillar === tab.key ? '#00796B' : '#475569',
                fontWeight: filterPillar === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo OKR, mục tiêu, trụ cột, người phụ trách..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />

          <Button
            icon={<PrinterOutlined />}
            disabled={!filteredData.length}
            onClick={() => exportPdf(filteredData, 'Lo_trinh_chien_luoc_OKR.pdf')}
          >
            In lộ trình
          </Button>

          <Button
            icon={<DownloadOutlined />}
            disabled={!filteredData.length}
            onClick={() => downloadFile('Danh_sach_muc_tieu_OKR.xlsx', generateValidXlsxBlob(strategicOkrExportRows(filteredData)))}
          >
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm mục tiêu OKR mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={columns}
          rowKey="key"
          loading={loading}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* Modal Add OKR */}
      <Modal
        title="Thêm mục tiêu chiến lược then chốt mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={540}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="okrCode" label="Mã OKR" rules={[{ required: true, message: 'Nhập mã OKR.' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="pillar" label="Trụ cột chiến lược" rules={[{ required: true, message: 'Chọn trụ cột chiến lược.' }]}>
              <Select
                options={[
                  { label: 'Tăng trưởng Doanh thu', value: 'Tăng trưởng Doanh thu' },
                  { label: 'Hạ tầng Công nghệ & AI', value: 'Hạ tầng Công nghệ & AI' },
                  { label: 'Tuân thủ An ninh & ISO', value: 'Tuân thủ An ninh & ISO' },
                  { label: 'Mở rộng Thị phần B2B', value: 'Mở rộng Thị phần B2B' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="title" label="Tiêu đề mục tiêu chiến lược" rules={[{ required: true, message: 'Nhập tiêu đề mục tiêu' }]}>
            <Input placeholder="Ví dụ: Mở rộng cụm máy chủ IDC 50 Rack" />
          </Form.Item>

          <Form.Item name="targetMetric" label="Chỉ số kết quả đo lường" rules={[{ required: true, message: 'Nhập chỉ số kết quả' }]}>
            <Input placeholder="Ví dụ: 50 Rack IDC" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <Form.Item name="owner" label="Phụ trách" rules={[{ required: true, message: 'Nhập người phụ trách.' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="progressPct" label="Tiến độ" rules={[{ required: true, message: 'Nhập tiến độ.' }]}>
              <Input type="number" min={0} max={100} />
            </Form.Item>
            <Form.Item name="deadline" label="Hạn chót" rules={[{ required: true, message: 'Chọn hạn chót.' }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu mục tiêu OKR
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi tiết mục tiêu OKR */}
      <Drawer
        title="Chi Tiết Mục Tiêu Chiến Lược OKR"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
      >
        {selectedOkr && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ OKR: {selectedOkr.okrCode}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {selectedOkr.title}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Trụ cột: <strong>{selectedOkr.pillar}</strong> · Thời hạn: <strong>{selectedOkr.deadline}</strong>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Chỉ Số Đo Lường &amp; Nhân Sự Phụ Trách:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Người phụ trách:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedOkr.owner}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tiến độ thực hiện:</span>
                  <span style={{ fontWeight: 800, color: '#009688' }}>{selectedOkr.progressPct}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Đánh giá:</span>
                  <Tag color={strategicOkrStatus(Number(selectedOkr.progressPct), selectedOkr.deadline) === 'Hoàn thành' ? 'success' : strategicOkrStatus(Number(selectedOkr.progressPct), selectedOkr.deadline) === 'Cần tăng tốc' ? 'warning' : 'processing'}>
                    {strategicOkrStatus(Number(selectedOkr.progressPct), selectedOkr.deadline)}
                  </Tag>
                </div>
                <div style={{ marginTop: 6 }}>
                  <span style={{ color: '#64748B' }}>Key Result:</span>
                  <div style={{ color: '#0F172A', marginTop: 4, background: '#F8FAFC', padding: 10, borderRadius: 6, fontWeight: 600 }}>
                    {selectedOkr.targetMetric}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => {
                  progressForm.setFieldsValue({ progressPct: selectedOkr.progressPct });
                  setProgressModalOpen(true);
                }}
              >
                Cập nhật tiến độ OKR
              </Button>
              <Button
                icon={<PrinterOutlined />}
                style={{ flex: 1 }}
                onClick={() => exportPdf([selectedOkr], `${selectedOkr.okrCode}_OKR.pdf`)}
              >
                In bản đồ OKR
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <Modal title="Cập nhật tiến độ OKR" open={progressModalOpen} onCancel={() => setProgressModalOpen(false)} footer={null} width={420}>
        <Form form={progressForm} layout="vertical" onFinish={handleProgressUpdate} style={{ marginTop: 14 }}>
          <Form.Item name="progressPct" label="Tiến độ (%)" rules={[{ required: true, message: 'Nhập tiến độ.' }]}>
            <Input type="number" min={0} max={100} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14 }}>
            <Button onClick={() => setProgressModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu tiến độ</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

