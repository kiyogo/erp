import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  UserAddOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  CheckOutlined,
  CalendarOutlined,
  UserOutlined,
  BookOutlined,
  IdcardOutlined,
  LaptopOutlined,
  RocketOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer, Checkbox } from '../../custom-ui';
import { collectionsApi, employeesApi, EnterpriseEmployee } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { useNavigate } from 'react-router-dom';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';

export const onboardingSteps = [
  { key: 'equipment', title: 'Giai đoạn 1: Trang bị thiết bị & Tài khoản', description: 'Xác nhận bàn giao thiết bị và cấp tài khoản làm việc' },
  { key: 'orientation', title: 'Giai đoạn 2: Đào tạo văn hóa & Quy định công ty', description: 'Xác nhận đã hướng dẫn nội quy, bảo mật và cơ cấu tổ chức' },
  { key: 'training', title: 'Giai đoạn 3: Training chuyên môn 1:1 cùng Mentor', description: 'Xác nhận hoàn tất nội dung đào tạo chuyên môn đã giao' },
  { key: 'trialTasks', title: 'Giai đoạn 4: Thực thi Task thực tế & Đánh giá giữa kỳ', description: 'Xác nhận nghiệm thu công việc và phản hồi giữa kỳ' },
  { key: 'probationReview', title: 'Giai đoạn 5: Báo cáo thử việc & Hồ sơ hợp đồng', description: 'Xác nhận kết quả đánh giá và bàn giao hồ sơ; chữ ký được xử lý tại Hợp đồng lao động' },
] as const;

type OnboardingStep = { key: typeof onboardingSteps[number]['key']; completed: boolean; completedAt?: string; completedBy?: string };

export interface EnterpriseOnboardingTask {
  key: string;
  employeeId?: string;
  employeeName: string;
  empCode: string;
  position: string;
  department: string;
  startDate: string;
  evaluationDate: string;
  mentor: string;
  mentorPhone: string;
  progress: number;
  currentStep: string;
  laptopProvided: boolean;
  emailCreated: boolean;
  contractSigned: boolean;
  checklist?: OnboardingStep[];
  supportNote?: string;
  reviewNotes?: string;
  completedAt?: string;
  status: 'Đang hội nhập' | 'Đã hoàn thành' | 'Cần hỗ trợ';
}

export function onboardingChecklist(task: Pick<EnterpriseOnboardingTask, 'checklist'>): OnboardingStep[] {
  return onboardingSteps.map(step => ({ key: step.key, completed: false, ...task.checklist?.find(item => item.key === step.key) }));
}

export function onboardingProgress(checklist: OnboardingStep[]): number {
  return Math.round(onboardingSteps.filter(step => checklist.some(item => item.key === step.key && item.completed === true)).length / onboardingSteps.length * 100);
}

