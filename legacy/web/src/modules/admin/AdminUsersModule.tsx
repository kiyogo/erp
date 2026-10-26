import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  LockOutlined,
  UnlockOutlined,
  KeyOutlined,
  SafetyCertificateOutlined,
  EyeOutlined,
  PrinterOutlined,
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  CheckCircleOutlined,
  ReloadOutlined,
  CloseCircleOutlined,
  CrownOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';
import { adminSessionsApi, employeesApi, usersApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';

export function normalizeAdminUser(user: any, lastLogin = '') {
  const isActive = user.isActive === true || user.isActive === 1 || user.is_active === 1;
  return {
    ...user,
    key: String(user.id || user.key),
    username: user.employeeCode || user.employee_code || '',
    fullName: user.fullName || user.name || '',
    role: user.role,
    department: user.department || '',
    position: user.position || '',
    status: isActive ? 'Hoạt động' : user.activationStatus === 'Chờ kích hoạt' ? 'Chờ kích hoạt' : 'Đã khóa',
    isActive,
    twoFactor: user.mfaVerified === true ? true : null,
    lastLogin: lastLogin || 'Chưa có dữ liệu phiên',
  };
}

export function filterAdminUsers(users: any[], tab: string, search: string) {
  const query = search.trim().toLocaleLowerCase('vi-VN');
  return users.filter(user => {
    const matches = tab === 'all' || (tab === 'active' && user.status === 'Hoạt động')
      || (tab === 'locked' && user.status === 'Đã khóa') || (tab === 'pending' && user.status === 'Chờ kích hoạt')
      || (tab === 'admin' && user.role === 'ADMIN') || (tab === 'mfa' && user.twoFactor === true);
    return matches && [user.username, user.fullName, user.email, user.department, user.position, user.role]
      .some(value => String(value || '').toLocaleLowerCase('vi-VN').includes(query));
  });
}

export function validateAdminUser(values: any, editing = false) {
  if (!String(values.fullName || '').trim()) return 'Vui lòng nhập họ tên.';
  if (!editing && !String(values.username || '').trim()) return 'Vui lòng nhập mã nhân viên.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email || '').trim())) return 'Email không hợp lệ.';
  if (!['ADMIN', 'USER'].includes(values.role)) return 'Vai trò phải là ADMIN hoặc USER theo quyền hệ thống hiện tại.';
  if (!editing && (String(values.password || '').length < 12 || String(values.password || '').length > 256)) return 'Mật khẩu khởi tạo phải dài từ 12 đến 256 ký tự.';
  if (values.twoFactor === true || values.twoFactor === 'true') return 'Máy chủ chưa có bộ thực thi MFA; không thể bật bắt buộc 2FA từ biểu mẫu này.';
  return '';
}

export const AdminUsersModule: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [form] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingUser, setEditingUser] = useState<any>(null);
  const [passwordTarget, setPasswordTarget] = useState<any>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await usersApi.getAll({ page: 1, limit: 100 });
      const users = [...(response.data.data || [])];
      const total = Number(response.data.pagination?.total || users.length);
      const limit = Number(response.data.pagination?.limit || 100);
      for (let page = 2; page <= Math.ceil(total / limit); page++) {
        const next = await usersApi.getAll({ page, limit: 100 });
        users.push(...(next.data.data || []));
      }
      const [orgResult, sessionResult] = await Promise.allSettled([
        dataService.fetchOrgUnitsList(),
        adminSessionsApi.getAll(),
      ]);
      const lastLogins = new Map<string, string>();
      if (sessionResult.status === 'fulfilled') {
        for (const session of sessionResult.value.data.data) {
          if (session.loginTime > (lastLogins.get(session.userId) || '')) lastLogins.set(session.userId, session.loginTime);
        }
      }
      const records = users.map((user: any) => normalizeAdminUser(user, lastLogins.get(user.id)));
      setData(records);
      setSelectedUser((selected: any) => selected ? records.find(user => user.key === selected.key) || null : null);
      if (orgResult.status === 'fulfilled') setDepartmentOptions(orgResult.value.map(name => ({ label: name, value: name })));
      else message.warning('Chưa tải được danh mục phòng ban. Danh sách tài khoản vẫn được hiển thị.');
      if (sessionResult.status === 'rejected') message.warning('Chưa tải được lịch sử phiên để xác định lần đăng nhập cuối.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải danh sách tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreate = async (values: any) => {
    if (saving) return;
    const validation = validateAdminUser(values, Boolean(editingUser));
    if (validation) { message.error(validation); return; }
    setSaving(true);
    try {
      const payload = {
        name: String(values.fullName).trim(), email: String(values.email).trim(), role: values.role,
        department: values.department || '', position: values.position || '',
      };
      if (editingUser) await usersApi.update(editingUser.key, payload);
      else await usersApi.create({ ...payload, employeeCode: String(values.username).trim(), password: values.password });
      message.success(`Đã ${editingUser ? 'cập nhật' : 'tạo'} tài khoản và hồ sơ nhân sự cho ${values.fullName}.`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu tài khoản.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (key: string, name: string) => {
    const current = data.find((item) => item.key === key);
    if (!current) return;
    if (current.status === 'Chờ kích hoạt') { await handleResetPassword(current); return; }
    try {
      await usersApi.update(key, { isActive: current?.status !== 'Hoạt động' });
      message.success(`Đã cập nhật trạng thái tài khoản: ${name}`);
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể cập nhật trạng thái tài khoản.');
    }
  };

  const handleResetPassword = async (record: any) => {
    if (record.activationStatus !== 'Chờ kích hoạt') {
      passwordForm.resetFields();
      setPasswordTarget(record);
      return;
    }
    try {
      const targetId = record.id || record.key || record.code || record.employeeCode;
      const response = await employeesApi.resendActivation(targetId);
      const delivery = response.data.delivery;
      if (delivery.status === 'sent') {
        message.success(`Đã gửi lại email kích hoạt đến ${record.email}.`);
      } else if (delivery.status === 'failed') {
        message.error(`Gửi email kích hoạt thất bại: ${delivery.message || 'Lỗi SMTP'}`);
      } else {
        message.warning(delivery.message || 'Chưa thể gửi email kích hoạt. Vui lòng kiểm tra cấu hình SMTP.');
      }
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể gửi lại email kích hoạt.');
    }
  };

  const activeCount = data.filter((u) => u.status === 'Hoạt động').length;
  const mfaCount = data.filter((u) => u.twoFactor).length;
  const adminCount = data.filter((u) => u.role === 'ADMIN').length;

  const filteredData = filterAdminUsers(data, filterTab, searchText);

  const handlePasswordChange = async (values: any) => {
    if (!passwordTarget || saving) return;
    if (String(values.newPassword || '').length < 12 || String(values.newPassword || '').length > 256) { message.error('Mật khẩu mới phải dài từ 12 đến 256 ký tự.'); return; }
    if (values.newPassword !== values.confirmPassword) { message.error('Mật khẩu xác nhận không trùng khớp.'); return; }
    setSaving(true);
    try {
      await employeesApi.changePassword(passwordTarget.key, { newPassword: values.newPassword, confirmPassword: values.confirmPassword });
      message.success(`Đã đặt mật khẩu mới cho ${passwordTarget.fullName}.`);
      setPasswordTarget(null);
      passwordForm.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể đặt lại mật khẩu.');
    } finally { setSaving(false); }
  };

  const handleDelete = (record: any) => Modal.confirm({
    title: 'Xóa tài khoản người dùng?',
    content: `Xóa tài khoản ${record.fullName}. Tài khoản có hồ sơ nghiệp vụ liên kết có thể không xóa được; có thể khóa tài khoản để giữ lịch sử.`,
    okText: 'Xóa tài khoản', cancelText: 'Hủy', okButtonProps: { danger: true },
    onOk: async () => {
      try {
        await usersApi.remove(record.key);
        setDrawerOpen(false);
        await loadData();
        message.success('Đã xóa tài khoản.');
      } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể xóa tài khoản.'); }
    },
  });

  const printUser = () => {
    if (!selectedUser) return;
    const popup = window.open('', '_blank');
    if (!popup) { message.error('Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép mở cửa sổ.'); return; }
    popup.document.write('<!doctype html><html lang="vi"><head><meta charset="UTF-8"><title>Thông tin tài khoản</title><style>@page{size:A4;margin:20mm}body{font-family:Arial,sans-serif;line-height:1.6}</style></head><body></body></html>');
    for (const text of ['THÔNG TIN TÀI KHOẢN NGƯỜI DÙNG', `Mã nhân viên: ${selectedUser.username}`, `Họ tên: ${selectedUser.fullName}`, `Email: ${selectedUser.email}`, `Phòng ban: ${selectedUser.department || 'Chưa phân phòng ban'}`, `Chức danh: ${selectedUser.position || 'Chưa có'}`, `Vai trò hệ thống: ${selectedUser.role}`, `Trạng thái: ${selectedUser.status}`, `Đăng nhập cuối đã ghi nhận: ${selectedUser.lastLogin}`, `Xuất lúc: ${new Date().toISOString()}`]) {
      const paragraph = popup.document.createElement('p'); paragraph.textContent = text; popup.document.body.appendChild(paragraph);
    }
    popup.document.close(); popup.focus(); popup.print();
  };

  const columns = [
    {
      title: 'Tài khoản & Họ tên',
      key: 'username',
      render: (_: any, record: any) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserOutlined /> {record.username}
          </div>
          <div style={{ fontSize: 12, color: '#0F172A', marginTop: 2, fontWeight: 500 }}>{record.fullName}</div>
        </div>
      ),
    },
    {
      title: 'Email & Liên hệ',
      key: 'email',
      render: (_: any, record: any) => (
        <div>
          <div style={{ color: '#1E40AF', fontSize: 12.5, fontWeight: 500 }}>{record.email}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Phòng: {record.department}</div>
        </div>
      ),
    },
    {
      title: 'Vai trò',
      dataIndex: 'role',
      key: 'role',
      render: (r: string) => {
        return <Tag color={r === 'ADMIN' ? 'purple' : 'cyan'}>{r === 'ADMIN' ? 'Quản trị viên' : r === 'USER' ? 'Nhân viên' : r}</Tag>;
      },
    },
    {
      title: 'Xác thực 2FA',
      dataIndex: 'twoFactor',
      key: 'twoFactor',
      width: 140,
      render: (tf: boolean | null) => (
        <Tag color={tf ? 'success' : 'default'}>
          {tf ? '● Máy chủ đã xác minh MFA' : 'Chưa có dữ liệu MFA'}
        </Tag>
      ),
    },
    {
      title: 'Đăng nhập cuối',
      dataIndex: 'lastLogin',
      key: 'lastLogin',
      render: (l: string) => <span style={{ color: '#64748B', fontSize: 12 }}>{l}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (s: string) => (
        <Tag color={s === 'Hoạt động' ? 'success' : 'error'}>
          {s}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 220,
      render: (_: any, record: any) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedUser(record);
              setDrawerOpen(true);
            }}
          >
            Hồ sơ
          </Button>
          <Button
            size="small"
            icon={<KeyOutlined />}
            onClick={() => void handleResetPassword(record)}
            title={record.activationStatus === 'Chờ kích hoạt' ? 'Gửi lại email kích hoạt' : 'Đặt lại mật khẩu'}
          >
            Đổi MK
          </Button>
          <Button
            size="small"
            icon={record.status === 'Hoạt động' ? <LockOutlined /> : <UnlockOutlined />}
            danger={record.status === 'Hoạt động'}
            onClick={() => handleToggleStatus(record.key, record.fullName)}
          >
            {record.status === 'Hoạt động' ? 'Khóa' : record.status === 'Chờ kích hoạt' ? 'Gửi kích hoạt' : 'Mở'}
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số tài khoản nội bộ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} người dùng
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Theo danh sách tài khoản được lưu trên máy chủ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tài khoản đang hoạt động</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {activeCount} tài khoản
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Được cấp quyền truy cập hệ thống</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Quản trị viên hệ thống</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {adminCount} tài khoản
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Quyền quản trị được máy chủ kiểm tra theo vai trò</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ kích hoạt xác thực 2FA</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {mfaCount}/{data.length} có xác nhận
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Chưa có bộ thực thi chính sách MFA cho tài khoản</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả tài khoản' },
            { key: 'active', label: 'Đang hoạt động', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'locked', label: 'Đã khóa', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
            { key: 'pending', label: 'Chờ kích hoạt' },
            { key: 'admin', label: 'Quản trị & Lãnh đạo', icon: <CrownOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'mfa', label: 'Đã bật 2FA', icon: <SafetyCertificateOutlined style={{ color: '#10B981' }} /> },
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
            placeholder="Tìm theo username, họ tên, email, vai trò..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('Danh_sach_tai_khoan.xlsx', generateValidXlsxBlob([
            ['Mã nhân viên', 'Họ tên', 'Email', 'Vai trò hệ thống', 'Phòng ban', 'Chức danh', 'Trạng thái', 'Đăng nhập cuối đã ghi nhận', 'MFA'],
            ...filteredData.map(user => [user.username, user.fullName, user.email, user.role, user.department, user.position, user.status, user.lastLogin, user.twoFactor ? 'Máy chủ đã xác minh' : 'Chưa có dữ liệu']),
          ]))}>
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              setEditingUser(null);
              form.setFieldsValue({ role: 'USER', twoFactor: 'unsupported' });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm tài khoản
          </Button>
        </div>
      </div>

      {/* Users Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={columns}
          rowKey="key"
          loading={loading}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* Add User Modal */}
      <Modal
        title={editingUser ? 'Cập nhật tài khoản người dùng' : 'Tạo Mới Tài Khoản Người Dùng & Phân Quyền'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <Form.Item name="username" label="Mã nhân viên / Tên đăng nhập" rules={[{ required: true }]}>
            <Input disabled={Boolean(editingUser)} placeholder="Ví dụ: NV-001" />
          </Form.Item>
          <Form.Item name="fullName" label="Họ và tên người dùng" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Lê Hoàng Yến" />
          </Form.Item>
          <Form.Item name="email" label="Email doanh nghiệp" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="Ví dụ: yen.lh@kiyovn.enterprise" />
          </Form.Item>
          {!editingUser && <Form.Item name="password" label="Mật khẩu khởi tạo" rules={[{ required: true, min: 12, message: 'Tối thiểu 12 ký tự.' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>}
          <Form.Item name="role" label="Vai trò hệ thống" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Quản trị viên', value: 'ADMIN' },
                { label: 'Nhân viên', value: 'USER' },
              ]}
            />
          </Form.Item>
          <Form.Item name="department" label="Phòng ban trực thuộc">
            <Select
              options={departmentOptions}
              allowClear
              placeholder={departmentOptions.length ? 'Chọn phòng ban...' : 'Chưa có danh mục phòng ban'}
            />
          </Form.Item>
          <Form.Item name="position" label="Chức danh công việc">
            <Input placeholder="Ví dụ: Ban Giám Đốc, Kế Toán Trưởng, Trưởng Phòng Nhân Sự..." />
          </Form.Item>
          <Form.Item name="twoFactor" label="Chính sách xác thực 2 bước (2FA)" initialValue="unsupported">
            <Select
              disabled
              options={[
                { label: 'Chưa có bộ thực thi MFA trên máy chủ', value: 'unsupported' },
              ]}
            />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingUser ? 'Lưu tài khoản' : 'Khởi tạo tài khoản'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Hồ sơ tài khoản người dùng */}
      <Drawer
        title="Hồ Sơ Nhân Sự Quản Trị &amp; Đặc Quyền Hệ Thống"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>TÀI KHOẢN: {selectedUser.username}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedUser.fullName}
                  </div>
                </div>
                <Tag color={selectedUser.status === 'Hoạt động' ? 'success' : 'error'}>
                  {selectedUser.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phòng ban: <strong>{selectedUser.department}</strong> · Vai trò: <strong>{selectedUser.role}</strong>
              </div>
            </div>

            {/* Account Details */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <UserOutlined /> Thông Tin Tài Khoản &amp; Bảo Mật:
              </div>
              <div style={{ fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 6, color: '#334155' }}>
                <div>Email công vụ: <strong style={{ color: '#1E40AF' }}>{selectedUser.email}</strong></div>
                <div>Chức danh: <strong>{selectedUser.position || 'Chưa có'}</strong></div>
                <div>Xác thực 2 bước (2FA): <Tag color={selectedUser.twoFactor ? 'success' : 'default'}>{selectedUser.twoFactor ? 'Máy chủ đã xác minh' : 'Chưa có dữ liệu MFA'}</Tag></div>
                <div>Lần đăng nhập cuối: <strong>{selectedUser.lastLogin}</strong></div>
                <div>Chính sách nhập mật khẩu mới: <strong>Tối thiểu 12 ký tự; mật khẩu hiện tại không được đọc hoặc suy đoán độ mạnh.</strong></div>
              </div>
            </div>

            {/* Permissions Matrix */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <SafetyCertificateOutlined /> Đặc Quyền Truy Cập RBAC:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <Tag color="blue">{selectedUser.role === 'ADMIN' ? 'Vai trò ADMIN: thao tác API quản trị theo kiểm tra máy chủ' : 'Vai trò USER: truy cập hồ sơ và dữ liệu được cho phép'}</Tag>
                <span>Quyền từng chức năng chưa được xác định từ ma trận RBAC riêng.</span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => void handleResetPassword(selectedUser)}
              >
                {selectedUser.status === 'Chờ kích hoạt' ? 'Gửi lại email kích hoạt' : 'Đặt mật khẩu mới'}
              </Button>
              <Button
                danger={selectedUser.status === 'Hoạt động'}
                onClick={() => handleToggleStatus(selectedUser.key, selectedUser.fullName)}
              >
                {selectedUser.status === 'Hoạt động' ? 'Khóa Tài Khoản' : selectedUser.status === 'Chờ kích hoạt' ? 'Gửi kích hoạt' : 'Mở Khóa'}
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={printUser}
              >
                In Thông Tin (A4)
              </Button>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button onClick={() => { setEditingUser(selectedUser); form.resetFields(); form.setFieldsValue({ ...selectedUser, twoFactor: 'unsupported' }); setModalOpen(true); }}>Sửa tài khoản</Button>
              <Button danger onClick={() => handleDelete(selectedUser)}>Xóa tài khoản</Button>
            </div>
          </div>
        )}
      </Drawer>
      <Modal title={`Đặt mật khẩu mới: ${passwordTarget?.fullName || ''}`} open={Boolean(passwordTarget)} onCancel={() => setPasswordTarget(null)} footer={null} width={480}>
        <Form form={passwordForm} layout="vertical" onFinish={handlePasswordChange}>
          <Form.Item name="newPassword" label="Mật khẩu mới" rules={[{ required: true, min: 12 }]}><Input.Password autoComplete="new-password" /></Form.Item>
          <Form.Item name="confirmPassword" label="Xác nhận mật khẩu" rules={[{ required: true }]}><Input.Password autoComplete="new-password" /></Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>Lưu mật khẩu mới</Button>
        </Form>
      </Modal>
    </div>
  );
};
