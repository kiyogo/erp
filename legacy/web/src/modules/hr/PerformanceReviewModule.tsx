import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  TrophyOutlined,
  StarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  DollarOutlined,
  UserOutlined,
  ApartmentOutlined,
  AuditOutlined,
  CheckOutlined,
  StarFilled,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Progress, Drawer, Card, Tooltip } from '../../custom-ui';

import { useEffect } from 'react';
import { collectionsApi, employeesApi, EnterpriseEmployee } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';

export interface EnterprisePerformanceReview {
  key: string;
  employeeId?: string;
  evaluatorId?: string;
  code: string;
  employeeName: string;
  empCode: string;
  department: string;
  position: string;
  period: string;
  productivityScore?: number | null; // 60%
  disciplineScore?: number | null; // 20%
  innovationScore?: number | null; // 20%
  selfScore?: number | null;
  managerScore: number;
  grade: 'A+ (Xuất sắc)' | 'A (Tốt)' | 'B (Đạt)' | 'C (Cần cải thiện)';
  kpiBonus: number;
  evaluator: string;
  managerComment: string;
  status: 'Đã hoàn tất đánh giá' | 'Chờ phê duyệt điểm';
  approvedBy?: string;
  approvedAt?: string;
}

export function validatePerformanceReview(record: Partial<EnterprisePerformanceReview>): string {
  if (!record.employeeId || !record.evaluatorId) return 'Chọn nhân viên và người đánh giá có trong hệ thống.';
  if (!record.code?.trim() || !record.period?.trim() || !record.department?.trim()) return 'Nhập mã phiếu, kỳ đánh giá và phòng ban.';
  const pillars = [record.productivityScore, record.disciplineScore, record.innovationScore];
  const measured = pillars.filter(value => value !== null && value !== undefined).length;
  if (measured > 0 && measured !== 3) return 'Nhập đủ ba điểm trụ cột hoặc để trống cả ba.';
  for (const [value, maximum] of [[record.selfScore, 100], [record.managerScore, 100], ...pillars.map((value, index) => [value, index === 0 ? 60 : 20])] as const) {
    if (value !== null && value !== undefined && (!Number.isFinite(value) || value < 0 || value > maximum! || Math.abs(value * 100 - Math.round(value * 100)) > 0.00001)) return 'Điểm không hợp lệ hoặc vượt thang điểm cho phép.';
  }
  if (measured === 0 && (record.managerScore === null || record.managerScore === undefined)) return 'Nhập điểm quản lý chấm hoặc đủ ba điểm trụ cột.';
  if (!Number.isSafeInteger(record.kpiBonus) || record.kpiBonus! < 0) return 'Thưởng đề xuất phải là số nguyên không âm.';
  return '';
}

