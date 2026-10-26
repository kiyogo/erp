import React, { useState, useEffect } from 'react';
import {
  LaptopOutlined,
  DownloadOutlined,
  ToolOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
  PrinterOutlined,
  EyeOutlined,
  BarcodeOutlined,
  DesktopOutlined,
  ApiOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';
import { dataService } from '../../services/dataService';

export const EmployeeAssetsModule: React.FC = () => {
  const [assets, setAssets] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'it' | 'accessory'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<any | null>(null);
  const [form] = Form.useForm();

  const loadData = () => {
    setAssets(dataService.getEmployeeAssets());
  };

  useEffect(() => {
    loadData();
    const unsub = dataService.subscribe(() => {
      loadData();
    });
    return unsub;
  }, []);

  const handleRequestAction = (values: any) => {
    if (!selectedAsset) return;
    dataService.requestEmployeeAssetAction(selectedAsset.key, values.actionType, values.note);
    message.success(`Đã gửi yêu cầu ${values.actionType} cho tài sản ${selectedAsset.name} thành công!`);
    setModalOpen(false);
    form.resetFields();
    setSelectedAsset(null);
  };

  const totalCount = assets.length;
  const inUseCount = assets.filter((a) => a.status === 'Đang sử dụng' || !a.status).length;

  const filteredAssets = assets.filter((a) => {
    let matchTab = true;
    if (filterTab === 'it') {
      matchTab = (a.category || '').toLowerCase().includes('laptop') || (a.category || '').toLowerCase().includes('máy tính');
    } else if (filterTab === 'accessory') {
      matchTab = !(a.category || '').toLowerCase().includes('laptop') && !(a.category || '').toLowerCase().includes('máy tính');
    }

    const matchSearch =
      (a.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (a.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (a.serial || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (a.category || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const columns = [
    {
      title: 'Mã tài sản',
      dataIndex: 'code',
      key: 'code',
      width: 130,
      render: (c: string) => (
        <span style={{ fontWeight: 700, color: '#009688', fontFamily: 'monospace' }}>
          {c}
        </span>
      ),
    },
    {
      title: 'Tên tài sản & Cấu hình',
      dataIndex: 'name',
      key: 'name',
      render: (n: string, record: any) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <LaptopOutlined style={{ color: '#009688' }} /> {n}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Phân loại: <strong>{record.category}</strong></div>
        </div>
      ),
    },
    {
      title: 'Số Serial / Service Tag',
      dataIndex: 'serial',
      key: 'serial',
      width: 170,
      render: (s: string) => (
        <span style={{ color: '#1E40AF', fontWeight: 600, fontSize: 12.5, fontFamily: 'monospace' }}>
          {s}
        </span>
      ),
    },
    {
      title: 'Ngày bàn giao',
      dataIndex: 'handoverDate',
      key: 'handoverDate',
      width: 130,
      render: (d: string) => <span style={{ color: '#64748B', fontSize: 12.5 }}>{d}</span>,
    },
    {
      title: 'Tình trạng thực tế',
      dataIndex: 'condition',
      key: 'condition',
      width: 140,
      render: (c: string) => (
        <Tag color="success">
          {c || 'Hoạt động tốt'}
        </Tag>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s: string) => (
        <Tag color={s === 'Đang sử dụng' ? 'processing' : 'default'}>
          {s || 'Đang sử dụng'}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 190,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedAsset(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
          </Button>
          <Button
            size="small"
            icon={<ToolOutlined />}
            onClick={() => {
              setSelectedAsset(record);
              form.setFieldsValue({
                assetName: record.name,
                serial: record.serial,
                actionType: 'Bảo trì sửa chữa',
              });
              setModalOpen(true);
            }}
          >
            Báo lỗi IT
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thiết bị được bàn giao</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalCount} thiết bị
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Được quản trị viên IT cấp phát chính thức</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tình trạng hoạt động</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            100% Hoàn hảo
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>{inUseCount} thiết bị vận hành ổn định</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Định danh tài sản QR Code</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            100% Đã dán tem
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Đã kiểm kê định kỳ Q3/2026</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Bảo hành &amp; Hỗ trợ IT</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            ProSupport Plus
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Bảo hành phần cứng tận nơi 24/7</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả thiết bị' },
            { key: 'it', label: 'Máy tính & Màn hình', icon: <LaptopOutlined style={{ color: '#3B82F6' }} /> },
            { key: 'accessory', label: 'Phụ kiện & Ngoại vi', icon: <ApiOutlined style={{ color: '#64748B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setFilterTab(tab.key as any)}
              style={{
                backgroundColor: filterTab === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: filterTab === tab.key ? '#009688' : '#CBD5E1',
                color: filterTab === tab.key ? '#00796B' : '#475569',
                fontWeight: filterTab === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã TS, tên thiết bị, serial..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<ReloadOutlined />} onClick={loadData}>
            Làm mới
          </Button>

          <Button
            icon={<PrinterOutlined />}
            onClick={() => message.success('Đã in biên bản bàn giao tài sản cá nhân (A4)')}
          >
            In Biên Bản (A4)
          </Button>

          <Button
            type="primary"
            icon={<DownloadOutlined />}
            onClick={() => message.success('Đã xuất danh sách tài sản cá nhân')}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Xuất Excel
          </Button>
        </div>
      </div>

      {/* Assets Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredAssets}
          columns={columns}
          rowKey="key"
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* Modal Yêu cầu bảo trì / báo hỏng / đổi trả */}
      <Modal
        title={selectedAsset ? `Yêu Cầu Hỗ Trợ Kỹ Thuật - ${selectedAsset.code}` : 'Yêu Cầu Thiết Bị'}
        open={modalOpen}
        onCancel={() => {
          setModalOpen(false);
          setSelectedAsset(null);
        }}
        footer={null}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={handleRequestAction} style={{ marginTop: 14 }}>
          <Form.Item name="assetName" label="Tên thiết bị">
            <Input disabled />
          </Form.Item>
          <Form.Item name="serial" label="Số Serial">
            <Input disabled />
          </Form.Item>
          <Form.Item name="actionType" label="Loại yêu cầu" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Bảo trì / Sửa chữa phần cứng', value: 'Bảo trì sửa chữa' },
                { label: 'Đổi mới thiết bị do xuống cấp', value: 'Đổi mới thiết bị' },
                { label: 'Nâng cấp cấu hình', value: 'Nâng cấp cấu hình' },
                { label: 'Bàn giao hoàn trả lại công ty', value: 'Hoàn trả lại công ty' },
              ]}
            />
          </Form.Item>
          <Form.Item name="note" label="Mô tả tình trạng lỗi / Lý do yêu cầu" rules={[{ required: true, message: 'Vui lòng nhập mô tả chi tiết' }]}>
            <Input.TextArea rows={3} placeholder="Mô tả cụ thể hiện tượng lỗi, hỏng hóc hoặc lý do cần nâng cấp..." />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Gửi yêu cầu IT
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi tiết tài sản bàn giao */}
      <Drawer
        title="Hồ Sơ Thiết Bị Bàn Giao Cá Nhân"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={540}
      >
        {selectedAsset && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ ĐỊNH DANH: {selectedAsset.code}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {selectedAsset.name}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phân nhóm: <strong>{selectedAsset.category}</strong> · Serial: <strong>{selectedAsset.serial}</strong>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Tin Quản Trị &amp; Bàn Giao:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Ngày bàn giao chính thức:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedAsset.handoverDate}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tình trạng vật lý:</span>
                  <span style={{ fontWeight: 600, color: '#16A34A' }}>{selectedAsset.condition || 'Hoạt động tốt'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Gói bảo hành kỹ thuật:</span>
                  <span style={{ fontWeight: 600, color: '#1E40AF' }}>Dell ProSupport 36 Tháng</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Phần mềm bản quyền kèm theo:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>Windows 11 Pro + Microsoft 365 E5</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => {
                  setDrawerOpen(false);
                  form.setFieldsValue({
                    assetName: selectedAsset.name,
                    serial: selectedAsset.serial,
                    actionType: 'Bảo trì sửa chữa',
                  });
                  setModalOpen(true);
                }}
              >
                Gửi Yêu Cầu Hỗ Trợ IT
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in biên bản bàn giao thiết bị ${selectedAsset.code}`)}
              >
                In Biên Bản (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

