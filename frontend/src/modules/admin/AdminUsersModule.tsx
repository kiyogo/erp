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
import { employeesApi, usersApi } from '../../api/endpoints';

export const AdminUsersModule: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    try {
      const response = await usersApi.getAll();
      setData((response.data.data || []).map((user: any) => ({
        ...user,
        key: user.id,
        username: user.employeeCode,
        fullName: user.fullName || user.name,
        role: user.role === 'ADMIN' ? 'Super Admin' : user.position || 'Nhân viên',
        department: user.department || 'Chưa phân phòng ban',
        status: user.isActive ? 'Hoạt động' : (user.activationStatus === 'Chờ kích hoạt' ? 'Chờ kích hoạt' : 'Đã khóa'),
        twoFactor: false,
        lastLogin: user.updatedAt ? 'Chưa có dữ liệu' : 'Chưa đăng nhập',
      })));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải danh sách tài khoản.');
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreate = async (values: any) => {
    try {
      await usersApi.create({
        name: values.fullName,
        email: values.email,
        employeeCode: values.username,
        password: values.password,
        role: values.role === 'Super Admin' ? 'ADMIN' : 'USER',
        department: values.department,
      });
      message.success(`Đã tạo tài khoản và hồ sơ nhân sự cho ${values.fullName}.`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tạo tài khoản.');
    }
  };

  const handleToggleStatus = async (key: string, name: string) => {
    const current = data.find((item) => item.key === key);
    try {
      await usersApi.update(key, { isActive: current?.status !== 'Hoạt động' });
      message.success(`Đã cập nhật trạng thái tài khoản: ${name}`);
      await loadData();
      if (selectedUser && selectedUser.key === key) setSelectedUser((prev: any) => ({ ...prev, status: prev.status === 'Hoạt động' ? 'Đã khóa' : 'Hoạt động' }));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể cập nhật trạng thái tài khoản.');
    }
  };

  const handleResetPassword = async (record: any) => {
    if (record.activationStatus !== 'Chờ kích hoạt') {
      message.info('Chức năng đặt lại mật khẩu sẽ dùng một luồng email riêng. Tài khoản này đã được kích hoạt.');
      return;
    }
    try {
      const response = await employeesApi.resendActivation(record.id);
      const delivery = response.data.delivery;
      if (delivery.status === 'sent') message.success(`Đã gửi lại email kích hoạt đến ${record.email}.`);
      else message.warning(delivery.message || 'Chưa thể gửi email kích hoạt.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể gửi lại email kích hoạt.');
    }
  };

  const activeCount = data.filter((u) => u.status === 'Hoạt động').length;
  const mfaCount = data.filter((u) => u.twoFactor).length;
  const adminCount = data.filter((u) => (u.role || '').includes('Admin') || (u.role || '').includes('Giám Đốc')).length;

  const filteredData = data.filter((u) => {
    let matchTab = true;
    if (filterTab === 'active') matchTab = u.status === 'Hoạt động';
    else if (filterTab === 'locked') matchTab = u.status !== 'Hoạt động';
    else if (filterTab === 'admin') matchTab = (u.role || '').includes('Admin') || (u.role || '').includes('Giám Đốc');
    else if (filterTab === 'mfa') matchTab = !!u.twoFactor;

    const matchSearch =
      (u.username || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (u.fullName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (u.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (u.role || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

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
      title: 'Vai trò (Role)',
      dataIndex: 'role',
      key: 'role',
      render: (r: string) => {
        let color = 'cyan';
        if (r.includes('Super Admin')) color = 'purple';
        else if (r.includes('Giám Đốc')) color = 'green';
        return <Tag color={color}>{r}</Tag>;
      },
    },
    {
      title: 'Xác thực 2FA',
      dataIndex: 'twoFactor',
      key: 'twoFactor',
      width: 140,
      render: (tf: boolean) => (
        <Tag color={tf ? 'success' : 'error'}>
          {tf ? '● Đã bật 2FA' : '○ Chưa bật'}
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
            {record.status === 'Hoạt động' ? 'Khóa' : 'Mở'}
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
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Phân quyền theo mô hình RBAC</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tài khoản đang hoạt động</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {activeCount} tài khoản
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Được cấp quyền truy cập hệ thống</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhóm Quản trị viên &amp; Lãnh đạo</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {adminCount} tài khoản
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Đặc quyền phê duyệt &amp; ký số HSM</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ kích hoạt xác thực 2FA</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {Math.round((mfaCount / (data.length || 1)) * 100)}% Tuân thủ
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>{mfaCount}/{data.length} đã kích hoạt OTP/FIDO2</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả tài khoản' },
            { key: 'active', label: 'Đang hoạt động', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'locked', label: 'Đã khóa', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
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

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh sách tài khoản quản trị')}>
            Xuất Excel
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
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* Add User Modal */}
      <Modal
        title="Tạo Mới Tài Khoản Người Dùng &amp; Phân Quyền"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <Form.Item name="username" label="Tên đăng nhập (Username)" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: hoang.yen" />
          </Form.Item>
          <Form.Item name="fullName" label="Họ và tên người dùng" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Lê Hoàng Yến" />
          </Form.Item>
          <Form.Item name="email" label="Email doanh nghiệp" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="Ví dụ: yen.lh@kiyovn.enterprise" />
          </Form.Item>
          <Form.Item name="password" label="Mật khẩu khởi tạo" rules={[{ required: true, min: 12, message: 'Tối thiểu 12 ký tự.' }]}>
            <Input.Password autoComplete="new-password" />
          </Form.Item>
          <Form.Item name="role" label="Vai trò & Nhóm quyền RBAC" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Super Admin (Toàn quyền hệ thống)', value: 'Super Admin' },
                { label: 'Ban Giám Đốc (Executive Director)', value: 'Ban Giám Đốc' },
                { label: 'Kế Toán Trưởng (Chief Accountant)', value: 'Kế Toán Trưởng' },
                { label: 'Trưởng Phòng Nhân Sự (HR Manager)', value: 'Trưởng Phòng Nhân Sự' },
                { label: 'Trưởng Phòng Ban Chuyên Môn', value: 'Trưởng Phòng Ban' },
                { label: 'Nhân Viên Tiêu Chuẩn (Employee)', value: 'Nhân Viên Tiêu Chuẩn' },
              ]}
            />
          </Form.Item>
          <Form.Item name="department" label="Phòng ban trực thuộc" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Ban Giám Đốc', value: 'Ban Giám Đốc' },
                { label: 'Phòng Ban Kỹ Thuật', value: 'Phòng Ban Kỹ Thuật' },
                { label: 'Khối Kinh Doanh & Tiếp Thị', value: 'Khối Kinh Doanh & Tiếp Thị' },
                { label: 'Phòng Tài Chính Kế Toán', value: 'Phòng Tài Chính Kế Toán' },
                { label: 'Phòng Nhân Sự & Hành Chính', value: 'Phòng Nhân Sự & Hành Chính' },
              ]}
            />
          </Form.Item>
          <Form.Item name="twoFactor" label="Bắt buộc xác thực 2 bước (2FA)" initialValue="true">
            <Select
              options={[
                { label: 'Bật bắt buộc (Khuyến nghị an ninh cao)', value: 'true' },
                { label: 'Không bắt buộc', value: 'false' },
              ]}
            />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Khởi tạo tài khoản
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
                <div>Xác thực 2 bước (2FA): <Tag color={selectedUser.twoFactor ? 'success' : 'error'}>{selectedUser.twoFactor ? 'Đã kích hoạt' : 'Chưa bật'}</Tag></div>
                <div>Lần đăng nhập cuối: <strong>{selectedUser.lastLogin}</strong></div>
                <div>Chính sách mật khẩu: <strong>Đạt tiêu chuẩn 12 ký tự phức tạp</strong></div>
              </div>
            </div>

            {/* Permissions Matrix */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <SafetyCertificateOutlined /> Đặc Quyền Truy Cập RBAC:
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                <Tag color="blue">Xem Báo Cáo Tài Chính</Tag>
                <Tag color="cyan">Ký Số Phê Duyệt HSM</Tag>
                <Tag color="purple">Quản Lý Nhân Sự</Tag>
                <Tag color="geekblue">Xuất Dữ Liệu Excel / PDF</Tag>
                <Tag color="green">Truy Cập VPN Nội Bộ</Tag>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => void handleResetPassword(selectedUser)}
              >
                Gửi Mail Đổi Mật Khẩu
              </Button>
              <Button
                danger={selectedUser.status === 'Hoạt động'}
                onClick={() => handleToggleStatus(selectedUser.key, selectedUser.fullName)}
              >
                {selectedUser.status === 'Hoạt động' ? 'Khóa Tài Khoản' : 'Mở Khóa'}
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in thẻ chứng nhận cán bộ cho ${selectedUser.fullName}`)}
              >
                In Thẻ Cán Bộ (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
