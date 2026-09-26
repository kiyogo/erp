import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  SearchOutlined,
  DownloadOutlined,
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

export interface RequestAttachment {
  fileName: string;
  fileSize: string;
  fileType: string;
  uploadTime: string;
}

export interface ApprovalRequestItem {
  key: string;
  code: string;
  workflowName: string;
  workflowCode: string;
  category: 'Mua sắm & Tài sản' | 'Tài chính & Thanh toán' | 'Hợp đồng & Pháp chế' | 'Nhân sự & Phúc lợi' | 'Vận hành Kỹ thuật & IDC';
  requester: string;
  department: string;
  currentLevel: number;
  totalLevels: number;
  roleRequirement: string;
  budgetAmount: number;
  submittedAt: string;
  slaDeadline: string;
  slaHoursLeft: number;
  priority: 'Khẩn cấp (P1)' | 'Cao (P2)' | 'Bình thường (P3)';
  status: 'Chờ bạn ký duyệt' | 'Đã ký số phê duyệt' | 'Đã từ chối' | 'Yêu cầu bổ sung';
  summaryDetails: string;
  tokenRequired: boolean;
  attachments: RequestAttachment[];
  approvalNotes?: string;
  digitalSignatureInfo?: {
    signerName: string;
    certificateId: string;
    timestamp: string;
    hash: string;
  };
}

const INITIAL_PENDING_REQUESTS: ApprovalRequestItem[] = [];

