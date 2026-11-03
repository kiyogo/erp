import React, { useEffect, useMemo, useState } from 'react';
import { ReloadOutlined } from '@ant-design/icons';
import { Button, Select, message } from '../../custom-ui';
import { financeCashApi, financeDocumentsApi, systemApi, type FinanceCashTransaction, type FinanceDocument } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { getFiscalQuarterDates, getFiscalQuarterPeriod } from './ledgerCalculations';
import { quarterOptionsForFiscalYear, summarizeAnalysisPeriod, summarizeBudgetComparison, summarizeOutstandingDocuments, type AnalysisBudget, type AnalysisLedgerEntry } from './financeAnalysisRules';

const money = (value: number | null) => value === null ? 'Chưa đủ dữ liệu' : `${value.toLocaleString('vi-VN')} ₫`;
const percent = (value: number | null) => value === null ? 'Chưa đủ dữ liệu' : `${(value * 100).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}%`;

export const FinanceAnalysisModule: React.FC = () => {
  const [ledger, setLedger] = useState<AnalysisLedgerEntry[]>([]);
  const [cash, setCash] = useState<FinanceCashTransaction[]>([]);
  const [documents, setDocuments] = useState<FinanceDocument[]>([]);
  const [budgets, setBudgets] = useState<AnalysisBudget[]>([]);
  const [fiscalStart, setFiscalStart] = useState({ month: 1, day: 1 });
  const [fiscalStartConfigured, setFiscalStartConfigured] = useState(false);
  const [accountingProfileComplete, setAccountingProfileComplete] = useState(false);
  const [dataAvailable, setDataAvailable] = useState(false);
  const [selectedQuarter, setSelectedQuarter] = useState(() => getFiscalQuarterPeriod(new Date()));
  const [loading, setLoading] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ledgerRows, cashResponse, documentResponse, budgetRows, profileResponse] = await Promise.all([
        dataService.refreshGenericData('finance_general_ledger'),
        financeCashApi.getAll(),
        financeDocumentsApi.getAll(),
        dataService.refreshGenericData('finance_budgets'),
        systemApi.getCompanyProfile(),
      ]);
      if (!Array.isArray(ledgerRows) || !Array.isArray(cashResponse.data?.data) || !Array.isArray(documentResponse.data?.data) || !Array.isArray(budgetRows)) {
        throw new Error('Dữ liệu phân tích tài chính không hợp lệ.');
      }
      const profile = profileResponse.data.profile;
      const month = Number(profile.fiscalYearStartMonth);
      const day = Number(profile.fiscalYearStartDay);
      const validFiscalStart = month >= 1 && month <= 12 && day >= 1 && day <= 31;
      const start = validFiscalStart ? { month, day } : { month: 1, day: 1 };
      setFiscalStart(start);
      setFiscalStartConfigured(validFiscalStart);
      setAccountingProfileComplete(Boolean(profile.accountingProfileComplete));
      const currentPeriod = getFiscalQuarterPeriod(new Date(), start.month, start.day);
      setSelectedQuarter(current => quarterOptionsForFiscalYear(currentPeriod, 8).includes(current) ? current : currentPeriod);
      setLedger(ledgerRows);
      setCash(cashResponse.data.data);
      setDocuments(documentResponse.data.data);
      setBudgets(budgetRows);
      setDataAvailable(true);
    } catch (error: any) {
      setLedger([]);
      setCash([]);
      setDocuments([]);
      setBudgets([]);
      setFiscalStartConfigured(false);
      setAccountingProfileComplete(false);
      setDataAvailable(false);
      message.error(error?.response?.data?.message || error?.message || 'Không tải được dữ liệu phân tích tài chính.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadData(); }, []);

  const currentFiscalQuarter = useMemo(() => getFiscalQuarterPeriod(new Date(), fiscalStart.month, fiscalStart.day), [fiscalStart]);
  const quarters = useMemo(() => quarterOptionsForFiscalYear(currentFiscalQuarter, 8), [currentFiscalQuarter]);
  const selectedIndex = quarters.indexOf(selectedQuarter);
  const previousQuarter = selectedIndex > 0 ? quarters[selectedIndex - 1] : '';
  const currentRange = useMemo(() => getQuarterRange(selectedQuarter, fiscalStart.month, fiscalStart.day), [selectedQuarter, fiscalStart]);
  const priorRange = useMemo(() => previousQuarter ? getQuarterRange(previousQuarter, fiscalStart.month, fiscalStart.day) : null, [previousQuarter, fiscalStart]);
  const current = useMemo(() => currentRange ? summarizeAnalysisPeriod(ledger, cash, currentRange) : null, [ledger, cash, currentRange]);
  const prior = useMemo(() => priorRange ? summarizeAnalysisPeriod(ledger, cash, priorRange) : null, [ledger, cash, priorRange]);
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' });
  const outstanding = useMemo(() => dataAvailable ? summarizeOutstandingDocuments(documents, today) : null, [documents, today, dataAvailable]);
  const budget = useMemo(() => dataAvailable ? summarizeBudgetComparison(budgets, selectedQuarter.slice(0, 4)) : null, [budgets, selectedQuarter, dataAvailable]);

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 400 }}>Phân tích tài chính</h1>
          <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Kết quả kế toán lấy từ Sổ Cái đã ghi sổ; dòng tiền lấy từ phiếu thu chi đã hoàn thành.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Select value={selectedQuarter} options={quarters.map(value => ({ value, label: `Quý ${value.slice(-1)} · ${value.slice(0, 4)}` }))} onChange={setSelectedQuarter} style={{ width: 190 }} />
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadData()}>Làm mới</Button>
        </div>
      </div>

      <div style={{ color: '#64748B', fontSize: 13, marginBottom: 14 }}>
        Kỳ trước để so sánh: {previousQuarter ? `Quý ${previousQuarter.slice(-1)} · ${previousQuarter.slice(0, 4)}` : 'chưa có kỳ trước trong danh sách'}.
      </div>
      {!accountingProfileComplete && <div role="status" style={{ color: '#92400E', background: '#FFFBEB', borderRadius: 6, padding: '9px 12px', marginBottom: 14, fontSize: 13 }}>{fiscalStartConfigured ? 'Hồ sơ kế toán chưa hoàn tất. Hãy kiểm tra thiết lập kế toán trước khi dùng các số liệu này để chốt báo cáo.' : 'Chưa có ngày bắt đầu năm tài chính hợp lệ; kỳ đang dùng mốc năm dương lịch mặc định. Hãy hoàn thiện hồ sơ kế toán để đối chiếu đúng kỳ của doanh nghiệp.'}</div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12, marginBottom: 16 }}>
        <Metric title="Doanh thu ghi sổ" value={money(current?.revenue ?? null)} compare={compare(current?.revenue ?? null, prior?.revenue ?? null)} />
        <Metric title="Chi phí ghi sổ" value={money(current?.expenses ?? null)} compare={compare(current?.expenses ?? null, prior?.expenses ?? null)} />
        <Metric title="Kết quả kế toán" value={money(current?.profit ?? null)} compare={compare(current?.profit ?? null, prior?.profit ?? null)} />
        <Metric title="Biên lợi nhuận kế toán" value={percent(current?.netMargin ?? null)} compare={current?.netMargin !== null && current?.netMargin !== undefined && prior?.netMargin !== null && prior?.netMargin !== undefined ? `Kỳ trước ${percent(prior.netMargin)}` : 'Chưa đủ dữ liệu để so sánh'} />
      </div>

      <section style={panelStyle}>
        <h2 style={sectionTitle}>Dòng tiền thực tế trong kỳ</h2>
        <p style={noteStyle}>Tổng phiếu thu và chi đã hoàn thành theo ngày chứng từ. Đây là dòng tiền, không phải doanh thu hoặc chi phí kế toán.</p>
        <div style={metricGrid}>
          <Metric title="Thực thu" value={money(current?.cashIn ?? null)} compare={compare(current?.cashIn ?? null, prior?.cashIn ?? null)} />
          <Metric title="Thực chi" value={money(current?.cashOut ?? null)} compare={compare(current?.cashOut ?? null, prior?.cashOut ?? null)} />
          <Metric title="Dòng tiền thuần" value={money(current?.netCash ?? null)} compare={compare(current?.netCash ?? null, prior?.netCash ?? null)} />
          <Metric title="Số phiếu trong kỳ" value={current ? current.cashTransactionCount.toLocaleString('vi-VN') : 'Chưa đủ dữ liệu'} compare={current ? `Sổ Cái: ${current.entryCount.toLocaleString('vi-VN')} bút toán` : 'Chưa đủ dữ liệu'} />
        </div>
      </section>

      <section style={{ ...panelStyle, marginTop: 14 }}>
        <h2 style={sectionTitle}>Ngân sách năm tài chính {selectedQuarter.slice(0, 4)}</h2>
        <p style={noteStyle}>So sánh hạn mức với số thực chi đã lưu trên bản ghi ngân sách; số thực chi chưa được tự động đối chiếu với Sổ Cái.</p>
        {!budget || budget.recordCount === 0
          ? <div style={{ color: '#64748B', fontSize: 13 }}>{budget ? 'Chưa có bản ghi ngân sách cho năm tài chính này.' : 'Chưa tải được dữ liệu ngân sách.'}</div>
          : <>
            <div style={metricGrid}>
              <Metric title="Ngân sách đã phân bổ" value={money(budget.allocated)} compare={`${budget.recordCount} bản ghi ngân sách`} />
              <Metric title="Thực chi đã ghi nhận" value={money(budget.actualSpent)} compare="Số đã lưu trên bản ghi ngân sách" />
              <Metric title="Chênh lệch còn lại" value={money(budget.variance)} compare={budget.variance < 0 ? 'Số thực chi đã ghi nhận vượt hạn mức' : 'Ngân sách trừ số thực chi đã ghi nhận'} />
            </div>
            <div style={{ marginTop: 12 }}>
              {budget.byDepartment.map(item => <div key={item.department} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) auto auto', gap: 12, padding: '8px 0', borderBottom: '1px solid #F1F5F9', color: '#334155', fontSize: 13 }}>
                <span>{item.department}</span><span>Ngân sách {money(item.allocated)}</span><span>Đã ghi nhận {money(item.actualSpent)}</span>
              </div>)}
            </div>
          </>}
      </section>

      <section style={{ ...panelStyle, marginTop: 14 }}>
        <h2 style={sectionTitle}>Công nợ tại ngày {new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}</h2>
        <p style={noteStyle}>Số dư còn lại trên chứng từ chưa hủy; quá hạn dựa trên ngày đến hạn và ngày hiện tại.</p>
        <div style={metricGrid}>
          <Metric title={`Phải thu${outstanding ? ` (${outstanding.receivableCount} chứng từ)` : ''}`} value={money(outstanding?.receivable ?? null)} compare={`Quá hạn ${money(outstanding?.overdueReceivable ?? null)}`} />
          <Metric title={`Phải trả${outstanding ? ` (${outstanding.payableCount} chứng từ)` : ''}`} value={money(outstanding?.payable ?? null)} compare={`Quá hạn ${money(outstanding?.overduePayable ?? null)}`} />
        </div>
        <div style={{ marginTop: 14, color: '#64748B', fontSize: 13 }}>Phải thu theo đối tác</div>
        {!outstanding?.receivablesByPartner.length
          ? <div style={{ color: '#64748B', fontSize: 13, marginTop: 8 }}>{outstanding ? 'Chưa có chứng từ phải thu còn số dư.' : 'Chưa tải được dữ liệu công nợ.'}</div>
          : <div style={{ marginTop: 6 }}>
            {outstanding.receivablesByPartner.slice(0, 5).map(item => <div key={item.partner} style={{ display: 'grid', gridTemplateColumns: 'minmax(120px, 1fr) auto auto', gap: 12, padding: '8px 0', borderBottom: '1px solid #F1F5F9', color: '#334155', fontSize: 13 }}>
              <span>{item.partner} · {item.count} chứng từ</span><span>{money(item.amount)}</span><span style={{ color: '#64748B' }}>Quá hạn {money(item.overdue)}</span>
            </div>)}
          </div>}
      </section>

      <section style={{ ...panelStyle, marginTop: 14 }}>
        <h2 style={sectionTitle}>Công thức, nguồn dữ liệu và giới hạn</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, color: '#334155', fontSize: 13 }}>
          <div><div style={labelStyle}>Doanh thu và chi phí</div><div>Doanh thu = phát sinh Có trừ Nợ của TK đầu 5 và 7. Chi phí = phát sinh Nợ trừ Có của TK đầu 6 và 8. Nguồn: bút toán Sổ Cái có trạng thái Đã ghi sổ, trong quý tài chính đã chọn.</div></div>
          <div><div style={labelStyle}>Kết quả và biên lợi nhuận</div><div>Kết quả = doanh thu trừ chi phí; biên lợi nhuận = kết quả chia doanh thu. Không tính biên lợi nhuận khi doanh thu không dương hoặc thiếu một nhóm tài khoản.</div></div>
          <div><div style={labelStyle}>Dòng tiền</div><div>Thực thu và thực chi cộng phiếu hoàn thành theo ngày chứng từ. Chỉ tiêu này không thay thế lợi nhuận kế toán và không tự điều chỉnh giao dịch chuyển nội bộ.</div></div>
          <div><div style={labelStyle}>Ngân sách và thực tế</div><div>Ngân sách lấy từ bản ghi hạn mức theo năm tài chính. Số thực chi là giá trị đã lưu trên bản ghi, chưa được tự đối chiếu với bút toán Sổ Cái.</div></div>
          <div><div style={labelStyle}>Thanh khoản, khả năng thanh toán và cơ cấu vốn</div><div>Chưa tính tỷ số hiện hành, thanh toán nhanh hoặc cơ cấu tài sản, nguồn vốn: cần bảng cân đối và số dư đầu/cuối kỳ đã đối chiếu; công nợ chứng từ hiện có chưa bao gồm mọi nghĩa vụ.</div></div>
          <div><div style={labelStyle}>Vòng quay và hiệu quả sử dụng vốn</div><div>Chưa tính vòng quay tồn kho, phải thu hoặc phải trả: cần số dư bình quân đầu/cuối kỳ và giá vốn hoặc doanh số mua phù hợp, có liên kết xác minh được.</div></div>
          <div><div style={labelStyle}>Phân tích theo chiều quản trị</div><div>Chưa phân tích theo phòng ban, dự án, khách hàng hoặc sản phẩm từ Sổ Cái vì bút toán hiện chưa lưu đầy đủ các chiều này trên từng dòng hạch toán.</div></div>
        </div>
      </section>
    </div>
  );
};

