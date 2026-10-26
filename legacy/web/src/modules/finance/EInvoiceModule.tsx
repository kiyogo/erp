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
  PrinterOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Card, Tag, Table } from '../../custom-ui';

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
  const [form] = Form.useForm();
  const [createForm] = Form.useForm();

  const handleCreate = (values: any) => {
    const total = Number(values.totalAmount) || 0;
    const vat = Math.round(total * 0.1);
    const newInv: EInvoice = {
      ...values,
      key: String(Date.now()),
      templateCode: '1/001',
      symbol: 'C26TKY',
      issueDate: new Date().toISOString().substring(0, 10),
      totalAmount: total,
      vatAmount: vat,
      finalAmount: total + vat,
      status: 'Đã phát hành & Ký số',
    };
    const nextItems = [newInv, ...data]; setData(nextItems); dataService.saveGenericData('finance_einvoices', nextItems);
    message.success(`Đã xuất hóa đơn điện tử số ${values.invoiceNumber} và ký số thành công!`);
    setModalOpen(false);
    form.resetFields();
    createForm.resetFields();
  };

  const filteredData = data.filter(
    (inv) =>
      !searchText ||
      (inv.invoiceNumber || '').includes(searchText) ||
      (inv.buyerName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (inv.buyerTaxCode || '').includes(searchText)
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng doanh số hóa đơn đã phát hành</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.filter((d) => d.status === 'Đã phát hành & Ký số').reduce((s, i) => s + i.finalAmount, 0).toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Số hóa đơn hợp lệ CQT cấp mã</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {data.filter((d) => d.status === 'Đã phát hành & Ký số').length} hóa đơn
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hóa đơn nháp chờ ký số</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {data.filter((d) => d.status === 'Hóa đơn nháp').length} bản nháp
          </div>
        </div>
      </div>

      {/* VIEW: CREATE (Lập hóa đơn điện tử mới trực tiếp) */}
      {isCreate && (
        <Card title="Lập Mới & Ký Số Hóa Đơn Điện Tử Trực Tuyến" style={{ borderRadius: 8, border: '1px solid #E2E8F0', maxWidth: 840 }}>
          <Form form={createForm} layout="vertical" onFinish={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Form.Item name="invoiceNumber" label="Số hóa đơn" initialValue={`00000${data.length + 140}`} rules={[{ required: true }]}>
                <Input disabled />
              </Form.Item>
              <Form.Item name="symbol" label="Ký hiệu & Mẫu số" initialValue="1/001 - C26TKY" rules={[{ required: true }]}>
                <Input disabled />
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
            <Form.Item name="buyerAddress" label="Địa chỉ trụ sở khách hàng" initialValue="Số 1 Giang Văn Minh, Ba Đình, Hà Nội">
              <Input />
            </Form.Item>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Form.Item name="totalAmount" label="Tổng tiền hàng trước thuế (VNĐ)" rules={[{ required: true, message: 'Nhập số tiền' }]}>
                <Input type="number" min={0} placeholder="Ví dụ: 100000000" />
              </Form.Item>
              <Form.Item name="vatRate" label="Thuế suất GTGT" initialValue="10%">
                <Select
                  options={[
                    { label: '10%', value: '10%' },
                    { label: '8%', value: '8%' },
                    { label: '0%', value: '0%' },
                    { label: 'Không chịu thuế GTGT', value: 'Không chịu thuế' },
                  ]}
                />
              </Form.Item>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <Button onClick={() => createForm.resetFields()}>Làm mới form</Button>
              <Button type="primary" htmlType="submit" icon={<SafetyCertificateOutlined />} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Ký số &amp; Gửi Cơ quan Thuế
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
            <Button type="primary" icon={<SafetyCertificateOutlined />} onClick={() => message.success('Đã ký số đồng loạt các hóa đơn nháp!')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
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
                      <Button size="small" type="primary" onClick={() => message.success(`Đã ký số thành công hóa đơn ${r.invoiceNumber}`)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                        Ký số ngay
                      </Button>
                      <Button size="small" danger icon={<DeleteOutlined />} onClick={() => message.info(`Đã hủy bản nháp ${r.invoiceNumber}`)} />
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
            <Button type="primary" icon={<PlusOutlined />} onClick={() => message.info('Mở trình thiết kế mẫu hóa đơn')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Đăng ký mẫu hóa đơn mới
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            {[
              { name: 'Mẫu Hóa đơn Giá trị gia tăng', template: '1/001', symbol: 'C26TKY', registered: '15/01/2026', cqtAccept: 'Chấp nhận theo Tờ khai 01/ĐKTĐ-HĐĐT', status: 'Đang sử dụng' },
              { name: 'Mẫu Hóa đơn Bán hàng', template: '2/001', symbol: 'C26BKY', registered: '15/01/2026', cqtAccept: 'Chấp nhận theo Tờ khai 01/ĐKTĐ-HĐĐT', status: 'Đang sử dụng' },
            ].map((tmpl, idx) => (
              <Card key={idx} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <strong style={{ fontSize: 14, color: '#009688' }}>{tmpl.name}</strong>
                  <Tag color="success">{tmpl.status}</Tag>
                </div>
                <div style={{ fontSize: 13, color: '#0F172A', marginBottom: 6 }}>
                  Mẫu số: <strong>{tmpl.template}</strong> | Ký hiệu: <strong>{tmpl.symbol}</strong>
                </div>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>{tmpl.cqtAccept}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button size="small" icon={<EyeOutlined />}>Xem trước mẫu</Button>
                  <Button size="small" icon={<PrinterOutlined />}>In mẫu</Button>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* VIEW: LOOKUP (Tra cứu hóa đơn CQT) */}
      {isLookup && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 840 }}>
          <Card title="Cổng Tra Cứu Hóa Đơn Điện Tử Trực Tuyến" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
              <Input placeholder="Nhập mã số bí mật / Số hóa đơn / Mã CQT..." style={{ flex: 1 }} />
              <Button type="primary" icon={<SearchOutlined />} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Tra cứu
              </Button>
            </div>
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 6, border: '1px solid #E2E8F0' }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Kết quả tra cứu nhanh:</div>
              <div style={{ fontSize: 13, color: '#475569', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><CheckOutlined style={{ color: '#16A34A', marginRight: 6 }} />Hóa đơn số: <strong>00000142</strong> (Ký hiệu: <strong>1/001 - C26TKY</strong>)</div>
                <div><CheckOutlined style={{ color: '#16A34A', marginRight: 6 }} />Đơn vị bán: <strong>CÔNG TY CP CÔNG NGHỆ KIYOVN</strong> </div>
                <div><CheckOutlined style={{ color: '#16A34A', marginRight: 6 }} />Đơn vị mua: <strong>Tập Đoàn Công Nghệ F-Global</strong> </div>
                <div><CheckOutlined style={{ color: '#16A34A', marginRight: 6 }} />Trạng thái CQT: <Tag color="success">Đã cấp mã CQT hợp lệ</Tag></div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* VIEW: REPORTS (Báo cáo tình hình sử dụng hóa đơn BC26/AC) */}
      {isReports && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Báo Cáo Tình Hình Sử Dụng Hóa Đơn</h3>
            <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo BC26/AC!')}>
              Xuất XML nộp CQT
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[
                { id: '1', period: 'Quý II / 2026', form: '1/001 - C26TKY', totalIssued: 45, used: 44, cancelled: 1, deleted: 0, status: 'Đã nộp CQT' },
                { id: '2', period: 'Quý I / 2026', form: '1/001 - C26TKY', totalIssued: 38, used: 38, cancelled: 0, deleted: 0, status: 'Đã nộp CQT' },
              ]}
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
              <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất bảng kê hóa đơn điện tử')}>
                Bảng kê Excel
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
                  render: (status: string) => <Tag color={status.includes('phát hành') ? 'success' : 'warning'}>{status}</Tag>,
                },
                {
                  title: 'Thao tác',
                  key: 'actions',
                  render: () => (
                    <div style={{ display: 'flex', gap: 6 }}>
                      <Button size="small" icon={<EyeOutlined />} onClick={() => message.info('Xem trước hóa đơn')}>Xem</Button>
                      <Button size="small" icon={<FilePdfOutlined />} onClick={() => message.success('Tải PDF hóa đơn thành công')}>PDF</Button>
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
          <Form.Item name="invoiceNumber" label="Số hóa đơn" initialValue={`00000${data.length + 143}`} rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="buyerName" label="Tên người mua / Doanh nghiệp" rules={[{ required: true, message: 'Nhập tên khách hàng' }]}>
            <Input placeholder="Ví dụ: Công Ty TNHH Dịch Vụ Mạng" />
          </Form.Item>
          <Form.Item name="buyerTaxCode" label="Mã số thuế người mua" initialValue="0108899772" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="totalAmount" label="Tổng tiền trước thuế (VNĐ)" initialValue={50000000} rules={[{ required: true }]}>
            <Input type="number" min={0} step={1000000} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Ký số &amp; Phát hành
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
