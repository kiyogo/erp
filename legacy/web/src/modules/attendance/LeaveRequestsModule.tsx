import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  CheckOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  CalendarOutlined,
  UserSwitchOutlined,
  FileProtectOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';
import { dataService, LeaveRequest } from '../../services/dataService';
import { collectionsApi } from '../../api/endpoints';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import { attendanceDate, employeeAttendanceFields, leaveDays } from './attendanceRules';

export interface EnterpriseLeaveRequest extends LeaveRequest {
  empCode?: string;
  position?: string;
  handoverPerson?: string;
  contactPhone?: string;
  remainingAnnualLeave?: number;
  approver?: string;
  attachmentUrl?: string;
}

export const LeaveRequestsModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseLeaveRequest[]>([]);
  const [employees, setEmployees] = useState(dataService.getEmployees());
  const [saving, setSaving] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<EnterpriseLeaveRequest | null>(null);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);

  const loadData = () => {
    setEmployees(dataService.getEmployees());
    const raw = dataService.getLeaveRequests() || [];
    const enriched: EnterpriseLeaveRequest[] = raw.map((r) => ({
      ...r,
      leaveType: r.leaveType || (r as any).type || 'Chưa phân loại',
      startDate: r.startDate || (r as any).fromDate || '',
      endDate: r.endDate || (r as any).toDate || '',
      daysCount: Number(r.daysCount ?? (r as any).days) || 0,
    }));
    setData(enriched);
  };

  useEffect(() => {
    void dataService.refreshGenericData('leave_requests').catch(() => message.error('Không thể tải dữ liệu từ máy chủ.'));
    loadData();
    dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    const unsub = dataService.subscribe(() => {
      loadData();
      dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    });
    return unsub;
  }, []);

  const pendingCount = data.filter((d) => d.status === 'Chờ duyệt').length;
  const approvedCount = data.filter((d) => d.status === 'Đã duyệt').length;
  const totalDays = data.reduce((sum, d) => sum + (d.daysCount || 0), 0);

  const handleCreate = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const formattedValues = {
        ...values,
        ...employeeAttendanceFields(employees, values.employeeName),
        key: crypto.randomUUID(),
        daysCount: leaveDays(values.daysCount, values.startDate, values.endDate),
        status: 'Chờ duyệt' as const,
      };
      await collectionsApi.create('leave_requests', formattedValues);
      await dataService.refreshGenericData('leave_requests');
      message.success(`Đã tạo đơn nghỉ phép ${values.code} thành công`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error.message || 'Không thể lưu đơn nghỉ phép.');
    } finally { setSaving(false); }
  };

  const handleApproveOrReject = async (req: EnterpriseLeaveRequest, status: 'Đã duyệt' | 'Từ chối') => {
    if (saving || req.status !== 'Chờ duyệt') return;
    setSaving(true);
    try {
      await collectionsApi.update('leave_requests', req.key, { status });
      await dataService.refreshGenericData('leave_requests');
      message.success(`Đã ${status.toLowerCase()} đơn ${req.code} của ${req.employeeName}`);
      setDrawerOpen(false);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể cập nhật trạng thái đơn nghỉ phép.');
    } finally { setSaving(false); }
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.leaveType || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã đơn & Loại nghỉ phép',
      key: 'code',
      render: (_: any, record: EnterpriseLeaveRequest) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarOutlined style={{ color: '#009688', fontSize: 15 }} />
            {record.leaveType}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã đơn: <code>{record.code}</code>
          </div>
        </div>
      ),
    },
    {
      title: 'Người làm đơn',
      key: 'employee',
      width: 210,
      render: (_: any, record: EnterpriseLeaveRequest) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Mã: <code>{record.empCode}</code> · {record.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Thời gian nghỉ & Số ngày',
      key: 'time',
      width: 220,
      render: (_: any, record: EnterpriseLeaveRequest) => (
        <div>
          <div style={{ fontWeight: 600, color: '#2563EB', fontSize: 12.5 }}>
            {record.startDate} ➔ {record.endDate}
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', fontWeight: 700 }}>
            {record.daysCount} ngày công nghỉ
          </div>
        </div>
      ),
    },
    {
      title: 'Lý do xin nghỉ',
      dataIndex: 'reason',
      key: 'reason',
      render: (r: string) => <span style={{ color: '#475569', fontSize: 12 }}>{r}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Đã duyệt') color = 'success';
        if (status === 'Chờ duyệt') color = 'warning';
        if (status === 'Từ chối') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 140,
      render: (_: any, record: EnterpriseLeaveRequest) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedRequest(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
          </Button>
          {record.status === 'Chờ duyệt' && (
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              onClick={() => handleApproveOrReject(record, 'Đã duyệt')}
              style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng đơn xin nghỉ phát sinh</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} Đơn nghỉ
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Tổng cộng {totalDays} ngày nghỉ phép</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đang chờ phê duyệt (Pending)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingCount} Đơn chờ duyệt
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Thời gian cam kết xử lý SLA &lt; 24h</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã phê duyệt hợp lệ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {approvedCount} Đơn hoàn tất
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đơn đã được phê duyệt trên hệ thống</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Số ngày nghỉ trung bình mỗi nhân sự</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {data.length ? (totalDays / new Set(data.map((item) => item.empCode || item.employeeName)).size).toFixed(1) : 0} Ngày / Người
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Số ngày nghỉ trung bình trên các đơn hiện có</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả đơn' },
            { key: 'Chờ duyệt', label: 'Chờ duyệt', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đã duyệt', label: 'Đã duyệt', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Từ chối', label: 'Từ chối', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
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

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã đơn, nhân viên, loại đơn..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<ReloadOutlined />} onClick={() => dataService.refreshGenericData('leave_requests').catch(() => message.error('Không thể tải lại đơn nghỉ phép.'))}>
            Làm mới
          </Button>

          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('Don_nghi_phep.xlsx', generateValidXlsxBlob([['Mã đơn', 'Nhân viên', 'Mã NV', 'Phòng ban', 'Loại nghỉ', 'Từ ngày', 'Đến ngày', 'Số ngày', 'Lý do', 'Trạng thái'], ...filteredData.map((item) => [item.code, item.employeeName, item.empCode || '', item.department, item.leaveType, item.startDate, item.endDate, item.daysCount, item.reason, item.status])]))}>
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                code: `NP-${new Date().getFullYear()}-${Date.now()}`,
                leaveType: 'Nghỉ phép năm',
                startDate: attendanceDate(),
                endDate: attendanceDate(),
                daysCount: 1,
                contactPhone: '',
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tạo đơn nghỉ mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Tạo Đơn Xin Nghỉ Mới */}
      <Modal
        title="Tạo Đơn Xin Nghỉ Phép / Đăng Ký Vắng Mặt"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã đơn" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="leaveType" label="Loại hình nghỉ phép" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Nghỉ phép năm (hưởng 100% lương)', value: 'Nghỉ phép năm' },
                  { label: 'Nghỉ ốm đau (chế độ BHXH chi trả)', value: 'Nghỉ ốm' },
                  { label: 'Nghỉ kết hôn (hưởng 3 ngày lương)', value: 'Nghỉ kết hôn' },
                  { label: 'Nghỉ thai sản (chế độ BHXH)', value: 'Nghỉ thai sản' },
                  { label: 'Nghỉ không hưởng lương', value: 'Nghỉ việc riêng không lương' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Người làm đơn" rules={[{ required: true }]}>
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
            <Form.Item name="startDate" label="Từ ngày" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="endDate" label="Đến ngày" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="daysCount" label="Số ngày nghỉ" rules={[{ required: true }]}>
              <Input type="number" min={0.5} step={0.5} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="handoverPerson" label="Người nhận bàn giao công việc">
              <Input placeholder="Ví dụ: Nguyễn Văn Minh" />
            </Form.Item>
            <Form.Item name="contactPhone" label="Số điện thoại liên hệ khẩn cấp">
              <Input placeholder="0988.xxx.xxx" />
            </Form.Item>
          </div>

          <Form.Item name="reason" label="Lý do xin nghỉ chi tiết" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Nhập lý do cụ thể..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Nộp đơn trình duyệt
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Đơn Nghỉ & Phê Duyệt */}
      <Drawer
        title="Hồ Sơ Đơn Xin Nghỉ &amp; Luồng Phê Duyệt"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedRequest && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedRequest.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedRequest.employeeName}
                  </div>
                </div>
                <Tag color={selectedRequest.status === 'Đã duyệt' ? 'success' : 'warning'}>
                  {selectedRequest.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedRequest.position} · {selectedRequest.department} (Mã: {selectedRequest.empCode})
              </div>
            </div>

            {/* Leave Details */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Tin Chi Tiết Đơn Nghỉ Phép:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Loại đơn nghỉ phép:</span>
                  <strong style={{ color: '#009688' }}>{selectedRequest.leaveType}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời gian nghỉ:</span>
                  <strong>{selectedRequest.startDate} ➔ {selectedRequest.endDate} ({selectedRequest.daysCount} ngày)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Người nhận bàn giao công việc:</span>
                  <strong>{selectedRequest.handoverPerson}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Điện thoại liên hệ khẩn cấp:</span>
                  <span>{selectedRequest.contactPhone}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Phép năm còn lại trước đơn:</span>
                  <strong style={{ color: '#16A34A' }}>{selectedRequest.remainingAnnualLeave == null ? 'Chưa đối chiếu' : `${selectedRequest.remainingAnnualLeave} Ngày phép`}</strong>
                </div>
                <div style={{ marginTop: 6, padding: '8px 10px', background: '#F1F5F9', borderRadius: 6, fontSize: 12 }}>
                  <strong>Lý do xin nghỉ:</strong> "{selectedRequest.reason}"
                </div>
              </div>
            </div>

            {/* Approval Workflow */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Quy Trình Ký Duyệt Trực Tuyến:
              </div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                1. <strong>Cấp Quản lý Trực tiếp:</strong> {selectedRequest.approver} ({selectedRequest.status === 'Đã duyệt' ? '✅ Đã duyệt' : '⏳ Đang chờ'})<br />
                2. <strong>Khối Nhân Sự C&amp;B:</strong> Đối chiếu đơn đã duyệt với sổ quỹ phép năm.
              </div>
            </div>

            {/* Action buttons */}
            {selectedRequest.status === 'Chờ duyệt' && (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  style={{ flex: 1, borderColor: '#DC2626', color: '#DC2626' }}
                  icon={<CloseOutlined />}
                  onClick={() => handleApproveOrReject(selectedRequest, 'Từ chối')}
                >
                  Từ Chối Đơn
                </Button>
                <Button
                  type="primary"
                  style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                  icon={<CheckOutlined />}
                  onClick={() => handleApproveOrReject(selectedRequest, 'Đã duyệt')}
                >
                  Phê Duyệt Đơn Nghỉ
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

