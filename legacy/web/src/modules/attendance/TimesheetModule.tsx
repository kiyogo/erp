import React, { useState, useEffect } from 'react';
import {
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  ThunderboltOutlined,
  FilterOutlined,
} from '@ant-design/icons';
import { Button, Input, Select, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';
import { dataService, Employee } from '../../services/dataService';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { attendanceDate, attendanceDaySummary, monthDayCount } from './attendanceRules';

export const TimesheetModule: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([
    { label: 'Tất cả phòng ban', value: 'all' },
  ]);
  const [searchText, setSearchText] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(attendanceDate().slice(0, 7));
  const [timesheets, setTimesheets] = useState<any[]>([]);
  const [rawLogs, setRawLogs] = useState<any[]>([]);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [overtime, setOvertime] = useState<any[]>([]);
  const [selectedDept, setSelectedDept] = useState('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<{ emp: Employee; totalWorkDays: number } | null>(null);

  useEffect(() => {
    const load = () => {
      setEmployees(dataService.getEmployees());
      setTimesheets(dataService.getGenericData('employee_timesheets'));
      setRawLogs(dataService.getGenericData('attendance_raw_data'));
      setLeaves(dataService.getLeaveRequests());
      setOvertime(dataService.getGenericData('attendance_overtime'));
    };
    load();
    const unsubscribe = dataService.subscribe(load);
    Promise.all(['employee_timesheets', 'attendance_raw_data', 'leave_requests', 'attendance_overtime'].map((scope) => dataService.refreshGenericData(scope))).catch(() => message.error('Không thể tải đầy đủ dữ liệu bảng chấm công.'));
    dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions([{ label: 'Tất cả phòng ban', value: 'all' }, ...units.map((unit) => ({ label: unit, value: unit }))]));
    return unsubscribe;
  }, []);

  const daysInMonth = Array.from({ length: monthDayCount(selectedMonth) }, (_, index) => index + 1);
  const getAttendanceStatus = (day: number, employee: Employee) => attendanceDaySummary(employee, `${selectedMonth}-${String(day).padStart(2, '0')}`, timesheets, rawLogs, leaves, overtime);
  const recordedDays = employees.reduce((sum, employee) => sum + daysInMonth.reduce((days, day) => days + getAttendanceStatus(day, employee).days, 0), 0);
  const approvedLeaves = leaves.filter((item) => item.status === 'Đã duyệt' && (item.startDate || item.fromDate) <= `${selectedMonth}-${daysInMonth.length}` && (item.endDate || item.toDate) >= `${selectedMonth}-01`);
  const totalOtHours = overtime.filter((item) => ['Đã duyệt OT', 'Đã duyệt'].includes(item.status) && (item.otDate || item.date || '').startsWith(selectedMonth)).reduce((sum, item) => sum + Number(item.totalHours ?? item.hours ?? 0), 0);
  const employeeOtHours = (employee: Employee) => daysInMonth.reduce((sum, day) => sum + getAttendanceStatus(day, employee).otHours, 0);
  const recentLogs = (employee: Employee) => timesheets.filter((item) => (item.employeeId === employee.key || item.empCode === employee.code || item.employeeCode === employee.code) && (item.date || '').startsWith(selectedMonth)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).map((item) => ({ date: item.date, in: item.checkIn || '—', out: item.checkOut || '—', st: item.status || 'Đã ghi nhận' }));

  const filteredEmployees = employees.filter((e) => {
    const matchDept = selectedDept === 'all' || e.department === selectedDept;
    const matchSearch =
      (e.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (e.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (e.department || '').toLowerCase().includes(searchText.toLowerCase());

    return matchDept && matchSearch;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Số ngày trong tháng {selectedMonth}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {daysInMonth.length} Ngày
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Số ngày lịch thực tế của tháng được chọn</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Số ngày có đủ cặp điểm danh</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {recordedDays} Ngày
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Theo dữ liệu của {employees.length} nhân viên</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Lượt nghỉ phép hưởng lương</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {approvedLeaves.length} Lượt phép
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>100% có đơn xin nghỉ phê duyệt hợp lệ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giờ làm thêm dự án (OT)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalOtHours} Giờ OT
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Quy đổi hệ số x1.5 ngày thường, x2.0 cuối tuần</div>
        </div>
      </div>

      {/* Unified Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên nhân viên, mã NV..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 240 }}
            allowClear
          />
          <Select
            value={selectedMonth}
            onChange={(value) => { setSelectedMonth(value); setDrawerOpen(false); }}
            style={{ width: 150 }}
            options={Array.from({ length: 24 }, (_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - index); const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; return { label: `Tháng ${month.slice(5)}/${month.slice(0, 4)}`, value: month }; })}
          />
          <Select
            value={selectedDept}
            onChange={setSelectedDept}
            style={{ width: 220 }}
            options={departmentOptions}
          />
        </div>

        <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 12, color: '#334155' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 12, background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: 2 }} /> CC
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 12, background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 2 }} /> P
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 12, background: '#FFEDD5', border: '1px solid #FED7AA', borderRadius: 2 }} /> M
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 12, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 2 }} /> OT
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 12, background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 2 }} /> —
            </span>
          </div>

          <Button icon={<DownloadOutlined />} onClick={() => downloadFile(`Bang_cham_cong_${selectedMonth}.xlsx`, generateValidXlsxBlob([['Mã NV', 'Nhân viên', 'Phòng ban', ...daysInMonth.map((day) => `${selectedMonth}-${String(day).padStart(2, '0')}`), 'Ngày có cặp điểm danh', 'OT duyệt'], ...filteredEmployees.map((employee) => [employee.code, employee.name, employee.department, ...daysInMonth.map((day) => getAttendanceStatus(day, employee).code), daysInMonth.reduce((sum, day) => sum + getAttendanceStatus(day, employee).days, 0), employeeOtHours(employee)])]))}>
            Xuất Excel
          </Button>
        </div>
      </div>

      {/* 31-Day Matrix Table */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 8,
          overflowX: 'auto',
          boxShadow: 'none',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#F8FAFC' }}>
              <th style={{ padding: '12px 14px', textAlign: 'left', minWidth: 170, position: 'sticky', left: 0, background: '#F8FAFC', zIndex: 2, borderBottom: '1px solid #E2E8F0', color: '#0F172A', fontWeight: 700 }}>
                Họ tên &amp; Mã nhân sự
              </th>
              <th style={{ padding: '12px 10px', textAlign: 'left', minWidth: 140, borderBottom: '1px solid #E2E8F0', color: '#0F172A', fontWeight: 700 }}>
                Khối phòng ban
              </th>
              {daysInMonth.map((d) => (
                <th key={d} style={{ padding: '8px 4px', textAlign: 'center', minWidth: 28, borderLeft: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', color: '#475569', fontWeight: 600 }}>
                  {d}
                </th>
              ))}
              <th style={{ padding: '12px 10px', textAlign: 'center', minWidth: 90, borderLeft: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', fontWeight: 800, color: '#009688' }}>
                Ngày có dữ liệu
              </th>
              <th style={{ padding: '12px 8px', textAlign: 'center', minWidth: 70, borderLeft: '1px solid #E2E8F0', borderBottom: '1px solid #E2E8F0', fontWeight: 700, color: '#64748B' }}>
                Chi tiết
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredEmployees.map((emp, empIdx) => {
              let totalWorkDays = 0;
              const isLastRow = empIdx === filteredEmployees.length - 1;
              const cellBorderBottom = isLastRow ? 'none' : '1px solid #F1F5F9';

              return (
                <tr key={emp.key || emp.code || empIdx} style={{ transition: 'background 0.2s' }}>
                  <td style={{ padding: '10px 14px', position: 'sticky', left: 0, background: '#FFFFFF', zIndex: 1, borderBottom: cellBorderBottom }}>
                    <div style={{ fontWeight: 700, color: '#0F172A' }}>{emp.name}</div>
                    <div style={{ fontSize: 11, color: '#009688', fontWeight: 600 }}>Mã: {emp.code}</div>
                  </td>
                  <td style={{ padding: '10px 10px', color: '#64748B', borderBottom: cellBorderBottom }}>
                    {emp.department}
                  </td>
                  {daysInMonth.map((d) => {
                    const st = getAttendanceStatus(d, emp);
                    totalWorkDays += st.days;

                    return (
                      <td
                        key={d}
                        style={{
                          padding: '6px 2px',
                          textAlign: 'center',
                          borderLeft: '1px solid #F1F5F9',
                          borderBottom: cellBorderBottom,
                          background: st.bg,
                          color: st.color,
                          fontWeight: 700,
                          fontSize: 11,
                        }}
                        title={`Ngày ${d}: ${st.label}`}
                      >
                        {st.code}
                      </td>
                    );
                  })}
                  <td
                    style={{
                      padding: '10px 10px',
                      textAlign: 'center',
                      borderLeft: '1px solid #E2E8F0',
                      borderBottom: cellBorderBottom,
                      fontWeight: 800,
                      color: '#009688',
                      fontSize: 13,
                    }}
                  >
                    {totalWorkDays}
                  </td>
                  <td
                    style={{
                      padding: '8px 8px',
                      textAlign: 'center',
                      borderLeft: '1px solid #E2E8F0',
                      borderBottom: cellBorderBottom,
                    }}
                  >
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => {
                        setSelectedEmp({ emp, totalWorkDays });
                        setDrawerOpen(true);
                      }}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* DRAWER: Chi Tiết Công Cá Nhân 31 Ngày */}
      <Drawer
        title={`Bảng Chấm Công Chi Tiết & Lịch Sử Điểm Danh Tháng ${selectedMonth}`}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedEmp && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedEmp.emp.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedEmp.emp.name}
                  </div>
                </div>
                <Tag color="default">Dữ liệu đã ghi nhận</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedEmp.emp.position} · {selectedEmp.emp.department}
              </div>
            </div>

            {/* Summary Statistics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '12px 14px' }}>
                <div style={{ fontSize: 11.5, color: '#166534' }}>Ngày có đủ cặp điểm danh:</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                  {selectedEmp.totalWorkDays} Ngày
                </div>
              </div>
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '12px 14px' }}>
                <div style={{ fontSize: 11.5, color: '#1E40AF' }}>Giờ làm thêm OT tháng:</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', marginTop: 2 }}>
                  {employeeOtHours(selectedEmp.emp)} Giờ OT đã duyệt
                </div>
              </div>
            </div>

            {/* Key checkin log snapshot */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Nhật Ký Điểm Danh Đã Lưu:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                {recentLogs(selectedEmp.emp).map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #F1F5F9' }}>
                    <span><strong>{item.date}</strong>: {item.in} ➔ {item.out}</span>
                    <span style={{ color: '#009688', fontWeight: 600 }}>{item.st}</span>
                  </div>
                ))}
              </div>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              onClick={() => {
                downloadFile(`Cham_cong_${selectedEmp.emp.code}_${selectedMonth}.pdf`, generateValidPdfBlob('Bảng chấm công cá nhân', `${selectedEmp.emp.name} - ${selectedMonth}`, daysInMonth.map((day) => `${String(day).padStart(2, '0')}: ${getAttendanceStatus(day, selectedEmp.emp).label}`)));
              }}
            >
              Xuất Phiếu Chấm Công Cá Nhân (PDF)
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

