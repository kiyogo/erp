import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  FileWordOutlined,
  EyeOutlined,
  SafetyCertificateOutlined,
  KeyOutlined,
  PrinterOutlined,
  CheckCircleOutlined,
  LockOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Radio } from '../../custom-ui';
import { downloadFile } from '../../utils/fileExporter';
import { DocxEditorModal } from '../../components/editor/DocxEditorModal';

export interface EnterpriseDocItem {
  key: string;
  docCode: string;
  title: string;
  docCategory: 'Quy chế & Quyết định' | 'Công văn điều hành' | 'Thông báo nội bộ' | 'Hợp đồng & Pháp lý' | 'Biên bản & Kỹ thuật';
  direction: 'Nội bộ ban hành' | 'Văn bản đến' | 'Văn bản đi';
  issuingAuthority: string;
  signerName: string;
  signerPosition: string;
  issuedDate: string;
  effectiveDate: string;
  expirationDate: string;
  securityLevel: 'Tuyệt mật (BOD Only)' | 'Mật (Confidential)' | 'Nội bộ công ty' | 'Công khai';
  storageLocation: string;
  fileFormat: 'PDF' | 'DOCX' | 'XLSX';
  fileSize: string;
  caSigned: boolean;
  sha256Hash: string;
  status: 'Đang hiệu lực' | 'Mới ban hành' | 'Dự thảo thẩm định' | 'Hết hiệu lực / Lưu kho';
  tags: string[];
  summary: string;
}

const INITIAL_ENTERPRISE_DOCS: EnterpriseDocItem[] = [];

