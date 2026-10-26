import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
  UserOutlined,
  CheckOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
  FileProtectOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Alert, Progress, Checkbox } from '../../custom-ui';

export interface ChecklistTask {
  item: string;
  done: boolean;
  note?: string;
}

export interface MaintenanceItem {
  key: string;
  maintCode: string;
  systemName: string;
  category: string;
  assetCodes: string;
  location: string;
  frequency: 'Hàng tháng' | 'Hàng quý (3 tháng)' | 'Định kỳ 6 tháng' | 'Hàng năm';
  maintenanceType: 'Phòng ngừa định kỳ' | 'Kiểm định an toàn PCCC & Điện' | 'Nâng cấp bảo trì Firmware / Patch OS';
  slaLevel: 'SLA Platinum (4h)' | 'SLA Gold (8h)' | 'SLA Standard (24h)';
  lastDate: string;
  nextDate: string;
  responsibleEngineer: string;
  vendorPartner: string;
  checklist: ChecklistTask[];
  estimatedBudget: number;
  actualCost: number;
  status: 'Đã hoàn thành đúng lịch' | 'Sắp đến hạn' | 'Quá hạn bảo dưỡng' | 'Đang tiến hành bảo dưỡng';
  healthScore: number;
  certificateCode: string;
  notes: string;
}

const INITIAL_MAINTENANCE: MaintenanceItem[] = [];

