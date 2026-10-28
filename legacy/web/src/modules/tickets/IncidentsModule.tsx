import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import {
  calculateIncidentDowntimeMinutes,
  formatIncidentTimestamp,
  getIncidentMetrics,
  incidentExportRows,
} from './incidentRules';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  PrinterOutlined,
  EyeOutlined,
  AuditOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Checkbox } from '../../custom-ui';

export interface EnterpriseIncidentRecord {
  key: string;
  code: string;
  incidentTitle: string;
  affectedSystem: string;
  severity: 'P1 - Khẩn cấp' | 'P2 - Cao' | 'P3 - Trung bình';
  occurredAt: string;
  resolvedAt: string;
  handler: string;
  downtimeMinutes: number;
  rootCause: string;
  resolutionSummary?: string;
  reportedBy?: string;
  reportedById?: string;
  timeline: { time: string; action: string }[];
  actionItems: { task: string; owner: string; deadline?: string; status: 'Hoàn tất' | 'Đang triển khai' }[];
  status: 'Đã xử lý & Hoàn tất RCA' | 'Đang xử lý khẩn cấp';
}

const INITIAL_INCIDENTS: EnterpriseIncidentRecord[] = [];

export const IncidentsModule: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<EnterpriseIncidentRecord[]>(INITIAL_INCIDENTS);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nowMs, setNowMs] = useState(Date.now());

  useEffect(() => {
    const list = dataService.getGenericData('ticket_incidents');
    setData(Array.isArray(list) ? list : []);
    let mounted = true;
    setLoading(true);
    void dataService.refreshGenericData('ticket_incidents')
      .then((records) => { if (mounted) setData(Array.isArray(records) ? records : []); })
      .catch((error: any) => { if (mounted) message.error(error?.response?.data?.message || 'Không tải được hồ sơ sự cố.'); })
      .finally(() => { if (mounted) setLoading(false); });
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('ticket_incidents');
      if (mounted) setData(Array.isArray(updated) ? updated : []);
    });
    return () => { mounted = false; unsub(); };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const [searchText, setSearchText] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [resolutionForm] = Form.useForm();
  const [resolutionModalOpen, setResolutionModalOpen] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<EnterpriseIncidentRecord | null>(null);

  const metrics = getIncidentMetrics(data, new Date(nowMs).getFullYear(), nowMs);

  const handleCreate = async (values: any) => {
    const occurredAtDate = values.occurredAt ? new Date(values.occurredAt) : new Date();
    if (!Number.isFinite(occurredAtDate.getTime())) {
      message.error('Thời điểm xảy ra sự cố không hợp lệ.');
      return;
    }
    const code = String(values.code || '').trim().toLocaleUpperCase();
    const incidentTitle = String(values.incidentTitle || '').trim();
    const affectedSystem = String(values.affectedSystem || '').trim();
    const handler = String(values.handler || '').trim();
    if (!code || !incidentTitle || !affectedSystem || !handler || !['P1 - Khẩn cấp', 'P2 - Cao', 'P3 - Trung bình'].includes(values.severity)) {
      message.error('Vui lòng nhập đủ mã, mức độ, mô tả, hệ thống ảnh hưởng và người phụ trách.');
      return;
    }
    if (data.some((item) => item.code.trim().toLocaleLowerCase() === code.toLocaleLowerCase())) {
      message.error('Mã sự cố đã tồn tại. Vui lòng tạo mã khác.');
      return;
    }
    setSaving(true);
    try {
      const occurredAt = occurredAtDate.toISOString();
      const timeline = [{ time: occurredAt, action: `Ghi nhận sự cố: ${incidentTitle}` }];
      const actionItems = String(values.actionPlan || '').split(/\r?\n/).map((task: string) => task.trim()).filter(Boolean)
        .map((task: string) => ({ task, owner: handler, status: 'Đang triển khai' as const }));
      const record = {
        key: code,
        code,
        severity: values.severity,
        incidentTitle,
        affectedSystem,
        occurredAt,
        resolvedAt: '',
        handler,
        downtimeMinutes: 0,
        rootCause: String(values.rootCause || '').trim(),
        timeline,
        actionItems,
        reportedBy: user?.name || '',
        reportedById: user?.id || '',
        status: 'Đang xử lý khẩn cấp' as const,
      };
      const saved = await dataService.createGenericRecord('ticket_incidents', record) as EnterpriseIncidentRecord;
      setSelectedIncident(saved);
      message.success(`Đã ghi nhận sự cố ${saved.code}.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu sự cố. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const handleResolve = (record: EnterpriseIncidentRecord) => {
    setSelectedIncident(record);
    resolutionForm.setFieldsValue({ rootCause: record.rootCause || '', resolutionSummary: '' });
    setResolutionModalOpen(true);
  };

  const submitResolution = async (values: { rootCause: string; resolutionSummary: string }) => {
    if (!selectedIncident || selectedIncident.status !== 'Đang xử lý khẩn cấp') return;
    const resolvedAt = new Date().toISOString();
    const downtimeMinutes = calculateIncidentDowntimeMinutes(selectedIncident.occurredAt, resolvedAt);
    const updated = {
      ...selectedIncident,
      rootCause: values.rootCause.trim(),
      resolutionSummary: values.resolutionSummary.trim(),
      resolvedAt,
      downtimeMinutes: downtimeMinutes ?? selectedIncident.downtimeMinutes,
      timeline: [...(selectedIncident.timeline || []), { time: resolvedAt, action: `Khắc phục hoàn tất: ${values.resolutionSummary.trim()}` }],
      status: 'Đã xử lý & Hoàn tất RCA' as const,
    };
    setSaving(true);
    try {
      const saved = await dataService.updateGenericRecord('ticket_incidents', updated) as EnterpriseIncidentRecord;
      setSelectedIncident(saved);
      setResolutionModalOpen(false);
      resolutionForm.resetFields();
      message.success(`Đã lưu kết quả xử lý và RCA của sự cố ${saved.code}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu kết quả xử lý sự cố. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const toggleActionItem = async (record: EnterpriseIncidentRecord, index: number) => {
    const actionItems = (record.actionItems || []).map((item, itemIndex) => itemIndex === index
      ? { ...item, status: item.status === 'Hoàn tất' ? 'Đang triển khai' as const : 'Hoàn tất' as const }
      : item);
    setSaving(true);
    try {
      const saved = await dataService.updateGenericRecord('ticket_incidents', { ...record, actionItems }) as EnterpriseIncidentRecord;
      if (selectedIncident?.key === saved.key) setSelectedIncident(saved);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể cập nhật kế hoạch hành động.');
    } finally {
      setSaving(false);
    }
  };

  const exportReport = () => {
    if (!filteredData.length) {
      message.info('Không có sự cố phù hợp để xuất báo cáo.');
      return;
    }
    downloadFile('Bao_cao_su_co_va_RCA.xlsx', generateValidXlsxBlob(incidentExportRows(filteredData)));
  };

  const printIncident = (record: EnterpriseIncidentRecord) => downloadFile(
    `${record.code.replace(/[^a-z0-9_-]/gi, '_')}_bao_cao_RCA.pdf`,
    generateValidPdfBlob('BIEN BAN SU CO VA PHAN TICH RCA', `${record.code} | ${record.incidentTitle}`, [
      `Thoi diem xay ra: ${formatIncidentTimestamp(record.occurredAt)}`,
      `Thoi diem khac phuc: ${formatIncidentTimestamp(record.resolvedAt, 'Dang xu ly')}`,
      `He thong anh huong: ${record.affectedSystem}`,
      `Muc do: ${record.severity}`,
      `Nguoi phu trach: ${record.handler}`,
      `Gian doan: ${incidentDowntime(record)} phut${record.status === 'Đang xử lý khẩn cấp' ? ' - dang theo doi' : ''}`,
      `Trang thai: ${record.status}`,
      `Nguyen nhan goc: ${record.rootCause || 'Chua ghi nhan'}`,
      `Ket qua xu ly: ${record.resolutionSummary || 'Chua ghi nhan'}`,
      'Nhat ky dien bien:', ...(record.timeline || []).map((item) => `${formatIncidentTimestamp(item.time)} - ${item.action}`),
      'Ke hoach hanh dong:', ...(record.actionItems || []).map((item) => `${item.task} | ${item.owner} | ${item.deadline || 'Chua dat han'} | ${item.status}`),
    ]),
  );

  const filteredData = data.filter((item) => {
    const matchSev =
      severityFilter === 'all' ||
      (severityFilter === 'P1' && item.severity.startsWith('P1')) ||
      (severityFilter === 'P2' && item.severity.startsWith('P2')) ||
      (severityFilter === 'P3' && item.severity.startsWith('P3')) ||
      (severityFilter === 'Đang xử lý' && item.status === 'Đang xử lý khẩn cấp');

    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.incidentTitle || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.affectedSystem || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.handler || '').toLowerCase().includes(searchText.toLowerCase());

    return matchSev && matchSearch;
  });

  const incidentDowntime = (record: EnterpriseIncidentRecord) => record.status === 'Đang xử lý khẩn cấp'
    ? calculateIncidentDowntimeMinutes(record.occurredAt, new Date(nowMs).toISOString()) ?? record.downtimeMinutes
    : calculateIncidentDowntimeMinutes(record.occurredAt, record.resolvedAt) ?? record.downtimeMinutes ?? 0;

  const columns = [
    {
      title: 'Mã sự cố',
      key: 'code',
      render: (_: any, record: EnterpriseIncidentRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: '#DC2626', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertOutlined /> {record.code}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{formatIncidentTimestamp(record.occurredAt)}</div>
        </div>
      ),
    },
    {
      title: 'Tiêu đề sự cố / Hệ thống ảnh hưởng',
      key: 'incident',
      render: (_: any, record: EnterpriseIncidentRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.incidentTitle}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB' }}>Hệ thống: {record.affectedSystem}</div>
        </div>
      ),
    },
    {
      title: 'Mức độ',
      dataIndex: 'severity',
      key: 'severity',
      width: 170,
      render: (sev: string) => {
        let color = 'default';
        if (sev.startsWith('P1')) color = 'error';
        if (sev.startsWith('P2')) color = 'warning';
        if (sev.startsWith('P3')) color = 'success';
        return <Tag color={color}>{sev}</Tag>;
      },
    },
    {
      title: 'Gián đoạn',
      dataIndex: 'downtimeMinutes',
      key: 'downtimeMinutes',
      width: 150,
      render: (_: number, record: EnterpriseIncidentRecord) => {
        const minutes = incidentDowntime(record);
        return (
        <span style={{ fontWeight: 800, color: minutes > 0 ? '#DC2626' : '#16A34A', fontSize: 13.5 }}>
          {minutes > 0 ? `${minutes} phút gián đoạn` : '0 phút'}
        </span>
        );
      },
      sorter: (a: EnterpriseIncidentRecord, b: EnterpriseIncidentRecord) => incidentDowntime(a) - incidentDowntime(b),
    },
    {
      title: 'Chỉ huy ứng cứu',
      dataIndex: 'handler',
      key: 'handler',
      render: (h: string) => <span style={{ fontWeight: 600, color: '#009688', fontSize: 12.5 }}>{h}</span>,
    },
    {
      title: 'Trạng thái & RCA',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (status: string) => {
        const isDone = status === 'Đã xử lý & Hoàn tất RCA';
        return <Tag color={isDone ? 'success' : 'error'}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 150,
      render: (_: any, record: EnterpriseIncidentRecord) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedIncident(record);
              setDrawerOpen(true);
            }}
          >
            Hồ sơ RCA
          </Button>
          {record.status === 'Đang xử lý khẩn cấp' && (
            <Button
              size="small"
              type="primary"
              onClick={() => handleResolve(record)}
              style={{ backgroundColor: '#10B981', borderColor: '#10B981' }}
            >
              Xong
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Khả dụng ước tính từ sự cố năm {metrics.year}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {metrics.availabilityPercent === null ? 'Chưa đủ dữ liệu' : `${metrics.availabilityPercent.toFixed(3)}%`}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Ước tính theo thời lượng sự cố đã ghi nhận</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thời gian khắc phục bình quân</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {metrics.averageRepairMinutes === null ? 'Chưa đủ dữ liệu' : `${metrics.averageRepairMinutes.toFixed(1)} phút`}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Tính từ hồ sơ đã khắc phục</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thời gian gián đoạn đã ghi nhận năm {metrics.year}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {metrics.totalDowntime === null ? 'Chưa đủ dữ liệu' : `${metrics.totalDowntime} phút`}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{metrics.openCount} sự cố đang được theo dõi</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ hoàn tất phân tích RCA</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {metrics.completionPercent === null ? 'Chưa có dữ liệu' : `${metrics.completionPercent}%`}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{metrics.resolvedCount} / {data.length} hồ sơ hoàn tất RCA</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả sự cố' },
            { key: 'P1', label: 'Sự cố P1', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
            { key: 'P2', label: 'Sự cố P2', icon: <ExclamationCircleOutlined style={{ color: '#F97316' }} /> },
            { key: 'P3', label: 'Sự cố P3', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Đang xử lý', label: 'Đang ứng cứu', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setSeverityFilter(tab.key)}
              style={{
                backgroundColor: severityFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: severityFilter === tab.key ? '#009688' : '#CBD5E1',
                color: severityFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: severityFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã sự cố, tiêu đề, hệ thống..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={exportReport} disabled={loading || filteredData.length === 0}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                code: `INC-${new Date(nowMs).getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
                severity: 'P2 - Cao',
                handler: user?.name || '',
                occurredAt: new Date(nowMs - new Date(nowMs).getTimezoneOffset() * 60_000).toISOString().slice(0, 16),
              });
              setModalOpen(true);
            }}
            disabled={loading}
            style={{ backgroundColor: '#DC2626', borderColor: '#DC2626' }}
          >
            Báo cáo sự cố khẩn cấp
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Tạo sự cố mới */}
      <Modal
        title="Báo Cáo Sự Cố Kỹ Thuật Hạ Tầng Khẩn Cấp"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 14 }}>
            <Form.Item name="code" label="Mã sự cố" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập mã sự cố.' }]}>
              <Input maxLength={80} />
            </Form.Item>
            <Form.Item name="severity" label="Mức độ nghiêm trọng" rules={[{ required: true, message: 'Vui lòng chọn mức độ.' }]}>
              <Select
                options={[
                  { label: 'P1 - Khẩn cấp', value: 'P1 - Khẩn cấp' },
                  { label: 'P2 - Cao', value: 'P2 - Cao' },
                  { label: 'P3 - Trung bình', value: 'P3 - Trung bình' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="occurredAt" label="Thời điểm xảy ra" rules={[{ required: true, message: 'Vui lòng nhập thời điểm xảy ra.' }]}>
              <Input type="datetime-local" />
            </Form.Item>
            <Form.Item name="handler" label="Chỉ huy ứng cứu" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập người phụ trách.' }]}>
              <Input maxLength={160} />
            </Form.Item>
          </div>

          <Form.Item name="incidentTitle" label="Mô tả tóm tắt sự cố" rules={[{ required: true, whitespace: true, message: 'Vui lòng mô tả sự cố.' }]}>
            <Input maxLength={500} placeholder="Mô tả sự cố đã xảy ra" />
          </Form.Item>

          <Form.Item name="affectedSystem" label="Hệ thống / Dịch vụ bị ảnh hưởng" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập hệ thống bị ảnh hưởng.' }]}>
            <Input maxLength={200} placeholder="Tên hệ thống hoặc dịch vụ" />
          </Form.Item>

          <Form.Item name="rootCause" label="Nguyên nhân sơ bộ" extra="Để trống nếu chưa có kết luận xác thực.">
            <Input.TextArea rows={2} maxLength={2000} placeholder="Nhập nguyên nhân đã xác minh sơ bộ" />
          </Form.Item>

          <Form.Item name="actionPlan" label="Kế hoạch hành động" extra="Mỗi dòng là một việc; không nhập việc mẫu nếu chưa xác định.">
            <Input.TextArea rows={3} maxLength={4000} placeholder={'Ví dụ:\nKhôi phục dịch vụ bị ảnh hưởng\nRà soát nguyên nhân và bổ sung biện pháp phòng ngừa'} />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={saving} style={{ backgroundColor: '#DC2626', borderColor: '#DC2626' }}>
              Phát cảnh báo NOC
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Sự Cố & Báo Cáo Post-Mortem RCA */}
      <Drawer
        title="Báo Cáo Phân Tích Nguyên Nhân Gốc Rễ Sự Cố"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={620}
      >
        {selectedIncident && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#FEF2F2', padding: 16, borderRadius: 8, border: '1px solid #FECACA' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#DC2626', fontWeight: 800 }}>MÃ SỰ CỐ: {selectedIncident.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedIncident.incidentTitle}
                  </div>
                </div>
                <Tag color={selectedIncident.severity.startsWith('P1') ? 'error' : 'warning'}>
                  {selectedIncident.severity}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Hệ thống ảnh hưởng: <strong>{selectedIncident.affectedSystem}</strong>
              </div>
            </div>

            {/* Impact Metric */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
                Chỉ Số Thời Gian &amp; Mức Độ Gián Đoạn:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12.5 }}>
                <div>Thời điểm xảy ra: <strong>{formatIncidentTimestamp(selectedIncident.occurredAt)}</strong></div>
                <div>Thời điểm khắc phục: <strong>{formatIncidentTimestamp(selectedIncident.resolvedAt, 'Đang xử lý')}</strong></div>
                <div>Thời gian gián đoạn: <strong style={{ color: '#DC2626' }}>{incidentDowntime(selectedIncident)} phút{selectedIncident.status === 'Đang xử lý khẩn cấp' ? ' · Đang theo dõi' : ''}</strong></div>
                <div>Chỉ huy xử lý: <strong style={{ color: '#009688' }}>{selectedIncident.handler}</strong></div>
              </div>
            </div>

            {/* Root Cause Analysis */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AuditOutlined /> Phân Tích Nguyên Nhân Gốc Rễ:
              </div>
              <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                {selectedIncident.rootCause || 'Chưa ghi nhận.'}
              </div>
              {selectedIncident.resolutionSummary && (
                <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6, marginTop: 8 }}>
                  <strong>Kết quả khắc phục:</strong> {selectedIncident.resolutionSummary}
                </div>
              )}
            </div>

            {/* Incident Timeline */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ClockCircleOutlined /> Nhật Ký Diễn Biến Ứng Cứu:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedIncident.timeline?.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 10, fontSize: 12.5 }}>
                    <span style={{ fontWeight: 700, color: '#009688', minWidth: 125 }}>{formatIncidentTimestamp(item.time)}</span>
                    <span style={{ color: '#334155' }}>{item.action}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Corrective Action Items */}
            <div style={{ border: '1px solid #BBF7D0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircleOutlined /> Kế Hoạch Hành Động Khắc Phục Phòng Ngừa:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(selectedIncident.actionItems || []).length === 0 && <div style={{ color: '#64748B', fontSize: 12.5 }}>Chưa có kế hoạch hành động được ghi nhận.</div>}
                {selectedIncident.actionItems?.map((act, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, fontSize: 12.5, padding: '4px 0', borderBottom: '1px dashed #DCFCE7' }}>
                    <div style={{ color: '#14532D' }}>
                      <div>{act.task}</div>
                      <div style={{ color: '#64748B', fontSize: 11.5 }}>Phụ trách: {act.owner}{act.deadline ? ` · Hạn: ${act.deadline}` : ''}</div>
                    </div>
                    <Checkbox checked={act.status === 'Hoàn tất'} disabled={saving} onChange={() => void toggleActionItem(selectedIncident, idx)}>{act.status}</Checkbox>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {selectedIncident.status === 'Đang xử lý khẩn cấp' && (
                <Button
                  type="primary"
                  style={{ flex: 1, backgroundColor: '#10B981', borderColor: '#10B981' }}
                  onClick={() => handleResolve(selectedIncident)}
                >
                  Ghi kết quả khắc phục và hoàn tất RCA
                </Button>
              )}
              <Button
                icon={<PrinterOutlined />}
                onClick={() => printIncident(selectedIncident)}
              >
                In Báo Cáo Post-Mortem A4
              </Button>
            </div>
          </div>
        )}
      </Drawer>
      <Modal
        title={`Kết quả xử lý sự cố ${selectedIncident?.code || ''}`}
        open={resolutionModalOpen}
        onCancel={() => setResolutionModalOpen(false)}
        footer={null}
        width={620}
      >
        <Form form={resolutionForm} layout="vertical" onFinish={submitResolution} style={{ marginTop: 14 }}>
          <Form.Item name="rootCause" label="Nguyên nhân gốc rễ" rules={[{ required: true, whitespace: true, message: 'Vui lòng ghi nguyên nhân gốc rễ đã xác minh.' }]}>
            <Input.TextArea rows={4} maxLength={4000} placeholder="Ghi nguyên nhân đã xác minh và bằng chứng liên quan" />
          </Form.Item>
          <Form.Item name="resolutionSummary" label="Kết quả khắc phục" rules={[{ required: true, whitespace: true, message: 'Vui lòng ghi kết quả khắc phục.' }]}>
            <Input.TextArea rows={4} maxLength={4000} placeholder="Ghi biện pháp xử lý và kết quả xác nhận" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={() => setResolutionModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={saving} style={{ backgroundColor: '#10B981', borderColor: '#10B981' }}>
              Lưu kết quả và khép hồ sơ
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

