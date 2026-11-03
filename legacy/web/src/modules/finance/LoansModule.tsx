import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileProtectOutlined,
  PlusOutlined,
  SearchOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { useLocation } from 'react-router-dom';
import { KTable } from '../../components/KTable';
import { filesApi, financeLoanEventsApi, financePaymentAccountsApi, systemApi, type FinanceLoanEvent, type FinanceLoanScheduleAdjustment, type FinancePaymentAccount } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';
import { Alert, Button, Drawer, Form, Input, message, Modal, Select, Tabs } from '../../custom-ui';
import { hasUniqueLoanContractCode, isValidLoanDateRange, loanAccountsFor, loanDirectionOf, type LoanDirection } from './loanRules';

type InterestRateRow = { rate: string; overdueRate: string; effectiveFrom: string; note: string };
type LoanAttachment = { id: string; name: string; size: number; mimeType?: string };
type LoanScheduleRow = { key: string; dueDate: string; principalAmount: string; interestAmount: string; note: string };

export interface EnterpriseLoanItem {
  key: string;
  direction?: LoanDirection;
  contractCode: string;
  counterpartyName?: string;
  bankName?: string;
  creditContract?: string;
  purpose?: string;
  principalAccount?: string;
  interestAccount?: string;
  currency?: string;
  principalAmount: number;
  termMonths?: number;
  disbursedDate: string;
  dueDate: string;
  disbursementMethod?: string;
  beneficiaryAccount?: string;
  rateType?: string;
  interestDayBase?: string;
  adjustmentMethod?: string;
  rates?: Array<{ rate: number | null; overdueRate: number | null; effectiveFrom: string; note: string }>;
  loanSchedules?: Array<{ key: string; dueDate: string; principalAmount: number; interestAmount: number; note?: string }>;
  loanScheduleAdjustments?: FinanceLoanScheduleAdjustment[];
  interestRate?: number;
  principalRepayment?: string;
  firstPrincipalDate?: string;
  interestRepayment?: string;
  firstInterestDate?: string;
  repaymentMethod?: string;
  repaymentAccount?: string;
  repaymentBankName?: string;
  project?: string;
  purchaseOrder?: string;
  purchaseContract?: string;
  salesOrder?: string;
  salesContract?: string;
  expenseItem?: string;
  cashflowItem?: string;
  attachments?: LoanAttachment[];
  loanType?: string;
  monthlyInterest?: number;
  monthlyPrincipal?: number;
  collateral?: string;
  status?: string;
  [field: string]: unknown;
}

const todayIso = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};
const blankRate = (date = todayIso()): InterestRateRow => ({ rate: '', overdueRate: '', effectiveFrom: date, note: '' });
const blankLoanSchedule = (date = todayIso()): LoanScheduleRow => ({ key: crypto.randomUUID(), dueDate: date, principalAmount: '', interestAmount: '', note: '' });
const emptyLoan = (direction: LoanDirection, contractCode = '') => ({
  direction,
  contractCode,
  counterpartyName: '',
  creditContract: '',
  purpose: '',
  principalAccount: '',
  interestAccount: '',
  currency: 'VND',
  principalAmount: 0,
  termMonths: 0,
  disbursedDate: todayIso(),
  dueDate: todayIso(),
  disbursementMethod: direction === 'borrow' ? 'Chuyển khoản vào tài khoản DN' : 'Chuyển khoản',
  beneficiaryAccount: '',
  bankName: '',
  rateType: 'Lãi suất trên dư nợ giảm dần',
  interestDayBase: 'Lãi năm/365',
  adjustmentMethod: 'Cố định',
  principalRepayment: '',
  firstPrincipalDate: todayIso(),
  interestRepayment: '',
  firstInterestDate: todayIso(),
  repaymentMethod: '',
  repaymentAccount: '',
  repaymentBankName: '',
  project: '',
  purchaseOrder: '',
  purchaseContract: '',
  salesOrder: '',
  salesContract: '',
  expenseItem: '',
  cashflowItem: '',
});

const money = (value: unknown) => `${(Number(value) || 0).toLocaleString('vi-VN')} ₫`;
const loanCounterparty = (loan: EnterpriseLoanItem) => loan.counterpartyName || loan.bankName || '—';

