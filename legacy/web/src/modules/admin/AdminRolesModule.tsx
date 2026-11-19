import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SafetyCertificateOutlined,
  PlusOutlined,
  DownloadOutlined,
  EditOutlined,
  DeleteOutlined,
  UsergroupAddOutlined,
  SearchOutlined,
  EyeOutlined,
  PrinterOutlined,
  KeyOutlined,
  CrownOutlined,
  AuditOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Button, message, Tag, Drawer, Select } from '../../custom-ui';
import { adminRolesApi, AdminRoleRecord, AdminRolesOverview } from '../../api/endpoints';
import { exportRecordToPdf, exportRowsToXlsx } from '../../utils/fileExporter';
import { ROLE_ACTIONS } from './delegatedAccess';

const EMPTY_OVERVIEW: AdminRolesOverview = { modules: [], actions: [], roles: [] };

const cardStyle: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' };

/** Mô tả phạm vi của vai trò từ ma trận quyền thật của nó. */
const describeScope = (role: AdminRoleRecord, modules: AdminRolesOverview['modules']): string => {
  if (role.roleCode === 'ADMIN') return 'Toàn bộ hệ thống';
  if (role.roleCode === 'USER') return 'Dữ liệu của chính mình';
  const labels = modules.filter((module) => ROLE_ACTIONS.some(({ key }) => role.permissions[module.key]?.[key])).map((module) => module.label);
  return labels.length ? labels.join(', ') : 'Chưa cấp quyền module nào';
};

