import { dataService } from '../../services/dataService';
import React, { useEffect, useRef, useState } from 'react';
import {
  useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  CalendarOutlined,
  WarningOutlined,
  SafetyCertificateOutlined,
  FilePdfOutlined,
  SendOutlined,
  CheckOutlined,
  EditOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Card, Tag, Alert, DatePicker, FileUploadDialog } from '../../custom-ui';
import { CrmContact, FinancePaymentAccount, FinancePaymentRequest, crmContactsApi, filesApi, financePaymentAccountsApi, financePaymentsApi } from '../../api/endpoints';
import { hasOpenTaxPayment, isValidTaxPaymentAmount, validateTaxFiling } from './taxWorkflowRules';
import { useAuth } from '../../context/AuthContext';
import { downloadFile } from '../../utils/fileExporter';

interface TaxFiling {
  key: string;
  code: string;
  taxType: string;
  period: string;
  taxAuthority: string;
  amountPayable: number;
  amountPaid: number;
  deadline: string;
  status: 'Đã nộp đủ' | 'Chờ nộp thuế' | 'Quá hạn nộp' | 'Đã ghi nhận đủ theo chứng từ nội bộ' | 'Đã ghi nhận một phần theo chứng từ nội bộ';
  externalStatus?: string;
}

interface TaxTypeProfile {
  key: string;
  taxCode: string;
  taxName: string;
  taxGroup: string;
  calculationMethod: string;
  taxpayerScope: string;
  taxRateReference?: string;
  effectiveFrom: string;
  effectiveTo?: string;
  legalBasis: string;
  conditions?: string;
  exceptions?: string;
  debitAccount?: string;
  creditAccount?: string;
  status: 'Đang theo dõi' | 'Tạm ngưng';
  verificationStatus: 'Chưa xác minh';
}

interface TaxSupplierReview {
  key: string;
  supplierKey: string;
  supplierName: string;
  taxCode: string;
  sourceCode: string;
  sourceName: string;
  sourceReference: string;
  verifiedAt: string;
  verificationStatus: 'Chưa rà soát' | 'Đã rà soát nguồn' | 'Nguồn không xác minh được';
  riskIndicators?: string;
  invoiceReference?: string;
  internalSeverity: 'Thông tin' | 'Thấp' | 'Trung bình' | 'Cao';
  assignee?: string;
  reviewOutcome?: string;
  notes?: string;
  evidenceFileId?: string;
  evidenceFileName?: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

const INITIAL_TAX_DATA: TaxFiling[] = [];

export const TaxModule: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isTypes = currentPath === '/finance/tax/types';
  const isPeriods = currentPath === '/finance/tax/periods';
  const isDeadlines = currentPath === '/finance/tax/deadlines';
  const isOrders = currentPath === '/finance/tax/orders';
  const isRisky = currentPath === '/finance/tax/risky';
  const isDeclaration = currentPath === '/finance/tax/declaration';

  const [data, setData] = useState<TaxFiling[]>(INITIAL_TAX_DATA);
  const [payments, setPayments] = useState<FinancePaymentRequest[]>([]);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [paymentAccounts, setPaymentAccounts] = useState<FinancePaymentAccount[]>([]);
  const [taxTypes, setTaxTypes] = useState<TaxTypeProfile[]>([]);
  const [taxSupplierReviews, setTaxSupplierReviews] = useState<TaxSupplierReview[]>([]);
  const [suppliers, setSuppliers] = useState<CrmContact[]>([]);

  useEffect(() => {
    const list = dataService.getGenericData('finance_tax');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_tax');
      setData(Array.isArray(updated) ? updated : []);
      const updatedTypes = dataService.getGenericData('finance_tax_types');
      setTaxTypes(Array.isArray(updatedTypes) ? updatedTypes as TaxTypeProfile[] : []);
      const updatedReviews = dataService.getGenericData('finance_tax_supplier_reviews');
      setTaxSupplierReviews(Array.isArray(updatedReviews) ? updatedReviews as TaxSupplierReview[] : []);
    });
    void dataService.refreshGenericData('finance_tax_types').then(rows => setTaxTypes(Array.isArray(rows) ? rows as TaxTypeProfile[] : []));
    void dataService.refreshGenericData('finance_tax_supplier_reviews').then(rows => setTaxSupplierReviews(Array.isArray(rows) ? rows as TaxSupplierReview[] : []));
    void crmContactsApi.getAll('supplier').then(response => setSuppliers(Array.isArray(response.data.data) ? response.data.data : [])).catch(() => setSuppliers([]));
    void loadPayments().catch(() => message.error('Không tải được đề nghị nộp thuế.'));
    void financePaymentAccountsApi.getAccounts().then(response => setPaymentAccounts(response.data.accounts)).catch(() => setPaymentAccounts([]));
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [taxTypeModalOpen, setTaxTypeModalOpen] = useState(false);
  const [editingTaxType, setEditingTaxType] = useState<TaxTypeProfile | null>(null);
  const [taxTypeSaving, setTaxTypeSaving] = useState(false);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [editingReview, setEditingReview] = useState<TaxSupplierReview | null>(null);
  const [reviewSaving, setReviewSaving] = useState(false);
  const [reviewEvidencePickerOpen, setReviewEvidencePickerOpen] = useState(false);
  const [selectedEvidenceFile, setSelectedEvidenceFile] = useState<File | null>(null);
  const [reviewSearch, setReviewSearch] = useState('');
  const [form] = Form.useForm();
  const [taxTypeForm] = Form.useForm();
  const [reviewForm] = Form.useForm();
  const [paymentForm] = Form.useForm();
  const [settlementForm] = Form.useForm();
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [selectedTax, setSelectedTax] = useState<TaxFiling | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<FinancePaymentRequest | null>(null);
  const [paymentSaving, setPaymentSaving] = useState(false);
  const paymentSubmitLock = useRef(false);