export const WorkflowRequestsModule: React.FC = () => {
  const [data, setData] = useState<ApprovalRequestItem[]>(INITIAL_PENDING_REQUESTS);

  useEffect(() => {
    const list = dataService.getGenericData('workflow_requests');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('workflow_requests');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [tabFilter, setTabFilter] = useState<string>('pending_my');

  // Modal Create Request
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createForm] = Form.useForm();

  // Modal E-Signature Token PKI
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [signingItem, setSigningItem] = useState<ApprovalRequestItem | null>(null);
  const [signMethod, setSignMethod] = useState<'token_pki' | 'cloud_ca' | 'internal_esign'>('token_pki');
  const [tokenPin, setTokenPin] = useState('123456');
  const [approvalNote, setApprovalNote] = useState('Đồng ý phê duyệt theo đúng quy định và định mức ngân sách của Công ty.');

  // Modal Reject / Request Modification
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectItem, setRejectItem] = useState<ApprovalRequestItem | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectType, setRejectType] = useState<'reject' | 'modify'>('modify');

  // Detail Drawer
  const [detailItem, setDetailItem] = useState<ApprovalRequestItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Metrics
  const pendingMyCount = data.filter((d) => d.status === 'Chờ bạn ký duyệt').length;
  const urgentCount = data.filter((d) => d.status === 'Chờ bạn ký duyệt' && d.priority === 'Khẩn cấp (P1)').length;
  const totalPendingBudget = data
    .filter((d) => d.status === 'Chờ bạn ký duyệt')
    .reduce((sum, d) => sum + d.budgetAmount, 0);
  const approvedTodayCount = data.filter((d) => d.status === 'Đã ký số phê duyệt').length;

  const handleOpenCreateModal = () => {
    createForm.resetFields();
    createForm.setFieldsValue({
      code: `REQ-2026-0${data.length + 90}`,
      workflowCode: 'WF-PURCHASE-01',
      category: 'Mua sắm & Tài sản',
      requester: 'Trần Tuấn Anh (CTO)',
      department: 'Khối Kỹ Thuật & R&D',
      priority: 'Cao (P2)',
      budgetAmount: 45000000,
    });
    setCreateModalOpen(true);
  };

  const handleCreateRequest = (values: any) => {
    const newItem: ApprovalRequestItem = {
      ...values,
      key: String(Date.now()),
      currentLevel: 1,
      totalLevels: 3,
      roleRequirement: 'Trưởng bộ phận duyệt',
      submittedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      slaDeadline: 'Còn 4.0 giờ',
      slaHoursLeft: 4.0,
      status: 'Chờ bạn ký duyệt',
      tokenRequired: true,
      budgetAmount: Number(values.budgetAmount) || 0,
      attachments: [
        { fileName: 'ToTrinhDauTu_ChungTuDinhKem.pdf', fileSize: '1.5 MB', fileType: 'PDF', uploadTime: new Date().toISOString().substring(0, 10) },
      ],
    };

    const nextItems = [newItem, ...data]; setData(nextItems); dataService.saveGenericData('workflow_requests', nextItems);
    message.success(`Đã khởi tạo tờ trình ${values.code} và chuyển đến người ký cấp 1!`);
    setCreateModalOpen(false);
    createForm.resetFields();
  };

  const handleOpenSignModal = (record: ApprovalRequestItem) => {
    setSigningItem(record);
    setApprovalNote('Đồng ý phê duyệt theo đúng quy định và định mức ngân sách của Công ty.');
    setSignModalOpen(true);
  };

  const handleExecuteSign = () => {
    if (!signingItem) return;
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 19);

    const updated = data.map((d) =>
      d.key === signingItem.key
        ? {
            ...d,
            status: 'Đã ký số phê duyệt' as const,
            slaDeadline: 'Đã hoàn thành',
            slaHoursLeft: 0,
            approvalNotes: approvalNote,
            digitalSignatureInfo: {
              signerName: 'Trần Tuấn Anh (CTO)',
              certificateId: 'VIETTEL-CA-88992-PKI',
              timestamp: nowStr,
              hash: 'fa89d44e598fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b11',
            },
          }
        : d
    );

    setData(updated);
    dataService.saveGenericData('workflow_requests', updated);
    message.success(`Đã ký số điện tử thành công tờ trình ${signingItem.code}! Hồ sơ đã được đóng dấu mộc số hóa.`);
    setSignModalOpen(false);
    if (detailItem && detailItem.key === signingItem.key) {
      setDetailItem({
        ...detailItem,
        status: 'Đã ký số phê duyệt',
        slaDeadline: 'Đã hoàn thành',
        slaHoursLeft: 0,
        approvalNotes: approvalNote,
      });
    }
  };

  const handleOpenRejectModal = (record: ApprovalRequestItem, type: 'reject' | 'modify') => {
    setRejectItem(record);
    setRejectType(type);
    setRejectReason(type === 'modify' ? 'Cần bổ sung thêm báo giá đối ứng thứ 3 từ nhà cung cấp ủy quyền.' : 'Chi phí vượt định mức dự toán năm 2026.');
    setRejectModalOpen(true);
  };

  const handleExecuteReject = () => {
    if (!rejectItem) return;
    const nextSt = rejectType === 'modify' ? 'Yêu cầu bổ sung' : 'Đã từ chối';

    const updated = data.map((d) =>
      d.key === rejectItem.key
        ? {
            ...d,
            status: nextSt as any,
            approvalNotes: rejectReason,
          }
        : d
    );

    setData(updated);
    dataService.saveGenericData('workflow_requests', updated);
    message.warning(`Đã chuyển trạng thái hồ sơ ${rejectItem.code} thành "${nextSt}".`);
    setRejectModalOpen(false);
    if (detailItem && detailItem.key === rejectItem.key) {
      setDetailItem({ ...detailItem, status: nextSt as any, approvalNotes: rejectReason });
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
    if (tabFilter === 'pending_my') matchTab = item.status === 'Chờ bạn ký duyệt';
    if (tabFilter === 'urgent_p1') matchTab = item.priority === 'Khẩn cấp (P1)';
    if (tabFilter === 'approved') matchTab = item.status === 'Đã ký số phê duyệt';
    if (tabFilter === 'rejected') matchTab = item.status === 'Đã từ chối' || item.status === 'Yêu cầu bổ sung';

    return matchSearch && matchTab;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metrics Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hồ sơ chờ bạn ký duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: pendingMyCount > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {pendingMyCount} hồ sơ
          </div>
          <div style={{ fontSize: 11.5, color: pendingMyCount > 0 ? '#DC2626' : '#16A34A', marginTop: 2 }}>
            {pendingMyCount > 0 ? 'Đang nằm trong hàng chờ xử lý' : 'Không có việc tồn đọng'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Khẩn cấp P1 sắp chạm SLA</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: urgentCount > 0 ? '#D97706' : '#009688', marginTop: 4 }}>
            {urgentCount} tờ trình P1
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Cần xử lý gấp trong vòng 2 giờ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng ngân sách đang chờ duyệt</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalPendingBudget.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Thuộc thẩm quyền phê duyệt chi</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã ký số phê duyệt thành công</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {approvedTodayCount} hồ sơ
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đã đóng dấu mộc số hóa CA</div>
        </div>
      </div>

      {/* Navigation Sub-Tabs & Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả hồ sơ' },
            { key: 'pending_my', label: `Chờ bạn ký duyệt (${pendingMyCount})` },
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
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh sách hàng chờ trình ký (Excel)')}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreateModal}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tạo yêu cầu trình ký
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
                  {r.tokenRequired && (
                    <span style={{ fontSize: 10.5, color: '#9333EA', display: 'flex', alignItems: 'center', gap: 2, marginTop: 2 }}>
                      <KeyOutlined /> Token PKI
                    </span>
                  )}
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
                    Cấp {r.currentLevel}/{r.totalLevels}: {r.roleRequirement.split(' ')[0]}...
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: r.slaHoursLeft <= 2 && r.status === 'Chờ bạn ký duyệt' ? '#DC2626' : '#009688', marginTop: 3 }}>
                    <ClockCircleOutlined /> {r.slaDeadline}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                    <PaperClipOutlined style={{ marginRight: 4 }} />{r.attachments.length} tệp đính kèm
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
                if (s === 'Đã ký số phê duyệt') col = 'success';
                if (s === 'Đã từ chối') col = 'default';
                if (s === 'Yêu cầu bổ sung') col = 'warning';
                return <Tag color={col} style={{ fontWeight: s === 'Chờ bạn ký duyệt' ? 700 : 500 }}>{s}</Tag>;
              },
            },
            {
              title: 'Hành động',
              key: 'actions',
              width: 220,
              render: (_: any, r: ApprovalRequestItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
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

                  {r.status === 'Chờ bạn ký duyệt' ? (
                    <>
                      <Button
                        size="small"
                        type="primary"
                        icon={<CheckCircleOutlined />}
                        onClick={() => handleOpenSignModal(r)}
                        style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }}
                      >
                        Ký số
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
                  ) : (
                    <span style={{ fontSize: 11.5, color: '#64748B', fontStyle: 'italic' }}>Đã hoàn tất</span>
                  )}
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Ký Số Điện Tử Phê Duyệt (Digital E-Signature / Token PKI) */}
      <Modal
        title="Xác Thực Ký Số Điện Tử Hồ Sơ (E-Signature PKI)"
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
            </div>

            {signMethod === 'token_pki' && (
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>
                  Mã PIN Thiết Bị Token (6 số):
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
                style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }}
              >
                Xác nhận Ký số &amp; Đóng mộc
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
        title="Khởi Tạo Hồ Sơ Trình Ký Số Điện Tử"
        open={createModalOpen}
        onCancel={() => setCreateModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={createForm} layout="vertical" onFinish={handleCreateRequest} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã hồ sơ trình ký" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="workflowCode" label="Chọn luồng quy trình áp dụng" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'WF-PURCHASE-01: Mua sắm thiết bị IT & Server IDC', value: 'WF-PURCHASE-01' },
                  { label: 'WF-PAYMENT-02: Tạm ứng & Thanh toán chi phí', value: 'WF-PAYMENT-02' },
                  { label: 'WF-CONTRACT-03: Thẩm định hợp đồng kinh tế', value: 'WF-CONTRACT-03' },
                  { label: 'WF-LEAVE-04: Nghỉ phép năm & Công tác ngoại tỉnh', value: 'WF-LEAVE-04' },
                ]}
              />
            </Form.Item>
            <Form.Item name="priority" label="Mức độ ưu tiên" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Khẩn cấp (P1) - SLA 2h', value: 'Khẩn cấp (P1)' },
                  { label: 'Cao (P2) - SLA 4h', value: 'Cao (P2)' },
                  { label: 'Bình thường (P3) - SLA 8h', value: 'Bình thường (P3)' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="workflowName" label="Tiêu đề văn bản / Tờ trình" rules={[{ required: true, message: 'Nhập tiêu đề' }]}>
            <Input placeholder="Ví dụ: Tờ trình đề xuất mua sắm 05 màn hình đồ họa Dell UltraSharp 4K" />
          </Form.Item>

          <Form.Item name="summaryDetails" label="Nội dung tóm tắt & Sự cần thiết đầu tư" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Trình bày lý do, hiệu quả mang lại và căn cứ pháp lý..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="requester" label="Người lập tờ trình" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="department" label="Đơn vị / Phòng ban" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="budgetAmount" label="Dự toán kinh phí (VNĐ)">
              <Input type="number" min={0} step={10000000} />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setCreateModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Trình duyệt hồ sơ
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
                <Tag color={detailItem.status === 'Chờ bạn ký duyệt' ? 'error' : 'success'}>
                  {detailItem.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Người gửi: <strong>{detailItem.requester}</strong> ({detailItem.department}) · {detailItem.submittedAt}
              </div>
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

            {/* Attachments Section */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <PaperClipOutlined style={{ color: '#2563EB' }} /> Danh Sách Chứng Từ &amp; Tệp Đính Kèm ({detailItem.attachments.length}):
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detailItem.attachments.map((att, idx) => (
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
                      onClick={() => message.success(`Đang tải file ${att.fileName}...`)}
                    >
                      Tải xuống
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Digital Signature Audit Stamp */}
            {detailItem.digitalSignatureInfo && (
              <div style={{ border: '2px solid #16A34A', background: '#F0FDF4', borderRadius: 8, padding: 14 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#166534', fontWeight: 800, fontSize: 13 }}>
                  <SafetyCertificateOutlined style={{ fontSize: 20 }} /> CHỨNG THƯ KÝ SỐ ĐIỆN TỬ HỢP LỆ (DIGITAL SIGNATURE STAMP)
                </div>
                <div style={{ fontSize: 12, color: '#166534', marginTop: 6 }}>
                  <div>Người ký: <strong>{detailItem.digitalSignatureInfo.signerName}</strong></div>
                  <div>Chứng thư: <strong>{detailItem.digitalSignatureInfo.certificateId}</strong></div>
                  <div>Thời gian ký: {detailItem.digitalSignatureInfo.timestamp}</div>
                  <div style={{ fontSize: 10.5, color: '#64748B', marginTop: 2, wordBreak: 'break-all' }}>
                    SHA-256 Hash: {detailItem.digitalSignatureInfo.hash}
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã xuất phiếu trình ký số ${detailItem.code} (PDF)`)}
                style={{ flex: 1 }}
              >
                In Phiếu Trình Ký (PDF)
              </Button>
              {detailItem.status === 'Chờ bạn ký duyệt' && (
                <Button
                  type="primary"
                  icon={<CheckCircleOutlined />}
                  onClick={() => {
                    setDrawerOpen(false);
                    handleOpenSignModal(detailItem);
                  }}
                  style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', flex: 1 }}
                >
                  Ký số duyệt ngay
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

