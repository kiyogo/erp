import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  SafetyCertificateOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  WarningOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer } from '../../custom-ui';
import { exportRowsToXlsx } from '../../utils/fileExporter';

export interface SlaMeasurement {
  period: string;
  uptime: number;
  incidents: number;
  compensation: number;
  mttr: string;
  note: string;
  recordedAt: string;
  recordedBy: string;
}

export interface EnterpriseSLACommitment {
  key: string;
  slaCode: string;
  serviceName: string;
  clientTier: 'Kim cương' | 'Bạch kim' | 'Vàng' | 'Tiêu chuẩn';
  uptimeTarget: number;
  responseTimeTarget: string;
  mttrTarget: string;
  penaltyClause: string;
  measurements: SlaMeasurement[];
  status: 'Chưa có số liệu đo' | 'Đạt cam kết' | 'Vi phạm cam kết';
}

const TIERS = ['Kim cương', 'Bạch kim', 'Vàng', 'Tiêu chuẩn'];
const cardStyle: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' };
const money = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;
const latestOf = (item: EnterpriseSLACommitment) => { const list = item.measurements || []; return list[list.length - 1]; };
const statusColor = (status: string) => (status === 'Đạt cam kết' ? 'success' : status === 'Vi phạm cam kết' ? 'error' : 'default');

/**
 * Cam kết SLA do người dùng nhập. Uptime, MTTR và sự cố thực tế chỉ lấy từ các kỳ đo đã được ghi nhận;
 * hệ thống không có công cụ giám sát nên không tự đo và không điền sẵn số liệu.
 */
