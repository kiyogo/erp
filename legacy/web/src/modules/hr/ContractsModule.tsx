import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  FileProtectOutlined,
  DeleteOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  ClockCircleOutlined,
  UploadOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  BankOutlined,
  EditOutlined,
  ShopOutlined,
  SafetyCertificateOutlined,
  DollarOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Radio, Upload, Checkbox } from '../../custom-ui';
import { ContractTemplate, dataService } from '../../services/dataService';
import { contractsApi, filesApi } from '../../api/endpoints';
import { downloadFile } from '../../utils/fileExporter';

export interface EnterpriseContractItem {
  key: string;
  id?: string;
  fileNodeId?: string | null;
  code: string;
  name: string;
  contractCategory?: 'partner' | 'service' | 'nda' | 'consultant' | 'equity' | 'labor' | 'custom' | string;
  contractTemplate: string;
  partyBType?: 'organization' | 'individual' | 'employee';
  partyBName?: string;
  partyBTaxCode?: string;
  partyBRepresentative?: string;
  partyBPosition?: string;
  partyBIdNumber?: string;
  partyBPhone?: string;
  partyBEmail?: string;
  partyBBank?: string;
  partyBAddress?: string;

  employeeCode: string;
  employeeName: string;
  employeeIdNumber?: string;
  employeePhone?: string;
  employeeEmail?: string;
  employeeBank?: string;

  type: string;
  position: string;
  department: string;
  jobLevel?: string;
  workLocation?: string;
  startDate: string;
  endDate: string;
  probationMonths?: number;
  contractValue?: number;
  salary: number;
  allowance?: number;
  stockSharesPercent?: string;
  paymentMethod?: string;
  paymentDay?: number;
  workingHours?: string;
  annualLeaveDays?: number;
  insuranceType?: string;
  ndaClause?: boolean;
  nonCompeteClause?: boolean;
  status: 'Dự thảo' | 'Chờ ký' | 'Chờ duyệt' | 'Còn hiệu lực' | 'Đã hết hạn';
  
  employeeSignStatus?: 'Chưa ký' | 'Đã ký';
  employeeSignDate?: string;
  employeeSignMethod?: 'digital' | 'upload';
  employeeCertName?: string;
  employeeSignedFileName?: string;
  employeeSignedFileData?: string;
  
  companySignStatus?: 'Chưa ký' | 'Đã ký';
  companySignDate?: string;
  companySignMethod?: 'digital' | 'upload';
  companyCertName?: string;
  companySignedFileName?: string;
  companySignedFileData?: string;
  attachedFileNames?: string[];

  signerName?: string;
  signerPosition?: string;
  note?: string;
  customFieldValues?: Record<string, string | number>;
}

const BANK_OPTIONS = [
  { value: 'Ngân hàng TMCP Ngoại Thương VN (Vietcombank)', label: 'Vietcombank - Ngân hàng Ngoại Thương VN' },
  { value: 'Ngân hàng TMCP Quân Đội (MB Bank)', label: 'MB Bank - Ngân hàng Quân Đội' },
  { value: 'Ngân hàng TMCP Kỹ Thương VN (Techcombank)', label: 'Techcombank - Ngân hàng Kỹ Thương VN' },
  { value: 'Ngân hàng TMCP Đầu Tư và Phát Triển VN (BIDV)', label: 'BIDV - Ngân hàng Đầu Tư & Phát Triển VN' },
  { value: 'Ngân hàng Nông nghiệp & Phát triển Nông thôn (Agribank)', label: 'Agribank - Ngân hàng NN&PTNT VN' },
  { value: 'Ngân hàng TMCP Á Châu (ACB)', label: 'ACB - Ngân hàng TMCP Á Châu' },
  { value: 'Ngân hàng TMCP Việt Nam Thịnh Vượng (VPBank)', label: 'VPBank - Ngân hàng Việt Nam Thịnh Vượng' },
  { value: 'Ngân hàng TMCP Tiên Phong (TPBank)', label: 'TPBank - Ngân hàng Tiên Phong' },
  { value: 'Ngân hàng TMCP Sài Gòn Thương Tín (Sacombank)', label: 'Sacombank - Sài Gòn Thương Tín' },
  { value: 'Ngân hàng Quốc tế (VIB)', label: 'VIB - Ngân hàng Quốc tế' },
  { value: 'Ngân hàng TMCP Phát triển TP.HCM (HDBank)', label: 'HDBank - Ngân hàng Phát triển TP.HCM' },
  { value: 'Ngân hàng TMCP Phương Đông (OCB)', label: 'OCB - Ngân hàng Phương Đông' },
  { value: 'Ngân hàng TNHH MTV Shinhan Việt Nam', label: 'Shinhan Bank Việt Nam' },
];

const COMPANY_SIGNATURE_OPTIONS = [
  {
    value: 'CÔNG TY CỔ PHẦN KIYOVN Serial 54:02:FA:19:9C:20:26 Ban Cơ yếu Chính phủ',
    label: 'CÔNG TY CP KIYOVN Ban Cơ yếu Chính phủ',
  },
  {
    value: 'Trần Tuấn Anh - Tổng Giám Đốc Token USB CA-2026',
    label: 'Trần Tuấn Anh - Tổng Giám Đốc USB Token',
  },
  {
    value: 'KIYOVN Enterprise Root CA v3 Khóa bảo mật HSM Cloud',
    label: 'KIYOVN Enterprise Root CA v3 HSM Cloud',
  },
];

interface ContractsModuleProps {
  scope?: 'hr' | 'documents';
}

