import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  BarChartOutlined,
  DownloadOutlined,
  CalendarOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  SearchOutlined,
  PieChartOutlined,
  LineChartOutlined,
  AuditOutlined,
  PrinterOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  RiseOutlined,
  DollarOutlined,
  TeamOutlined,
  BankOutlined,
  AimOutlined,
} from '@ant-design/icons';
import { Button, Select, Input, Modal, Form, message, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';
import { KTable } from '../../components/KTable';

export interface EnterpriseReportItem {
  key: string;
  code: string;
  title: string;
  type: 'Tài chính' | 'Nhân sự & Tiền lương' | 'Tài sản & IDC' | 'Kinh doanh & CRM' | 'Kế hoạch & OKR';
  author: string;
  date: string;
  period: string;
  fileSize: string;
  downloadsCount: number;
  executiveSummary: string;
  keyMetrics: { label: string; value: string }[];
  status: 'Sẵn sàng' | 'Đang kết xuất';
}

const INITIAL_REPORTS: EnterpriseReportItem[] = [];

export const ReportsModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseReportItem[]>(INITIAL_REPORTS);

  useEffect(() => {
    const list = dataService.getGenericData('reports_catalog');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('reports_catalog');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [selectedPeriod, setSelectedPeriod] = useState('2026-Q3');
  const [selectedType, setSelectedType] = useState('all');
  const [searchText, setSearchText] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<EnterpriseReportItem | null>(null);

  const totalDownloads = data.reduce((sum, item) => sum + item.downloadsCount, 0);

  const handleGenerateReport = (values: any) => {
    const newReport: EnterpriseReportItem = {
      key: String(Date.now()),
      code: `RP-GEN-0${data.length + 1}`,
      title: values.title,
      type: values.type || 'Tài chính',
      author: values.author || 'Trần Tuấn Anh (CTO)',
      date: new Date().toISOString().substring(0, 10),
      period: 'Quý III / 2026',
      fileSize: '2.1 MB',
      downloadsCount: 1,
      executiveSummary: 'Báo cáo được kết xuất tự động từ hệ cơ sở dữ liệu phân tán KIYOVN Enterprise, phục vụ công tác giám sát điều hành và báo cáo Đại Hội Đồng Cổ Đông.',
      keyMetrics: [
        { label: 'Độ khớp dữ liệu sổ cái', value: '100%' },
        { label: 'Thời gian trích xuất log', value: '1.2s' },
      ],
      status: 'Sẵn sàng',
    };
    const nextItems = [newReport, ...data]; setData(nextItems); dataService.saveGenericData('reports_catalog', nextItems);
    message.success(`Đã khởi tạo thành công báo cáo: ${values.title}`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchType = selectedType === 'all' || item.type === selectedType;
    const matchSearch =
      (item.title || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.author || '').toLowerCase().includes(searchText.toLowerCase());
    return matchType && matchSearch;
  });

  const columns = [
    {
      title: 'Mã báo cáo & Kỳ',
      key: 'code',
      render: (_: any, record: EnterpriseReportItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5 }}>{record.code}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{record.period}</div>
        </div>
      ),
    },
    {
      title: 'Tên báo cáo điều hành',
      key: 'title',
      render: (_: any, record: EnterpriseReportItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.title}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB' }}>Phân hệ: {record.type} · Dung lượng: {record.fileSize}</div>
        </div>
      ),
    },
    {
      title: 'Người lập & Ngày ban hành',
      key: 'authorDate',
      render: (_: any, record: EnterpriseReportItem) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A' }}>{record.author}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>Ngày ban hành: {record.date}</div>
        </div>
      ),
    },
    {
      title: 'Lượt tải',
      dataIndex: 'downloadsCount',
      key: 'downloadsCount',
      width: 100,
      render: (count: number) => <span style={{ fontWeight: 600, color: '#334155' }}>{count} lượt</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => <Tag color="success">{status}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 220,
      render: (_: any, record: EnterpriseReportItem) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedReport(record);
              setDrawerOpen(true);
            }}
          >
            Hồ sơ
          </Button>
          <Button
            size="small"
            icon={<FilePdfOutlined />}
            onClick={() => message.info(`Đang tải tệp PDF: ${record.title}`)}
          >
            PDF
          </Button>
          <Button
            size="small"
            icon={<FileExcelOutlined />}
            onClick={() => message.success(`Đang xuất bảng tính Excel: ${record.title}`)}
          >
            Excel
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số báo cáo quản trị lưu trữ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} báo cáo
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Phục vụ Ban Giám Đốc &amp; HĐQT</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Độ tin cậy số liệu kiểm toán</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            100% Khớp ERP
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Khớp đúng sổ cái &amp; tài khoản ngân hàng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng lượt tải &amp; tra cứu trong kỳ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {totalDownloads} lượt tải
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Truy xuất phân quyền bảo mật cao</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chu kỳ tự động hóa kết xuất</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            Tuần &amp; Tháng
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Tự động gửi email BOD vào 08:00 sáng Thứ 2</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phân hệ' },
            { key: 'Tài chính', label: 'Tài chính', icon: <DollarOutlined style={{ color: '#10B981' }} /> },
            { key: 'Nhân sự & Tiền lương', label: 'Nhân sự', icon: <TeamOutlined style={{ color: '#3B82F6' }} /> },
            { key: 'Tài sản & IDC', label: 'Tài sản', icon: <BankOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Kinh doanh & CRM', label: 'Kinh doanh', icon: <RiseOutlined style={{ color: '#10B981' }} /> },
            { key: 'Kế hoạch & OKR', label: 'Kế hoạch OKR', icon: <AimOutlined style={{ color: '#EF4444' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setSelectedType(tab.key)}
              style={{
                backgroundColor: selectedType === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: selectedType === tab.key ? '#009688' : '#CBD5E1',
                color: selectedType === tab.key ? '#00796B' : '#475569',
                fontWeight: selectedType === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tiêu đề, mã, người lập..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />

          <Select
            value={selectedPeriod}
            onChange={setSelectedPeriod}
            style={{ width: 145 }}
            options={[
              { label: 'Quý III / 2026', value: '2026-Q3' },
              { label: 'Quý II / 2026', value: '2026-Q2' },
              { label: 'Cả năm 2026', value: '2026-ALL' },
            ]}
          />

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                type: 'Tài chính',
                author: 'Nguyễn Thị Mai',
                format: 'PDF + Excel',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Kết xuất báo cáo mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm báo cáo */}
      <Modal
        title="Khởi Tạo Kết Xuất Báo Cáo Quản Trị Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={580}
      >
        <Form form={form} layout="vertical" onFinish={handleGenerateReport} style={{ marginTop: 14 }}>
          <Form.Item name="title" label="Tiêu đề báo cáo quản trị" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Báo Cáo Phân Tích Chi Phí Máy Chủ IDC Tháng 08/2026" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="type" label="Phân hệ nghiệp vụ" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Tài chính', value: 'Tài chính' },
                  { label: 'Nhân sự & Tiền lương', value: 'Nhân sự & Tiền lương' },
                  { label: 'Tài sản & IDC', value: 'Tài sản & IDC' },
                  { label: 'Kinh doanh & CRM', value: 'Kinh doanh & CRM' },
                  { label: 'Kế hoạch & OKR', value: 'Kế hoạch & OKR' },
                ]}
              />
            </Form.Item>
            <Form.Item name="author" label="Người phụ trách lập" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </div>

          <Form.Item name="format" label="Định dạng trích xuất dữ liệu">
            <Select
              options={[
                { label: 'Cả 2 định dạng', value: 'PDF + Excel' },
                { label: 'Chỉ file PDF Báo cáo', value: 'PDF' },
                { label: 'Chỉ file Excel Bảng tính (.xlsx)', value: 'Excel' },
              ]}
            />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Bắt đầu kết xuất
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Báo Cáo Điều Hành */}
      <Drawer
        title="Hồ Sơ Báo Cáo Điều Hành &amp; Thẩm Tra Dữ Liệu"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={600}
      >
        {selectedReport && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ BÁO CÁO: {selectedReport.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedReport.title}
                  </div>
                </div>
                <Tag color="success">{selectedReport.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Kỳ báo cáo: <strong>{selectedReport.period}</strong> · Người lập: <strong>{selectedReport.author}</strong>
              </div>
            </div>

            {/* Executive Summary */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AuditOutlined /> Tóm Tắt Điều Hành:
              </div>
              <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                {selectedReport.executiveSummary}
              </div>
            </div>

            {/* Key Metrics */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <RiseOutlined /> Các Chỉ Số Quan Trọng:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {selectedReport.keyMetrics?.map((m, idx) => (
                  <div key={idx} style={{ background: '#F1F5F9', padding: '10px 14px', borderRadius: 6 }}>
                    <div style={{ fontSize: 11.5, color: '#64748B' }}>{m.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#009688', marginTop: 2 }}>{m.value}</div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                icon={<FilePdfOutlined />}
                onClick={() => message.success(`Đang tải báo cáo PDF ${selectedReport.code}`)}
              >
                Tải Báo Cáo PDF
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in báo cáo ${selectedReport.code}`)}
              >
                In Báo Cáo (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

