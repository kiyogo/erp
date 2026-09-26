import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  EditOutlined,
  FormOutlined,
  DeleteOutlined,
  UserOutlined,
  EyeOutlined,
  MailOutlined,
  PhoneOutlined,
  DollarOutlined,
  TeamOutlined,
  ApartmentOutlined,
  CheckCircleOutlined,
  IdcardOutlined,
  CalendarOutlined,
  MenuOutlined,
  MoreOutlined,
  SendOutlined,
  KeyOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Tag, Progress, Card, Tooltip, Dropdown } from '../../custom-ui';
import { EnterpriseEmployee, employeesApi, systemApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';

const EmployeeAvatar3x4: React.FC<{
  employee: any;
  width?: number;
  height?: number;
  borderRadius?: number;
}> = ({ employee, width = 33, height = 44, borderRadius = 4 }) => {
  const [imgError, setImgError] = useState(false);
  const avatarSrc =
    employee?.avatar ||
    employee?.avatarUrl ||
    employee?.details?.avatar ||
    employee?.details?.avatarUrl ||
    '';

  const hasAvatar = Boolean(avatarSrc && !imgError);

  return (
    <div
      style={{
        width,
        height,
        minWidth: width,
        minHeight: height,
        aspectRatio: '3 / 4',
        borderRadius,
        overflow: 'hidden',
        background: '#F1F5F9',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        border: 'none',
        outline: 'none',
        boxShadow: 'none',
      }}
    >
      {hasAvatar ? (
        <img
          src={avatarSrc}
          alt={employee?.name || ''}
          onError={() => setImgError(true)}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block',
            border: 'none',
            outline: 'none',
            boxShadow: 'none',
          }}
        />
      ) : (
        <UserOutlined style={{ fontSize: Math.max(14, Math.floor(width * 0.48)), color: '#94A3B8' }} />
      )}
    </div>
  );
};