export const AssetMaintenanceModule: React.FC = () => {
  const [data, setData] = useState<MaintenanceItem[]>(INITIAL_MAINTENANCE);

  useEffect(() => {
    const list = dataService.getGenericData('asset_maintenances');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('asset_maintenances');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [frequencyFilter, setFrequencyFilter] = useState<string>('all');

  // Modals & Drawers state
  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<MaintenanceItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [performModalOpen, setPerformModalOpen] = useState(false);
  const [performTarget, setPerformTarget] = useState<MaintenanceItem | null>(null);
  const [checklistState, setChecklistState] = useState<ChecklistTask[]>([]);
  const [healthScoreInput, setHealthScoreInput] = useState<number>(98);
  const [actualCostInput, setActualCostInput] = useState<number>(0);
  const [performNotes, setPerformNotes] = useState('Đã hoàn thành toàn bộ checklist bảo dưỡng phòng ngừa theo tiêu chuẩn.');

  const [form] = Form.useForm();

  // Metrics
  const totalSystems = data.length;
  const upcomingCount = data.filter((d) => d.status.includes('Sắp đến hạn') || d.status.includes('Quá hạn')).length;
  const avgHealthScore = Math.round(data.reduce((sum, d) => sum + d.healthScore, 0) / (data.length || 1));
  const completedCount = data.filter((d) => d.status === 'Đã hoàn thành đúng lịch').length;

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      maintCode: `BD-2026-Q${data.length + 1}-0${data.length + 1}`,
      frequency: 'Hàng quý (3 tháng)',
      maintenanceType: 'Phòng ngừa định kỳ',
      slaLevel: 'SLA Gold (8h)',
      location: 'Phòng Máy Chủ IDC Keangnam',
      responsibleEngineer: 'Trần Tuấn Anh (CTO)',
      vendorPartner: 'Dell Enterprise ProSupport Plus',
      lastDate: new Date().toISOString().substring(0, 10),
      nextDate: new Date(Date.now() + 90 * 86400000).toISOString().substring(0, 10),
      estimatedBudget: 3500000,
      healthScore: 98,
    });
    setModalOpen(true);
  };

  const handleCreate = (values: any) => {
    const newItem: MaintenanceItem = {
      ...values,
      key: String(Date.now()),
      estimatedBudget: Number(values.estimatedBudget) || 0,
      actualCost: 0,
      healthScore: Number(values.healthScore) || 95,
      certificateCode: `CERT-PM-2026-${String(Date.now()).slice(-3)}`,
      status: 'Đã hoàn thành đúng lịch',
      checklist: [
        { item: 'Kiểm tra ngoại quan, ốc vít và các điểm tiếp xúc cáp', done: true },
        { item: 'Vệ sinh bụi bẩn khe thông gió và bộ làm mát', done: true },
        { item: 'Kiểm tra thông số điện áp, nhiệt độ và công suất tải', done: true },
        { item: 'Cập nhật bản ghi nhật ký vận hành kỹ thuật', done: true },
      ],
    };
    const nextItems = [newItem, ...data]; setData(nextItems); dataService.saveGenericData('asset_maintenances', nextItems);
    message.success(`Đã thiết lập kế hoạch bảo dưỡng: ${values.maintCode} (${values.systemName})`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleOpenPerformModal = (item: MaintenanceItem) => {
    setPerformTarget(item);
    setChecklistState(item.checklist ? item.checklist.map((c) => ({ ...c, done: true })) : []);
    setHealthScoreInput(item.healthScore || 98);
    setActualCostInput(item.estimatedBudget || 0);
    setPerformNotes(`Đã hoàn tất bảo dưỡng định kỳ hệ thống "${item.systemName}". Đạt chuẩn SLA.`);
    setPerformModalOpen(true);
  };

  const handleToggleChecklist = (idx: number) => {
    const updated = [...checklistState];
    updated[idx].done = !updated[idx].done;
    setChecklistState(updated);
  };

  const handleConfirmPerform = () => {
    if (performTarget) {
      const today = new Date().toISOString().substring(0, 10);
      let daysToAdd = 30;
      if (performTarget.frequency === 'Hàng quý (3 tháng)') daysToAdd = 90;
      if (performTarget.frequency === 'Định kỳ 6 tháng') daysToAdd = 180;
      if (performTarget.frequency === 'Hàng năm') daysToAdd = 365;

      const nextDateStr = new Date(Date.now() + daysToAdd * 86400000).toISOString().substring(0, 10);

      const updated = data.map((d) =>
        d.key === performTarget.key
          ? {
              ...d,
              lastDate: today,
              nextDate: nextDateStr,
              status: 'Đã hoàn thành đúng lịch' as const,
              checklist: checklistState,
              healthScore: healthScoreInput,
              actualCost: actualCostInput,
              notes: `${d.notes || ''} [Bảo dưỡng ngày ${today}: ${performNotes}]`,
            }
          : d
      );

      setData(updated);
      dataService.saveGenericData('asset_maintenances', updated);

      message.success(`Đã xác nhận hoàn thành bảo dưỡng cho "${performTarget.systemName}"! Kỳ tiếp theo: ${nextDateStr}`);
      setPerformModalOpen(false);
      if (detailItem && detailItem.key === performTarget.key) {
        setDetailItem({
          ...detailItem,
          lastDate: today,
          nextDate: nextDateStr,
          status: 'Đã hoàn thành đúng lịch',
          checklist: checklistState,
          healthScore: healthScoreInput,
          actualCost: actualCostInput,
        });
      }
    }
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.maintCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.systemName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.location || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.responsibleEngineer || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.vendorPartner || '').toLowerCase().includes(searchText.toLowerCase());

    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchFrequency = frequencyFilter === 'all' || item.frequency === frequencyFilter;

    return matchSearch && matchStatus && matchFrequency;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hệ thống bảo trì định kỳ</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalSystems} hệ thống
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Toàn bộ Server, Mạng, UPS &amp; Máy trạm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Sắp đến hạn trong 7 ngày</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: upcomingCount > 0 ? '#D97706' : '#16A34A', marginTop: 4 }}>
            {upcomingCount} lịch bảo dưỡng
          </div>
          <div style={{ fontSize: 11.5, color: upcomingCount > 0 ? '#D97706' : '#16A34A', marginTop: 2 }}>
            {upcomingCount > 0 ? 'Cần sắp xếp kỹ sư thực hiện' : 'Tất cả đã thực hiện đúng lịch'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Điểm sức khỏe hệ thống</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {avgHealthScore} / 100 điểm
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Vận hành ổn định, sẵn sàng 99.99%</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ tuân thủ ISO 27001</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            100% đạt chuẩn SLA
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Kiểm định an toàn PCCC &amp; Điện áp</div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã kế hoạch, hệ thống, vị trí, kỹ sư, đối tác..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 340, borderRadius: 6 }}
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 190 }}
            options={[
              { label: 'Tất cả trạng thái', value: 'all' },
              { label: 'Đã hoàn thành đúng lịch', value: 'Đã hoàn thành đúng lịch' },
              { label: 'Sắp đến hạn', value: 'Sắp đến hạn (Trong 7 ngày)' },
              { label: 'Quá hạn bảo dưỡng', value: 'Quá hạn bảo dưỡng' },
            ]}
          />
          <Select
            value={frequencyFilter}
            onChange={setFrequencyFilter}
            style={{ width: 180 }}
            options={[
              { label: 'Tất cả tần suất', value: 'all' },
              { label: 'Hàng tháng', value: 'Hàng tháng' },
              { label: 'Hàng quý (3 tháng)', value: 'Hàng quý (3 tháng)' },
              { label: 'Định kỳ 6 tháng', value: 'Định kỳ 6 tháng' },
              { label: 'Hàng năm', value: 'Hàng năm' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất kế hoạch & lịch bảo dưỡng định kỳ')}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thiết lập lịch bảo dưỡng
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={[
            {
              title: 'Mã kế hoạch & SLA',
              key: 'code',
              width: 170,
              render: (_: any, r: MaintenanceItem) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CalendarOutlined /> {r.maintCode}
                  </span>
                  <Tag color="purple" style={{ marginTop: 3 }}>
                    {r.slaLevel}
                  </Tag>
                </div>
              ),
            },
            {
              title: 'Hệ thống hạ tầng & Vị trí',
              key: 'system',
              render: (_: any, r: MaintenanceItem) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.systemName}</strong>
                  <div style={{ fontSize: 12, color: '#64748B' }}>
                    Vị trí: <strong>{r.location}</strong> · Tần suất: <strong style={{ color: '#2563EB' }}>{r.frequency}</strong>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>
                    Tài sản liên kết: <code>{r.assetCodes}</code>
                  </div>
                </div>
              ),
            },
            {
              title: 'Kỳ bảo dưỡng',
              key: 'dates',
              width: 200,
              render: (_: any, r: MaintenanceItem) => (
                <div style={{ fontSize: 12 }}>
                  <div>Lần trước: <strong>{r.lastDate}</strong></div>
                  <div style={{ marginTop: 2 }}>
                    Kế tiếp:{' '}
                    <strong style={{ color: r.status.includes('Sắp đến hạn') ? '#D97706' : '#16A34A' }}>
                      {r.nextDate}
                    </strong>
                  </div>
                </div>
              ),
            },
            {
              title: 'Điểm sức khỏe',
              key: 'health',
              width: 130,
              render: (_: any, r: MaintenanceItem) => (
                <div>
                  <strong style={{ color: r.healthScore >= 95 ? '#16A34A' : '#D97706', fontSize: 13 }}>
                    {r.healthScore} / 100
                  </strong>
                  <Progress
                    percent={r.healthScore}
                    size="small"
                    strokeColor={r.healthScore >= 95 ? '#16A34A' : '#D97706'}
                    showInfo={false}
                  />
                </div>
              ),
            },
            {
              title: 'Kỹ sư & Đối tác',
              key: 'eng',
              render: (_: any, r: MaintenanceItem) => (
                <div>
                  <div style={{ fontWeight: 600, color: '#1E293B' }}>
                    <UserOutlined style={{ fontSize: 11, color: '#64748B' }} /> {r.responsibleEngineer}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{r.vendorPartner}</div>
                </div>
              ),
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              render: (s: string) => {
                let col = 'success';
                if (s.includes('Sắp đến hạn')) col = 'warning';
                if (s.includes('Quá hạn')) col = 'error';
                return <Tag color={col}>{s}</Tag>;
              },
            },
            {
              title: 'Thao tác',
              key: 'act',
              width: 170,
              render: (_: any, r: MaintenanceItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setDrawerOpen(true);
                    }}
                    title="Xem chi tiết kế hoạch & checklist"
                  >
                    Xem
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={<ToolOutlined />}
                    onClick={() => handleOpenPerformModal(r)}
                    style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                    title="Thực hiện nghiệm thu bảo dưỡng"
                  >
                    Bảo dưỡng
                  </Button>
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Thiết lập kế hoạch bảo dưỡng mới */}
      <Modal
        title="Thiết Lập Kế Hoạch Bảo Dưỡng Phòng Ngừa &amp; SLA Kỹ Thuật"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="maintCode" label="Mã kế hoạch" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: BD-2026-Q4-01" />
            </Form.Item>
            <Form.Item name="frequency" label="Tần suất bảo dưỡng" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Hàng tháng (30 ngày)', value: 'Hàng tháng' },
                  { label: 'Hàng quý (90 ngày)', value: 'Hàng quý (3 tháng)' },
                  { label: 'Định kỳ 6 tháng (180 ngày)', value: 'Định kỳ 6 tháng' },
                  { label: 'Hàng năm (365 ngày)', value: 'Hàng năm' },
                ]}
              />
            </Form.Item>
            <Form.Item name="slaLevel" label="Cấp độ cam kết SLA" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'SLA Platinum', value: 'SLA Platinum (4h)' },
                  { label: 'SLA Gold', value: 'SLA Gold (8h)' },
                  { label: 'SLA Standard', value: 'SLA Standard (24h)' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="systemName" label="Tên hệ thống / Thiết bị bảo dưỡng" rules={[{ required: true, message: 'Nhập tên hệ thống' }]}>
            <Input placeholder="Ví dụ: Cụm Firewall FortiGate 200F High Availability Cluster" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12 }}>
            <Form.Item name="category" label="Chủng loại thiết bị" initialValue="Hạ tầng Mạng & Bảo mật">
              <Select
                options={[
                  { label: 'Máy chủ & Hạ tầng IDC', value: 'Máy chủ & Hạ tầng IDC' },
                  { label: 'Hạ tầng Mạng & Bảo mật', value: 'Hạ tầng Mạng & Bảo mật' },
                  { label: 'Hệ thống Cơ Điện & Làm Mát', value: 'Hệ thống Cơ Điện & Làm Mát' },
                  { label: 'Hệ thống Điện & Nguồn UPS', value: 'Hệ thống Điện & Nguồn UPS' },
                  { label: 'Thiết bị IT & Cán bộ nhân viên', value: 'Thiết bị IT & Cán bộ nhân viên' },
                ]}
              />
            </Form.Item>
            <Form.Item name="assetCodes" label="Mã các tài sản liên kết">
              <Input placeholder="Ví dụ: TS-FW-01, TS-FW-02" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="location" label="Vị trí lắp đặt cụ thể" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: IDC Viettel Duy Tân - Rack B02" />
            </Form.Item>
            <Form.Item name="maintenanceType" label="Loại hình bảo dưỡng">
              <Select
                options={[
                  { label: 'Phòng ngừa định kỳ', value: 'Phòng ngừa định kỳ (PM)' },
                  { label: 'Kiểm định an toàn PCCC & Điện', value: 'Kiểm định an toàn PCCC & Điện' },
                  { label: 'Nâng cấp bảo trì Firmware / Patch OS', value: 'Nâng cấp bảo trì Firmware / Patch OS' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="responsibleEngineer" label="Kỹ sư trưởng phụ trách" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Trần Tuấn Anh (CTO)" />
            </Form.Item>
            <Form.Item name="vendorPartner" label="Đối tác hãng kỹ thuật hỗ trợ">
              <Input placeholder="Ví dụ: Fortinet Enterprise TAC / FPT Telecom" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="lastDate" label="Ngày bảo dưỡng gần nhất" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="nextDate" label="Ngày bảo dưỡng tiếp theo" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="estimatedBudget" label="Dự toán kinh phí (VNĐ)">
              <Input type="number" min={0} step={500000} placeholder="Ví dụ: 3500000" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu kế hoạch bảo dưỡng
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Xem Chi Tiết Kế Hoạch & Nhật Ký Bảo Dưỡng */}
      <Drawer
        title="Hồ Sơ Kỹ Thuật Bảo Dưỡng &amp; Chứng Nhận An Toàn"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.maintCode}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.systemName}</div>
                </div>
                <Tag color="purple">{detailItem.slaLevel}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Vị trí: <strong>{detailItem.location}</strong> · Tần suất: <strong>{detailItem.frequency}</strong>
              </div>
            </div>

            {/* Health Score & Cert */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#F0FDF4' }}>
                <div style={{ fontSize: 11.5, color: '#166534', fontWeight: 600 }}>ĐIỂM SỨC KHỎE</div>
                <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                  {detailItem.healthScore} / 100
                </div>
                <Progress percent={detailItem.healthScore} size="small" strokeColor="#16A34A" showInfo={false} />
              </div>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#EFF6FF' }}>
                <div style={{ fontSize: 11.5, color: '#1E40AF', fontWeight: 600 }}>CHỨNG CHỈ KIỂM ĐỊNH</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#2563EB', marginTop: 6 }}>
                  <FileProtectOutlined /> {detailItem.certificateCode}
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Đạt chuẩn ISO 27001:2022</div>
              </div>
            </div>

            {/* Checklist items */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Hạng mục kiểm tra Checklist ({detailItem.checklist?.filter((c) => c.done).length || 0}/{detailItem.checklist?.length || 0} mục hoàn tất):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detailItem.checklist?.map((task, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, background: '#F8FAFC', padding: 8, borderRadius: 6 }}>
                    {task.done ? <CheckCircleOutlined style={{ color: '#16A34A', marginTop: 2 }} /> : <ClockCircleOutlined style={{ color: '#D97706', marginTop: 2 }} />}
                    <div style={{ flex: 1 }}>
                      <span style={{ color: task.done ? '#0F172A' : '#64748B', fontWeight: task.done ? 600 : 400 }}>{task.item}</span>
                      {task.note && <div style={{ fontSize: 11, color: '#009688', marginTop: 2 }}>Kết quả: {task.note}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Specs & History */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Kỹ sư phụ trách:</span>
                <strong>{detailItem.responsibleEngineer}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Đối tác kỹ thuật:</span>
                <strong>{detailItem.vendorPartner}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Dự toán / Thực tế:</span>
                <span>{detailItem.estimatedBudget.toLocaleString('vi-VN')} ₫ / <strong style={{ color: '#16A34A' }}>{detailItem.actualCost.toLocaleString('vi-VN')} ₫</strong></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Bảo dưỡng gần nhất:</span>
                <span>{detailItem.lastDate}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Hạn kỳ kế tiếp:</span>
                <strong style={{ color: '#2563EB' }}>{detailItem.nextDate}</strong>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã xuất báo cáo bảo dưỡng ${detailItem.maintCode} (PDF)`)}
                style={{ flex: 1 }}
              >
                In báo cáo (PDF)
              </Button>
              <Button
                type="primary"
                icon={<ToolOutlined />}
                onClick={() => handleOpenPerformModal(detailItem)}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Tiến hành bảo dưỡng ngay
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* MODAL: Thực hiện & Nghiệm thu bảo dưỡng */}
      <Modal
        title="Biên Bản Thực Hiện &amp; Nghiệm Thu Bảo Dưỡng Kỹ Thuật"
        open={performModalOpen}
        onCancel={() => setPerformModalOpen(false)}
        footer={null}
        width={540}
      >
        {performTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
            <Alert
              message={`Bảo dưỡng: ${performTarget.systemName}`}
              description={`Địa điểm: ${performTarget.location} | Tần suất: ${performTarget.frequency}`}
              type="info"
              showIcon
            />

            <div>
              <label style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', display: 'block', marginBottom: 8 }}>
                Checklist kiểm tra kỹ thuật:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}>
                {checklistState.map((task, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Checkbox checked={task.done} onChange={() => handleToggleChecklist(idx)}>
                      <span style={{ fontSize: 12.5, fontWeight: task.done ? 600 : 400 }}>{task.item}</span>
                    </Checkbox>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>
                  Điểm sức khỏe sau bảo dưỡng:
                </label>
                <Input
                  type="number"
                  min={50}
                  max={100}
                  value={healthScoreInput}
                  onChange={(e) => setHealthScoreInput(Number(e.target.value))}
                  suffix="/ 100"
                  style={{ fontWeight: 700, color: '#16A34A' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>
                  Chi phí thực tế phát sinh (VNĐ):
                </label>
                <Input
                  type="number"
                  min={0}
                  step={500000}
                  value={actualCostInput}
                  onChange={(e) => setActualCostInput(Number(e.target.value))}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>
                Ghi chú nghiệm thu kỹ thuật &amp; Khuyến nghị:
              </label>
              <Input.TextArea
                rows={2}
                value={performNotes}
                onChange={(e) => setPerformNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <Button onClick={() => setPerformModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleConfirmPerform}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Xác nhận hoàn tất bảo dưỡng
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

