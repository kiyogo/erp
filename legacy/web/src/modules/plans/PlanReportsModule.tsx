import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  DownloadOutlined,
  BarChartOutlined,
  RiseOutlined,
  FallOutlined,
  CheckCircleOutlined,
  PrinterOutlined,
  PieChartOutlined,
  TrophyOutlined,
  SearchOutlined,
  EyeOutlined,
  FilePdfOutlined,
  ProjectOutlined,
  DollarOutlined,
  TeamOutlined,
  PlusOutlined,
  StarFilled,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Select, message, Tag, Progress, Card, Input, Drawer, Modal, Form } from '../../custom-ui';

interface SubPlanProject {
  code: string;
  name: string;
  budget: number;
  spent: number;
  kpi: number;
  status: string;
}

interface PlanReportItem {
  key: string;
  department: string;
  leader: string;
  totalPlans: number;
  completedPlans: number;
  approvedBudget: number;
  actualSpent: number;
  variance: number;
  kpiScore: number;
  evaluation: 'Xuất sắc' | 'Đạt yêu cầu' | 'Cần cải thiện';
  projects: SubPlanProject[];
}

const REPORT_DATA: PlanReportItem[] = [
  {
    key: '1',
    department: 'Khối Kỹ Thuật & IDC',
    leader: 'Trần Tuấn Anh (CTO)',
    totalPlans: 6,
    completedPlans: 5,
    approvedBudget: 4500000000,
    actualSpent: 4200000000,
    variance: -300000000,
    kpiScore: 96.5,
    evaluation: 'Xuất sắc',
    projects: [
      { code: 'PRJ-IDC-01', name: 'Nâng cấp cụm máy chủ IDC Viettel Tier 3', budget: 2500000000, spent: 2350000000, kpi: 98, status: 'Hoàn thành' },
      { code: 'PRJ-SEC-02', name: 'Triển khai Firewall Fortigate Active-Active', budget: 1200000000, spent: 1150000000, kpi: 96, status: 'Hoàn thành' },
      { code: 'PRJ-S3-03', name: 'Mở rộng lưu trữ SAN/NAS 100TB', budget: 800000000, spent: 700000000, kpi: 95, status: 'Đang triển khai' },
    ],
  },
  {
    key: '2',
    department: 'Phòng R&D Công Nghệ AI',
    leader: 'Đặng Đình Long (Tech Lead)',
    totalPlans: 4,
    completedPlans: 3,
    approvedBudget: 1800000000,
    actualSpent: 1750000000,
    variance: -50000000,
    kpiScore: 94.0,
    evaluation: 'Xuất sắc',
    projects: [
      { code: 'PRJ-AI-01', name: 'Huấn luyện mô hình LLM OCR hóa đơn tự động', budget: 1100000000, spent: 1080000000, kpi: 95, status: 'Hoàn thành' },
      { code: 'PRJ-AI-02', name: 'Tích hợp Trợ lý ảo nội bộ KiyoBot v2', budget: 700000000, spent: 670000000, kpi: 93, status: 'Đang triển khai' },
    ],
  },
  {
    key: '3',
    department: 'Khối Kinh Doanh & CRM',
    leader: 'Lê Hoàng Yến (CMO)',
    totalPlans: 5,
    completedPlans: 4,
    approvedBudget: 1200000000,
    actualSpent: 1180000000,
    variance: -20000000,
    kpiScore: 91.5,
    evaluation: 'Đạt yêu cầu',
    projects: [
      { code: 'PRJ-SALES-01', name: 'Chiến dịch tiếp cận 50 Tập đoàn Tài chính', budget: 700000000, spent: 690000000, kpi: 92, status: 'Hoàn thành' },
      { code: 'PRJ-MKT-02', name: 'Hội nghị đối tác Enterprise Summit 2026', budget: 500000000, spent: 490000000, kpi: 91, status: 'Hoàn thành' },
    ],
  },
  {
    key: '4',
    department: 'Phòng Nhân Sự & Đào Tạo',
    leader: 'Vũ Quốc Bảo (HR Head)',
    totalPlans: 3,
    completedPlans: 3,
    approvedBudget: 850000000,
    actualSpent: 820000000,
    variance: -30000000,
    kpiScore: 98.0,
    evaluation: 'Xuất sắc',
    projects: [
      { code: 'PRJ-HR-01', name: 'Chương trình đào tạo chứng chỉ quốc tế AWS/PMP', budget: 450000000, spent: 430000000, kpi: 99, status: 'Hoàn thành' },
      { code: 'PRJ-HR-02', name: 'Nâng cấp chính sách đãi ngộ phúc lợi toàn diện', budget: 400000000, spent: 390000000, kpi: 97, status: 'Hoàn thành' },
    ],
  },
  {
    key: '5',
    department: 'Phòng Tài Chính Kế Toán',
    leader: 'Nguyễn Thị Mai (KTT)',
    totalPlans: 3,
    completedPlans: 3,
    approvedBudget: 600000000,
    actualSpent: 590000000,
    variance: -10000000,
    kpiScore: 97.5,
    evaluation: 'Xuất sắc',
    projects: [
      { code: 'PRJ-ACC-01', name: 'Triển khai số hóa hóa đơn điện tử tự động', budget: 350000000, spent: 345000000, kpi: 98, status: 'Hoàn thành' },
      { code: 'PRJ-ACC-02', name: 'Quyết toán thuế và kiểm toán độc lập Ernst & Young', budget: 250000000, spent: 245000000, kpi: 97, status: 'Hoàn thành' },
    ],
  },
];

