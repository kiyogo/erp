import React, { useEffect, useMemo, useState } from 'react';
import {
  ClockCircleOutlined,
  ReloadOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { message, Select } from '../../custom-ui';
import { employeesApi, type EnterpriseEmployee } from '../../api/endpoints';
import { dataService, type LeaveRequest } from '../../services/dataService';
import { attendanceDate } from './attendanceRules';

// ===== Date Helper Utilities =====
const pad2 = (n: number) => String(n).padStart(2, '0');
const formatDMY = (d: Date) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;

function getOverviewDateRanges(referenceDateStr = attendanceDate()) {
  const [yStr, mStr, dStr] = referenceDateStr.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10) - 1; // 0-indexed month
  const d = parseInt(dStr, 10);

  const startOfMonth = new Date(y, m, 1);
  const endOfMonth = new Date(y, m + 1, 0);

  // Subtitle format: (DD/MM/YYYY - DD/MM/YYYY)
  const monthRangeText = `(${formatDMY(startOfMonth)} - ${formatDMY(endOfMonth)})`;

  // Rolling 5-week interval: Monday of the week containing start of month
  const dayOfWeek = (startOfMonth.getDay() + 6) % 7; // Monday = 0, Sunday = 6
  const rollingStart = new Date(y, m, 1 - dayOfWeek);
  const rollingEnd = new Date(rollingStart.getTime() + 34 * 86400000); // 35 days (5 weeks) ending on Sunday
  const rollingWeeksText = `(${formatDMY(rollingStart)} - ${formatDMY(rollingEnd)})`;

  // Tomorrow calculation
  const tomorrowDate = new Date(y, m, d + 1);
  const tomorrowYMD = `${tomorrowDate.getFullYear()}-${pad2(tomorrowDate.getMonth() + 1)}-${pad2(tomorrowDate.getDate())}`;

  // Yesterday calculation
  const yesterdayDate = new Date(y, m, d - 1);
  const yesterdayYMD = `${yesterdayDate.getFullYear()}-${pad2(yesterdayDate.getMonth() + 1)}-${pad2(yesterdayDate.getDate())}`;

  return {
    todayYMD: referenceDateStr,
    tomorrowYMD,
    yesterdayYMD,
    startOfMonthYMD: `${y}-${pad2(m + 1)}-01`,
    endOfMonthYMD: `${y}-${pad2(m + 1)}-${pad2(endOfMonth.getDate())}`,
    monthRangeText,
    rollingWeeksText,
  };
}

// ===== Empty State Component =====
const EmptyIllustration: React.FC = () => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 145, padding: '16px 0' }}>
    <svg width="44" height="48" viewBox="0 0 44 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Parchment background */}
      <rect x="9" y="8" width="22" height="30" rx="1.5" fill="#FFF5ED" stroke="#FDBA74" strokeWidth="1.2" />
      {/* Top curl roll */}
      <path d="M7 8.5C7 6.8 8.4 5.5 10.2 5.5H29.8C31.6 5.5 33 6.8 33 8.5C33 10.2 31.6 11.5 29.8 11.5H10.2C8.4 11.5 7 10.2 7 8.5Z" fill="#FEE4D2" stroke="#FB923C" strokeWidth="1.2" />
      {/* Bottom curl roll */}
      <path d="M7 38.5C7 36.8 8.4 35.5 10.2 35.5H29.8C31.6 35.5 33 36.8 33 38.5C33 40.2 31.6 41.5 29.8 41.5H10.2C8.4 41.5 7 40.2 7 38.5Z" fill="#FEE4D2" stroke="#FB923C" strokeWidth="1.2" />
      {/* Text lines */}
      <line x1="14" y1="18" x2="25" y2="18" stroke="#FDBA74" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="14" y1="23" x2="21" y2="23" stroke="#FDBA74" strokeWidth="1.5" strokeLinecap="round" />
      {/* Magnifier glass */}
      <circle cx="26" cy="28" r="5" fill="#FFFFFF" stroke="#FB923C" strokeWidth="1.5" />
      <path d="M30 32L34 36" stroke="#FB923C" strokeWidth="2" strokeLinecap="round" />
    </svg>
    <div style={{ fontSize: 12, color: '#BFBFBF', marginTop: 10, fontWeight: 400, letterSpacing: '0.2px' }}>
      Không có dữ liệu
    </div>
  </div>
);

