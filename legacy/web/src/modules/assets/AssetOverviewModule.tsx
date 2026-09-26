import React, { useEffect, useMemo, useState } from 'react';
import {
  BarChartOutlined,
  ClockCircleOutlined,
  DownloadOutlined,
  PieChartOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Button, Progress, Tag, message } from '../../custom-ui';
import { auditLogsApi, type AuditLogEntry } from '../../api/endpoints';
import { dataService, type AssetRecord } from '../../services/dataService';

const TODAY = new Date('2026-08-29T00:00:00');

const formatMoney = (amount: number) => `${amount.toLocaleString('vi-VN')} ₫`;

const parseDate = (value?: string) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const daysBetween = (left: Date, right: Date) => Math.ceil((right.getTime() - left.getTime()) / (1000 * 60 * 60 * 24));

export const AssetOverviewModule: React.FC = () => {
  const [assets, setAssets] = useState<AssetRecord[]>([]);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'category' | 'lifecycle' | 'maintenance'>('category');

  useEffect(() => {
    const syncAssets = () => setAssets(dataService.getAssets());
    syncAssets();
    const unsubscribe = dataService.subscribe(syncAssets);
    auditLogsApi.getAll(1, 50).then((response) => {
      setLogs(response.data.data || []);
    }).catch(() => {});
    return unsubscribe;
  }, []);

  const totalOriginalValue = assets.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const inUseCount = assets.filter((item) => item.status === 'Đang sử dụng').length;
  const inStockCount = assets.filter((item) => item.status === 'Trong kho').length;
  const issueCount = assets.filter((item) => /sửa|bảo trì|thanh lý|kiểm kê/i.test(item.status || '')).length;

  const categoryBreakdown = useMemo(() => {
    const grouped = new Map<string, { count: number; value: number }>();
    assets.forEach((item) => {
      const key = item.category || 'Chưa phân loại';
      const current = grouped.get(key) || { count: 0, value: 0 };
      current.count += 1;
      current.value += Number(item.value || 0);
      grouped.set(key, current);
    });
    return Array.from(grouped.entries())
      .sort((left, right) => right[1].value - left[1].value)
      .map(([name, value], index) => ({
        name,
        count: value.count,
        value: value.value,
        pct: totalOriginalValue > 0 ? Math.round((value.value / totalOriginalValue) * 100) : 0,
        color: ['#009688', '#1565C0', '#F59E0B', '#7C3AED', '#16A34A'][index % 5],
      }));
  }, [assets, totalOriginalValue]);

  const lifecycleStats = useMemo(() => {
    const recentAssets = assets.filter((item) => {
      const purchaseDate = parseDate(item.purchaseDate);
      return purchaseDate ? daysBetween(purchaseDate, TODAY) <= 365 : false;
    }).length;
    const agedAssets = assets.filter((item) => {
      const purchaseDate = parseDate(item.purchaseDate);
      return purchaseDate ? daysBetween(purchaseDate, TODAY) > 365 * 3 : false;
    }).length;
    return { recentAssets, agedAssets };
  }, [assets]);

  const recentActivities = useMemo(() => (
    logs
      .filter((item) => /tài sản|assets/i.test(item.module || '') || /tài sản/i.test(item.detail || ''))
      .slice(0, 6)
  ), [logs]);

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nguyên giá tài sản</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {formatMoney(totalOriginalValue)}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>{assets.length} tài sản đang được quản trị</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tài sản đang khai thác</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {inUseCount} / {assets.length || 0}
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>{inStockCount} tài sản đang ở kho</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tài sản cần xử lý</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {issueCount}
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Đang sửa chữa, bảo trì, kiểm kê hoặc chờ thanh lý</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Vòng đời tài sản</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {lifecycleStats.recentAssets} mới
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>{lifecycleStats.agedAssets} tài sản đã trên 3 năm</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'category', label: 'Cơ cấu nhóm tài sản' },
            { key: 'lifecycle', label: 'Vòng đời' },
            { key: 'maintenance', label: 'Hoạt động gần đây' },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setActiveTab(tab.key as typeof activeTab)}
              style={{
                backgroundColor: activeTab === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: activeTab === tab.key ? '#009688' : '#CBD5E1',
                color: activeTab === tab.key ? '#00796B' : '#475569',
                fontWeight: activeTab === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            icon={<DownloadOutlined />}
            onClick={() => message.success('Đã chuẩn bị xuất báo cáo tài sản từ dữ liệu hiện có.')}
            style={{ backgroundColor: '#009688', borderColor: '#009688', color: '#FFFFFF' }}
          >
            Xuất báo cáo
          </Button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 16 }}>
        {(activeTab === 'category' || activeTab === 'lifecycle') && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '18px 20px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px 0', color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeTab === 'category' ? <PieChartOutlined style={{ color: '#009688' }} /> : <ClockCircleOutlined style={{ color: '#F59E0B' }} />}
              {activeTab === 'category' ? 'Cơ cấu tài sản theo nhóm' : 'Phân tầng vòng đời tài sản'}
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {activeTab === 'category' ? (
                categoryBreakdown.length === 0 ? (
                  <div style={{ fontSize: 13, color: '#64748B' }}>Chưa có tài sản để tổng hợp.</div>
                ) : categoryBreakdown.map((cat) => (
                  <div key={cat.name}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4, gap: 12 }}>
                      <span style={{ fontWeight: 600, color: '#0F172A' }}>{cat.name} ({cat.count} cái)</span>
                      <span style={{ fontWeight: 700, color: cat.color }}>{formatMoney(cat.value)} ({cat.pct}%)</span>
                    </div>
                    <div style={{ background: '#F1F5F9', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: `${cat.pct}%`, background: cat.color, height: '100%', borderRadius: 4 }} />
                    </div>
                  </div>
                ))
              ) : (
                <>
                  <div style={{ padding: '12px 14px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Tài sản mua trong 12 tháng gần nhất</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 6 }}>{lifecycleStats.recentAssets}</div>
                  </div>
                  <div style={{ padding: '12px 14px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Tài sản đã trên 3 năm sử dụng</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 6 }}>{lifecycleStats.agedAssets}</div>
                  </div>
                  <div style={{ padding: '12px 14px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Tỷ lệ tài sản đang khai thác</div>
                    <Progress percent={assets.length > 0 ? Math.round((inUseCount / assets.length) * 100) : 0} strokeColor="#009688" showInfo />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {(activeTab === 'maintenance' || activeTab === 'category') && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '18px 20px' }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px 0', color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              {activeTab === 'maintenance' ? <ToolOutlined style={{ color: '#1E40AF' }} /> : <BarChartOutlined style={{ color: '#1E40AF' }} />}
              Nhật ký tài sản gần đây
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recentActivities.length === 0 ? (
                <div style={{ fontSize: 13, color: '#64748B' }}>Chưa có nhật ký tài sản trong audit log.</div>
              ) : recentActivities.map((act) => (
                <div key={act.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 10, borderBottom: '1px solid #F1F5F9' }}>
                  <Tag color={/xóa/i.test(act.action) ? 'error' : /cập nhật/i.test(act.action) ? 'warning' : 'green'}>
                    {act.module || 'Tài sản'}
                  </Tag>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A' }}>{act.action}</div>
                    <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{act.user} · {act.timestamp}</div>
                    {act.detail ? <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>{act.detail}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