export const PlanReportsModule: React.FC = () => {
  const [data, setData] = useState<PlanReportItem[]>(REPORT_DATA);

  useEffect(() => {
    const list = dataService.getGenericData('plan_reports');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('plan_reports');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [period, setPeriod] = useState('Q3/2026');
  const [filterTab, setFilterTab] = useState<'all' | 'excellent' | 'good' | 'top_budget'>('all');
  const [searchText, setSearchText] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PlanReportItem | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const totalBudget = data.reduce((sum, item) => sum + item.approvedBudget, 0);
  const totalSpent = data.reduce((sum, item) => sum + item.actualSpent, 0);
  const totalSaved = totalBudget - totalSpent;
  const avgKpi = (data.reduce((sum, item) => sum + item.kpiScore, 0) / (data.length || 1)).toFixed(1);

  const filteredData = data.filter((item) => {
    let matchTab = true;
    if (filterTab === 'excellent') matchTab = item.kpiScore >= 95;
    else if (filterTab === 'good') matchTab = item.kpiScore >= 90 && item.kpiScore < 95;
    else if (filterTab === 'top_budget') matchTab = item.approvedBudget >= 1000000000;

    const matchSearch =
      !searchText ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.leader || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.evaluation || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const handleCreateEvaluation = (values: any) => {
    const newItem: PlanReportItem = {
      key: String(Date.now()),
      department: values.department,
      leader: values.leader,
      totalPlans: Number(values.totalPlans) || 4,
      completedPlans: Number(values.completedPlans) || 3,
      approvedBudget: Number(values.approvedBudget) || 1000000000,
      actualSpent: Number(values.actualSpent) || 950000000,
      variance: (Number(values.actualSpent) || 950000000) - (Number(values.approvedBudget) || 1000000000),
      kpiScore: Number(values.kpiScore) || 92,
      evaluation: (Number(values.kpiScore) || 92) >= 95 ? 'Xuất sắc' : 'Đạt yêu cầu',
      projects: [
        {
          code: `PRJ-${String(Date.now()).slice(-3)}`,
          name: 'Dự án mục tiêu quý mới',
          budget: Number(values.approvedBudget) || 1000000000,
          spent: Number(values.actualSpent) || 950000000,
          kpi: Number(values.kpiScore) || 92,
          status: 'Đang triển khai',
        },
      ],
    };

    setData([...data, newItem]);
    message.success(`Đã thêm đánh giá kế hoạch khối ${values.department}`);
    setModalOpen(false);
    form.resetFields();
  };

  const columns = [
    {
      title: 'Khối / Đơn vị thực hiện',
      key: 'department',
      render: (_: any, record: PlanReportItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>
            {record.department}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Chủ trì: <strong>{record.leader}</strong>
          </div>
        </div>
      ),
    },
    {
      title: 'Kế hoạch (Đạt/Tổng)',
      key: 'plans',
      render: (_: any, record: PlanReportItem) => {
        const pct = Math.round((record.completedPlans / record.totalPlans) * 100);
        return (
          <div>
            <span style={{ fontWeight: 700, color: '#1E40AF' }}>
              {record.completedPlans} / {record.totalPlans} kế hoạch ({pct}%)
            </span>
            <div style={{ width: 120, background: '#E2E8F0', height: 5, borderRadius: 3, marginTop: 4 }}>
              <div style={{ width: `${pct}%`, background: pct === 100 ? '#16A34A' : '#3B82F6', height: '100%', borderRadius: 3 }} />
            </div>
          </div>
        );
      },
    },
    {
      title: 'Ngân sách phê duyệt',
      dataIndex: 'approvedBudget',
      key: 'approvedBudget',
      render: (val: number) => <span style={{ fontWeight: 600 }}>{val.toLocaleString('vi-VN')} ₫</span>,
    },
    {
      title: 'Chi phí thực tế',
      dataIndex: 'actualSpent',
      key: 'actualSpent',
      render: (val: number) => <span style={{ fontWeight: 600, color: '#334155' }}>{val.toLocaleString('vi-VN')} ₫</span>,
    },
    {
      title: 'Chênh lệch tiết kiệm',
      dataIndex: 'variance',
      key: 'variance',
      render: (val: number) => (
        <span style={{ color: val <= 0 ? '#16A34A' : '#DC2626', fontWeight: 700 }}>
          {val <= 0 ? `Tiết kiệm ${Math.abs(val).toLocaleString('vi-VN')} ₫` : `Vượt ${(val).toLocaleString('vi-VN')} ₫`}
        </span>
      ),
    },
    {
      title: 'Điểm KPI',
      dataIndex: 'kpiScore',
      key: 'kpiScore',
      render: (score: number) => (
        <span style={{ fontWeight: 800, color: score >= 95 ? '#16A34A' : '#009688', fontSize: 13.5 }}>
          {score} / 100
        </span>
      ),
    },
    {
      title: 'Đánh giá chung',
      dataIndex: 'evaluation',
      key: 'evaluation',
      render: (e: string) => (
        <Tag color={e === 'Xuất sắc' ? 'success' : 'processing'}>
          {e}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 100,
      render: (_: any, record: PlanReportItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedItem(record);
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng ngân sách phê duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {(totalBudget / 1000000000).toFixed(2)} tỷ đồng
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Toàn bộ các khối ban kỳ {period}</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thực tế giải ngân</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {(totalSpent / 1000000000).toFixed(2)} tỷ đồng
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>
            Tỷ lệ giải ngân {Math.round((totalSpent / totalBudget) * 100)}% kế hoạch
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Ngân sách tiết kiệm tối ưu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            +{(totalSaved / 1000000).toFixed(0)} triệu đồng
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tối ưu qua quy trình thầu công khai</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Điểm KPI bình quân khối</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {avgKpi} / 100 điểm
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Đạt chuẩn chất lượng ISO &amp; OKRs</div>
        </div>
      </div>

      {/* Unified Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        {/* Filter sub-tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả đơn vị' },
            { key: 'excellent', label: 'Xuất sắc (KPI ≥ 95)', icon: <StarFilled style={{ color: '#F59E0B' }} /> },
            { key: 'good', label: 'Đạt chuẩn (KPI 90-94)', icon: <ThunderboltOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'top_budget', label: 'Ngân sách > 1 Tỷ', icon: <DollarOutlined style={{ color: '#10B981' }} /> },
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

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo đơn vị, người phụ trách..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 220 }}
            allowClear
          />

          <Select
            value={period}
            onChange={setPeriod}
            style={{ width: 140 }}
            options={[
              { label: 'Kỳ Q3/2026', value: 'Q3/2026' },
              { label: 'Kỳ Q2/2026', value: 'Q2/2026' },
              { label: 'Cả năm 2026', value: '2026' },
            ]}
          />

          <Button
            icon={<PrinterOutlined />}
            onClick={() => message.success('Đã in báo cáo hiệu suất kế hoạch & KPI (A4)')}
          >
            In Báo Cáo (A4)
          </Button>

          <Button
            icon={<DownloadOutlined />}
            onClick={() => message.success('Đã xuất báo cáo kế hoạch ra Excel')}
          >
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalOpen(true)}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm Báo Cáo Khối
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={false} rowKey="key" />
      </div>

      {/* DRAWER: Chi Tiết Hiệu Suất Đơn Vị */}
      <Drawer
        title="Hồ Sơ Hiệu Suất Kế Hoạch &amp; Phân Bổ Ngân Sách"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
      >
        {selectedItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>{selectedItem.department}</div>
                  <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 3 }}>
                    Chủ trì quản trị: <strong>{selectedItem.leader}</strong>
                  </div>
                </div>
                <Tag color={selectedItem.evaluation === 'Xuất sắc' ? 'success' : 'processing'}>
                  {selectedItem.evaluation}
                </Tag>
              </div>
            </div>

            {/* Financial & KPI Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ padding: 12, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>Ngân sách kế hoạch</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 4 }}>
                  {selectedItem.approvedBudget.toLocaleString('vi-VN')} ₫
                </div>
                <div style={{ fontSize: 11, color: '#16A34A', marginTop: 2 }}>
                  Tiết kiệm: {Math.abs(selectedItem.variance).toLocaleString('vi-VN')} ₫
                </div>
              </div>

              <div style={{ padding: 12, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>Thực tế giải ngân</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1E40AF', marginTop: 4 }}>
                  {selectedItem.actualSpent.toLocaleString('vi-VN')} ₫
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  Đạt {Math.round((selectedItem.actualSpent / selectedItem.approvedBudget) * 100)}% hạn mức
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: '#334155' }}>Tiến độ hoàn thành kế hoạch</span>
                <span style={{ fontWeight: 700, color: '#009688' }}>
                  {selectedItem.completedPlans} / {selectedItem.totalPlans} mục tiêu (
                  {Math.round((selectedItem.completedPlans / selectedItem.totalPlans) * 100)}%)
                </span>
              </div>
              <div style={{ width: '100%', background: '#E2E8F0', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.round((selectedItem.completedPlans / selectedItem.totalPlans) * 100)}%`,
                    background: '#009688',
                    height: '100%',
                    borderRadius: 4,
                  }}
                />
              </div>
            </div>

            {/* Sub-projects list */}
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ProjectOutlined style={{ color: '#009688' }} /> Danh Mục Dự Án Chiến Lược ({selectedItem.projects.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedItem.projects.map((prj, i) => (
                  <div
                    key={i}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: 6,
                      padding: '10px 14px',
                      background: '#FFFFFF',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#009688' }}>{prj.code}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginTop: 2 }}>{prj.name}</div>
                      </div>
                      <Tag color={prj.status === 'Hoàn thành' ? 'success' : 'processing'}>{prj.status}</Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#64748B', marginTop: 8 }}>
                      <span>Ngân sách: <strong>{prj.budget.toLocaleString('vi-VN')} ₫</strong></span>
                      <span>Đã giải ngân: <strong>{prj.spent.toLocaleString('vi-VN')} ₫</strong></span>
                      <span>KPI: <strong style={{ color: '#16A34A' }}>{prj.kpi}/100</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom action buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => message.success(`Đã đồng bộ báo cáo thẩm định cho ${selectedItem.department}`)}
              >
                Đồng bộ thẩm định
              </Button>
              <Button
                icon={<PrinterOutlined />}
                style={{ flex: 1 }}
                onClick={() => message.success(`Đang in báo cáo chi tiết khối ${selectedItem.department} (A4)...`)}
              >
                In Phiếu Khối (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* MODAL: Thêm Báo Cáo Đơn Vị Mới */}
      <Modal
        title="Thêm Báo Cáo Đánh Giá Kế Hoạch Đơn Vị"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateEvaluation}>
          <Form.Item name="department" label="Tên Khối / Đơn vị" rules={[{ required: true, message: 'Vui lòng nhập tên khối' }]}>
            <Input placeholder="Ví dụ: Khối Vận Hành & Khai Thác" />
          </Form.Item>
          <Form.Item name="leader" label="Lãnh đạo phụ trách" rules={[{ required: true, message: 'Vui lòng nhập người phụ trách' }]}>
            <Input placeholder="Ví dụ: Nguyễn Văn Hải (Trưởng khối)" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="totalPlans" label="Tổng kế hoạch" initialValue={4}>
              <Input type="number" />
            </Form.Item>
            <Form.Item name="completedPlans" label="Đã hoàn thành" initialValue={3}>
              <Input type="number" />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="approvedBudget" label="Ngân sách phê duyệt (₫)" initialValue={1000000000}>
              <Input type="number" />
            </Form.Item>
            <Form.Item name="actualSpent" label="Chi phí thực tế (₫)" initialValue={950000000}>
              <Input type="number" />
            </Form.Item>
          </div>
          <Form.Item name="kpiScore" label="Điểm KPI đánh giá (thang 100)" initialValue={95}>
            <Input type="number" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu Báo Cáo
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};


