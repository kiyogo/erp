import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  SettingOutlined,
  SafetyCertificateOutlined,
  FileProtectOutlined,
  SaveOutlined,
  KeyOutlined,
  CheckCircleOutlined,
  BarcodeOutlined,
  AuditOutlined,
  LockOutlined,
  CalendarOutlined,
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  CloudUploadOutlined,
  ClockCircleOutlined,
  BankOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Form, Input, Select, message, Tag, Card, Modal, Radio, Alert, Progress } from '../../custom-ui';

export interface NumberingRule {
  key: string;
  docType: string;
  prefixPattern: string;
  sampleResult: string;
  currentSequence: number;
  resetYearly: boolean;
  status: 'Kích hoạt' | 'Tạm dừng';
}

export interface SecurityAccessRule {
  key: string;
  securityLevel: string;
  allowedRoles: string[];
  canView: boolean;
  canDownload: boolean;
  canPrint: boolean;
  watermarkRequired: boolean;
}

const INITIAL_RULES: NumberingRule[] = [];

const INITIAL_ACCESS_RULES: SecurityAccessRule[] = [];

export const DocumentSettingsModule: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'numbering' | 'ca_seal' | 'security' | 'retention'>('numbering');

  // Rules state
  const [rules, setRules] = useState<NumberingRule[]>(INITIAL_RULES);
  const [accessRules, setAccessRules] = useState<SecurityAccessRule[]>(INITIAL_ACCESS_RULES);

  const [form] = Form.useForm();
  const [caForm] = Form.useForm();

  const handleSaveAll = () => {
    message.success('Đã lưu toàn bộ cấu hình quy chế văn thư & thiết lập chữ ký số thành công!');
  };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Quy tắc sinh số ký hiệu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {rules.length} bộ mẫu quy chuẩn
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Tự động tăng số &amp; reset đầu năm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chứng thư số CA &amp; Con dấu mộc</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            Viettel-CA HSM
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Khóa chuẩn RSA-2048 · Hạn: 2028</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chính sách bảo mật tài liệu ISO</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            4 Cấp độ an toàn
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Watermark động &amp; Cấm tải tệp mật</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Máy chủ đóng dấu thời gian (TSA)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            RFC 3161 Active
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đồng bộ thời gian chuẩn Bộ TT&amp;TT</div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            type={activeTab === 'numbering' ? 'primary' : 'default'}
            icon={<BarcodeOutlined />}
            onClick={() => setActiveTab('numbering')}
            style={{
              backgroundColor: activeTab === 'numbering' ? '#009688' : '#FFFFFF',
              borderColor: activeTab === 'numbering' ? '#009688' : '#CBD5E1',
              fontWeight: activeTab === 'numbering' ? 700 : 500,
            }}
          >
            Quy Tắc Sinh Số Ký Hiệu ({rules.length})
          </Button>

          <Button
            type={activeTab === 'ca_seal' ? 'primary' : 'default'}
            icon={<SafetyCertificateOutlined />}
            onClick={() => setActiveTab('ca_seal')}
            style={{
              backgroundColor: activeTab === 'ca_seal' ? '#009688' : '#FFFFFF',
              borderColor: activeTab === 'ca_seal' ? '#009688' : '#CBD5E1',
              fontWeight: activeTab === 'ca_seal' ? 700 : 500,
            }}
          >
            Chữ Ký Số CA &amp; Con Dấu Mộc Đỏ
          </Button>

          <Button
            type={activeTab === 'security' ? 'primary' : 'default'}
            icon={<LockOutlined />}
            onClick={() => setActiveTab('security')}
            style={{
              backgroundColor: activeTab === 'security' ? '#009688' : '#FFFFFF',
              borderColor: activeTab === 'security' ? '#009688' : '#CBD5E1',
              fontWeight: activeTab === 'security' ? 700 : 500,
            }}
          >
            Phân Quyền Bảo Mật ISO 27001
          </Button>

          <Button
            type={activeTab === 'retention' ? 'primary' : 'default'}
            icon={<CalendarOutlined />}
            onClick={() => setActiveTab('retention')}
            style={{
              backgroundColor: activeTab === 'retention' ? '#009688' : '#FFFFFF',
              borderColor: activeTab === 'retention' ? '#009688' : '#CBD5E1',
              fontWeight: activeTab === 'retention' ? 700 : 500,
            }}
          >
            Thời Hạn Bảo Quản &amp; Tiêu Hủy
          </Button>
        </div>

        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSaveAll}
          style={{ backgroundColor: '#009688', borderColor: '#009688' }}
        >
          Lưu thiết lập toàn hệ thống
        </Button>
      </div>

      {/* TAB 1: QUY TẮC SINH SỐ KÝ HIỆU VĂN BẢN (NGHỊ ĐỊNH 30/2020) */}
      {activeTab === 'numbering' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="transparent-table-card">
            <KTable
              dataSource={rules}
              columns={[
                {
                  title: 'Thể loại văn bản',
                  dataIndex: 'docType',
                  key: 'docType',
                  width: 220,
                  render: (t: string) => <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{t}</strong>,
                },
                {
                  title: 'Cấu trúc định dạng mẫu',
                  dataIndex: 'prefixPattern',
                  key: 'prefixPattern',
                  render: (p: string) => (
                    <code style={{ background: '#F1F5F9', color: '#0F766E', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                      {p}
                    </code>
                  ),
                },
                {
                  title: 'Ví dụ số hiệu thực tế',
                  dataIndex: 'sampleResult',
                  key: 'sampleResult',
                  width: 200,
                  render: (res: string) => (
                    <span style={{ fontWeight: 700, color: '#2563EB', fontFamily: 'monospace' }}>
                      {res}
                    </span>
                  ),
                },
                {
                  title: 'Số hiện tại',
                  dataIndex: 'currentSequence',
                  key: 'currentSequence',
                  width: 130,
                  render: (seq: number) => <Tag color="blue">#{String(seq).padStart(3, '0')}</Tag>,
                },
                {
                  title: 'Reset hàng năm',
                  dataIndex: 'resetYearly',
                  key: 'resetYearly',
                  width: 140,
                  render: (rst: boolean) => (
                    <Tag color={rst ? 'green' : 'default'}>{rst ? 'Đầu năm mới' : 'Tăng liên tục'}</Tag>
                  ),
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'status',
                  key: 'status',
                  width: 120,
                  render: (s: string) => <Tag color={s === 'Kích hoạt' ? 'success' : 'default'}>{s}</Tag>,
                },
              ]}
              pagination={false}
            />
          </div>

          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 18 }}>
            <h3 style={{ fontSize: 14.5, fontWeight: 700, margin: '0 0 10px 0', color: '#0F172A' }}>
              Quy tắc mã hóa tên viết tắt các phòng ban:
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10 }}>
              <div style={{ padding: '8px 12px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
                Ban Giám Đốc &amp; HĐQT: <strong style={{ color: '#009688' }}>-BOD</strong>
              </div>
              <div style={{ padding: '8px 12px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
                Phòng Tài Chính Kế Toán: <strong style={{ color: '#2563EB' }}>-TC</strong>
              </div>
              <div style={{ padding: '8px 12px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
                Khối Kỹ Thuật &amp; IDC: <strong style={{ color: '#7C3AED' }}>-KT / -IDC</strong>
              </div>
              <div style={{ padding: '8px 12px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
                Phòng Nhân Sự &amp; Hành Chính: <strong style={{ color: '#D97706' }}>-NS / -HC</strong>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: CHỮ KÝ SỐ CA & CON DẤU MỘC ĐỎ */}
      {activeTab === 'ca_seal' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Certificate Info */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px 0', color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <SafetyCertificateOutlined style={{ color: '#2563EB' }} /> Chứng Thư Số Doanh Nghiệp Pháp Nhân (CA)
            </h3>

            <div style={{ padding: 14, background: '#F0FDF4', borderRadius: 8, border: '1px solid #BBF7D0', marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontWeight: 800, color: '#166534', fontSize: 14 }}>
                  CÔNG TY TNHH CÔNG NGHỆ KIYOVN
                </div>
                <Tag color="success" icon={<CheckCircleOutlined />}>
                  Chứng Thư Hợp Chuẩn
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#15803D', marginTop: 4 }}>Mã số thuế: 0109988776</div>
              <div style={{ fontSize: 12, color: '#15803D' }}>
                Tổ chức cấp phát: <strong>Tập đoàn Viễn thông Quân đội</strong>
              </div>
              <div style={{ fontSize: 11.5, color: '#166534', marginTop: 6, fontFamily: 'monospace' }}>
                Serial: 5404 8892 1102 7741 9901 · Khóa: RSA 2048-bit
              </div>
              <div style={{ fontSize: 11.5, color: '#166534' }}>
                Thời hạn hiệu lực: <strong>2023-01-01 ➔ 2028-12-31</strong>
              </div>
            </div>

            <Form form={caForm} layout="vertical" initialValues={{ pkiMode: 'hsm', autoTsa: 'yes', pinTimeout: 15 }}>
              <Form.Item name="pkiMode" label="Phương thức kết nối chữ ký số doanh nghiệp">
                <Select
                  options={[
                    { label: 'Viettel-CA HSM Server', value: 'hsm' },
                    { label: 'Viettel-CA USB Token', value: 'token' },
                    { label: 'VNPT SmartCA Corporate', value: 'vnpt' },
                  ]}
                />
              </Form.Item>

              <Form.Item name="autoTsa" label="Tự động đóng dấu thời gian điện tử">
                <Select
                  options={[
                    { label: 'Bật', value: 'yes' },
                    { label: 'Tắt', value: 'no' },
                  ]}
                />
              </Form.Item>
            </Form>
          </div>

          {/* Digital Seal Management */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px 0', color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <AuditOutlined style={{ color: '#DC2626' }} /> Con Dấu Mộc Đỏ Điện Tử Đã Số Hóa
            </h3>

            <div style={{ display: 'flex', gap: 16, alignItems: 'center', padding: 14, background: '#FEF2F2', borderRadius: 8, border: '1px solid #FECACA', marginBottom: 16 }}>
              <div style={{ width: 80, height: 80, borderRadius: '50%', border: '2px dashed #DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF', flexShrink: 0 }}>
                <div style={{ textAlign: 'center', color: '#DC2626', fontSize: 10, fontWeight: 800, lineHeight: 1.2 }}>
                  <div>★ KIYOVN ★</div>
                  <div style={{ fontSize: 9 }}>MỘC ĐỎ</div>
                  <div>2026</div>
                </div>
              </div>

              <div>
                <div style={{ fontWeight: 800, color: '#991B1B', fontSize: 13.5 }}>
                  Con dấu Pháp nhân Doanh nghiệp KIYOVN
                </div>
                <div style={{ fontSize: 12, color: '#B91C1C', marginTop: 2 }}>
                  Tệp: <code>kiyo_official_seal_transparent.png</code> 
                </div>
                <div style={{ fontSize: 11.5, color: '#7F1D1D', marginTop: 2 }}>
                  Tọa độ đóng mộc mặc định: <strong>Góc dưới bên phải chữ ký Người đại diện pháp luật</strong>
                </div>
              </div>
            </div>

            <Form layout="vertical">
              <Form.Item label="Quy tắc áp dụng con dấu điện tử" initialValue="auto_signed">
                <Select
                  options={[
                    { label: 'Tự động chèn mộc đỏ sau khi Tổng Giám Đốc ký số Token thành công', value: 'auto_signed' },
                    { label: 'Yêu cầu nhân viên Văn thư xác nhận lần 2 trước khi đóng mộc', value: 'manual_confirm' },
                  ]}
                />
              </Form.Item>

              <Form.Item label="Kích thước con dấu đóng lên tệp PDF xuất bản" initialValue="standard">
                <Select
                  options={[
                    { label: 'Kích thước tiêu chuẩn', value: 'standard' },
                    { label: 'Kích thước nhỏ', value: 'small' },
                  ]}
                />
              </Form.Item>
            </Form>
          </div>
        </div>
      )}

      {/* TAB 3: MA TRẬN BẢO MẬT & PHÂN QUYỀN ISO 27001 */}
      {activeTab === 'security' && (
        <div className="transparent-table-card">
          <KTable
            dataSource={accessRules}
            columns={[
              {
                title: 'Cấp độ bảo mật văn bản',
                dataIndex: 'securityLevel',
                key: 'securityLevel',
                width: 220,
                render: (sec: string) => {
                  let col = 'success';
                  if (sec.includes('Mật')) col = 'warning';
                  if (sec.includes('Tuyệt mật')) col = 'error';
                  return (
                    <Tag color={col} icon={<LockOutlined />} style={{ fontSize: 12, padding: '4px 8px' }}>
                      {sec}
                    </Tag>
                  );
                },
              },
              {
                title: 'Phạm vi chức danh được phép truy cập',
                dataIndex: 'allowedRoles',
                key: 'allowedRoles',
                render: (roles: string[]) => (
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {roles.map((r, i) => (
                      <Tag key={i} color="blue">
                        {r}
                      </Tag>
                    ))}
                  </div>
                ),
              },
              {
                title: 'Quyền xem',
                dataIndex: 'canView',
                key: 'canView',
                width: 110,
                render: (v: boolean) => (v ? <Tag color="green">Cho phép</Tag> : <Tag color="default">Cấm</Tag>),
              },
              {
                title: 'Quyền tải tệp PDF',
                dataIndex: 'canDownload',
                key: 'canDownload',
                width: 140,
                render: (d: boolean) =>
                  d ? <Tag color="green">Được tải</Tag> : <Tag color="red">Chỉ đọc trên Web</Tag>,
              },
              {
                title: 'Watermark chống rò rỉ',
                dataIndex: 'watermarkRequired',
                key: 'watermarkRequired',
                width: 180,
                render: (w: boolean) =>
                  w ? (
                    <Tag color="purple">Bắt buộc đóng dấu mờ IP/Email</Tag>
                  ) : (
                    <Tag color="default">Không yêu cầu</Tag>
                  ),
              },
            ]}
            pagination={false}
          />
        </div>
      )}

      {/* TAB 4: THỜI HẠN BẢO QUẢN & QUY TRÌNH TIÊU HỦY */}
      {activeTab === 'retention' && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 14px 0', color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CalendarOutlined style={{ color: '#009688' }} /> Bảng Thời Hạn Bảo Quản Tài Liệu
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ padding: 14, background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ color: '#0F172A' }}>1. Quyết định thành lập, Quy chế tổ chức, Điều lệ &amp; Nghị quyết HĐQT</strong>
                <Tag color="purple">Bảo quản vĩnh viễn</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Lưu trữ song song bản cứng tại Két an toàn Tầng 4 Keangnam và bản mềm mã hóa trên Cloud Vault.
              </div>
            </div>

            <div style={{ padding: 14, background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ color: '#0F172A' }}>2. Hợp đồng kinh tế, Hợp đồng thuê hạ tầng IDC &amp; Hồ sơ quyết toán thuế</strong>
                <Tag color="blue">Bảo quản 10 năm</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Sau 10 năm chuyển sang kho lưu trữ lịch sử hoặc lập Hội đồng tiêu hủy theo quy định.
              </div>
            </div>

            <div style={{ padding: 14, background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong style={{ color: '#0F172A' }}>3. Công văn trao đổi nghiệp vụ, Báo cáo giao ban tuần &amp; Giấy mời họp</strong>
                <Tag color="cyan">Bảo quản 5 năm</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Tự động thông báo thanh lý khi hết thời hạn bảo quản.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

