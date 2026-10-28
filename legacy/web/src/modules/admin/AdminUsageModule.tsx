import React, { useEffect, useMemo, useState } from 'react';
import { BarChartOutlined, DownloadOutlined, ReloadOutlined, SearchOutlined, UserOutlined, CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Input, Select, Tag, message } from '../../custom-ui';
import { adminUsageApi, type AdminApplicationUsage, type AdminApplicationUsageReport, type ApplicationUsageCategory, type ApplicationUsagePeriod } from '../../api/endpoints';
import { filterApplicationUsage } from './usageRules';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';

const applicationOptions: Array<{ label: string; value: ApplicationUsageCategory | 'all' }> = [
  { label: 'Tất cả ứng dụng', value: 'all' },
  { label: 'Tài chính', value: 'finance' },
  { label: 'Kinh doanh', value: 'business' },
  { label: 'Nhân sự', value: 'hr' },
  { label: 'Văn phòng số', value: 'digital_office' },
];

const periodOptions: Array<{ label: string; value: ApplicationUsagePeriod }> = [
  { label: 'Tuần này', value: 'this_week' },
  { label: 'Tháng này', value: 'this_month' },
  { label: 'Quý này', value: 'this_quarter' },
  { label: 'Tất cả thời gian', value: 'all_time' },
];

const dateTime = (value: string) => {
  if (!value) return 'Chưa ghi nhận';
  const timestamp = new Date(value);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : 'Chưa ghi nhận';
};

