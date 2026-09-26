import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CheckSquareOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  UserOutlined,
  EyeOutlined,
  PrinterOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  ThunderboltOutlined,
  AlertOutlined,
  ToolOutlined,
  AppstoreOutlined,
  TableOutlined,
  CheckOutlined,
  RightOutlined,
  HistoryOutlined,
  FireOutlined,
  LaptopOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Alert, Progress, Checkbox, Tooltip, Radio } from '../../custom-ui';

export interface TaskChecklistItem {
  item: string;
  done: boolean;
}

export interface AssetTodoItem {
  key: string;
  taskCode: string;
  taskTitle: string;
  taskCategory: 'Cấp phát / Bàn giao' | 'Thu hồi tài sản' | 'Bảo dưỡng / Kiểm định' | 'Sửa chữa & Thay thế' | 'Kiểm kê đối soát' | 'Thanh lý & Tiêu hủy' | 'Đề xuất mua sắm';
  priority: 'Khẩn cấp (P1)' | 'Cao (P2)' | 'Trung bình (P3)' | 'Thấp (P4)';
  slaStatus: 'Trong hạn SLA' | 'Sắp chạm hạn SLA (Dưới 4h)' | 'Trễ hạn SLA';
  deadline: string;
  assignedStaff: string;
  requester: string;
  relatedAssetCode: string;
  location: string;
  estimatedHours: number;
  actualHours: number;
  status: 'Chờ xử lý' | 'Đang thực hiện' | 'Chờ phê duyệt cấp trên' | 'Đã hoàn thành';
  checklist: TaskChecklistItem[];
  notes: string;
  resolutionResult?: string;
}

const INITIAL_TODOS: AssetTodoItem[] = [];

