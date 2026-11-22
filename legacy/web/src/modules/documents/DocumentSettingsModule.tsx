import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileProtectOutlined, SafetyCertificateOutlined, LockOutlined, ClockCircleOutlined } from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Tag, message } from '../../custom-ui';
import { dataService } from '../../services/dataService';
import { companyHeading, useCompanyIdentity } from '../../services/companyIdentity';

// Cài đặt văn thư: trang chỉ đọc, trình bày đúng các quy tắc hệ thống đang áp dụng ở máy chủ (legacy/api/documentRules.mjs, nhánh doc_archives của
// normalizeCollectionRecord) và chứng thư số thật trong sổ Chữ ký số. Trước đây trang hiện chứng thư, con dấu, quy tắc viết tắt phòng ban bịa và
// nút "Lưu thiết lập" chỉ báo thành công. Các bộ giá trị dưới đây là bản sao của documentRules.mjs, sửa cùng lúc khi máy chủ đổi.
const SECURITY_LEVELS = ['Tuyệt mật', 'Tối mật', 'Mật', 'Nội bộ', 'Thường'];
const STATE_SECRET_LEVELS = ['Tuyệt mật', 'Tối mật', 'Mật'];
const URGENCY_LEVELS = ['Hỏa tốc', 'Thượng khẩn', 'Khẩn', 'Bình thường'];
const DOC_TYPE_ABBREVIATIONS: Record<string, string> = { 'Quyết định': 'QĐ', 'Thông báo': 'TB', 'Tờ trình': 'TTr', 'Hợp đồng': 'HĐ', 'Giấy mời': 'GM' };

type Tab = 'numbering' | 'signatures' | 'security' | 'retention';

