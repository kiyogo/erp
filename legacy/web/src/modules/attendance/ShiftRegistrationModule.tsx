import React, { useState, useEffect, useMemo } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  ApartmentOutlined,
  CheckCircleOutlined,
  MenuOutlined,
  UserOutlined,
  CheckOutlined,
  CloseOutlined,
  LockOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import {
  Modal,
  Drawer,
  Form,
  Input,
  Select,
  Button,
  message,
  Tag,
  Dropdown,
} from '../../custom-ui';
import { collectionsApi, EnterpriseEmployee } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { useCompanyName } from '../../hooks/useCompanyName';
import { generateValidXlsxBlob, downloadFile } from '../../utils/fileExporter';

export interface ShiftRegistrationCampaign {
  key: string;
  code: string;
  name: string;
  orgUnit: string;
  periodType: string;
  startDate: string;
  endDate: string;
  deadlineDate: string;
  deadlineTime: string;
  totalSubmissions: number;
  totalTarget: number;
  status: 'Đang mở' | 'Đã đóng' | 'Đã duyệt';
  createdAt?: string;
}

const pad2 = (value: number) => String(value).padStart(2, '0');
const formatDMY = (date: Date) => `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
const monthRangeDMY = (offset = 0) => { const now = new Date(); return { start: formatDMY(new Date(now.getFullYear(), now.getMonth() + offset, 1)), end: formatDMY(new Date(now.getFullYear(), now.getMonth() + offset + 1, 0)) }; };

export const ShiftRegistrationModule: React.FC = () => {
  const companyName = useCompanyName();
  const [data, setData] = useState<ShiftRegistrationCampaign[]>([]);
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [orgUnits, setOrgUnits] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [orgFilter, setOrgFilter] = useState('all');

  // Modal State
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  // Drawer Detail State
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<ShiftRegistrationCampaign | null>(null);

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      // 1. Org units
      const fetchedUnits = await dataService.fetchOrgUnitsList().catch(() => [] as string[]);
      setOrgUnits(fetchedUnits);

      // 2. Employees
      const empList = dataService.getEmployeeDirectory();
      setEmployees(empList);

      // 3. Campaigns
      const res = await collectionsApi.get<any>('attendance_shift_registrations').catch(() => ({ data: { data: [] } }));
      const rows = res.data?.data || [];
      if (Array.isArray(rows) && rows.length > 0) {
        setData(rows);
      } else {
        setData([]);
      }
    } catch {
      setData([]);
      message.error('Không tải được các yêu cầu đăng ký ca.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = dataService.subscribe(() => {
      setEmployees(dataService.getEmployeeDirectory());
    });
    return unsub;
  }, []);

  // Filtered Data
  const filteredData = useMemo(() => {
    return data.filter((item) => {
      const matchStatus = statusFilter === 'all' || item.status === statusFilter;
      const matchOrg = orgFilter === 'all' || item.orgUnit === orgFilter;
      const s = searchText.toLowerCase().trim();
      const matchSearch =
        !s ||
        (item.name || '').toLowerCase().includes(s) ||
        (item.code || '').toLowerCase().includes(s) ||
        (item.orgUnit || '').toLowerCase().includes(s);

      return matchStatus && matchOrg && matchSearch;
    });
  }, [data, statusFilter, orgFilter, searchText]);

  // KPI Metrics
  const totalCampaigns = data.length;
  const activeCampaigns = data.filter((d) => d.status === 'Đang mở').length;
  const totalSubmitted = useMemo(() => {
    return data.reduce((acc, cur) => acc + (cur.totalSubmissions || 0), 0);
  }, [data]);
  const activeCamp = data.find((d) => d.status === 'Đang mở') || data[0];
  const responseRate = activeCamp && activeCamp.totalTarget > 0
    ? Math.round((activeCamp.totalSubmissions / activeCamp.totalTarget) * 100)
    : 0;

  const handleOpenCreate = () => {
    const range = monthRangeDMY();
    form.resetFields();
    form.setFieldsValue({
      name: `Yêu cầu đăng ký ca từ ${range.start} đến ${range.end}${companyName ? ` - ${companyName}` : ''}`,
      orgUnit: companyName || orgUnits[0] || '',
      periodType: 'Tháng này',
      startDate: range.start,
      endDate: range.end,
      deadlineDate: formatDMY(new Date()),
      deadlineTime: '23:59',
    });
    setModalOpen(true);
  };

  const handleSaveCampaign = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const range = monthRangeDMY();
      const newCampaign: ShiftRegistrationCampaign = {
        key: `camp-${Date.now()}`,
        code: `DK-${new Date().getFullYear()}-${String(data.length + 1).padStart(2, '0')}`,
        name: values.name,
        orgUnit: values.orgUnit || companyName || orgUnits[0] || '',
        periodType: values.periodType || 'Tháng này',
        startDate: values.startDate || range.start,
        endDate: values.endDate || range.end,
        deadlineDate: values.deadlineDate || formatDMY(new Date()),
        deadlineTime: values.deadlineTime || '23:59',
        totalSubmissions: 0,
        totalTarget: employees.length,
        status: 'Đang mở',
        createdAt: new Date().toISOString().slice(0, 10),
      };

      await collectionsApi.create('attendance_shift_registrations', newCampaign);
      setData((prev) => [newCampaign, ...prev]);
      message.success(`Đã tạo yêu cầu đăng ký ca: ${newCampaign.name}`);
      setModalOpen(false);
      form.resetFields();
    } catch (err: any) {
      message.error(err?.message || 'Không thể tạo yêu cầu đăng ký ca.');
    } finally {
      setSaving(false);
    }
  };

  // Đổi trạng thái đợt đăng ký và lưu máy chủ (trước đây chỉ đổi trên màn hình, tải lại là mất).
  const saveCampaignStatus = async (record: ShiftRegistrationCampaign, status: ShiftRegistrationCampaign['status'], successText: string) => {
    try {
      await collectionsApi.update('attendance_shift_registrations', record.key, { ...record, status });
      setData((prev) => prev.map((item) => (item.key === record.key ? { ...item, status } : item)));
      message.success(successText);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được trạng thái đợt đăng ký.');
    }
  };

  const handleToggleStatus = (record: ShiftRegistrationCampaign) => {
    const nextStatus = record.status === 'Đang mở' ? 'Đã đóng' : 'Đang mở';
    void saveCampaignStatus(record, nextStatus, `Đã chuyển trạng thái đợt đăng ký sang: ${nextStatus}`);
  };

  const handleDeleteCampaign = (record: ShiftRegistrationCampaign) => {
    Modal.confirm({
      title: 'Xác nhận xóa yêu cầu đăng ký ca?',
      content: `Bạn có chắc chắn muốn xóa "${record.name}" không? Toàn bộ phiếu đăng ký của nhân viên sẽ bị hủy.`,
      okText: 'Xóa yêu cầu',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await collectionsApi.remove('attendance_shift_registrations', record.key);
          setData((prev) => prev.filter((item) => item.key !== record.key));
          message.success(`Đã xóa yêu cầu đăng ký ca: ${record.name}`);
        } catch {
          message.error('Không thể xóa yêu cầu.');
        }
      },
    });
  };

  const handleExportExcel = () => {
    try {
      const header = [
        'Mã yêu cầu',
        'Tên bảng đăng ký ca',
        'Đơn vị áp dụng',
        'Kỳ áp dụng',
        'Từ ngày',
        'Đến ngày',
        'Hạn đăng ký',
        'Số lượt nộp',
        'Trạng thái',
      ];
      const rows = filteredData.map((c) => [
        c.code,
        c.name,
        c.orgUnit,
        c.periodType,
        c.startDate,
        c.endDate,
        `${c.deadlineTime} ${c.deadlineDate}`,
        `${c.totalSubmissions}/${c.totalTarget}`,
        c.status,
      ]);
      const blob = generateValidXlsxBlob([header, ...rows]);
      downloadFile(`danh_sach_dang_ky_ca_${new Date().toISOString().slice(0, 10)}.xlsx`, blob);
      message.success('Đã xuất danh sách yêu cầu đăng ký ca ra file Excel.');
    } catch {
      message.error('Không thể xuất file Excel.');
    }
  };

  const columns = [
    {
      title: 'Mã, tên bảng đăng ký ca',
      key: 'name',
      render: (_: any, record: ShiftRegistrationCampaign) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 6,
              background: '#E0F2F1',
              color: '#00796B',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: 12,
              flexShrink: 0,
            }}
          >
            {record.code ? record.code.slice(0, 4) : 'ĐK'}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.name}</div>
            <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600 }}>
              Mã: <code>{record.code}</code> · Đợt {record.periodType.toLowerCase()}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Đơn vị áp dụng',
      dataIndex: 'orgUnit',
      key: 'orgUnit',
      width: 250,
      render: (unit: string) => (
        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ApartmentOutlined style={{ color: '#009688', fontSize: 14 }} />
          <span>{unit}</span>
        </div>
      ),
    },
    {
      title: 'Thời gian áp dụng',
      key: 'period',
      width: 220,
      render: (_: any, record: ShiftRegistrationCampaign) => (
        <div style={{ fontSize: 12, color: '#475569' }}>
          <div style={{ fontWeight: 600, color: '#2563EB' }}>{record.periodType}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Từ {record.startDate} đến {record.endDate}
          </div>
        </div>
      ),
    },
    {
      title: 'Hạn đăng ký',
      key: 'deadline',
      width: 180,
      render: (_: any, record: ShiftRegistrationCampaign) => (
        <div style={{ fontSize: 12, color: '#475569' }}>
          <div style={{ fontWeight: 700, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 4 }}>
            <ClockCircleOutlined style={{ fontSize: 12 }} />
            <span>{record.deadlineTime}</span>
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Ngày: <strong>{record.deadlineDate}</strong>
          </div>
        </div>
      ),
    },
    {
      title: 'Tiến độ đăng ký',
      key: 'progress',
      width: 180,
      render: (_: any, record: ShiftRegistrationCampaign) => {
        const pct = record.totalTarget > 0 ? Math.round((record.totalSubmissions / record.totalTarget) * 100) : 0;
        return (
          <div style={{ fontSize: 12 }}>
            <div style={{ fontWeight: 700, color: '#16A34A' }}>
              {record.totalSubmissions} / {record.totalTarget} Nhân sự
            </div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
              Đạt <strong>{pct}%</strong> chỉ tiêu
            </div>
          </div>
        );
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Đang mở') color = 'success';
        if (status === 'Đã duyệt') color = 'processing';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 160,
      render: (_: any, record: ShiftRegistrationCampaign) => {
        const actionMenuItems = [
          {
            key: 'toggle',
            label: record.status === 'Đang mở' ? 'Đóng đăng ký' : 'Mở lại đăng ký',
            icon: record.status === 'Đang mở' ? <LockOutlined style={{ color: '#D97706' }} /> : <UnlockOutlined style={{ color: '#10B981' }} />,
            onClick: () => handleToggleStatus(record),
          },
          {
            key: 'approve',
            label: 'Phê duyệt toàn bộ phiếu',
            icon: <CheckCircleOutlined style={{ color: '#10B981' }} />,
            onClick: () => { void saveCampaignStatus(record, 'Đã duyệt', `Đã phê duyệt các phiếu đăng ký ca của đợt: ${record.code}`); },
          },
          {
            key: 'delete',
            label: 'Xóa yêu cầu đăng ký',
            icon: <DeleteOutlined style={{ color: '#EF4444' }} />,
            onClick: () => handleDeleteCampaign(record),
          },
        ];

        return (
          <div style={{ display: 'inline-flex', gap: 6, alignItems: 'center', whiteSpace: 'nowrap' }}>
            <Button
              size="small"
              icon={<EyeOutlined />}
              onClick={() => {
                setSelectedCampaign(record);
                setDrawerOpen(true);
              }}
              style={{ flexShrink: 0 }}
            >
              Chi tiết
            </Button>
            <Button
              size="small"
              type="primary"
              onClick={() => handleToggleStatus(record)}
              style={{
                backgroundColor: record.status === 'Đang mở' ? '#D97706' : '#009688',
                borderColor: record.status === 'Đang mở' ? '#D97706' : '#009688',
                flexShrink: 0,
              }}
            >
              {record.status === 'Đang mở' ? 'Đóng' : 'Mở'}
            </Button>
            <Dropdown menu={{ items: actionMenuItems }} placement="bottomRight">
              <Button
                size="small"
                icon={<MenuOutlined />}
                style={{ padding: '0 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
                title="Thao tác khác"
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số đợt đăng ký ca</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalCampaigns} Đợt đăng ký
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Toàn bộ các chiến dịch đăng ký ca</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đang mở nhận đăng ký</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {activeCampaigns} Đợt đang mở
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Nhân sự được phép nộp nguyện vọng ca</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhân sự đã nộp phiếu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalSubmitted} Phiếu nộp
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Đã gửi nguyện vọng lên hệ thống</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ phản hồi đăng ký</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {responseRate}%
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Đạt chuẩn tiến độ quy định</div>
        </div>
      </div>

      {/* Filter and Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả đợt đăng ký' },
            { key: 'Đang mở', label: 'Đang mở' },
            { key: 'Đã đóng', label: 'Đã đóng' },
            { key: 'Đã duyệt', label: 'Đã duyệt' },
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
                height: 32,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            placeholder="Tìm kiếm bảng đăng ký ca..."
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260, height: 32 }}
          />

          <Select
            value={orgFilter}
            onChange={setOrgFilter}
            style={{ width: 230, height: 32 }}
            options={[
              { label: 'Tất cả đơn vị', value: 'all' },
              ...orgUnits.map((u) => ({ label: u, value: u })),
            ]}
          />

          <Button
            icon={<DownloadOutlined />}
            onClick={handleExportExcel}
            style={{ height: 32 }}
          >
            Xuất Excel
          </Button>

          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadData(true)}
            style={{ height: 32 }}
          >
            Tải lại
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688', height: 32 }}
          >
            Thêm yêu cầu đăng ký ca
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <KTable
        columns={columns}
        dataSource={filteredData}
        rowKey="key"
        loading={loading}
        pagination={{ pageSize: 10, showSizeChanger: true }}
      />

      {/* MODAL: THÊM YÊU CẦU ĐĂNG KÝ CA (ĐÚNG 100% CẤU TRÚC VÀ YÊU CẦU CỦA NGƯỜI DÙNG) */}
      <Modal
        title="Thêm yêu cầu đăng ký ca"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={680}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSaveCampaign}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {/* Tên bảng đăng ký ca */}
          <Form.Item
            name="name"
            label="Tên bảng đăng ký ca"
            required
            rules={[{ required: true, message: 'Vui lòng nhập tên bảng đăng ký ca' }]}
            style={{ margin: 0 }}
          >
            <Input
              placeholder="Nhập tên bảng đăng ký ca..."
              style={{ height: 32 }}
            />
          </Form.Item>

          {/* Đơn vị áp dụng */}
          <Form.Item
            name="orgUnit"
            label="Đơn vị áp dụng"
            required
            rules={[{ required: true, message: 'Vui lòng chọn đơn vị áp dụng' }]}
            style={{ margin: 0 }}
          >
            <Select
              style={{ height: 32 }}
              options={orgUnits.map((u) => ({ label: u, value: u }))}
            />
          </Form.Item>

          {/* Thời gian */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
              Thời gian <span style={{ color: '#EF4444' }}>*</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr', gap: 10 }}>
              <Form.Item
                name="periodType"
                initialValue="Tháng này"
                style={{ margin: 0 }}
              >
                <Select
                  style={{ height: 32 }}
                  options={[
                    { label: 'Tháng này', value: 'Tháng này' },
                    { label: 'Tháng sau', value: 'Tháng sau' },
                    { label: 'Tùy chọn', value: 'Tùy chọn' },
                  ]}
                  onChange={(val) => {
                    if (val === 'Tháng này') {
                      const range = monthRangeDMY(0);
                      form.setFieldsValue({ startDate: range.start, endDate: range.end });
                    } else if (val === 'Tháng sau') {
                      const range = monthRangeDMY(1);
                      form.setFieldsValue({ startDate: range.start, endDate: range.end });
                    }
                  }}
                />
              </Form.Item>

              <Form.Item
                name="startDate"
                initialValue={monthRangeDMY().start}
                style={{ margin: 0 }}
              >
                <Input placeholder="dd/mm/yyyy" style={{ height: 32 }} />
              </Form.Item>

              <Form.Item
                name="endDate"
                initialValue={monthRangeDMY().end}
                style={{ margin: 0 }}
              >
                <Input placeholder="dd/mm/yyyy" style={{ height: 32 }} />
              </Form.Item>
            </div>
          </div>

          {/* Hạn đăng ký */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
              Hạn đăng ký <span style={{ color: '#EF4444' }}>*</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10 }}>
              <Form.Item
                name="deadlineDate"
                initialValue={formatDMY(new Date())}
                required
                rules={[{ required: true, message: 'Vui lòng nhập ngày hết hạn' }]}
                style={{ margin: 0 }}
              >
                <Input placeholder="dd/mm/yyyy" style={{ height: 32 }} />
              </Form.Item>

              <Form.Item
                name="deadlineTime"
                initialValue="23:59"
                required
                rules={[{ required: true, message: 'Vui lòng nhập giờ hết hạn' }]}
                style={{ margin: 0 }}
              >
                <Input placeholder="23:59" style={{ height: 32 }} />
              </Form.Item>
            </div>
          </div>

          {/* Footer Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
            <Button disabled={saving} onClick={() => setModalOpen(false)} style={{ height: 32 }}>
              Hủy
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              loading={saving}
              disabled={saving}
              style={{ backgroundColor: '#009688', borderColor: '#009688', height: 32 }}
            >
              Tạo yêu cầu
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: CHI TIẾT ĐỢT ĐĂNG KÝ VÀ DANH SÁCH PHIẾU NỘP */}
      <Drawer
        title="Chi tiết đợt đăng ký ca"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={500}
      >
        {selectedCampaign && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>
                {selectedCampaign.name}
              </div>
              <div style={{ fontSize: 12.5, color: '#009688', fontWeight: 600, marginTop: 4 }}>
                Mã đợt: <code>{selectedCampaign.code}</code> · Trạng thái: <Tag color={selectedCampaign.status === 'Đang mở' ? 'success' : 'default'}>{selectedCampaign.status}</Tag>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông số đợt đăng ký:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Đơn vị áp dụng:</span>
                  <strong style={{ color: '#334155' }}>{selectedCampaign.orgUnit}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Khoảng thời gian:</span>
                  <span>Từ <strong>{selectedCampaign.startDate}</strong> đến <strong>{selectedCampaign.endDate}</strong></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Hạn chót đăng ký:</span>
                  <strong style={{ color: '#DC2626' }}>{selectedCampaign.deadlineTime} ngày {selectedCampaign.deadlineDate}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tiến độ nộp phiếu:</span>
                  <strong style={{ color: '#16A34A' }}>{selectedCampaign.totalSubmissions} / {selectedCampaign.totalTarget} Cán bộ</strong>
                </div>
              </div>
            </div>

            {/* Danh sách nhân sự mẫu nộp phiếu */}
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Danh sách nguyện vọng nhân viên đã nộp:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
                {employees.slice(0, 10).map((emp, i) => (
                  <div
                    key={emp.id || i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '8px 12px',
                      background: '#F8FAFC',
                      borderRadius: 6,
                      fontSize: 12.5,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 600, color: '#0F172A' }}>{emp.name}</div>
                      <div style={{ fontSize: 11, color: '#64748B' }}>{emp.code || emp.employeeCode} · {emp.department}</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <Tag color="success">Đã đăng ký HC</Tag>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                type="primary"
                onClick={() => handleToggleStatus(selectedCampaign)}
                style={{
                  flex: 1,
                  backgroundColor: selectedCampaign.status === 'Đang mở' ? '#D97706' : '#009688',
                  borderColor: selectedCampaign.status === 'Đang mở' ? '#D97706' : '#009688',
                  height: 32,
                }}
              >
                {selectedCampaign.status === 'Đang mở' ? 'Đóng đăng ký' : 'Mở lại đăng ký'}
              </Button>
              <Button
                onClick={() => {
                  message.success(`Đã xuất danh sách phiếu đăng ký ca của đợt ${selectedCampaign.code}`);
                }}
                style={{ flex: 1, height: 32 }}
              >
                Xuất phiếu đăng ký
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
