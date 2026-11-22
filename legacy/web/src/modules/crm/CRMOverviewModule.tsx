import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ReloadOutlined,
  EditOutlined,
  InfoCircleOutlined,
  ApartmentOutlined,
  FileTextOutlined,
  ShopOutlined,
  RiseOutlined,
} from '@ant-design/icons';
import { Button, Input, Modal, Select, message } from '../../custom-ui';
import { collectionsApi, financeDocumentsApi, crmContactsApi, systemApi, FinanceDocument, type CrmContact } from '../../api/endpoints';
import { NO_DEPARTMENT, activitySummary, monthlySales, overdueReceivables, revenueDocs, saleNet, salesByCustomerKind, salesByDepartment, salesByItem, salesBySalesperson, targetPeriodsForFilter, targetProgress, topCustomers } from './crmOverviewRules';

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
        {badge && <div
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
        </div>}
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

const CRM_HIDDEN_WIDGETS_KEY = 'kiyovn_crm_overview_hidden_widgets';
const CRM_OVERVIEW_WIDGETS = ['Doanh số theo thời gian', 'Doanh số theo loại khách hàng', 'Khách hàng có doanh số cao nhất', 'Tình hình thực hiện hoạt động', 'Mục tiêu doanh số', 'Doanh số theo nhân viên bán hàng', 'Doanh số theo đơn vị', 'Doanh số theo hàng hóa'];

