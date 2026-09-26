import React, { useEffect, useMemo, useState } from 'react';
import {
  BulbOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  EyeOutlined,
  FileTextOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Drawer, Form, Input, Modal, Select, Spin, Tag, message } from '../../custom-ui';
import { EmployeeProposal, employeeProposalsApi } from '../../api/endpoints';

const formatAmount = (amount: number) => amount > 0 ? `${amount.toLocaleString('vi-VN')} đ` : 'Không yêu cầu';
const statusColor = (status: EmployeeProposal['status']) => status === 'Đã duyệt' ? 'success' : status === 'Từ chối' ? 'error' : 'warning';

export const EmployeeProposalsModule: React.FC = () => {
  const [proposals, setProposals] = useState<EmployeeProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<EmployeeProposal | null>(null);
  const [form] = Form.useForm();

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await employeeProposalsApi.getAll();
      setProposals(response.data.data);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được danh sách kiến nghị.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreate = async (values: any) => {
    try {
      await employeeProposalsApi.create({
        title: values.title,
        type: values.type,
        amount: Number(values.amount) || 0,
        content: values.content,
      });
      form.resetFields();
      setModalOpen(false);
      message.success('Đã gửi kiến nghị đến bộ phận quản trị.');
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể gửi kiến nghị.');
    }
  };

  const openDetail = async (id: string) => {
    try {
      const response = await employeeProposalsApi.getOne(id);
      setSelectedProposal(response.data.proposal);
      setDrawerOpen(true);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được chi tiết kiến nghị.');
    }
  };

  const summary = useMemo(() => ({
    total: proposals.length,
    pending: proposals.filter((item) => item.status === 'Chờ duyệt').length,
    approved: proposals.filter((item) => item.status === 'Đã duyệt').length,
    rejected: proposals.filter((item) => item.status === 'Từ chối').length,
  }), [proposals]);

  const filteredProposals = proposals.filter((item) => {
    const matchesSearch = [item.code, item.title, item.type].some((value) => value.toLowerCase().includes(searchText.toLowerCase()));
    if (!matchesSearch) return false;
    if (filterTab === 'pending') return item.status === 'Chờ duyệt';
    if (filterTab === 'approved') return item.status === 'Đã duyệt';
    if (filterTab === 'rejected') return item.status === 'Từ chối';
    return true;
  });

  const columns = [
    {
      title: 'Mã kiến nghị', dataIndex: 'code', key: 'code', width: 165,
      render: (code: string) => <span style={{ fontWeight: 800, color: '#009688', fontFamily: 'monospace' }}>{code}</span>,
    },
    {
      title: 'Nội dung kiến nghị', key: 'title',
      render: (_: unknown, item: EmployeeProposal) => <div><div style={{ fontWeight: 700, color: '#0F172A', display: 'flex', gap: 6, alignItems: 'center' }}><BulbOutlined style={{ color: '#EAB308' }} />{item.title}</div><div style={{ marginTop: 3, color: '#64748B', fontSize: 12 }}>{item.type}</div></div>,
    },
    { title: 'Dự toán', dataIndex: 'amount', key: 'amount', width: 135, render: (amount: number) => <strong style={{ color: '#16A34A', fontSize: 12.5 }}>{formatAmount(amount)}</strong> },
    { title: 'Ngày gửi', dataIndex: 'date', key: 'date', width: 115, render: (date: string) => <span style={{ color: '#64748B', fontSize: 12.5 }}>{date}</span> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 125, render: (status: EmployeeProposal['status']) => <Tag color={statusColor(status)}>{status}</Tag> },
    { title: 'Thao tác', key: 'actions', width: 110, render: (_: unknown, item: EmployeeProposal) => <Button size="small" icon={<EyeOutlined />} onClick={() => void openDetail(item.key)}>Chi tiết</Button> },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
        {[
          ['Tổng kiến nghị', `${summary.total} hồ sơ`, '#009688'],
          ['Chờ tiếp nhận', `${summary.pending} hồ sơ`, '#D97706'],
          ['Đã được duyệt', `${summary.approved} hồ sơ`, '#16A34A'],
          ['Không được duyệt', `${summary.rejected} hồ sơ`, '#DC2626'],
        ].map(([label, value, color]) => <div key={label} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}><div style={{ color: '#64748B', fontSize: 12.5 }}>{label}</div><div style={{ color, fontSize: 23, fontWeight: 800, marginTop: 5 }}>{value}</div></div>)}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['all', 'Tất cả'], ['pending', 'Chờ tiếp nhận'], ['approved', 'Đã duyệt'], ['rejected', 'Từ chối']].map(([key, label]) => <Button key={key} size="small" onClick={() => setFilterTab(key as typeof filterTab)} style={{ background: filterTab === key ? '#E0F2F1' : '#FFFFFF', borderColor: filterTab === key ? '#009688' : '#CBD5E1', color: filterTab === key ? '#00796B' : '#475569' }}>{label}</Button>)}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Input prefix={<SearchOutlined style={{ color: '#94A3B8' }} />} value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Mã hoặc nội dung kiến nghị..." allowClear style={{ width: 250 }} />
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()}>Làm mới</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setModalOpen(true); }} style={{ background: '#009688', borderColor: '#009688' }}>Gửi kiến nghị</Button>
        </div>
      </div>

      <Spin spinning={loading} tip="Đang tải kiến nghị..."><div className="transparent-table-card"><KTable dataSource={filteredProposals} columns={columns} rowKey="key" pagination={{ pageSize: 8 }} /></div></Spin>

      <Modal title="Gửi kiến nghị mới" open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={580}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <Form.Item name="title" label="Tiêu đề kiến nghị" rules={[{ required: true }]}><Input placeholder="Tóm tắt ngắn gọn nội dung cần đề xuất" /></Form.Item>
          <Form.Item name="type" label="Hạng mục" rules={[{ required: true }]}><Select options={[
            { label: 'Trang thiết bị & cơ sở vật chất', value: 'Trang thiết bị & cơ sở vật chất' },
            { label: 'Chi phí & công tác', value: 'Chi phí & công tác' },
            { label: 'Đào tạo & phát triển', value: 'Đào tạo & phát triển' },
            { label: 'Cải tiến quy trình', value: 'Cải tiến quy trình' },
            { label: 'Phúc lợi & môi trường làm việc', value: 'Phúc lợi & môi trường làm việc' },
          ]} /></Form.Item>
          <Form.Item name="amount" label="Dự toán kinh phí (VNĐ)"><Input type="number" min={0} placeholder="Để trống nếu không phát sinh kinh phí" /></Form.Item>
          <Form.Item name="content" label="Nội dung và hiệu quả mong đợi" rules={[{ required: true }]}><Input.TextArea rows={5} placeholder="Mô tả rõ hiện trạng, đề xuất và lợi ích mang lại..." /></Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button onClick={() => setModalOpen(false)}>Hủy</Button><Button type="primary" htmlType="submit" style={{ background: '#009688', borderColor: '#009688' }}>Gửi kiến nghị</Button></div>
        </Form>
      </Modal>

      <Drawer title="Chi tiết kiến nghị" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={560}>
        {selectedProposal && <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
          <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}><div style={{ color: '#009688', fontWeight: 800, fontSize: 12 }}>{selectedProposal.code}</div><div style={{ color: '#0F172A', fontSize: 17, fontWeight: 800, marginTop: 4 }}>{selectedProposal.title}</div><div style={{ color: '#64748B', fontSize: 12.5, marginTop: 6 }}>{selectedProposal.type} · Gửi ngày {selectedProposal.date}</div></div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><span>Dự toán</span><strong style={{ color: '#16A34A' }}>{formatAmount(selectedProposal.amount)}</strong></div><div style={{ color: '#64748B', fontSize: 12, marginBottom: 4 }}>Nội dung</div><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{selectedProposal.content}</div></div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>Kết quả tiếp nhận</strong><Tag color={statusColor(selectedProposal.status)}>{selectedProposal.status}</Tag></div>{selectedProposal.approver && <div style={{ fontSize: 13, marginTop: 10 }}><span style={{ color: '#64748B' }}>Người xử lý: </span>{selectedProposal.approver}</div>}{selectedProposal.reviewNote && <div style={{ marginTop: 10, background: '#F8FAFC', borderRadius: 6, padding: 10, whiteSpace: 'pre-wrap' }}>{selectedProposal.reviewNote}</div>}{selectedProposal.status === 'Chờ duyệt' && <div style={{ marginTop: 10, color: '#D97706', fontSize: 13 }}><ClockCircleOutlined /> Kiến nghị đã được gửi và đang chờ quản trị tiếp nhận.</div>}</div>
        </div>}
      </Drawer>
    </div>
  );
};
