import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckOutlined,
  CheckCircleOutlined,
  CloseOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  EyeOutlined,
  FileDoneOutlined,
  ReloadOutlined,
  SearchOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Drawer, Input, Spin, Tag, message } from '../../custom-ui';
import { EmployeeProposal, employeeProposalsApi } from '../../api/endpoints';

const formatAmount = (amount: number) => amount > 0 ? `${amount.toLocaleString('vi-VN')} đ` : 'Không yêu cầu';
const statusColor = (status: EmployeeProposal['status']) => status === 'Đã duyệt' ? 'success' : status === 'Từ chối' ? 'error' : 'warning';

export const ProposalsModule: React.FC = () => {
  const [proposals, setProposals] = useState<EmployeeProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | EmployeeProposal['status']>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedProposal, setSelectedProposal] = useState<EmployeeProposal | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await employeeProposalsApi.getAll();
      setProposals(response.data.data);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được kiến nghị nhân viên.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const openDetail = async (id: string) => {
    try {
      const response = await employeeProposalsApi.getOne(id);
      setSelectedProposal(response.data.proposal);
      setReviewNote(response.data.proposal.reviewNote || '');
      setDrawerOpen(true);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không tải được chi tiết kiến nghị.');
    }
  };

  const review = async (status: 'Đã duyệt' | 'Từ chối') => {
    if (!selectedProposal) return;
    setReviewing(true);
    try {
      const response = await employeeProposalsApi.review(selectedProposal.key, status, reviewNote);
      setSelectedProposal(response.data.proposal);
      setProposals((current) => current.map((item) => item.key === response.data.proposal.key ? response.data.proposal : item));
      message.success(status === 'Đã duyệt' ? 'Đã tiếp nhận và phê duyệt kiến nghị.' : 'Đã từ chối kiến nghị và gửi phản hồi cho nhân viên.');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể cập nhật kết quả tiếp nhận.');
    } finally {
      setReviewing(false);
    }
  };

  const summary = useMemo(() => ({
    total: proposals.length,
    pending: proposals.filter((item) => item.status === 'Chờ duyệt').length,
    approved: proposals.filter((item) => item.status === 'Đã duyệt').length,
    rejected: proposals.filter((item) => item.status === 'Từ chối').length,
  }), [proposals]);

  const filteredProposals = proposals.filter((item) => {
    const matchesSearch = [item.code, item.title, item.type, item.employeeName, item.employeeCode]
      .some((value) => value.toLowerCase().includes(searchText.toLowerCase()));
    return matchesSearch && (statusFilter === 'all' || item.status === statusFilter);
  });

  const columns = [
    { title: 'Mã hồ sơ', dataIndex: 'code', key: 'code', width: 165, render: (code: string) => <span style={{ color: '#009688', fontWeight: 800, fontFamily: 'monospace' }}>{code}</span> },
    {
      title: 'Nội dung kiến nghị', key: 'title',
      render: (_: unknown, item: EmployeeProposal) => <div><div style={{ color: '#0F172A', fontWeight: 700 }}>{item.title}</div><div style={{ color: '#64748B', fontSize: 12, marginTop: 3 }}>{item.type}</div></div>,
    },
    {
      title: 'Nhân viên gửi', key: 'employee', width: 180,
      render: (_: unknown, item: EmployeeProposal) => <div><div style={{ fontWeight: 600, display: 'flex', gap: 5, alignItems: 'center' }}><UserOutlined style={{ color: '#009688' }} />{item.employeeName}</div><div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{item.employeeCode}</div></div>,
    },
    { title: 'Dự toán', dataIndex: 'amount', key: 'amount', width: 135, render: (amount: number) => <strong style={{ color: '#16A34A', fontSize: 12.5 }}>{formatAmount(amount)}</strong> },
    { title: 'Ngày gửi', dataIndex: 'date', key: 'date', width: 112, render: (date: string) => <span style={{ fontSize: 12.5, color: '#64748B' }}>{date}</span> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 125, render: (status: EmployeeProposal['status']) => <Tag color={statusColor(status)}>{status}</Tag> },
    { title: 'Tiếp nhận', key: 'action', width: 115, render: (_: unknown, item: EmployeeProposal) => <Button size="small" icon={<EyeOutlined />} onClick={() => void openDetail(item.key)}>{item.status === 'Chờ duyệt' ? 'Tiếp nhận' : 'Xem'}</Button> },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
        {[
          ['Tổng kiến nghị nhận được', `${summary.total} hồ sơ`, '#009688'],
          ['Chờ tiếp nhận', `${summary.pending} hồ sơ`, '#D97706'],
          ['Đã phê duyệt', `${summary.approved} hồ sơ`, '#16A34A'],
          ['Đã từ chối', `${summary.rejected} hồ sơ`, '#DC2626'],
        ].map(([label, value, color]) => <div key={label} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}><div style={{ fontSize: 12.5, color: '#64748B' }}>{label}</div><div style={{ fontSize: 23, color, fontWeight: 800, marginTop: 5 }}>{value}</div></div>)}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['all', 'Tất cả'], ['Chờ duyệt', 'Chờ tiếp nhận'], ['Đã duyệt', 'Đã duyệt'], ['Từ chối', 'Từ chối']].map(([key, label]) => <Button key={key} size="small" onClick={() => setStatusFilter(key as typeof statusFilter)} style={{ background: statusFilter === key ? '#E0F2F1' : '#FFFFFF', borderColor: statusFilter === key ? '#009688' : '#CBD5E1', color: statusFilter === key ? '#00796B' : '#475569' }}>{label}</Button>)}
        </div>
        <div style={{ display: 'flex', gap: 8 }}><Input prefix={<SearchOutlined style={{ color: '#94A3B8' }} />} value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Mã, nhân viên, nội dung..." allowClear style={{ width: 260 }} /><Button icon={<ReloadOutlined />} onClick={() => void loadData()}>Làm mới</Button></div>
      </div>

      <Spin spinning={loading} tip="Đang tải kiến nghị..."><div className="transparent-table-card"><KTable dataSource={filteredProposals} columns={columns} rowKey="key" pagination={{ pageSize: 8 }} /></div></Spin>

      <Drawer title="Tiếp nhận kiến nghị nhân viên" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={600}>
        {selectedProposal && <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 16, background: '#F8FAFC' }}><div style={{ color: '#009688', fontWeight: 800, fontSize: 12 }}>{selectedProposal.code}</div><div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{selectedProposal.title}</div><div style={{ marginTop: 7, color: '#475569', fontSize: 12.5 }}>{selectedProposal.employeeName} · {selectedProposal.employeeCode} · Gửi ngày {selectedProposal.date}</div></div>
          <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><strong>{selectedProposal.type}</strong><strong style={{ color: '#16A34A' }}>{formatAmount(selectedProposal.amount)}</strong></div><div style={{ color: '#64748B', fontSize: 12, marginBottom: 4 }}>Nội dung nhân viên gửi</div><div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{selectedProposal.content}</div></div>
          {selectedProposal.status === 'Chờ duyệt' ? <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}><div style={{ fontWeight: 700, marginBottom: 8 }}><FileDoneOutlined /> Phản hồi tiếp nhận</div><Input.TextArea rows={4} value={reviewNote} onChange={(event: any) => setReviewNote(event.target.value)} placeholder="Nêu quyết định, điều kiện thực hiện hoặc lý do từ chối..." /><div style={{ display: 'flex', gap: 8, marginTop: 12 }}><Button type="primary" loading={reviewing} icon={<CheckOutlined />} onClick={() => void review('Đã duyệt')} style={{ flex: 1, background: '#16A34A', borderColor: '#16A34A' }}>Phê duyệt</Button><Button danger loading={reviewing} icon={<CloseOutlined />} onClick={() => void review('Từ chối')} style={{ flex: 1 }}>Từ chối</Button></div></div> : <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><strong>Kết quả đã gửi</strong><Tag color={statusColor(selectedProposal.status)}>{selectedProposal.status}</Tag></div><div style={{ marginTop: 10, fontSize: 13 }}><span style={{ color: '#64748B' }}>Người xử lý: </span>{selectedProposal.approver}</div>{selectedProposal.reviewNote && <div style={{ marginTop: 10, background: '#F8FAFC', padding: 10, borderRadius: 6, whiteSpace: 'pre-wrap' }}>{selectedProposal.reviewNote}</div>}</div>}
        </div>}
      </Drawer>
    </div>
  );
};
