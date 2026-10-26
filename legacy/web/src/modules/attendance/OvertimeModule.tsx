import { dataService } from '../../services/dataService';
import { collectionsApi } from '../../api/endpoints';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import { attendanceDate, attendanceNumber, dateRangeDays, employeeAttendanceFields, timeRangeDetails } from './attendanceRules';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  FieldTimeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  CheckOutlined,
  CloseOutlined,
  DollarOutlined,
  ProjectOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseOvertimeRecord {
  key: string;
  code: string;
  employeeName: string;
  empCode: string;
  department: string;
  position: string;
  otDate: string;
  timeRange: string;
  totalHours: number;
  multiplier: number; // 1.5x, 2.0x, 3.0x
  project: string;
  reason: string;
  baseHourlyRate: number;
  approver: string;
  requestedMultiplier?: number;
  status: 'Đã duyệt OT' | 'Chờ phê duyệt' | 'Chờ duyệt' | 'Từ chối';
}

const INITIAL_OT_DATA: EnterpriseOvertimeRecord[] = [];

export const OvertimeModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseOvertimeRecord[]>(INITIAL_OT_DATA);
  const [employees, setEmployees] = useState(dataService.getEmployees());
  const [saving, setSaving] = useState(false);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    void dataService.refreshGenericData('attendance_overtime').catch(() => message.error('Không thể tải dữ liệu từ máy chủ.'));
    const list = dataService.getGenericData('attendance_overtime');
    setData(Array.isArray(list) ? list : []);
    dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    const unsub = dataService.subscribe(() => {
      setEmployees(dataService.getEmployees());
      const updated = dataService.getGenericData('attendance_overtime');
      setData(Array.isArray(updated) ? updated : []);
      dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<EnterpriseOvertimeRecord | null>(null);

  const approvedList = data.filter((d) => d.status === 'Đã duyệt OT');
  const totalOTHours = approvedList.reduce((sum, item) => sum + item.totalHours, 0);
  const totalEstPay = approvedList.reduce((sum, item) => sum + item.totalHours * item.baseHourlyRate * item.multiplier, 0);
  const pendingCount = data.filter((d) => ['Chờ phê duyệt', 'Chờ duyệt'].includes(d.status)).length;

  const handleCreate = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      dateRangeDays(values.otDate, values.otDate);
      const hours = attendanceNumber(values.totalHours, 'Số giờ làm thêm', 0.5, 12);
      if (Math.abs(timeRangeDetails(values.timeRange).hours - hours) > 0.001) throw new Error('Số giờ làm thêm phải khớp với khung giờ đăng ký.');
      const multiplier = attendanceNumber(values.multiplier, 'Hệ số OT', 1, 3);
      if (![1.5, 2, 3].includes(multiplier)) throw new Error('Vui lòng chọn hệ số OT có trong danh sách.');
      const newOT = {
        ...values,
        ...employeeAttendanceFields(employees, values.employeeName),
        key: crypto.randomUUID(), totalHours: hours, multiplier,
        baseHourlyRate: attendanceNumber(values.baseHourlyRate, 'Lương cơ sở theo giờ', 0),
        status: 'Chờ phê duyệt',
      };
      await collectionsApi.create('attendance_overtime', newOT);
      await dataService.refreshGenericData('attendance_overtime');
      message.success(`Đã gửi đơn đăng ký làm thêm giờ (OT) của: ${newOT.employeeName}`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) { message.error(error?.response?.data?.message || error.message || 'Không thể lưu đơn OT.'); }
    finally { setSaving(false); }
  };

  const handleAction = async (record: EnterpriseOvertimeRecord, newStatus: 'Đã duyệt OT' | 'Từ chối') => {
    if (saving || !['Chờ phê duyệt', 'Chờ duyệt'].includes(record.status)) return;
    setSaving(true);
    try {
      if (newStatus === 'Đã duyệt OT' && (!(record.baseHourlyRate > 0) || ![1.5, 2, 3].includes(record.multiplier))) { setSelectedRecord(record); setDrawerOpen(true); throw new Error('Vui lòng nhập lương cơ sở theo giờ và chọn hệ số trước khi phê duyệt OT.'); }
      await collectionsApi.update('attendance_overtime', record.key, { status: newStatus, baseHourlyRate: record.baseHourlyRate, multiplier: record.multiplier });
      await dataService.refreshGenericData('attendance_overtime');
      setSelectedRecord({ ...record, status: newStatus });
      message.success(`Đã ${newStatus.toLowerCase()} đơn làm thêm giờ của ${record.employeeName}`);
    } catch (error: any) { message.error(error?.response?.data?.message || error.message || 'Không thể cập nhật đơn OT.'); }
    finally { setSaving(false); }
  };

  const filteredData = data.filter((item) => {
    const matchStatus =
      statusFilter === 'all' ||
      item.status === statusFilter ||
      (statusFilter === 'Chờ phê duyệt' && item.status === 'Chờ duyệt') ||
      (statusFilter === 'weekend' && item.multiplier >= 2.0);

    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.project || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã đơn OT & Dự án',
      key: 'code',
      render: (_: any, record: EnterpriseOvertimeRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ThunderboltOutlined /> {record.code}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Dự án: <strong style={{ color: '#0F172A' }}>{record.project}</strong>
          </div>
        </div>
      ),
    },
    {
      title: 'Nhân sự thực hiện OT',
      key: 'employee',
      width: 200,
      render: (_: any, record: EnterpriseOvertimeRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Mã: <code>{record.empCode}</code> · {record.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Ngày & Khung giờ OT',
      key: 'time',
      width: 200,
      render: (_: any, record: EnterpriseOvertimeRecord) => (
        <div>
          <div style={{ fontWeight: 600, color: '#2563EB', fontSize: 12.5 }}>{record.otDate}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Khung giờ: <strong>{record.timeRange}</strong>
          </div>
        </div>
      ),
    },
    {
      title: 'Số tiếng & Hệ số',
      key: 'hours',
      width: 140,
      render: (_: any, record: EnterpriseOvertimeRecord) => (
        <div>
          <div style={{ fontWeight: 800, color: '#009688', fontSize: 13.5 }}>{record.totalHours} Tiếng</div>
          <div style={{ marginTop: 2 }}>
            <Tag color={record.multiplier >= 2.0 ? 'purple' : 'cyan'}>{record.multiplier}x Lương</Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Lý do & Nội dung',
      dataIndex: 'reason',
      key: 'reason',
      render: (text: string) => (
        <Tooltip title={text}>
          <span style={{ fontSize: 12.5, color: '#475569' }}>
            {text && text.length > 35 ? `${text.slice(0, 35)}...` : text}
          </span>
        </Tooltip>
      ),
    },
    {
      title: 'Dự toán phụ cấp',
      key: 'pay',
      width: 140,
      render: (_: any, record: EnterpriseOvertimeRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: '#16A34A', fontSize: 13 }}>
            {(record.totalHours * record.baseHourlyRate * record.multiplier).toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 10.5, color: '#64748B' }}>
            Gốc: {record.baseHourlyRate?.toLocaleString('vi-VN')} ₫/h
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Đã duyệt OT' || status === 'Đã duyệt') color = 'success';
        if (status === 'Chờ phê duyệt' || status === 'Chờ duyệt') color = 'warning';
        if (status === 'Từ chối') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 170,
      render: (_: any, record: EnterpriseOvertimeRecord) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {(record.status === 'Chờ phê duyệt' || record.status === 'Chờ duyệt') && (
            <>
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => handleAction(record, 'Đã duyệt OT')}
                style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', fontSize: 11.5, padding: '0 6px' }}
              >
                Duyệt
              </Button>
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                onClick={() => handleAction(record, 'Từ chối')}
                style={{ fontSize: 11.5, padding: '0 6px' }}
              >
                Từ chối
              </Button>
            </>
          )}
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedRecord(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số giờ OT đã phê duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalOTHours} Giờ làm việc
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Phục vụ các đợt phát hành &amp; Bảo trì IDC</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Dự toán phụ cấp OT trong tháng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalEstPay.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Tính trực tiếp vào kỳ trả lương tháng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đơn đăng ký chờ lãnh đạo duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingCount} Đơn đăng ký
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Yêu cầu phê duyệt trước giờ bắt đầu làm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nhân sự đăng ký OT</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {new Set(data.map((item) => item.empCode || item.employeeName)).size} Nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Thống kê từ các đơn đăng ký hiện có</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả đơn OT' },
            { key: 'Chờ phê duyệt', label: 'Chờ phê duyệt', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đã duyệt OT', label: 'Đã duyệt OT', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'weekend', label: 'Cuối tuần', icon: <ThunderboltOutlined style={{ color: '#F59E0B' }} /> },
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
            placeholder="Tìm theo mã đơn OT, tên nhân sự, dự án..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('Lam_them_gio.xlsx', generateValidXlsxBlob([['Mã đơn', 'Nhân viên', 'Mã NV', 'Phòng ban', 'Ngày OT', 'Khung giờ', 'Số giờ', 'Hệ số', 'Lương giờ', 'Dự toán', 'Lý do', 'Trạng thái'], ...filteredData.map((item) => [item.code, item.employeeName, item.empCode, item.department, item.otDate, item.timeRange, item.totalHours, item.multiplier, item.baseHourlyRate, item.totalHours * item.multiplier * item.baseHourlyRate, item.reason, item.status])]))}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                code: `OT-${new Date().getFullYear()}-${Date.now()}`,
                otDate: attendanceDate(),
                multiplier: 1.5,
                timeRange: '18:00 - 21:00',
                totalHours: 3,
                baseHourlyRate: 0,
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Đăng ký làm OT mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Đăng ký OT mới */}
      <Modal
        title="Đăng Ký Làm Thêm Giờ (OT) Phục Vụ Dự Án"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã phiếu OT" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban" >
              <Select
                placeholder="Chọn phòng ban..."
                options={Array.from(new Set([...departmentOptions.map((item) => item.value), ...employees.map((item) => item.department)].filter(Boolean))).map((value) => ({ label: value, value }))}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Họ tên nhân viên làm OT" rules={[{ required: true }]}>
              <Select placeholder="Chọn nhân viên" options={employees.filter((employee) => employee.status !== 'Đã nghỉ việc').map((employee) => ({ label: `${employee.name} (${employee.code})`, value: employee.key }))} onChange={(key) => { const employee = employees.find((item) => item.key === key); if (employee) form.setFieldsValue({ department: employee.department, position: employee.position }); }} />
            </Form.Item>
            <Form.Item name="position" label="Chức danh">
              <Input />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="otDate" label="Ngày làm OT" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="multiplier" label="Loại hình & Hệ số OT" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Ngày thường', value: 1.5 },
                  { label: 'Nghỉ cuối tuần', value: 2.0 },
                  { label: 'Nghỉ Lễ Tết', value: 3.0 },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="timeRange" label="Khung giờ OT" rules={[{ required: true }]}>
              <Input placeholder="18:00 - 21:00" />
            </Form.Item>
            <Form.Item name="totalHours" label="Số giờ làm thêm" rules={[{ required: true }]}>
              <Input type="number" min={1} max={12} step={0.5} />
            </Form.Item>
          </div>

          <Form.Item name="project" label="Phục vụ dự án / Khách hàng" rules={[{ required: true }]}>
            <Input />
          </Form.Item>

          <Form.Item name="baseHourlyRate" label="Lương cơ sở theo giờ (VNĐ)" rules={[{ required: true }]}>
            <Input type="number" min={0} step={1000} />
          </Form.Item>

          <Form.Item name="reason" label="Lý do làm thêm giờ chi tiết" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Mô tả công việc cần xử lý ngoài giờ..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Gửi đơn đăng ký OT
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Đơn OT & Dự Toán Tiền Lương */}
      <Drawer
        title="Chi Tiết Đơn Đăng Ký OT &amp; Dự Toán Chi Phí"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedRecord.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedRecord.employeeName}
                  </div>
                </div>
                <Tag color={selectedRecord.status === 'Đã duyệt OT' ? 'success' : 'warning'}>
                  {selectedRecord.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedRecord.position} · {selectedRecord.department} (Mã: {selectedRecord.empCode})
              </div>
            </div>

            {/* Overtime details */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Tin Ca Làm Thêm Giờ:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Dự án phục vụ:</span>
                  <strong style={{ color: '#2563EB' }}>{selectedRecord.project}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Ngày &amp; Khung giờ làm:</span>
                  <strong>{selectedRecord.otDate} ({selectedRecord.timeRange})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tổng số giờ OT:</span>
                  <strong style={{ color: '#009688', fontSize: 14 }}>{selectedRecord.totalHours} Giờ</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Hệ số phụ cấp:</span>
                  <strong style={{ color: '#D97706' }}>x{selectedRecord.multiplier} Lương chuẩn</strong>
                </div>
                {selectedRecord.requestedMultiplier && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ color: '#64748B' }}>Hệ số nhân viên đề nghị:</span><span>x{selectedRecord.requestedMultiplier}</span></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Cán bộ phê duyệt:</span>
                  <span>{selectedRecord.approver}</span>
                </div>
                <div style={{ marginTop: 6, padding: '8px 10px', background: '#F1F5F9', borderRadius: 6, fontSize: 12 }}>
                  <strong>Lý do làm ngoài giờ:</strong> "{selectedRecord.reason}"
                </div>
              </div>
            </div>

            {/* Financial estimate */}
            <div style={{ border: '1px solid #BBF7D0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 6 }}>
                Dự Toán Chi Trả Tiền Lương Làm Thêm:
              </div>
              <div style={{ fontSize: 12.5, color: '#14532D', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{selectedRecord.totalHours}h × {selectedRecord.baseHourlyRate.toLocaleString('vi-VN')} ₫ × {selectedRecord.multiplier}:</span>
                <strong style={{ fontSize: 18, color: '#16A34A' }}>
                  {(selectedRecord.totalHours * selectedRecord.baseHourlyRate * selectedRecord.multiplier).toLocaleString('vi-VN')} ₫
                </strong>
              </div>
            </div>

            {['Chờ phê duyệt', 'Chờ duyệt'].includes(selectedRecord.status) && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <label>Lương cơ sở theo giờ (VNĐ)<Input type="number" min={0} value={selectedRecord.baseHourlyRate} onChange={(event) => setSelectedRecord({ ...selectedRecord, baseHourlyRate: Number(event.target.value) })} /></label>
                <label>Hệ số phê duyệt<Select value={selectedRecord.multiplier} options={[{ label: 'Ngày thường x1.5', value: 1.5 }, { label: 'Ngày nghỉ x2', value: 2 }, { label: 'Ngày lễ x3', value: 3 }]} onChange={(value) => setSelectedRecord({ ...selectedRecord, multiplier: Number(value) })} /></label>
              </div>
            )}
            {['Chờ phê duyệt', 'Chờ duyệt'].includes(selectedRecord.status) && (
              <div style={{ display: 'flex', gap: 8 }}>
                <Button
                  style={{ flex: 1, borderColor: '#DC2626', color: '#DC2626' }}
                  icon={<CloseOutlined />}
                  onClick={() => handleAction(selectedRecord, 'Từ chối')}
                >
                  Từ Chối
                </Button>
                <Button
                  type="primary"
                  style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                  icon={<CheckOutlined />}
                  onClick={() => handleAction(selectedRecord, 'Đã duyệt OT')}
                >
                  Phê Duyệt Đơn OT
                </Button>
              </div>
            )}
          </div>
        )}
      </Drawer>
    </div>
  );
};