const normalizeContractText = (value?: string) =>
  (value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd');

const isLaborContract = (contract: EnterpriseContractItem) => {
  const text = normalizeContractText([
    contract.contractCategory,
    contract.partyBType,
    contract.contractTemplate,
    contract.name,
    contract.type,
  ].filter(Boolean).join(' '));

  return (
    contract.contractCategory === 'labor' ||
    contract.partyBType === 'employee' ||
    text.includes('lao dong') ||
    text.includes('thu viec') ||
    text.includes('nhan su')
  );
};

export const ContractsModule: React.FC<ContractsModuleProps> = ({ scope = 'documents' }) => {
  const navigate = useNavigate();
  const laborOnly = scope === 'hr';
  const [contracts, setContracts] = useState<EnterpriseContractItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modal Create / Edit Contract
  const [modalOpen, setModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<EnterpriseContractItem | null>(null);
  const [form] = Form.useForm();

  // Template View Dialog
  const [templateViewerOpen, setTemplateViewerOpen] = useState(false);
  const [activePreviewTemplate, setActivePreviewTemplate] = useState('Hợp đồng lao động tính theo cổ phần');
  const [contractTemplates, setContractTemplates] = useState<ContractTemplate[]>([]);

  // Employee Selection Dialog (admin/hr/history/bank)
  const [employeeSelectOpen, setEmployeeSelectOpen] = useState(false);
  const [empSearch, setEmpSearch] = useState('');

  // View Contract Detail Drawer / Modal
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<EnterpriseContractItem | null>(null);

  // Bank Accounts Management State & Modal
  const [bankAccounts, setBankAccounts] = useState<any[]>(() => {
    try {
      return dataService.getEmployeeBankAccounts() || [];
    } catch {
      return [];
    }
  });
  const [isAddBankModalOpen, setIsAddBankModalOpen] = useState(false);
  const [bankForm, setBankForm] = useState({
    employeeCode: `NV-${String(Date.now()).slice(-5)}`,
    employeeName: '',
    bankName: 'Ngân hàng TMCP Ngoại Thương VN (Vietcombank)',
    accountNumber: '',
    accountHolder: '',
    branch: '',
    status: 'Đã duyệt',
    isPrimary: true,
    note: '',
  });

  // Form State
  const [contractSourceType, setContractSourceType] = useState<'template' | 'upload'>('template');
  const [selectedTemplateName, setSelectedTemplateName] = useState('');
  const [uploadedTemplateFiles, setUploadedTemplateFiles] = useState<string[]>([]);
  const [partyBType, setPartyBType] = useState<'organization' | 'individual' | 'employee'>('organization');

  // Company Signature in Edit Modal
  const [companySignMethod, setCompanySignMethod] = useState<'digital' | 'upload'>('digital');
  const [selectedCompanyCert, setSelectedCompanyCert] = useState(COMPANY_SIGNATURE_OPTIONS[0].value);
  const [uploadedCompanyFile, setUploadedCompanyFile] = useState<string | null>(null);
  const [orgUnitOptions, setOrgUnitOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [positionOptions, setPositionOptions] = useState<Array<{ label: string; value: string }>>([]);

  const loadData = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [response, units, posOpts] = await Promise.all([
        contractsApi.getAll(),
        dataService.fetchOrgUnitsList(),
        dataService.fetchDropdownOptions('positions'),
      ]);
      setOrgUnitOptions(units.map((u) => ({ label: u, value: u })));
      setPositionOptions(posOpts.filter((p) => p.isActive !== false).map((p) => ({ label: p.name, value: p.name })));
      if (response.data?.data && Array.isArray(response.data.data)) {
        setContracts(response.data.data as any[]);
      } else {
        throw new Error('Danh sách hợp đồng trả về không hợp lệ.');
      }
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải danh sách hợp đồng.');
    } finally {
      setLoading(false);
    }
    setContractTemplates(dataService.getContractTemplates());
    try {
      setBankAccounts(dataService.getEmployeeBankAccounts() || []);
    } catch {}
  };

  useEffect(() => {
    let active = true;
    void loadData(true);
    const unsub = dataService.subscribe(() => {
      if (active) {
        void loadData(false);
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, []);

  const employees = dataService.getEmployees();
  const selectedTemplate = contractTemplates.find((item) => item.name === selectedTemplateName);
  const activePreviewTemplateData = contractTemplates.find((item) => item.name === activePreviewTemplate);
  const visibleContractField = (fieldKey: string) => {
    if (contractSourceType === 'template') {
      return !!selectedTemplate && selectedTemplate.fieldKeys.includes(fieldKey);
    }
    const cat = laborOnly ? 'labor' : form.getFieldValue('contractCategory') || 'partner';
    const pType = laborOnly ? 'employee' : partyBType || form.getFieldValue('partyBType') || 'organization';

    if (['salary', 'allowance', 'stockSharesPercent'].includes(fieldKey)) {
      return cat === 'equity' || cat === 'labor' || pType === 'employee';
    }
    if (['department', 'position'].includes(fieldKey)) {
      return pType === 'employee' || cat === 'labor' || cat === 'equity';
    }
    return true;
  };
  const visibleCustomFields = contractSourceType === 'template' && selectedTemplate ? selectedTemplate.customFields || [] : [];

  const getPreferredTemplate = () => {
    if (laborOnly) {
      return (
        contractTemplates.find((item) => item.isActive && (item.category === 'labor' || item.partyType === 'employee')) ||
        contractTemplates.find((item) => item.isActive && normalizeContractText(item.name).includes('lao dong')) ||
        contractTemplates.find((item) => item.name === 'Hợp đồng lao động tính theo cổ phần')
      );
    }

    return (
      contractTemplates.find((item) => item.isActive && item.name === 'Hợp đồng lao động tính theo cổ phần') ||
      contractTemplates.find((item) => item.isActive) ||
      contractTemplates[0]
    );
  };

  const renderTemplateContent = (content: string, values: Record<string, any>) =>
    content.replace(/{{\s*([\w]+)\s*}}/g, (_match, field: string) => {
      const value = values[field];
      if (value === undefined || value === null || value === '') return '................................';
      if (typeof value === 'number' && ['contractValue', 'salary', 'allowance'].includes(field)) return value.toLocaleString('vi-VN');
      return String(value);
    });

  // Statistics
  const scopedContracts = laborOnly ? contracts.filter(isLaborContract) : contracts;
  const totalCount = scopedContracts.length;
  const partnerCount = laborOnly
    ? scopedContracts.length
    : scopedContracts.filter((c) => c.contractCategory === 'partner' || c.partyBType === 'organization').length;
  const activeCount = scopedContracts.filter((c) => c.status === 'Còn hiệu lực').length;
  const awaitingApprovalCount = scopedContracts.filter((c) => c.status === 'Chờ duyệt').length;

  const handleOpenUploadModal = () => {
    setEditingContract(null);
    setContractSourceType('upload');
    setSelectedTemplateName('');
    setActivePreviewTemplate('');
    setUploadedTemplateFiles([]);
    setPartyBType('organization');
    setCompanySignMethod('digital');
    setUploadedCompanyFile(null);

    const newCode = `HDB2B-2026/${String(Date.now()).slice(-3)}`;
    form.resetFields();
    form.setFieldsValue({
      code: newCode,
      name: '',
      contractCategory: 'partner',
      partyBType: 'organization',
      partyBName: '',
      partyBTaxCode: '',
      partyBRepresentative: '',
      partyBPosition: '',
      partyBPhone: '',
      partyBEmail: '',
      partyBBank: undefined,
      partyBAddress: '',
      employeeCode: '',
      employeeName: '',
      partyBIdNumber: '',
      department: '',
      position: '',
      contractValue: undefined,
      salary: undefined,
      allowance: undefined,
      stockSharesPercent: '',
      startDate: new Date().toISOString().split('T')[0],
      endDate: 'Không thời hạn',
      paymentMethod: 'Chuyển khoản ngân hàng',
      workLocation: '',
      status: 'Chờ duyệt',
      signerName: 'Trần Tuấn Anh',
      signerPosition: 'Tổng Giám Đốc',
    });
    setModalOpen(true);
  };

  const handleOpenCreateModal = () => {
    setEditingContract(null);
    setContractSourceType('template');
    setSelectedTemplateName('');
    setActivePreviewTemplate('');
    setUploadedTemplateFiles([]);
    setPartyBType(laborOnly ? 'employee' : 'employee');
    setCompanySignMethod('digital');
    setUploadedCompanyFile(null);

    form.resetFields();
    form.setFieldsValue({
      code: '',
      name: '',
      contractCategory: laborOnly ? 'labor' : undefined,
      contractTemplate: undefined,
      partyBType: laborOnly ? 'employee' : 'employee',
      partyBName: '',
      employeeCode: '',
      employeeName: '',
      type: '',
      department: '',
      position: '',
      contractValue: undefined,
      salary: undefined,
      allowance: undefined,
      stockSharesPercent: '',
      startDate: '',
      endDate: '',
      paymentMethod: undefined,
      paymentDay: 10,
      status: 'Chờ duyệt',
      signerName: 'Trần Tuấn Anh',
      signerPosition: 'Tổng Giám Đốc',
    });
    setModalOpen(true);
  };

  const handleOpenEditModal = (record: EnterpriseContractItem) => {
    setEditingContract(record);
    const isTpl = contractTemplates.some((item) => item.name === record.contractTemplate);
    const uploadedFiles = !isTpl
      ? (record.attachedFileNames && record.attachedFileNames.length > 0 ? record.attachedFileNames : [record.name].filter(Boolean))
      : [];
    setContractSourceType(isTpl ? 'template' : 'upload');
    setSelectedTemplateName(isTpl ? record.contractTemplate : '');
    setActivePreviewTemplate(isTpl ? record.contractTemplate : '');
    setUploadedTemplateFiles(uploadedFiles);
    setPartyBType(record.partyBType || (record.employeeCode?.startsWith('NV') ? 'employee' : 'organization'));
    setCompanySignMethod(record.companySignMethod || 'digital');
    setSelectedCompanyCert(record.companyCertName || COMPANY_SIGNATURE_OPTIONS[0].value);
    setUploadedCompanyFile(record.companySignedFileName || null);

    form.setFieldsValue({
      ...record,
      ...(record.customFieldValues || {}),
      partyBType: record.partyBType || (record.employeeCode?.startsWith('NV') ? 'employee' : 'organization'),
      partyBName: record.partyBName || record.employeeName,
      partyBRepresentative: record.partyBRepresentative || record.employeeName,
      partyBIdNumber: record.partyBIdNumber || record.employeeIdNumber,
      partyBPhone: record.partyBPhone || record.employeePhone,
      partyBEmail: record.partyBEmail || record.employeeEmail,
      partyBBank: record.partyBBank || record.employeeBank,
    });
    setModalOpen(true);
  };

  const handleSelectEmployee = (emp: any) => {
    form.setFieldsValue({
      partyBType: 'employee',
      employeeCode: emp.code,
      employeeName: emp.name,
      partyBName: emp.name,
      partyBRepresentative: emp.name,
      partyBIdNumber: emp.identityNumber || '064210005343',
      partyBPhone: emp.phone || '',
      partyBEmail: emp.email || `${(emp.code || '').toLowerCase()}@kiyovn.com`,
      partyBBank: emp.bankAccount || `${emp.bankName || 'Techcombank'} - 19034567890011`,
      partyBAddress: emp.address || 'Hà Nội, Việt Nam',
      department: emp.department || 'Phòng Kỹ Thuật & Công Nghệ',
      position: emp.position || 'Chuyên viên cao cấp',
    });
    setPartyBType('employee');
    setEmployeeSelectOpen(false);
    message.success(`Đã chọn nhân sự: ${emp.name} (${emp.code})`);
  };

  const handleTemplateChange = (val: string) => {
    setSelectedTemplateName(val);
    setActivePreviewTemplate(val);
    const tpl = contractTemplates.find((item) => item.name === val);
    if (tpl) {
      const nextPartyType = laborOnly ? 'employee' : tpl.partyType;
      setPartyBType(nextPartyType);
      form.setFieldsValue({
        code: `HD-2026/${String(Date.now()).slice(-3)}`,
        name: tpl.name,
        contractTemplate: val,
        contractCategory: laborOnly ? 'labor' : tpl.category,
        type: val,
        partyBType: nextPartyType,
        startDate: new Date().toISOString().split('T')[0],
        endDate: 'Không thời hạn',
        paymentMethod: 'Chuyển khoản ngân hàng',
        status: 'Chờ duyệt',
      });
    }
  };

  const handleOpenAddBankModal = () => {
    const currentEmpCode = form.getFieldValue('employeeCode') || (employees[0]?.code || `NV-${String(Date.now()).slice(-5)}`);
    const currentEmpName = form.getFieldValue('partyBName') || form.getFieldValue('employeeName') || (employees[0]?.name || '');
    const selectedEmp = employees.find((e: any) => e.code === currentEmpCode) || employees[0];
    
    setBankForm({
      employeeCode: selectedEmp ? selectedEmp.code : currentEmpCode,
      employeeName: selectedEmp ? selectedEmp.name : currentEmpName,
      bankName: 'Ngân hàng TMCP Ngoại Thương VN (Vietcombank)',
      accountNumber: '',
      accountHolder: '',
      branch: '',
      status: 'Đã duyệt',
      isPrimary: true,
      note: '',
    });
    setIsAddBankModalOpen(true);
  };

  const handleBankEmployeeSelectChange = (empCode: string) => {
    const selected = employees.find((e: any) => e.code === empCode);
    if (selected) {
      setBankForm((prev) => ({
        ...prev,
        employeeCode: selected.code,
        employeeName: selected.name,
        accountHolder: '',
      }));
    }
  };

  const handleSaveBank = () => {
    if (!bankForm.employeeCode) {
      message.error('Vui lòng chọn nhân sự!');
      return;
    }
    if (!bankForm.bankName?.trim()) {
      message.error('Vui lòng chọn tên ngân hàng!');
      return;
    }
    if (!bankForm.accountNumber?.trim()) {
      message.error('Vui lòng nhập số tài khoản!');
      return;
    }
    if (!bankForm.accountHolder?.trim()) {
      message.error('Vui lòng nhập tên chủ tài khoản!');
      return;
    }

    const newBankItem = {
      id: `ba-${Date.now()}`,
      employeeCode: bankForm.employeeCode,
      employeeName: bankForm.employeeName,
      bankName: bankForm.bankName,
      accountNumber: bankForm.accountNumber.trim(),
      accountHolder: bankForm.accountHolder.trim().toUpperCase(),
      branch: bankForm.branch.trim(),
      status: bankForm.status,
      isPrimary: bankForm.isPrimary,
      accountType: bankForm.isPrimary ? 'Tài khoản nhận lương chính' : 'Tài khoản phụ',
      note: bankForm.note.trim(),
    };

    const updated = dataService.saveEmployeeBankAccount(newBankItem, false);
    setBankAccounts(updated);
    
    // Tự động gán vào form hợp đồng
    const bankNameStr = newBankItem?.bankName || '';
    const shortBank = bankNameStr.includes('(') ? bankNameStr.split('(')[0].trim() : bankNameStr;
    const formattedBankVal = `${shortBank} - ${newBankItem?.accountNumber || ''}`;
    form.setFieldsValue({ partyBBank: formattedBankVal });
    
    message.success('Đã thêm tài khoản ngân hàng thành công!');
    setIsAddBankModalOpen(false);
  };

  const handleSaveContract = () => {
    form.validateFields().then((values) => {
      const isCompanySigning = companySignMethod === 'digital' || !!uploadedCompanyFile;
      
      let updatedCompanySignStatus = editingContract?.companySignStatus || 'Chưa ký';
      let updatedCompanySignDate = editingContract?.companySignDate;
      let updatedCompanyCertName = editingContract?.companyCertName;
      let updatedCompanySignedFileName = editingContract?.companySignedFileName;
      let updatedStatus = values.status;

      if (isCompanySigning) {
        updatedCompanySignStatus = 'Đã ký';
        updatedCompanySignDate = updatedCompanySignDate || new Date().toISOString().replace('T', ' ').substring(0, 19);
        updatedCompanyCertName = companySignMethod === 'digital' ? selectedCompanyCert : 'Tệp chữ ký số doanh nghiệp tải lên';
        updatedCompanySignedFileName = companySignMethod === 'digital'
          ? `${values.code}_Company_Signed.pdf`
          : (uploadedCompanyFile || `${values.code}_Company_Signed.pdf`);
        
        if (editingContract?.employeeSignStatus === 'Đã ký' || values.status === 'Chờ duyệt') {
          updatedStatus = 'Còn hiệu lực';
        }
      }

      const enforcedPartyType = laborOnly ? 'employee' : partyBType;
      const enforcedCategory = laborOnly ? 'labor' : values.contractCategory || 'partner';
      const partyName = values.partyBName || values.employeeName || (laborOnly ? 'Nhân sự' : 'Đối tác');
      const customFieldValues = visibleCustomFields.reduce<Record<string, string | number>>((result, field) => {
        const value = values[field.key];
        if (value !== undefined && value !== null && value !== '') result[field.key] = value;
        return result;
      }, { ...editingContract?.customFieldValues });
      const contractItem: EnterpriseContractItem = {
        key: editingContract ? editingContract.key : `contract-${Date.now()}`,
        code: values.code,
        name: values.name || (contractSourceType === 'template' ? selectedTemplateName : (uploadedTemplateFiles[0] || 'Văn bản hợp đồng')),
        contractCategory: enforcedCategory,
        contractTemplate: contractSourceType === 'template' ? selectedTemplateName : 'Tải lên mới',
        partyBType: enforcedPartyType,
        partyBName: partyName,
        partyBTaxCode: values.partyBTaxCode,
        partyBRepresentative: values.partyBRepresentative || partyName,
        partyBPosition: values.partyBPosition,
        partyBIdNumber: values.partyBIdNumber || values.employeeIdNumber,
        partyBPhone: values.partyBPhone || values.employeePhone,
        partyBEmail: values.partyBEmail || values.employeeEmail,
        partyBBank: values.partyBBank || values.employeeBank,
        partyBAddress: values.partyBAddress,

        employeeCode: values.employeeCode || (enforcedPartyType === 'organization' ? 'DT-B2B' : `NV-${String(Date.now()).slice(-5)}`),
        employeeName: partyName,
        employeeIdNumber: values.partyBIdNumber || values.employeeIdNumber,
        employeePhone: values.partyBPhone || values.employeePhone,
        employeeEmail: values.partyBEmail || values.employeeEmail,
        employeeBank: values.partyBBank || values.employeeBank,

        type: values.type || enforcedCategory || (laborOnly ? 'Hợp đồng lao động' : 'Hợp tác đối tác'),
        position: values.position || values.partyBPosition || (laborOnly ? 'Nhân sự' : 'Đại diện đối tác'),
        department: values.department || (laborOnly ? 'Nhân sự' : 'Khối Phát Triển Kinh Doanh'),
        jobLevel: values.jobLevel,
        workLocation: values.workLocation || 'Toàn quốc',
        startDate: values.startDate,
        endDate: values.endDate,
        contractValue: Number(values.contractValue) || 0,
        salary: Number(values.salary) || 0,
        allowance: Number(values.allowance) || 0,
        stockSharesPercent: values.stockSharesPercent,
        paymentMethod: values.paymentMethod || 'Chuyển khoản ngân hàng',
        paymentDay: Number(values.paymentDay) || 5,
        status: updatedStatus,
        
        employeeSignStatus: editingContract?.employeeSignStatus || 'Chưa ký',
        employeeSignDate: editingContract?.employeeSignDate,
        employeeSignMethod: editingContract?.employeeSignMethod,
        employeeCertName: editingContract?.employeeCertName,
        employeeSignedFileName: editingContract?.employeeSignedFileName,
        
        companySignStatus: updatedCompanySignStatus as any,
        companySignDate: updatedCompanySignDate,
        companySignMethod: companySignMethod,
        companyCertName: updatedCompanyCertName,
        companySignedFileName: updatedCompanySignedFileName,
        attachedFileNames: contractSourceType === 'upload' ? uploadedTemplateFiles : editingContract?.attachedFileNames,

        signerName: values.signerName || '',
        signerPosition: values.signerPosition || '',
        note: values.note,
        customFieldValues,
      };

      void (async () => {
        try {
          if (editingContract?.id || editingContract?.key) {
            const targetId = editingContract.id || editingContract.key;
            const res = await contractsApi.update(targetId, contractItem as any);
            if (res.data?.contract) {
              const saved = res.data.contract as any;
              Object.assign(contractItem, saved, { key: saved.id || contractItem.key });
            }
            message.success(`Đã cập nhật hợp đồng: ${contractItem.code}`);
          } else {
            const res = await contractsApi.create(contractItem as any);
            if (res.data?.contract) {
              const saved = res.data.contract as any;
              Object.assign(contractItem, saved, { key: saved.id || contractItem.key });
            }
            message.success(`Đã tạo thành công hợp đồng mới: ${contractItem.code}`);
          }
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'Không thể lưu hợp đồng. Vui lòng thử lại.');
          return;
        }

        let updatedList: EnterpriseContractItem[] = [];
        if (editingContract) {
          updatedList = contracts.map((c) => (c.key === editingContract.key ? contractItem : c));
        } else {
          updatedList = [contractItem, ...contracts];
        }

        setContracts(updatedList);
        setModalOpen(false);
        void loadData();
      })();
    }).catch((error: any) => {
      if (!error?.errorFields) message.error(error?.message || 'Không thể kiểm tra biểu mẫu hợp đồng.');
    });
  };

  const handleDelete = (contract: EnterpriseContractItem) => {
    Modal.confirm({
      title: 'Xác nhận xóa hợp đồng?',
      content: `Bạn có chắc chắn muốn xóa hợp đồng "${contract.code}" của ${contract.partyBName || contract.employeeName}?`,
      okText: 'Xóa hợp đồng',
      cancelText: 'Hủy',
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await contractsApi.remove(contract.id || contract.key);
          setContracts(current => current.filter(c => (c.id || c.key) !== (contract.id || contract.key)));
          message.success('Đã xóa hợp đồng thành công!');
        } catch (error: any) {
          message.error(error?.response?.data?.message || 'Không thể xóa hợp đồng.');
          throw error;
        }
      },
    });
  };

  const handleDownloadContract = async (contract: EnterpriseContractItem) => {
    try {
      const fileId = contract.fileNodeId || (await contractsApi.getOne(contract.id || contract.key)).data.contract?.fileNodeId;
      if (!fileId) { message.warning('Hợp đồng chưa có bản Word trên máy chủ. Có thể xuất nội dung TXT trong hồ sơ.'); return; }
      const response = await filesApi.download(fileId);
      downloadFile(`${contract.code.replace(/[^a-z0-9_-]/gi, '_')}.docx`, response.data);
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không tải được tệp Word hợp đồng.'); }
  };

  const handleExportContractText = (contract: EnterpriseContractItem) => {
    const tpl = contractTemplates.find((item) => item.name === contract.contractTemplate);
    const content = tpl
      ? renderTemplateContent(tpl.content, { ...contract, ...(contract.customFieldValues || {}) })
      : `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\n\n${contract.name.toUpperCase()}\nSố: ${contract.code}\n\nBÊN A: CÔNG TY CỔ PHẦN KIYOVN\nĐại diện: ${contract.signerName || 'Chưa khai báo'} - Chức vụ: ${contract.signerPosition || 'Chưa khai báo'}\n\nBÊN B: ${contract.partyBName || contract.employeeName}\nĐại diện: ${contract.partyBRepresentative || contract.employeeName}\nSố điện thoại: ${contract.partyBPhone || contract.employeePhone}\nEmail: ${contract.partyBEmail || contract.employeeEmail}\n\nĐIỀU 1: NỘI DUNG VÀ THỜI HẠN\n- Danh mục: ${contract.type}\n- Thời hạn: Từ ${contract.startDate} đến ${contract.endDate}\n\nĐIỀU 2: GIÁ TRỊ HỢP ĐỒNG & THANH TOÁN\n- Giá trị hợp đồng: ${(contract.contractValue || contract.salary || 0).toLocaleString('vi-VN')} VNĐ\n- Hình thức chi trả: ${contract.paymentMethod || 'Chuyển khoản ngân hàng'}\n\nĐIỀU 3: THÔNG TIN GHI NHẬN KÝ\n- Phía Bên B: ${contract.employeeSignStatus === 'Đã ký' ? `ĐÃ GHI NHẬN KÝ (${contract.employeeCertName})` : 'CHƯA KÝ'}\n- Phía Bên A: ${contract.companySignStatus === 'Đã ký' ? `ĐÃ GHI NHẬN KÝ DOANH NGHIỆP (${contract.companyCertName})` : 'CHƯA KÝ'}`;

    downloadFile(`${contract.code}_${(contract.partyBName || contract.employeeName).replace(/\s+/g, '_')}.txt`, content);
    message.success(`Đã tải xuống hợp đồng ${contract.code}`);
  };

  const filteredData = scopedContracts.filter((item) => {
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.partyBName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase());

    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchCategory = laborOnly || categoryFilter === 'all' || item.contractCategory === categoryFilter || item.type === categoryFilter;

    return matchSearch && matchStatus && matchCategory;
  });

  const getStatusTag = (status: string) => {
    switch (status) {
      case 'Còn hiệu lực':
        return (
          <Tag color="success">
            <CheckCircleOutlined style={{ marginRight: 4 }} />
            Còn hiệu lực
          </Tag>
        );
      case 'Chờ duyệt':
        return (
          <Tag color="warning">
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            Chờ duyệt
          </Tag>
        );
      case 'Chờ ký':
        return (
          <Tag color="processing">
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            Chờ ký
          </Tag>
        );
      case 'Dự thảo':
        return <Tag color="default">Dự thảo</Tag>;
      default:
        return <Tag color="error">Đã hết hạn</Tag>;
    }
  };

  const columns = [
    {
      title: 'Thông tin hợp đồng',
      key: 'name',
      render: (_: any, record: EnterpriseContractItem) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              background: record.partyBType === 'organization' ? '#EFF6FF' : '#E0F2F1',
              color: record.partyBType === 'organization' ? '#2563EB' : '#009688',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
            }}
          >
            {record.partyBType === 'organization' ? <ShopOutlined /> : <FileProtectOutlined />}
          </div>
          <div>
            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.name}</div>
            <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <code>{record.code}</code>
              <Tag color={record.partyBType === 'organization' ? 'blue' : 'cyan'} style={{ margin: 0, fontSize: 10.5, lineHeight: '18px' }}>{record.type}</Tag>
            </div>
          </div>
        </div>
      ),
    },
    {
      title: 'Chủ thể ký kết',
      key: 'partyB',
      render: (_: any, record: EnterpriseContractItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>
            {record.partyBName || record.employeeName}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            {record.partyBTaxCode ? (
              <span>MST: <strong style={{ color: '#2563EB' }}>{record.partyBTaxCode}</strong> · ĐD: {record.partyBRepresentative}</span>
            ) : (
              <span>Mã: <strong style={{ color: '#009688' }}>{record.employeeCode}</strong> {record.partyBIdNumber || record.employeeIdNumber ? `· CCCD: ${record.partyBIdNumber || record.employeeIdNumber}` : ''}</span>
            )}
          </div>
        </div>
      ),
    },

    {
      title: 'Chữ ký',
      key: 'signatures',
      width: 170,
      render: (_: any, record: EnterpriseContractItem) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <div style={{ fontSize: 11.5 }}>
            <span style={{ color: '#64748B' }}>Đối tác </span>
            {record.employeeSignStatus === 'Đã ký' ? (
              <span style={{ color: '#16A34A', fontWeight: 600 }}>
                <CheckCircleOutlined style={{ marginRight: 3 }} />
                Đã ký số
              </span>
            ) : (
              <span style={{ color: '#D97706', fontWeight: 500 }}>
                <ClockCircleOutlined style={{ marginRight: 3 }} />
                Chưa ký
              </span>
            )}
          </div>
          <div style={{ fontSize: 11.5 }}>
            <span style={{ color: '#64748B' }}>Doanh nghiệp </span>
            {record.companySignStatus === 'Đã ký' ? (
              <span style={{ color: '#16A34A', fontWeight: 600 }}>
                <CheckCircleOutlined style={{ marginRight: 3 }} />
                Đã duyệt
              </span>
            ) : (
              <span style={{ color: '#D97706', fontWeight: 500 }}>
                <ClockCircleOutlined style={{ marginRight: 3 }} />
                Chờ ký
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => getStatusTag(status),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 220,
      render: (_: any, record: EnterpriseContractItem) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedContract(record);
              setDetailOpen(true);
            }}
          >
            Hồ sơ
          </Button>
          <Button
            size="small"
            type="primary"
            icon={<EditOutlined />}
            onClick={() => handleOpenEditModal(record)}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Sửa
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => handleDownloadContract(record)}
          />
          <Button
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDelete(record)}
          />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>
            {laborOnly ? 'Tổng hợp đồng lao động' : 'Tổng hợp đồng & văn bản đã ký'}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalCount} Hợp đồng
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>100% Lưu trữ số hóa &amp; đóng dấu CA</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>
            {laborOnly ? 'Hợp đồng lao động nội bộ' : 'Hợp đồng đối tác B2B & Dịch vụ'}
          </div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {partnerCount} {laborOnly ? 'Lao động' : 'Đối tác'}
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>
            {laborOnly ? 'Nhân sự ký kết với công ty' : 'Liên kết doanh nghiệp & nhà cung cấp'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hợp đồng có hiệu lực pháp lý</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {activeCount} ({Math.round((activeCount / totalCount) * 100 || 100)}%)
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đầy đủ chứng nhận pháp lý</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hợp đồng chờ phê duyệt &amp; ký</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {awaitingApprovalCount} Văn bản
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Bên B đã ký / Đang chờ công ty duyệt</div>
        </div>
      </div>

      {/* Sub-Tabs Filter & Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {!laborOnly && (
            <Select
              value={categoryFilter}
              onChange={setCategoryFilter}
              style={{ width: 220 }}
              options={[
                { value: 'all', label: 'Tất cả văn bản' },
                { value: 'partner', label: 'Hợp tác đối tác B2B' },
                { value: 'service', label: 'Cung cấp dịch vụ' },
                { value: 'nda', label: 'Bảo mật thông tin' },
                { value: 'consultant', label: 'Chuyên gia cố vấn' },
                { value: 'equity', label: 'Cổ phần & ESOP' },
                { value: 'labor', label: 'Lao động nội bộ' },
              ]}
            />
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã HĐ, tên đối tác, MST, nhân sự..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />

          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 160 }}
            options={[
              { label: 'Tất cả trạng thái', value: 'all' },
              { label: 'Còn hiệu lực', value: 'Còn hiệu lực' },
              { label: 'Chờ duyệt', value: 'Chờ duyệt' },
              { label: 'Chờ ký', value: 'Chờ ký' },
              { label: 'Dự thảo', value: 'Dự thảo' },
            ]}
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh sách hợp đồng ra file Excel')}>
            Xuất Excel
          </Button>

          <Button icon={<FileTextOutlined />} onClick={() => navigate('/admin/documents/settings/contract-templates')}>
            Mẫu hợp đồng
          </Button>

          {!laborOnly && (
            <Button
              icon={<UploadOutlined />}
              onClick={handleOpenUploadModal}
            >
              Tải lên hợp đồng
            </Button>
          )}

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreateModal}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            {laborOnly ? 'Lập hợp đồng lao động' : 'Lập hợp đồng mẫu'}
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          loading={loading}
          dataSource={filteredData}
          columns={columns as any}
          rowKey="key"
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* ========================================================================= */}
      {/* FULL-SIZE CREATE / EDIT CONTRACT MODAL DIALOG */}
      {/* ========================================================================= */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#009688', fontSize: 16 }}>
              <FileProtectOutlined />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#1E293B' }}>
                {editingContract
                  ? `Chỉnh sửa & phê duyệt hợp đồng: ${editingContract.code}`
                  : laborOnly
                    ? 'Lập hợp đồng lao động'
                    : 'Lập hợp đồng đối tác & văn bản pháp lý mới'}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', fontWeight: 400 }}>
                {laborOnly
                  ? 'Thiết lập thông tin nhân sự, điều khoản lao động và ký số doanh nghiệp'
                  : 'Thiết lập thông tin chủ thể ký kết, điều khoản tài chính và thực hiện ký số doanh nghiệp'}
              </div>
            </div>
          </div>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={1050}
        style={{ top: 20 }}
        bodyStyle={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto', padding: '16px 20px' }}
        footer={[
          <Button key="cancel" onClick={() => setModalOpen(false)} style={{ borderRadius: 6 }}>
            Đóng
          </Button>,
          <Button
            key="save"
            type="primary"
            onClick={handleSaveContract}
            style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6, fontWeight: 600, padding: '0 24px' }}
          >
            {editingContract ? 'Lưu & cập nhật hợp đồng' : 'Xác nhận tạo hợp đồng'}
          </Button>,
        ]}
      >
        <Form form={form} layout="vertical">
          {/* PHẦN 1: MẪU HỢP ĐỒNG & FILE ĐÍNH KÈM */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileTextOutlined style={{ color: '#009688' }} /> Mẫu văn bản hợp đồng &amp; tệp đính kèm
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Select
                  value={contractSourceType}
                  onChange={(val) => {
                    setContractSourceType(val);
                    if (val === 'upload') {
                      setPartyBType('organization');
                      form.setFieldsValue({
                        code: `HDB2B-2026/${String(Date.now()).slice(-3)}`,
                        name: uploadedTemplateFiles[0] ? uploadedTemplateFiles[0].replace(/\.[^/.]+$/, '') : '',
                        contractCategory: 'partner',
                        partyBType: 'organization',
                        partyBName: '',
                        partyBTaxCode: '',
                        partyBRepresentative: '',
                        partyBPosition: '',
                        partyBPhone: '',
                        partyBEmail: '',
                        partyBBank: undefined,
                        partyBAddress: '',
                        employeeCode: '',
                        employeeName: '',
                        partyBIdNumber: '',
                        department: '',
                        position: '',
                        contractValue: undefined,
                        salary: undefined,
                        allowance: undefined,
                        stockSharesPercent: '',
                        startDate: new Date().toISOString().split('T')[0],
                        endDate: 'Không thời hạn',
                        workLocation: '',
                        paymentMethod: 'Chuyển khoản ngân hàng',
                        status: 'Chờ duyệt',
                      });
                    } else {
                      setSelectedTemplateName('');
                      setActivePreviewTemplate('');
                      setPartyBType(laborOnly ? 'employee' : 'employee');
                      form.setFieldsValue({
                        code: '',
                        name: '',
                        contractCategory: laborOnly ? 'labor' : undefined,
                        contractTemplate: undefined,
                        partyBType: laborOnly ? 'employee' : 'employee',
                        partyBName: '',
                        employeeCode: '',
                        employeeName: '',
                        partyBIdNumber: '',
                        partyBPhone: '',
                        partyBEmail: '',
                        partyBBank: undefined,
                        partyBAddress: '',
                        department: '',
                        position: '',
                        contractValue: undefined,
                        salary: undefined,
                        allowance: undefined,
                        stockSharesPercent: '',
                        startDate: '',
                        endDate: '',
                        workLocation: '',
                        paymentMethod: undefined,
                        status: 'Chờ duyệt',
                      });
                    }
                  }}
                  style={{ width: 235 }}
                  options={laborOnly
                    ? [{ value: 'template', label: 'Mẫu hợp đồng lao động' }]
                    : [
                        { value: 'template', label: 'Mẫu có sẵn trong hệ thống' },
                        { value: 'upload', label: 'Tải lên tệp hợp đồng mới' },
                      ]}
                />
              </div>
            </div>

            {contractSourceType === 'template' ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 300 }}>
                  <Form.Item
                    name="contractTemplate"
                    label="Danh sách văn bản"
                    rules={[{ required: true, message: 'Vui lòng chọn mẫu hợp đồng' }]}
                    style={{ marginBottom: 0 }}
                  >
                    <Select
                      value={selectedTemplateName}
                      onChange={handleTemplateChange}
                      options={contractTemplates
                        .filter((template) => template.isActive)
                        .filter((template) => !laborOnly || template.category === 'labor' || template.partyType === 'employee' || normalizeContractText(template.name).includes('lao dong'))
                        .map((template) => ({ value: template.name, label: template.name }))}
                      style={{ width: '100%' }}
                    />
                  </Form.Item>
                </div>

                <div style={{ marginTop: 28 }}>
                  <Button
                    type="primary"
                    icon={<EyeOutlined />}
                      onClick={() => {
                        setActivePreviewTemplate(selectedTemplateName);
                        setTemplateViewerOpen(true);
                      }}
                      disabled={!selectedTemplateName}
                      style={{
                      backgroundColor: '#0F766E',
                      borderColor: '#0F766E',
                      borderRadius: 6,
                      height: 36,
                      fontWeight: 600,
                    }}
                  >
                    Xem trước nội dung
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Upload.Dragger
                  accept=".pdf,.docx,.doc"
                  maxCount={5}
                  multiple
                  beforeUpload={(file) => {
                    setUploadedTemplateFiles((prev) => {
                      const next = prev.includes(file.name) ? prev : [...prev, file.name];
                      form.setFieldsValue({ name: next[0]?.replace(/\.[^/.]+$/, '') || '' });
                      return next;
                    });
                    message.success(`Đã tải lên tệp hợp đồng: ${file.name}`);
                    return false;
                  }}
                  style={{ background: '#FFFFFF', padding: 12 }}
                >
                  <p className="ant-upload-drag-icon">
                    <UploadOutlined style={{ color: '#009688', fontSize: 28 }} />
                  </p>
                  <p className="ant-upload-text" style={{ fontSize: 13, fontWeight: 600 }}>
                    Kéo thả tệp hợp đồng vào đây hoặc nhấn để tải lên
                  </p>
                  <p className="ant-upload-hint" style={{ fontSize: 12, color: '#64748B' }}>
                    Hỗ trợ kéo nhiều tệp định dạng PDF, Word · không giới hạn dung lượng
                  </p>
                </Upload.Dragger>
                {uploadedTemplateFiles.length > 0 && (
                  <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                    {uploadedTemplateFiles.map((fileName) => (
                      <div
                        key={fileName}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                          padding: '8px 10px',
                          border: '1px solid #D9E2EC',
                          borderRadius: 6,
                          background: '#F8FAFC',
                        }}
                      >
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#334155', fontSize: 13, fontWeight: 600 }}>
                          <FileTextOutlined style={{ color: '#009688' }} />
                          {fileName}
                        </span>
                        <Button
                          size="small"
                          danger
                          icon={<DeleteOutlined />}
                          onClick={() => {
                            setUploadedTemplateFiles((prev) => {
                              const next = prev.filter((item) => item !== fileName);
                              form.setFieldsValue({ name: next[0]?.replace(/\.[^/.]+$/, '') || '' });
                              return next;
                            });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {contractSourceType === 'template' && selectedTemplate && (
            <>
              {/* PHẦN 2: THÔNG TIN CHỦ THỂ KÝ KẾT */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <UserOutlined style={{ color: '#009688' }} /> Thông tin chủ thể ký kết
                  </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {partyBType === 'employee' && (
                  <Button
                    type="primary"
                    icon={<BankOutlined />}
                    onClick={() => setEmployeeSelectOpen(true)}
                    style={{
                      backgroundColor: '#009688',
                      borderColor: '#009688',
                      borderRadius: 6,
                      height: 32,
                      fontSize: 12.5,
                      fontWeight: 500,
                    }}
                  >
                    Chọn nhân sự
                  </Button>
                )}

                <Select
                  value={partyBType}
                  onChange={(val) => setPartyBType(laborOnly ? 'employee' : val)}
                  style={{ width: 140 }}
                  disabled={laborOnly}
                  options={
                    laborOnly
                      ? [{ value: 'employee', label: 'Nhân sự' }]
                      : contractSourceType === 'template'
                      ? [
                          { value: 'employee', label: 'Nhân sự' },
                          { value: 'individual', label: 'Cá nhân' },
                        ]
                      : [
                          { value: 'organization', label: 'Doanh nghiệp đối tác' },
                          { value: 'individual', label: 'Cá nhân' },
                          { value: 'employee', label: 'Nhân sự' },
                        ]
                  }
                />
              </div>
            </div>

            {partyBType === 'organization' ? (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
                <Form.Item
                  name="partyBName"
                  label="Tên công ty / Tổ chức đối tác *"
                  rules={[{ required: true, message: 'Vui lòng nhập tên đối tác' }]}
                >
                  <Input placeholder="Nhập tên công ty / tổ chức đối tác..." />
                </Form.Item>

                <Form.Item
                  name="partyBTaxCode"
                  label="Mã số thuế doanh nghiệp *"
                  rules={[{ required: true, message: 'Vui lòng nhập mã số thuế' }]}
                >
                  <Input placeholder="Nhập mã số thuế..." />
                </Form.Item>

                <Form.Item
                  name="partyBRepresentative"
                  label="Người đại diện pháp luật *"
                  rules={[{ required: true, message: 'Vui lòng nhập người đại diện' }]}
                >
                  <Input placeholder="Nhập tên người đại diện..." />
                </Form.Item>

                <Form.Item name="partyBPosition" label="Chức vụ đại diện">
                  <Input placeholder="Nhập chức vụ đại diện..." />
                </Form.Item>

                <Form.Item name="partyBPhone" label="Số điện thoại liên hệ">
                  <Input placeholder="Nhập số điện thoại..." />
                </Form.Item>

                <Form.Item name="partyBEmail" label="Email đối tác">
                  <Input placeholder="Nhập email đối tác..." />
                </Form.Item>

                <Form.Item
                  name="partyBBank"
                  label={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', whiteSpace: 'nowrap', gap: 8 }}>
                      <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Tài khoản ngân hàng</span>
                      <span
                        onClick={handleOpenAddBankModal}
                        style={{
                          color: '#009688',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          userSelect: 'none',
                        }}
                      >
                        + Thêm ngân hàng
                      </span>
                    </div>
                  }
                >
                  <Select
                    allowClear
                    placeholder="Chọn tài khoản ngân hàng..."
                    options={(() => {
                      const empCode = form.getFieldValue('employeeCode') || editingContract?.employeeCode || '';
                      const partyName = form.getFieldValue('partyBName') || form.getFieldValue('employeeName') || editingContract?.partyBName || editingContract?.employeeName || '';
                      const matched = (bankAccounts || []).filter((b: any) => {
                        if (!b) return false;
                        if (empCode && b.employeeCode && String(b.employeeCode).toLowerCase() === String(empCode).toLowerCase()) return true;
                        if (partyName && b.employeeName && String(b.employeeName).toLowerCase() === String(partyName).toLowerCase()) return true;
                        return false;
                      });
                      const opts = matched.map((b: any) => {
                        const bName = b?.bankName || '';
                        const shortBank = bName && bName.includes('(') ? bName.split('(')[0].trim() : (bName || 'Ngân hàng');
                        const val = `${shortBank} - ${b?.accountNumber || ''}`;
                        return {
                          value: val,
                          label: `${val}${b?.isPrimary ? ' (Chính)' : ''}`,
                        };
                      });
                      const currentVal = form.getFieldValue('partyBBank');
                      if (currentVal && !opts.some((o: any) => o.value === currentVal)) {
                        opts.unshift({ value: currentVal, label: currentVal });
                      }
                      return opts;
                    })()}
                  />
                </Form.Item>

                <Form.Item name="partyBAddress" label="Địa chỉ trụ sở chính">
                  <Input placeholder="Nhập địa chỉ trụ sở chính..." />
                </Form.Item>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
                <Form.Item
                  name="partyBName"
                  label="Họ và tên *"
                  rules={[{ required: true, message: 'Vui lòng nhập họ và tên' }]}
                >
                  <Input placeholder="Nhập họ và tên..." />
                </Form.Item>

                <Form.Item
                  name="employeeCode"
                  label="Mã định danh *"
                  rules={[{ required: true, message: 'Vui lòng nhập mã định danh' }]}
                >
                  <Input placeholder="Nhập mã định danh (NV-84920 / CG-001...)" />
                </Form.Item>

                <Form.Item name="partyBIdNumber" label="Số căn cước công dân">
                  <Input placeholder="Nhập số căn cước công dân..." />
                </Form.Item>

                <Form.Item name="partyBPhone" label="Số điện thoại">
                  <Input placeholder="Nhập số điện thoại..." />
                </Form.Item>

                <Form.Item name="partyBEmail" label="Email liên hệ">
                  <Input placeholder="Nhập email liên hệ..." />
                </Form.Item>

                <Form.Item
                  name="partyBBank"
                  label={
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', whiteSpace: 'nowrap', gap: 8 }}>
                      <span style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Tài khoản ngân hàng</span>
                      <span
                        onClick={handleOpenAddBankModal}
                        style={{
                          color: '#009688',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer',
                          whiteSpace: 'nowrap',
                          flexShrink: 0,
                          userSelect: 'none',
                        }}
                      >
                        + Thêm ngân hàng
                      </span>
                    </div>
                  }
                >
                  <Select
                    allowClear
                    placeholder="Chọn tài khoản ngân hàng..."
                    options={(() => {
                      const empCode = form.getFieldValue('employeeCode') || editingContract?.employeeCode || '';
                      const partyName = form.getFieldValue('partyBName') || form.getFieldValue('employeeName') || editingContract?.partyBName || editingContract?.employeeName || '';
                      const matched = (bankAccounts || []).filter((b: any) => {
                        if (!b) return false;
                        if (empCode && b.employeeCode && String(b.employeeCode).toLowerCase() === String(empCode).toLowerCase()) return true;
                        if (partyName && b.employeeName && String(b.employeeName).toLowerCase() === String(partyName).toLowerCase()) return true;
                        return false;
                      });
                      const opts = matched.map((b: any) => {
                        const bName = b?.bankName || '';
                        const shortBank = bName && bName.includes('(') ? bName.split('(')[0].trim() : (bName || 'Ngân hàng');
                        const val = `${shortBank} - ${b?.accountNumber || ''}`;
                        return {
                          value: val,
                          label: `${val}${b?.isPrimary ? ' (Chính)' : ''}`,
                        };
                      });
                      const currentVal = form.getFieldValue('partyBBank');
                      if (currentVal && !opts.some((o: any) => o.value === currentVal)) {
                        opts.unshift({ value: currentVal, label: currentVal });
                      }
                      return opts;
                    })()}
                  />
                </Form.Item>
              </div>
            )}
              </div>

              {/* PHẦN 3: CHI TIẾT */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <DollarOutlined style={{ color: '#009688' }} /> Chi tiết
                </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 14 }}>
              <Form.Item name="code" label="Mã số hợp đồng *" rules={[{ required: true }]}>
                <Input placeholder="Nhập mã số hợp đồng..." />
              </Form.Item>

              <Form.Item name="name" label="Tên văn bản hợp đồng *" rules={[{ required: true }]}>
                <Input placeholder="Nhập tên văn bản hợp đồng..." />
              </Form.Item>

              <Form.Item name="contractCategory" label="Danh mục hợp đồng *" rules={[{ required: true }]}>
                <Select
                  disabled={laborOnly}
                  options={laborOnly
                    ? [{ value: 'labor', label: 'Lao động nội bộ' }]
                    : [
                        { value: 'partner', label: 'Hợp tác đối tác B2B' },
                        { value: 'service', label: 'Cung cấp dịch vụ' },
                        { value: 'nda', label: 'Thỏa thuận bảo mật' },
                        { value: 'consultant', label: 'Chuyên gia cố vấn' },
                        { value: 'equity', label: 'Cổ phần & ESOP' },
                        { value: 'labor', label: 'Lao động nội bộ' },
                        { value: 'custom', label: 'Hợp đồng tùy chỉnh khác' },
                      ]}
                />
              </Form.Item>

              {visibleContractField('department') && <Form.Item name="department" label="Phòng ban / Đơn vị phụ trách *" rules={[{ required: true }]}>
                {orgUnitOptions.length > 0 ? (
                  <Select options={orgUnitOptions} placeholder="Chọn phòng ban / đơn vị..." />
                ) : (
                  <Input placeholder="Nhập tên phòng ban / đơn vị..." />
                )}
              </Form.Item>}

              {visibleContractField('position') && <Form.Item name="position" label="Vị trí / vai trò hợp tác *" rules={[{ required: true }]}>
                {positionOptions.length > 0 ? (
                  <Select options={positionOptions} placeholder="Chọn vị trí / vai trò..." />
                ) : (
                  <Input placeholder="Nhập vị trí / vai trò..." />
                )}
              </Form.Item>}

              {visibleContractField('contractValue') && <Form.Item name="contractValue" label="Tổng giá trị hợp đồng (VNĐ)">
                <Input type="number" placeholder="Nhập tổng giá trị (VNĐ)..." />
              </Form.Item>}

              {visibleContractField('salary') && <Form.Item name="salary" label="Mức lương / Thù lao định kỳ (VNĐ)">
                <Input type="number" placeholder="Nhập mức lương / thù lao (VNĐ)..." />
              </Form.Item>}

              {visibleContractField('allowance') && <Form.Item name="allowance" label="Phụ cấp trách nhiệm (VNĐ)">
                <Input type="number" placeholder="Nhập phụ cấp (VNĐ)..." />
              </Form.Item>}

              {visibleContractField('stockSharesPercent') && <Form.Item name="stockSharesPercent" label="Tỷ lệ cổ phần thưởng ESOP">
                <Input placeholder="Nhập tỷ lệ cổ phần ESOP..." />
              </Form.Item>}

              {visibleContractField('startDate') && <Form.Item name="startDate" label="Ngày bắt đầu hiệu lực *" rules={[{ required: true }]}>
                <Input type="date" />
              </Form.Item>}

              {visibleContractField('endDate') && <Form.Item name="endDate" label="Ngày hết hạn *" rules={[{ required: true }]}>
                <Input placeholder="Không thời hạn hoặc YYYY-MM-DD" />
              </Form.Item>}

              {visibleContractField('paymentMethod') && <Form.Item name="paymentMethod" label="Hình thức chi trả">
                <Select
                  options={[
                    { value: 'Chuyển khoản ngân hàng', label: 'Chuyển khoản ngân hàng' },
                    { value: 'Tiền mặt', label: 'Tiền mặt' },
                  ]}
                />
              </Form.Item>}

              {visibleContractField('workLocation') && <Form.Item name="workLocation" label="Địa điểm thực hiện / làm việc">
                <Input placeholder="Nhập địa điểm thực hiện / làm việc..." />
              </Form.Item>}

              {visibleContractField('status') && <Form.Item name="status" label="Trạng thái hợp đồng *" rules={[{ required: true }]}>
                <Select
                  options={[
                    { value: 'Chờ duyệt', label: 'Chờ duyệt' },
                    { value: 'Còn hiệu lực', label: 'Còn hiệu lực' },
                    { value: 'Chờ ký', label: 'Chờ ký' },
                    { value: 'Dự thảo', label: 'Dự thảo' },
                    { value: 'Đã hết hạn', label: 'Đã hết hạn' },
                  ]}
                />
              </Form.Item>}

              {visibleCustomFields.map((field) => (
                <Form.Item
                  key={field.key}
                  name={field.key}
                  label={`${field.label}${field.required ? ' *' : ''}`}
                  rules={field.required ? [{ required: true, message: `Vui lòng nhập ${field.label}` }] : undefined}
                >
                  {field.type === 'select' ? (
                    <Select
                      allowClear
                      placeholder={field.placeholder || `Chọn ${(field.label || '').toLowerCase()}...`}
                      options={(field.options || []).map((option) => ({ value: option, label: option }))}
                    />
                  ) : (
                    <Input type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} placeholder={field.placeholder || `Nhập ${(field.label || '').toLowerCase()}...`} />
                  )}
                </Form.Item>
              ))}
            </div>
              </div>
            </>
          )}

          {/* PHẦN 4: KÝ SỐ DOANH NGHIỆP */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <SafetyCertificateOutlined style={{ color: '#16A34A' }} /> Phê duyệt &amp; ký số doanh nghiệp
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Select
                  value={companySignMethod}
                  onChange={(val) => setCompanySignMethod(val)}
                  style={{ width: 235 }}
                  options={[
                    { value: 'digital', label: 'Ký số điện tử trực tiếp' },
                    { value: 'upload', label: 'Tải lên tệp đã ký đóng dấu' },
                  ]}
                />
              </div>
            </div>

            {companySignMethod === 'digital' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12.5, color: '#334155', fontWeight: 600, marginBottom: 4 }}>
                    Chọn chữ ký số / chứng thư số doanh nghiệp:
                  </label>
                  <Select
                    value={selectedCompanyCert}
                    onChange={(val) => setSelectedCompanyCert(val)}
                    options={COMPANY_SIGNATURE_OPTIONS}
                    style={{ width: '100%' }}
                  />
                </div>
              </div>
            ) : (
              <div>
                <Upload.Dragger
                  accept=".pdf"
                  maxCount={1}
                  beforeUpload={(file) => {
                    setUploadedCompanyFile(file.name);
                    message.success(`Đã chọn tệp đã ký công ty: ${file.name}`);
                    return false;
                  }}
                  style={{ background: '#FFFFFF', padding: 10 }}
                >
                  <p className="ant-upload-drag-icon">
                    <UploadOutlined style={{ color: '#16A34A', fontSize: 24 }} />
                  </p>
                  <p className="ant-upload-text" style={{ fontSize: 13, fontWeight: 600 }}>
                    Tải lên file PDF hợp đồng đã ký &amp; đóng dấu đỏ của công ty
                  </p>
                </Upload.Dragger>
                {uploadedCompanyFile && (
                  <div style={{ marginTop: 8, fontSize: 12.5, color: '#16A34A', fontWeight: 600 }}>
                    Đã chọn tệp: {uploadedCompanyFile}
                  </div>
                )}
              </div>
            )}
          </div>
        </Form>
      </Modal>

      {/* ========================================================================= */}
      {/* DIALOG 2: CHỌN NHÂN SỰ */}
      {/* ========================================================================= */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BankOutlined style={{ color: '#009688', fontSize: 18 }} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              Danh sách Nhân sự
            </span>
          </div>
        }
        open={employeeSelectOpen}
        onCancel={() => setEmployeeSelectOpen(false)}
        width="min(1350px, 96vw)"
        bodyStyle={{
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          height: 600,
          maxHeight: 'calc(88vh - 60px)',
          borderBottomLeftRadius: 8,
          borderBottomRightRadius: 8,
          overflow: 'hidden',
        }}
        footer={null}
      >
        <div style={{ padding: '16px 20px 14px 20px', flexShrink: 0, background: '#FFFFFF' }}>
          <Input
            placeholder="Tìm kiếm nhân sự theo tên, mã NV, CCCD, STK ngân hàng..."
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            value={empSearch}
            onChange={(e) => setEmpSearch(e.target.value)}
            allowClear
          />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'auto', borderTop: '1px solid #E2E8F0', borderBottomLeftRadius: 8, borderBottomRightRadius: 8, margin: 0, padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                <th style={{ padding: '12px 20px', background: '#F8FAFC' }}>Mã NV</th>
                <th style={{ padding: '12px 16px', background: '#F8FAFC' }}>Họ và tên</th>
                <th style={{ padding: '12px 16px', background: '#F8FAFC' }}>Chức vụ &amp; Phòng ban</th>
                <th style={{ padding: '12px 16px', background: '#F8FAFC' }}>CCCD / SĐT</th>
                <th style={{ padding: '12px 16px', background: '#F8FAFC' }}>Tài khoản ngân hàng</th>
                <th style={{ padding: '12px 20px', textAlign: 'right', background: '#F8FAFC' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {employees
                .filter(
                  (e: any) =>
                    !empSearch ||
                    (e.name || '').toLowerCase().includes(empSearch.toLowerCase()) ||
                    (e.code || '').toLowerCase().includes(empSearch.toLowerCase()) ||
                    (e.identityNumber || '').includes(empSearch) ||
                    (e.bankAccount || '').includes(empSearch)
                )
                .map((emp: any) => (
                  <tr
                    key={emp.code}
                    style={{ borderBottom: '1px solid #F1F5F9', transition: 'background 0.2s' }}
                    className="hover:bg-slate-50"
                  >
                    <td style={{ padding: '12px 20px', fontWeight: 700, color: '#009688', fontFamily: 'monospace' }}>
                      {emp.code}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: '#1E293B' }}>
                      {emp.name}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontSize: 12.5, color: '#1E40AF' }}>{emp.position || 'Chuyên viên'}</div>
                      <div style={{ fontSize: 11.5, color: '#64748B' }}>{emp.department || 'Phòng ban'}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#475569' }}>
                      <div>CCCD: {emp.identityNumber || '064210005343'}</div>
                      <div style={{ color: '#64748B' }}>SĐT: {emp.phone || 'Chưa cập nhật'}</div>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: '#0F766E' }}>
                      {emp.bankAccount ? emp.bankAccount : `${emp.bankName || 'Techcombank'} - 19034567890011`}
                    </td>
                    <td style={{ padding: '12px 20px', textAlign: 'right' }}>
                      <Button
                        type="primary"
                        size="small"
                        onClick={() => handleSelectEmployee(emp)}
                        style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 4, fontWeight: 500 }}
                      >
                        Chọn nhân sự này
                      </Button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* DIALOG 3: XEM TRƯỚC VĂN BẢN MẪU */}
      {/* ========================================================================= */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FilePdfOutlined style={{ color: '#EF4444', fontSize: 20 }} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>
              Xem trước văn bản mẫu: {activePreviewTemplateData?.name || activePreviewTemplate}
            </span>
          </div>
        }
        open={templateViewerOpen}
        onCancel={() => setTemplateViewerOpen(false)}
        width={900}
        bodyStyle={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', background: '#FAFAFA', padding: 24 }}
        footer={[
          <Button key="close" type="primary" onClick={() => setTemplateViewerOpen(false)} style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 6 }}>
            Đóng xem trước
          </Button>,
        ]}
      >
        <div style={{ background: '#FFFFFF', padding: '32px 40px', border: '1px solid #E2E8F0', borderRadius: 6, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', fontFamily: 'Times New Roman, serif', color: '#111827', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
          {activePreviewTemplateData ? renderTemplateContent(activePreviewTemplateData.content, form.getFieldsValue()) : 'Nội dung văn bản hợp đồng'}
        </div>
      </Modal>

      {/* ========================================================================= */}
      {/* DRAWER XEM CHI TIẾT */}
      {/* ========================================================================= */}
      <Drawer
        title={`Chi tiết Hợp đồng: ${selectedContract?.code || ''}`}
        placement="right"
        width={540}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        extra={
          selectedContract && (
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={() => handleDownloadContract(selectedContract)}
              style={{ backgroundColor: '#009688', borderColor: '#009688', borderRadius: 4 }}
            >
              Tải Word
            </Button>
          )
        }
      >
        {selectedContract && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Button icon={<DownloadOutlined />} onClick={() => handleExportContractText(selectedContract)}>Xuất nội dung TXT theo mẫu</Button>
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{selectedContract.name}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                <Tag color="cyan">{selectedContract.type}</Tag>
                {getStatusTag(selectedContract.status)}
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>CHỦ THỂ KÝ KẾT</div>
                <div style={{ fontWeight: 600, color: '#1E293B' }}>{selectedContract.partyBName || selectedContract.employeeName}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>MÃ ĐỊNH DANH</div>
                <div style={{ fontWeight: 600, color: '#009688' }}>{selectedContract.employeeCode}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>PHÒNG BAN</div>
                <div style={{ fontWeight: 500, color: '#334155' }}>{selectedContract.department}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>VỊ TRÍ CÔNG TÁC</div>
                <div style={{ fontWeight: 500, color: '#1E40AF' }}>{selectedContract.position}</div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>MỨC LƯƠNG CƠ BẢN</div>
                <div style={{ fontWeight: 700, color: '#059669', fontSize: 14 }}>
                  {selectedContract.salary.toLocaleString('vi-VN')} ₫
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>CỔ PHẦN THƯỞNG</div>
                <div style={{ fontWeight: 600, color: '#D97706' }}>
                  {selectedContract.stockSharesPercent || 'Không có'}
                </div>
              </div>
            </div>

            <div style={{ background: '#F0FDF4', padding: 12, borderRadius: 6, border: '1px solid #BBF7D0' }}>
              <div style={{ fontWeight: 600, color: '#15803D', fontSize: 13, marginBottom: 6 }}>
                Chứng thực chữ ký
              </div>
              <div style={{ fontSize: 12, color: '#166534', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div>• Đối tác {selectedContract.employeeSignStatus === 'Đã ký' ? `Đã ký (${selectedContract.employeeCertName || 'Chữ ký số cá nhân/đối tác'})` : 'Chưa ký'}</div>
                <div>• Doanh nghiệp {selectedContract.companySignStatus === 'Đã ký' ? `Đã ký (${selectedContract.companyCertName || 'Chữ ký số doanh nghiệp'})` : 'Chưa ký'}</div>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* ========================================================================= */}
      {/* DIALOG 4: THÊM MỚI TÀI KHOẢN NGÂN HÀNG (GIỐNG 100% admin/hr/history/bank) */}
      {/* ========================================================================= */}
      <Modal
        open={isAddBankModalOpen}
        onCancel={() => setIsAddBankModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <BankOutlined style={{ color: '#009688' }} />
            <span>Thêm mới tài khoản ngân hàng</span>
          </div>
        }
        width={560}
        footer={[
          <Button key="cancel" onClick={() => setIsAddBankModalOpen(false)}>
            Hủy
          </Button>,
          <Button
            key="save"
            type="primary"
            onClick={handleSaveBank}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm tài khoản
          </Button>,
        ]}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>
              Ngân hàng <span style={{ color: '#EF4444' }}>*</span>
            </label>
            <Select
              showSearch
              value={bankForm.bankName}
              onChange={(val) => setBankForm((prev) => ({ ...prev, bankName: val }))}
              options={BANK_OPTIONS}
              style={{ width: '100%' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>
                Số tài khoản <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Input
                placeholder="Nhập số tài khoản..."
                value={bankForm.accountNumber}
                onChange={(e) => setBankForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>
                Tên chủ tài khoản <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Input
                placeholder="VD: NGUYEN VAN A"
                value={bankForm.accountHolder}
                onChange={(e) => setBankForm((prev) => ({ ...prev, accountHolder: e.target.value.toUpperCase() }))}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Chi nhánh ngân hàng</label>
              <Input
                placeholder="VD: Chi nhánh Tân Định - TP.HCM"
                value={bankForm.branch}
                onChange={(e) => setBankForm((prev) => ({ ...prev, branch: e.target.value }))}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Trạng thái</label>
              <Select
                value={bankForm.status || 'Đã duyệt'}
                onChange={(val) => setBankForm((prev) => ({ ...prev, status: val }))}
                options={[
                  { value: 'Đã duyệt', label: 'Đã duyệt' },
                  { value: 'Chờ duyệt', label: 'Chờ duyệt' },
                  { value: 'Từ chối', label: 'Từ chối' },
                ]}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          <div>
            <Checkbox
              checked={bankForm.isPrimary}
              onChange={(e) =>
                setBankForm((prev) => ({
                  ...prev,
                  isPrimary: e.target.checked,
                }))
              }
            >
              <span style={{ fontWeight: 500, color: '#1E293B' }}>Đặt làm tài khoản nhận lương chính</span>
            </Checkbox>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12.5, color: '#475569', marginBottom: 4 }}>Ghi chú</label>
            <Input
              placeholder="Ghi chú thêm nếu có..."
              value={bankForm.note || ''}
              onChange={(e) => setBankForm((prev) => ({ ...prev, note: e.target.value }))}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default ContractsModule;
