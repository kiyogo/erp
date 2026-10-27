import { dataService } from '../../services/dataService';
import { collectionsApi, usersApi } from '../../api/endpoints';
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  BranchesOutlined,
  CheckOutlined,
  CloseOutlined,
  SettingOutlined,
  HistoryOutlined,
  FileProtectOutlined,
  EyeOutlined,
  PrinterOutlined,
  ThunderboltOutlined,
  SafetyCertificateOutlined,
  ClockCircleOutlined,
  EditOutlined,
  DeleteOutlined,
  SendOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  KeyOutlined,
  FormOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Alert, Progress, Tooltip } from '../../custom-ui';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';

export interface ApprovalStepDef {
  level: number;
  roleName: string;
  defaultApprover: string;
  approverId?: string;
  slaHours: number;
  canReject: boolean;
  requireTokenPKI: boolean;
}

export interface WorkflowFieldDef {
  fieldName: string;
  label: string;
  type: string;
  required: boolean;
}

export interface WorkflowBlueprintItem {
  key: string;
  workflowCode: string;
  workflowName: string;
  category: 'Mua sắm & Tài sản' | 'Tài chính & Thanh toán' | 'Hợp đồng & Pháp chế' | 'Nhân sự & Phúc lợi' | 'Văn phòng & Hành chính' | 'Vận hành Kỹ thuật & IDC';
  description: string;
  scope: string;
  totalSteps: number;
  slaTargetHours: number;
  applicableBudgetLimit: number;
  approvalFlow: ApprovalStepDef[];
  formFields: WorkflowFieldDef[];
  activeInstancesCount: number;
  totalCompletedCount: number;
  passRate: number; // % duyệt thành công
  status: 'Đang áp dụng' | 'Bản nháp' | 'Tạm ngưng';
  version: string;
  createdBy: string;
}

const INITIAL_BLUEPRINTS: WorkflowBlueprintItem[] = [];
const DEFAULT_WORKFLOW_FORM_FIELDS: WorkflowFieldDef[] = [
  { fieldName: 'title', label: 'Tiêu đề đề xuất', type: 'Văn bản', required: true },
  { fieldName: 'content', label: 'Nội dung chi tiết', type: 'Văn bản dài', required: true },
  { fieldName: 'attachments', label: 'Tài liệu đính kèm', type: 'Tệp PDF', required: false },
];

