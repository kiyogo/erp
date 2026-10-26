import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  SettingOutlined,
  BranchesOutlined,
  SaveOutlined,
  UserSwitchOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  KeyOutlined,
  BellOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  LockOutlined,
  ThunderboltOutlined,
  CheckOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Form, Input, Select, message, Tag, Modal, Card, Alert, Tooltip, Radio } from '../../custom-ui';

export interface BudgetMatrixTier {
  key: string;
  tierName: string;
  minAmount: number;
  maxAmount: number;
  requiredLevels: string;
  slaHours: number;
  autoEscalateHours: number;
  requirePKI: boolean;
  status: 'Kích hoạt' | 'Tạm dừng';
}

export interface DelegationRule {
  key: string;
  delegator: string;
  delegatorRole: string;
  delegatee: string;
  delegateeRole: string;
  fromDate: string;
  toDate: string;
  scope: string;
  reason: string;
  status: 'Đang hiệu lực' | 'Sắp tới' | 'Đã hết hạn';
  notifySlack: boolean;
}

const INITIAL_TIERS: BudgetMatrixTier[] = [];

const INITIAL_DELEGATIONS: DelegationRule[] = [];

export const WorkflowSettingsModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'matrix' | 'delegation' | 'security'>('matrix');

  // Budget Matrix state
  const [tiers, setTiers] = useState<BudgetMatrixTier[]>(INITIAL_TIERS);

  useEffect(() => {
    const list = dataService.getGenericData('workflow_settings');
    setTiers(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('workflow_settings');
      setTiers(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [tierForm] = Form.useForm();
  const [editingTierKey, setEditingTierKey] = useState<string | null>(null);

  // Delegation state
  const [delegations, setDelegations] = useState<DelegationRule[]>(INITIAL_DELEGATIONS);
  const [delegationModalOpen, setDelegationModalOpen] = useState(false);
  const [delegationForm] = Form.useForm();

  // Security policies form
  const [securityForm] = Form.useForm();

  const handleOpenAddTier = () => {
    setEditingTierKey(null);
    tierForm.resetFields();
    tierForm.setFieldsValue({
      tierName: `Cấp ${tiers.length + 1}: Hạn mức mới`,
      minAmount: 100000000,
      maxAmount: 300000000,
      requiredLevels: '2 Cấp: Trưởng phòng ➔ Giám đốc',
      slaHours: 4,
      autoEscalateHours: 8,
      requirePKI: true,
      status: 'Kích hoạt',
    });
    setTierModalOpen(true);
  };

  const handleSaveTier = (values: any) => {
    if (editingTierKey) {
      setTiers((prev) =>
        prev.map((t) =>
          t.key === editingTierKey
            ? {
                ...t,
                ...values,
                minAmount: Number(values.minAmount) || 0,
                maxAmount: Number(values.maxAmount) || 0,
                slaHours: Number(values.slaHours) || 4,
                autoEscalateHours: Number(values.autoEscalateHours) || 8,
              }
            : t
        )
      );
      message.success('Đã cập nhật tầng hạn mức ngân sách!');
    } else {
      const newTier: BudgetMatrixTier = {
        ...values,
        key: String(Date.now()),
        minAmount: Number(values.minAmount) || 0,
        maxAmount: Number(values.maxAmount) || 0,
        slaHours: Number(values.slaHours) || 4,
        autoEscalateHours: Number(values.autoEscalateHours) || 8,
      };
      setTiers([...tiers, newTier]);
      message.success('Đã thêm tầng hạn mức ngân sách mới!');
    }
    setTierModalOpen(false);
  };

  const handleOpenAddDelegation = () => {
    delegationForm.resetFields();
    delegationForm.setFieldsValue({
      delegator: 'Trần Tuấn Anh',
      delegatorRole: 'Giám đốc Khối Kỹ Thuật (CTO)',
      delegatee: 'Vũ Minh Trí',
      delegateeRole: 'DevOps Lead / Trưởng nhóm Hạ tầng',
      fromDate: '2026-09-01',
      toDate: '2026-09-07',
      scope: 'Duyệt thay đổi cấu hình RFC máy chủ và đề xuất vật tư < 50 triệu',
      reason: 'Nghỉ phép thường niên cùng gia đình',
      notifySlack: true,
    });
    setDelegationModalOpen(true);
  };

  const handleSaveDelegation = (values: any) => {
    const newDelegation: DelegationRule = {
      ...values,
      key: String(Date.now()),
      status: 'Sắp tới',
    };
    setDelegations([...delegations, newDelegation]);
    message.success(`Đã thiết lập ủy quyền phê duyệt từ ${values.delegator} sang ${values.delegatee}!`);
    setDelegationModalOpen(false);
  };

  const handleSaveSecuritySettings = () => {
    message.success('Đã lưu toàn bộ thiết lập bảo mật chữ ký số PKI & cấu hình thông báo hệ thống!');
  };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tầng ma trận ngân sách</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {tiers.length} phân cấp hạn mức
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Từ 0 ₫ đến 5.000.000.000 ₫</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Lệnh ủy quyền đang hiệu lực</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {delegations.filter((d) => d.status === 'Đang hiệu lực').length} lãnh đạo vắng mặt
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Tự động chuyển tiếp hồ sơ thông minh</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chứng thư số tích hợp</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            Viettel-CA HSM
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Khóa chuẩn RSA-2048 / SHA-256</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cơ chế leo thang tự động</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            Active
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tự nhắc nhở Slack &amp; leo cấp khi trễ hạn</div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            type={activeTab === 'matrix' ? 'primary' : 'default'}
            icon={<BranchesOutlined />}
            onClick={() => setActiveTab('matrix')}
            style={{
              backgroundColor: activeTab === 'matrix' ? '#009688' : '#FFFFFF',
              borderColor: activeTab === 'matrix' ? '#009688' : '#D1D5DB',
              fontWeight: activeTab === 'matrix' ? 700 : 500,
            }}
          >
            Ma Trận Hạn Mức Ngân Sách ({tiers.length})
          </Button>
          <Button
            type={activeTab === 'delegation' ? 'primary' : 'default'}
            icon={<UserSwitchOutlined />}
            onClick={() => setActiveTab('delegation')}
            style={{
              backgroundColor: activeTab === 'delegation' ? '#009688' : '#FFFFFF',
              borderColor: activeTab === 'delegation' ? '#009688' : '#D1D5DB',
              fontWeight: activeTab === 'delegation' ? 700 : 500,
            }}
          >
            Ủy Quyền Phê Duyệt ({delegations.length})
          </Button>
          <Button
            type={activeTab === 'security' ? 'primary' : 'default'}
            icon={<LockOutlined />}
            onClick={() => setActiveTab('security')}
            style={{
              backgroundColor: activeTab === 'security' ? '#009688' : '#FFFFFF',
              borderColor: activeTab === 'security' ? '#009688' : '#D1D5DB',
              fontWeight: activeTab === 'security' ? 700 : 500,
            }}
          >
            Bảo Mật Ký Số &amp; Thông Báo
          </Button>
        </div>

        {activeTab === 'matrix' && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenAddTier}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm tầng hạn mức
          </Button>
        )}

        {activeTab === 'delegation' && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenAddDelegation}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thiết lập ủy quyền mới
          </Button>
        )}
      </div>

      {/* TAB 1: MA TRẬN HẠN MỨC NGÂN SÁCH */}
      {activeTab === 'matrix' && (
        <div className="transparent-table-card">
          <KTable
            dataSource={tiers}
            columns={[
              {
                title: 'Tên phân cấp hạn mức',
                key: 'tierName',
                render: (_: any, r: BudgetMatrixTier) => (
                  <div>
                    <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.tierName}</strong>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{r.requiredLevels}</div>
                  </div>
                ),
              },
              {
                title: 'Khoảng ngân sách áp dụng',
                key: 'range',
                width: 260,
                render: (_: any, r: BudgetMatrixTier) => (
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: '#16A34A' }}>
                    {r.minAmount.toLocaleString('vi-VN')} ₫ ➔ {r.maxAmount.toLocaleString('vi-VN')} ₫
                  </div>
                ),
              },
              {
                title: 'Cam kết SLA & Leo thang',
                key: 'sla',
                width: 200,
                render: (_: any, r: BudgetMatrixTier) => (
                  <div style={{ fontSize: 12 }}>
                    <div>
                      SLA: <strong style={{ color: '#2563EB' }}>{r.slaHours} Giờ</strong>
                    </div>
                    <div style={{ color: '#D97706', marginTop: 2 }}>
                      Leo thang sau: <strong>{r.autoEscalateHours} Giờ</strong>
                    </div>
                  </div>
                ),
              },
              {
                title: 'Yêu cầu Token PKI',
                key: 'pki',
                width: 160,
                render: (_: any, r: BudgetMatrixTier) => (
                  <div>
                    {r.requirePKI ? (
                      <Tag color="purple" icon={<KeyOutlined />}>
                        Bắt buộc Token
                      </Tag>
                    ) : (
                      <Tag color="default">Ký điện tử nội bộ</Tag>
                    )}
                  </div>
                ),
              },
              {
                title: 'Trạng thái',
                dataIndex: 'status',
                key: 'status',
                width: 120,
                render: (s: string) => <Tag color={s === 'Kích hoạt' ? 'success' : 'default'}>{s}</Tag>,
              },
              {
                title: 'Thao tác',
                key: 'actions',
                width: 100,
                render: (_: any, r: BudgetMatrixTier) => (
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => {
                      setEditingTierKey(r.key);
                      tierForm.setFieldsValue(r);
                      setTierModalOpen(true);
                    }}
                  >
                    Sửa
                  </Button>
                ),
              },
            ]}
            pagination={false}
          />
        </div>
      )}

      {/* TAB 2: ỦY QUYỀN PHÊ DUYỆT */}
      {activeTab === 'delegation' && (
        <div className="transparent-table-card">
          <KTable
            dataSource={delegations}
            columns={[
              {
                title: 'Lãnh đạo ủy quyền',
                key: 'delegator',
                width: 200,
                render: (_: any, r: DelegationRule) => (
                  <div>
                    <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.delegator}</strong>
                    <div style={{ fontSize: 12, color: '#64748B' }}>{r.delegatorRole}</div>
                  </div>
                ),
              },
              {
                title: 'Cán bộ được ủy quyền',
                key: 'delegatee',
                width: 200,
                render: (_: any, r: DelegationRule) => (
                  <div>
                    <strong style={{ color: '#009688', fontSize: 13.5 }}>{r.delegatee}</strong>
                    <div style={{ fontSize: 12, color: '#64748B' }}>{r.delegateeRole}</div>
                  </div>
                ),
              },
              {
                title: 'Thời hạn & Phạm vi ủy quyền',
                key: 'period',
                render: (_: any, r: DelegationRule) => (
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#2563EB' }}>
                      {r.fromDate} ➔ {r.toDate}
                    </div>
                    <div style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>{r.scope}</div>
                    <div style={{ fontSize: 11.5, color: '#64748B', fontStyle: 'italic', marginTop: 2 }}>
                      Lý do: {r.reason}
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
                  if (s === 'Đang hiệu lực') col = 'success';
                  if (s === 'Sắp tới') col = 'processing';
                  return <Tag color={col}>{s}</Tag>;
                },
              },
              {
                title: 'Thông báo',
                key: 'notify',
                width: 140,
                render: (_: any, r: DelegationRule) => (
                  <Tag color="cyan" icon={<BellOutlined />}>
                    {r.notifySlack ? 'Slack Alert Bật' : 'Tắt'}
                  </Tag>
                ),
              },
            ]}
            pagination={false}
          />
        </div>
      )}

      {/* TAB 3: BẢO MẬT KÝ SỐ & THÔNG BÁO TỰ ĐỘNG */}
      {activeTab === 'security' && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <LockOutlined style={{ color: '#009688' }} /> Thiết Lập Tham Số Bảo Mật Chữ Ký Số &amp; Cảnh Báo SLA
            </h3>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSaveSecuritySettings}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Lưu cấu hình hệ thống
            </Button>
          </div>

          <Form
            form={securityForm}
            layout="vertical"
            initialValues={{
              caProvider: 'viettel_ca',
              encryptionStandard: 'rsa_2048',
              sessionTimeout: 15,
              autoEscalate: 'yes',
              slackWebhook: 'https://hooks.slack.com/services/T00/B00/kiyovn-approvals-alert',
              dailyDigestTime: '08:00',
              requireOtpForLargeBudget: 'yes',
            }}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
                <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <SafetyCertificateOutlined style={{ color: '#2563EB' }} /> Chứng Thư Số &amp; Chuẩn Mã Hóa PKI:
                </div>

                <Form.Item name="caProvider" label="Nhà cung cấp dịch vụ chứng thực chữ ký số (CA)">
                  <Select
                    options={[
                      { label: 'Viettel-CA', value: 'viettel_ca' },
                      { label: 'VNPT-CA', value: 'vnpt_ca' },
                      { label: 'FPT-CA', value: 'fpt_ca' },
                    ]}
                  />
                </Form.Item>

                <Form.Item name="encryptionStandard" label="Tiêu chuẩn mã băm & Chữ ký điện tử">
                  <Select
                    options={[
                      { label: 'SHA-256 with RSA-2048', value: 'rsa_2048' },
                      { label: 'SHA-384 with RSA-4096', value: 'rsa_4096' },
                      { label: 'ECDSA P-256', value: 'ecdsa_p256' },
                    ]}
                  />
                </Form.Item>

                <Form.Item name="sessionTimeout" label="Thời gian tự động khóa phiên ký số">
                  <Input type="number" min={5} max={60} />
                </Form.Item>
              </div>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
                <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <BellOutlined style={{ color: '#D97706' }} /> Kênh Cảnh Báo &amp; Tự Động Hóa SLA:
                </div>

                <Form.Item name="slackWebhook" label="Slack Webhook Channel thông báo tờ trình P1">
                  <Input placeholder="https://hooks.slack.com/services/..." />
                </Form.Item>

                <Form.Item name="autoEscalate" label="Tự động leo thang cấp duyệt khi quá hạn SLA">
                  <Select
                    options={[
                      { label: 'Bật', value: 'yes' },
                      { label: 'Tắt', value: 'no' },
                    ]}
                  />
                </Form.Item>

                <Form.Item name="requireOtpForLargeBudget" label="Bắt buộc xác thực OTP 2FA cho khoản chi > 500 Triệu">
                  <Select
                    options={[
                      { label: 'Bắt buộc SMS / Google Authenticator OTP', value: 'yes' },
                      { label: 'Chỉ yêu cầu mã PIN Token', value: 'no' },
                    ]}
                  />
                </Form.Item>
              </div>
            </div>
          </Form>
        </div>
      )}

      {/* MODAL: Thêm / Sửa Tầng Hạn Mức Ngân Sách */}
      <Modal
        title={editingTierKey ? 'Chỉnh Sửa Tầng Hạn Mức Ngân Sách' : 'Thêm Mới Tầng Hạn Mức Ngân Sách'}
        open={tierModalOpen}
        onCancel={() => setTierModalOpen(false)}
        footer={null}
        width={600}
      >
        <Form form={tierForm} layout="vertical" onFinish={handleSaveTier} style={{ marginTop: 14 }}>
          <Form.Item name="tierName" label="Tên phân cấp hạn mức" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Cấp 3: Đầu tư thiết bị hạ tầng IDC" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="minAmount" label="Số tiền tối thiểu (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={10000000} />
            </Form.Item>
            <Form.Item name="maxAmount" label="Số tiền tối đa (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={10000000} />
            </Form.Item>
          </div>

          <Form.Item name="requiredLevels" label="Luồng các cấp phê duyệt bắt buộc" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Trưởng phòng ➔ Kế toán trưởng ➔ Tổng Giám Đốc" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="slaHours" label="Cam kết SLA" rules={[{ required: true }]}>
              <Input type="number" min={1} max={72} />
            </Form.Item>
            <Form.Item name="autoEscalateHours" label="Leo thang sau" rules={[{ required: true }]}>
              <Input type="number" min={1} max={72} />
            </Form.Item>
            <Form.Item name="status" label="Trạng thái" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Kích hoạt', value: 'Kích hoạt' },
                  { label: 'Tạm dừng', value: 'Tạm dừng' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setTierModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu thiết lập
            </Button>
          </div>
        </Form>
      </Modal>

      {/* MODAL: Thêm Thiết Lập Lệnh Ủy Quyền Mới */}
      <Modal
        title="Thiết Lập Lệnh Ủy Quyền Phê Duyệt Khi Vắng Mặt"
        open={delegationModalOpen}
        onCancel={() => setDelegationModalOpen(false)}
        footer={null}
        width={650}
      >
        <Form form={delegationForm} layout="vertical" onFinish={handleSaveDelegation} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="delegator" label="Lãnh đạo ủy quyền" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Nguyễn Văn Minh" />
            </Form.Item>
            <Form.Item name="delegatorRole" label="Chức danh người ủy quyền" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Tổng Giám Đốc (CEO)" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="delegatee" label="Cán bộ nhận ủy quyền thay mặt duyệt" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Trần Tuấn Anh" />
            </Form.Item>
            <Form.Item name="delegateeRole" label="Chức danh người nhận" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Phó Tổng Giám Đốc (CTO)" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="fromDate" label="Hiệu lực từ ngày" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="toDate" label="Đến ngày" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <Form.Item name="scope" label="Phạm vi & Hạn mức được ủy quyền duyệt" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Mua sắm thiết bị & Hợp đồng dưới 200 Triệu VNĐ" />
          </Form.Item>

          <Form.Item name="reason" label="Lý do ủy quyền" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Nhập lý do chi tiết..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setDelegationModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Kích hoạt ủy quyền
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

