import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  WarningOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  EyeOutlined,
  AlertOutlined,
  HistoryOutlined,
  FundProjectionScreenOutlined,
  DeploymentUnitOutlined,
  SketchOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseSLACommitment {
  key: string;
  slaCode: string;
  serviceName: string;
  clientTier: 'Kim Cương (Diamond VIP)' | 'Bạch Kim (Platinum)' | 'Vàng (Gold Enterprise)' | 'Tiêu Chuẩn (Standard)';
  uptimeTarget: number;
  actualUptime: number;
  responseTimeTarget: string;
  mttrTarget: string;
  actualMttr: string;
  incidentCount30Days: number;
  penaltyClause: string;
  compensationAmount: number;
  status: 'Đạt chuẩn SLA' | 'Cảnh báo vi phạm' | 'Đang xử lý sự cố';
}

const INITIAL_SLA: EnterpriseSLACommitment[] = [];

export const SLAModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseSLACommitment[]>(INITIAL_SLA);
  const [searchText, setSearchText] = useState('');
  const [tierFilter, setTierFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSla, setSelectedSla] = useState<EnterpriseSLACommitment | null>(null);

  const avgUptime = (data.reduce((sum, item) => sum + item.actualUptime, 0) / data.length).toFixed(3);

  const handleCreate = (values: any) => {
    const newSla: EnterpriseSLACommitment = {
      ...values,
      key: String(Date.now()),
      uptimeTarget: Number(values.uptimeTarget) || 99.95,
      actualUptime: 100.0,
      incidentCount30Days: 0,
      compensationAmount: 0,
      status: 'Đạt chuẩn SLA',
    };
    setData([...data, newSla]);
    message.success(`Đã thiết lập cam kết SLA mới: ${values.serviceName} (${values.slaCode})`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchTier = tierFilter === 'all' || item.clientTier.includes(tierFilter);
    const matchSearch =
      (item.slaCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.serviceName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.clientTier || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTier && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Dịch vụ áp dụng SLA',
      key: 'name',
      render: (_: any, r: EnterpriseSLACommitment) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <SafetyCertificateOutlined style={{ color: '#009688', fontSize: 16 }} />
            {r.serviceName}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2, fontWeight: 600 }}>
            Mã: <code>{r.slaCode}</code> · Hạng: <span style={{ color: '#2563EB' }}>{r.clientTier}</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Cam kết Uptime',
      key: 'uptime',
      width: 170,
      render: (_: any, r: EnterpriseSLACommitment) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <span>Mục tiêu: <strong>{r.uptimeTarget}%</strong></span>
            <span style={{ color: '#16A34A', fontWeight: 800 }}>{r.actualUptime}%</span>
          </div>
          <Progress
            percent={r.actualUptime}
            size="small"
            strokeColor={r.actualUptime >= r.uptimeTarget ? '#16A34A' : '#DC2626'}
            showInfo={false}
          />
        </div>
      ),
    },
    {
      title: 'Thời gian phản hồi',
      dataIndex: 'responseTimeTarget',
      key: 'responseTimeTarget',
      width: 180,
      render: (resp: string) => (
        <span style={{ color: '#D97706', fontWeight: 600, fontSize: 12 }}>
          <ClockCircleOutlined style={{ marginRight: 4 }} />
          {resp}
        </span>
      ),
    },
    {
      title: 'MTTR Khắc phục',
      key: 'mttr',
      width: 150,
      render: (_: any, r: EnterpriseSLACommitment) => (
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0F172A' }}>{r.actualMttr}</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>Chuẩn: {r.mttrTarget}</div>
        </div>
      ),
    },
    {
      title: 'Sự cố 30 ngày',
      dataIndex: 'incidentCount30Days',
      key: 'incidentCount30Days',
      width: 130,
      render: (cnt: number) => (
        <Tag color={cnt === 0 ? 'success' : 'warning'}>
          {cnt === 0 ? '0 Sự cố' : `${cnt} Sự cố nhẹ`}
        </Tag>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (st: string) => <Tag color={st === 'Đạt chuẩn SLA' ? 'success' : 'error'}>{st}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, r: EnterpriseSLACommitment) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedSla(r);
            setDrawerOpen(true);
          }}
        >
          Giám sát
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ đáp ứng chuẩn cam kết SLA</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            100% Tuân thủ
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>5/5 Dịch vụ hoạt động hoàn hảo</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Uptime trung bình toàn hạ tầng IDC</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {avgUptime}% Uptime
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đo lường tự động qua Zabbix &amp; Grafana</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thời gian phản hồi sự cố nhanh nhất</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            ≤ 5 Phút (SOC 24/7)
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Tự động kích hoạt On-Call Engineer</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Quỹ dự phòng phạt vi phạm SLA</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            500.000.000 ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Thực chi bồi thường tháng này: 0 ₫</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả cam kết' },
            { key: 'Kim Cương', label: 'Kim Cương VIP', icon: <SketchOutlined style={{ color: '#06B6D4' }} /> },
            { key: 'Bạch Kim', label: 'Bạch Kim', icon: <TrophyOutlined style={{ color: '#94A3B8' }} /> },
            { key: 'Vàng', label: 'Vàng Enterprise', icon: <TrophyOutlined style={{ color: '#F59E0B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setTierFilter(tab.key)}
              style={{
                backgroundColor: tierFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: tierFilter === tab.key ? '#009688' : '#CBD5E1',
                color: tierFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: tierFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã SLA, tên dịch vụ, phân hạng..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo kiểm toán SLA Uptime')}>
            Xuất Báo Cáo
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                slaCode: `SLA-NEW-0${data.length + 1}`,
                clientTier: 'Kim Cương (Diamond VIP)',
                uptimeTarget: 99.99,
                responseTimeTarget: '≤ 15 phút (24/7/365)',
                mttrTarget: '≤ 2 giờ',
                actualMttr: '15 phút',
                penaltyClause: 'Hoàn lại 30% phí thuê tháng nếu Uptime dưới cam kết',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thiết lập SLA mới
          </Button>
        </div>
      </div>

      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      <Modal
        title="Thiết Lập Cam Kết Chất Lượng Dịch Vụ Mới (SLA Matrix)"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="slaCode" label="Mã cam kết SLA" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="clientTier" label="Phân hạng khách hàng" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Kim Cương (Diamond VIP)', value: 'Kim Cương (Diamond VIP)' },
                  { label: 'Bạch Kim (Platinum)', value: 'Bạch Kim (Platinum)' },
                  { label: 'Vàng (Gold Enterprise)', value: 'Vàng (Gold Enterprise)' },
                  { label: 'Tiêu Chuẩn (Standard)', value: 'Tiêu Chuẩn (Standard)' },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item name="serviceName" label="Tên dịch vụ áp dụng" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Cụm GPU NVIDIA H100 Training Cluster" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="uptimeTarget" label="Cam kết Uptime (%)" rules={[{ required: true }]}>
              <Input type="number" step={0.01} min={90} max={100} />
            </Form.Item>
            <Form.Item name="responseTimeTarget" label="Thời gian phản hồi" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: ≤ 15 phút (24/7)" />
            </Form.Item>
            <Form.Item name="mttrTarget" label="MTTR Khắc phục tối đa" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: ≤ 2 giờ" />
            </Form.Item>
          </div>
          <Form.Item name="penaltyClause" label="Điều khoản bồi thường phạt vi phạm" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Mức khấu trừ cước phí hoặc bồi thường thiệt hại..." />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Ban hành cam kết SLA
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Giám Sát SLA Thời Gian Thực */}
      <Drawer
        title="Hồ Sơ Giám Sát &amp; Lịch Sử Sự Cố SLA"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={620}
      >
        {selectedSla && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedSla.slaCode}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedSla.serviceName}
                  </div>
                </div>
                <Tag color="success">{selectedSla.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>
                Phân hạng đối tượng: <strong>{selectedSla.clientTier}</strong>
              </div>
            </div>

            {/* Uptime Status */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, color: '#0F172A' }}>Uptime Thực Tế (Rolling 30 days):</span>
                <strong style={{ color: '#16A34A', fontSize: 15 }}>{selectedSla.actualUptime}%</strong>
              </div>
              <Progress percent={selectedSla.actualUptime} strokeColor="#16A34A" />
              <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 6, display: 'flex', justifyContent: 'space-between' }}>
                <span>Mục tiêu hợp đồng: {selectedSla.uptimeTarget}%</span>
                <span>Chênh lệch: +{(selectedSla.actualUptime - selectedSla.uptimeTarget).toFixed(3)}%</span>
              </div>
            </div>

            {/* Response Time & MTTR */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Chỉ Số Hiệu Năng Phục Hồi:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Thời gian phản hồi sự cố:</span>
                  <div style={{ fontWeight: 700, color: '#D97706' }}>{selectedSla.responseTimeTarget}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>MTTR Khắc phục thực tế:</span>
                  <div style={{ fontWeight: 700, color: '#2563EB' }}>{selectedSla.actualMttr} (Chuẩn: {selectedSla.mttrTarget})</div>
                </div>
              </div>
            </div>

            {/* Penalty */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#FFFBEB' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#B45309', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <WarningOutlined /> Điều Khoản Bồi Thường Khi Vi Phạm:
              </div>
              <div style={{ fontSize: 12.5, color: '#92400E', lineHeight: 1.5 }}>
                {selectedSla.penaltyClause}
              </div>
            </div>

            {/* Log table */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <HistoryOutlined style={{ color: '#009688' }} /> Nhật Ký Gián Đoạn / Bảo Trì Hệ Thống:
              </div>
              <div style={{ fontSize: 12, color: '#64748B' }}>
                Không ghi nhận sự cố gián đoạn ngoài kế hoạch nào trong 30 ngày qua.
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

