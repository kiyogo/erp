import React, { useEffect, useState } from 'react';
import {
  useLocation } from 'react-router-dom';
import {
  ShopOutlined,
  CloudServerOutlined,
  SafetyCertificateOutlined,
  RobotOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  RightOutlined,
  ApiOutlined,
  ThunderboltOutlined,
  DownloadOutlined,
  PlusOutlined,
  AppstoreOutlined,
  BarsOutlined,
  SearchOutlined,
  DollarOutlined,
  EyeOutlined,
  PhoneOutlined,
  MailOutlined,
  CloudOutlined,
  GlobalOutlined,
} from '@ant-design/icons';
import { Modal, Form, Input, Button, Select, message, Tag, Drawer, Radio } from '../../custom-ui';
import { KTable } from '../../components/KTable';
import { collectionsApi } from '../../api/endpoints';

export interface EnterpriseServicePackage {
  id: string;
  code: string;
  name: string;
  category: 'Hạ tầng Cloud & IDC' | 'Trí tuệ nhân tạo AI' | 'An ninh mạng & CA' | 'Kênh truyền & Mạng';
  iconType: 'cloud' | 'ai' | 'sec' | 'network' | 'erp';
  description: string;
  features: string[];
  specs: { label: string; value: string }[];
  slaTarget: string;
  priceMonthly: number;
  activeContracts: number;
  status: 'Đang cung cấp' | 'Bảo trì nâng cấp' | 'Thử nghiệm Beta';
}

