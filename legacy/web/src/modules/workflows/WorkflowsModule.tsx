import { dataService } from '../../services/dataService';
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

export interface ApprovalStepDef {
  level: number;
  roleName: string;
  defaultApprover: string;
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

export const WorkflowsModule: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<WorkflowBlueprintItem[]>(INITIAL_BLUEPRINTS);

  useEffect(() => {
    const list = dataService.getGenericData('workflow_blueprints');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('workflow_blueprints');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<WorkflowBlueprintItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [form] = Form.useForm();

  // Metrics
  const totalWorkflows = data.length;
  const activeCount = data.filter((d) => d.status === 'Đang áp dụng').length;
  const totalRuns = data.reduce((sum, d) => sum + d.totalCompletedCount + d.activeInstancesCount, 0);
  const avgSLA = (data.reduce((sum, d) => sum + d.slaTargetHours, 0) / (totalWorkflows || 1)).toFixed(1);

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      workflowCode: `WF-CUSTOM-0${data.length + 1}`,
      category: 'Mua sắm & Tài sản',
      scope: 'Toàn công ty',
      totalSteps: 3,
      slaTargetHours: 4,
      applicableBudgetLimit: 100000000,
      createdBy: 'Trần Tuấn Anh (CTO)',
      version: 'v1.0',
    });
    setModalOpen(true);
  };

  const handleCreate = (values: any) => {
    const stepsCount = Number(values.totalSteps) || 3;
    const flow: ApprovalStepDef[] = [];
    for (let i = 1; i <= stepsCount; i++) {
      flow.push({
        level: i,
        roleName: i === 1 ? 'Trưởng bộ phận phê duyệt' : i === stepsCount ? 'Tổng Giám Đốc ký số' : 'Kế toán trưởng / Giám đốc khối',
        defaultApprover: i === stepsCount ? 'Ban Lãnh Đạo' : 'Cán bộ phụ trách',
        slaHours: Math.max(1, Math.round((Number(values.slaTargetHours) || 4) / stepsCount)),
        canReject: true,
        requireTokenPKI: i >= 2,
      });
    }

    const newItem: WorkflowBlueprintItem = {
      ...values,
      key: String(Date.now()),
      totalSteps: stepsCount,
      slaTargetHours: Number(values.slaTargetHours) || 4,
      applicableBudgetLimit: Number(values.applicableBudgetLimit) || 0,
      activeInstancesCount: 0,
      totalCompletedCount: 0,
      passRate: 100,
      status: 'Đang áp dụng',
      approvalFlow: flow,
      formFields: [
        { fieldName: 'title', label: 'Tiêu đề đề xuất', type: 'Văn bản', required: true },
        { fieldName: 'content', label: 'Nội dung chi tiết', type: 'Văn bản dài', required: true },
        { fieldName: 'attachments', label: 'Tài liệu đính kèm', type: 'Tệp PDF', required: false },
      ],
    };

    const nextItems = [newItem, ...data];
    setData(nextItems);
    dataService.saveGenericData('workflow_blueprints', nextItems);
    message.success(`Đã thiết kế và kích hoạt quy trình mới: ${values.workflowCode} - ${values.workflowName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleToggleStatus = (record: WorkflowBlueprintItem) => {
    const nextSt = record.status === 'Đang áp dụng' ? 'Tạm ngưng' : 'Đang áp dụng';
    const updated = data.map((d) => (d.key === record.key ? { ...d, status: nextSt as any } : d));
    setData(updated);
    dataService.saveGenericData('workflow_blueprints', updated);
    message.info(`Đã đổi trạng thái ${record.workflowCode} sang "${nextSt}"`);
    if (detailItem && detailItem.key === record.key) {
      setDetailItem({ ...detailItem, status: nextSt as any });
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
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Đã chuẩn hóa sơ đồ BPMN đa cấp</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Trạng thái đang kích hoạt</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {activeCount}/{totalWorkflows} luồng hoạt động
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>100% tự động chuyển tiếp hồ sơ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng lượt xử lý hoàn tất</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalRuns} hồ sơ đã duyệt
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Tỷ lệ duyệt thành công: 97.2%</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cam kết thời gian chuẩn</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            ~{avgSLA} Giờ / Quy trình
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Bảo đảm tốc độ giải quyết công việc</div>
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
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh mục ma trận quy trình')}>
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
                options={[
                  { label: '1 Cấp', value: 1 },
                  { label: '2 Cấp', value: 2 },
                  { label: '3 Cấp', value: 3 },
                  { label: '4 Cấp', value: 4 },
                ]}
              />
            </Form.Item>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="createdBy" label="Người phụ trách thiết kế quy trình" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Trần Tuấn Anh (CTO)" />
            </Form.Item>
            <Form.Item name="version" label="Phiên bản quy trình" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: v1.0" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
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
                onClick={() => message.success(`Đã xuất sơ đồ quy trình ${detailItem.workflowCode} (BPMN PDF)`)}
                style={{ flex: 1 }}
              >
                In Sơ Đồ BPMN (PDF)
              </Button>
              <Button
                type="primary"
                icon={<SendOutlined />}
                onClick={() => {
                  message.success(`Đang mở form khởi tạo theo mẫu: ${detailItem.workflowName}`);
                  navigate('/admin/workflows/requests');
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

