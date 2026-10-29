import { dataService } from '../../services/dataService';
import { collectionsApi } from '../../api/endpoints';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import { attendanceDate, attendanceNumber, employeeAttendanceFields, monthDayCount } from './attendanceRules';
import React, { useEffect, useState } from 'react';
import { TimesheetBoardDialog } from './TimesheetBoardDialog';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  TableOutlined,
  CheckCircleOutlined,
  CalculatorOutlined,
  EyeOutlined,
  EditOutlined,
  CheckOutlined,
  DollarOutlined,
  ArrowRightOutlined,
  CalendarOutlined,
  LaptopOutlined,
  AuditOutlined,
  BarChartOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';

export interface EnterpriseTimesheetSummaryItem {
  key: string;
  month?: string;
  employeeCode: string;
  employeeName: string;
  position: string;
  department: string;
  standardDays: number;
  actualDays: number;
  paidLeaveDays: number;
  unpaidLeaveDays: number;
  otHoursWeekday: number;
  otHoursWeekend: number;
  totalPayDays: number;
  attendanceRate: number;
  status: 'Đã khóa công' | 'Chờ đối soát';
}

const INITIAL_SUMMARY: EnterpriseTimesheetSummaryItem[] = [];

export const TimesheetSummaryModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseTimesheetSummaryItem[]>(INITIAL_SUMMARY);
  const [employees, setEmployees] = useState(dataService.getEmployees());
  const [saving, setSaving] = useState(false);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    void dataService.refreshGenericData('attendance_timesheet_summary').catch(() => message.error('Không thể tải dữ liệu từ máy chủ.'));
    const list = dataService.getGenericData('attendance_timesheet_summary');
    setData(Array.isArray(list) ? list : []);
    dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    const unsub = dataService.subscribe(() => {
      setEmployees(dataService.getEmployees());
      const updated = dataService.getGenericData('attendance_timesheet_summary');
      setData(Array.isArray(updated) ? updated : []);
      dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<EnterpriseTimesheetSummaryItem | null>(null);

  const totalActual = data.reduce((sum, item) => sum + item.actualDays, 0);
  const totalOT = data.reduce((sum, item) => sum + item.otHoursWeekday + item.otHoursWeekend, 0);

  const handleCreate = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const monthDays = monthDayCount(values.month);
      const employee = employeeAttendanceFields(employees, values.employeeName);
      const standardDays = attendanceNumber(values.standardDays, 'Ngày công chuẩn', 0.5, 31);
      const actualDays = attendanceNumber(values.actualDays, 'Công thực tế', 0, 31);
      const paidLeaveDays = attendanceNumber(values.paidLeaveDays ?? 0, 'Phép hưởng lương', 0, 31);
      const unpaidLeaveDays = attendanceNumber(values.unpaidLeaveDays ?? 0, 'Nghỉ không lương', 0, 31);
      if (standardDays > monthDays) throw new Error(`Ngày công chuẩn không được vượt quá ${monthDays} ngày của tháng.`);
      if (actualDays + paidLeaveDays + unpaidLeaveDays > monthDays) throw new Error(`Tổng ngày công và nghỉ không được vượt quá ${monthDays} ngày của tháng.`);
      const existing = data.find((item) => item.employeeCode === employee.employeeCode && item.month === values.month);
      if (existing?.status === 'Đã khóa công') throw new Error('Bảng công đã khóa. Không thể điều chỉnh.');
      const record = { ...values, ...employee, key: existing?.key || crypto.randomUUID(), standardDays, actualDays, paidLeaveDays, unpaidLeaveDays, otHoursWeekday: attendanceNumber(values.otHoursWeekday ?? 0, 'Giờ OT thường', 0, 744), otHoursWeekend: attendanceNumber(values.otHoursWeekend ?? 0, 'Giờ OT cuối tuần', 0, 744), totalPayDays: actualDays + paidLeaveDays, attendanceRate: Math.round((actualDays + paidLeaveDays) / standardDays * 100), status: 'Chờ đối soát' };
      if (existing) await collectionsApi.update('attendance_timesheet_summary', existing.key, record);
      else await collectionsApi.create('attendance_timesheet_summary', record);
      await dataService.refreshGenericData('attendance_timesheet_summary');
      message.success(`Đã lưu dữ liệu công: ${employee.employeeName}`); setModalOpen(false); form.resetFields();
    } catch (error: any) { message.error(error?.response?.data?.message || error.message || 'Không thể lưu bảng công.'); }
    finally { setSaving(false); }
  };

  const handleLock = async (record: EnterpriseTimesheetSummaryItem) => {
    if (saving || record.status === 'Đã khóa công') return;
    setSaving(true);
    try {
      await collectionsApi.update('attendance_timesheet_summary', record.key, { status: 'Đã khóa công' });
      await dataService.refreshGenericData('attendance_timesheet_summary');
      message.success('Đã khóa số liệu công để đối chiếu khi tính lương.'); setDrawerOpen(false);
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể khóa bảng công.'); }
    finally { setSaving(false); }
  };

  const filteredData = data.filter((item) => {
    const matchDept = deptFilter === 'all' || item.department === deptFilter;
    const matchSearch =
      (item.employeeCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.position || '').toLowerCase().includes(searchText.toLowerCase());

    return matchDept && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Họ tên nhân viên',
      key: 'employeeName',
      render: (_: any, record: EnterpriseTimesheetSummaryItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã: <code>{record.employeeCode}</code> · {record.position}
          </div>
        </div>
      ),
    },
    {
      title: 'Khối phòng ban',
      dataIndex: 'department',
      key: 'department',
      width: 200,
      render: (dept: string) => <span style={{ color: '#475569', fontSize: 12.5 }}>{dept}</span>,
    },
    {
      title: 'Công chuẩn / Thực tế',
      key: 'days',
      width: 170,
      render: (_: any, record: EnterpriseTimesheetSummaryItem) => (
        <div>
          <div>Chuẩn: <strong>{record.standardDays}</strong> ngày</div>
          <div style={{ color: '#16A34A', fontWeight: 700 }}>Thực tế: {record.actualDays} ngày</div>
        </div>
      ),
    },
    {
      title: 'Nghỉ phép / Không lương',
      key: 'leaves',
      width: 170,
      render: (_: any, record: EnterpriseTimesheetSummaryItem) => (
        <div style={{ fontSize: 12 }}>
          <span style={{ color: '#D97706', fontWeight: 600 }}>{record.paidLeaveDays} Phép năm</span>
          {record.unpaidLeaveDays > 0 && (
            <div style={{ color: '#DC2626' }}>{record.unpaidLeaveDays} Không lương</div>
          )}
        </div>
      ),
    },
    {
      title: 'Giờ làm thêm OT',
      key: 'ot',
      width: 180,
      render: (_: any, record: EnterpriseTimesheetSummaryItem) => (
        <div>
          <span style={{ color: '#2563EB', fontWeight: 700 }}>{record.otHoursWeekday}h ngày thường</span>
          <div style={{ color: '#D97706', fontSize: 11.5 }}>{record.otHoursWeekend}h cuối tuần</div>
        </div>
      ),
    },
    {
      title: 'Tổng công tính lương',
      dataIndex: 'totalPayDays',
      key: 'totalPayDays',
      width: 160,
      render: (d: number, record: EnterpriseTimesheetSummaryItem) => (
        <div>
          <div style={{ fontWeight: 800, color: '#009688', fontSize: 14 }}>
            {d} / {record.standardDays} Công
          </div>
          <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>
            {record.attendanceRate}% Chuyên cần
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (st: string) => <Tag color={st === 'Đã khóa công' ? 'success' : 'warning'}>{st}</Tag>,
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseTimesheetSummaryItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedSummary(record);
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng ngày công thực tế toàn công ty</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalActual} Ngày công
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Tổng hợp từ bảng công từng nhân viên</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giờ làm thêm tăng ca (OT)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalOT} Giờ OT
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Giờ làm thêm đã ghi nhận trong các bảng công</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ chuyên cần bình quân</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {data.length ? Math.round(data.reduce((sum, item) => sum + item.attendanceRate, 0) / data.length) : 0}%
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tỷ lệ dựa trên ngày công hưởng lương so với ngày công chuẩn</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chuyển tiếp sang Tính Lương</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {data.filter((item) => item.status === 'Đã khóa công').length} / {data.length} Đã khóa
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Các bảng công đã khóa để đối chiếu khi tính lương</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phòng ban' },
            ...departmentOptions.map((d) => ({ key: d.value, label: d.label })),
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setDeptFilter(tab.key)}
              style={{
                backgroundColor: deptFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: deptFilter === tab.key ? '#009688' : '#CBD5E1',
                color: deptFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: deptFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã NV, họ tên..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />

          <TimesheetBoardDialog summary />
          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('Tong_hop_cong.xlsx', generateValidXlsxBlob([['Tháng', 'Mã NV', 'Nhân viên', 'Phòng ban', 'Công chuẩn', 'Công thực tế', 'Phép hưởng lương', 'Không lương', 'OT thường', 'OT cuối tuần', 'Ngày tính lương', 'Trạng thái'], ...filteredData.map((item) => [item.month || '', item.employeeCode, item.employeeName, item.department, item.standardDays, item.actualDays, item.paidLeaveDays, item.unpaidLeaveDays, item.otHoursWeekday, item.otHoursWeekend, item.totalPayDays, item.status])]))}>
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                month: attendanceDate().slice(0, 7),
                standardDays: 22,
                actualDays: 0,
                paidLeaveDays: 0,
                unpaidLeaveDays: 0,
                otHoursWeekday: 0,
                otHoursWeekend: 0,
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Điều chỉnh ngày công
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Điều Chỉnh Ngày Công */}
      <Modal
        title="Thêm Hoặc Điều Chỉnh Ngày Công &amp; Giờ Tăng Ca"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeCode" label="Mã nhân viên" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban trực thuộc" >
              <Select
                placeholder="Chọn phòng ban trực thuộc..."
                options={Array.from(new Set([...departmentOptions.map((item) => item.value), ...employees.map((item) => item.department)].filter(Boolean))).map((value) => ({ label: value, value }))}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Họ tên nhân viên" rules={[{ required: true }]}>
              <Select placeholder="Chọn nhân viên" options={employees.filter((employee) => employee.status !== 'Đã nghỉ việc').map((employee) => ({ label: `${employee.name} (${employee.code})`, value: employee.key }))} onChange={(key) => { const employee = employees.find((item) => item.key === key); if (employee) form.setFieldsValue({ employeeCode: employee.code, department: employee.department, position: employee.position }); }} />
            </Form.Item>
            <Form.Item name="position" label="Vị trí / Chức vụ">
              <Input placeholder="Ví dụ: Senior Security Engineer" />
            </Form.Item>
          </div>

          <Form.Item name="month" label="Tháng chấm công" rules={[{ required: true }]}><Input type="month" /></Form.Item>
          <Form.Item name="standardDays" label="Ngày công chuẩn" rules={[{ required: true }]}><Input type="number" min={0.5} max={31} step={0.5} /></Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="actualDays" label="Công thực tế" rules={[{ required: true }]}>
              <Input type="number" min={0} max={31} />
            </Form.Item>
            <Form.Item name="paidLeaveDays" label="Phép hưởng lương">
              <Input type="number" min={0} max={10} />
            </Form.Item>
            <Form.Item name="unpaidLeaveDays" label="Nghỉ không lương">
              <Input type="number" min={0} max={10} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="otHoursWeekday" label="Giờ OT ngày thường">
              <Input type="number" step={0.5} />
            </Form.Item>
            <Form.Item name="otHoursWeekend" label="Giờ OT cuối tuần">
              <Input type="number" step={0.5} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu &amp; Cập nhật ngày công
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Cấu Thành Công & Chuyển Tính Lương */}
      <Drawer
        title="Chi Tiết Bảng Công Tổng Hợp &amp; Cấu Thành Lương"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedSummary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedSummary.employeeCode}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedSummary.employeeName}
                  </div>
                </div>
                <Tag color={selectedSummary.status === 'Đã khóa công' ? 'success' : 'warning'}>{selectedSummary.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedSummary.position} · {selectedSummary.department}
              </div>
            </div>

            {/* Workday Breakdown */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Cấu Thành Ngày Công Tính Lương:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số ngày công chuẩn của tháng:</span>
                  <strong>{selectedSummary.standardDays} Ngày</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số ngày công đi làm thực tế:</span>
                  <strong style={{ color: '#16A34A' }}>{selectedSummary.actualDays} Ngày</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Nghỉ phép hưởng 100% lương:</span>
                  <strong style={{ color: '#D97706' }}>{selectedSummary.paidLeaveDays} Ngày</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Nghỉ không lương:</span>
                  <span style={{ color: '#DC2626' }}>{selectedSummary.unpaidLeaveDays} Ngày</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
                  <span style={{ color: '#0F172A', fontWeight: 700 }}>Tổng công thanh toán lương:</span>
                  <strong style={{ color: '#009688', fontSize: 14 }}>{selectedSummary.totalPayDays} / {selectedSummary.standardDays} Công</strong>
                </div>
              </div>
            </div>

            {/* OT Breakdown */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#EFF6FF' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 8 }}>
                Tổng Hợp Giờ Làm Thêm Ngoài Giờ (OT):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>OT Ngày thường:</span>
                  <strong>{selectedSummary.otHoursWeekday} Giờ</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>OT Cuối tuần:</span>
                  <strong>{selectedSummary.otHoursWeekend} Giờ</strong>
                </div>
              </div>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              onClick={() => handleLock(selectedSummary)}
              disabled={selectedSummary.status === 'Đã khóa công'}
              loading={saving}
            >
              Khóa Số Liệu &amp; Chuẩn Bị Bảng Lương
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

