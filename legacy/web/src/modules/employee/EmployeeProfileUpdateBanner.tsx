import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ExclamationCircleFilled,
  RightOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  FormOutlined,
  HistoryOutlined,
  UserOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { Button, Modal, Tag } from '../../custom-ui';
import { dataService, EmployeeProfileUpdateRequest } from '../../services/dataService';

export const EmployeeProfileUpdateBanner: React.FC = () => {
  const navigate = useNavigate();
  const [activeReq, setActiveReq] = useState<EmployeeProfileUpdateRequest | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const checkRequest = () => {
    const req = dataService.getActiveEmployeeProfileUpdateRequest();
    setActiveReq(req);
  };

  useEffect(() => {
    checkRequest();
    const interval = setInterval(checkRequest, 3000);
    return () => clearInterval(interval);
  }, []);

  if (!activeReq || activeReq.status === 'completed') {
    return null;
  }

  const isReset = activeReq.type === 'reset_setup';

  const handleStartUpdate = () => {
    setModalOpen(false);
    if (isReset) {
      navigate('/employee');
    } else {
      navigate('/employee/profile');
    }
  };

  const handleDismiss = () => {
    dataService.resolveEmployeeProfileUpdateRequest(activeReq.id);
    setActiveReq(null);
    setModalOpen(false);
  };

  return (
    <>
      {/* Top Straight Alert Banner (Thanh thông báo thẳng khung ở trên đầu) */}
      <div
        onClick={() => setModalOpen(true)}
        style={{
          width: '100%',
          background: isReset
            ? 'linear-gradient(90deg, #FEF2F2 0%, #FFF1F2 100%)'
            : 'linear-gradient(90deg, #FFFBEB 0%, #FEF3C7 100%)',
          border: isReset ? '1px solid #FECDD3' : '1px solid #FDE68A',
          borderRadius: 8,
          padding: '10px 14px',
          boxSizing: 'border-box',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          cursor: 'pointer',
          boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
          marginBottom: 14,
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.03)';
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 6,
              background: isReset ? '#FEE2E2' : '#FEF3C7',
              color: isReset ? '#DC2626' : '#D97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            {isReset ? <HistoryOutlined /> : <ExclamationCircleFilled />}
          </div>

          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, fontSize: 13.5, color: isReset ? '#991B1B' : '#92400E' }}>
                {isReset ? 'Yêu cầu thiết lập lại hồ sơ từ Quản trị viên' : 'Yêu cầu cập nhật / bổ sung hồ sơ từ Nhân sự'}
              </span>
              <Tag color={isReset ? 'red' : 'orange'} style={{ borderRadius: 4, margin: 0, fontSize: 11 }}>
                {activeReq.sections.length} mục cần hoàn thiện
              </Tag>
            </div>
            <div style={{ fontSize: 12.5, color: isReset ? '#B91C1C' : '#B45309', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {activeReq.note ? `Ghi chú: "${activeReq.note}"` : `Các mục: ${activeReq.sections.join(', ')}`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setModalOpen(true);
            }}
            style={{
              background: isReset ? '#DC2626' : '#D97706',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 6,
              padding: '6px 14px',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>Xem chi tiết</span>
            <RightOutlined style={{ fontSize: 10 }} />
          </button>
        </div>
      </div>

      {/* Modal Dialog: Chi tiết yêu cầu cập nhật hồ sơ */}
      <Modal
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: isReset ? '#DC2626' : '#D97706', fontSize: 16, fontWeight: 700 }}>
            {isReset ? <HistoryOutlined /> : <FormOutlined />}
            <span>{isReset ? 'Đặt lại thiết lập hồ sơ nhân viên' : 'Yêu cầu cập nhật thông tin hồ sơ'}</span>
          </div>
        }
        width={540}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: 10 }}>
            <Button onClick={handleDismiss} style={{ borderRadius: 6, fontSize: 12.5 }}>
              Đã hoàn tất / Bỏ qua
            </Button>
            <Button
              type="primary"
              onClick={handleStartUpdate}
              style={{
                backgroundColor: isReset ? '#DC2626' : '#009688',
                borderColor: isReset ? '#DC2626' : '#009688',
                borderRadius: 6,
                fontWeight: 600,
                fontSize: 13,
              }}
            >
              {isReset ? 'Bắt đầu thiết lập lại hồ sơ' : 'Tiến hành cập nhật ngay'}
            </Button>
          </div>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '6px 0' }}>
          {/* Thông tin người gửi & Thời gian */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#F8FAFC', borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
            <div>
              <span style={{ color: '#64748B' }}>Người gửi yêu cầu: </span>
              <strong style={{ color: '#1E293B' }}>{activeReq.hrSender || 'Phòng Nhân sự / Quản trị viên'}</strong>
            </div>
            <div style={{ color: '#94A3B8', fontSize: 12 }}>
              {activeReq.createdAt}
            </div>
          </div>

          {/* Ghi chú của Admin / HR */}
          {activeReq.note && (
            <div style={{ background: isReset ? '#FEF2F2' : '#FFFBEB', border: isReset ? '1px solid #FECDD3' : '1px solid #FDE68A', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: isReset ? '#991B1B' : '#92400E', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                <InfoCircleOutlined />
                <span>Nội dung hướng dẫn từ Quản trị viên:</span>
              </div>
              <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5, fontStyle: 'italic' }}>
                "{activeReq.note}"
              </div>
            </div>
          )}

          {/* Danh sách các mục cần cập nhật / thiết lập lại */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#1E293B', marginBottom: 8 }}>
              Danh sách các mục thông tin cần hoàn thiện ({activeReq.sections.length}):
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, maxHeight: 200, overflowY: 'auto' }}>
              {activeReq.sections.map((sec, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '8px 12px',
                    background: '#F1F5F9',
                    border: '1px solid #E2E8F0',
                    borderRadius: 6,
                    fontSize: 12.5,
                    color: '#334155',
                    fontWeight: 500,
                  }}
                >
                  <ExclamationCircleFilled style={{ color: isReset ? '#EF4444' : '#F59E0B', fontSize: 14 }} />
                  <span>{sec}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
};