export const WorkflowsModule: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<WorkflowBlueprintItem[]>(INITIAL_BLUEPRINTS);
  const [saving, setSaving] = useState(false);
  const [approvers, setApprovers] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [assignedApproverIds, setAssignedApproverIds] = useState<string[]>(['', '', '']);
  const [canRejectLevels, setCanRejectLevels] = useState<boolean[]>([true, true, true]);

  useEffect(() => {
    const list = dataService.getGenericData('workflow_blueprints');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('workflow_blueprints');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  useEffect(() => {
    let active = true;
    const loadApprovers = async () => {
      try {
        const firstPage = await usersApi.getAll({ page: 1, limit: 100 });
        const users = [...(firstPage.data.data || [])];
        const total = Number(firstPage.data.pagination?.total || users.length);
        const pageCount = Math.ceil(total / Number(firstPage.data.pagination?.limit || 100));
        for (let page = 2; page <= pageCount; page++) {
          const next = await usersApi.getAll({ page, limit: 100 });
          users.push(...(next.data.data || []));
        }
        if (active) setApprovers(users.filter((person: any) => person.isActive).map((person: any) => ({
          id: person.id,
          name: person.name || person.fullName || person.email,
          role: person.role,
        })));
      } catch {
        if (active) message.error('Không tải được danh sách tài khoản để gán người phê duyệt.');
      }
    };
    void loadApprovers();
    return () => { active = false; };
  }, []);

  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [workflowFormFields, setWorkflowFormFields] = useState<WorkflowFieldDef[]>(DEFAULT_WORKFLOW_FORM_FIELDS);
  const [detailItem, setDetailItem] = useState<WorkflowBlueprintItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [form] = Form.useForm();

  // Metrics
  const totalWorkflows = data.length;
  const activeCount = data.filter((d) => d.status === 'Đang áp dụng').length;
  const totalRuns = data.reduce((sum, d) => sum + d.totalCompletedCount + d.activeInstancesCount, 0);
  const avgSLA = (data.reduce((sum, d) => sum + d.slaTargetHours, 0) / (totalWorkflows || 1)).toFixed(1);
  const avgPassRate = (data.reduce((sum, d) => sum + d.passRate, 0) / (totalWorkflows || 1)).toFixed(1);

  const handleOpenCreate = () => {
    form.resetFields();
    setWorkflowFormFields(DEFAULT_WORKFLOW_FORM_FIELDS.map((field) => ({ ...field })));
    setAssignedApproverIds(['', '', '']);
    setCanRejectLevels([true, true, true]);
    form.setFieldsValue({
      workflowCode: `WF-CUSTOM-${String(Date.now()).slice(-6)}`,
      category: 'Mua sắm & Tài sản',
      scope: 'Toàn công ty',
      totalSteps: 3,
      slaTargetHours: 4,
      applicableBudgetLimit: 100000000,
      version: 'v1.0',
    });
    setModalOpen(true);
  };

  const handleCreate = async (values: any) => {
    const fieldNames = workflowFormFields.map((field) => field.fieldName.trim());
    const reservedNames = new Set(['key', 'code', 'workflowcode', 'workflowname', 'category', 'department', 'priority', 'budgetamount', 'summarydetails', 'supplementalresponse', 'constructor', 'prototype', 'tostring', 'hasownproperty']);
    const builtInNames = new Set(['title', 'content', 'attachments']);
    if (fieldNames.some((name) => !/^[a-z][a-zA-Z0-9_]{0,79}$/.test(name)
      || (reservedNames.has(name.toLowerCase()) && !builtInNames.has(name))
      || (builtInNames.has(name.toLowerCase()) && !builtInNames.has(name)))
      || new Set(fieldNames.map((name) => name.toLowerCase())).size !== fieldNames.length) {
      message.error('Mã trường phải duy nhất, viết thường ở đầu và không trùng trường hệ thống.');
      return;
    }
    if (workflowFormFields.some((field) => !field.label.trim())) {
      message.error('Mỗi trường biểu mẫu cần có tên hiển thị.');
      return;
    }
    const stepsCount = Number(values.totalSteps) || 3;
    if (assignedApproverIds.length !== stepsCount || assignedApproverIds.some((id) => !id) || canRejectLevels.length !== stepsCount) {
      message.error('Hãy gán một tài khoản đang hoạt động cho từng cấp phê duyệt.');
      return;
    }
    const flow: ApprovalStepDef[] = [];
    for (let i = 1; i <= stepsCount; i++) {
      const approver = approvers.find((person) => person.id === assignedApproverIds[i - 1]);
      if (!approver) {
        message.error(`Không tìm thấy người phê duyệt đang hoạt động ở cấp ${i}.`);
        return;
      }
      flow.push({
        level: i,
        roleName: i === 1 ? 'Trưởng bộ phận phê duyệt' : i === stepsCount ? 'Tổng Giám Đốc ký số' : 'Kế toán trưởng / Giám đốc khối',
        defaultApprover: approver.name,
        approverId: approver.id,
        slaHours: Math.max(1, Math.round((Number(values.slaTargetHours) || 4) / stepsCount)),
        canReject: canRejectLevels[i - 1],
        requireTokenPKI: i >= 2,
      });
    }

    const newItem: WorkflowBlueprintItem = {
      ...values,
      key: values.workflowCode,
      totalSteps: stepsCount,
      slaTargetHours: Number(values.slaTargetHours) || 4,
      applicableBudgetLimit: Number(values.applicableBudgetLimit) || 0,
      activeInstancesCount: 0,
      totalCompletedCount: 0,
      passRate: 100,
      status: 'Đang áp dụng',
      approvalFlow: flow,
      formFields: workflowFormFields.map((field) => ({ ...field, fieldName: field.fieldName.trim(), label: field.label.trim() })),
    };

    setSaving(true);
    try {
      await collectionsApi.create<WorkflowBlueprintItem>('workflow_blueprints', newItem);
      setData(await dataService.refreshGenericData('workflow_blueprints'));
      message.success(`Đã lưu quy trình ${values.workflowCode} - ${values.workflowName}.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể lưu cấu hình quy trình.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (record: WorkflowBlueprintItem) => {
    const nextSt = record.status === 'Đang áp dụng' ? 'Tạm ngưng' : 'Đang áp dụng';
    try {
      await collectionsApi.patch<WorkflowBlueprintItem>('workflow_blueprints', record.key, { status: nextSt });
      const refreshed = await dataService.refreshGenericData('workflow_blueprints');
      setData(refreshed);
      if (detailItem?.key === record.key) setDetailItem(refreshed.find((item) => item.key === record.key) || null);
      message.success(`Đã đổi trạng thái ${record.workflowCode} sang "${nextSt}"`);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể cập nhật trạng thái quy trình.');
    }
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.workflowCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.workflowName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.category || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.createdBy || '').toLowerCase().includes(searchText.toLowerCase());

    const matchCat = categoryFilter === 'all' || item.category === categoryFilter;
    const matchSt = statusFilter === 'all' || item.status === statusFilter;

    return matchSearch && matchCat && matchSt;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Quy trình nghiệp vụ số hóa</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalWorkflows} quy trình chuẩn
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Cấu hình các cấp phê duyệt</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Trạng thái đang kích hoạt</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {activeCount}/{totalWorkflows} luồng hoạt động
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Trạng thái được lưu trên máy chủ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng hồ sơ đang xử lý và đã duyệt</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalRuns} lượt xử lý
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Tỷ lệ duyệt: {avgPassRate}%</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cam kết thời gian chuẩn</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            ~{avgSLA} Giờ / Quy trình
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Theo SLA đã cấu hình</div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã quy trình, tên, phân nhóm, người tạo..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 340, borderRadius: 6 }}
            allowClear
          />
          <Select
            value={categoryFilter}
            onChange={setCategoryFilter}
            style={{ width: 230 }}
            options={[
              { label: 'Tất cả phân nhóm', value: 'all' },
              { label: 'Mua sắm & Tài sản', value: 'Mua sắm & Tài sản' },
              { label: 'Tài chính & Thanh toán', value: 'Tài chính & Thanh toán' },
              { label: 'Hợp đồng & Pháp chế', value: 'Hợp đồng & Pháp chế' },
              { label: 'Nhân sự & Phúc lợi', value: 'Nhân sự & Phúc lợi' },
              { label: 'Vận hành Kỹ thuật & IDC', value: 'Vận hành Kỹ thuật & IDC' },
            ]}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 170 }}
            options={[
              { label: 'Tất cả trạng thái', value: 'all' },
              { label: 'Đang áp dụng', value: 'Đang áp dụng' },
              { label: 'Bản nháp', value: 'Bản nháp' },
              { label: 'Tạm ngưng', value: 'Tạm ngưng' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} disabled={!filteredData.length} onClick={() => downloadFile('Danh_muc_quy_trinh.xlsx', generateValidXlsxBlob([
            ['Mã quy trình', 'Tên quy trình', 'Phân loại', 'Số cấp', 'SLA giờ', 'Hạn mức', 'Đang xử lý', 'Đã duyệt', 'Tỷ lệ duyệt', 'Trạng thái', 'Người tạo'],
            ...filteredData.map((item) => [item.workflowCode, item.workflowName, item.category, item.totalSteps, item.slaTargetHours, item.applicableBudgetLimit, item.activeInstancesCount, item.totalCompletedCount, item.passRate, item.status, item.createdBy]),
          ]))}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thiết kế quy trình mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={[
            {
              title: 'Mã & Phân nhóm',
              key: 'code',
              width: 180,
              render: (_: any, r: WorkflowBlueprintItem) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BranchesOutlined /> {r.workflowCode}
                  </span>
                  <Tag color="cyan" style={{ marginTop: 3, fontSize: 11 }}>
                    {r.category.split(' ')[0]}
                  </Tag>
                  <span style={{ fontSize: 10.5, color: '#64748B', display: 'block', marginTop: 1 }}>{r.version}</span>
                </div>
              ),
            },
            {
              title: 'Tên quy trình & Mô tả luồng',
              key: 'info',
              render: (_: any, r: WorkflowBlueprintItem) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.workflowName}</strong>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{r.description}</div>
                  <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>
                    Phạm vi: <strong>{r.scope}</strong> · Người thiết kế: <em>{r.createdBy}</em>
                  </div>
                </div>
              ),
            },
            {
              title: 'Số cấp duyệt & SLA',
              key: 'flow',
              width: 190,
              render: (_: any, r: WorkflowBlueprintItem) => (
                <div style={{ fontSize: 12 }}>
                  <div style={{ fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <SafetyCertificateOutlined style={{ color: '#009688' }} /> {r.totalSteps} Cấp phê duyệt
                  </div>
                  <div style={{ color: '#D97706', fontWeight: 600, marginTop: 2 }}>
                    <ClockCircleOutlined /> SLA: &le; {r.slaTargetHours} Giờ
                  </div>
                  {r.applicableBudgetLimit > 0 && (
                    <div style={{ fontSize: 11, color: '#16A34A', marginTop: 2 }}>
                      Hạn mức: &le; {r.applicableBudgetLimit.toLocaleString('vi-VN')} ₫
                    </div>
                  )}
                </div>
              ),
            },
            {
              title: 'Lượt chạy & Tỷ lệ duyệt',
              key: 'runs',
              width: 170,
              render: (_: any, r: WorkflowBlueprintItem) => (
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#2563EB' }}>
                    {r.totalCompletedCount} lượt hoàn tất
                  </div>
                  <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>
                    Tỷ lệ đạt: <strong>{r.passRate}%</strong>
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>
                    {r.activeInstancesCount} hồ sơ đang xử lý
                  </div>
                </div>
              ),
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              width: 140,
              render: (s: string) => {
                let col = 'default';
                if (s === 'Đang áp dụng') col = 'success';
                if (s === 'Bản nháp') col = 'warning';
                return <Tag color={col}>{s}</Tag>;
              },
            },
            {
              title: 'Thao tác',
              key: 'act',
              width: 170,
              render: (_: any, r: WorkflowBlueprintItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setDrawerOpen(true);
                    }}
                    title="Xem sơ đồ luồng & cấu hình ma trận duyệt"
                  >
                    Xem luồng
                  </Button>
                  <Tooltip title={r.status === 'Đang áp dụng' ? 'Tạm ngưng quy trình' : 'Kích hoạt quy trình'}>
                    <Button
                      size="small"
                      icon={r.status === 'Đang áp dụng' ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                      onClick={() => handleToggleStatus(r)}
                      style={{ color: r.status === 'Đang áp dụng' ? '#D97706' : '#009688' }}
                    />
                  </Tooltip>
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Thiết Kế / Tạo Quy Trình Số Mới 100% trường nhập */}
      <Modal
        title="Thiết Kế &amp; Định Nghĩa Luồng Quy Trình Số Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 12 }}>
            <Form.Item name="workflowCode" label="Mã quy trình" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: WF-HR-RECRUIT-01" />
            </Form.Item>
            <Form.Item name="category" label="Phân nhóm nghiệp vụ" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Mua sắm & Tài sản', value: 'Mua sắm & Tài sản' },
                  { label: 'Tài chính & Thanh toán', value: 'Tài chính & Thanh toán' },
                  { label: 'Hợp đồng & Pháp chế', value: 'Hợp đồng & Pháp chế' },
                  { label: 'Nhân sự & Phúc lợi', value: 'Nhân sự & Phúc lợi' },
                  { label: 'Vận hành Kỹ thuật & IDC', value: 'Vận hành Kỹ thuật & IDC' },
                ]}
              />
            </Form.Item>
            <Form.Item name="totalSteps" label="Số cấp phê duyệt" rules={[{ required: true }]}>
              <Select
                onChange={(count: number) => {
                  const nextCount = Number(count);
                  setAssignedApproverIds((ids) => Array.from({ length: nextCount }, (_, index) => ids[index] || ''));
                  setCanRejectLevels((levels) => Array.from({ length: nextCount }, (_, index) => levels[index] ?? true));
                }}
                options={[
                  { label: '1 Cấp', value: 1 },
                  { label: '2 Cấp', value: 2 },
                  { label: '3 Cấp', value: 3 },
                  { label: '4 Cấp', value: 4 },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginTop: 4 }}>
            <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>Người chịu trách nhiệm ở từng cấp</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {assignedApproverIds.map((approverId, index) => (
                <div key={`approver-level-${index + 1}`}>
                  <div style={{ fontSize: 12, color: '#475569', marginBottom: 4 }}>Cấp {index + 1}</div>
                  <Select
                    aria-label={`Người phê duyệt cấp ${index + 1}`}
                    value={approverId || undefined}
                    onChange={(value: string) => setAssignedApproverIds((ids) => ids.map((id, itemIndex) => itemIndex === index ? value : id))}
                    placeholder="Chọn tài khoản phê duyệt"
                    options={approvers.map((person) => ({ value: person.id, label: `${person.name} · ${person.role}` }))}
                    disabled={!approvers.length}
                  />
                  <Select
                    aria-label={`Quyền từ chối cấp ${index + 1}`}
                    value={canRejectLevels[index] ? 'can_reject' : 'approve_only'}
                    onChange={(value: string) => setCanRejectLevels((levels) => levels.map((enabled, itemIndex) => itemIndex === index ? value === 'can_reject' : enabled))}
                    style={{ marginTop: 6 }}
                    options={[{ value: 'can_reject', label: 'Được từ chối / yêu cầu bổ sung' }, { value: 'approve_only', label: 'Chỉ được phê duyệt' }]}
                  />
                </div>
              ))}
            </div>
          </div>

          <Form.Item name="workflowName" label="Tên quy trình nghiệp vụ" rules={[{ required: true, message: 'Nhập tên quy trình' }]}>
            <Input placeholder="Ví dụ: Quy trình Đề xuất Tuyển dụng Nhân sự & Ký Hợp đồng Thử việc" />
          </Form.Item>

          <Form.Item name="description" label="Mục đích & Phạm vi áp dụng chi tiết" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Mô tả điều kiện khởi tạo, hồ sơ đính kèm bắt buộc..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="scope" label="Phạm vi phòng ban áp dụng" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Toàn công ty / Khối Kỹ Thuật" />
            </Form.Item>
            <Form.Item name="slaTargetHours" label="Cam kết SLA toàn quy trình" rules={[{ required: true }]}>
              <Input type="number" min={1} max={72} />
            </Form.Item>
            <Form.Item name="applicableBudgetLimit" label="Hạn mức kinh phí tối đa (VNĐ)">
              <Input type="number" min={0} step={10000000} placeholder="Ví dụ: 100000000" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <Form.Item name="version" label="Phiên bản quy trình" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: v1.0" />
            </Form.Item>
          </div>

          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, color: '#0F172A' }}>Trường biểu mẫu gửi hồ sơ</div>
              <Button
                icon={<PlusOutlined />}
                disabled={workflowFormFields.length >= 40}
                onClick={() => setWorkflowFormFields((fields) => {
                  let suffix = 1;
                  while (fields.some((field) => field.fieldName === `custom_field_${suffix}`)) suffix++;
                  return [...fields, { fieldName: `custom_field_${suffix}`, label: 'Trường mới', type: 'Văn bản', required: false }];
                })}
              >
                Thêm trường
              </Button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {workflowFormFields.map((field, index) => (
                <div key={`workflow-form-field-${index}`} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr auto', gap: 8, alignItems: 'center' }}>
                  <Input
                    aria-label={`Mã trường ${index + 1}`}
                    value={field.fieldName}
                    disabled={['title', 'content', 'attachments'].includes(field.fieldName)}
                    onChange={(event) => setWorkflowFormFields((fields) => fields.map((item, itemIndex) => itemIndex === index ? { ...item, fieldName: event.target.value } : item))}
                    placeholder="ma_truong"
                  />
                  <Input
                    aria-label={`Tên trường ${index + 1}`}
                    value={field.label}
                    onChange={(event) => setWorkflowFormFields((fields) => fields.map((item, itemIndex) => itemIndex === index ? { ...item, label: event.target.value } : item))}
                    placeholder="Tên hiển thị"
                  />
                  <Select
                    aria-label={`Kiểu trường ${index + 1}`}
                    value={field.type}
                    disabled={['title', 'content', 'attachments'].includes(field.fieldName)}
                    onChange={(value) => setWorkflowFormFields((fields) => fields.map((item, itemIndex) => itemIndex === index ? { ...item, type: value } : item))}
                    options={[
                      { label: 'Văn bản', value: 'Văn bản' },
                      { label: 'Văn bản dài', value: 'Văn bản dài' },
                      { label: 'Số', value: 'Số' },
                      { label: 'Ngày', value: 'Ngày' },
                      ...(field.fieldName === 'attachments' ? [{ label: 'Tệp PDF', value: 'Tệp PDF' }] : []),
                    ]}
                  />
                  <Select
                    aria-label={`Bắt buộc ${index + 1}`}
                    value={field.required ? 'required' : 'optional'}
                    disabled={['title', 'content'].includes(field.fieldName)}
                    onChange={(value) => setWorkflowFormFields((fields) => fields.map((item, itemIndex) => itemIndex === index ? { ...item, required: value === 'required' } : item))}
                    options={[{ label: 'Bắt buộc', value: 'required' }, { label: 'Tùy chọn', value: 'optional' }]}
                  />
                  <Button
                    aria-label={`Xóa trường ${field.label}`}
                    icon={<DeleteOutlined />}
                    disabled={['title', 'content', 'attachments'].includes(field.fieldName)}
                    onClick={() => setWorkflowFormFields((fields) => fields.filter((_, itemIndex) => itemIndex !== index))}
                  />
                </div>
              ))}
            </div>
            <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 8 }}>
              Các trường này sẽ xuất hiện trong biểu mẫu gửi và được kiểm tra khi lưu hồ sơ.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" disabled={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Kích hoạt quy trình
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Xem Sơ Đồ Luồng & Cấu Hình Ma Trận Phê Duyệt */}
      <Drawer
        title="Sơ Đồ Luồng Phê Duyệt BPMN &amp; Ma Trận Cấp Thẩm Quyền"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={680}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Document */}
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.workflowCode}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.workflowName}</div>
                </div>
                <Tag color={detailItem.status === 'Đang áp dụng' ? 'success' : 'default'}>{detailItem.status}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phân nhóm: <strong>{detailItem.category}</strong> · Phiên bản: <strong>{detailItem.version}</strong>
              </div>
              <div style={{ fontSize: 12, color: '#334155', marginTop: 4 }}>
                {detailItem.description}
              </div>
            </div>

            {/* Performance Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#F0FDF4' }}>
                <div style={{ fontSize: 11, color: '#166534' }}>LƯỢT ĐÃ DUYỆT</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#16A34A', marginTop: 2 }}>
                  {detailItem.totalCompletedCount} hồ sơ
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>Tỷ lệ đạt: {detailItem.passRate}%</div>
              </div>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#EFF6FF' }}>
                <div style={{ fontSize: 11, color: '#1E40AF' }}>CAM KẾT SLA</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#2563EB', marginTop: 2 }}>
                  &le; {detailItem.slaTargetHours} Giờ
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>{detailItem.totalSteps} Cấp thẩm quyền</div>
              </div>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#FFFBEB' }}>
                <div style={{ fontSize: 11, color: '#B45309' }}>HẠN MỨC ÁP DỤNG</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#D97706', marginTop: 2 }}>
                  {detailItem.applicableBudgetLimit > 0 ? `${detailItem.applicableBudgetLimit.toLocaleString('vi-VN')} ₫` : 'Không giới hạn'}
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>Phạm vi: {detailItem.scope}</div>
              </div>
            </div>

            {/* Multi-level Approval Flow Visual */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <BranchesOutlined style={{ color: '#009688' }} /> Sơ Đồ Ma Trận Các Cấp Ký Duyệt ({detailItem.totalSteps} Cấp):
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {detailItem.approvalFlow.map((step) => (
                  <div
                    key={step.level}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '10px 12px',
                      background: '#F8FAFC',
                      borderRadius: 6,
                      border: '1px solid #E2E8F0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: '#009688',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                          fontSize: 13,
                        }}
                      >
                        {step.level}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{step.roleName}</div>
                        <div style={{ fontSize: 11.5, color: '#64748B' }}>
                          Thẩm định mặc định: <strong>{step.defaultApprover}</strong>
                        </div>
                        <div style={{ fontSize: 11, color: '#64748B' }}>{step.canReject ? 'Được từ chối hoặc yêu cầu bổ sung' : 'Chỉ được phê duyệt'}</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Tag color="blue">SLA: {step.slaHours}h</Tag>
                      {step.requireTokenPKI && (
                        <Tag color="purple" icon={<KeyOutlined />}>
                          Ký Token PKI
                        </Tag>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Form Fields Definition */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FormOutlined style={{ color: '#2563EB' }} /> Cấu Trúc Form Nhập Liệu Khởi Tạo Yêu Cầu:
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ background: '#F8FAFC' }}>
                  <tr>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>Tên trường dữ liệu</th>
                    <th style={{ padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #E2E8F0' }}>Kiểu nhập liệu</th>
                    <th style={{ padding: '6px 8px', textAlign: 'center', borderBottom: '1px solid #E2E8F0' }}>Bắt buộc</th>
                  </tr>
                </thead>
                <tbody>
                  {detailItem.formFields.map((f, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '6px 8px', fontWeight: 600 }}>{f.label}</td>
                      <td style={{ padding: '6px 8px', color: '#64748B' }}>{f.type}</td>
                      <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                        {f.required ? <Tag color="error">Bắt buộc</Tag> : <Tag>Tùy chọn</Tag>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => downloadFile(`${detailItem.workflowCode}_So_do_quy_trinh.pdf`, generateValidPdfBlob('SƠ ĐỒ QUY TRÌNH', detailItem.workflowName, detailItem.approvalFlow.map((step) => `Cấp ${step.level}: ${step.roleName} - ${step.defaultApprover}; SLA ${step.slaHours} giờ`)))}
                style={{ flex: 1 }}
              >
                Tải sơ đồ quy trình (PDF)
              </Button>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => {
                  navigate('/admin/workflows/requests', { state: { workflowCode: detailItem.workflowCode } });
                }}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Tạo tờ trình theo mẫu này
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