export const AdminUsageModule: React.FC = () => {
  const [report, setReport] = useState<AdminApplicationUsageReport | null>(null);
  const [application, setApplication] = useState<ApplicationUsageCategory | 'all'>('all');
  const [period, setPeriod] = useState<ApplicationUsagePeriod>('this_week');
  const [searchText, setSearchText] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'logged_in' | 'operated'>('all');
  const [loading, setLoading] = useState(false);

  const loadReport = async () => {
    setLoading(true);
    try {
      const response = await adminUsageApi.getReport(application, period);
      setReport(response.data);
    } catch (error: any) {
      setReport(null);
      message.error(error?.response?.data?.message || 'Không tải được tình hình sử dụng ứng dụng.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadReport(); }, [application, period]);

  const filteredRows = useMemo(
    () => filterApplicationUsage(report?.data || [], searchText, activityFilter),
    [report?.data, searchText, activityFilter],
  );

  const exportRows = () => {
    const rows = [
      ['Họ tên', 'Email tài khoản', 'Đơn vị công tác', 'Lần đăng nhập', 'Lượt thao tác', 'Lần cuối sử dụng'],
      ...filteredRows.map(row => [row.name, row.email, row.department, row.loginCount, row.operationCount, dateTime(row.lastUsedAt)]),
    ];
    downloadFile('Tinh_hinh_su_dung_ung_dung.xlsx', generateValidXlsxBlob(rows));
  };

  const summary = report?.summary;
  const summaryCards = [
    { label: 'Người đã đăng nhập', value: summary?.loggedInPeople || 0, detail: `${summary?.loginCount || 0} phiên trong kỳ`, icon: <UserOutlined />, color: '#2563EB' },
    { label: 'Người đã thao tác', value: summary?.operatedPeople || 0, detail: `${summary?.operationCount || 0} lượt ghi nhận`, icon: <CheckCircleOutlined />, color: '#009688' },
    { label: 'Lượt đăng nhập', value: summary?.loginCount || 0, detail: 'Dựa trên phiên máy chủ', icon: <BarChartOutlined />, color: '#7C3AED' },
    { label: 'Lượt ghi nhận', value: summary?.operationCount || 0, detail: 'Mở ứng dụng và nhật ký nghiệp vụ', icon: <ThunderboltOutlined />, color: '#EA580C' },
  ];

  const columns = [
    { title: 'Họ tên', dataIndex: 'name', key: 'name', render: (value: string, row: AdminApplicationUsage) => (
      <div>
        <div style={{ fontWeight: 700, color: '#0F172A' }}>{value}</div>
        {row.employeeCode && <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Mã nhân viên: {row.employeeCode}</div>}
      </div>
    ) },
    { title: 'Email tài khoản', dataIndex: 'email', key: 'email', render: (value: string) => value || 'Chưa có email' },
    { title: 'Đơn vị công tác', dataIndex: 'department', key: 'department', render: (value: string) => value || 'Chưa phân đơn vị' },
    { title: 'Lần đăng nhập', dataIndex: 'loginCount', key: 'loginCount', width: 120, align: 'center' as const,
      render: (value: number) => <Tag color={value > 0 ? 'blue' : 'default'}>{value}</Tag> },
    { title: 'Lượt ghi nhận', dataIndex: 'operationCount', key: 'operationCount', width: 120, align: 'center' as const,
      render: (value: number) => <Tag color={value > 0 ? 'success' : 'default'}>{value}</Tag> },
    { title: 'Lần cuối sử dụng', dataIndex: 'lastUsedAt', key: 'lastUsedAt', width: 190, render: (value: string) => dateTime(value) },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: '#0F172A' }}>Tình hình sử dụng</h1>
          <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Theo dõi phiên đăng nhập và thao tác đã ghi nhận trên các ứng dụng.</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <Select aria-label="Chọn ứng dụng" value={application} onChange={value => setApplication(value as ApplicationUsageCategory | 'all')} options={applicationOptions} style={{ minWidth: 170 }} />
          <Select aria-label="Chọn khoảng thời gian" value={period} onChange={value => setPeriod(value as ApplicationUsagePeriod)} options={periodOptions} style={{ minWidth: 150 }} />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadReport()}>Làm mới</Button>
          <Button icon={<DownloadOutlined />} disabled={!report || filteredRows.length === 0} onClick={exportRows}>Xuất dữ liệu</Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 16 }}>
        {summaryCards.map(card => (
          <div key={card.label} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 15 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#64748B', fontSize: 12.5 }}>{card.icon}<span>{card.label}</span></div>
            <div style={{ color: card.color, fontSize: 24, fontWeight: 800, marginTop: 4 }}>{card.value.toLocaleString('vi-VN')}</div>
            <div style={{ color: '#94A3B8', fontSize: 11.5, marginTop: 3 }}>{card.detail}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {([
            ['all', 'Tất cả'], ['logged_in', 'Đã đăng nhập'], ['operated', 'Đã thao tác'],
          ] as const).map(([value, label]) => (
            <Button key={value} size="small" onClick={() => setActivityFilter(value)} style={{
              backgroundColor: activityFilter === value ? '#E0F2F1' : '#FFFFFF',
              borderColor: activityFilter === value ? '#009688' : '#CBD5E1',
              color: activityFilter === value ? '#00796B' : '#475569',
              fontWeight: activityFilter === value ? 700 : 500,
            }}>{label}</Button>
          ))}
        </div>
        <Input prefix={<SearchOutlined style={{ color: '#94A3B8' }} />} placeholder="Tìm họ tên, email hoặc đơn vị..." value={searchText} onChange={event => setSearchText(event.target.value)} allowClear style={{ width: 300, maxWidth: '100%' }} />
      </div>

      <div style={{ marginBottom: 8, color: '#64748B', fontSize: 12 }}>
        {report ? `Khoảng thời gian: ${report.fromDate} – ${report.toDate}. Lượt đăng nhập lấy từ phiên máy chủ; lượt ghi nhận gồm mở ứng dụng (giới hạn 1 lần/phút để tránh trùng) và thao tác có nhật ký.` : 'Chưa có báo cáo.'}
      </div>
      {loading && <div role="status" style={{ marginBottom: 8, color: '#64748B', fontSize: 12 }}>Đang tải dữ liệu sử dụng…</div>}
      <div className="transparent-table-card">
        <KTable
          dataSource={loading ? [] : filteredRows}
          columns={columns}
          rowKey="userId"
          pagination={{ pageSize: 10 }}
          disableCache
          viewKeyPrefix="admin-application-usage"
        />
      </div>
    </div>
  );
};
