import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleFilled,
  SafetyCertificateOutlined,
  DesktopOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons';
import { EkycExtractedData } from '../ekyc/types/ekyc.types';

export const IdentityVerificationSuccessPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<Partial<EkycExtractedData>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem('employee_ekyc_verified');
      if (raw) {
        setData(JSON.parse(raw));
      }
    } catch {}
  }, []);

  return (
    <div
      style={{
        minHeight: '100dvh',
        width: '100%',
        maxWidth: 540,
        margin: '0 auto',
        padding: '24px 16px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--font)',
        boxSizing: 'border-box',
        background: '#FFFFFF',
      }}
    >
      {/* Top Success Badge */}
      <div
        style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: '#DCFCE7',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#16A34A',
          fontSize: 44,
          marginBottom: 16,
          boxShadow: '0 4px 16px rgba(22, 163, 74, 0.2)',
        }}
      >
        <CheckCircleFilled />
      </div>

      <h2
        style={{
          fontSize: 22,
          fontWeight: 700,
          color: '#0F172A',
          margin: '0 0 8px 0',
          textAlign: 'center',
        }}
      >
        Xác thực danh tính eKYC thành công!
      </h2>

      <p
        style={{
          fontSize: 14,
          color: '#64748B',
          textAlign: 'center',
          lineHeight: 1.6,
          margin: '0 0 24px 0',
          maxWidth: 420,
        }}
      >
        Dữ liệu sinh trắc học và Căn cước công dân đã được xác minh và đồng bộ tự động vào hệ thống.
      </p>

      {/* Desktop Notice Card */}
      <div
        style={{
          width: '100%',
          background: '#F0FDF4',
          border: '1px solid #BBF7D0',
          borderRadius: 12,
          padding: '16px 18px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          boxSizing: 'border-box',
        }}
      >
        <DesktopOutlined style={{ fontSize: 24, color: '#16A34A', marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: '#14532D', marginBottom: 2 }}>
            Tiếp tục trên máy tính
          </div>
          <div style={{ fontSize: 13, color: '#166534', lineHeight: 1.5 }}>
            Màn hình trên máy tính của bạn đã tự động cập nhật. Bạn có thể quay lại máy tính để thực hiện các bước tiếp theo.
          </div>
        </div>
      </div>

      {/* Verified Details Card */}
      <div
        style={{
          width: '100%',
          background: '#F8FAFC',
          border: '1px solid #E2E8F0',
          borderRadius: 12,
          padding: '16px 20px',
          marginBottom: 24,
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontWeight: 700,
            fontSize: 13.5,
            color: '#0F172A',
            marginBottom: 14,
            paddingBottom: 10,
            borderBottom: '1px solid #E2E8F0',
          }}
        >
          <SafetyCertificateOutlined style={{ color: '#009688', fontSize: 16 }} />
          <span>Thông tin hồ sơ xác thực</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748B' }}>Họ và tên:</span>
            <strong style={{ color: '#0F172A' }}>{data.name || 'NGUYỄN ĐỨC ĐẠI SƠN'}</strong>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#64748B' }}>Số CCCD:</span>
            <strong style={{ color: '#009688', letterSpacing: 0.5 }}>{data.idNumber || '064210005343'}</strong>
          </div>

          {data.birthDate && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Ngày sinh:</span>
              <span style={{ color: '#0F172A' }}>{data.birthDate}</span>
            </div>
          )}

          {data.gender && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#64748B' }}>Giới tính:</span>
              <span style={{ color: '#0F172A' }}>{data.gender}</span>
            </div>
          )}

          {data.residencePlace && (
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
              <span style={{ color: '#64748B', flexShrink: 0 }}>Nơi thường trú:</span>
              <span style={{ color: '#0F172A', textAlign: 'right' }}>{data.residencePlace}</span>
            </div>
          )}

          {data.certificateId && (
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 6, borderTop: '1px dashed #E2E8F0' }}>
              <span style={{ color: '#64748B' }}>Mã chứng thư:</span>
              <span style={{ color: '#64748B', fontFamily: 'monospace', fontSize: 12 }}>{data.certificateId}</span>
            </div>
          )}
        </div>
      </div>

      {/* Action Button */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button
          onClick={() => navigate('/employee')}
          style={{
            width: '100%',
            backgroundColor: '#009688',
            border: 'none',
            color: '#FFFFFF',
            borderRadius: 8,
            height: 44,
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <span>Vào Cổng Nhân Viên</span>
          <ArrowRightOutlined />
        </button>
      </div>
    </div>
  );
};
