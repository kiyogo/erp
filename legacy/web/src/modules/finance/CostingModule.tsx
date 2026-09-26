import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CalculatorOutlined,
  BuildOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag } from '../../custom-ui';

interface CostItem {
  key: string;
  code: string;
  projectName: string;
  category: string;
  directLabor: number;
  infrastructureCost: number;
  softwareLicense: number;
  overheadCost: number;
  totalCost: number;
  revenue: number;
  profitMargin: number;
}

const INITIAL_COSTING: CostItem[] = [];

export const CostingModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isContracts = currentPath === '/finance/costing/contracts';
  const isOrders = currentPath === '/finance/costing/orders';
  const isConstruction = currentPath === '/finance/costing/construction';

  const [data, setData] = useState<CostItem[]>(INITIAL_COSTING);

  useEffect(() => {
    const list = dataService.getGenericData('finance_costing');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_costing');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const totalAllCost = data.reduce((sum, item) => sum + item.totalCost, 0);
  const totalAllRevenue = data.reduce((sum, item) => sum + item.revenue, 0);
  const avgMargin = Math.round(((totalAllRevenue - totalAllCost) / totalAllRevenue) * 1000) / 10;

  const handleCreate = (values: any) => {
    const labor = Number(values.directLabor) || 0;
    const infra = Number(values.infrastructureCost) || 0;
    const lic = Number(values.softwareLicense) || 0;
    const over = 10000000;
    const total = labor + infra + lic + over;
    const rev = Number(values.revenue) || 0;
    const margin = rev > 0 ? Math.round(((rev - total) / rev) * 1000) / 10 : 0;

    const newItem: CostItem = {
      ...values,
      key: String(Date.now()),
      directLabor: labor,
      infrastructureCost: infra,
      softwareLicense: lic,
      overheadCost: over,
      totalCost: total,
      revenue: rev,
      profitMargin: margin,
    };
    const nextItems = [newItem, ...data]; setData(nextItems); dataService.saveGenericData('finance_costing', nextItems);
    message.success(`Đã tính giá thành cho: ${values.projectName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter(
    (item) =>
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.projectName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giá thành tập hợp toàn bộ dự án</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {totalAllCost.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng doanh thu dự án thực hiện</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalAllRevenue.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Biên lợi nhuận gộp bình quân</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            +{avgMargin}% (Hiệu quả cao)
          </div>
        </div>
      </div>

      {isContracts && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Tính Giá Thành Theo Hợp Đồng Kinh Tế B2B (Cung Cấp Giải Pháp)</h3>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Tập hợp chi phí Hợp đồng
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={data.filter((d) => d.category.includes('Hợp đồng'))}
              columns={[
                { title: 'Mã hợp đồng', dataIndex: 'code', key: 'code', render: (c: string) => <strong>{c}</strong> },
                { title: 'Tên hợp đồng giải pháp', dataIndex: 'projectName', key: 'projectName', render: (p: string) => <strong style={{ color: '#2563EB' }}>{p}</strong> },
                { title: 'Nhân công trực tiếp (622)', dataIndex: 'directLabor', key: 'directLabor', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Hạ tầng & Cloud (627)', dataIndex: 'infrastructureCost', key: 'infrastructureCost', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'License phần mềm (621)', dataIndex: 'softwareLicense', key: 'softwareLicense', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Tổng giá thành (Z)', dataIndex: 'totalCost', key: 'totalCost', render: (v: number) => <strong style={{ color: '#DC2626' }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Giá trị hợp đồng', dataIndex: 'revenue', key: 'revenue', render: (v: number) => <strong style={{ color: '#009688' }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Biên lãi gộp', dataIndex: 'profitMargin', key: 'profitMargin', render: (m: number) => <Tag color="success">+{m}%</Tag> },
              ]}
            />
          </div>
        </div>
      )}

      {isOrders && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Tính Giá Thành Theo Từng Đơn Đặt Hàng (Job-Order Costing)</h3>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Tạo thẻ tính giá thành đơn
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[
                { id: '1', order: 'JOB-2026-081', desc: 'Lắp ráp 02 Máy Chủ Dell PowerEdge R760 Rack Server', rawCost: 195000000, laborCost: 15000000, overheadCost: 8000000, totalCost: 218000000, orderPrice: 280000000, status: 'Hoàn thành' },
                { id: '2', order: 'JOB-2026-082', desc: 'Thiết lập cụm Cluster Firewall HA Fortinet 100F', rawCost: 120000000, laborCost: 12000000, overheadCost: 6000000, totalCost: 138000000, orderPrice: 175000000, status: 'Hoàn thành' },
              ]}
              columns={[
                { title: 'Mã Job Đơn hàng', dataIndex: 'order', key: 'order', render: (o: string) => <strong>{o}</strong> },
                { title: 'Quy cách sản phẩm', dataIndex: 'desc', key: 'desc' },
                { title: 'Vật tư trực tiếp (621)', dataIndex: 'rawCost', key: 'rawCost', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Nhân công kỹ thuật (622)', dataIndex: 'laborCost', key: 'laborCost', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Sản xuất chung (627)', dataIndex: 'overheadCost', key: 'overheadCost', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Giá thành Job (Z)', dataIndex: 'totalCost', key: 'totalCost', render: (v: number) => <strong style={{ color: '#DC2626' }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Giá bán đơn hàng', dataIndex: 'orderPrice', key: 'orderPrice', render: (v: number) => <strong style={{ color: '#009688' }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag icon={<CheckOutlined />} color="success">{s}</Tag> },
              ]}
            />
          </div>
        </div>
      )}

      {isConstruction && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Tính Giá Thành Hạng Mục Thi Công &amp; Phòng Server Data Center</h3>
            <Button type="primary" icon={<BuildOutlined />} onClick={() => message.info('Mở lập dự toán công trình')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Thêm hạng mục công trình
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[
                { id: '1', name: 'Thi công hệ thống điện dự phòng UPS & Generator IDC', site: 'Phòng Máy Chủ Viettel IDC', rawCost: 180000000, laborCost: 45000000, totalCost: 225000000, revenue: 320000000, status: 'Đã nghiệm thu' },
                { id: '2', name: 'Lắp đặt hệ thống cáp cấu trúc MPO 100G', site: 'Phòng Lab Trụ Sở HN', rawCost: 65000000, laborCost: 18000000, totalCost: 83000000, revenue: 125000000, status: 'Đang thi công' },
              ]}
              columns={[
                { title: 'Hạng mục thi công', dataIndex: 'name', key: 'name', render: (n: string) => <strong>{n}</strong> },
                { title: 'Địa điểm', dataIndex: 'site', key: 'site' },
                { title: 'Vật tư thi công', dataIndex: 'rawCost', key: 'rawCost', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Nhân công lắp đặt', dataIndex: 'laborCost', key: 'laborCost', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Giá thành (Z)', dataIndex: 'totalCost', key: 'totalCost', render: (v: number) => <strong style={{ color: '#DC2626' }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Giá trị hợp đồng', dataIndex: 'revenue', key: 'revenue', render: (v: number) => <strong style={{ color: '#009688' }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s.includes('nghiệm thu') ? 'success' : 'processing'}>{s}</Tag> },
              ]}
            />
          </div>
        </div>
      )}

      {!isContracts && !isOrders && !isConstruction && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo mã dự án, tên giải pháp..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 340, borderRadius: 6 }}
              allowClear
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo giá thành ra Excel')}>
                Xuất Báo Cáo
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields();
                  setModalOpen(true);
                }}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Tính giá thành dự án
              </Button>
            </div>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={filteredData}
              columns={[
                { title: 'Mã dự án', dataIndex: 'code', key: 'code', render: (c: string) => <span style={{ fontWeight: 700, color: '#009688' }}><CalculatorOutlined /> {c}</span> },
                { title: 'Tên dự án / Sản phẩm', dataIndex: 'projectName', key: 'projectName', render: (p: string) => <strong style={{ color: '#1E293B' }}>{p}</strong> },
                { title: 'Phân loại', dataIndex: 'category', key: 'category', render: (c: string) => <Tag color="blue">{c}</Tag> },
                { title: 'Giá thành (VNĐ)', dataIndex: 'totalCost', key: 'totalCost', render: (val: number) => <strong style={{ color: '#DC2626' }}>{val.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Doanh thu hợp đồng', dataIndex: 'revenue', key: 'revenue', render: (val: number) => <strong style={{ color: '#009688' }}>{val.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Biên lãi gộp (%)', dataIndex: 'profitMargin', key: 'profitMargin', render: (m: number) => <Tag color="success">+{m}%</Tag> },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      <Modal
        title="Tập hợp chi phí & Tính giá thành dự án mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã dự án" initialValue={`GT-2026-00${data.length + 1}`} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="category" label="Phân loại" initialValue="Hợp đồng kinh tế B2B">
              <Select
                options={[
                  { label: 'Hợp đồng kinh tế B2B', value: 'Hợp đồng kinh tế B2B' },
                  { label: 'Đơn đặt hàng (Job-Order)', value: 'Đơn đặt hàng (Job-Order)' },
                  { label: 'Công trình thi công', value: 'Công trình thi công' },
                  { label: 'Dịch vụ duy trì SLA', value: 'Dịch vụ duy trì SLA' },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item name="projectName" label="Tên dự án / Hợp đồng" rules={[{ required: true, message: 'Nhập tên dự án' }]}>
            <Input placeholder="Ví dụ: Nền tảng AI Chatbot cho Ngân Hàng" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="directLabor" label="Chi phí nhân sự trực tiếp (TK 622)" initialValue={200000000} rules={[{ required: true }]}>
              <Input type="number" min={0} step={10000000} />
            </Form.Item>
            <Form.Item name="infrastructureCost" label="Hạ tầng Cloud & Server (TK 627)" initialValue={50000000}>
              <Input type="number" min={0} step={5000000} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="softwareLicense" label="Bản quyền License (TK 621)" initialValue={30000000}>
              <Input type="number" min={0} step={5000000} />
            </Form.Item>
            <Form.Item name="revenue" label="Doanh thu hợp đồng (VNĐ)" initialValue={500000000} rules={[{ required: true }]}>
              <Input type="number" min={0} step={10000000} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận tính giá thành
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
