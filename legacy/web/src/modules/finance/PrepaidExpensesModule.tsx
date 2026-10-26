import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  AuditOutlined,
  SlidersOutlined,
  PrinterOutlined,
  BankOutlined,
  SafetyCertificateOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';

export interface EnterprisePrepaidExpense {
  key: string;
  code: string;
  name: string;
  category: 'Chi phí thuê địa điểm' | 'Bản quyền phần mềm' | 'Bảo hiểm tài sản' | 'Chi phí sửa chữa lớn';
  totalAmount: number; // Tổng chi phí trả trước
  allocationMonths: number; // Số kỳ phân bổ (tháng)
  monthlyAmount: number; // Số phân bổ hàng tháng
  allocatedAmount: number; // Đã phân bổ lũy kế
  remainingAmount: number; // Giá trị còn lại chưa phân bổ
  department: string;
  startDate: string; // Ngày bắt đầu phân bổ
  accountCode: string; // TK 2421 hoặc TK 2422
  status: 'Đang phân bổ' | 'Đã phân bổ hết';
}

const INITIAL_PREPAID: EnterprisePrepaidExpense[] = [];

export const PrepaidExpensesModule: React.FC = () => {
  const [data, setData] = useState<EnterprisePrepaidExpense[]>(INITIAL_PREPAID);

  useEffect(() => {
    const list = dataService.getGenericData('finance_prepaid');
    setData(Array.isArray(list) ? list : []);
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('finance_prepaid');
      setData(Array.isArray(updated) ? updated : []);
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<EnterprisePrepaidExpense | null>(null);

  const totalPrepaid = data.reduce((sum, item) => sum + item.totalAmount, 0);
  const totalAllocated = data.reduce((sum, item) => sum + item.allocatedAmount, 0);
  const totalRemaining = totalPrepaid - totalAllocated;
  const totalMonthlyAllocation = data
    .filter((d) => d.status === 'Đang phân bổ')
    .reduce((sum, item) => sum + item.monthlyAmount, 0);

  const handleCreate = (values: any) => {
    const total = Number(values.totalAmount) || 0;
    const months = Number(values.allocationMonths) || 12;
    const monthly = Math.round(total / months);
    const allocated = Number(values.allocatedAmount) || 0;
    const rem = total - allocated;

    const newItem: EnterprisePrepaidExpense = {
      ...values,
      key: String(Date.now()),
      totalAmount: total,
      allocationMonths: months,
      monthlyAmount: monthly,
      allocatedAmount: allocated,
      remainingAmount: rem,
      accountCode: months > 12 ? 'TK 2422' : 'TK 2421',
      status: rem <= 0 ? 'Đã phân bổ hết' : 'Đang phân bổ',
    };
    const nextItems = [newItem, ...data]; setData(nextItems); dataService.saveGenericData('finance_prepaid', nextItems);
    message.success(`Đã thêm mới khoản chi phí trả trước: ${values.name}`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchCategory = categoryFilter === 'all' || item.category === categoryFilter;
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.name || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase());

    return matchCategory && matchSearch;
  });

  const columns = [
    {
      title: 'Mã CPTT & Tài khoản',
      key: 'code',
      render: (_: any, record: EnterprisePrepaidExpense) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CalendarOutlined /> {record.code}
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', fontWeight: 600, marginTop: 2 }}>
            {record.accountCode} · {record.category}
          </div>
        </div>
      ),
    },
    {
      title: 'Tên khoản chi phí & Bộ phận',
      key: 'name',
      render: (_: any, record: EnterprisePrepaidExpense) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.name}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Bộ phận: <strong>{record.department}</strong> · Từ: {record.startDate}
          </div>
        </div>
      ),
    },
    {
      title: 'Tổng chi phí ban đầu',
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      width: 170,
      render: (val: number) => (
        <span style={{ fontWeight: 800, color: '#1E40AF', fontSize: 13.5 }}>
          {val.toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Phân bổ hàng tháng',
      dataIndex: 'monthlyAmount',
      key: 'monthlyAmount',
      width: 170,
      render: (val: number, record: EnterprisePrepaidExpense) => (
        <div>
          <strong style={{ color: '#D97706', fontSize: 13 }}>{val.toLocaleString('vi-VN')} ₫/tháng</strong>
          <div style={{ fontSize: 11, color: '#64748B' }}>({record.allocationMonths} kỳ)</div>
        </div>
      ),
    },
    {
      title: 'Đã phân bổ / Giá trị còn lại',
      key: 'progress',
      width: 200,
      render: (_: any, record: EnterprisePrepaidExpense) => {
        const percent = Math.round((record.allocatedAmount / record.totalAmount) * 100);
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
              <span style={{ color: '#DC2626' }}>Đã trích: {record.allocatedAmount.toLocaleString('vi-VN')} ₫</span>
            </div>
            <div style={{ fontWeight: 700, color: '#16A34A', fontSize: 12.5 }}>
              Còn lại: {record.remainingAmount.toLocaleString('vi-VN')} ₫ ({100 - percent}%)
            </div>
          </div>
        );
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string) => (
        <Tag color={status === 'Đang phân bổ' ? 'processing' : 'default'}>{status}</Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterprisePrepaidExpense) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedExpense(record);
            setDrawerOpen(true);
          }}
        >
          Phân kỳ
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng chi phí trả trước ban đầu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {totalPrepaid.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>{data.length} Hợp đồng thuê mặt bằng &amp; Bản quyền</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã kết chuyển phân bổ lũy kế</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {totalAllocated.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Đã tính {Math.round((totalAllocated / totalPrepaid) * 100)}% vào chi phí hoạt động</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Giá trị còn lại chờ phân bổ (TK 242)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalRemaining.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Số dư tài sản ngắn hạn &amp; dài hạn trên BCTC</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chi phí kết chuyển hàng tháng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalMonthlyAllocation.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Nợ TK 642 / Có TK 242 mỗi kỳ</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả CPTT' },
            { key: 'Chi phí thuê địa điểm', label: 'Thuê địa điểm', icon: <BankOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Bản quyền phần mềm', label: 'Bản quyền phần mềm', icon: <DatabaseOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Bảo hiểm tài sản', label: 'Bảo hiểm tài sản', icon: <SafetyCertificateOutlined style={{ color: '#10B981' }} /> },
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

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã CPTT, tên khoản chi, bộ phận..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất sổ chi phí trả trước ra Excel')}>
            Xuất Sổ CPTT
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                code: `CPTT-00${data.length + 1}`,
                category: 'Chi phí thuê địa điểm',
                department: 'Toàn công ty',
                allocationMonths: 12,
                startDate: new Date().toISOString().substring(0, 10),
                allocatedAmount: 0,
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Thêm mới CPTT
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm mới CPTT */}
      <Modal
        title="Thêm Mới Khoản Chi Phí Trả Trước"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã CPTT" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="category" label="Danh mục chi phí" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Chi phí thuê địa điểm', value: 'Chi phí thuê địa điểm' },
                  { label: 'Bản quyền phần mềm', value: 'Bản quyền phần mềm' },
                  { label: 'Bảo hiểm tài sản', value: 'Bảo hiểm tài sản' },
                  { label: 'Chi phí sửa chữa lớn', value: 'Chi phí sửa chữa lớn' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="name" label="Tên khoản chi phí trả trước chi tiết" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Thuê đường truyền Leased Line 1 năm" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="totalAmount" label="Tổng số tiền trả trước (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={5000000} />
            </Form.Item>
            <Form.Item name="allocationMonths" label="Số tháng phân bổ" rules={[{ required: true }]}>
              <Input type="number" min={1} max={60} />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="department" label="Bộ phận thụ hưởng chi phí" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Toàn công ty hoặc Phòng Ban Kỹ Thuật" />
            </Form.Item>
            <Form.Item name="startDate" label="Ngày bắt đầu phân bổ" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu chi phí trả trước
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Bảng Phân Kỳ Phân Bổ CPTT */}
      <Drawer
        title="Bảng Phân Kỳ Phân Bổ Chi Phí Trả Trước (TK 242)"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedExpense && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ CPTT: {selectedExpense.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedExpense.name}
                  </div>
                </div>
                <Tag color={selectedExpense.status === 'Đang phân bổ' ? 'processing' : 'default'}>
                  {selectedExpense.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedExpense.accountCode} · Bộ phận: <strong>{selectedExpense.department}</strong>
              </div>
            </div>

            {/* Allocation details */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Số Hạch Toán Phân Bổ:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tổng chi phí ban đầu:</span>
                  <strong style={{ color: '#1E40AF', fontSize: 15 }}>{selectedExpense.totalAmount.toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Đã kết chuyển phân bổ:</span>
                  <strong style={{ color: '#DC2626' }}>{selectedExpense.allocatedAmount.toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Giá trị còn lại chưa trích:</span>
                  <strong style={{ color: '#16A34A', fontSize: 15 }}>{selectedExpense.remainingAmount.toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Mức phân bổ mỗi tháng:</span>
                  <strong style={{ color: '#D97706' }}>{selectedExpense.monthlyAmount.toLocaleString('vi-VN')} ₫ / tháng</strong>
                </div>
              </div>

              {/* Progress bar */}
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#64748B', marginBottom: 4 }}>
                  <span>Tiến độ phân bổ</span>
                  <span>{Math.round((selectedExpense.allocatedAmount / selectedExpense.totalAmount) * 100)}%</span>
                </div>
                <Progress percent={Math.round((selectedExpense.allocatedAmount / selectedExpense.totalAmount) * 100)} strokeColor="#009688" />
              </div>
            </div>

            {/* Accounting debit/credit notes */}
            <div style={{ border: '1px solid #BFDBFE', borderRadius: 8, padding: 14, background: '#EFF6FF' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AuditOutlined /> Định Khoản Kế Toán Hàng Tháng:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12.5 }}>
                <div><strong>Nợ TK 642</strong> : <strong>{selectedExpense.monthlyAmount.toLocaleString('vi-VN')} ₫</strong></div>
                <div><strong>Có TK 242</strong> : <strong>{selectedExpense.monthlyAmount.toLocaleString('vi-VN')} ₫</strong></div>
              </div>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              onClick={() => message.success(`Đã xuất sổ chi tiết phân bổ TK 242 của ${selectedExpense.code}`)}
            >
              Xuất Sổ Chi Tiết TK 242
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

