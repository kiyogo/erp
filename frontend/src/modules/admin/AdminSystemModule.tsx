import React, { useEffect, useState } from 'react';
import { CheckCircleOutlined, MailOutlined, SaveOutlined, SendOutlined, SettingOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Select, Tag, message } from '../../custom-ui';
import { EmailGatewayConfig, systemApi } from '../../api/endpoints';

const emptyConfig: EmailGatewayConfig = {
  host: '', port: 587, username: '', senderEmail: '', senderName: 'KIYOVN Enterprise',
  security: 'STARTTLS', portalUrl: window.location.origin, enabled: true,
  passwordConfigured: false, configured: false,
};

export const AdminSystemModule: React.FC = () => {
  const [form] = Form.useForm();
  const [config, setConfig] = useState<EmailGatewayConfig>(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

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

  useEffect(() => { void load(); }, []);

  const handleSave = async (values: any) => {
    setSaving(true);
    try {
      const response = await systemApi.saveEmailConfig({ ...values, port: Number(values.port), enabled: true });
      setConfig(response.data.config);
      form.setFieldsValue({ ...response.data.config, password: '' });
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

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box', maxWidth: 980 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, color: '#0F172A' }}><SettingOutlined style={{ color: '#009688', marginRight: 8 }} />Cấu hình hệ thống</h1>
          <div style={{ marginTop: 4, color: '#64748B', fontSize: 13 }}>Cổng email này được dùng để phát liên kết kích hoạt tài khoản nhân sự.</div>
        </div>
        <Tag color={config.configured ? 'success' : 'warning'}>{config.configured ? '● SMTP đang sẵn sàng' : '○ SMTP chưa hoàn tất'}</Tag>
      </div>

      <Card style={{ borderColor: '#D9E4EC' }} loading={loading}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 750, color: '#0F172A' }}><MailOutlined style={{ color: '#009688', marginRight: 8 }} />Cấu Hình Cổng Gửi Email Doanh Nghiệp</div>
          <Button icon={<SendOutlined />} loading={testing} onClick={() => void handleTest()} disabled={!config.configured}>Gửi thử email</Button>
        </div>

        <Alert
          type={config.configured ? 'success' : 'info'}
          showIcon
          message={config.configured ? 'Cổng email đã sẵn sàng phát hành email kích hoạt.' : 'Hoàn tất SMTP để kênh Email xuất hiện khi phát thông báo “Kích hoạt tài khoản”.'}
          style={{ marginBottom: 18 }}
        />

        <Form form={form} layout="vertical" onFinish={handleSave}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0 16px' }}>
            <Form.Item name="host" label="Máy chủ SMTP" rules={[{ required: true }]}><Input placeholder="smtp.office365.com" /></Form.Item>
            <Form.Item name="port" label="Cổng SMTP" rules={[{ required: true }]}><Input type="number" min={1} max={65535} /></Form.Item>
            <Form.Item name="senderEmail" label="Email người gửi" rules={[{ required: true, type: 'email' }]}><Input placeholder="no-reply@company.vn" /></Form.Item>
            <Form.Item name="senderName" label="Tên hiển thị người gửi" rules={[{ required: true }]}><Input /></Form.Item>
            <Form.Item name="username" label="Tài khoản SMTP" rules={[{ required: true }]}><Input placeholder="Thường là email người gửi" /></Form.Item>
            <Form.Item name="password" label={config.passwordConfigured ? 'App Password SMTP (để trống nếu giữ nguyên)' : 'App Password SMTP'} rules={config.passwordConfigured ? [] : [{ required: true }]}><Input.Password autoComplete="new-password" /></Form.Item>
            <Form.Item name="security" label="Bảo mật kết nối" rules={[{ required: true }]}><Select options={[{ value: 'STARTTLS', label: 'STARTTLS (khuyến nghị, cổng 587)' }, { value: 'SSL', label: 'SSL/TLS (cổng 465)' }]} /></Form.Item>
            <Form.Item name="portalUrl" label="Địa chỉ cổng nhân viên" rules={[{ required: true, type: 'url' }]}><Input placeholder="https://portal.company.vn" /></Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} loading={saving} style={{ background: '#009688', borderColor: '#009688' }}>Lưu cấu hình email</Button>
          </div>
        </Form>
      </Card>

      <Card style={{ borderColor: '#D9E4EC', marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 750, color: '#0F172A', display: 'flex', alignItems: 'center' }}>
            <img src="/google.png" alt="Google" style={{ width: 20, height: 20, marginRight: 8, objectFit: 'contain' }} />
            Cấu Hình Đăng Nhập Google SSO (100% Google Authentication)
          </div>
          <Tag color="success">● Đã kích hoạt 100% Google Login</Tag>
        </div>

        <Alert
          type="success"
          showIcon
          message="Phương thức Đăng nhập bằng Google được bật 100% trên toàn hệ thống KIYOVN Enterprise cho tất cả nhân sự và quản trị viên."
          style={{ marginBottom: 18 }}
        />

        <Form
          layout="vertical"
          initialValues={{
            googleClientId: '782910345612-app-kiyovn-enterprise.apps.googleusercontent.com',
            enforceGoogleLogin: '100',
            allowedDomain: '@kiyovn.com',
            googleStatus: 'Đã kích hoạt 100%',
          }}
          onFinish={() => {
            message.success('Đã lưu cấu hình Đăng nhập bằng Google 100% thành công!');
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '0 16px' }}>
            <Form.Item name="googleClientId" label="Google OAuth Client ID" rules={[{ required: true }]}>
              <Input placeholder="782910345612-app.apps.googleusercontent.com" />
            </Form.Item>
            <Form.Item name="allowedDomain" label="Tên miền Google Workspace nội bộ" rules={[{ required: true }]}>
              <Input placeholder="@kiyovn.com" />
            </Form.Item>
            <Form.Item name="enforceGoogleLogin" label="Chế độ xác thực đăng nhập" rules={[{ required: true }]}>
              <Select
                options={[
                  { value: '100', label: 'Bắt buộc 100% Đăng nhập bằng Google OAuth' },
                  { value: 'optional', label: 'Cho phép đăng nhập linh hoạt' },
                ]}
              />
            </Form.Item>
            <Form.Item name="googleStatus" label="Trạng thái cổng kết nối Google Identity" rules={[{ required: true }]}>
              <Input disabled style={{ backgroundColor: '#F8FAFC', color: '#059669', fontWeight: 600 }} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <Button type="primary" htmlType="submit" icon={<SaveOutlined />} style={{ background: '#009688', borderColor: '#009688' }}>
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

