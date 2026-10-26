import { dataService } from '../../services/dataService';
import { collectionsApi, filesApi, type StoredFileNode } from '../../api/endpoints';
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
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { formatFileSize } from '../../utils/fileStorage';

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
  pageCount?: number;
  fileNodeId?: string;
  fileSizeBytes?: number;
  fileScan: string;
  fileSize: string;
  digitalVerified: boolean;
  slaDeadline: string;
  status: 'Đã giải quyết xong' | 'Đang xử lý đúng hạn' | 'Cảnh báo quá hạn' | 'Đã chuyển phát bưu điện';
  forwardNote?: string;
  history?: Array<{ status: string; receiverOrAuthor?: string; at: string; actor: string }>;
}

const INITIAL_ARCHIVES: EnterpriseArchiveRecord[] = [];

export const DocumentArchivesModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseArchiveRecord[]>(INITIAL_ARCHIVES);
  const [saving, setSaving] = useState(false);
  const [editingRecord, setEditingRecord] = useState<EnterpriseArchiveRecord | null>(null);
  const [scanFile, setScanFile] = useState<File | null>(null);
  const [uploadedScan, setUploadedScan] = useState<StoredFileNode | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardForm] = Form.useForm();

  useEffect(() => {
    void dataService.refreshGenericData('doc_archives').catch(() => message.error('Không thể tải sổ văn thư từ máy chủ.'));
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

  const refreshRecords = () => dataService.refreshGenericData('doc_archives').catch(() => message.warning('Hồ sơ đã lưu nhưng chưa tải lại được danh sách.'));
  const displayStatus = (record: EnterpriseArchiveRecord) => ['Đang xử lý đúng hạn', 'Cảnh báo quá hạn'].includes(record.status) && record.slaDeadline && record.slaDeadline < new Date().toLocaleDateString('en-CA') ? 'Cảnh báo quá hạn' : record.status;

  const handleCreate = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const parseDate = (value: string) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '') || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('Vui lòng nhập ngày hợp lệ.');
      };
      parseDate(values.dateReceivedOrIssued); parseDate(values.docDate);
      if (values.slaDeadline) { parseDate(values.slaDeadline); if (values.slaDeadline < values.dateReceivedOrIssued) throw new Error('Hạn xử lý không được trước ngày vào sổ.'); }
      const pageCount = values.pageCount === '' || values.pageCount == null ? undefined : Number(values.pageCount);
      if (pageCount != null && (!Number.isInteger(pageCount) || pageCount < 1)) throw new Error('Số trang phải là số nguyên dương.');
      let file = uploadedScan;
      if (scanFile && !file) {
        if (scanFile.size < 1 || scanFile.size > 50 * 1024 * 1024) throw new Error('Tệp scan phải có dữ liệu và không quá 50 MB.');
        if (!/\.(pdf|png|jpe?g|webp|tiff?)$/i.test(scanFile.name)) throw new Error('Chọn tệp PDF hoặc ảnh scan (PNG, JPG, WEBP, TIFF).');
        const workspace = await filesApi.list(undefined, false, true);
        if (!workspace.data.context?.parentId) throw new Error('Không tìm thấy thư mục được phép lưu tệp.');
        const uploaded = await filesApi.upload(scanFile, scanFile.name, workspace.data.context.parentId, 'doc_archives');
        file = uploaded.data.file;
        setUploadedScan(file);
      }
      const record = {
        ...values, key: editingRecord?.key || crypto.randomUUID(),
        bookNumber: editingRecord?.bookNumber || values.bookNumber,
        pageCount,
        fileNodeId: file?.id || editingRecord?.fileNodeId || '',
        fileScan: file?.name || editingRecord?.fileScan || '',
        fileSizeBytes: file?.sizeBytes ?? editingRecord?.fileSizeBytes ?? 0,
        fileSize: file ? formatFileSize(file.sizeBytes) : editingRecord?.fileNodeId ? editingRecord.fileSize : '',
        digitalVerified: false,
        status: editingRecord?.status || 'Đang xử lý đúng hạn',
      };
      const response = editingRecord ? await collectionsApi.update<EnterpriseArchiveRecord>('doc_archives', editingRecord.key, record) : await collectionsApi.create<EnterpriseArchiveRecord>('doc_archives', record);
      setData((previous) => [response.data.record, ...previous.filter((item) => item.key !== response.data.record.key)]);
      setModalOpen(false); setDrawerOpen(false); setScanFile(null); setUploadedScan(null); form.resetFields();
      message.success(`Đã lưu sổ văn thư: ${response.data.record.bookNumber}`);
      void refreshRecords();
    } catch (error: any) { message.error(error?.response?.data?.message || error.message || 'Không thể lưu hồ sơ văn thư.'); }
    finally { setSaving(false); }
  };

  const handleDownloadOriginal = async (record: EnterpriseArchiveRecord) => {
    if (!record.fileNodeId) { message.info('Hồ sơ chưa có tệp scan gốc được tải lên. Có thể xuất phiếu trích lục từ dữ liệu hồ sơ.'); return; }
    try { const response = await filesApi.download(record.fileNodeId); downloadFile(record.fileScan || `${record.originalCode}_scan`, response.data); }
    catch (error: any) { message.error(error?.response?.data?.message || 'Không thể tải tệp gốc. Tệp có thể đã bị xóa hoặc quyền truy cập đã thay đổi.'); }
  };

  const handlePrint = (record: EnterpriseArchiveRecord) => downloadFile(`Trich_luc_${record.bookNumber.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`, generateValidPdfBlob('PHIẾU TRÍCH LỤC SỔ VĂN THƯ', `${record.bookNumber} - ${record.originalCode}`, [`Loại sổ: ${record.dispatchType}`, `Thể loại: ${record.docType}`, `Trích yếu: ${record.subject}`, `Đối tác: ${record.partner}`, `Người ký: ${record.signer} - ${record.signerPosition}`, `Người xử lý: ${record.receiverOrAuthor}`, `Ngày văn bản: ${record.docDate}`, `Ngày vào sổ: ${record.dateReceivedOrIssued}`, `Hạn xử lý: ${record.slaDeadline || 'Chưa đặt'}`, `Số trang: ${record.pageCount ?? 'Chưa ghi nhận'}`, `Mức độ: ${record.urgency} / ${record.securityLevel}`, `Trạng thái: ${displayStatus(record)}`, `Tệp gốc: ${record.fileNodeId ? record.fileScan : 'Chưa đính kèm'}`, 'Phiếu này được tạo từ dữ liệu hồ sơ; không thay thế bản scan gốc hoặc xác thực chữ ký số.']));

  const handleUpdate = async (record: EnterpriseArchiveRecord, patch: Partial<EnterpriseArchiveRecord>) => {
    if (saving) return;
    setSaving(true);
    try {
      const response = await collectionsApi.update<EnterpriseArchiveRecord>('doc_archives', record.key, patch);
      setData((previous) => previous.map((item) => item.key === record.key ? response.data.record : item));
      setSelectedRecord(response.data.record); setForwardOpen(false);
      message.success('Đã lưu kết quả xử lý văn thư.'); void refreshRecords();
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể cập nhật hồ sơ văn thư.'); }
    finally { setSaving(false); }
  };

  const handleDelete = (record: EnterpriseArchiveRecord) => Modal.confirm({ title: 'Xóa hồ sơ văn thư?', content: `Hồ sơ ${record.bookNumber} sẽ được xóa khỏi sổ. Tệp đã tải lên vẫn có trong kho tệp.`, okText: 'Xóa hồ sơ', cancelText: 'Hủy', onOk: async () => { try { await collectionsApi.remove('doc_archives', record.key); setData((previous) => previous.filter((item) => item.key !== record.key)); setDrawerOpen(false); message.success('Đã xóa hồ sơ văn thư.'); void refreshRecords(); } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể xóa hồ sơ văn thư.'); } } });

  const filteredData = data.filter((item) => {
    let matchTab = true;
    if (activeTab === 'Văn bản đến') matchTab = item.dispatchType === 'Văn bản đến';
    if (activeTab === 'Văn bản đi') matchTab = item.dispatchType === 'Văn bản đi';
    if (activeTab === 'urgent') matchTab = item.urgency === 'Hỏa tốc' || item.urgency === 'Thượng khẩn';
    if (activeTab === 'pending') matchTab = ['Đang xử lý đúng hạn', 'Cảnh báo quá hạn'].includes(item.status);

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
            Người phụ trách: <strong>{record.receiverOrAuthor}</strong> · ({record.pageCount == null ? 'Chưa ghi số trang' : `${record.pageCount} trang`})
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
        if (displayStatus(r).includes('Đang xử lý')) color = 'processing';
        if (displayStatus(r).toLowerCase().includes('quá hạn')) color = 'error';
        return (
          <div>
            <Tag color={color}>{displayStatus(r)}</Tag>
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
            title={record.fileNodeId ? 'Tải tệp scan gốc' : 'Hồ sơ chưa có tệp scan gốc'}
            onClick={() => handleDownloadOriginal(record)}
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
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>{data.filter((item) => item.dispatchType === 'Văn bản đến' && item.fileNodeId).length} hồ sơ có tệp đính kèm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Văn bản đi đã cấp số ban hành</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {outgoingCount} văn bản đi
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Theo các hồ sơ đã lưu trong sổ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Văn bản hỏa tốc &amp; Thượng khẩn</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {urgentCount} văn bản gấp
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Ưu tiên phân phối xử lý ngay</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng hồ sơ có tệp gốc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {data.filter((item) => item.fileNodeId).length} / {totalRecords} Hồ sơ
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Thống kê theo tệp đã được tải lên kho</div>
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
              setEditingRecord(null); setScanFile(null); setUploadedScan(null); setFileInputKey((value) => value + 1);
              form.resetFields();
              form.setFieldsValue({ bookNumber: '', dateReceivedOrIssued: new Date().toLocaleDateString('en-CA'), docDate: new Date().toLocaleDateString('en-CA'), pageCount: undefined });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Vào sổ văn thư
          </Button>

          <Button icon={<DownloadOutlined />} onClick={() => downloadFile('So_van_thu.xlsx', generateValidXlsxBlob([['Số vào sổ', 'Loại sổ', 'Số ký hiệu gốc', 'Thể loại', 'Đối tác', 'Trích yếu', 'Người ký', 'Chức danh', 'Người xử lý', 'Ngày văn bản', 'Ngày vào sổ', 'Hạn xử lý', 'Độ khẩn', 'Mức bảo mật', 'Số trang', 'Tệp scan gốc', 'Dung lượng (byte)', 'Trạng thái'], ...filteredData.map((record) => [record.bookNumber, record.dispatchType, record.originalCode, record.docType, record.partner, record.subject, record.signer, record.signerPosition, record.receiverOrAuthor, record.docDate, record.dateReceivedOrIssued, record.slaDeadline || '', record.urgency, record.securityLevel, record.pageCount ?? null, record.fileNodeId ? record.fileScan : '', record.fileSizeBytes ?? 0, displayStatus(record)])]))}>
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
        title={editingRecord ? 'Chỉnh sửa hồ sơ văn thư' : 'Đăng Ký Vào Sổ Văn Thư (Đến / Đi)'}
        open={modalOpen}
        onCancel={() => { if (!saving) setModalOpen(false); }}
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
          }}
          style={{ marginTop: 14 }}
        >
          <Form.Item name="bookNumber" label="Số vào sổ (để trống để cấp tự động)">
            <Input readOnly={!!editingRecord} />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="dispatchType" label="Loại sổ văn thư" rules={[{ required: true }]}>
              <Select
                disabled={!!editingRecord}
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

          <Form.Item name="slaDeadline" label="Hạn cam kết xử lý xong">
            <Input type="date" />
          </Form.Item>

          <Form.Item label="Tệp scan gốc (PDF hoặc ảnh, tối đa 50 MB)">
            <Input key={fileInputKey} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff" disabled={saving} onChange={(event) => { setScanFile(event.target.files?.[0] || null); setUploadedScan(null); }} />
            <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>{uploadedScan ? `Đã tải lên kho: ${uploadedScan.name} (${formatFileSize(uploadedScan.sizeBytes)})` : scanFile ? `${scanFile.name} (${formatFileSize(scanFile.size)})` : editingRecord?.fileNodeId ? `Tệp hiện tại: ${editingRecord.fileScan}` : 'Chưa chọn tệp scan. Hồ sơ vẫn có thể lưu để bổ sung sau.'}</div>
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button disabled={saving} onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingRecord ? 'Lưu thay đổi' : 'Vào sổ văn thư'}
            </Button>
          </div>
        </Form>
      </Modal>

      <Modal title="Chuyển xử lý hồ sơ văn thư" open={forwardOpen} onCancel={() => setForwardOpen(false)} footer={null} width={540}>
        <Form form={forwardForm} layout="vertical" onFinish={(values) => selectedRecord && handleUpdate(selectedRecord, { receiverOrAuthor: values.receiverOrAuthor, forwardNote: values.forwardNote, status: 'Đang xử lý đúng hạn' })}>
          <Form.Item name="receiverOrAuthor" label="Cán bộ / Phòng ban tiếp nhận" rules={[{ required: true }]}><Input /></Form.Item>
          <Form.Item name="forwardNote" label="Nội dung giao xử lý" rules={[{ required: true }]}><Input.TextArea rows={3} /></Form.Item>
          <Button type="primary" htmlType="submit" loading={saving}>Lưu chuyển xử lý</Button>
        </Form>
      </Modal>

      {/* DRAWER: Trích Lục Sổ Văn Thư */}
      <Drawer
        title="Trích Lục Chi Tiết Sổ Văn Thư Điện Tử"
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
                  {displayStatus(selectedRecord)}
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
                <Tag color="default" icon={<SafetyCertificateOutlined />}>Chưa có kết quả kiểm thực chữ ký số</Tag>
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
                <PaperClipOutlined style={{ color: '#2563EB' }} /> Tệp Bản Scan Gốc Đã Đính Kèm:
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <FilePdfOutlined style={{ color: '#DC2626', fontSize: 22 }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{selectedRecord.fileNodeId ? selectedRecord.fileScan : 'Chưa có tệp scan gốc được lưu'}</div>
                    <div style={{ fontSize: 11, color: '#64748B' }}>{selectedRecord.fileNodeId ? `Dung lượng: ${selectedRecord.fileSize}` : 'Có thể bổ sung tệp gốc qua Chỉnh sửa hồ sơ.'} · Chữ ký số chưa kiểm thực</div>
                  </div>
                </div>
                <Button size="small" icon={<DownloadOutlined />} onClick={() => handleDownloadOriginal(selectedRecord)}>
                  Tải tệp gốc
                </Button>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => handlePrint(selectedRecord)}
                style={{ flex: 1 }}
              >
                In Phiếu Trích Lục (PDF)
              </Button>
              <Button
                type="primary"
                icon={<ShareAltOutlined />}
                onClick={() => { forwardForm.resetFields(); forwardForm.setFieldsValue({ receiverOrAuthor: selectedRecord.receiverOrAuthor, forwardNote: '' }); setForwardOpen(true); }}
                disabled={['Đã giải quyết xong', 'Đã chuyển phát bưu điện'].includes(selectedRecord.status)}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Chuyển Tiếp Xử Lý
              </Button>
            </div>
            {selectedRecord.forwardNote && <div style={{ fontSize: 12, color: '#475569' }}>Ghi nhận chuyển xử lý: {selectedRecord.forwardNote}</div>}
            {!!selectedRecord.history?.length && <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}><div style={{ fontWeight: 700, marginBottom: 8 }}>Lịch sử xử lý đã ghi nhận</div>{selectedRecord.history.map((entry, index) => <div key={`${entry.at}-${index}`} style={{ fontSize: 12, color: '#475569', padding: '5px 0' }}>{new Date(entry.at).toLocaleString('vi-VN')} · {entry.actor} · {entry.status}{entry.receiverOrAuthor ? ` · ${entry.receiverOrAuthor}` : ''}</div>)}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Button onClick={() => { setEditingRecord(selectedRecord); setScanFile(null); setUploadedScan(null); setFileInputKey((value) => value + 1); form.resetFields(); form.setFieldsValue(selectedRecord); setModalOpen(true); }}>Chỉnh sửa hồ sơ</Button>
              <Button icon={<PaperClipOutlined />} onClick={async () => { try { await navigator.clipboard.writeText(`${selectedRecord.bookNumber} | ${selectedRecord.originalCode}\n${selectedRecord.subject}\nNgười xử lý: ${selectedRecord.receiverOrAuthor}\nTrạng thái: ${displayStatus(selectedRecord)}`); message.success('Đã sao chép trích yếu hồ sơ.'); } catch { message.error('Trình duyệt chưa cho phép sao chép vào bộ nhớ tạm.'); } }}>Sao chép trích yếu</Button>
              {!['Đã giải quyết xong', 'Đã chuyển phát bưu điện'].includes(selectedRecord.status) && <Button type="primary" loading={saving} onClick={() => Modal.confirm({ title: selectedRecord.dispatchType === 'Văn bản đến' ? 'Xác nhận đã giải quyết hồ sơ?' : 'Xác nhận đã chuyển phát văn bản?', content: 'Thao tác sẽ ghi nhận trạng thái xử lý trên sổ văn thư.', okText: 'Xác nhận', cancelText: 'Hủy', onOk: () => handleUpdate(selectedRecord, { status: selectedRecord.dispatchType === 'Văn bản đến' ? 'Đã giải quyết xong' : 'Đã chuyển phát bưu điện' }) })}>{selectedRecord.dispatchType === 'Văn bản đến' ? 'Hoàn tất xử lý' : 'Xác nhận chuyển phát'}</Button>}
              <Button danger onClick={() => handleDelete(selectedRecord)}>Xóa hồ sơ</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