  const openTaxTypeForm = (profile?: TaxTypeProfile) => {
    setEditingTaxType(profile || null);
    taxTypeForm.resetFields();
    if (profile) taxTypeForm.setFieldsValue(profile);
    else taxTypeForm.setFieldsValue({ status: 'Đang theo dõi' });
    setTaxTypeModalOpen(true);
  };

  const saveTaxType = async (values: any) => {
    setTaxTypeSaving(true);
    try {
      const profile: TaxTypeProfile = {
        key: editingTaxType?.key || crypto.randomUUID(),
        taxCode: String(values.taxCode || '').trim(),
        taxName: String(values.taxName || '').trim(),
        taxGroup: String(values.taxGroup || ''),
        calculationMethod: String(values.calculationMethod || '').trim(),
        taxpayerScope: String(values.taxpayerScope || '').trim(),
        taxRateReference: String(values.taxRateReference || '').trim(),
        effectiveFrom: String(values.effectiveFrom || ''),
        effectiveTo: String(values.effectiveTo || ''),
        legalBasis: String(values.legalBasis || '').trim(),
        conditions: String(values.conditions || '').trim(),
        exceptions: String(values.exceptions || '').trim(),
        debitAccount: String(values.debitAccount || '').trim(),
        creditAccount: String(values.creditAccount || '').trim(),
        status: values.status || 'Đang theo dõi',
        verificationStatus: 'Chưa xác minh',
      };
      if (editingTaxType) await dataService.updateGenericRecord('finance_tax_types', {
        key: profile.key, taxCode: profile.taxCode, taxName: profile.taxName, taxGroup: profile.taxGroup,
        calculationMethod: profile.calculationMethod, taxpayerScope: profile.taxpayerScope, taxRateReference: profile.taxRateReference,
        effectiveFrom: profile.effectiveFrom, effectiveTo: profile.effectiveTo, legalBasis: profile.legalBasis,
        conditions: profile.conditions, exceptions: profile.exceptions, debitAccount: profile.debitAccount,
        creditAccount: profile.creditAccount, status: profile.status,
      });
      else await dataService.createGenericRecord('finance_tax_types', profile);
      setTaxTypes(dataService.getGenericData('finance_tax_types') as TaxTypeProfile[]);
      setTaxTypeModalOpen(false);
      setEditingTaxType(null);
      taxTypeForm.resetFields();
      message.success(editingTaxType ? 'Đã cập nhật hồ sơ sắc thuế nội bộ.' : 'Đã lưu hồ sơ sắc thuế nội bộ.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Không thể lưu hồ sơ sắc thuế.');
    } finally {
      setTaxTypeSaving(false);
    }
  };