export const AdminRolesModule: React.FC = () => {
  const navigate = useNavigate();
  const [overview, setOverview] = useState<AdminRolesOverview>(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AdminRoleRecord | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState<AdminRoleRecord | null>(null);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await adminRolesApi.overview();
      setOverview(response.data);
      setSelectedRole((current) => (current ? response.data.roles.find((role) => role.roleCode === current.roleCode) || null : null));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được danh mục vai trò.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => overview.roles.map((role) => ({ ...role, scopeText: describeScope(role, overview.modules) })), [overview]);
  const customRoles = overview.roles.filter((role) => !role.system);
  const holders = customRoles.reduce((sum, role) => sum + role.usersCount, 0);
  const totalAccounts = overview.roles.filter((role) => role.system).reduce((sum, role) => sum + role.usersCount, 0);
  const administrators = overview.roles.find((role) => role.roleCode === 'ADMIN')?.usersCount || 0;

  const filteredData = rows.filter((row) => {
    const matchTab = filterTab === 'all' || (filterTab === 'system' && row.system) || (filterTab === 'business' && !row.system);
    const query = searchText.trim().toLocaleLowerCase('vi-VN');
    const matchSearch = !query || [row.name, row.roleCode, row.scopeText, row.description].some((value) => String(value || '').toLocaleLowerCase('vi-VN').includes(query));
    return matchTab && matchSearch;
  });

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (role: AdminRoleRecord) => {
    setEditing(role);
    form.resetFields();
    form.setFieldsValue({ roleCode: role.roleCode, name: role.name, description: role.description, status: role.status });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setEditing(null);
    form.resetFields();
  };

  const handleSubmit = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const name = String(values.name || '').trim();
      const description = String(values.description || '').trim();
      if (editing) {
        await adminRolesApi.update(editing.roleCode, { name, description, status: values.status });
        message.success(`Đã cập nhật vai trò ${editing.roleCode}.`);
      } else {
        const roleCode = String(values.roleCode || '').trim().toUpperCase();
        await adminRolesApi.create({ roleCode, name, description, status: 'Kích hoạt', permissions: {} });
        message.success(`Đã tạo vai trò ${roleCode}. Hãy cấu hình ma trận quyền để vai trò có hiệu lực.`);
      }
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được vai trò.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (role: AdminRoleRecord) => Modal.confirm({
    title: 'Xóa vai trò nghiệp vụ?',
    content: `Xóa vai trò ${role.name}. Vai trò đang gán cho tài khoản không xóa được; hãy chuyển các tài khoản sang vai trò khác trước.`,
    okText: 'Xóa vai trò', cancelText: 'Hủy', okButtonProps: { danger: true },
    onOk: async () => {
      try {
        await adminRolesApi.remove(role.roleCode);
        setDrawerOpen(false);
        setSelectedRole(null);
        await load();
        message.success(`Đã xóa vai trò ${role.roleCode}.`);
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Không xóa được vai trò.');
      }
    },
  });

  const exportColumns = [
    { title: 'Mã vai trò', dataIndex: 'roleCode' },
    { title: 'Tên vai trò', dataIndex: 'name' },
    { title: 'Mô tả', dataIndex: 'description' },
    { title: 'Phạm vi', dataIndex: 'scopeText' },
    { title: 'Số tài khoản', dataIndex: 'usersCount' },
    { title: 'Trạng thái', dataIndex: 'status' },
  ];

  const columns = [
    {
      title: 'Mã vai trò',
      dataIndex: 'roleCode',
      key: 'roleCode',
      render: (code: string) => <span style={{ color: '#009688', fontFamily: 'monospace', fontSize: 13 }}>{code}</span>,
    },
    {
      title: 'Tên vai trò',
      key: 'name',
      render: (_: any, record: AdminRoleRecord) => (
        <div>
          <div style={{ color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
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
      render: (category: string) => <Tag color={category === 'Quản trị' ? 'purple' : category === 'Nghiệp vụ' ? 'blue' : 'default'}>{category}</Tag>,
    },
    {
      title: 'Phạm vi',
      dataIndex: 'scopeText',
      key: 'scopeText',
      render: (text: string) => <span style={{ fontSize: 12.5, color: '#334155' }}>{text}</span>,
    },
    {
      title: 'Số tài khoản',
      dataIndex: 'usersCount',
      key: 'usersCount',
      width: 150,
      render: (count: number) => <span style={{ color: '#1E40AF', display: 'flex', alignItems: 'center', gap: 6 }}><UsergroupAddOutlined /> {count} tài khoản</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: string) => <Tag color={status === 'Kích hoạt' ? 'success' : 'error'}>{status}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 130,
      render: (_: any, record: AdminRoleRecord) => (
        <Button icon={<EyeOutlined />} onClick={() => { setSelectedRole(record); setDrawerOpen(true); }}>Chi tiết</Button>
      ),
    },
  ];

  const roleSummary = (role: AdminRoleRecord) => overview.modules
    .map((module) => ({ label: module.label, actions: ROLE_ACTIONS.filter(({ key }) => role.permissions[module.key]?.[key]).map(({ label }) => label) }))
    .filter((entry) => entry.actions.length);

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tổng số vai trò</div>
          <div style={{ fontSize: 24, color: '#009688', marginTop: 4 }}>{overview.roles.length} vai trò</div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>{overview.roles.length - customRoles.length} của hệ thống, {customRoles.length} nghiệp vụ</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Vai trò nghiệp vụ</div>
          <div style={{ fontSize: 24, color: '#7C3AED', marginTop: 4 }}>{customRoles.length} vai trò</div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>{customRoles.filter((role) => role.status !== 'Kích hoạt').length} vai trò đang tạm khóa</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Tài khoản giữ vai trò nghiệp vụ</div>
          <div style={{ fontSize: 24, color: '#16A34A', marginTop: 4 }}>{holders} tài khoản</div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Trên tổng {totalAccounts} tài khoản</div>
        </div>
        <div style={cardStyle}>
          <div style={{ fontSize: 12.5, color: '#64748B' }}>Quản trị viên</div>
          <div style={{ fontSize: 24, color: '#1E40AF', marginTop: 4 }}>{administrators} tài khoản</div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Toàn quyền, không giao được cho vai trò khác</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả vai trò' },
            { key: 'system', label: 'Vai trò hệ thống', icon: <CrownOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'business', label: 'Vai trò nghiệp vụ', icon: <AuditOutlined style={{ color: '#64748B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              icon={tab.icon}
              onClick={() => setFilterTab(tab.key)}
              style={{
                backgroundColor: filterTab === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: filterTab === tab.key ? '#009688' : '#CBD5E1',
                color: filterTab === tab.key ? '#00796B' : '#475569',
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên, mã vai trò hoặc phạm vi"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            style={{ width: 280 }}
            allowClear
          />
          <Button
            icon={<DownloadOutlined />}
            onClick={() => {
              if (!filteredData.length) { message.warning('Không có vai trò để xuất.'); return; }
              const count = exportRowsToXlsx('Danh_muc_vai_tro', exportColumns, filteredData);
              message.success(`Đã xuất ${count} vai trò ra tệp Excel.`);
            }}
          >
            Xuất Excel
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
            Thêm vai trò
          </Button>
        </div>
      </div>

      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} rowKey="key" loading={loading} pagination={{ pageSize: 8 }} />
      </div>

      <Modal title={editing ? 'Cập nhật vai trò nghiệp vụ' : 'Thêm vai trò nghiệp vụ'} open={modalOpen} onCancel={closeModal} footer={null} width={560}>
        <Form form={form} layout="vertical" onFinish={handleSubmit} style={{ marginTop: 14 }}>
          <Form.Item name="roleCode" label="Mã vai trò" rules={[{ required: true }]}>
            <Input disabled={Boolean(editing)} />
          </Form.Item>
          <Form.Item name="name" label="Tên vai trò" rules={[{ required: true, whitespace: true }]}>
            <Input placeholder="Ví dụ: Kế toán tổng hợp" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả">
            <Input.TextArea rows={3} placeholder="Nêu rõ vai trò này phụ trách việc gì" />
          </Form.Item>
          {editing && (
            <Form.Item name="status" label="Trạng thái" rules={[{ required: true }]}>
              <Select options={[{ label: 'Kích hoạt', value: 'Kích hoạt' }, { label: 'Tạm khóa', value: 'Tạm khóa' }]} />
            </Form.Item>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 14 }}>
            <Button disabled={saving} onClick={closeModal}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu vai trò</Button>
          </div>
        </Form>
      </Modal>

      <Drawer title="Hồ sơ vai trò" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={580}>
        {selectedRole && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 13, color: '#009688' }}>Mã vai trò: {selectedRole.roleCode}</div>
                <div style={{ fontSize: 17, color: '#0F172A', marginTop: 4 }}>{selectedRole.name}</div>
              </div>
              <Tag color={selectedRole.status === 'Kích hoạt' ? 'success' : 'error'}>{selectedRole.status}</Tag>
            </div>
            <div style={{ fontSize: 12.5, color: '#64748B' }}>
              Phân loại {selectedRole.category}, đang gán cho {selectedRole.usersCount} tài khoản.
            </div>
            <div>
              <div style={{ fontSize: 13, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <KeyOutlined /> Mô tả và phạm vi quyền
              </div>
              <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6, color: '#334155' }}>
                <div>{selectedRole.description || 'Chưa có mô tả.'}</div>
                {selectedRole.system
                  ? <div>{describeScope(selectedRole, overview.modules)}</div>
                  : roleSummary(selectedRole).length
                    ? roleSummary(selectedRole).map((entry) => <div key={entry.label}>{entry.label}: {entry.actions.join(', ')}</div>)
                    : <div>Chưa cấp quyền module nào.</div>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {!selectedRole.system && (
                <Button type="primary" onClick={() => navigate('/admin/permissions', { state: { role: selectedRole.roleCode } })} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                  Cấu hình ma trận quyền
                </Button>
              )}
              {!selectedRole.system && <Button icon={<EditOutlined />} onClick={() => { setDrawerOpen(false); openEdit(selectedRole); }}>Sửa thông tin</Button>}
              {!selectedRole.system && <Button danger icon={<DeleteOutlined />} onClick={() => handleDelete(selectedRole)}>Xóa vai trò</Button>}
              <Button
                icon={<PrinterOutlined />}
                onClick={() => exportRecordToPdf(`Vai_tro_${selectedRole.roleCode}`, 'MO TA VAI TRO', [
                  ['Ma vai tro', selectedRole.roleCode], ['Ten vai tro', selectedRole.name], ['Nhom', selectedRole.category],
                  ['Pham vi', describeScope(selectedRole, overview.modules)], ['So tai khoan', selectedRole.usersCount],
                  ['Trang thai', selectedRole.status], ['Mo ta', selectedRole.description],
                ])}
              >
                In bản mô tả
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
