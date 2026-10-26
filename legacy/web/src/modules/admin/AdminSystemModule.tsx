import React, { useEffect, useState } from 'react';
import {
  CheckCircleOutlined,
  MailOutlined,
  SaveOutlined,
  SendOutlined,
  SettingOutlined,
  CopyOutlined,
  ApiOutlined,
  KeyOutlined,
  LinkOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Select, Tag, Tooltip, message } from '../../custom-ui';
import { EmailGatewayConfig, systemApi } from '../../api/endpoints';

const emptyConfig: EmailGatewayConfig = {
  host: '',
  port: 587,
  username: '',
  senderEmail: '',
  senderName: 'KIYOVN Enterprise',
  security: 'STARTTLS',
  portalUrl: window.location.origin,
  enabled: true,
  password: '',
  passwordConfigured: false,
  configured: false,
};

export const AdminSystemModule: React.FC = () => {
  const [form] = Form.useForm();
  const [googleForm] = Form.useForm();
  const [config, setConfig] = useState<EmailGatewayConfig>(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testingGoogle, setTestingGoogle] = useState(false);

  const [googleConfig, setGoogleConfig] = useState({ clientKey: '', clientSecret: '', redirectUri: window.location.origin, allowedDomain: '', enforceGoogleLogin: 'optional', configured: false });
  const load = async () => {
    setLoading(true);
    try {
      const response = await systemApi.getEmailConfig();
      const next = response.data.config;
      setConfig(next);
      form.setFieldsValue(next);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải cấu hình email.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void systemApi.getGoogleConfig().then(response => {
      const next = { ...response.data, redirectUri: response.data.redirectUri || window.location.origin };
      setGoogleConfig(next);
      googleForm.setFieldsValue(next);
    }).catch(() => message.error('Không thể tải cấu hình Google.'));
  }, []);

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      const response = await systemApi.saveEmailConfig({ ...values, port: Number(values.port), enabled: true });
      setConfig(response.data.config);
      form.setFieldsValue(response.data.config);
      message.success('Đã lưu cấu hình cổng gửi email doanh nghiệp.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu cấu hình email.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    const recipient = form.getFieldValue('senderEmail') || config.senderEmail;
    if (!config.configured) {
      message.warning('Hãy lưu cấu hình SMTP hoàn chỉnh trước khi gửi thử.');
      return;
    }
    setTesting(true);
    try {
      await systemApi.testEmailConfig(recipient);
      message.success(`Đã gửi email kiểm tra đến ${recipient}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Gửi email kiểm tra thất bại.');
    } finally {
      setTesting(false);
    }
  };

  // Google OAuth Form Handlers
  const handleSaveGoogle = async (values: any) => {
    setSaving(true);
    try {
      const response = await systemApi.saveGoogleConfig({ clientKey: values.clientKey, redirectUri: values.redirectUri, allowedDomain: values.allowedDomain, enforceGoogleLogin: values.enforceGoogleLogin });
      setGoogleConfig(response.data.config);
      googleForm.setFieldsValue(response.data.config);
      message.success('Đã lưu cấu hình Google trên máy chủ.');
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể lưu cấu hình Google.'); }
    finally { setSaving(false); }
  };

  const handleTestGoogleConnection = async () => {
    setTestingGoogle(true);
    try {
      const response = await fetch('https://accounts.google.com/.well-known/openid-configuration', { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Không thể đọc cấu hình Google.');
      const discovery = await response.json();
      if (discovery.issuer !== 'https://accounts.google.com') throw new Error('Cấu hình Google không hợp lệ.');
      message.success('Đã kết nối dịch vụ Google. Cần đăng nhập thực tế để xác minh Client ID.');
    } catch { message.error('Không thể kết nối dịch vụ Google.'); }
    finally { setTestingGoogle(false); }
  };

  const handleCopyRedirectUri = async () => {
    try { await navigator.clipboard.writeText(googleForm.getFieldValue('redirectUri') || googleConfig.redirectUri); message.success('Đã sao chép origin.'); }
    catch { message.error('Không thể sao chép origin.'); }
  };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box', maxWidth: 980 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: '#0F172A' }}>
            <SettingOutlined style={{ color: '#009688', marginRight: 8 }} />
            Cấu hình hệ thống
          </h1>
          <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>
            Quản lý cổng phát hành email thông báo và cổng đăng nhập tập trung Google Identity OAuth 2.0.
          </div>
        </div>
        <Tag color={config.configured ? 'success' : 'warning'}>
          {config.configured ? '● SMTP đang sẵn sàng' : '○ SMTP chưa hoàn tất'}
        </Tag>
      </div>

      {/* SMTP Email Gateway Section */}
      <Card style={{ borderColor: '#D9E4EC' }} loading={loading}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 750, color: '#0F172A' }}>
            <MailOutlined style={{ color: '#009688', marginRight: 8 }} />
            Cấu Hình Cổng Gửi Email Doanh Nghiệp
          </div>
          <Button icon={<SendOutlined />} loading={testing} onClick={() => void handleTest()} disabled={!config.configured}>
            Gửi thử email
          </Button>
        </div>

        <Alert
          type={config.configured ? 'success' : 'info'}
          showIcon
          message={
            config.configured
              ? 'Cổng email đã sẵn sàng phát hành email kích hoạt.'
              : 'Hoàn tất SMTP để kênh Email xuất hiện khi phát thông báo “Kích hoạt tài khoản”.'
          }
          style={{ marginBottom: 18 }}
        />

        <Form form={form} layout="vertical" onFinish={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0 16px' }}>
            <Form.Item name="host" label="Máy chủ SMTP" rules={[{ required: true }]}>
              <Input placeholder="smtp.office365.com" />
            </Form.Item>
            <Form.Item name="port" label="Cổng SMTP" rules={[{ required: true }]}>
              <Input type="number" min={1} max={65535} />
            </Form.Item>
            <Form.Item name="senderEmail" label="Email người gửi" rules={[{ required: true, type: 'email' }]}>
              <Input placeholder="no-reply@company.vn" />
            </Form.Item>
            <Form.Item name="senderName" label="Tên hiển thị người gửi" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="username" label="Tài khoản SMTP" rules={[{ required: true }]}>
              <Input placeholder="Thường là email người gửi" />
            </Form.Item>
            <Form.Item name="password" label="App Password SMTP" rules={[{ required: true, message: 'Vui lòng nhập App Password SMTP' }]}>
              <Input.Password autoComplete="new-password" placeholder="Nhập App Password SMTP" />
            </Form.Item>
            <Form.Item name="security" label="Bảo mật kết nối" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: 'STARTTLS', label: 'STARTTLS' },
                  { value: 'SSL', label: 'SSL/TLS' },
                ]}
              />
            </Form.Item>
            <Form.Item name="portalUrl" label="Địa chỉ cổng nhân viên" rules={[{ required: true, type: 'url' }]}>
              <Input placeholder="https://portal.company.vn" />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={saving}
              style={{ background: '#009688', borderColor: '#009688' }}
            >
              Lưu cấu hình email
            </Button>
          </div>
        </Form>
      </Card>

      {/* Google OAuth Login Section */}
      <Card style={{ borderColor: '#D9E4EC', marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 750, color: '#0F172A', display: 'flex', alignItems: 'center' }}>
            <img src="/google.png" alt="Google" style={{ width: 20, height: 20, marginRight: 8, objectFit: 'contain' }} />
            Cấu Hình Đăng Nhập Google SSO
          </div>
          <Tag color={googleConfig.configured ? 'success' : 'warning'}>
            {googleConfig.configured ? '● Google Client ID đã cấu hình' : '○ Google OAuth chưa cấu hình'}
          </Tag>
        </div>

        <Alert
          type="info"
          showIcon
          message="Khai báo Client Key, Client Secret và Redirect URI đã tạo trên Google Cloud Console để kích hoạt đăng nhập đơn bằng Google SSO."
          style={{ marginBottom: 18 }}
        />

        <Form form={googleForm} layout="vertical" onFinish={handleSaveGoogle}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '0 16px' }}>
            <Form.Item
              name="clientKey"
              label="Client Key"
              rules={[{ required: true, message: 'Vui lòng nhập Client Key!' }]}
            >
              <Input
                prefix={<KeyOutlined style={{ color: '#009688' }} />}
                placeholder="782910345612-app.apps.googleusercontent.com"
              />
            </Form.Item>

            <Form.Item
              name="clientSecret"
              label="Client Secret"
            >
              <Input.Password
                prefix={<SafetyCertificateOutlined style={{ color: '#009688' }} />}
                placeholder="Không dùng trong luồng đăng nhập hiện tại" disabled
              />
            </Form.Item>

            <Form.Item
              name="redirectUri"
              label="Authorized JavaScript origin"
              rules={[{ required: true, message: 'Vui lòng nhập Redirect URI!' }]}
            >
              <Input
                prefix={<LinkOutlined style={{ color: '#009688' }} />}
                suffix={
                  <Tooltip title="Sao chép origin">
                    <CopyOutlined
                      onClick={handleCopyRedirectUri}
                      style={{ cursor: 'pointer', color: '#009688' }}
                    />
                  </Tooltip>
                }
                placeholder="https://app.kiyovn.vn"
              />
            </Form.Item>

            <Form.Item
              name="allowedDomain"
              label="Tên miền Google Workspace nội bộ"
              rules={[{ required: true, message: 'Vui lòng nhập tên miền!' }]}
            >
              <Input placeholder="@kiyovn.com" />
            </Form.Item>

            <Form.Item
              name="enforceGoogleLogin"
              label="Chế độ xác thực đăng nhập"
              rules={[{ required: true }]}
            >
              <Select
                options={[
                  { value: '100', label: 'Bắt buộc 100% Đăng nhập bằng Google OAuth' },
                  { value: 'optional', label: 'Cho phép đăng nhập linh hoạt' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button icon={<CopyOutlined />} onClick={handleCopyRedirectUri}>
                Sao chép origin
              </Button>
              <Button icon={<ApiOutlined />} loading={testingGoogle} onClick={handleTestGoogleConnection}>
                Kiểm tra kết nối Google OAuth
              </Button>
            </div>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              style={{ background: '#009688', borderColor: '#009688' }}
            >
              Lưu cấu hình Google SSO
            </Button>
          </div>
        </Form>
      </Card>

      <div style={{ marginTop: 14, fontSize: 12.5, color: '#64748B', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
        <CheckCircleOutlined style={{ color: '#009688', marginTop: 2 }} />
        Mật khẩu SMTP và Chứng thư Google OAuth được bảo mật mã hóa AES-256 tập trung trên máy chủ hệ thống.
      </div>
    </div>
  );
};
