import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  DeleteOutlined,
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  BookOutlined,
  FileSyncOutlined,
  FilePdfOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Card, Tag } from '../../custom-ui';
import { chartOfAccountsApi, generalLedgerApi, systemApi } from '../../api/endpoints';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { buildQuarterClosingLines, calculateQuarterLedger, getFiscalQuarterPeriod, postedLedgerRecords, summarizeLedgerAccounts } from './ledgerCalculations';
import { getTT58RequiredBooks, tt58OptionalBooks } from './tt58AccountingBooks';

interface LedgerEntry {
  key: string;
  voucherCode: string;
  entryDate: string;
  description: string;
  debitAccount?: string;
  creditAccount?: string;
  amount: number;
  lines?: JournalLine[];
  author: string;
  status: 'Đã ghi sổ cái' | 'Chờ duyệt kế toán trưởng';
  sourceReference?: string;
  sourceModule?: string;
}

interface JournalLine {
  account: string;
  debit: number;
  credit: number;
}

interface ChartAccount {
  key: string;
  code: string;
  name: string;
  parentCode?: string;
  level: number;
  accountType: string;
  balanceNature: string;
  tracksParty: boolean;
  tracksForeignCurrency: boolean;
  tracksDebt: boolean;
  tracksDetails: boolean;
  effectiveDate: string;
  status: string;
  accountingRegime: string;
}

interface TT58TransitionPreview {
  openingDate: string;
  sourceEntryCount: number;
  totalDebitCents: number;
  totalCreditCents: number;
  balanced: boolean;
  accounts: Array<{
    accountCode: string;
    debitBalanceCents: number;
    creditBalanceCents: number;
    targetBookCode: string | null;
    detailRequired: boolean;
    reconciliationNote: string;
  }>;
}

const INITIAL_ENTRIES: LedgerEntry[] = [];

