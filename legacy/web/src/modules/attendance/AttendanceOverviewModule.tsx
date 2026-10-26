import { attendanceDate } from './attendanceRules';
import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  EyeOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { Button, Drawer, Tag, message } from '../../custom-ui';
import { KTable } from '../../components/KTable';
import { employeesApi, type EnterpriseEmployee } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';

type LeaveRequest = {
  key: string;
  code: string;
  employeeName: string;
  employeeId?: string;
  empCode?: string;
  department: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: 'Chờ duyệt' | 'Đã duyệt' | 'Từ chối' | string;
};

const TODAY = attendanceDate();

const isWithinRange = (startDate?: string, endDate?: string, referenceDate = TODAY) => {
  if (!startDate || !endDate) return false;
  return startDate <= referenceDate && endDate >= referenceDate;
};

export const AttendanceOverviewModule: React.FC = () => {
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<LeaveRequest | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const loadData = async () => {
    setSyncing(true);
    try {
      const [employeeRes, leaveRes] = await Promise.all([
        employeesApi.getAll(),
        dataService.refreshGenericData('leave_requests'),
      ]);
      setEmployees(employeeRes.data.data || []);
      setLeaveRequests(leaveRes);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải tổng quan chấm công.');
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const activeEmployees = employees.filter((employee) => employee.status !== 'Đã nghỉ việc');
  const leaveToday = leaveRequests.filter((item) => item.status === 'Đã duyệt' && isWithinRange(item.startDate, item.endDate));
  const approvedToday = activeEmployees.filter((employee) => leaveToday.some((item) => item.employeeId === employee.key || item.empCode === employee.code)).length;
  const pendingLeaves = leaveRequests.filter((item) => item.status === 'Chờ duyệt').length;
  const approvedUpcoming = leaveRequests.filter((item) => item.status === 'Đã duyệt' && item.startDate > TODAY).length;
  const availableToday = Math.max(0, activeEmployees.length - approvedToday);

  const leaveTypeBreakdown = useMemo(() => {
    const grouped = new Map<string, number>();
    leaveRequests.forEach((item) => {
      const key = item.leaveType || 'Khác';
      grouped.set(key, (grouped.get(key) || 0) + 1);
    });
    const total = leaveRequests.length || 1;
    return Array.from(grouped.entries()).map(([name, count], index) => ({
      name,
      count,
      percent: Math.round((count / total) * 100),
      color: ['#009688', '#2563EB', '#D97706', '#7C3AED'][index % 4],
    }));
  }, [leaveRequests]);

  const columns = [
    {
      title: 'Mã đơn',
      dataIndex: 'code',
      key: 'code',
      width: 120,
      render: (value: string) => <strong style={{ color: '#009688', fontSize: 13.5 }}>{value}</strong>,
    },
    {
      title: 'Nhân viên',
      key: 'name',
      render: (_: any, record: LeaveRequest) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.department}</div>
        </div>
      ),
    },
    {
      title: 'Loại nghỉ',
      dataIndex: 'leaveType',
      key: 'leaveType',
      render: (value: string) => <Tag color="blue">{value}</Tag>,
    },
    {
      title: 'Thời gian',
      key: 'range',
      render: (_: any, record: LeaveRequest) => (
        <div style={{ fontSize: 12, color: '#475569' }}>
          <div>{record.startDate} &rarr; {record.endDate}</div>
          <div style={{ marginTop: 2, color: '#64748B' }}>{record.daysCount} ngày</div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (value: string) => {
        const color = value === 'Đã duyệt' ? 'success' : value === 'Từ chối' ? 'error' : 'warning';
        return <Tag color={color}>{value}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 90,
      render: (_: any, record: LeaveRequest) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedRecord(record);
            setDrawerOpen(true);
          }}
        >
          Xem
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Quân số khả dụng ngày {TODAY}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {availableToday} / {activeEmployees.length || 0}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Suy ra từ quân số đang hoạt động và đơn nghỉ đã duyệt</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đơn nghỉ đang hiệu lực hôm nay</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {approvedToday}
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đã được phê duyệt và nằm trong khoảng ngày nghỉ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đơn nghỉ chờ duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingLeaves}
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Cần bộ phận quản lý hoặc HR xử lý</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đơn nghỉ đã duyệt sắp tới</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {approvedUpcoming}
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Giúp dự báo quân số các ngày tới</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClockCircleOutlined style={{ color: '#009688' }} />
            Tổng Quan Nghỉ Phép & Quân Số
          </div>
          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
            Tổng hợp từ nhân sự đang hoạt động và đơn nghỉ phép đang có trên hệ thống.
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ReloadOutlined spin={syncing} />} onClick={() => void loadData()}>
            Làm mới
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('Tong_quan_nghi_phep.xlsx', generateValidXlsxBlob([['Mã đơn', 'Nhân viên', 'Phòng ban', 'Loại nghỉ', 'Từ ngày', 'Đến ngày', 'Số ngày', 'Trạng thái'], ...leaveRequests.map((item) => [item.code, item.employeeName, item.department, item.leaveType, item.startDate, item.endDate, item.daysCount, item.status])]))}>
            Xuất báo cáo
          </Button>
          <Button
            type="primary"
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            onClick={() => window.location.assign('/admin/attendance/requests/list')}
          >
            Danh sách đơn nghỉ
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.35fr 1fr', gap: 16, marginBottom: 16 }}>
        <div className="transparent-table-card" style={{ marginBottom: 0 }}>
          <KTable dataSource={[...leaveRequests].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))} columns={columns} pagination={{ pageSize: 6 }} />
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
            <CalendarOutlined style={{ color: '#16A34A' }} />
            Cơ Cấu Đơn Nghỉ
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {leaveTypeBreakdown.length === 0 ? (
              <div style={{ fontSize: 13, color: '#64748B' }}>Chưa có đơn nghỉ phép nào.</div>
            ) : leaveTypeBreakdown.map((item) => (
              <div key={item.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{item.name}</span>
                  <span style={{ color: '#64748B', fontWeight: 700 }}>
                    {item.count} đơn ({item.percent}%)
                  </span>
                </div>
                <div style={{ background: '#F1F5F9', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ width: `${item.percent}%`, background: item.color, height: '100%', borderRadius: 4 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <Drawer
        title="Chi tiết đơn nghỉ phép"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={540}
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
                <Tag color={selectedRecord.status === 'Đã duyệt' ? 'success' : selectedRecord.status === 'Từ chối' ? 'error' : 'warning'}>
                  {selectedRecord.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedRecord.department} · {selectedRecord.leaveType}
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông tin đơn nghỉ
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Khoảng nghỉ:</span>
                  <strong style={{ color: '#009688' }}>{selectedRecord.startDate} &rarr; {selectedRecord.endDate}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số ngày:</span>
                  <strong>{selectedRecord.daysCount}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
                  <span style={{ color: '#64748B' }}>Lý do:</span>
                  <span style={{ textAlign: 'right' }}>{selectedRecord.reason}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
