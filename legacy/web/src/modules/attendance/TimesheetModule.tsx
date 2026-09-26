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

export const TimesheetModule: React.FC = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([
    { label: 'Tất cả phòng ban', value: 'all' },
  ]);
  const [searchText, setSearchText] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('08/2026');
  const [selectedDept, setSelectedDept] = useState('all');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedEmp, setSelectedEmp] = useState<{ emp: Employee; totalWorkDays: number } | null>(null);

  useEffect(() => {
    setEmployees(dataService.getEmployees());
    dataService.fetchOrgUnitsList().then((units) => {
      setDepartmentOptions([
        { label: 'Tất cả phòng ban', value: 'all' },
        ...units.map((u) => ({ label: u, value: u })),
      ]);
    });
  }, []);

  // Generate 31 day matrix mock data for each employee
  const daysInMonth = Array.from({ length: 31 }, (_, i) => i + 1);

  const getAttendanceStatus = (day: number, empIndex: number) => {
    // Sunday check
    const isSunday = day % 7 === 2 || day % 7 === 3;
    if (isSunday) return { code: 'CN', label: 'Nghỉ tuần', color: '#64748B', bg: '#F1F5F9' };

    // Occasional late or leave
    if ((day + empIndex) % 19 === 0) return { code: 'P', label: 'Nghỉ phép', color: '#D97706', bg: '#FEF3C7' };
    if ((day + empIndex) % 13 === 0) return { code: 'M', label: 'Đi muộn (<15p)', color: '#EA580C', bg: '#FFEDD5' };
    if ((day + empIndex) % 23 === 0) return { code: 'OT', label: 'Tăng ca OT (+2h)', color: '#2563EB', bg: '#EFF6FF' };
    return { code: '1.0', label: 'Đủ công 8h', color: '#16A34A', bg: '#DCFCE7' };
  };

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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Số ngày công chuẩn Tháng 08/2026</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            22.0 Ngày công
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Trừ 9 ngày nghỉ cuối tuần theo lịch</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ ngày công đạt chuẩn</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            97.8% Hoàn thành
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Toàn bộ 142 cán bộ nhân viên</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Lượt nghỉ phép hưởng lương (P)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            18 Lượt phép
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>100% có đơn xin nghỉ phê duyệt hợp lệ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giờ làm thêm dự án (OT)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            148.5 Giờ OT
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
            onChange={setSelectedMonth}
            style={{ width: 150 }}
            options={[
              { label: 'Tháng 08/2026', value: '08/2026' },
              { label: 'Tháng 07/2026', value: '07/2026' },
              { label: 'Tháng 06/2026', value: '06/2026' },
            ]}
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
              <span style={{ width: 12, height: 12, background: '#DCFCE7', border: '1px solid #86EFAC', borderRadius: 2 }} /> 1.0 (Đủ công)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 12, background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: 2 }} /> P (Nghỉ phép)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 12, background: '#FFEDD5', border: '1px solid #FED7AA', borderRadius: 2 }} /> M (Đi muộn)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 12, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 2 }} /> OT (Làm thêm)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 12, height: 12, background: '#F1F5F9', border: '1px solid #CBD5E1', borderRadius: 2 }} /> CN (Nghỉ tuần)
            </span>
          </div>

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất bảng chấm công chi tiết 31 ngày ra Excel')}>
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
                Tổng công
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
                    const st = getAttendanceStatus(d, empIdx);
                    if (st.code === '1.0') totalWorkDays += 1;
                    if (st.code === 'M') totalWorkDays += 0.95;
                    if (st.code === 'OT') totalWorkDays += 1.25;

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
                    {totalWorkDays.toFixed(1)} / 22
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
        title="Bảng Chấm Công Chi Tiết &amp; Lịch Sử Điểm Danh Tháng 08/2026"
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
                <Tag color="success">Đạt chuẩn chuyên cần</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedEmp.emp.position} · {selectedEmp.emp.department}
              </div>
            </div>

            {/* Summary Statistics */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 6, padding: '12px 14px' }}>
                <div style={{ fontSize: 11.5, color: '#166534' }}>Tổng ngày công thực tế:</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                  {selectedEmp.totalWorkDays.toFixed(1)} / 22 Công
                </div>
              </div>
              <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: 6, padding: '12px 14px' }}>
                <div style={{ fontSize: 11.5, color: '#1E40AF' }}>Giờ làm thêm OT tháng:</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#2563EB', marginTop: 2 }}>
                  8.0 Giờ OT (+x1.5)
                </div>
              </div>
            </div>

            {/* Key checkin log snapshot */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Nhật Ký Quẹt Thẻ Mẫu (7 Ngày Gần Nhất):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
                {[
                  { date: '25/08/2026', in: '07:54 AM', out: '17:35 PM', loc: 'FaceID Cổng Chính Keangnam', st: 'Đủ công 8h' },
                  { date: '24/08/2026', in: '07:58 AM', out: '17:32 PM', loc: 'FaceID Cổng Chính Keangnam', st: 'Đủ công 8h' },
                  { date: '23/08/2026', in: '08:12 AM', out: '18:00 PM', loc: 'GPS Geofence App Mobile', st: 'Muộn 12p (Đã bù giờ)' },
                  { date: '22/08/2026', in: '07:50 AM', out: '20:30 PM', loc: 'FaceID Phòng R&D', st: 'Tăng ca OT (+3h)' },
                  { date: '21/08/2026', in: '07:55 AM', out: '17:30 PM', loc: 'FaceID Cổng Chính Keangnam', st: 'Đủ công 8h' },
                ].map((item, idx) => (
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
                message.success(`Đã xuất phiếu chấm công cá nhân cho ${selectedEmp.emp.name}`);
                setDrawerOpen(false);
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

