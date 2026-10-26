import { dataService } from '../../services/dataService';
import { collectionsApi } from '../../api/endpoints';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import { attendanceDate, employeeAttendanceFields, leaveDays } from './attendanceRules';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  UserOutlined,
  EyeOutlined,
  CheckOutlined,
  CloseOutlined,
  FileProtectOutlined,
  TeamOutlined,
  SmileOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseLeavePlanItem {
  key: string;
  planCode: string;
  employeeName: string;
  empCode: string;
  department: string;
  position: string;
  leaveType: 'Nghỉ phép năm dài ngày' | 'Nghỉ thai sản (6 tháng)' | 'Nghỉ kết hôn (3 ngày)' | 'Nghỉ việc riêng / Dưỡng sức';
  fromDate: string;
  toDate: string;
  totalDays: number;
  handoverPerson: string;
  handoverTasks: string;
  approver: string;
  bhxhBenefit: string;
  status: 'Đã duyệt kế hoạch' | 'Chờ phê duyệt' | 'Từ chối';
}

const INITIAL_PLANS: EnterpriseLeavePlanItem[] = [];

export const LeavePlansModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseLeavePlanItem[]>(INITIAL_PLANS);
  const [employees, setEmployees] = useState(dataService.getEmployees());
  const [saving, setSaving] = useState(false);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    void dataService.refreshGenericData('attendance_leave_plans').catch(() => message.error('Không thể tải dữ liệu từ máy chủ.'));
    const list = dataService.getGenericData('attendance_leave_plans');
    setData(Array.isArray(list) ? list : []);
    dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    const unsub = dataService.subscribe(() => {
      setEmployees(dataService.getEmployees());
      const updated = dataService.getGenericData('attendance_leave_plans');
      setData(Array.isArray(updated) ? updated : []);
      dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<EnterpriseLeavePlanItem | null>(null);

  const approvedCount = data.filter((d) => d.status === 'Đã duyệt kế hoạch').length;
  const pendingCount = data.filter((d) => d.status === 'Chờ phê duyệt').length;

  const handleCreate = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const newItem = { ...values, ...employeeAttendanceFields(employees, values.employeeName), key: crypto.randomUUID(), totalDays: leaveDays(values.totalDays, values.fromDate, values.toDate), status: 'Chờ phê duyệt' };
      await collectionsApi.create('attendance_leave_plans', newItem);
      await dataService.refreshGenericData('attendance_leave_plans');
      message.success(`Đã đăng ký kế hoạch nghỉ phép dài hạn cho: ${newItem.employeeName}`);
      setModalOpen(false); form.resetFields();
    } catch (error: any) { message.error(error?.response?.data?.message || error.message || 'Không thể lưu kế hoạch nghỉ.'); }
    finally { setSaving(false); }
  };

  const handleApprove = async (record: EnterpriseLeavePlanItem, status: 'Đã duyệt kế hoạch' | 'Từ chối' = 'Đã duyệt kế hoạch') => {
    if (saving || record.status !== 'Chờ phê duyệt') return;
    setSaving(true);
    try {
      await collectionsApi.update('attendance_leave_plans', record.key, { status });
      await dataService.refreshGenericData('attendance_leave_plans');
      message.success(`Đã ${status.toLowerCase()}: ${record.planCode}`); setDrawerOpen(false);
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể cập nhật kế hoạch nghỉ.'); }
    finally { setSaving(false); }
  };

  const filteredData = data.filter((item) => {
    const matchType = typeFilter === 'all' || item.leaveType === typeFilter;
    const matchSearch =
      (item.planCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.handoverPerson || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.leaveType || '').toLowerCase().includes(searchText.toLowerCase());

    return matchType && matchSearch;
  });

  const columns = [
    {
      title: 'Mã kế hoạch & Loại hình nghỉ',
      key: 'planCode',
      render: (_: any, record: EnterpriseLeavePlanItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarOutlined style={{ color: '#009688', fontSize: 15 }} />
            {record.leaveType}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã: <code>{record.planCode}</code>
          </div>
        </div>
      ),
    },
    {
      title: 'Nhân sự đăng ký',
      key: 'employeeName',
      width: 220,
      render: (_: any, record: EnterpriseLeavePlanItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Mã: <code>{record.empCode}</code> · {record.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Khoảng thời gian & Số ngày',
      key: 'dates',
      width: 230,
      render: (_: any, record: EnterpriseLeavePlanItem) => (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2563EB' }}>
            {record.fromDate} ➔ {record.toDate}
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', fontWeight: 700 }}>
            Tổng cộng: {record.totalDays} ngày nghỉ
          </div>
        </div>
      ),
    },
    {
      title: 'Bàn giao công việc cho',
      key: 'handoverPerson',
      render: (_: any, record: EnterpriseLeavePlanItem) => (
        <div>
          <div style={{ color: '#334155', fontSize: 12.5, fontWeight: 600 }}>{record.handoverPerson}</div>
          <div style={{ color: '#64748B', fontSize: 11.5 }}>Duyệt: {record.approver}</div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (st: string) => {
        let color = 'default';
        if (st === 'Đã duyệt kế hoạch') color = 'success';
        if (st === 'Chờ phê duyệt') color = 'warning';
        return <Tag color={color}>{st}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseLeavePlanItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedPlan(record);
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng kế hoạch nghỉ phép dài hạn</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} Kế hoạch
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Được đăng ký trước từ 15 - 30 ngày</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Kế hoạch thai sản &amp; Dài hạn</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {approvedCount} Kế hoạch
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Kế hoạch đã được phê duyệt trên hệ thống</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Kế hoạch chờ Ban Giám Đốc duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingCount} Kế hoạch
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Cần phê duyệt phương án bàn giao việc</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Kế hoạch có nội dung bàn giao</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {data.filter((item) => item.handoverPerson && item.handoverTasks).length} / {data.length}
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Có người nhận và nội dung bàn giao đã ghi nhận</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả kế hoạch' },
            { key: 'Nghỉ thai sản (6 tháng)', label: '🤰 Nghỉ thai sản' },
            { key: 'Nghỉ kết hôn (3 ngày)', label: '💍 Nghỉ kết hôn' },
            { key: 'Nghỉ phép năm dài ngày', label: 'Phép năm dài hạn', icon: <SmileOutlined style={{ color: '#F59E0B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setTypeFilter(tab.key)}
              style={{
                backgroundColor: typeFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: typeFilter === tab.key ? '#009688' : '#CBD5E1',
                color: typeFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: typeFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã KH, họ tên, người nhận bàn giao..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('Ke_hoach_nghi.xlsx', generateValidXlsxBlob([['Mã kế hoạch', 'Nhân viên', 'Mã NV', 'Phòng ban', 'Loại nghỉ', 'Từ ngày', 'Đến ngày', 'Số ngày', 'Bàn giao cho', 'Nội dung', 'Trạng thái'], ...filteredData.map((item) => [item.planCode, item.employeeName, item.empCode, item.department, item.leaveType, item.fromDate, item.toDate, item.totalDays, item.handoverPerson, item.handoverTasks, item.status])]))}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                planCode: `KH-NP-${Date.now()}`,
                leaveType: 'Nghỉ phép năm dài ngày',
                fromDate: attendanceDate(),
                toDate: attendanceDate(),
                totalDays: 1,
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Đăng ký kế hoạch nghỉ
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Đăng ký kế hoạch nghỉ mới */}
      <Modal
        title="Đăng Ký Kế Hoạch Nghỉ Dài Hạn &amp; Phương Án Bàn Giao"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="planCode" label="Mã kế hoạch" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="leaveType" label="Loại hình nghỉ phép" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Nghỉ phép năm dài ngày', value: 'Nghỉ phép năm dài ngày' },
                  { label: 'Nghỉ thai sản chế độ BHXH (6 tháng)', value: 'Nghỉ thai sản (6 tháng)' },
                  { label: 'Nghỉ kết hôn (3 ngày)', value: 'Nghỉ kết hôn (3 ngày)' },
                  { label: 'Nghỉ việc riêng / Dưỡng sức', value: 'Nghỉ việc riêng / Dưỡng sức' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Họ tên nhân sự" rules={[{ required: true }]}>
              <Select placeholder="Chọn nhân viên" options={employees.filter((employee) => employee.status !== 'Đã nghỉ việc').map((employee) => ({ label: `${employee.name} (${employee.code})`, value: employee.key }))} onChange={(key) => { const employee = employees.find((item) => item.key === key); if (employee) form.setFieldsValue({ department: employee.department }); }} />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban trực thuộc" >
              <Select
                placeholder="Chọn phòng ban trực thuộc..."
                options={Array.from(new Set([...departmentOptions.map((item) => item.value), ...employees.map((item) => item.department)].filter(Boolean))).map((value) => ({ label: value, value }))}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="fromDate" label="Từ ngày" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="toDate" label="Đến ngày" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="totalDays" label="Tổng số ngày" rules={[{ required: true }]}>
              <Input type="number" min={1} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="handoverPerson" label="Nhân sự tiếp nhận bàn giao" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Đặng Đình Long" />
            </Form.Item>
            <Form.Item name="approver" label="Cán bộ phê duyệt dự kiến">
              <Select allowClear placeholder="Chọn cán bộ" options={employees.map((employee) => ({ label: `${employee.name} (${employee.code})`, value: employee.name }))} />
            </Form.Item>
          </div>

          <Form.Item name="handoverTasks" label="Nội dung bàn giao công việc chi tiết" initialValue="Bàn giao toàn bộ tài khoản và các đầu việc phát sinh">
            <Input.TextArea rows={2} />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Trình kế hoạch phê duyệt
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Kế Hoạch & Bàn Giao */}
      <Drawer
        title="Kế Hoạch Nghỉ Dài Ngày &amp; Biên Bản Bàn Giao"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedPlan && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedPlan.planCode}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedPlan.employeeName}
                  </div>
                </div>
                <Tag color={selectedPlan.status === 'Đã duyệt kế hoạch' ? 'success' : 'warning'}>
                  {selectedPlan.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedPlan.position} · {selectedPlan.department} (Mã: {selectedPlan.empCode})
              </div>
            </div>

            {/* Plan Info */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Tin Kế Hoạch Nghỉ Phép:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Loại hình kế hoạch:</span>
                  <strong style={{ color: '#2563EB' }}>{selectedPlan.leaveType}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời gian áp dụng:</span>
                  <strong>{selectedPlan.fromDate} ➔ {selectedPlan.toDate} ({selectedPlan.totalDays} ngày)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Cán bộ phê duyệt:</span>
                  <span>{selectedPlan.approver}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Chế độ BHXH / Lương:</span>
                  <span style={{ color: '#16A34A', fontWeight: 600 }}>{selectedPlan.bhxhBenefit}</span>
                </div>
              </div>
            </div>

            {/* Handover protocol */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TeamOutlined /> Biên Bản Bàn Giao Đầu Việc Tạm Thời:
              </div>
              <div style={{ fontSize: 12.5, color: '#1E293B', marginBottom: 6 }}>
                Người tiếp nhận bàn giao: <strong style={{ color: '#009688' }}>{selectedPlan.handoverPerson}</strong>
              </div>
              <div style={{ fontSize: 12, color: '#475569', fontStyle: 'italic', background: '#FFFFFF', padding: '10px 12px', borderRadius: 4, border: '1px solid #E2E8F0' }}>
                "{selectedPlan.handoverTasks}"
              </div>
            </div>

            {selectedPlan.status === 'Chờ phê duyệt' && (
              <Button icon={<CloseOutlined />} loading={saving} onClick={() => handleApprove(selectedPlan, 'Từ chối')}>Từ chối kế hoạch nghỉ</Button>
            )}
            {selectedPlan.status === 'Chờ phê duyệt' && (
              <Button
                type="primary"
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                icon={<CheckOutlined />}
                onClick={() => handleApprove(selectedPlan)}
              >
                Phê Duyệt Kế Hoạch Nghỉ Dài Ngày
              </Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

