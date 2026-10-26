import React, { useState } from 'react';
import {
  useLocation } from 'react-router-dom';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  PieChartOutlined,
  CheckCircleOutlined,
  AlertOutlined,
  BarChartOutlined,
  FundProjectionScreenOutlined,
  SlidersOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Card, Tag, Progress } from '../../custom-ui';

import { useEffect } from 'react';
import { collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';

interface BudgetRecord {
  key: string;
  code: string;
  department: string;
  fiscalYear: string;
  allocatedBudget: number;
  actualSpent: number;
  remainingBudget: number;
  utilizationRate: number;
  status: 'Trong hạn mức' | 'Cảnh báo hạn mức' | 'Vượt ngân sách';
}

export const BudgetModule: React.FC = () => {
  const location = useLocation();
  const currentPath = location.pathname.replace(/^\/admin/, '');

  const isCharts = currentPath === '/finance/budget/charts';
  const isPlans = currentPath === '/finance/budget/plans';

  const [data, setData] = useState<BudgetRecord[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const loadData = async () => {
    try {
      const [res, orgUnits] = await Promise.all([
        collectionsApi.get<BudgetRecord>('finance_budgets', { limit: 500 }),
        dataService.fetchOrgUnitsList(),
      ]);
      const list = res.data?.data || [];
      setData(list.map((item: any) => ({ ...item, key: item.id || item.key })));
      setDeptOptions(orgUnits.map((u) => ({ label: u, value: u })));
    } catch {
      message.error('Không thể tải ngân sách. Vui lòng thử lại.');
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const totalAllocated = data.reduce((sum, item) => sum + item.allocatedBudget, 0);
  const totalSpent = data.reduce((sum, item) => sum + item.actualSpent, 0);
  const totalRemaining = totalAllocated - totalSpent;

  const handleCreate = async (values: any) => {
    const alloc = Number(values.allocatedBudget);
    const spent = Number(values.actualSpent ?? 0);
    if (!Number.isFinite(alloc) || alloc <= 0 || !Number.isFinite(spent) || spent < 0) {
      message.error('Ngân sách phải lớn hơn 0; số tiền đã giải ngân không được âm.');
      return;
    }
    const rem = alloc - spent;
    const rate = Math.round((spent / alloc) * 1000) / 10;
    const id = `budget-${Date.now()}`;
    const newBud: BudgetRecord = {
      ...values,
      key: id,
      allocatedBudget: alloc,
      actualSpent: spent,
      remainingBudget: rem,
      utilizationRate: rate,
      status: rate > 100 ? 'Vượt ngân sách' : rate > 80 ? 'Cảnh báo hạn mức' : 'Trong hạn mức',
    };
    try {
      await collectionsApi.create('finance_budgets', newBud, id);
      message.success(`Đã khởi tạo hạn mức ngân sách mới cho ${values.department}`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tạo ngân sách.');
    }
  };

  const filteredData = data.filter(
    (item) =>
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase())
  );

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng ngân sách đã phê duyệt</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalAllocated.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thực tế đã giải ngân</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalSpent.toLocaleString('vi-VN')} ₫
          </div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hạn mức ngân sách còn lại</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalRemaining.toLocaleString('vi-VN')} ₫
          </div>
        </div>
      </div>

      {/* VIEW: CHARTS (Biểu đồ phân tích sử dụng ngân sách) */}
      {isCharts && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16 }}>
            {/* Chart 1: Tiến độ sử dụng ngân sách theo phòng ban */}
            <Card title="Tiến Độ Giải Ngân Ngân Sách Theo Phòng Ban" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {data.map((item, idx) => (
                  <div key={idx}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                      <strong>{item.department}</strong>
                      <span style={{ fontWeight: 700, color: item.utilizationRate > 85 ? '#DC2626' : '#009688' }}>
                        {item.actualSpent.toLocaleString('vi-VN')} ₫ / {item.allocatedBudget.toLocaleString('vi-VN')} ₫ ({item.utilizationRate}%)
                      </span>
                    </div>
                    <Progress
                      percent={item.utilizationRate}
                      status={item.utilizationRate > 85 ? 'exception' : 'active'}
                      strokeColor={item.utilizationRate > 85 ? '#DC2626' : '#009688'}
                    />
                  </div>
                ))}
              </div>
            </Card>

            {/* Chart 2: Tỷ trọng phân bổ ngân sách */}
            <Card title="Tỷ Trọng Phân Bổ Ngân Sách Toàn Doanh Nghiệp" style={{ borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Array.from(new Set(data.map(item => item.department))).map((name, idx) => {
                  const amount = data.filter(item => item.department === name).reduce((sum, item) => sum + item.allocatedBudget, 0);
                  const dept = { name, amount: `${amount.toLocaleString('vi-VN')} ₫`, share: totalAllocated > 0 ? Math.round(amount / totalAllocated * 1000) / 10 : 0, color: ['#009688', '#2563EB', '#F59E0B', '#8B5CF6'][idx % 4] };
                  return (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#F8FAFC', padding: '10px 14px', borderRadius: 6 }}>
                    <div>
                      <strong>{dept.name}</strong>
                      <div style={{ fontSize: 11.5, color: '#64748B' }}>Dự toán: {dept.amount}</div>
                    </div>
                    <strong style={{ color: dept.color, fontSize: 14 }}>{dept.share}%</strong>
                  </div>
                ); })}
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* VIEW: PLANS (Kế hoạch dự toán chi tiết) */}
      {isPlans && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Bảng Kế Hoạch &amp; Hạng Mục Dự Toán Chi Phí Chi Tiết</h3>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Tạo dự toán mới
            </Button>
          </div>
          <div className="transparent-table-card">
            <KTable
              dataSource={data.map(item => ({ ...item, category: item.code, dept: item.department, budget: item.allocatedBudget, spent: item.actualSpent, remain: item.remainingBudget }))}
              columns={[
                { title: 'Hạng mục chi phí dự toán', dataIndex: 'category', key: 'category', render: (c: string) => <strong>{c}</strong> },
                { title: 'Đơn vị thực hiện', dataIndex: 'dept', key: 'dept', render: (d: string) => <Tag color="blue">{d}</Tag> },
                { title: 'Ngân sách duyệt', dataIndex: 'budget', key: 'budget', render: (v: number) => `${v.toLocaleString('vi-VN')} ₫` },
                { title: 'Đã giải ngân', dataIndex: 'spent', key: 'spent', render: (v: number) => <span style={{ color: '#0F172A', fontWeight: 600 }}>{v.toLocaleString('vi-VN')} ₫</span> },
                { title: 'Hạn mức còn lại', dataIndex: 'remain', key: 'remain', render: (v: number) => <strong style={{ color: '#16A34A' }}>{v.toLocaleString('vi-VN')} ₫</strong> },
                { title: 'Cấp duyệt', dataIndex: 'approver', key: 'approver' },
                { title: 'Trạng thái', dataIndex: 'status', key: 'status', render: (s: string) => <Tag icon={<CheckOutlined />} color="success">{s}</Tag> },
              ]}
            />
          </div>
        </div>
      )}

      {/* VIEW: DEFAULT (Danh sách ngân sách phòng ban) */}
      {!isCharts && !isPlans && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#bbb' }} />}
              placeholder="Tìm theo mã ngân sách, phòng ban..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              style={{ width: 340, borderRadius: 6 }}
              allowClear
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <Button icon={<DownloadOutlined />} onClick={() => downloadFile('Bao_cao_ngan_sach.xlsx', generateValidXlsxBlob([
                ['Mã ngân sách', 'Phòng ban', 'Kỳ áp dụng', 'Ngân sách', 'Đã giải ngân', 'Còn lại', 'Tỷ lệ', 'Trạng thái'],
                ...filteredData.map(item => [item.code, item.department, item.fiscalYear, item.allocatedBudget, item.actualSpent, item.remainingBudget, item.utilizationRate, item.status]),
              ]))}>
                Xuất Báo Cáo
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
                Phân bổ ngân sách mới
              </Button>
            </div>
          </div>

          <div className="transparent-table-card">
            <KTable
              dataSource={filteredData}
              columns={[
                {
                  title: 'Mã ngân sách',
                  dataIndex: 'code',
                  key: 'code',
                  render: (code: string) => <strong style={{ color: '#009688' }}>{code}</strong>,
                },
                {
                  title: 'Phòng ban / Đơn vị thụ hưởng',
                  dataIndex: 'department',
                  key: 'department',
                  render: (dept: string) => <span style={{ fontWeight: 600, color: '#1E293B' }}>{dept}</span>,
                },
                {
                  title: 'Ngân sách được duyệt',
                  dataIndex: 'allocatedBudget',
                  key: 'allocatedBudget',
                  render: (val: number) => <strong style={{ color: '#2563EB' }}>{val.toLocaleString('vi-VN')} ₫</strong>,
                },
                {
                  title: 'Thực chi đã dùng',
                  dataIndex: 'actualSpent',
                  key: 'actualSpent',
                  render: (val: number) => `${val.toLocaleString('vi-VN')} ₫`,
                },
                {
                  title: 'Còn lại',
                  dataIndex: 'remainingBudget',
                  key: 'remainingBudget',
                  render: (val: number) => <strong style={{ color: '#16A34A' }}>{val.toLocaleString('vi-VN')} ₫</strong>,
                },
                {
                  title: 'Tỷ lệ giải ngân',
                  key: 'rate',
                  render: (_: any, r: BudgetRecord) => (
                    <div style={{ width: 140 }}>
                      <div style={{ fontSize: 11.5, marginBottom: 2, textAlign: 'right', fontWeight: 600 }}>{r.utilizationRate}%</div>
                      <Progress percent={r.utilizationRate} showInfo={false} strokeColor={r.utilizationRate > 85 ? '#DC2626' : '#009688'} size="small" />
                    </div>
                  ),
                },
                {
                  title: 'Trạng thái',
                  dataIndex: 'status',
                  key: 'status',
                  render: (status: string) => (
                    <Tag color={status === 'Trong hạn mức' ? 'success' : status === 'Cảnh báo hạn mức' ? 'warning' : 'error'}>
                      {status}
                    </Tag>
                  ),
                },
              ]}
              pagination={{ pageSize: 10 }}
            />
          </div>
        </div>
      )}

      {/* Modal Add Budget */}
      <Modal
        title="Phân bổ ngân sách phòng ban mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={500}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã ngân sách" initialValue={`NS-2026-0${data.length + 1}`} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="fiscalYear" label="Kỳ áp dụng" initialValue="Năm 2026" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </div>
          <Form.Item name="department" label="Phòng ban thụ hưởng" rules={[{ required: true, message: 'Chọn phòng ban' }]}>
            <Select
              options={deptOptions.length > 0 ? deptOptions : [
                { label: 'Ban Giám Đốc', value: 'Ban Giám Đốc' },
              ]}
              placeholder="Chọn phòng ban thụ hưởng..."
            />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="allocatedBudget" label="Ngân sách phê duyệt (VNĐ)" initialValue={500000000} rules={[{ required: true }]}>
              <Input type="number" min={0} step={10000000} />
            </Form.Item>
            <Form.Item name="actualSpent" label="Đã giải ngân ban đầu" initialValue={0}>
              <Input type="number" min={0} step={10000000} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận phân bổ
            </Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};
