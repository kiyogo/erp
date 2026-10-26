import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  CalendarOutlined,
  WarningOutlined,
  SafetyCertificateOutlined,
  FilePdfOutlined,
  SendOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Card, Tag, Alert } from '../../custom-ui';

interface TaxFiling {
  key: string;
  code: string;
  taxType: 'Thuế GTGT' | 'Thuế TNDN tạm tính' | 'Thuế TNCN khấu trừ' | 'Lệ phí Môn bài';
  period: string;
  taxAuthority: string;
  amountPayable: number;
  amountPaid: number;
  deadline: string;
  status: 'Đã nộp đủ' | 'Chờ nộp thuế' | 'Quá hạn nộp';
}

const INITIAL_TAX_DATA: TaxFiling[] = [];

export const TaxModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isTypes = currentPath === '/finance/tax/types';
  const isPeriods = currentPath === '/finance/tax/periods';
  const isDeadlines = currentPath === '/finance/tax/deadlines';
  const isOrders = currentPath === '/finance/tax/orders';
  const isRisky = currentPath === '/finance/tax/risky';
  const isDeclaration = currentPath === '/finance/tax/declaration';

  const [data, setData] = useState<TaxFiling[]>(INITIAL_TAX_DATA);

  useEffect(() => {
    const list = dataService.getGenericData('finance_tax');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_tax');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const totalPayable = data.reduce((sum, item) => sum + item.amountPayable, 0);
  const totalPaid = data.reduce((sum, item) => sum + item.amountPaid, 0);
  const totalPending = totalPayable - totalPaid;

  const handleCreate = (values: any) => {
    const payable = Number(values.amountPayable) || 0;
    const newTax: TaxFiling = {
      ...values,
      key: String(Date.now()),
      amountPayable: payable,
      amountPaid: 0,
      status: 'Chờ nộp thuế',
    };
    const nextItems = [newTax, ...data]; setData(nextItems); dataService.saveGenericData('finance_tax', nextItems);
    message.success(`Đã thêm kỳ kê khai thuế mới: ${values.taxType} - ${values.period}`);
    setModalOpen(false);
    form.resetFields();
  };

  const handlePayTax = (record: TaxFiling) => {
    setData(
      data.map((d) =>
        d.key === record.key ? { ...d, amountPaid: d.amountPayable, status: 'Đã nộp đủ' as const } : d
      )
    );
    message.success(`Đã xác nhận nộp ${record.amountPayable.toLocaleString('vi-VN')} ₫ tiền thuế ${record.taxType}`);
  };

  const filteredData = data.filter(
    (item) =>
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.taxType || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.period || '').toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số thuế phải nộp năm 2026</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalPayable.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã nộp vào Ngân sách Nhà nước</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalPaid.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nghĩa vụ thuế chờ nộp sắp tới</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {totalPending.toLocaleString('vi-VN')} ₫
          </div>
        </div>
      </div>

      {/* VIEW: TYPES (Danh mục các loại sắc thuế doanh nghiệp) */}
      {isTypes && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh Mục Các Sắc Thuế Doanh Nghiệp Áp Dụng</h3>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => message.info('Đăng ký sắc thuế mới với CQT')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Thêm sắc thuế
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {[
              { name: 'Thuế Giá trị gia tăng', code: '1701', rate: '8% - 10%', method: 'Khấu trừ theo Quý', status: 'Bắt buộc' },
              { name: 'Thuế Thu nhập Doanh nghiệp', code: '1052', rate: '20%', method: 'Tạm nộp Quý & Quyết toán năm', status: 'Bắt buộc' },
              { name: 'Thuế Thu nhập Cá nhân', code: '1001', rate: 'Lũy tiến 5% - 35%', method: 'Khấu trừ theo Tháng/Quý', status: 'Bắt buộc' },
              { name: 'Lệ phí Môn bài', code: '2862', rate: '2.000.000 ₫/năm', method: 'Nộp 1 lần đầu năm', status: 'Đã hoàn thành' },
              { name: 'Thuế Nhà thầu Nước ngoài', code: '1054', rate: '5% VAT + 5% TNDN', method: 'Theo từng lần phát sinh', status: 'Áp dụng' },
            ].map((tax, idx) => (
              <Card key={idx} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong style={{ color: '#009688', fontSize: 14 }}>Tiểu mục {tax.code}</strong>
                  <Tag color="success">{tax.status}</Tag>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', marginBottom: 4 }}>{tax.name}</div>
                <div style={{ fontSize: 12.5, color: '#2563EB', fontWeight: 600, marginBottom: 6 }}>Thuế suất: {tax.rate}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>Phương thức: {tax.method}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* VIEW: PERIODS (Kỳ kê khai thuế) */}
      {isPeriods && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh Sách Các Kỳ Kê Khai Thuế Năm Tài Chính 2026</h3>
            <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất lịch các kỳ kê khai')}>
              Xuất Danh Sách Kỳ Kê Khai
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[
                { id: '1', period: 'Quý III / 2026', type: 'Thuế GTGT & TNDN tạm nộp', start: '01/07/2026', end: '30/09/2026', deadline: '30/10/2026', status: 'Đang thu thập hóa đơn' },
                { id: '2', period: 'Tháng 08 / 2026', type: 'Thuế TNCN khấu trừ chi trả lương', start: '01/08/2026', end: '31/08/2026', deadline: '20/09/2026', status: 'Sắp đến hạn' },
                { id: '3', period: 'Quý II / 2026', type: 'Thuế GTGT & TNDN tạm nộp', start: '01/04/2026', end: '30/06/2026', deadline: '30/07/2026', status: 'Đã hoàn tất quyết toán' },
              ]}
              columns={[
                { title: 'Kỳ kê khai', dataIndex: 'period', key: 'period', render: (p: string) => <strong>{p}</strong> },
                { title: 'Sắc thuế áp dụng', dataIndex: 'type', key: 'type' },
                { title: 'Thời gian kỳ', key: 'time', render: (_: any, r: any) => `${r.start} ➔ ${r.end}` },
                { title: 'Hạn chót nộp CQT', dataIndex: 'deadline', key: 'deadline', render: (d: string) => <strong style={{ color: '#DC2626' }}>{d}</strong> },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s.includes('hoàn tất') ? 'success' : s.includes('Sắp') ? 'warning' : 'processing'}>{s}</Tag> },
                { title: 'Thao tác', key: 'act', render: () => <Button size="small">Xem tờ khai</Button> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DEADLINES (Lịch hạn chót nộp thuế) */}
      {isDeadlines && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Lịch Trình Hạn Chót Nộp Tờ Khai &amp; Nộp Thuế Năm 2026</h3>
            <Button icon={<CalendarOutlined />} onClick={() => message.info('Đã đồng bộ lịch thuế vào Google Calendar!')}>
              Đồng bộ Lịch
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {[
              { deadline: '20/09/2026', title: 'Nộp Tờ khai & Tiền thuế TNCN Tháng 08/2026', scope: 'Thuế TNCN khấu trừ chi trả thu nhập', status: 'Còn 24 ngày', level: 'warning' },
              { deadline: '30/10/2026', title: 'Nộp Tờ khai GTGT Quý 3/2026', scope: 'Thuế GTGT theo quý + Báo cáo BC26', status: 'Còn 64 ngày', level: 'processing' },
              { deadline: '30/10/2026', title: 'Tạm nộp Thuế TNDN Quý 3/2026', scope: 'Nghĩa vụ tạm nộp TNDN', status: 'Còn 64 ngày', level: 'processing' },
              { deadline: '30/01/2027', title: 'Nộp Lệ phí Môn bài Năm 2027', scope: 'Bậc 2: 2.000.000 ₫/năm', status: 'Định kỳ năm', level: 'default' },
            ].map((dl, idx) => (
              <Card key={idx} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ color: '#DC2626', fontSize: 14 }}>Hạn: {dl.deadline}</strong>
                  <Tag color={dl.level as any}>{dl.status}</Tag>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0F172A', marginBottom: 6 }}>{dl.title}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>{dl.scope}</div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* VIEW: ORDERS (Giấy nộp tiền NSNN Mẫu C1-02/NS) */}
      {isOrders && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Giấy Nộp Tiền Vào Ngân Sách Nhà Nước</h3>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => message.info('Mở lập lệnh nộp thuế điện tử eTax')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lập giấy nộp tiền eTax
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[
                { id: '1', code: 'C102-2026-081', chapter: '754', itemCode: '1701 - Thuế GTGT', kbn: 'KBNN Cầu Giấy', bank: 'Vietcombank - Cầu Giấy', amount: 145000000, date: '2026-07-28', status: 'CQT đã gạch nợ' },
                { id: '2', code: 'C102-2026-082', chapter: '754', itemCode: '1052 - Thuế TNDN', kbn: 'KBNN Cầu Giấy', bank: 'Vietcombank - Cầu Giấy', amount: 88000000, date: '2026-07-28', status: 'CQT đã gạch nợ' },
                { id: '3', code: 'C102-2026-083', chapter: '754', itemCode: '1001 - Thuế TNCN', kbn: 'KBNN Cầu Giấy', bank: 'BIDV - Hà Nội', amount: 42500000, date: '2026-08-18', status: 'CQT đã gạch nợ' },
              ]}
              columns={[
                { title: 'Mã số chứng từ', dataIndex: 'code', key: 'code', render: (c: string) => <strong>{c}</strong> },
                { title: 'Chương & Tiểu mục', key: 'sec', render: (_: any, r: any) => <div><strong>{r.itemCode}</strong><div style={{ fontSize: 11.5, color: '#64748B' }}>Chương: {r.chapter}</div></div> },
                { title: 'Cơ quan thu & KBNN', key: 'kb', render: (_: any, r: any) => <div>{r.kbn}<div style={{ fontSize: 11.5, color: '#64748B' }}>Trích từ: {r.bank}</div></div> },
                { title: 'Số tiền nộp', dataIndex: 'amount', key: 'amount', render: (v: number) => <strong style={{ color: '#009688' }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Ngày nộp', dataIndex: 'date', key: 'date' },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag icon={<CheckOutlined />} color="success">{s}</Tag> },
                { title: 'In', key: 'act', render: () => <Button size="small" icon={<FilePdfOutlined />}>PDF</Button> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: RISKY (Doanh nghiệp rủi ro về thuế CQT) */}
      {isRisky && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Alert
            message="Cảnh báo an toàn thuế đầu vào"
            description="Hệ thống tự động tra cứu mã số thuế của tất cả nhà cung cấp đầu vào với Danh sách 524 Doanh nghiệp rủi ro cao của Tổng cục Thuế để ngăn ngừa rủi ro hóa đơn bất hợp pháp."
            type="warning"
            showIcon
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh Sách Doanh Nghiệp Có Cảnh Báo Rủi Ro Thuế</h3>
            <Input prefix={<SearchOutlined style={{ color: '#bbb' }} />} placeholder="Tra cứu MST hoặc tên công ty rủi ro..." style={{ width: 340, borderRadius: 6 }} allowClear />
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[
                { id: '1', taxCode: '0108992113', name: 'Công Ty TNHH Thương Mại Toàn Cầu Nam Phát', reason: 'Không hoạt động tại địa chỉ đăng ký kinh doanh', date: '2026-05-12', action: 'Chặn ghi nhận hóa đơn đầu vào', risk: 'Rất cao' },
                { id: '2', taxCode: '0314567891', name: 'Công Ty CP Dịch Vụ Tiếp Vận Á Châu Minh', reason: 'Có dấu hiệu mua bán hóa đơn bất hợp pháp', date: '2026-06-20', action: 'Chặn ghi nhận hóa đơn đầu vào', risk: 'Rất cao' },
              ]}
              columns={[
                { title: 'Mã số thuế', dataIndex: 'taxCode', key: 'taxCode', render: (t: string) => <code style={{ color: '#DC2626', fontWeight: 700 }}>{t}</code> },
                { title: 'Tên doanh nghiệp vi phạm', dataIndex: 'name', key: 'name', render: (n: string) => <strong>{n}</strong> },
                { title: 'Lý do cảnh báo của CQT', dataIndex: 'reason', key: 'reason' },
                { title: 'Ngày CQT công bố', dataIndex: 'date', key: 'date' },
                { title: 'Mức độ', dataIndex: 'risk', key: 'risk', render: (r: string) => <Tag color="error">{r}</Tag> },
                { title: 'Hành động hệ thống', dataIndex: 'action', key: 'action', render: (a: string) => <span style={{ color: '#DC2626', fontWeight: 600 }}>{a}</span> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DECLARATION & DEFAULT */}
      {!isTypes && !isPeriods && !isDeadlines && !isOrders && !isRisky && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo mã tờ khai, loại thuế, kỳ kê khai..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 340, borderRadius: 6 }}
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
              Thêm kỳ kê khai thuế
            </Button>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={filteredData}
              columns={[
                {
                  title: 'Mã tờ khai',
                  dataIndex: 'code',
                  key: 'code',
                  render: (code: string) => (
                    <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AuditOutlined /> {code}
                    </span>
                  ),
                },
                {
                  title: 'Sắc thuế kê khai',
                  dataIndex: 'taxType',
                  key: 'taxType',
                  render: (t: string) => <strong>{t}</strong>,
                },
                {
                  title: 'Kỳ tính thuế',
                  dataIndex: 'period',
                  key: 'period',
                },
                {
                  title: 'Cơ quan thuế quản lý',
                  dataIndex: 'taxAuthority',
                  key: 'taxAuthority',
                  render: (auth: string) => <span style={{ color: '#475569', fontSize: 12.5 }}>{auth}</span>,
                },
                {
                  title: 'Số tiền thuế (VNĐ)',
                  dataIndex: 'amountPayable',
                  key: 'amountPayable',
                  render: (val: number) => (
                    <strong style={{ fontSize: 13.5, color: '#0F172A' }}>
                      {val.toLocaleString('vi-VN')} ₫
                    </strong>
                  ),
                },
                {
                  title: 'Hạn nộp',
                  dataIndex: 'deadline',
                  key: 'deadline',
                  render: (d: string) => <span style={{ color: '#DC2626', fontWeight: 500 }}>{d}</span>,
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string) => (
                    <Tag color={status === 'Đã nộp đủ' ? 'success' : 'warning'}>
                      {status}
                    </Tag>
                  ),
                },
                {
                  title: 'Thao tác',
                  key: 'action',
                  render: (_: any, record: TaxFiling) => (
                    <Button
                      size="small"
                      type={record.status === 'Đã nộp đủ' ? 'default' : 'primary'}
                      disabled={record.status === 'Đã nộp đủ'}
                      onClick={() => handlePayTax(record)}
                      style={record.status !== 'Đã nộp đủ' ? { backgroundColor: '#009688', borderColor: '#009688' } : {}}
                    >
                      {record.status === 'Đã nộp đủ' ? 'Đã hoàn thành' : 'Nộp thuế'}
                    </Button>
                  ),
                },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* Modal Add Tax Filing */}
      <Modal
        title="Thêm kỳ kê khai thuế doanh nghiệp mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã hồ sơ thuế" initialValue={`TAX-2026-0${data.length + 1}`} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="taxType" label="Loại thuế" initialValue="Thuế GTGT">
              <Select
                options={[
                  { label: 'Thuế GTGT', value: 'Thuế GTGT (VAT)' },
                  { label: 'Thuế TNDN tạm tính', value: 'Thuế TNDN tạm tính' },
                  { label: 'Thuế TNCN khấu trừ', value: 'Thuế TNCN khấu trừ' },
                  { label: 'Lệ phí Môn bài', value: 'Lệ phí Môn bài' },
                ]}
              />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="period" label="Kỳ kê khai" initialValue="Quý III / 2026" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="amountPayable" label="Số tiền phải nộp (VNĐ)" initialValue={50000000} rules={[{ required: true }]}>
              <Input type="number" min={0} step={1000000} />
            </Form.Item>
          </div>
          <Form.Item name="taxAuthority" label="Cơ quan thuế quản lý" initialValue="Chi cục Thuế Quận Cầu Giấy">
            <Input />
          </Form.Item>
          <Form.Item name="deadline" label="Hạn chót nộp" initialValue="2026-10-30" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu tờ khai
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
