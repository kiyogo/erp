import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  StarOutlined,
  ShopOutlined,
  CheckCircleOutlined,
  PrinterOutlined,
  AuditOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
  StarFilled,
  InfoCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';

export interface EnterpriseSupplierEval {
  key: string;
  evalCode: string;
  supplierName: string;
  category: string;
  qualityScore: number; // Max 40
  deliveryScore: number; // Max 30
  priceScore: number; // Max 20
  serviceScore: number; // Max 10
  totalScore: number; // Max 100
  tier: 'Hạng A (Chiến lược)' | 'Hạng B (Đạt chuẩn)' | 'Hạng C (Cần cải thiện)';
  evalPeriod: string;
  evaluator: string;
  strengths?: string;
  weaknesses?: string;
  decision?: 'Duy trì đối tác chiến lược' | 'Gia hạn hợp đồng & đàm phán giá' | 'Yêu cầu khắc phục SLA trong 30 ngày' | 'Chấm dứt hợp tác';
}

const INITIAL_SUPPLIER_EVALS: EnterpriseSupplierEval[] = [];

export const SupplierEvaluationModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseSupplierEval[]>(INITIAL_SUPPLIER_EVALS);
  const [searchText, setSearchText] = useState('');
  const [tierFilter, setTierFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEval, setSelectedEval] = useState<EnterpriseSupplierEval | null>(null);

  const tierACount = data.filter((d) => d.tier.startsWith('Hạng A')).length;
  const tierBCount = data.filter((d) => d.tier.startsWith('Hạng B')).length;
  const tierCCount = data.filter((d) => d.tier.startsWith('Hạng C')).length;
  const avgScore = Math.round((data.reduce((sum, item) => sum + item.totalScore, 0) / (data.length || 1)) * 10) / 10;

  const handleCreate = (values: any) => {
    const q = Number(values.qualityScore) || 35;
    const d = Number(values.deliveryScore) || 25;
    const p = Number(values.priceScore) || 18;
    const s = Number(values.serviceScore) || 8;
    const total = q + d + p + s;
    let tr: EnterpriseSupplierEval['tier'] = 'Hạng B (Đạt chuẩn)';
    if (total >= 90) tr = 'Hạng A (Chiến lược)';
    else if (total < 75) tr = 'Hạng C (Cần cải thiện)';

    const newEval: EnterpriseSupplierEval = {
      ...values,
      key: String(Date.now()),
      qualityScore: q,
      deliveryScore: d,
      priceScore: p,
      serviceScore: s,
      totalScore: total,
      tier: tr,
      decision: values.decision || (total >= 90 ? 'Duy trì đối tác chiến lược' : 'Gia hạn hợp đồng & đàm phán giá'),
    };
    setData([newEval, ...data]);
    message.success(`Đã lưu bảng đánh giá nhà cung cấp: ${values.supplierName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchTier =
      tierFilter === 'all' ||
      (tierFilter === 'Hạng A' && item.tier.startsWith('Hạng A')) ||
      (tierFilter === 'Hạng B' && item.tier.startsWith('Hạng B')) ||
      (tierFilter === 'Hạng C' && item.tier.startsWith('Hạng C'));

    const matchSearch =
      (item.evalCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.supplierName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.evaluator || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTier && matchSearch;
  });

  const columns = [
    {
      title: 'Mã đánh giá & Kỳ',
      key: 'evalCode',
      render: (_: any, record: EnterpriseSupplierEval) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <ShopOutlined /> {record.evalCode}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{record.evalPeriod}</div>
        </div>
      ),
    },
    {
      title: 'Tên Nhà Cung Cấp & Lĩnh vực',
      key: 'supplierName',
      render: (_: any, record: EnterpriseSupplierEval) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.supplierName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>Lĩnh vực: {record.category}</div>
        </div>
      ),
    },
    {
      title: 'Chi tiết điểm thành phần (CL / TĐ / Giá / DV)',
      key: 'breakdown',
      width: 250,
      render: (_: any, record: EnterpriseSupplierEval) => (
        <div style={{ fontSize: 12 }}>
          <span>CL: <strong style={{ color: '#16A34A' }}>{record.qualityScore}</strong>/40</span> ·{' '}
          <span>TĐ: <strong style={{ color: '#2563EB' }}>{record.deliveryScore}</strong>/30</span> ·{' '}
          <span>Giá: <strong style={{ color: '#D97706' }}>{record.priceScore}</strong>/20</span> ·{' '}
          <span>DV: <strong style={{ color: '#7C3AED' }}>{record.serviceScore}</strong>/10</span>
        </div>
      ),
    },
    {
      title: 'Tổng điểm',
      dataIndex: 'totalScore',
      key: 'totalScore',
      width: 120,
      render: (score: number) => (
        <span style={{ fontWeight: 800, fontSize: 14.5, color: score >= 90 ? '#16A34A' : '#2563EB' }}>
          {score} / 100 đ
        </span>
      ),
      sorter: (a: EnterpriseSupplierEval, b: EnterpriseSupplierEval) => a.totalScore - b.totalScore,
    },
    {
      title: 'Phân hạng',
      dataIndex: 'tier',
      key: 'tier',
      width: 160,
      render: (tier: string) => {
        let color = 'default';
        if (tier.startsWith('Hạng A')) color = 'success';
        if (tier.startsWith('Hạng B')) color = 'processing';
        if (tier.startsWith('Hạng C')) color = 'error';
        return <Tag color={color}>{tier}</Tag>;
      },
    },
    {
      title: 'Người đánh giá',
      dataIndex: 'evaluator',
      key: 'evaluator',
      render: (e: string) => <span style={{ color: '#475569', fontSize: 12.5 }}>{e}</span>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseSupplierEval) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedEval(record);
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhà cung cấp Hạng A (Chiến lược)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {tierACount} đối tác
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đạt từ 90 đến 100 điểm đánh giá</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhà cung cấp Hạng B (Đạt chuẩn)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {tierBCount} đối tác
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Đạt từ 75 đến 89 điểm đánh giá</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cần cải thiện / Giám sát SLA</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: tierCCount > 0 ? '#DC2626' : '#64748B', marginTop: 4 }}>
            {tierCCount} đối tác
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Dưới 75 điểm (Cần cảnh báo)</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Điểm bình quân hệ thống NCC</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {avgScore} / 100
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Khung điểm chuẩn ISO 9001:2015</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả đánh giá' },
            { key: 'Hạng A', label: 'Hạng A (Chiến lược)', icon: <StarFilled style={{ color: '#F59E0B' }} /> },
            { key: 'Hạng B', label: 'Hạng B (Đạt chuẩn)', icon: <InfoCircleOutlined style={{ color: '#3B82F6' }} /> },
            { key: 'Hạng C', label: 'Hạng C (Cần cải thiện)', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
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

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã, NCC, lĩnh vực, người đánh giá..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo đánh giá NCC ra Excel')}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                evalCode: `NCC-DG-0${data.length + 1}`,
                evalPeriod: 'Quý III / 2026',
                qualityScore: 36,
                deliveryScore: 28,
                priceScore: 18,
                serviceScore: 9,
                evaluator: 'Trần Tuấn Anh (CTO)',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập bảng đánh giá NCC
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Tạo đánh giá mới */}
      <Modal
        title="Lập Bảng Đánh Giá Năng Lực Nhà Cung Cấp"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={620}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="evalCode" label="Mã đánh giá" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="evalPeriod" label="Kỳ đánh giá" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Quý III / 2026" />
            </Form.Item>
          </div>

          <Form.Item name="supplierName" label="Tên Nhà cung cấp" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Công Ty Cổ Phần FPT Telecom" />
          </Form.Item>

          <Form.Item name="category" label="Lĩnh vực cung ứng" initialValue="Đường truyền &amp; Hạ tầng Cloud">
            <Input />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <Form.Item name="qualityScore" label="CL (max 40)" rules={[{ required: true }]}>
              <Input type="number" min={0} max={40} />
            </Form.Item>
            <Form.Item name="deliveryScore" label="TĐ (max 30)" rules={[{ required: true }]}>
              <Input type="number" min={0} max={30} />
            </Form.Item>
            <Form.Item name="priceScore" label="Giá (max 20)" rules={[{ required: true }]}>
              <Input type="number" min={0} max={20} />
            </Form.Item>
            <Form.Item name="serviceScore" label="DV (max 10)" rules={[{ required: true }]}>
              <Input type="number" min={0} max={10} />
            </Form.Item>
          </div>

          <Form.Item name="evaluator" label="Cán bộ đánh giá" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="decision" label="Kết luận đề xuất của Hội đồng">
            <Select
              options={[
                { label: 'Duy trì đối tác chiến lược', value: 'Duy trì đối tác chiến lược' },
                { label: 'Gia hạn hợp đồng & đàm phán giá', value: 'Gia hạn hợp đồng & đàm phán giá' },
                { label: 'Yêu cầu khắc phục SLA trong 30 ngày', value: 'Yêu cầu khắc phục SLA trong 30 ngày' },
                { label: 'Chấm dứt hợp tác', value: 'Chấm dứt hợp tác' },
              ]}
            />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu đánh giá NCC
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Đánh Giá Năng Lực NCC */}
      <Drawer
        title="Biên Bản Đánh Giá Năng Lực Nhà Cung Cấp (ISO 9001:2015)"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedEval && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ PHIẾU: {selectedEval.evalCode}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedEval.supplierName}
                  </div>
                </div>
                <Tag color={selectedEval.tier.startsWith('Hạng A') ? 'success' : 'processing'}>
                  {selectedEval.tier}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Lĩnh vực: {selectedEval.category} · Kỳ đánh giá: {selectedEval.evalPeriod}
              </div>
            </div>

            {/* Score Breakdown Bars */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>
                Chi Tiết Bảng Điểm 4 Tiêu Chí (Tổng {selectedEval.totalScore}/100 đ):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}>
                    <span>1. Chất lượng sản phẩm &amp; Kỹ thuật (Tối đa 40đ):</span>
                    <strong style={{ color: '#16A34A' }}>{selectedEval.qualityScore} / 40 đ</strong>
                  </div>
                  <Progress percent={(selectedEval.qualityScore / 40) * 100} strokeColor="#16A34A" size="small" showInfo={false} />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}>
                    <span>2. Tiến độ giao hàng &amp; Cam kết SLA (Tối đa 30đ):</span>
                    <strong style={{ color: '#2563EB' }}>{selectedEval.deliveryScore} / 30 đ</strong>
                  </div>
                  <Progress percent={(selectedEval.deliveryScore / 30) * 100} strokeColor="#2563EB" size="small" showInfo={false} />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}>
                    <span>3. Giá cả &amp; Chính sách công nợ (Tối đa 20đ):</span>
                    <strong style={{ color: '#D97706' }}>{selectedEval.priceScore} / 20 đ</strong>
                  </div>
                  <Progress percent={(selectedEval.priceScore / 20) * 100} strokeColor="#D97706" size="small" showInfo={false} />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}>
                    <span>4. Dịch vụ sau bán hàng &amp; Bảo hành (Tối đa 10đ):</span>
                    <strong style={{ color: '#7C3AED' }}>{selectedEval.serviceScore} / 10 đ</strong>
                  </div>
                  <Progress percent={(selectedEval.serviceScore / 10) * 100} strokeColor="#7C3AED" size="small" showInfo={false} />
                </div>
              </div>
            </div>

            {/* Assessment Remarks */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Nhận Xét Của Hội Đồng Đánh Giá:
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircleOutlined style={{ color: '#16A34A' }} /> <span><strong>Ưu điểm nổi bật:</strong> {selectedEval.strengths || 'Tuân thủ hợp đồng và phản hồi nhanh.'}</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><WarningOutlined style={{ color: '#D97706' }} /> <span><strong>Tồn tại cần khắc phục:</strong> {selectedEval.weaknesses || 'Cần rút ngắn thời gian chuẩn bị đơn hàng.'}</span></div>
              </div>
            </div>

            {/* Final Decision */}
            <div style={{ border: '1px solid #BBF7D0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <SafetyCertificateOutlined /> Kết Luận &amp; Quyết Định Hội Đồng:
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#14532D' }}>
                {selectedEval.decision || 'Duy trì đối tác chiến lược'}
              </div>
              <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>
                Cán bộ lập đánh giá: <strong>{selectedEval.evaluator}</strong>
              </div>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              icon={<PrinterOutlined />}
              onClick={() => message.success(`Đã in biên bản đánh giá nhà cung cấp ${selectedEval.supplierName}`)}
            >
              In Biên Bản Đánh Giá NCC (PDF)
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

