import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import { employeesApi, type EnterpriseEmployee } from '../../api/endpoints';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { deriveTaskSlaStatus, todoChecklistComplete, validateTodoCompletion } from './assetTodoRules';
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
  priority: 'Khẩn cấp (P1)' | 'Cao (P2)' | 'Trung bình (P3)' | 'Thấp (P4)' | 'Thấp';
  slaStatus: 'Trong hạn SLA' | 'Sắp chạm hạn SLA' | 'Trễ hạn SLA';
  deadline: string;
  assignedStaff: string;
  assignedStaffId?: string;
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
const checklistComplete = (item: AssetTodoItem) => todoChecklistComplete(item.checklist);

export const AssetTodoModule: React.FC = () => {
  const [data, setData] = useState<AssetTodoItem[]>(INITIAL_TODOS);
  const [loading, setLoading] = useState(false);
  const [staffOptions, setStaffOptions] = useState<EnterpriseEmployee[]>([]);
  const [staffLoading, setStaffLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actingKey, setActingKey] = useState('');

  useEffect(() => {
    const list = dataService.getGenericData('asset_todos');
    setData(Array.isArray(list) ? list : []);
    let mounted = true;
    setLoading(true);
    setStaffLoading(true);
    void Promise.all([dataService.refreshGenericData('asset_todos'), employeesApi.getAll()])
      .then(([records, employees]) => {
        if (!mounted) return;
        setData(Array.isArray(records) ? records : []);
        setStaffOptions((employees.data.data || []).filter((employee) => employee.isActive && employee.status !== 'Đã nghỉ việc'));
      })
      .catch((error: any) => { if (mounted) message.error(error?.response?.data?.message || 'Không tải được danh sách nhiệm vụ hoặc nhân viên.'); })
      .finally(() => { if (mounted) { setLoading(false); setStaffLoading(false); } });
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('asset_todos');
      if (mounted) setData(Array.isArray(updated) ? updated : []);
    });
    return () => { mounted = false; unsub(); };
  }, []);

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
  const [actualHoursInput, setActualHoursInput] = useState<number>(0);
  const [resolutionInput, setResolutionInput] = useState<string>('');

  const [form] = Form.useForm();

  const currentData = data.map((item) => item.status === 'Đã hoàn thành' ? item : { ...item, slaStatus: deriveTaskSlaStatus(item.deadline) });

  // Metrics
  const pendingCount = currentData.filter((d) => d.status === 'Chờ xử lý').length;
  const inProgressCount = currentData.filter((d) => d.status === 'Đang thực hiện').length;
  const urgentCount = currentData.filter((d) => d.status !== 'Đã hoàn thành' && (d.priority.includes('P1') || d.slaStatus !== 'Trong hạn SLA')).length;
  const completedTasks = currentData.filter((d) => d.status === 'Đã hoàn thành');
  const completedCount = completedTasks.length;
  const onTimeCount = completedTasks.filter((item) => item.slaStatus !== 'Trễ hạn SLA').length;
  const slaCompliance = completedCount ? Math.round((onTimeCount / completedCount) * 100) : null;
  const averageResolutionHours = completedCount ? completedTasks.reduce((sum, item) => sum + (Number(item.actualHours) || 0), 0) / completedCount : null;

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      taskCode: `CV-TS-${globalThis.crypto?.randomUUID?.().slice(0, 8).toUpperCase() || Math.random().toString(36).slice(2, 10).toUpperCase()}`,
    });
    setModalOpen(true);
  };

  const handleCreate = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      const estimatedHours = Number(values.estimatedHours);
      if (!Number.isFinite(estimatedHours) || estimatedHours < 0.5 || estimatedHours > 1000) throw new Error('Thời gian dự kiến phải từ 0,5 đến 1.000 giờ.');
      const newItem: AssetTodoItem = {
        ...values,
        key: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        estimatedHours,
        actualHours: 0,
        assignedStaff: staffOptions.find((employee) => employee.id === values.assignedStaffId)?.name || '',
        slaStatus: 'Trong hạn SLA',
        status: 'Chờ xử lý',
        checklist: [
          { item: 'Tiếp nhận thông tin và kiểm tra hiện trạng thiết bị', done: false },
          { item: 'Thực hiện thao tác theo nội dung nhiệm vụ', done: false },
          { item: 'Ghi nhận kết quả và hồ sơ nghiệm thu', done: false },
        ],
      };
      const saved = await dataService.createGenericRecord('asset_todos', newItem) as AssetTodoItem;
      setData((previous) => [saved, ...previous]);
      message.success(`Đã lưu nhiệm vụ ${saved.taskCode} lên máy chủ.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không lưu được nhiệm vụ.');
    } finally { setSaving(false); }
  };

  const saveTaskPatch = async (item: AssetTodoItem, patch: Record<string, unknown>, successText: string) => {
    if (actingKey) return null;
    setActingKey(item.key);
    try {
      const saved = await dataService.updateGenericRecord('asset_todos', { key: item.key, ...patch }) as AssetTodoItem;
      setData((previous) => previous.map((task) => task.key === saved.key ? saved : task));
      setDetailItem((previous) => previous?.key === saved.key ? saved : previous);
      message.success(successText);
      return saved;
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được thay đổi nhiệm vụ.');
      return null;
    } finally { setActingKey(''); }
  };

  const handleOpenCompleteModal = (item: AssetTodoItem) => {
    if (item.status !== 'Chờ phê duyệt cấp trên' || !item.checklist?.length || item.checklist.some((entry) => !entry.done)) {
      message.warning('Checklist phải hoàn thành và nhiệm vụ được gửi duyệt trước khi nghiệm thu.');
      return;
    }
    setCompleteTarget(item);
    setActualHoursInput(0);
    setResolutionInput('');
    setCompleteModalOpen(true);
  };

  const handleConfirmComplete = async () => {
    if (!completeTarget) return;
    let completion: { actualHours: number; resolution: string };
    try {
      completion = validateTodoCompletion({ status: completeTarget.status, checklist: completeTarget.checklist, actualHours: actualHoursInput, resolution: resolutionInput });
    } catch (error: any) {
      message.error(error?.message || 'Thông tin nghiệm thu chưa hợp lệ.');
      return;
    }
    const saved = await saveTaskPatch(completeTarget, { status: 'Đã hoàn thành', actualHours: completion.actualHours, resolutionResult: completion.resolution }, `Đã lưu nghiệm thu ${completeTarget.taskCode}.`);
    if (saved) setCompleteModalOpen(false);
  };

  const handleToggleChecklist = async (taskIndex: number) => {
    if (!detailItem || detailItem.status !== 'Đang thực hiện') return;
    const checklist = detailItem.checklist.map((entry, index) => index === taskIndex ? { ...entry, done: !entry.done } : entry);
    await saveTaskPatch(detailItem, { checklist }, 'Đã lưu checklist nhiệm vụ.');
  };

  const handleChangeStatusDirect = async (record: AssetTodoItem, newStatus: AssetTodoItem['status']) => {
    if (newStatus === 'Chờ phê duyệt cấp trên' && (!record.checklist.length || record.checklist.some((entry) => !entry.done))) {
      message.warning('Hoàn thành tất cả mục checklist trước khi gửi duyệt.');
      return;
    }
    await saveTaskPatch(record, { status: newStatus }, `Đã lưu trạng thái ${newStatus} cho ${record.taskCode}.`);
  };

  const filteredData = currentData.filter((item) => {
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

  const exportTasks = () => {
    if (!filteredData.length) { message.warning('Không có nhiệm vụ phù hợp để xuất.'); return; }
    downloadFile('Nhiem_vu_tai_san.xlsx', generateValidXlsxBlob([
      ['Mã việc', 'Tiêu đề', 'Nhóm', 'Ưu tiên', 'Người yêu cầu', 'Người phụ trách', 'Mã tài sản', 'Địa điểm', 'Hạn', 'Giờ dự kiến', 'Giờ thực tế', 'Checklist', 'Trạng thái', 'Kết quả'],
      ...filteredData.map((item) => [item.taskCode, item.taskTitle, item.taskCategory, item.priority, item.requester, item.assignedStaff, item.relatedAssetCode, item.location, item.deadline, item.estimatedHours, item.actualHours, `${(item.checklist || []).filter((entry) => entry.done).length}/${(item.checklist || []).length}`, item.status, item.resolutionResult || '']),
    ]));
  };

  const printTask = (item: AssetTodoItem) => downloadFile(`${item.taskCode}_phieu_cong_viec.pdf`, generateValidPdfBlob('PHIEU NHIEM VU QUAN TRI TAI SAN', `${item.taskCode} | ${item.taskTitle}`, [
    `Nhom: ${item.taskCategory} | Uu tien: ${item.priority} | Trang thai: ${item.status}`,
    `Nguoi yeu cau: ${item.requester} | Nguoi phu trach: ${item.assignedStaff}`,
    `Ma tai san: ${item.relatedAssetCode || 'Khong co'} | Dia diem: ${item.location} | Han: ${item.deadline}`,
    `Thoi gian du kien: ${item.estimatedHours} gio | Thuc te: ${item.actualHours || 'Chua ghi nhan'} gio`,
    'Checklist:', ...(item.checklist || []).map((entry) => `${entry.done ? '[x]' : '[ ]'} ${entry.item}`),
    `Ghi chu: ${item.notes || 'Khong co'}`, `Ket qua nghiem thu: ${item.resolutionResult || 'Chua ghi nhan'}`,
  ]));
  const sendForApproval = (item: AssetTodoItem) => handleChangeStatusDirect(item, 'Chờ phê duyệt cấp trên');

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
            {urgentCount > 0 ? 'Ưu tiên P1 hoặc đã gần/quá hạn' : 'Không có việc khẩn cấp hoặc gần hạn'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ hoàn thành đúng hạn SLA</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {slaCompliance === null ? 'Chưa có dữ liệu' : `${slaCompliance}% đúng hạn`}
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>{completedCount} việc đã giải quyết thành công</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thời gian xử lý trung bình (MTTR)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {averageResolutionHours === null ? 'Chưa có dữ liệu' : `${averageResolutionHours.toFixed(1)} giờ / việc`}
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
              { label: 'Thấp', value: 'Thấp (P4)' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Radio.Group value={viewMode} onChange={(e) => setViewMode(e.target.value)} buttonStyle="solid">
            <Radio.Button value="table"><TableOutlined /> Danh sách</Radio.Button>
            <Radio.Button value="kanban"><AppstoreOutlined /> Kanban</Radio.Button>
          </Radio.Group>

          <Button icon={<DownloadOutlined />} onClick={exportTasks} disabled={!filteredData.length}>
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
            loading={loading}
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
                    {r.status === 'Chờ xử lý' ? (
                      <Button
                        size="small"
                        type="primary"
                        icon={<CheckOutlined />}
                        onClick={() => handleChangeStatusDirect(r, 'Đang thực hiện')}
                        loading={actingKey === r.key}
                        style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                        title="Bắt đầu thực hiện"
                      >
                        Bắt đầu
                      </Button>
                    ) : r.status === 'Đang thực hiện' ? (
                      <Button size="small" type="primary" icon={<CheckOutlined />} disabled={!checklistComplete(r)} onClick={() => sendForApproval(r)} loading={actingKey === r.key}>Gửi duyệt</Button>
                    ) : r.status === 'Chờ phê duyệt cấp trên' ? (
                      <Button size="small" type="primary" icon={<CheckOutlined />} onClick={() => handleOpenCompleteModal(r)} loading={actingKey === r.key}>Nghiệm thu</Button>
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
                          <UserOutlined /> {(item.assignedStaff || 'Chưa phân công').split(' ')[0]}
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
        {!staffLoading && !staffOptions.length && <Alert type="warning" showIcon message="Chưa có nhân viên đang hoạt động để giao nhiệm vụ." style={{ marginTop: 14 }} />}
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
                  { label: 'Khẩn cấp', value: 'Khẩn cấp (P1)' },
                  { label: 'Cao', value: 'Cao (P2)' },
                  { label: 'Trung bình', value: 'Trung bình (P3)' },
                  { label: 'Thấp', value: 'Thấp (P4)' },
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
            <Form.Item name="requester" label="Bộ phận yêu cầu" rules={[{ required: true }]}>
              <Input placeholder="Nhập bộ phận gửi yêu cầu" />
            </Form.Item>
            <Form.Item name="assignedStaffId" label="Cán bộ phụ trách thực hiện" rules={[{ required: true, message: 'Chọn nhân viên đang hoạt động.' }]}>
              <Select
                placeholder={staffLoading ? 'Đang tải danh sách nhân viên' : 'Chọn nhân viên phụ trách'}
                disabled={staffLoading || !staffOptions.length}
                options={staffOptions.map((employee) => ({ value: employee.id, label: `${employee.name} · ${employee.employeeCode || employee.code}${employee.department ? ` · ${employee.department}` : ''}` }))}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="location" label="Vị trí / Phòng ban thực hiện" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Keangnam Landmark 72 Tầng 14" />
            </Form.Item>
            <Form.Item name="deadline" label="Hạn hoàn thành" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="estimatedHours" label="Dự kiến (giờ)" rules={[{ required: true, message: 'Nhập thời gian dự kiến.' }]}>
              <Input type="number" min={0.5} step={0.5} />
            </Form.Item>
          </div>

          <Form.Item name="notes" label="Ghi chú chi tiết & Hướng dẫn kỹ thuật">
            <Input.TextArea rows={2} placeholder="Nhập các yêu cầu lưu ý đặc biệt khi xử lý..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={staffLoading || !staffOptions.length} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
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
                  {detailItem.actualHours > 0 ? `Thực tế: ${detailItem.actualHours} giờ` : `Dự kiến: ${detailItem.estimatedHours} giờ`}
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
                    <Checkbox checked={task.done} disabled={detailItem.status !== 'Đang thực hiện' || actingKey === detailItem.key} onChange={() => void handleToggleChecklist(idx)}>
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
                onClick={() => printTask(detailItem)}
                style={{ flex: 1 }}
              >
                In phiếu việc (PDF)
              </Button>
              {detailItem.status === 'Chờ xử lý' && (
                <Button type="primary" onClick={() => handleChangeStatusDirect(detailItem, 'Đang thực hiện')} loading={actingKey === detailItem.key} style={{ flex: 1 }}>Bắt đầu thực hiện</Button>
              )}
              {detailItem.status === 'Đang thực hiện' && (
                <Button type="primary" disabled={!checklistComplete(detailItem)} onClick={() => sendForApproval(detailItem)} loading={actingKey === detailItem.key} style={{ flex: 1 }}>Gửi duyệt nghiệm thu</Button>
              )}
              {detailItem.status === 'Chờ phê duyệt cấp trên' && (
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={() => handleOpenCompleteModal(detailItem)}
                  loading={actingKey === detailItem.key}
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
                Thời gian thực tế xử lý:
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
                loading={actingKey === completeTarget.key}
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

