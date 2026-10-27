import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import { crmContactsApi, type CrmContact } from '../../api/endpoints';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { deriveSupplierScore, supplierEvaluationExportRows, supplierEvaluationMetrics } from './supplierEvaluationRules';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  StarOutlined,
  ShopOutlined,
  CheckCircleOutlined,
  PrinterOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
  StarFilled,
  InfoCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Progress, Alert } from '../../custom-ui';

export interface EnterpriseSupplierEval {
  key: string;
  evalCode: string;
  supplierId: string;
  supplierName: string;
  category: string;
  qualityScore: number; // Max 40
  deliveryScore: number; // Max 30
  priceScore: number; // Max 20
  serviceScore: number; // Max 10
  totalScore: number; // Max 100
  tier: 'Hạng A' | 'Hạng B' | 'Hạng C';
  evalPeriod: string;
  evaluator: string;
  evaluatorId: string;
  evalDate?: string;
  strengths?: string;
  weaknesses?: string;
  decision?: 'Duy trì đối tác chiến lược' | 'Gia hạn hợp đồng & đàm phán giá' | 'Yêu cầu khắc phục SLA trong 30 ngày' | 'Chấm dứt hợp tác';
}

const INITIAL_SUPPLIER_EVALS: EnterpriseSupplierEval[] = [];

