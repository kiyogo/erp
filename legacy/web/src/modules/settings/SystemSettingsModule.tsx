import React, { useEffect, useState } from 'react';
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
import { CompanyProfile, EmailGatewayConfig, FinanceBankAccount, financeBankAccountsApi, systemApi } from '../../api/endpoints';
import api from '../../api/axios';
import { downloadFile, generateValidPdfBlob } from '../../utils/fileExporter';

export const SystemSettingsModule: React.FC = () => {
  const [profile, setProfile] = useState<CompanyProfile>({ companyName: '', fullName: '', shortName: '', companyCode: '', taxCode: '', businessType: '', establishedDate: '', registrationDate: '', registrationNo: '', registrationIssuer: '', representative: '', representativeTitle: '', address: '', phone: '', fax: '', email: '', website: '', domain: '', timezone: 'Asia/Ho_Chi_Minh', currency: 'VND', bankAccountId: '', legalForm: '', legalFormOther: '', companySize: '', industry: '', accountingRegime: '', accountingRegimeOther: '', fiscalYearStartMonth: null, fiscalYearStartDay: null, vatMethod: '', vatMethodOther: '' });
  const [emailConfig, setEmailConfig] = useState<EmailGatewayConfig>({ host: '', port: 587, username: '', senderEmail: '', senderName: '', security: 'STARTTLS', portalUrl: '', enabled: false, passwordConfigured: false, configured: false });
  const [bankAccounts, setBankAccounts] = useState<FinanceBankAccount[]>([]);
  const [activeTab, setActiveTab] = useState<'legal' | 'accounting' | 'network' | 'smtp' | 'payment'>('legal');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [companyLoaded, setCompanyLoaded] = useState(false);
  const [emailLoaded, setEmailLoaded] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  const changeProfile = <K extends keyof CompanyProfile>(field: K, value: CompanyProfile[K]) => setProfile(previous => ({ ...previous, [field]: value }));
  const load = async () => {
    setLoading(true);
    const started = performance.now();
    const results = await Promise.allSettled([systemApi.getCompanyProfile(), systemApi.getEmailConfig(), financeBankAccountsApi.getAll(), api.get('/health').then(() => Math.round(performance.now() - started))]);
    if (results[0].status === 'fulfilled') { setProfile(results[0].value.data.profile); setCompanyLoaded(true); }
    else { setCompanyLoaded(false); message.error('Không tải được hồ sơ công ty. Vui lòng tải lại.'); }
    if (results[1].status === 'fulfilled') { setEmailConfig({ ...results[1].value.data.config, password: '' }); setEmailLoaded(true); }
    else { setEmailLoaded(false); message.error('Không tải được cấu hình email.'); }
    if (results[2].status === 'fulfilled') setBankAccounts(results[2].value.data.data);
    else message.warning('Không tải được danh mục tài khoản ngân hàng.');
    setLatency(results[3].status === 'fulfilled' ? results[3].value : null);
    setLoading(false);
  };
  useEffect(() => { void load(); }, []);

  const handleSave = async () => {
    if (saving || loading) return;
    if (activeTab === 'smtp' ? !emailLoaded : !companyLoaded) { message.error('Cần tải thành công cấu hình hiện tại trước khi lưu.'); return; }
    setSaving(true);
    try {
      if (activeTab === 'smtp') {
        const result = await systemApi.saveEmailConfig(emailConfig);
        setEmailConfig({ ...result.data.config, password: '' });
        message.success('Đã lưu cấu hình cổng email trên máy chủ.');
      } else {
        const result = await systemApi.saveCompanyProfile(profile);
        setProfile(result.data.profile);
        message.success('Đã lưu thông tin và tùy chọn hiển thị của doanh nghiệp.');
      }
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể lưu cấu hình.'); }
    finally { setSaving(false); }
  };

  const legalFields: Array<{ key: 'fullName' | 'shortName' | 'companyCode' | 'businessType' | 'establishedDate' | 'registrationDate' | 'registrationNo' | 'registrationIssuer' | 'representative' | 'representativeTitle' | 'phone' | 'fax' | 'email' | 'website'; label: string; type?: string }> = [
    { key: 'fullName', label: 'Tên đầy đủ' }, { key: 'shortName', label: 'Tên viết tắt' }, { key: 'companyCode', label: 'Mã công ty' }, { key: 'businessType', label: 'Loại hình kinh doanh' },
    { key: 'establishedDate', label: 'Ngày thành lập', type: 'date' }, { key: 'registrationDate', label: 'Ngày cấp đăng ký kinh doanh', type: 'date' },
    { key: 'registrationNo', label: 'Mã đăng ký kinh doanh' }, { key: 'registrationIssuer', label: 'Nơi cấp' }, { key: 'representative', label: 'Người đại diện pháp luật' }, { key: 'representativeTitle', label: 'Chức danh người đại diện' },
    { key: 'phone', label: 'Điện thoại' }, { key: 'fax', label: 'Fax' }, { key: 'email', label: 'Email', type: 'email' }, { key: 'website', label: 'Website', type: 'url' },
  ];
  const handlePrint = () => downloadFile('Thong_tin_doanh_nghiep.pdf', generateValidPdfBlob('THONG TIN DOANH NGHIEP', profile.companyName || 'Chua khai bao', [
    `Ma so thue: ${profile.taxCode || 'Chua khai bao'}`, `Dia chi: ${profile.address || 'Chua khai bao'}`, ...legalFields.map(field => `${field.label}: ${profile[field.key] || 'Chua khai bao'}`),
    `Ten mien: ${profile.domain || 'Chua khai bao'}`, `Mui gio hien thi: ${profile.timezone}`, `Tien te hien thi: ${profile.currency}`, `Cap nhat may chu: ${profile.updatedAt || 'Chua luu'}`,
        `Loai hinh phap nhan: ${profile.legalForm || 'Chua chon'}`, `Quy mo doanh nghiep: ${profile.companySize || 'Chua chon'}`, `Nganh nghe: ${profile.industry || 'Chua khai bao'}`,
        `Che do ke toan: ${profile.accountingRegime || 'Chua chon'}`, `Nam tai chinh bat dau: ${profile.fiscalYearStartMonth || '?'}/${profile.fiscalYearStartDay || '?'}`, `Phuong phap GTGT: ${profile.vatMethod || 'Chua chon'}`,
    `Cong email: ${emailConfig.host || 'Chua cau hinh'}:${emailConfig.port}`, `Trang thai: ${emailConfig.configured ? 'Da cau hinh, chua xac nhan phat thu' : 'Chua du cau hinh'}`,
  ]));

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Pháp nhân doanh nghiệp sở hữu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {profile.shortName || profile.companyName || 'Chưa khai báo'}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>MST: {profile.taxCode || 'Chưa khai báo'}</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thời gian phản hồi API</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {latency === null ? 'Chưa đo được' : `${latency} ms`}
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đo từ yêu cầu API trong lần tải cấu hình</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cổng Email SMTP Doanh Nghiệp</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {emailConfig.configured ? 'Đã cấu hình' : 'Chưa đủ cấu hình'}
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>{emailConfig.host || 'Chưa khai báo máy chủ'} · Chưa xác nhận phát thư</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Múi giờ hiển thị</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {profile.timezone}
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Chấm công hiện ghi giờ theo Việt Nam</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'legal', label: 'Pháp nhân & Doanh nghiệp', icon: <BankOutlined style={{ color: '#6366F1' }} /> },
            { key: 'accounting', label: 'Hồ sơ kế toán & Thuế', icon: <SafetyCertificateOutlined style={{ color: '#009688' }} /> },
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
          <Button onClick={() => void load()} loading={loading}>Tải lại</Button>
          <Button
            icon={<PrinterOutlined />}
            onClick={handlePrint}
          >
            In Thông Số (A4)
          </Button>

          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={saving}
            disabled={loading || (activeTab === 'smtp' ? !emailLoaded : !companyLoaded)}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lưu cấu hình hệ thống
          </Button>
        </div>
      </div>

      {/* Settings Form Container */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 24, maxWidth: 880 }}>
        {activeTab === 'accounting' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <SafetyCertificateOutlined style={{ color: '#009688' }} /> Hồ sơ áp dụng kế toán và thuế
            </div>
            <div role="status" style={{ border: `1px solid ${profile.accountingProfileComplete ? '#86EFAC' : '#FCD34D'}`, background: profile.accountingProfileComplete ? '#F0FDF4' : '#FFFBEB', color: '#334155', padding: 12, borderRadius: 6 }}>
              {profile.accountingProfileComplete
                ? 'Đã khai báo hồ sơ tối thiểu. Kiểm tra lại với kế toán phụ trách trước khi ghi sổ hoặc lập nghĩa vụ thuế.'
                : `Chưa thể ghi sổ hoặc tạo hồ sơ thuế. Cần bổ sung: ${(profile.accountingProfileMissing || []).join(', ') || 'các trường bắt buộc bên dưới'}.`}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 14 }}>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>Loại hình pháp nhân
                <Select aria-label="Loại hình pháp nhân" value={profile.legalForm || undefined} onChange={value => changeProfile('legalForm', value)} style={{ display: 'block', width: '100%', marginTop: 6 }} options={[
                  { value: 'private_enterprise', label: 'Doanh nghiệp tư nhân' }, { value: 'llc_single', label: 'Công ty TNHH một thành viên' },
                  { value: 'llc_multiple', label: 'Công ty TNHH từ hai thành viên' }, { value: 'joint_stock', label: 'Công ty cổ phần' },
                  { value: 'partnership', label: 'Công ty hợp danh' }, { value: 'household_business', label: 'Hộ kinh doanh' },
                  { value: 'cooperative', label: 'Hợp tác xã / Liên hiệp hợp tác xã' }, { value: 'branch', label: 'Chi nhánh / đơn vị phụ thuộc' }, { value: 'other', label: 'Loại hình khác' },
                ]} />
              </label>
              {profile.legalForm === 'other' && <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>Mô tả loại hình<Input aria-label="Mô tả loại hình pháp nhân khác" value={profile.legalFormOther} onChange={event => changeProfile('legalFormOther', event.target.value)} /></label>}
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>Quy mô doanh nghiệp
                <Select aria-label="Quy mô doanh nghiệp" value={profile.companySize || undefined} onChange={value => changeProfile('companySize', value)} style={{ display: 'block', width: '100%', marginTop: 6 }} options={[
                  { value: 'micro', label: 'Siêu nhỏ' }, { value: 'small', label: 'Nhỏ' }, { value: 'medium', label: 'Vừa' }, { value: 'large', label: 'Lớn' },
                ]} />
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>Ngành nghề chính<Input aria-label="Ngành nghề chính" value={profile.industry} onChange={event => changeProfile('industry', event.target.value)} placeholder="Khai báo theo hoạt động thực tế" /></label>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>Chế độ kế toán
                <Select aria-label="Chế độ kế toán" value={profile.accountingRegime || undefined} onChange={value => changeProfile('accountingRegime', value)} style={{ display: 'block', width: '100%', marginTop: 6 }} options={[
                  { value: 'TT99', label: 'Thông tư 99/2025/TT-BTC' }, { value: 'TT133', label: 'Thông tư 133/2016/TT-BTC' },
                  { value: 'TT132', label: 'Thông tư 132/2018/TT-BTC' }, { value: 'other', label: 'Chế độ khác / đặc thù' },
                ]} />
              </label>
              {profile.accountingRegime === 'other' && <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>Mô tả chế độ kế toán<Input aria-label="Mô tả chế độ kế toán khác" value={profile.accountingRegimeOther} onChange={event => changeProfile('accountingRegimeOther', event.target.value)} /></label>}
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>Tháng bắt đầu năm tài chính
                <Select aria-label="Tháng bắt đầu năm tài chính" value={profile.fiscalYearStartMonth ?? undefined} onChange={value => changeProfile('fiscalYearStartMonth', value)} style={{ display: 'block', width: '100%', marginTop: 6 }} options={Array.from({ length: 12 }, (_, index) => ({ value: index + 1, label: `Tháng ${index + 1}` }))} />
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>Ngày bắt đầu năm tài chính
                <Select aria-label="Ngày bắt đầu năm tài chính" value={profile.fiscalYearStartDay ?? undefined} onChange={value => changeProfile('fiscalYearStartDay', value)} style={{ display: 'block', width: '100%', marginTop: 6 }} options={Array.from({ length: 31 }, (_, index) => ({ value: index + 1, label: `Ngày ${index + 1}` }))} />
              </label>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>Phương pháp thuế GTGT
                <Select aria-label="Phương pháp thuế GTGT" value={profile.vatMethod || undefined} onChange={value => changeProfile('vatMethod', value)} style={{ display: 'block', width: '100%', marginTop: 6 }} options={[
                  { value: 'deduction', label: 'Khấu trừ' }, { value: 'direct_revenue', label: 'Trực tiếp trên doanh thu' },
                  { value: 'direct_added_value', label: 'Trực tiếp trên giá trị gia tăng' }, { value: 'other', label: 'Chưa áp dụng / phương pháp khác' },
                ]} />
              </label>
              {profile.vatMethod === 'other' && <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>Mô tả phương pháp GTGT<Input aria-label="Mô tả phương pháp GTGT khác" value={profile.vatMethodOther} onChange={event => changeProfile('vatMethodOther', event.target.value)} /></label>}
            </div>
            <div style={{ color: '#64748B', fontSize: 12 }}>Quy mô và chế độ phải được xác nhận theo hồ sơ doanh nghiệp và ngành nghề. Hệ thống không tự suy luận chế độ kế toán hay phương pháp thuế.</div>
          </div>
        )}
        {activeTab === 'legal' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <BankOutlined style={{ color: '#009688' }} /> Thông Tin Doanh Nghiệp &amp; Pháp Nhân Thương Mại
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Tên pháp nhân công ty</label>
                <Input aria-label="Tên pháp nhân công ty" aria-required="true" value={profile.companyName} onChange={(e) => changeProfile('companyName', e.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Mã số thuế doanh nghiệp</label>
                <Input aria-label="Mã số thuế doanh nghiệp" value={profile.taxCode} onChange={(e) => changeProfile('taxCode', e.target.value)} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Địa chỉ trụ sở chính đăng ký kinh doanh</label>
                <Input aria-label="Địa chỉ trụ sở chính" value={profile.address} onChange={(e) => changeProfile('address', e.target.value)} />
              </div>
              {legalFields.map(field => <label key={field.key} style={{ fontSize: 12.5, fontWeight: 600, color: '#334155' }}>{field.label}<Input aria-label={field.label} style={{ marginTop: 6 }} type={field.type || 'text'} value={profile[field.key] || ''} onChange={event => changeProfile(field.key, event.target.value)} /></label>)}
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
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Tên miền chính thức</label>
                <Input value={profile.domain} onChange={event => changeProfile('domain', event.target.value)} />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Múi giờ hiển thị</label>
                <Select
                  value={profile.timezone}
                  onChange={value => changeProfile('timezone', value)}
                  style={{ width: '100%' }}
                  options={[
                    { label: 'Asia/Ho_Chi_Minh (GMT+7)', value: 'Asia/Ho_Chi_Minh' },
                    { label: 'UTC (GMT+0)', value: 'UTC' },
                  ]}
                />
              </div>
            </div>
          </div>
        )}

        {activeTab === 'smtp' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <MailOutlined style={{ color: '#009688' }} /> Cổng Mail Server SMTP
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Địa chỉ máy chủ SMTP</label>
                <Input value={emailConfig.host} onChange={event => setEmailConfig(previous => ({ ...previous, host: event.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Cổng kết nối SSL/TLS</label>
                <Input type="number" value={emailConfig.port} onChange={event => setEmailConfig(previous => ({ ...previous, port: Number(event.target.value) }))} />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Tài khoản gửi thông báo</label>
                <Input type="email" value={emailConfig.senderEmail} onChange={event => setEmailConfig(previous => ({ ...previous, senderEmail: event.target.value }))} />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Trạng thái kết nối</label>
                <div style={{ paddingTop: 6 }}><Tag color={emailConfig.configured ? 'processing' : 'warning'}>{emailConfig.configured ? 'Đã cấu hình, chưa kiểm tra phát thư' : 'Chưa đủ cấu hình'}</Tag></div>
              </div>
              <label>Tài khoản SMTP<Input aria-label="Tài khoản SMTP" value={emailConfig.username} onChange={event => setEmailConfig(previous => ({ ...previous, username: event.target.value }))} /></label>
              <label>Tên người gửi<Input aria-label="Tên người gửi" value={emailConfig.senderName} onChange={event => setEmailConfig(previous => ({ ...previous, senderName: event.target.value }))} /></label>
              <label>Mật khẩu SMTP mới<Input.Password aria-label="Mật khẩu SMTP mới" placeholder={emailConfig.passwordConfigured ? 'Để trống để giữ mật khẩu đã lưu' : 'Nhập mật khẩu SMTP'} value={emailConfig.password || ''} onChange={event => setEmailConfig(previous => ({ ...previous, password: event.target.value }))} /></label>
              <label>Bảo mật kết nối<Select value={emailConfig.security} onChange={value => setEmailConfig(previous => ({ ...previous, security: value as 'SSL' | 'STARTTLS' }))} options={[{ value: 'STARTTLS', label: 'STARTTLS' }, { value: 'SSL', label: 'SSL/TLS' }]} /></label>
              <label>Bật cổng gửi thư<Select value={emailConfig.enabled ? 'enabled' : 'disabled'} onChange={value => setEmailConfig(previous => ({ ...previous, enabled: value === 'enabled' }))} options={[{ value: 'enabled', label: 'Bật' }, { value: 'disabled', label: 'Tắt' }]} /></label>
              <label>URL cổng nhân viên<Input aria-label="URL cổng nhân viên" value={emailConfig.portalUrl} onChange={event => setEmailConfig(previous => ({ ...previous, portalUrl: event.target.value }))} /></label>
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
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Đơn vị tiền tệ hiển thị</label>
                <Select
                  value={profile.currency}
                  onChange={value => changeProfile('currency', value)}
                  style={{ width: '100%' }}
                  options={[
                    { label: 'VND', value: 'VND' },
                    { label: 'USD', value: 'USD' },
                  ]}
                />
              </div>
              <div>
                <label style={{ fontSize: 12.5, fontWeight: 600, color: '#334155', display: 'block', marginBottom: 6 }}>Tài khoản ngân hàng mặc định</label>
                <Select value={profile.bankAccountId} onChange={value => changeProfile('bankAccountId', value)} options={[{ value: '', label: 'Chưa chọn tài khoản' }, ...bankAccounts.filter(account => account.status === 'Đang hoạt động').map(account => ({ value: account.key, label: `${account.bankName} · ${account.accountNumber}` }))]} />
                <div style={{ marginTop: 8, color: '#64748B', fontSize: 12 }}>Thiết lập hiển thị được lưu riêng. Sổ quỹ hiện ghi bằng VNĐ và chưa tự quy đổi ngoại tệ.</div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

