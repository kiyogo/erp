import React, { useState, useEffect, useMemo } from 'react';
import {
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  EditOutlined,
  ClockCircleOutlined,
  CalendarOutlined,
  TeamOutlined,
  ApartmentOutlined,
  CheckCircleOutlined,
  FilterOutlined,
  SwapOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import {
  Modal,
  Form,
  Input,
  Select,
  Button,
  message,
  Tag,
  DatePicker,
} from '../../custom-ui';
import { collectionsApi, EnterpriseEmployee } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { generateValidXlsxBlob, downloadFile } from '../../utils/fileExporter';

const DEFAULT_COMPANY = 'CÔNG TY TNHH XÂY DỰNG KINH SỞ';

// 31 days in October 2026: Day 1 (Thu / T5) to Day 31 (Sat / T7)
const OCT_2026_DAYS = Array.from({ length: 31 }, (_, i) => {
  const day = i + 1;
  // 2026-10-01 is Thursday (4 in 0-indexed Sun=0, Mon=1... Thu=4, Fri=5, Sat=6, Sun=0)
  const dateObj = new Date(2026, 9, day);
  const dow = dateObj.getDay(); // 0: CN, 1: T2, 2: T3, 3: T4, 4: T5, 5: T6, 6: T7
  const weekdayLabel = dow === 0 ? 'CN' : `T${dow + 1}`;
  const isWeekend = dow === 0 || dow === 6;
  return {
    day,
    weekdayLabel,
    isWeekend,
    dateStr: `${String(day).padStart(2, '0')}/10/2026`,
  };
});

interface EmployeeShiftRoster {
  empCode: string;
  name: string;
  department: string;
  position: string;
  totalWorkUnits: number;
  // Day 1 to 31 shift codes: e.g. 'HC', 'SANG', 'CHIEU', 'DEM', 'OFF'
  dailyShifts: Record<number, string>;
}

export const ShiftSummaryModule: React.FC = () => {
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [orgUnits, setOrgUnits] = useState<string[]>([DEFAULT_COMPANY]);
  const [rosters, setRosters] = useState<EmployeeShiftRoster[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('10/2026');
  const [orgFilter, setOrgFilter] = useState<string>(DEFAULT_COMPANY);
  const [shiftFilter, setShiftFilter] = useState('all');
  const [deptFilter, setDeptFilter] = useState('all');

  // Quick Shift Assign Modal
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedCell, setSelectedCell] = useState<{ empCode: string; empName: string; day: number; currentShift: string } | null>(null);
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkForm] = Form.useForm();

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      // 1. Load Org Units
      const fetchedUnits = await dataService.fetchOrgUnitsList().catch(() => []);
      const mergedUnits = Array.from(new Set([DEFAULT_COMPANY, ...fetchedUnits]));
      setOrgUnits(mergedUnits);

      // 2. Load Employees
      const empList = dataService.getEmployees().filter((item: any) => {
        const isSuper = item?.role === 'ADMIN' || item?.code === 'ADMIN-001';
        return !isSuper;
      });
      setEmployees(empList);

      // 3. Load or generate roster matrix for October 2026
      const savedMatrix = await collectionsApi.get<any>('attendance_shift_rosters_202610').catch(() => ({ data: { data: [] } }));
      const rows = savedMatrix.data?.data || [];

      if (Array.isArray(rows) && rows.length > 0) {
        setRosters(rows);
      } else {
        // Generate initial realistic roster based on employee list
        const initialRosters: EmployeeShiftRoster[] = empList.map((emp, index) => {
          const daily: Record<number, string> = {};
          let workUnits = 0;

          OCT_2026_DAYS.forEach((d) => {
            if (d.isWeekend) {
              // T7 may work morning for construction, CN is OFF
              if (d.weekdayLabel === 'T7' && index % 2 === 0) {
                daily[d.day] = 'HC';
                workUnits += 1;
              } else {
                daily[d.day] = 'OFF';
              }
            } else {
              // Weekdays: default to HC, some night / shifts
              if (index === 1 && d.day % 3 === 0) {
                daily[d.day] = 'SANG';
              } else if (index === 2 && d.day % 4 === 0) {
                daily[d.day] = 'CHIEU';
              } else {
                daily[d.day] = 'HC';
              }
              workUnits += 1;
            }
          });

          return {
            empCode: emp.code || emp.employeeCode || `NV${String(index + 1).padStart(6, '0')}`,
            name: emp.name || emp.fullName || 'Nhân sự',
            department: Array.isArray(emp.department) ? emp.department.join(', ') : (emp.department || 'Ban Giám Đốc'),
            position: Array.isArray(emp.position) ? emp.position.join(', ') : (emp.position || 'Cán bộ'),
            totalWorkUnits: workUnits,
            dailyShifts: daily,
          };
        });

        setRosters(initialRosters);
      }
    } catch {
      // fallback
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
    const unsub = dataService.subscribe(() => {
      setEmployees(dataService.getEmployees());
    });
    return unsub;
  }, []);

  // Filtered Rosters
  const filteredRosters = useMemo(() => {
    return rosters.filter((item) => {
      const matchDept = deptFilter === 'all' || item.department.includes(deptFilter);
      const s = searchText.toLowerCase().trim();
      const matchSearch =
        !s ||
        item.name.toLowerCase().includes(s) ||
        item.empCode.toLowerCase().includes(s) ||
        item.department.toLowerCase().includes(s) ||
        item.position.toLowerCase().includes(s);

      return matchDept && matchSearch;
    });
  }, [rosters, deptFilter, searchText]);

  // Summary Metrics
  const totalEmployeesInRoster = filteredRosters.length;
  const totalStandardWorkUnits = useMemo(() => {
    return filteredRosters.reduce((acc, cur) => acc + (cur.totalWorkUnits || 0), 0);
  }, [filteredRosters]);

  const totalAdminShifts = useMemo(() => {
    let count = 0;
    filteredRosters.forEach((r) => {
      Object.values(r.dailyShifts).forEach((s) => {
        if (s === 'HC') count += 1;
      });
    });
    return count;
  }, [filteredRosters]);

  const totalSpecialShifts = useMemo(() => {
    let count = 0;
    filteredRosters.forEach((r) => {
      Object.values(r.dailyShifts).forEach((s) => {
        if (s === 'SANG' || s === 'CHIEU' || s === 'DEM') count += 1;
      });
    });
    return count;
  }, [filteredRosters]);

  // Handle Quick Change Cell
  const handleCellClick = (empCode: string, empName: string, day: number, currentShift: string) => {
    setSelectedCell({ empCode, empName, day, currentShift });
    setAssignModalOpen(true);
  };

  const handleUpdateSingleShift = async (newShift: string) => {
    if (!selectedCell) return;
    const { empCode, day } = selectedCell;

    setRosters((prev) =>
      prev.map((r) => {
        if (r.empCode !== empCode) return r;
        const updatedDaily = { ...r.dailyShifts, [day]: newShift };
        // Recalculate work units (OFF is 0, others 1)
        const newUnits = Object.values(updatedDaily).filter((s) => s !== 'OFF').length;
        return {
          ...r,
          dailyShifts: updatedDaily,
          totalWorkUnits: newUnits,
        };
      })
    );

    setAssignModalOpen(false);
    message.success(`Đã cập nhật ca ngày ${day}/10 cho nhân sự ${selectedCell.empName}`);

    // Persist async
    try {
      const targetRoster = rosters.find((r) => r.empCode === empCode);
      if (targetRoster) {
        await collectionsApi.create('attendance_shift_rosters_202610', {
          ...targetRoster,
          dailyShifts: { ...targetRoster.dailyShifts, [day]: newShift },
        }).catch(() => {});
      }
    } catch {
      // ignore
    }
  };

  // Handle Bulk Assign
  const handleBulkAssign = async (values: any) => {
    const shift = values.shift;
    const fromDay = parseInt(values.fromDay, 10) || 1;
    const toDay = parseInt(values.toDay, 10) || 31;
    const selectedEmpCodes: string[] = values.employees || [];

    setRosters((prev) =>
      prev.map((r) => {
        if (selectedEmpCodes.length > 0 && !selectedEmpCodes.includes(r.empCode)) {
          return r;
        }
        const updatedDaily = { ...r.dailyShifts };
        for (let d = fromDay; d <= toDay; d++) {
          if (!values.applyWeekend && (OCT_2026_DAYS[d - 1]?.isWeekend)) {
            continue;
          }
          updatedDaily[d] = shift;
        }
        const newUnits = Object.values(updatedDaily).filter((s) => s !== 'OFF').length;
        return {
          ...r,
          dailyShifts: updatedDaily,
          totalWorkUnits: newUnits,
        };
      })
    );

    setBulkModalOpen(false);
    bulkForm.resetFields();
    message.success(`Đã phân ca hàng loạt (${shift}) từ ngày ${fromDay} đến ${toDay}/10 thành công!`);
  };

  const handleExportExcel = () => {
    try {
      const header = [
        'Mã nhân viên',
        'Họ và tên',
        'Phòng ban',
        'Chức vụ',
        'Tổng công',
        ...OCT_2026_DAYS.map((d) => `${d.day}/10 (${d.weekdayLabel})`),
      ];
      const rows = filteredRosters.map((r) => [
        r.empCode,
        r.name,
        r.department,
        r.position,
        r.totalWorkUnits,
        ...OCT_2026_DAYS.map((d) => r.dailyShifts[d.day] || 'OFF'),
      ]);
      const blob = generateValidXlsxBlob([header, ...rows]);
      downloadFile(`bang_phan_ca_tong_hop_${selectedMonth.replace('/', '_')}.xlsx`, blob);
      message.success('Đã xuất bảng phân ca tổng hợp ra file Excel.');
    } catch {
      message.error('Không thể xuất file Excel.');
    }
  };

  const renderShiftBadge = (shift: string) => {
    switch (shift) {
      case 'HC':
        return (
          <span
            style={{
              padding: '2px 5px',
              borderRadius: 3,
              background: '#E0F2F1',
              color: '#00796B',
              fontSize: 10.5,
              fontWeight: 700,
            }}
          >
            HC
          </span>
        );
      case 'SANG':
        return (
          <span
            style={{
              padding: '2px 5px',
              borderRadius: 3,
              background: '#DBEAFE',
              color: '#1D4ED8',
              fontSize: 10.5,
              fontWeight: 700,
            }}
          >
            S
          </span>
        );
      case 'CHIEU':
        return (
          <span
            style={{
              padding: '2px 5px',
              borderRadius: 3,
              background: '#F3E8FF',
              color: '#7E22CE',
              fontSize: 10.5,
              fontWeight: 700,
            }}
          >
            C
          </span>
        );
      case 'DEM':
        return (
          <span
            style={{
              padding: '2px 5px',
              borderRadius: 3,
              background: '#FEF3C7',
              color: '#B45309',
              fontSize: 10.5,
              fontWeight: 700,
            }}
          >
            Đ
          </span>
        );
      case 'OFF':
      default:
        return (
          <span
            style={{
              color: '#CBD5E1',
              fontSize: 10.5,
              fontWeight: 500,
            }}
          >
            -
          </span>
        );
    }
  };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nhân sự lên ca</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalEmployeesInRoster} Nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Tháng 10/2026 toàn công ty</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng công phân ca dự kiến</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalStandardWorkUnits} Công chuẩn
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tính toán tự động theo ngày công</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Ca hành chính phân bổ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalAdminShifts} Lượt ca
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>08:00 - 17:30 (Thứ 2 đến Thứ 6)</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Ca kíp và làm thêm</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {totalSpecialShifts} Lượt ca
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Ca sáng, ca chiều và trực đêm</div>
        </div>
      </div>

      {/* Filter and Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả nhân sự' },
            { key: 'Ban Giám Đốc', label: 'Ban Giám Đốc' },
            { key: 'Phòng Kỹ Thuật', label: 'Phòng Kỹ Thuật' },
            { key: 'Phòng Kinh Doanh', label: 'Phòng Kinh Doanh' },
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
                height: 32,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Select
            value={selectedMonth}
            onChange={setSelectedMonth}
            style={{ width: 120, height: 32 }}
            options={[
              { label: '10/2026', value: '10/2026' },
              { label: '11/2026', value: '11/2026' },
              { label: '09/2026', value: '09/2026' },
            ]}
          />

          <Select
            value={orgFilter}
            onChange={setOrgFilter}
            style={{ width: 230, height: 32 }}
            options={orgUnits.map((u) => ({ label: u, value: u }))}
          />

          <Input
            placeholder="Tìm kiếm nhân sự, mã nhân viên..."
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 220, height: 32 }}
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
            icon={<SwapOutlined />}
            onClick={() => setBulkModalOpen(true)}
            style={{ backgroundColor: '#009688', borderColor: '#009688', height: 32 }}
          >
            Phân ca nhanh
          </Button>
        </div>
      </div>

      {/* MATRIX TABLE: LƯỚI PHÂN CA TỔNG HỢP 31 NGÀY */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 8,
          overflowX: 'auto',
          width: '100%',
        }}
      >
        <table
          style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: 12,
            minWidth: 1400,
          }}
        >
          <thead>
            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0' }}>
              <th
                style={{
                  position: 'sticky',
                  left: 0,
                  background: '#F8FAFC',
                  zIndex: 2,
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontWeight: 700,
                  color: '#334155',
                  width: 220,
                  minWidth: 220,
                  borderRight: '1px solid #E2E8F0',
                }}
              >
                Nhân sự / Vị trí
              </th>
              <th
                style={{
                  position: 'sticky',
                  left: 220,
                  background: '#F8FAFC',
                  zIndex: 2,
                  padding: '10px 8px',
                  textAlign: 'center',
                  fontWeight: 700,
                  color: '#009688',
                  width: 65,
                  minWidth: 65,
                  borderRight: '2px solid #CBD5E1',
                }}
              >
                Tổng công
              </th>

              {/* 31 Ngày trong tháng 10 */}
              {OCT_2026_DAYS.map((d) => (
                <th
                  key={d.day}
                  style={{
                    padding: '8px 2px',
                    textAlign: 'center',
                    borderRight: '1px solid #F1F5F9',
                    background: d.isWeekend ? '#FEF2F2' : '#F8FAFC',
                    minWidth: 34,
                    width: 34,
                  }}
                >
                  <div style={{ fontSize: 10, color: d.isWeekend ? '#EF4444' : '#64748B', fontWeight: 600 }}>
                    {d.weekdayLabel}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: d.isWeekend ? '#DC2626' : '#1E293B', marginTop: 1 }}>
                    {d.day}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredRosters.map((roster, idx) => {
              const rowBg = idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA';
              return (
                <tr
                  key={roster.empCode}
                  style={{
                    backgroundColor: rowBg,
                    borderBottom: '1px solid #F1F5F9',
                    transition: 'background-color 0.15s',
                  }}
                >
                  {/* Sticky Col 1: Nhân sự */}
                  <td
                    style={{
                      position: 'sticky',
                      left: 0,
                      backgroundColor: rowBg,
                      zIndex: 1,
                      padding: '8px 12px',
                      borderRight: '1px solid #E2E8F0',
                    }}
                  >
                    <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>
                      {roster.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>
                      <code>{roster.empCode}</code> · {roster.department}
                    </div>
                  </td>

                  {/* Sticky Col 2: Tổng công */}
                  <td
                    style={{
                      position: 'sticky',
                      left: 220,
                      backgroundColor: rowBg,
                      zIndex: 1,
                      padding: '8px 4px',
                      textAlign: 'center',
                      fontWeight: 800,
                      color: '#16A34A',
                      fontSize: 13,
                      borderRight: '2px solid #CBD5E1',
                    }}
                  >
                    {roster.totalWorkUnits}
                  </td>

                  {/* 31 Ô Phân ca ngày */}
                  {OCT_2026_DAYS.map((d) => {
                    const shiftCode = roster.dailyShifts[d.day] || 'OFF';
                    return (
                      <td
                        key={d.day}
                        onClick={() => handleCellClick(roster.empCode, roster.name, d.day, shiftCode)}
                        title={`Click để đổi ca cho ${roster.name} ngày ${d.day}/10/2026`}
                        style={{
                          textAlign: 'center',
                          padding: '6px 2px',
                          borderRight: '1px solid #F1F5F9',
                          background: d.isWeekend ? (shiftCode === 'OFF' ? '#FEF2F2' : rowBg) : rowBg,
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        {renderShiftBadge(shiftCode)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Bảng Chú giải Ký hiệu Phân ca (Legend Footer) */}
      <div
        style={{
          marginTop: 12,
          padding: '10px 14px',
          background: '#FFFFFF',
          border: '1px solid #E2E8F0',
          borderRadius: 6,
          display: 'flex',
          gap: 18,
          alignItems: 'center',
          flexWrap: 'wrap',
          fontSize: 12,
        }}
      >
        <span style={{ fontWeight: 700, color: '#0F172A' }}>Chú giải ký hiệu:</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ padding: '2px 6px', borderRadius: 3, background: '#E0F2F1', color: '#00796B', fontWeight: 700, fontSize: 11 }}>HC</span>
          <span style={{ color: '#475569' }}>Ca hành chính (08:00 - 17:30)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ padding: '2px 6px', borderRadius: 3, background: '#DBEAFE', color: '#1D4ED8', fontWeight: 700, fontSize: 11 }}>S</span>
          <span style={{ color: '#475569' }}>Ca sáng (06:00 - 14:00)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ padding: '2px 6px', borderRadius: 3, background: '#F3E8FF', color: '#7E22CE', fontWeight: 700, fontSize: 11 }}>C</span>
          <span style={{ color: '#475569' }}>Ca chiều (14:00 - 22:00)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ padding: '2px 6px', borderRadius: 3, background: '#FEF3C7', color: '#B45309', fontWeight: 700, fontSize: 11 }}>Đ</span>
          <span style={{ color: '#475569' }}>Ca đêm (22:00 - 06:00)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#94A3B8', fontWeight: 700 }}>-</span>
          <span style={{ color: '#64748B' }}>Nghỉ tuần / Nghỉ lễ</span>
        </div>
      </div>

      {/* MODAL: ĐỔI CA NHANH THEO Ô (CELL QUICK ASSIGN) */}
      <Modal
        title={selectedCell ? `Đổi ca ngày ${selectedCell.day}/10/2026 - ${selectedCell.empName}` : 'Đổi ca'}
        open={assignModalOpen}
        onCancel={() => setAssignModalOpen(false)}
        footer={null}
        width={420}
      >
        {selectedCell && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 13, color: '#475569' }}>
              Chọn ca làm việc áp dụng cho ngày <strong>{selectedCell.day}/10/2026</strong>:
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {[
                { code: 'HC', label: 'Ca hành chính chuẩn (HC)', desc: '08:00 - 17:30 · 1 công', color: '#00796B', bg: '#E0F2F1' },
                { code: 'SANG', label: 'Ca sáng (S)', desc: '06:00 - 14:00 · 1 công', color: '#1D4ED8', bg: '#DBEAFE' },
                { code: 'CHIEU', label: 'Ca chiều (C)', desc: '14:00 - 22:00 · 1 công', color: '#7E22CE', bg: '#F3E8FF' },
                { code: 'DEM', label: 'Ca đêm (Đ)', desc: '22:00 - 06:00 · 1.3 công', color: '#B45309', bg: '#FEF3C7' },
                { code: 'OFF', label: 'Nghỉ ca (OFF)', desc: 'Nghỉ tuần hoặc nghỉ bù', color: '#64748B', bg: '#F1F5F9' },
              ].map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => handleUpdateSingleShift(opt.code)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'flex-start',
                    padding: '10px 12px',
                    borderRadius: 6,
                    border: selectedCell.currentShift === opt.code ? `2px solid ${opt.color}` : '1px solid #E2E8F0',
                    background: selectedCell.currentShift === opt.code ? opt.bg : '#FFFFFF',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: 13, fontWeight: 700, color: opt.color }}>{opt.label}</span>
                  <span style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>{opt.desc}</span>
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <Button onClick={() => setAssignModalOpen(false)} style={{ height: 32 }}>
                Đóng
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: PHÂN CA HÀNG LOẠT (BULK ASSIGN) */}
      <Modal
        title="Phân ca hàng loạt theo khoảng ngày"
        open={bulkModalOpen}
        onCancel={() => setBulkModalOpen(false)}
        footer={null}
        width={520}
      >
        <Form
          form={bulkForm}
          layout="vertical"
          onFinish={handleBulkAssign}
          style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <Form.Item
            name="shift"
            label="Ca làm việc áp dụng"
            initialValue="HC"
            required
            rules={[{ required: true, message: 'Vui lòng chọn ca làm việc' }]}
            style={{ margin: 0 }}
          >
            <Select
              style={{ height: 32 }}
              options={[
                { label: 'Ca hành chính chuẩn (08:00 - 17:30)', value: 'HC' },
                { label: 'Ca sáng sản xuất (06:00 - 14:00)', value: 'SANG' },
                { label: 'Ca chiều sản xuất (14:00 - 22:00)', value: 'CHIEU' },
                { label: 'Ca đêm trực (22:00 - 06:00)', value: 'DEM' },
                { label: 'Nghỉ ca (OFF)', value: 'OFF' },
              ]}
            />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <Form.Item
              name="fromDay"
              label="Từ ngày (tháng 10/2026)"
              initialValue={1}
              required
              style={{ margin: 0 }}
            >
              <Input type="number" min={1} max={31} style={{ height: 32 }} />
            </Form.Item>

            <Form.Item
              name="toDay"
              label="Đến ngày (tháng 10/2026)"
              initialValue={31}
              required
              style={{ margin: 0 }}
            >
              <Input type="number" min={1} max={31} style={{ height: 32 }} />
            </Form.Item>
          </div>

          <Form.Item
            name="employees"
            label="Áp dụng cho nhân sự (để trống để áp dụng toàn bộ)"
            style={{ margin: 0 }}
          >
            <Select
              mode="multiple"
              placeholder="Tất cả nhân sự trong danh sách..."
              style={{ width: '100%' }}
              options={employees.map((e) => ({
                label: `${e.name} (${e.code || e.employeeCode})`,
                value: e.code || e.employeeCode || e.id,
              }))}
            />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 10 }}>
            <Button onClick={() => setBulkModalOpen(false)} style={{ height: 32 }}>
              Hủy
            </Button>
            <Button
              type="primary"
              htmlType="submit"
              style={{ backgroundColor: '#009688', borderColor: '#009688', height: 32 }}
            >
              Áp dụng phân ca
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
