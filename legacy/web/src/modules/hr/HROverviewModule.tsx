import React, { useEffect, useMemo, useState } from 'react';
import {
  PieChartOutlined,
  BarChartOutlined,
  DownloadOutlined,
  DollarOutlined,
  RiseOutlined,
  BellOutlined,
  FileProtectOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Button, message } from '../../custom-ui';
import { contractsApi, employeesApi, type ContractPayload, type EnterpriseEmployee } from '../../api/endpoints';

type DepartmentSummary = {
  name: string;
  count: number;
  percentage: number;
  color: string;
};

const DEPARTMENT_COLORS = ['#009688', '#2563EB', '#D97706', '#7C3AED', '#16A34A', '#DC2626', '#0EA5E9', '#F59E0B'];

const formatCurrencyCompact = (amount: number) => {
  if (amount >= 1_000_000_000) return `${(amount / 1_000_000_000).toFixed(2)} Tỷ VNĐ`;
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)} Triệu VNĐ`;
  return `${amount.toLocaleString('vi-VN')} VNĐ`;
};

const parseDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const diffDays = (from: Date, to: Date) => {
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
};

export const HROverviewModule: React.FC = () => {
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [contracts, setContracts] = useState<ContractPayload[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      setLoading(true);
      try {
        const [employeeRes, contractRes] = await Promise.all([
          employeesApi.getAll(),
          contractsApi.getAll(),
        ]);

        const isSuperAdmin = (item: any) =>
          item?.role === 'ADMIN' ||
          item?.role === 'Super Admin' ||
          item?.code === 'ADMIN-001' ||
          item?.employeeCode === 'ADMIN-001' ||
          (item?.email && (item.email.toLowerCase().includes('admin') || item.email.toLowerCase() === 'tung@kiyovn.local'));

        setEmployees((employeeRes.data.data || []).filter((item: any) => !isSuperAdmin(item)));
        setContracts(contractRes.data.data || []);
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Không thể tải dữ liệu tổng quan nhân sự.');
      } finally {
        setLoading(false);
      }
    };

    void loadDashboard();
  }, []);

  const today = useMemo(() => new Date('2026-08-29T00:00:00'), []);

  const stats = useMemo(() => {
    const activeEmployees = employees.filter((employee) => employee.status !== 'Đã nghỉ việc');
    const totalEmployees = activeEmployees.length;
    const officialEmployees = activeEmployees.filter((employee) => employee.status === 'Chính thức').length;
    const probationEmployees = activeEmployees.filter((employee) => employee.status === 'Thử việc').length;
    const inactiveEmployees = employees.filter((employee) => employee.status === 'Đã nghỉ việc').length;
    const monthlyPayroll = activeEmployees.reduce((sum, employee) => sum + Number(employee.salaryBase || 0), 0);

    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    const newThisMonth = activeEmployees.filter((employee) => {
      const joinDate = parseDate(employee.joinDate);
      return joinDate && joinDate.getMonth() === currentMonth && joinDate.getFullYear() === currentYear;
    }).length;

    const departmentCounts = activeEmployees.reduce((map, employee) => {
      const key = (employee.department || 'Chưa phân bổ').trim() || 'Chưa phân bổ';
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map<string, number>());

    const deptDistribution: DepartmentSummary[] = Array.from(departmentCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count], index) => ({
        name,
        count,
        percentage: totalEmployees > 0 ? Math.round((count / totalEmployees) * 100) : 0,
        color: DEPARTMENT_COLORS[index % DEPARTMENT_COLORS.length],
      }));

    const soonExpiringContracts = contracts.filter((contract) => {
      const endDate = parseDate(contract.endDate);
      if (!endDate) return false;
      const daysLeft = diffDays(today, endDate);
      return daysLeft >= 0 && daysLeft <= 30;
    });

    const expiredContracts = contracts.filter((contract) => {
      const endDate = parseDate(contract.endDate);
      return endDate ? diffDays(today, endDate) < 0 : false;
    });

    const pendingSignContracts = contracts.filter((contract) => contract.status === 'Chờ ký' || contract.employeeSignStatus === 'Chưa ký' || contract.companySignStatus === 'Chưa ký');

    const alerts = [
      soonExpiringContracts.length > 0 ? `Có ${soonExpiringContracts.length} hợp đồng sắp hết hạn trong 30 ngày tới.` : null,
      probationEmployees > 0 ? `Có ${probationEmployees} nhân sự đang ở trạng thái thử việc cần theo dõi đánh giá.` : null,
      pendingSignContracts.length > 0 ? `Có ${pendingSignContracts.length} hợp đồng còn đang chờ ký hoặc chưa hoàn tất ký số.` : null,
      expiredContracts.length > 0 ? `Có ${expiredContracts.length} hợp đồng đã quá hạn cần rà soát và xử lý.` : null,
    ].filter(Boolean) as string[];

    return {
      totalEmployees,
      officialEmployees,
      probationEmployees,
      inactiveEmployees,
      monthlyPayroll,
      newThisMonth,
      deptDistribution,
      soonExpiringContracts: soonExpiringContracts.length,
      expiredContracts: expiredContracts.length,
      pendingSignContracts: pendingSignContracts.length,
      officialRate: totalEmployees > 0 ? (officialEmployees / totalEmployees) * 100 : 0,
      alerts,
    };
  }, [contracts, employees, today]);

  return (
    <div className="k-page-container">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 18 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nhân sự đang hoạt động</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {stats.totalEmployees} nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <RiseOutlined /> {stats.newThisMonth} nhân sự vào làm trong tháng này
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cơ cấu trạng thái nhân sự</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {stats.officialEmployees} / {stats.totalEmployees}
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 4 }}>
            {stats.officialRate.toFixed(1)}% chính thức · {stats.probationEmployees} thử việc
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Quỹ lương cơ bản / tháng</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {formatCurrencyCompact(stats.monthlyPayroll)}
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
            <DollarOutlined /> Tính từ hồ sơ nhân sự đang hoạt động
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tình trạng hợp đồng cần lưu ý</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {stats.soonExpiringContracts + stats.pendingSignContracts}
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 4 }}>
            {stats.soonExpiringContracts} sắp hết hạn · {stats.pendingSignContracts} chờ ký
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16, marginBottom: 18 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <PieChartOutlined style={{ color: '#009688' }} />
            Phân Bổ Nhân Sự Theo Phòng Ban
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {stats.deptDistribution.length === 0 ? (
              <div style={{ fontSize: 13, color: '#64748B' }}>Chưa có dữ liệu nhân sự để tổng hợp.</div>
            ) : (
              stats.deptDistribution.map((item) => (
                <div key={item.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, gap: 12 }}>
                    <span style={{ fontWeight: 600, color: '#1E293B' }}>{item.name}</span>
                    <span style={{ fontWeight: 700, color: item.color, whiteSpace: 'nowrap' }}>{item.count} người ({item.percentage}%)</span>
                  </div>
                  <div style={{ background: '#F1F5F9', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${item.percentage}%`, background: item.color, height: '100%', borderRadius: 4 }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14 }}>
            <BarChartOutlined style={{ color: '#2563EB' }} />
            Chỉ Số Vận Hành Nhân Sự
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 10 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, gap: 12 }}>
                <span style={{ fontWeight: 600, color: '#1E293B' }}>Nhân sự chính thức</span>
                <span style={{ color: '#64748B', fontWeight: 600 }}>{stats.officialEmployees}/{stats.totalEmployees || 0}</span>
              </div>
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#E2E8F0' }}>
                <div style={{ width: `${stats.officialRate}%`, background: '#2563EB' }} title={`Chính thức: ${stats.officialRate.toFixed(1)}%`} />
              </div>
            </div>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6, gap: 12 }}>
                <span style={{ fontWeight: 600, color: '#1E293B' }}>Nhân sự đã nghỉ việc</span>
                <span style={{ fontWeight: 700, color: '#DC2626' }}>{stats.inactiveEmployees} hồ sơ</span>
              </div>
              <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', background: '#E2E8F0' }}>
                <div
                  style={{
                    width: `${employees.length > 0 ? (stats.inactiveEmployees / employees.length) * 100 : 0}%`,
                    background: '#DC2626',
                  }}
                  title={`Đã nghỉ việc: ${stats.inactiveEmployees}`}
                />
              </div>
            </div>

            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: '12px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <BellOutlined style={{ color: '#D97706' }} />
                Cảnh báo nhân sự cần xử lý
              </div>
              {stats.alerts.length === 0 ? (
                <div style={{ fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>
                  Chưa phát hiện cảnh báo vận hành từ dữ liệu nhân sự và hợp đồng hiện có.
                </div>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12.5, color: '#475569', lineHeight: 1.6 }}>
                  {stats.alerts.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#FCFCFD' }}>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <FileProtectOutlined style={{ color: '#7C3AED' }} />
                  Hợp đồng quá hạn
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#7C3AED' }}>{stats.expiredContracts}</div>
              </div>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, background: '#FCFCFD' }}>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <TeamOutlined style={{ color: '#009688' }} />
                  Hợp đồng chờ ký
                </div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#009688' }}>{stats.pendingSignContracts}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div style={{ fontSize: 12.5, color: '#64748B' }}>
          Đang đồng bộ dữ liệu tổng quan nhân sự...
        </div>
      )}
    </div>
  );
};
