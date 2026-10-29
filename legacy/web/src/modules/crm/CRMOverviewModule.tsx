import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DownOutlined,
  ReloadOutlined,
  EditOutlined,
  SettingOutlined,
  EllipsisOutlined,
  InfoCircleOutlined,
  ApartmentOutlined,
  RobotOutlined,
  ShopOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import { Button, Modal, Select, message } from '../../custom-ui';
import { financeDocumentsApi, crmContactsApi, systemApi, FinanceDocument } from '../../api/endpoints';

// ===== Standard SVG Empty State Illustrations =====
const EmptyLineChartSvg: React.FC = () => (
  <svg width="64" height="48" viewBox="0 0 64 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6 42H58" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M6 6V42" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M12 34L24 22L34 28L52 12" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="24" cy="22" r="3" fill="#94A3B8" />
    <circle cx="34" cy="28" r="3" fill="#94A3B8" />
    <circle cx="52" cy="12" r="3" fill="#94A3B8" />
  </svg>
);

const EmptyBarChartSvg: React.FC = () => (
  <svg width="56" height="48" viewBox="0 0 56 48" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 44H52" stroke="#CBD5E1" strokeWidth="2.5" strokeLinecap="round" />
    <rect x="10" y="24" width="8" height="20" rx="1.5" fill="#CBD5E1" />
    <rect x="24" y="14" width="8" height="30" rx="1.5" fill="#94A3B8" />
    <rect x="38" y="28" width="8" height="16" rx="1.5" fill="#CBD5E1" />
  </svg>
);

const EmptyPieChartSvg: React.FC = () => (
  <svg width="56" height="56" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="28" cy="28" r="22" stroke="#CBD5E1" strokeWidth="8" strokeDasharray="90 50" />
    <path d="M28 6A22 22 0 0 1 50 28H28V6Z" fill="#94A3B8" />
  </svg>
);

const EmptyDocumentSvg: React.FC = () => (
  <svg width="48" height="56" viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 8C4 5.79086 5.79086 4 8 4H32L44 16V48C44 50.2091 42.2091 52 40 52H8C5.79086 52 4 50.2091 4 48V8Z" fill="#F1F5F9" stroke="#CBD5E1" strokeWidth="2" />
    <path d="M32 4V16H44" stroke="#CBD5E1" strokeWidth="2" strokeLinejoin="round" />
    <path d="M12 24H36" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 32H28" stroke="#94A3B8" strokeWidth="2" strokeLinecap="round" />
    <path d="M12 40H22" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

interface MetricCardProps {
  title: string;
  value: number | string;
  badge: string;
  bgColor: string;
  tooltipText: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, badge, bgColor, tooltipText }) => {
  return (
    <div
      style={{
        backgroundColor: bgColor,
        borderRadius: 8,
        padding: '16px 20px',
        color: '#FFFFFF',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 104,
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
        position: 'relative',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255, 255, 255, 0.95)' }}>{title}</span>
        <span title={tooltipText} style={{ cursor: 'pointer', opacity: 0.85, fontSize: 13 }}>
          <InfoCircleOutlined />
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 10 }}>
        <span style={{ fontSize: 32, fontWeight: 700, lineHeight: 1 }}>{value}</span>
        <div
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.22)',
            borderRadius: 4,
            padding: '2px 8px',
            fontSize: 12,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: '#FFFFFF',
          }}
        >
          <RiseOutlined style={{ fontSize: 10 }} />
          <span>{badge}</span>
        </div>
      </div>
    </div>
  );
};

interface ChartCardProps {
  title: string;
  subtitle?: string;
  extraHeader?: React.ReactNode;
  timestamp: string;
  onReload: () => void;
  children?: React.ReactNode;
  emptyType?: 'line' | 'bar' | 'pie' | 'doc';
  emptyText?: string;
  topMetric?: string | number;
}

