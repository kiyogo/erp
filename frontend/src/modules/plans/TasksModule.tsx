import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  CheckCircleOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  CommentOutlined,
  DownloadOutlined,
  EditOutlined,
  EyeOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  PlusOutlined,
  ReloadOutlined,
  SearchOutlined,
  SendOutlined,
  UploadOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Button, Form, Input, Modal, Progress, Select, Spin, Tag, Upload, message } from '../../custom-ui';
import { EnterpriseTask, TaskAssignee, TaskPriority, TaskReportAttachment, tasksApi, filesApi } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { dataService } from '../../services/dataService';
import { formatFileSize, getFileBlob, storeFileBlob } from '../../utils/fileStorage';

const priorityColor = (priority: TaskPriority) => (
  priority === 'Khẩn cấp' ? 'error' : priority === 'Cao' ? 'warning' : priority === 'Trung bình' ? 'processing' : 'default'
);

const statusColor = (status: EnterpriseTask['status']) => (
  status === 'Hoàn thành' ? 'success' : status === 'Chờ nghiệm thu' ? 'warning' : status === 'Đang thực hiện' ? 'processing' : status === 'Tạm dừng' ? 'error' : 'default'
);

const renderTime = (value: string) => value ? value.replace('T', ' ').slice(0, 16) : '—';
const normalizeName = (value?: any) => (typeof value === 'string' ? value : String(value || '')).toLocaleLowerCase('vi-VN').replace(/\([^)]*\)/g, '').trim();

