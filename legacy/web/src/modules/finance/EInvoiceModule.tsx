import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  SafetyCertificateOutlined,
  EyeOutlined,
  EditOutlined,
  SendOutlined,
  FilePdfOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  FileTextOutlined,
  CopyOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Card, Tag, Alert, DatePicker } from '../../custom-ui';
import { collectionsApi, crmContactsApi, type CrmContact } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { filterEInvoiceReport } from './eInvoiceReportRules';
import archivedProviderCatalog from '../../data/einvoiceProviderCatalog.json';
import publishedProviderCatalog from '../../data/einvoiceProvidersPublished.json';
import providerIntegrationCatalog from '../../data/einvoiceProviderIntegrationCatalog.json';

const providerCatalog = [...archivedProviderCatalog, ...publishedProviderCatalog];

const PROVIDER_LIST_SOURCE = 'https://aba.angiang.vn/tin-noi-bat/danh-sach-to-chuc-cung-cap-giai-phap-hoa-don-dien-tu-dap-ung-day-du-cac-tieu-chi-quy-dinh-tai-kh-220697';
const PROVIDER_NOTICE_759 = 'https://cdn.thuvienphapluat.vn/uploads/mst/images/MyDuyen/Thang-8/260825/TB-759-TB-CT.pdf';

interface EInvoice {
  key: string;
  invoiceNumber: string;
  templateCode: string;
  symbol: string;
  buyerName: string;
  buyerType?: 'organization' | 'person' | 'other';
  buyerEntityName?: string;
  buyerCustomerKey?: string;
  buyerTaxCode: string;
  buyerAddress?: string;
  buyerEmail?: string;
  buyerPhone?: string;
  issueDate: string;
  totalAmount: number;
  vatRate?: number | string | null;
  vatAmount: number;
  finalAmount: number;
  status: 'Đã phát hành & Ký số' | 'Hóa đơn nháp' | 'Đã hủy';
  externalStatus?: string;
  items?: EInvoiceItem[];
}

interface EInvoiceTemplate {
  key: string;
  templateName: string;
  templateType: string;
  templateCode: string;
  symbol: string;
  version: string;
  providerTaxId: string;
  providerName: string;
  providerWebsite?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  internalNote?: string;
  status: string;
  externalStatus: string;
}

interface EInvoiceItem {
  key: string;
  productKey?: string;
  sku?: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  amount: number;
  vatRate: number;
  vatAmount: number;
  finalAmount: number;
}

interface EInvoiceProduct {
  key: string;
  sku: string;
  name: string;
  unit: string;
  status: string;
}

interface EInvoiceLineDraft {
  key: string;
  productKey: string;
  sku: string;
  name: string;
  unit: string;
  quantity: string;
  unitPrice: string;
  discountAmount: string;
  vatRate: string;
}

const blankInvoiceLine = (): EInvoiceLineDraft => ({
  key: crypto.randomUUID(), productKey: '', sku: '', name: '', unit: '', quantity: '1', unitPrice: '', discountAmount: '0', vatRate: '',
});

