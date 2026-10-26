import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  HomeOutlined,
  ArrowLeftOutlined,
  SearchOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  DashboardOutlined,
  SettingOutlined,
  CompassOutlined,
  QuestionCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Button, Card, Input } from '../custom-ui';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isEmployee = location.pathname.startsWith('/employee');

  const homePath = isEmployee ? '/employee/home' : '/admin/dashboard';

  const quickLinks = isEmployee
    ? [
        { title: 'Trang chủ nhân viên', icon: <HomeOutlined />, path: '/employee/home', desc: 'Xem trang chủ và hồ sơ làm việc' },
        { title: 'Chữ ký của tôi', icon: <SafetyCertificateOutlined />, path: '/employee/digital-signature/my-signature', desc: 'Quản lý chứng thư số & mẫu chữ ký' },
        { title: 'Kiểm tra chữ ký số', icon: <SafetyCertificateOutlined />, path: '/employee/digital-signature/verify', desc: 'Xác minh văn bản ký số trực tuyến' },
        { title: 'Tài liệu cá nhân', icon: <FileTextOutlined />, path: '/employee/files', desc: 'Kho lưu trữ tài liệu, hợp đồng' },
      ]
    : [
        { title: 'Bảng điều khiển', icon: <DashboardOutlined />, path: '/admin/dashboard', desc: 'Xem tổng quan báo cáo và thống kê' },
        { title: 'Quản lý tệp tin', icon: <FileTextOutlined />, path: '/admin/files', desc: 'Hệ thống quản trị hồ sơ & lưu trữ' },
        { title: 'Kiểm tra chữ ký số', icon: <SafetyCertificateOutlined />, path: '/admin/digital-signature/verify', desc: 'Công cụ xác thực chữ ký số chuẩn NEAC' },
        { title: 'Cài đặt hệ thống', icon: <SettingOutlined />, path: '/admin/settings/account', desc: 'Cấu hình bảo mật và tài khoản' },
      ];

  return (
    <div
      style={{
        minHeight: '80vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 16px',
        boxSizing: 'border-box',
        background: 'radial-gradient(circle at 50% 30%, #F0FDFA 0%, #FFFFFF 70%)',
      }}
    >
      <div style={{ maxWidth: 640, width: '100%', textAlign: 'center' }}>
        {/* 404 Large Visual Graphic */}
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 12 }}>
          <div
            style={{
              fontSize: 108,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: '-2px',
              background: 'linear-gradient(135deg, #009688 0%, #004D40 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: '0 10px 30px rgba(0, 150, 136, 0.15)',
              userSelect: 'none',
            }}
          >
            404
          </div>
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              right: -10,
              width: 38,
              height: 38,
              borderRadius: '50%',
              background: '#E0F2F1',
              color: '#009688',
              fontSize: 20,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(0, 150, 136, 0.2)',
            }}
          >
            <CompassOutlined />
          </div>
        </div>

        {/* Heading & Description */}
        <h1 style={{ fontSize: 24, fontWeight: 700, color: '#1E293B', margin: '0 0 8px 0' }}>
          Không tìm thấy trang yêu cầu
        </h1>
        <p style={{ fontSize: 14, color: '#64748B', lineHeight: 1.6, margin: '0 auto 20px auto', maxWidth: 480 }}>
          Trang hoặc đường dẫn bạn đang truy cập không tồn tại trên hệ thống <strong>KIYOVN Enterprise</strong>, đã bị di dời hoặc bạn chưa được phân quyền truy cập.
        </p>

        {/* Path highlight badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '6px 14px',
            background: '#F1F5F9',
            border: '1px solid #E2E8F0',
            borderRadius: 20,
            fontSize: 12.5,
            color: '#475569',
            marginBottom: 24,
          }}
        >
          <span>Đường dẫn:</span>
          <code style={{ color: '#E11D48', fontWeight: 600 }}>{location.pathname}</code>
        </div>

        {/* Primary Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginBottom: 36, flexWrap: 'wrap' }}>
          <Button
            icon={<ArrowLeftOutlined />}
            size="large"
            onClick={() => window.history.back()}
            style={{ borderRadius: 6, padding: '0 20px' }}
          >
            Quay lại trang trước
          </Button>

          <Button
            type="primary"
            icon={<HomeOutlined />}
            size="large"
            onClick={() => navigate(homePath)}
            style={{
              backgroundColor: '#009688',
              borderColor: '#009688',
              borderRadius: 6,
              padding: '0 24px',
              fontWeight: 600,
              boxShadow: '0 4px 14px rgba(0, 150, 136, 0.3)',
            }}
          >
            Về trang chủ
          </Button>
        </div>

        {/* Quick Access Section */}
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>
            Lối tắt truy cập nhanh
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
            {quickLinks.map((item, idx) => (
              <div
                key={idx}
                onClick={() => navigate(item.path)}
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  borderRadius: 8,
                  padding: '12px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#009688';
                  e.currentTarget.style.transform = 'translateY';
                  e.currentTarget.style.boxShadow = '0 6px 16px rgba';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#E2E8F0';
                  e.currentTarget.style.transform = 'translateY';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba';
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 8,
                    background: '#E0F2F1',
                    color: '#009688',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    flexShrink: 0,
                  }}
                >
                  {item.icon}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: '#1E293B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 11.5, color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 2 }}>
                    {item.desc}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFoundPage;
