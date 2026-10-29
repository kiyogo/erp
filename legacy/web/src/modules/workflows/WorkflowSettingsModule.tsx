import { dataService } from '../../services/dataService';
import { collectionsApi, usersApi } from '../../api/endpoints';
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
  delegatorId: string;
  delegateeId: string;
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

  const [tierModalOpen, setTierModalOpen] = useState(false);
  const [tierForm] = Form.useForm();
  const [editingTierKey, setEditingTierKey] = useState<string | null>(null);

  // Delegation state
  const [delegations, setDelegations] = useState<DelegationRule[]>(INITIAL_DELEGATIONS);
  const [delegationModalOpen, setDelegationModalOpen] = useState(false);
  const [delegationForm] = Form.useForm();
  const [employees, setEmployees] = useState<Array<{ id: string; name: string; department?: string; position?: string; isActive?: boolean }>>([]);
  const [workflowScopes, setWorkflowScopes] = useState<Array<{ value: string; label: string }>>([]);

  // Security policies form
  const [securityForm] = Form.useForm();
  const [securitySettings, setSecuritySettings] = useState<Record<string, any> | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const tiersList = dataService.getGenericData('workflow_settings');
      const delegationsList = dataService.getGenericData('workflow_delegations');
      const securityList = dataService.getGenericData('workflow_security_settings');
      setTiers(Array.isArray(tiersList) ? tiersList : []);
      setDelegations(Array.isArray(delegationsList) ? delegationsList : []);
      setSecuritySettings(Array.isArray(securityList) ? securityList.find((item) => item.key === 'security') || null : null);
    };
    refresh();
    const unsubscribe = dataService.subscribe(refresh);
    const workflows = dataService.getGenericData('workflow_blueprints');
    setWorkflowScopes((Array.isArray(workflows) ? workflows : [])
      .filter((workflow) => workflow.status === 'Đang áp dụng')
      .map((workflow) => ({ value: workflow.workflowCode, label: `${workflow.workflowCode}: ${workflow.workflowName}` })));
    usersApi.getAll({ page: 1, limit: 100 }).then(async (response) => {
      const users = [...(response.data.data || [])];
      const total = Number(response.data.pagination?.total || users.length);
      const limit = Number(response.data.pagination?.limit || 100);
      for (let page = 2; page <= Math.ceil(total / limit); page++) {
        const next = await usersApi.getAll({ page, limit });
        users.push(...(next.data.data || []));
      }
      setEmployees(users.filter((person: any) => person.isActive).map((person: any) => ({
        id: person.id,
        name: person.name || person.fullName || person.email,
        department: person.department,
        position: person.position,
        isActive: person.isActive,
      })));
    }).catch(() => message.error('Không tải được danh sách tài khoản để thiết lập ủy quyền.'));
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (securitySettings) securityForm.setFieldsValue(securitySettings);
  }, [securitySettings]);

  const handleOpenAddTier = () => {
    setEditingTierKey(null);
    tierForm.resetFields();
    const minimum = tiers.reduce((max, tier) => Math.max(max, tier.maxAmount), 0) + 1;
    tierForm.setFieldsValue({
      tierName: `Cấp ${tiers.length + 1}: Hạn mức mới`,
      minAmount: minimum,
      maxAmount: minimum + 100000000,
      requiredLevels: '2 Cấp: Trưởng phòng ➔ Giám đốc',
      slaHours: 4,
      autoEscalateHours: 8,
      requirePKI: true,
      status: 'Kích hoạt',
    });
    setTierModalOpen(true);
  };

  const handleSaveTier = async (values: any) => {
    const tier = {
      ...values,
      key: editingTierKey || String(Date.now()),
      minAmount: Number(values.minAmount),
      maxAmount: Number(values.maxAmount),
      slaHours: Number(values.slaHours),
      autoEscalateHours: Number(values.autoEscalateHours),
    };
    setSaving(true);
    try {
      if (editingTierKey) await collectionsApi.patch<BudgetMatrixTier>('workflow_settings', editingTierKey, tier);
      else await collectionsApi.create<BudgetMatrixTier>('workflow_settings', tier);
      setTiers(await dataService.refreshGenericData('workflow_settings'));
      message.success(editingTierKey ? 'Đã cập nhật tầng hạn mức ngân sách.' : 'Đã thêm tầng hạn mức ngân sách.');
      setTierModalOpen(false);
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể lưu tầng hạn mức ngân sách.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenAddDelegation = () => {
    delegationForm.resetFields();
    delegationForm.setFieldsValue({
      fromDate: new Date().toISOString().slice(0, 10),
      toDate: new Date().toISOString().slice(0, 10),
      scope: '*',
      notifySlack: false,
    });
    setDelegationModalOpen(true);
  };

  const handleSaveDelegation = async (values: any) => {
    const newDelegation = { ...values, key: String(Date.now()), notifySlack: false };
    setSaving(true);
    try {
      const result = await collectionsApi.create<DelegationRule>('workflow_delegations', newDelegation);
      setDelegations(await dataService.refreshGenericData('workflow_delegations'));
      message.success(`Đã lưu ủy quyền từ ${result.data.record.delegator} sang ${result.data.record.delegatee}.`);
      setDelegationModalOpen(false);
      delegationForm.resetFields();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể lưu quy tắc ủy quyền.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSecuritySettings = async () => {
    const values = securityForm.getFieldsValue();
    const current = securitySettings;
    setSaving(true);
    try {
      if (current) await collectionsApi.patch('workflow_security_settings', 'security', values);
      else await collectionsApi.create('workflow_security_settings', { ...values, key: 'security' });
      const refreshed = await dataService.refreshGenericData('workflow_security_settings');
      setSecuritySettings(refreshed.find((item) => item.key === 'security') || null);
      message.success('Đã lưu cấu hình quy trình. Nhà cung cấp CA và Slack vẫn cần tích hợp riêng.');
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Không thể lưu cấu hình bảo mật quy trình.');
    } finally {
      setSaving(false);
    }
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
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Hiệu lực xác định theo khoảng ngày</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chứng thư số tích hợp</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>Chưa kết nối</div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Cấu hình CA được lưu riêng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cơ chế leo thang tự động</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            Chưa kích hoạt
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tác vụ nền chưa được nối</div>
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
                      Cảnh báo sau: <strong>{r.autoEscalateHours} Giờ</strong>
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
                  <Tag color={r.notifySlack ? 'cyan' : 'default'} icon={<BellOutlined />}>
                    {r.notifySlack ? 'Slack Alert Bật' : 'Chưa tích hợp Slack'}
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
              disabled={saving}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Lưu cấu hình hệ thống
            </Button>
          </div>

          <Form form={securityForm} layout="vertical" initialValues={{ caProvider: 'not_configured', encryptionStandard: 'rsa_2048', sessionTimeout: 15, autoEscalate: 'no', slackWebhook: '', dailyDigestTime: '08:00', requireOtpForLargeBudget: 'no' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
                <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <SafetyCertificateOutlined style={{ color: '#2563EB' }} /> Chứng Thư Số &amp; Chuẩn Mã Hóa PKI:
                </div>

                <Form.Item name="caProvider" label="Nhà cung cấp dịch vụ chứng thực chữ ký số (CA)">
                  <Select
                    options={[
                      { label: 'Chưa cấu hình', value: 'not_configured' },
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

                <Form.Item name="slackWebhook" label="Webhook Slack">
                  <Input placeholder={securitySettings?.slackWebhookConfigured ? 'Đã lưu; nhập URL mới để thay thế' : 'https://hooks.slack.com/services/...'} />
                </Form.Item>

                <Form.Item
                  name="autoEscalate"
                  label="Thông báo quản trị viên khi hồ sơ quá hạn SLA"
                  extra="Hệ thống ghi nhật ký và gửi thông báo nội bộ; không tự thay đổi người duyệt hoặc quyền phê duyệt."
                >
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
                      { label: 'Bắt buộc Google Authenticator OTP', value: 'yes' },
                      { label: 'Không yêu cầu OTP', value: 'no' },
                    ]}
                  />
                </Form.Item>
                <Alert
                  type="info"
                  showIcon
                  message="Người phê duyệt cần bật Google Authenticator trong mục Bảo mật. Mã dự phòng chỉ dùng được một lần."
                />
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
            <Button type="primary" htmlType="submit" disabled={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <Form.Item name="delegatorId" label="Người ủy quyền" rules={[{ required: true }]}>
              <Select options={employees.map((employee) => ({ value: employee.id, label: `${employee.name}${employee.department ? ` · ${employee.department}` : ''}` }))} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
            <Form.Item name="delegateeId" label="Người nhận ủy quyền" rules={[{ required: true }]}>
              <Select options={employees.map((employee) => ({ value: employee.id, label: `${employee.name}${employee.department ? ` · ${employee.department}` : ''}` }))} />
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="scope" label="Quy trình được ủy quyền" rules={[{ required: true }]}>
              <Select options={[{ value: '*', label: 'Tất cả quy trình' }, ...workflowScopes]} />
            </Form.Item>
            <Form.Item name="maxBudgetAmount" label="Hạn mức mỗi hồ sơ (VNĐ)">
              <Input type="number" min={0} step={1000000} placeholder="Để trống nếu không giới hạn" />
            </Form.Item>
          </div>

          <Form.Item name="reason" label="Lý do ủy quyền" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Nhập lý do chi tiết..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setDelegationModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" disabled={saving || employees.length < 2} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Kích hoạt ủy quyền
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