const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  extraHeader,
  timestamp,
  onReload,
  children,
  emptyType = 'bar',
  emptyText = 'Không có dữ liệu',
  topMetric,
}) => {
  const renderEmptySvg = () => {
    switch (emptyType) {
      case 'line':
        return <EmptyLineChartSvg />;
      case 'pie':
        return <EmptyPieChartSvg />;
      case 'doc':
        return <EmptyDocumentSvg />;
      case 'bar':
      default:
        return <EmptyBarChartSvg />;
    }
  };

  return (
    <div
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        border: '1px solid #E2E8F0',
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        minHeight: 280,
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
      }}
    >
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#1E293B', margin: 0 }}>{title}</h3>
            {extraHeader}
          </div>
          {subtitle && (
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500, backgroundColor: '#F1F5F9', padding: '2px 8px', borderRadius: 4 }}>
              {subtitle}
            </span>
          )}
        </div>

        {topMetric !== undefined && (
          <div style={{ fontSize: 28, fontWeight: 700, color: '#1E293B', marginBottom: 12 }}>
            {topMetric}
          </div>
        )}

        {children ? (
          children
        ) : (
          <div
            style={{
              height: 160,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {renderEmptySvg()}
            <span style={{ fontSize: 13, color: '#94A3B8' }}>{emptyText}</span>
          </div>
        )}
      </div>

      <div
        style={{
          borderTop: '1px solid #F1F5F9',
          paddingTop: 10,
          marginTop: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: 12,
          color: '#94A3B8',
        }}
      >
        <span>Số liệu tính đến: {timestamp}</span>
        <button
          onClick={onReload}
          style={{
            background: 'none',
            border: 'none',
            color: '#2563EB',
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 500,
            padding: 0,
          }}
        >
          Tải lại
        </button>
      </div>
    </div>
  );
};

