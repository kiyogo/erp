import React, { useState } from 'react';
import {
  SettingOutlined,
  BankOutlined,
  GlobalOutlined,
  SaveOutlined,
  PrinterOutlined,
  MailOutlined,
  CloudServerOutlined,
  SafetyCertificateOutlined,
  DollarOutlined,
  CreditCardOutlined,
} from '@ant-design/icons';
import { Button, Input, Select, message, Tag, Card, Tooltip } from '../../custom-ui';
import { dataService } from '../../services/dataService';

export const SystemSettingsModule: React.FC = () => {
  const [companyName, setCompanyName] = useState('CÔNG TY CỔ PHẦN CÔNG NGHỆ KIYOVN');
  const [taxCode, setTaxCode] = useState('0108999888');
  const [address, setAddress] = useState('Tòa nhà Keangnam Landmark 72, Đường Phạm Hùng, Nam Từ Liêm, Hà Nội');
  const [timezone, setTimezone] = useState('Asia/Ho_Chi_Minh (GMT+7)');
  const [currency, setCurrency] = useState('VND (₫)');
  const [smtpServer, setSmtpServer] = useState('smtp.office365.com');
  const [smtpPort, setSmtpPort] = useState('587');
  const [activeTab, setActiveTab] = useState<'legal' | 'network' | 'smtp' | 'payment'>('legal');

  const handleSave = () => {
    dataService.logAction('Cập nhật', 'Cài đặt', 'Cập nhật thông số hệ thống và thông tin công ty');
    message.success('Đã lưu cấu hình tham số hệ thống doanh nghiệp thành công!');
  };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Pháp nhân doanh nghiệp sở hữu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            KIYOVN CORP
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>MST: {taxCode} · Vốn ĐL 50 tỷ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Độ trễ mạng IDC Cluster</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            ≤ 1.2ms Uptime 99.99%
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>VNPT &amp; Viettel Tier 3 Dual Path</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cổng Email SMTP Doanh Nghiệp</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            TLS v1.3 Verified
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Microsoft 365 Exchange Online</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Múi giờ &amp; Đồng hồ nguyên tử</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            NTP UTC+7 Đồng bộ
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Khớp chuẩn thời gian chứng thư số</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'legal', label: 'Pháp nhân & Doanh nghiệp', icon: <BankOutlined style={{ color: '#6366F1' }} /> },
            { key: 'network', label: 'Mạng hạ tầng & Tên miền', icon: <GlobalOutlined style={{ color: '#06B6D4' }} /> },
            { key: 'smtp', label: 'Email SMTP & Thông báo', icon: <MailOutlined style={{ color: '#EC4899' }} /> },
            { key: 'payment', label: 'Đơn vị tiền tệ & Ngân hàng', icon: <CreditCardOutlined style={{ color: '#0284C7' }} /> },
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
            onClick={() => message.success('Đã in bản thông số kỹ thuật hạ tầng hệ thống (A4)')}
          >
            In Thông Số (A4)
          </Button>

          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lưu cấu hình hệ thống
          </Button>
        </div>
      </div>

      {/* Settings Form Container */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 24, maxWidth: 880 }}>
        {activeTab === 'legal' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BankOutlined style={{ color: '#009688' }} /> Thông Tin Doanh Nghiệp &amp; Pháp Nhân Thương Mại
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Tên pháp nhân công ty</label>
                <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Mã số thuế doanh nghiệp (MST)</label>
                <Input value={taxCode} onChange={(e) => setTaxCode(e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Địa chỉ trụ sở chính đăng ký kinh doanh</label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'network' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <GlobalOutlined style={{ color: '#009688' }} /> Cấu Hình Mạng &amp; Tên Miền Enterprise
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Tên miền chính thức (Domain)</label>
                <Input defaultValue="portal.kiyovn.enterprise" />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Múi giờ hệ thống (Timezone)</label>
                <Select
                  value={timezone}
                  onChange={setTimezone}
                  style={{ width: '100%' }}
                  options={[
                    { label: 'Asia/Ho_Chi_Minh (GMT+7)', value: 'Asia/Ho_Chi_Minh (GMT+7)' },
                    { label: 'UTC (GMT+0)', value: 'UTC (GMT+0)' },
                  ]}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'smtp' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <MailOutlined style={{ color: '#009688' }} /> Cổng Mail Server SMTP (Thông Báo Tự Động)
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Địa chỉ máy chủ SMTP</label>
                <Input value={smtpServer} onChange={(e) => setSmtpServer(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Cổng kết nối SSL/TLS</label>
                <Input value={smtpPort} onChange={(e) => setSmtpPort(e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Tài khoản gửi thông báo</label>
                <Input defaultValue="noreply@kiyovn.enterprise" />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Trạng thái kết nối</label>
                <div style={{ paddingTop: 6 }}><Tag color="success">Đã kết nối thành công</Tag></div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'payment' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <DollarOutlined style={{ color: '#009688' }} /> Tiền Tệ Định Danh &amp; Tài Khoản Ngân Hàng Doanh Nghiệp
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Đơn vị tiền tệ chính</label>
                <Select
                  value={currency}
                  onChange={setCurrency}
                  style={{ width: '100%' }}
                  options={[
                    { label: 'VND (₫ - Đồng Việt Nam)', value: 'VND (₫)' },
                    { label: 'USD ($ - Đô la Mỹ)', value: 'USD ($)' },
                  ]}
                />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Số tài khoản VCB Hội Sở</label>
                <Input defaultValue="0011001999888 - Vietcombank Sở Giao Dịch" />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