const card = (title: string, value: React.ReactNode, note: string, color: string) => (
  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
    <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>{title}</div>
    <div style={{ fontSize: 24, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    <div style={{ fontSize: 11.5, color, marginTop: 2 }}>{note}</div>
  </div>
);

export const DocumentSettingsModule: React.FC = () => {
  const navigate = useNavigate();
  const company = useCompanyIdentity();
  const [activeTab, setActiveTab] = useState<Tab>('numbering');
  const [archives, setArchives] = useState<any[]>([]);
  const [certs, setCerts] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([dataService.refreshGenericData('doc_archives'), dataService.refreshGenericData('finance_digital_signatures')])
      .then(([archiveRows, certRows]) => { setArchives(archiveRows || []); setCerts(certRows || []); })
      .catch(() => message.error('Không tải được sổ văn thư hoặc sổ chữ ký số.'));
  }, []);

  const year = new Date().getFullYear();
  // Số vào sổ do máy chủ cấp: tăng dần theo năm và chiều văn bản, dạng 0001/năm.
  const books = useMemo(() => ['Văn bản đến', 'Văn bản đi'].map((dispatchType) => {
    const rows = archives.filter((item) => item.dispatchType === dispatchType && String(item.dateReceivedOrIssued || '').startsWith(String(year)));
    const last = rows.reduce((max, item) => Math.max(max, Number.parseInt(item.bookNumber, 10) || 0), 0);
    return { key: dispatchType, dispatchType, count: rows.length, lastNumber: last ? `${String(last).padStart(4, '0')}/${year}` : 'Chưa có', nextNumber: `${String(last + 1).padStart(4, '0')}/${year}` };
  }), [archives, year]);
  const today = new Date().toISOString().slice(0, 10);
  const activeCerts = certs.filter((cert) => !['revoked', 'suspended'].includes(cert.lifecycle) && (!cert.validTo || String(cert.validTo).slice(0, 10) >= today));
  const secretCount = archives.filter((item) => STATE_SECRET_LEVELS.includes(item.securityLevel)).length;

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key: 'numbering', label: 'Số và ký hiệu văn bản', icon: <FileProtectOutlined /> },
    { key: 'signatures', label: 'Chứng thư số doanh nghiệp', icon: <SafetyCertificateOutlined /> },
    { key: 'security', label: 'Độ mật, độ khẩn', icon: <LockOutlined /> },
    { key: 'retention', label: 'Lưu trữ', icon: <ClockCircleOutlined /> },
  ];
  const box: React.CSSProperties = { background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 18, fontSize: 13, color: '#334155', lineHeight: 1.7 };

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        {card(`Văn bản vào sổ năm ${year}`, books.reduce((sum, book) => sum + book.count, 0), books.map((book) => `${book.dispatchType.replace('Văn bản ', '')}: ${book.count}`).join(' · '), '#009688')}
        {card('Chứng thư số còn hiệu lực', activeCerts.length, certs.length ? `Trên tổng ${certs.length} chứng thư trong sổ` : 'Chưa có chứng thư trong sổ Chữ ký số', '#2563EB')}
        {card('Văn bản mang độ mật nhà nước', secretCount, 'Tuyệt mật, Tối mật, Mật trong sổ văn thư', secretCount ? '#DC2626' : '#7C3AED')}
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {tabs.map((tab) => (
          <Button key={tab.key} icon={tab.icon} onClick={() => setActiveTab(tab.key)}
            style={{ backgroundColor: activeTab === tab.key ? '#E0F2F1' : '#FFFFFF', borderColor: activeTab === tab.key ? '#009688' : '#CBD5E1', color: activeTab === tab.key ? '#00796B' : '#475569' }}>
            {tab.label}
          </Button>
        ))}
      </div>

      {activeTab === 'numbering' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="transparent-table-card">
            <KTable rowKey="key" dataSource={books} pagination={false} columns={[
              { title: 'Sổ', dataIndex: 'dispatchType', key: 'dispatchType' },
              { title: `Số đã vào sổ năm ${year}`, dataIndex: 'count', key: 'count', width: 180 },
              { title: 'Số cuối cùng', dataIndex: 'lastNumber', key: 'lastNumber', width: 160 },
              { title: 'Số tiếp theo sẽ cấp', dataIndex: 'nextNumber', key: 'nextNumber', width: 180 },
            ]} />
          </div>
          <div style={box}>
            <div>Số vào sổ do máy chủ tự cấp khi lưu văn bản ở Sổ văn thư, tăng dần riêng cho văn bản đến và văn bản đi, bắt đầu lại từ 0001 mỗi năm theo ngày vào sổ; không trùng số trong cùng sổ.</div>
            <div>Số và ký hiệu ghi trên văn bản theo dạng của Nghị định 30/2020/NĐ-CP: số thứ tự/chữ viết tắt loại văn bản-chữ viết tắt cơ quan, ví dụ 12/QĐ-ABC. Hệ thống cảnh báo (không chặn) khi sai dạng hoặc văn bản đi thiếu chữ viết tắt:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              {Object.entries(DOC_TYPE_ABBREVIATIONS).map(([type, abbreviation]) => <Tag key={type}>{type}: {abbreviation}</Tag>)}
            </div>
            <div style={{ color: '#64748B', fontSize: 12, marginTop: 8 }}>Hợp đồng không bị kiểm dạng số vì mỗi doanh nghiệp đánh số riêng. Chữ viết tắt tên cơ quan, phòng ban do doanh nghiệp tự quy định.</div>
          </div>
        </div>
      )}

      {activeTab === 'signatures' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ ...box, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span>Chứng thư số của {company.companyName ? companyHeading(company) : 'doanh nghiệp'} được quản lý ở sổ Chữ ký số (thêm, gia hạn, tạm dừng, thu hồi). Hợp đồng chỉ cho chọn chứng thư còn hiệu lực trong sổ này.</span>
            <Button type="primary" onClick={() => navigate('/admin/digital-signature/certs')}>Mở sổ Chữ ký số</Button>
          </div>
          <div className="transparent-table-card">
            <KTable rowKey={(item: any) => item.key || item.certNumber} dataSource={certs} pagination={{ pageSize: 8 }} columns={[
              { title: 'Chủ thể', dataIndex: 'subjectName', key: 'subjectName' },
              { title: 'Nhà cung cấp', dataIndex: 'provider', key: 'provider', width: 180 },
              { title: 'Số serial', dataIndex: 'certNumber', key: 'certNumber', width: 180 },
              { title: 'Hiệu lực', key: 'validity', width: 210, render: (_: unknown, item: any) => `${String(item.validFrom || '').slice(0, 10)} đến ${String(item.validTo || '').slice(0, 10)}` },
              { title: 'Trạng thái', key: 'state', width: 140, render: (_: unknown, item: any) => {
                const active = activeCerts.includes(item);
                return <Tag color={active ? 'success' : 'default'}>{item.lifecycle === 'revoked' ? 'Đã thu hồi' : item.lifecycle === 'suspended' ? 'Tạm dừng' : active ? 'Còn hiệu lực' : 'Hết hạn'}</Tag>;
              } },
            ]} />
          </div>
          <div style={{ color: '#64748B', fontSize: 12 }}>Hệ thống chưa kết nối dịch vụ ký số (USB token, HSM, ký từ xa) nên chưa ký số thật lên văn bản; con dấu điện tử chưa được hỗ trợ.</div>
        </div>
      )}

      {activeTab === 'security' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <div style={box}>
            <div style={{ marginBottom: 6 }}>Độ mật nhận ở sổ văn thư:</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{SECURITY_LEVELS.map((level) => <Tag key={level} color={STATE_SECRET_LEVELS.includes(level) ? 'error' : 'default'}>{level}</Tag>)}</div>
            <div style={{ marginTop: 8 }}>Tuyệt mật, Tối mật, Mật là ba độ mật của bí mật nhà nước (Luật Bảo vệ bí mật nhà nước 2018). Luật cấm lưu tài liệu bí mật nhà nước trên thiết bị kết nối mạng: hệ thống cảnh báo khi văn bản mang độ mật này có bản scan trên hệ thống.</div>
          </div>
          <div style={box}>
            <div style={{ marginBottom: 6 }}>Độ khẩn (Nghị định 30/2020/NĐ-CP):</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{URGENCY_LEVELS.map((level) => <Tag key={level}>{level}</Tag>)}</div>
            <div style={{ marginTop: 8 }}>Ngày vào sổ không ở tương lai; văn bản đến không được vào sổ trước ngày ghi trên văn bản; văn bản đi có ngày văn bản khác ngày vào sổ thì được cảnh báo.</div>
          </div>
        </div>
      )}

      {activeTab === 'retention' && (
        <div style={box}>
          <div>Chứng từ, sổ kế toán (phạm vi tài chính, bảng lương, phiếu lương) không xóa vĩnh viễn được khỏi thùng rác cho tới hết năm thứ 10 kể từ năm tạo (Luật Kế toán 2015 Điều 41); vẫn khôi phục được.</div>
          <div>Văn bản đã hoàn tất trong sổ văn thư không mở lại được; nhật ký kiểm toán không có đường xóa hay sửa.</div>
          <div style={{ color: '#64748B', fontSize: 12, marginTop: 8 }}>Chưa làm: thời hạn bảo quản từng loại tài liệu theo Luật Lưu trữ 2024, nộp lưu và tiêu hủy tài liệu hết giá trị.</div>
        </div>
      )}
    </div>
  );
};
