import React, { useEffect, useMemo, useState } from 'react';
import {
  AppstoreOutlined,
  BarChartOutlined,
  BellOutlined,
  BranchesOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  EyeOutlined,
  FileProtectOutlined,
  SendOutlined,
  ThunderboltOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { Button, Drawer, Progress, Tag, message } from '../../custom-ui';
import { KTable } from '../../components/KTable';
import {
  contractsApi,
  employeeProposalsApi,
  tasksApi,
  type ContractPayload,
  type EmployeeProposal,
  type EnterpriseTask,
} from '../../api/endpoints';
import { dataService, type WorkflowItem } from '../../services/dataService';

type TimelineStep = {
  stepName: string;
  approver: string;
  actionTime: string;
  status: 'completed' | 'in_progress' | 'pending';
  note?: string;
};

type LiveRequestItem = {
  key: string;
  requestCode: string;
  title: string;
  category: string;
  requester: string;
  department: string;
  submittedDate: string;
  currentStep: number;
  totalSteps: number;
  currentApprover: string;
  slaRemainingHours: number;
  status: 'Chờ xử lý' | 'Chờ bổ sung' | 'Đã hoàn thành' | 'Đã từ chối';
  budgetAmount?: number;
  timeline: TimelineStep[];
  source: string;
  route: string;
};

type ApprovalWorkflowRequest = {
  key: string;
  code: string;
  workflowCode: string;
  workflowName: string;
  category: string;
  requester: string;
  department: string;
  submittedAt: string;
  currentLevel: number;
  totalLevels: number;
  roleRequirement: string;
  slaDeadlineAt?: string;
  slaHoursTarget?: number;
  budgetAmount: number;
  status: string;
  approvalHistory?: Array<{ level: number; approver: string; decision: string; timestamp: string; comments?: string }>;
};

const parseDate = (value?: string) => {
  if (!value) return null;
  const normalized = value.includes('T') ? value : value.replace(' ', 'T');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const hoursSince = (value: string | undefined, nowMs: number) => {
  const parsed = parseDate(value);
  if (!parsed) return 0;
  return Math.max(0, (nowMs - parsed.getTime()) / (1000 * 60 * 60));
};

const computeSlaRemaining = (submittedDate: string, targetHours: number, isDone: boolean, nowMs: number) => {
  if (isDone) return 0;
  return Math.max(0, Math.round((targetHours - hoursSince(submittedDate, nowMs)) * 10) / 10);
};

const mapProposal = (item: EmployeeProposal, nowMs: number): LiveRequestItem => {
  const isDone = item.status === 'Đã duyệt';
  const isRejected = item.status === 'Từ chối';
  const status: LiveRequestItem['status'] = isRejected ? 'Đã từ chối' : isDone ? 'Đã hoàn thành' : 'Chờ xử lý';
  return {
    key: `proposal-${item.key}`,
    requestCode: item.code,
    title: item.title,
    category: item.type,
    requester: item.employeeName,
    department: item.employeeCode || 'Chưa gán đơn vị',
    submittedDate: item.createdAt || item.date,
    currentStep: isDone || isRejected ? 2 : 1,
    totalSteps: 2,
    currentApprover: item.approver || 'Chưa phân công',
    slaRemainingHours: computeSlaRemaining(item.createdAt || item.date, 24, isDone || isRejected, nowMs),
    status,
    budgetAmount: Number(item.amount || 0),
    timeline: [
      {
        stepName: 'Khởi tạo đề xuất',
        approver: item.employeeName,
        actionTime: item.createdAt || item.date,
        status: 'completed',
      },
      {
        stepName: 'Phê duyệt đề xuất',
        approver: item.approver || 'Chưa phân công',
        actionTime: isDone || isRejected ? item.reviewedAt || item.updatedAt : 'Đang chờ xử lý',
        status: isDone || isRejected ? 'completed' : 'in_progress',
        note: item.reviewNote || undefined,
      },
    ],
    source: 'Đề xuất nhân sự',
    route: '/admin/hr/proposals',
  };
};

const mapTask = (item: EnterpriseTask, nowMs: number): LiveRequestItem => {
  const isDone = item.status === 'Hoàn thành';
  const isRejected = item.status === 'Tạm dừng';
  const status: LiveRequestItem['status'] = isRejected ? 'Đã từ chối' : isDone ? 'Đã hoàn thành' : 'Chờ xử lý';
  const submittedDate = item.createdAt || item.dueDate;
  const progressStep = item.progress >= 100 ? 3 : item.progress >= 50 ? 2 : 1;
  return {
    key: `task-${item.key}`,
    requestCode: item.taskCode,
    title: item.taskTitle,
    category: item.projectName || 'Tác vụ điều phối',
    requester: item.createdBy || 'Hệ thống',
    department: item.assignee || 'Chưa giao',
    submittedDate,
    currentStep: isDone || isRejected ? 3 : progressStep,
    totalSteps: 3,
    currentApprover: item.assignee || 'Chưa giao',
    slaRemainingHours: computeSlaRemaining(submittedDate, 48, isDone || isRejected, nowMs),
    status,
    timeline: [
      {
        stepName: 'Khởi tạo công việc',
        approver: item.createdBy || 'Hệ thống',
        actionTime: item.createdAt,
        status: 'completed',
      },
      {
        stepName: 'Thực hiện và theo dõi',
        approver: item.assignee || 'Chưa giao',
        actionTime: item.updatedAt || item.createdAt,
        status: isDone || isRejected ? 'completed' : item.progress > 0 ? 'in_progress' : 'pending',
      },
      {
        stepName: 'Nghiệm thu',
        approver: item.assignee || 'Chưa giao',
        actionTime: isDone ? item.updatedAt : 'Chờ nghiệm thu',
        status: isDone ? 'completed' : 'pending',
      },
    ],
    source: 'Kế hoạch và tác vụ',
    route: '/admin/plans/tasks',
  };
};

const mapContract = (item: ContractPayload, nowMs: number): LiveRequestItem => {
  const status: LiveRequestItem['status'] =
    item.status === 'Đã hết hạn'
      ? 'Đã từ chối'
      : item.status === 'Còn hiệu lực'
        ? 'Đã hoàn thành'
        : 'Chờ xử lý';
  const submittedDate = item.createdAt || item.startDate || '';
  const totalSteps = 3;
  const currentStep =
    status === 'Đã hoàn thành' ? 3 : item.status === 'Chờ ký' ? 2 : 1;
  return {
    key: `contract-${item.id || item.key || item.code}`,
    requestCode: item.code || item.id || 'HD',
    title: item.name,
    category: item.contractTemplate || item.contractCategory || 'Hợp đồng',
    requester: item.employeeName || item.partyBName || 'Chưa xác định',
    department: item.department || 'Chưa gán đơn vị',
    submittedDate,
    currentStep,
    totalSteps,
    currentApprover: item.companySignStatus === 'Chưa ký'
      ? (item.signerName || 'Bộ phận ký doanh nghiệp')
      : item.employeeSignStatus === 'Chưa ký'
        ? (item.employeeName || item.partyBName || 'Bên ký đối tác')
        : 'Đã hoàn tất',
    slaRemainingHours: computeSlaRemaining(submittedDate, 72, status !== 'Chờ xử lý', nowMs),
    status,
    budgetAmount: Number(item.contractValue || item.salary || 0),
    timeline: [
      {
        stepName: 'Khởi tạo hợp đồng',
        approver: item.signerName || item.employeeName || 'Người tạo hồ sơ',
        actionTime: item.createdAt || item.startDate || '',
        status: 'completed',
      },
      {
        stepName: 'Chờ ký các bên',
        approver: item.signerName || item.employeeName || 'Các bên liên quan',
        actionTime: item.updatedAt || item.createdAt || '',
        status: status === 'Chờ xử lý' ? 'in_progress' : 'completed',
      },
      {
        stepName: 'Hợp đồng có hiệu lực',
        approver: item.signerName || 'Doanh nghiệp',
        actionTime: item.startDate || item.updatedAt || '',
        status: status === 'Đã hoàn thành' ? 'completed' : 'pending',
      },
    ],
    source: 'Hợp đồng và pháp chế',
    route: '/admin/hr/contracts',
  };
};

const mapWorkflow = (item: WorkflowItem, nowMs: number): LiveRequestItem => {
  const done = item.status === 'Đã phê duyệt';
  const rejected = item.status === 'Bị từ chối';
  return {
    key: `workflow-${item.key}`,
    requestCode: item.code,
    title: item.title,
    category: item.step || 'Quy trình nội bộ',
    requester: item.requester,
    department: item.department,
    submittedDate: item.submittedDate,
    currentStep: done || rejected ? 2 : 1,
    totalSteps: 2,
    currentApprover: item.currentApprover || 'Chưa phân công',
    slaRemainingHours: computeSlaRemaining(item.submittedDate, 24, done || rejected, nowMs),
    status: rejected ? 'Đã từ chối' : done ? 'Đã hoàn thành' : item.status === 'Yêu cầu bổ sung' ? 'Chờ bổ sung' : 'Chờ xử lý',
    timeline: [
      {
        stepName: 'Khởi tạo quy trình',
        approver: item.requester,
        actionTime: item.submittedDate,
        status: 'completed',
      },
      {
        stepName: 'Phê duyệt hiện tại',
        approver: item.currentApprover || 'Chưa phân công',
        actionTime: done || rejected ? item.submittedDate : 'Đang xử lý',
        status: done || rejected ? 'completed' : 'in_progress',
      },
    ],
    source: 'Workflow nội bộ',
    route: '/admin/workflows/requests',
  };
};

const mapApprovalRequest = (item: ApprovalWorkflowRequest, nowMs: number): LiveRequestItem => {
  const done = item.status === 'Đã phê duyệt' || item.status === 'Đã ký số phê duyệt';
  const rejected = item.status === 'Đã từ chối';
  const deadline = parseDate(item.slaDeadlineAt);
  const remaining = done || rejected
    ? 0
    : deadline ? Math.max(0, Math.round((deadline.getTime() - nowMs) / 3_600_000 * 10) / 10)
      : computeSlaRemaining(item.submittedAt, Number(item.slaHoursTarget) || 4, false, nowMs);
  const history = Array.isArray(item.approvalHistory) ? item.approvalHistory : [];
  return {
    key: `approval-${item.key}`,
    requestCode: item.code,
    title: item.workflowName,
    category: item.category,
    requester: item.requester,
    department: item.department,
    submittedDate: item.submittedAt,
    currentStep: done || rejected ? item.totalLevels : item.currentLevel,
    totalSteps: item.totalLevels,
    currentApprover: item.status === 'Yêu cầu bổ sung' ? 'Người gửi bổ sung hồ sơ' : item.roleRequirement,
    slaRemainingHours: remaining,
    status: rejected ? 'Đã từ chối' : done ? 'Đã hoàn thành' : 'Chờ xử lý',
    budgetAmount: Number(item.budgetAmount || 0),
    timeline: [
      { stepName: 'Gửi hồ sơ', approver: item.requester, actionTime: item.submittedAt, status: 'completed' },
      ...history.map((event) => ({ stepName: `Cấp ${event.level}`, approver: event.approver, actionTime: event.timestamp, status: 'completed' as const, note: `${event.decision}${event.comments ? ` · ${event.comments}` : ''}` })),
      ...(item.status === 'Yêu cầu bổ sung' ? [{ stepName: 'Người gửi bổ sung hồ sơ', approver: item.requester, actionTime: 'Đang chờ bổ sung', status: 'in_progress' as const }] : []),
      ...(!done && !rejected && item.status !== 'Yêu cầu bổ sung' ? [{ stepName: `Cấp ${item.currentLevel}: ${item.roleRequirement}`, approver: item.roleRequirement, actionTime: 'Đang chờ xử lý', status: 'in_progress' as const }] : []),
    ],
    source: 'Workflow nội bộ',
    route: '/admin/workflows/requests',
  };
};

export const WorkflowOverviewModule: React.FC = () => {
  const navigate = useNavigate();
  const [contracts, setContracts] = useState<ContractPayload[]>([]);
  const [proposals, setProposals] = useState<EmployeeProposal[]>([]);
  const [tasks, setTasks] = useState<EnterpriseTask[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [approvalRequests, setApprovalRequests] = useState<ApprovalWorkflowRequest[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [detailItem, setDetailItem] = useState<LiveRequestItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    const syncWorkflows = () => {
      setWorkflows(dataService.getWorkflows());
      setApprovalRequests(dataService.getGenericData('workflow_requests'));
    };
    syncWorkflows();
    const unsubscribe = dataService.subscribe(syncWorkflows);
    Promise.allSettled([
      employeeProposalsApi.getAll(),
      tasksApi.getAll(),
      contractsApi.getAll(),
    ]).then(([proposalRes, taskRes, contractRes]) => {
      if (proposalRes.status === 'fulfilled') setProposals(proposalRes.value.data.data || []);
      if (taskRes.status === 'fulfilled') setTasks(taskRes.value.data.data || []);
      if (contractRes.status === 'fulfilled') setContracts(contractRes.value.data.data || []);
    }).catch(() => {
      message.error('Không thể tải dữ liệu tổng quan quy trình.');
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const data = useMemo(() => {
    const merged = [
      ...proposals.map((item) => mapProposal(item, nowMs)),
      ...tasks.map((item) => mapTask(item, nowMs)),
      ...contracts.map((item) => mapContract(item, nowMs)),
      ...workflows.map((item) => mapWorkflow(item, nowMs)),
      ...approvalRequests.map((item) => mapApprovalRequest(item, nowMs)),
    ];
    return merged.sort((left, right) => (parseDate(right.submittedDate)?.getTime() || 0) - (parseDate(left.submittedDate)?.getTime() || 0));
  }, [approvalRequests, contracts, nowMs, proposals, tasks, workflows]);

  const pendingCount = data.filter((item) => item.status === 'Chờ xử lý' || item.status === 'Chờ bổ sung').length;
  const overdueCount = data.filter((item) => item.status === 'Chờ xử lý' && item.slaRemainingHours <= 4).length;
  const completedCount = data.filter((item) => item.status === 'Đã hoàn thành').length;
  const pendingBudget = data.filter((item) => item.status === 'Chờ xử lý').reduce((sum, item) => sum + Number(item.budgetAmount || 0), 0);

  const sourceBreakdown = useMemo(() => {
    const totals = new Map<string, number>();
    data.forEach((item) => totals.set(item.source, (totals.get(item.source) || 0) + 1));
    const total = data.length || 1;
    return Array.from(totals.entries()).map(([name, count], index) => ({
      name,
      count,
      percent: Math.round((count / total) * 100),
      color: ['#009688', '#2563EB', '#D97706', '#7C3AED'][index % 4],
    }));
  }, [data]);

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hồ sơ đang chờ xử lý</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: pendingCount > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {pendingCount} hồ sơ
          </div>
          <div style={{ fontSize: 11.5, color: pendingCount > 0 ? '#DC2626' : '#16A34A', marginTop: 2 }}>
            Tổng hợp từ đề xuất, task, hợp đồng và workflow nội bộ
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Sắp chạm SLA</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: overdueCount > 0 ? '#D97706' : '#009688', marginTop: 4 }}>
            {overdueCount} hồ sơ
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>
            Tính theo thời điểm hiện tại: {new Date(nowMs).toLocaleDateString('vi-VN')}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Ngân sách đang chờ phê duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {pendingBudget.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>
            Chỉ tính hồ sơ có giá trị tiền từ dữ liệu thật
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã hoàn tất</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {completedCount} hồ sơ
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>
            Hoàn thành theo trạng thái của từng nghiệp vụ nguồn
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0F172A' }}>
              <BranchesOutlined style={{ color: '#009688' }} /> Phân Bổ Hồ Sơ Theo Nguồn Nghiệp Vụ
            </h3>
            <span style={{ fontSize: 12, color: '#64748B' }}>Dữ liệu hiện tại</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {sourceBreakdown.length === 0 ? (
              <div style={{ fontSize: 13, color: '#64748B' }}>Chưa có hồ sơ quy trình để tổng hợp.</div>
            ) : sourceBreakdown.map((item) => (
              <div key={item.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, gap: 12 }}>
                  <span><strong>{item.name}</strong></span>
                  <span style={{ fontWeight: 700, color: item.color }}>{item.count} hồ sơ ({item.percent}%)</span>
                </div>
                <Progress percent={item.percent} strokeColor={item.color} showInfo={false} />
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0, color: '#0F172A' }}>
              <ClockCircleOutlined style={{ color: '#2563EB' }} /> Tín Hiệu Vận Hành
            </h3>
            <Tag color="blue">Tổng hợp</Tag>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12.5 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#F8FAFC', borderRadius: 6 }}>
              <span><ThunderboltOutlined style={{ color: '#3B82F6', marginRight: 6 }} /><strong>Đang xử lý</strong></span>
              <Tag color={pendingCount > 0 ? 'processing' : 'success'} style={{ margin: 0, fontWeight: 700 }}>{pendingCount}</Tag>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#F8FAFC', borderRadius: 6 }}>
              <span><WarningOutlined style={{ color: '#F59E0B', marginRight: 6 }} /><strong>Sắp chạm SLA</strong></span>
              <Tag color={overdueCount > 0 ? 'warning' : 'success'} style={{ margin: 0, fontWeight: 700 }}>{overdueCount}</Tag>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#F8FAFC', borderRadius: 6 }}>
              <span><DollarOutlined style={{ color: '#10B981', marginRight: 6 }} /><strong>Ngân sách chờ duyệt</strong></span>
              <Tag color="success" style={{ margin: 0, fontWeight: 700 }}>{pendingBudget.toLocaleString('vi-VN')} ₫</Tag>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 10px', background: '#F8FAFC', borderRadius: 6 }}>
              <span><BellOutlined style={{ color: '#6366F1', marginRight: 6 }} /><strong>Đã hoàn thành</strong></span>
              <Tag color="success" style={{ margin: 0, fontWeight: 700 }}>{completedCount}</Tag>
            </div>
          </div>
        </div>
      </div>

      <div className="transparent-table-card" style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
              <FileProtectOutlined style={{ color: '#009688' }} /> Danh Sách Hồ Sơ Quy Trình
            </h3>
            <span style={{ fontSize: 12, color: '#64748B' }}>Luồng tổng hợp từ các phân hệ đang có dữ liệu thật</span>
          </div>

          <Button
            type="primary"
            icon={<SendOutlined />}
            onClick={() => navigate('/admin/workflows/requests')}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Mở danh sách xử lý
          </Button>
        </div>

        <KTable
          dataSource={data}
          columns={[
            {
              title: 'Mã hồ sơ',
              key: 'code',
              width: 160,
              render: (_: any, r: LiveRequestItem) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <FileProtectOutlined /> {r.requestCode}
                  </span>
                  <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>{r.source}</div>
                </div>
              ),
            },
            {
              title: 'Tiêu đề & nguồn',
              key: 'title',
              render: (_: any, r: LiveRequestItem) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.title}</strong>
                  <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
                    Nhóm: <strong style={{ color: '#2563EB' }}>{r.category}</strong> · Đơn vị: <strong>{r.department}</strong>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#475569', marginTop: 2 }}>
                    Người tạo: <strong>{r.requester}</strong> ({r.submittedDate || 'Chưa có ngày tạo'})
                  </div>
                </div>
              ),
            },
            {
              title: 'Tiến độ',
              key: 'steps',
              width: 180,
              render: (_: any, r: LiveRequestItem) => {
                const pct = Math.round((r.currentStep / r.totalSteps) * 100);
                return (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                      <span style={{ fontWeight: 600 }}>Bước {r.currentStep}/{r.totalSteps}</span>
                      <span style={{ color: '#009688', fontWeight: 700 }}>{pct}%</span>
                    </div>
                    <Progress percent={pct} size="small" strokeColor="#009688" showInfo={false} />
                    <div style={{ fontSize: 11, color: '#475569', marginTop: 3 }}>
                      {r.currentApprover}
                    </div>
                  </div>
                );
              },
            },
            {
              title: 'SLA suy ra',
              key: 'sla',
              width: 140,
              render: (_: any, r: LiveRequestItem) => (
                <div>
                  <div style={{ fontWeight: 700, color: r.slaRemainingHours <= 4 && r.status === 'Chờ xử lý' ? '#DC2626' : '#0F172A', fontSize: 13 }}>
                    {r.status === 'Chờ xử lý' ? `${r.slaRemainingHours} giờ` : r.status === 'Chờ bổ sung' ? 'Chờ người gửi' : 'Hoàn tất'}
                  </div>
                  {r.status === 'Chờ xử lý' && r.slaRemainingHours <= 4 && (
                    <Tag icon={<WarningOutlined />} color="error" style={{ marginTop: 2, fontSize: 10.5 }}>Ưu tiên xử lý</Tag>
                  )}
                </div>
              ),
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              width: 140,
              render: (value: LiveRequestItem['status']) => (
                <Tag color={value === 'Đã hoàn thành' ? 'success' : value === 'Đã từ chối' ? 'error' : value === 'Chờ bổ sung' ? 'warning' : 'processing'}>
                  {value}
                </Tag>
              ),
            },
            {
              title: 'Thao tác',
              key: 'act',
              width: 150,
              render: (_: any, r: LiveRequestItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setDrawerOpen(true);
                    }}
                  >
                    Xem
                  </Button>
                  <Button size="small" onClick={() => navigate(r.route)}>
                    Mở
                  </Button>
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 5 }}
        />
      </div>

      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 8 }}>
            <AppstoreOutlined style={{ color: '#2563EB' }} /> Nhóm Quy Trình Đang Có Dữ Liệu
          </h3>
          <Button type="link" onClick={() => navigate('/admin/workflows/list')} style={{ color: '#009688', fontWeight: 600, padding: 0 }}>
            Xem cấu hình quy trình
          </Button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          {sourceBreakdown.map((item) => (
            <div
              key={item.name}
              style={{
                border: '1px solid #E2E8F0',
                borderRadius: 8,
                padding: 14,
                background: '#F8FAFC',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: item.color }}>{item.name}</span>
                <Tag color="blue" style={{ margin: 0, fontSize: 10.5 }}>{item.count} hồ sơ</Tag>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A', marginTop: 4 }}>
                {item.percent}% tỷ trọng
              </div>
              <div style={{ marginTop: 10 }}>
                <Progress percent={item.percent} strokeColor={item.color} showInfo={false} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <Drawer
        title="Chi tiết hồ sơ quy trình"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={640}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.requestCode}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.title}</div>
                </div>
                <Tag color={detailItem.status === 'Đã hoàn thành' ? 'success' : detailItem.status === 'Đã từ chối' ? 'error' : detailItem.status === 'Chờ bổ sung' ? 'warning' : 'processing'}>
                  {detailItem.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Nguồn: <strong>{detailItem.source}</strong> · Đơn vị: <strong>{detailItem.department}</strong>
              </div>
              {detailItem.budgetAmount ? (
                <div style={{ fontSize: 13, color: '#16A34A', fontWeight: 800, marginTop: 4 }}>
                  Giá trị liên quan: {detailItem.budgetAmount.toLocaleString('vi-VN')} ₫
                </div>
              ) : null}
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>
                <BranchesOutlined /> Dòng trạng thái hồ sơ
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {detailItem.timeline.map((step, index) => (
                  <div key={`${step.stepName}-${index}`} style={{ display: 'flex', gap: 12 }}>
                    <div style={{ width: 10, marginTop: 6, borderRadius: '50%', background: step.status === 'completed' ? '#16A34A' : step.status === 'in_progress' ? '#2563EB' : '#CBD5E1', height: 10 }} />
                    <div style={{ flex: 1, background: step.status === 'in_progress' ? '#EFF6FF' : '#F8FAFC', padding: 10, borderRadius: 6, border: `1px solid ${step.status === 'in_progress' ? '#BFDBFE' : '#E2E8F0'}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <strong style={{ fontSize: 13, color: '#0F172A' }}>{step.stepName}</strong>
                        <span style={{ fontSize: 11, color: '#64748B' }}>{step.actionTime}</span>
                      </div>
                      <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                        Người xử lý: <strong>{step.approver}</strong>
                      </div>
                      {step.note ? (
                        <div style={{ fontSize: 11.5, color: '#166534', background: '#F0FDF4', padding: '4px 8px', borderRadius: 4, marginTop: 6 }}>
                          {step.note}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => navigate(detailItem.route)}>Mở nguồn dữ liệu</Button>
              <Button
                type="primary"
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => navigate(detailItem.route)}
              >
                Theo dõi hồ sơ
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
