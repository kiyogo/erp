import React, { useEffect, useRef, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  ReloadOutlined,
  CustomerServiceOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  PrinterOutlined,
  EyeOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer } from '../../custom-ui';
import { dataService, type HelpdeskTicket } from '../../services/dataService';
import { useAuth } from '../../context/AuthContext';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import {
  canTransitionHelpdeskTicket,
  formatHelpdeskDuration,
  formatHelpdeskTimestamp,
  helpdeskExportRows,
  helpdeskMetrics,
  helpdeskMinutesBetween,
} from './ticketRules';

type TicketFilter = 'all' | 'Khẩn cấp' | 'Cao' | 'Mới tạo' | 'Đang xử lý' | 'Đã hoàn thành';

const PRIORITIES = ['Khẩn cấp', 'Cao', 'Trung bình', 'Thấp'] as const;

export const TicketsModule: React.FC = () => {
  const { user } = useAuth();
  const mounted = useRef(false);
  const [data, setData] = useState<HelpdeskTicket[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState<TicketFilter>('all');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<HelpdeskTicket | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [tickets, units] = await Promise.all([
        dataService.refreshGenericData('tickets'),
        dataService.refreshGenericData('business_org_units'),
      ]);
      if (!mounted.current) return;
      setData(Array.isArray(tickets) ? tickets : []);
      setDepartmentOptions(Array.from(new Set((Array.isArray(units) ? units : [])
        .filter((unit: any) => unit?.status !== 'Tạm ngưng' && unit?.isActive !== false && unit?.name)
        .map((unit: any) => String(unit.name).trim())
        .filter(Boolean)))
        .sort((a, b) => a.localeCompare(b, 'vi'))
        .map((name) => ({ label: name, value: name })));
    } catch (error: any) {
      if (mounted.current) message.error(error?.response?.data?.message || 'Không tải được ticket hoặc danh sách phòng ban.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = dataService.subscribe(() => {
      if (mounted.current) setData(dataService.getGenericData('tickets'));
    });
    void loadData();
    return () => { mounted.current = false; unsubscribe(); };
  }, []);

  const metrics = helpdeskMetrics(data);
  const filteredData = data.filter((ticket) => {
    const matchesTab = filterTab === 'all'
      || (filterTab === 'Khẩn cấp' && ticket.priority === 'Khẩn cấp')
      || (filterTab === 'Cao' && ticket.priority === 'Cao')
      || (filterTab === 'Mới tạo' && ticket.status === 'Mới tạo')
      || (filterTab === 'Đang xử lý' && (ticket.status === 'Đang xử lý' || ticket.status === 'Mới tạo'))
      || (filterTab === 'Đã hoàn thành' && ticket.status === 'Đã hoàn thành');
    const query = searchText.trim().toLocaleLowerCase();
    const matchesSearch = !query || [ticket.code, ticket.title, ticket.description, ticket.requester, ticket.department]
      .some((value) => String(value || '').toLocaleLowerCase().includes(query));
    return matchesTab && matchesSearch;
  });

  const handleCreate = async (values: any) => {
    const code = String(values.code || '').trim().toLocaleUpperCase();
    const title = String(values.title || '').trim();
    const description = String(values.description || '').trim();
    const department = String(values.department || '').trim();
    const requester = String(user?.name || '').trim();
    if (!code || !title || !description || !department || !requester || !PRIORITIES.includes(values.priority)) {
      message.error('Vui lòng nhập đủ tiêu đề, mô tả, mức độ, phòng ban và tài khoản gửi.');
      return;
    }
    if (!departmentOptions.some((option) => option.value === department)) {
      message.error('Phòng ban đã chọn không còn hoạt động. Hãy tải lại danh mục.');
      return;
    }
    if (data.some((ticket) => ticket.code.trim().toLocaleLowerCase() === code.toLocaleLowerCase())) {
      message.error('Mã ticket đã tồn tại. Vui lòng tạo mã khác.');
      return;
    }

    const now = new Date().toISOString();
    const record = {
      key: code,
      code,
      title,
      description,
      requester,
      requesterId: user?.id || '',
      department,
      priority: values.priority,
      status: 'Mới tạo' as const,
      createdDate: now,
      createdBy: requester,
      createdById: user?.id || '',
      history: [{ action: 'Tạo ticket', actor: requester, actorId: user?.id || '', at: now }],
    };
    setSaving(true);
    try {
      const saved = await dataService.createGenericRecord('tickets', record) as HelpdeskTicket;
      setModalOpen(false);
      form.resetFields();
      message.success(`Đã ghi nhận ticket ${saved.code}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu ticket. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (ticket: HelpdeskTicket, nextStatus: 'Đang xử lý' | 'Đã hoàn thành') => {
    if (saving) return;
    if (!canTransitionHelpdeskTicket(ticket.status, nextStatus)) {
      message.error('Trạng thái ticket vừa thay đổi. Hãy tải lại dữ liệu trước khi tiếp tục.');
      return;
    }
    setSaving(true);
    try {
      const saved = await dataService.transitionTicket(ticket.key, nextStatus);
      setSelectedTicket(saved);
      message.success(`Đã lưu trạng thái ticket ${saved.code}: ${saved.status}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể cập nhật ticket. Vui lòng tải lại dữ liệu.');
    } finally {
      setSaving(false);
    }
  };

  const exportTickets = () => {
    if (!filteredData.length) {
      message.info('Không có ticket phù hợp để xuất.');
      return;
    }
    downloadFile('Danh_sach_ticket.xlsx', generateValidXlsxBlob(helpdeskExportRows(filteredData)));
  };

  const printTicket = (ticket: HelpdeskTicket) => downloadFile(
    `${ticket.code.replace(/[^a-z0-9_-]/gi, '_')}_phieu_ho_tro.pdf`,
    generateValidPdfBlob('PHIEU YEU CAU HO TRO', `${ticket.code} | ${ticket.title}`, [
      `Nguoi gui: ${ticket.requester}`,
      `Phong ban: ${ticket.department}`,
      `Muc do uu tien: ${ticket.priority}`,
      `Trang thai: ${ticket.status}`,
      `Ngay tao: ${formatHelpdeskTimestamp(ticket.createdDate)}`,
      `Thoi diem tiep nhan: ${formatHelpdeskTimestamp(ticket.acceptedAt, 'Chua tiep nhan')}`,
      `Thoi diem hoan tat: ${formatHelpdeskTimestamp(ticket.resolvedAt, 'Chua hoan tat')}`,
      `Phan hoi: ${formatHelpdeskDuration(helpdeskMinutesBetween(ticket.createdDate, ticket.acceptedAt))}`,
      `Thoi gian xu ly: ${formatHelpdeskDuration(helpdeskMinutesBetween(ticket.createdDate, ticket.resolvedAt))}`,
      `Mo ta: ${ticket.description || 'Chua ghi nhan'}`,
      'Lich su cap nhat:', ...(ticket.history || []).map((entry) => `${formatHelpdeskTimestamp(entry.at)} | ${entry.actor} | ${entry.action}`),
    ]),
  );

  const columns = [
    {
      title: 'Mã ticket và thời gian',
      key: 'code',
      render: (_: any, ticket: HelpdeskTicket) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <CustomerServiceOutlined /> {ticket.code}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{formatHelpdeskTimestamp(ticket.createdDate)}</div>
        </div>
      ),
    },
    {
      title: 'Tiêu đề yêu cầu hỗ trợ',
      key: 'title',
      render: (_: any, ticket: HelpdeskTicket) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A', fontSize: 13 }}>{ticket.title}</div>
          {ticket.description && <div style={{ fontSize: 11.5, color: '#64748B' }}>{ticket.description}</div>}
        </div>
      ),
    },
    {
      title: 'Người gửi và phòng ban',
      key: 'requester',
      render: (_: any, ticket: HelpdeskTicket) => (
        <div>
          <div style={{ fontWeight: 600, color: '#0F172A' }}>{ticket.requester}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB' }}>{ticket.department}</div>
        </div>
      ),
    },
    {
      title: 'Mức độ ưu tiên',
      dataIndex: 'priority',
      key: 'priority',
      width: 140,
      render: (priority: string) => {
        const color = priority === 'Khẩn cấp' ? 'error' : priority === 'Cao' ? 'warning' : priority === 'Thấp' ? 'default' : 'processing';
        return <Tag color={color}>{priority}</Tag>;
      },
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string) => {
        const color = status === 'Đã hoàn thành' ? 'success' : status === 'Đang xử lý' ? 'processing' : 'warning';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 180,
      render: (_: any, ticket: HelpdeskTicket) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => { setSelectedTicket(ticket); setDrawerOpen(true); }}>
            Chi tiết
          </Button>
          {['Mới tạo', 'Đang xử lý'].includes(ticket.status) && (
            <Button
              size="small"
              type="primary"
              disabled={saving}
              loading={saving && selectedTicket?.key === ticket.key}
              onClick={() => void handleStatusChange(ticket, ticket.status === 'Mới tạo' ? 'Đang xử lý' : 'Đã hoàn thành')}
              style={{ backgroundColor: ticket.status === 'Mới tạo' ? '#009688' : '#10B981', borderColor: ticket.status === 'Mới tạo' ? '#009688' : '#10B981' }}
            >
              {ticket.status === 'Mới tạo' ? 'Tiếp nhận' : 'Hoàn tất'}
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số ticket tiếp nhận</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>{metrics.total} ticket</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Dữ liệu từ phiếu đã lưu</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Ticket đang xử lý</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>{metrics.openCount} yêu cầu</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{metrics.completedCount} yêu cầu đã hoàn tất</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thời gian phản hồi bình quân đã ghi nhận</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>{formatHelpdeskDuration(metrics.averageResponseMinutes)}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Tính theo thời điểm tiếp nhận đã lưu</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Ticket khẩn cấp</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: metrics.urgentCount > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>{metrics.urgentCount} yêu cầu</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Thời gian xử lý bình quân: {formatHelpdeskDuration(metrics.averageResolutionMinutes)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all' as const, label: 'Tất cả ticket' },
            { key: 'Khẩn cấp' as const, label: 'Khẩn cấp', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
            { key: 'Cao' as const, label: 'Mức cao', icon: <ExclamationCircleOutlined style={{ color: '#F97316' }} /> },
            { key: 'Mới tạo' as const, label: 'Mới tạo', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đang xử lý' as const, label: 'Đang xử lý', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đã hoàn thành' as const, label: 'Đã hoàn tất', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setFilterTab(tab.key)}
              style={{
                backgroundColor: filterTab === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: filterTab === tab.key ? '#009688' : '#CBD5E1',
                color: filterTab === tab.key ? '#00796B' : '#475569',
                fontWeight: filterTab === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã, tiêu đề, người gửi..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            style={{ width: 280 }}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={() => void loadData()} disabled={loading || saving} loading={loading}>
            Tải lại
          </Button>
          <Button icon={<DownloadOutlined />} onClick={exportTickets} disabled={loading || filteredData.length === 0}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            disabled={loading || saving}
            onClick={() => {
              if (!departmentOptions.length) {
                message.error('Chưa có phòng ban đang hoạt động trong danh mục.');
                return;
              }
              form.resetFields();
              form.setFieldsValue({
                code: `TK-${new Date().getFullYear()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
                priority: 'Trung bình',
                department: departmentOptions[0].value,
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tạo Ticket mới
          </Button>
        </div>
      </div>

      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} loading={loading} />
      </div>

      <Modal
        title="Mở ticket yêu cầu hỗ trợ IT"
        open={modalOpen}
        onCancel={() => { if (!saving) setModalOpen(false); }}
        footer={null}
        width={580}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="code" label="Mã ticket" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập mã ticket.' }]}>
              <Input maxLength={80} />
            </Form.Item>
            <Form.Item name="priority" label="Mức độ ưu tiên" rules={[{ required: true, message: 'Vui lòng chọn mức độ ưu tiên.' }]}>
              <Select options={PRIORITIES.map((priority) => ({ label: priority, value: priority }))} />
            </Form.Item>
          </div>
          <Form.Item name="title" label="Tiêu đề yêu cầu" rules={[{ required: true, whitespace: true, message: 'Vui lòng nhập tiêu đề.' }]}>
            <Input maxLength={300} placeholder="Tóm tắt sự cố hoặc yêu cầu hỗ trợ" />
          </Form.Item>
          <Form.Item name="description" label="Mô tả chi tiết" rules={[{ required: true, whitespace: true, message: 'Vui lòng mô tả chi tiết.' }]}>
            <Input.TextArea rows={4} maxLength={4000} placeholder="Mô tả tình trạng, ảnh hưởng và kết quả mong muốn" />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item label="Người gửi yêu cầu">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 32, color: '#334155' }}>
                <UserOutlined /> {user?.name || 'Chưa xác định tài khoản'}
              </div>
            </Form.Item>
            <Form.Item name="department" label="Phòng ban" rules={[{ required: true, message: 'Vui lòng chọn phòng ban.' }]}>
              <Select placeholder="Chọn phòng ban" options={departmentOptions} />
            </Form.Item>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
            <Button onClick={() => setModalOpen(false)} disabled={saving}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Gửi ticket
            </Button>
          </div>
        </Form>
      </Modal>

      <Drawer title="Chi tiết phiếu yêu cầu hỗ trợ" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={580}>
        {selectedTicket && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ TICKET: {selectedTicket.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>{selectedTicket.title}</div>
                </div>
                <Tag color={selectedTicket.status === 'Đã hoàn thành' ? 'success' : selectedTicket.status === 'Mới tạo' ? 'warning' : 'processing'}>
                  {selectedTicket.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 8 }}>
                Người gửi: <strong>{selectedTicket.requester}</strong> · Phòng ban: <strong>{selectedTicket.department}</strong>
              </div>
              <div style={{ marginTop: 10, color: '#334155', whiteSpace: 'pre-wrap' }}>{selectedTicket.description || 'Chưa có mô tả chi tiết.'}</div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Thời gian xử lý đã ghi nhận</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12.5 }}>
                <div>Ngày tạo: <strong>{formatHelpdeskTimestamp(selectedTicket.createdDate)}</strong></div>
                <div>Mức độ ưu tiên: <Tag color={selectedTicket.priority === 'Khẩn cấp' ? 'error' : selectedTicket.priority === 'Cao' ? 'warning' : 'default'}>{selectedTicket.priority}</Tag></div>
                <div>Tiếp nhận: <strong>{formatHelpdeskTimestamp(selectedTicket.acceptedAt, 'Chưa tiếp nhận')}</strong></div>
                <div>Hoàn tất: <strong>{formatHelpdeskTimestamp(selectedTicket.resolvedAt, 'Chưa hoàn tất')}</strong></div>
                <div>Thời gian phản hồi: <strong>{formatHelpdeskDuration(helpdeskMinutesBetween(selectedTicket.createdDate, selectedTicket.acceptedAt))}</strong></div>
                <div>Thời gian xử lý: <strong>{formatHelpdeskDuration(helpdeskMinutesBetween(selectedTicket.createdDate, selectedTicket.resolvedAt))}</strong></div>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Lịch sử ticket</div>
              {(selectedTicket.history || []).length === 0 && <div style={{ color: '#64748B', fontSize: 12.5 }}>Ticket cũ chưa có lịch sử chi tiết.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {(selectedTicket.history || []).map((entry, index) => (
                  <div key={`${entry.at}-${index}`} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', gap: 8, fontSize: 12.5 }}>
                    <strong style={{ color: '#009688' }}>{formatHelpdeskTimestamp(entry.at)}</strong>
                    <span>{entry.action} · {entry.actor}</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              {selectedTicket.status === 'Mới tạo' && (
                <Button type="primary" disabled={saving} loading={saving} style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }} onClick={() => void handleStatusChange(selectedTicket, 'Đang xử lý')}>
                  Tiếp nhận ticket
                </Button>
              )}
              {['Mới tạo', 'Đang xử lý'].includes(selectedTicket.status) && (
                <Button type="primary" disabled={saving} loading={saving} style={{ flex: 1, backgroundColor: '#10B981', borderColor: '#10B981' }} onClick={() => void handleStatusChange(selectedTicket, 'Đã hoàn thành')}>
                  Đánh dấu hoàn tất
                </Button>
              )}
              <Button icon={<PrinterOutlined />} onClick={() => printTicket(selectedTicket)}>
                In phiếu A4
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
