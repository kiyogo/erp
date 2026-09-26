import React, { useState } from 'react';
import {
  SafetyCertificateOutlined,
  PlusOutlined,
  DownloadOutlined,
  EditOutlined,
  UsergroupAddOutlined,
  SearchOutlined,
  EyeOutlined,
  PrinterOutlined,
  CheckCircleOutlined,
  KeyOutlined,
  LockOutlined,
  CrownOutlined,
  AuditOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Button, message, Tag, Drawer, Card, Tooltip, Progress, Select } from '../../custom-ui';
import { dataService } from '../../services/dataService';

export interface EnterpriseRoleItem {
  key: string;
  roleCode: string;
  name: string;
  category: 'Quản trị' | 'Nghiệp vụ' | 'Tiêu chuẩn';
  usersCount: number;
  scope: string;
  description: string;
  status: 'Kích hoạt' | 'Tạm khóa';
}

const INITIAL_ROLES: EnterpriseRoleItem[] = [];

export const AdminRolesModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseRoleItem[]>(INITIAL_ROLES);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<EnterpriseRoleItem | null>(null);
  const [form] = Form.useForm();

  const handleCreate = (values: any) => {
    const newRole: EnterpriseRoleItem = {
      key: String(Date.now()),
      roleCode: values.roleCode,
      name: values.name,
      category: values.category || 'Nghiệp vụ',
      usersCount: 0,
      scope: values.scope,
      description: values.description,
      status: 'Kích hoạt',
    };
    setData([newRole, ...data]);
    message.success(`Đã thêm vai trò nhóm quyền mới: ${values.name}`);
    setModalOpen(false);
    form.resetFields();
  };

  const totalUsersAssigned = data.reduce((sum, r) => sum + r.usersCount, 0);
  const adminRolesCount = data.filter((r) => r.category === 'Quản trị').length;

  const filteredData = data.filter((d) => {
    let matchTab = true;
    if (filterTab === 'admin') matchTab = d.category === 'Quản trị';
    else if (filterTab === 'business') matchTab = d.category === 'Nghiệp vụ';
    else if (filterTab === 'standard') matchTab = d.category === 'Tiêu chuẩn';

    const matchSearch =
      d.name?.toLowerCase().includes(searchText.toLowerCase()) ||
      d.roleCode?.toLowerCase().includes(searchText.toLowerCase()) ||
      d.scope?.toLowerCase().includes(searchText.toLowerCase()) ||
      d.description?.toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const columns = [
    {
      title: 'Mã vai trò (Role Identifier)',
      dataIndex: 'roleCode',
      key: 'roleCode',
      render: (rc: string) => (
        <span style={{ fontWeight: 700, color: '#009688', fontFamily: 'monospace', fontSize: 13 }}>
          {rc}
        </span>
      ),
    },
    {
      title: 'Tên nhóm quyền & Vai trò',
      key: 'name',
      render: (_: any, record: EnterpriseRoleItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <SafetyCertificateOutlined style={{ color: '#009688' }} /> {record.name}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{record.description}</div>
        </div>
      ),
    },
    {
      title: 'Phân loại',
      dataIndex: 'category',
      key: 'category',
      width: 120,
      render: (c: string) => (
        <Tag color={c === 'Quản trị' ? 'purple' : c === 'Nghiệp vụ' ? 'blue' : 'default'}>
          {c}
        </Tag>
      ),
    },
    {
      title: 'Số nhân sự gán quyền',
      dataIndex: 'usersCount',
      key: 'usersCount',
      width: 160,
      render: (u: number) => (
        <span style={{ fontWeight: 600, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: 6 }}>
          <UsergroupAddOutlined /> {u} tài khoản
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (s: string) => <Tag color={s === 'Kích hoạt' ? 'success' : 'error'}>{s}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 140,
      render: (_: any, record: EnterpriseRoleItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedRole(record);
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nhóm vai trò RBAC</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} nhóm vai trò
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Mô hình kiểm soát truy cập phân tầng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhóm Quyền Quản Trị Cấp Cao</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {adminRolesCount} vai trò
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Đặc quyền ký số và phê duyệt dòng tiền</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nhân sự đã gán quyền</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalUsersAssigned} tài khoản
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>100% cán bộ được định danh chính xác</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Trạng thái chính sách an ninh</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            Tuân Thủ 100%
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Không có tài khoản mồ côi ngoài nhóm</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả vai trò' },
            { key: 'admin', label: 'Quản trị & Điều hành', icon: <CrownOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'business', label: 'Nghiệp vụ Chuyên môn', icon: <AuditOutlined style={{ color: '#64748B' }} /> },
            { key: 'standard', label: 'Tiêu chuẩn & Nhân viên', icon: <TeamOutlined style={{ color: '#3B82F6' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setFilterTab(tab.key)}
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
            placeholder="Tìm theo vai trò, mã nhóm quyền, phạm vi..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh mục vai trò RBAC')}>
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ category: 'Nghiệp vụ' });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm vai trò mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={columns}
          rowKey="key"
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Thêm vai trò */}
      <Modal
        title="Thiết Lập Nhóm Quyền &amp; Vai Trò RBAC Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <Form.Item name="roleCode" label="Mã vai trò (Role Identifier)" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: ROLE_PROJECT_MANAGER" />
          </Form.Item>
          <Form.Item name="name" label="Tên vai trò hiển thị" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Quản Lý Dự Án Kỹ Thuật" />
          </Form.Item>
          <Form.Item name="category" label="Phân loại nhóm vai trò" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Quản trị (Governance & Executive)', value: 'Quản trị' },
                { label: 'Nghiệp vụ (Business Operations)', value: 'Nghiệp vụ' },
                { label: 'Tiêu chuẩn (Standard Personnel)', value: 'Tiêu chuẩn' },
              ]}
            />
          </Form.Item>
          <Form.Item name="scope" label="Phạm vi truy cập dữ liệu" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Phân hệ Kế hoạch & Nhiệm vụ dự án" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả chi tiết quyền hạn" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="Nêu rõ các quyền xem, duyệt, sửa đổi..." />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu vai trò
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi tiết vai trò */}
      <Drawer
        title="Hồ Sơ Nhóm Quyền &amp; Chính Sách RBAC"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedRole && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ VAI TRÒ: {selectedRole.roleCode}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedRole.name}
                  </div>
                </div>
                <Tag color="success">{selectedRole.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phân loại: <strong>{selectedRole.category}</strong> · Đang cấp cho: <strong>{selectedRole.usersCount} nhân sự</strong>
              </div>
            </div>

            {/* Scope info */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <KeyOutlined /> Phạm Vi Dữ Liệu &amp; Mô Tả Chính Sách:
              </div>
              <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6, color: '#334155' }}>
                <div>Phạm vi: <strong style={{ color: '#1E40AF' }}>{selectedRole.scope}</strong></div>
                <div>Diễn giải: <em>"{selectedRole.description}"</em></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => message.success(`Đang mở giao diện cấu hình ma trận phân quyền cho vai trò ${selectedRole.roleCode}`)}
              >
                Cấu Hình Ma Trận Quyền
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in bản mô tả chức năng vai trò ${selectedRole.roleCode}`)}
              >
                In Bản Mô Tả (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