export const SLAModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseSLACommitment[]>([]);
  const [searchText, setSearchText] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [form] = Form.useForm();
  const [measureForm] = Form.useForm();

  useEffect(() => {
    const read = () => {
      const list = dataService.getGenericData('services_sla');
      setData(Array.isArray(list) ? list : []);
    };
    read();
    return dataService.subscribe(read);
  }, []);

  const selectedSla = data.find((item) => item.key === selectedKey) || null;
  const measured = data.filter((item) => latestOf(item));
  const passing = measured.filter((item) => item.status === 'Đạt cam kết').length;
  const averageUptime = measured.length ? measured.reduce((sum, item) => sum + (latestOf(item)?.uptime || 0), 0) / measured.length : null;
  const compensation = data.reduce((sum, item) => sum + (item.measurements || []).reduce((total, entry) => total + entry.compensation, 0), 0);

  const filteredData = data.filter((item) => {
    const query = searchText.trim().toLocaleLowerCase('vi-VN');
    const matchTier = tierFilter === 'all' || item.clientTier === tierFilter;
    const matchSearch = !query || [item.slaCode, item.serviceName, item.clientTier].some((value) => String(value || '').toLocaleLowerCase('vi-VN').includes(query));
    return matchTier && matchSearch;
  });

  const handleCreate = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const created = await dataService.createGenericRecord('services_sla', {
        slaCode: String(values.slaCode || '').trim(),
        serviceName: String(values.serviceName || '').trim(),
        clientTier: values.clientTier,
        uptimeTarget: Number(values.uptimeTarget),
        responseTimeTarget: String(values.responseTimeTarget || '').trim(),
        mttrTarget: String(values.mttrTarget || '').trim(),
        penaltyClause: String(values.penaltyClause || '').trim(),
        measurements: [],
      });
      message.success(`Đã lưu cam kết SLA ${created.slaCode}.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không lưu được cam kết SLA.');
    } finally {
      setSaving(false);
    }
  };

  const handleMeasure = async (values: any) => {
    if (saving || !selectedSla) return;
    setSaving(true);
    try {
      const entry = {
        period: values.period,
        uptime: Number(values.uptime),
        incidents: Number(values.incidents),
        compensation: Number(values.compensation || 0),
        mttr: String(values.mttr || '').trim(),
        note: String(values.note || '').trim(),
      };
      await dataService.updateGenericRecord('services_sla', { ...selectedSla, measurements: [...(selectedSla.measurements || []), entry] });
      message.success(`Đã ghi nhận số liệu đo kỳ ${entry.period}.`);
      setMeasureOpen(false);
      measureForm.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không ghi nhận được số liệu đo.');
    } finally {
      setSaving(false);
    }
  };

  const exportColumns = [
    { title: 'Mã SLA', dataIndex: 'slaCode' },
    { title: 'Dịch vụ', dataIndex: 'serviceName' },
    { title: 'Hạng khách hàng', dataIndex: 'clientTier' },
    { title: 'Uptime cam kết (%)', dataIndex: 'uptimeTarget' },
    { title: 'Kỳ đo gần nhất', dataIndex: 'latestPeriod' },
    { title: 'Uptime thực tế (%)', dataIndex: 'latestUptime' },
    { title: 'Thời gian phản hồi cam kết', dataIndex: 'responseTimeTarget' },
    { title: 'MTTR cam kết', dataIndex: 'mttrTarget' },
    { title: 'MTTR thực tế', dataIndex: 'latestMttr' },
    { title: 'Sự cố kỳ gần nhất', dataIndex: 'latestIncidents' },
    { title: 'Bồi thường đã ghi nhận', dataIndex: 'totalCompensation' },
    { title: 'Điều khoản bồi thường', dataIndex: 'penaltyClause' },
    { title: 'Trạng thái', dataIndex: 'status' },
  ];

  const columns = [
    {
      title: 'Cam kết và dịch vụ',
      key: 'name',
      render: (_: any, record: EnterpriseSLACommitment) => (
        <div>
          <div style={{ color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <SafetyCertificateOutlined style={{ color: '#009688', fontSize: 16 }} /> {record.serviceName}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Mã {record.slaCode} · Hạng {record.clientTier}</div>
        </div>
      ),
    },
    {
      title: 'Uptime',
      key: 'uptime',
      width: 190,
      render: (_: any, record: EnterpriseSLACommitment) => {
        const latest = latestOf(record);
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span>Cam kết {record.uptimeTarget}%</span>
              <span style={{ color: latest && latest.uptime >= record.uptimeTarget ? '#16A34A' : '#DC2626' }}>{latest ? `${latest.uptime}%` : 'Chưa đo'}</span>
            </div>
            {latest && <Progress percent={latest.uptime} strokeColor={latest.uptime >= record.uptimeTarget ? '#16A34A' : '#DC2626'} showInfo={false} />}
          </div>
        );
      },
    },
    {
      title: 'Thời gian phản hồi',
      dataIndex: 'responseTimeTarget',
      key: 'responseTimeTarget',
      width: 170,
      render: (text: string) => <span style={{ color: '#D97706', fontSize: 12 }}><ClockCircleOutlined style={{ marginRight: 4 }} />{text}</span>,
    },
    {
      title: 'MTTR',
      key: 'mttr',
      width: 150,
      render: (_: any, record: EnterpriseSLACommitment) => (
        <div>
          <div style={{ fontSize: 12, color: '#0F172A' }}>{latestOf(record)?.mttr || 'Chưa đo'}</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>Cam kết {record.mttrTarget}</div>
        </div>
      ),
    },
    {
      title: 'Sự cố kỳ gần nhất',
      key: 'incidents',
      width: 150,
      render: (_: any, record: EnterpriseSLACommitment) => {
        const latest = latestOf(record);
        if (!latest) return <Tag color="default">Chưa đo</Tag>;
        return <Tag color={latest.incidents === 0 ? 'success' : 'warning'}>{latest.incidents} sự cố</Tag>;
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string) => <Tag color={statusColor(status)}>{status}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 130,
      render: (_: any, record: EnterpriseSLACommitment) => (
        <Button icon={<EyeOutlined />} onClick={() => { setSelectedKey(record.key); setDrawerOpen(true); }}>Chi tiết</Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Cam kết SLA</div>
          <div style={{ fontSize: 24, color: '#009688', marginTop: 4 }}>{data.length} cam kết</div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>{measured.length} cam kết đã có số liệu đo</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Đạt cam kết ở kỳ đo gần nhất</div>
          <div style={{ fontSize: 24, color: '#16A34A', marginTop: 4 }}>{measured.length ? `${passing} / ${measured.length}` : 'Chưa có số liệu'}</div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>{measured.length - passing} cam kết vi phạm</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Uptime trung bình kỳ đo gần nhất</div>
          <div style={{ fontSize: 24, color: '#2563EB', marginTop: 4 }}>{averageUptime === null ? 'Chưa có số liệu' : `${averageUptime.toFixed(3)}%`}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Tính từ số liệu đo đã ghi nhận</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Bồi thường đã ghi nhận</div>
          <div style={{ fontSize: 24, color: '#7C3AED', marginTop: 4 }}>{money(compensation)}</div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Cộng dồn các kỳ đo</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[{ key: 'all', label: 'Tất cả cam kết' }, ...TIERS.map((tier) => ({ key: tier, label: tier }))].map((tab) => (
            <Button
              key={tab.key}
              onClick={() => setTierFilter(tab.key)}
              style={{
                backgroundColor: tierFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: tierFilter === tab.key ? '#009688' : '#CBD5E1',
                color: tierFilter === tab.key ? '#00796B' : '#475569',
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã SLA, dịch vụ hoặc hạng"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            style={{ width: 280 }}
            allowClear
          />
          <Button
            icon={<DownloadOutlined />}
            onClick={() => {
              if (!filteredData.length) { message.warning('Không có cam kết SLA để xuất.'); return; }
              const rows = filteredData.map((item) => {
                const latest = latestOf(item);
                return {
                  ...item,
                  latestPeriod: latest?.period || '', latestUptime: latest?.uptime ?? '', latestMttr: latest?.mttr || '',
                  latestIncidents: latest?.incidents ?? '', totalCompensation: (item.measurements || []).reduce((sum, entry) => sum + entry.compensation, 0),
                };
              });
              const count = exportRowsToXlsx('Bao_cao_SLA', exportColumns, rows);
              message.success(`Đã xuất ${count} cam kết SLA ra tệp Excel.`);
            }}
          >
            Xuất báo cáo
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
            Thiết lập cam kết
          </Button>
        </div>
      </div>

      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} rowKey="key" pagination={{ pageSize: 8 }} />
      </div>

      <Modal title="Thiết lập cam kết SLA" open={modalOpen} onCancel={() => !saving && setModalOpen(false)} footer={null} width={640}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="slaCode" label="Mã cam kết SLA" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="clientTier" label="Hạng khách hàng" rules={[{ required: true }]}>
              <Select options={TIERS.map((tier) => ({ label: tier, value: tier }))} />
            </Form.Item>
          </div>
          <Form.Item name="serviceName" label="Tên dịch vụ áp dụng" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Tên dịch vụ được cam kết" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Form.Item name="uptimeTarget" label="Cam kết uptime (%)" rules={[{ required: true }]}>
              <Input type="number" step={0.01} min={90} max={100} placeholder="99.95" />
            </Form.Item>
            <Form.Item name="responseTimeTarget" label="Thời gian phản hồi" rules={[{ required: true, whitespace: true }]}>
              <Input placeholder="15 phút, 24/7" />
            </Form.Item>
            <Form.Item name="mttrTarget" label="Thời gian khắc phục tối đa" rules={[{ required: true, whitespace: true }]}>
              <Input placeholder="2 giờ" />
            </Form.Item>
          </div>
          <Form.Item name="penaltyClause" label="Điều khoản bồi thường khi vi phạm" rules={[{ required: true, whitespace: true }]}>
            <Input.TextArea rows={2} placeholder="Mức khấu trừ cước phí hoặc bồi thường theo hợp đồng" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 14 }}>
            <Button disabled={saving} onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu cam kết</Button>
          </div>
        </Form>
      </Modal>

      <Modal title="Ghi nhận số liệu đo" open={measureOpen} onCancel={() => !saving && setMeasureOpen(false)} footer={null} width={560}>
        <Form form={measureForm} layout="vertical" onFinish={handleMeasure} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="period" label="Kỳ đo" rules={[{ required: true }]}><Input type="month" aria-label="Kỳ đo" /></Form.Item>
            <Form.Item name="uptime" label="Uptime thực tế (%)" rules={[{ required: true }]}><Input type="number" step={0.001} min={0} max={100} /></Form.Item>
            <Form.Item name="incidents" label="Số sự cố trong kỳ" rules={[{ required: true }]}><Input type="number" min={0} step={1} /></Form.Item>
            <Form.Item name="mttr" label="MTTR thực tế"><Input placeholder="45 phút" /></Form.Item>
            <Form.Item name="compensation" label="Bồi thường phát sinh (₫)"><Input type="number" min={0} step={1} /></Form.Item>
          </div>
          <Form.Item name="note" label="Ghi chú"><Input.TextArea rows={2} placeholder="Nguồn số liệu, nguyên nhân sự cố" /></Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 14 }}>
            <Button disabled={saving} onClick={() => setMeasureOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Ghi nhận</Button>
          </div>
        </Form>
      </Modal>

      <Drawer title="Hồ sơ giám sát SLA" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={620}>
        {selectedSla && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontSize: 13, color: '#009688' }}>{selectedSla.slaCode}</div>
                <div style={{ fontSize: 16, color: '#0F172A', marginTop: 4 }}>{selectedSla.serviceName}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>Hạng khách hàng {selectedSla.clientTier}</div>
              </div>
              <Tag color={statusColor(selectedSla.status)}>{selectedSla.status}</Tag>
            </div>

            <div style={{ fontSize: 12.5, color: '#334155', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div>Cam kết uptime: {selectedSla.uptimeTarget}%</div>
              <div>Thời gian phản hồi: {selectedSla.responseTimeTarget}</div>
              <div>Thời gian khắc phục tối đa: {selectedSla.mttrTarget}</div>
            </div>

            <div>
              <div style={{ fontSize: 13, color: '#B45309', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <WarningOutlined /> Điều khoản bồi thường khi vi phạm
              </div>
              <div style={{ fontSize: 12.5, color: '#92400E', lineHeight: 1.5 }}>{selectedSla.penaltyClause}</div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div style={{ fontSize: 13, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <HistoryOutlined style={{ color: '#009688' }} /> Lịch sử số liệu đo
                </div>
                <Button type="primary" icon={<PlusOutlined />} onClick={() => { measureForm.resetFields(); setMeasureOpen(true); }} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                  Ghi nhận số liệu đo
                </Button>
              </div>
              {(selectedSla.measurements || []).length === 0
                ? <div style={{ fontSize: 12, color: '#64748B' }}>Chưa ghi nhận kỳ đo nào. Trạng thái và số liệu thực tế chỉ hiển thị khi có kỳ đo.</div>
                : (
                  <KTable
                    dataSource={[...selectedSla.measurements].reverse()}
                    rowKey="period"
                    pagination={false}
                    columns={[
                      { title: 'Kỳ đo', dataIndex: 'period', key: 'period', width: 90 },
                      { title: 'Uptime', key: 'uptime', width: 100, render: (_: any, entry: SlaMeasurement) => <span style={{ color: entry.uptime >= selectedSla.uptimeTarget ? '#16A34A' : '#DC2626' }}>{entry.uptime}%</span> },
                      { title: 'Sự cố', dataIndex: 'incidents', key: 'incidents', width: 80 },
                      { title: 'MTTR', dataIndex: 'mttr', key: 'mttr', width: 110 },
                      { title: 'Bồi thường', key: 'compensation', render: (_: any, entry: SlaMeasurement) => money(entry.compensation) },
                    ]}
                  />
                )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
