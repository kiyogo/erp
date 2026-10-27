import { dataService } from '../../services/dataService';
import { collectionsApi, filesApi } from '../../api/endpoints';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  SearchOutlined,
  DownloadOutlined,
  EditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  FieldTimeOutlined,
  SafetyCertificateOutlined,
  FilePdfOutlined,
  PlusOutlined,
  ReloadOutlined,
  KeyOutlined,
  ExclamationCircleOutlined,
  PaperClipOutlined,
  BranchesOutlined,
  PrinterOutlined,
  CheckOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  AlertOutlined,
  SendOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Tag, Card, Alert, Tooltip, Progress, Radio } from '../../custom-ui';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { useAuth } from '../../context/AuthContext';

export interface RequestAttachment {
  fileNodeId?: string;
  fileName: string;
  fileSize: string;
  fileSizeBytes?: number;
  fileType: string;
  uploadTime: string;
}

export interface ApprovalRequestItem {
  key: string;
  code: string;
  workflowName: string;
  workflowCode: string;
  category: 'Mua sắm & Tài sản' | 'Tài chính & Thanh toán' | 'Hợp đồng & Pháp chế' | 'Nhân sự & Phúc lợi' | 'Văn phòng & Hành chính' | 'Vận hành Kỹ thuật & IDC';
  requester: string;
  requesterId?: string;
  currentApproverId?: string;
  currentApprover?: string;
  canDecide?: boolean;
  approvalCanRejectLevels?: boolean[];
  delegatedFor?: string;
  department: string;
  currentLevel: number;
  totalLevels: number;
  roleRequirement: string;
  budgetAmount: number;
  submittedAt: string;
  slaDeadline: string;
  slaHoursLeft: number;
  priority: 'Khẩn cấp (P1)' | 'Cao (P2)' | 'Bình thường (P3)';
  status: 'Chờ bạn ký duyệt' | 'Đã phê duyệt' | 'Đã ký số phê duyệt' | 'Đã từ chối' | 'Yêu cầu bổ sung';
  summaryDetails: string;
  tokenRequired: boolean;
  attachments: RequestAttachment[];
  formData?: Record<string, unknown>;
  approvalFormFields?: Array<{ fieldName: string; label: string; type: string; required: boolean }>;
  approvalNotes?: string;
  decision?: string;
  approvalNote?: string;
  slaDeadlineAt?: string;
  approvalHistory?: Array<{
    txCode: string;
    requestCode: string;
    workflowName: string;
    category: ApprovalRequestItem['category'];
    approver: string;
    approverRole: string;
    level: number;
    decision: string;
    timestamp: string;
    comments: string;
    sha256Hash: string;
  }>;
}

type ApprovalRequestPatch = Partial<ApprovalRequestItem> & {
  resubmission?: { summaryDetails: string; budgetAmount: number; response: string; formData?: Record<string, unknown>; attachments?: Array<{ fileNodeId: string }> };
};

type WorkflowFormField = { fieldName: string; label: string; type: string; required: boolean };

async function uploadWorkflowFiles(files: File[], onUploaded: (file: { fileNodeId: string }) => void) {
  if (files.length === 0) return;
  const workspace = await filesApi.list(undefined, false, true);
  const parentId = workspace.data.context?.parentId;
  if (!parentId) throw new Error('Không tìm thấy thư mục được phép lưu tệp.');
  for (const file of files) {
    const uploaded = await filesApi.upload(file, file.name, parentId, 'workflow-requests');
    onUploaded({ fileNodeId: uploaded.data.file.id });
  }
}

const INITIAL_PENDING_REQUESTS: ApprovalRequestItem[] = [];