export const OnboardingModule: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<EnterpriseOnboardingTask[]>([]);
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [posOptions, setPosOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<EnterpriseOnboardingTask | null>(null);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTaskRef, setSelectedTask] = useState<EnterpriseOnboardingTask | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const currentTask = data.find(task => task.key === selectedTaskRef?.key) || selectedTaskRef;
  const selectedTask = currentTask;

  const loadData = async () => {
    setLoading(true);
    try {
      const [list, staff, orgUnits, positions] = await Promise.all([
        dataService.refreshGenericData('hr_onboarding_tasks'),
        employeesApi.getAll(),
        dataService.fetchOrgUnitsList(),
        dataService.fetchDropdownOptions('positions'),
      ]);
      setData(list.map((item: any) => ({ ...item, key: item.key || item.id, progress: onboardingProgress(onboardingChecklist(item)) })));
      setEmployees(staff.data.data.filter(employee => employee.isActive !== false && employee.status !== 'Đã nghỉ việc'));
      setDeptOptions(orgUnits.map((u) => ({ label: u, value: u })));
      setPosOptions(positions.filter((p) => p.isActive !== false).map((p) => ({ label: p.name, value: p.name })));
      setLoadError('');
    } catch (error: any) {
      setLoadError(error?.response?.data?.message || 'Không thể tải dữ liệu hội nhập. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const ongoingCount = data.filter((d) => d.status === 'Đang hội nhập').length;
  const completedCount = data.filter((d) => d.status === 'Đã hoàn thành' && onboardingProgress(onboardingChecklist(d)) === 100).length;

  const handleCreate = async (values: any) => {
    if (saving) return;
    const employee = employees.find(item => item.id === values.employeeId || item.userId === values.employeeId);
    if (!employee || !values.position?.trim() || !values.department?.trim() || !values.mentor?.trim()) { message.error('Vui lòng chọn nhân sự đã có trong hệ thống và nhập đủ vị trí, phòng ban, người hướng dẫn.'); return; }
    const start = values.startDate || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || Number.isNaN(Date.parse(start)) || new Date(start).toISOString().slice(0, 10) !== start) { message.error('Ngày bắt đầu không hợp lệ.'); return; }
    if (data.some(task => task.key !== editingTask?.key && task.employeeId === employee.id && task.status !== 'Đã hoàn thành')) { message.error('Nhân sự này đã có lộ trình hội nhập đang mở.'); return; }
    const evalDate = values.evaluationDate || new Date(Date.parse(start) + 60 * 86400000).toISOString().substring(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(evalDate) || Number.isNaN(Date.parse(evalDate)) || new Date(evalDate).toISOString().slice(0, 10) !== evalDate || evalDate < start) { message.error('Ngày đánh giá phải hợp lệ và không trước ngày bắt đầu.'); return; }
    const id = editingTask?.key || `onboard-${crypto.randomUUID()}`;
    const checklist = editingTask ? onboardingChecklist(editingTask) : onboardingChecklist({});
    const newHire: EnterpriseOnboardingTask = {
      ...editingTask,
      ...values,
      key: id,
      employeeId: employee.id, employeeName: employee.name, empCode: employee.employeeCode || employee.code,
      startDate: start,
      evaluationDate: evalDate,
      checklist,
      progress: onboardingProgress(checklist),
      currentStep: onboardingSteps.find(step => !checklist.find(item => item.key === step.key)?.completed)?.title || 'Chờ nghiệm thu hội nhập',
      laptopProvided: editingTask?.laptopProvided || false,
      emailCreated: editingTask?.emailCreated || false,
      contractSigned: editingTask?.contractSigned || false,
      status: editingTask?.status === 'Đã hoàn thành' && onboardingProgress(checklist) < 100 ? 'Đang hội nhập' : editingTask?.status || 'Đang hội nhập',
    };
    try {
      setSaving(true);
      const response = editingTask ? await collectionsApi.update('hr_onboarding_tasks', id, newHire) : await collectionsApi.create('hr_onboarding_tasks', newHire, id);
      setData(previous => editingTask ? previous.map(task => task.key === id ? response.data.record : task) : [response.data.record, ...previous]);
      message.success(`Đã ${editingTask ? 'cập nhật' : 'tạo'} lộ trình hội nhập cho: ${employee.name}`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tạo lộ trình Onboarding.');
    } finally { setSaving(false); }
  };

  const updateTask = async (patch: Partial<EnterpriseOnboardingTask>) => {
    if (!currentTask || saving) return;
    setSaving(true);
    try {
      const result = await collectionsApi.update('hr_onboarding_tasks', currentTask.key, patch);
      setData(previous => previous.map(task => task.key === currentTask.key ? result.data.record : task));
      message.success(patch.status === 'Đã hoàn thành' ? 'Đã nghiệm thu lộ trình hội nhập. Chữ ký hợp đồng được quản lý tại phân hệ Hợp đồng lao động.' : 'Đã lưu tiến độ hội nhập.');
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể lưu tiến độ hội nhập.'); }
    finally { setSaving(false); }
  };

  const updateChecklist = (key: OnboardingStep['key'], completed: boolean) => {
    if (!currentTask) return;
    const checklist = onboardingChecklist(currentTask).map(item => item.key === key ? { ...item, completed } : item);
    const progress = onboardingProgress(checklist);
    void updateTask({ checklist, progress,
      laptopProvided: key === 'equipment' ? completed : currentTask.laptopProvided,
      emailCreated: key === 'equipment' ? completed : currentTask.emailCreated,
      currentStep: onboardingSteps.find(step => !checklist.find(item => item.key === step.key)?.completed)?.title || 'Chờ nghiệm thu hội nhập',
      status: currentTask.status === 'Đã hoàn thành' && progress < 100 ? 'Đang hội nhập' : currentTask.status,
    });
  };

  const finishOnboarding = () => {
    if (!currentTask || onboardingProgress(onboardingChecklist(currentTask)) < 100) { message.error('Cần hoàn thành cả 5 giai đoạn trước khi nghiệm thu.'); return; }
    if (!reviewNotes.trim()) { message.error('Vui lòng nhập kết quả đánh giá trước khi nghiệm thu.'); return; }
    void updateTask({ status: 'Đã hoàn thành', reviewNotes: reviewNotes.trim() });
  };

  const exportReport = () => {
    downloadFile(`Bao_cao_hoi_nhap_${new Date().toISOString().slice(0, 10)}.xlsx`, generateValidXlsxBlob([
      ['Mã nhân viên', 'Họ tên', 'Vị trí', 'Phòng ban', 'Mentor', 'Ngày bắt đầu', 'Ngày đánh giá', 'Tiến độ', 'Trạng thái', ...onboardingSteps.map(step => step.title), 'Kết quả đánh giá'],
      ...filteredData.map(task => [task.empCode, task.employeeName, task.position, task.department, task.mentor, task.startDate, task.evaluationDate, task.progress, task.status, ...onboardingChecklist(task).map(item => item.completed ? 'Đã hoàn thành' : 'Chưa hoàn thành'), task.reviewNotes || '']),
    ]));
    message.success('Đã tải báo cáo hội nhập theo bộ lọc hiện tại.');
  };

  const editTask = () => {
    if (!currentTask) return;
    setEditingTask(currentTask); form.resetFields(); form.setFieldsValue(currentTask); setModalOpen(true);
  };

  const selectEmployee = (employeeId: string) => {
    const employee = employees.find(item => item.id === employeeId);
    if (employee) form.setFieldsValue({ employeeName: employee.name, empCode: employee.employeeCode || employee.code, position: employee.position, department: employee.department });
  };

  const showTask = (task: EnterpriseOnboardingTask) => {
    setSelectedTask(task); setReviewNotes(task.reviewNotes || ''); setDrawerOpen(true);
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.position || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.mentor || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Nhân sự mới & Vị trí',
      key: 'name',
      render: (_: any, record: EnterpriseOnboardingTask) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserAddOutlined style={{ color: '#009688', fontSize: 15 }} />
            {record.employeeName}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã: <code>{record.empCode}</code> · {record.position}
          </div>
        </div>
      ),
    },
    {
      title: 'Khối phòng ban & Mentor',
      key: 'mentor',
      width: 220,
      render: (_: any, record: EnterpriseOnboardingTask) => (
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#2563EB' }}>{record.mentor}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.department}</div>
        </div>
      ),
    },
    {
      title: 'Tiến độ hội nhập 60 ngày',
      key: 'progress',
      width: 190,
      render: (_: any, record: EnterpriseOnboardingTask) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 2 }}>
            <span>Checklist hoàn tất:</span>
            <strong style={{ color: record.progress === 100 ? '#16A34A' : '#009688' }}>{record.progress}%</strong>
          </div>
          <Progress percent={record.progress} size="small" strokeColor={record.progress === 100 ? '#16A34A' : '#009688'} showInfo={false} />
        </div>
      ),
    },
    {
      title: 'Thời gian thử việc',
      key: 'dates',
      width: 170,
      render: (_: any, record: EnterpriseOnboardingTask) => (
        <div style={{ fontSize: 11.5 }}>
          <div>Bắt đầu: <strong>{record.startDate}</strong></div>
          <div style={{ color: '#64748B' }}>Đánh giá: <strong>{record.evaluationDate}</strong></div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 130,
      render: (status: string) => {
        let color = 'default';
        if (status === 'Đang hội nhập') color = 'processing';
        if (status === 'Đã hoàn thành') color = 'success';
        if (status === 'Cần hỗ trợ') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      render: (_: any, record: EnterpriseOnboardingTask) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => showTask(record)}
        >
          Checklist
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {loadError && <div role="alert" style={{ color: '#DC2626', marginBottom: 12 }}>{loadError} <Button size="small" onClick={() => void loadData()}>Tải lại</Button></div>}
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhân sự mới tiếp nhận Onboarding</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {data.length} Nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Theo dõi 5 giai đoạn hội nhập và ngày đánh giá đã đăng ký</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đang trong lộ trình thử việc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {ongoingCount} Nhân viên mới
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>{data.filter(task => task.status === 'Cần hỗ trợ').length} lộ trình cần hỗ trợ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã nghiệm thu lộ trình hội nhập</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {completedCount} Nhân sự
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Chữ ký hợp đồng được theo dõi tại Hợp đồng lao động</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ lộ trình đã nghiệm thu</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {data.length ? `${Math.round(completedCount / data.length * 100)}%` : 'Chưa có dữ liệu'}
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Tính trên các lộ trình được lưu trong hệ thống</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả tân tuyển' },
            { key: 'Đang hội nhập', label: 'Đang hội nhập', icon: <RocketOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Đã hoàn thành', label: 'Đã hoàn thành', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Cần hỗ trợ', label: 'Cần hỗ trợ', icon: <WarningOutlined style={{ color: '#F59E0B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setStatusFilter(tab.key)}
              style={{
                backgroundColor: statusFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: statusFilter === tab.key ? '#009688' : '#CBD5E1',
                color: statusFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: statusFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo tên, phòng ban, Mentor..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={exportReport} disabled={loading || !!loadError}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditingTask(null);
              form.resetFields();
              form.setFieldsValue({
                startDate: new Date().toISOString().substring(0, 10),
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Tiếp nhận nhân sự mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} loading={loading} />
      </div>

      {/* MODAL: Thêm Onboarding Mới */}
      <Modal
        title={editingTask ? 'Cập nhật lộ trình hội nhập' : 'Tiếp Nhận Nhân Sự Mới & Khởi Tạo Lộ Trình Onboarding'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeId" label="Nhân sự tiếp nhận" rules={[{ required: true }]}>
              <Select showSearch options={employees.map(employee => ({ value: employee.id, label: `${employee.employeeCode || employee.code} · ${employee.name}` }))} onChange={selectEmployee} placeholder="Chọn nhân sự trong hệ thống" />
            </Form.Item>
            <Form.Item name="position" label="Vị trí / Chức danh tuyển dụng" rules={[{ required: true }]}>
              {posOptions.length > 0 ? (
                <Select options={posOptions} placeholder="Chọn vị trí tuyển dụng..." />
              ) : (
                <Input placeholder="Ví dụ: Senior Backend Engineer" />
              )}
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="department" label="Phòng ban trực thuộc" rules={[{ required: true }]}>
              {deptOptions.length ? <Select options={deptOptions} placeholder="Chọn phòng ban..." /> : <Input placeholder="Nhập phòng ban tiếp nhận" />}
            </Form.Item>
            <Form.Item name="startDate" label="Ngày bắt đầu đi làm" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <Form.Item name="evaluationDate" label="Ngày đánh giá"><Input type="date" /></Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="mentor" label="Người hướng dẫn" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Hoàng Quốc Dũng" />
            </Form.Item>
            <Form.Item name="mentorPhone" label="Số điện thoại Mentor">
              <Input placeholder="Ví dụ: 0912.345.678" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingTask ? 'Lưu lộ trình hội nhập' : 'Khởi tạo lộ trình Onboarding'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Checklist Onboarding */}
      <Drawer
        title="Lộ Trình Hội Nhập 60 Ngày &amp; Checklist Tân Tuyển"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedTask && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedTask.empCode}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedTask.employeeName}
                  </div>
                </div>
                <Tag color={selectedTask.status === 'Đã hoàn thành' ? 'success' : 'processing'}>
                  {selectedTask.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Vị trí: <strong>{selectedTask.position}</strong> · {selectedTask.department}
              </div>
            </div>

            <Button size="small" disabled={saving} onClick={editTask}>Chỉnh sửa thông tin lộ trình / Liên kết nhân sự</Button>

            {/* Mentor Info */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Thông Tin Kèm Cặp &amp; Thời Hạn:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Người hướng dẫn:</span>
                  <strong style={{ color: '#2563EB' }}>{selectedTask.mentor} ({selectedTask.mentorPhone || 'N/A'})</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thời gian thử việc:</span>
                  <strong>{selectedTask.startDate} ➔ {selectedTask.evaluationDate}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Giai đoạn hiện tại:</span>
                  <strong style={{ color: '#009688' }}>{selectedTask.currentStep}</strong>
                </div>
              </div>
            </div>

            {/* 5-Step Checklist */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Checklist 5 Giai Đoạn Onboarding Bắt Buộc:
              </div>
              {!selectedTask.checklist && <div role="status" style={{ color: '#B45309', fontSize: 12, marginBottom: 10 }}>Hồ sơ cũ chưa lưu xác nhận từng giai đoạn. Vui lòng kiểm tra thực tế trước khi đánh dấu.</div>}
              {!selectedTask.employeeId && <div role="status" style={{ color: '#B45309', fontSize: 12, marginBottom: 10 }}>Liên kết nhân sự trong phần chỉnh sửa thông tin để lưu tiến độ.</div>}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
                {onboardingSteps.map(step => {
                  const item = onboardingChecklist(selectedTask).find(value => value.key === step.key)!;
                  return <div key={step.key} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <Checkbox checked={item.completed} disabled={saving || !selectedTask.employeeId} onChange={event => updateChecklist(step.key, event.target.checked)} aria-label={step.title} />
                    <div><strong>{step.title}</strong><div style={{ fontSize: 11.5, color: '#64748B' }}>{step.description}</div>{item.completedAt && <div style={{ fontSize: 11, color: '#16A34A' }}>Xác nhận: {new Date(item.completedAt).toLocaleString('vi-VN')}{item.completedBy ? ` · ${item.completedBy}` : ''}</div>}</div>
                  </div>;
                })}
              </div>
            </div>

            {/* Actions */}
            <div><label htmlFor="onboarding-review-notes" style={{ display: 'block', marginBottom: 6 }}>Kết quả đánh giá / nội dung cần hỗ trợ</label><Input.TextArea id="onboarding-review-notes" rows={3} maxLength={4000} value={reviewNotes} onChange={event => setReviewNotes(event.target.value)} disabled={saving} /></div>
            {selectedTask.supportNote && <div style={{ color: '#B45309', fontSize: 12 }}>Nội dung đã yêu cầu hỗ trợ: {selectedTask.supportNote}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              <Button disabled={saving || !selectedTask.employeeId} onClick={() => void updateTask({ reviewNotes })}>Lưu đánh giá</Button>
              {selectedTask.status === 'Cần hỗ trợ' ? <Button disabled={saving || !selectedTask.employeeId} onClick={() => void updateTask({ status: 'Đang hội nhập' })}>Tiếp tục lộ trình</Button> : selectedTask.status !== 'Đã hoàn thành' && <Button disabled={saving || !selectedTask.employeeId} onClick={() => { if (!reviewNotes.trim()) { message.error('Vui lòng nhập nội dung cần hỗ trợ.'); return; } void updateTask({ status: 'Cần hỗ trợ', supportNote: reviewNotes.trim() }); }}>Yêu cầu hỗ trợ</Button>}
              {selectedTask.status !== 'Đã hoàn thành' && <Button type="primary" icon={<CheckOutlined />} loading={saving} disabled={onboardingProgress(onboardingChecklist(selectedTask)) < 100 || !selectedTask.employeeId} onClick={finishOnboarding} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Nghiệm thu hội nhập</Button>}
              <Button onClick={() => navigate('/admin/hr/contracts')}>Mở hợp đồng lao động / Ký HĐLĐ</Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};