function EInvoiceItemsEditor({
  lines, products, onChange, onAdd, onRemove,
}: {
  lines: EInvoiceLineDraft[];
  products: EInvoiceProduct[];
  onChange: (key: string, patch: Partial<EInvoiceLineDraft>) => void;
  onAdd: () => void;
  onRemove: (key: string) => void;
}) {
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span>Hàng hóa, dịch vụ</span>
        <Button icon={<PlusOutlined />} onClick={onAdd}>Thêm dòng</Button>
      </div>
      {lines.map((line, index) => {
        const quantity = Number(line.quantity) || 0;
        const unitPrice = Number(line.unitPrice) || 0;
        const discountAmount = Number(line.discountAmount) || 0;
        const vatRate = Number(line.vatRate) || 0;
        const amount = Math.max(0, Math.round(quantity * unitPrice) - discountAmount);
        const vatAmount = Math.round(amount * vatRate / 100);
        const selectedProduct = products.find(product => product.key === line.productKey);
        return (
          <div key={line.key} style={{ display: 'grid', gap: 8, paddingBottom: 10 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 32px', gap: 6, alignItems: 'center' }}>
              <Select
                value={line.productKey || undefined}
                placeholder="Chọn hàng hóa trong danh mục hoặc nhập dịch vụ"
                options={products.map(product => ({ value: product.key, label: `${product.sku} · ${product.name}` }))}
                onChange={value => {
                  const product = products.find(item => item.key === value);
                  onChange(line.key, product
                    ? { productKey: product.key, sku: product.sku, name: product.name, unit: product.unit }
                    : { productKey: '', sku: '', name: '', unit: '' });
                }}
                allowClear
              />
              <Button icon={<DeleteOutlined />} style={{ width: 32, height: 32, padding: 0 }} title={`Xóa dòng ${index + 1}`} disabled={lines.length === 1} onClick={() => onRemove(line.key)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 2fr) repeat(5, minmax(90px, 1fr))', gap: 6 }}>
              <Input value={line.name} placeholder="Tên hàng hóa hoặc dịch vụ" disabled={Boolean(selectedProduct)} onChange={event => onChange(line.key, { name: event.target.value })} />
              <Input value={line.unit} placeholder="Đơn vị tính" disabled={Boolean(selectedProduct)} onChange={event => onChange(line.key, { unit: event.target.value })} />
              <Input type="number" min={0.001} step="0.001" value={line.quantity} placeholder="Số lượng" onChange={event => onChange(line.key, { quantity: event.target.value })} />
              <Input type="number" min={0} step={1} value={line.unitPrice} placeholder="Đơn giá" onChange={event => onChange(line.key, { unitPrice: event.target.value })} />
              <Input type="number" min={0} step={1} value={line.discountAmount} placeholder="Chiết khấu" onChange={event => onChange(line.key, { discountAmount: event.target.value })} />
              <Input type="number" min={0} max={100} step="any" value={line.vatRate} placeholder="Thuế suất (%)" onChange={event => onChange(line.key, { vatRate: event.target.value })} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', color: '#64748B', fontSize: 12 }}>
              Tiền hàng {amount.toLocaleString('vi-VN')} ₫ · thuế tạm tính {vatAmount.toLocaleString('vi-VN')} ₫ · tổng { (amount + vatAmount).toLocaleString('vi-VN') } ₫
            </div>
          </div>
        );
      })}
      <div style={{ color: '#64748B', fontSize: 12 }}>Thuế suất phải được đối chiếu theo hàng hóa, dịch vụ và ngày giao dịch; bản nháp chưa được xác nhận pháp lý hoặc phát hành.</div>
    </div>
  );
}

const INITIAL_INVOICES: EInvoice[] = [];

export const EInvoiceModule: React.FC = () => {
  const { user } = useAuth();
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isCreate = currentPath === '/finance/e-invoice/create';
  const isDrafts = currentPath === '/finance/e-invoice/drafts';
  const isTemplates = currentPath === '/finance/e-invoice/templates';
  const isLookup = currentPath === '/finance/e-invoice/lookup';
  const isReports = currentPath === '/finance/e-invoice/reports';
  const isProviders = currentPath === '/finance/e-invoice/providers';

  const [data, setData] = useState<EInvoice[]>(INITIAL_INVOICES);
  const [products, setProducts] = useState<EInvoiceProduct[]>([]);
  const [customers, setCustomers] = useState<CrmContact[]>([]);
  const [templates, setTemplates] = useState<EInvoiceTemplate[]>([]);
  const [invoiceLines, setInvoiceLines] = useState<EInvoiceLineDraft[]>(() => [blankInvoiceLine()]);

  useEffect(() => {
    const list = dataService.getGenericData('finance_einvoices');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_einvoices');
      setData(Array.isArray(updated) ? updated : []);
      const templateRows = dataService.getGenericData('finance_einvoice_templates');
      setTemplates(Array.isArray(templateRows) ? templateRows as EInvoiceTemplate[] : []);
      const inventory = dataService.getGenericData('finance_inventory');
      setProducts(Array.isArray(inventory) ? inventory as EInvoiceProduct[] : []);
    });
    void dataService.refreshGenericData('finance_inventory').then(rows => setProducts(Array.isArray(rows) ? rows as EInvoiceProduct[] : []));
    void dataService.refreshGenericData('finance_einvoice_templates').then(rows => setTemplates(Array.isArray(rows) ? rows as EInvoiceTemplate[] : []));
    return unsub;
  }, []);

  useEffect(() => {
    let active = true;
    void crmContactsApi.getAll('customer').then(response => {
      if (active) setCustomers(Array.isArray(response.data.data) ? response.data.data : []);
    }).catch(() => {
      if (active) setCustomers([]);
    });
    return () => { active = false; };
  }, []);

  const [searchText, setSearchText] = useState('');
  const [reportPeriod, setReportPeriod] = useState('all');
  const [reportStatus, setReportStatus] = useState('all');
  const [reportExternalStatus, setReportExternalStatus] = useState('all');
  const [reportBuyerSearch, setReportBuyerSearch] = useState('');
  const [providerSearchText, setProviderSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickCustomerTargetForm, setQuickCustomerTargetForm] = useState<any>(null);
  const [quickCustomerSaving, setQuickCustomerSaving] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EInvoice | null>(null);
  const [previewRecord, setPreviewRecord] = useState<EInvoice | null>(null);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EInvoiceTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EInvoiceTemplate | null>(null);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [form] = Form.useForm();
  const [createForm] = Form.useForm();
  const [quickCustomerForm] = Form.useForm();
  const [templateForm] = Form.useForm();

  const updateInvoiceLine = (key: string, patch: Partial<EInvoiceLineDraft>) => {
    setInvoiceLines(current => current.map(line => line.key === key ? { ...line, ...patch } : line));
  };

  const applyBuyerContact = (targetForm: any, customerKey?: string, knownCustomer?: CrmContact) => {
    if (!customerKey) return;
    const customer = knownCustomer?.key === customerKey ? knownCustomer : customers.find(item => item.key === customerKey);
    if (!customer) return;
    const entityKind = customer.details?.entityKind === 'person' ? 'person' : 'organization';
    const invoiceEmail = (customer.details?.invoiceRecipientEmails || '').split(/[;,]/).map(value => value.trim()).find(Boolean) || customer.email || '';
    targetForm.setFieldsValue({
      buyerCustomerKey: customer.key,
      buyerType: entityKind,
      buyerName: entityKind === 'person' ? (customer.details?.personalName || customer.name) : customer.name,
      buyerEntityName: entityKind === 'organization' ? customer.name : '',
      buyerTaxCode: customer.taxCode || '',
      buyerAddress: customer.address || '',
      buyerEmail: invoiceEmail,
      buyerPhone: customer.details?.invoiceRecipientPhone || customer.phone || '',
    });
  };

  const createQuickCustomer = async (values: any) => {
    const name = String(values.name || '').trim();
    const taxCode = String(values.taxCode || '').trim();
    const duplicate = customers.find(customer => {
      const sameKind = (customer.details?.entityKind || 'organization') === (values.entityKind || 'organization');
      return sameKind && ((taxCode && customer.taxCode.trim().toLocaleLowerCase() === taxCode.toLocaleLowerCase())
        || customer.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase());
    });
    if (duplicate) {
      if (quickCustomerTargetForm) applyBuyerContact(quickCustomerTargetForm, duplicate.key, duplicate);
      quickCustomerForm.resetFields();
      setQuickCustomerOpen(false);
      setQuickCustomerTargetForm(null);
      message.info('Khách hàng đã có trong danh bạ và đã được chọn cho hóa đơn.');
      return;
    }
    setQuickCustomerSaving(true);
    try {
      const response = await crmContactsApi.create({
        type: 'customer',
        name,
        taxCode,
        contactPerson: String(values.contactPerson || '').trim(),
        phone: String(values.phone || '').trim(),
        email: String(values.email || '').trim(),
        address: String(values.address || '').trim(),
        status: 'Đang hoạt động',
        details: {
          entityKind: values.entityKind || 'organization',
          personalName: String(values.personalName || '').trim(),
          invoiceRecipientEmails: String(values.invoiceRecipientEmails || '').trim(),
          invoiceRecipientPhone: String(values.invoiceRecipientPhone || '').trim(),
        },
      });
      const customer = response.data.contact;
      setCustomers(current => [...current.filter(item => item.key !== customer.key), customer]);
      if (quickCustomerTargetForm) applyBuyerContact(quickCustomerTargetForm, customer.key, customer);
      quickCustomerForm.resetFields();
      setQuickCustomerOpen(false);
      setQuickCustomerTargetForm(null);
      message.success(`Đã tạo khách hàng ${customer.code} và điền vào hóa đơn.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể tạo khách hàng trong danh bạ.');
    } finally {
      setQuickCustomerSaving(false);
    }
  };

  const renderBuyerCustomerField = (targetForm: any) => (
    <Form.Item label="Khách hàng trong danh bạ">
      <div style={{ display: 'flex', gap: 4 }}>
        <Form.Item name="buyerCustomerKey" style={{ flex: 1, marginBottom: 0 }}>
          <Select allowClear showSearch placeholder="Chọn khách hàng để điền thông tin" options={customers.filter(item => !item.status.toLocaleLowerCase().includes('tạm')).map(item => ({ value: item.key, label: `${item.code} · ${item.name}` }))} onChange={value => applyBuyerContact(targetForm, value)} />
        </Form.Item>
        {user?.role === 'ADMIN' && <Button aria-label="Tạo nhanh khách hàng" title="Tạo nhanh khách hàng" icon={<PlusOutlined />} onClick={() => { quickCustomerForm.resetFields(); setQuickCustomerTargetForm(targetForm); setQuickCustomerOpen(true); }} />}
      </div>
    </Form.Item>
  );

  const prepareInvoiceItems = () => {
    if (!invoiceLines.length) {
      message.error('Thêm ít nhất một dòng hàng hóa hoặc dịch vụ.');
      return null;
    }
    const items: EInvoiceItem[] = [];
    for (const [index, line] of invoiceLines.entries()) {
      const quantity = Number(line.quantity);
      const unitPrice = Number(line.unitPrice);
      const discountAmount = Number(line.discountAmount || 0);
      const vatRate = Number(line.vatRate);
      if (!line.name.trim() || !line.unit.trim() || !Number.isFinite(quantity) || quantity <= 0
        || !Number.isSafeInteger(unitPrice) || unitPrice < 0 || !Number.isSafeInteger(discountAmount) || discountAmount < 0
        || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
        message.error(`Kiểm tra tên, đơn vị tính, số lượng, đơn giá, chiết khấu và thuế suất ở dòng ${index + 1}.`);
        return null;
      }
      const grossAmount = Math.round(quantity * unitPrice);
      if (discountAmount > grossAmount) {
        message.error(`Chiết khấu dòng ${index + 1} không được vượt thành tiền.`);
        return null;
      }
      const amount = grossAmount - discountAmount;
      const vatAmount = Math.round(amount * vatRate / 100);
      items.push({
        key: line.key, productKey: line.productKey || '', sku: line.sku, name: line.name.trim(), unit: line.unit.trim(),
        quantity, unitPrice, discountAmount, amount, vatRate, vatAmount, finalAmount: amount + vatAmount,
      });
    }
    return items;
  };

  const handleCreate = async (values: any) => {
    const items = prepareInvoiceItems();
    if (!items) return;
    const total = items.reduce((sum, item) => sum + item.amount, 0);
    const vat = items.reduce((sum, item) => sum + item.vatAmount, 0);
    if (total <= 0 || !Number.isSafeInteger(total + vat)) {
      message.error('Tổng tiền hàng và thuế không hợp lệ hoặc vượt giới hạn an toàn.');
      return;
    }
    if (editingRecord) {
      try {
        await dataService.updateGenericRecord('finance_einvoices', {
          key: editingRecord.key,
          invoiceNumber: String(values.invoiceNumber || '').trim(),
          buyerName: String(values.buyerName || '').trim(),
          buyerType: values.buyerType || 'other',
          buyerEntityName: String(values.buyerEntityName || '').trim(),
          buyerCustomerKey: values.buyerCustomerKey || '',
          buyerTaxCode: String(values.buyerTaxCode || '').trim(),
          buyerAddress: String(values.buyerAddress || '').trim(),
          buyerEmail: String(values.buyerEmail || '').trim(),
          buyerPhone: String(values.buyerPhone || '').trim(),
          items,
        });
        message.success(`Đã cập nhật bản nháp ${values.invoiceNumber}.`);
        setModalOpen(false);
        setEditingRecord(null);
        form.resetFields();
        setInvoiceLines([blankInvoiceLine()]);
      } catch (error: any) {
        message.error(error?.response?.data?.message || error?.message || 'Không thể cập nhật bản nháp hóa đơn.');
      }
      return;
    }
    const newInv: EInvoice = {
      ...values,
      key: crypto.randomUUID(),
      templateCode: '',
      symbol: values.symbol || '',
      issueDate: new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
      totalAmount: total,
      vatAmount: vat,
      finalAmount: total + vat,
      vatRate: new Set(items.map(item => item.vatRate)).size === 1 ? items[0].vatRate : null,
      items,
      status: 'Hóa đơn nháp',
      externalStatus: 'Chưa gửi nhà cung cấp',
    };
    try {
      await dataService.createGenericRecord('finance_einvoices', newInv);
      message.success(`Đã lưu bản nháp ${values.invoiceNumber}. Hóa đơn chưa được ký số hoặc gửi cơ quan thuế.`);
      setModalOpen(false);
      form.resetFields();
      createForm.resetFields();
      setInvoiceLines([blankInvoiceLine()]);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu bản nháp hóa đơn.');
    }
  };

  const validateDraft = async (targetForm: any, current?: EInvoice | null) => {
    let values: any;
    try {
      values = await targetForm.validateFields();
    } catch {
      message.error('Hoàn tất các trường bắt buộc trước khi kiểm tra bản nháp.');
      return;
    }
    const items = prepareInvoiceItems();
    if (!items) return;
    try {
      const response = await collectionsApi.validate<Record<string, any>>('finance_einvoices', {
        key: current?.key || crypto.randomUUID(),
        invoiceNumber: String(values.invoiceNumber || '').trim(),
        templateCode: current?.templateCode || '',
        symbol: values.symbol || current?.symbol || '',
        buyerName: String(values.buyerName || '').trim(),
        buyerType: values.buyerType || 'other',
        buyerEntityName: String(values.buyerEntityName || '').trim(),
        buyerCustomerKey: values.buyerCustomerKey || '',
        buyerTaxCode: String(values.buyerTaxCode || '').trim(),
        buyerAddress: String(values.buyerAddress || '').trim(),
        buyerEmail: String(values.buyerEmail || '').trim(),
        buyerPhone: String(values.buyerPhone || '').trim(),
        issueDate: current?.issueDate || new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date()),
        items,
      }, current?.key);
      const normalized = response.data.record;
      message.success(`Dữ liệu hợp lệ theo kiểm tra hệ thống. Tổng thanh toán ${Number(normalized.finalAmount || 0).toLocaleString('vi-VN')} ₫. Bản nháp chưa được phát hành.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể kiểm tra bản nháp.');
    }
  };

  const deleteDraft = async (record: EInvoice) => {
    try {
      await dataService.deleteGenericRecord('finance_einvoices', record.key);
      message.success(`Đã xóa bản nháp ${record.invoiceNumber}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể xóa bản nháp.');
    }
  };

  const openDraftEditor = (record: EInvoice) => {
    setEditingRecord(record);
    setInvoiceLines(Array.isArray(record.items) && record.items.length
      ? record.items.map(line => ({
        key: line.key || crypto.randomUUID(), productKey: line.productKey || '', sku: line.sku || '', name: line.name || '', unit: line.unit || '',
        quantity: String(line.quantity ?? ''), unitPrice: String(line.unitPrice ?? ''), discountAmount: String(line.discountAmount ?? 0), vatRate: String(line.vatRate ?? ''),
      }))
      : [{ ...blankInvoiceLine(), quantity: '1', unitPrice: String(record.totalAmount || ''), vatRate: String(record.vatRate ?? '') }]);
    form.setFieldsValue({
      invoiceNumber: record.invoiceNumber,
      buyerType: record.buyerType || 'other',
      buyerCustomerKey: record.buyerCustomerKey || '',
      buyerName: record.buyerName,
      buyerEntityName: record.buyerEntityName || '',
      buyerTaxCode: record.buyerTaxCode,
      buyerAddress: record.buyerAddress || '',
      buyerEmail: record.buyerEmail || '',
      buyerPhone: record.buyerPhone || '',
    });
    setModalOpen(true);
  };

  const copyDraft = (record: EInvoice) => {
    setEditingRecord(null);
    setInvoiceLines(Array.isArray(record.items) && record.items.length
      ? record.items.map(line => ({
        key: crypto.randomUUID(), productKey: line.productKey || '', sku: line.sku || '', name: line.name || '', unit: line.unit || '',
        quantity: String(line.quantity ?? ''), unitPrice: String(line.unitPrice ?? ''), discountAmount: String(line.discountAmount ?? 0), vatRate: String(line.vatRate ?? ''),
      }))
      : [{ ...blankInvoiceLine(), quantity: '1', unitPrice: String(record.totalAmount || ''), vatRate: String(record.vatRate ?? '') }]);
    form.resetFields();
    form.setFieldsValue({
      invoiceNumber: `DRAFT-${crypto.randomUUID().toUpperCase()}`,
      buyerType: record.buyerType || 'other',
      buyerCustomerKey: record.buyerCustomerKey || '',
      buyerName: record.buyerName,
      buyerEntityName: record.buyerEntityName || '',
      buyerTaxCode: record.buyerTaxCode,
      buyerAddress: record.buyerAddress || '',
      buyerEmail: record.buyerEmail || '',
      buyerPhone: record.buyerPhone || '',
    });
    setModalOpen(true);
  };

  const closeDraftEditor = () => {
    setModalOpen(false);
    setEditingRecord(null);
    form.resetFields();
    setInvoiceLines([blankInvoiceLine()]);
  };

  const filteredData = data.filter(
    (inv) =>
      !searchText ||
      (inv.invoiceNumber || '').includes(searchText) ||
      (inv.buyerName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (inv.buyerTaxCode || '').includes(searchText)
  );
  const confirmedInvoices = data.filter(inv => inv.externalStatus === 'CQT đã cấp mã');
  const exportInvoiceList = () => downloadFile('bang_ke_ban_ghi_hoa_don_noi_bo.xlsx', generateValidXlsxBlob([
    ['Mã bản ghi', 'Người mua', 'Mã số thuế người mua', 'Ngày lập', 'Tiền trước thuế', 'Thuế GTGT', 'Tổng thanh toán', 'Trạng thái nội bộ', 'Trạng thái bên ngoài'],
    ...filteredData.map(inv => [inv.invoiceNumber, inv.buyerName, inv.buyerTaxCode, inv.issueDate, inv.totalAmount, inv.vatAmount, inv.finalAmount, inv.status, inv.externalStatus || 'Chưa xác minh']),
  ]));
  const reportPeriods = Array.from(new Set(data.map(invoice => /^\d{4}-\d{2}/.exec(invoice.issueDate || '')?.[0]).filter((period): period is string => Boolean(period)))).sort((a, b) => b.localeCompare(a));
  const reportStatuses = Array.from(new Set(data.map(invoice => invoice.status).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
  const reportExternalStatuses = Array.from(new Set(data.map(invoice => invoice.externalStatus || 'Chưa xác minh').filter(Boolean))).sort((a, b) => a.localeCompare(b, 'vi'));
  const invoiceReportData = filterEInvoiceReport(data, { period: reportPeriod, status: reportStatus, externalStatus: reportExternalStatus, buyerSearch: reportBuyerSearch });
  const exportInvoiceReport = () => downloadFile('bao_cao_hoa_don_noi_bo.xlsx', generateValidXlsxBlob([
    ['Kỳ theo ngày lập', 'Mã bản ghi', 'Người mua', 'Mã số thuế người mua', 'Mẫu số', 'Ký hiệu', 'Ngày lập', 'Tiền hàng bản nháp', 'Thuế GTGT bản nháp', 'Tổng thanh toán bản nháp', 'Trạng thái nội bộ', 'Trạng thái bên ngoài'],
    ...invoiceReportData.map(invoice => [invoice.issueDate?.slice(0, 7) || 'Chưa xác định', invoice.invoiceNumber, invoice.buyerName, invoice.buyerTaxCode, invoice.templateCode, invoice.symbol, invoice.issueDate, invoice.totalAmount, invoice.vatAmount, invoice.finalAmount, invoice.status, invoice.externalStatus || 'Chưa xác minh']),
  ]));
  const exportInvoicePdf = (invoice: EInvoice) => downloadFile(`ban_nhap_hoa_don_${invoice.invoiceNumber.replace(/[^a-z0-9_-]/gi, '_')}.pdf`, generateValidPdfBlob(
    `BẢN NHÁP HÓA ĐƠN ${invoice.invoiceNumber}`,
    'Dữ liệu nội bộ · chưa ký số · chưa gửi cơ quan thuế',
    [`Người mua: ${invoice.buyerName}`, `Đơn vị: ${invoice.buyerEntityName || ''}`, `Mã số thuế hoặc mã định danh: ${invoice.buyerTaxCode || 'Chưa khai báo'}`, `Địa chỉ: ${invoice.buyerAddress || ''}`, `Email: ${invoice.buyerEmail || ''}`, `Điện thoại: ${invoice.buyerPhone || ''}`, `Ngày lập nháp: ${invoice.issueDate}`, `Tiền trước thuế: ${Number(invoice.totalAmount).toLocaleString('vi-VN')} VND`, `Thuế GTGT: ${Number(invoice.vatAmount).toLocaleString('vi-VN')} VND`, `Tổng thanh toán: ${Number(invoice.finalAmount).toLocaleString('vi-VN')} VND`],
  ));
  const visibleProviders = providerCatalog.filter((provider) =>
    `${provider.name} ${provider.taxId} ${provider.website}`.toLowerCase().includes(providerSearchText.toLowerCase().trim())
  );

  const openTemplateForm = (template?: EInvoiceTemplate) => {
    setEditingTemplate(template || null);
    templateForm.resetFields();
    if (template) templateForm.setFieldsValue(template);
    else templateForm.setFieldsValue({ templateType: 'Hóa đơn giá trị gia tăng' });
    setTemplateModalOpen(true);
  };

  const saveTemplate = async (values: any) => {
    const provider = providerCatalog.find(item => item.taxId === String(values.providerTaxId));
    if (!provider) {
      message.error('Chọn nhà cung cấp trong danh sách đã tổng hợp.');
      return;
    }
    setTemplateSaving(true);
    try {
      const record: EInvoiceTemplate = {
        key: editingTemplate?.key || crypto.randomUUID(),
        templateName: String(values.templateName || '').trim(),
        templateType: String(values.templateType || '').trim(),
        templateCode: String(values.templateCode || '').trim(),
        symbol: String(values.symbol || '').trim(),
        version: String(values.version || '').trim(),
        providerTaxId: provider.taxId,
        providerName: provider.name,
        providerWebsite: provider.website,
        effectiveFrom: values.effectiveFrom || '',
        effectiveTo: values.effectiveTo || '',
        internalNote: String(values.internalNote || '').trim(),
        status: 'Nháp nội bộ · chưa xác minh',
        externalStatus: 'Chưa gửi nhà cung cấp',
      };
      if (editingTemplate) await dataService.updateGenericRecord('finance_einvoice_templates', {
        key: record.key, templateName: record.templateName, templateType: record.templateType, templateCode: record.templateCode,
        symbol: record.symbol, version: record.version, providerTaxId: record.providerTaxId, providerName: record.providerName,
        providerWebsite: record.providerWebsite, effectiveFrom: record.effectiveFrom, effectiveTo: record.effectiveTo, internalNote: record.internalNote,
      });
      else await dataService.createGenericRecord('finance_einvoice_templates', record);
      setTemplates(dataService.getGenericData('finance_einvoice_templates') as EInvoiceTemplate[]);
      setTemplateModalOpen(false);
      setEditingTemplate(null);
      templateForm.resetFields();
      message.success(editingTemplate ? 'Đã cập nhật hồ sơ mẫu nội bộ.' : 'Đã lưu hồ sơ mẫu nội bộ.');
    } catch (error: any) {
      message.error(error?.response?.data?.error || error?.message || 'Không thể lưu hồ sơ mẫu.');
    } finally {
      setTemplateSaving(false);
    }
  };

  const deleteTemplate = async (template: EInvoiceTemplate) => {
    try {
      await dataService.deleteGenericRecord('finance_einvoice_templates', template.key);
      setTemplates(dataService.getGenericData('finance_einvoice_templates') as EInvoiceTemplate[]);
      message.success('Đã xóa hồ sơ mẫu nội bộ.');
    } catch (error: any) {
      message.error(error?.response?.data?.error || error?.message || 'Không thể xóa hồ sơ mẫu.');
    }
  };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Giá trị hóa đơn được CQT xác nhận</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {confirmedInvoices.reduce((sum, invoice) => sum + Number(invoice.finalAmount || 0), 0).toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hóa đơn được CQT xác nhận cấp mã</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {confirmedInvoices.length} hóa đơn
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hóa đơn nháp chờ ký số</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {data.filter((d) => d.status === 'Hóa đơn nháp').length} bản nháp
          </div>
        </div>
      </div>

      <Alert
        message="Chưa kết nối nhà cung cấp hóa đơn điện tử"
        description="Mọi hóa đơn mới chỉ được lưu thành bản nháp nội bộ. Chức năng ký số, gửi cơ quan thuế, tra cứu mã và xác nhận phát hành chỉ hoạt động sau khi tích hợp nhà cung cấp thật."
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {isProviders && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Card title="Danh mục nhà cung cấp hóa đơn điện tử" style={{ borderRadius: 8 }}>
            <div style={{ display: 'grid', gap: 10 }}>
              <div>Danh mục gồm 128 tổ chức trong danh sách tham khảo ngày 14/05/2026 theo quy định trước đây và 3 tổ chức được công bố trong đợt tại Thông báo 759/TB-CT ngày 22/08/2026 theo Thông tư 91/2026/TT-BTC.</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                <a href={PROVIDER_LIST_SOURCE} target="_blank" rel="noreferrer">Nguồn danh sách 128 tổ chức</a>
                <a href={PROVIDER_NOTICE_759} target="_blank" rel="noreferrer">Thông báo 759/TB-CT và danh sách đợt công bố</a>
                <a href="https://vanban.chinhphu.vn/?docid=218689&pageid=27160&typegroupid=4" target="_blank" rel="noreferrer">Nghị định 254/2026/NĐ-CP</a>
                <a href="https://congbao.chinhphu.vn/van-ban/thong-tu-so-91-2026-tt-btc-470171/67424.htm" target="_blank" rel="noreferrer">Thông tư 91/2026/TT-BTC</a>
              </div>
              <div>Thông báo 759 công bố một đợt bổ sung, không phải toàn bộ danh sách đủ điều kiện hiện hành. Các tổ chức trong danh sách tham khảo cũ chưa được xác minh lại theo quy định mới. Hiện hệ thống chưa kết nối hoặc phát hành hóa đơn qua nhà cung cấp nào.</div>
            </div>
          </Card>
          <Input
            prefix={<SearchOutlined style={{ color: '#64748B' }} />}
            placeholder="Tìm theo tên, mã số thuế hoặc website"
            value={providerSearchText}
            onChange={(event) => setProviderSearchText(event.target.value)}
            allowClear
            style={{ width: 'min(100%, 420px)' }}
          />
          <div className="transparent-table-card">
            <KTable
              dataSource={visibleProviders}
              rowKey="number"
              pagination={{ pageSize: 20 }}
              columns={[
                { title: 'STT', dataIndex: 'number', key: 'number', width: 64 },
                { title: 'Tổ chức cung cấp', dataIndex: 'name', key: 'name' },
                { title: 'Mã số thuế', dataIndex: 'taxId', key: 'taxId', width: 150 },
                {
                  title: 'Nguồn trạng thái', key: 'sourceStatus', width: 260,
                  render: (_: unknown, provider: (typeof providerCatalog)[number]) => provider.number >= 129
                    ? <span>Được công bố trong đợt Thông báo 759/TB-CT ngày {'sourceDate' in provider && typeof provider.sourceDate === 'string' ? provider.sourceDate : ''}</span>
                    : <span>Danh sách tham khảo ngày 14/05/2026; chưa xác minh theo quy định mới</span>,
                },
                {
                  title: 'Website', dataIndex: 'website', key: 'website',
                  render: (website: string) => <a href={website} target="_blank" rel="noreferrer">Mở trang nhà cung cấp</a>,
                },
                {
                  title: 'Tài liệu API và môi trường thử nghiệm', key: 'integration',
                  render: (_: unknown, provider: (typeof providerCatalog)[number]) => {
                    const integration = providerIntegrationCatalog[provider.taxId as keyof typeof providerIntegrationCatalog];
                    return integration ? <div style={{ display: 'grid', gap: 4 }}>
                      <a href={integration.evidenceUrl} target="_blank" rel="noreferrer">{integration.evidenceLabel}</a>
                      {integration.apiDocsUrl && <a href={integration.apiDocsUrl} target="_blank" rel="noreferrer">Tài liệu API kỹ thuật</a>}
                      {integration.sandboxUrl && <a href={integration.sandboxUrl} target="_blank" rel="noreferrer">Môi trường thử nghiệm</a>}
                      <span>{integration.note}</span>
                    </div> : <span>Chưa có tài liệu tích hợp được xác minh trong ERP.</span>;
                  },
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: CREATE (Lập hóa đơn điện tử mới trực tiếp) */}
      {isCreate && (
        <Card title="Lập bản nháp hóa đơn điện tử" style={{ borderRadius: 8, border: '1px solid #E2E8F0', maxWidth: 840 }}>
          <Form form={createForm} layout="vertical" onFinish={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Form.Item name="invoiceNumber" label="Mã bản nháp nội bộ" initialValue={`DRAFT-${crypto.randomUUID()}`} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="symbol" label="Ký hiệu / mẫu số đã đăng ký">
                <Input placeholder="Chỉ điền sau khi có mẫu đã đăng ký" />
              </Form.Item>
            </div>
            {renderBuyerCustomerField(createForm)}
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 14 }}>
              <Form.Item name="buyerType" label="Loại khách hàng" initialValue="organization" rules={[{ required: true }]}>
                <Select options={[{ value: 'organization', label: 'Doanh nghiệp' }, { value: 'person', label: 'Cá nhân' }, { value: 'other', label: 'Khác' }]} />
              </Form.Item>
              <Form.Item name="buyerName" label="Tên người mua" rules={[{ required: true, message: 'Nhập tên người mua' }]}>
                <Input placeholder="Tên người mua theo thông tin hóa đơn" />
              </Form.Item>
            </div>
            <Form.Item name="buyerEntityName" label="Tên đơn vị">
              <Input placeholder="Tên doanh nghiệp nếu có" />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Form.Item name="buyerTaxCode" label="Mã số thuế hoặc mã định danh">
                <Input />
              </Form.Item>
              <Form.Item name="buyerPhone" label="Số điện thoại">
                <Input />
              </Form.Item>
            </div>
            <Form.Item name="buyerAddress" label="Địa chỉ người mua">
              <Input />
            </Form.Item>
            <Form.Item name="buyerEmail" label="Email nhận hóa đơn">
              <Input type="email" />
            </Form.Item>
            <EInvoiceItemsEditor lines={invoiceLines} products={products} onChange={updateInvoiceLine}
              onAdd={() => setInvoiceLines(current => [...current, blankInvoiceLine()])}
              onRemove={key => setInvoiceLines(current => current.filter(line => line.key !== key))} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <Button onClick={() => { createForm.resetFields(); setInvoiceLines([blankInvoiceLine()]); }}>Làm mới form</Button>
              <Button onClick={() => void validateDraft(createForm)}>Kiểm tra hợp lệ</Button>
              <Button type="primary" htmlType="submit" icon={<SafetyCertificateOutlined />} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Lưu bản nháp
              </Button>
            </div>
          </Form>
        </Card>
      )}

      {/* VIEW: DRAFTS (Hóa đơn nháp chờ ký) */}
      {isDrafts && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh Sách Hóa Đơn Nháp Chờ Ký Số &amp; Truyền Nhận CQT</h3>
            <Button type="primary" icon={<SafetyCertificateOutlined />} disabled title="Chưa kết nối nhà cung cấp hóa đơn điện tử" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Ký số hàng loạt
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={data.filter((d) => d.status === 'Hóa đơn nháp')}
              columns={[
                { title: 'Số dự kiến', dataIndex: 'invoiceNumber', key: 'invoiceNumber', render: (n: string) => <strong>{n}</strong> },
                { title: 'Ký hiệu', key: 'sym', render: (_: any, r: any) => `${r.templateCode} - ${r.symbol}` },
                { title: 'Người mua & MST', key: 'buyer', render: (_: any, r: any) => <div><strong>{r.buyerName}</strong><div style={{ fontSize: 11.5, color: '#64748B' }}>MST: {r.buyerTaxCode}</div></div> },
                { title: 'Tổng thanh toán', dataIndex: 'finalAmount', key: 'finalAmount', render: (v: number) => <strong style={{ color: '#009688' }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Ngày lập', dataIndex: 'issueDate', key: 'issueDate' },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color="warning">{s}</Tag> },
                {
                  title: 'Thao tác',
                  key: 'act',
                  render: (_: any, r: any) => (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button icon={<EditOutlined />} onClick={() => openDraftEditor(r)}>Sửa nháp</Button>
                      <Button icon={<CopyOutlined />} onClick={() => copyDraft(r)}>Sao chép nháp</Button>
                      <Button size="small" type="primary" disabled title="Chưa kết nối nhà cung cấp hóa đơn điện tử" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                        Chưa kết nối
                      </Button>
                      <Button size="small" danger icon={<DeleteOutlined />} title="Xóa bản nháp" onClick={() => void deleteDraft(r)} />
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: TEMPLATES (Mẫu hóa đơn điện tử) */}
      {isTemplates && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Hồ sơ mẫu hóa đơn</h3>
            {user?.role === 'ADMIN' && <Button type="primary" icon={<PlusOutlined />} onClick={() => openTemplateForm()} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Thêm hồ sơ mẫu nội bộ</Button>}
          </div>
          <Alert message="Hồ sơ nội bộ, chưa xác minh" description="Thông tin lưu tại đây chỉ để theo dõi nội bộ. Chưa được nhà cung cấp hoặc cơ quan thuế xác nhận và không dùng để phát hành hóa đơn." type="warning" showIcon />
          <div className="transparent-table-card">
            <KTable dataSource={templates} rowKey="key" columns={[
              { title: 'Tên hồ sơ', dataIndex: 'templateName', key: 'templateName' },
              { title: 'Nhà cung cấp', dataIndex: 'providerName', key: 'providerName', render: (_: string, row: EInvoiceTemplate) => <div>{row.providerName}<div style={{ color: '#64748B', fontSize: 12 }}>MST: {row.providerTaxId}</div></div> },
              { title: 'Loại và phiên bản', key: 'type', render: (_: any, row: EInvoiceTemplate) => `${row.templateType} · ${row.version}` },
              { title: 'Mẫu số / Ký hiệu', key: 'code', render: (_: any, row: EInvoiceTemplate) => `${row.templateCode} / ${row.symbol}` },
              { title: 'Thời hạn ghi nhận', key: 'dates', render: (_: any, row: EInvoiceTemplate) => `${row.effectiveFrom || 'Chưa ghi nhận'} – ${row.effectiveTo || 'Chưa ghi nhận'}` },
              { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: () => <Tag color="warning">Nháp nội bộ · chưa xác minh</Tag> },
              { title: 'Thao tác', key: 'actions', render: (_: any, row: EInvoiceTemplate) => <div style={{ display: 'flex', gap: 6 }}><Button icon={<EyeOutlined />} onClick={() => setPreviewTemplate(row)}>Xem</Button>{user?.role === 'ADMIN' && <><Button icon={<EditOutlined />} onClick={() => openTemplateForm(row)}>Sửa</Button><Button danger icon={<DeleteOutlined />} onClick={() => void deleteTemplate(row)} /></>}</div> },
            ]} pagination={{ pageSize: 10 }} />
          </div>
        </div>
      )}

      {/* VIEW: LOOKUP (Tra cứu hóa đơn CQT) */}
      {isLookup && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 840 }}>
          <Card title="Cổng Tra Cứu Hóa Đơn Điện Tử Trực Tuyến" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <Input placeholder="Nhập mã số bí mật / Số hóa đơn / Mã CQT..." style={{ flex: 1 }} />
              <Button type="primary" icon={<SearchOutlined />} disabled title="Chưa kết nối dịch vụ tra cứu của cơ quan thuế" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Chưa kết nối tra cứu
              </Button>
            </div>
            <Alert message="Chưa có kết nối tra cứu của cơ quan thuế" description="Hóa đơn chỉ được xác nhận khi có phản hồi thực tế từ cơ quan thuế hoặc nhà cung cấp đã tích hợp." type="warning" showIcon />
          </Card>
        </div>
      )}

      {/* VIEW: REPORTS (Báo cáo tình hình sử dụng hóa đơn BC26/AC) */}
      {isReports && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16 }}>Báo cáo hóa đơn nội bộ</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Select value={reportPeriod} onChange={setReportPeriod} style={{ minWidth: 180 }} options={[{ value: 'all', label: 'Tất cả các kỳ' }, ...reportPeriods.map(period => ({ value: period, label: period }))]} />
              <Select aria-label="Lọc trạng thái nội bộ" value={reportStatus} onChange={setReportStatus} style={{ minWidth: 180 }} options={[{ value: 'all', label: 'Mọi trạng thái nội bộ' }, ...reportStatuses.map(status => ({ value: status, label: status }))]} />
              <Select aria-label="Lọc trạng thái bên ngoài" value={reportExternalStatus} onChange={setReportExternalStatus} style={{ minWidth: 190 }} options={[{ value: 'all', label: 'Mọi trạng thái bên ngoài' }, ...reportExternalStatuses.map(status => ({ value: status, label: status }))]} />
              <Input aria-label="Lọc theo người mua" placeholder="Tìm người mua hoặc mã số thuế" value={reportBuyerSearch} onChange={event => setReportBuyerSearch(event.target.value)} allowClear style={{ width: 240 }} />
              <Button icon={<DownloadOutlined />} disabled={!invoiceReportData.length} onClick={exportInvoiceReport}>
                Xuất Excel nội bộ
            </Button>
            </div>
          </div>
          <Alert message="Báo cáo từ bản ghi hóa đơn nội bộ" description="Bảng và tệp xuất phản ánh dữ liệu đã lưu trong ERP, gồm cả bản nháp. Đây không phải báo cáo theo mẫu CQT và không xác nhận hóa đơn đã phát hành." type="warning" showIcon />
          <div style={{ color: '#64748B', fontSize: 13 }}>{invoiceReportData.length} bản ghi · Tổng thanh toán bản nháp {invoiceReportData.reduce((sum, invoice) => sum + Number(invoice.finalAmount || 0), 0).toLocaleString('vi-VN')} ₫ · Thuế GTGT ghi trên bản nháp {invoiceReportData.reduce((sum, invoice) => sum + Number(invoice.vatAmount || 0), 0).toLocaleString('vi-VN')} ₫</div>
          <div className="transparent-table-card">
            <KTable
              dataSource={invoiceReportData}
              columns={[
                { title: 'Kỳ theo ngày lập', dataIndex: 'issueDate', key: 'period', render: (date: string) => date?.slice(0, 7) || 'Chưa xác định' },
                { title: 'Mã bản ghi', dataIndex: 'invoiceNumber', key: 'invoiceNumber' },
                { title: 'Người mua', dataIndex: 'buyerName', key: 'buyerName', render: (name: string, invoice: EInvoice) => <div>{name}<div style={{ color: '#64748B', fontSize: 12 }}>MST: {invoice.buyerTaxCode || 'Chưa khai báo'}</div></div> },
                { title: 'Mẫu số / Ký hiệu', key: 'template', render: (_: unknown, invoice: EInvoice) => `${invoice.templateCode} / ${invoice.symbol}` },
                { title: 'Ngày lập', dataIndex: 'issueDate', key: 'issueDate' },
                { title: 'Tiền hàng bản nháp', dataIndex: 'totalAmount', key: 'totalAmount', render: (amount: number) => `${Number(amount || 0).toLocaleString('vi-VN')} ₫` },
                { title: 'Thuế GTGT bản nháp', dataIndex: 'vatAmount', key: 'vatAmount', render: (amount: number) => `${Number(amount || 0).toLocaleString('vi-VN')} ₫` },
                { title: 'Tổng bản nháp', dataIndex: 'finalAmount', key: 'finalAmount', render: (amount: number) => `${Number(amount || 0).toLocaleString('vi-VN')} ₫` },
                { title: 'Trạng thái nội bộ', dataIndex: 'status', key: 'status', render: (status: string) => <Tag color="warning">{status}</Tag> },
                { title: 'Trạng thái bên ngoài', dataIndex: 'externalStatus', key: 'externalStatus', render: (status: string) => status || 'Chưa xác minh' },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* VIEW: DEFAULT (Danh sách hóa đơn đã phát hành) */}
      {!isCreate && !isDrafts && !isTemplates && !isLookup && !isReports && !isProviders && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo số HĐ, tên người mua, MST..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 340, borderRadius: 6 }}
              allowClear
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<DownloadOutlined />} onClick={exportInvoiceList} disabled={!filteredData.length}>
                Xuất bảng kê nội bộ
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields();
                  setEditingRecord(null);
                  setModalOpen(true);
                }}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Lập hóa đơn mới
              </Button>
            </div>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={filteredData}
              columns={[
                {
                  title: 'Số Hóa đơn',
                  dataIndex: 'invoiceNumber',
                  key: 'invoiceNumber',
                  render: (num: string) => (
                    <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileDoneOutlined /> {num}
                    </span>
                  ),
                },
                {
                  title: 'Ký hiệu / Mẫu',
                  key: 'sym',
                  render: (_: any, r: EInvoice) => <span style={{ fontSize: 12, color: '#64748B' }}>{r.templateCode} - {r.symbol}</span>,
                },
                {
                  title: 'Khách hàng mua & MST',
                  key: 'buyer',
                  render: (_: any, r: EInvoice) => (
                    <div>
                      <div style={{ fontWeight: 600, color: '#1E293B' }}>{r.buyerName}</div>
                      <div style={{ fontSize: 11.5, color: '#64748B' }}>MST: {r.buyerTaxCode}</div>
                    </div>
                  ),
                },
                {
                  title: 'Tổng thanh toán (VNĐ)',
                  dataIndex: 'finalAmount',
                  key: 'finalAmount',
                  render: (val: number) => <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{val.toLocaleString('vi-VN')} ₫</strong>,
                },
                {
                  title: 'Ngày lập',
                  dataIndex: 'issueDate',
                  key: 'issueDate',
                  render: (d: string) => <span style={{ fontSize: 12, color: '#64748B' }}>{d}</span>,
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string, record: EInvoice) => <Tag color={record.externalStatus === 'CQT đã cấp mã' ? 'success' : 'warning'}>{record.externalStatus === 'CQT đã cấp mã' ? 'CQT đã xác nhận' : status.includes('phát hành') ? 'Dữ liệu cũ · chưa xác minh' : status}</Tag>,
                },
                {
                  title: 'Thao tác',
                  key: 'actions',
                  render: (_: unknown, record: EInvoice) => (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {record.status === 'Hóa đơn nháp' && <Button icon={<EditOutlined />} onClick={() => openDraftEditor(record)}>Sửa nháp</Button>}
                      {record.status === 'Hóa đơn nháp' && <Button icon={<CopyOutlined />} onClick={() => copyDraft(record)}>Sao chép nháp</Button>}
                      <Button size="small" icon={<EyeOutlined />} onClick={() => setPreviewRecord(record)}>Xem</Button>
                      <Button size="small" icon={<FilePdfOutlined />} onClick={() => exportInvoicePdf(record)}>Bản PDF nội bộ</Button>
                    </div>
                  ),
                },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* Modal Add Invoice */}
      <Modal
        title={editingRecord ? `Sửa bản nháp ${editingRecord.invoiceNumber}` : 'Lập hóa đơn điện tử mới'}
        open={modalOpen}
        onCancel={closeDraftEditor}
        footer={null}
        width={960}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item name="invoiceNumber" label="Mã bản nháp nội bộ" initialValue={`DRAFT-${String(data.length + 1).padStart(5, '0')}`} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          {renderBuyerCustomerField(form)}
          <Form.Item name="buyerType" label="Loại khách hàng" initialValue="organization" rules={[{ required: true }]}>
            <Select options={[{ value: 'organization', label: 'Doanh nghiệp' }, { value: 'person', label: 'Cá nhân' }, { value: 'other', label: 'Khác' }]} />
          </Form.Item>
          <Form.Item name="buyerName" label="Tên người mua / Doanh nghiệp" rules={[{ required: true, message: 'Nhập tên khách hàng' }]}>
            <Input placeholder="Ví dụ: Công Ty TNHH Dịch Vụ Mạng" />
          </Form.Item>
          <Form.Item name="buyerEntityName" label="Tên đơn vị">
            <Input />
          </Form.Item>
          <Form.Item name="buyerTaxCode" label="Mã số thuế hoặc mã định danh">
            <Input />
          </Form.Item>
          <Form.Item name="buyerAddress" label="Địa chỉ người mua"><Input /></Form.Item>
          <Form.Item name="buyerEmail" label="Email nhận hóa đơn"><Input type="email" /></Form.Item>
          <Form.Item name="buyerPhone" label="Số điện thoại"><Input /></Form.Item>
          <EInvoiceItemsEditor lines={invoiceLines} products={products} onChange={updateInvoiceLine}
            onAdd={() => setInvoiceLines(current => [...current, blankInvoiceLine()])}
            onRemove={key => setInvoiceLines(current => current.filter(line => line.key !== key))} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={closeDraftEditor}>Hủy</Button>
            <Button onClick={() => void validateDraft(form, editingRecord)}>Kiểm tra hợp lệ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingRecord ? 'Lưu thay đổi' : 'Lưu bản nháp'}
            </Button>
          </div>
        </Form>
      </Modal>
      <Modal title={`Xem bản ghi hóa đơn ${previewRecord?.invoiceNumber || ''}`} open={Boolean(previewRecord)} onCancel={() => setPreviewRecord(null)} footer={null} width={520}>
        {previewRecord && <div style={{ display: 'grid', gap: 8 }}>
          <div><span style={{ color: '#64748B' }}>Trạng thái:</span> {previewRecord.externalStatus || 'Chưa xác minh với CQT'}</div>
          <div><span style={{ color: '#64748B' }}>Người mua:</span> {previewRecord.buyerName}</div>
          <div><span style={{ color: '#64748B' }}>Loại khách hàng:</span> {previewRecord.buyerType === 'organization' ? 'Doanh nghiệp' : previewRecord.buyerType === 'person' ? 'Cá nhân' : 'Khác'}</div>
          <div><span style={{ color: '#64748B' }}>Tên đơn vị:</span> {previewRecord.buyerEntityName || 'Chưa khai báo'}</div>
          <div><span style={{ color: '#64748B' }}>Mã số thuế hoặc mã định danh:</span> {previewRecord.buyerTaxCode || 'Chưa khai báo'}</div>
          <div><span style={{ color: '#64748B' }}>Địa chỉ:</span> {previewRecord.buyerAddress || 'Chưa khai báo'}</div>
          <div><span style={{ color: '#64748B' }}>Email:</span> {previewRecord.buyerEmail || 'Chưa khai báo'}</div>
          <div><span style={{ color: '#64748B' }}>Điện thoại:</span> {previewRecord.buyerPhone || 'Chưa khai báo'}</div>
          <div><span style={{ color: '#64748B' }}>Ngày lập nháp:</span> {previewRecord.issueDate}</div>
          <div><span style={{ color: '#64748B' }}>Tiền trước thuế:</span> {Number(previewRecord.totalAmount).toLocaleString('vi-VN')} ₫</div>
          <div><span style={{ color: '#64748B' }}>Thuế GTGT:</span> {Number(previewRecord.vatAmount).toLocaleString('vi-VN')} ₫</div>
          <div><span style={{ color: '#64748B' }}>Tổng thanh toán:</span> {Number(previewRecord.finalAmount).toLocaleString('vi-VN')} ₫</div>
        </div>}
      </Modal>
      <Modal title="Tạo nhanh khách hàng" open={quickCustomerOpen} onCancel={() => { setQuickCustomerOpen(false); setQuickCustomerTargetForm(null); }} footer={null} width={680}>
        <Form form={quickCustomerForm} layout="vertical" onFinish={createQuickCustomer} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="entityKind" label="Loại khách hàng" initialValue="organization" rules={[{ required: true }]}>
              <Select options={[{ value: 'organization', label: 'Doanh nghiệp' }, { value: 'person', label: 'Cá nhân' }]} />
            </Form.Item>
            <Form.Item name="name" label="Tên hồ sơ khách hàng" rules={[{ required: true, whitespace: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="personalName" label="Họ và tên người mua">
              <Input />
            </Form.Item>
            <Form.Item name="taxCode" label="Mã số thuế hoặc mã định danh">
              <Input />
            </Form.Item>
            <Form.Item name="contactPerson" label="Người liên hệ">
              <Input />
            </Form.Item>
            <Form.Item name="phone" label="Số điện thoại">
              <Input />
            </Form.Item>
            <Form.Item name="email" label="Email liên hệ" rules={[{ type: 'email', message: 'Email không đúng định dạng.' }]}>
              <Input type="email" />
            </Form.Item>
            <Form.Item name="invoiceRecipientPhone" label="Điện thoại nhận hóa đơn">
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="address" label="Địa chỉ">
            <Input />
          </Form.Item>
          <Form.Item name="invoiceRecipientEmails" label="Email nhận hóa đơn">
            <Input placeholder="Có thể nhập nhiều email, phân cách bằng dấu ;" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={() => { setQuickCustomerOpen(false); setQuickCustomerTargetForm(null); }}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={quickCustomerSaving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu khách hàng</Button>
          </div>
        </Form>
      </Modal>
      <Modal title={editingTemplate ? 'Sửa hồ sơ mẫu nội bộ' : 'Thêm hồ sơ mẫu nội bộ'} open={templateModalOpen} onCancel={() => { setTemplateModalOpen(false); setEditingTemplate(null); templateForm.resetFields(); }} footer={null} width={780}>
        <Alert message="Hồ sơ chỉ để theo dõi nội bộ; chưa được nhà cung cấp hoặc cơ quan thuế xác minh." type="warning" showIcon />
        <Form form={templateForm} layout="vertical" onFinish={saveTemplate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', columnGap: 14, rowGap: 3 }}>
            <Form.Item name="templateName" label="Tên hồ sơ mẫu" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            <Form.Item name="providerTaxId" label="Nhà cung cấp hóa đơn điện tử" rules={[{ required: true, message: 'Chọn nhà cung cấp.' }]}>
              <Select showSearch placeholder="Tìm theo tên hoặc mã số thuế" options={[...new Map(providerCatalog.map(provider => [provider.taxId, provider])).values()].map(provider => ({ value: provider.taxId, label: `${provider.name} · ${provider.taxId}` }))} />
            </Form.Item>
            <Form.Item name="templateType" label="Loại mẫu" rules={[{ required: true, whitespace: true }]}><Input placeholder="Ghi theo thông tin nhà cung cấp" /></Form.Item>
            <Form.Item name="version" label="Phiên bản" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            <Form.Item name="templateCode" label="Mẫu số" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            <Form.Item name="symbol" label="Ký hiệu" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
            <Form.Item name="effectiveFrom" label="Ngày áp dụng từ"><DatePicker allowClear placeholder="Chọn ngày" style={{ width: '100%' }} /></Form.Item>
            <Form.Item name="effectiveTo" label="Ngày áp dụng đến"><DatePicker allowClear placeholder="Chọn ngày" style={{ width: '100%' }} /></Form.Item>
          </div>
          <Form.Item name="internalNote" label="Ghi chú nội bộ"><Input.TextArea rows={3} maxLength={1000} /></Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}><Button onClick={() => { setTemplateModalOpen(false); setEditingTemplate(null); templateForm.resetFields(); }}>Hủy</Button><Button type="primary" htmlType="submit" loading={templateSaving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu hồ sơ</Button></div>
        </Form>
      </Modal>
      <Modal title="Chi tiết hồ sơ mẫu nội bộ" open={Boolean(previewTemplate)} onCancel={() => setPreviewTemplate(null)} footer={null} width={600}>
        {previewTemplate && <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
          <div><span style={{ color: '#64748B' }}>Tên hồ sơ:</span> {previewTemplate.templateName}</div>
          <div><span style={{ color: '#64748B' }}>Nhà cung cấp:</span> {previewTemplate.providerName} · MST {previewTemplate.providerTaxId}</div>
          <div><span style={{ color: '#64748B' }}>Loại mẫu:</span> {previewTemplate.templateType}</div>
          <div><span style={{ color: '#64748B' }}>Mẫu số, ký hiệu, phiên bản:</span> {previewTemplate.templateCode} · {previewTemplate.symbol} · {previewTemplate.version}</div>
          <div><span style={{ color: '#64748B' }}>Thời hạn ghi nhận:</span> {previewTemplate.effectiveFrom || 'Chưa ghi nhận'} – {previewTemplate.effectiveTo || 'Chưa ghi nhận'}</div>
          <div><span style={{ color: '#64748B' }}>Ghi chú:</span> {previewTemplate.internalNote || 'Không có'}</div>
          <Tag color="warning">Nháp nội bộ · chưa xác minh</Tag>
          <div style={{ color: '#64748B' }}>Không dùng hồ sơ này để phát hành hóa đơn.</div>
        </div>}
      </Modal>
    </div>
  );
};