export const PerformanceReviewModule: React.FC = () => {
  const [data, setData] = useState<EnterprisePerformanceReview[]>([]);
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [saving, setSaving] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [loadError, setLoadError] = useState('');
  const [editingReview, setEditingReview] = useState<EnterprisePerformanceReview | null>(null);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [posOptions, setPosOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [gradeFilter, setGradeFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedReviewRef, setSelectedReview] = useState<EnterprisePerformanceReview | null>(null);
  const selectedReview = data.find(record => record.key === selectedReviewRef?.key) || selectedReviewRef;

  const loadData = async () => {
    try {
      const [list, orgUnits, positions, staff] = await Promise.all([
        dataService.refreshGenericData('hr_performance_reviews'),
        dataService.fetchOrgUnitsList(),
        dataService.fetchDropdownOptions('positions'),
        employeesApi.getAll(),
      ]);
      setData(list.map((item: any) => ({ ...item, key: item.key || item.id })));
      setEmployees(staff.data.data);
      setDeptOptions(orgUnits.map((u) => ({ label: u, value: u })));
      setPosOptions(positions.filter((p) => p.isActive !== false).map((p) => ({ label: p.name, value: p.name })));
      setLoadError('');
    } catch (error: any) {
      setLoadError(error?.response?.data?.message || 'Không tải được phiếu đánh giá. Vui lòng tải lại.');
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const totalBonus = data.reduce((sum, item) => sum + (Number(item.kpiBonus) || 0), 0);
  const excellentCount = data.filter((d) => d.grade?.startsWith('A+')).length;
  const scored = data.filter(item => item.managerScore !== null && item.managerScore !== undefined && Number.isFinite(Number(item.managerScore)));
  const avgScore = scored.length ? (scored.reduce((sum, item) => sum + Number(item.managerScore), 0) / scored.length).toFixed(1) : 'Chưa có điểm';

  const handleCreate = async (values: any) => {
    if (saving) return;
    const number = (value: unknown) => value === '' || value === null || value === undefined ? null : Number(value);
    const id = editingReview?.key || `review-${crypto.randomUUID()}`;
    const employee = employees.find(item => item.id === values.employeeId);
    const evaluator = employees.find(item => item.id === values.evaluatorId);
    const newRev: EnterprisePerformanceReview = {
      ...editingReview,
      ...values,
      key: id,
      employeeId: employee?.id, employeeName: employee?.name || '', empCode: employee?.employeeCode || '',
      evaluatorId: evaluator?.id, evaluator: evaluator?.name || '',
      productivityScore: number(values.productivityScore), disciplineScore: number(values.disciplineScore), innovationScore: number(values.innovationScore),
      selfScore: number(values.selfScore), managerScore: number(values.managerScore) as number,
      kpiBonus: values.kpiBonus === '' || values.kpiBonus === undefined ? 0 : Number(values.kpiBonus),
      status: 'Chờ phê duyệt điểm',
    };
    const validation = validatePerformanceReview(newRev);
    if (validation) { message.error(validation); return; }
    try {
      setSaving(true);
      const response = editingReview ? await collectionsApi.update<EnterprisePerformanceReview>('hr_performance_reviews', id, newRev) : await collectionsApi.create('hr_performance_reviews', newRev, id);
      setData(previous => [response.data.record, ...previous.filter(item => item.key !== id)]);
      message.success(`Đã lưu phiếu đánh giá hiệu suất cho: ${employee?.name}`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu phiếu đánh giá.');
    } finally { setSaving(false); }
  };

  const handleApprove = async (record: EnterprisePerformanceReview) => {
    if (busyKey) return;
    try {
      setBusyKey(record.key);
      const response = await collectionsApi.update<EnterprisePerformanceReview>('hr_performance_reviews', record.key, { status: 'Đã hoàn tất đánh giá' });
      setData(previous => previous.map(item => item.key === record.key ? response.data.record : item));
      message.success(`Đã phê duyệt điểm đánh giá cho ${record.employeeName}. Thưởng vẫn là đề xuất.`);
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể cập nhật trạng thái phê duyệt.'); }
    finally { setBusyKey(''); }
  };

  const openReview = (record?: EnterprisePerformanceReview) => {
    setEditingReview(record || null); form.resetFields();
    form.setFieldsValue(record ? { ...record, employeeId: record.employeeId || employees.find(employee => employee.employeeCode === record.empCode)?.id, evaluatorId: record.evaluatorId || employees.find(employee => employee.name === record.evaluator)?.id } : { code: `DG-${Date.now()}`, period: `Quý ${Math.floor(new Date().getMonth() / 3) + 1} / ${new Date().getFullYear()}`, kpiBonus: 0 });
    setModalOpen(true);
  };

  const exportReviews = () => downloadFile('Danh_gia_hieu_suat.xlsx', generateValidXlsxBlob([
    ['Mã phiếu', 'Mã nhân viên', 'Nhân viên', 'Phòng ban', 'Chức danh', 'Kỳ', 'Tự chấm', 'Quản lý', 'Năng suất (60)', 'Kỷ luật (20)', 'Sáng tạo (20)', 'Xếp loại', 'Thưởng đề xuất', 'Người đánh giá', 'Nhận xét', 'Trạng thái', 'Người duyệt', 'Ngày duyệt'],
    ...filteredData.map(record => [record.code, record.empCode, record.employeeName, record.department, record.position, record.period, record.selfScore ?? null, record.managerScore, record.productivityScore ?? null, record.disciplineScore ?? null, record.innovationScore ?? null, record.grade, record.kpiBonus, record.evaluator, record.managerComment || '', record.status, record.approvedBy || '', record.approvedAt || '']),
  ]));
  const printReview = (record: EnterprisePerformanceReview) => downloadFile(`${record.code.replace(/[^a-z0-9_-]/gi, '_')}.pdf`, generateValidPdfBlob('PHIEU DANH GIA HIEU SUAT', `${record.code} | ${record.period}`, [record.employeeName, `${record.position} | ${record.department}`, `Tu cham: ${record.selfScore ?? 'Chua co'}`, `Quan ly: ${record.managerScore} / 100 | ${record.grade}`, `Nang suat: ${record.productivityScore ?? 'Chua co'} / 60`, `Ky luat: ${record.disciplineScore ?? 'Chua co'} / 20`, `Sang tao: ${record.innovationScore ?? 'Chua co'} / 20`, `Nguoi danh gia: ${record.evaluator}`, `Nhan xet: ${record.managerComment || 'Chua co'}`, `Thuong de xuat: ${record.kpiBonus} VND`, `Trang thai: ${record.status}`, `Nguoi duyet: ${record.approvedBy || 'Chua ghi nhan'} | ${record.approvedAt || ''}`, 'Phieu danh gia noi bo, chua tao lenh chi tra hoac chuyen bang luong.']));

  const filteredData = data.filter((item) => {
    const matchGrade = gradeFilter === 'all' || (item.grade || '').includes(gradeFilter) || item.status === gradeFilter;
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.evaluator || '').toLowerCase().includes(searchText.toLowerCase());

    return matchGrade && matchSearch;
  });

  const columns = [
    {
      title: 'Mã phiếu & Nhân viên',
      key: 'name',
      render: (_: any, r: EnterprisePerformanceReview) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{r.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600 }}>
            Mã: <code>{r.code}</code> · {r.position} ({r.department})
          </div>
        </div>
      ),
    },
    {
      title: 'Kỳ đánh giá',
      dataIndex: 'period',
      key: 'period',
      width: 140,
      render: (p: string) => <Tag color="blue">{p}</Tag>,
    },
    {
      title: 'Điểm tự chấm / Quản lý',
      key: 'scores',
      width: 200,
      render: (_: any, r: EnterprisePerformanceReview) => (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5 }}>
            <span style={{ color: '#64748B' }}>Tự: {r.selfScore ?? 'Chưa chấm'}{r.selfScore == null ? '' : 'đ'}</span>
            <strong style={{ color: '#009688', fontSize: 13 }}>QL: {r.managerScore}đ</strong>
          </div>
          <Progress percent={r.managerScore} size="small" strokeColor="#009688" showInfo={false} />
        </div>
      ),
    },
    {
      title: 'Xếp loại KPI',
      dataIndex: 'grade',
      key: 'grade',
      width: 150,
      render: (grade: string) => {
        grade = grade || 'Chưa xếp loại';
        let color = 'default';
        if (grade.startsWith('A+')) color = 'gold';
        else if (grade.startsWith('A')) color = 'green';
        else if (grade.startsWith('B')) color = 'blue';
        else color = 'error';
        return <Tag color={color} style={{ fontWeight: 700 }}>{grade}</Tag>;
      },
    },
    {
      title: 'Thưởng hiệu suất',
      dataIndex: 'kpiBonus',
      key: 'kpiBonus',
      width: 160,
      render: (val: number) => (
        <span style={{ fontWeight: 700, color: '#16A34A', fontSize: 13 }}>
          +{Number(val || 0).toLocaleString('vi-VN')} ₫
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (status: string) => (
        <Tag color={status === 'Đã hoàn tất đánh giá' ? 'success' : 'warning'}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 140,
      render: (_: any, record: EnterprisePerformanceReview) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedReview(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
          </Button>
          {record.status === 'Chờ phê duyệt điểm' && (
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              onClick={() => handleApprove(record)}
              disabled={Boolean(busyKey)}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Duyệt
            </Button>
          )}
          {record.status === 'Chờ phê duyệt điểm' && <Button size="small" onClick={() => openReview(record)}>Sửa</Button>}
          {record.status === 'Chờ phê duyệt điểm' && <Button size="small" danger onClick={() => Modal.confirm({ title: `Xóa phiếu ${record.code}?`, onOk: async () => {
            try { await collectionsApi.remove('hr_performance_reviews', record.key); setData(previous => previous.filter(item => item.key !== record.key)); if (selectedReview?.key === record.key) setDrawerOpen(false); message.success('Đã xóa phiếu chờ phê duyệt.'); }
            catch (error: any) { message.error(error?.response?.data?.message || 'Không thể xóa phiếu.'); throw error; }
          } })}>Xóa</Button>}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Phiếu đạt loại A+ (Xuất sắc)</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {excellentCount} phiếu đánh giá
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Theo điểm tổng hợp đã ghi nhận</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng thưởng hiệu suất KPI đề xuất</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalBonus.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Chưa tạo chứng từ chi hoặc chuyển bảng lương</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Điểm trung bình các phiếu đã ghi nhận</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {avgScore} / 100 Điểm
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Điểm quản lý hoặc tổng ba trụ cột</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tiến độ hoàn tất đánh giá KPI</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {data.length ? Math.round((data.filter((d) => d.status === 'Đã hoàn tất đánh giá').length / data.length) * 100) : 0}% Hoàn thành
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Còn {data.filter(record => record.status === 'Chờ phê duyệt điểm').length} phiếu chờ duyệt</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả đánh giá' },
            { key: 'A+', label: 'A+ Xuất sắc', icon: <StarFilled style={{ color: '#F59E0B' }} /> },
            { key: 'A (Tốt)', label: 'A Tốt' },
            { key: 'Chờ phê duyệt điểm', label: 'Chờ duyệt', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setGradeFilter(tab.key)}
              style={{
                backgroundColor: gradeFilter === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: gradeFilter === tab.key ? '#009688' : '#CBD5E1',
                color: gradeFilter === tab.key ? '#00796B' : '#475569',
                fontWeight: gradeFilter === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã phiếu, tên nhân viên, phòng ban..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={exportReviews}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openReview()}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập phiếu đánh giá
          </Button>
        </div>
      </div>

      {/* Main Table */}
      {loadError && <div role="alert" style={{ color: '#DC2626', marginBottom: 12 }}>{loadError} <Button onClick={() => void loadData()}>Tải lại</Button></div>}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Thêm phiếu đánh giá mới */}
      <Modal
        title={editingReview ? 'Sửa phiếu đánh giá chờ phê duyệt' : 'Lập Phiếu Đánh Giá Hiệu Suất & Thưởng KPI Mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã phiếu" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="period" label="Kỳ đánh giá" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Quý 4 / 2026" />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban" rules={[{ required: true }]}>
              {deptOptions.length ? <Select
                options={deptOptions}
                placeholder="Chọn phòng ban..."
              /> : <Input placeholder="Nhập phòng ban tại kỳ đánh giá" />}
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeId" label="Nhân sự được đánh giá" rules={[{ required: true }]}>
              <Select options={employees.map(employee => ({ value: employee.id, label: `${employee.name} (${employee.employeeCode})` }))} onChange={value => { const employee = employees.find(item => item.id === value); if (employee) form.setFieldsValue({ department: employee.department, position: employee.position }); }} />
            </Form.Item>
            <Form.Item name="position" label="Chức danh đảm nhiệm">
              {posOptions.length > 0 ? (
                <Select options={posOptions} placeholder="Chọn chức danh..." />
              ) : (
                <Input placeholder="Ví dụ: Kỹ sư Lead" />
              )}
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="selfScore" label="Điểm Tự chấm (0-100, nếu có)">
              <Input type="number" min={0} max={100} step={0.01} />
            </Form.Item>
            <Form.Item name="managerScore" label="Điểm Quản lý tổng hợp (0-100)">
              <Input type="number" min={0} max={100} step={0.01} />
            </Form.Item>
            <Form.Item name="kpiBonus" label="Mức thưởng KPI (VNĐ)">
              <Input type="number" step={1000000} />
            </Form.Item>
          </div>

          <div style={{ fontSize: 12, color: '#64748B', marginBottom: 10 }}>Có thể nhập đủ ba trụ cột bên dưới để máy chủ tính điểm tổng hợp; nếu chưa có, để trống cả ba và nhập điểm quản lý.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="productivityScore" label="Năng suất (0-60)"><Input type="number" min={0} max={60} step={0.01} /></Form.Item>
            <Form.Item name="disciplineScore" label="Kỷ luật (0-20)"><Input type="number" min={0} max={20} step={0.01} /></Form.Item>
            <Form.Item name="innovationScore" label="Sáng tạo (0-20)"><Input type="number" min={0} max={20} step={0.01} /></Form.Item>
          </div>
          <Form.Item name="evaluatorId" label="Người đánh giá (Quản lý trực tiếp)" rules={[{ required: true }]}>
            <Select options={employees.map(employee => ({ value: employee.id, label: `${employee.name} (${employee.employeeCode})` }))} />
          </Form.Item>

          <Form.Item name="managerComment" label="Nhận xét của Quản lý">
            <Input.TextArea rows={2} placeholder="Đánh giá kết quả công việc, tinh thần trách nhiệm và đóng góp..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu đánh giá
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Phiếu Đánh Giá 360 */}
      <Drawer
        title="Bảng Điểm Đánh Giá Hiệu Suất & Nhận Xét Quản Lý"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={600}
      >
        {selectedReview && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedReview.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedReview.employeeName}
                  </div>
                </div>
                <Tag color={selectedReview.status === 'Đã hoàn tất đánh giá' ? 'success' : 'warning'}>
                  {selectedReview.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 6 }}>
                Chức danh: <strong>{selectedReview.position}</strong> · Phòng ban: <strong>{selectedReview.department}</strong> · Kỳ: <Tag color="blue">{selectedReview.period}</Tag>
              </div>
            </div>

            {/* 3 Pillars Score Breakdown */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Điểm Đánh Giá 3 Trụ Cột Năng Lực:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span>1. Năng suất &amp; Chất lượng công việc (Tỷ trọng 60%):</span>
                    <strong style={{ color: '#009688' }}>{selectedReview.productivityScore ?? 'Chưa chấm'} / 60 đ</strong>
                  </div>
                  <Progress percent={Math.round(((selectedReview.productivityScore ?? 0) / 60) * 100)} strokeColor="#009688" size="small" />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span>2. Tác phong, Kỷ luật &amp; Tiến độ (Tỷ trọng 20%):</span>
                    <strong style={{ color: '#2563EB' }}>{selectedReview.disciplineScore ?? 'Chưa chấm'} / 20 đ</strong>
                  </div>
                  <Progress percent={Math.round(((selectedReview.disciplineScore ?? 0) / 20) * 100)} strokeColor="#2563EB" size="small" />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span>3. Sáng tạo, Cải tiến &amp; Văn hóa (Tỷ trọng 20%):</span>
                    <strong style={{ color: '#7C3AED' }}>{selectedReview.innovationScore ?? 'Chưa chấm'} / 20 đ</strong>
                  </div>
                  <Progress percent={Math.round(((selectedReview.innovationScore ?? 0) / 20) * 100)} strokeColor="#7C3AED" size="small" />
                </div>
              </div>
            </div>

            {/* Total Result & Bonus */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ color: '#15803D', fontSize: 12 }}>Tổng điểm Quản lý:</span>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#166534' }}>
                    {selectedReview.managerScore} / 100 Điểm
                  </div>
                  <Tag color="gold" style={{ fontWeight: 800, fontSize: 12, marginTop: 4 }}>
                    {selectedReview.grade}
                  </Tag>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ color: '#15803D', fontSize: 12 }}>Thưởng hiệu suất KPI:</span>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#16A34A' }}>
                    +{selectedReview.kpiBonus.toLocaleString('vi-VN')} ₫
                  </div>
                </div>
              </div>
            </div>

            {/* Manager Comment */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
                Nhận xét từ {selectedReview.evaluator}:
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', fontStyle: 'italic', lineHeight: 1.5 }}>
                {selectedReview.managerComment || 'Chưa có nhận xét quản lý.'}
              </div>
            </div>

            {/* Action */}
            {selectedReview.status === 'Chờ phê duyệt điểm' && (
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={() => handleApprove(selectedReview)}
                disabled={Boolean(busyKey)}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Phê duyệt điểm đánh giá
              </Button>
            )}
            <div style={{ fontSize: 12, color: '#64748B' }}>Người duyệt: {selectedReview.approvedBy || 'Chưa ghi nhận'} · {selectedReview.approvedAt || ''}. Thưởng là đề xuất, chưa ghi vào bảng lương hoặc chứng từ chi.</div>
            <Button icon={<DownloadOutlined />} onClick={() => printReview(selectedReview)}>Xuất phiếu PDF</Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};
