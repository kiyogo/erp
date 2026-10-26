import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  BookOutlined,
  FileSyncOutlined,
  FilePdfOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Button, message, Card, Tag } from '../../custom-ui';

interface LedgerEntry {
  key: string;
  voucherCode: string;
  entryDate: string;
  description: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  author: string;
  status: 'Đã ghi sổ cái' | 'Chờ duyệt kế toán trưởng';
}

const INITIAL_ENTRIES: LedgerEntry[] = [];

export const GeneralLedgerModule: React.FC<{ subType?: string }> = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isStatements = currentPath === '/finance/general/statements';
  const isProfitLoss = currentPath === '/finance/general/profit-loss';
  const isAdvance = currentPath === '/finance/general/advance';

  const [data, setData] = useState<LedgerEntry[]>(INITIAL_ENTRIES);

  useEffect(() => {
    const list = dataService.getGenericData('finance_general_ledger');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_general_ledger');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const totalAmount = data.reduce((sum, item) => sum + item.amount, 0);

  const handleCreate = (values: any) => {
    const newItem: LedgerEntry = {
      ...values,
      key: String(Date.now()),
      amount: Number(values.amount) || 10000000,
      author: 'Nguyễn Thị Mai',
      status: 'Đã ghi sổ cái',
    };
    const nextItems = [newItem, ...data]; setData(nextItems); dataService.saveGenericData('finance_general_ledger', nextItems);
    message.success(`Đã hạch toán chứng từ: ${values.voucherCode}`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter(
    (item) =>
      (item.voucherCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.description || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.debitAccount || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.creditAccount || '').toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giá trị phát sinh bút toán trong tháng</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalAmount.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Số bút toán đã ghi Sổ Cái</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {data.filter((d) => d.status === 'Đã ghi sổ cái').length} bút toán
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cân đối Nợ - Có</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            Khớp 100%
          </div>
        </div>
      </div>

      {/* VIEW: STATEMENTS */}
      {isStatements && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Bộ Báo Cáo Tài Chính Tổng Hợp</h3>
            <Button type="primary" icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất toàn bộ BCTC!')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xuất Bộ BCTC
            </Button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
            {[
              { code: 'B01 - DN', name: 'Bảng Cân Đối Kế Toán', period: 'Tại ngày 30/06/2026', totalAssets: '14.850.000.000 ₫', status: 'Cân đối' },
              { code: 'B02 - DN', name: 'Báo Cáo Kết Quả Hoạt Động KD', period: 'Lũy kế 6 tháng đầu năm 2026', totalAssets: 'LNTT: +3.250.000.000 ₫', status: 'Có lãi' },
              { code: 'B03 - DN', name: 'Báo Cáo Lưu Chuyển Tiền Tệ', period: 'Lũy kế 6 tháng đầu năm 2026', totalAssets: 'Dòng tiền thuần: +1.890.000.000 ₫', status: 'Dương' },
              { code: 'B09 - DN', name: 'Bản Thuyết Minh BCTC', period: 'Kèm theo BCTC Quý 2/2026', totalAssets: '12 phụ lục chi tiết', status: 'Đầy đủ' },
            ].map((st, idx) => (
              <Card key={idx} style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <strong style={{ color: '#009688', fontSize: 14 }}>{st.code}</strong>
                  <Tag color="success">{st.status}</Tag>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0F172A', marginBottom: 4 }}>{st.name}</div>
                <div style={{ fontSize: 12, color: '#64748B', marginBottom: 8 }}>{st.period}</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#2563EB', marginBottom: 12 }}>{st.totalAssets}</div>
                <Button size="small" icon={<FilePdfOutlined />} onClick={() => message.info(`Mở bản in ${st.name}`)}>Xem báo cáo</Button>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* VIEW: PROFIT-LOSS */}
      {isProfitLoss && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 840 }}>
          <Card title="Quy Trình Tự Động Kết Chuyển Xác Định Kết Quả Kinh Doanh (TK 911)" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
              {[
                { step: '1. Kết chuyển Doanh thu bán hàng & dịch vụ', from: 'Nợ TK 511', to: 'Có TK 911', amount: '1.850.000.000 ₫' },
                { step: '2. Kết chuyển Giá vốn dịch vụ cung cấp', from: 'Nợ TK 911', to: 'Có TK 632', amount: '620.000.000 ₫' },
                { step: '3. Kết chuyển Chi phí quản lý doanh nghiệp', from: 'Nợ TK 911', to: 'Có TK 642', amount: '380.000.000 ₫' },
                { step: '4. Kết chuyển Chi phí tài chính & Thuế TNDN', from: 'Nợ TK 911', to: 'Có TK 8211', amount: '170.000.000 ₫' },
                { step: '5. Kết chuyển Lợi nhuận sau thuế chưa phân phối', from: 'Nợ TK 911', to: 'Có TK 4212', amount: '680.000.000 ₫' },
              ].map((item, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: 6, border: '1px solid #E2E8F0' }}>
                  <div>
                    <strong style={{ fontSize: 13, color: '#0F172A' }}>{item.step}</strong>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>{item.from} ➔ {item.to}</div>
                  </div>
                  <strong style={{ color: '#009688', fontSize: 13.5 }}>{item.amount}</strong>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <Button onClick={() => message.info('Kiểm tra số dư các tài khoản đầu 5, 6, 7, 8...')}>Kiểm tra số dư</Button>
              <Button type="primary" icon={<FileSyncOutlined />} onClick={() => message.success('Đã thực hiện kết chuyển tự động Quý 3/2026!')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Chạy Kết Chuyển Tự Động
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* VIEW: ADVANCE */}
      {isAdvance && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Theo Dõi &amp; Quyết Toán Tạm Ứng Cán Bộ Nhân Viên (TK 141)</h3>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => message.info('Mở giấy đề nghị tạm ứng')} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lập phiếu tạm ứng
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={[
                { id: '1', emp: 'Trần Tuấn Anh (CTO)', reason: 'Công tác triển khai dự án ACB TP.HCM', advance: 15000000, settled: 14200000, refund: 800000, date: '2026-08-20', status: 'Đã hoàn ứng thừa' },
                { id: '2', emp: 'Lê Hoàng Yến (HRM)', reason: 'Mua vật tư team building công ty', advance: 20000000, settled: 21500000, refund: -1500000, date: '2026-08-15', status: 'Đã chi bù thêm' },
                { id: '3', emp: 'Vũ Minh Trí', reason: 'Chi phí tiếp khách và gặp đối tác F-Global', advance: 10000000, settled: 0, refund: 0, date: '2026-08-25', status: 'Chưa thanh toán tạm ứng' },
              ]}
              columns={[
                { title: 'Cán bộ tạm ứng', dataIndex: 'emp', key: 'emp', render: (e: string) => <strong>{e}</strong> },
                { title: 'Mục đích tạm ứng', dataIndex: 'reason', key: 'reason' },
                { title: 'Số tiền tạm ứng', dataIndex: 'advance', key: 'advance', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Số thực chi', dataIndex: 'settled', key: 'settled', render: (v: number) => <strong style={{ color: '#0F172A' }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Chênh lệch', key: 'ref', render: (_: any, r: any) => <span style={{ color: r.refund >= 0 ? '#16A34A' : '#DC2626', fontWeight: 600 }}>{r.refund >= 0 ? `+${r.refund.toLocaleString('vi-VN')} ₫` : `${r.refund.toLocaleString('vi-VN')} ₫`}</span> },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag color={s.includes('Đã') ? 'success' : 'warning'}>{s}</Tag> },
                { title: 'Thao tác', key: 'act', render: () => <Button size="small">Quyết toán</Button> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DEFAULT */}
      {!isStatements && !isProfitLoss && !isAdvance && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo số chứng từ, nội dung hạch toán, tài khoản..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 360, borderRadius: 6 }}
              allowClear
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất Sổ Cái ra Excel')}>
                Xuất Sổ Cái
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
                Hạch toán chứng từ mới
              </Button>
            </div>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={filteredData}
              columns={[
                {
                  title: 'Số chứng từ',
                  dataIndex: 'voucherCode',
                  key: 'voucherCode',
                  render: (code: string) => (
                    <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <BookOutlined /> {code}
                    </span>
                  ),
                },
                {
                  title: 'Ngày hạch toán',
                  dataIndex: 'entryDate',
                  key: 'entryDate',
                },
                {
                  title: 'Diễn giải nội dung nghiệp vụ',
                  dataIndex: 'description',
                  key: 'description',
                  render: (d: string) => <span style={{ fontWeight: 500, color: '#1E293B' }}>{d}</span>,
                },
                {
                  title: 'Định khoản Nợ ➔ Có',
                  key: 'acc',
                  render: (_: any, r: LedgerEntry) => (
                    <div style={{ fontSize: 12 }}>
                      <div style={{ color: '#16A34A', fontWeight: 600 }}>Nợ: {r.debitAccount}</div>
                      <div style={{ color: '#2563EB', fontWeight: 600 }}>Có: {r.creditAccount}</div>
                    </div>
                  ),
                },
                {
                  title: 'Số tiền phát sinh',
                  dataIndex: 'amount',
                  key: 'amount',
                  render: (v: number) => <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{v.toLocaleString('vi-VN')} ₫</strong>,
                },
                {
                  title: 'Trạng thái ghi sổ',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string) => <Tag color={status.includes('Đã ghi') ? 'success' : 'warning'}>{status}</Tag>,
                },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* Modal Add Entry */}
      <Modal
        title="Hạch toán chứng từ nghiệp vụ khác"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={520}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="voucherCode" label="Số chứng từ" initialValue={`PKT-2026-00${data.length + 1}`} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="entryDate" label="Ngày hạch toán" initialValue={new Date().toISOString().substring(0, 10)} rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item name="description" label="Nội dung diễn giải" rules={[{ required: true, message: 'Nhập diễn giải' }]}>
            <Input.TextArea rows={2} placeholder="Ví dụ: Phân bổ chi phí thuê văn phòng tháng 8" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="debitAccount" label="Tài khoản Nợ" initialValue="TK 6422 - Chi phí quản lý" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="creditAccount" label="Tài khoản Có" initialValue="TK 242 - Chi phí trả trước" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="amount" label="Số tiền hạch toán (VNĐ)" initialValue={10000000} rules={[{ required: true }]}>
            <Input type="number" min={0} step={1000000} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Ghi sổ cái
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
