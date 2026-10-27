import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  DownloadOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  PlusOutlined,
  SearchOutlined,
  AuditOutlined,
  PrinterOutlined,
  EyeOutlined,
  RiseOutlined,
  DollarOutlined,
  TeamOutlined,
  BankOutlined,
  AimOutlined,
} from '@ant-design/icons';
import { Button, Select, Input, Modal, Form, message, Tag, Drawer } from '../../custom-ui';
import { KTable } from '../../components/KTable';
import { crmContactsApi, employeesApi, filesApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import {
  listReportPeriods,
  normalizeReportPeriod,
  reportPeriodLabel,
  reportXlsxRows,
  REPORT_SOURCE_CONFIG,
  selectReportPeriodRows,
  summarizeReportRows,
  type ReportPeriod,
  type ReportSourceType,
} from './reportData';

type ReportFile = { id: string; name: string; format: 'PDF' | 'Excel'; sizeBytes: number };

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
  periodKey?: string;
  sourceScope?: string;
  sourceLabel?: string;
  rowCount?: number;
  missingDateCount?: number;
  files?: ReportFile[];
  lastDownloadedAt?: string;
}

const INITIAL_REPORTS: EnterpriseReportItem[] = [];

export const ReportsModule: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<EnterpriseReportItem[]>(INITIAL_REPORTS);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    void dataService.refreshGenericData('reports_catalog')
      .then((list) => { if (mounted) setData(list as EnterpriseReportItem[]); })
      .catch((error: any) => { if (mounted) message.error(error?.response?.data?.message || 'Không tải được danh mục báo cáo.'); })
      .finally(() => { if (mounted) setLoading(false); });
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('reports_catalog');
      if (mounted) setData(Array.isArray(updated) ? updated : []);
    });
    return () => { mounted = false; unsub(); };
  }, []);

  const periodOptions = listReportPeriods();
  const knownPeriods = new Set(periodOptions.map((period) => period.value));
  for (const report of data) {
    const period = normalizeReportPeriod(report.periodKey || report.period);
    if (period && !knownPeriods.has(period)) {
      periodOptions.push({ value: period, label: reportPeriodLabel(period) });
      knownPeriods.add(period);
    }
  }
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>(() => periodOptions[0]?.value || `${new Date().getFullYear()}-ALL`);
  const [selectedType, setSelectedType] = useState('all');
  const [searchText, setSearchText] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<EnterpriseReportItem | null>(null);
  const [generating, setGenerating] = useState(false);
  const [downloadingKey, setDownloadingKey] = useState('');

  const totalDownloads = data.reduce((sum, item) => sum + (Number(item.downloadsCount) || 0), 0);
  const totalReportedRows = data.reduce((sum, item) => sum + (Number(item.rowCount) || 0), 0);
  const reportTypesCount = new Set(data.map((item) => item.type)).size;

  const loadSourceRows = async (type: ReportSourceType): Promise<Record<string, any>[]> => {
    if (type === 'Nhân sự & Tiền lương') return (await employeesApi.getAll()).data.data as Record<string, any>[];
    if (type === 'Kinh doanh & CRM') return (await crmContactsApi.getAll()).data.data as Record<string, any>[];
    const config = REPORT_SOURCE_CONFIG[type];
    return await dataService.refreshGenericData(config.scope);
  };

  const ensureReportFolder = async (): Promise<string> => {
    const workspace = await filesApi.list(null);
    const rootId = workspace.data.context.parentId || undefined;
    const contents = await filesApi.list(rootId);
    const existing = contents.data.data.find((item) => item.type === 'dir' && item.name === 'Báo cáo quản trị');
    if (existing) return existing.id || existing.key;
    const created = await filesApi.createFolder('Báo cáo quản trị', rootId, 'reports');
    return created.data.file.id || created.data.file.key;
  };

  const handleDownload = async (record: EnterpriseReportItem, file: ReportFile) => {
    setDownloadingKey(`${record.key}:${file.id}`);
    try {
      const response = await filesApi.download(file.id);
      downloadFile(file.name, response.data);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được tệp báo cáo đã lưu.');
      setDownloadingKey('');
      return;
    }
    try {
      const saved = await dataService.updateGenericRecord('reports_catalog', {
        key: record.key,
        downloadsCount: (Number(record.downloadsCount) || 0) + 1,
        lastDownloadedAt: new Date().toISOString(),
      });
      if (selectedReport?.key === record.key) setSelectedReport(saved as EnterpriseReportItem);
    } catch {
      message.warning('Tệp đã tải xuống, nhưng số lượt tải chưa được cập nhật.');
    } finally {
      setDownloadingKey('');
    }
  };

  const handleGenerateReport = async (values: any) => {
    if (generating) return;
    const title = String(values.title || '').trim();
    const author = String(user?.name || user?.email || '').trim();
    const type = values.type as ReportSourceType;
    if (!title || !author || !REPORT_SOURCE_CONFIG[type]) {
      message.error('Cần có tiêu đề, tài khoản người lập và phân hệ hợp lệ để kết xuất.');
      return;
    }
    setGenerating(true);
    const config = REPORT_SOURCE_CONFIG[type];
    const uploaded: ReportFile[] = [];
    try {
      const allRows = await loadSourceRows(type);
      const { rows, missingDateCount } = selectReportPeriodRows(allRows, selectedPeriod, config.dateField);
      const summary = summarizeReportRows(rows, config.dateField, missingDateCount);
      const period = reportPeriodLabel(selectedPeriod);
      const timestamp = new Date();
      const key = globalThis.crypto?.randomUUID?.() || `${timestamp.getTime()}-${Math.random().toString(36).slice(2, 10)}`;
      const code = `RP-${selectedPeriod.replace(/[^0-9A-Z]/g, '')}-${key.slice(0, 6).toUpperCase()}`;
      const workbookRows = [
        ['Tên báo cáo', title], ['Phân hệ', type], ['Nguồn dữ liệu', config.label], ['Kỳ', period],
        ['Số hồ sơ trong kỳ', rows.length], ['Hồ sơ thiếu ngày', missingDateCount], ['Tổng hợp', summary.summary], [],
        ...reportXlsxRows(rows, config.fields),
      ];
      const workbook = generateValidXlsxBlob(workbookRows);
      const previewLines = [
        `Phan he: ${type}`,
        `Nguon du lieu: ${config.label}`,
        `Ky bao cao: ${period}`,
        `Ngay trich xuat: ${timestamp.toISOString()}`,
        `So ho so trong ky: ${rows.length}`,
        `Ho so thieu ngay: ${missingDateCount}`,
        ...summary.metrics.map((metric) => `${metric.label}: ${metric.value}`),
        'PDF liet ke toi da 100 ho so dau tien; XLSX chua toan bo ho so trong ky.',
        ...rows.slice(0, 100).flatMap((row, index) => [
          `Ho so ${index + 1}`,
          ...config.fields.filter((field) => Object.prototype.hasOwnProperty.call(row, field)).map((field) => `${field}: ${String(row[field] ?? '')}`),
        ]),
      ];
      const pdf = generateValidPdfBlob(title, `${code} | ${period} | ${author}`, previewLines);
      const format = String(values.format || 'PDF + Excel');
      const outputs = format === 'PDF'
        ? [{ name: `${code}.pdf`, format: 'PDF' as const, blob: pdf }]
        : format === 'Excel'
          ? [{ name: `${code}.xlsx`, format: 'Excel' as const, blob: workbook }]
          : [{ name: `${code}.pdf`, format: 'PDF' as const, blob: pdf }, { name: `${code}.xlsx`, format: 'Excel' as const, blob: workbook }];
      const folderId = await ensureReportFolder();
      for (const output of outputs) {
        const file = (await filesApi.upload(output.blob, output.name, folderId, 'reports')).data.file;
        uploaded.push({ id: file.id || file.key, name: file.name, format: output.format, sizeBytes: file.sizeBytes });
      }
      const newReport: EnterpriseReportItem = {
        key,
        code,
        title,
        type,
        author,
        date: timestamp.toISOString().slice(0, 10),
        period,
        periodKey: selectedPeriod,
        sourceScope: config.scope,
        sourceLabel: config.label,
        rowCount: rows.length,
        missingDateCount,
        fileSize: `${(uploaded.reduce((sum, file) => sum + (Number(file.sizeBytes) || 0), 0) / 1024).toFixed(1)} KB`,
        downloadsCount: 0,
        executiveSummary: summary.summary,
        keyMetrics: summary.metrics,
        files: uploaded,
        status: 'Sẵn sàng',
      };
      const saved = await dataService.createGenericRecord('reports_catalog', newReport) as EnterpriseReportItem;
      setSelectedReport(saved);
      setDrawerOpen(true);
      message.success(`Đã tạo và lưu báo cáo ${code} cùng ${uploaded.length} tệp.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      const cleanup = await Promise.allSettled(uploaded.map((file) => filesApi.remove(file.id)));
      if (cleanup.some((result) => result.status === 'rejected')) {
        message.warning('Có tệp báo cáo đã tải lên nhưng chưa dọn được sau lỗi lưu hồ sơ.');
      }
      message.error(error?.response?.data?.message || error?.message || 'Không thể kết xuất hoặc lưu báo cáo.');
    } finally {
      setGenerating(false);
    }
  };

  const filteredData = data.filter((item) => {
    const matchType = selectedType === 'all' || item.type === selectedType;
    const matchPeriod = normalizeReportPeriod(item.periodKey || item.period) === selectedPeriod;
    const matchSearch =
      (item.title || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.author || '').toLowerCase().includes(searchText.toLowerCase());
    return matchType && matchPeriod && matchSearch;
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
            disabled={!record.files?.some((file) => file.format === 'PDF')}
            loading={downloadingKey.startsWith(`${record.key}:`)}
            onClick={() => {
              const file = record.files?.find((item) => item.format === 'PDF');
              if (file) void handleDownload(record, file);
            }}
          >
            PDF
          </Button>
          <Button
            size="small"
            icon={<FileExcelOutlined />}
            disabled={!record.files?.some((file) => file.format === 'Excel')}
            loading={downloadingKey.startsWith(`${record.key}:`)}
            onClick={() => {
              const file = record.files?.find((item) => item.format === 'Excel');
              if (file) void handleDownload(record, file);
            }}
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hồ sơ đã tổng hợp trong kỳ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalReportedRows.toLocaleString('vi-VN')} hồ sơ
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tổng theo các báo cáo đã lưu</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng lượt tải &amp; tra cứu trong kỳ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {totalDownloads} lượt tải
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Ghi nhận sau khi tải tệp thành công</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Phân hệ có báo cáo đã lưu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {reportTypesCount} / {Object.keys(REPORT_SOURCE_CONFIG).length}
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Các nguồn dữ liệu đã dùng</div>
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
            options={periodOptions}
          />

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                type: 'Tài chính',
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
        <KTable dataSource={filteredData} columns={columns} loading={loading} pagination={{ pageSize: 8 }} />
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
            <Input maxLength={200} placeholder="Nhập tên báo cáo" />
          </Form.Item>

          <div style={{ marginBottom: 14, color: '#475569', fontSize: 13 }}>
            Kỳ dữ liệu: <strong>{reportPeriodLabel(selectedPeriod)}</strong>. Hệ thống chỉ đưa vào báo cáo hồ sơ có ngày hợp lệ trong kỳ.
          </div>

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
            <div style={{ alignSelf: 'center', color: '#64748B', fontSize: 12 }}>Người lập: {user?.name || user?.email || 'Chưa xác định'}</div>
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
            <Button type="primary" htmlType="submit" loading={generating} disabled={generating} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
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
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>
                Nguồn: <strong>{selectedReport.sourceLabel || 'Không lưu nguồn'}</strong> · Hồ sơ trong kỳ: <strong>{selectedReport.rowCount ?? '—'}</strong> · Tệp đã lưu: <strong>{selectedReport.files?.length ?? 0}</strong>
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
                disabled={!selectedReport.files?.some((file) => file.format === 'PDF')}
                loading={downloadingKey.startsWith(`${selectedReport.key}:`)}
                onClick={() => {
                  const file = selectedReport.files?.find((item) => item.format === 'PDF');
                  if (file) void handleDownload(selectedReport, file);
                }}
              >
                Tải Báo Cáo PDF
              </Button>
              <Button
                icon={<PrinterOutlined />}
                disabled={!selectedReport.files?.some((file) => file.format === 'PDF')}
                loading={downloadingKey.startsWith(`${selectedReport.key}:`)}
                onClick={() => {
                  const file = selectedReport.files?.find((item) => item.format === 'PDF');
                  if (file) void handleDownload(selectedReport, file);
                }}
              >
                Tải PDF để in
              </Button>
              <Button
                icon={<FileExcelOutlined />}
                disabled={!selectedReport.files?.some((file) => file.format === 'Excel')}
                loading={downloadingKey.startsWith(`${selectedReport.key}:`)}
                onClick={() => {
                  const file = selectedReport.files?.find((item) => item.format === 'Excel');
                  if (file) void handleDownload(selectedReport, file);
                }}
              >
                Tải Excel
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

