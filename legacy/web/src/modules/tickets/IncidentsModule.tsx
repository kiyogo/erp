import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  AlertOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  ThunderboltOutlined,
  PrinterOutlined,
  EyeOutlined,
  AuditOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';

export interface EnterpriseIncidentRecord {
  key: string;
  code: string;
  incidentTitle: string;
  affectedSystem: string;
  severity: 'P1 - Khẩn cấp (Toàn hệ thống)' | 'P2 - Cao (Ảnh hưởng dịch vụ)' | 'P3 - Trung bình';
  occurredAt: string;
  resolvedAt: string;
  handler: string;
  downtimeMinutes: number;
  rootCause: string;
  timeline: { time: string; action: string }[];
  actionItems: { task: string; owner: string; deadline: string; status: 'Hoàn tất' | 'Đang triển khai' }[];
  status: 'Đã xử lý & Hoàn tất RCA' | 'Đang xử lý khẩn cấp';
}

const INITIAL_INCIDENTS: EnterpriseIncidentRecord[] = [];

export const IncidentsModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseIncidentRecord[]>(INITIAL_INCIDENTS);

  useEffect(() => {
    const list = dataService.getGenericData('ticket_incidents');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('ticket_incidents');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [severityFilter, setSeverityFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedIncident, setSelectedIncident] = useState<EnterpriseIncidentRecord | null>(null);

  const totalDowntime = data.reduce((sum, item) => sum + item.downtimeMinutes, 0);
  const p1Count = data.filter((d) => d.severity.startsWith('P1')).length;
  const p2Count = data.filter((d) => d.severity.startsWith('P2')).length;
  const resolvedCount = data.filter((d) => d.status === 'Đã xử lý & Hoàn tất RCA').length;

  const handleCreate = (values: any) => {
    const newInc: EnterpriseIncidentRecord = {
      ...values,
      key: String(Date.now()),
      occurredAt: values.occurredAt || new Date().toISOString().replace('T', ' ').substring(0, 16),
      resolvedAt: 'Đang theo dõi',
      downtimeMinutes: 0,
      timeline: [
        {
          time: new Date().toISOString().substring(11, 16),
          action: `Phát cảnh báo sự cố: ${values.incidentTitle}`,
        },
      ],
      actionItems: [
        {
          task: 'Khẩn trương cô lập và phục hồi dịch vụ',
          owner: values.handler || 'Đội ứng cứu NOC',
          deadline: 'Trong 30 phút',
          status: 'Đang triển khai',
        },
      ],
      status: 'Đang xử lý khẩn cấp',
    };
    const nextItems = [newInc, ...data]; setData(nextItems); dataService.saveGenericData('ticket_incidents', nextItems);
    message.success(`Đã phát cảnh báo sự cố IT khẩn cấp: ${values.incidentTitle}`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleResolve = (record: EnterpriseIncidentRecord) => {
    const updated = data.map((d) =>
      d.key === record.key
        ? {
            ...d,
            resolvedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
            status: 'Đã xử lý & Hoàn tất RCA' as const,
          }
        : d
    );
    setData(updated);
    message.success(`Đã hoàn tất xử lý sự cố: ${record.code}`);
    if (selectedIncident && selectedIncident.key === record.key) {
      setSelectedIncident({
        ...selectedIncident,
        resolvedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
        status: 'Đã xử lý & Hoàn tất RCA',
      });
    }
  };

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

  const columns = [
    {
      title: 'Mã sự cố',
      key: 'code',
      render: (_: any, record: EnterpriseIncidentRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: '#DC2626', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <AlertOutlined /> {record.code}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{record.occurredAt}</div>
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
      title: 'Mức độ (Severity)',
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
      title: 'Gián đoạn (Downtime)',
      dataIndex: 'downtimeMinutes',
      key: 'downtimeMinutes',
      width: 150,
      render: (min: number) => (
        <span style={{ fontWeight: 800, color: min > 0 ? '#DC2626' : '#16A34A', fontSize: 13.5 }}>
          {min > 0 ? `${min} phút gián đoạn` : '0 phút (Seamless)'}
        </span>
      ),
      sorter: (a: EnterpriseIncidentRecord, b: EnterpriseIncidentRecord) => a.downtimeMinutes - b.downtimeMinutes,
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cam kết Uptime hệ sinh thái</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            99.98% SLA
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đạt tiêu chuẩn IDC Tier 3 Quốc tế</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thời gian phục hồi bình quân (MTTR)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            11.4 phút
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Mục tiêu cam kết ≤ 15 phút</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng thời gian Downtime lũy kế</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {totalDowntime} phút / năm
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Hạn mức cho phép ≤ 52 phút / năm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ hoàn tất phân tích RCA</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {Math.round((resolvedCount / (data.length || 1)) * 100)}%
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>{resolvedCount} / {data.length} Báo cáo Post-Mortem hoàn tất</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả sự cố' },
            { key: 'P1', label: 'Sự cố P1 (Khẩn cấp)', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
            { key: 'P2', label: 'Sự cố P2 (Cao)', icon: <ExclamationCircleOutlined style={{ color: '#F97316' }} /> },
            { key: 'P3', label: 'Sự cố P3 (Trung bình)', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
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

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo sự cố và RCA')}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                code: `INC-2026-${String(Date.now()).slice(-3)}`,
                severity: 'P2 - Cao (Ảnh hưởng dịch vụ)',
                handler: 'Trần Tuấn Anh (CTO)',
              });
              setModalOpen(true);
            }}
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
        title="Báo Cáo Sự Cố Kỹ Thuật Hạ Tầng Khẩn Cấp (NOC Alert)"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 12 }}>
            <Form.Item name="code" label="Mã sự cố" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="severity" label="Mức độ nghiêm trọng" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'P1 - Khẩn cấp (Toàn hệ thống)', value: 'P1 - Khẩn cấp (Toàn hệ thống)' },
                  { label: 'P2 - Cao (Ảnh hưởng dịch vụ)', value: 'P2 - Cao (Ảnh hưởng dịch vụ)' },
                  { label: 'P3 - Trung bình', value: 'P3 - Trung bình' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="incidentTitle" label="Mô tả tóm tắt sự cố" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Lỗi xác thực tài khoản qua OAuth2 Gateway" />
          </Form.Item>

          <Form.Item name="affectedSystem" label="Hệ thống / Dịch vụ bị gián đoạn" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Cụm máy chủ xác thực Auth Cluster (IDC Tân Thuận)" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="handler" label="Chỉ huy ứng cứu (Incident Lead)" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="rootCause" label="Nguyên nhân sơ bộ (Root Cause)" initialValue="Đang tiến hành phân tích log">
              <Input />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#DC2626', borderColor: '#DC2626' }}>
              Phát cảnh báo NOC
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Sự Cố & Báo Cáo Post-Mortem RCA */}
      <Drawer
        title="Báo Cáo Phân Tích Nguyên Nhân Gốc Rễ Sự Cố (ITIL RCA Post-Mortem)"
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
                <div>Thời điểm xảy ra: <strong>{selectedIncident.occurredAt}</strong></div>
                <div>Thời điểm khắc phục: <strong>{selectedIncident.resolvedAt}</strong></div>
                <div>Thời gian gián đoạn: <strong style={{ color: '#DC2626' }}>{selectedIncident.downtimeMinutes} phút</strong></div>
                <div>Chỉ huy xử lý: <strong style={{ color: '#009688' }}>{selectedIncident.handler}</strong></div>
              </div>
            </div>

            {/* Root Cause Analysis */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AuditOutlined /> Phân Tích Nguyên Nhân Gốc Rễ (RCA):
              </div>
              <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
                {selectedIncident.rootCause}
              </div>
            </div>

            {/* Incident Timeline */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ClockCircleOutlined /> Nhật Ký Diễn Biến Ứng Cứu (Timeline):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedIncident.timeline?.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', gap: 10, fontSize: 12.5 }}>
                    <span style={{ fontWeight: 700, color: '#009688', minWidth: 45 }}>{item.time}</span>
                    <span style={{ color: '#334155' }}>{item.action}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Corrective Action Items */}
            <div style={{ border: '1px solid #BBF7D0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CheckCircleOutlined /> Kế Hoạch Hành Động Khắc Phục Phòng Ngừa (CAPA):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedIncident.actionItems?.map((act, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12.5, padding: '4px 0', borderBottom: '1px dashed #DCFCE7' }}>
                    <span style={{ color: '#14532D' }}>• {act.task} (Phụ trách: <strong>{act.owner}</strong>)</span>
                    <Tag color="green">{act.status}</Tag>
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
                  Xác Nhận Khắc Phục Hoàn Tất &amp; Khép Hồ Sơ
                </Button>
              )}
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in biên bản RCA sự cố ${selectedIncident.code}`)}
              >
                In Báo Cáo Post-Mortem (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

