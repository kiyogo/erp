import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  SafetyCertificateOutlined,
  EyeOutlined,
  SendOutlined,
  FilePdfOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  FileTextOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Card, Tag, Alert } from '../../custom-ui';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';

interface EInvoice {
  key: string;
  invoiceNumber: string;
  templateCode: string;
  symbol: string;
  buyerName: string;
  buyerTaxCode: string;
  issueDate: string;
  totalAmount: number;
  vatAmount: number;
  finalAmount: number;
  status: 'Đã phát hành & Ký số' | 'Hóa đơn nháp' | 'Đã hủy';
  externalStatus?: string;
}

const INITIAL_INVOICES: EInvoice[] = [];

export const EInvoiceModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isCreate = currentPath === '/finance/e-invoice/create';
  const isDrafts = currentPath === '/finance/e-invoice/drafts';
  const isTemplates = currentPath === '/finance/e-invoice/templates';
  const isLookup = currentPath === '/finance/e-invoice/lookup';
  const isReports = currentPath === '/finance/e-invoice/reports';

  const [data, setData] = useState<EInvoice[]>(INITIAL_INVOICES);

  useEffect(() => {
    const list = dataService.getGenericData('finance_einvoices');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_einvoices');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [previewRecord, setPreviewRecord] = useState<EInvoice | null>(null);
  const [form] = Form.useForm();
  const [createForm] = Form.useForm();

  const handleCreate = async (values: any) => {
    const total = Number(values.totalAmount) || 0;
    const rateText = String(values.vatRate || '');
    const vatRate = rateText === 'Không chịu thuế' ? 0 : Number(rateText.replace('%', ''));
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(vatRate) || vatRate < 0 || vatRate > 100) {
      message.error('Nhập số tiền và thuế suất GTGT hợp lệ trước khi lưu bản nháp.');
      return;
    }
    const vat = Math.round(total * vatRate / 100);
    const newInv: EInvoice = {
      ...values,
      key: String(Date.now()),
      templateCode: '',
      symbol: '',
      issueDate: new Date().toISOString().substring(0, 10),
      totalAmount: total,
      vatAmount: vat,
      finalAmount: total + vat,
      status: 'Hóa đơn nháp',
      externalStatus: 'Chưa gửi nhà cung cấp',
    };
    try {
      const saved = await dataService.createGenericRecord('finance_einvoices', newInv);
      setData(current => [saved, ...current]);
      message.success(`Đã lưu bản nháp ${values.invoiceNumber}. Hóa đơn chưa được ký số hoặc gửi cơ quan thuế.`);
      setModalOpen(false);
      form.resetFields();
      createForm.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu bản nháp hóa đơn.');
    }
  };

  const deleteDraft = async (record: EInvoice) => {
    try {
      await dataService.deleteGenericRecord('finance_einvoices', record.key);
      message.success(`Đã xóa bản nháp ${record.invoiceNumber}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể xóa bản nháp.');
    }
  };

  const filteredData = data.filter(
    (inv) =>
      !searchText ||
      (inv.invoiceNumber || '').includes(searchText) ||
      (inv.buyerName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (inv.buyerTaxCode || '').includes(searchText)
  );
  const confirmedInvoices = data.filter(inv => inv.externalStatus === 'CQT đã cấp mã');
  const exportInvoiceList = () => downloadFile('bang_ke_ban_ghi_hoa_don_noi_bo.xlsx', generateValidXlsxBlob([
    ['Mã bản ghi', 'Người mua', 'Mã số thuế người mua', 'Ngày lập', 'Tiền trước thuế', 'Thuế GTGT', 'Tổng thanh toán', 'Trạng thái nội bộ', 'Trạng thái bên ngoài'],
    ...filteredData.map(inv => [inv.invoiceNumber, inv.buyerName, inv.buyerTaxCode, inv.issueDate, inv.totalAmount, inv.vatAmount, inv.finalAmount, inv.status, inv.externalStatus || 'Chưa xác minh']),
  ]));
  const exportInvoicePdf = (invoice: EInvoice) => downloadFile(`ban_nhap_hoa_don_${invoice.invoiceNumber.replace(/[^a-z0-9_-]/gi, '_')}.pdf`, generateValidPdfBlob(
    `BẢN NHÁP HÓA ĐƠN ${invoice.invoiceNumber}`,
    'Dữ liệu nội bộ · chưa ký số · chưa gửi cơ quan thuế',
    [`Người mua: ${invoice.buyerName}`, `Mã số thuế: ${invoice.buyerTaxCode || 'Chưa khai báo'}`, `Ngày lập nháp: ${invoice.issueDate}`, `Tiền trước thuế: ${Number(invoice.totalAmount).toLocaleString('vi-VN')} VND`, `Thuế GTGT: ${Number(invoice.vatAmount).toLocaleString('vi-VN')} VND`, `Tổng thanh toán: ${Number(invoice.finalAmount).toLocaleString('vi-VN')} VND`],
  ));

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Giá trị hóa đơn được CQT xác nhận</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {confirmedInvoices.reduce((sum, invoice) => sum + Number(invoice.finalAmount || 0), 0).toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hóa đơn được CQT xác nhận cấp mã</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {confirmedInvoices.length} hóa đơn
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hóa đơn nháp chờ ký số</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {data.filter((d) => d.status === 'Hóa đơn nháp').length} bản nháp
          </div>
        </div>
      </div>

      <Alert
        message="Chưa kết nối nhà cung cấp hóa đơn điện tử"
        description="Mọi hóa đơn mới chỉ được lưu thành bản nháp nội bộ. Chức năng ký số, gửi cơ quan thuế, tra cứu mã và xác nhận phát hành chỉ hoạt động sau khi tích hợp nhà cung cấp thật."
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {/* VIEW: CREATE (Lập hóa đơn điện tử mới trực tiếp) */}
      {isCreate && (
        <Card title="Lập bản nháp hóa đơn điện tử" style={{ borderRadius: 8, border: '1px solid #E2E8F0', maxWidth: 840 }}>
          <Form form={createForm} layout="vertical" onFinish={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Form.Item name="invoiceNumber" label="Mã bản nháp nội bộ" initialValue={`DRAFT-${String(data.length + 1).padStart(5, '0')}`} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="symbol" label="Ký hiệu / mẫu số đã đăng ký">
                <Input placeholder="Chỉ điền sau khi có mẫu đã đăng ký" />
              </Form.Item>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 14 }}>
              <Form.Item name="buyerName" label="Tên đơn vị mua hàng" rules={[{ required: true, message: 'Nhập tên đơn vị mua' }]}>
                <Input placeholder="Ví dụ: Tập Đoàn Viễn Thông Quân Đội" />
              </Form.Item>
              <Form.Item name="buyerTaxCode" label="Mã số thuế" rules={[{ required: true, message: 'Nhập MST' }]}>
                <Input placeholder="0100109106" />
              </Form.Item>
            </div>
              <Form.Item name="buyerAddress" label="Địa chỉ trụ sở khách hàng">
              <Input />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Form.Item name="totalAmount" label="Tổng tiền hàng trước thuế (VNĐ)" rules={[{ required: true, message: 'Nhập số tiền' }]}>
                <Input type="number" min={0} placeholder="Ví dụ: 100000000" />
              </Form.Item>
              <Form.Item name="vatRate" label="Thuế suất GTGT" rules={[{ required: true, message: 'Chọn thuế suất GTGT' }]}>
                <Select
                  options={[
                    { label: '10%', value: '10%' },
                    { label: '8%', value: '8%' },
                    { label: '5%', value: '5%' },
                    { label: '0%', value: '0%' },
                    { label: 'Không chịu thuế GTGT', value: 'Không chịu thuế' },
                  ]}
                />
              </Form.Item>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <Button onClick={() => createForm.resetFields()}>Làm mới form</Button>
              <Button type="primary" htmlType="submit" icon={<SafetyCertificateOutlined />} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Lưu bản nháp
              </Button>
            </div>
          </Form>
        </Card>
      )}

      {/* VIEW: DRAFTS (Hóa đơn nháp chờ ký) */}
      {isDrafts && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh Sách Hóa Đơn Nháp Chờ Ký Số &amp; Truyền Nhận CQT</h3>
            <Button type="primary" icon={<SafetyCertificateOutlined />} disabled title="Chưa kết nối nhà cung cấp hóa đơn điện tử" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Ký số hàng loạt
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={data.filter((d) => d.status === 'Hóa đơn nháp')}
              columns={[
                { title: 'Số dự kiến', dataIndex: 'invoiceNumber', key: 'invoiceNumber', render: (n: string) => <strong>{n}</strong> },
                { title: 'Ký hiệu', key: 'sym', render: (_: any, r: any) => `${r.templateCode} - ${r.symbol}` },
                { title: 'Người mua & MST', key: 'buyer', render: (_: any, r: any) => <div><strong>{r.buyerName}</strong><div style={{ fontSize: 11.5, color: '#64748B' }}>MST: {r.buyerTaxCode}</div></div> },
                { title: 'Tổng thanh toán', dataIndex: 'finalAmount', key: 'finalAmount', render: (v: number) => <strong style={{ color: '#009688' }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Ngày lập', dataIndex: 'issueDate', key: 'issueDate' },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color="warning">{s}</Tag> },
                {
                  title: 'Thao tác',
                  key: 'act',
                  render: (_: any, r: any) => (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="small" type="primary" disabled title="Chưa kết nối nhà cung cấp hóa đơn điện tử" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                        Chưa kết nối
                      </Button>
                      <Button size="small" danger icon={<DeleteOutlined />} title="Xóa bản nháp" onClick={() => void deleteDraft(r)} />
                    </div>
                  ),
                },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: TEMPLATES (Mẫu hóa đơn điện tử) */}
      {isTemplates && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Quản Lý Mẫu Hóa Đơn Điện Tử &amp; Ký Hiệu Đã Đăng Ký CQT</h3>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => message.warning('Thiết kế và đăng ký mẫu cần cấu hình nhà cung cấp hóa đơn điện tử.')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Đăng ký mẫu hóa đơn mới
            </Button>
          </div>
          <Alert message="Chưa có mẫu hóa đơn đã xác minh" description="Mẫu số, ký hiệu và trạng thái đăng ký cần đến từ nhà cung cấp hóa đơn hoặc phản hồi của cơ quan thuế." type="warning" showIcon />
        </div>
      )}

      {/* VIEW: LOOKUP (Tra cứu hóa đơn CQT) */}
      {isLookup && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 840 }}>
          <Card title="Cổng Tra Cứu Hóa Đơn Điện Tử Trực Tuyến" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <Input placeholder="Nhập mã số bí mật / Số hóa đơn / Mã CQT..." style={{ flex: 1 }} />
              <Button type="primary" icon={<SearchOutlined />} disabled title="Chưa kết nối dịch vụ tra cứu của cơ quan thuế" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Chưa kết nối tra cứu
              </Button>
            </div>
            <Alert message="Chưa có kết nối tra cứu của cơ quan thuế" description="Hóa đơn chỉ được xác nhận khi có phản hồi thực tế từ cơ quan thuế hoặc nhà cung cấp đã tích hợp." type="warning" showIcon />
          </Card>
        </div>
      )}

      {/* VIEW: REPORTS (Báo cáo tình hình sử dụng hóa đơn BC26/AC) */}
      {isReports && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Báo Cáo Tình Hình Sử Dụng Hóa Đơn</h3>
            <Button icon={<DownloadOutlined />} disabled title="Chưa có dữ liệu hóa đơn được CQT xác nhận">
              Chưa thể xuất báo cáo CQT
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[]}
              columns={[
                { title: 'Kỳ báo cáo', dataIndex: 'period', key: 'period', render: (p: string) => <strong>{p}</strong> },
                { title: 'Ký hiệu & Mẫu số', dataIndex: 'form', key: 'form' },
                { title: 'Tổng số phát hành', dataIndex: 'totalIssued', key: 'totalIssued' },
                { title: 'Đã sử dụng', dataIndex: 'used', key: 'used', render: (u: number) => <strong style={{ color: '#16A34A' }}>{u}</strong> },
                { title: 'Đã xóa bỏ / Hủy', dataIndex: 'cancelled', key: 'cancelled', render: (c: number) => <span style={{ color: '#DC2626' }}>{c}</span> },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag icon={<CheckOutlined />} color="success">{s}</Tag> },
                { title: 'Thao tác', key: 'act', render: () => <Button size="small">Xem chi tiết</Button> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DEFAULT (Danh sách hóa đơn đã phát hành) */}
      {!isCreate && !isDrafts && !isTemplates && !isLookup && !isReports && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo số HĐ, tên người mua, MST..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 340, borderRadius: 6 }}
              allowClear
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<DownloadOutlined />} onClick={exportInvoiceList} disabled={!filteredData.length}>
                Xuất bảng kê nội bộ
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  form.resetFields();
                  setModalOpen(true);
                }}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Lập hóa đơn mới
              </Button>
            </div>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={filteredData}
              columns={[
                {
                  title: 'Số Hóa đơn',
                  dataIndex: 'invoiceNumber',
                  key: 'invoiceNumber',
                  render: (num: string) => (
                    <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <FileDoneOutlined /> {num}
                    </span>
                  ),
                },
                {
                  title: 'Ký hiệu / Mẫu',
                  key: 'sym',
                  render: (_: any, r: EInvoice) => <span style={{ fontSize: 12, color: '#64748B' }}>{r.templateCode} - {r.symbol}</span>,
                },
                {
                  title: 'Khách hàng mua & MST',
                  key: 'buyer',
                  render: (_: any, r: EInvoice) => (
                    <div>
                      <div style={{ fontWeight: 600, color: '#1E293B' }}>{r.buyerName}</div>
                      <div style={{ fontSize: 11.5, color: '#64748B' }}>MST: {r.buyerTaxCode}</div>
                    </div>
                  ),
                },
                {
                  title: 'Tổng thanh toán (VNĐ)',
                  dataIndex: 'finalAmount',
                  key: 'finalAmount',
                  render: (val: number) => <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{val.toLocaleString('vi-VN')} ₫</strong>,
                },
                {
                  title: 'Ngày lập',
                  dataIndex: 'issueDate',
                  key: 'issueDate',
                  render: (d: string) => <span style={{ fontSize: 12, color: '#64748B' }}>{d}</span>,
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string, record: EInvoice) => <Tag color={record.externalStatus === 'CQT đã cấp mã' ? 'success' : 'warning'}>{record.externalStatus === 'CQT đã cấp mã' ? 'CQT đã xác nhận' : status.includes('phát hành') ? 'Dữ liệu cũ · chưa xác minh' : status}</Tag>,
                },
                {
                  title: 'Thao tác',
                  key: 'actions',
                  render: (_: unknown, record: EInvoice) => (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="small" icon={<EyeOutlined />} onClick={() => setPreviewRecord(record)}>Xem</Button>
                      <Button size="small" icon={<FilePdfOutlined />} onClick={() => exportInvoicePdf(record)}>Bản PDF nội bộ</Button>
                    </div>
                  ),
                },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* Modal Add Invoice */}
      <Modal
        title="Lập hóa đơn điện tử mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <Form.Item name="invoiceNumber" label="Mã bản nháp nội bộ" initialValue={`DRAFT-${String(data.length + 1).padStart(5, '0')}`} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="buyerName" label="Tên người mua / Doanh nghiệp" rules={[{ required: true, message: 'Nhập tên khách hàng' }]}>
            <Input placeholder="Ví dụ: Công Ty TNHH Dịch Vụ Mạng" />
          </Form.Item>
          <Form.Item name="buyerTaxCode" label="Mã số thuế người mua" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="totalAmount" label="Tổng tiền trước thuế (VNĐ)" rules={[{ required: true }]}>
            <Input type="number" min={1} step={1} />
          </Form.Item>
          <Form.Item name="vatRate" label="Thuế suất GTGT" rules={[{ required: true, message: 'Chọn thuế suất GTGT' }]}>
            <Select options={[{ label: '10%', value: '10%' }, { label: '8%', value: '8%' }, { label: '5%', value: '5%' }, { label: '0%', value: '0%' }, { label: 'Không chịu thuế GTGT', value: 'Không chịu thuế' }]} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu bản nháp
            </Button>
          </div>
        </Form>
      </Modal>
      <Modal title={`Xem bản ghi hóa đơn ${previewRecord?.invoiceNumber || ''}`} open={Boolean(previewRecord)} onCancel={() => setPreviewRecord(null)} footer={null} width={520}>
        {previewRecord && <div style={{ display: 'grid', gap: 8 }}>
          <div><strong>Trạng thái:</strong> {previewRecord.externalStatus || 'Chưa xác minh với CQT'}</div>
          <div><strong>Người mua:</strong> {previewRecord.buyerName}</div>
          <div><strong>Mã số thuế:</strong> {previewRecord.buyerTaxCode || 'Chưa khai báo'}</div>
          <div><strong>Ngày lập nháp:</strong> {previewRecord.issueDate}</div>
          <div><strong>Tiền trước thuế:</strong> {Number(previewRecord.totalAmount).toLocaleString('vi-VN')} ₫</div>
          <div><strong>Thuế GTGT:</strong> {Number(previewRecord.vatAmount).toLocaleString('vi-VN')} ₫</div>
          <div><strong>Tổng thanh toán:</strong> {Number(previewRecord.finalAmount).toLocaleString('vi-VN')} ₫</div>
        </div>}
      </Modal>
    </div>
  );
};