function getQuarterRange(period: string, startMonth: number, startDay: number) {
  const match = /^(\d{4})-Q[1-4]$/.exec(period);
  if (!match) return null;
  return getFiscalQuarterDates(period, startMonth, startDay);
}

function compare(current: number | null, previous: number | null) {
  if (current === null || previous === null) return 'Chưa đủ dữ liệu để so sánh';
  const change = current - previous;
  return `${change > 0 ? '+' : ''}${change.toLocaleString('vi-VN')} ₫ so với kỳ trước`;
}

function Metric({ title, value, compare: comparison }: { title: string; value: string; compare: string }) {
  return <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 16px', minWidth: 0 }}>
    <div style={{ color: '#64748B', fontSize: 12.5 }}>{title}</div>
    <div style={{ color: '#0F172A', fontSize: 19, marginTop: 4, overflowWrap: 'anywhere' }}>{value}</div>
    <div style={{ color: '#64748B', fontSize: 12, marginTop: 4 }}>{comparison}</div>
  </div>;
}

const panelStyle: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 };
const sectionTitle: React.CSSProperties = { margin: 0, color: '#0F172A', fontSize: 15, fontWeight: 400 };
const noteStyle: React.CSSProperties = { color: '#64748B', fontSize: 13, margin: '5px 0 12px' };
const metricGrid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 };
const labelStyle: React.CSSProperties = { color: '#0F172A', marginBottom: 4 };
