import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  DownloadOutlined,
  PrinterOutlined,
  SearchOutlined,
  EyeOutlined,
  HistoryOutlined,
  ProjectOutlined,
  DollarOutlined,
  PlusOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Select, message, Tag, Input, Drawer, Modal, Form } from '../../custom-ui';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { availablePlanReportYears, buildPlanReportRows, createPlanReportSnapshot, planReportExportRows, planReportSummary } from './planReportRules';
import type { PlanReportRow, ReportBudgetSource, ReportPlanSource, ReportProgressSource } from './planReportRules';

type PlanReportItem = PlanReportRow;

export const PlanReportsModule: React.FC = () => {
  const [plans, setPlans] = useState<ReportPlanSource[]>([]);
  const [progress, setProgress] = useState<ReportProgressSource[]>([]);
  const [budgets, setBudgets] = useState<ReportBudgetSource[]>([]);
  const [savedReports, setSavedReports] = useState<Array<PlanReportRow & { reportPeriod?: string; generatedAt?: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    const sync = () => {
      if (!active) return;
      setPlans(dataService.getGenericData('plan_items') || []);
      setProgress(dataService.getGenericData('plan_progress') || []);
      setBudgets(dataService.getGenericData('finance_budgets') || []);
      setSavedReports(dataService.getGenericData('plan_reports') || []);
    };
    const unsub = dataService.subscribe(sync);
    void Promise.allSettled([
      dataService.refreshGenericData('plan_items'),
      dataService.refreshGenericData('plan_progress'),
      dataService.refreshGenericData('finance_budgets'),
      dataService.refreshGenericData('plan_reports'),
    ]).then((results) => {
      if (!active) return;
      sync();
      if (results.some((result) => result.status === 'rejected')) message.error('Một số nguồn dữ liệu báo cáo chưa tải được.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; unsub(); };
  }, []);

  const [period, setPeriod] = useState('all');
  const [filterTab, setFilterTab] = useState<'all' | 'excellent' | 'good' | 'top_budget'>('all');
  const [searchText, setSearchText] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PlanReportItem | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [form] = Form.useForm();
  const reportRows = buildPlanReportRows(plans, progress, budgets, period);
  const years = availablePlanReportYears(plans, budgets);
  const data: PlanReportItem[] = reportRows;
  const summary = planReportSummary(data);
  const totalBudget = summary.approvedBudget ?? 0;
  const budgetDepartments = summary.budgetDepartments;
  const totalSpent = summary.actualSpent ?? 0;
  const spendDepartments = summary.spendDepartments;
  const totalVariance = summary.variance ?? 0;
  const varianceDepartments = data.filter((item) => item.variance !== null).length;
  const avgProgress = summary.averageProgress;
  const progressDepartments = data.filter((item) => item.progressScore !== null).length;

  const filteredData = data.filter((item) => {
    let matchTab = true;
    if (filterTab === 'excellent') matchTab = item.evaluation === 'Hoàn thành';
    else if (filterTab === 'good') matchTab = item.evaluation === 'Đang triển khai';
    else if (filterTab === 'top_budget') matchTab = (item.approvedBudget ?? 0) >= 1000000000;

    const matchSearch =
      !searchText ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.leader || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.evaluation || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const handleCreateEvaluation = async (values: any) => {
    const source = data.find((item) => item.department === values.department);
    if (!source || saving) return;
    setSaving(true);
    try {
      const snapshot = createPlanReportSnapshot(source, period);
      await dataService.createGenericRecord('plan_reports', snapshot);
      message.success(`Đã lưu báo cáo ${period === 'all' ? 'toàn kỳ' : `năm ${period}`} cho ${source.department}.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu báo cáo.');
    } finally {
      setSaving(false);
    }
  };

  const exportPdf = (rows: PlanReportItem[], filename: string) => downloadFile(filename, generateValidPdfBlob(
    'BÁO CÁO KẾ HOẠCH THEO ĐƠN VỊ', `${period === 'all' ? 'Toàn kỳ' : `Năm ${period}`} | ${rows.length} đơn vị`, rows.map((item) =>
      `${item.department} | ${item.leader} | Kế hoạch ${item.completedPlans}/${item.totalPlans} | Ngân sách ${item.approvedBudget?.toLocaleString('vi-VN') ?? 'Chưa có dữ liệu'} | Đã chi ${item.actualSpent?.toLocaleString('vi-VN') ?? 'Chưa có dữ liệu'} | Tiến độ ${item.progressScore === null ? 'Chưa có dữ liệu' : `${item.progressScore}%`} | ${item.evaluation}`,
    ),
  ));

  const columns = [
    {
      title: 'Khối / Đơn vị thực hiện',
      key: 'department',
      render: (_: any, record: PlanReportItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>
            {record.department}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Chủ trì: <strong>{record.leader}</strong>
          </div>
        </div>
      ),
    },
    {
      title: 'Kế hoạch',
      key: 'plans',
      render: (_: any, record: PlanReportItem) => {
        const pct = record.totalPlans ? Math.round((record.completedPlans / record.totalPlans) * 100) : null;
        return (
          <div>
            <span style={{ fontWeight: 700, color: '#1E40AF' }}>
              {record.completedPlans} / {record.totalPlans} kế hoạch{pct === null ? '' : ` · ${pct}%`}
            </span>
            {pct !== null && <div style={{ width: 120, background: '#E2E8F0', height: 5, borderRadius: 3, marginTop: 4 }}>
              <div style={{ width: `${pct}%`, background: pct === 100 ? '#16A34A' : '#3B82F6', height: '100%', borderRadius: 3 }} />
            </div>}
          </div>
        );
      },
    },
    {
      title: 'Ngân sách phê duyệt',
      dataIndex: 'approvedBudget',
      key: 'approvedBudget',
      render: (val: number | null) => <span style={{ fontWeight: 600 }}>{val === null ? 'Chưa có dữ liệu' : `${val.toLocaleString('vi-VN')} ₫`}</span>,
    },
    {
      title: 'Chi phí thực tế',
      dataIndex: 'actualSpent',
      key: 'actualSpent',
      render: (val: number | null) => <span style={{ fontWeight: 600, color: '#334155' }}>{val === null ? 'Chưa có dữ liệu' : `${val.toLocaleString('vi-VN')} ₫`}</span>,
    },
    {
      title: 'Chênh lệch tiết kiệm',
      dataIndex: 'variance',
      key: 'variance',
      render: (val: number | null) => (
        <span style={{ color: val === null ? '#64748B' : val >= 0 ? '#16A34A' : '#DC2626', fontWeight: 700 }}>
          {val === null ? 'Chưa có dữ liệu' : val >= 0 ? `Còn ${val.toLocaleString('vi-VN')} ₫` : `Vượt ${Math.abs(val).toLocaleString('vi-VN')} ₫`}
        </span>
      ),
    },
    {
      title: 'Tiến độ công việc',
      dataIndex: 'progressScore',
      key: 'progressScore',
      render: (score: number | null) => (
        <span style={{ fontWeight: 800, color: '#009688', fontSize: 13.5 }}>
          {score === null ? 'Chưa có dữ liệu' : `${score}%`}
        </span>
      ),
    },
    {
      title: 'Đánh giá chung',
      dataIndex: 'evaluation',
      key: 'evaluation',
      render: (e: string) => (
        <Tag color={e === 'Hoàn thành' ? 'success' : e === 'Đang triển khai' ? 'processing' : 'default'}>
          {e}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 100,
      render: (_: any, record: PlanReportItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedItem(record);
            setDrawerOpen(true);
          }}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng ngân sách phê duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {budgetDepartments ? `${(totalBudget / 1000000000).toFixed(2)} tỷ đồng` : 'Chưa có dữ liệu'}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>{budgetDepartments} đơn vị có ngân sách</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thực tế giải ngân</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {spendDepartments ? `${(totalSpent / 1000000000).toFixed(2)} tỷ đồng` : 'Chưa có dữ liệu'}
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>
            {spendDepartments} đơn vị có số giải ngân{totalBudget > 0 ? ` · ${Math.round((totalSpent / totalBudget) * 100)}% ngân sách` : ''}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chênh lệch ngân sách</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: totalVariance >= 0 ? '#16A34A' : '#DC2626', marginTop: 4 }}>
            {varianceDepartments ? `${totalVariance.toLocaleString('vi-VN')} ₫` : 'Chưa có dữ liệu'}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{varianceDepartments} đơn vị có đủ ngân sách và chi phí</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tiến độ công việc bình quân</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {avgProgress === null ? 'Chưa có dữ liệu' : `${avgProgress}%`}
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>{progressDepartments} đơn vị có tiến độ ghi nhận</div>
        </div>
      </div>

      {/* Unified Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        {/* Filter sub-tabs */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả đơn vị' },
            { key: 'excellent', label: 'Hoàn thành', icon: <ThunderboltOutlined style={{ color: '#16A34A' }} /> },
            { key: 'good', label: 'Đang triển khai', icon: <ThunderboltOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'top_budget', label: 'Ngân sách từ 1 tỷ', icon: <DollarOutlined style={{ color: '#10B981' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setFilterTab(tab.key as any)}
              style={{
                backgroundColor: filterTab === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: filterTab === tab.key ? '#009688' : '#CBD5E1',
                color: filterTab === tab.key ? '#00796B' : '#475569',
                fontWeight: filterTab === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo đơn vị, người phụ trách..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 220 }}
            allowClear
          />

          <Select
            value={period}
            onChange={setPeriod}
            style={{ width: 140 }}
            options={[
              { label: 'Tất cả kỳ', value: 'all' },
              ...years.map((year) => ({ label: `Năm ${year}`, value: year })),
            ]}
          />

          <Button
            icon={<PrinterOutlined />}
            disabled={!filteredData.length}
            onClick={() => exportPdf(filteredData, `Bao_cao_ke_hoach_${period}.pdf`)}
          >
            In báo cáo
          </Button>

          <Button
            icon={<DownloadOutlined />}
            disabled={!filteredData.length}
            onClick={() => downloadFile(`Bao_cao_ke_hoach_${period}.xlsx`, generateValidXlsxBlob(planReportExportRows(filteredData, period)))}
          >
            Xuất Excel
          </Button>

          <Button icon={<HistoryOutlined />} onClick={() => setHistoryOpen(true)}>
            Báo cáo đã lưu ({savedReports.length})
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({ department: filteredData[0]?.department || data[0]?.department });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lưu báo cáo khối
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={false} rowKey="key" loading={loading} />
      </div>

      {/* DRAWER: Chi Tiết Hiệu Suất Đơn Vị */}
      <Drawer
        title="Hồ Sơ Hiệu Suất Kế Hoạch &amp; Phân Bổ Ngân Sách"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
      >
        {selectedItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A' }}>{selectedItem.department}</div>
                  <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 3 }}>
                    Chủ trì quản trị: <strong>{selectedItem.leader}</strong>
                  </div>
                </div>
                <Tag color={selectedItem.evaluation === 'Hoàn thành' ? 'success' : selectedItem.evaluation === 'Đang triển khai' ? 'processing' : 'default'}>
                  {selectedItem.evaluation}
                </Tag>
              </div>
            </div>

            {/* Financial & KPI Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ padding: 12, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>Ngân sách kế hoạch</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 4 }}>
                  {selectedItem.approvedBudget === null ? 'Chưa có dữ liệu' : `${selectedItem.approvedBudget.toLocaleString('vi-VN')} ₫`}
                </div>
                <div style={{ fontSize: 11, color: '#16A34A', marginTop: 2 }}>
                  Chênh lệch: {selectedItem.variance === null ? 'Chưa có dữ liệu' : `${selectedItem.variance.toLocaleString('vi-VN')} ₫`}
                </div>
              </div>

              <div style={{ padding: 12, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8 }}>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>Thực tế giải ngân</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: '#1E40AF', marginTop: 4 }}>
                  {selectedItem.actualSpent === null ? 'Chưa có dữ liệu' : `${selectedItem.actualSpent.toLocaleString('vi-VN')} ₫`}
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  {selectedItem.actualSpent !== null && selectedItem.approvedBudget !== null && selectedItem.approvedBudget > 0
                    ? `Đã sử dụng ${Math.round((selectedItem.actualSpent / selectedItem.approvedBudget) * 100)}% ngân sách`
                    : 'Chưa đủ dữ liệu để tính tỷ lệ'}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, color: '#334155' }}>Tiến độ hoàn thành kế hoạch</span>
                <span style={{ fontWeight: 700, color: '#009688' }}>
                  {selectedItem.completedPlans} / {selectedItem.totalPlans} kế hoạch
                  {selectedItem.totalPlans ? ` · ${Math.round((selectedItem.completedPlans / selectedItem.totalPlans) * 100)}%` : ''}
                </span>
              </div>
              <div style={{ width: '100%', background: '#E2E8F0', height: 8, borderRadius: 4, overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${selectedItem.totalPlans ? Math.round((selectedItem.completedPlans / selectedItem.totalPlans) * 100) : 0}%`,
                    background: '#009688',
                    height: '100%',
                    borderRadius: 4,
                  }}
                />
              </div>
            </div>

            {/* Sub-projects list */}
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ProjectOutlined style={{ color: '#009688' }} /> Danh Mục Dự Án Chiến Lược ({selectedItem.projects.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selectedItem.projects.map((prj, i) => (
                  <div
                    key={i}
                    style={{
                      border: '1px solid #E2E8F0',
                      borderRadius: 6,
                      padding: '10px 14px',
                      background: '#FFFFFF',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#009688' }}>{prj.code}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginTop: 2 }}>{prj.name}</div>
                      </div>
                      <Tag color={prj.status === 'Hoàn thành' ? 'success' : 'processing'}>{prj.status}</Tag>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#64748B', marginTop: 8 }}>
                      <span>Ngân sách kế hoạch: <strong>{prj.budget === null ? 'Chưa có dữ liệu' : `${prj.budget.toLocaleString('vi-VN')} ₫`}</strong></span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom action buttons */}
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => {
                  form.resetFields();
                  form.setFieldsValue({ department: selectedItem.department });
                  setModalOpen(true);
                }}
              >
                Lưu báo cáo đơn vị
              </Button>
              <Button
                icon={<PrinterOutlined />}
                style={{ flex: 1 }}
                onClick={() => exportPdf([selectedItem], `${encodeURIComponent(selectedItem.department)}_${period}_bao_cao.pdf`)}
              >
                In phiếu khối
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <Modal
        title="Lưu báo cáo đơn vị"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleCreateEvaluation}>
          <Form.Item name="department" label="Khối hoặc đơn vị" rules={[{ required: true, message: 'Chọn đơn vị có dữ liệu.' }]}>
            <Select options={data.map((item) => ({ label: item.department, value: item.department }))} placeholder="Chọn đơn vị" />
          </Form.Item>
          <div style={{ color: '#64748B', fontSize: 12, marginBottom: 16 }}>
            Báo cáo sẽ lưu ảnh chụp số liệu hiện có cho {period === 'all' ? 'tất cả kỳ' : `năm ${period}`}.
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={!data.length} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu ảnh chụp
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal title="Báo cáo đã lưu" open={historyOpen} onCancel={() => setHistoryOpen(false)} footer={null} width={900}>
        <KTable
          dataSource={[...savedReports].sort((a, b) => String(b.generatedAt || '').localeCompare(String(a.generatedAt || '')))}
          rowKey="key"
          pagination={{ pageSize: 8 }}
          columns={[
            { title: 'Kỳ', dataIndex: 'reportPeriod', key: 'reportPeriod', render: (value: string) => value === 'all' ? 'Tất cả kỳ' : value },
            { title: 'Đơn vị', dataIndex: 'department', key: 'department' },
            { title: 'Ngày lưu', dataIndex: 'generatedAt', key: 'generatedAt', render: (value: string) => value ? new Date(value).toLocaleString('vi-VN') : 'Chưa ghi nhận' },
            { title: 'Kế hoạch', key: 'plans', render: (_: unknown, item: PlanReportRow) => `${item.completedPlans} / ${item.totalPlans}` },
            { title: 'Ngân sách', dataIndex: 'approvedBudget', key: 'approvedBudget', render: (value: number | null) => value === null ? 'Chưa có dữ liệu' : `${value.toLocaleString('vi-VN')} ₫` },
            { title: 'Đã chi', dataIndex: 'actualSpent', key: 'actualSpent', render: (value: number | null) => value === null ? 'Chưa có dữ liệu' : `${value.toLocaleString('vi-VN')} ₫` },
          ]}
        />
      </Modal>
    </div>
  );
};