// Biểu đồ cột 12 tháng và danh sách thanh ngang vẽ bằng thẻ div (dự án không dùng thư viện biểu đồ).
const MonthBars: React.FC<{ values: number[]; targets?: number[] }> = ({ values, targets }) => {
  const max = Math.max(...values, ...(targets || []), 0);
  if (!max) return null;
  const bar = (value: number, color: string) => <div style={{ flex: 1, height: `${Math.max(2, Math.round(value / max * 120))}px`, background: value ? color : '#E2E8F0', borderRadius: 3 }} />;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 150, paddingTop: 8 }}>
        {values.map((value, index) => (
          <div key={index} title={`Tháng ${index + 1}: ${value.toLocaleString('vi-VN')} ₫${targets ? ` / mục tiêu ${targets[index].toLocaleString('vi-VN')} ₫` : ''}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, height: '100%', justifyContent: 'flex-end' }}>
            <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', gap: 2 }}>
              {targets && bar(targets[index], '#CBD5E1')}
              {bar(value, '#2563EB')}
            </div>
            <span style={{ fontSize: 10.5, color: '#64748B' }}>T{index + 1}</span>
          </div>
        ))}
      </div>
      {targets && <div style={{ display: 'flex', gap: 12, fontSize: 11.5, color: '#64748B', marginTop: 6 }}><span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#CBD5E1', borderRadius: 2, marginRight: 4 }} />Mục tiêu</span><span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#2563EB', borderRadius: 2, marginRight: 4 }} />Thực hiện</span></div>}
    </div>
  );
};

const BarList: React.FC<{ rows: Array<{ label: string; value: number; note: string }> }> = ({ rows }) => {
  const max = Math.max(...rows.map((row) => row.value), 0) || 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {rows.map((row) => (
        <div key={row.label}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, color: '#334155', marginBottom: 4 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.label}</span>
            <span style={{ color: '#64748B', whiteSpace: 'nowrap' }}>{row.note}</span>
          </div>
          <div style={{ height: 8, background: '#F1F5F9', borderRadius: 4 }}>
            <div style={{ width: `${Math.round(row.value / max * 100)}%`, height: '100%', background: '#2563EB', borderRadius: 4 }} />
          </div>
        </div>
      ))}
    </div>
  );
};

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

// Bộ lọc thời gian của tổng quan kinh doanh áp dụng lên ngày chứng từ (YYYY-MM-DD).
const inTimeRange = (dateText: string, filter: string, now = new Date()): boolean => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateText || ''));
  if (!match) return false;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  if (filter === 'today') return day(date) === day(now);
  if (filter === 'this_week') {
    const offset = (now.getDay() + 6) % 7;
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset);
    return day(date) >= day(monday) && day(date) < day(monday) + 7 * 86400000;
  }
  if (filter === 'this_month') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
  if (filter === 'this_quarter') return date.getFullYear() === now.getFullYear() && Math.floor(date.getMonth() / 3) === Math.floor(now.getMonth() / 3);
  if (filter === 'this_year') return date.getFullYear() === now.getFullYear();
  if (/^\d{4}$/.test(filter)) return date.getFullYear() === Number(filter);
  return true;
};

export const CRMOverviewModule: React.FC = () => {
  const [timeFilter, setTimeFilter] = useState<string>('this_month');
  const [companyName, setCompanyName] = useState<string>('');
  const [orgUnit, setOrgUnit] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(false);
  const [timestamp, setTimestamp] = useState<string>('');
  const [aiModalVisible, setAiModalVisible] = useState<boolean>(false);
  const [editModalVisible, setEditModalVisible] = useState<boolean>(false);
  // Thẻ ẩn trên bàn làm việc, lưu theo trình duyệt (trước đây nút Lưu chỉ báo thành công, không ẩn hay hiện được thẻ nào).
  const [hiddenWidgets, setHiddenWidgets] = useState<string[]>(() => { try { const saved = JSON.parse(localStorage.getItem(CRM_HIDDEN_WIDGETS_KEY) || '[]'); return Array.isArray(saved) ? saved : []; } catch { return []; } });
  const [draftHidden, setDraftHidden] = useState<string[]>([]);
  const showWidget = (title: string) => !hiddenWidgets.includes(title);

  // Real data state
  const [salesDocuments, setSalesDocuments] = useState<FinanceDocument[]>([]);
  const [customers, setCustomers] = useState<CrmContact[]>([]);
  // Mục tiêu doanh số theo tháng (phạm vi crm_sales_targets, khóa YYYY-MM).
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [targetModalOpen, setTargetModalOpen] = useState(false);
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [targetDraft, setTargetDraft] = useState<string[]>([]);
  const [savingTargets, setSavingTargets] = useState(false);

  const getCurrentTimeString = useCallback(() => {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }, []);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const [docsRes, contactsRes, profileRes, targetsRes] = await Promise.allSettled([
        financeDocumentsApi.getAll(),
        crmContactsApi.getAll('customer'),
        systemApi.getCompanyProfile(),
        collectionsApi.get<{ key: string; period: string; amount: number }>('crm_sales_targets', { limit: 1000 }),
      ]);
      if (targetsRes.status === 'fulfilled') {
        setTargets(Object.fromEntries((targetsRes.value.data?.data || []).map((item) => [item.period || item.key, Number(item.amount) || 0])));
      }

      if (docsRes.status === 'fulfilled' && docsRes.value.data?.data) {
        const sales = docsRes.value.data.data.filter(
          (doc) => doc.documentType === 'sale' && doc.status !== 'Đã hủy'
        );
        setSalesDocuments(sales);
      }

      if (contactsRes.status === 'fulfilled' && contactsRes.value.data?.data) {
        setCustomers(contactsRes.value.data.data);
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

  // Số liệu trong kỳ lọc: doanh số chỉ tính đơn, hợp đồng bán còn hiệu lực (không tính báo giá, chứng từ đã hủy và chứng từ điều chỉnh giảm).
  // Lọc theo đơn vị: phòng ban của nhân viên bán hàng ghi trên chứng từ.
  const departmentOptions = useMemo(() => [...new Set(salesDocuments.filter((doc) => doc.salespersonId).map((doc) => doc.salespersonDepartment || NO_DEPARTMENT))].sort(), [salesDocuments]);
  const unitDocs = useMemo(() => orgUnit === 'all' ? salesDocuments : salesDocuments.filter((doc) => doc.salespersonId && (doc.salespersonDepartment || NO_DEPARTMENT) === orgUnit), [salesDocuments, orgUnit]);
  const periodDocs = useMemo(() => unitDocs.filter((doc) => inTimeRange(doc.documentDate, timeFilter)), [unitDocs, timeFilter]);
  const stats = useMemo(() => {
    const documents = revenueDocs(periodDocs);
    const orderValue = documents.reduce((sum, doc) => sum + saleNet(doc), 0);
    const remainingValue = documents.reduce((sum, doc) => sum + (doc.remainingAmount || 0), 0);
    const collectedValue = Math.max(0, orderValue - remainingValue);
    return { orderCount: documents.length, orderValue, collectedValue, remainingValue };
  }, [periodDocs]);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = useMemo(() => overdueReceivables(unitDocs, today), [unitDocs, today]);
  const activity = useMemo(() => activitySummary(periodDocs), [periodDocs]);
  const byKind = useMemo(() => salesByCustomerKind(periodDocs, customers), [periodDocs, customers]);
  const top = useMemo(() => topCustomers(periodDocs, customers, 5), [periodDocs, customers]);
  const chartYear = /^\d{4}$/.test(timeFilter) ? Number(timeFilter) : new Date().getFullYear();
  const months = useMemo(() => monthlySales(unitDocs, chartYear), [unitDocs, chartYear]);
  const companyMonths = useMemo(() => monthlySales(salesDocuments, chartYear), [salesDocuments, chartYear]);
  const bySeller = useMemo(() => salesBySalesperson(periodDocs), [periodDocs]);
  const byDepartment = useMemo(() => salesByDepartment(periodDocs), [periodDocs]);
  const byItem = useMemo(() => salesByItem(periodDocs).slice(0, 10), [periodDocs]);
  const money = (value: number) => `${value.toLocaleString('vi-VN')} ₫`;
  // Mục tiêu đặt cho toàn doanh nghiệp nên luôn so với doanh số toàn doanh nghiệp.
  const progress = useMemo(() => targetProgress(companyMonths, targets, chartYear), [companyMonths, targets, chartYear]);
  const periodTargetKeys = targetPeriodsForFilter(timeFilter);
  const periodTarget = periodTargetKeys.reduce((sum, key) => sum + (targets[key] || 0), 0);
  const periodTargetText = orgUnit !== 'all' ? 'Mục tiêu đặt cho toàn doanh nghiệp, không so theo đơn vị' : !periodTargetKeys.length ? 'Không so với mục tiêu tháng khi lọc theo ngày, tuần' : periodTarget ? `${money(stats.orderValue)} / ${money(periodTarget)} (${Math.round(stats.orderValue / periodTarget * 1000) / 10}%)` : 'Chưa đặt mục tiêu cho kỳ này';

  const openTargetModal = (year: number) => {
    setTargetYear(year);
    setTargetDraft(Array.from({ length: 12 }, (_, index) => { const value = targets[`${year}-${String(index + 1).padStart(2, '0')}`]; return value ? String(value) : ''; }));
    setTargetModalOpen(true);
  };
  const saveTargets = async () => {
    const amounts = targetDraft.map((text) => (text.trim() === '' ? null : Number(text.replace(/[.\s]/g, ''))));
    if (amounts.some((value) => value !== null && (!Number.isSafeInteger(value) || value < 0))) { message.error('Mục tiêu mỗi tháng phải là số tiền nguyên không âm.'); return; }
    setSavingTargets(true);
    try {
      for (const [index, amount] of amounts.entries()) {
        const period = `${targetYear}-${String(index + 1).padStart(2, '0')}`;
        const exists = targets[period] !== undefined;
        if (amount === null) { if (exists) await collectionsApi.remove('crm_sales_targets', period); continue; }
        if (exists && targets[period] === amount) continue;
        if (exists) await collectionsApi.update('crm_sales_targets', period, { key: period, period, amount });
        else await collectionsApi.create('crm_sales_targets', { key: period, period, amount }, period);
      }
      message.success(`Đã lưu mục tiêu doanh số năm ${targetYear}.`);
      setTargetModalOpen(false);
      await loadDashboardData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được mục tiêu doanh số.');
      await loadDashboardData();
    } finally {
      setSavingTargets(false);
    }
  };

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
          {/* Lọc theo phòng ban của nhân viên bán hàng ghi trên chứng từ; chứng từ chưa gán nhân viên chỉ tính khi chọn toàn doanh nghiệp. */}
          <Select
            value={orgUnit}
            onChange={(val) => setOrgUnit(String(val))}
            style={{ width: 180 }}
            options={[{ value: 'all', label: 'Toàn doanh nghiệp' }, ...departmentOptions.map((value) => ({ value, label: value }))]}
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
              { value: String(new Date().getFullYear() - 1), label: `Năm ${new Date().getFullYear() - 1}` },
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
            <FileTextOutlined />
            <span>Tóm tắt kinh doanh</span>
          </Button>

          <Button
            onClick={() => { setDraftHidden(hiddenWidgets); setEditModalVisible(true); }}
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
          badge={activity.quotes.count ? `${activity.quotes.count} báo giá` : ''}
          bgColor="#5E48E8"
          tooltipText="Số đơn bán, hợp đồng bán trong kỳ (không tính báo giá, chứng từ đã hủy)"
        />
        <MetricCard
          title="Giá trị đơn hàng"
          value={stats.orderValue.toLocaleString('vi-VN')}
          badge=""
          bgColor="#2563EB"
          tooltipText="Giá trị đơn bán, hợp đồng bán trong kỳ, đã trừ hàng trả lại và giảm giá"
        />
        <MetricCard
          title="Thực thu đơn hàng"
          value={stats.collectedValue.toLocaleString('vi-VN')}
          badge={stats.orderValue ? `${Math.round(stats.collectedValue / stats.orderValue * 100)}%` : ''}
          bgColor="#0EA5E9"
          tooltipText="Số tiền khách hàng đã thanh toán thực tế"
        />
        <MetricCard
          title="Còn phải thu đơn hàng"
          value={stats.remainingValue.toLocaleString('vi-VN')}
          badge={overdue.count ? `${overdue.count} quá hạn` : ''}
          bgColor="#F97316"
          tooltipText="Công nợ còn phải thu của các đơn hàng"
        />
      </div>

      {/* Các thẻ biểu đồ: số liệu tính từ chứng từ bán hàng và hồ sơ khách hàng. Thẻ cần dữ liệu hệ thống chưa có (mục tiêu doanh số, đơn vị bán, dòng
          hàng hóa trên chứng từ) ghi rõ lý do thay vì số liệu giả. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
        {showWidget('Doanh số theo thời gian') && (<ChartCard title="Doanh số theo thời gian" subtitle={String(chartYear)} topMetric={money(months.reduce((sum, value) => sum + value, 0))} timestamp={timestamp} onReload={() => void loadDashboardData()} emptyType="bar" emptyText={`Chưa có doanh số năm ${chartYear}`}>
          {months.some(Boolean) ? <MonthBars values={months} /> : undefined}
        </ChartCard>)}
        {showWidget('Doanh số theo loại khách hàng') && (<ChartCard title="Doanh số theo loại khách hàng" topMetric={money(stats.orderValue)} timestamp={timestamp} onReload={() => void loadDashboardData()} emptyType="pie" emptyText="Chưa có doanh số trong kỳ">
          {byKind.length ? <BarList rows={byKind.map((row) => ({ label: row.label, value: row.value, note: money(row.value) }))} /> : undefined}
        </ChartCard>)}
        {showWidget('Khách hàng có doanh số cao nhất') && (<ChartCard title="Khách hàng có doanh số cao nhất" timestamp={timestamp} onReload={() => void loadDashboardData()} emptyType="doc" emptyText="Chưa có doanh số trong kỳ">
          {top.length ? <BarList rows={top.map((row) => ({ label: row.label, value: row.value, note: `${money(row.value)} · ${row.count} chứng từ` }))} /> : undefined}
        </ChartCard>)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
        {showWidget('Tình hình thực hiện hoạt động') && (<ChartCard title="Tình hình thực hiện hoạt động" timestamp={timestamp} onReload={() => void loadDashboardData()} emptyType="doc">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
            {[
              ['Báo giá trong kỳ', activity.quotes],
              ['Đơn, hợp đồng đang triển khai', activity.inProgress],
              ['Đơn, hợp đồng đã bàn giao', activity.delivered],
            ].map(([label, item]: any) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#F8FAFC', borderRadius: 6 }}>
                <span style={{ color: '#475569' }}>{label}</span>
                <span style={{ color: '#0F172A' }}>{item.count} chứng từ · {money(item.value)}</span>
              </div>
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: overdue.count ? '#FEF2F2' : '#F8FAFC', borderRadius: 6 }}>
              <span style={{ color: '#475569' }}>Công nợ quá hạn (tất cả kỳ)</span>
              <span style={{ color: overdue.count ? '#DC2626' : '#0F172A' }}>{overdue.count} chứng từ · {money(overdue.value)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 10px', background: '#F8FAFC', borderRadius: 6 }}>
              <span style={{ color: '#475569' }}>Khách hàng trong danh bạ</span>
              <span style={{ color: '#0F172A' }}>{customers.length}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, padding: '8px 10px', background: '#F8FAFC', borderRadius: 6 }}>
              <span style={{ color: '#475569' }}>Mục tiêu kỳ đang lọc</span>
              <span style={{ color: '#0F172A', textAlign: 'right' }}>{periodTargetText}</span>
            </div>
          </div>
        </ChartCard>)}
        {showWidget('Mục tiêu doanh số') && (<ChartCard title="Mục tiêu doanh số" subtitle={String(chartYear)} extraHeader={<Button onClick={() => openTargetModal(chartYear)}>Đặt mục tiêu</Button>} topMetric={progress.percent === null ? undefined : `${progress.percent}%`} timestamp={timestamp} onReload={() => void loadDashboardData()} emptyType="line" emptyText={`Chưa đặt mục tiêu doanh số năm ${chartYear}`}>
          {progress.targetTotal ? (
            <div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginBottom: 4 }}>Thực hiện {money(progress.actualTotal)} / mục tiêu {money(progress.targetTotal)}</div>
              <MonthBars values={companyMonths} targets={progress.rows.map((row) => row.target)} />
            </div>
          ) : undefined}
        </ChartCard>)}
        {showWidget('Doanh số theo nhân viên bán hàng') && (<ChartCard title="Doanh số theo nhân viên bán hàng" timestamp={timestamp} onReload={() => void loadDashboardData()} emptyType="bar" emptyText="Chưa có doanh số trong kỳ">
          {bySeller.length ? <BarList rows={bySeller.map((row) => ({ label: row.label, value: row.value, note: `${money(row.value)} · ${row.count} chứng từ` }))} /> : undefined}
        </ChartCard>)}
        {showWidget('Doanh số theo đơn vị') && (<ChartCard title="Doanh số theo đơn vị" timestamp={timestamp} onReload={() => void loadDashboardData()} emptyType="bar" emptyText="Chưa có doanh số trong kỳ">
          {byDepartment.length ? <BarList rows={byDepartment.map((row) => ({ label: row.label, value: row.value, note: money(row.value) }))} /> : undefined}
        </ChartCard>)}
        {showWidget('Doanh số theo hàng hóa') && (<ChartCard title="Doanh số theo hàng hóa" subtitle="Chưa thuế GTGT" timestamp={timestamp} onReload={() => void loadDashboardData()} emptyType="bar" emptyText="Chưa có doanh số trong kỳ">
          {byItem.length ? <BarList rows={byItem.map((row) => ({ label: row.label, value: row.value, note: `${money(row.value)}${row.quantity ? ` · ${row.quantity.toLocaleString('vi-VN')}${row.unit ? ` ${row.unit}` : ''}` : ''} · ${row.count} chứng từ` }))} /> : undefined}
        </ChartCard>)}
      </div>

      {/* Tóm tắt tình hình kinh doanh: tính từ số liệu thật của kỳ đang lọc (trước đây là hộp thoại "Phân tích với AI" với chữ cố định). */}
      <Modal
        title="Tóm tắt tình hình kinh doanh"
        open={aiModalVisible}
        onCancel={() => setAiModalVisible(false)}
        footer={[
          <Button key="close" onClick={() => setAiModalVisible(false)}>
            Đóng
          </Button>,
        ]}
      >
        <ul style={{ paddingLeft: 18, margin: '8px 0', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: '#334155', lineHeight: 1.6 }}>
          <li>Trong kỳ có {stats.orderCount} đơn, hợp đồng bán, giá trị {money(stats.orderValue)}; đã thu {money(stats.collectedValue)}, còn phải thu {money(stats.remainingValue)}.</li>
          <li>{activity.quotes.count} báo giá trị giá {money(activity.quotes.value)}; {activity.inProgress.count} chứng từ đang triển khai, {activity.delivered.count} chứng từ đã bàn giao.</li>
          <li>{overdue.count ? `Có ${overdue.count} chứng từ quá hạn thanh toán, tổng ${money(overdue.value)} cần thu hồi.` : 'Không có công nợ quá hạn.'}</li>
          <li>Mục tiêu doanh số: {periodTargetText}.</li>
          <li>{top.length ? `Khách hàng doanh số cao nhất: ${top.slice(0, 3).map((row) => `${row.label} (${money(row.value)})`).join(', ')}.` : 'Chưa có doanh số theo khách hàng trong kỳ.'}</li>
        </ul>
      </Modal>

      <Modal title={`Mục tiêu doanh số năm ${targetYear}`} open={targetModalOpen} onCancel={() => setTargetModalOpen(false)} footer={null} width={620}>
        <div style={{ fontSize: 12.5, color: '#64748B', marginBottom: 12 }}>
          Nhập doanh số cần đạt từng tháng (giá trị đơn bán, hợp đồng bán, đồng). Để trống tháng nào thì tháng đó không đặt mục tiêu.
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: '#334155' }}>Năm</span>
          <Select value={targetYear} style={{ width: 120 }} onChange={(value) => openTargetModal(Number(value))}
            options={[-1, 0, 1].map((offset) => ({ value: new Date().getFullYear() + offset, label: String(new Date().getFullYear() + offset) }))} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {targetDraft.map((value, index) => (
            <div key={index}>
              <div style={{ fontSize: 12, color: '#64748B', marginBottom: 4 }}>Tháng {index + 1}</div>
              <Input type="number" min={0} value={value} onChange={(event: any) => setTargetDraft((current) => current.map((item, i) => (i === index ? event.target.value : item)))} />
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <Button onClick={() => setTargetModalOpen(false)}>Hủy</Button>
          <Button type="primary" loading={savingTargets} onClick={() => void saveTargets()}>Lưu mục tiêu</Button>
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
          <Button key="save" type="primary" onClick={() => { setHiddenWidgets(draftHidden); try { localStorage.setItem(CRM_HIDDEN_WIDGETS_KEY, JSON.stringify(draftHidden)); } catch { /* bộ nhớ trình duyệt đầy hoặc bị chặn: cấu hình chỉ giữ trong phiên */ } setEditModalVisible(false); message.success('Đã lưu cấu hình bàn làm việc trên trình duyệt này.'); }}>
            Lưu thay đổi
          </Button>,
        ]}
      >
        <div style={{ padding: 14, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ margin: 0, color: '#64748B' }}>
            Chọn các thẻ biểu đồ và tiện ích muốn hiển thị trên trang Tổng quan tình hình kinh doanh:
          </p>
          {CRM_OVERVIEW_WIDGETS.map((item) => (
            <label key={item} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input type="checkbox" checked={!draftHidden.includes(item)} onChange={(event) => setDraftHidden((current) => event.target.checked ? current.filter((title) => title !== item) : [...current, item])} />
              <span style={{ color: '#1E293B', fontWeight: 500 }}>{item}</span>
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
};