  const openReviewForm = (review?: TaxSupplierReview) => {
    setEditingReview(review || null);
    setSelectedEvidenceFile(null);
    setReviewEvidencePickerOpen(false);
    reviewForm.resetFields();
    if (review) reviewForm.setFieldsValue(review);
    else reviewForm.setFieldsValue({
      verificationStatus: 'Chưa rà soát',
      internalSeverity: 'Thông tin',
      verifiedAt: new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10),
    });
    setReviewModalOpen(true);
  };

  const saveSupplierReview = async (values: any) => {
    const supplier = suppliers.find(item => item.key === String(values.supplierKey || editingReview?.supplierKey || ''));
    if (!supplier) {
      message.error('Chọn nhà cung cấp đang có trong danh bạ CRM.');
      return;
    }
    setReviewSaving(true);
    let uploadedFileId = '';
    try {
      let evidenceFileId = editingReview?.evidenceFileId || '';
      let evidenceFileName = editingReview?.evidenceFileName || '';
      if (selectedEvidenceFile) {
        const rootResponse = await filesApi.list(undefined, false, true);
        const rootId = rootResponse.data.context.parentId || undefined;
        const workspace = await filesApi.list(rootId);
        const directory = workspace.data.data.find(entry => entry.type === 'dir' && entry.name === 'Rà soát nhà cung cấp thuế');
        const folderId = directory?.id || directory?.key || (await filesApi.createFolder('Rà soát nhà cung cấp thuế', rootId, 'finance_tax')).data.file.id;
        const uploaded = (await filesApi.upload(selectedEvidenceFile, selectedEvidenceFile.name, folderId, 'finance_tax')).data.file;
        uploadedFileId = uploaded.id || uploaded.key;
        evidenceFileId = uploadedFileId;
        evidenceFileName = uploaded.name;
      }
      const record: TaxSupplierReview = {
        key: editingReview?.key || crypto.randomUUID(),
        supplierKey: supplier.key,
        supplierName: supplier.name,
        taxCode: supplier.taxCode || '',
        sourceCode: String(values.sourceCode || '').trim(),
        sourceName: String(values.sourceName || '').trim(),
        sourceReference: String(values.sourceReference || '').trim(),
        verifiedAt: String(values.verifiedAt || ''),
        verificationStatus: values.verificationStatus,
        riskIndicators: String(values.riskIndicators || '').trim(),
        invoiceReference: String(values.invoiceReference || '').trim(),
        internalSeverity: values.internalSeverity || 'Thông tin',
        assignee: String(values.assignee || '').trim(),
        reviewOutcome: String(values.reviewOutcome || '').trim(),
        notes: String(values.notes || '').trim(),
        evidenceFileId,
        evidenceFileName,
      };
      if (editingReview) await dataService.updateGenericRecord('finance_tax_supplier_reviews', {
        key: record.key, sourceCode: record.sourceCode, sourceName: record.sourceName, sourceReference: record.sourceReference,
        verifiedAt: record.verifiedAt, verificationStatus: record.verificationStatus, riskIndicators: record.riskIndicators,
        invoiceReference: record.invoiceReference, internalSeverity: record.internalSeverity, assignee: record.assignee,
        reviewOutcome: record.reviewOutcome, notes: record.notes, evidenceFileId: record.evidenceFileId, evidenceFileName: record.evidenceFileName,
      });
      else await dataService.createGenericRecord('finance_tax_supplier_reviews', record);
      setTaxSupplierReviews(dataService.getGenericData('finance_tax_supplier_reviews') as TaxSupplierReview[]);
      setReviewModalOpen(false);
      setEditingReview(null);
      setSelectedEvidenceFile(null);
      setReviewEvidencePickerOpen(false);
      reviewForm.resetFields();
      message.success(editingReview ? 'Đã cập nhật hồ sơ rà soát nội bộ.' : 'Đã lưu hồ sơ rà soát nội bộ.');
    } catch (error: any) {
      if (uploadedFileId) await filesApi.remove(uploadedFileId).catch(() => {});
      message.error(error?.response?.data?.message || error?.response?.data?.error || error?.message || 'Không thể lưu hồ sơ rà soát.');
    } finally {
      setReviewSaving(false);
    }
  };

  const downloadReviewEvidence = async (review: TaxSupplierReview) => {
    if (!review.evidenceFileId) return;
    try {
      const response = await filesApi.download(review.evidenceFileId);
      downloadFile(review.evidenceFileName || 'tai_lieu_ra_soat_thue', response.data);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được tài liệu chứng minh.');
    }
  };

  const loadPayments = async () => {
    setPaymentsLoaded(false);
    const response = await financePaymentsApi.getAll(1, 200);
    if (!Array.isArray(response.data?.data)) throw new Error('Dữ liệu đề nghị nộp thuế không hợp lệ.');
    const remainingPages = Array.from({ length: Math.max(0, response.data.pagination.totalPages - 1) }, (_, index) => index + 2);
    const otherPages = await Promise.all(remainingPages.map(page => financePaymentsApi.getAll(page, 200)));
    setPayments([...response.data.data, ...otherPages.flatMap(page => page.data.data)].filter(payment => payment.sourceModule === 'finance_tax'));
    setPaymentsLoaded(true);
  };

  const totalPayable = data.reduce((sum, item) => sum + item.amountPayable, 0);
  const totalPaid = data.reduce((sum, item) => sum + item.amountPaid, 0);
  const totalPending = Math.max(0, totalPayable - totalPaid);
  const declaredTaxTypes = Array.from(new Set(data.map(item => item.taxType).filter(Boolean)));
  const filingTaxTypeOptions = [
    { label: 'Thuế GTGT', value: 'Thuế GTGT' },
    { label: 'Thuế TNDN tạm tính', value: 'Thuế TNDN tạm tính' },
    { label: 'Thuế TNCN khấu trừ', value: 'Thuế TNCN khấu trừ' },
    { label: 'Lệ phí Môn bài', value: 'Lệ phí Môn bài' },
    ...taxTypes.filter(item => item.status === 'Đang theo dõi').map(item => ({ label: `${item.taxName} · ${item.taxCode}`, value: item.taxName })),
  ];
  const deadlineRows = data.filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.deadline || '')).sort((a, b) => a.deadline.localeCompare(b.deadline));

  const handleCreate = async (values: any) => {
    const payable = values.amountPayable === '' || values.amountPayable === null || values.amountPayable === undefined
      ? Number.NaN
      : Number(values.amountPayable);
    const validationError = validateTaxFiling({
      code: String(values.code || ''),
      taxType: String(values.taxType || ''),
      period: String(values.period || ''),
      deadline: String(values.deadline || ''),
      amountPayable: payable,
    }, data.map(item => item.code));
    if (validationError) {
      message.error(validationError);
      return;
    }
    const newTax: TaxFiling = {
      ...values,
      key: crypto.randomUUID(),
      amountPayable: payable,
      amountPaid: 0,
      status: 'Chờ nộp thuế',
    };
    try {
      await dataService.createGenericRecord('finance_tax', newTax);
      message.success(`Đã lưu hồ sơ thuế ${values.taxType} - ${values.period} ở trạng thái chờ nộp.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu hồ sơ thuế.');
    }
  };

  const openTaxPayment = (record: TaxFiling) => {
    if (!paymentsLoaded) {
      message.warning('Chưa tải được danh sách đề nghị nộp thuế. Hãy tải lại trước khi tạo đề nghị.');
      return;
    }
    if (hasOpenTaxPayment(payments, record.key)) {
      message.warning('Hồ sơ thuế này đã có đề nghị nộp đang xử lý.');
      return;
    }
    setSelectedTax(record);
    paymentForm.setFieldsValue({ amount: Math.max(0, record.amountPayable - record.amountPaid) });
    setPaymentModalOpen(true);
  };

  const submitTaxPayment = async (values: { amount: number; debitAccount: string }) => {
    if (!selectedTax || paymentSubmitLock.current) return;
    const outstanding = Math.max(0, selectedTax.amountPayable - selectedTax.amountPaid);
    const amount = Number(values.amount);
    if (!isValidTaxPaymentAmount(amount, outstanding)) {
      message.error('Số tiền đề nghị phải là số nguyên dương và không vượt quá số còn phải nộp.');
      return;
    }
    if (hasOpenTaxPayment(payments, selectedTax.key)) {
      message.error('Hồ sơ thuế đã có đề nghị nộp đang xử lý. Tải lại dữ liệu trước khi tạo đề nghị khác.');
      return;
    }
    paymentSubmitLock.current = true;
    setPaymentSaving(true);
    try {
      const response = await financePaymentsApi.create({
        beneficiary: selectedTax.taxAuthority || 'Ngân sách Nhà nước',
        bankAccountInfo: 'Nộp ngân sách Nhà nước theo hồ sơ thuế nội bộ',
        category: `Nộp ${selectedTax.taxType} kỳ ${selectedTax.period}`,
        amount,
        paymentMethod: 'Nộp ngân sách nhà nước',
        debitAccount: values.debitAccount,
        sourceModule: 'finance_tax',
        sourceReference: selectedTax.key,
      });
      setPaymentModalOpen(false);
      paymentForm.resetFields();
      setSelectedTax(null);
      await loadPayments();
      message.success(`Đã tạo đề nghị ${response.data.payment.code}; cần phê duyệt và ghi nhận giao dịch ngân hàng.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tạo đề nghị nộp thuế.');
    } finally {
      paymentSubmitLock.current = false;
      setPaymentSaving(false);
    }
  };

  const approveTaxPayment = async (payment: FinancePaymentRequest) => {
    try {
      await financePaymentsApi.approve(payment.key);
      await loadPayments();
      message.success(`Đã phê duyệt đề nghị ${payment.code}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể phê duyệt đề nghị nộp thuế.');
    }
  };

  const openTaxSettlement = (payment: FinancePaymentRequest) => {
    setSelectedPayment(payment);
    settlementForm.resetFields();
    setSettlementModalOpen(true);
  };

  const submitTaxSettlement = async (values: { sourceAccountId: string; settlementReference: string }) => {
    if (!selectedPayment) return;
    try {
      await financePaymentsApi.execute(selectedPayment.key, values);
      setSettlementModalOpen(false);
      settlementForm.resetFields();
      setSelectedPayment(null);
      const refreshedTaxes = await dataService.refreshGenericData('finance_tax');
      setData(Array.isArray(refreshedTaxes) ? refreshedTaxes as TaxFiling[] : []);
      await Promise.all([
        loadPayments(),
        financePaymentAccountsApi.getAccounts().then(response => setPaymentAccounts(response.data.accounts)),
      ]);
      message.success('Đã ghi nhận khoản thanh toán nội bộ và cập nhật Sổ Cái. Trạng thái với cơ quan thuế vẫn chưa được xác minh.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể ghi nhận giao dịch nộp thuế.');
    }
  };

  const filteredData = data.filter(
    (item) =>
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.taxType || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.period || '').toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nghĩa vụ theo hồ sơ đã lưu</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalPayable.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã ghi nhận trong dữ liệu nội bộ</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalPaid.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nghĩa vụ thuế chờ nộp sắp tới</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {totalPending.toLocaleString('vi-VN')} ₫
          </div>
        </div>
      </div>

      <Alert
        message="Hồ sơ trong web chưa được gửi cơ quan thuế"
        description="Các bản ghi ở đây chỉ là dữ liệu nội bộ. Web hiện chưa kết nối eTax hoặc dịch vụ xác nhận thanh toán, nên không thể đánh dấu một khoản thuế là đã nộp."
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {/* VIEW: TYPES (Danh mục các loại sắc thuế doanh nghiệp) */}
      {isTypes && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Danh mục sắc thuế</h3>
            {user?.role === 'ADMIN' && <Button type="primary" icon={<PlusOutlined />} onClick={() => openTaxTypeForm()} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Thêm hồ sơ sắc thuế nội bộ</Button>}
          </div>
          <Alert message="Thông tin nội bộ, chưa xác minh" description="Tham chiếu thuế suất và tài khoản chỉ để lưu hồ sơ, không được dùng để tự tính thuế hoặc hạch toán. Hãy đối chiếu văn bản đang có hiệu lực và hồ sơ doanh nghiệp trước khi áp dụng." type="warning" showIcon />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {declaredTaxTypes.map((taxType) => (
              <Card key={taxType} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: '#009688', fontSize: 14 }}>Theo kỳ khai nội bộ</span>
                  <Tag color="warning">Chưa xác minh</Tag>
                </div>
                <div style={{ fontSize: 14, color: '#0F172A', marginBottom: 4 }}>{taxType}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>Kỳ khai nội bộ; không phải xác nhận đăng ký hoặc nghĩa vụ chính thức.</div>
              </Card>
            ))}
            {!declaredTaxTypes.length && <div style={{ color: '#64748B', padding: 16 }}>Chưa có sắc thuế nào được khai báo trong hồ sơ nội bộ.</div>}
          </div>
          <div className="transparent-table-card">
            <KTable dataSource={taxTypes} columns={[
              { title: 'Mã sắc thuế', dataIndex: 'taxCode', key: 'taxCode' },
              { title: 'Tên sắc thuế', dataIndex: 'taxName', key: 'taxName' },
              { title: 'Nhóm', dataIndex: 'taxGroup', key: 'taxGroup' },
              { title: 'Phương pháp và tham chiếu thuế suất', key: 'method', render: (_: unknown, row: TaxTypeProfile) => <div>{row.calculationMethod}<div style={{ color: '#64748B', fontSize: 12 }}>{row.taxRateReference || 'Chưa ghi nội dung tham chiếu'}</div></div> },
              { title: 'Hiệu lực và căn cứ', key: 'basis', render: (_: unknown, row: TaxTypeProfile) => <div>{row.effectiveFrom}{row.effectiveTo ? ` – ${row.effectiveTo}` : ' – Chưa xác định ngày kết thúc'}<div style={{ color: '#64748B', fontSize: 12 }}>{row.legalBasis}</div></div> },
              { title: 'Theo dõi nội bộ', key: 'status', render: (_: unknown, row: TaxTypeProfile) => <div><Tag color={row.status === 'Đang theo dõi' ? 'processing' : 'default'}>{row.status}</Tag><Tag color="warning">Chưa xác minh</Tag></div> },
              { title: 'Thao tác', key: 'actions', render: (_: unknown, row: TaxTypeProfile) => user?.role === 'ADMIN' ? <Button icon={<EditOutlined />} onClick={() => openTaxTypeForm(row)}>Sửa</Button> : <span>Chỉ xem</span> },
            ]} pagination={{ pageSize: 10 }} />
          </div>
        </div>
      )}

      {/* VIEW: PERIODS (Kỳ kê khai thuế) */}
      {isPeriods && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Kỳ kê khai theo hồ sơ nội bộ</h3>
            <Button icon={<DownloadOutlined />} disabled title="Chưa có dữ liệu kỳ kê khai đã xác nhận">
              Xuất Danh Sách Kỳ Kê Khai
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={data.map(item => ({ ...item, type: item.taxType }))}
              columns={[
                { title: 'Kỳ kê khai', dataIndex: 'period', key: 'period', render: (p: string) => <strong>{p}</strong> },
                { title: 'Sắc thuế áp dụng', dataIndex: 'type', key: 'type' },
                { title: 'Thời gian kỳ', dataIndex: 'period', key: 'time' },
                { title: 'Hạn chót đã khai báo', dataIndex: 'deadline', key: 'deadline', render: (d: string) => <strong style={{ color: '#DC2626' }}>{d || 'Chưa khai báo'}</strong> },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s.includes('hoàn tất') ? 'success' : s.includes('Sắp') ? 'warning' : 'processing'}>{s}</Tag> },
                { title: 'Thao tác', key: 'act', render: () => <Button size="small" disabled>Chưa có tờ khai điện tử</Button> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DEADLINES (Lịch hạn chót nộp thuế) */}
      {isDeadlines && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Hạn chót đã khai báo</h3>
            <Button icon={<CalendarOutlined />} disabled title="Chưa tích hợp lịch ngoài">
              Đồng bộ Lịch
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {deadlineRows.map((item) => {
              const days = Math.ceil((Date.parse(`${item.deadline}T00:00:00`) - Date.now()) / 86_400_000);
              return <Card key={item.key} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ color: '#DC2626', fontSize: 14 }}>Hạn: {item.deadline}</strong>
                  <Tag color={days < 0 ? 'error' : days <= 7 ? 'warning' : 'processing'}>{days < 0 ? `Quá hạn ${Math.abs(days)} ngày` : days === 0 ? 'Đến hạn hôm nay' : `Còn ${days} ngày`}</Tag>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0F172A', marginBottom: 6 }}>{item.taxType} · {item.period}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>Hạn do người dùng khai báo; chưa đồng bộ với CQT.</div>
              </Card>;
            })}
            {!deadlineRows.length && <div style={{ color: '#64748B', padding: 16 }}>Chưa có hạn nộp được khai báo.</div>}
          </div>
        </div>
      )}

      {/* VIEW: ORDERS (Giấy nộp tiền NSNN Mẫu C1-02/NS) */}
      {isOrders && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Đề nghị nộp thuế qua quy trình thanh toán</h3>
          </div>
          <Alert message="Ghi nhận nội bộ, chưa xác nhận với cơ quan thuế" description="Đề nghị phải được phê duyệt và ghi nhận bằng mã giao dịch ngân hàng. Phần mềm cập nhật số đã thanh toán và Sổ Cái nội bộ; trạng thái nộp trên eTax hoặc Kho bạc vẫn cần xác minh bên ngoài." type="warning" showIcon />
          <div className="transparent-table-card">
            <KTable
              dataSource={payments}
              columns={[
                { title: 'Mã đề nghị', dataIndex: 'code', key: 'code', render: (code: string) => <span>{code}</span> },
                { title: 'Loại thuế và kỳ', key: 'tax', render: (_: unknown, payment: FinancePaymentRequest) => <span>{payment.taxType} · {payment.taxPeriod}</span> },
                { title: 'Cơ quan thuế', dataIndex: 'taxAuthority', key: 'authority', render: (value: string) => value || 'Chưa khai báo' },
                { title: 'Số tiền', dataIndex: 'amount', key: 'amount', render: (value: number) => `${Number(value).toLocaleString('vi-VN')} ₫` },
                { title: 'Mã giao dịch', dataIndex: 'settlementReference', key: 'reference', render: (value: string) => value || 'Chưa ghi nhận' },
                { title: 'Trạng thái nội bộ', dataIndex: 'status', key: 'status', render: (status: string) => <Tag color={status === 'Đã thanh toán' ? 'success' : status === 'Từ chối' ? 'error' : 'warning'}>{status}</Tag> },
                { title: 'Thao tác', key: 'actions', render: (_: unknown, payment: FinancePaymentRequest) => payment.status === 'Chờ duyệt'
                  ? <Button onClick={() => void approveTaxPayment(payment)}>Phê duyệt</Button>
                  : payment.status === 'Đã phê duyệt'
                    ? <Button type="primary" onClick={() => openTaxSettlement(payment)}>Ghi nhận giao dịch</Button>
                    : <span>{payment.financeTransactionId ? 'Đã liên kết phiếu chi' : 'Không có'}</span> },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* VIEW: RISKY (Doanh nghiệp rủi ro về thuế CQT) */}
      {isRisky && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Alert
            message="Sổ rà soát nội bộ, không phải danh sách kết luận vi phạm"
            description="Mỗi hồ sơ phải ghi rõ nguồn và ngày rà soát. Trạng thái, mức độ và dấu hiệu chỉ phản ánh việc theo dõi nội bộ; hệ thống không kết nối dữ liệu cơ quan thuế và không tự khẳng định nhà cung cấp vi phạm."
            type="warning"
            showIcon
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Rà soát nhà cung cấp thuế</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <Input prefix={<SearchOutlined style={{ color: '#bbb' }} />} placeholder="Tìm nhà cung cấp, MST, nguồn, hóa đơn" style={{ width: 340, borderRadius: 6 }} allowClear value={reviewSearch} onChange={event => setReviewSearch(event.target.value)} />
              {user?.role === 'ADMIN' && <Button type="primary" icon={<PlusOutlined />} onClick={() => openReviewForm()} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Thêm hồ sơ rà soát</Button>}
            </div>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={taxSupplierReviews.filter(review => !reviewSearch || `${review.supplierName} ${review.taxCode} ${review.sourceName} ${review.sourceCode} ${review.invoiceReference || ''}`.toLocaleLowerCase('vi-VN').includes(reviewSearch.trim().toLocaleLowerCase('vi-VN')))}
              columns={[
                { title: 'Nhà cung cấp và MST', key: 'supplier', render: (_: unknown, review: TaxSupplierReview) => <div>{review.supplierName}<div style={{ color: '#64748B', fontSize: 12 }}>MST: {review.taxCode}</div></div> },
                { title: 'Nguồn thông tin', key: 'source', render: (_: unknown, review: TaxSupplierReview) => <div>{review.sourceName}<div style={{ color: '#64748B', fontSize: 12 }}>{review.sourceCode} · {review.sourceReference}</div></div> },
                { title: 'Ngày rà soát', dataIndex: 'verifiedAt', key: 'verifiedAt' },
                { title: 'Trạng thái rà soát', dataIndex: 'verificationStatus', key: 'verificationStatus', render: (status: string) => <Tag color={status === 'Đã rà soát nguồn' ? 'processing' : 'warning'}>{status}</Tag> },
                { title: 'Dấu hiệu và hóa đơn', key: 'indicators', render: (_: unknown, review: TaxSupplierReview) => <div>{review.riskIndicators || 'Chưa ghi nhận'}<div style={{ color: '#64748B', fontSize: 12 }}>Hóa đơn: {review.invoiceReference || 'Chưa liên kết'}</div></div> },
                { title: 'Mức độ nội bộ', dataIndex: 'internalSeverity', key: 'internalSeverity', render: (severity: string) => <Tag color={severity === 'Cao' ? 'error' : severity === 'Trung bình' ? 'warning' : 'default'}>{severity}</Tag> },
                { title: 'Người xử lý', dataIndex: 'assignee', key: 'assignee', render: (name: string) => name || 'Chưa phân công' },
                { title: 'Kết quả', dataIndex: 'reviewOutcome', key: 'reviewOutcome', render: (result: string) => result || 'Chưa ghi nhận' },
                { title: 'Tài liệu', key: 'evidence', render: (_: unknown, review: TaxSupplierReview) => review.evidenceFileId ? <Button icon={<DownloadOutlined />} onClick={() => void downloadReviewEvidence(review)}>Tải minh chứng</Button> : <span>Chưa đính kèm</span> },
                { title: 'Thao tác', key: 'actions', render: (_: unknown, review: TaxSupplierReview) => user?.role === 'ADMIN' ? <Button icon={<EditOutlined />} onClick={() => openReviewForm(review)}>Sửa</Button> : <span>Chỉ xem</span> },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
          {!taxSupplierReviews.length && <div style={{ color: '#64748B', padding: 8 }}>Chưa có hồ sơ rà soát. Danh sách bắt đầu trống và chỉ hiển thị nhà cung cấp khi người dùng tạo hồ sơ kèm nguồn.</div>}
        </div>
      )}

      {/* VIEW: DECLARATION & DEFAULT */}
      {!isTypes && !isPeriods && !isDeadlines && !isOrders && !isRisky && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo mã tờ khai, loại thuế, kỳ kê khai..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 340, borderRadius: 6 }}
              allowClear
            />
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                form.resetFields();
                setModalOpen(true);
              }}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Thêm kỳ kê khai thuế
            </Button>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={filteredData}
              columns={[
                {
                  title: 'Mã tờ khai',
                  dataIndex: 'code',
                  key: 'code',
                  render: (code: string) => (
                    <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AuditOutlined /> {code}
                    </span>
                  ),
                },
                {
                  title: 'Sắc thuế kê khai',
                  dataIndex: 'taxType',
                  key: 'taxType',
                  render: (t: string) => <strong>{t}</strong>,
                },
                {
                  title: 'Kỳ tính thuế',
                  dataIndex: 'period',
                  key: 'period',
                },
                {
                  title: 'Cơ quan thuế quản lý',
                  dataIndex: 'taxAuthority',
                  key: 'taxAuthority',
                  render: (auth: string) => <span style={{ color: '#475569', fontSize: 12.5 }}>{auth}</span>,
                },
                {
                  title: 'Số tiền thuế (VNĐ)',
                  dataIndex: 'amountPayable',
                  key: 'amountPayable',
                  render: (val: number) => (
                    <strong style={{ fontSize: 13.5, color: '#0F172A' }}>
                      {val.toLocaleString('vi-VN')} ₫
                    </strong>
                  ),
                },
                {
                  title: 'Còn phải nộp',
                  key: 'remaining',
                  render: (_: unknown, record: TaxFiling) => `${Math.max(0, record.amountPayable - record.amountPaid).toLocaleString('vi-VN')} ₫`,
                },
                {
                  title: 'Hạn nộp',
                  dataIndex: 'deadline',
                  key: 'deadline',
                  render: (d: string) => <span style={{ color: '#DC2626', fontWeight: 500 }}>{d}</span>,
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string) => (
                    <Tag color={status === 'Đã nộp đủ' ? 'success' : status.includes('nội bộ') ? 'processing' : 'warning'}>
                      {status}
                    </Tag>
                  ),
                },
                {
                  title: 'Thao tác',
                  key: 'action',
                  render: (_: any, record: TaxFiling) => (
                    <Button
                      type="primary"
                      disabled={!paymentsLoaded || record.amountPayable <= record.amountPaid || hasOpenTaxPayment(payments, record.key)}
                      onClick={() => openTaxPayment(record)}
                      style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                    >
                      {!paymentsLoaded ? 'Đang tải đề nghị' : record.amountPayable <= record.amountPaid ? 'Đã ghi nhận đủ' : hasOpenTaxPayment(payments, record.key) ? 'Đề nghị đang xử lý' : 'Lập đề nghị nộp'}
                    </Button>
                  ),
                },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* Modal Add Tax Filing */}
      <Modal
        title="Thêm kỳ kê khai thuế doanh nghiệp mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã hồ sơ thuế" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="taxType" label="Loại thuế" rules={[{ required: true, message: 'Chọn loại thuế' }]}>
              <Select showSearch options={filingTaxTypeOptions} />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="period" label="Kỳ kê khai" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="amountPayable" label="Số tiền phải nộp (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={1000000} />
            </Form.Item>
          </div>
          <Form.Item name="taxAuthority" label="Cơ quan thuế quản lý">
            <Input />
          </Form.Item>
          <Form.Item name="deadline" label="Hạn chót nộp" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu tờ khai
            </Button>
          </div>
        </Form>
      </Modal>
      <Modal title={editingTaxType ? 'Sửa hồ sơ sắc thuế nội bộ' : 'Thêm hồ sơ sắc thuế nội bộ'} open={taxTypeModalOpen} onCancel={() => { setTaxTypeModalOpen(false); setEditingTaxType(null); taxTypeForm.resetFields(); }} footer={null} width={780}>
        <Alert message="Hồ sơ tham chiếu nội bộ, chưa xác minh" description="Nội dung thuế suất và tài khoản chỉ được lưu để đối chiếu, không dùng cho tính thuế hay tự động hạch toán. Không nhập thông tin như một kết luận pháp lý nếu chưa kiểm tra văn bản gốc." type="warning" showIcon />
        <Form form={taxTypeForm} layout="vertical" onFinish={saveTaxType} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 14, rowGap: 3 }}>
            <Form.Item name="taxCode" label="Mã sắc thuế" rules={[{ required: true, whitespace: true }]}><Input maxLength={40} /></Form.Item>
            <Form.Item name="taxName" label="Tên sắc thuế" rules={[{ required: true, whitespace: true }]}><Input maxLength={160} /></Form.Item>
            <Form.Item name="taxGroup" label="Nhóm thuế" rules={[{ required: true }]}><Select options={[
              { value: 'GTGT', label: 'GTGT' }, { value: 'TNDN', label: 'TNDN' }, { value: 'TNCN', label: 'TNCN' },
              { value: 'Thuế nhà thầu', label: 'Thuế nhà thầu' }, { value: 'Tiêu thụ đặc biệt', label: 'Tiêu thụ đặc biệt' },
              { value: 'Xuất nhập khẩu', label: 'Xuất nhập khẩu' }, { value: 'Tài nguyên', label: 'Tài nguyên' }, { value: 'Nghĩa vụ khác', label: 'Nghĩa vụ khác' },
            ]} /></Form.Item>
            <Form.Item name="status" label="Trạng thái theo dõi nội bộ" rules={[{ required: true }]}><Select options={[{ value: 'Đang theo dõi', label: 'Đang theo dõi' }, { value: 'Tạm ngưng', label: 'Tạm ngưng' }]} /></Form.Item>
            <Form.Item name="calculationMethod" label="Phương pháp tính" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            <Form.Item name="taxpayerScope" label="Đối tượng áp dụng" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            <Form.Item name="taxRateReference" label="Tham chiếu thuế suất"><Input placeholder="Ghi văn bản/điều khoản; chỉ lưu tham chiếu, không tính toán" /></Form.Item>
            <Form.Item name="legalBasis" label="Văn bản áp dụng" rules={[{ required: true, whitespace: true }]}><Input placeholder="Số hiệu văn bản và điều khoản cần đối chiếu" /></Form.Item>
            <Form.Item name="effectiveFrom" label="Ngày hiệu lực" rules={[{ required: true, message: 'Chọn ngày hiệu lực.' }]}><DatePicker style={{ width: '100%' }} placeholder="Chọn ngày" /></Form.Item>
            <Form.Item name="effectiveTo" label="Ngày hết hiệu lực"><DatePicker allowClear style={{ width: '100%' }} placeholder="Chọn ngày nếu đã xác định" /></Form.Item>
            <Form.Item name="debitAccount" label="Tài khoản Nợ tham chiếu"><Input placeholder="Mã tài khoản theo chế độ áp dụng" /></Form.Item>
            <Form.Item name="creditAccount" label="Tài khoản Có tham chiếu"><Input placeholder="Mã tài khoản theo chế độ áp dụng" /></Form.Item>
          </div>
          <Form.Item name="conditions" label="Điều kiện áp dụng"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
          <Form.Item name="exceptions" label="Ngoại lệ"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={() => { setTaxTypeModalOpen(false); setEditingTaxType(null); taxTypeForm.resetFields(); }}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={taxTypeSaving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu hồ sơ</Button>
          </div>
        </Form>
      </Modal>
      <Modal title={editingReview ? 'Sửa hồ sơ rà soát nhà cung cấp' : 'Thêm hồ sơ rà soát nhà cung cấp'} open={reviewModalOpen} onCancel={() => { setReviewModalOpen(false); setEditingReview(null); setSelectedEvidenceFile(null); setReviewEvidencePickerOpen(false); reviewForm.resetFields(); }} footer={null} width={820}>
        <Alert message="Đánh giá nội bộ có nguồn dẫn" description="Chỉ ghi nhận việc rà soát theo nguồn đã nêu. Không dùng hồ sơ này để kết luận nhà cung cấp vi phạm hoặc tự động chặn hóa đơn." type="warning" showIcon />
        <Form form={reviewForm} layout="vertical" onFinish={saveSupplierReview} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 14, rowGap: 3 }}>
            <Form.Item name="supplierKey" label="Nhà cung cấp trong danh bạ CRM" rules={[{ required: true, message: 'Chọn nhà cung cấp.' }]}>
              <Select showSearch disabled={Boolean(editingReview)} placeholder="Tìm nhà cung cấp theo tên hoặc mã" options={suppliers.map(supplier => ({ value: supplier.key, label: `${supplier.name} · MST ${supplier.taxCode || 'chưa khai báo'}` }))} />
            </Form.Item>
            <Form.Item name="sourceCode" label="Mã nguồn thông tin" rules={[{ required: true, whitespace: true }]}><Input maxLength={120} placeholder="Mã thông báo, hồ sơ hoặc tham chiếu nguồn" /></Form.Item>
            <Form.Item name="sourceName" label="Nguồn dữ liệu" rules={[{ required: true, whitespace: true }]}><Input maxLength={300} placeholder="Tên cơ quan hoặc nguồn cung cấp thông tin" /></Form.Item>
            <Form.Item name="sourceReference" label="Tham chiếu nguồn" rules={[{ required: true, whitespace: true }]}><Input maxLength={1000} placeholder="Đường dẫn hoặc mã văn bản có thể tra cứu" /></Form.Item>
            <Form.Item name="verifiedAt" label="Ngày rà soát nguồn" rules={[{ required: true, message: 'Chọn ngày rà soát.' }]}><DatePicker style={{ width: '100%' }} placeholder="Chọn ngày" /></Form.Item>
            <Form.Item name="verificationStatus" label="Trạng thái rà soát nội bộ" rules={[{ required: true }]}><Select options={[
              { value: 'Chưa rà soát', label: 'Chưa rà soát' }, { value: 'Đã rà soát nguồn', label: 'Đã rà soát nguồn' }, { value: 'Nguồn không xác minh được', label: 'Nguồn không xác minh được' },
            ]} /></Form.Item>
            <Form.Item name="internalSeverity" label="Mức độ cảnh báo nội bộ" rules={[{ required: true }]}><Select options={[
              { value: 'Thông tin', label: 'Thông tin' }, { value: 'Thấp', label: 'Thấp' }, { value: 'Trung bình', label: 'Trung bình' }, { value: 'Cao', label: 'Cao' },
            ]} /></Form.Item>
            <Form.Item name="invoiceReference" label="Mã hóa đơn liên quan"><Input maxLength={160} placeholder="Mã hóa đơn nếu có" /></Form.Item>
            <Form.Item name="assignee" label="Người xử lý"><Input maxLength={180} /></Form.Item>
          </div>
          <Form.Item name="riskIndicators" label="Dấu hiệu cần rà soát"><Input.TextArea rows={2} maxLength={1000} placeholder="Ghi nội dung quan sát được từ nguồn, không ghi kết luận suy đoán" /></Form.Item>
          <Form.Item name="reviewOutcome" label="Kết quả rà soát"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
          <Form.Item name="notes" label="Ghi chú nội bộ"><Input.TextArea rows={2} maxLength={1000} /></Form.Item>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Button icon={<UploadOutlined />} onClick={() => setReviewEvidencePickerOpen(true)}>Chọn tài liệu chứng minh</Button>
            <span style={{ color: '#64748B', fontSize: 12 }}>{selectedEvidenceFile?.name || editingReview?.evidenceFileName || 'Chưa đính kèm tài liệu'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={() => { setReviewModalOpen(false); setEditingReview(null); setSelectedEvidenceFile(null); setReviewEvidencePickerOpen(false); reviewForm.resetFields(); }}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={reviewSaving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu hồ sơ</Button>
          </div>
        </Form>
        <FileUploadDialog open={reviewEvidencePickerOpen} onClose={() => setReviewEvidencePickerOpen(false)} onSelect={files => { setSelectedEvidenceFile(files[0] || null); setReviewEvidencePickerOpen(false); }} accept=".pdf,.png,.jpg,.jpeg,.xlsx,.xls,.doc,.docx" multiple={false} title="Chọn tài liệu chứng minh" confirmText="Chọn tệp" />
      </Modal>
      <Modal
        title={`Lập đề nghị nộp ${selectedTax?.taxType || 'thuế'}${selectedTax ? ` kỳ ${selectedTax.period}` : ''}`}
        open={paymentModalOpen}
        onCancel={() => { setPaymentModalOpen(false); paymentForm.resetFields(); setSelectedTax(null); }}
        footer={null}
        width={500}
      >
        <Form form={paymentForm} layout="vertical" onFinish={submitTaxPayment}>
          <div style={{ marginBottom: 14, color: '#64748B' }}>
            Còn phải nộp: {selectedTax ? Math.max(0, selectedTax.amountPayable - selectedTax.amountPaid).toLocaleString('vi-VN') : '0'} ₫. Đề nghị sẽ đi qua bước phê duyệt và ghi nhận giao dịch riêng.
          </div>
          <Form.Item name="amount" label="Số tiền đề nghị" rules={[{ required: true, message: 'Nhập số tiền đề nghị.' }]}>
            <Input type="number" min={1} max={selectedTax ? Math.max(0, selectedTax.amountPayable - selectedTax.amountPaid) : undefined} step={1} />
          </Form.Item>
          <Form.Item name="debitAccount" label="Tài khoản Nợ phải trả thuế" rules={[{ required: true, whitespace: true, message: 'Nhập tài khoản Nợ theo hệ thống tài khoản doanh nghiệp.' }]}>
            <Input maxLength={24} placeholder="Nhập mã tài khoản thuế phải trả" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={() => { setPaymentModalOpen(false); paymentForm.resetFields(); setSelectedTax(null); }}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={paymentSaving}>Tạo đề nghị</Button>
          </div>
        </Form>
      </Modal>
      <Modal
        title={`Ghi nhận giao dịch nộp thuế ${selectedPayment?.code || ''}`}
        open={settlementModalOpen}
        onCancel={() => { setSettlementModalOpen(false); settlementForm.resetFields(); setSelectedPayment(null); }}
        footer={null}
        width={500}
      >
        <Form form={settlementForm} layout="vertical" onFinish={submitTaxSettlement}>
          <Alert message="Chỉ ghi nhận sau khi giao dịch thực tế đã được thực hiện." description="Nhập mã tham chiếu ngân hàng. Thao tác cập nhật số đã thanh toán trong dữ liệu nội bộ, không xác nhận trạng thái từ eTax hoặc Kho bạc." type="warning" showIcon style={{ marginBottom: 14 }} />
          <Form.Item name="sourceAccountId" label="Tài khoản ngân hàng trích tiền" rules={[{ required: true, message: 'Chọn tài khoản ngân hàng.' }]}>
            <Select placeholder="Chọn tài khoản" options={paymentAccounts.filter(account => account.source === 'bank' && account.status === 'Đang hoạt động').map(account => ({ value: account.key, label: `${account.name} · ${Number(account.balance).toLocaleString('vi-VN')} ₫` }))} />
          </Form.Item>
          <Form.Item name="settlementReference" label="Mã giao dịch ngân hàng" rules={[{ required: true, min: 3, whitespace: true, message: 'Nhập mã giao dịch ngân hàng, tối thiểu 3 ký tự.' }]}>
            <Input maxLength={120} placeholder="Mã giao dịch trên chứng từ ngân hàng" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={() => { setSettlementModalOpen(false); settlementForm.resetFields(); setSelectedPayment(null); }}>Hủy</Button>
            <Button type="primary" htmlType="submit">Ghi nhận giao dịch</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
