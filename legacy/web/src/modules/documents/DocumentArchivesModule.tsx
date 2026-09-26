import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  InboxOutlined,
  SendOutlined,
  EyeOutlined,
  FilePdfOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SafetyCertificateOutlined,
  PrinterOutlined,
  PaperClipOutlined,
  ShareAltOutlined,
  ThunderboltOutlined,
  AlertOutlined,
  BarcodeOutlined,
  FileDoneOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Radio, Card, Tooltip } from '../../custom-ui';
import { downloadFile } from '../../utils/fileExporter';

export interface EnterpriseArchiveRecord {
  key: string;
  dispatchType: 'Văn bản đến' | 'Văn bản đi';
  bookNumber: string;
  originalCode: string;
  docType: 'Công văn' | 'Quyết định' | 'Thông báo' | 'Tờ trình' | 'Hợp đồng' | 'Giấy mời';
  partner: string;
  subject: string;
  signer: string;
  signerPosition: string;
  receiverOrAuthor: string;
  dateReceivedOrIssued: string;
  docDate: string;
  urgency: 'Hỏa tốc' | 'Thượng khẩn' | 'Bình thường';
  securityLevel: 'Tuyệt mật' | 'Mật' | 'Nội bộ' | 'Thường';
  pageCount: number;
  fileScan: string;
  fileSize: string;
  digitalVerified: boolean;
  slaDeadline: string;
  status: 'Đã giải quyết xong' | 'Đang xử lý đúng hạn' | 'Cảnh báo quá hạn' | 'Đã chuyển phát bưu điện';
}

const INITIAL_ARCHIVES: EnterpriseArchiveRecord[] = [];