export const WorkflowRequestsModule: React.FC = () => {
  const [data, setData] = useState<ApprovalRequestItem[]>(INITIAL_PENDING_REQUESTS);
  const [saving, setSaving] = useState(false);
  const [resubmittingItem, setResubmittingItem] = useState<ApprovalRequestItem | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [blueprints, setBlueprints] = useState<Array<{ workflowCode: string; workflowName: string; category: ApprovalRequestItem['category']; status: string; approvalFlow?: unknown[]; formFields?: WorkflowFormField[] }>>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const isAdmin = user?.role === 'ADMIN';

  useEffect(() => {
    const refresh = () => {
      const list = dataService.getGenericData('workflow_requests');
      const configured = dataService.getGenericData('workflow_blueprints');
      setData(Array.isArray(list) ? list : []);
      setBlueprints(Array.isArray(configured) ? configured : []);
    };
    refresh();
    const unsub = dataService.subscribe(refresh);
    return unsub;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const [searchText, setSearchText] = useState('');
  const [tabFilter, setTabFilter] = useState<string>('pending_my');

  // Modal Create Request
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();
  const [selectedWorkflowCode, setSelectedWorkflowCode] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [downloadingFileId, setDownloadingFileId] = useState('');

  // Modal E-Signature Token PKI
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [signingItem, setSigningItem] = useState<ApprovalRequestItem | null>(null);
  const [signMethod, setSignMethod] = useState<'token_pki' | 'cloud_ca' | 'internal_esign'>('internal_esign');
  const [tokenPin, setTokenPin] = useState('');
  const [approvalNote, setApprovalNote] = useState('');

  // Modal Reject / Request Modification
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectItem, setRejectItem] = useState<ApprovalRequestItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectType, setRejectType] = useState<'reject' | 'modify'>('modify');

  // Detail Drawer
  const [detailItem, setDetailItem] = useState<ApprovalRequestItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Metrics
  const pendingMyCount = data.filter((d) => d.status === 'Chờ bạn ký duyệt' && (isAdmin || d.canDecide)).length;
  const remainingHours = (item: ApprovalRequestItem) => {
    if (item.status !== 'Chờ bạn ký duyệt') return 0;
    const deadline = Date.parse(item.slaDeadlineAt || item.slaDeadline || '');
    return Number.isFinite(deadline) ? Math.max(0, (deadline - clockMs) / 3_600_000) : Math.max(0, Number(item.slaHoursLeft) || 0);
  };
  const slaText = (item: ApprovalRequestItem) => item.status !== 'Chờ bạn ký duyệt'
    ? 'Đã kết thúc'
    : remainingHours(item) > 0 ? `Còn ${remainingHours(item).toFixed(1)} giờ` : 'Quá hạn';
  const urgentCount = data.filter((d) => d.status === 'Chờ bạn ký duyệt' && (isAdmin || d.canDecide) && d.priority === 'Khẩn cấp (P1)' && remainingHours(d) <= 2).length;
  const totalPendingBudget = data
    .filter((d) => d.status === 'Chờ bạn ký duyệt' && (isAdmin || d.canDecide))
    .reduce((sum, d) => sum + (Number(d.budgetAmount) || 0), 0);
  const approvedTodayCount = data.filter((d) => d.status === 'Đã phê duyệt' || d.status === 'Đã ký số phê duyệt').length;
  const canRejectRequest = (item: ApprovalRequestItem) => item.approvalCanRejectLevels?.[Math.max(0, Number(item.currentLevel || 1) - 1)] !== false;
  const activeBlueprints = blueprints.filter((blueprint) => blueprint.status === 'Đang áp dụng');
  const workflowOptions = activeBlueprints.length
    ? activeBlueprints.map((blueprint) => ({ label: `${blueprint.workflowCode}: ${blueprint.workflowName}`, value: blueprint.workflowCode }))
    : [
        { label: 'WF-PURCHASE-01: Mua sắm thiết bị IT & Server IDC', value: 'WF-PURCHASE-01' },
        { label: 'WF-PAYMENT-02: Tạm ứng & Thanh toán chi phí', value: 'WF-PAYMENT-02' },
        { label: 'WF-CONTRACT-03: Thẩm định hợp đồng kinh tế', value: 'WF-CONTRACT-03' },
        { label: 'WF-LEAVE-04: Nghỉ phép năm & Công tác ngoại tỉnh', value: 'WF-LEAVE-04' },
      ];
  const selectedBlueprint = activeBlueprints.find((blueprint) => blueprint.workflowCode === (resubmittingItem?.workflowCode || selectedWorkflowCode));
  const currentFormFields = resubmittingItem?.approvalFormFields || selectedBlueprint?.formFields || [];
  const customFormFields = currentFormFields.filter((field) => !['title', 'content', 'attachments'].includes(field.fieldName));
  const attachmentField = currentFormFields.find((field) => field.fieldName === 'attachments');

  const resetSelectedFiles = () => {
    setSelectedFiles([]);
    setFileInputKey((key) => key + 1);
  };

  const closeCreateModal = () => {
    setCreateModalOpen(false);
    setResubmittingItem(null);
    createForm.resetFields();
    resetSelectedFiles();
  };

  const handleOpenCreateModal = () => {
    setResubmittingItem(null);
    createForm.resetFields();
    const firstActive = blueprints.find((blueprint) => blueprint.status === 'Đang áp dụng');
    const initialWorkflowCode = firstActive?.workflowCode || 'WF-PURCHASE-01';
    setSelectedWorkflowCode(initialWorkflowCode);
    resetSelectedFiles();
    createForm.setFieldsValue({
      code: `REQ-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
      workflowCode: initialWorkflowCode,
      category: firstActive?.category || 'Mua sắm & Tài sản',
      priority: 'Cao (P2)',
      budgetAmount: 0,
    });
    setCreateModalOpen(true);
  };

  useEffect(() => {
    const workflowCode = (location.state as { workflowCode?: string } | null)?.workflowCode;
    if (!workflowCode) return;
    handleOpenCreateModal();
    createForm.setFieldsValue({ workflowCode });
    setSelectedWorkflowCode(workflowCode);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.pathname, location.state, blueprints]);

  const handleCreateRequest = async (values: any) => {
    const schema = resubmittingItem?.approvalFormFields || selectedBlueprint?.formFields || [];
    const formData = Object.fromEntries(schema
      .filter((field) => !['title', 'content', 'attachments'].includes(field.fieldName))
      .map((field) => [field.fieldName, values[field.fieldName] ?? '']));
    const existingAttachmentCount = resubmittingItem?.attachments?.length || 0;
    if (existingAttachmentCount + selectedFiles.length > 20) {
      message.error('Tổng số tệp đính kèm không được vượt quá 20.');
      return;
    }
    if (attachmentField?.required && existingAttachmentCount + selectedFiles.length === 0) {
      message.error(`${attachmentField.label} là bắt buộc.`);
      return;
    }
    if (attachmentField?.type.toLowerCase().includes('pdf') && selectedFiles.some((file) => !file.name.toLowerCase().endsWith('.pdf'))) {
      message.error('Trường này chỉ nhận tệp PDF.');
      return;
    }
    if (selectedFiles.some((file) => file.size <= 0 || file.size > 50 * 1024 * 1024)) {
      message.error('Mỗi tệp phải có dung lượng lớn hơn 0 và không vượt quá 50 MB.');
      return;
    }
    const uploadedFiles: Array<{ fileNodeId: string }> = [];
    if (resubmittingItem) {
      setSaving(true);
      try {
        await uploadWorkflowFiles(selectedFiles, (file) => uploadedFiles.push(file));
        await collectionsApi.patch<ApprovalRequestPatch>('workflow_requests', resubmittingItem.key, {
          resubmission: {
            summaryDetails: values.summaryDetails,
            budgetAmount: Number(values.budgetAmount) || 0,
            response: values.supplementalResponse,
            formData,
            attachments: uploadedFiles,
          },
        });
        const refreshed = await dataService.refreshGenericData('workflow_requests');
        setData(refreshed);
        const updated = refreshed.find((item) => item.key === resubmittingItem.key) || null;
        if (updated) setDetailItem(updated);
        message.success(`Đã nộp bổ sung hồ sơ ${resubmittingItem.code}; hồ sơ quay lại cấp ${updated?.currentLevel || resubmittingItem.currentLevel}.`);
        setCreateModalOpen(false);
        setResubmittingItem(null);
        createForm.resetFields();
        resetSelectedFiles();
      } catch (error) {
        if (Number((error as { response?: { status?: number } })?.response?.status) >= 400) {
          await Promise.allSettled(uploadedFiles.map((file) => filesApi.remove(file.fileNodeId)));
        }
        message.error(error instanceof Error ? error.message : 'Không thể nộp bổ sung hồ sơ.');
      } finally {
        setSaving(false);
      }
      return;
    }
    const requestBlueprint = blueprints.find((blueprint) => blueprint.workflowCode === values.workflowCode && blueprint.status === 'Đang áp dụng');
    setSaving(true);
    try {
      await uploadWorkflowFiles(selectedFiles, (file) => uploadedFiles.push(file));
      await collectionsApi.create<ApprovalRequestItem>('workflow_requests', {
        ...values,
        key: values.code,
        totalLevels: requestBlueprint?.approvalFlow?.length || 3,
        category: requestBlueprint?.category || values.category || ({
          'WF-PAYMENT-02': 'Tài chính & Thanh toán',
          'WF-CONTRACT-03': 'Hợp đồng & Pháp chế',
          'WF-LEAVE-04': 'Nhân sự & Phúc lợi',
        }[values.workflowCode] || 'Mua sắm & Tài sản'),
        budgetAmount: Number(values.budgetAmount) || 0,
        attachments: uploadedFiles,
        formData,
      });
      setData(await dataService.refreshGenericData('workflow_requests'));
      message.success(`Đã gửi hồ sơ ${values.code} vào hàng chờ phê duyệt.`);
      setCreateModalOpen(false);
      createForm.resetFields();
      resetSelectedFiles();
    } catch (error) {
      if (Number((error as { response?: { status?: number } })?.response?.status) >= 400) {
        await Promise.allSettled(uploadedFiles.map((file) => filesApi.remove(file.fileNodeId)));
      }
      message.error(error instanceof Error ? error.message : 'Không thể tạo hồ sơ quy trình.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenResubmission = (item: ApprovalRequestItem) => {
    setResubmittingItem(item);
    setSelectedWorkflowCode(item.workflowCode);
    resetSelectedFiles();
    createForm.resetFields();
    createForm.setFieldsValue({
      code: item.code,
      workflowCode: item.workflowCode,
      workflowName: item.workflowName,
      category: item.category,
      priority: item.priority,
      department: item.department,
      budgetAmount: item.budgetAmount,
      summaryDetails: item.summaryDetails,
      supplementalResponse: '',
      ...(item.formData || {}),
    });
    setCreateModalOpen(true);
  };

  const handleDownloadAttachment = async (attachment: RequestAttachment) => {
    if (!attachment.fileNodeId) {
      message.error('Tệp này chưa được liên kết với kho lưu trữ.');
      return;
    }
    setDownloadingFileId(attachment.fileNodeId);
    try {
      const response = await filesApi.download(attachment.fileNodeId);
      downloadFile(attachment.fileName, response.data);
    } catch (error) {
      message.error(error instanceof Error ? error.message : `Không thể tải tệp ${attachment.fileName}.`);
    } finally {
      setDownloadingFileId('');
    }
  };

  const handleOpenSignModal = (record: ApprovalRequestItem) => {
    setSigningItem(record);
    setApprovalNote('');
    setSignModalOpen(true);
  };

  const handleExecuteSign = async () => {
    if (!signingItem) return;
    if (signingItem.tokenRequired) {
      message.error('Quy trình yêu cầu ký CA; nhà cung cấp ký số chưa được cấu hình.');
      return;
    }
    if (signMethod !== 'internal_esign') {
      message.error('Nhà cung cấp ký số chưa được cấu hình; chưa ghi nhận phê duyệt.');
      return;
    }
    setSaving(true);
    try {
      await collectionsApi.patch<ApprovalRequestItem>('workflow_requests', signingItem.key, { decision: 'Đã phê duyệt', approvalNote });
      const refreshed = await dataService.refreshGenericData('workflow_requests');
      setData(refreshed);
      const updated = refreshed.find((item) => item.key === signingItem.key) || null;
      if (updated) setDetailItem(updated);
      message.success(updated?.status === 'Đã phê duyệt'
        ? `Đã hoàn tất phê duyệt nội bộ hồ sơ ${signingItem.code}.`
        : `Đã phê duyệt cấp ${signingItem.currentLevel}; hồ sơ chuyển sang cấp tiếp theo.`);
      setSignModalOpen(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể ghi nhận quyết định phê duyệt.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenRejectModal = (record: ApprovalRequestItem, type: 'reject' | 'modify') => {
    setRejectItem(record);
    setRejectType(type);
    setRejectReason('');
    setRejectModalOpen(true);
  };

  const handleExecuteReject = async () => {
    if (!rejectItem) return;
    setSaving(true);
    try {
      const decision = rejectType === 'modify' ? 'Yêu cầu bổ sung' : 'Từ chối';
      await collectionsApi.patch<ApprovalRequestItem>('workflow_requests', rejectItem.key, { decision, approvalNote: rejectReason });
      const refreshed = await dataService.refreshGenericData('workflow_requests');
      setData(refreshed);
      const updated = refreshed.find((item) => item.key === rejectItem.key) || null;
      if (updated) setDetailItem(updated);
      message.success(`Đã ghi nhận quyết định “${decision}” cho hồ sơ ${rejectItem.code}.`);
      setRejectModalOpen(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể ghi nhận quyết định xử lý.');
    } finally {
      setSaving(false);
    }
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.workflowName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.requester || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchText.toLowerCase());

    let matchTab = true;
    if (tabFilter === 'pending_my') matchTab = item.status === 'Chờ bạn ký duyệt' && (isAdmin || item.canDecide === true);
    if (tabFilter === 'urgent_p1') matchTab = item.priority === 'Khẩn cấp (P1)';
    if (tabFilter === 'approved') matchTab = item.status === 'Đã phê duyệt' || item.status === 'Đã ký số phê duyệt';
    if (tabFilter === 'rejected') matchTab = item.status === 'Đã từ chối' || item.status === 'Yêu cầu bổ sung';

    return matchSearch && matchTab;
  });

  const exportRequests = () => downloadFile(`Ho_so_quy_trinh_${new Date().toISOString().slice(0, 10)}.xlsx`, generateValidXlsxBlob([
    ['Mã hồ sơ', 'Mã quy trình', 'Tiêu đề', 'Phân loại', 'Người gửi', 'Phòng ban', 'Cấp hiện tại', 'Tổng cấp', 'Dự toán', 'Ưu tiên', 'Trạng thái', 'Ngày gửi'],
    ...filteredData.map((item) => [item.code, item.workflowCode, item.workflowName, item.category, item.requester, item.department, item.currentLevel, item.totalLevels, item.budgetAmount, item.priority, item.status === 'Đã ký số phê duyệt' ? 'Đã phê duyệt' : item.status, item.submittedAt]),
  ]));

  const exportRequest = (item: ApprovalRequestItem) => downloadFile(
    `${item.code}_Phieu_trinh_duyet.pdf`,
    generateValidPdfBlob('PHIẾU TRÌNH DUYỆT', item.code, [
      `Quy trình: ${item.workflowCode}`,
      `Tiêu đề: ${item.workflowName}`,
      `Người gửi: ${item.requester}`,
      `Phòng ban: ${item.department}`,
      `Dự toán: ${item.budgetAmount.toLocaleString('vi-VN')} VND`,
      `Ưu tiên: ${item.priority}`,
      `Trạng thái: ${item.status === 'Đã ký số phê duyệt' ? 'Đã phê duyệt' : item.status}`,
      `Nội dung: ${item.summaryDetails}`,
      ...(item.approvalHistory || []).map((event) => `Cấp ${event.level}: ${event.approver} - ${event.decision} - ${event.timestamp}`),
      'Phiếu được tạo từ dữ liệu hồ sơ; không thay thế chữ ký số CA.',
    ])
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metrics Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>{isAdmin ? 'Hồ sơ chờ bạn ký duyệt' : 'Hồ sơ đang chờ xử lý'}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: pendingMyCount > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {pendingMyCount} hồ sơ
          </div>
          <div style={{ fontSize: 11.5, color: pendingMyCount > 0 ? '#DC2626' : '#16A34A', marginTop: 2 }}>
            {pendingMyCount > 0 ? 'Đang nằm trong hàng chờ xử lý' : 'Không có việc tồn đọng'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hồ sơ ưu tiên P1</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: urgentCount > 0 ? '#D97706' : '#009688', marginTop: 4 }}>
            {urgentCount} tờ trình P1
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Đang chờ xử lý</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng ngân sách đang chờ duyệt</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalPendingBudget.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Thuộc thẩm quyền phê duyệt chi</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã phê duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {approvedTodayCount} hồ sơ
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Phê duyệt nội bộ được lưu lịch sử</div>
        </div>
      </div>

      {/* Navigation Sub-Tabs & Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả hồ sơ' },
            { key: 'pending_my', label: `${isAdmin ? 'Chờ bạn ký duyệt' : 'Đang chờ xử lý'} (${pendingMyCount})` },
            { key: 'urgent_p1', label: `Khẩn cấp P1 (${urgentCount})` },
            { key: 'approved', label: 'Đã phê duyệt' },
            { key: 'rejected', label: 'Từ chối / Bổ sung' },
          ].map((tab) => (
            <Button
              key={tab.key}
              type={tabFilter === tab.key ? 'primary' : 'default'}
              onClick={() => setTabFilter(tab.key)}
              style={{
                backgroundColor: tabFilter === tab.key ? '#009688' : '#FFFFFF',
                borderColor: tabFilter === tab.key ? '#009688' : '#D1D5DB',
                fontWeight: tabFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã yêu cầu, nội dung, người gửi..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280, borderRadius: 6 }}
            allowClear
          />
          <Button icon={<DownloadOutlined />} disabled={!filteredData.length} onClick={exportRequests}>
            Xuất Excel
          </Button>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenCreateModal}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              {isAdmin ? 'Tạo yêu cầu trình ký' : 'Tạo hồ sơ xin phê duyệt'}
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={[
            {
              title: 'Mã hồ sơ & Mức độ',
              key: 'code',
              width: 170,
              render: (_: any, r: ApprovalRequestItem) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BranchesOutlined /> {r.code}
                  </span>
                  <Tag
                    color={r.priority.includes('P1') ? 'error' : r.priority.includes('P2') ? 'warning' : 'blue'}
                    style={{ marginTop: 3, fontSize: 11 }}
                  >
                    {r.priority}
                  </Tag>
                  {r.tokenRequired && <Tag color="purple" style={{ marginTop: 3, fontSize: 10 }}>Cần ký CA</Tag>}
                </div>
              ),
            },
            {
              title: 'Nội dung tờ trình & Phân loại',
              key: 'info',
              render: (_: any, r: ApprovalRequestItem) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.workflowName}</strong>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{r.summaryDetails}</div>
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>
                    Người gửi: <strong>{r.requester}</strong> ({r.department}) · {r.submittedAt}
                  </div>
                  {r.budgetAmount > 0 && (
                    <div style={{ fontSize: 12, color: '#16A34A', fontWeight: 700, marginTop: 2 }}>
                      Kinh phí đề xuất: {r.budgetAmount.toLocaleString('vi-VN')} ₫
                    </div>
                  )}
                </div>
              ),
            },
            {
              title: 'Cấp duyệt & Hạn SLA',
              key: 'step',
              width: 180,
              render: (_: any, r: ApprovalRequestItem) => (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>
                    Cấp {r.currentLevel}/{r.totalLevels}: {r.roleRequirement}
                  </div>
                  {r.delegatedFor && <div style={{ fontSize: 11, color: '#7C3AED', marginTop: 2 }}>Ủy quyền từ {r.delegatedFor}</div>}
                  {!r.delegatedFor && r.currentApprover && <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Phụ trách: {r.currentApprover}</div>}
                  <div style={{ fontSize: 12, fontWeight: 700, color: remainingHours(r) <= 2 && r.status === 'Chờ bạn ký duyệt' ? '#DC2626' : '#009688', marginTop: 3 }}>
                    <ClockCircleOutlined /> {slaText(r)}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    <PaperClipOutlined style={{ marginRight: 4 }} />{(r.attachments || []).length} tệp đính kèm
                  </div>
                </div>
              ),
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              width: 160,
              render: (s: string) => {
                let col = 'default';
                if (s === 'Chờ bạn ký duyệt') col = 'error';
                if (s === 'Đã phê duyệt' || s === 'Đã ký số phê duyệt') col = 'success';
                if (s === 'Đã từ chối') col = 'default';
                if (s === 'Yêu cầu bổ sung') col = 'warning';
                const label = s === 'Đã ký số phê duyệt' ? 'Đã phê duyệt' : s;
                return <Tag color={col} style={{ fontWeight: s === 'Chờ bạn ký duyệt' ? 700 : 500 }}>{label}</Tag>;
              },
            },
            {
              title: 'Hành động',
              key: 'actions',
              width: 320,
              render: (_: any, r: ApprovalRequestItem) => (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setDrawerOpen(true);
                    }}
                    title="Xem toàn bộ hồ sơ & chứng từ"
                  >
                    Xem
                  </Button>

                  {r.status === 'Chờ bạn ký duyệt' && (isAdmin || r.canDecide) ? (
                    <>
                      <Button
                        size="small"
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        onClick={() => handleOpenSignModal(r)}
                        style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }}
                      >
                        Phê duyệt
                      </Button>
                      {canRejectRequest(r) && (
                        <>
                          <Button
                            size="small"
                            icon={<EditOutlined />}
                            title="Yêu cầu người gửi bổ sung hồ sơ"
                            onClick={() => handleOpenRejectModal(r, 'modify')}
                            style={{ color: '#B45309', borderColor: '#F59E0B' }}
                          >
                            Yêu cầu bổ sung
                          </Button>
                          <Button
                            size="small"
                            danger
                            icon={<CloseCircleOutlined />}
                            onClick={() => handleOpenRejectModal(r, 'reject')}
                          >
                            Từ chối
                          </Button>
                        </>
                      )}
                    </>
                  ) : r.status === 'Chờ bạn ký duyệt' ? (
                    <span style={{ fontSize: 11.5, color: '#64748B', fontStyle: 'italic' }}>Đang chờ phê duyệt</span>
                  ) : r.status === 'Yêu cầu bổ sung' && r.requesterId === user?.id ? (
                    <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => handleOpenResubmission(r)} style={{ backgroundColor: '#D97706', borderColor: '#D97706' }}>
                      Nộp bổ sung
                    </Button>
                  ) : (
                    <span style={{ fontSize: 11.5, color: '#64748B', fontStyle: 'italic' }}>
                      {r.status === 'Yêu cầu bổ sung' ? 'Chờ người gửi bổ sung' : 'Đã hoàn tất'}
                    </span>
                  )}
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      <Modal
        title="Ghi nhận quyết định phê duyệt"
        open={signModalOpen}
        onCancel={() => setSignModalOpen(false)}
        footer={null}
        width={620}
      >
        {signingItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
            <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 700 }}>{signingItem.code} · {signingItem.workflowCode}</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{signingItem.workflowName}</div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                Người trình: <strong>{signingItem.requester}</strong> ({signingItem.department})
              </div>
              {signingItem.budgetAmount > 0 && (
                <div style={{ fontSize: 13, color: '#16A34A', fontWeight: 800, marginTop: 4 }}>
                  Số tiền duyệt chi: {signingItem.budgetAmount.toLocaleString('vi-VN')} ₫
                </div>
              )}
            </div>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 6 }}>
                Phương thức ký xác thực bảo mật:
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                <div
                  onClick={() => setSignMethod('token_pki')}
                  style={{
                    border: `1.5px solid ${signMethod === 'token_pki' ? '#009688' : '#E2E8F0'}`,
                    borderRadius: 6,
                    padding: 10,
                    cursor: 'pointer',
                    background: signMethod === 'token_pki' ? '#E0F2F1' : '#FFFFFF',
                    textAlign: 'center',
                  }}
                >
                  <KeyOutlined style={{ fontSize: 20, color: '#009688' }} />
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>USB Token PKI</div>
                  <div style={{ fontSize: 10.5, color: '#64748B' }}>Viettel / VNPT CA</div>
                </div>

                <div
                  onClick={() => setSignMethod('cloud_ca')}
                  style={{
                    border: `1.5px solid ${signMethod === 'cloud_ca' ? '#009688' : '#E2E8F0'}`,
                    borderRadius: 6,
                    padding: 10,
                    cursor: 'pointer',
                    background: signMethod === 'cloud_ca' ? '#E0F2F1' : '#FFFFFF',
                    textAlign: 'center',
                  }}
                >
                  <SafetyCertificateOutlined style={{ fontSize: 20, color: '#2563EB' }} />
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>Cloud CA (HSM)</div>
                  <div style={{ fontSize: 10.5, color: '#64748B' }}>Ký số đám mây</div>
                </div>

                <div
                  onClick={() => setSignMethod('internal_esign')}
                  style={{
                    border: `1.5px solid ${signMethod === 'internal_esign' ? '#009688' : '#E2E8F0'}`,
                    borderRadius: 6,
                    padding: 10,
                    cursor: 'pointer',
                    background: signMethod === 'internal_esign' ? '#E0F2F1' : '#FFFFFF',
                    textAlign: 'center',
                  }}
                >
                  <CheckCircleOutlined style={{ fontSize: 20, color: '#16A34A' }} />
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>Chữ ký nội bộ</div>
                  <div style={{ fontSize: 10.5, color: '#64748B' }}>Session Token</div>
                </div>
              </div>
              {signMethod !== 'internal_esign' && (
                <Alert style={{ marginTop: 8 }} type="warning" showIcon message="Nhà cung cấp ký số chưa được cấu hình. Phê duyệt sẽ không được ghi nhận qua CA." />
              )}
              {signingItem.tokenRequired && (
                <Alert style={{ marginTop: 8 }} type="error" showIcon message="Tầng ngân sách yêu cầu ký CA. Nhà cung cấp chưa kết nối nên chưa thể phê duyệt hồ sơ này." />
              )}
            </div>

            {signMethod === 'token_pki' && (
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>
                  Mã PIN Thiết Bị Token:
                </label>
                <Input.Password
                  value={tokenPin}
                  onChange={(e) => setTokenPin(e.target.value)}
                  placeholder="Nhập mã PIN Token..."
                />
              </div>
            )}

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>
                Ý kiến / Nhận xét phê duyệt:
              </label>
              <Input.TextArea
                rows={2}
                value={approvalNote}
                onChange={(e) => setApprovalNote(e.target.value)}
                placeholder="Nhập ý kiến lãnh đạo chỉ đạo thực hiện..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <Button onClick={() => setSignModalOpen(false)}>Hủy bỏ</Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleExecuteSign}
                disabled={saving || signMethod !== 'internal_esign' || signingItem.tokenRequired}
                style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }}
              >
                Ghi nhận phê duyệt nội bộ
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Từ Chối hoặc Yêu Cầu Bổ Sung Hồ Sơ */}
      <Modal
        title={rejectType === 'modify' ? 'Yêu Cầu Bổ Sung Hồ Sơ' : 'Từ Chối Phê Duyệt Hồ Sơ'}
        open={rejectModalOpen}
        onCancel={() => setRejectModalOpen(false)}
        footer={null}
        width={500}
      >
        {rejectItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 10 }}>
            <Alert
              type={rejectType === 'modify' ? 'warning' : 'error'}
              message={
                rejectType === 'modify'
                  ? 'Hồ sơ sẽ được chuyển trả lại người gửi để cập nhật thông tin và trình duyệt lại.'
                  : 'Hồ sơ sẽ bị chấm dứt quy trình và lưu nhật ký từ chối.'
              }
              showIcon
            />

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>
                Lý do chi tiết:
              </label>
              <Input.TextArea
                rows={3}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Nhập lý do cụ thể gửi thông báo cho người lập tờ trình..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <Button onClick={() => setRejectModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                danger={rejectType === 'reject'}
                onClick={handleExecuteReject}
                disabled={saving}
                style={{ backgroundColor: rejectType === 'modify' ? '#D97706' : undefined, borderColor: rejectType === 'modify' ? '#D97706' : undefined }}
              >
                {rejectType === 'modify' ? 'Gửi yêu cầu bổ sung' : 'Xác nhận từ chối'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL: Tạo Yêu Cầu Trình Ký Mới 100% trường nhập */}
      <Modal
        title={resubmittingItem ? `Nộp bổ sung hồ sơ ${resubmittingItem.code}` : 'Khởi tạo hồ sơ trình duyệt'}
        open={createModalOpen}
        onCancel={closeCreateModal}
        footer={null}
        width={760}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateRequest} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã hồ sơ trình ký" rules={[{ required: true }]}>
              <Input disabled={Boolean(resubmittingItem)} />
            </Form.Item>
            <Form.Item name="workflowCode" label="Chọn luồng quy trình áp dụng" rules={[{ required: true }]}>
              <Select
                options={workflowOptions}
                disabled={Boolean(resubmittingItem)}
                onChange={(value) => {
                  customFormFields.forEach((field) => createForm.setFieldsValue({ [field.fieldName]: undefined }));
                  setSelectedWorkflowCode(value);
                  resetSelectedFiles();
                  const blueprint = activeBlueprints.find((item) => item.workflowCode === value);
                  if (blueprint) createForm.setFieldsValue({ category: blueprint.category });
                }}
              />
            </Form.Item>
            <Form.Item name="priority" label="Mức độ ưu tiên" rules={[{ required: true }]}>
              <Select
                disabled={Boolean(resubmittingItem)}
                options={[
                  { label: 'Khẩn cấp (P1) - SLA 2h', value: 'Khẩn cấp (P1)' },
                  { label: 'Cao (P2) - SLA 4h', value: 'Cao (P2)' },
                  { label: 'Bình thường (P3) - SLA 8h', value: 'Bình thường (P3)' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="workflowName" label={currentFormFields.find((field) => field.fieldName === 'title')?.label || 'Tiêu đề văn bản / Tờ trình'} rules={[{ required: true, message: 'Nhập tiêu đề' }]}>
            <Input disabled={Boolean(resubmittingItem)} placeholder="Ví dụ: Tờ trình đề xuất mua sắm 05 màn hình đồ họa Dell UltraSharp 4K" />
          </Form.Item>

          {resubmittingItem ? (
            <Alert type="warning" showIcon message={resubmittingItem.approvalHistory?.[resubmittingItem.approvalHistory.length - 1]?.comments || 'Cập nhật hồ sơ theo ý kiến người duyệt, sau đó gửi lại ở cấp hiện tại.'} />
          ) : null}

          <Form.Item name="summaryDetails" label={resubmittingItem ? 'Nội dung hồ sơ đã cập nhật' : currentFormFields.find((field) => field.fieldName === 'content')?.label || 'Nội dung tóm tắt & Sự cần thiết đầu tư'} rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Trình bày lý do, hiệu quả mang lại và căn cứ pháp lý..." />
          </Form.Item>

          {customFormFields.map((field) => {
            const fieldType = field.type.toLowerCase();
            const control = fieldType.includes('dài') || fieldType.includes('long')
              ? <Input.TextArea rows={3} />
              : <Input type={fieldType.includes('số') || fieldType.includes('number') ? 'number' : fieldType.includes('ngày') || fieldType.includes('date') ? 'date' : 'text'} />;
            return (
              <Form.Item key={field.fieldName} name={field.fieldName} label={field.label} rules={[{ required: field.required, message: `Nhập ${field.label.toLowerCase()}` }]}>
                {control}
              </Form.Item>
            );
          })}

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="workflow-request-attachments" style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>
              {attachmentField?.label || 'Tài liệu đính kèm'}{attachmentField?.required ? ' *' : ''}
            </label>
            <input
              key={fileInputKey}
              id="workflow-request-attachments"
              type="file"
              multiple
              accept={attachmentField?.type.toLowerCase().includes('pdf') ? '.pdf,application/pdf' : undefined}
              onChange={(event) => {
                const files = Array.from(event.target.files || []);
                const existingCount = resubmittingItem?.attachments?.length || 0;
                if (existingCount + files.length > 20) {
                  message.error('Tổng số tệp đính kèm không được vượt quá 20.');
                  resetSelectedFiles();
                  return;
                }
                if (files.some((file) => file.size <= 0 || file.size > 50 * 1024 * 1024)) {
                  message.error('Mỗi tệp phải có dung lượng lớn hơn 0 và không vượt quá 50 MB.');
                  resetSelectedFiles();
                  return;
                }
                if (attachmentField?.type.toLowerCase().includes('pdf') && files.some((file) => !file.name.toLowerCase().endsWith('.pdf'))) {
                  message.error('Trường này chỉ nhận tệp PDF.');
                  resetSelectedFiles();
                  return;
                }
                setSelectedFiles(files);
              }}
              style={{ display: 'block', width: '100%', padding: 10, border: '1px solid #D0D5DD', borderRadius: 6, background: '#FFFFFF' }}
            />
            <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 5 }}>
              Tối đa 20 tệp, mỗi tệp không quá 50 MB. Tệp hiện có: {resubmittingItem?.attachments?.length || 0}.
            </div>
            {selectedFiles.length > 0 && (
              <div style={{ display: 'grid', gap: 4, marginTop: 8 }}>
                {selectedFiles.map((file, index) => <div key={`${file.name}-${index}`} style={{ fontSize: 12, color: '#334155' }}>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</div>)}
              </div>
            )}
          </div>

          {resubmittingItem ? (
            <Form.Item name="supplementalResponse" label="Phản hồi yêu cầu bổ sung" rules={[{ required: true, message: 'Nêu rõ nội dung đã bổ sung' }]}>
              <Input.TextArea rows={2} placeholder="Mô tả thông tin đã cập nhật hoặc tài liệu đã bổ sung..." />
            </Form.Item>
          ) : null}

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="department" label="Đơn vị / Phòng ban" rules={[{ required: true }]}>
              <Input disabled={Boolean(resubmittingItem)} />
            </Form.Item>
            <Form.Item name="budgetAmount" label="Dự toán kinh phí (VNĐ)">
              <Input type="number" min={0} step={10000000} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={closeCreateModal}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {resubmittingItem ? 'Nộp bổ sung và gửi lại' : 'Trình duyệt hồ sơ'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Hồ Sơ Đầy Đủ & Audit Trail */}
      <Drawer
        title="Thẩm Định Chi Tiết Hồ Sơ &amp; Chứng Từ Điện Tử"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={680}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Box */}
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.code} · {detailItem.workflowCode}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.workflowName}</div>
                </div>
                <Tag color={detailItem.status === 'Chờ bạn ký duyệt' ? 'error' : detailItem.status === 'Yêu cầu bổ sung' ? 'warning' : detailItem.status === 'Đã từ chối' ? 'default' : 'success'}>
                  {detailItem.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Người gửi: <strong>{detailItem.requester}</strong> ({detailItem.department}) · {detailItem.submittedAt}
              </div>
              {detailItem.delegatedFor && <div style={{ fontSize: 12, color: '#7C3AED', marginTop: 4 }}>Bạn đang xử lý theo ủy quyền của {detailItem.delegatedFor}.</div>}
              {detailItem.budgetAmount > 0 && (
                <div style={{ fontSize: 14, color: '#16A34A', fontWeight: 800, marginTop: 4 }}>
                  Tổng ngân sách đề xuất: {detailItem.budgetAmount.toLocaleString('vi-VN')} ₫
                </div>
              )}
            </div>

            {/* Summary Details */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Nội dung chi tiết tờ trình:</div>
              <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.6 }}>{detailItem.summaryDetails}</div>
            </div>

            {detailItem.approvalFormFields?.some((field) => !['title', 'content', 'attachments'].includes(field.fieldName)) && (
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
                <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Thông tin biểu mẫu quy trình</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {detailItem.approvalFormFields.filter((field) => !['title', 'content', 'attachments'].includes(field.fieldName)).map((field) => (
                    <div key={field.fieldName} style={{ fontSize: 12.5, color: '#334155' }}>
                      <strong>{field.label}:</strong> {String(detailItem.formData?.[field.fieldName] ?? '—') || '—'}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Attachments Section */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <PaperClipOutlined style={{ color: '#2563EB' }} /> Danh Sách Chứng Từ &amp; Tệp Đính Kèm ({(detailItem.attachments || []).length}):
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(detailItem.attachments || []).map((att, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 12px',
                      background: '#F8FAFC',
                      borderRadius: 6,
                      border: '1px solid #E2E8F0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FilePdfOutlined style={{ color: '#DC2626', fontSize: 18 }} />
                      <div>
                        <div style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A' }}>{att.fileName}</div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>
                          Dung lượng: {att.fileSize} · Tải lên: {att.uploadTime}
                        </div>
                      </div>
                    </div>
                    <Button
                      size="small"
                      icon={<DownloadOutlined />}
                      loading={downloadingFileId === att.fileNodeId}
                      onClick={() => void handleDownloadAttachment(att)}
                    >
                      Tải xuống
                    </Button>
                  </div>
                ))}
                {!detailItem.attachments?.length && <div style={{ fontSize: 12, color: '#64748B' }}>Hồ sơ chưa có tệp đính kèm.</div>}
              </div>
            </div>

            {detailItem.approvalHistory?.length ? (
              <div style={{ border: '1px solid #D1FAE5', background: '#ECFDF5', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#166534', fontWeight: 800, fontSize: 13 }}>
                  <SafetyCertificateOutlined style={{ fontSize: 20 }} /> LỊCH SỬ PHÊ DUYỆT NỘI BỘ
                </div>
                <div style={{ display: 'grid', gap: 8, marginTop: 8 }}>
                  {detailItem.approvalHistory.map((event) => (
                    <div key={event.txCode} style={{ fontSize: 12, color: '#166534', lineHeight: 1.6 }}>
                      Cấp {event.level}: <strong>{event.approver}</strong> · {event.decision} · {new Date(event.timestamp).toLocaleString('vi-VN')}
                      {event.comments ? <div>Ý kiến: {event.comments}</div> : null}
                      <div style={{ fontSize: 10.5, color: '#64748B', wordBreak: 'break-all' }}>SHA-256: {event.sha256Hash}</div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => exportRequest(detailItem)}
                style={{ flex: 1 }}
              >
                In Phiếu Trình Ký (PDF)
              </Button>
              {detailItem.status === 'Chờ bạn ký duyệt' && (isAdmin || detailItem.canDecide) && (
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => {
                    setDrawerOpen(false);
                    handleOpenSignModal(detailItem);
                  }}
                  style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', flex: 1 }}
                >
                  Phê duyệt ngay
                </Button>
              )}
              {detailItem.status === 'Chờ bạn ký duyệt' && (isAdmin || detailItem.canDecide) && canRejectRequest(detailItem) && (
                <>
                  <Button
                    icon={<EditOutlined />}
                    onClick={() => {
                      setDrawerOpen(false);
                      handleOpenRejectModal(detailItem, 'modify');
                    }}
                    style={{ color: '#B45309', borderColor: '#F59E0B', flex: 1 }}
                  >
                    Yêu cầu bổ sung
                  </Button>
                  <Button
                    danger
                    icon={<CloseCircleOutlined />}
                    onClick={() => {
                      setDrawerOpen(false);
                      handleOpenRejectModal(detailItem, 'reject');
                    }}
                    style={{ flex: 1 }}
                  >
                    Từ chối
                  </Button>
                </>
              )}
              {detailItem.status === 'Yêu cầu bổ sung' && detailItem.requesterId === user?.id && (
                <Button type="primary" icon={<EditOutlined />} onClick={() => { setDrawerOpen(false); handleOpenResubmission(detailItem); }} style={{ backgroundColor: '#D97706', borderColor: '#D97706', flex: 1 }}>
                  Nộp bổ sung
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