// ===== Minimal Inline Dropdown =====
const InlinePeriodSelect: React.FC<{
  value: string;
  options: { label: string; value: string }[];
  onChange: (val: string) => void;
}> = ({ value, options, onChange }) => {
  return (
    <Select
      size="small"
      value={value}
      options={options}
      onChange={onChange}
      style={{ width: 110, fontSize: 12 }}
    />
  );
};

export const AttendanceOverviewModule: React.FC = () => {
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [timesheets, setTimesheets] = useState<any[]>([]);
  const [overtime, setOvertime] = useState<any[]>([]);
  const [rawLogs, setRawLogs] = useState<any[]>([]);
  const [orgUnits, setOrgUnits] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);

  // Period filters for top cards
  const [latePeriod, setLatePeriod] = useState<'today' | 'week' | 'month'>('today');
  const [actualLeavePeriod, setActualLeavePeriod] = useState<'today' | 'week' | 'month'>('today');
  const [plannedLeavePeriod, setPlannedLeavePeriod] = useState<'tomorrow' | 'next_week' | 'next_month'>('tomorrow');

  const dateRanges = useMemo(() => getOverviewDateRanges(), []);

  const loadData = async () => {
    setSyncing(true);
    try {
      const [
        employeeRes,
        leaves,
        ts,
        ot,
        raw,
        units,
      ] = await Promise.all([
        employeesApi.getAll().catch(() => ({ data: { data: [] } })),
        dataService.refreshGenericData('leave_requests').catch(() => []),
        dataService.refreshGenericData('employee_timesheets').catch(() => []),
        dataService.refreshGenericData('attendance_overtime').catch(() => []),
        dataService.refreshGenericData('attendance_raw_data').catch(() => []),
        dataService.refreshGenericData('business_org_units').catch(() => []),
      ]);

      setEmployees(employeeRes?.data?.data || []);
      setLeaveRequests(Array.isArray(leaves) ? leaves : []);
      setTimesheets(Array.isArray(ts) ? ts : []);
      setOvertime(Array.isArray(ot) ? ot : []);
      setRawLogs(Array.isArray(raw) ? raw : []);
      setOrgUnits(Array.isArray(units) ? units : (dataService.getGenericData('business_org_units') || []));
    } catch {
      message.error('Không thể tải tổng quan chấm công.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void loadData();
    const unsub = dataService.subscribe(() => {
      setLeaveRequests(dataService.getLeaveRequests());
      setTimesheets(dataService.getEmployeeTimesheets());
      setOvertime(dataService.getEmployeeOvertime());
      setOrgUnits(dataService.getGenericData('business_org_units') || []);
    });
    return unsub;
  }, []);

  // Organization Unit Display: taken from admin/business/org-units; if none exists, do not display
  const orgUnitName = useMemo(() => {
    const list = Array.isArray(orgUnits) ? orgUnits : [];
    const active = list.filter((u: any) => u && u.status !== 'Tạm ngưng' && u.name);
    if (active.length === 0) return '';
    // Find primary / root org unit
    const root = active.find((u: any) => !u.parentUnit || u.parentUnit === 'root' || u.parentUnit === '-' || u.parentUnit === '');
    return (root?.name || active[0]?.name || '').trim();
  }, [orgUnits]);

  // Subtitle formatters: if orgUnitName exists: `${orgUnitName} - (range)`, otherwise: `(range)`
  const orgMonthSubtitle = orgUnitName ? `${orgUnitName} - ${dateRanges.monthRangeText}` : dateRanges.monthRangeText;
  const orgRollingSubtitle = orgUnitName ? `${orgUnitName} - ${dateRanges.rollingWeeksText}` : dateRanges.rollingWeeksText;

  // ===== Real Data Calculations =====

  // 1. Top Card: Đi muộn, về sớm
  const lateEarlyStats = useMemo(() => {
    const isLateOrEarly = (record: any) => {
      if (!record) return false;
      const status = String(record.status || '').toLowerCase();
      if (status.includes('muộn') || status.includes('sớm')) return true;
      if (Number(record.lateMinutes || 0) > 0 || Number(record.earlyMinutes || 0) > 0) return true;
      return false;
    };

    let targetDate = dateRanges.todayYMD;
    let prevDate = dateRanges.yesterdayYMD;

    // Filter by period
    const currentMatches = timesheets.filter((t) => {
      if (latePeriod === 'today') return t.date === targetDate && isLateOrEarly(t);
      if (latePeriod === 'week') return t.date >= dateRanges.startOfMonthYMD && t.date <= targetDate && isLateOrEarly(t);
      return t.date >= dateRanges.startOfMonthYMD && t.date <= dateRanges.endOfMonthYMD && isLateOrEarly(t);
    });

    const prevMatches = timesheets.filter((t) => {
      if (latePeriod === 'today') return t.date === prevDate && isLateOrEarly(t);
      return false;
    });

    const count = currentMatches.length;
    const prevCount = prevMatches.length;
    const diff = Math.abs(count - prevCount);

    return { value: count, trend: diff };
  }, [timesheets, latePeriod, dateRanges]);

  // 2. Top Card: Thực tế nghỉ
  const actualLeaveStats = useMemo(() => {
    const isLeaveActive = (req: LeaveRequest, date: string) => {
      if (req.status !== 'Đã duyệt') return false;
      return req.startDate <= date && req.endDate >= date;
    };

    const currentMatches = leaveRequests.filter((l) => isLeaveActive(l, dateRanges.todayYMD));
    const prevMatches = leaveRequests.filter((l) => isLeaveActive(l, dateRanges.yesterdayYMD));

    const count = currentMatches.length;
    const prevCount = prevMatches.length;
    const diff = Math.abs(count - prevCount);

    return { value: count, trend: diff };
  }, [leaveRequests, dateRanges]);

  // 3. Top Card: Kế hoạch nghỉ
  const plannedLeaveStats = useMemo(() => {
    const isPlannedActive = (req: LeaveRequest, date: string) => {
      if (req.status !== 'Đã duyệt') return false;
      return req.startDate <= date && req.endDate >= date;
    };

    const targetDate = plannedLeavePeriod === 'tomorrow' ? dateRanges.tomorrowYMD : dateRanges.todayYMD;
    const currentMatches = leaveRequests.filter((l) => isPlannedActive(l, targetDate));
    const count = currentMatches.length;

    return { value: count, trend: 0 };
  }, [leaveRequests, plannedLeavePeriod, dateRanges]);

  // 4. Tình hình nghỉ theo phòng ban
  const leaveByDepartment = useMemo(() => {
    const approvedInMonth = leaveRequests.filter(
      (req) => req.status === 'Đã duyệt' && req.startDate <= dateRanges.endOfMonthYMD && req.endDate >= dateRanges.startOfMonthYMD
    );
    const map = new Map<string, number>();
    approvedInMonth.forEach((item) => {
      const dept = item.department?.trim() || 'Khác';
      map.set(dept, (map.get(dept) || 0) + (Number(item.daysCount) || 1));
    });
    return Array.from(map.entries()).map(([dept, days]) => ({ dept, days }));
  }, [leaveRequests, dateRanges]);

  // 5. Tình hình nghỉ theo thời gian
  const leaveByTime = useMemo(() => {
    const approvedInMonth = leaveRequests.filter(
      (req) => req.status === 'Đã duyệt' && req.startDate <= dateRanges.endOfMonthYMD && req.endDate >= dateRanges.startOfMonthYMD
    );
    const map = new Map<string, number>();
    approvedInMonth.forEach((item) => {
      const dateKey = item.startDate?.slice(5) || 'Khác';
      map.set(dateKey, (map.get(dateKey) || 0) + (Number(item.daysCount) || 1));
    });
    return Array.from(map.entries()).map(([date, days]) => ({ date, days }));
  }, [leaveRequests, dateRanges]);

  // 6. Phân tích loại nghỉ
  const leaveTypesAnalysis = useMemo(() => {
    const approvedInMonth = leaveRequests.filter(
      (req) => req.status === 'Đã duyệt' && req.startDate <= dateRanges.endOfMonthYMD && req.endDate >= dateRanges.startOfMonthYMD
    );
    const map = new Map<string, number>();
    approvedInMonth.forEach((item) => {
      const type = item.leaveType?.trim() || 'Nghỉ phép năm';
      map.set(type, (map.get(type) || 0) + 1);
    });
    const total = approvedInMonth.length || 1;
    return Array.from(map.entries()).map(([name, count]) => ({
      name,
      count,
      percent: Math.round((count / total) * 100),
    }));
  }, [leaveRequests, dateRanges]);

  // 7. Nhân viên nghỉ nhiều nhất
  const topEmployeesLeave = useMemo(() => {
    const approvedInMonth = leaveRequests.filter(
      (req) => req.status === 'Đã duyệt' && req.startDate <= dateRanges.endOfMonthYMD && req.endDate >= dateRanges.startOfMonthYMD
    );
    const map = new Map<string, { name: string; dept: string; days: number }>();
    approvedInMonth.forEach((item) => {
      const key = item.employeeName || item.code;
      const prev = map.get(key) || { name: item.employeeName, dept: item.department || '', days: 0 };
      prev.days += Number(item.daysCount) || 1;
      map.set(key, prev);
    });
    return Array.from(map.values())
      .sort((a, b) => b.days - a.days)
      .slice(0, 5);
  }, [leaveRequests, dateRanges]);

  // 8. Nhân viên đi muộn, về sớm nhiều nhất
  const topEmployeesLateEarly = useMemo(() => {
    const inMonth = timesheets.filter((t) => {
      if (t.date < dateRanges.startOfMonthYMD || t.date > dateRanges.endOfMonthYMD) return false;
      const status = String(t.status || '').toLowerCase();
      return status.includes('muộn') || status.includes('sớm') || Number(t.lateMinutes || 0) > 0 || Number(t.earlyMinutes || 0) > 0;
    });
    const map = new Map<string, { name: string; dept: string; count: number }>();
    inMonth.forEach((item) => {
      const key = item.employeeName || item.employeeCode || 'NV';
      const prev = map.get(key) || { name: item.employeeName || key, dept: item.department || '', count: 0 };
      prev.count += 1;
      map.set(key, prev);
    });
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [timesheets, dateRanges]);

  // 9. Tình hình đi muộn về sớm theo thời gian
  const lateEarlyByTime = useMemo(() => {
    const inMonth = timesheets.filter((t) => {
      if (t.date < dateRanges.startOfMonthYMD || t.date > dateRanges.endOfMonthYMD) return false;
      const status = String(t.status || '').toLowerCase();
      return status.includes('muộn') || status.includes('sớm') || Number(t.lateMinutes || 0) > 0 || Number(t.earlyMinutes || 0) > 0;
    });
    const map = new Map<string, number>();
    inMonth.forEach((item) => {
      const dateKey = item.date || 'Khác';
      map.set(dateKey, (map.get(dateKey) || 0) + 1);
    });
    return Array.from(map.entries()).map(([date, count]) => ({ date, count }));
  }, [timesheets, dateRanges]);

  // 10. Tình hình đi muộn về sớm theo phòng ban
  const lateEarlyByDept = useMemo(() => {
    const inMonth = timesheets.filter((t) => {
      if (t.date < dateRanges.startOfMonthYMD || t.date > dateRanges.endOfMonthYMD) return false;
      const status = String(t.status || '').toLowerCase();
      return status.includes('muộn') || status.includes('sớm') || Number(t.lateMinutes || 0) > 0 || Number(t.earlyMinutes || 0) > 0;
    });
    const map = new Map<string, number>();
    inMonth.forEach((item) => {
      const dept = item.department || 'Khác';
      map.set(dept, (map.get(dept) || 0) + 1);
    });
    return Array.from(map.entries()).map(([dept, count]) => ({ dept, count }));
  }, [timesheets, dateRanges]);

  // 11. Tần suất đi muộn, về sớm
  const lateEarlyFrequency = useMemo(() => {
    const inMonth = timesheets.filter((t) => {
      if (t.date < dateRanges.startOfMonthYMD || t.date > dateRanges.endOfMonthYMD) return false;
      const status = String(t.status || '').toLowerCase();
      return status.includes('muộn') || status.includes('sớm') || Number(t.lateMinutes || 0) > 0 || Number(t.earlyMinutes || 0) > 0;
    });
    if (inMonth.length === 0) return [];
    const empCounts = new Map<string, number>();
    inMonth.forEach((t) => {
      const key = t.employeeCode || t.employeeName || 'NV';
      empCounts.set(key, (empCounts.get(key) || 0) + 1);
    });
    let tier1 = 0; // 1 lần
    let tier2 = 0; // 2-3 lần
    let tier3 = 0; // 4-5 lần
    let tier4 = 0; // >5 lần
    empCounts.forEach((cnt) => {
      if (cnt === 1) tier1++;
      else if (cnt <= 3) tier2++;
      else if (cnt <= 5) tier3++;
      else tier4++;
    });
    return [
      { tier: '1 lần', count: tier1 },
      { tier: '2-3 lần', count: tier2 },
      { tier: '4-5 lần', count: tier3 },
      { tier: '>5 lần', count: tier4 },
    ].filter((item) => item.count > 0);
  }, [timesheets, dateRanges]);

  // 12. Tình hình làm thêm theo phòng ban
  const overtimeByDept = useMemo(() => {
    const approvedOT = overtime.filter((ot) => {
      const st = String(ot.status || '');
      return st === 'Đã duyệt OT' || st === 'Đã duyệt';
    });
    const map = new Map<string, number>();
    approvedOT.forEach((ot) => {
      const dept = ot.department || 'Khác';
      const hours = Number(ot.totalHours ?? ot.hours) || 0;
      map.set(dept, (map.get(dept) || 0) + hours);
    });
    return Array.from(map.entries()).map(([dept, hours]) => ({ dept, hours }));
  }, [overtime]);

  // 13. Tình hình làm thêm theo thời gian
  const overtimeByTime = useMemo(() => {
    const approvedOT = overtime.filter((ot) => {
      const st = String(ot.status || '');
      return st === 'Đã duyệt OT' || st === 'Đã duyệt';
    });
    const map = new Map<string, number>();
    approvedOT.forEach((ot) => {
      const dateKey = ot.otDate || ot.date || 'Khác';
      const hours = Number(ot.totalHours ?? ot.hours) || 0;
      map.set(dateKey, (map.get(dateKey) || 0) + hours);
    });
    return Array.from(map.entries()).map(([date, hours]) => ({ date, hours }));
  }, [overtime]);

  // 14. Nhân viên làm thêm nhiều nhất
  const topEmployeesOvertime = useMemo(() => {
    const approvedOT = overtime.filter((ot) => {
      const st = String(ot.status || '');
      return st === 'Đã duyệt OT' || st === 'Đã duyệt';
    });
    const map = new Map<string, { name: string; dept: string; hours: number }>();
    approvedOT.forEach((item) => {
      const key = item.employeeName || item.employeeCode || 'NV';
      const prev = map.get(key) || { name: item.employeeName || key, dept: item.department || '', hours: 0 };
      prev.hours += Number(item.totalHours ?? item.hours) || 0;
      map.set(key, prev);
    });
    return Array.from(map.values())
      .sort((a, b) => b.hours - a.hours)
      .slice(0, 5);
  }, [overtime]);

  // Common card styles
  const cardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 8,
    padding: '14px 18px',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 220,
    boxSizing: 'border-box',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.02)',
  };

  const topCardStyle: React.CSSProperties = {
    background: '#FFFFFF',
    border: '1px solid #E2E8F0',
    borderRadius: 8,
    padding: '12px 18px',
    boxSizing: 'border-box',
    boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.02)',
  };

  return (
    <div style={{ padding: '16px 14px', width: '100%', boxSizing: 'border-box', backgroundColor: '#F8FAFC' }}>
      {/* ROW 1: 3 TOP SUMMARY CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
        {/* Card 1: Đi muộn, về sớm */}
        <div style={topCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>Đi muộn, về sớm</span>
            <InlinePeriodSelect
              value={latePeriod}
              options={[
                { label: 'Hôm nay', value: 'today' },
                { label: 'Tuần này', value: 'week' },
                { label: 'Tháng này', value: 'month' },
              ]}
              onChange={(v: any) => setLatePeriod(v)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                {lateEarlyStats.value}
              </div>
              <div style={{ fontSize: 11.5, color: '#EA580C', display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontWeight: 500 }}>
                <span style={{ fontSize: 12 }}>↘</span>
                <span>{lateEarlyStats.trend} So với kỳ trước</span>
              </div>
            </div>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: '#FEF3C7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ClockCircleOutlined style={{ fontSize: 18, color: '#D97706' }} />
            </div>
          </div>
        </div>

        {/* Card 2: Thực tế nghỉ */}
        <div style={topCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>Thực tế nghỉ</span>
            <InlinePeriodSelect
              value={actualLeavePeriod}
              options={[
                { label: 'Hôm nay', value: 'today' },
                { label: 'Tuần này', value: 'week' },
                { label: 'Tháng này', value: 'month' },
              ]}
              onChange={(v: any) => setActualLeavePeriod(v)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                {actualLeaveStats.value}
              </div>
              <div style={{ fontSize: 11.5, color: '#EA580C', display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontWeight: 500 }}>
                <span style={{ fontSize: 12 }}>↘</span>
                <span>{actualLeaveStats.trend} So với kỳ trước</span>
              </div>
            </div>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563EB" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Card 3: Kế hoạch nghỉ */}
        <div style={topCardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#1E293B' }}>Kế hoạch nghỉ</span>
            <InlinePeriodSelect
              value={plannedLeavePeriod}
              options={[
                { label: 'Ngày mai', value: 'tomorrow' },
                { label: 'Tuần tới', value: 'next_week' },
                { label: 'Tháng tới', value: 'next_month' },
              ]}
              onChange={(v: any) => setPlannedLeavePeriod(v)}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                {plannedLeaveStats.value}
              </div>
              <div style={{ fontSize: 11.5, color: '#EA580C', display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, fontWeight: 500 }}>
                <span style={{ fontSize: 12 }}>↘</span>
                <span>{plannedLeaveStats.trend} So với kỳ trước</span>
              </div>
            </div>
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: 8,
                background: '#ECFDF5',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <circle cx="12" cy="15" r="3" />
                <polyline points="12 14 12 15 13 15" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 2: 2 CARDS (50% - 50%) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14, marginBottom: 14 }}>
        {/* Tình hình nghỉ theo phòng ban */}
        <div style={cardStyle}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B' }}>Tình hình nghỉ theo phòng ban</div>
            <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 3 }}>
              Tất cả đơn vị - {dateRanges.monthRangeText}
            </div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Đơn vị tính: Ngày công</div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {leaveByDepartment.length === 0 ? (
              <EmptyIllustration />
            ) : (
              <div style={{ width: '100%', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {leaveByDepartment.map((item) => (
                  <div key={item.dept} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#334155', fontWeight: 500 }}>{item.dept}</span>
                    <span style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{item.days} ngày</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tình hình nghỉ theo thời gian */}
        <div style={cardStyle}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B' }}>Tình hình nghỉ theo thời gian</div>
            <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 3 }}>
              Tất cả đơn vị - {dateRanges.rollingWeeksText}
            </div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Đơn vị tính: Ngày công</div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {leaveByTime.length === 0 ? (
              <EmptyIllustration />
            ) : (
              <div style={{ width: '100%', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {leaveByTime.map((item) => (
                  <div key={item.date} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#334155', fontWeight: 500 }}>{item.date}</span>
                    <span style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{item.days} ngày</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ROW 3: 3 CARDS (1fr 1fr 1fr) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
        {/* Phân tích loại nghỉ */}
        <div style={cardStyle}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B' }}>Phân tích loại nghỉ</span>
              <div style={{ display: 'flex', gap: 8, color: '#64748B' }}>
                <ReloadOutlined
                  spin={syncing}
                  onClick={() => void loadData()}
                  style={{ cursor: 'pointer', fontSize: 12, color: '#64748B' }}
                />
                <SettingOutlined
                  onClick={() => window.location.assign('/admin/attendance/requests/plans')}
                  style={{ cursor: 'pointer', fontSize: 12, color: '#64748B' }}
                />
              </div>
            </div>
            <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 3 }}>
              Tất cả đơn vị - {dateRanges.monthRangeText}
            </div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Đơn vị tính: Đơn</div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {leaveTypesAnalysis.length === 0 ? (
              <EmptyIllustration />
            ) : (
              <div style={{ width: '100%', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {leaveTypesAnalysis.map((item) => (
                  <div key={item.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: '#334155' }}>{item.name}</span>
                      <span style={{ fontWeight: 600, color: '#0F172A' }}>{item.count} đơn ({item.percent}%)</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Nhân viên nghỉ nhiều nhất */}
        <div style={cardStyle}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B' }}>Nhân viên nghỉ nhiều nhất</div>
            <div
              style={{
                fontSize: 11.5,
                color: '#64748B',
                marginTop: 3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={orgMonthSubtitle}
            >
              {orgMonthSubtitle}
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {topEmployeesLeave.length === 0 ? (
              <EmptyIllustration />
            ) : (
              <div style={{ width: '100%', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topEmployeesLeave.map((emp, i) => (
                  <div key={emp.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#334155' }}>{i + 1}. {emp.name} ({emp.dept})</span>
                    <span style={{ fontWeight: 700, color: '#D97706' }}>{emp.days} ngày</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Nhân viên đi muộn, về sớm nhiều nhất */}
        <div style={cardStyle}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B' }}>Nhân viên đi muộn, về sớm nhiều nhất</div>
            <div
              style={{
                fontSize: 11.5,
                color: '#64748B',
                marginTop: 3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={orgMonthSubtitle}
            >
              {orgMonthSubtitle}
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {topEmployeesLateEarly.length === 0 ? (
              <EmptyIllustration />
            ) : (
              <div style={{ width: '100%', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topEmployeesLateEarly.map((emp, i) => (
                  <div key={emp.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#334155' }}>{i + 1}. {emp.name} ({emp.dept})</span>
                    <span style={{ fontWeight: 700, color: '#DC2626' }}>{emp.count} lần</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ROW 4: 3 CARDS (1fr 1fr 1fr) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 14 }}>
        {/* Tình hình đi muộn về sớm theo thời gian */}
        <div style={cardStyle}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B' }}>Tình hình đi muộn về sớm theo thời gian</div>
            <div
              style={{
                fontSize: 11.5,
                color: '#64748B',
                marginTop: 3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={orgRollingSubtitle}
            >
              {orgRollingSubtitle}
            </div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Đơn vị tính: Số lần</div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {lateEarlyByTime.length === 0 ? (
              <EmptyIllustration />
            ) : (
              <div style={{ width: '100%', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lateEarlyByTime.map((item) => (
                  <div key={item.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#334155' }}>{item.date}</span>
                    <span style={{ fontWeight: 700, color: '#EA580C' }}>{item.count} lần</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tình hình đi muộn về sớm theo phòng ban */}
        <div style={cardStyle}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B' }}>Tình hình đi muộn về sớm theo phòng ban</div>
            <div
              style={{
                fontSize: 11.5,
                color: '#64748B',
                marginTop: 3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={orgMonthSubtitle}
            >
              {orgMonthSubtitle}
            </div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Đơn vị tính: Số lần</div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {lateEarlyByDept.length === 0 ? (
              <EmptyIllustration />
            ) : (
              <div style={{ width: '100%', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lateEarlyByDept.map((item) => (
                  <div key={item.dept} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#334155' }}>{item.dept}</span>
                    <span style={{ fontWeight: 700, color: '#EA580C' }}>{item.count} lần</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tần suất đi muộn, về sớm */}
        <div style={cardStyle}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B' }}>Tần suất đi muộn, về sớm</div>
            <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 3 }}>
              Tất cả đơn vị - {dateRanges.monthRangeText}
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {lateEarlyFrequency.length === 0 ? (
              <EmptyIllustration />
            ) : (
              <div style={{ width: '100%', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {lateEarlyFrequency.map((item) => (
                  <div key={item.tier} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#334155' }}>{item.tier}</span>
                    <span style={{ fontWeight: 700, color: '#0F172A' }}>{item.count} người</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ROW 5: 3 CARDS (1fr 1fr 1fr) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {/* Tình hình làm thêm theo phòng ban */}
        <div style={cardStyle}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B' }}>Tình hình làm thêm theo phòng ban</div>
            <div
              style={{
                fontSize: 11.5,
                color: '#64748B',
                marginTop: 3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={orgMonthSubtitle}
            >
              {orgMonthSubtitle}
            </div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Đơn vị tính: Giờ</div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {overtimeByDept.length === 0 ? (
              <EmptyIllustration />
            ) : (
              <div style={{ width: '100%', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {overtimeByDept.map((item) => (
                  <div key={item.dept} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#334155' }}>{item.dept}</span>
                    <span style={{ fontWeight: 700, color: '#2563EB' }}>{item.hours} giờ</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Tình hình làm thêm theo thời gian */}
        <div style={cardStyle}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B' }}>Tình hình làm thêm theo thời gian</div>
            <div
              style={{
                fontSize: 11.5,
                color: '#64748B',
                marginTop: 3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={orgRollingSubtitle}
            >
              {orgRollingSubtitle}
            </div>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>Đơn vị tính: Giờ</div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {overtimeByTime.length === 0 ? (
              <EmptyIllustration />
            ) : (
              <div style={{ width: '100%', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {overtimeByTime.map((item) => (
                  <div key={item.date} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#334155' }}>{item.date}</span>
                    <span style={{ fontWeight: 700, color: '#2563EB' }}>{item.hours} giờ</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Nhân viên làm thêm nhiều nhất */}
        <div style={cardStyle}>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: '#1E293B' }}>Nhân viên làm thêm nhiều nhất</div>
            <div
              style={{
                fontSize: 11.5,
                color: '#64748B',
                marginTop: 3,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
              title={orgMonthSubtitle}
            >
              {orgMonthSubtitle}
            </div>
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {topEmployeesOvertime.length === 0 ? (
              <EmptyIllustration />
            ) : (
              <div style={{ width: '100%', padding: '12px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {topEmployeesOvertime.map((emp, i) => (
                  <div key={emp.name} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                    <span style={{ color: '#334155' }}>{i + 1}. {emp.name} ({emp.dept})</span>
                    <span style={{ fontWeight: 700, color: '#2563EB' }}>{emp.hours} giờ</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