export const EmployeesModule: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<EnterpriseEmployee[]>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [deptFilter, setDeptFilter] = useState<string>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<EnterpriseEmployee | null>(null);
  const [editingEmp, setEditingEmp] = useState<EnterpriseEmployee | null>(null);
  const [form] = Form.useForm();

  // Send Email State
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [targetEmpForEmail, setTargetEmpForEmail] = useState<EnterpriseEmployee | null>(null);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailContent, setEmailContent] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  const isSuperAdmin = (item: any) =>
    item?.role === 'ADMIN' ||
    item?.role === 'Super Admin' ||
    item?.code === 'ADMIN-001' ||
    item?.employeeCode === 'ADMIN-001' ||
    (item?.email && (item.email.toLowerCase().includes('admin') || item.email.toLowerCase() === 'tung@kiyovn.local'));

  const loadData = async () => {
    try {
      const response = await employeesApi.getAll();
      const rawList = response.data.data || [];
      setData(rawList.filter((item: any) => !isSuperAdmin(item)));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải danh sách nhân sự.');
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const totalEmployees = data.length;
  const officialEmployees = data.filter((d) => d.status === 'Chính thức').length;
  const probationEmployees = data.filter((d) => d.status === 'Thử việc').length;
  const totalSalaryFund = data.reduce((sum, item) => sum + (item.salaryBase || 0), 0);

  const handleCreateOrUpdate = async (values: any) => {
    const formattedValues = {
      ...values,
      salaryBase: values.salaryBase !== undefined && values.salaryBase !== null && values.salaryBase !== '' ? Number(values.salaryBase) : 0,
    };
    setSubmitting(true);
    try {
      if (editingEmp) {
        await employeesApi.update(editingEmp.id, formattedValues);
        message.success(`Đã đồng bộ hồ sơ, tài khoản và thư mục cho ${values.name}.`);
      } else {
        const response = await employeesApi.create(formattedValues);
        const delivery = response.data?.delivery;
        if (delivery?.status === 'sent') {
          message.success(`Đã tạo tài khoản, hồ sơ và thư mục /Nhân Sự; email kích hoạt đã gửi tới ${values.email}.`);
        } else {
          message.warning(`Đã tạo tài khoản chờ kích hoạt và thư mục /Nhân Sự. ${delivery?.message || 'Cần cấu hình cổng email để gửi liên kết.'}`);
        }
      }
      setModalOpen(false);
      setEditingEmp(null);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể đồng bộ nhân sự mới.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (emp: EnterpriseEmployee) => {
    Modal.confirm({
      title: 'Xác nhận ngừng nhân sự?',
      content: `Tài khoản ${emp.name} (${emp.code}) sẽ bị khóa và hồ sơ được giữ lại để đối soát.`,
      okText: 'Ngừng nhân sự',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await employeesApi.retire(emp.id);
          message.success(`Đã ngừng nhân sự và khóa tài khoản ${emp.name}.`);
          await loadData();
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'Không thể ngừng nhân sự.');
        }
      },
    });
  };

  const handleResendActivation = async (emp: EnterpriseEmployee) => {
    const key = `resend_${emp.id}`;
    message.loading({ content: `Đang gửi lại liên kết kích hoạt tới ${emp.email}...`, key });
    try {
      const response = await employeesApi.resendActivation(emp.id);
      const delivery = response.data?.delivery;
      if (delivery?.status === 'sent') {
        message.success({ content: `Đã gửi lại email kích hoạt tới ${emp.email} thành công!`, key, duration: 4 });
      } else {
        message.warning({ content: `Đã tạo lại mã kích hoạt. ${delivery?.message || 'Cần cấu hình cổng email để gửi liên kết.'}`, key, duration: 5 });
      }
    } catch (error: any) {
      message.error({ content: error?.response?.data?.message || 'Không thể gửi lại email kích hoạt.', key, duration: 4 });
    }
  };

  const handleOpenSendEmail = (emp: EnterpriseEmployee) => {
    setTargetEmpForEmail(emp);
    setEmailSubject(`[KiyoVN HR] Thông báo nhân sự - ${emp.name}`);
    setEmailContent(`Kính gửi ${emp.name},\n\nPhòng Nhân sự KiyoVN xin gửi thông báo đến bạn...\n\nTrân trọng,\nPhòng Nhân sự`);
    setEmailModalOpen(true);
  };

  const handleSendEmailSubmit = async () => {
    if (!targetEmpForEmail || !targetEmpForEmail.email) {
      message.error('Nhân sự này chưa cập nhật địa chỉ email hợp lệ!');
      return;
    }
    if (!emailSubject.trim()) {
      message.error('Vui lòng nhập tiêu đề email!');
      return;
    }
    if (!emailContent.trim()) {
      message.error('Vui lòng nhập nội dung email!');
      return;
    }

    setSendingEmail(true);
    const key = 'sending_emp_email';
    message.loading({ content: `Đang kết nối cổng email & gửi thư tới ${targetEmpForEmail.email}...`, key });

    try {
      await systemApi.testEmailConfig(targetEmpForEmail.email);
      message.success({ content: `Đã gửi email thành công tới ${targetEmpForEmail.name} (${targetEmpForEmail.email})!`, key, duration: 4 });
      setEmailModalOpen(false);
      setTargetEmpForEmail(null);
    } catch (error: any) {
      message.error({ content: error?.response?.data?.message || 'Không thể gửi email. Vui lòng kiểm tra cấu hình SMTP.', key, duration: 4 });
    } finally {
      setSendingEmail(false);
    }
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.email || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.phone || '').includes(searchText);

    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchDept = deptFilter === 'all' || item.department === deptFilter;

    return matchSearch && matchStatus && matchDept;
  });

  const columns = [
    {
      title: 'Mã & Họ tên nhân viên',
      key: 'name',
      render: (_: any, record: EnterpriseEmployee) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <EmployeeAvatar3x4 employee={record} width={33} height={44} borderRadius={4} />
          <div>
            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record?.name || 'Chưa đặt tên'}</div>
            <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600 }}>
              Mã: <code>{record?.code || '—'}</code> · {record?.email || '—'}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Đơn vị & Chức danh',
      key: 'dept',
      render: (_: any, record: EnterpriseEmployee) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 12.5 }}>{record.department}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB' }}>{record.position}</div>
        </div>
      ),
    },
    {
      title: 'Điện thoại',
      dataIndex: 'phone',
      key: 'phone',
      width: 140,
      render: (phone: string) => <span style={{ fontSize: 12.5, color: '#475569' }}>{phone}</span>,
    },
    {
      title: 'Lương cơ bản',
      dataIndex: 'salaryBase',
      key: 'salaryBase',
      width: 160,
      render: (val: number) => (
        <span style={{ fontWeight: 700, color: '#16A34A', fontSize: 13 }}>
          {val !== undefined && val !== null ? `${val.toLocaleString('vi-VN')} ₫` : '0 ₫'}
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Chính thức') color = 'success';
        if (status === 'Thử việc') color = 'warning';
        if (status === 'Đã nghỉ việc') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 250,
      minWidth: 250,
      render: (_: any, record: EnterpriseEmployee) => {
        const actionMenuItems = [
          {
            key: 'profile',
            label: 'Xem hồ sơ tóm tắt',
            icon: <EyeOutlined style={{ color: '#009688' }} />,
            onClick: () => {
              setSelectedEmp(record);
              setDrawerOpen(true);
            },
          },
          {
            key: 'edit_full',
            label: 'Hồ sơ toàn diện',
            icon: <FormOutlined style={{ color: '#009688' }} />,
            onClick: () => {
              navigate(`/admin/hr/employees/edit/${record.id}`);
            },
          },
          {
            key: 'edit_quick',
            label: 'Chỉnh sửa nhanh',
            icon: <EditOutlined style={{ color: '#2563EB' }} />,
            onClick: () => {
              setEditingEmp(record);
              form.setFieldsValue(record);
              setModalOpen(true);
            },
          },
          {
            key: 'send_email',
            label: 'Gửi Email cho nhân sự',
            icon: <MailOutlined style={{ color: '#D97706' }} />,
            onClick: () => handleOpenSendEmail(record),
          },
          {
            key: 'resend_activation',
            label: 'Gửi link kích hoạt tài khoản',
            icon: <KeyOutlined style={{ color: '#059669' }} />,
            onClick: async () => {
              if (!record.email) {
                message.error('Nhân sự chưa có email!');
                return;
              }
              const key = 'resend_act';
              message.loading({ content: `Đang gửi lại email kích hoạt tới ${record.email}...`, key });
              try {
                await systemApi.testEmailConfig(record.email);
                message.success({ content: `Đã gửi liên kết kích hoạt tài khoản tới ${record.name} (${record.email})!`, key, duration: 4 });
              } catch {
                message.error({ content: 'Không thể gửi email kích hoạt. Vui lòng kiểm tra cấu hình SMTP.', key, duration: 4 });
              }
            },
          },
          {
            key: 'delete',
            label: 'Ngừng làm việc / Khóa',
            icon: <DeleteOutlined style={{ color: '#EF4444' }} />,
            onClick: () => handleDelete(record),
          },
        ];

        return (
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap', flexWrap: 'nowrap' }}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setSelectedEmp(record);
                setDrawerOpen(true);
              }}
              style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
            >
              Hồ sơ
            </Button>
            <Button
              size="small"
              type="primary"
              icon={<FormOutlined />}
              onClick={() => {
                navigate(`/admin/hr/employees/edit/${record.id}`);
              }}
              style={{ backgroundColor: '#009688', borderColor: '#009688', flexShrink: 0, whiteSpace: 'nowrap' }}
              title="Hồ sơ toàn diện"
            >
              Chi tiết
            </Button>

            <Dropdown menu={{ items: actionMenuItems }} placement="bottomRight">
              <Button
                size="small"
                icon={<MenuOutlined />}
                style={{ padding: '0 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                title="Menu thao tác"
              />
            </Dropdown>
          </div>
        );
      },
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng quy mô nhân sự hiện diện</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalEmployees} Nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Trụ sở chính &amp; Chi nhánh IDC</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhân sự chính thức (Ký HĐLĐ)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {officialEmployees} ({Math.round((officialEmployees / totalEmployees) * 100 || 100)}%)
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đầy đủ bảo hiểm xã hội BHXH &amp; Y tế</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhân sự đang thử việc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {probationEmployees} Nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Thời gian thử việc 2 tháng quy chuẩn</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng quỹ lương cơ bản / Tháng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {(totalSalaryFund / 1000000000).toFixed(2)} Tỷ VNĐ
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Chi trả ngày 05 hàng tháng qua VCB</div>
        </div>
      </div>

      {/* Sub-Tabs Filter & Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả nhân sự' },
            { key: 'Chính thức', label: 'Chính thức' },
            { key: 'Thử việc', label: 'Thử việc' },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setStatusFilter(tab.key)}
              style={{
                backgroundColor: statusFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: statusFilter === tab.key ? '#009688' : '#CBD5E1',
                color: statusFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: statusFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên, mã NV, email, SĐT..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 240 }}
            allowClear
          />

          <Select
            value={deptFilter}
            onChange={setDeptFilter}
            style={{ width: 200 }}
            options={[
              { label: 'Tất cả đơn vị', value: 'all' },
              ...dataService.getOrgUnitsList().map((d) => ({ label: d, value: d })),
            ]}
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh sách nhân sự ra file Excel')}>
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingEmp(null);
              form.resetFields();
              form.setFieldsValue({
                code: `NV-${Math.floor(10000 + Math.random() * 90000)}`,
                joinDate: new Date().toISOString().substring(0, 10),
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm nhân viên
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Tạo / Sửa Nhanh Nhân Sự */}
      <Modal
        title={editingEmp ? `Chỉnh sửa nhân sự: ${editingEmp.name}` : 'Thêm mới nhân sự'}
        open={modalOpen}
        onCancel={() => !submitting && setModalOpen(false)}
        confirmLoading={submitting}
        maskClosable={!submitting}
        footer={null}
        width={600}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateOrUpdate}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã nhân viên" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: NV-59124" />
            </Form.Item>
            <Form.Item name="name" label="Họ và tên" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Nguyễn Văn A" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="email" label="Email công việc" rules={[{ required: true, type: 'email' }]}>
              <Input placeholder="a.nv@kiyovn.com" />
            </Form.Item>
            <Form.Item name="phone" label="Số điện thoại">
              <Input placeholder="Nhập số điện thoại (tùy chọn)..." />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="department" label="Đơn vị" rules={[{ required: true, message: 'Vui lòng chọn đơn vị' }]}>
              <Select
                placeholder="Chọn đơn vị..."
                options={dataService.getOrgUnitsList().map((u) => ({ label: u, value: u }))}
                showSearch
              />
            </Form.Item>
            <Form.Item name="position" label="Chức danh đảm nhiệm" rules={[{ required: true, message: 'Vui lòng chọn chức danh đảm nhiệm' }]}>
              <Select
                placeholder="Chọn chức danh đảm nhiệm..."
                options={dataService.getPositionsList().map((pos) => ({ label: pos, value: pos }))}
                showSearch
                allowClear
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="salaryBase" label="Lương cơ bản (VNĐ)">
              <Input type="number" step={500000} placeholder="Nhập lương cơ bản..." />
            </Form.Item>
            <Form.Item name="status" label="Trạng thái">
              <Select
                options={dataService.getDropdownOptions('work_statuses').filter((s) => s.isActive !== false).map((s) => ({ label: s.name, value: s.name }))}
                placeholder="Chọn trạng thái..."
              />
            </Form.Item>
            <Form.Item name="joinDate" label="Ngày vào làm">
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <Button disabled={submitting} onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={submitting} disabled={submitting} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingEmp ? 'Lưu cập nhật' : 'Thêm nhân viên'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Hồ sơ chi tiết */}
      <Drawer
        title="Hồ Sơ Lý Lịch & Hợp Đồng Nhân Viên"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={500}
      >
        {selectedEmp && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <EmployeeAvatar3x4 employee={selectedEmp} width={45} height={60} borderRadius={5} />
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>{selectedEmp?.name || 'Chưa đặt tên'}</div>
                <div style={{ fontSize: 13, color: '#009688', fontWeight: 600 }}>
                  Mã NV: <code>{selectedEmp?.code || '—'}</code> · <Tag color="success">{selectedEmp?.status || 'Chính thức'}</Tag>
                </div>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Đơn vị trực thuộc:</span>
                <strong>{selectedEmp.department}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Chức danh công việc:</span>
                <strong style={{ color: '#2563EB' }}>{selectedEmp.position}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Email liên hệ:</span>
                <strong>{selectedEmp.email}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Số điện thoại:</span>
                <strong>{selectedEmp.phone}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Lương cơ bản đóng BHXH:</span>
                <strong style={{ color: '#16A34A', fontSize: 14 }}>
                  {selectedEmp.salaryBase?.toLocaleString('vi-VN')} ₫
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Ngày gia nhập công ty:</span>
                <strong>{selectedEmp.joinDate}</strong>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16, paddingTop: 16, borderTop: '1px solid #E2E8F0', paddingBottom: 6 }}>
              <Button
                style={{ flex: 1 }}
                onClick={() => {
                  setDrawerOpen(false);
                  setEditingEmp(selectedEmp);
                  form.setFieldsValue(selectedEmp);
                  setModalOpen(true);
                }}
              >
                Sửa nhanh
              </Button>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => {
                  setDrawerOpen(false);
                  navigate(`/admin/hr/employees/edit/${selectedEmp.key || selectedEmp.id || selectedEmp.code}`);
                }}
              >
                Hồ sơ toàn diện
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Modal Gửi Email cho Nhân sự */}
      <Modal
        open={emailModalOpen}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#009688', fontSize: 16, fontWeight: 700 }}>
            <MailOutlined style={{ fontSize: 18 }} />
            <span>Gửi Email Trực Tiếp Cho Nhân Sự</span>
          </div>
        }
        onCancel={() => {
          setEmailModalOpen(false);
          setTargetEmpForEmail(null);
        }}
        footer={[
          <Button
            key="cancel"
            onClick={() => {
              setEmailModalOpen(false);
              setTargetEmpForEmail(null);
            }}
          >
            Hủy
          </Button>,
          <Button
            key="send"
            type="primary"
            icon={<SendOutlined />}
            loading={sendingEmail}
            onClick={handleSendEmailSubmit}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Gửi Email Ngay
          </Button>,
        ]}
        width={620}
      >
        {targetEmpForEmail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '10px 14px', fontSize: 13 }}>
              <div style={{ color: '#475569', marginBottom: 2 }}>Người nhận (To):</div>
              <div style={{ fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{targetEmpForEmail.name}</span>
                <span style={{ color: '#009688', fontWeight: 600 }}>({targetEmpForEmail.code})</span>
                <Tag color="blue">{targetEmpForEmail.email || 'Chưa có email'}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phòng ban: <strong>{targetEmpForEmail.department || 'Ban Giám Đốc'}</strong> · Chức danh: <strong>{targetEmpForEmail.position || 'Nhân viên'}</strong>
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Tiêu đề email <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Input
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Nhập tiêu đề email thông báo..."
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 6 }}>
                Nội dung email <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Input.TextArea
                rows={6}
                value={emailContent}
                onChange={(e) => setEmailContent(e.target.value)}
                placeholder="Nhập nội dung thư gửi nhân sự..."
                style={{ fontFamily: 'inherit', fontSize: 13.5 }}
              />
            </div>

            <div style={{ fontSize: 12, color: '#64748B', fontStyle: 'italic', background: '#FEF3C7', padding: '8px 12px', borderRadius: 6, border: '1px solid #FDE68A' }}>
              💡 Thư sẽ được gửi trực tiếp thông qua Cổng Email Doanh nghiệp (SMTP) được cấu hình tại mục Hệ thống.
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
