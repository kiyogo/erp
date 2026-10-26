import React, { useState, useEffect, useMemo } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  UsergroupAddOutlined,
  CheckCircleOutlined,
  ScheduleOutlined,
  EyeOutlined,
  UserOutlined,
  DollarOutlined,
  CalendarOutlined,
  ApartmentOutlined,
  SolutionOutlined,
  SendOutlined,
  TeamOutlined,
  RocketOutlined,
  AimOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer } from '../../custom-ui';
import { useSearchParams } from 'react-router-dom';
import { collectionsApi, filesApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { downloadFile, generateValidXlsxBlob } from '../../utils/fileExporter';

export interface EnterpriseJobOpening {
  key: string;
  jobCode: string;
  title: string;
  department: string;
  level: 'Fresher' | 'Junior' | 'Senior' | 'Lead' | 'Manager';
  headcountNeeded: number;
  candidatesApplied: number;
  interviewedCount: number;
  offeredCount: number;
  hiredCount?: number;
  createdAt?: string;
  salaryRange: string;
  deadline: string;
  recruiter: string;
  experienceReq?: string;
  status: 'Đang tuyển dụng' | 'Tạm dừng' | 'Đã đóng' | 'Đã đủ chỉ tiêu';
}

export const recruitmentStages = [
  { value: 'applied', label: 'Tiếp nhận CV' },
  { value: 'screening', label: 'Sàng lọc' },
  { value: 'interview', label: 'Phỏng vấn' },
  { value: 'offer', label: 'Đã gửi Offer' },
  { value: 'hired', label: 'Đã nhận việc' },
  { value: 'rejected', label: 'Không tiếp tục' },
] as const;
type RecruitmentStage = typeof recruitmentStages[number]['value'];

export interface RecruitmentCandidate {
  key: string;
  jobKey: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  status: RecruitmentStage;
  appliedAt: string;
  interviewAt: string;
  interviewer: string;
  offerDate: string;
  hiredDate: string;
  notes: string;
  cvFileId?: string;
  cvFileName?: string;
  history: Array<{ status: RecruitmentStage; at: string }>;
}

const stageTransitions: Record<RecruitmentStage, RecruitmentStage[]> = {
  applied: ['screening', 'rejected'], screening: ['interview', 'rejected'],
  interview: ['offer', 'rejected'], offer: ['hired', 'rejected'], hired: [], rejected: [],
};

export function validateRecruitmentCandidate(candidate: RecruitmentCandidate, previous?: RecruitmentCandidate): string {
  if (!candidate.name?.trim() || !candidate.jobKey) return 'Vui lòng nhập tên ứng viên và chọn vị trí tuyển dụng.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate.email)) return 'Email ứng viên không đúng định dạng.';
  const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(candidate.appliedAt)) return 'Ngày tiếp nhận không hợp lệ.';
  if (!stageTransitions[candidate.status]) return 'Giai đoạn tuyển dụng không hợp lệ.';
  if (!previous && candidate.status !== 'applied') return 'Ứng viên mới phải bắt đầu ở giai đoạn tiếp nhận CV.';
  if (previous && previous.status !== candidate.status && !stageTransitions[previous.status]?.includes(candidate.status)) return 'Không thể chuyển giai đoạn tuyển dụng này.';
  if (candidate.offerDate && !['offer', 'hired', 'rejected'].includes(candidate.status)) return 'Chỉ ghi nhận ngày gửi Offer khi chuyển sang giai đoạn Offer.';
  if (candidate.hiredDate && candidate.status !== 'hired') return 'Chỉ ghi nhận ngày nhận việc khi chuyển sang giai đoạn nhận việc.';
  if (candidate.interviewAt && (Number.isNaN(Date.parse(candidate.interviewAt)) || candidate.interviewAt.slice(0, 10) < candidate.appliedAt)) return 'Lịch phỏng vấn không được trước ngày tiếp nhận.';
  if (candidate.status === 'interview' && (!candidate.interviewAt || !candidate.interviewer?.trim())) return 'Vui lòng nhập lịch phỏng vấn và người phỏng vấn.';
  if (candidate.offerDate && (!validDate(candidate.offerDate) || candidate.offerDate < candidate.appliedAt || (candidate.interviewAt && candidate.offerDate < candidate.interviewAt.slice(0, 10)))) return 'Ngày gửi Offer không được trước ngày tiếp nhận hoặc phỏng vấn.';
  if ((candidate.status === 'offer' || candidate.status === 'hired') && !candidate.offerDate) return 'Vui lòng nhập ngày gửi Offer.';
  if (candidate.hiredDate && (!validDate(candidate.hiredDate) || candidate.hiredDate < (candidate.offerDate || candidate.appliedAt))) return 'Ngày nhận việc không được trước ngày gửi Offer.';
  if (candidate.status === 'hired' && !candidate.hiredDate) return 'Vui lòng nhập ngày nhận việc.';
  return '';
}