export const DocumentArchivesModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseArchiveRecord[]>(INITIAL_ARCHIVES);

  useEffect(() => {
    const list = dataService.getGenericData('doc_archives');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('doc_archives');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [activeTab, setActiveTab] = useState<'all' | 'Văn bản đến' | 'Văn bản đi' | 'urgent' | 'pending'>('all');
  const [searchText, setSearchText] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<EnterpriseArchiveRecord | null>(null);

  const incomingCount = data.filter((d) => d.dispatchType === 'Văn bản đến').length;
  const outgoingCount = data.filter((d) => d.dispatchType === 'Văn bản đi').length;
  const totalRecords = data.length;
  const urgentCount = data.filter((d) => d.urgency === 'Hỏa tốc' || d.urgency === 'Thượng khẩn').length;

  const handleCreate = (values: any) => {
    const isIncoming = values.dispatchType === 'Văn bản đến';
    const countType = data.filter((d) => d.dispatchType === values.dispatchType).length + 1;
    const newRecord: EnterpriseArchiveRecord = {
      ...values,
      key: String(Date.now()),
      bookNumber: isIncoming ? `SĐ-2026/0${countType}` : `SĐI-2026/0${countType}`,
      dateReceivedOrIssued: values.dateReceivedOrIssued || new Date().toISOString().substring(0, 10),
      docDate: values.docDate || new Date().toISOString().substring(0, 10),
      pageCount: Number(values.pageCount) || 4,
      fileScan: `${values.originalCode.replace(/[^a-zA-Z0-9]/g, '_')}_Scan.pdf`,
      fileSize: '2.5 MB',
      digitalVerified: true,
      status: isIncoming ? 'Đang xử lý đúng hạn' : 'Đã chuyển phát bưu điện',
    };

    const nextItems = [newRecord, ...data]; setData(nextItems); dataService.saveGenericData('doc_archives', nextItems);
    message.success(`Đã vào sổ văn thư thành công: ${newRecord.bookNumber} (${values.subject})`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    let matchTab = true;
    if (activeTab === 'Văn bản đến') matchTab = item.dispatchType === 'Văn bản đến';
    if (activeTab === 'Văn bản đi') matchTab = item.dispatchType === 'Văn bản đi';
    if (activeTab === 'urgent') matchTab = item.urgency === 'Hỏa tốc' || item.urgency === 'Thượng khẩn';
    if (activeTab === 'pending') matchTab = item.status.includes('Đang xử lý');

    const matchDocType = docTypeFilter === 'all' || item.docType === docTypeFilter;

    const matchSearch =
      (item.bookNumber || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.originalCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.partner || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.subject || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.signer || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.receiverOrAuthor || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchDocType && matchSearch;
  });

  const columns = [
    {
      title: 'Số vào sổ & Phân loại',
      key: 'bookNumber',
      width: 170,
      render: (_: any, record: EnterpriseArchiveRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: record.dispatchType === 'Văn bản đến' ? '#2563EB' : '#009688', display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            {record.dispatchType === 'Văn bản đến' ? <InboxOutlined /> : <SendOutlined />}
            {record.bookNumber}
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
            <Tag color={record.dispatchType === 'Văn bản đến' ? 'blue' : 'green'} style={{ margin: 0, fontSize: 10.5 }}>
              {record.dispatchType}
            </Tag>
            <Tag color="cyan" style={{ margin: 0, fontSize: 10.5 }}>
              {record.docType}
            </Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Số ký hiệu gốc & Ngày',
      key: 'originalCode',
      width: 160,
      render: (_: any, r: EnterpriseArchiveRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 12.5 }}>{r.originalCode}</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>Ngày VB: {r.docDate}</div>
          <div style={{ fontSize: 11, color: '#2563EB' }}>Vào sổ: {r.dateReceivedOrIssued}</div>
        </div>
      ),
    },
    {
      title: 'Cơ quan gửi / Nhận & Trích yếu',
      key: 'subject',
      render: (_: any, record: EnterpriseArchiveRecord) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.subject}</div>
          <div style={{ fontSize: 12, color: '#2563EB', marginTop: 2 }}>
            Đối tác / Cơ quan: <strong>{record.partner}</strong>
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Người phụ trách: <strong>{record.receiverOrAuthor}</strong> · ({record.pageCount} trang)
          </div>
        </div>
      ),
    },
    {
      title: 'Độ khẩn & Bảo mật',
      key: 'urgency',
      width: 140,
      render: (_: any, r: EnterpriseArchiveRecord) => (
        <div>
          <div>
            <Tag color={r.urgency === 'Hỏa tốc' ? 'error' : r.urgency === 'Thượng khẩn' ? 'warning' : 'default'} style={{ margin: 0 }}>
              {r.urgency}
            </Tag>
          </div>
          <div style={{ marginTop: 4 }}>
            <Tag color={r.securityLevel === 'Mật' ? 'red' : 'blue'} style={{ margin: 0, fontSize: 11 }}>
              {r.securityLevel}
            </Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái & Hạn xử lý',
      key: 'status',
      width: 160,
      render: (_: any, r: EnterpriseArchiveRecord) => {
        let color = 'success';
        if (r.status.includes('Đang xử lý')) color = 'processing';
        if (r.status.includes('Quá hạn')) color = 'error';
        return (
          <div>
            <Tag color={color}>{r.status}</Tag>
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
              Hạn SLA: <strong style={{ color: '#DC2626' }}>{r.slaDeadline}</strong>
            </div>
          </div>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 130,
      render: (_: any, record: EnterpriseArchiveRecord) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedRecord(record);
              setDrawerOpen(true);
            }}
          >
            Trích lục
          </Button>
          <Button
            size="small"
            icon={<DownloadOutlined />}
            onClick={() => {
              downloadFile(record.fileScan);
              message.success(`Đang tải file scan ${record.fileScan}...`);
            }}
          />
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Văn bản đến đã vào sổ tiếp nhận</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {incomingCount} văn bản đến
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>100% Số hóa hồ sơ đính kèm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Văn bản đi đã cấp số ban hành</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {outgoingCount} văn bản đi
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Đóng mộc điện tử &amp; Ký số CA</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Văn bản hỏa tốc &amp; Thượng khẩn</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {urgentCount} văn bản gấp
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Ưu tiên phân phối xử lý ngay</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tuân thủ Nghị định 30/2020/NĐ-CP</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            99.2% Chuẩn hóa
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Định dạng số ký hiệu quy chuẩn</div>
        </div>
      </div>

      {/* Filter Tabs & Search Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả sổ văn thư' },
            { key: 'Văn bản đến', label: 'Sổ Văn Bản Đến', icon: <DownloadOutlined style={{ color: '#10B981' }} /> },
            { key: 'Văn bản đi', label: 'Sổ Văn Bản Đi', icon: <UploadOutlined style={{ color: '#3B82F6' }} /> },
            { key: 'urgent', label: 'Hỏa tốc & Khẩn', icon: <ThunderboltOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'pending', label: 'Đang xử lý', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Select
            value={docTypeFilter}
            onChange={(val) => setDocTypeFilter(val)}
            style={{ width: 140 }}
            options={[
              { label: 'Tất cả thể loại', value: 'all' },
              { label: 'Công văn', value: 'Công văn' },
              { label: 'Quyết định', value: 'Quyết định' },
              { label: 'Thông báo', value: 'Thông báo' },
              { label: 'Hợp đồng', value: 'Hợp đồng' },
              { label: 'Giấy mời', value: 'Giấy mời' },
            ]}
          />

          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm số vào sổ, số gốc, đối tác, trích yếu, người ký..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Vào sổ văn thư
          </Button>

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất sổ văn thư theo mẫu Nhà nước NĐ 30')}>
            Xuất Sổ
          </Button>
        </div>
      </div>

      {/* Main Archives Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Đăng Ký Vào Sổ Văn Thư */}
      <Modal
        title="Đăng Ký Vào Sổ Văn Thư (Đến / Đi) Theo Chuẩn NĐ 30/2020"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={720}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleCreate}
          initialValues={{
            dispatchType: 'Văn bản đến',
            docType: 'Công văn',
            urgency: 'Bình thường',
            securityLevel: 'Nội bộ',
            dateReceivedOrIssued: new Date().toISOString().substring(0, 10),
            docDate: new Date().toISOString().substring(0, 10),
            slaDeadline: new Date(Date.now() + 7 * 86400000).toISOString().substring(0, 10),
            pageCount: 4,
          }}
          style={{ marginTop: 14 }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="dispatchType" label="Loại sổ văn thư" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Sổ Văn Bản Đến', value: 'Văn bản đến' },
                  { label: 'Sổ Văn Bản Đi', value: 'Văn bản đi' },
                ]}
              />
            </Form.Item>
            <Form.Item name="docType" label="Thể loại văn bản" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Công văn', value: 'Công văn' },
                  { label: 'Quyết định', value: 'Quyết định' },
                  { label: 'Thông báo', value: 'Thông báo' },
                  { label: 'Tờ trình', value: 'Tờ trình' },
                  { label: 'Hợp đồng', value: 'Hợp đồng' },
                  { label: 'Giấy mời', value: 'Giấy mời' },
                ]}
              />
            </Form.Item>
            <Form.Item name="originalCode" label="Số & Ký hiệu gốc" rules={[{ required: true, message: 'Nhập số ký hiệu gốc' }]}>
              <Input placeholder="Ví dụ: CV-115/TCT-HANOI" />
            </Form.Item>
          </div>

          <Form.Item name="partner" label="Cơ quan ban hành gửi đến / Nơi nhận" rules={[{ required: true, message: 'Nhập cơ quan đối tác' }]}>
            <Input placeholder="Ví dụ: Cục Thuế TP. Hà Nội hoặc VNPT Telecom" />
          </Form.Item>

          <Form.Item name="subject" label="Trích yếu nội dung văn bản" rules={[{ required: true, message: 'Nhập trích yếu' }]}>
            <Input.TextArea rows={2} placeholder="Nhập trích yếu nội dung văn bản..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="signer" label="Người ký văn bản" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Lê Văn Cường" />
            </Form.Item>
            <Form.Item name="signerPosition" label="Chức danh người ký" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Cục Trưởng / Tổng Giám Đốc" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="receiverOrAuthor" label="Cán bộ / Phòng ban chủ trì xử lý" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Phòng Tài Chính Kế Toán" />
            </Form.Item>
            <Form.Item name="pageCount" label="Số trang văn bản">
              <Input type="number" min={1} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="docDate" label="Ngày ghi trên VB" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="dateReceivedOrIssued" label="Ngày vào sổ" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="urgency" label="Độ khẩn">
              <Select
                options={[
                  { label: 'Hỏa tốc', value: 'Hỏa tốc' },
                  { label: 'Thượng khẩn', value: 'Thượng khẩn' },
                  { label: 'Bình thường', value: 'Bình thường' },
                ]}
              />
            </Form.Item>
            <Form.Item name="securityLevel" label="Mức độ mật">
              <Select
                options={[
                  { label: 'Tuyệt mật', value: 'Tuyệt mật' },
                  { label: 'Mật', value: 'Mật' },
                  { label: 'Nội bộ', value: 'Nội bộ' },
                  { label: 'Thường', value: 'Thường' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="slaDeadline" label="Hạn cam kết xử lý xong (Theo Nghị định 30)">
            <Input type="date" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Vào sổ văn thư
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Trích Lục Sổ Văn Thư */}
      <Drawer
        title="Trích Lục Chi Tiết Sổ Văn Thư Điện Tử (NĐ 30/2020)"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={650}
      >
        {selectedRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Box */}
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>
                    {selectedRecord.bookNumber} · [{selectedRecord.originalCode}]
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedRecord.subject}
                  </div>
                </div>
                <Tag color={selectedRecord.status === 'Đã giải quyết xong' ? 'success' : 'processing'}>
                  {selectedRecord.status}
                </Tag>
              </div>

              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <Tag color={selectedRecord.dispatchType === 'Văn bản đến' ? 'blue' : 'green'}>
                  {selectedRecord.dispatchType}
                </Tag>
                <Tag color="cyan">{selectedRecord.docType}</Tag>
                <Tag color={selectedRecord.urgency === 'Hỏa tốc' ? 'error' : 'warning'}>
                  {selectedRecord.urgency}
                </Tag>
                {selectedRecord.digitalVerified && (
                  <Tag color="purple" icon={<SafetyCertificateOutlined />}>
                    Đã kiểm thực chữ ký số CA
                  </Tag>
                )}
              </div>
            </div>

            {/* Legal Metadata Grid */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <FileDoneOutlined style={{ color: '#009688' }} /> Thông Tin Sổ Bộ Văn Thư &amp; Pháp Lý:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Cơ quan gửi / Nhận:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedRecord.partner}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Người ký văn bản:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>
                    {selectedRecord.signer} ({selectedRecord.signerPosition})
                  </div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Đơn vị chủ trì xử lý:</span>
                  <div style={{ fontWeight: 700, color: '#2563EB' }}>{selectedRecord.receiverOrAuthor}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Số trang &amp; Dung lượng:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>
                    {selectedRecord.pageCount} trang ({selectedRecord.fileSize})
                  </div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Ngày ghi trên văn bản:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedRecord.docDate}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Ngày chính thức vào sổ:</span>
                  <div style={{ fontWeight: 700, color: '#009688' }}>{selectedRecord.dateReceivedOrIssued}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Hạn xử lý SLA:</span>
                  <div style={{ fontWeight: 700, color: '#DC2626' }}>{selectedRecord.slaDeadline}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Mức độ bảo mật:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedRecord.securityLevel}</div>
                </div>
              </div>
            </div>

            {/* Scanned PDF Attachment */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <PaperClipOutlined style={{ color: '#2563EB' }} /> Tệp Bản Scan Gốc Có Dấu Mộc Đỏ:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FilePdfOutlined style={{ color: '#DC2626', fontSize: 22 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{selectedRecord.fileScan}</div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>Dung lượng: {selectedRecord.fileSize} · Ký số HSM hợp lệ</div>
                  </div>
                </div>
                <Button size="small" icon={<DownloadOutlined />} onClick={() => downloadFile(selectedRecord.fileScan)}>
                  Tải tệp
                </Button>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã in phiếu trích lục sổ văn thư ${selectedRecord.bookNumber} (PDF)`)}
                style={{ flex: 1 }}
              >
                In Phiếu Trích Lục (PDF)
              </Button>
              <Button
                type="primary"
                icon={<ShareAltOutlined />}
                onClick={() => message.success(`Đã chuyển phiếu giao nhận văn thư sang ${selectedRecord.receiverOrAuthor}`)}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Chuyển Tiếp Xử Lý
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