export const GeneralLedgerModule: React.FC<{ subType?: string }> = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isStatements = currentPath === '/finance/general/statements';
  const isProfitLoss = currentPath === '/finance/general/profit-loss';
  const isAdvance = currentPath === '/finance/general/advance';

  const [data, setData] = useState<LedgerEntry[]>(INITIAL_ENTRIES);
  const [chartData, setChartData] = useState<ChartAccount[]>([]);
  const [accountingRegime, setAccountingRegime] = useState('');
  const [vatMethod, setVatMethod] = useState('');
  const [citMethod, setCitMethod] = useState('');
  const [advanceData, setAdvanceData] = useState<any[]>([]);
  const [selectedQuarter, setSelectedQuarter] = useState(() => {
    return getFiscalQuarterPeriod(new Date(), 1, 1);
  });
  const [fiscalYearStart, setFiscalYearStart] = useState({ month: 1, day: 1, ready: false });

  useEffect(() => {
    const list = dataService.getGenericData('finance_general_ledger');
    setData(Array.isArray(list) ? list : []);
    const initialChart = dataService.getGenericData('finance_chart_of_accounts');
    setChartData(Array.isArray(initialChart) ? initialChart : []);
    const advances = dataService.getGenericData('finance_advances');
    setAdvanceData(Array.isArray(advances) ? advances : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_general_ledger');
      setData(Array.isArray(updated) ? updated : []);
      const nextChart = dataService.getGenericData('finance_chart_of_accounts');
      setChartData(Array.isArray(nextChart) ? nextChart : []);
      const nextAdvances = dataService.getGenericData('finance_advances');
      setAdvanceData(Array.isArray(nextAdvances) ? nextAdvances : []);
    });
    return unsub;
  }, []);

  useEffect(() => {
    void systemApi.getCompanyProfile().then(({ data: response }) => {
      const month = Number(response.profile.fiscalYearStartMonth);
      const day = Number(response.profile.fiscalYearStartDay);
      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        setFiscalYearStart({ month, day, ready: Boolean(response.profile.accountingProfileComplete) });
        setSelectedQuarter(getFiscalQuarterPeriod(new Date(), month, day));
      }
      setAccountingRegime(String(response.profile.accountingRegime || ''));
      setVatMethod(String(response.profile.vatMethod || ''));
      setCitMethod(String(response.profile.citMethod || ''));
    }).catch(() => {});
  }, []);

  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [journalLines, setJournalLines] = useState<JournalLine[]>([{ account: '', debit: 0, credit: 0 }]);
  const [form] = Form.useForm();
  const [chartForm] = Form.useForm();
  const [chartModalOpen, setChartModalOpen] = useState(false);
  const [chartSaving, setChartSaving] = useState(false);
  const [chartImporting, setChartImporting] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ChartAccount | null>(null);
  const [transitionPreview, setTransitionPreview] = useState<TT58TransitionPreview | null>(null);
  const [transitionLoading, setTransitionLoading] = useState(false);
  const activeChart = chartData.filter((account) => account.accountingRegime === accountingRegime);
  const tt58Books = getTT58RequiredBooks(vatMethod, citMethod);

  const loadTT58TransitionPreview = async () => {
    try {
      setTransitionLoading(true);
      const { data: response } = await generalLedgerApi.previewTT132ToTT58Transition();
      setTransitionPreview(response.preview);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể đối chiếu số dư TT132.');
    } finally {
      setTransitionLoading(false);
    }
  };

  const formatTransitionAmount = (cents: number) => new Intl.NumberFormat('vi-VN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);

  const saveChartAccount = async (values: Record<string, any>) => {
    const record = { ...values, tracksParty: Boolean(values.tracksParty), tracksForeignCurrency: Boolean(values.tracksForeignCurrency), tracksDebt: Boolean(values.tracksDebt), tracksDetails: Boolean(values.tracksDetails), status: values.status || 'Đang sử dụng' };
    try {
      setChartSaving(true);
      if (editingAccount) await chartOfAccountsApi.update(editingAccount.key, record);
      else await chartOfAccountsApi.create(record);
      await dataService.refreshGenericData('finance_chart_of_accounts');
      message.success(editingAccount ? 'Đã cập nhật tài khoản.' : 'Đã thêm tài khoản.');
      setEditingAccount(null);
      chartForm.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu tài khoản.');
    } finally {
      setChartSaving(false);
    }
  };

  const importChartTemplate = () => {
    const template = {
      TT99: {
        name: 'Thông tư 99/2025/TT-BTC',
        appendix: 'Phụ lục II',
        effective: 'áp dụng cho năm tài chính bắt đầu từ hoặc sau ngày 01/01/2026',
        sourceUrl: 'https://congbao.chinhphu.vn/van-ban/thong-tu-so-99-2025-tt-btc-46529/59643.htm',
      },
      TT133: {
        name: 'Thông tư 133/2016/TT-BTC',
        appendix: 'Phụ lục 1',
        effective: 'áp dụng cho năm tài chính bắt đầu hoặc sau ngày 01/01/2017',
        sourceUrl: 'https://congbao.chinhphu.vn/tai-ve-van-ban-so-133-2016-tt-btc-21048-15524?format=pdf',
        statusNote: 'Cơ sở dữ liệu quốc gia về VBQPPL ghi nhận văn bản hết hiệu lực một phần. Hãy rà soát phần còn hiệu lực và quy chế kế toán của doanh nghiệp trước khi ghi sổ.',
        statusUrl: 'https://vbpl.moj.gov.vn/bonoivu/Pages/vbpq-thuoctinh.aspx?ItemID=113560&Keyword=',
      },
      TT132: {
        name: 'Thông tư 132/2018/TT-BTC',
        appendix: 'Phụ lục 2',
        effective: 'Thông tư áp dụng cho năm tài chính bắt đầu từ hoặc sau ngày 01/04/2019. Phụ lục 2 dành cho doanh nghiệp siêu nhỏ tính thuế TNDN trên thu nhập tính thuế; doanh nghiệp tính thuế theo tỷ lệ trên doanh thu có thể lựa chọn chế độ tại Chương II. Dùng để đối chiếu kỳ trước ngày 01/07/2026',
        sourceUrl: 'https://congbao.chinhphu.vn/tai-ve-van-ban-so-132-2018-tt-btc-28371-25710?format=pdf',
      },
    }[accountingRegime];
    if (!template) return;
    Modal.confirm({
    title: `Nạp mẫu tài khoản ${accountingRegime}`,
    content: (
      <div>
        <div>Chỉ thêm các tài khoản còn thiếu theo {template.appendix} {template.name}, {template.effective}. Tài khoản đã có sẽ được giữ nguyên; nếu mã trùng nhưng thông tin khác, toàn bộ thao tác sẽ bị từ chối.</div>
        <a href={template.sourceUrl} target="_blank" rel="noreferrer">Xem văn bản tại Công báo Chính phủ</a>
        {template.statusNote && <div><div>{template.statusNote}</div><a href={template.statusUrl} target="_blank" rel="noreferrer">Xem tình trạng hiệu lực trên Cơ sở dữ liệu quốc gia về VBQPPL</a></div>}
      </div>
    ),
    okText: 'Nạp mẫu',
    cancelText: 'Hủy',
    onOk: async () => {
      try {
        setChartImporting(true);
        const { data: result } = await chartOfAccountsApi.importTemplate();
        await dataService.refreshGenericData('finance_chart_of_accounts');
        message.success(`Đã thêm ${result.createdCount} tài khoản; giữ nguyên ${result.skippedCount} tài khoản đã có.`);
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Không thể nạp mẫu tài khoản.');
      } finally {
        setChartImporting(false);
      }
    },
    });
  };

  const deleteChartAccount = (account: ChartAccount) => Modal.confirm({
    title: 'Xóa tài khoản',
    content: `Xóa ${account.code} · ${account.name}? Tài khoản đã dùng trong bút toán hoặc còn tài khoản cấp dưới sẽ được giữ lại.`,
    okText: 'Xóa',
    cancelText: 'Hủy',
    onOk: async () => {
      try {
        await chartOfAccountsApi.remove(account.key);
        await dataService.refreshGenericData('finance_chart_of_accounts');
        message.success('Đã xóa tài khoản.');
      } catch (error: any) {
        message.error(error?.response?.data?.message || 'Không thể xóa tài khoản.');
      }
    },
  });

  const postedData = postedLedgerRecords(data);
  const totalAmount = postedData.reduce((sum, item) => sum + item.amount, 0);
  const getLines = (item: LedgerEntry): JournalLine[] => Array.isArray(item.lines) && item.lines.length
    ? item.lines
    : [
      ...(item.debitAccount ? [{ account: item.debitAccount, debit: Number(item.amount) || 0, credit: 0 }] : []),
      ...(item.creditAccount ? [{ account: item.creditAccount, debit: 0, credit: Number(item.amount) || 0 }] : []),
    ];
  const totalDebits = postedData.reduce((sum, item) => sum + getLines(item).reduce((lineSum, line) => lineSum + (Number(line.debit) || 0), 0), 0);
  const totalCredits = postedData.reduce((sum, item) => sum + getLines(item).reduce((lineSum, line) => lineSum + (Number(line.credit) || 0), 0), 0);
  const balancedLedger = postedData.length > 0 && postedData.every((item) => {
    const lines = getLines(item);
    const debits = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
    const credits = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
    return lines.length > 0 && lines.every(line => line.account && Number(line.debit) >= 0 && Number(line.credit) >= 0 && ((Number(line.debit) > 0) !== (Number(line.credit) > 0))) && Math.abs(debits - credits) < 0.005;
  }) && Math.abs(totalDebits - totalCredits) < 0.005;
  const accountSummary = summarizeLedgerAccounts(postedData);
  const quarterSummary = calculateQuarterLedger(data, selectedQuarter, fiscalYearStart.month, fiscalYearStart.day);
  const { year: yearText, quarter: quarterText, records: quarterLedgerData, revenue, expenses, netResult } = quarterSummary;
  const quarterDebits = quarterSummary.debits;
  const quarterCredits = quarterSummary.credits;
  const quarterClosed = data.some((item) => item.sourceReference === `period-close:${selectedQuarter}`);

  const currentFiscalPeriod = getFiscalQuarterPeriod(new Date(), fiscalYearStart.month, fiscalYearStart.day);
  const [currentFiscalYear, currentFiscalQuarter] = currentFiscalPeriod.split('-Q').map(Number);
  const quarterOptions = Array.from({ length: 8 }, (_, index) => {
    const serial = currentFiscalYear * 4 + currentFiscalQuarter - 1 - (7 - index);
    const year = Math.floor(serial / 4);
    const quarter = serial % 4 + 1;
    return { label: `Quý ${quarter} · Năm tài chính bắt đầu ${year}`, value: `${year}-Q${quarter}` };
  });

  const handleCreate = async (values: any) => {
    if (!activeChart.length) {
      message.error(`Chưa có danh mục tài khoản cho chế độ ${accountingRegime}. Hãy khai báo hoặc nạp danh mục trước khi ghi sổ.`);
      return;
    }
    const lines = journalLines.map(line => ({ account: line.account.trim(), debit: Number(line.debit) || 0, credit: Number(line.credit) || 0 }));
    const debitTotal = lines.reduce((sum, line) => sum + line.debit, 0);
    const creditTotal = lines.reduce((sum, line) => sum + line.credit, 0);
    if (lines.length < 2 || lines.some(line => !line.account || ((line.debit > 0) === (line.credit > 0))) || debitTotal <= 0 || Math.round(debitTotal * 100) !== Math.round(creditTotal * 100)) {
      message.error('Nhập ít nhất hai dòng hợp lệ và bảo đảm tổng phát sinh Nợ bằng tổng phát sinh Có.');
      return;
    }
    if (data.some((record) => record.voucherCode === String(values.voucherCode).trim())) {
      message.error('Số chứng từ này đã tồn tại trong Sổ Cái.');
      return;
    }
    let author = 'Người dùng hiện tại';
    try {
      const user = JSON.parse(localStorage.getItem('minepanel_user') || 'null');
      author = user?.name || user?.fullName || user?.email || author;
    } catch { /* Keep a non-identifying fallback if the local identity cache is invalid. */ }
    const newItem: LedgerEntry = {
      ...values,
      key: crypto.randomUUID(),
      amount: debitTotal,
      lines,
      author,
      status: 'Đã ghi sổ cái',
    };
    try {
      setSaving(true);
      await generalLedgerApi.createEntry(newItem);
      await dataService.refreshGenericData('finance_general_ledger');
      message.success(`Đã hạch toán chứng từ: ${values.voucherCode}`);
      setModalOpen(false);
      form.resetFields();
      setJournalLines([{ account: '', debit: 0, credit: 0 }]);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu chứng từ vào Sổ Cái.');
    } finally {
      setSaving(false);
    }
  };

  const exportLedger = () => {
    const exportData = postedLedgerRecords(filteredData);
    const rows = [
      ['Số chứng từ', 'Ngày hạch toán', 'Diễn giải', 'Tài khoản Nợ', 'Tài khoản Có', 'Số tiền', 'Người ghi sổ', 'Trạng thái'],
      ...exportData.map((item) => [item.voucherCode, item.entryDate, item.description, getLines(item).filter(line => line.debit > 0).map(line => line.account).join(', '), getLines(item).filter(line => line.credit > 0).map(line => line.account).join(', '), item.amount, item.author, item.status]),
    ];
    downloadFile('so_cai.xlsx', generateValidXlsxBlob(rows));
    message.success(`Đã xuất ${exportData.length} bút toán đã ghi Sổ Cái.`);
  };

  const exportStatement = () => {
    const rows = [
      ['Tài khoản', 'Phát sinh Nợ', 'Phát sinh Có', 'Chênh lệch Nợ - Có'],
      ...accountSummary.map((item) => [item.account, item.debit, item.credit, item.debit - item.credit]),
    ];
    downloadFile('bao_cao_phat_sinh_so_cai.xlsx', generateValidXlsxBlob(rows));
    message.success(`Đã xuất tổng hợp phát sinh từ ${postedData.length} bút toán đã ghi sổ.`);
  };

  const exportAccountReport = (account: string) => {
    const entries = postedData.filter((item) => getLines(item).some(line => line.account === account));
    const lines = entries.flatMap((item) => getLines(item).filter(line => line.account === account).map(line => `${item.entryDate} | ${item.voucherCode} | ${item.description} | No ${Number(line.debit).toLocaleString('vi-VN')} | Co ${Number(line.credit).toLocaleString('vi-VN')} VND`));
    downloadFile(`bao_cao_${account.replace(/[^a-z0-9]+/gi, '_')}.pdf`, generateValidPdfBlob(`BAO CAO ${account}`, 'Phat sinh tu cac but toan da luu trong So Cai', lines));
  };

  const exportFinancialReport = (code: string) => {
    const cashMovements = accountSummary.filter((item) => /(?:TK\s*)?11[12]/i.test(item.account));
    const reportLines = code === 'account-movements'
      ? [`Tổng tài khoản có phát sinh: ${accountSummary.length}`, `Tổng phát sinh Nợ: ${totalDebits.toLocaleString('vi-VN')} VND`, `Tổng phát sinh Có: ${totalCredits.toLocaleString('vi-VN')} VND`, ...accountSummary.map((item) => `${item.account}: No ${item.debit.toLocaleString('vi-VN')} VND / Co ${item.credit.toLocaleString('vi-VN')} VND`)]
      : code === 'quarter-result'
      ? [`Kỳ: Quý ${quarterText}/${yearText}`, `Doanh thu tài khoản đầu 5, 7: ${revenue.toLocaleString('vi-VN')} VND`, `Chi phí tài khoản đầu 6, 8: ${expenses.toLocaleString('vi-VN')} VND`, `Kết quả sơ bộ: ${netResult.toLocaleString('vi-VN')} VND`, `Số bút toán: ${quarterLedgerData.length}`]
      : code === 'cash-accounts'
      ? cashMovements.map((item) => `${item.account}: No ${item.debit.toLocaleString('vi-VN')} VND / Co ${item.credit.toLocaleString('vi-VN')} VND`)
      : postedData.flatMap((item) => getLines(item).map(line => `${item.entryDate} | ${item.voucherCode} | ${item.description} | ${line.account} | No ${Number(line.debit).toLocaleString('vi-VN')} | Co ${Number(line.credit).toLocaleString('vi-VN')} VND`));
    const titles: Record<string, string> = {
      'account-movements': 'Bảng tổng hợp phát sinh theo tài khoản',
      'quarter-result': `Kết quả sơ bộ quý ${quarterText}/${yearText}`,
      'cash-accounts': 'Phát sinh các tài khoản tiền',
      'general-journal': 'Nhật ký chung từ bút toán đã ghi sổ',
    };
    const title = titles[code] || 'Báo cáo Sổ Cái';
    downloadFile(`bao_cao_${code.replace(/[^a-z0-9]+/gi, '_')}.pdf`, generateValidPdfBlob(title, 'Báo cáo nội bộ từ các bút toán đã ghi Sổ Cái; chưa thay thế biểu mẫu pháp định hoặc xác nhận số dư đầu kỳ.', reportLines.length ? reportLines : ['Chưa có bút toán đã ghi sổ trong phạm vi báo cáo.']));
  };

  const closeQuarter = () => {
    if (quarterClosed) {
      message.warning(`Quý ${quarterText}/${yearText} đã có bút toán kết chuyển.`);
      return;
    }
    if (quarterLedgerData.length === 0) {
      message.warning(`Quý ${quarterText}/${yearText} chưa có bút toán đã ghi sổ để kết chuyển.`);
      return;
    }
    const lines = buildQuarterClosingLines(quarterSummary);
    if (lines.length === 0) {
      message.warning('Không có phát sinh doanh thu hoặc chi phí đủ điều kiện kết chuyển trong quý này.');
      return;
    }
    Modal.confirm({
      title: `Ghi bút toán kết chuyển quý ${quarterText}/${yearText}?`,
      content: `Sẽ tính và ghi bút toán trong máy chủ cho quý ${quarterText}/${yearText}. Kỳ tài chính kết thúc ngày ${quarterSummary.endDate}. Hãy đối chiếu số liệu trước khi xác nhận.`,
      okText: 'Ghi kết chuyển',
      cancelText: 'Hủy',
      onOk: async () => {
        try {
          const result = await generalLedgerApi.closeQuarter(selectedQuarter);
          await dataService.refreshGenericData('finance_general_ledger');
          message.success(`Máy chủ đã ghi ${result.data.entries} bút toán kết chuyển quý ${quarterText}/${yearText}.`);
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'Không thể ghi bút toán kết chuyển.');
        }
      },
    });
  };

  const filteredData = data.filter(
    (item) =>
      (item.voucherCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchText.toLowerCase()) ||
      getLines(item).some(line => line.account.toLowerCase().includes(searchText.toLowerCase()))
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giá trị phát sinh trong Sổ Cái</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalAmount.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Số bút toán đã ghi Sổ Cái</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {data.filter((d) => d.status === 'Đã ghi sổ cái').length} bút toán
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
        <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đối chiếu phát sinh Nợ - Có</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {!postedData.length ? 'Chưa có dữ liệu' : balancedLedger ? 'Đang khớp' : 'Cần kiểm tra'}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Nợ {totalDebits.toLocaleString('vi-VN')} ₫ · Có {totalCredits.toLocaleString('vi-VN')} ₫
          </div>
        </div>
      </div>

      {/* VIEW: STATEMENTS */}
      {isStatements && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Sổ và báo cáo nội bộ từ Sổ Cái</h3>
            <Button type="primary" icon={<DownloadOutlined />} onClick={exportStatement} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xuất tổng hợp phát sinh
            </Button>
          </div>
          <div style={{ fontSize: 12, color: '#64748B' }}>Các file chỉ tổng hợp bút toán đã ghi Sổ Cái trong hệ thống. Chúng không thay thế biểu mẫu báo cáo tài chính theo chế độ kế toán; số dư đầu kỳ, công nợ, tồn kho và phân loại dòng tiền cần được đối chiếu riêng.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {[
              { code: 'account-movements', name: 'Bảng tổng hợp phát sinh theo tài khoản', value: `${accountSummary.length} tài khoản · Nợ ${totalDebits.toLocaleString('vi-VN')} ₫ · Có ${totalCredits.toLocaleString('vi-VN')} ₫`, status: postedData.length ? 'Bút toán đã ghi sổ' : 'Chưa có dữ liệu' },
              { code: 'quarter-result', name: 'Kết quả sơ bộ theo quý', value: `Quý ${quarterText}/${yearText} · ${netResult.toLocaleString('vi-VN')} ₫`, status: quarterLedgerData.length ? 'Bút toán đã ghi sổ' : 'Chưa có dữ liệu kỳ này' },
              { code: 'cash-accounts', name: 'Phát sinh các tài khoản tiền', value: `${accountSummary.filter((item) => /(?:TK\s*)?11[12]/i.test(item.account)).length} tài khoản 111/112 có phát sinh`, status: postedData.length ? 'Chưa phân loại dòng tiền' : 'Chưa có dữ liệu' },
              { code: 'general-journal', name: 'Nhật ký chung', value: `${postedData.length} bút toán đã ghi sổ · ${accountSummary.length} tài khoản`, status: postedData.length ? 'Dữ liệu Sổ Cái' : 'Chưa có dữ liệu' },
            ].map((st) => (
              <Card key={st.code} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#009688', fontSize: 14 }}>{st.name}</span>
                  <Tag color={postedData.length ? 'processing' : 'warning'}>{st.status}</Tag>
                </div>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>{st.value}</div>
                <Button icon={<FilePdfOutlined />} onClick={() => exportFinancialReport(st.code)}>Tải PDF báo cáo</Button>
              </Card>
            ))}
          </div>
          <div className="transparent-table-card">
            <KTable dataSource={accountSummary} columns={[
              { title: 'Tài khoản', dataIndex: 'account', key: 'account' },
              { title: 'Phát sinh Nợ', dataIndex: 'debit', key: 'debit', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
              { title: 'Phát sinh Có', dataIndex: 'credit', key: 'credit', render: (value: number) => `${value.toLocaleString('vi-VN')} ₫` },
              { title: 'Chênh lệch Nợ - Có', key: 'balance', render: (_: any, record: { debit: number; credit: number }) => `${(record.debit - record.credit).toLocaleString('vi-VN')} ₫` },
              { title: 'Thao tác', key: 'action', render: (_: any, record: { account: string }) => <Button size="small" onClick={() => exportAccountReport(record.account)}>Tải sổ tài khoản</Button> },
            ]} />
          </div>
        </div>
      )}

      {/* VIEW: PROFIT-LOSS */}
      {isProfitLoss && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 840 }}>
          <Card title="Kết quả kinh doanh từ Sổ Cái" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#64748B' }}>Kỳ kết chuyển:</span>
              <Select value={selectedQuarter} onChange={setSelectedQuarter} options={quarterOptions} style={{ width: 170 }} />
            </div>
            <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>Chỉ tính bút toán đã ghi sổ trong quý đã chọn.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {[
                { step: `Doanh thu tài khoản đầu 5 và 7`, amount: revenue },
                { step: `Chi phí tài khoản đầu 6 và 8`, amount: expenses },
                { step: `Kết quả sơ bộ quý ${quarterText}/${yearText}`, amount: netResult },
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                  <strong style={{ fontSize: 13, color: '#0F172A' }}>{item.step}</strong>
                  <strong style={{ color: '#009688', fontSize: 13.5 }}>{item.amount.toLocaleString('vi-VN')} ₫</strong>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={() => message.info(`${quarterLedgerData.length} bút toán · Phát sinh Nợ ${quarterDebits.toLocaleString('vi-VN')} ₫ · Phát sinh Có ${quarterCredits.toLocaleString('vi-VN')} ₫`)}>Kiểm tra số dư</Button>
              <Button type="primary" icon={<FileSyncOutlined />} onClick={closeQuarter} disabled={!fiscalYearStart.ready || quarterLedgerData.length === 0 || quarterClosed} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                {quarterClosed ? 'Đã kết chuyển' : 'Chạy Kết Chuyển Tự Động'}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* VIEW: ADVANCE */}
      {isAdvance && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Tạm ứng nhân viên</h3>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/admin/finance/advances')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Quản lý tạm ứng
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={advanceData}
              columns={[
                { title: 'Mã phiếu', dataIndex: 'code', key: 'code' },
                { title: 'Nhân viên', dataIndex: 'employeeName', key: 'employeeName', render: (name: string) => <strong>{name || 'Chưa có dữ liệu'}</strong> },
                { title: 'Mục đích', dataIndex: 'purpose', key: 'purpose' },
                { title: 'Số tiền tạm ứng', dataIndex: 'advancedAmount', key: 'advancedAmount', render: (v: number) => `${Number(v || 0).toLocaleString('vi-VN')} ₫` },
                { title: 'Số thực chi', dataIndex: 'spentAmount', key: 'spentAmount', render: (v: number) => <strong style={{ color: '#0F172A' }}>{Number(v || 0).toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Chênh lệch', dataIndex: 'balance', key: 'balance', render: (v: number) => <span style={{ color: Number(v) >= 0 ? '#16A34A' : '#DC2626', fontWeight: 600 }}>{Number(v || 0).toLocaleString('vi-VN')} ₫</span> },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s.includes('Đã') ? 'success' : 'warning'}>{s}</Tag> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DEFAULT */}
      {!isStatements && !isProfitLoss && !isAdvance && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo số chứng từ, nội dung hạch toán, tài khoản..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 360, borderRadius: 6 }}
              allowClear
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<BookOutlined />} onClick={() => setChartModalOpen(true)}>Danh mục tài khoản</Button>
              <Button icon={<DownloadOutlined />} onClick={exportLedger}>
                Xuất Sổ Cái
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields();
                  setModalOpen(true);
                }}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Hạch toán chứng từ mới
              </Button>
            </div>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={filteredData}
              columns={[
                {
                  title: 'Số chứng từ',
                  dataIndex: 'voucherCode',
                  key: 'voucherCode',
                  render: (code: string) => (
                    <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <BookOutlined /> {code}
                    </span>
                  ),
                },
                {
                  title: 'Ngày hạch toán',
                  dataIndex: 'entryDate',
                  key: 'entryDate',
                },
                {
                  title: 'Diễn giải nội dung nghiệp vụ',
                  dataIndex: 'description',
                  key: 'description',
                  render: (d: string) => <span style={{ fontWeight: 500, color: '#1E293B' }}>{d}</span>,
                },
                {
                  title: 'Định khoản Nợ ➔ Có',
                  key: 'acc',
                  render: (_: any, r: LedgerEntry) => (
                    <div style={{ fontSize: 12 }}>{getLines(r).map((line, index) => <div key={`${r.key}-${index}`}>{line.account} · Nợ {Number(line.debit).toLocaleString('vi-VN')} · Có {Number(line.credit).toLocaleString('vi-VN')}</div>)}</div>
                  ),
                },
                {
                  title: 'Số tiền phát sinh',
                  dataIndex: 'amount',
                  key: 'amount',
                  render: (v: number) => <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{v.toLocaleString('vi-VN')} ₫</strong>,
                },
                {
                  title: 'Trạng thái ghi sổ',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string) => <Tag color={status.includes('Đã ghi') ? 'success' : 'warning'}>{status}</Tag>,
                },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* Modal Add Entry */}
      <Modal
        title="Hạch toán chứng từ nghiệp vụ khác"
        open={modalOpen}
        onCancel={() => { setModalOpen(false); form.resetFields(); setJournalLines([{ account: '', debit: 0, credit: 0 }]); }}
        footer={null}
        width={800}
      >
        {!activeChart.length && <div role="alert" style={{ color: '#92400E', marginTop: 14 }}>Chưa có danh mục tài khoản cho chế độ {accountingRegime || 'kế toán đang chọn'}. Hãy khai báo tài khoản trước khi ghi sổ.</div>}
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="voucherCode" label="Số chứng từ" initialValue={`PKT-${new Date().getFullYear()}-${String(data.length + 1).padStart(4, '0')}`} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="entryDate" label="Ngày hạch toán" initialValue={new Date().toISOString().substring(0, 10)} rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item name="description" label="Nội dung diễn giải" rules={[{ required: true, message: 'Nhập diễn giải' }]}>
            <Input.TextArea rows={2} placeholder="Ví dụ: Phân bổ chi phí thuê văn phòng tháng 8" />
          </Form.Item>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Dòng hạch toán</span>
              <Button icon={<PlusOutlined />} onClick={() => setJournalLines(current => [...current, { account: '', debit: 0, credit: 0 }])}>Thêm dòng</Button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <KTable
                dataSource={journalLines.map((line, index) => ({ ...line, lineIndex: index, key: String(index) }))}
                columns={[
                  { title: 'Tài khoản', key: 'account', render: (_: unknown, line: JournalLine & { lineIndex: number }) => activeChart.length
                    ? <Select aria-label={`Tài khoản dòng ${line.lineIndex + 1}`} value={line.account || undefined} placeholder="Chọn tài khoản" options={activeChart.filter((account) => account.status === 'Đang sử dụng' && !activeChart.some((child) => child.parentCode === account.code)).map((account) => ({ value: account.code, label: `${account.code} · ${account.name}` }))} onChange={(value) => setJournalLines(current => current.map((row, index) => index === line.lineIndex ? { ...row, account: value } : row))} />
                    : <Input aria-label={`Tài khoản dòng ${line.lineIndex + 1}`} disabled maxLength={24} value={line.account} placeholder="Khai báo danh mục trước" /> },
                  { title: 'Phát sinh Nợ', key: 'debit', render: (_: unknown, line: JournalLine & { lineIndex: number }) => <Input aria-label={`Phát sinh Nợ dòng ${line.lineIndex + 1}`} type="number" min={0} step="0.01" value={line.debit || ''} onChange={event => setJournalLines(current => current.map((row, index) => index === line.lineIndex ? { ...row, debit: Number(event.target.value) || 0 } : row))} /> },
                  { title: 'Phát sinh Có', key: 'credit', render: (_: unknown, line: JournalLine & { lineIndex: number }) => <Input aria-label={`Phát sinh Có dòng ${line.lineIndex + 1}`} type="number" min={0} step="0.01" value={line.credit || ''} onChange={event => setJournalLines(current => current.map((row, index) => index === line.lineIndex ? { ...row, credit: Number(event.target.value) || 0 } : row))} /> },
                  { title: '', key: 'action', width: 48, render: (_: unknown, line: JournalLine & { lineIndex: number }) => <Button className="ant-btn-square-icon" aria-label={`Xóa dòng ${line.lineIndex + 1}`} icon={<DeleteOutlined />} disabled={journalLines.length <= 2} onClick={() => setJournalLines(current => current.filter((_, index) => index !== line.lineIndex))} /> },
                ]}
                pagination={{ pageSize: 100 }}
                disableCache
              />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span>Tổng Nợ: {journalLines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0).toLocaleString('vi-VN')} ₫</span>
              <span>Tổng Có: {journalLines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0).toLocaleString('vi-VN')} ₫</span>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button disabled={saving} onClick={() => { setModalOpen(false); form.resetFields(); setJournalLines([{ account: '', debit: 0, credit: 0 }]); }}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={saving || !fiscalYearStart.ready || !activeChart.length} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Ghi sổ cái
            </Button>
          </div>
        </Form>
      </Modal>
      <Modal
        title={`Danh mục tài khoản${accountingRegime ? ` · ${accountingRegime}` : ''}`}
        open={chartModalOpen}
        onCancel={() => { setChartModalOpen(false); setEditingAccount(null); chartForm.resetFields(); }}
        footer={null}
        width={1100}
      >
        {accountingRegime === 'TT58' && (
          <div style={{ color: '#64748B', marginBottom: 14 }}>
            <div>Danh mục tài khoản ở đây chỉ phục vụ theo dõi nội bộ. Sổ theo Thông tư 58 được xác định theo phương pháp thuế GTGT và TNDN:</div>
            {tt58Books ? <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
              <span>Sổ bắt buộc theo hồ sơ thuế:</span>
              {tt58Books.map(book => <Tag key={book.code}>{book.code} · {book.name}</Tag>)}
              <span>Sổ chi tiết có thể mở theo nhu cầu:</span>
              {tt58OptionalBooks.map(book => <Tag key={book.code}>{book.code} · {book.name}</Tag>)}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
                <Button icon={<FileSyncOutlined />} loading={transitionLoading} onClick={() => void loadTT58TransitionPreview()}>
                  Đối chiếu số dư TT132
                </Button>
                <span>Bản xem trước chỉ đọc số dư đã ghi sổ trước ngày hiệu lực; chưa tạo bút toán đầu kỳ và chưa lưu sổ chi tiết.</span>
              </div>
              {transitionPreview && <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                <span>Ngày mở sổ {transitionPreview.openingDate} · {transitionPreview.sourceEntryCount} bút toán nguồn · Nợ {formatTransitionAmount(transitionPreview.totalDebitCents)} · Có {formatTransitionAmount(transitionPreview.totalCreditCents)}</span>
                {!transitionPreview.balanced && <Tag color="red">Tổng số dư chưa cân bằng, cần xử lý trước khi chuyển sổ</Tag>}
                {!transitionPreview.accounts.length && <span>Không có số dư TT132 đã ghi sổ trước ngày mở sổ.</span>}
                {!!transitionPreview.accounts.length && <KTable
                  dataSource={transitionPreview.accounts.map(account => ({ ...account, key: account.accountCode }))}
                  columns={[
                    { title: 'Tài khoản', dataIndex: 'accountCode', key: 'accountCode' },
                    { title: 'Dư Nợ', key: 'debitBalanceCents', render: (_: unknown, account: TT58TransitionPreview['accounts'][number]) => formatTransitionAmount(account.debitBalanceCents) },
                    { title: 'Dư Có', key: 'creditBalanceCents', render: (_: unknown, account: TT58TransitionPreview['accounts'][number]) => formatTransitionAmount(account.creditBalanceCents) },
                    { title: 'Sổ đích', key: 'targetBookCode', render: (_: unknown, account: TT58TransitionPreview['accounts'][number]) => account.targetBookCode || 'Cần đối chiếu' },
                    { title: 'Theo dõi chi tiết', key: 'reconciliationNote', render: (_: unknown, account: TT58TransitionPreview['accounts'][number]) => account.detailRequired ? account.reconciliationNote : 'Không yêu cầu' },
                  ]}
                  pagination={false}
                />}
              </div>}
            </div> : <div style={{ marginTop: 8 }}>Hãy khai báo phương pháp GTGT và TNDN phù hợp trong Hồ sơ kế toán để xác định danh mục sổ TT58.</div>}
          </div>
        )}
        {['TT99', 'TT133', 'TT132'].includes(accountingRegime) && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
            <Button icon={<FileSyncOutlined />} loading={chartImporting} onClick={importChartTemplate}>Nạp mẫu {accountingRegime}</Button>
          </div>
        )}
        <Form form={chartForm} layout="vertical" onFinish={saveChartAccount} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(140px, 1fr))', gap: 10 }}>
            <Form.Item name="code" label="Mã tài khoản" rules={[{ required: true }]}><Input maxLength={20} placeholder="Ví dụ: 111" /></Form.Item>
            <Form.Item name="name" label="Tên tài khoản" rules={[{ required: true }]}><Input maxLength={200} /></Form.Item>
            <Form.Item name="parentCode" label="Tài khoản cấp trên"><Select allowClear placeholder="Không có" options={activeChart.filter((item) => item.key !== editingAccount?.key).map((item) => ({ value: item.code, label: `${item.code} · ${item.name}` }))} /></Form.Item>
            <Form.Item name="accountType" label="Loại tài khoản" rules={[{ required: true }]}><Select options={['Tài sản', 'Nợ phải trả', 'Vốn chủ sở hữu', 'Doanh thu', 'Chi phí', 'Thu nhập khác', 'Chi phí khác', 'Xác định kết quả'].map((value) => ({ value, label: value }))} /></Form.Item>
            <Form.Item name="balanceNature" label="Tính chất số dư" initialValue="Chưa xác định" rules={[{ required: true }]}><Select options={['Dư Nợ', 'Dư Có', 'Lưỡng tính', 'Chưa xác định'].map((value) => ({ value, label: value }))} /></Form.Item>
            <Form.Item name="effectiveDate" label="Ngày hiệu lực" rules={[{ required: true }]}><Input type="date" /></Form.Item>
            <Form.Item name="status" label="Trạng thái" initialValue="Đang sử dụng"><Select options={['Đang sử dụng', 'Ngừng sử dụng'].map((value) => ({ value, label: value }))} /></Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: 8 }}>
            {[
              ['tracksParty', 'Theo dõi đối tượng'],
              ['tracksForeignCurrency', 'Theo dõi ngoại tệ'],
              ['tracksDebt', 'Theo dõi công nợ'],
              ['tracksDetails', 'Mở sổ chi tiết'],
            ].map(([name, label]) => <Form.Item key={name} name={name} label={label} initialValue={false}><Select options={[{ value: false, label: 'Không' }, { value: true, label: 'Có' }]} /></Form.Item>)}
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
            {editingAccount && <Button onClick={() => { setEditingAccount(null); chartForm.resetFields(); }}>Hủy sửa</Button>}
            <Button type="primary" htmlType="submit" loading={chartSaving} icon={<PlusOutlined />}>{editingAccount ? 'Lưu thay đổi' : 'Thêm tài khoản'}</Button>
          </div>
        </Form>
        <KTable
          dataSource={activeChart.slice().sort((left, right) => left.code.localeCompare(right.code, 'vi', { numeric: true }))}
          columns={[
            { title: 'Mã', dataIndex: 'code', key: 'code' },
            { title: 'Tên tài khoản', dataIndex: 'name', key: 'name' },
            { title: 'Cấp', dataIndex: 'level', key: 'level' },
            { title: 'Loại', dataIndex: 'accountType', key: 'accountType' },
            { title: 'Số dư', dataIndex: 'balanceNature', key: 'balanceNature' },
            { title: 'Trạng thái', dataIndex: 'status', key: 'status' },
            { title: 'Thao tác', key: 'actions', render: (_: unknown, item: ChartAccount) => <div style={{ display: 'flex', gap: 4 }}><Button className="ant-btn-square-icon" aria-label={`Sửa tài khoản ${item.code}`} icon={<EditOutlined />} onClick={() => { setEditingAccount(item); chartForm.setFieldsValue(item); }} /><Button className="ant-btn-square-icon" aria-label={`Xóa tài khoản ${item.code}`} icon={<DeleteOutlined />} onClick={() => deleteChartAccount(item)} /></div> },
          ]}
          pagination={{ pageSize: 12 }}
        />
        {!activeChart.length && <div style={{ color: '#64748B', padding: '8px 0' }}>Chưa có tài khoản cho chế độ kế toán này. Thêm danh mục đã được doanh nghiệp phê duyệt trước khi ghi sổ.</div>}
      </Modal>
    </div>
  );
};
