import React, { useEffect, useMemo, useState } from 'react';
import { DownloadOutlined, EyeOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { FinanceDocument, financeDocumentsApi, financePaymentAccountsApi } from '../../api/endpoints';
import { Button, Drawer, Form, Input, message, Modal, Select, Tag } from '../../custom-ui';
import { dataService } from '../../services/dataService';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import { buildCashForecast, CashForecastFlow, CashForecastPeriod } from './cashForecastRules';
import type { LoanReportEvent, LoanReportSource } from './loanRules';

interface ForecastScenario {
  key: string;
  scenarioName: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  condition: string;
  receivableProbabilityPct?: number;
  manualAdjustment?: { date: string; direction: 'inflow' | 'outflow'; amount: number; reference: string };
  sourceFlows: CashForecastFlow[];
  periods: CashForecastPeriod[];
  expectedInflow: number;
  expectedOutflow: number;
  projectedBalance: number;
  createdAt?: string;
  createdBy?: string;
}

interface LegacyForecastRecord {
  key: string;
  period?: string;
  expectedInflow?: number;
  expectedOutflow?: number;
  netWeeklyChange?: number;
  projectedBalance?: number;
  inflowDetails?: string;
  outflowDetails?: string;
  safetyStatus?: string;
}

const todayIso = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const isValidIsoDate = (value: unknown) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const addDays = (value: string, count: number) => {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
};
const formatMoney = (value: number) => `${Number(value || 0).toLocaleString('vi-VN')} ₫`;
const sourceLabels: Record<CashForecastFlow['source'], string> = {
  receivable: 'Phải thu', payable: 'Phải trả', loan: 'Khoản vay', tax: 'Nghĩa vụ thuế', manual: 'Điều chỉnh đã nhập',
};

export const CashForecastModule: React.FC = () => {
  const [documents, setDocuments] = useState<FinanceDocument[]>([]);
  const [accounts, setAccounts] = useState<Array<{ key: string; name: string; source: string; balance: number; status: string }>>([]);
  const [loans, setLoans] = useState<LoanReportSource[]>([]);
  const [loanEvents, setLoanEvents] = useState<LoanReportEvent[]>([]);
  const [taxes, setTaxes] = useState<Array<{ key: string; code: string; status?: string; deadline: string; amountPayable: number; amountPaid: number }>>([]);
  const [unpaidPayrollCount, setUnpaidPayrollCount] = useState(0);
  const [scenarios, setScenarios] = useState<ForecastScenario[]>([]);
  const [legacyScenarios, setLegacyScenarios] = useState<LegacyForecastRecord[]>([]);
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(addDays(todayIso(), 27));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState<CashForecastPeriod | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ForecastScenario | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const [scenarioRows, documentResponse, accountResponse, loanRows, eventRows, taxRows, payrollRows] = await Promise.all([
        dataService.refreshGenericData('finance_cash_forecast_scenarios'),
        financeDocumentsApi.getAll(),
        financePaymentAccountsApi.getAccounts(),
        dataService.refreshGenericData('finance_loans'),
        dataService.refreshGenericData('finance_loan_events'),
        dataService.refreshGenericData('finance_tax'),
        dataService.refreshGenericData('payroll'),
      ]);
      if (!Array.isArray(scenarioRows) || !Array.isArray(documentResponse.data?.data) || !Array.isArray(accountResponse.data?.accounts)
        || !Array.isArray(loanRows) || !Array.isArray(eventRows) || !Array.isArray(taxRows) || !Array.isArray(payrollRows)) {
        throw new Error('Dữ liệu nguồn dự báo không hợp lệ.');
      }
      setScenarios(scenarioRows as ForecastScenario[]);
      setDocuments(documentResponse.data.data);
      setAccounts(accountResponse.data.accounts);
      setLoans(loanRows as LoanReportSource[]);
      setLoanEvents(eventRows as LoanReportEvent[]);
      setTaxes(taxRows);
      setUnpaidPayrollCount(payrollRows.filter((row: any) => row.status !== 'Đã chi trả').length);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không tải được dữ liệu dự báo dòng tiền.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    setLegacyScenarios(dataService.getGenericData('finance_forecasts') as LegacyForecastRecord[]);
    const unsubscribe = dataService.subscribe(() => {
      setScenarios(dataService.getGenericData('finance_cash_forecast_scenarios') as ForecastScenario[]);
      setLegacyScenarios(dataService.getGenericData('finance_forecasts') as LegacyForecastRecord[]);
    });
    return unsubscribe;
  }, []);

  const openingBalance = accounts.filter(account => account.status === 'Đang hoạt động')
    .reduce((sum, account) => sum + (Number(account.balance) || 0), 0);
  const preview = useMemo(() => {
    try {
      return buildCashForecast({ startDate, endDate, openingBalance, documents, loans, loanEvents, taxes });
    } catch {
      return [];
    }
  }, [startDate, endDate, openingBalance, documents, loans, loanEvents, taxes]);
  const previewTotals = useMemo(() => preview.reduce((total, period) => ({
    inflow: total.inflow + period.inflow,
    outflow: total.outflow + period.outflow,
    endingBalance: period.closingBalance,
  }), { inflow: 0, outflow: 0, endingBalance: openingBalance }), [preview, openingBalance]);
  const obligationsWithoutDueDate = documents.filter(document => document.status !== 'Đã hủy'
    && Number(document.remainingAmount) > 0
    && (document.documentType === 'sale' || document.documentType === 'purchase' || /Đầu (ra|vào)/.test(document.subtype || ''))
    && !isValidIsoDate(document.dueDate)).length
    + taxes.filter(tax => Number(tax.amountPayable) > Number(tax.amountPaid) && !isValidIsoDate(tax.deadline)).length;

  const openCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      startDate, endDate, openingBalance, receivableProbabilityPct: '',
      manualDirection: 'none', manualAmount: 0, manualDate: startDate,
    });
    setModalOpen(true);
  };

  const submitScenario = async (values: any) => {
    if (saving) return;
    const probabilityText = String(values.receivableProbabilityPct ?? '').trim();
    const probability = probabilityText === '' ? undefined : Number(probabilityText);
    const manualAmount = Number(values.manualAmount ?? 0);
    const direction = values.manualDirection === 'inflow' || values.manualDirection === 'outflow' ? values.manualDirection : undefined;
    if (manualAmount > 0 && !direction) { message.error('Chọn khoản thu hoặc khoản chi cho điều chỉnh thủ công.'); return; }
    if (manualAmount > 0 && !String(values.manualReference || '').trim()) { message.error('Nhập nội dung và căn cứ cho khoản điều chỉnh thủ công.'); return; }
    const manualAdjustment = direction && manualAmount > 0 ? {
      date: String(values.manualDate || ''), direction, amount: manualAmount,
      reference: String(values.manualReference || '').trim(),
    } : undefined;
    let periods: CashForecastPeriod[];
    try {
      periods = buildCashForecast({
        startDate: String(values.startDate || ''), endDate: String(values.endDate || ''),
        openingBalance: Number(values.openingBalance), documents, loans, loanEvents, taxes,
        receivableProbabilityPct: probability, manualAdjustment,
      });
    } catch (error: any) {
      message.error(error?.message || 'Thông tin kịch bản không hợp lệ.');
      return;
    }
    const flows = periods.flatMap(period => period.flows);
    const expectedInflow = periods.reduce((sum, period) => sum + period.inflow, 0);
    const expectedOutflow = periods.reduce((sum, period) => sum + period.outflow, 0);
    const scenario: ForecastScenario = {
      key: crypto.randomUUID(),
      scenarioName: String(values.scenarioName || '').trim(),
      startDate: String(values.startDate), endDate: String(values.endDate),
      openingBalance: Number(values.openingBalance), condition: String(values.condition || '').trim(),
      receivableProbabilityPct: probability,
      manualAdjustment,
      sourceFlows: flows,
      periods,
      expectedInflow,
      expectedOutflow,
      projectedBalance: periods[periods.length - 1]?.closingBalance ?? Number(values.openingBalance),
    };
    setSaving(true);
    try {
      const saved = await dataService.createGenericRecord('finance_cash_forecast_scenarios', scenario) as ForecastScenario;
      setScenarios(current => [saved, ...current.filter(row => row.key !== saved.key)]);
      setModalOpen(false);
      form.resetFields();
      message.success('Đã lưu kịch bản dự báo và dữ liệu nguồn đối chiếu.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu kịch bản dự báo.');
    } finally {
      setSaving(false);
    }
  };

  const exportPreview = () => {
    if (!preview.length) { message.error('Chọn khoảng thời gian hợp lệ trước khi xuất báo cáo.'); return; }
    const rows: Array<Array<string | number | boolean | null>> = [
      ['Từ ngày', 'Đến ngày', 'Số dư đầu kỳ', 'Dự thu', 'Dự chi', 'Thuần dự báo', 'Số dư cuối kỳ'],
      ...preview.map(period => [period.startDate, period.endDate, period.openingBalance, period.inflow, period.outflow, period.net, period.closingBalance]),
      [],
      ['Ngày xếp lịch', 'Hạn gốc', 'Nguồn', 'Mã tham chiếu', 'Chiều tiền', 'Số tiền dự kiến', 'Số tiền gốc', 'Ghi chú'],
      ...preview.flatMap(period => period.flows.map(flow => [flow.date, flow.originalDate, sourceLabels[flow.source], flow.reference, flow.direction === 'inflow' ? 'Thu' : 'Chi', flow.amount, flow.originalAmount, flow.note || ''])),
    ];
    downloadFile('du-bao-dong-tien.xlsx', generateValidXlsxBlob(rows));
  };

  const openPeriod = (period: CashForecastPeriod) => {
    setSelectedPeriod(period);
    setSelectedScenario(null);
    setDrawerOpen(true);
  };
  const openScenario = (scenario: ForecastScenario) => {
    setSelectedScenario(scenario);
    setSelectedPeriod(null);
    setDrawerOpen(true);
  };

  const renderFlows = (flows: CashForecastFlow[]) => (
    <KTable
      dataSource={flows.map(flow => ({ ...flow, flowLabel: sourceLabels[flow.source] }))}
      rowKey="key"
      pagination={{ pageSize: 8 }}
      columns={[
        { title: 'Ngày xếp lịch', dataIndex: 'date', key: 'date' },
        { title: 'Hạn gốc', dataIndex: 'originalDate', key: 'originalDate' },
        { title: 'Nguồn', dataIndex: 'flowLabel', key: 'source' },
        { title: 'Mã tham chiếu', dataIndex: 'reference', key: 'reference' },
        { title: 'Dự kiến', dataIndex: 'amount', key: 'amount', render: (value: number, flow: CashForecastFlow) => <span style={{ color: flow.direction === 'inflow' ? '#168044' : '#B42318' }}>{flow.direction === 'inflow' ? '+' : '-'}{formatMoney(value)}</span> },
        { title: 'Ghi chú', dataIndex: 'note', key: 'note', render: (value: string) => value || '—' },
      ]}
    />
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: 0, color: '#0F172A', fontSize: 20, fontWeight: 400 }}>Dự báo dòng tiền</h1>
          <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Ước tính từ chứng từ còn công nợ, lịch vay, nghĩa vụ thuế đã ghi nhận và điều chỉnh có ngày. Không ghi vào sổ kế toán.</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
          <Button icon={<DownloadOutlined />} onClick={exportPreview}>Xuất báo cáo</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Lưu kịch bản</Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap', marginBottom: 14 }}>
        <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: 13 }}>Từ ngày<Input type="date" value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
        <label style={{ display: 'grid', gap: 4, color: '#475569', fontSize: 13 }}>Đến ngày<Input type="date" value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
        <div style={{ color: '#64748B', fontSize: 12 }}>Số dư đầu kỳ đang dùng: {formatMoney(openingBalance)} từ {accounts.filter(account => account.status === 'Đang hoạt động').length} tài khoản tiền đang hoạt động.</div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}><div style={{ color: '#64748B', fontSize: 12.5 }}>Dự thu theo nguồn đã ghi nhận</div><div style={{ color: '#168044', fontSize: 21, marginTop: 4 }}>{formatMoney(previewTotals.inflow)}</div></div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}><div style={{ color: '#64748B', fontSize: 12.5 }}>Dự chi theo nguồn đã ghi nhận</div><div style={{ color: '#B42318', fontSize: 21, marginTop: 4 }}>{formatMoney(previewTotals.outflow)}</div></div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}><div style={{ color: '#64748B', fontSize: 12.5 }}>Số dư cuối kỳ dự kiến</div><div style={{ color: previewTotals.endingBalance < 0 ? '#B42318' : '#0F172A', fontSize: 21, marginTop: 4 }}>{preview.length ? formatMoney(previewTotals.endingBalance) : '—'}</div></div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}><div style={{ color: '#64748B', fontSize: 12.5 }}>Bảng lương chưa có ngày chi</div><div style={{ color: '#0F172A', fontSize: 21, marginTop: 4 }}>{unpaidPayrollCount.toLocaleString('vi-VN')} hồ sơ</div><div style={{ color: '#64748B', fontSize: 11.5, marginTop: 3 }}>Chưa cộng vào dự báo vì dữ liệu lương chưa xác định ngày thanh toán.</div></div>
      </div>

      <div style={{ color: '#64748B', fontSize: 12, marginBottom: 12 }}>Khoản phải thu chỉ được điều chỉnh xác suất khi người lập kịch bản nhập tỷ lệ có căn cứ. Đơn mua bán, ngân sách và khoản lương thiếu ngày thanh toán không được tự suy ra thành dòng tiền đến hạn.</div>
      {(obligationsWithoutDueDate > 0 || unpaidPayrollCount > 0) && <div style={{ color: '#8A4B08', fontSize: 12, marginBottom: 12 }}>{obligationsWithoutDueDate} khoản phải thu, phải trả hoặc nghĩa vụ thuế thiếu ngày hợp lệ chưa được xếp lịch; {unpaidPayrollCount} hồ sơ lương chưa có ngày chi. Các khoản này không được gán ngày dự kiến tự động.</div>}
      {!preview.length && <div style={{ color: '#B42318', fontSize: 13, marginBottom: 12 }}>Khoảng ngày không hợp lệ hoặc chưa có dữ liệu tài khoản; hãy kiểm tra ngày và làm mới nguồn dữ liệu.</div>}

      <div className="transparent-table-card" style={{ marginBottom: 18 }}>
        <KTable
          dataSource={preview}
          rowKey="startDate"
          pagination={false}
          columns={[
            { title: 'Khoảng thời gian', key: 'period', render: (_: unknown, row: CashForecastPeriod) => `${row.startDate} – ${row.endDate}` },
            { title: 'Số dư đầu kỳ', dataIndex: 'openingBalance', key: 'openingBalance', render: (value: number) => formatMoney(value) },
            { title: 'Dự thu', dataIndex: 'inflow', key: 'inflow', render: (value: number) => formatMoney(value) },
            { title: 'Dự chi', dataIndex: 'outflow', key: 'outflow', render: (value: number) => formatMoney(value) },
            { title: 'Thuần', dataIndex: 'net', key: 'net', render: (value: number) => formatMoney(value) },
            { title: 'Số dư cuối kỳ', dataIndex: 'closingBalance', key: 'closingBalance', render: (value: number) => <Tag color={value < 0 ? 'error' : 'default'}>{formatMoney(value)}</Tag> },
            { title: 'Chi tiết', key: 'actions', render: (_: unknown, row: CashForecastPeriod) => <Button icon={<EyeOutlined />} onClick={() => openPeriod(row)}>Xem nguồn</Button> },
          ]}
        />
      </div>

      <div style={{ color: '#0F172A', fontSize: 14, marginBottom: 8 }}>Kịch bản đã lưu</div>
      <div className="transparent-table-card">
        <KTable
          dataSource={scenarios}
          rowKey="key"
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'Tên kịch bản', dataIndex: 'scenarioName', key: 'scenarioName' },
            { title: 'Khoảng thời gian', key: 'period', render: (_: unknown, row: ForecastScenario) => `${row.startDate} – ${row.endDate}` },
            { title: 'Dự thu', dataIndex: 'expectedInflow', key: 'inflow', render: (value: number) => formatMoney(value) },
            { title: 'Dự chi', dataIndex: 'expectedOutflow', key: 'outflow', render: (value: number) => formatMoney(value) },
            { title: 'Số dư cuối kỳ', dataIndex: 'projectedBalance', key: 'balance', render: (value: number) => formatMoney(value) },
            { title: 'Người lập', dataIndex: 'createdBy', key: 'createdBy', render: (value: string) => value || 'Theo nhật ký máy chủ' },
            { title: 'Thao tác', key: 'action', render: (_: unknown, row: ForecastScenario) => <Button icon={<EyeOutlined />} onClick={() => openScenario(row)}>Chi tiết</Button> },
          ]}
        />
        {!loading && scenarios.length === 0 && <div style={{ padding: 14, color: '#64748B', fontSize: 13 }}>Chưa có kịch bản được lưu.</div>}
      </div>
      {legacyScenarios.length > 0 && <div style={{ marginTop: 18 }}>
        <div style={{ color: '#64748B', fontSize: 13, marginBottom: 8 }}>Kịch bản cũ được giữ nguyên để tra cứu. Do chưa có dữ liệu nguồn đi kèm, các bản ghi này không được cộng vào dự báo hiện tại.</div>
        <div className="transparent-table-card"><KTable
          dataSource={legacyScenarios}
          rowKey="key"
          pagination={{ pageSize: 10 }}
          columns={[
            { title: 'Kỳ cũ', dataIndex: 'period', key: 'period' },
            { title: 'Dự thu đã lưu', dataIndex: 'expectedInflow', key: 'inflow', render: (value: number) => formatMoney(value) },
            { title: 'Dự chi đã lưu', dataIndex: 'expectedOutflow', key: 'outflow', render: (value: number) => formatMoney(value) },
            { title: 'Số dư đã lưu', dataIndex: 'projectedBalance', key: 'balance', render: (value: number) => formatMoney(value) },
            { title: 'Nguồn thu đã lưu', dataIndex: 'inflowDetails', key: 'inflowDetails' },
            { title: 'Nguồn chi đã lưu', dataIndex: 'outflowDetails', key: 'outflowDetails' },
          ]}
        /></div>
      </div>}

      <Modal title="Lưu kịch bản dự báo dòng tiền" open={modalOpen} onCancel={() => !saving && setModalOpen(false)} footer={null} width={780}>
        <Form form={form} layout="vertical" onFinish={submitScenario} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="scenarioName" label="Tên kịch bản" rules={[{ required: true, whitespace: true, message: 'Nhập tên kịch bản.' }]}><Input maxLength={120} /></Form.Item>
            <Form.Item name="openingBalance" label="Số dư đầu kỳ" rules={[{ required: true, message: 'Nhập số dư đầu kỳ.' }]}><Input type="number" step={1} /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="startDate" label="Từ ngày" rules={[{ required: true, message: 'Chọn ngày bắt đầu.' }]}><Input type="date" /></Form.Item>
            <Form.Item name="endDate" label="Đến ngày" rules={[{ required: true, message: 'Chọn ngày kết thúc.' }]}><Input type="date" /></Form.Item>
          </div>
          <Form.Item name="condition" label="Điều kiện và căn cứ dự báo"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
          <Form.Item name="receivableProbabilityPct" label="Xác suất thu phải thu (%)"><Input type="number" min={0} max={100} step={1} placeholder="Để trống nếu không điều chỉnh" /></Form.Item>
          <div style={{ color: '#64748B', fontSize: 12, marginBottom: 12 }}>Xác suất chỉ áp dụng cho các khoản phải thu trong khoảng dự báo. Không áp dụng cho khoản vay, nghĩa vụ thuế hoặc điều chỉnh thủ công.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="manualDirection" label="Điều chỉnh thủ công"><Select options={[{ value: 'none', label: 'Không điều chỉnh' }, { value: 'inflow', label: 'Khoản thu' }, { value: 'outflow', label: 'Khoản chi' }]} /></Form.Item>
            <Form.Item name="manualAmount" label="Số tiền điều chỉnh"><Input type="number" min={0} step={1} /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="manualDate" label="Ngày điều chỉnh"><Input type="date" /></Form.Item>
            <Form.Item name="manualReference" label="Nội dung và căn cứ"><Input maxLength={300} placeholder="Bắt buộc khi có khoản điều chỉnh" /></Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button disabled={saving} onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving}>Lưu kịch bản</Button>
          </div>
        </Form>
      </Modal>

      <Drawer title={selectedScenario ? `Kịch bản ${selectedScenario.scenarioName}` : 'Chi tiết nguồn dòng tiền dự báo'} open={drawerOpen} onClose={() => setDrawerOpen(false)} width={820}>
        {selectedScenario && <div style={{ marginBottom: 14, color: '#64748B', fontSize: 13 }}>Điều kiện: {selectedScenario.condition || 'Không ghi điều kiện bổ sung.'} · Số dư đầu kỳ: {formatMoney(selectedScenario.openingBalance)}{selectedScenario.receivableProbabilityPct !== undefined ? ` · Xác suất thu phải thu: ${selectedScenario.receivableProbabilityPct}%` : ''}</div>}
        {selectedPeriod && <div style={{ marginBottom: 14, color: '#64748B', fontSize: 13 }}>{selectedPeriod.startDate} – {selectedPeriod.endDate} · Số dư cuối kỳ: {formatMoney(selectedPeriod.closingBalance)}</div>}
        {renderFlows(selectedScenario?.sourceFlows || selectedPeriod?.flows || [])}
        {selectedScenario?.sourceFlows.some(flow => flow.source === 'loan' && flow.note?.includes('chưa có lịch trả nợ')) && <div style={{ marginTop: 10, color: '#8A4B08', fontSize: 12 }}>Một số lịch vay chưa có lịch trả lãi; dự báo chỉ cộng phần gốc còn lại đã ghi nhận.</div>}
        <div style={{ marginTop: 12, color: '#64748B', fontSize: 12 }}>Các con số trong trang này là dự báo nội bộ, không phải xác nhận thanh toán hoặc bút toán sổ cái.</div>
      </Drawer>
    </div>
  );
};

