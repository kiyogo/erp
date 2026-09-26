import React, { useState } from 'react';
import {
  UserOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  PrinterOutlined,
  CheckCircleOutlined,
  KeyOutlined,
  AuditOutlined,
  IdcardOutlined,
  FileTextOutlined,
} from '@ant-design/icons';
import { Button, Input, message, Tag, Card, Tooltip, Progress, Form, Select } from '../../custom-ui';
import { dataService } from '../../services/dataService';

export const AccountSettingsModule: React.FC = () => {
  const [name, setName] = useState('Nguyễn Văn Minh (CEO)');
  const [email, setEmail] = useState('minh.nv@kiyovn.enterprise');
  const [phone, setPhone] = useState('0988 888 999');
  const [department, setDepartment] = useState('Ban Giám Đốc');
  const [position, setPosition] = useState('Tổng Giám Đốc Điều Hành (CEO)');
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'activity'>('profile');

  const handleSave = () => {
    dataService.logAction('Cập nhật', 'Cài đặt', 'Cập nhật thông tin tài khoản cá nhân');
    message.success('Đã cập nhật và lưu hồ sơ tài khoản thành công!');
  };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cấp độ bảo mật tài khoản</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
            <SafetyCertificateOutlined /> Cực Cao (Level 4)
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đã xác thực FIDO2 &amp; OTP phần cứng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Vai trò &amp; Đặc quyền hệ thống</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            Super Admin
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Toàn quyền điều phối và ký số HSM</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tình trạng liên kết Chữ ký số</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            VNPT-CA Online
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Chứng thư số HSM có hiệu lực đến 2028</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Lần đăng nhập gần nhất</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            08:15 Sáng nay
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Từ địa chỉ IP Keangnam Landmark 72</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'profile', label: 'Hồ sơ cá nhân & Chức danh', icon: <UserOutlined style={{ color: '#3B82F6' }} /> },
            { key: 'security', label: 'Thiết lập an toàn & Ký số', icon: <SafetyCertificateOutlined style={{ color: '#10B981' }} /> },
            { key: 'activity', label: 'Nhật ký hoạt động gần đây', icon: <FileTextOutlined style={{ color: '#3B82F6' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setActiveTab(tab.key as any)}
              style={{
                backgroundColor: activeTab === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: activeTab === tab.key ? '#009688' : '#CBD5E1',
                color: activeTab === tab.key ? '#00796B' : '#475569',
                fontWeight: activeTab === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            icon={<PrinterOutlined />}
            onClick={() => message.success('Đã in hồ sơ trích lục cán bộ nhân sự (A4)')}
          >
            In Hồ Sơ Cán Bộ (A4)
          </Button>

          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lưu thay đổi hồ sơ
          </Button>
        </div>
      </div>

      {/* Main Tab Content */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 24, maxWidth: 880 }}>
        {activeTab === 'profile' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #F1F5F9' }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #009688, #004D40)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 800, boxShadow: '0 4px 12px rgba(0, 150, 136, 0.25)' }}>
                M
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: '#0F172A' }}>{name}</div>
                <div style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>Mã cán bộ: <strong style={{ color: '#009688' }}>KY-001</strong> · Vai trò: <strong>Super Admin</strong></div>
                <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                  <Tag color="success">Đang hoạt động</Tag>
                  <Tag color="purple">Thành viên HĐQT</Tag>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Họ và tên hiển thị</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Email doanh nghiệp</label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Số điện thoại hotline</label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Phòng ban công tác</label>
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Chức vụ &amp; Nhiệm vụ quản lý</label>
                <Input value={position} onChange={(e) => setPosition(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'security' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <SafetyCertificateOutlined style={{ color: '#009688' }} /> Chính Sách An Toàn &amp; Chữ Ký Số Pháp Lý
            </div>

            <div style={{ padding: 14, background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0F172A' }}>Xác thực 2 bước (MFA / FIDO2)</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>Bắt buộc nhập mã OTP hoặc vân tay khi đăng nhập từ thiết bị mới</div>
              </div>
              <Tag color="success">Đã kích hoạt</Tag>
            </div>

            <div style={{ padding: 14, background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0F172A' }}>Chữ ký số Cloud HSM (VNPT-CA)</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>Dùng ký duyệt văn bản điện tử và ủy nhiệm chi ngân hàng tự động</div>
              </div>
              <Tag color="cyan">Sẵn sàng ký số</Tag>
            </div>

            <div style={{ padding: 14, background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0F172A' }}>Chính sách đổi mật khẩu định kỳ</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>Đã đổi mật khẩu 14 ngày trước · Còn 76 ngày cho chu kỳ tiếp theo</div>
              </div>
              <Button size="small" onClick={() => message.info('Vui lòng vào tab Bảo Mật để đổi mật khẩu')}>Đổi ngay</Button>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AuditOutlined style={{ color: '#009688' }} /> Lịch Sử Đăng Nhập &amp; Thao Tác Gần Đây
            </div>

            <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>Đăng nhập thành công từ Chrome Enterprise macOS</div>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>IP: 113.190.234.12 · Văn phòng Keangnam 72 · Hôm nay 08:15:20</div>
              </div>
              <Tag color="success">Hợp lệ</Tag>
            </div>

            <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>Ký số phê duyệt Hợp đồng HD-2026-ACB-01 (2.45 tỷ)</div>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>IP: 113.190.234.12 · Token HSM Verified · Hôm nay 15:12:45</div>
              </div>
              <Tag color="blue">Ký số HSM</Tag>
            </div>

            <div style={{ padding: '10px 14px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13, color: '#0F172A' }}>Xuất bảng cân đối số phát sinh Q3/2026 ra Excel</div>
                <div style={{ fontSize: 11.5, color: '#64748B' }}>IP: 113.190.234.12 · Hôm qua 16:45:00</div>
              </div>
              <Tag color="cyan">Xuất tệp</Tag>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