export const LoansModule: React.FC<{ defaultType?: string }> = () => {
  const currentPath = useLocation().pathname.replace(/^\/admin/, '');
  const routeDirection: LoanDirection | 'all' = currentPath.endsWith('/borrow') ? 'borrow' : currentPath.endsWith('/lend') ? 'lend' : 'all';
  const [data, setData] = useState<EnterpriseLoanItem[]>([]);
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingLoan, setEditingLoan] = useState<EnterpriseLoanItem | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<EnterpriseLoanItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form] = Form.useForm();
  const [draftDirection, setDraftDirection] = useState<LoanDirection>(routeDirection === 'lend' ? 'lend' : 'borrow');
  const [rateRows, setRateRows] = useState<InterestRateRow[]>([blankRate()]);
  const [savedAttachments, setSavedAttachments] = useState<LoanAttachment[]>([]);
  const [removedAttachments, setRemovedAttachments] = useState<LoanAttachment[]>([]);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [scheduleRows, setScheduleRows] = useState<LoanScheduleRow[]>([]);
  const [loanEvents, setLoanEvents] = useState<FinanceLoanEvent[]>([]);
  const [cashAccounts, setCashAccounts] = useState<FinancePaymentAccount[]>([]);
  const [eventType, setEventType] = useState<FinanceLoanEvent['eventType']>('disbursement');
  const [eventSaving, setEventSaving] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventLoan, setEventLoan] = useState<EnterpriseLoanItem | null>(null);
  const [eventForm] = Form.useForm();
  const [scheduleAdjustmentForm] = Form.useForm();
  const [scheduleAdjustmentOpen, setScheduleAdjustmentOpen] = useState(false);
  const [scheduleAdjustmentSaving, setScheduleAdjustmentSaving] = useState(false);
  const [scheduleAdjustmentRows, setScheduleAdjustmentRows] = useState<LoanScheduleRow[]>([]);
  const [accountingRegime, setAccountingRegime] = useState('');
  const [chartAccounts, setChartAccounts] = useState<Array<{ code: string; name: string; parentCode?: string; accountingRegime: string; status: string; accountType: string }>>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    systemApi.getCompanyProfile().then(async ({ data: response }) => {
      const regime = String(response.profile.accountingRegime || '');
      const [accounts, paymentAccounts] = await Promise.all([
        dataService.refreshGenericData('finance_chart_of_accounts'),
        financePaymentAccountsApi.getAccounts(),
      ]);
      if (!active) return;
      setAccountingRegime(regime);
      setChartAccounts(accounts);
      setCashAccounts(paymentAccounts.data.accounts.filter(account => account.status === 'Đang hoạt động'));
    }).catch(() => { if (active) message.error('Không tải được chế độ kế toán và danh mục tài khoản cho khoản vay.'); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const refresh = () => {
      const rows = dataService.getGenericData('finance_loans');
      setData(Array.isArray(rows) ? rows : []);
    };
    refresh();
    const unsubscribe = dataService.subscribe(refresh);
    return unsubscribe;
  }, []);

  useEffect(() => {
    const refresh = () => {
      const rows = dataService.getGenericData('finance_loan_events');
      setLoanEvents(Array.isArray(rows) ? rows as FinanceLoanEvent[] : []);
    };
    void dataService.refreshGenericData('finance_loan_events').then(refresh).catch(() => message.error('Không tải được lịch sử giao dịch khoản vay.'));
    const unsubscribe = dataService.subscribe(refresh);
    return unsubscribe;
  }, []);

  const visibleData = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    return data.filter(loan => {
      if (routeDirection !== 'all' && loanDirectionOf(loan) !== routeDirection) return false;
      return !query || [loan.contractCode, loanCounterparty(loan), loan.creditContract, loan.purpose]
        .some(value => String(value || '').toLocaleLowerCase().includes(query));
    });
  }, [data, routeDirection, searchText]);
  const totalPrincipal = visibleData.reduce((sum, loan) => sum + (Number(loan.principalAmount) || 0), 0);

  const loanBalance = (loanKey: string) => loanEvents.filter(event => event.loanKey === loanKey).reduce((balance, event) => ({
    principalDrawn: balance.principalDrawn + (event.eventType === 'disbursement' ? Number(event.principalAmount) || 0 : 0),
    principalRepaid: balance.principalRepaid + (event.eventType === 'repayment' ? Number(event.principalAmount) || 0 : 0),
  }), { principalDrawn: 0, principalRepaid: 0 });

  const loanScheduleRemaining = (loanKey: string, schedule: NonNullable<EnterpriseLoanItem['loanSchedules']>[number]) => {
    const payments = loanEvents.filter(event => event.loanKey === loanKey && event.scheduleKey === schedule.key);
    return {
      principalAmount: Math.max(0, schedule.principalAmount - payments.reduce((sum, event) => sum + Number(event.principalAmount || 0), 0)),
      interestAmount: Math.max(0, schedule.interestAmount - payments.reduce((sum, event) => sum + Number(event.interestAmount || 0), 0)),
    };
  };

  const openLoanEvent = (loan: EnterpriseLoanItem, type: FinanceLoanEvent['eventType']) => {
    setEventLoan(loan);
    setEventType(type);
    eventForm.resetFields();
    const firstOpenSchedule = type === 'repayment'
      ? loan.loanSchedules?.find(schedule => {
        const remaining = loanScheduleRemaining(loan.key, schedule);
        return remaining.principalAmount > 0 || remaining.interestAmount > 0;
      })
      : undefined;
    const remaining = firstOpenSchedule ? loanScheduleRemaining(loan.key, firstOpenSchedule) : undefined;
    eventForm.setFieldsValue({
      eventDate: todayIso(),
      scheduleKey: firstOpenSchedule?.key,
      principalAmount: remaining?.principalAmount || 0,
      interestAmount: remaining?.interestAmount || 0,
      sourceAccountId: cashAccounts[0]?.key || '',
    });
    setEventModalOpen(true);
  };

  const closeLoanEvent = () => {
    setEventModalOpen(false);
    setEventLoan(null);
    eventForm.resetFields();
  };

  const handleLoanEvent = async (values: Record<string, any>) => {
    if (!eventLoan || eventSaving) return;
    const principalAmount = Number(values.principalAmount) || 0;
    const interestAmount = eventType === 'repayment' ? Number(values.interestAmount) || 0 : 0;
    if (!Number.isSafeInteger(principalAmount) || principalAmount < 0 || !Number.isSafeInteger(interestAmount) || interestAmount < 0 || principalAmount + interestAmount <= 0) {
      message.error('Tiền gốc và lãi phải là số nguyên không âm, trong đó tổng giao dịch lớn hơn 0.');
      return;
    }
    if (eventType === 'disbursement' && principalAmount <= 0) {
      message.error('Số tiền giải ngân phải lớn hơn 0.');
      return;
    }
    setEventSaving(true);
    try {
      const response = await financeLoanEventsApi.create(eventLoan.key, {
        eventType,
        eventDate: String(values.eventDate || ''),
        scheduleKey: values.scheduleKey ? String(values.scheduleKey) : undefined,
        principalAmount,
        interestAmount,
        reference: String(values.reference || '').trim(),
        sourceAccountId: String(values.sourceAccountId || ''),
        note: String(values.note || '').trim() || undefined,
      });
      await Promise.all([
        dataService.refreshGenericData('finance_loan_events'),
        dataService.refreshGenericData('finance_general_ledger'),
        financePaymentAccountsApi.getAccounts().then(({ data: response }) => setCashAccounts(response.accounts.filter(account => account.status === 'Đang hoạt động'))),
      ]);
      const eventLabel = eventType === 'disbursement' ? 'giải ngân' : loanDirectionOf(eventLoan) === 'borrow' ? 'trả nợ' : 'thu nợ';
      message.success(`Đã ghi nhận ${eventLabel} ${response.data.transaction.code} vào phiếu tiền và Sổ Cái.`);
      closeLoanEvent();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể ghi nhận giao dịch khoản vay.');
    } finally {
      setEventSaving(false);
    }
  };

  const openScheduleAdjustment = (loan: EnterpriseLoanItem) => {
    setScheduleAdjustmentRows((loan.loanSchedules || []).map(row => ({
      key: row.key,
      dueDate: row.dueDate,
      principalAmount: String(row.principalAmount),
      interestAmount: String(row.interestAmount),
      note: row.note || '',
    })));
    scheduleAdjustmentForm.resetFields();
    scheduleAdjustmentForm.setFieldsValue({ effectiveDate: todayIso(), reason: '' });
    setScheduleAdjustmentOpen(true);
  };

  const closeScheduleAdjustment = () => {
    setScheduleAdjustmentOpen(false);
    setScheduleAdjustmentRows([]);
    scheduleAdjustmentForm.resetFields();
  };

  const handleScheduleAdjustment = async (values: Record<string, any>) => {
    if (!selectedLoan || scheduleAdjustmentSaving) return;
    const schedules = scheduleAdjustmentRows.map(row => ({
      key: row.key,
      dueDate: row.dueDate,
      principalAmount: row.principalAmount.trim() ? Number(row.principalAmount) : 0,
      interestAmount: row.interestAmount.trim() ? Number(row.interestAmount) : 0,
      note: row.note.trim(),
    }));
    const principalTotal = schedules.reduce((sum, row) => sum + row.principalAmount, 0);
    if (!schedules.length || schedules.some(row => !row.dueDate || ![row.principalAmount, row.interestAmount].every(amount => Number.isSafeInteger(amount) && amount >= 0))) {
      message.error('Nhập ít nhất một kỳ với ngày hợp lệ và số tiền gốc, lãi là số nguyên không âm.');
      return;
    }
    if (principalTotal !== Number(selectedLoan.principalAmount)) {
      message.error('Tổng tiền gốc các kỳ phải bằng giá trị khoản vay; nhập theo phụ lục hợp đồng.');
      return;
    }
    setScheduleAdjustmentSaving(true);
    try {
      const response = await financeLoanEventsApi.adjustSchedule(selectedLoan.key, {
        effectiveDate: String(values.effectiveDate || ''),
        reason: String(values.reason || '').trim(),
        loanSchedules: schedules,
      });
      setSelectedLoan(response.data.loan as EnterpriseLoanItem);
      await dataService.refreshGenericData('finance_loans');
      message.success('Đã lưu điều chỉnh lịch trả nợ và lịch sử trước, sau.');
      closeScheduleAdjustment();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể điều chỉnh lịch trả nợ.');
    } finally {
      setScheduleAdjustmentSaving(false);
    }
  };

  const closeForm = () => {
    setModalOpen(false);
    setEditingLoan(null);
    setPendingFiles([]);
    setRemovedAttachments([]);
    setScheduleRows([]);
    form.resetFields();
  };

  const openCreate = () => {
    const direction: LoanDirection = routeDirection === 'lend' ? 'lend' : 'borrow';
    setDraftDirection(direction);
    form.resetFields();
    form.setFieldsValue(emptyLoan(direction, `KU${direction === 'borrow' ? 'V' : 'CV'}${String(data.length + 1).padStart(5, '0')}`));
    setEditingLoan(null);
    setRateRows([blankRate()]);
    setScheduleRows([]);
    setSavedAttachments([]);
    setRemovedAttachments([]);
    setPendingFiles([]);
    setModalOpen(true);
  };

  const openEdit = (loan: EnterpriseLoanItem) => {
    const direction = loanDirectionOf(loan);
    setDraftDirection(direction);
    setEditingLoan(loan);
    form.resetFields();
    form.setFieldsValue({ ...emptyLoan(direction), ...loan, counterpartyName: loanCounterparty(loan) });
    const oldRateRows = Array.isArray(loan.rates) ? loan.rates : [];
    setRateRows(oldRateRows.length
      ? oldRateRows.map(row => ({ rate: row.rate == null ? '' : String(row.rate), overdueRate: row.overdueRate == null ? '' : String(row.overdueRate), effectiveFrom: row.effectiveFrom || todayIso(), note: row.note || '' }))
      : [blankRate(), ...(Number.isFinite(Number(loan.interestRate)) && loan.interestRate ? [{ rate: String(loan.interestRate), overdueRate: '', effectiveFrom: loan.disbursedDate || todayIso(), note: '' }] : [])]);
    setScheduleRows(Array.isArray(loan.loanSchedules) ? loan.loanSchedules.map(row => ({ key: row.key, dueDate: row.dueDate, principalAmount: String(row.principalAmount), interestAmount: String(row.interestAmount), note: row.note || '' })) : []);
    setSavedAttachments(Array.isArray(loan.attachments) ? loan.attachments : []);
    setRemovedAttachments([]);
    setPendingFiles([]);
    setModalOpen(true);
  };

  const processFiles = (files: File[]) => {
    const size = [...savedAttachments, ...pendingFiles].reduce((sum, file) => sum + Number(file.size || 0), 0)
      + files.reduce((sum, file) => sum + file.size, 0);
    if (size > 5 * 1024 * 1024) {
      message.error('Tổng dung lượng tệp đính kèm tối đa 5 MB.');
      return;
    }
    setPendingFiles(current => [...current, ...files]);
  };

  const handleSave = async (values: Record<string, any>) => {
    if (saving) return;
    const direction = (values.direction === 'lend' ? 'lend' : 'borrow') as LoanDirection;
    const contractCode = String(values.contractCode || '').trim();
    const principalAmount = Number(values.principalAmount);
    const termMonths = Number(values.termMonths);
    if (!hasUniqueLoanContractCode(data, contractCode, editingLoan?.key)) {
      message.error('Số khế ước đã tồn tại. Hãy nhập số khác.');
      return;
    }
    if (!Number.isSafeInteger(principalAmount) || principalAmount <= 0 || !Number.isSafeInteger(termMonths) || termMonths <= 0) {
      message.error('Giá trị khoản vay và thời hạn vay phải là số nguyên dương hợp lệ.');
      return;
    }
    if (!isValidLoanDateRange(values.disbursedDate, values.dueDate)) {
      message.error('Ngày đáo hạn phải bằng hoặc sau ngày giải ngân.');
      return;
    }
    const normalizedSchedules: NonNullable<EnterpriseLoanItem['loanSchedules']> = [];
    let scheduledPrincipal = 0;
    const scheduleDates = new Set<string>();
    for (const [index, row] of scheduleRows.entries()) {
      const principal = row.principalAmount.trim() ? Number(row.principalAmount) : 0;
      const interest = row.interestAmount.trim() ? Number(row.interestAmount) : 0;
      if (!isValidLoanDateRange(values.disbursedDate, row.dueDate) || row.dueDate > values.dueDate) {
        message.error(`Ngày kỳ trả nợ ${index + 1} phải nằm trong thời hạn khế ước.`);
        return;
      }
      if (scheduleDates.has(row.dueDate)) {
        message.error('Mỗi ngày đến hạn chỉ được có một kỳ trả nợ.');
        return;
      }
      scheduleDates.add(row.dueDate);
      if (![principal, interest].every(amount => Number.isSafeInteger(amount) && amount >= 0) || principal + interest <= 0) {
        message.error(`Tiền gốc và lãi kỳ ${index + 1} phải là số nguyên không âm và kỳ phải có số tiền lớn hơn 0.`);
        return;
      }
      scheduledPrincipal += principal;
      normalizedSchedules.push({ key: row.key, dueDate: row.dueDate, principalAmount: principal, interestAmount: interest, note: row.note.trim() });
    }
    if (normalizedSchedules.length && scheduledPrincipal !== principalAmount) {
      message.error('Tổng tiền gốc các kỳ phải bằng giá trị khoản vay; nhập lịch theo hợp đồng đã ký.');
      return;
    }
    const principalType = direction === 'borrow' ? 'Nợ phải trả' : 'Tài sản';
    const interestType = direction === 'borrow' ? 'Chi phí' : 'Doanh thu';
    if (!loanAccountsFor(chartAccounts, accountingRegime, principalType).some(account => account.code === values.principalAccount)) {
      message.error(`Chọn tài khoản chi tiết đang sử dụng thuộc nhóm ${principalType} trong danh mục doanh nghiệp.`);
      return;
    }
    if (!loanAccountsFor(chartAccounts, accountingRegime, interestType).some(account => account.code === values.interestAccount)) {
      message.error(`Chọn tài khoản chi tiết đang sử dụng thuộc nhóm ${interestType} trong danh mục doanh nghiệp.`);
      return;
    }
    const normalizedRates: NonNullable<EnterpriseLoanItem['rates']> = [];
    for (const row of rateRows) {
      const rate = row.rate.trim() ? Number(row.rate) : null;
      const overdueRate = row.overdueRate.trim() ? Number(row.overdueRate) : null;
      if ([rate, overdueRate].some(value => value !== null && (!Number.isFinite(value) || value < 0 || value > 100))) {
        message.error('Lãi suất phải nằm trong khoảng từ 0 đến 100%.');
        return;
      }
      if (rate !== null || overdueRate !== null) normalizedRates.push({ rate, overdueRate, effectiveFrom: row.effectiveFrom, note: row.note.trim() });
    }
    const uploadedAttachments: LoanAttachment[] = [];
    setSaving(true);
    try {
      if (pendingFiles.length) {
        const root = await filesApi.list(null);
        for (const file of pendingFiles) {
          const uploaded = (await filesApi.upload(file, file.name, root.data.context.parentId || undefined, 'finance_loans')).data.file;
          uploadedAttachments.push({ id: uploaded.id || uploaded.key, name: uploaded.name, size: Number(uploaded.sizeBytes) || file.size, mimeType: uploaded.mime || file.type });
        }
      }
      const firstRate = normalizedRates.find(row => row.rate !== null)?.rate ?? null;
      const item: EnterpriseLoanItem = {
        ...(editingLoan || {}),
        ...values,
        key: editingLoan?.key || crypto.randomUUID(),
        direction,
        contractCode,
        disbursedDate: String(values.disbursedDate || ''),
        dueDate: String(values.dueDate || ''),
        counterpartyName: String(values.counterpartyName || '').trim(),
        bankName: String(values.bankName || '').trim(),
        principalAmount,
        termMonths,
        currency: values.currency || 'VND',
        rates: normalizedRates,
        loanSchedules: normalizedSchedules,
        interestRate: firstRate ?? undefined,
        attachments: [...savedAttachments, ...uploadedAttachments],
        loanType: direction === 'borrow' ? 'Khế ước đi vay' : 'Khế ước cho vay',
      };
      if (editingLoan) {
        await dataService.updateGenericRecord('finance_loans', item);
        message.success(`Đã cập nhật khế ước ${contractCode}.`);
      } else {
        await dataService.createGenericRecord('finance_loans', item);
        message.success(`Đã lưu khế ước ${contractCode}.`);
      }
      const removalResults = await Promise.allSettled(removedAttachments.map(file => filesApi.remove(file.id)));
      if (removalResults.some(result => result.status === 'rejected')) message.warning('Khế ước đã lưu, nhưng một số tệp đã bỏ chưa được xóa khỏi kho tệp.');
      closeForm();
    } catch (error: any) {
      await Promise.all(uploadedAttachments.map(file => filesApi.remove(file.id).catch(() => {})));
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu khế ước.');
    } finally {
      setSaving(false);
    }
  };

  const downloadAttachment = async (file: LoanAttachment) => {
    try {
      downloadFile(file.name, (await filesApi.download(file.id)).data);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được tệp đính kèm.');
    }
  };

  const columns = [
    { title: 'Số khế ước', dataIndex: 'contractCode', key: 'contractCode', width: 160, render: (value: string) => <strong><FileProtectOutlined /> {value}</strong> },
    { title: routeDirection === 'lend' ? 'Đối tượng vay' : 'Đối tượng cho vay', key: 'counterparty', render: (_: unknown, loan: EnterpriseLoanItem) => loanCounterparty(loan) },
    { title: 'Hợp đồng tín dụng', dataIndex: 'creditContract', key: 'creditContract' },
    { title: 'Giá trị khoản vay', dataIndex: 'principalAmount', key: 'principalAmount', width: 170, render: (value: number, loan: EnterpriseLoanItem) => <span>{money(value)} {loan.currency && loan.currency !== 'VND' ? `(${loan.currency})` : ''}</span> },
    { title: 'Dư nợ gốc đã ghi nhận', key: 'outstanding', width: 190, render: (_: unknown, loan: EnterpriseLoanItem) => {
      const events = loanEvents.filter(event => event.loanKey === loan.key);
      if (!events.length) return 'Chưa đối chiếu';
      const balance = loanBalance(loan.key);
      return money(balance.principalDrawn - balance.principalRepaid);
    } },
    { title: 'Lãi suất', key: 'interest', width: 130, render: (_: unknown, loan: EnterpriseLoanItem) => { const rate = loan.rates?.find(row => row.rate != null)?.rate ?? loan.interestRate; return rate == null ? '—' : `${rate}%`; } },
    { title: 'Ngày giải ngân', dataIndex: 'disbursedDate', key: 'disbursedDate', width: 130 },
    { title: 'Ngày đáo hạn', dataIndex: 'dueDate', key: 'dueDate', width: 130 },
    { title: 'Thao tác', key: 'actions', width: 150, render: (_: unknown, loan: EnterpriseLoanItem) => <div style={{ display: 'flex', gap: 4 }}><Button aria-label="Xem khế ước" icon={<EyeOutlined />} onClick={() => { setSelectedLoan(loan); setDrawerOpen(true); }} /><Button aria-label="Sửa khế ước" icon={<EditOutlined />} onClick={() => openEdit(loan)} /></div> },
  ];

  const directionLabel = routeDirection === 'lend' ? 'cho vay' : 'đi vay';
  const formDirection = draftDirection;
  const isLend = formDirection === 'lend';
  const hasPostedLoanEvents = Boolean(editingLoan && loanEvents.some(event => event.loanKey === editingLoan.key));

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: '#0F172A' }}>{routeDirection === 'all' ? 'Khoản vay' : `Khế ước ${directionLabel}`}</h1>
          <div style={{ color: '#64748B', fontSize: 13, marginTop: 4 }}>Quản lý thông tin khế ước, giải ngân, lãi suất và lịch trả/thu nợ.</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Input prefix={<SearchOutlined />} placeholder="Tìm số khế ước, đối tượng..." value={searchText} onChange={event => setSearchText(event.target.value)} allowClear style={{ width: 280 }} />
          <Button icon={<DownloadOutlined />} disabled={!visibleData.length} onClick={() => downloadFile(`khue_uoc_${routeDirection}.xlsx`, generateValidXlsxBlob([
            ['Số khế ước', 'Loại khế ước', 'Đối tượng', 'Hợp đồng tín dụng', 'Mục đích vay', 'Giá trị khoản vay', 'Loại tiền', 'Tài khoản nợ gốc', 'Tài khoản lãi vay', 'Ngày giải ngân', 'Ngày đáo hạn'],
            ...visibleData.map(loan => [loan.contractCode, loanDirectionOf(loan) === 'borrow' ? 'Đi vay' : 'Cho vay', loanCounterparty(loan), loan.creditContract || '', loan.purpose || '', loan.principalAmount, loan.currency || 'VND', loan.principalAccount || '', loan.interestAccount || '', loan.disbursedDate, loan.dueDate]),
          ]))}>Xuất Excel</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>Thêm khế ước</Button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 12, color: '#475569', fontSize: 13 }}>
        <span>Số khế ước: <strong>{visibleData.length}</strong></span>
        <span>Tổng giá trị: <strong>{money(totalPrincipal)}</strong></span>
      </div>
      <div className="transparent-table-card">
        <KTable dataSource={visibleData} columns={columns} rowKey="key" pagination={{ pageSize: 10 }} locale={{ emptyText: 'Chưa có khế ước.' }} />
      </div>

      <Modal
        title={`${editingLoan ? 'Sửa' : 'Thêm'} khế ước ${isLend ? 'cho vay' : 'đi vay'}`}
        open={modalOpen}
        onCancel={closeForm}
        footer={[
          <Button key="cancel" onClick={closeForm}>Hủy</Button>,
          <Button key="save" type="primary" loading={saving} onClick={() => form.submit()}>Lưu</Button>,
        ]}
        width="min(1120px, calc(100vw - 32px))"
      >
        <Form form={form} layout="vertical" onFinish={handleSave} style={{ marginTop: 14 }}>
          {hasPostedLoanEvents && <Alert type="info" showIcon message="Khế ước đã có giao dịch ghi sổ. Loại vay, giá trị gốc, tài khoản hạch toán và ngày bắt đầu được khóa để bảo toàn liên kết." style={{ marginBottom: 14 }} />}
          {routeDirection === 'all' && <Form.Item name="direction" label="Loại khế ước" rules={[{ required: true }]}><Select disabled={hasPostedLoanEvents} options={[{ label: 'Khế ước đi vay', value: 'borrow' }, { label: 'Khế ước cho vay', value: 'lend' }]} onChange={(value: LoanDirection) => { setDraftDirection(value); form.setFieldsValue({ principalAccount: '', interestAccount: '', disbursementMethod: value === 'borrow' ? 'Chuyển khoản vào tài khoản DN' : 'Chuyển khoản' }); }} /></Form.Item>}
          <strong>Thông tin giải ngân</strong>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '3px 4px' }}>
            <Form.Item name="contractCode" label="Số khế ước" rules={[{ required: true, whitespace: true }]}><Input disabled={hasPostedLoanEvents} maxLength={80} /></Form.Item>
            <Form.Item name="counterpartyName" label={isLend ? 'Đối tượng vay' : 'Đối tượng cho vay'} rules={[{ required: true, whitespace: true }]}><Input disabled={hasPostedLoanEvents} /></Form.Item>
            <Form.Item name="creditContract" label="Hợp đồng tín dụng"><Input /></Form.Item>
            <Form.Item name="purpose" label="Mục đích vay"><Input /></Form.Item>
            <Form.Item name="principalAccount" label="Tài khoản hạch toán nợ gốc" rules={[{ required: true, whitespace: true }]}><Select disabled={hasPostedLoanEvents} showSearch options={loanAccountsFor(chartAccounts, accountingRegime, isLend ? 'Tài sản' : 'Nợ phải trả').map(account => ({ value: account.code, label: `${account.code} · ${account.name}` }))} placeholder="Chọn tài khoản chi tiết" /></Form.Item>
            <Form.Item name="interestAccount" label="Tài khoản hạch toán lãi" rules={[{ required: true, whitespace: true }]}><Select disabled={hasPostedLoanEvents} showSearch options={loanAccountsFor(chartAccounts, accountingRegime, isLend ? 'Doanh thu' : 'Chi phí').map(account => ({ value: account.code, label: `${account.code} · ${account.name}` }))} placeholder="Chọn tài khoản chi tiết" /></Form.Item>
            <Form.Item name="currency" label="Loại tiền" rules={[{ required: true }]}><Select disabled={hasPostedLoanEvents} options={[{ label: 'VND', value: 'VND' }]} /></Form.Item>
            <Form.Item name="principalAmount" label="Giá trị khoản vay" rules={[{ required: true }]}><Input disabled={hasPostedLoanEvents} type="number" min={1} step={1} /></Form.Item>
            <Form.Item name="termMonths" label="Thời hạn vay (tháng)" rules={[{ required: true }]}><Input disabled={hasPostedLoanEvents} type="number" min={1} step={1} /></Form.Item>
            <Form.Item name="disbursedDate" label="Ngày giải ngân" rules={[{ required: true }]}><Input disabled={hasPostedLoanEvents} type="date" /></Form.Item>
            <Form.Item name="dueDate" label="Ngày đáo hạn" rules={[{ required: true }]}><Input disabled={hasPostedLoanEvents} type="date" /></Form.Item>
            <Form.Item name="disbursementMethod" label="Phương thức giải ngân" rules={[{ required: true, whitespace: true }]}><Input disabled={hasPostedLoanEvents} /></Form.Item>
            <Form.Item name="beneficiaryAccount" label="TK thụ hưởng"><Input disabled={hasPostedLoanEvents} /></Form.Item>
            <Form.Item name="bankName" label="Tên ngân hàng"><Input disabled={hasPostedLoanEvents} /></Form.Item>
          </div>

          <Tabs items={[
            { key: 'interest', label: 'Lãi suất', children: <div style={{ display: 'grid', gap: 14 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '3px 4px' }}>
                <Form.Item name="rateType" label="Loại lãi suất" rules={[{ required: true }]}><Select disabled={hasPostedLoanEvents} options={['Lãi suất trên dư nợ giảm dần', 'Lãi suất trên dư nợ gốc'].map(value => ({ label: value, value }))} /></Form.Item>
                <Form.Item name="interestDayBase" label="Cơ sở tính lãi ngày" rules={[{ required: true }]}><Select disabled={hasPostedLoanEvents} options={['Lãi năm/365', 'Lãi năm/360'].map(value => ({ label: value, value }))} /></Form.Item>
                <Form.Item name="adjustmentMethod" label="Phương thức điều chỉnh" rules={[{ required: true }]}><Select disabled={hasPostedLoanEvents} options={['Có điều chỉnh', 'Cố định'].map(value => ({ label: value, value }))} /></Form.Item>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 900, tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                  <colgroup><col style={{ width: 34 }} /><col style={{ width: '25%' }} /><col style={{ width: '25%' }} /><col style={{ width: 150 }} /><col style={{ width: '25%' }} /><col style={{ width: 72 }} /></colgroup>
                  <thead><tr style={{ background: '#C5D9C2', textAlign: 'left' }}>{['#', 'Lãi suất (%)', 'Lãi suất quá hạn (%)', 'Hiệu lực từ', 'Ghi chú', ''].map((label, index) => <th key={index} scope="col" style={{ padding: '9px 8px', borderBottom: '1px solid #AFC9AC', fontWeight: 700 }}>{label}</th>)}</tr></thead>
                  <tbody>{rateRows.map((row, index) => <tr key={index} style={{ background: '#FBF7E8', borderBottom: '1px solid #E7DFC7' }}>
                    <td style={{ padding: 4, textAlign: 'center', borderRight: '1px dotted #D8CFB6' }}>{index + 1}</td>
                    <td style={{ padding: 4, borderRight: '1px dotted #D8CFB6' }}><Input disabled={hasPostedLoanEvents} aria-label={`Lãi suất dòng ${index + 1}`} type="number" min={0} max={100} step="any" value={row.rate} onChange={event => setRateRows(current => current.map((item, rowIndex) => rowIndex === index ? { ...item, rate: event.target.value } : item))} style={{ width: '100%', boxSizing: 'border-box' }} /></td>
                    <td style={{ padding: 4, borderRight: '1px dotted #D8CFB6' }}><Input disabled={hasPostedLoanEvents} aria-label={`Lãi suất quá hạn dòng ${index + 1}`} type="number" min={0} max={100} step="any" value={row.overdueRate} onChange={event => setRateRows(current => current.map((item, rowIndex) => rowIndex === index ? { ...item, overdueRate: event.target.value } : item))} style={{ width: '100%', boxSizing: 'border-box' }} /></td>
                    <td style={{ padding: 4, borderRight: '1px dotted #D8CFB6' }}><Input disabled={hasPostedLoanEvents} aria-label={`Ngày hiệu lực dòng ${index + 1}`} type="date" value={row.effectiveFrom} onChange={event => setRateRows(current => current.map((item, rowIndex) => rowIndex === index ? { ...item, effectiveFrom: event.target.value } : item))} style={{ width: '100%', boxSizing: 'border-box' }} /></td>
                    <td style={{ padding: 4, borderRight: '1px dotted #D8CFB6' }}><Input disabled={hasPostedLoanEvents} aria-label={`Ghi chú dòng ${index + 1}`} value={row.note} onChange={event => setRateRows(current => current.map((item, rowIndex) => rowIndex === index ? { ...item, note: event.target.value } : item))} style={{ width: '100%', boxSizing: 'border-box' }} /></td>
                    <td style={{ padding: 4, textAlign: 'center' }}><Button disabled={hasPostedLoanEvents || rateRows.length === 1} aria-label={`Xóa lãi suất dòng ${index + 1}`} onClick={() => setRateRows(current => current.filter((_, rowIndex) => rowIndex !== index))}>Xóa</Button></td>
                  </tr>)}</tbody>
                </table>
              </div>
              <div style={{ display: 'flex', gap: 8 }}><Button disabled={hasPostedLoanEvents} icon={<PlusOutlined />} onClick={() => setRateRows(current => [...current, blankRate()])}>Thêm dòng</Button><Button disabled={hasPostedLoanEvents} onClick={() => setRateRows([blankRate()])}>Xóa hết dòng</Button></div>
            </div> },
            { key: 'repayment', label: isLend ? 'Hình thức thu nợ' : 'Hình thức trả nợ', children: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '3px 4px', alignContent: 'start' }}>
              <Form.Item name="principalRepayment" label={isLend ? 'Thu gốc' : 'Trả gốc'} rules={[{ required: true, whitespace: true }]}><Input disabled={hasPostedLoanEvents} /></Form.Item>
              <Form.Item name="firstPrincipalDate" label={isLend ? 'Ngày thu gốc đầu tiên' : 'Ngày trả gốc đầu tiên'} rules={[{ required: true }]}><Input disabled={hasPostedLoanEvents} type="date" /></Form.Item>
              <Form.Item name="interestRepayment" label={isLend ? 'Thu lãi' : 'Trả lãi'} rules={[{ required: true, whitespace: true }]}><Input disabled={hasPostedLoanEvents} /></Form.Item>
              <Form.Item name="firstInterestDate" label={isLend ? 'Ngày thu lãi đầu tiên' : 'Ngày trả lãi đầu tiên'} rules={[{ required: true }]}><Input disabled={hasPostedLoanEvents} type="date" /></Form.Item>
              <Form.Item name="repaymentMethod" label={isLend ? 'Phương thức thu nợ' : 'Phương thức trả nợ'} rules={[{ required: true, whitespace: true }]}><Input disabled={hasPostedLoanEvents} /></Form.Item>
              <Form.Item name="repaymentAccount" label="Chuyển vào tài khoản"><Input disabled={hasPostedLoanEvents} /></Form.Item>
              <Form.Item name="repaymentBankName" label="Tên ngân hàng"><Input disabled={hasPostedLoanEvents} /></Form.Item>
              <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 8 }}>
                <div>Lịch gốc và lãi theo hợp đồng</div>
                <div style={{ color: '#64748B', fontSize: 13 }}>Nhập ngày đến hạn và số tiền theo lịch đã thỏa thuận. Phần mềm không tự suy diễn hoặc tính lãi.</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', minWidth: 720, tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                    <colgroup><col style={{ width: 42 }} /><col style={{ width: 170 }} /><col style={{ width: 170 }} /><col style={{ width: 170 }} /><col /><col style={{ width: 72 }} /></colgroup>
                    <thead><tr style={{ background: '#C5D9C2', textAlign: 'left' }}>{['#', 'Ngày đến hạn', 'Tiền gốc', 'Tiền lãi', 'Ghi chú theo hợp đồng', ''].map((label, index) => <th key={index} scope="col" style={{ padding: '9px 8px', borderBottom: '1px solid #AFC9AC', fontWeight: 700 }}>{label}</th>)}</tr></thead>
                    <tbody>{scheduleRows.map((row, index) => <tr key={row.key} style={{ background: '#FBF7E8', borderBottom: '1px solid #E7DFC7' }}>
                      <td style={{ padding: 4, textAlign: 'center' }}>{index + 1}</td>
                      <td style={{ padding: 4 }}><Input disabled={hasPostedLoanEvents} aria-label={`Ngày đến hạn kỳ ${index + 1}`} type="date" value={row.dueDate} onChange={event => setScheduleRows(current => current.map(item => item.key === row.key ? { ...item, dueDate: event.target.value } : item))} style={{ width: '100%' }} /></td>
                      <td style={{ padding: 4 }}><Input disabled={hasPostedLoanEvents} aria-label={`Tiền gốc kỳ ${index + 1}`} type="number" min={0} step={1} value={row.principalAmount} onChange={event => setScheduleRows(current => current.map(item => item.key === row.key ? { ...item, principalAmount: event.target.value } : item))} style={{ width: '100%' }} /></td>
                      <td style={{ padding: 4 }}><Input disabled={hasPostedLoanEvents} aria-label={`Tiền lãi kỳ ${index + 1}`} type="number" min={0} step={1} value={row.interestAmount} onChange={event => setScheduleRows(current => current.map(item => item.key === row.key ? { ...item, interestAmount: event.target.value } : item))} style={{ width: '100%' }} /></td>
                      <td style={{ padding: 4 }}><Input disabled={hasPostedLoanEvents} aria-label={`Ghi chú kỳ ${index + 1}`} value={row.note} onChange={event => setScheduleRows(current => current.map(item => item.key === row.key ? { ...item, note: event.target.value } : item))} style={{ width: '100%' }} /></td>
                      <td style={{ padding: 4, textAlign: 'center' }}><Button disabled={hasPostedLoanEvents} aria-label={`Xóa kỳ trả nợ ${index + 1}`} onClick={() => setScheduleRows(current => current.filter(item => item.key !== row.key))}>Xóa</Button></td>
                    </tr>)}</tbody>
                  </table>
                </div>
                <Button disabled={hasPostedLoanEvents || scheduleRows.length >= 100} icon={<PlusOutlined />} onClick={() => setScheduleRows(current => [...current, blankLoanSchedule(form.getFieldValue('firstPrincipalDate') || todayIso())])}>Thêm kỳ</Button>
              </div>
            </div> },
            { key: 'statistics', label: 'Thống kê khác', children: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '3px 4px', alignContent: 'start' }}>
              <Form.Item name="project" label="Công trình"><Input /></Form.Item>
              <Form.Item name={isLend ? 'salesOrder' : 'purchaseOrder'} label={isLend ? 'Đơn đặt hàng' : 'Đơn mua hàng'}><Input /></Form.Item>
              <Form.Item name={isLend ? 'salesContract' : 'purchaseContract'} label={isLend ? 'Hợp đồng bán' : 'Hợp đồng mua'}><Input /></Form.Item>
              <Form.Item name="expenseItem" label="Khoản mục chi phí"><Input /></Form.Item>
              <Form.Item name="cashflowItem" label="Mục thu/chi"><Input /></Form.Item>
            </div> },
            { key: 'attachments', label: 'Đính kèm', children: <div style={{ display: 'grid', gap: 10 }}>
              <div style={{ color: '#64748B', fontSize: 13 }}>Dung lượng tối đa 5 MB</div>
              <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={event => { processFiles(Array.from(event.target.files || [])); event.target.value = ''; }} />
              <div role="button" tabIndex={0} onClick={() => fileInputRef.current?.click()} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') fileInputRef.current?.click(); }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); processFiles(Array.from(event.dataTransfer.files)); }} style={{ minHeight: 56, display: 'grid', placeItems: 'center', border: '1px dashed #94A3B8', borderRadius: 6, color: '#64748B', cursor: 'pointer' }}><span><UploadOutlined /> Kéo/thả tệp vào đây hoặc bấm vào đây</span></div>
              {[...savedAttachments.map(file => ({ ...file, saved: true })), ...pendingFiles.map((file, index) => ({ id: `pending-${index}`, name: file.name, size: file.size, saved: false }))].map(file => <div key={file.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><span>{file.name} · {(file.size / 1024).toFixed(0)} KB</span><div style={{ display: 'flex', gap: 6 }}>{file.saved && <Button size="small" onClick={() => void downloadAttachment(file)}>Tải xuống</Button>}<Button size="small" onClick={() => { if (file.saved) { setSavedAttachments(current => current.filter(item => item.id !== file.id)); setRemovedAttachments(current => [...current, file]); } else setPendingFiles(current => current.filter((_, index) => `pending-${index}` !== file.id)); }}>Xóa</Button></div></div>)}
              <div style={{ color: '#64748B', fontSize: 12 }}>{[...savedAttachments, ...pendingFiles].length} tệp · {([...savedAttachments, ...pendingFiles].reduce((sum, file) => sum + file.size, 0) / 1024 / 1024).toFixed(2)} MB / 5 MB</div>
            </div> },
          ]} />

        </Form>
      </Modal>

      <Modal
        title={`${eventType === 'disbursement' ? 'Ghi nhận giải ngân' : 'Ghi nhận trả hoặc thu nợ'}${eventLoan ? ` · ${eventLoan.contractCode}` : ''}`}
        open={eventModalOpen}
        onCancel={closeLoanEvent}
        footer={[
          <Button key="cancel" onClick={closeLoanEvent}>Hủy</Button>,
          <Button key="save" type="primary" loading={eventSaving} onClick={() => eventForm.submit()}>Ghi nhận</Button>,
        ]}
        width="min(620px, calc(100vw - 32px))"
      >
        {eventLoan && <Form form={eventForm} layout="vertical" onFinish={handleLoanEvent} style={{ marginTop: 14 }}>
          <Alert type="warning" showIcon message="Chỉ dùng khi giao dịch chưa có phiếu tiền hoặc bút toán tương ứng. Thao tác này tạo chứng từ tiền mới và ghi Sổ Cái; không dùng để đối chiếu lại giao dịch đã ghi nhận." />
          <div style={{ marginTop: 14, color: '#475569' }}>
            {eventType === 'disbursement'
              ? `Gốc còn có thể giải ngân: ${money(Math.max(0, Number(eventLoan.principalAmount) - loanBalance(eventLoan.key).principalDrawn))}`
              : `Gốc đã giải ngân còn lại: ${money(Math.max(0, loanBalance(eventLoan.key).principalDrawn - loanBalance(eventLoan.key).principalRepaid))}`}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '3px 4px', marginTop: 14 }}>
            <Form.Item name="eventDate" label="Ngày giao dịch" rules={[{ required: true }]}><Input type="date" /></Form.Item>
            <Form.Item name="reference" label="Số chứng từ" rules={[{ required: true, whitespace: true }]}><Input maxLength={120} /></Form.Item>
            {eventType === 'repayment' && Boolean(eventLoan.loanSchedules?.length) && <Form.Item name="scheduleKey" label="Kỳ theo hợp đồng" rules={[{ required: true }]}>
              <Select options={(eventLoan.loanSchedules || []).filter(schedule => {
                const remaining = loanScheduleRemaining(eventLoan.key, schedule);
                return remaining.principalAmount > 0 || remaining.interestAmount > 0;
              }).map(schedule => {
                const remaining = loanScheduleRemaining(eventLoan.key, schedule);
                return { value: schedule.key, label: `${schedule.dueDate} · Gốc ${money(remaining.principalAmount)} · Lãi ${money(remaining.interestAmount)}` };
              })} placeholder="Chọn kỳ trả nợ" onChange={(key: string) => {
                const schedule = eventLoan.loanSchedules?.find(item => item.key === key);
                if (schedule) eventForm.setFieldsValue({ ...loanScheduleRemaining(eventLoan.key, schedule) });
              }} />
            </Form.Item>}
            <Form.Item name="sourceAccountId" label={eventType === 'disbursement' ? 'Tài khoản nhận tiền' : 'Tài khoản chi hoặc nhận tiền'} rules={[{ required: true }]}>
              <Select options={cashAccounts.map(account => ({ value: account.key, label: `${account.name} · ${account.source === 'bank' ? 'Ngân hàng' : 'Tiền mặt'} · ${money(account.balance)}` }))} placeholder="Chọn tài khoản tiền" />
            </Form.Item>
            <Form.Item name="principalAmount" label={eventType === 'disbursement' ? 'Tiền gốc giải ngân' : 'Tiền gốc trả hoặc thu'} rules={[{ required: true }]}><Input type="number" min={0} step={1} /></Form.Item>
            {eventType === 'repayment' && <Form.Item name="interestAmount" label={loanDirectionOf(eventLoan) === 'borrow' ? 'Tiền lãi đã trả' : 'Tiền lãi đã thu'} rules={[{ required: true }]}><Input type="number" min={0} step={1} /></Form.Item>}
            <Form.Item name="note" label="Ghi chú"><Input maxLength={2000} /></Form.Item>
          </div>
        </Form>}
      </Modal>

      <Drawer title="Chi tiết khế ước" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={560}>
        {selectedLoan && <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div><strong>{selectedLoan.contractCode}</strong> · {loanDirectionOf(selectedLoan) === 'borrow' ? 'Khế ước đi vay' : 'Khế ước cho vay'}</div>
          <div>{loanDirectionOf(selectedLoan) === 'lend' ? 'Đối tượng vay' : 'Đối tượng cho vay'}: {loanCounterparty(selectedLoan)}</div>
          <div>Hợp đồng tín dụng: {selectedLoan.creditContract || '—'}</div>
          <div>Mục đích vay: {selectedLoan.purpose || '—'}</div>
          <div>Giá trị khoản vay: {money(selectedLoan.principalAmount)} · {selectedLoan.currency || 'VND'}</div>
          <div>Thời hạn: {Number(selectedLoan.termMonths) || 0} tháng</div>
          <div>Ngày giải ngân: {selectedLoan.disbursedDate} · Đáo hạn: {selectedLoan.dueDate}</div>
          <div>Phương thức giải ngân: {selectedLoan.disbursementMethod || '—'}</div>
          <div>TK nợ gốc: {selectedLoan.principalAccount || '—'} · TK lãi: {selectedLoan.interestAccount || '—'}</div>
          {selectedLoan.loanSchedules?.length ? <div style={{ display: 'grid', gap: 6 }}>
            <div>Lịch gốc và lãi theo hợp đồng</div>
            {selectedLoan.loanSchedules.map(schedule => {
              const remaining = loanScheduleRemaining(selectedLoan.key, schedule);
              return <div key={schedule.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{schedule.dueDate} · {schedule.note || 'Theo lịch hợp đồng'}</span>
                <span>Còn gốc {money(remaining.principalAmount)} · lãi {money(remaining.interestAmount)}</span>
              </div>;
            })}
          </div> : <div>Lịch trả nợ: Chưa lập</div>}
          {selectedLoan.loanScheduleAdjustments?.length ? <div style={{ display: 'grid', gap: 6 }}>
            <div>Lịch sử điều chỉnh lịch trả nợ</div>
            {selectedLoan.loanScheduleAdjustments.map(adjustment => <div key={adjustment.key}>
              {adjustment.effectiveDate} · {adjustment.reason} · {adjustment.createdBy} · {adjustment.createdAt}
              <div>Thay đổi {adjustment.previousSchedules.length} kỳ thành {adjustment.newSchedules.length} kỳ</div>
            </div>)}
          </div> : null}
          <div>Đã giải ngân theo sổ: {loanEvents.some(event => event.loanKey === selectedLoan.key) ? money(loanBalance(selectedLoan.key).principalDrawn) : 'Chưa đối chiếu'}</div>
          <div>Dư nợ gốc đã ghi nhận: {loanEvents.some(event => event.loanKey === selectedLoan.key) ? money(loanBalance(selectedLoan.key).principalDrawn - loanBalance(selectedLoan.key).principalRepaid) : 'Chưa đối chiếu'}</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button disabled={Number(selectedLoan.principalAmount) <= loanBalance(selectedLoan.key).principalDrawn || !cashAccounts.length} onClick={() => openLoanEvent(selectedLoan, 'disbursement')}>Ghi nhận giải ngân</Button>
            <Button disabled={loanBalance(selectedLoan.key).principalDrawn <= 0 || !cashAccounts.length || Boolean(selectedLoan.loanSchedules?.length && selectedLoan.loanSchedules.every(schedule => {
              const remaining = loanScheduleRemaining(selectedLoan.key, schedule);
              return remaining.principalAmount <= 0 && remaining.interestAmount <= 0;
            }))} onClick={() => openLoanEvent(selectedLoan, 'repayment')}>{loanDirectionOf(selectedLoan) === 'borrow' ? 'Ghi nhận trả nợ' : 'Ghi nhận thu nợ'}</Button>
            <Button onClick={() => openScheduleAdjustment(selectedLoan)}>{selectedLoan.loanSchedules?.length ? 'Điều chỉnh lịch trả nợ' : 'Lập lịch trả nợ'}</Button>
          </div>
          <div style={{ color: '#475569' }}>Giao dịch khoản vay: {loanEvents.filter(event => event.loanKey === selectedLoan.key).length}</div>
          {loanEvents.filter(event => event.loanKey === selectedLoan.key).sort((left, right) => right.eventDate.localeCompare(left.eventDate)).map(event => <div key={event.key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span>{event.eventDate} · {event.eventType === 'disbursement' ? 'Giải ngân' : 'Trả hoặc thu nợ'} · {event.reference} · {event.cashVoucherCode}</span>
            <span>{money(Number(event.principalAmount) + Number(event.interestAmount))}</span>
          </div>)}
          <Button icon={<EditOutlined />} onClick={() => { setDrawerOpen(false); openEdit(selectedLoan); }}>Sửa khế ước</Button>
        </div>}
      </Drawer>

      <Modal
        title="Điều chỉnh lịch trả nợ"
        open={scheduleAdjustmentOpen}
        onCancel={closeScheduleAdjustment}
        onOk={() => scheduleAdjustmentForm.submit()}
        confirmLoading={scheduleAdjustmentSaving}
        width="min(980px, calc(100vw - 32px))"
      >
        {selectedLoan && <Form form={scheduleAdjustmentForm} layout="vertical" onFinish={handleScheduleAdjustment} style={{ marginTop: 14 }}>
          <Alert type="warning" showIcon message="Điều chỉnh chỉ thay đổi lịch đã nhập theo phụ lục hợp đồng. Hệ thống lưu lịch trước, lịch mới, ngày hiệu lực và lý do; không tự tính lại tiền lãi." />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: '3px 4px', marginTop: 14 }}>
            <Form.Item name="effectiveDate" label="Ngày hiệu lực" rules={[{ required: true }]}><Input type="date" /></Form.Item>
            <Form.Item name="reason" label="Lý do điều chỉnh" rules={[{ required: true, whitespace: true }]}><Input maxLength={1000} /></Form.Item>
          </div>
          <div style={{ overflowX: 'auto', marginTop: 14 }}>
            <table style={{ width: '100%', minWidth: 720, tableLayout: 'fixed', borderCollapse: 'collapse' }}>
              <colgroup><col style={{ width: 42 }} /><col style={{ width: 170 }} /><col style={{ width: 150 }} /><col style={{ width: 150 }} /><col /><col style={{ width: 72 }} /></colgroup>
              <thead><tr style={{ background: '#C5D9C2', textAlign: 'left' }}>{['#', 'Ngày đến hạn', 'Tiền gốc', 'Tiền lãi', 'Ghi chú theo hợp đồng', ''].map((label, index) => <th key={index} scope="col" style={{ padding: '9px 8px', borderBottom: '1px solid #AFC9AC', fontWeight: 700 }}>{label}</th>)}</tr></thead>
              <tbody>{scheduleAdjustmentRows.map((row, index) => <tr key={row.key} style={{ background: '#FBF7E8', borderBottom: '1px solid #E7DFC7' }}>
                <td style={{ padding: 4, textAlign: 'center' }}>{index + 1}</td>
                <td style={{ padding: 4 }}><Input aria-label={`Ngày đến hạn điều chỉnh kỳ ${index + 1}`} type="date" value={row.dueDate} onChange={event => setScheduleAdjustmentRows(current => current.map(item => item.key === row.key ? { ...item, dueDate: event.target.value } : item))} style={{ width: '100%' }} /></td>
                <td style={{ padding: 4 }}><Input aria-label={`Tiền gốc điều chỉnh kỳ ${index + 1}`} type="number" min={0} step={1} value={row.principalAmount} onChange={event => setScheduleAdjustmentRows(current => current.map(item => item.key === row.key ? { ...item, principalAmount: event.target.value } : item))} style={{ width: '100%' }} /></td>
                <td style={{ padding: 4 }}><Input aria-label={`Tiền lãi điều chỉnh kỳ ${index + 1}`} type="number" min={0} step={1} value={row.interestAmount} onChange={event => setScheduleAdjustmentRows(current => current.map(item => item.key === row.key ? { ...item, interestAmount: event.target.value } : item))} style={{ width: '100%' }} /></td>
                <td style={{ padding: 4 }}><Input aria-label={`Ghi chú điều chỉnh kỳ ${index + 1}`} value={row.note} onChange={event => setScheduleAdjustmentRows(current => current.map(item => item.key === row.key ? { ...item, note: event.target.value } : item))} style={{ width: '100%' }} /></td>
                <td style={{ padding: 4, textAlign: 'center' }}><Button aria-label={`Xóa kỳ điều chỉnh ${index + 1}`} onClick={() => setScheduleAdjustmentRows(current => current.filter(item => item.key !== row.key))}>Xóa</Button></td>
              </tr>)}</tbody>
            </table>
          </div>
          <Button disabled={scheduleAdjustmentRows.length >= 100} icon={<PlusOutlined />} onClick={() => setScheduleAdjustmentRows(current => [...current, blankLoanSchedule(selectedLoan.disbursedDate || todayIso())])}>Thêm kỳ</Button>
        </Form>}
      </Modal>
    </div>
  );
};