export const TasksModule: React.FC<{ mode?: 'admin' | 'employee' }> = ({ mode = 'admin' }) => {
  const location = useLocation();
  const isEmployee = mode === 'employee' || location.pathname.startsWith('/employee');
  const { user } = useAuth();
  const [tasks, setTasks] = useState<EnterpriseTask[]>([]);
  const [assignees, setAssignees] = useState<TaskAssignee[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [commentModalOpen, setCommentModalOpen] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<EnterpriseTask | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [comment, setComment] = useState('');
  const [reportContent, setReportContent] = useState('');
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const [reportProgress, setReportProgress] = useState('0');
  const [reportStatus, setReportStatus] = useState<EnterpriseTask['status']>('Chưa bắt đầu');
  const [previewAttachment, setPreviewAttachment] = useState<TaskReportAttachment | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<string | undefined>();
  const [form] = Form.useForm();

  const orgUnits = useMemo(() => dataService.getOrgUnits().filter((unit) => unit.status === 'Đang hoạt động'), []);
  const localEmployees = useMemo(() => dataService.getEmployees(), []);
  const managedUnits = useMemo(() => {
    const currentName = normalizeName(user?.name || '');
    if (!currentName) return [];
    return orgUnits.filter((unit) => normalizeName(unit.manager).includes(currentName));
  }, [orgUnits, user?.name]);

  const availableUnits = useMemo(() => {
    if (!isEmployee) return orgUnits;
    if (managedUnits.length > 0) return managedUnits;

    const userDept = ((user as any)?.department || '').trim().toLowerCase();
    const isTopExecutive = userDept.includes('giám đốc') || userDept.includes('quản trị');
    if (isTopExecutive) {
      return orgUnits;
    }

    // If user has no managed units or subordinate units, return empty array to hide "Đơn vị" field
    return [];
  }, [isEmployee, managedUnits, orgUnits, user]);

  const canCreateTask = true;

  const loadData = async () => {
    setLoading(true);
    const allEmployees = localEmployees.map((employee) => ({
      id: employee.code,
      name: employee.name,
      employeeCode: employee.code,
      role: 'USER' as const,
    }));

    try {
      const taskResponse = await tasksApi.getAll();
      setTasks(Array.isArray(taskResponse?.data?.data) && taskResponse.data.data.length > 0 ? taskResponse.data.data : dataService.getEnterpriseTasks());
    } catch {
      setTasks(dataService.getEnterpriseTasks());
    }

    try {
      const assigneeResponse = await tasksApi.getAssignees();
      const apiList = Array.isArray(assigneeResponse?.data?.data) ? assigneeResponse.data.data : [];
      const combined = [...apiList];
      allEmployees.forEach((emp) => {
        if (!combined.some((item) => item.employeeCode === emp.employeeCode || item.id === emp.id)) {
          combined.push(emp);
        }
      });
      setAssignees(combined.length ? combined : allEmployees);
    } catch {
      setAssignees(allEmployees);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, [isEmployee]);

  const allowedAssignees = useMemo(() => {
    if (!isEmployee) return assignees;

    if (managedUnits.length > 0) {
      const managedNames = new Set(managedUnits.map((u) => u.name));
      const unitEmps = localEmployees.filter((emp) => managedNames.has(emp.department));
      const empCodes = new Set(unitEmps.map((e) => e.code));
      const empNames = new Set(unitEmps.map((e) => normalizeName(e.name)));
      const filtered = assignees.filter(
        (person) => empCodes.has(person.employeeCode) || empNames.has(normalizeName(person.name)) || person.id === user?.id
      );
      return filtered.length > 0 ? filtered : assignees.filter((p) => p.id === user?.id || normalizeName(p.name) === normalizeName(user?.name));
    }

    const selfList = assignees.filter(
      (person) => person.id === user?.id || normalizeName(person.name) === normalizeName(user?.name)
    );
    return selfList.length > 0
      ? selfList
      : [{ id: user?.id || 'SELF', name: user?.name || 'Tôi', employeeCode: user?.id || 'EMP-000', role: 'USER' as const }];
  }, [isEmployee, managedUnits, assignees, localEmployees, user]);

  const assigneesForUnit = (unitName?: string) => {
    const base = isEmployee ? allowedAssignees : assignees;
    if (!unitName) return base;
    const unitEmployees = localEmployees.filter((employee) => employee.department === unitName);
    const employeeCodes = new Set(unitEmployees.map((employee) => employee.code));
    const employeeNames = new Set(unitEmployees.map((employee) => normalizeName(employee.name)));
    const members = base.filter((person) => employeeCodes.has(person.employeeCode) || employeeNames.has(normalizeName(person.name)));
    return members.length ? members : base;
  };

  const getUnitManager = (unitName: string) => {
    const managerName = normalizeName(orgUnits.find((unit) => unit.name === unitName)?.manager || '');
    return assigneesForUnit(unitName).find((person) => normalizeName(person.name) === managerName)
      || assignees.find((person) => normalizeName(person.name) === managerName)
      || assigneesForUnit(unitName)[0];
  };

  const unitAssignees = assigneesForUnit(selectedUnit);

  const updateTaskInState = (task: EnterpriseTask) => {
    setSelectedTask(task);
    setTasks((current) => current.map((item) => item.key === task.key ? { ...item, ...task } : item));
  };

  const openTask = async (taskId: string) => {
    setDrawerOpen(true);
    setDetailLoading(true);
    setComment('');
    try {
      const response = await tasksApi.getOne(taskId);
      if (response?.data?.task) setSelectedTask(response.data.task);
    } catch {
      setSelectedTask(tasks.find((task) => task.key === taskId || task.taskCode === taskId) || null);
    } finally {
      setDetailLoading(false);
    }
  };

  const openCreateTask = () => {
    form.resetFields();
    setSelectedUnit(undefined);
    const defaultAssignee = isEmployee
      ? assignees.find((person) => person.id === user?.id || normalizeName(person.name) === normalizeName(user?.name || ''))
      : undefined;
    form.setFieldsValue({
      priority: 'Trung bình',
      unitName: undefined,
      assigneeIds: defaultAssignee ? [defaultAssignee.id] : [],
    });
    setModalOpen(true);
  };

  const handleUnitChange = (unitName?: string) => {
    setSelectedUnit(unitName);
  };

  const handleCreate = async (values: any) => {
    const assigneeIds = Array.isArray(values.assigneeIds) ? values.assigneeIds : [];
    if (!assigneeIds.length) {
      message.error('Vui lòng chọn ít nhất một người thực hiện.');
      return;
    }
    const payload = { taskCode: values.taskCode, taskTitle: values.taskTitle, description: values.description, projectName: values.unitName || '', priority: values.priority, dueDate: values.dueDate };
    try {
      for (const assigneeId of assigneeIds) await tasksApi.create({ ...payload, assigneeId });
      message.success(`Đã thêm nhiệm vụ cho ${assigneeIds.length} người thực hiện.`);
      setModalOpen(false);
      await loadData();
    } catch {
      const created = assigneeIds.map((assigneeId: string, index: number) => {
        const selectedAssignee = assignees.find((person) => person.id === assigneeId);
        return dataService.createEnterpriseTask({ ...payload, taskCode: index === 0 ? payload.taskCode : undefined, assigneeId, assignee: selectedAssignee ? `${selectedAssignee.name} (${selectedAssignee.employeeCode})` : 'Người thực hiện' });
      });
      setTasks((current) => [...created, ...current]);
      message.success(`Đã thêm nhiệm vụ cho ${assigneeIds.length} người thực hiện.`);
      setModalOpen(false);
    }
  };

  const completeTask = async (task: EnterpriseTask) => {
    try {
      const response = await tasksApi.update(task.key, { status: 'Hoàn thành', progress: 100 });
      updateTaskInState(response.data.task);
    } catch {
      const updated = dataService.updateEnterpriseTask(task.key, { status: 'Hoàn thành', progress: 100 });
      if (updated) updateTaskInState(updated);
    }
    message.success('Đã nghiệm thu và hoàn thành nhiệm vụ.');
  };

  const addComment = async () => {
    if (!selectedTask || !comment.trim()) return;
    try {
      const response = await tasksApi.addComment(selectedTask.key, comment.trim());
      updateTaskInState(response.data.task);
    } catch {
      const updated = dataService.addEnterpriseTaskComment(selectedTask.key, comment.trim());
      if (updated) updateTaskInState(updated);
    }
    setComment('');
  };

  const [submittingReport, setSubmittingReport] = useState(false);

  const autoCalculateStatus = (prog: number): EnterpriseTask['status'] => {
    if (prog >= 100) return isEmployee ? 'Chờ nghiệm thu' : 'Hoàn thành';
    if (prog > 0) return 'Đang thực hiện';
    return 'Chưa bắt đầu';
  };

  const canReportTask = (task: EnterpriseTask) => task.status !== 'Hoàn thành';

  const openReport = (task: EnterpriseTask) => {
    setSelectedTask(task);
    setReportContent('');
    setReportFiles([]);
    setReportProgress(String(task.progress));
    setReportStatus(autoCalculateStatus(task.progress));
    setReportModalOpen(true);
  };

  const handleReportProgressChange = (val: string) => {
    setReportProgress(val);
    const num = Number(val) || 0;
    setReportStatus(autoCalculateStatus(num));
  };

  const handleOpenAttachment = async (attachment: TaskReportAttachment) => {
    try {
      let blob: Blob | null = null;
      try {
        const response = await filesApi.download(attachment.key);
        if (response?.data) {
          blob = response.data;
        }
      } catch {
        blob = await getFileBlob(attachment.key);
      }

      if (!blob) {
        blob = new Blob([`Tài liệu: ${attachment.name}`], { type: attachment.type || 'text/plain' });
      }

      const url = URL.createObjectURL(blob);
      setPreviewAttachment(attachment);
      setPreviewBlobUrl(url);
    } catch (error: any) {
      message.error(error?.response?.data?.message || `Không thể mở tệp ${attachment.name}.`);
      return;
    }
  };

  const closePreviewAttachment = () => {
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
    }
    setPreviewAttachment(null);
    setPreviewBlobUrl(null);
  };

  const downloadAttachment = async (attachment: TaskReportAttachment) => {
    try {
      let blob: Blob | null = null;
      try {
        const response = await filesApi.download(attachment.key);
        if (response?.data) {
          blob = response.data;
        }
      } catch {
        blob = await getFileBlob(attachment.key);
      }

      if (!blob) {
        blob = new Blob([`Tài liệu: ${attachment.name}`], { type: attachment.type || 'text/plain' });
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.name;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải tệp đính kèm.');
      return;
    }
  };

  const submitReport = async () => {
    if (!selectedTask || submittingReport) return;
    const progress = Number(reportProgress);
    if (!Number.isInteger(progress) || progress < 0 || progress > 100) {
      message.error('Tiến độ phải là số nguyên từ 0 đến 100.');
      return;
    }
    if (!reportContent.trim() && !reportFiles.length) {
      message.error('Hãy nhập nội dung báo cáo hoặc đính kèm tệp.');
      return;
    }

    setSubmittingReport(true);
    try {
      const computedStatus = autoCalculateStatus(progress);
      const attachments: TaskReportAttachment[] = [];

      for (let index = 0; index < reportFiles.length; index++) {
        const file = reportFiles[index];
        let fileId = `att-${Date.now()}-${index}`;
        try {
          const uploaded = await filesApi.upload(file, file.name, undefined, 'task-report');
          if (uploaded?.data?.file?.id) {
            fileId = uploaded.data.file.id;
          }
        } catch (uploadErr) {
          console.warn('API upload failed, saving to IndexedDB storage fallback:', uploadErr);
          try {
            await storeFileBlob(fileId, file);
          } catch (dbErr) {
            console.error('IndexedDB error:', dbErr);
          }
        }
        attachments.push({
          id: `attachment-${Date.now()}-${index}`,
          key: fileId,
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
        });
      }

      const authorName = user?.name || (isEmployee ? 'Nhân viên' : 'Quản trị viên');
      const report = {
        content: reportContent.trim(),
        progress,
        status: computedStatus,
        attachments,
        author: authorName,
      };

      let success = false;
      try {
        const response = await tasksApi.addReport(selectedTask.key, report);
        if (response?.data?.task) {
          updateTaskInState(response.data.task);
          success = true;
        }
      } catch (apiErr) {
        console.warn('API addReport failed, falling back to local dataService:', apiErr);
      }

      if (!success) {
        const updated = dataService.addEnterpriseTaskReport(selectedTask.key, report);
        if (updated) {
          updateTaskInState(updated);
          success = true;
        }
      }

      setReportModalOpen(false);
      setReportContent('');
      setReportFiles([]);
      message.success('Đã gửi báo cáo tiến độ thành công!');
    } catch (err: any) {
      console.error('Error submitting task report:', err);
      message.error(err?.response?.data?.message || 'Có lỗi xảy ra khi gửi báo cáo. Vui lòng thử lại.');
    } finally {
      setSubmittingReport(false);
    }
  };

  const summary = useMemo(() => ({
    total: tasks.length,
    inProgress: tasks.filter((task) => task.status === 'Đang thực hiện').length,
    waitingReview: tasks.filter((task) => task.status === 'Chờ nghiệm thu').length,
    overdue: tasks.filter((task) => task.status !== 'Hoàn thành' && task.dueDate < new Date().toISOString().slice(0, 10)).length,
  }), [tasks]);

  const filteredTasks = tasks.filter((task) => {
    const text = searchText.toLowerCase();
    const matchSearch = [task.taskCode, task.taskTitle, task.projectName, task.assignee].some((value) => (value || '').toLowerCase().includes(text));
    if (!matchSearch) return false;
    if (filterTab === 'urgent') return task.priority === 'Khẩn cấp';
    if (filterTab === 'in-progress') return task.status === 'Đang thực hiện';
    if (filterTab === 'waiting-review') return task.status === 'Chờ nghiệm thu';
    if (filterTab === 'completed') return task.status === 'Hoàn thành';
    return true;
  });

  const columns = [
    { title: 'Mã & hạn xử lý', key: 'code', width: 150, render: (_: unknown, task: EnterpriseTask) => <div><div style={{ fontWeight: 500, color: '#009688', display: 'flex', gap: 6, alignItems: 'center' }}><CheckSquareOutlined /> {task.taskCode}</div><div style={{ marginTop: 3, fontSize: 12, color: task.dueDate < new Date().toISOString().slice(0, 10) && task.status !== 'Hoàn thành' ? '#DC2626' : '#64748B' }}>Hạn: {task.dueDate}</div></div> },
    { title: 'Nhiệm vụ / đơn vị', key: 'title', render: (_: unknown, task: EnterpriseTask) => <div><div style={{ fontWeight: 500, color: '#0F172A' }}>{task.taskTitle}</div>{task.projectName && <div style={{ marginTop: 2, fontSize: 12, color: '#2563EB' }}>{task.projectName}</div>}</div> },
    { title: 'Người thực hiện', dataIndex: 'assignee', key: 'assignee', width: 190, render: (assignee: string) => <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 400 }}><UserOutlined style={{ color: '#009688' }} />{assignee}</span> },
    { title: 'Ưu tiên', dataIndex: 'priority', key: 'priority', width: 120, render: (priority: TaskPriority) => <Tag color={priorityColor(priority)}>{priority}</Tag> },
    { title: 'Tiến độ', key: 'progress', width: 145, render: (_: unknown, task: EnterpriseTask) => <div><Progress percent={task.progress} size="small" showInfo={false} strokeColor={task.status === 'Hoàn thành' ? '#16A34A' : '#009688'} /><span style={{ fontSize: 12, fontWeight: 400, color: '#334155' }}>{task.progress}%</span></div> },
    { title: 'Trạng thái', dataIndex: 'status', key: 'status', width: 130, render: (status: EnterpriseTask['status']) => <Tag color={statusColor(status)}>{status}</Tag> },
    { title: 'Thao tác', key: 'actions', width: 230, render: (_: unknown, task: EnterpriseTask) => <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}><Button size="small" icon={<EyeOutlined />} onClick={() => void openTask(task.key)}>Chi tiết</Button>{canReportTask(task) && <Button size="small" icon={<FileTextOutlined />} onClick={() => openReport(task)} style={{ color: '#009688', borderColor: '#009688' }}>Báo cáo</Button>}{!isEmployee && task.status !== 'Hoàn thành' && <Button size="small" type="primary" style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }} onClick={() => void completeTask(task)}>Nghiệm thu</Button>}</div> },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 14, marginBottom: 16 }}>
        {[['Tổng nhiệm vụ', `${summary.total} nhiệm vụ`, '#009688'], ['Đang thực hiện', `${summary.inProgress} nhiệm vụ`, '#2563EB'], ['Chờ nghiệm thu', `${summary.waitingReview} nhiệm vụ`, '#D97706'], ['Đang quá hạn', `${summary.overdue} nhiệm vụ`, summary.overdue ? '#DC2626' : '#16A34A']].map(([label, value, color]) => <div key={label} style={{ background: '#FFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}><div style={{ color: '#64748B', fontSize: 12.5 }}>{label}</div><div style={{ color, fontWeight: 800, fontSize: 23, marginTop: 5 }}>{value}</div></div>)}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{[['all', 'Tất cả'], ['urgent', 'Khẩn cấp'], ['in-progress', 'Đang thực hiện'], ['waiting-review', 'Chờ nghiệm thu'], ['completed', 'Hoàn thành']].map(([key, label]) => <Button key={key} size="small" onClick={() => setFilterTab(key)} style={{ background: filterTab === key ? '#E0F2F1' : '#FFF', borderColor: filterTab === key ? '#009688' : '#CBD5E1', color: filterTab === key ? '#00796B' : '#475569', fontWeight: filterTab === key ? 700 : 500 }}>{label}</Button>)}</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><Input prefix={<SearchOutlined style={{ color: '#94A3B8' }} />} placeholder="Mã, tên việc, đơn vị, người làm..." value={searchText} onChange={(event) => setSearchText(event.target.value)} allowClear style={{ width: 270 }} /><Button icon={<ReloadOutlined />} onClick={() => void loadData()}>Tải lại</Button>{canCreateTask && <Button type="primary" icon={<PlusOutlined />} onClick={openCreateTask} style={{ background: '#009688', borderColor: '#009688' }}>Thêm nhiệm vụ</Button>}</div>
      </div>

      <Spin spinning={loading} tip="Đang tải nhiệm vụ..."><div className="transparent-table-card"><KTable dataSource={filteredTasks} columns={columns} pagination={{ pageSize: 8 }} /></div></Spin>

      <Modal title={isEmployee ? 'Thêm nhiệm vụ' : 'Giao nhiệm vụ mới'} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={620}>
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}><Form.Item name="taskCode" label="Mã nhiệm vụ"><Input readOnly placeholder="Tự động tạo khi lưu" /></Form.Item><Form.Item name="priority" label="Độ ưu tiên" rules={[{ required: true }]}><Select options={['Khẩn cấp', 'Cao', 'Trung bình', 'Thấp'].map((item) => ({ label: item, value: item }))} /></Form.Item></div>
          <Form.Item name="taskTitle" label="Tên nhiệm vụ" rules={[{ required: true }]}><Input placeholder="Ví dụ: Hoàn thiện báo cáo doanh thu tháng" /></Form.Item>
          {availableUnits.length > 0 && <Form.Item name="unitName" label="Đơn vị"><Select placeholder="Không chọn đơn vị" onChange={handleUnitChange} options={availableUnits.map((unit) => ({ value: unit.name, label: unit.name }))} /></Form.Item>}
          <Form.Item name="assigneeIds" label="Người thực hiện" rules={[{ required: true, message: 'Vui lòng chọn người thực hiện.' }]}><Select mode="multiple" placeholder="Có thể chọn nhiều người thực hiện" options={unitAssignees.filter((person) => person && (person.name || person.employeeCode)).map((person) => ({ value: person.id, label: `${person.name && person.name !== 'undefined' ? person.name : 'Nhân viên'} (${person.employeeCode || person.id})` }))} /></Form.Item>
          <Form.Item name="dueDate" label="Hạn hoàn thành" rules={[{ required: true }]}><Input type="date" /></Form.Item>
          <Form.Item name="description" label="Mô tả / kết quả cần đạt"><Input.TextArea rows={3} placeholder="Nêu rõ yêu cầu, tiêu chí bàn giao..." /></Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button onClick={() => setModalOpen(false)}>Hủy</Button><Button type="primary" htmlType="submit" style={{ background: '#009688', borderColor: '#009688' }}>Thêm nhiệm vụ</Button></div>
        </Form>
      </Modal>

      <Modal title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><EyeOutlined style={{ color: '#009688' }} /><span>Chi tiết nhiệm vụ</span></div>} open={drawerOpen} onCancel={() => setDrawerOpen(false)} footer={null} width={720} style={{ top: 24 }}>
        {detailLoading && <div style={{ padding: '30px 0', textAlign: 'center' }}><Spin tip="Đang tải chi tiết..." /></div>}
        {!detailLoading && selectedTask && <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ paddingBottom: 14, borderBottom: '1px dashed #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
              <div>
                <div style={{ color: '#009688', fontSize: 12, fontWeight: 800 }}>{selectedTask.taskCode}</div>
                <div style={{ color: '#0F172A', fontSize: 16, fontWeight: 700, marginTop: 4 }}>{selectedTask.taskTitle}</div>
              </div>
              <Tag color={statusColor(selectedTask.status)}>{selectedTask.status}</Tag>
            </div>
            <div style={{ marginTop: 8, color: '#475569', fontSize: 12.5 }}>
              {[selectedTask.projectName, selectedTask.assignee, `Hạn ${selectedTask.dueDate}`].filter(Boolean).join(' · ')}
            </div>
            {selectedTask.description && (
              <div style={{ marginTop: 10, color: '#334155', whiteSpace: 'pre-wrap', fontSize: 13 }}>
                {selectedTask.description}
              </div>
            )}
          </div>

          <div style={{ paddingBottom: 14, borderBottom: '1px dashed #E2E8F0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <strong>Tiến độ hoàn thành</strong>
              </div>
              <strong style={{ color: selectedTask.status === 'Hoàn thành' ? '#16A34A' : '#009688' }}>{selectedTask.progress}%</strong>
            </div>
            <Progress percent={selectedTask.progress} strokeColor={selectedTask.status === 'Hoàn thành' ? '#16A34A' : '#009688'} />
          </div>

          {selectedTask.reports?.length ? (
            <div style={{ paddingBottom: 14, borderBottom: '1px dashed #E2E8F0' }}>
              <div style={{ fontWeight: 700, marginBottom: 8, color: '#1E293B' }}>
                <FileTextOutlined style={{ color: '#009688', marginRight: 6 }} /> Báo cáo công việc
              </div>
              {selectedTask.reports.map((report) => (
                <div key={report.key} style={{ padding: '10px 0', borderBottom: '1px dashed #F1F5F9' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                    <strong>{report.author}</strong>
                    <span style={{ color: '#94A3B8' }}>{renderTime(report.createdAt)}</span>
                  </div>
                  {report.content && <div style={{ marginTop: 5, whiteSpace: 'pre-wrap', color: '#334155', fontSize: 13 }}>{report.content}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                    <Tag color={statusColor(report.status)} style={{ height: 26, display: 'inline-flex', alignItems: 'center', margin: 0, fontWeight: 600 }}>
                      {report.progress}% {report.status}
                    </Tag>
                    {report.attachments?.map((attachment) => (
                      <Button
                        key={attachment.id}
                        size="small"
                        icon={<EyeOutlined style={{ color: '#009688' }} />}
                        onClick={() => void handleOpenAttachment(attachment)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          maxWidth: 210,
                          height: 26,
                          fontSize: 12,
                          borderRadius: 4,
                          padding: '0 8px',
                        }}
                        title={attachment.name}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {attachment.name}
                        </span>
                      </Button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ paddingBottom: 14, borderBottom: '1px dashed #E2E8F0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <div style={{ fontWeight: 700, color: '#1E293B', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CommentOutlined style={{ color: '#009688' }} /> Trao đổi
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                {selectedTask.comments?.length ? `${selectedTask.comments.length} tin nhắn trao đổi` : 'Chưa có trao đổi nào'}
              </div>
            </div>
            <Button type="primary" icon={<CommentOutlined />} onClick={() => setCommentModalOpen(true)} style={{ background: '#009688', borderColor: '#009688' }}>
              Trao đổi
            </Button>
          </div>

          {selectedTask.activities?.length ? (
            <div>
              <div style={{ fontWeight: 700, marginBottom: 8, color: '#1E293B' }}>
                <ClockCircleOutlined style={{ color: '#009688', marginRight: 6 }} /> Nhật ký hoạt động
              </div>
              {selectedTask.activities.slice(0, 10).map((item) => (
                <div key={item.key} style={{ padding: '6px 0', borderBottom: '1px dashed #F1F5F9', fontSize: 12.5 }}>
                  <strong>{item.actor}</strong> {item.content}
                  <span style={{ color: '#94A3B8', marginLeft: 6 }}>{renderTime(item.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : null}

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 6 }}>
            <Button onClick={() => setDrawerOpen(false)}>Đóng</Button>
            {canReportTask(selectedTask) && (
              <Button type="primary" icon={<FileTextOutlined />} onClick={() => openReport(selectedTask)} style={{ background: '#009688', borderColor: '#009688' }}>
                Báo cáo
              </Button>
            )}
            {!isEmployee && selectedTask.status !== 'Hoàn thành' && (
              <Button type="primary" icon={<CheckCircleOutlined />} onClick={() => void completeTask(selectedTask)} style={{ background: '#16A34A', borderColor: '#16A34A' }}>
                Nghiệm thu hoàn thành
              </Button>
            )}
          </div>
        </div>}
      </Modal>

      <Modal title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><CommentOutlined style={{ color: '#009688' }} /><span>Trao đổi: {selectedTask?.taskCode}</span></div>} open={commentModalOpen} onCancel={() => setCommentModalOpen(false)} footer={null} width={600} style={{ top: 40 }}>
        {selectedTask && <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 6 }}><div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>{selectedTask.comments?.length ? selectedTask.comments.map((item) => <div key={item.key} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 6, padding: '10px 12px' }}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}><span style={{ fontWeight: 700, fontSize: 12.5, color: '#0F172A' }}>{item.author}</span><span style={{ fontSize: 11.5, color: '#94A3B8' }}>{renderTime(item.createdAt)}</span></div><div style={{ fontSize: 13, color: '#334155', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{item.content}</div></div>) : <div style={{ padding: '24px 0', textAlign: 'center', color: '#64748B', fontSize: 13 }}>Chưa có trao đổi nào cho nhiệm vụ này.</div>}</div><div style={{ marginTop: 6 }}><Input.TextArea rows={3} value={comment} onChange={(event: any) => setComment(event.target.value)} placeholder="Nhập nội dung trao đổi, tiến độ hoặc phản hồi..." /><div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}><Button onClick={() => setCommentModalOpen(false)}>Đóng</Button><Button type="primary" icon={<SendOutlined />} disabled={!comment.trim()} onClick={() => void addComment()} style={{ background: '#009688', borderColor: '#009688' }}>Gửi bình luận</Button></div></div></div>}
      </Modal>

      <Modal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><FileTextOutlined style={{ color: '#009688' }} /><span>Báo cáo tiến độ nhiệm vụ</span></div>}
        open={reportModalOpen}
        onCancel={() => !submittingReport && setReportModalOpen(false)}
        footer={null}
        width={640}
      >
        {selectedTask && (
          <div style={{ paddingTop: 8 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#334155' }}>
                Tiến độ hoàn thành
              </div>
              <Input
                type="number"
                min={0}
                max={100}
                value={reportProgress}
                onChange={(event) => handleReportProgressChange(event.target.value)}
                placeholder="Nhập tiến độ từ 0 đến 100"
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#334155' }}>
                Nội dung báo cáo
              </div>
              <Input.TextArea
                rows={4}
                value={reportContent}
                onChange={(event: any) => setReportContent(event.target.value)}
                placeholder="Nêu chi tiết khối lượng công việc đã hoàn thành, vướng mắc phát sinh (nếu có)..."
              />
            </div>

            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, color: '#334155' }}>
                Đính kèm tài liệu
              </div>
              <Upload.Dragger
                multiple
                onChange={({ file }: { file: File }) => {
                  if (!file) return;
                  setReportFiles((current) => current.some((item) => item.name === file.name && item.size === file.size) ? current : [...current, file]);
                }}
                style={{ padding: '16px 14px', background: '#FAFAFA', borderColor: '#CBD5E1' }}
              >
                <UploadOutlined style={{ fontSize: 24, color: '#009688' }} />
                <div style={{ marginTop: 6, fontWeight: 600, color: '#1E293B', fontSize: 13 }}>
                  Bấm chọn hoặc kéo thả file vào đây
                </div>
                <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                  Hỗ trợ tải mọi định dạng file (Word, Excel, PDF, Hình ảnh, ZIP...)
                </div>
              </Upload.Dragger>

              {reportFiles.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>
                    Danh sách {reportFiles.length} file đính kèm:
                  </div>
                  {reportFiles.map((file, index) => (
                    <div
                      key={`${file.name}-${index}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 8,
                        fontSize: 12.5,
                        padding: '6px 10px',
                        background: '#F8FAFC',
                        border: '1px solid #E2E8F0',
                        borderRadius: 6,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <PaperClipOutlined style={{ color: '#009688' }} />
                        <strong style={{ color: '#1E293B' }}>{file.name}</strong>
                        <span style={{ color: '#64748B', fontSize: 11.5 }}>({formatFileSize(file.size)})</span>
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <Button
                          size="small"
                          danger
                          disabled={submittingReport}
                          onClick={() => setReportFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                        >
                          Xóa
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <Button disabled={submittingReport} onClick={() => setReportModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                icon={<FileTextOutlined />}
                loading={submittingReport}
                disabled={submittingReport}
                onClick={() => void submitReport()}
                style={{ background: '#009688', borderColor: '#009688' }}
              >
                {submittingReport ? 'Đang gửi...' : 'Gửi báo cáo'}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* MODAL XEM TRỰC TIẾP FILE ĐÍNH KÈM (KHÔNG CẦN TẢI VỀ) */}
      <Modal
        title={<div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><EyeOutlined style={{ color: '#009688' }} /><span>Xem tệp đính kèm: {previewAttachment?.name}</span></div>}
        open={!!previewAttachment}
        onCancel={closePreviewAttachment}
        footer={<div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button onClick={closePreviewAttachment}>Đóng</Button>{previewAttachment && <Button type="primary" icon={<DownloadOutlined />} onClick={() => void downloadAttachment(previewAttachment)} style={{ background: '#009688', borderColor: '#009688' }}>Tải file về máy</Button>}</div>}
        width={850}
        style={{ top: 20 }}
      >
        {previewBlobUrl && previewAttachment && (
          <div style={{ height: '70vh', width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', borderRadius: 8, overflow: 'hidden' }}>
            {previewAttachment.name.match(/\.(png|jpe?g|gif|webp|svg)$/i) ? (
              <img src={previewBlobUrl} alt={previewAttachment.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
            ) : previewAttachment.name.match(/\.pdf$/i) ? (
              <iframe src={previewBlobUrl} title={previewAttachment.name} style={{ width: '100%', height: '100%', border: 'none' }} />
            ) : previewAttachment.name.match(/\.(txt|csv|json|js|html|md)$/i) ? (
              <iframe src={previewBlobUrl} title={previewAttachment.name} style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
            ) : (
              <div style={{ textAlign: 'center', padding: 30 }}>
                <PaperClipOutlined style={{ fontSize: 48, color: '#009688', marginBottom: 12 }} />
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>{previewAttachment.name}</div>
                <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>Tệp đính kèm đã mở trực tiếp trên giao diện</div>
                <Button type="primary" icon={<DownloadOutlined />} onClick={() => void downloadAttachment(previewAttachment)} style={{ marginTop: 16, background: '#009688', borderColor: '#009688' }}>
                  Tải tệp về máy
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