export const CRMOverviewModule: React.FC = () => {
  const [activeActivityTab, setActiveActivityTab] = useState<'count' | 'opportunity' | 'order'>('count');
  const [timeFilter, setTimeFilter] = useState<string>('this_month');
  const [companyName, setCompanyName] = useState<string>('CÔNG TY TNHH XÂY DỰNG KINH SỞ');
  const [orgUnit, setOrgUnit] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(false);
  const [timestamp, setTimestamp] = useState<string>('');
  const [aiModalVisible, setAiModalVisible] = useState<boolean>(false);
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);

  // Real data state
  const [salesDocuments, setSalesDocuments] = useState<FinanceDocument[]>([]);
  const [totalCustomers, setTotalCustomers] = useState<number>(0);

  const getCurrentTimeString = useCallback(() => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }, []);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, contactsRes, profileRes] = await Promise.allSettled([
        financeDocumentsApi.getAll(),
        crmContactsApi.getAll('customer'),
        systemApi.getCompanyProfile(),
      ]);

      if (docsRes.status === 'fulfilled' && docsRes.value.data?.data) {
        const sales = docsRes.value.data.data.filter(
          (doc) => doc.documentType === 'sale' && doc.status !== 'Đã hủy'
        );
        setSalesDocuments(sales);
      }

      if (contactsRes.status === 'fulfilled' && contactsRes.value.data?.data) {
        setTotalCustomers(contactsRes.value.data.data.length);
      }

      if (profileRes.status === 'fulfilled' && profileRes.value.data?.profile?.companyName) {
        setCompanyName(profileRes.value.data.profile.companyName);
      }

      setTimestamp(getCurrentTimeString());
    } catch {
      message.error('Không thể làm mới dữ liệu tổng quan kinh doanh.');
    } finally {
      setLoading(false);
    }
  }, [getCurrentTimeString]);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  // Aggregate stats
  const stats = useMemo(() => {
    const orderCount = salesDocuments.length;
    const orderValue = salesDocuments.reduce((sum, doc) => sum + (doc.amount || 0), 0);
    const collectedValue = salesDocuments.reduce((sum, doc) => sum + Math.max(0, (doc.amount || 0) - (doc.remainingAmount || 0)), 0);
    const remainingValue = salesDocuments.reduce((sum, doc) => sum + (doc.remainingAmount || 0), 0);

    return {
      orderCount,
      orderValue: orderValue > 0 ? orderValue.toLocaleString('vi-VN') : '0',
      collectedValue: collectedValue > 0 ? collectedValue.toLocaleString('vi-VN') : '0',
      remainingValue: remainingValue > 0 ? remainingValue.toLocaleString('vi-VN') : '0',
    };
  }, [salesDocuments]);

  return (
    <div style={{ backgroundColor: '#F8FAFC', minHeight: '100vh', padding: '16px 20px 40px' }}>
      {/* Main Header with Filters and Actions (Matching Image 2 directly) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
          marginBottom: 16,
        }}
      >
        {/* Title dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Tình hình kinh doanh</span>
            <DownOutlined style={{ fontSize: 12, color: '#64748B' }} />
          </h2>
          <button
            onClick={() => void loadDashboardData()}
            title="Làm mới toàn bộ dữ liệu"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748B',
              fontSize: 14,
              padding: 4,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <ReloadOutlined spin={loading} />
          </button>
        </div>

        {/* Right filter controls */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <Select
            value={orgUnit}
            onChange={(val) => setOrgUnit(String(val))}
            style={{ width: 150 }}
            options={[
              { value: 'all', label: 'Cơ cấu tổ chức' },
              { value: 'sales', label: 'Phòng Kinh doanh' },
              { value: 'marketing', label: 'Phòng Marketing' },
              { value: 'cskh', label: 'Chăm sóc khách hàng' },
            ]}
          />

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              backgroundColor: '#FFFFFF',
              border: '1px solid #CBD5E1',
              borderRadius: 6,
              padding: '5px 12px',
              fontSize: 13,
              fontWeight: 500,
              color: '#334155',
            }}
          >
            <ShopOutlined style={{ color: '#2563EB' }} />
            <span style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {companyName}
            </span>
            <ApartmentOutlined style={{ color: '#64748B', fontSize: 12 }} />
          </div>

          <Select
            value={timeFilter}
            onChange={(val) => setTimeFilter(String(val))}
            style={{ width: 130 }}
            options={[
              { value: 'today', label: 'Hôm nay' },
              { value: 'this_week', label: 'Tuần này' },
              { value: 'this_month', label: 'Tháng này' },
              { value: 'this_quarter', label: 'Quý này' },
              { value: 'this_year', label: 'Năm nay' },
              { value: '2026', label: 'Năm 2026' },
            ]}
          />

          <Button
            onClick={() => setAiModalVisible(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 6,
              borderColor: '#93C5FD',
              color: '#1D4ED8',
              backgroundColor: '#EFF6FF',
              fontWeight: 600,
            }}
          >
            <RobotOutlined />
            <span>Phân tích với AI</span>
          </Button>

          <Button
            onClick={() => setEditModalVisible(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 6,
              color: '#334155',
            }}
          >
            <EditOutlined />
            <span>Sửa</span>
          </Button>

          <Button
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6,
              color: '#334155',
              width: 36,
              padding: 0,
            }}
          >
            <EllipsisOutlined style={{ fontSize: 16 }} />
          </Button>
        </div>
      </div>

      {/* Section Sub-header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Tổng quan</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#64748B' }}>
          <span>Số liệu tính đến: {timestamp}</span>
          <button
            onClick={() => void loadDashboardData()}
            style={{
              background: 'none',
              border: 'none',
              color: '#2563EB',
              cursor: 'pointer',
              fontWeight: 500,
              padding: 0,
            }}
          >
            Tải lại
          </button>
        </div>
      </div>

      {/* 4 Colored KPI Cards (Row 1) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <MetricCard
          title="Số lượng đơn hàng"
          value={stats.orderCount}
          badge="▲ -"
          bgColor="#5E48E8"
          tooltipText="Tổng số lượng đơn hàng ghi nhận trong kỳ báo cáo"
        />
        <MetricCard
          title="Giá trị đơn hàng"
          value={stats.orderValue}
          badge="▲ -"
          bgColor="#2563EB"
          tooltipText="Tổng giá trị hợp đồng / đơn bán hàng đã xác nhận"
        />
        <MetricCard
          title="Thực thu đơn hàng"
          value={stats.collectedValue}
          badge="▲ -"
          bgColor="#0EA5E9"
          tooltipText="Số tiền khách hàng đã thanh toán thực tế"
        />
        <MetricCard
          title="Còn phải thu đơn hàng"
          value={stats.remainingValue}
          badge="▲ -"
          bgColor="#F97316"
          tooltipText="Công nợ còn phải thu của các đơn hàng"
        />
      </div>

      {/* Grid Row 2: 3 Cards (Mục tiêu thời gian, Doanh số đơn vị, Doanh số hàng hóa) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <ChartCard
          title="Mục tiêu doanh số theo thời gian"
          subtitle="2026"
          timestamp={timestamp}
          onReload={() => void loadDashboardData()}
          emptyType="line"
        />

        <ChartCard
          title="Doanh số theo đơn vị"
          timestamp={timestamp}
          onReload={() => void loadDashboardData()}
          emptyType="bar"
        />

        <ChartCard
          title="Doanh số theo hàng hóa"
          timestamp={timestamp}
          onReload={() => void loadDashboardData()}
          emptyType="pie"
        />
      </div>

      {/* Grid Row 3: 3 Cards (Mục tiêu đơn vị, Doanh số thời gian, Nhân viên xuất sắc) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <ChartCard
          title="Mục tiêu doanh số theo đơn vị"
          extraHeader={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 12 }}>
              <EditOutlined style={{ cursor: 'pointer' }} />
              <ReloadOutlined style={{ cursor: 'pointer' }} onClick={() => void loadDashboardData()} />
              <SettingOutlined style={{ cursor: 'pointer' }} />
            </div>
          }
          timestamp={timestamp}
          onReload={() => void loadDashboardData()}
          emptyType="bar"
        />

        <ChartCard
          title="Doanh số theo thời gian"
          subtitle="2026"
          timestamp={timestamp}
          onReload={() => void loadDashboardData()}
          emptyType="bar"
        />

        <ChartCard
          title="Nhân viên xuất sắc"
          timestamp={timestamp}
          onReload={() => void loadDashboardData()}
          emptyType="doc"
        />
      </div>

      {/* Grid Row 4: 2 Cards (Tình hình thực hiện mục tiêu doanh số, Hàng hóa bán chạy theo giá trị) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <ChartCard
          title="Tình hình thực hiện mục tiêu doanh số"
          extraHeader={
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94A3B8', fontSize: 12 }}>
              <EditOutlined style={{ cursor: 'pointer' }} />
              <ReloadOutlined style={{ cursor: 'pointer' }} onClick={() => void loadDashboardData()} />
              <SettingOutlined style={{ cursor: 'pointer' }} />
            </div>
          }
          timestamp={timestamp}
          onReload={() => void loadDashboardData()}
          emptyType="doc"
        >
          {/* Table Header Summary */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              borderRadius: 6,
              padding: '10px 12px',
              fontSize: 12,
              fontWeight: 600,
              color: '#475569',
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              textAlign: 'center',
              borderBottom: '1px solid #E2E8F0',
              marginBottom: 12,
            }}
          >
            <span>Mục tiêu doanh số</span>
            <span>Đã thực hiện</span>
            <span>% Đã thực hiện</span>
            <span>Còn thực hiện</span>
            <span>% Còn thực hiện</span>
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              textAlign: 'center',
              fontSize: 13,
              fontWeight: 500,
              color: '#64748B',
              padding: '4px 12px 12px',
              borderBottom: '1px dashed #CBD5E1',
            }}
          >
            <span style={{ fontWeight: 600, color: '#1E293B' }}>Tổng</span>
            <span>-</span>
            <span>-</span>
            <span>-</span>
            <span>-</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <span style={{ fontSize: 12, color: '#2563EB', cursor: 'pointer' }}>Xem thêm</span>
          </div>
        </ChartCard>

        <ChartCard
          title="Hàng hóa bán chạy theo giá trị"
          timestamp={timestamp}
          onReload={() => void loadDashboardData()}
          emptyType="doc"
        />
      </div>

      {/* Grid Row 5: 2 Cards (Tình hình thực hiện hoạt động, Doanh số theo loại khách hàng) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
          gap: 16,
          marginBottom: 20,
        }}
      >
        <ChartCard
          title="Tình hình thực hiện hoạt động"
          timestamp={timestamp}
          onReload={() => void loadDashboardData()}
          emptyType="doc"
        >
          {/* Sub-tabs for activity status */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              borderBottom: '1px solid #F1F5F9',
              paddingBottom: 8,
              marginBottom: 12,
            }}
          >
            <button
              onClick={() => setActiveActivityTab('count')}
              style={{
                background: activeActivityTab === 'count' ? '#EFF6FF' : 'none',
                color: activeActivityTab === 'count' ? '#2563EB' : '#64748B',
                border: 'none',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: activeActivityTab === 'count' ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              SL hoạt động
            </button>
            <button
              onClick={() => setActiveActivityTab('opportunity')}
              style={{
                background: activeActivityTab === 'opportunity' ? '#EFF6FF' : 'none',
                color: activeActivityTab === 'opportunity' ? '#2563EB' : '#64748B',
                border: 'none',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: activeActivityTab === 'opportunity' ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              Cơ hội
            </button>
            <button
              onClick={() => setActiveActivityTab('order')}
              style={{
                background: activeActivityTab === 'order' ? '#EFF6FF' : 'none',
                color: activeActivityTab === 'order' ? '#2563EB' : '#64748B',
                border: 'none',
                borderRadius: 4,
                padding: '4px 10px',
                fontSize: 12,
                fontWeight: activeActivityTab === 'order' ? 600 : 500,
                cursor: 'pointer',
              }}
            >
              Đơn hàng
            </button>
          </div>

          {/* Activity Category badges */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 14,
            }}
          >
            {['Hoạt động', 'Nhiệm vụ', 'Lịch hẹn', 'Cuộc gọi', 'Đi tuyến'].map((cat) => (
              <span
                key={cat}
                style={{
                  backgroundColor: '#F1F5F9',
                  borderRadius: 4,
                  padding: '2px 8px',
                  fontSize: 11,
                  color: '#475569',
                  fontWeight: 500,
                }}
              >
                {cat}
              </span>
            ))}
          </div>

          {/* Metrics summary list */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              gap: 8,
              fontSize: 11,
              color: '#64748B',
              backgroundColor: '#FAFAFA',
              padding: 10,
              borderRadius: 6,
              marginBottom: 10,
            }}
          >
            <div>SL cơ hội: <strong>0</strong></div>
            <div>SL thua: <strong>0</strong></div>
            <div>SL thắng: <strong>0</strong></div>
            <div>DS thắng: <strong>0</strong></div>
            <div>SL đơn hàng: <strong>{stats.orderCount}</strong></div>
            <div>SL khách hàng: <strong>{totalCustomers}</strong></div>
            <div>Doanh số đề nghị ghi: <strong>0</strong></div>
            <div>DS đã ghi: <strong>0</strong></div>
          </div>
        </ChartCard>

        <ChartCard
          title="Doanh số theo loại khách hàng"
          topMetric={0}
          timestamp={timestamp}
          onReload={() => void loadDashboardData()}
          emptyType="pie"
        />
      </div>

      {/* AI Analysis Modal */}
      <Modal
        title="Trợ thủ Phân tích Kinh doanh với AI"
        open={aiModalVisible}
        onCancel={() => setAiModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setAiModalVisible(false)}>
            Đóng
          </Button>,
        ]}
      >
        <div style={{ padding: 14, fontSize: 13, lineHeight: 1.6, color: '#334155' }}>
          <p style={{ fontWeight: 600, color: '#1E293B', marginBottom: 10 }}>
            Tóm tắt đánh giá tình hình kinh doanh tháng này:
          </p>
          <ul style={{ paddingLeft: 18, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <li>Hệ thống đang ở trạng thái mới khởi tạo, chưa ghi nhận đơn bán hàng trong kỳ.</li>
            <li>Đơn hàng cần xử lý: 0 đơn. Công nợ cần thu hồi: 0 đ.</li>
            <li>Khuyến nghị: Bổ sung khách hàng tiềm năng, tạo báo giá và xác nhận đơn hàng đầu tiên để kích hoạt biểu đồ phân tích tự động.</li>
          </ul>
        </div>
      </Modal>

      {/* Edit Dashboard Layout Modal */}
      <Modal
        title="Tùy chỉnh Bàn làm việc & Tiện ích"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            Hủy
          </Button>,
          <Button key="save" type="primary" onClick={() => { setEditModalVisible(false); message.success('Đã lưu cấu hình bàn làm việc.'); }}>
            Lưu thay đổi
          </Button>,
        ]}
      >
        <div style={{ padding: 14, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, color: '#64748B' }}>
            Chọn các thẻ biểu đồ và tiện ích muốn hiển thị trên trang Tổng quan tình hình kinh doanh:
          </p>
          {[
            'Mục tiêu doanh số theo thời gian',
            'Doanh số theo đơn vị',
            'Doanh số theo hàng hóa',
            'Mục tiêu doanh số theo đơn vị',
            'Doanh số theo thời gian',
            'Nhân viên xuất sắc',
            'Tình hình thực hiện mục tiêu doanh số',
            'Hàng hóa bán chạy theo giá trị',
            'Tình hình thực hiện hoạt động',
            'Doanh số theo loại khách hàng',
          ].map((item) => (
            <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked />
              <span style={{ color: '#1E293B', fontWeight: 500 }}>{item}</span>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
};