export function recruitmentMetrics(candidates: RecruitmentCandidate[]) {
  const interviewed = candidates.filter(candidate => candidate.interviewAt || candidate.history?.some(item => item.status === 'interview')).length;
  const offered = candidates.filter(candidate => candidate.offerDate || ['offer', 'hired'].includes(candidate.status)).length;
  const hired = candidates.filter(candidate => candidate.status === 'hired');
  const durations = hired.map(candidate => (Date.parse(candidate.hiredDate) - Date.parse(candidate.appliedAt)) / 86400000).filter(value => Number.isFinite(value) && value >= 0);
  return {
    applied: candidates.length, interviewed, offered, hired: hired.length,
    acceptance: offered ? Math.round(hired.filter(candidate => candidate.offerDate).length / offered * 100) : null,
    daysToHire: durations.length ? Math.round(durations.reduce((total, value) => total + value, 0) / durations.length * 10) / 10 : null,
  };
}

export const RecruitmentModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseJobOpening[]>([]);
  const [candidates, setCandidates] = useState<RecruitmentCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [searchParams, setSearchParams] = useSearchParams();
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [posOptions, setPosOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<EnterpriseJobOpening | null>(null);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedJob, setSelectedJob] = useState<EnterpriseJobOpening | null>(null);
  const [candidateListOpen, setCandidateListOpen] = useState(false);
  const [candidateSearch, setCandidateSearch] = useState('');
  const [candidateStage, setCandidateStage] = useState('all');
  const [candidateModalOpen, setCandidateModalOpen] = useState(false);
  const [editingCandidate, setEditingCandidate] = useState<RecruitmentCandidate | null>(null);
  const [candidateForm] = Form.useForm();
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [candidateStatus, setCandidateStatus] = useState<RecruitmentStage>('applied');
  const metrics = useMemo(() => recruitmentMetrics(candidates), [candidates]);
  const jobs = useMemo(() => data.map(job => {
    const counts = recruitmentMetrics(candidates.filter(candidate => candidate.jobKey === job.key));
    return { ...job, candidatesApplied: counts.applied, interviewedCount: counts.interviewed, offeredCount: counts.offered, hiredCount: counts.hired };
  }), [data, candidates]);
  const currentJob = jobs.find(job => job.key === selectedJob?.key) || selectedJob;

  const loadData = async () => {
    setLoading(true);
    try {
      const [list, people, orgUnits, positions] = await Promise.all([
        dataService.refreshGenericData('hr_job_openings'),
        dataService.refreshGenericData('hr_recruitment_candidates'),
        dataService.fetchOrgUnitsList(),
        dataService.fetchDropdownOptions('positions'),
      ]);
      setData(list.map((item: any) => ({ ...item, key: item.key || item.id })));
      setCandidates(people.map((item: any) => ({ ...item, key: item.key || item.id })));
      setDeptOptions(orgUnits.map((u) => ({ label: u, value: u })));
      setPosOptions(positions.filter((p) => p.isActive !== false).map((p) => ({ label: p.name, value: p.name })));
      setLoadError('');
    } catch (error: any) {
      setLoadError(error?.response?.data?.message || 'Không thể tải dữ liệu tuyển dụng. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const job = data.find(item => item.key === searchParams.get('job'));
    if (job) { setSelectedJob(job); setDrawerOpen(true); }
  }, [data, searchParams]);

  const totalNeeded = jobs.filter((job) => job.status === 'Đang tuyển dụng').reduce((sum, job) => sum + Math.max(0, Number(job.headcountNeeded) - (job.hiredCount || 0)), 0);
  const totalCVs = metrics.applied;
  const totalHired = metrics.hired;

  const handleCreate = async (values: any) => {
    if (saving) return;
    if (!values.jobCode?.trim() || !values.title?.trim() || !values.department?.trim() || !values.deadline || !Number.isInteger(Number(values.headcountNeeded)) || Number(values.headcountNeeded) < 1) {
      message.error('Vui lòng nhập đủ mã, vị trí, phòng ban, hạn nộp và chỉ tiêu là số nguyên dương.'); return;
    }
    if (data.some(job => job.key !== editingJob?.key && job.jobCode?.toLowerCase() === values.jobCode.trim().toLowerCase())) { message.error('Mã vị trí đã tồn tại.'); return; }
    if (editingJob && Number(values.headcountNeeded) < (jobs.find(job => job.key === editingJob.key)?.hiredCount || 0)) { message.error('Chỉ tiêu không được nhỏ hơn số ứng viên đã nhận việc.'); return; }
    const id = editingJob?.key || `job-${crypto.randomUUID()}`;
    const newJob: EnterpriseJobOpening = {
      ...editingJob,
      ...values,
      key: id,
      jobCode: values.jobCode.trim(), title: values.title.trim(), department: values.department.trim(),
      headcountNeeded: Number(values.headcountNeeded) || 1,
      candidatesApplied: 0,
      interviewedCount: 0,
      offeredCount: 0,
      status: editingJob?.status || 'Đang tuyển dụng',
      createdAt: editingJob?.createdAt || new Date().toISOString(),
    };
    try {
      setSaving(true);
      if (editingJob) await collectionsApi.update('hr_job_openings', id, newJob);
      else await collectionsApi.create('hr_job_openings', newJob, id);
      message.success(`${editingJob ? 'Đã cập nhật' : 'Đã đăng'} tin tuyển dụng: ${values.title} (${values.jobCode})`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể đăng tin tuyển dụng.');
    } finally { setSaving(false); }
  };

  const changeJobStatus = async (status: EnterpriseJobOpening['status']) => {
    if (!currentJob || saving) return;
    setSaving(true);
    try {
      await collectionsApi.update('hr_job_openings', currentJob.key, { status });
      setData(previous => previous.map(job => job.key === currentJob.key ? { ...job, status } : job));
      message.success('Đã cập nhật trạng thái vị trí tuyển dụng.');
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể cập nhật trạng thái.'); }
    finally { setSaving(false); }
  };

  const openCandidate = (candidate?: RecruitmentCandidate) => {
    candidateForm.resetFields();
    setEditingCandidate(candidate || null); setCvFile(null); setCandidateStatus(candidate?.status || 'applied');
    candidateForm.setFieldsValue(candidate || { appliedAt: new Date().toLocaleDateString('en-CA'), status: 'applied' });
    setCandidateModalOpen(true);
  };

  const saveCandidate = async (values: any) => {
    if (!currentJob || saving) return;
    if (!editingCandidate && currentJob.status !== 'Đang tuyển dụng') { message.error('Vị trí hiện không tiếp nhận ứng viên mới.'); return; }
    const status = (values.status || candidateStatus) as RecruitmentStage;
    const candidate: RecruitmentCandidate = {
      ...editingCandidate, ...values,
      key: editingCandidate?.key || `candidate-${crypto.randomUUID()}`, jobKey: currentJob.key,
      name: String(values.name || '').trim(), email: String(values.email || '').trim().toLowerCase(),
      phone: String(values.phone || '').trim(), source: String(values.source || '').trim(),
      status, appliedAt: values.appliedAt || '', interviewAt: values.interviewAt || '',
      interviewer: String(values.interviewer || '').trim(), offerDate: values.offerDate || '', hiredDate: values.hiredDate || '',
      notes: String(values.notes || '').trim(),
      history: editingCandidate?.history || [{ status: 'applied', at: new Date().toISOString() }],
    };
    const validation = validateRecruitmentCandidate(candidate, editingCandidate || undefined);
    if (validation) { message.error(validation); return; }
    if (candidates.some(item => item.key !== candidate.key && item.jobKey === candidate.jobKey && item.email?.toLowerCase() === candidate.email)) { message.error('Email này đã có hồ sơ ở vị trí đang chọn.'); return; }
    if (editingCandidate && editingCandidate.status !== status) candidate.history = [...candidate.history, { status, at: new Date().toISOString() }];
    let uploadedFileId = '';
    let saved = false;
    setSaving(true);
    try {
      if (cvFile) {
        const workspace = await filesApi.list(null, false, true);
        const upload = await filesApi.upload(cvFile, cvFile.name, workspace.data.context.parentId, 'hr_recruitment');
        uploadedFileId = upload.data.file.id;
        candidate.cvFileId = uploadedFileId; candidate.cvFileName = cvFile.name;
      }
      const response = editingCandidate
        ? await collectionsApi.update('hr_recruitment_candidates', candidate.key, candidate)
        : await collectionsApi.create('hr_recruitment_candidates', candidate, candidate.key);
      saved = true;
      const record = response.data.record as RecruitmentCandidate;
      setCandidates(previous => editingCandidate ? previous.map(item => item.key === candidate.key ? record : item) : [record, ...previous]);
      setCandidateModalOpen(false); candidateForm.resetFields(); setCvFile(null);
      message.success(editingCandidate ? 'Đã lưu hồ sơ và tiến độ ứng viên.' : 'Đã tiếp nhận hồ sơ ứng viên.');
    } catch (error: any) {
      if (uploadedFileId && !saved) await filesApi.remove(uploadedFileId).catch(() => message.warning('CV đã tải lên kho tệp nhưng chưa gắn được vào hồ sơ.'));
      message.error(error?.response?.data?.message || 'Không thể lưu hồ sơ ứng viên.');
    } finally { setSaving(false); }
  };

  const exportReport = () => {
    const rows: Array<Array<string | number>> = [
      ['BÁO CÁO TUYỂN DỤNG', new Date().toLocaleString('vi-VN')],
      ['Mã vị trí', 'Vị trí', 'Phòng ban', 'Chỉ tiêu', 'CV tiếp nhận', 'Phỏng vấn', 'Đã gửi Offer', 'Đã nhận việc', 'Hạn nộp', 'Trạng thái'],
      ...filteredData.map(job => [job.jobCode, job.title, job.department, job.headcountNeeded, job.candidatesApplied, job.interviewedCount, job.offeredCount, job.hiredCount || 0, job.deadline, job.status]),
      [], ['ỨNG VIÊN'], ['Vị trí', 'Họ tên', 'Email', 'Điện thoại', 'Nguồn', 'Giai đoạn', 'Tiếp nhận', 'Lịch phỏng vấn', 'Người phỏng vấn', 'Ngày Offer', 'Ngày nhận việc', 'Ghi chú'],
      ...candidates.filter(candidate => filteredData.some(job => job.key === candidate.jobKey)).map(candidate => [
        jobs.find(job => job.key === candidate.jobKey)?.jobCode || '', candidate.name, candidate.email, candidate.phone, candidate.source,
        recruitmentStages.find(stage => stage.value === candidate.status)?.label || candidate.status, candidate.appliedAt,
        candidate.interviewAt, candidate.interviewer, candidate.offerDate, candidate.hiredDate, candidate.notes,
      ]),
    ];
    downloadFile(`Bao_cao_tuyen_dung_${new Date().toISOString().slice(0, 10)}.xlsx`, generateValidXlsxBlob(rows));
    message.success('Đã tải báo cáo tuyển dụng theo bộ lọc hiện tại.');
  };

  const copyJobLink = async () => {
    if (!currentJob) return;
    const url = new URL(window.location.href);
    url.searchParams.set('job', currentJob.key);
    try {
      await navigator.clipboard.writeText(url.toString());
      message.success('Đã sao chép liên kết nội bộ; người xem cần quyền quản trị tuyển dụng.');
    } catch { message.error('Trình duyệt chưa cho phép sao chép. Mở vị trí rồi sao chép địa chỉ trên thanh trình duyệt.'); }
  };

  const closeJob = () => {
    setDrawerOpen(false); setCandidateListOpen(false);
    if (searchParams.has('job')) { const next = new URLSearchParams(searchParams); next.delete('job'); setSearchParams(next, { replace: true }); }
  };

  const viewJob = (job: EnterpriseJobOpening) => {
    setSelectedJob(job); setDrawerOpen(true); setCandidateListOpen(false);
    const next = new URLSearchParams(searchParams); next.set('job', job.key); setSearchParams(next, { replace: true });
  };

  const downloadCv = async (candidate: RecruitmentCandidate) => {
    if (!candidate.cvFileId) return;
    try { const response = await filesApi.download(candidate.cvFileId); downloadFile(candidate.cvFileName || 'CV', response.data); }
    catch (error: any) { message.error(error?.response?.data?.message || 'Không thể tải CV.'); }
  };

  const visibleCandidates = candidates.filter(candidate => candidate.jobKey === currentJob?.key && (candidateStage === 'all' || candidate.status === candidateStage)
    && `${candidate.name} ${candidate.email} ${candidate.phone} ${candidate.source}`.toLowerCase().includes(candidateSearch.trim().toLowerCase()));

  const candidateColumns = [
    { title: 'Ứng viên', key: 'name', render: (_: unknown, candidate: RecruitmentCandidate) => <div><strong>{candidate.name}</strong><div>{candidate.email}</div><div>{candidate.phone}</div></div> },
    { title: 'Giai đoạn / lịch hẹn', key: 'status', render: (_: unknown, candidate: RecruitmentCandidate) => <div><Tag color={candidate.status === 'hired' ? 'success' : candidate.status === 'rejected' ? 'error' : 'processing'}>{recruitmentStages.find(stage => stage.value === candidate.status)?.label || candidate.status}</Tag><div>{candidate.interviewAt?.replace('T', ' ') || 'Chưa có lịch phỏng vấn'}</div></div> },
    { title: 'Thao tác', key: 'actions', render: (_: unknown, candidate: RecruitmentCandidate) => <div style={{ display: 'flex', gap: 6 }}><Button size="small" onClick={() => openCandidate(candidate)}>Hồ sơ / Cập nhật</Button>{candidate.cvFileId && <Button size="small" icon={<DownloadOutlined />} onClick={() => void downloadCv(candidate)}>CV</Button>}</div> },
  ];

  const filteredData = jobs.filter((item) => {
    const matchStatus =
      statusFilter === 'all' ||
      item.status === statusFilter ||
      (statusFilter === 'Đã đủ chỉ tiêu' && (item.status === 'Đã đủ chỉ tiêu' || item.status.includes('Đã đóng')));
    const matchSearch =
      (item.jobCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.title || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.recruiter || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Vị trí tuyển dụng',
      key: 'title',
      render: (_: any, r: EnterpriseJobOpening) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <SolutionOutlined style={{ color: '#009688', fontSize: 16 }} />
            {r.title}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2, fontWeight: 600 }}>
            Mã: <code>{r.jobCode}</code> · Cấp bậc: <Tag color="blue" style={{ fontSize: 10.5 }}>{r.level}</Tag> · {r.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Tiến độ tuyển dụng',
      key: 'progress',
      width: 180,
      render: (_: any, r: EnterpriseJobOpening) => {
        const percent = r.headcountNeeded > 0 ? Math.min(100, Math.round(((r.hiredCount || 0) / r.headcountNeeded) * 100)) : 0;
        return (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, marginBottom: 2 }}>
              <span>Đã tuyển: <strong>{r.hiredCount || 0}/{r.headcountNeeded}</strong></span>
              <span style={{ color: '#009688', fontWeight: 700 }}>{percent}%</span>
            </div>
            <Progress percent={percent} size="small" strokeColor="#009688" showInfo={false} />
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>
              {r.candidatesApplied} CV nộp · {r.interviewedCount} Phỏng vấn
            </div>
          </div>
        );
      },
    },
    {
      title: 'Mức lương dự kiến',
      dataIndex: 'salaryRange',
      key: 'salaryRange',
      width: 170,
      render: (sal: string) => <span style={{ fontWeight: 700, color: '#16A34A', fontSize: 13 }}>{sal}</span>,
    },
    {
      title: 'Hạn nộp & HR phụ trách',
      key: 'deadline',
      width: 180,
      render: (_: any, r: EnterpriseJobOpening) => (
        <div>
          <div style={{ fontSize: 12, color: '#0F172A', fontWeight: 600 }}>
            <CalendarOutlined /> {r.deadline}
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 1 }}>
            HR: <strong style={{ color: '#009688' }}>{r.recruiter}</strong>
          </div>
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
        if (status === 'Đang tuyển dụng') color = 'success';
        if (status === 'Đã đủ chỉ tiêu' || status.includes('Đã đóng')) color = 'processing';
        if (status === 'Tạm dừng') color = 'warning';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 120,
      render: (_: any, record: EnterpriseJobOpening) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => viewJob(record)}
        >
          Phễu CV
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chỉ tiêu cần tuyển đang mở</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {totalNeeded} Chỉ tiêu
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>{jobs.filter(job => job.status === 'Đang tuyển dụng').length} vị trí đang tiếp nhận hồ sơ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng lượng hồ sơ CV tiếp nhận</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {totalCVs} Ứng viên
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>{new Set(candidates.map(candidate => candidate.source).filter(Boolean)).size} nguồn ứng tuyển đã ghi nhận</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Nhân sự đã tuyển &amp; Nhận việc</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalHired} Ứng viên đỗ
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tỷ lệ nhận việc / Offer: {metrics.acceptance === null ? 'Chưa có Offer' : `${metrics.acceptance}%`}</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thời gian tuyển dụng trung bình</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {metrics.daysToHire === null ? 'Chưa có dữ liệu' : `${metrics.daysToHire} Ngày`}
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Từ ngày tiếp nhận CV đến ngày nhận việc thực tế</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả vị trí' },
            { key: 'Đang tuyển dụng', label: 'Đang tuyển', icon: <RocketOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Đã đủ chỉ tiêu', label: 'Đã đủ chỉ tiêu' },
            { key: 'Tạm dừng', label: 'Tạm dừng' },
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
            placeholder="Tìm theo mã vị trí, chức danh, phòng ban..."
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
              setEditingJob(null);
              form.resetFields();
              form.setFieldsValue({
                jobCode: `TD-${Date.now()}`,
                level: 'Junior',
                headcountNeeded: 1,
                deadline: new Date(Date.now() + 30 * 86400000).toISOString().substring(0, 10),
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Đăng tin tuyển dụng
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} loading={loading} />
      </div>

      {/* MODAL: Thêm vị trí mới */}
      <Modal
        title={editingJob ? 'Cập Nhật Tin Tuyển Dụng' : 'Đăng Tin Tuyển Dụng Vị Trí Mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="jobCode" label="Mã vị trí" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban tiếp nhận" rules={[{ required: true }]}>
              {deptOptions.length ? <Select options={deptOptions} placeholder="Chọn phòng ban..." /> : <Input placeholder="Nhập phòng ban tiếp nhận" />}
            </Form.Item>
            <Form.Item name="level" label="Cấp bậc vị trí">
              <Select
                options={[
                  { label: 'Fresher', value: 'Fresher' },
                  { label: 'Junior', value: 'Junior' },
                  { label: 'Senior', value: 'Senior' },
                  { label: 'Lead / Chuyên gia', value: 'Lead' },
                  { label: 'Manager / Quản lý', value: 'Manager' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="title" label="Tên vị trí / Chức danh tuyển dụng" rules={[{ required: true }]}>
            {posOptions.length > 0 ? (
              <Select options={posOptions} placeholder="Chọn chức danh tuyển dụng..." />
            ) : (
              <Input placeholder="Ví dụ: Kỹ Sư Cloud Architecture & Kubernetes" />
            )}
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="headcountNeeded" label="Chỉ tiêu số lượng" rules={[{ required: true }]}>
              <Input type="number" min={1} />
            </Form.Item>
            <Form.Item name="salaryRange" label="Khung lương thỏa thuận">
              <Input placeholder="Ví dụ: 30 - 45 Triệu ₫" />
            </Form.Item>
          </div>

          <Form.Item name="experienceReq" label="Yêu cầu kinh nghiệm & Kỹ năng cốt lõi">
            <Input placeholder="Ví dụ: 3+ năm làm việc với Docker/K8s, CI/CD và kiến trúc Microservices" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="recruiter" label="HR Phụ trách tuyển dụng">
              <Input />
            </Form.Item>
            <Form.Item name="deadline" label="Hạn chót nhận hồ sơ" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingJob ? 'Lưu tin tuyển dụng' : 'Ban hành tin tuyển dụng'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Phễu Tuyển Dụng */}
      <Drawer
        title="Phễu Ứng Viên &amp; Tiến Độ Tuyển Dụng"
        open={drawerOpen}
        onClose={closeJob}
        width={620}
      >
        {currentJob && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{currentJob.jobCode}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {currentJob.title}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phòng ban: <strong>{currentJob.department}</strong> · Cấp bậc: <Tag color="blue">{currentJob.level}</Tag>
              </div>
              <div style={{ marginTop: 10 }}><Select value={currentJob.status} disabled={saving} onChange={(status) => void changeJobStatus(status)} options={['Đang tuyển dụng', 'Tạm dừng', 'Đã đóng', 'Đã đủ chỉ tiêu'].map(status => ({ value: status, label: status }))} /></div>
              <Button size="small" style={{ marginTop: 10 }} disabled={saving} onClick={() => { setEditingJob(currentJob); form.resetFields(); form.setFieldsValue(currentJob); setModalOpen(true); }}>Chỉnh sửa tin tuyển dụng</Button>
            </div>

            {/* Pipeline Stage Funnel */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>
                Phễu Chuyển Đổi Tuyển Dụng:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, textAlign: 'center' }}>
                <div style={{ background: '#EFF6FF', padding: '10px 6px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#2563EB', fontWeight: 600 }}>1. CV Nộp</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#1D4ED8', marginTop: 2 }}>{currentJob.candidatesApplied}</div>
                </div>
                <div style={{ background: '#FDF4FF', padding: '10px 6px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#9333EA', fontWeight: 600 }}>2. Phỏng vấn</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#7E22CE', marginTop: 2 }}>{currentJob.interviewedCount}</div>
                </div>
                <div style={{ background: '#FEF3C7', padding: '10px 6px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#D97706', fontWeight: 600 }}>3. Gửi Offer</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#B45309', marginTop: 2 }}>{currentJob.offeredCount}</div>
                </div>
                <div style={{ background: '#F0FDF4', padding: '10px 6px', borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#16A34A', fontWeight: 600 }}>4. Nhận việc / Mục tiêu</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#15803D', marginTop: 2 }}>{currentJob.hiredCount || 0}/{currentJob.headcountNeeded}</div>
                </div>
              </div>
            </div>

            {/* Requirements */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Yêu Cầu &amp; Chế Độ Đãi Ngộ:
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><DollarOutlined style={{ color: '#10B981', marginRight: 6 }} />Mức lương: <strong style={{ color: '#16A34A' }}>{currentJob.salaryRange || 'Chưa khai báo'}</strong></div>
                <div><AimOutlined style={{ color: '#EF4444', marginRight: 6 }} />Yêu cầu: <strong>{currentJob.experienceReq || 'Chưa khai báo'}</strong></div>
                <div><CalendarOutlined style={{ color: '#3B82F6', marginRight: 6 }} />Hạn chót: <strong>{currentJob.deadline}</strong></div>
                <div><UserOutlined style={{ color: '#6366F1', marginRight: 6 }} />HR phụ trách: <strong>{currentJob.recruiter || 'Chưa phân công'}</strong></div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                style={{ flex: 1 }}
                onClick={() => void copyJobLink()}
              >
                Copy Link Nội Bộ
              </Button>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => setCandidateListOpen(true)}
              >
                Xem Hồ Sơ Ứng Viên ({currentJob.candidatesApplied})
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <Modal title={`Hồ sơ ứng viên · ${currentJob?.title || ''}`} open={candidateListOpen} onCancel={() => setCandidateListOpen(false)} footer={null} width={900}>
        <div style={{ display: 'flex', gap: 8, margin: '14px 0', flexWrap: 'wrap' }}>
          <Input prefix={<SearchOutlined />} value={candidateSearch} onChange={event => setCandidateSearch(event.target.value)} placeholder="Tìm tên, email, điện thoại, nguồn..." style={{ flex: 1, minWidth: 220 }} />
          <Select value={candidateStage} onChange={setCandidateStage} options={[{ value: 'all', label: 'Tất cả giai đoạn' }, ...recruitmentStages]} style={{ width: 170 }} />
          <Button type="primary" icon={<PlusOutlined />} disabled={currentJob?.status !== 'Đang tuyển dụng' || !!loadError} onClick={() => openCandidate()}>Tiếp nhận ứng viên</Button>
        </div>
        <KTable dataSource={visibleCandidates} columns={candidateColumns} pagination={{ pageSize: 8 }} />
      </Modal>

      <Modal title={editingCandidate ? `Cập nhật hồ sơ · ${editingCandidate.name}` : 'Tiếp nhận hồ sơ ứng viên'} open={candidateModalOpen} onCancel={() => { if (!saving) setCandidateModalOpen(false); }} footer={null} width={640}>
        <Form form={candidateForm} layout="vertical" onFinish={saveCandidate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="name" label="Họ tên ứng viên" rules={[{ required: true }]}><Input maxLength={160} /></Form.Item>
            <Form.Item name="email" label="Email ứng viên" rules={[{ required: true, type: 'email' }]}><Input type="email" maxLength={254} /></Form.Item>
            <Form.Item name="phone" label="Điện thoại"><Input type="tel" maxLength={40} /></Form.Item>
            <Form.Item name="source" label="Nguồn ứng tuyển"><Input maxLength={160} placeholder="Nguồn tiếp nhận thực tế" /></Form.Item>
            <Form.Item name="appliedAt" label="Ngày tiếp nhận CV" rules={[{ required: true }]}><Input type="date" /></Form.Item>
            <Form.Item name="status" label="Giai đoạn" rules={[{ required: true }]}><Select onChange={setCandidateStatus} options={recruitmentStages.filter(stage => stage.value === (editingCandidate?.status || 'applied') || (editingCandidate && stageTransitions[editingCandidate.status]?.includes(stage.value)))} /></Form.Item>
            <Form.Item name="interviewAt" label="Lịch phỏng vấn" rules={[{ required: candidateStatus === 'interview' }]}><Input type="datetime-local" /></Form.Item>
            <Form.Item name="interviewer" label="Người phỏng vấn" rules={[{ required: candidateStatus === 'interview' }]}><Input maxLength={200} /></Form.Item>
            <Form.Item name="offerDate" label="Ngày gửi Offer" rules={[{ required: candidateStatus === 'offer' || candidateStatus === 'hired' }]}><Input type="date" disabled={!['offer', 'hired'].includes(candidateStatus)} /></Form.Item>
            <Form.Item name="hiredDate" label="Ngày nhận việc" rules={[{ required: candidateStatus === 'hired' }]}><Input type="date" disabled={candidateStatus !== 'hired'} /></Form.Item>
          </div>
          <Form.Item name="notes" label="Ghi chú / kết quả phỏng vấn"><Input.TextArea rows={3} maxLength={5000} /></Form.Item>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="recruitment-cv-file" style={{ display: 'block', marginBottom: 6 }}>CV đính kèm</label>
            <input key={`${editingCandidate?.key || 'new'}-${candidateModalOpen}`} id="recruitment-cv-file" type="file" accept=".pdf,.doc,.docx" disabled={saving} onChange={event => {
              const file = event.target.files?.[0] || null;
              if (file && (!/\.(pdf|docx?)$/i.test(file.name) || file.size > 10 * 1024 * 1024)) { message.error('Chọn tệp PDF, DOC hoặc DOCX tối đa 10 MB.'); event.target.value = ''; setCvFile(null); return; }
              setCvFile(file);
            }} />
            {editingCandidate?.cvFileId && <Button size="small" onClick={() => void downloadCv(editingCandidate)}>Tải CV hiện tại: {editingCandidate.cvFileName}</Button>}
          </div>
          {editingCandidate?.history?.length > 0 && <div style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>Lịch sử: {editingCandidate.history.map(item => `${recruitmentStages.find(stage => stage.value === item.status)?.label || item.status} (${new Date(item.at).toLocaleString('vi-VN')})`).join(' → ')}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}><Button disabled={saving} onClick={() => setCandidateModalOpen(false)}>Hủy</Button><Button type="primary" htmlType="submit" loading={saving}>Lưu hồ sơ</Button></div>
        </Form>
      </Modal>
    </div>
  );
};

