import { dataService } from '../../services/dataService';
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { PlusOutlined, SearchOutlined, DownloadOutlined, CalculatorOutlined, BuildOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag } from '../../custom-ui';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import { COSTING_CATEGORIES, COSTING_STATUSES, costingExportRows, costingMetrics, createCostingRecord, type CostingRecord } from './costingRules';

const CATEGORY_BY_PATH: Record<string, typeof COSTING_CATEGORIES[number]> = {
  '/finance/costing/contracts': 'Hợp đồng kinh tế B2B',
  '/finance/costing/orders': 'Đơn đặt hàng (Job-Order)',
  '/finance/costing/construction': 'Công trình thi công',
};

export const CostingModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');
  const currentCategory = CATEGORY_BY_PATH[currentPath];
  const isContracts = currentCategory === 'Hợp đồng kinh tế B2B';
  const isOrders = currentCategory === 'Đơn đặt hàng (Job-Order)';
  const isConstruction = currentCategory === 'Công trình thi công';
  const mounted = useRef(false);
  const [data, setData] = useState<CostingRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const records = await dataService.refreshGenericData('finance_costing');
      if (mounted.current) setData(Array.isArray(records) ? records : []);
    } catch (error: any) {
      if (mounted.current) message.error(error?.response?.data?.message || 'Không tải được dữ liệu giá thành.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = dataService.subscribe(() => {
      if (mounted.current) setData(dataService.getGenericData('finance_costing'));
    });
    void loadData();
    return () => { mounted.current = false; unsubscribe(); };
  }, []);

  const metrics = costingMetrics(data);
  const filteredData = data.filter((item) => {
    const matchesCategory = currentCategory ? item.category === currentCategory : categoryFilter === 'all' || item.category === categoryFilter;
    const query = searchText.trim().toLocaleLowerCase();
    const matchesSearch = !query || [item.code, item.projectName, item.category, item.constructionSite || '']
      .some((value) => String(value).toLocaleLowerCase().includes(query));
    return matchesCategory && matchesSearch;
  });

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      code: `GT-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      ...(currentCategory ? { category: currentCategory } : {}),
    });
    setModalOpen(true);
  };

  const handleCreate = async (values: Record<string, unknown>) => {
    let record: Omit<CostingRecord, 'createdDate' | 'createdBy' | 'createdById'>;
    try {
      record = createCostingRecord(values as any, data.map((item) => item.code));
    } catch (error: any) {
      message.error(error?.message || 'Thông tin giá thành chưa hợp lệ.');
      return;
    }
    setSaving(true);
    try {
      const saved = await dataService.createGenericRecord('finance_costing', record) as CostingRecord;
      setData((current) => [saved, ...current.filter((item) => item.key !== saved.key)]);
      message.success(`Đã lưu hồ sơ giá thành ${saved.code}.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được hồ sơ giá thành. Vui lòng kiểm tra lại dữ liệu.');
    } finally {
      setSaving(false);
    }
  };

  const exportData = () => {
    if (!filteredData.length) {
      message.info('Không có hồ sơ giá thành phù hợp để xuất.');
      return;
    }
    downloadFile('Bao_cao_gia_thanh.xlsx', generateValidXlsxBlob(costingExportRows(filteredData)));
  };

  const tableColumns = isContracts ? [
    { title: 'Mã hợp đồng', dataIndex: 'code', key: 'code', render: (value: string) => <strong>{value}</strong> },
    { title: 'Tên hợp đồng giải pháp', dataIndex: 'projectName', key: 'projectName' },
    { title: 'Vật tư trực tiếp', dataIndex: 'materialCost', key: 'materialCost', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'Nhân công trực tiếp', dataIndex: 'directLabor', key: 'directLabor', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'Hạ tầng & Cloud', dataIndex: 'infrastructureCost', key: 'infrastructureCost', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'License phần mềm', dataIndex: 'softwareLicense', key: 'softwareLicense', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'Chi phí chung khác', dataIndex: 'overheadCost', key: 'overheadCost', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'Tổng giá thành', dataIndex: 'totalCost', key: 'totalCost', render: (value: number) => <strong style={{ color: '#DC2626' }}>{value.toLocaleString('vi-VN')} ₫</strong> },
    { title: 'Giá trị hợp đồng', dataIndex: 'revenue', key: 'revenue', render: (value: number) => <strong style={{ color: '#009688' }}>{value.toLocaleString('vi-VN')} ₫</strong> },
    { title: 'Biên lãi gộp', dataIndex: 'profitMargin', key: 'profitMargin', render: (value: number | null) => value === null ? 'Chưa có doanh thu' : <Tag color={value >= 0 ? 'success' : 'error'}>{value}%</Tag> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={value === 'Hoàn thành' ? 'success' : value === 'Tạm dừng' ? 'default' : 'processing'}>{value}</Tag> },
  ] : isOrders ? [
    { title: 'Mã Job đơn hàng', dataIndex: 'code', key: 'code', render: (value: string) => <strong>{value}</strong> },
    { title: 'Quy cách sản phẩm / công việc', dataIndex: 'projectName', key: 'projectName' },
    { title: 'Vật tư trực tiếp', dataIndex: 'materialCost', key: 'materialCost', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'Nhân công kỹ thuật', dataIndex: 'directLabor', key: 'directLabor', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'Hạ tầng, bản quyền và chi phí chung', key: 'otherCost', render: (_: unknown, item: CostingRecord) => `${(item.infrastructureCost + item.softwareLicense + item.overheadCost).toLocaleString('vi-VN')} ₫` },
    { title: 'Giá thành Job', dataIndex: 'totalCost', key: 'totalCost', render: (value: number) => <strong style={{ color: '#DC2626' }}>{value.toLocaleString('vi-VN')} ₫</strong> },
    { title: 'Giá bán đơn hàng', dataIndex: 'revenue', key: 'revenue', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={value === 'Hoàn thành' ? 'success' : value === 'Tạm dừng' ? 'default' : 'processing'}>{value}</Tag> },
  ] : isConstruction ? [
    { title: 'Hạng mục thi công', dataIndex: 'projectName', key: 'projectName', render: (value: string) => <strong>{value}</strong> },
    { title: 'Mã hồ sơ', dataIndex: 'code', key: 'code' },
    { title: 'Địa điểm', dataIndex: 'constructionSite', key: 'constructionSite' },
    { title: 'Vật tư thi công', dataIndex: 'materialCost', key: 'materialCost', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'Nhân công lắp đặt', dataIndex: 'directLabor', key: 'directLabor', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'Hạ tầng và Cloud', dataIndex: 'infrastructureCost', key: 'infrastructureCost', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'Bản quyền phần mềm', dataIndex: 'softwareLicense', key: 'softwareLicense', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'Chi phí chung khác', dataIndex: 'overheadCost', key: 'overheadCost', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'Giá thành', dataIndex: 'totalCost', key: 'totalCost', render: (value: number) => <strong style={{ color: '#DC2626' }}>{value.toLocaleString('vi-VN')} ₫</strong> },
    { title: 'Giá trị hợp đồng', dataIndex: 'revenue', key: 'revenue', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'Biên lãi gộp', dataIndex: 'profitMargin', key: 'profitMargin', render: (value: number | null) => value === null ? 'Chưa có doanh thu' : <Tag color={value >= 0 ? 'success' : 'error'}>{value}%</Tag> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={value === 'Hoàn thành' ? 'success' : value === 'Tạm dừng' ? 'default' : 'processing'}>{value}</Tag> },
  ] : [
    { title: 'Mã giá thành', dataIndex: 'code', key: 'code', render: (value: string) => <span style={{ fontWeight: 700, color: '#009688' }}><CalculatorOutlined /> {value}</span> },
    { title: 'Dự án / Sản phẩm', dataIndex: 'projectName', key: 'projectName', render: (value: string) => <strong style={{ color: '#1E293B' }}>{value}</strong> },
    { title: 'Phân loại', dataIndex: 'category', key: 'category', render: (value: string) => <Tag color="blue">{value}</Tag> },
    { title: 'Giá thành (VNĐ)', dataIndex: 'totalCost', key: 'totalCost', render: (value: number) => <strong style={{ color: '#DC2626' }}>{value.toLocaleString('vi-VN')} ₫</strong> },
    { title: 'Doanh thu', dataIndex: 'revenue', key: 'revenue', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
    { title: 'Biên lãi gộp', dataIndex: 'profitMargin', key: 'profitMargin', render: (value: number | null) => value === null ? 'Chưa có doanh thu' : <Tag color={value >= 0 ? 'success' : 'error'}>{value}%</Tag> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (value: string) => <Tag color={value === 'Hoàn thành' ? 'success' : value === 'Tạm dừng' ? 'default' : 'processing'}>{value}</Tag> },
  ];

  const pageHeading = isContracts ? 'Tính giá thành theo hợp đồng kinh tế B2B' : isOrders ? 'Tính giá thành theo từng đơn đặt hàng' : isConstruction ? 'Tính giá thành hạng mục thi công' : 'Sổ tập hợp chi phí và giá thành';
  const createLabel = isContracts ? 'Tập hợp chi phí hợp đồng' : isOrders ? 'Tạo thẻ tính giá thành đơn' : isConstruction ? 'Thêm hạng mục công trình' : 'Tính giá thành dự án';

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giá thành đã lưu</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>{metrics.totalCost.toLocaleString('vi-VN')} ₫</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng doanh thu đã ghi nhận</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>{metrics.totalRevenue.toLocaleString('vi-VN')} ₫</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Biên lợi nhuận gộp tổng hợp</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: metrics.grossMargin === null ? '#64748B' : metrics.grossMargin >= 0 ? '#16A34A' : '#DC2626', marginTop: 4 }}>
            {metrics.grossMargin === null ? 'Chưa có doanh thu' : `${metrics.grossMargin}%`}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{pageHeading}</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {!currentCategory && (
              <Select
                value={categoryFilter}
                onChange={(value) => setCategoryFilter(value)}
                style={{ width: 210 }}
                options={[{ label: 'Tất cả phân loại', value: 'all' }, ...COSTING_CATEGORIES.map((category) => ({ label: category, value: category }))]}
              />
            )}
            <Input
              prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
              placeholder="Tìm mã, dự án, phân loại, địa điểm..."
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              style={{ width: 300 }}
              allowClear
            />
            <Button icon={<DownloadOutlined />} onClick={exportData} disabled={loading || !filteredData.length}>Xuất báo cáo</Button>
            <Button type="primary" icon={isConstruction ? <BuildOutlined /> : <PlusOutlined />} onClick={openCreate} disabled={loading || saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {createLabel}
            </Button>
          </div>
        </div>

        <div className="transparent-table-card">
          <KTable dataSource={filteredData} columns={tableColumns} pagination={{ pageSize: 8 }} loading={loading} />
        </div>
        <div style={{ fontSize: 12, color: '#64748B' }}>Chi phí và doanh thu được lưu theo hồ sơ nhập; cần đối chiếu với chứng từ nguồn trước khi sử dụng cho báo cáo kế toán.</div>
      </div>

      <Modal title="Tập hợp chi phí và tính giá thành" open={modalOpen} onCancel={() => { if (!saving) setModalOpen(false); }} footer={null} width={680}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="code" label="Mã giá thành" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập mã giá thành.' }]}>
              <Input maxLength={80} />
            </Form.Item>
            <Form.Item name="category" label="Phân loại" rules={[{ required: true, message: 'Vui lòng chọn phân loại.' }]}>
              <Select options={COSTING_CATEGORIES.map((category) => ({ label: category, value: category }))} />
            </Form.Item>
          </div>
          <Form.Item name="projectName" label="Tên dự án, hợp đồng hoặc công việc" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tên hồ sơ.' }]}>
            <Input maxLength={300} />
          </Form.Item>
          <Form.Item name="constructionSite" label="Địa điểm công trình (bắt buộc với hạng mục thi công)">
            <Input maxLength={300} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="materialCost" label="Chi phí vật tư trực tiếp (VNĐ)" rules={[{ required: true, message: 'Nhập số tiền, nhập 0 nếu không phát sinh.' }]}>
              <Input type="number" min={0} step={1} />
            </Form.Item>
            <Form.Item name="directLabor" label="Chi phí nhân công trực tiếp (VNĐ)" rules={[{ required: true, message: 'Nhập số tiền, nhập 0 nếu không phát sinh.' }]}>
              <Input type="number" min={0} step={1} />
            </Form.Item>
            <Form.Item name="infrastructureCost" label="Chi phí hạ tầng và Cloud (VNĐ)" rules={[{ required: true, message: 'Nhập số tiền, nhập 0 nếu không phát sinh.' }]}>
              <Input type="number" min={0} step={1} />
            </Form.Item>
            <Form.Item name="softwareLicense" label="Chi phí bản quyền phần mềm (VNĐ)" rules={[{ required: true, message: 'Nhập số tiền, nhập 0 nếu không phát sinh.' }]}>
              <Input type="number" min={0} step={1} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="overheadCost" label="Chi phí chung khác (VNĐ)" rules={[{ required: true, message: 'Nhập số tiền, nhập 0 nếu không phát sinh.' }]}>
              <Input type="number" min={0} step={1} />
            </Form.Item>
            <Form.Item name="revenue" label="Doanh thu dự kiến hoặc đã xác nhận (VNĐ)" rules={[{ required: true, message: 'Nhập số tiền, nhập 0 nếu chưa có doanh thu.' }]}>
              <Input type="number" min={0} step={1} />
            </Form.Item>
          </div>
          <Form.Item name="status" label="Trạng thái hồ sơ" rules={[{ required: true, message: 'Vui lòng chọn trạng thái.' }]}>
            <Select options={COSTING_STATUSES.map((status) => ({ label: status, value: status }))} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 14 }}>
            <Button onClick={() => setModalOpen(false)} disabled={saving}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu hồ sơ giá thành
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
