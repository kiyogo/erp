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
  const totalPending = Math.max(0, totalPayable - totalPaid);
  const declaredTaxTypes = Array.from(new Set(data.map(item => item.taxType).filter(Boolean)));
  const deadlineRows = data.filter(item => /^\d{4}-\d{2}-\d{2}$/.test(item.deadline || '')).sort((a, b) => a.deadline.localeCompare(b.deadline));

  const handleCreate = async (values: any) => {
    const payable = Number(values.amountPayable) || 0;
    const newTax: TaxFiling = {
      ...values,
      key: String(Date.now()),
      amountPayable: payable,
      amountPaid: 0,
      status: 'Chờ nộp thuế',
    };
    try {
      const saved = await dataService.createGenericRecord('finance_tax', newTax);
      setData(current => [saved, ...current]);
      message.success(`Đã lưu hồ sơ thuế ${values.taxType} - ${values.period} ở trạng thái chờ nộp.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể lưu hồ sơ thuế.');
    }
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng nghĩa vụ theo hồ sơ đã lưu</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalPayable.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã ghi nhận trong dữ liệu nội bộ</div>
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

      <Alert
        message="Hồ sơ trong web chưa được gửi cơ quan thuế"
        description="Các bản ghi ở đây chỉ là dữ liệu nội bộ. Web hiện chưa kết nối eTax hoặc dịch vụ xác nhận thanh toán, nên không thể đánh dấu một khoản thuế là đã nộp."
        type="warning"
        showIcon
        style={{ marginBottom: 16 }}
      />

      {/* VIEW: TYPES (Danh mục các loại sắc thuế doanh nghiệp) */}
      {isTypes && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh Mục Các Sắc Thuế Doanh Nghiệp Áp Dụng</h3>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => message.warning('Chức năng đăng ký sắc thuế cần kết nối cơ quan thuế; chưa có xác nhận trực tuyến.')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Thêm sắc thuế
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {declaredTaxTypes.map((taxType) => (
              <Card key={taxType} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong style={{ color: '#009688', fontSize: 14 }}>Theo hồ sơ đã nhập</strong>
                  <Tag color="warning">Chưa xác minh</Tag>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', marginBottom: 4 }}>{taxType}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>Mức thuế và kỳ kê khai cần xác nhận theo hồ sơ doanh nghiệp và quy định áp dụng.</div>
              </Card>
            ))}
            {!declaredTaxTypes.length && <div style={{ color: '#64748B', padding: 16 }}>Chưa có sắc thuế nào được khai báo trong hồ sơ nội bộ.</div>}
          </div>
        </div>
      )}

      {/* VIEW: PERIODS (Kỳ kê khai thuế) */}
      {isPeriods && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Kỳ kê khai theo hồ sơ nội bộ</h3>
            <Button icon={<DownloadOutlined />} disabled title="Chưa có dữ liệu kỳ kê khai đã xác nhận">
              Xuất Danh Sách Kỳ Kê Khai
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={data.map(item => ({ ...item, type: item.taxType }))}
              columns={[
                { title: 'Kỳ kê khai', dataIndex: 'period', key: 'period', render: (p: string) => <strong>{p}</strong> },
                { title: 'Sắc thuế áp dụng', dataIndex: 'type', key: 'type' },
                { title: 'Thời gian kỳ', dataIndex: 'period', key: 'time' },
                { title: 'Hạn chót đã khai báo', dataIndex: 'deadline', key: 'deadline', render: (d: string) => <strong style={{ color: '#DC2626' }}>{d || 'Chưa khai báo'}</strong> },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s.includes('hoàn tất') ? 'success' : s.includes('Sắp') ? 'warning' : 'processing'}>{s}</Tag> },
                { title: 'Thao tác', key: 'act', render: () => <Button size="small" disabled>Chưa có tờ khai điện tử</Button> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DEADLINES (Lịch hạn chót nộp thuế) */}
      {isDeadlines && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Hạn chót đã khai báo</h3>
            <Button icon={<CalendarOutlined />} disabled title="Chưa tích hợp lịch ngoài">
              Đồng bộ Lịch
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {deadlineRows.map((item) => {
              const days = Math.ceil((Date.parse(`${item.deadline}T00:00:00`) - Date.now()) / 86_400_000);
              return <Card key={item.key} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <strong style={{ color: '#DC2626', fontSize: 14 }}>Hạn: {item.deadline}</strong>
                  <Tag color={days < 0 ? 'error' : days <= 7 ? 'warning' : 'processing'}>{days < 0 ? `Quá hạn ${Math.abs(days)} ngày` : days === 0 ? 'Đến hạn hôm nay' : `Còn ${days} ngày`}</Tag>
                </div>
                <div style={{ fontWeight: 700, fontSize: 13.5, color: '#0F172A', marginBottom: 6 }}>{item.taxType} · {item.period}</div>
                <div style={{ fontSize: 12, color: '#64748B' }}>Hạn do người dùng khai báo; chưa đồng bộ với CQT.</div>
              </Card>;
            })}
            {!deadlineRows.length && <div style={{ color: '#64748B', padding: 16 }}>Chưa có hạn nộp được khai báo.</div>}
          </div>
        </div>
      )}

      {/* VIEW: ORDERS (Giấy nộp tiền NSNN Mẫu C1-02/NS) */}
      {isOrders && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Giấy Nộp Tiền Vào Ngân Sách Nhà Nước</h3>
            <Button type="primary" icon={<PlusOutlined />} disabled title="Chưa tích hợp eTax hoặc ngân hàng" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lập giấy nộp tiền eTax
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[]}
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
            description="Web chưa kết nối danh sách cảnh báo hoặc API tra cứu mã số thuế của cơ quan thuế; không thể xác nhận trạng thái thuế hay tự động chặn hóa đơn."
            type="warning"
            showIcon
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Danh Sách Doanh Nghiệp Có Cảnh Báo Rủi Ro Thuế</h3>
            <Input prefix={<SearchOutlined style={{ color: '#bbb' }} />} placeholder="Chưa kết nối nguồn tra cứu thuế" style={{ width: 340, borderRadius: 6 }} allowClear disabled />
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[]}
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
                      disabled
                      title="Chưa có kết nối eTax hoặc xác minh chứng từ thanh toán"
                      style={record.status !== 'Đã nộp đủ' ? { backgroundColor: '#009688', borderColor: '#009688' } : {}}
                    >
                      {record.status === 'Đã nộp đủ' ? 'Đã ghi nhận' : 'Chưa kết nối eTax'}
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
            <Form.Item name="code" label="Mã hồ sơ thuế" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="taxType" label="Loại thuế" rules={[{ required: true, message: 'Chọn loại thuế' }]}>
              <Select
                options={[
                  { label: 'Thuế GTGT', value: 'Thuế GTGT' },
                  { label: 'Thuế TNDN tạm tính', value: 'Thuế TNDN tạm tính' },
                  { label: 'Thuế TNCN khấu trừ', value: 'Thuế TNCN khấu trừ' },
                  { label: 'Lệ phí Môn bài', value: 'Lệ phí Môn bài' },
                ]}
              />
            </Form.Item>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="period" label="Kỳ kê khai" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="amountPayable" label="Số tiền phải nộp (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={1000000} />
            </Form.Item>
          </div>
          <Form.Item name="taxAuthority" label="Cơ quan thuế quản lý">
            <Input />
          </Form.Item>
          <Form.Item name="deadline" label="Hạn chót nộp" rules={[{ required: true }]}>
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