export const EnterpriseServicesModule: React.FC = () => {
  const [services, setServices] = useState<EnterpriseServicePackage[]>([]);
  const [activeCategory, setActiveCategory] = useState('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedService, setSelectedService] = useState<EnterpriseServicePackage | null>(null);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const loadServices = async () => {
      setLoading(true);
      try {
        const response = await collectionsApi.get<EnterpriseServicePackage>('enterprise_services');
        setServices(Array.isArray(response.data.data) ? response.data.data : []);
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Không thể tải dữ liệu dịch vụ doanh nghiệp.');
      } finally {
        setLoading(false);
      }
    };

    void loadServices();
  }, []);

  const totalContracts = services.reduce((sum, item) => sum + item.activeContracts, 0);
  const totalMRR = services.reduce((sum, item) => sum + item.priceMonthly * item.activeContracts, 0);
  const activeServiceCount = services.filter((item) => item.status === 'Đang cung cấp').length;

  const handleRegister = (values: any) => {
    message.success(`Đã tiếp nhận yêu cầu đăng ký dịch vụ "${selectedService?.name}" từ khách hàng ${values.contactPerson}!`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredServices = services.filter((item) => {
    const matchCategory = activeCategory === 'all' || item.category === activeCategory;
    const matchSearch =
      (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchText.toLowerCase());

    return matchCategory && matchSearch;
  });

  const getIcon = (type: string) => {
    switch (type) {
      case 'cloud':
        return <CloudServerOutlined style={{ fontSize: 24, color: '#009688' }} />;
      case 'ai':
        return <RobotOutlined style={{ fontSize: 24, color: '#2563EB' }} />;
      case 'sec':
        return <SafetyCertificateOutlined style={{ fontSize: 24, color: '#16A34A' }} />;
      case 'network':
        return <ThunderboltOutlined style={{ fontSize: 24, color: '#7C3AED' }} />;
      default:
        return <AuditOutlined style={{ fontSize: 24, color: '#D97706' }} />;
    }
  };

  const columns = [
    {
      title: 'Mã & Tên dịch vụ',
      key: 'name',
      render: (_: any, r: EnterpriseServicePackage) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 8 }}>
            {getIcon(r.iconType)}
            {r.name}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>
            Mã: <code>{r.code}</code> · Phân loại: <strong>{r.category}</strong>
          </div>
        </div>
      ),
    },
    {
      title: 'Cam kết SLA',
      dataIndex: 'slaTarget',
      key: 'slaTarget',
      width: 150,
      render: (sla: string) => <Tag color="green">{sla}</Tag>,
    },
    {
      title: 'Đơn giá thuê / Tháng',
      dataIndex: 'priceMonthly',
      key: 'priceMonthly',
      width: 180,
      render: (price: number) => (
        <span style={{ fontWeight: 700, color: '#16A34A', fontSize: 13.5 }}>
          {price.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Hợp đồng hoạt động',
      dataIndex: 'activeContracts',
      key: 'activeContracts',
      width: 160,
      render: (count: number) => (
        <span style={{ fontWeight: 600, color: '#2563EB' }}>{count} doanh nghiệp</span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (st: string) => <Tag color={st === 'Đang cung cấp' ? 'success' : 'processing'}>{st}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 140,
      render: (_: any, r: EnterpriseServicePackage) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedService(r);
              setDrawerOpen(true);
            }}
          >
            Thông số
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={() => {
              setSelectedService(r);
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Đăng ký
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Gói giải pháp doanh nghiệp</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {services.length} dịch vụ đã cấu hình
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Chỉ hiển thị dịch vụ có dữ liệu thực tế trên hệ thống</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Dịch vụ đang hoạt động</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {activeServiceCount}
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>{totalContracts} hợp đồng dịch vụ đang được ghi nhận</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chỉ số SLA được khai báo</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {services.filter((item) => item.slaTarget).length}
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Dịch vụ có khai báo mức cam kết vận hành</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Doanh thu dịch vụ định kỳ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {totalMRR.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Tổng hợp từ đơn giá và số hợp đồng đang có dữ liệu</div>
        </div>
      </div>

      {/* Filter Tabs & View Mode Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả giải pháp' },
            { key: 'Hạ tầng Cloud & IDC', label: 'Cloud & IDC', icon: <CloudOutlined style={{ color: '#0284C7' }} /> },
            { key: 'Trí tuệ nhân tạo AI', label: 'AI Gateway', icon: <RobotOutlined style={{ color: '#8B5CF6' }} /> },
            { key: 'An ninh mạng & CA', label: 'An Ninh & CA', icon: <SafetyCertificateOutlined style={{ color: '#10B981' }} /> },
            { key: 'Kênh truyền & Mạng', label: 'Leased Line', icon: <GlobalOutlined style={{ color: '#06B6D4' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setActiveCategory(tab.key)}
              style={{
                backgroundColor: activeCategory === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: activeCategory === tab.key ? '#009688' : '#CBD5E1',
                color: activeCategory === tab.key ? '#00796B' : '#475569',
                fontWeight: activeCategory === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên dịch vụ, mã, tính năng..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />

          <Radio.Group
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="grid"><AppstoreOutlined /> Lưới</Radio.Button>
            <Radio.Button value="table"><BarsOutlined /> Bảng</Radio.Button>
          </Radio.Group>

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã chuẩn bị báo cáo dịch vụ từ dữ liệu hiện có.')} disabled={!services.length}>
            Xuất Báo Cáo
          </Button>
        </div>
      </div>

      {loading ? (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 24, color: '#64748B' }}>
          Đang tải dữ liệu dịch vụ...
        </div>
      ) : filteredServices.length === 0 ? (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 24, color: '#64748B' }}>
          Chưa có dữ liệu dịch vụ doanh nghiệp để hiển thị.
        </div>
      ) : null}

      {/* VIEW MODE 1: GRID CARDS */}
      {viewMode === 'grid' && filteredServices.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 16 }}>
          {filteredServices.map((svc) => (
            <div
              key={svc.id}
              style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: 16,
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ width: 46, height: 46, borderRadius: 8, background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {getIcon(svc.iconType)}
                  </div>
                  <Tag color="success">{svc.status}</Tag>
                </div>

                <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 12 }}>{svc.name}</div>
                <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
                  {svc.code} · {svc.category}
                </div>
                <div style={{ fontSize: 12.5, color: '#475569', marginTop: 6, lineHeight: 1.45 }}>{svc.description}</div>

                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {svc.features.map((feat, fIdx) => (
                    <div key={fIdx} style={{ fontSize: 12, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckCircleOutlined style={{ color: '#009688', fontSize: 12 }} />
                      {feat}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>Đơn giá thuê tháng:</div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: '#16A34A' }}>
                    {svc.priceMonthly.toLocaleString('vi-VN')} ₫
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    onClick={() => {
                      setSelectedService(svc);
                      setDrawerOpen(true);
                    }}
                  >
                    Thông số
                  </Button>
                  <Button
                    type="primary"
                    size="small"
                    onClick={() => {
                      setSelectedService(svc);
                      setModalOpen(true);
                    }}
                    style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                  >
                    Đăng ký
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VIEW MODE 2: TABLE */}
      {viewMode === 'table' && filteredServices.length > 0 && (
        <div className="transparent-table-card">
          <KTable dataSource={filteredServices} columns={columns} pagination={{ pageSize: 8 }} />
        </div>
      )}

      {/* MODAL: Đăng ký dịch vụ */}
      <Modal
        title={selectedService ? `Đăng Ký Khởi Tạo Dịch Vụ: ${selectedService.name}` : 'Đăng ký dịch vụ'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleRegister} style={{ marginTop: 14 }}>
          <Form.Item name="contactPerson" label="Người đại diện doanh nghiệp" rules={[{ required: true, message: 'Nhập họ tên' }]}>
            <Input placeholder="Ví dụ: Nguyễn Văn Minh" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="phone" label="Số điện thoại liên hệ" rules={[{ required: true }]}>
              <Input placeholder="0912 888 999" />
            </Form.Item>
            <Form.Item name="email" label="Email công việc" rules={[{ required: true, type: 'email' }]}>
              <Input placeholder="ceo@doanhnghiep.com" />
            </Form.Item>
          </div>
          <Form.Item name="duration" label="Thời hạn hợp đồng cam kết" initialValue="12 tháng">
            <Select
              options={[
                { label: '6 tháng', value: '6 tháng' },
                { label: '12 tháng', value: '12 tháng' },
                { label: '24 tháng', value: '24 tháng' },
                { label: '36 tháng', value: '36 tháng' },
              ]}
            />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú yêu cầu kiến trúc hoặc dung lượng">
            <Input.TextArea rows={2} placeholder="Yêu cầu riêng về địa chỉ IP, RAM, băng thông..." />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận khởi tạo
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Thông số kỹ thuật & Chi tiết dịch vụ */}
      <Drawer
        title="Thông Số Kỹ Thuật &amp; Cam Kết Chất Lượng (SLA)"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={600}
      >
        {selectedService && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedService.code}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {selectedService.name}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phân loại: <strong>{selectedService.category}</strong> · SLA: <Tag color="green">{selectedService.slaTarget}</Tag>
              </div>
            </div>

            {/* Specs Grid */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Số Phần Cứng &amp; Cấu Hình Triển Khai:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12.5 }}>
                {selectedService.specs.map((sp, i) => (
                  <div key={i}>
                    <span style={{ color: '#64748B' }}>{sp.label}:</span>
                    <div style={{ fontWeight: 700, color: '#0F172A' }}>{sp.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Price & Contracts */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#15803D', fontSize: 12 }}>Đơn giá thuê định kỳ:</span>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#166534' }}>
                    {selectedService.priceMonthly.toLocaleString('vi-VN')} ₫ / tháng
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: '#15803D', fontSize: 12 }}>Hợp đồng hoạt động:</span>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#2563EB' }}>
                    {selectedService.activeContracts} Doanh nghiệp
                  </div>
                </div>
              </div>
            </div>

            {/* Action */}
            <Button
              type="primary"
              onClick={() => {
                setDrawerOpen(false);
                setModalOpen(true);
              }}
              style={{ backgroundColor: '#009688', borderColor: '#009688', marginTop: 8 }}
            >
              Đăng ký gói dịch vụ này
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};