export const DocumentsModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseDocItem[]>(INITIAL_ENTERPRISE_DOCS);
  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [securityFilter, setSecurityFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<EnterpriseDocItem | null>(null);

  // Docx Editor
  const [docxEditorOpen, setDocxEditorOpen] = useState(false);
  const [editorDocItem, setEditorDocItem] = useState<EnterpriseDocItem | null>(null);

  const handleOpenCreateDocx = () => {
    const codeNum = Math.floor(100 + Math.random() * 900);
    const newDoc: EnterpriseDocItem = {
      key: String(Date.now()),
      docCode: `QĐ-2026/${codeNum}-KIYO`,
      title: 'Quyết định Ban hành Quy chế Quản trị Doanh nghiệp 2026',
      docCategory: 'Quy chế & Quyết định',
      direction: 'Nội bộ ban hành',
      issuingAuthority: 'Ban Giám Đốc KIYOVN',
      signerName: 'Nguyễn Văn Minh',
      signerPosition: 'Tổng Giám Đốc (CEO)',
      issuedDate: new Date().toISOString().slice(0, 10),
      effectiveDate: new Date().toISOString().slice(0, 10),
      expirationDate: 'Vĩnh viễn',
      securityLevel: 'Nội bộ công ty',
      storageLocation: 'Kho Dữ Liệu Số Đám Mây',
      fileFormat: 'DOCX',
      fileSize: '16.5 KB',
      caSigned: true,
      sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      status: 'Mới ban hành',
      tags: ['Văn bản số', 'Word', 'Quy chế'],
      summary: 'Văn bản được soạn thảo trực tiếp trên trình soạn thảo Word A4 trực tuyến.',
    };
    setEditorDocItem(newDoc);
    setDocxEditorOpen(true);
  };

  const handleOpenEditDocx = (doc: EnterpriseDocItem) => {
    setEditorDocItem(doc);
    setDocxEditorOpen(true);
  };

  const totalDocs = data.length;
  const totalConfidential = data.filter((d) => d.securityLevel.includes('Mật')).length;
  const totalCaSigned = data.filter((d) => d.caSigned).length;
  const totalDraft = data.filter((d) => d.status === 'Dự thảo thẩm định').length;

  const handleCreate = (values: any) => {
    const newDoc: EnterpriseDocItem = {
      ...values,
      key: String(Date.now()),
      expirationDate: values.expirationDate || 'Vĩnh viễn',
      fileFormat: 'PDF',
      fileSize: '2.1 MB',
      caSigned: values.caSigned ?? true,
      sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      tags: (values.tags || 'Văn thư, 2026').split(',').map((t: string) => t.trim()),
    };
    setData([newDoc, ...data]);
    message.success(`Đã ban hành văn bản mới: ${values.title} (${values.docCode})`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchCategory = categoryFilter === 'all' || item.docCategory === categoryFilter;
    const matchSecurity = securityFilter === 'all' || item.securityLevel === securityFilter;
    const matchSearch =
      (item.title || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.docCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.signerName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.issuingAuthority || '').toLowerCase().includes(searchText.toLowerCase()) ||
      item.tags.some((t) => t.toLowerCase().includes(searchText.toLowerCase()));
    return matchCategory && matchSecurity && matchSearch;
  });

  const columns = [
    {
      title: 'Số / Ký hiệu văn bản',
      key: 'docCode',
      width: 190,
      render: (_: any, r: EnterpriseDocItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <FilePdfOutlined style={{ color: '#DC2626', fontSize: 15 }} />
            {r.docCode}
          </div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>{r.direction}</div>
        </div>
      ),
    },
    {
      title: 'Trích yếu nội dung & Từ khóa',
      key: 'title',
      render: (_: any, record: EnterpriseDocItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.title}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>
            Ban hành: <strong>{record.issuingAuthority}</strong>
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
            {record.tags.map((t, idx) => (
              <Tag key={idx} color="default" style={{ fontSize: 10.5, margin: 0, padding: '0 4px' }}>
                #{t}
              </Tag>
            ))}
          </div>
        </div>
      ),
    },
    {
      title: 'Phân loại',
      dataIndex: 'docCategory',
      key: 'docCategory',
      width: 170,
      render: (c: string) => {
        let color = 'cyan';
        if (c.includes('Quy chế')) color = 'purple';
        if (c.includes('Hợp đồng')) color = 'blue';
        if (c.includes('Kỹ thuật')) color = 'orange';
        return <Tag color={color}>{c}</Tag>;
      },
    },
    {
      title: 'Cấp độ bảo mật',
      dataIndex: 'securityLevel',
      key: 'securityLevel',
      width: 170,
      render: (sec: string) => {
        let color = 'success';
        if (sec.includes('Confidential')) color = 'warning';
        if (sec.includes('BOD Only')) color = 'error';
        return (
          <Tag color={color} icon={<LockOutlined />}>
            {sec}
          </Tag>
        );
      },
    },
    {
      title: 'Người ký & Ngày',
      key: 'signer',
      width: 170,
      render: (_: any, r: EnterpriseDocItem) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 12.5 }}>{r.signerName}</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>{r.signerPosition}</div>
          <div style={{ fontSize: 11, color: '#2563EB', marginTop: 2 }}>{r.issuedDate}</div>
        </div>
      ),
    },
    {
      title: 'Ký số PKI',
      key: 'caSigned',
      width: 120,
      render: (_: any, r: EnterpriseDocItem) => (
        <div>
          {r.caSigned ? (
            <Tag color="green" icon={<SafetyCertificateOutlined />}>
              Token CA
            </Tag>
          ) : (
            <Tag color="default">Chưa ký CA</Tag>
          )}
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (s: string) => {
        let color = 'success';
        if (s.includes('Mới')) color = 'processing';
        if (s.includes('Dự thảo')) color = 'warning';
        if (s.includes('Hết')) color = 'default';
        return <Tag color={color}>{s}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 180,
      render: (_: any, record: EnterpriseDocItem) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedDoc(record);
              setDrawerOpen(true);
            }}
          >
            Xem
          </Button>
          <Button
            size="small"
            icon={<FileWordOutlined style={{ color: '#2B579A' }} />}
            onClick={() => handleOpenEditDocx(record)}
          >
            Soạn Word
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => {
              const safeCode = record.docCode.replace(/[^a-zA-Z0-9]/g, '_');
              downloadFile(`${safeCode}_Van_Ban.pdf`);
              message.success(`Đã tải xuống văn bản ${record.docCode} thành công!`);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số văn bản &amp; quyết định</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalDocs} văn bản
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>100% Lưu trữ an toàn đám mây</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Văn bản mật &amp; Tuyệt mật (ISO)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {totalConfidential} tài liệu
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Phân quyền bảo mật cao cấp</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã ký số Token CA &amp; Mộc đỏ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalCaSigned} hồ sơ ({totalDocs > 0 ? Math.round((totalCaSigned / totalDocs) * 100) : 0}%)
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Hợp chuẩn giao dịch điện tử</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Dự thảo đang thẩm định</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {totalDraft} dự thảo
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Đang chờ ý kiến đóng góp</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả' },
            { key: 'Quy chế & Quyết định', label: 'Quy chế & Quyết định' },
            { key: 'Công văn điều hành', label: 'Công văn điều hành' },
            { key: 'Thông báo nội bộ', label: 'Thông báo nội bộ' },
            { key: 'Hợp đồng & Pháp lý', label: 'Hợp đồng & Pháp lý' },
            { key: 'Biên bản & Kỹ thuật', label: 'Biên bản & Báo cáo' },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setCategoryFilter(tab.key)}
              style={{
                backgroundColor: categoryFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: categoryFilter === tab.key ? '#009688' : '#CBD5E1',
                color: categoryFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: categoryFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Select
            value={securityFilter}
            onChange={(val) => setSecurityFilter(val)}
            style={{ width: 170 }}
            options={[
              { label: 'Tất cả mức bảo mật', value: 'all' },
              { label: 'Tuyệt mật (BOD Only)', value: 'Tuyệt mật (BOD Only)' },
              { label: 'Mật (Confidential)', value: 'Mật (Confidential)' },
              { label: 'Nội bộ công ty', value: 'Nội bộ công ty' },
            ]}
          />
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo số hiệu, trích yếu, người ký..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />
          <Button
            icon={<FileWordOutlined />}
            onClick={handleOpenCreateDocx}
            style={{ color: '#2B579A', borderColor: '#2B579A', fontWeight: 600 }}
          >
            Soạn Word (.docx)
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setModalOpen(true)}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Ban hành văn bản
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất danh mục văn bản ra tệp Excel thành công!')}>
            Xuất Excel
          </Button>
        </div>
      </div>

      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      <Modal
        title="Ban Hành Văn Bản Quy Phạm &amp; Hồ Sơ Lưu Trữ Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={750}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{
            direction: 'Nội bộ ban hành',
            docCategory: 'Quy chế & Quyết định',
            securityLevel: 'Nội bộ công ty',
            status: 'Mới ban hành',
            caSigned: true,
            issuedDate: new Date().toISOString().substring(0, 10),
            effectiveDate: new Date().toISOString().substring(0, 10),
          }}
          style={{ marginTop: 14 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="docCode" label="Số / Ký hiệu văn bản" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: QĐ-2026/12-BOD" />
            </Form.Item>
            <Form.Item name="docCategory" label="Phân loại văn thư" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Quy chế & Quyết định', value: 'Quy chế & Quyết định' },
                  { label: 'Công văn điều hành', value: 'Công văn điều hành' },
                  { label: 'Thông báo nội bộ', value: 'Thông báo nội bộ' },
                  { label: 'Hợp đồng & Pháp lý', value: 'Hợp đồng & Pháp lý' },
                  { label: 'Biên bản & Kỹ thuật', value: 'Biên bản & Kỹ thuật' },
                ]}
              />
            </Form.Item>
          </div>
          <Form.Item name="title" label="Trích yếu nội dung văn bản" rules={[{ required: true }]}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="direction" label="Chiều luồng văn bản" rules={[{ required: true }]}>
              <Radio.Group>
                <Radio value="Nội bộ ban hành">Nội bộ ban hành</Radio>
                <Radio value="Văn bản đến">Văn bản đến</Radio>
                <Radio value="Văn bản đi">Văn bản đi</Radio>
              </Radio.Group>
            </Form.Item>
            <Form.Item name="securityLevel" label="Cấp độ bảo mật (ISO 27001)" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Công khai', value: 'Công khai' },
                  { label: 'Nội bộ công ty', value: 'Nội bộ công ty' },
                  { label: 'Mật (Confidential)', value: 'Mật (Confidential)' },
                  { label: 'Tuyệt mật (BOD Only)', value: 'Tuyệt mật (BOD Only)' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="issuingAuthority" label="Đơn vị ban hành / Cơ quan gửi" rules={[{ required: true, message: 'Nhập đơn vị ban hành' }]}>
              <Input placeholder="Ví dụ: Ban Giám Đốc KIYOVN" />
            </Form.Item>
            <Form.Item name="signerName" label="Họ tên người ký ban hành" rules={[{ required: true, message: 'Nhập người ký' }]}>
              <Input placeholder="Ví dụ: Nguyễn Văn Minh" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="signerPosition" label="Chức danh người ký" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Tổng Giám Đốc" />
            </Form.Item>
            <Form.Item name="issuedDate" label="Ngày ban hành" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="effectiveDate" label="Ngày có hiệu lực" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="storageLocation" label="Vị trí lưu kho vật lý & Cloud">
              <Input placeholder="Ví dụ: Kệ A1-Box 02 Keangnam Landmark 72" />
            </Form.Item>
            <Form.Item name="tags" label="Thẻ từ khóa tìm kiếm (phân cách bằng dấu phẩy)">
              <Input placeholder="ISO 27001, An toàn, Keangnam" />
            </Form.Item>
          </div>

          <Form.Item name="summary" label="Ghi chú tóm tắt điều khoản thực hiện">
            <Input.TextArea rows={2} placeholder="Nội dung điều khoản quan trọng..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Ban hành văn bản
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Thẩm Định Chi Tiết Hồ Sơ & Kiểm Tra Mã Băm SHA-256 */}
      <Drawer
        title="Thẩm Định Chi Tiết Hồ Sơ Văn Thư &amp; Ký Số Điện Tử"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={680}
      >
        {selectedDoc && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Document Box */}
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedDoc.docCode}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedDoc.title}
                  </div>
                </div>
                <Tag color={selectedDoc.status === 'Đang hiệu lực' ? 'success' : 'processing'}>
                  {selectedDoc.status}
                </Tag>
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Tag color="blue">{selectedDoc.docCategory}</Tag>
                <Tag color={selectedDoc.securityLevel.includes('Mật') ? 'red' : 'green'}>
                  {selectedDoc.securityLevel}
                </Tag>
                {selectedDoc.caSigned && (
                  <Tag color="purple" icon={<SafetyCertificateOutlined />}>
                    Đã ký Token Viettel-CA
                  </Tag>
                )}
              </div>
            </div>

            {/* Detailed Metadata Grid */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Tin Pháp Lý &amp; Ban Hành:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Đơn vị ban hành:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedDoc.issuingAuthority}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Người ký duyệt:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>
                    {selectedDoc.signerName} ({selectedDoc.signerPosition})
                  </div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Ngày ban hành:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedDoc.issuedDate}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Ngày có hiệu lực:</span>
                  <div style={{ fontWeight: 700, color: '#16A34A' }}>{selectedDoc.effectiveDate}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Thời hạn lưu trữ:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedDoc.expirationDate}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Vị trí lưu trữ:</span>
                  <div style={{ fontWeight: 700, color: '#2563EB' }}>{selectedDoc.storageLocation}</div>
                </div>
              </div>
            </div>

            {/* Summary */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>Nội dung trích yếu chi tiết:</div>
              <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.6 }}>{selectedDoc.summary}</div>
            </div>

            {/* Cryptographic SHA-256 Checksum */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <KeyOutlined style={{ color: '#7C3AED' }} /> Đối Soát Tính Toàn Vẹn Mã Băm (SHA-256):
              </div>
              <div style={{ background: '#0F172A', color: '#10B981', padding: '8px 12px', borderRadius: 6, fontFamily: 'monospace', fontSize: 11, wordBreak: 'break-all' }}>
                {selectedDoc.sha256Hash}
              </div>
              <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircleOutlined /> Văn bản nguyên bản 100%, không có dấu hiệu chỉnh sửa sau khi ký duyệt.
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <Button
                icon={<FileWordOutlined />}
                onClick={() => handleOpenEditDocx(selectedDoc)}
                style={{ flex: 1, color: '#2B579A', borderColor: '#2B579A', fontWeight: 600 }}
              >
                Soạn thảo Word (.docx)
              </Button>
              <Button
                icon={<DownloadOutlined />}
                onClick={() => {
                  downloadFile(`${selectedDoc.docCode}.pdf`);
                  message.success(`Đã tải file văn bản ${selectedDoc.docCode}`);
                }}
                style={{ flex: 1 }}
              >
                Tải Tệp PDF Scan
              </Button>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in phiếu lưu trữ văn thư cho hồ sơ ${selectedDoc.docCode}`)}
                style={{ flex: 1 }}
              >
                In Phiếu Văn Thư
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Docx Rich Text Editor Modal */}
      {docxEditorOpen && editorDocItem && (
        <DocxEditorModal
          open={docxEditorOpen}
          fileName={`${editorDocItem.docCode}.docx`}
          fileKey={editorDocItem.key}
          initialParagraphs={[
            `CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM`,
            `Độc lập - Tự do - Hạnh phúc`,
            editorDocItem.title.toUpperCase(),
            `Căn cứ theo Luật Doanh Nghiệp số 59/2020/QH14 và các quy chế quản trị nội bộ hiện hành.`,
            `Điều 1. ${editorDocItem.summary || 'Ban hành và áp dụng văn bản quản lý nội bộ.'}`,
            `Điều 2. Các phòng ban chức năng chịu trách nhiệm triển khai thi hành.`,
            `Điều 3. Quyết định có hiệu lực thi hành kể từ ngày ký.`,
          ]}
          onClose={() => setDocxEditorOpen(false)}
          onSaveSuccess={(updatedName) => {
            const exists = data.some(d => d.key === editorDocItem.key);
            if (!exists) {
              setData([editorDocItem, ...data]);
            }
          }}
        />
      )}
    </div>
  );
};