export const SupplierEvaluationModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseSupplierEval[]>(INITIAL_SUPPLIER_EVALS);
  const [suppliers, setSuppliers] = useState<CrmContact[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const list = dataService.getGenericData('crm_supplier_evaluations');
    setData(Array.isArray(list) ? list : []);
    let mounted = true;
    setLoading(true);
    void Promise.all([dataService.refreshGenericData('crm_supplier_evaluations'), crmContactsApi.getAll('supplier')])
      .then(([records, response]) => {
        if (!mounted) return;
        setData(Array.isArray(records) ? records : []);
        setSuppliers((response.data.data || []).filter((supplier) => !String(supplier.status).toLocaleLowerCase().includes('tạm')));
      })
      .catch((error: any) => { if (mounted) message.error(error?.response?.data?.message || 'Không tải được đánh giá hoặc danh sách nhà cung cấp.'); })
      .finally(() => { if (mounted) setLoading(false); });
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('crm_supplier_evaluations');
      if (mounted) setData(Array.isArray(updated) ? updated : []);
    });
    return () => { mounted = false; unsub(); };
  }, []);

  const [searchText, setSearchText] = useState('');
  const [tierFilter, setTierFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEval, setSelectedEval] = useState<EnterpriseSupplierEval | null>(null);

  const metrics = supplierEvaluationMetrics(data);

  const handleCreate = async (values: any) => {
    setSaving(true);
    try {
      const scores = {
        qualityScore: Number(values.qualityScore),
        deliveryScore: Number(values.deliveryScore),
        priceScore: Number(values.priceScore),
        serviceScore: Number(values.serviceScore),
      };
      const derived = deriveSupplierScore(scores);
      const saved = await dataService.createGenericRecord('crm_supplier_evaluations', {
        key: crypto.randomUUID(),
        evalCode: values.evalCode,
        supplierId: values.supplierId,
        evalPeriod: values.evalPeriod,
        ...scores,
        ...derived,
        strengths: values.strengths || '',
        weaknesses: values.weaknesses || '',
        decision: values.decision || '',
      }) as EnterpriseSupplierEval;
      await dataService.refreshGenericData('crm_supplier_evaluations');
      message.success(`Đã lưu bảng đánh giá nhà cung cấp: ${saved.supplierName}`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu bảng đánh giá nhà cung cấp.');
    } finally {
      setSaving(false);
    }
  };

  const exportEvaluations = () => downloadFile('Bao_cao_danh_gia_nha_cung_cap.xlsx', generateValidXlsxBlob(supplierEvaluationExportRows(filteredData)));
  const printEvaluation = (record: EnterpriseSupplierEval) => downloadFile(`${record.evalCode.replace(/[^a-z0-9_-]/gi, '_')}_danh_gia_nha_cung_cap.pdf`, generateValidPdfBlob(
    'BIEN BAN DANH GIA NANG LUC NHA CUNG CAP', `${record.evalCode} | ${record.supplierName}`,
    [`Linh vuc: ${record.category}`, `Ky danh gia: ${record.evalPeriod}`, `Ngay danh gia: ${record.evalDate || ''}`,
      `Chat luong: ${record.qualityScore}/40`, `Tien do: ${record.deliveryScore}/30`, `Gia: ${record.priceScore}/20`, `Dich vu: ${record.serviceScore}/10`,
      `Tong diem: ${record.totalScore}/100`, `Phan hang: ${record.tier}`, `Nguoi danh gia: ${record.evaluator}`,
      `Uu diem: ${record.strengths || 'Chua ghi nhan'}`, `Diem can cai thien: ${record.weaknesses || 'Chua ghi nhan'}`,
      `Ket luan: ${record.decision || 'Chua co ket luan'}`],
  ));

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
      title: 'Chi tiết điểm thành phần',
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhà cung cấp Hạng A</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {metrics.tierACount} đối tác
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đạt từ 90 đến 100 điểm đánh giá</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhà cung cấp Hạng B</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {metrics.tierBCount} đối tác
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Đạt từ 75 đến 89 điểm đánh giá</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đánh giá hạng C</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: metrics.tierCCount > 0 ? '#DC2626' : '#64748B', marginTop: 4 }}>
            {metrics.tierCCount} đánh giá
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Dưới 75 điểm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Điểm bình quân hệ thống NCC</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {metrics.averageScore == null ? '—' : `${Math.round(metrics.averageScore * 10) / 10}`} / 100
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Điểm trung bình trên {metrics.count} đánh giá</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả đánh giá' },
            { key: 'Hạng A', label: 'Hạng A', icon: <StarFilled style={{ color: '#F59E0B' }} /> },
            { key: 'Hạng B', label: 'Hạng B', icon: <InfoCircleOutlined style={{ color: '#3B82F6' }} /> },
            { key: 'Hạng C', label: 'Hạng C', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
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

          <Button icon={<DownloadOutlined />} onClick={exportEvaluations} disabled={loading}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              const today = new Date();
              const dateCode = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
              form.setFieldsValue({
                evalCode: `NCC-DG-${dateCode}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
              });
              setModalOpen(true);
            }}
            disabled={loading || suppliers.length === 0}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập bảng đánh giá NCC
          </Button>
        </div>
      </div>

      {!loading && suppliers.length === 0 && (
        <Alert type="info" showIcon message="Chưa có nhà cung cấp đang hợp tác. Hãy thêm nhà cung cấp trong Danh bạ trước khi lập đánh giá." style={{ marginBottom: 12 }} />
      )}

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
              <Input readOnly />
            </Form.Item>
            <Form.Item name="evalPeriod" label="Kỳ đánh giá" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Quý III / 2026" />
            </Form.Item>
          </div>

          <Form.Item name="supplierId" label="Nhà cung cấp" rules={[{ required: true }]}>
            <Select
              showSearch
              placeholder="Chọn nhà cung cấp"
              options={suppliers.map((supplier) => ({ value: supplier.key, label: `${supplier.code} · ${supplier.name}${supplier.industry ? ` · ${supplier.industry}` : ''}` }))}
            />
          </Form.Item>

          <Form.Item name="evalPeriod" label="Kỳ đánh giá" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Quý IV / 2026" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            <Form.Item name="qualityScore" label="CL" rules={[{ required: true }]}>
              <Input type="number" min={0} max={40} />
            </Form.Item>
            <Form.Item name="deliveryScore" label="TĐ" rules={[{ required: true }]}>
              <Input type="number" min={0} max={30} />
            </Form.Item>
            <Form.Item name="priceScore" label="Giá" rules={[{ required: true }]}>
              <Input type="number" min={0} max={20} />
            </Form.Item>
            <Form.Item name="serviceScore" label="DV" rules={[{ required: true }]}>
              <Input type="number" min={0} max={10} />
            </Form.Item>
          </div>

          <Form.Item name="strengths" label="Ưu điểm">
            <Input.TextArea rows={2} maxLength={2000} showCount />
          </Form.Item>

          <Form.Item name="weaknesses" label="Điểm cần cải thiện">
            <Input.TextArea rows={2} maxLength={2000} showCount />
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
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu đánh giá NCC
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Đánh Giá Năng Lực NCC */}
      <Drawer
        title="Biên Bản Đánh Giá Năng Lực Nhà Cung Cấp"
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
                    <span>1. Chất lượng sản phẩm &amp; Kỹ thuật:</span>
                    <strong style={{ color: '#16A34A' }}>{selectedEval.qualityScore} / 40 đ</strong>
                  </div>
                  <Progress percent={(selectedEval.qualityScore / 40) * 100} strokeColor="#16A34A" size="small" showInfo={false} />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}>
                    <span>2. Tiến độ giao hàng &amp; Cam kết SLA:</span>
                    <strong style={{ color: '#2563EB' }}>{selectedEval.deliveryScore} / 30 đ</strong>
                  </div>
                  <Progress percent={(selectedEval.deliveryScore / 30) * 100} strokeColor="#2563EB" size="small" showInfo={false} />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}>
                    <span>3. Giá cả &amp; Chính sách công nợ:</span>
                    <strong style={{ color: '#D97706' }}>{selectedEval.priceScore} / 20 đ</strong>
                  </div>
                  <Progress percent={(selectedEval.priceScore / 20) * 100} strokeColor="#D97706" size="small" showInfo={false} />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 2 }}>
                    <span>4. Dịch vụ sau bán hàng &amp; Bảo hành:</span>
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><CheckCircleOutlined style={{ color: '#16A34A' }} /> <span><strong>Ưu điểm:</strong> {selectedEval.strengths || 'Chưa ghi nhận'}</span></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><WarningOutlined style={{ color: '#D97706' }} /> <span><strong>Điểm cần cải thiện:</strong> {selectedEval.weaknesses || 'Chưa ghi nhận'}</span></div>
              </div>
            </div>

            {/* Final Decision */}
            <div style={{ border: '1px solid #BBF7D0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <SafetyCertificateOutlined /> Kết luận đề xuất:
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#14532D' }}>
                {selectedEval.decision || 'Chưa có kết luận'}
              </div>
              <div style={{ fontSize: 12, color: '#166534', marginTop: 4 }}>
                Người đánh giá: <strong>{selectedEval.evaluator}</strong>
              </div>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              icon={<PrinterOutlined />}
              onClick={() => printEvaluation(selectedEval)}
            >
              Tải biên bản PDF
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