export const AssetTodoModule: React.FC = () => {
  const [data, setData] = useState<AssetTodoItem[]>(INITIAL_TODOS);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');

  // Modals & Drawers state
  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<AssetTodoItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<AssetTodoItem | null>(null);
  const [actualHoursInput, setActualHoursInput] = useState<number>(2);
  const [resolutionInput, setResolutionInput] = useState<string>('Đã hoàn thành nhiệm vụ theo đúng quy trình và tiêu chuẩn SLA.');

  const [form] = Form.useForm();

  // Metrics
  const pendingCount = data.filter((d) => d.status === 'Chờ xử lý').length;
  const inProgressCount = data.filter((d) => d.status === 'Đang thực hiện').length;
  const urgentCount = data.filter((d) => d.priority.includes('P1') && d.status !== 'Đã hoàn thành').length;
  const completedCount = data.filter((d) => d.status === 'Đã hoàn thành').length;

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      taskCode: `CV-TS-0${data.length + 1}`,
      taskCategory: 'Cấp phát / Bàn giao',
      priority: 'Cao (P2)',
      deadline: new Date(Date.now() + 86400000).toISOString().substring(0, 16).replace('T', ' '),
      assignedStaff: 'Nguyễn Văn Hải (IT Admin)',
      requester: 'Phòng Hành Chính Nhân Sự',
      location: 'Keangnam Landmark 72 - Tầng 14',
      estimatedHours: 2,
    });
    setModalOpen(true);
  };

  const handleCreate = (values: any) => {
    const newItem: AssetTodoItem = {
      ...values,
      key: String(Date.now()),
      estimatedHours: Number(values.estimatedHours) || 2,
      actualHours: 0,
      slaStatus: values.priority.includes('P1') ? 'Sắp chạm hạn SLA (Dưới 4h)' : 'Trong hạn SLA',
      status: 'Chờ xử lý',
      checklist: [
        { item: 'Tiếp nhận thông tin và kiểm tra hiện trạng thiết bị', done: false },
        { item: 'Thực hiện thao tác kỹ thuật theo quy trình chuẩn', done: false },
        { item: 'Lập biên bản / Hồ sơ bàn giao xác nhận', done: false },
      ],
    };

    setData([newItem, ...data]);
    message.success(`Đã tạo nhiệm vụ mới: ${values.taskCode} - ${values.taskTitle}`);
    setModalOpen(false);
    form.resetFields();
  };

  const handleOpenCompleteModal = (item: AssetTodoItem) => {
    setCompleteTarget(item);
    setActualHoursInput(item.estimatedHours || 2);
    setResolutionInput(`Đã xử lý và nghiệm thu xong nhiệm vụ "${item.taskTitle}".`);
    setCompleteModalOpen(true);
  };

  const handleConfirmComplete = () => {
    if (completeTarget) {
      setData((prev) =>
        prev.map((d) =>
          d.key === completeTarget.key
            ? {
                ...d,
                status: 'Đã hoàn thành' as const,
                actualHours: actualHoursInput,
                resolutionResult: resolutionInput,
                checklist: d.checklist?.map((c) => ({ ...c, done: true })) || [],
              }
            : d
        )
      );
      message.success(`Đã đánh dấu hoàn thành nhiệm vụ ${completeTarget.taskCode}!`);
      setCompleteModalOpen(false);
      if (detailItem && detailItem.key === completeTarget.key) {
        setDetailItem({
          ...detailItem,
          status: 'Đã hoàn thành',
          actualHours: actualHoursInput,
          resolutionResult: resolutionInput,
          checklist: detailItem.checklist?.map((c) => ({ ...c, done: true })) || [],
        });
      }
    }
  };

  const handleToggleChecklist = (taskIndex: number) => {
    if (!detailItem) return;
    const updatedChecklist = [...detailItem.checklist];
    updatedChecklist[taskIndex].done = !updatedChecklist[taskIndex].done;

    const allDone = updatedChecklist.every((c) => c.done);
    const newStatus = allDone ? 'Đã hoàn thành' : 'Đang thực hiện';

    const updatedItem = {
      ...detailItem,
      checklist: updatedChecklist,
      status: newStatus as any,
    };

    setDetailItem(updatedItem);
    setData((prev) => prev.map((d) => (d.key === detailItem.key ? updatedItem : d)));
  };

  const handleChangeStatusDirect = (record: AssetTodoItem, newStatus: AssetTodoItem['status']) => {
    setData((prev) => prev.map((d) => (d.key === record.key ? { ...d, status: newStatus } : d)));
    message.info(`Đã chuyển trạng thái ${record.taskCode} sang "${newStatus}"`);
    if (detailItem && detailItem.key === record.key) {
      setDetailItem({ ...detailItem, status: newStatus });
    }
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.taskCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.taskTitle || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assignedStaff || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.requester || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.relatedAssetCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.location || '').toLowerCase().includes(searchText.toLowerCase());

    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchPriority = priorityFilter === 'all' || item.priority === priorityFilter;
    const matchCategory = categoryFilter === 'all' || item.taskCategory === categoryFilter;

    return matchSearch && matchStatus && matchPriority && matchCategory;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Việc đang chờ tiếp nhận</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingCount} nhiệm vụ
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>{inProgressCount} việc đang trong tiến trình xử lý</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Khẩn cấp P1 / Chạm hạn SLA</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: urgentCount > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {urgentCount} đầu việc
          </div>
          <div style={{ fontSize: 11.5, color: urgentCount > 0 ? '#DC2626' : '#16A34A', marginTop: 2 }}>
            {urgentCount > 0 ? 'Cần ưu tiên xử lý trong 2-4h' : 'Không có sự cố khẩn cấp'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ hoàn thành đúng hạn SLA</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            99.2% đúng cam kết
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>{completedCount} việc đã giải quyết thành công</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thời gian xử lý trung bình (MTTR)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            1.8 giờ / Ticket
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Tốc độ xử lý yêu cầu đạt chuẩn ITSM</div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã việc, tên, người phụ trách, tài sản..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 320, borderRadius: 6 }}
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 180 }}
            options={[
              { label: 'Tất cả trạng thái', value: 'all' },
              { label: 'Chờ xử lý', value: 'Chờ xử lý' },
              { label: 'Đang thực hiện', value: 'Đang thực hiện' },
              { label: 'Chờ phê duyệt', value: 'Chờ phê duyệt cấp trên' },
              { label: 'Đã hoàn thành', value: 'Đã hoàn thành' },
            ]}
          />
          <Select
            value={priorityFilter}
            onChange={setPriorityFilter}
            style={{ width: 180 }}
            options={[
              { label: 'Tất cả mức ưu tiên', value: 'all' },
              { label: 'Khẩn cấp (P1)', value: 'Khẩn cấp (P1)' },
              { label: 'Cao (P2)', value: 'Cao (P2)' },
              { label: 'Trung bình (P3)', value: 'Trung bình (P3)' },
              { label: 'Thấp (P4)', value: 'Thấp (P4)' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Radio.Group value={viewMode} onChange={(e) => setViewMode(e.target.value)} buttonStyle="solid">
            <Radio.Button value="table"><TableOutlined /> Danh sách</Radio.Button>
            <Radio.Button value="kanban"><AppstoreOutlined /> Kanban</Radio.Button>
          </Radio.Group>

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo nhiệm vụ quản trị tài sản (Excel)')}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tạo nhiệm vụ mới
          </Button>
        </div>
      </div>

      {/* VIEW: TABLE VIEW */}
      {viewMode === 'table' ? (
        <div className="transparent-table-card">
          <KTable
            dataSource={filteredData}
            columns={[
              {
                title: 'Mã việc & Ưu tiên',
                key: 'code',
                width: 170,
                render: (_: any, r: AssetTodoItem) => (
                  <div>
                    <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <CheckSquareOutlined /> {r.taskCode}
                    </span>
                    <Tag
                      color={
                        r.priority.includes('P1')
                          ? 'error'
                          : r.priority.includes('P2')
                          ? 'warning'
                          : 'blue'
                      }
                      style={{ marginTop: 3 }}
                    >
                      {r.priority}
                    </Tag>
                  </div>
                ),
              },
              {
                title: 'Nhiệm vụ & Tài sản liên kết',
                key: 'task',
                render: (_: any, r: AssetTodoItem) => (
                  <div>
                    <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.taskTitle}</strong>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                      Nhóm: <strong style={{ color: '#2563EB' }}>{r.taskCategory}</strong> · Vị trí: <strong>{r.location}</strong>
                    </div>
                    <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>
                      Tài sản: <code>{r.relatedAssetCode}</code> · Yêu cầu bởi: <em>{r.requester}</em>
                    </div>
                  </div>
                ),
              },
              {
                title: 'Hạn chót & SLA',
                key: 'deadline',
                width: 180,
                render: (_: any, r: AssetTodoItem) => (
                  <div style={{ fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: '#0F172A' }}>{r.deadline}</div>
                    <Tag color={r.slaStatus.includes('Sắp chạm') ? 'error' : 'success'} style={{ marginTop: 2 }}>
                      {r.slaStatus}
                    </Tag>
                  </div>
                ),
              },
              {
                title: 'Phụ trách & Tiến độ',
                key: 'staff',
                width: 190,
                render: (_: any, r: AssetTodoItem) => {
                  const completedTasks = r.checklist?.filter((c) => c.done).length || 0;
                  const totalTasks = r.checklist?.length || 1;
                  const pct = Math.round((completedTasks / totalTasks) * 100);
                  return (
                    <div>
                      <div style={{ fontWeight: 600, color: '#1E293B', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <UserOutlined style={{ color: '#64748B' }} /> {r.assignedStaff}
                      </div>
                      <div style={{ marginTop: 3 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748B' }}>
                          <span>Checklist ({completedTasks}/{totalTasks})</span>
                          <span>{pct}%</span>
                        </div>
                        <Progress percent={pct} size="small" strokeColor="#009688" showInfo={false} />
                      </div>
                    </div>
                  );
                },
              },
              {
                title: 'Trạng thái',
                dataIndex: 'status',
                key: 'status',
                width: 140,
                render: (s: string) => {
                  let col = 'default';
                  if (s === 'Chờ xử lý') col = 'warning';
                  if (s === 'Đang thực hiện') col = 'processing';
                  if (s === 'Chờ phê duyệt cấp trên') col = 'purple';
                  if (s === 'Đã hoàn thành') col = 'success';
                  return <Tag color={col}>{s}</Tag>;
                },
              },
              {
                title: 'Thao tác',
                key: 'act',
                width: 170,
                render: (_: any, r: AssetTodoItem) => (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Button
                      size="small"
                      icon={<EyeOutlined />}
                      onClick={() => {
                        setDetailItem(r);
                        setDrawerOpen(true);
                      }}
                      title="Xem chi tiết & checklist việc"
                    >
                      Chi tiết
                    </Button>
                    {r.status !== 'Đã hoàn thành' ? (
                      <Button
                        size="small"
                        type="primary"
                        icon={<CheckOutlined />}
                        onClick={() => handleOpenCompleteModal(r)}
                        style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                        title="Nghiệm thu hoàn tất việc"
                      >
                        Xong
                      </Button>
                    ) : (
                      <Tag color="success" style={{ margin: 0, height: 24, lineHeight: '22px' }}>
                        Hoàn tất
                      </Tag>
                    )}
                  </div>
                ),
              },
            ]}
            pagination={{ pageSize: 8 }}
          />
        </div>
      ) : (
        /* VIEW: KANBAN BOARD */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, minHeight: 480 }}>
          {(['Chờ xử lý', 'Đang thực hiện', 'Chờ phê duyệt cấp trên', 'Đã hoàn thành'] as const).map((colStatus) => {
            const colItems = filteredData.filter((d) => d.status === colStatus);
            let colHeaderBg = '#F1F5F9';
            let colBorder = '#CBD5E1';
            if (colStatus === 'Chờ xử lý') { colHeaderBg = '#FEF3C7'; colBorder = '#FCD34D'; }
            if (colStatus === 'Đang thực hiện') { colHeaderBg = '#EFF6FF'; colBorder = '#93C5FD'; }
            if (colStatus === 'Chờ phê duyệt cấp trên') { colHeaderBg = '#F3E8FF'; colBorder = '#D8B4FE'; }
            if (colStatus === 'Đã hoàn thành') { colHeaderBg = '#F0FDF4'; colBorder = '#86EFAC'; }

            return (
              <div
                key={colStatus}
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 8,
                  padding: 12,
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                {/* Column Header */}
                <div
                  style={{
                    background: colHeaderBg,
                    border: `1px solid ${colBorder}`,
                    padding: '8px 12px',
                    borderRadius: 6,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: 10,
                  }}
                >
                  <strong style={{ fontSize: 13, color: '#0F172A' }}>{colStatus}</strong>
                  <Tag color="default" style={{ fontWeight: 700 }}>
                    {colItems.length}
                  </Tag>
                </div>

                {/* Cards Container */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
                  {colItems.map((item) => (
                    <div
                      key={item.key}
                      style={{
                        background: '#FFFFFF',
                        border: '1px solid #E2E8F0',
                        borderRadius: 6,
                        padding: 12,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        cursor: 'pointer',
                      }}
                      onClick={() => {
                        setDetailItem(item);
                        setDrawerOpen(true);
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#009688' }}>{item.taskCode}</span>
                        <Tag
                          color={item.priority.includes('P1') ? 'error' : item.priority.includes('P2') ? 'warning' : 'blue'}
                          style={{ margin: 0, fontSize: 10.5 }}
                        >
                          {item.priority}
                        </Tag>
                      </div>

                      <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginTop: 6, lineHeight: 1.3 }}>
                        {item.taskTitle}
                      </div>

                      <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 6 }}>
                        Hạn: <strong style={{ color: '#0F172A' }}>{item.deadline}</strong>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, borderTop: '1px solid #F1F5F9', paddingTop: 6 }}>
                        <span style={{ fontSize: 11, color: '#475569', display: 'flex', alignItems: 'center', gap: 3 }}>
                          <UserOutlined /> {item.assignedStaff.split(' ')[0]}
                        </span>
                        <span style={{ fontSize: 11, color: '#009688', fontWeight: 600 }}>
                          {item.checklist?.filter((c) => c.done).length || 0}/{item.checklist?.length || 0} mục
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: Tạo nhiệm vụ quản trị tài sản mới */}
      <Modal
        title="Tạo Nhiệm Vụ &amp; Yêu Cầu Xử Lý Tài Sản Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 12 }}>
            <Form.Item name="taskCode" label="Mã công việc" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: CV-TS-08" />
            </Form.Item>
            <Form.Item name="taskCategory" label="Phân nhóm công việc" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Cấp phát / Bàn giao', value: 'Cấp phát / Bàn giao' },
                  { label: 'Thu hồi tài sản', value: 'Thu hồi tài sản' },
                  { label: 'Bảo dưỡng / Kiểm định', value: 'Bảo dưỡng / Kiểm định' },
                  { label: 'Sửa chữa & Thay thế', value: 'Sửa chữa & Thay thế' },
                  { label: 'Kiểm kê đối soát', value: 'Kiểm kê đối soát' },
                  { label: 'Thanh lý & Tiêu hủy', value: 'Thanh lý & Tiêu hủy' },
                  { label: 'Đề xuất mua sắm', value: 'Đề xuất mua sắm' },
                ]}
              />
            </Form.Item>
            <Form.Item name="priority" label="Mức độ ưu tiên" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Khẩn cấp (P1 - SLA 2h)', value: 'Khẩn cấp (P1)' },
                  { label: 'Cao (P2 - Trong ngày)', value: 'Cao (P2)' },
                  { label: 'Trung bình (P3 - 3 ngày)', value: 'Trung bình (P3)' },
                  { label: 'Thấp (P4 - Tuần)', value: 'Thấp (P4)' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="taskTitle" label="Tiêu đề nhiệm vụ cần làm" rules={[{ required: true, message: 'Nhập tiêu đề nhiệm vụ' }]}>
            <Input placeholder="Ví dụ: Kiểm tra xử lý tiếng kêu quạt làm mát PAC phòng máy chủ" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="relatedAssetCode" label="Mã tài sản liên quan">
              <Input placeholder="Ví dụ: TS-PAC-01, TS-SRV-002" />
            </Form.Item>
            <Form.Item name="requester" label="Người yêu cầu / Bộ phận" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Trần Tuấn Anh (CTO)" />
            </Form.Item>
            <Form.Item name="assignedStaff" label="Cán bộ phụ trách thực hiện" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Nguyễn Văn Hải (IT Admin)" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="location" label="Vị trí / Phòng ban thực hiện" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Keangnam Landmark 72 Tầng 14" />
            </Form.Item>
            <Form.Item name="deadline" label="Hạn hoàn thành (Deadline)" rules={[{ required: true }]}>
              <Input placeholder="2026-08-28 17:00" />
            </Form.Item>
            <Form.Item name="estimatedHours" label="Dự kiến (Giờ)">
              <Input type="number" min={0.5} step={0.5} />
            </Form.Item>
          </div>

          <Form.Item name="notes" label="Ghi chú chi tiết & Hướng dẫn kỹ thuật">
            <Input.TextArea rows={2} placeholder="Nhập các yêu cầu lưu ý đặc biệt khi xử lý..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Tạo nhiệm vụ
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Xem Chi Tiết & Checklist Nhiệm Vụ */}
      <Drawer
        title="Chi Tiết Nhiệm Vụ &amp; Phiếu Xử Lý Kỹ Thuật"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={620}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Document */}
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.taskCode}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.taskTitle}</div>
                </div>
                <Tag color={detailItem.priority.includes('P1') ? 'error' : 'warning'}>
                  {detailItem.priority}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phân loại: <strong>{detailItem.taskCategory}</strong> · Vị trí: <strong>{detailItem.location}</strong>
              </div>
            </div>

            {/* SLA Status & Execution info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#EFF6FF' }}>
                <div style={{ fontSize: 11, color: '#1E40AF' }}>HẠN CHÓT SLA</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#2563EB', marginTop: 2 }}>
                  {detailItem.deadline}
                </div>
                <Tag color="blue" style={{ marginTop: 2 }}>{detailItem.slaStatus}</Tag>
              </div>

              <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, background: '#F8FAFC' }}>
                <div style={{ fontSize: 11, color: '#64748B' }}>THỜI GIAN THỰC HIỆN</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>
                  {detailItem.actualHours > 0 ? `${detailItem.actualHours} giờ (Thực tế)` : `${detailItem.estimatedHours} giờ (Dự kiến)`}
                </div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Cán bộ: {detailItem.assignedStaff}</div>
              </div>
            </div>

            {/* Checklist Interactive */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Checklist các bước thực hiện ({detailItem.checklist?.filter((c) => c.done).length || 0}/{detailItem.checklist?.length || 0} hoàn thành):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {detailItem.checklist?.map((task, idx) => (
                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#F8FAFC', padding: 8, borderRadius: 6 }}>
                    <Checkbox checked={task.done} onChange={() => handleToggleChecklist(idx)}>
                      <span style={{ color: task.done ? '#64748B' : '#0F172A', textDecoration: task.done ? 'line-through' : 'none', fontWeight: task.done ? 400 : 600 }}>
                        {task.item}
                      </span>
                    </Checkbox>
                  </div>
                ))}
              </div>
            </div>

            {/* Asset Specs & Notes */}
            <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
              <div>Mã tài sản liên quan: <strong style={{ color: '#009688' }}>{detailItem.relatedAssetCode || 'Không có'}</strong></div>
              <div style={{ marginTop: 2 }}>Người tạo yêu cầu: <strong>{detailItem.requester}</strong></div>
              <div style={{ marginTop: 2 }}>Ghi chú công việc: {detailItem.notes}</div>
              {detailItem.resolutionResult && (
                <div style={{ marginTop: 6, padding: 8, background: '#F0FDF4', borderRadius: 6, color: '#166534' }}>
                  <strong>Kết quả giải quyết:</strong> {detailItem.resolutionResult}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã xuất phiếu công việc ${detailItem.taskCode} (PDF)`)}
                style={{ flex: 1 }}
              >
                In phiếu việc (PDF)
              </Button>
              {detailItem.status !== 'Đã hoàn thành' && (
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={() => handleOpenCompleteModal(detailItem)}
                  style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
                >
                  Nghiệm thu hoàn tất
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* MODAL: Nghiệm thu hoàn tất nhiệm vụ */}
      <Modal
        title="Biên Bản Nghiệm Thu &amp; Hoàn Tất Nhiệm Vụ Quản Trị"
        open={completeModalOpen}
        onCancel={() => setCompleteModalOpen(false)}
        footer={null}
        width={480}
      >
        {completeTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
            <Alert
              message={`Nghiệm thu: ${completeTarget.taskCode}`}
              description={completeTarget.taskTitle}
              type="info"
              showIcon
            />

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>
                Thời gian thực tế xử lý (Giờ):
              </label>
              <Input
                type="number"
                min={0.5}
                step={0.5}
                value={actualHoursInput}
                onChange={(e) => setActualHoursInput(Number(e.target.value))}
                suffix="Giờ"
              />
            </div>

            <div>
              <label style={{ fontSize: 12.5, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 4 }}>
                Nội dung kết quả xử lý &amp; Nghiệm thu:
              </label>
              <Input.TextArea
                rows={3}
                value={resolutionInput}
                onChange={(e) => setResolutionInput(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <Button onClick={() => setCompleteModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleConfirmComplete}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Xác nhận hoàn tất
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

