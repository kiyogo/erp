import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  TrophyFilled,
  GiftOutlined,
  CheckCircleOutlined,
  UserOutlined,
  EyeOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  CalendarOutlined,
  TeamOutlined,
  DollarOutlined,
  CheckOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer } from '../../custom-ui';
import { collectionsApi, employeesApi, EnterpriseEmployee } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { downloadFile, generateValidXlsxBlob, generateValidPdfBlob } from '../../utils/fileExporter';

export interface EnterpriseRewardItem {
  key: string;
  employeeId?: string;
  rewardCode: string;
  employeeName: string;
  empCode: string;
  department: string;
  title: string;
  rewardType: 'Tiền mặt & Cúp pha lê' | 'Chuyến du lịch nghỉ dưỡng 5 sao' | 'Cổ phần thưởng ESOP' | 'Bằng khen Ban Giám Đốc';
  rewardValue: number;
  decisionNo: string;
  date: string;
  achievementSummary: string;
  signer: string;
  signerName?: string;
  approvedBy?: string;
  approvedById?: string;
  approvedAt?: string;
  awardedBy?: string;
  awardedById?: string;
  awardedAt?: string;
  status: 'Đã trao giải' | 'Đã ký quyết định' | 'Chờ duyệt' | 'Đã trao thưởng' | 'Chờ trao thưởng trong lễ vinh danh';
}

export function canAwardReward(status: EnterpriseRewardItem['status']): boolean {
  return status === 'Đã ký quyết định' || status === 'Chờ trao thưởng trong lễ vinh danh';
}

export function isRewardAwarded(status: EnterpriseRewardItem['status']): boolean {
  return status === 'Đã trao giải' || status === 'Đã trao thưởng';
}

export function validateReward(record: Partial<EnterpriseRewardItem>): string {
  if (!record.employeeId) return 'Vui lòng chọn nhân sự hoặc đại diện tập thể trong hệ thống.';
  if (!record.rewardCode?.trim() || !record.title?.trim() || !record.department?.trim() || !record.decisionNo?.trim()) return 'Vui lòng nhập đủ mã khen thưởng, số quyết định, danh hiệu và phòng ban.';
  const date = record.date || '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) return 'Ngày quyết định không hợp lệ.';
  if (!Number.isSafeInteger(record.rewardValue) || record.rewardValue! < 0) return 'Giá trị phần thưởng phải là số nguyên không âm.';
  if (!['Tiền mặt & Cúp pha lê', 'Chuyến du lịch nghỉ dưỡng 5 sao', 'Cổ phần thưởng ESOP', 'Bằng khen Ban Giám Đốc'].includes(record.rewardType || '')) return 'Hình thức khen thưởng không hợp lệ.';
  return '';
}

export const RewardsModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseRewardItem[]>([]);
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyRecord, setBusyRecord] = useState('');
  const [loadError, setLoadError] = useState('');
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<EnterpriseRewardItem | null>(null);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRewardRef, setSelectedReward] = useState<EnterpriseRewardItem | null>(null);
  const selectedReward = data.find(record => record.key === selectedRewardRef?.key) || selectedRewardRef;

  const loadData = async () => {
    setLoading(true);
    try {
      const [list, staff, orgUnits] = await Promise.all([
        dataService.refreshGenericData('hr_rewards'),
        employeesApi.getAll(),
        dataService.fetchOrgUnitsList(),
      ]);
      setData(list.map((item: any) => ({ ...item, key: item.key || item.id })));
      setEmployees(staff.data.data);
      setDeptOptions(orgUnits.map((u) => ({ label: u, value: u })));
      setLoadError('');
    } catch (error: any) {
      setLoadError(error?.response?.data?.message || 'Không thể tải dữ liệu khen thưởng. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const totalRewardsValue = data.reduce((sum, item) => sum + (Number.isFinite(Number(item.rewardValue)) ? Number(item.rewardValue) : 0), 0);
  const awardedCount = data.filter((d) => isRewardAwarded(d.status)).length;

  const handleCreate = async (values: any) => {
    if (saving) return;
    if (editingReward && editingReward.status !== 'Chờ duyệt') { message.error('Chỉ được sửa quyết định đang chờ duyệt.'); return; }
    const employee = employees.find(item => item.id === values.employeeId || item.userId === values.employeeId);
    const id = editingReward?.key || `reward-${crypto.randomUUID()}`;
    const newReward: EnterpriseRewardItem = {
      ...editingReward,
      ...values,
      key: id,
      employeeId: employee?.id, employeeName: employee?.name || '', empCode: employee?.employeeCode || employee?.code || '',
      rewardCode: String(values.rewardCode || '').trim(), title: String(values.title || '').trim(), department: String(values.department || '').trim(), decisionNo: String(values.decisionNo || '').trim(),
      rewardValue: values.rewardValue === '' || values.rewardValue === undefined || values.rewardValue === null ? NaN : Number(values.rewardValue),
      achievementSummary: String(values.achievementSummary || '').trim(),
      signer: editingReward?.signer || '',
      status: 'Chờ duyệt',
    };
    const validation = validateReward(newReward);
    if (validation) { message.error(validation); return; }
    if (data.some(record => record.key !== editingReward?.key && record.rewardCode?.toLowerCase() === newReward.rewardCode.toLowerCase())) { message.error('Mã khen thưởng đã tồn tại.'); return; }
    try {
      setSaving(true);
      const response = editingReward ? await collectionsApi.update('hr_rewards', id, newReward) : await collectionsApi.create('hr_rewards', newReward, id);
      setData(previous => editingReward ? previous.map(record => record.key === id ? response.data.record : record) : [response.data.record, ...previous]);
      message.success(`Đã ${editingReward ? 'cập nhật' : 'tạo'} quyết định khen thưởng chờ duyệt cho: ${employee?.name}`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tạo quyết định khen thưởng.');
    } finally { setSaving(false); }
  };

  const handleApproveDecision = async (record: EnterpriseRewardItem) => {
    if (busyRecord) return;
    if (record.status !== 'Chờ duyệt') { message.error('Quyết định hiện không ở trạng thái chờ duyệt.'); return; }
    try {
      setBusyRecord(record.key);
      const response = await collectionsApi.update<EnterpriseRewardItem>('hr_rewards', record.key, { status: 'Đã ký quyết định' });
      setData(previous => previous.map(item => item.key === record.key ? response.data.record : item));
      message.success(`Đã ghi nhận phê duyệt nội bộ quyết định khen thưởng cho ${record.employeeName}.`);
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể phê duyệt quyết định khen thưởng.'); }
    finally { setBusyRecord(''); }
  };

  const handleConfirmAward = async (record: EnterpriseRewardItem) => {
    if (busyRecord) return;
    if (!canAwardReward(record.status)) { message.error('Chỉ được trao thưởng sau khi quyết định đã được phê duyệt.'); return; }
    try {
      setBusyRecord(record.key);
      const response = await collectionsApi.update<EnterpriseRewardItem>('hr_rewards', record.key, { status: 'Đã trao giải' });
      setData(previous => previous.map(item => item.key === record.key ? response.data.record : item));
      message.success(`Đã xác nhận trao thưởng thành công cho ${record.employeeName}`);
    } catch (error: any) { message.error(error?.response?.data?.message || 'Không thể cập nhật trạng thái trao thưởng.'); }
    finally { setBusyRecord(''); }
  };

  const openReward = (record?: EnterpriseRewardItem) => {
    setEditingReward(record || null); form.resetFields();
    const employeeId = record?.employeeId || employees.find(employee => (employee.employeeCode || employee.code) === record?.empCode)?.id;
    form.setFieldsValue(record ? { ...record, employeeId } : { rewardCode: `KT-${Date.now()}`, rewardType: 'Tiền mặt & Cúp pha lê', rewardValue: 0, date: new Date().toISOString().slice(0, 10) });
    setModalOpen(true);
  };

  const exportRewards = () => {
    downloadFile(`So_vang_khen_thuong_${new Date().toISOString().slice(0, 10)}.xlsx`, generateValidXlsxBlob([
      ['Mã khen thưởng', 'Mã nhân viên', 'Nhân viên / Đại diện', 'Phòng ban', 'Danh hiệu', 'Hình thức', 'Giá trị (VNĐ)', 'Số quyết định', 'Ngày quyết định', 'Trạng thái', 'Người duyệt', 'Ngày duyệt', 'Người xác nhận trao', 'Ngày trao', 'Thành tích'],
      ...filteredData.map(record => [record.rewardCode, record.empCode, record.employeeName, record.department, record.title, record.rewardType, Number(record.rewardValue), record.decisionNo, record.date, record.status, record.approvedBy || record.signerName || record.signer || '', record.approvedAt || '', record.awardedBy || '', record.awardedAt || '', record.achievementSummary]),
    ]));
    message.success('Đã tải sổ khen thưởng theo bộ lọc hiện tại.');
  };

  const exportCertificate = (record: EnterpriseRewardItem) => {
    const approved = record.status !== 'Chờ duyệt';
    downloadFile(`${record.rewardCode.replace(/[^a-z0-9_-]/gi, '_')}_Bang_khen.pdf`, generateValidPdfBlob(approved ? 'QUYET DINH KHEN THUONG' : 'DU THAO QUYET DINH KHEN THUONG', `${record.decisionNo} | ${record.date}`, [
      `Nhan su / Dai dien: ${record.employeeName} (${record.empCode})`, `Phong ban: ${record.department}`, `Danh hieu: ${record.title}`, `Hinh thuc: ${record.rewardType}`,
      `Gia tri: ${Number(record.rewardValue).toLocaleString('vi-VN')} VND`, `Thanh tich: ${record.achievementSummary || 'Chua khai bao'}`,
      `Trang thai: ${record.status}`, `Nguoi duyet noi bo: ${approved ? record.approvedBy || record.signerName || record.signer || 'Chua co du lieu' : 'Chua phe duyet'}`,
      `Ngay duyet: ${record.approvedAt || 'Chua co du lieu'}`, `Trao thuong: ${record.awardedAt || 'Chua co du lieu'}`,
      'Ban xuat du lieu he thong. Viec phe duyet noi bo khong tao chu ky so chung thu CA.',
    ]));
    message.success('Đã tải bản PDF quyết định theo dữ liệu hiện tại.');
  };

  const filteredData = data.filter((item) => {
    let matchStatus = true;
    if (statusFilter === 'Đã trao giải') {
      matchStatus = item.status === 'Đã trao giải' || item.status === 'Đã trao thưởng';
    } else if (statusFilter === 'Chờ trao giải') {
      matchStatus = item.status === 'Chờ duyệt' || item.status === 'Đã ký quyết định' || item.status === 'Chờ trao thưởng trong lễ vinh danh';
    } else if (statusFilter !== 'all') {
      matchStatus = item.status === statusFilter;
    }

    const matchSearch =
      (item.rewardCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.title || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.decisionNo || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Nhân sự được vinh danh',
      key: 'name',
      render: (_: any, r: EnterpriseRewardItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrophyFilled style={{ color: '#F59E0B', fontSize: 16 }} />
            {r.employeeName}
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã: <code>{r.rewardCode}</code> · {r.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Danh hiệu vinh danh & Quyết định',
      key: 'title',
      render: (_: any, r: EnterpriseRewardItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#B45309', fontSize: 13 }}>{r.title}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>
            {r.decisionNo} · Ngày ban hành: {r.date}
          </div>
        </div>
      ),
    },
    {
      title: 'Hình thức & Giá trị thưởng',
      key: 'reward',
      width: 230,
      render: (_: any, r: EnterpriseRewardItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#16A34A', fontSize: 13 }}>
            +{Number(r.rewardValue).toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <GiftOutlined style={{ color: '#009688' }} /> {r.rewardType}
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 170,
      render: (status: string) => {
        let tagColor = 'warning';
        if (status === 'Đã trao giải' || status === 'Đã trao thưởng') tagColor = 'success';
        if (status === 'Đã ký quyết định') tagColor = 'processing';
        return (
          <Tag color={tagColor}>
            {status}
          </Tag>
        );
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 200,
      render: (_: any, record: EnterpriseRewardItem) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {record.status === 'Chờ duyệt' && (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => handleApproveDecision(record)}
              disabled={!!busyRecord}
              loading={busyRecord === record.key}
              style={{ backgroundColor: '#2563EB', borderColor: '#2563EB', fontSize: 11.5 }}
            >
              Duyệt
            </Button>
          )}
          {canAwardReward(record.status) && (
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              onClick={() => handleConfirmAward(record)}
              disabled={!!busyRecord}
              loading={busyRecord === record.key}
              style={{ backgroundColor: '#009688', borderColor: '#009688', fontSize: 11.5 }}
            >
              Trao giải
            </Button>
          )}
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedReward(record);
              setDrawerOpen(true);
            }}
          >
            Bằng khen
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {loadError && <div role="alert" style={{ color: '#DC2626', marginBottom: 12 }}>{loadError} <Button size="small" onClick={() => void loadData()}>Tải lại</Button></div>}
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng quỹ vinh danh &amp; khen thưởng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalRewardsValue.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tổng giá trị quy đổi của các quyết định đã ghi nhận</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Cá nhân &amp; Tập thể được vinh danh</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {data.length} Quyết định
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>{new Set(data.map(record => record.employeeId || record.empCode).filter(Boolean)).size} nhân sự / đại diện được ghi nhận</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tiến độ trao thưởng vinh danh</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {awardedCount} / {data.length} Đã trao
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>{data.filter(record => canAwardReward(record.status)).length} quyết định đã duyệt, chờ trao thưởng</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chỉ số hài lòng gắn kết nhân sự</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            Chưa có khảo sát
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Chưa có dữ liệu khảo sát để tính chỉ số eNPS</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả vinh danh' },
            { key: 'Đã trao giải', label: 'Đã trao giải', icon: <TrophyOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Chờ trao giải', label: 'Chờ trao giải', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
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
            placeholder="Tìm theo mã, tên nhân sự, danh hiệu..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={exportRewards} disabled={loading || !!loadError}>
            Xuất Sổ Vàng
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => openReward()}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Quyết định khen thưởng
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} loading={loading} />
      </div>

      {/* MODAL: Tạo quyết định khen thưởng */}
      <Modal
        title={editingReward ? 'Chỉnh sửa quyết định khen thưởng chờ duyệt' : 'Lập Quyết Định Vinh Danh & Khen Thưởng Mới'}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="rewardCode" label="Mã khen thưởng" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="decisionNo" label="Số quyết định BGD" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="date" label="Ngày quyết định" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeId" label="Nhân sự / Đại diện tập thể" rules={[{ required: true }]}>
              <Select showSearch placeholder="Chọn nhân sự trong hệ thống" options={employees.map(employee => ({ value: employee.id, label: `${employee.employeeCode || employee.code} · ${employee.name}` }))} onChange={employeeId => { const employee = employees.find(item => item.id === employeeId); if (employee) form.setFieldsValue({ department: employee.department }); }} />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban trực thuộc" rules={[{ required: true }]}>
              {deptOptions.length ? <Select options={deptOptions} placeholder="Chọn phòng ban..." /> : <Input placeholder="Nhập phòng ban" />}
            </Form.Item>
          </div>

          <Form.Item name="title" label="Danh hiệu vinh danh" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Cá Nhân Đột Phá Công Nghệ Quý II / 2026" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="rewardType" label="Hình thức khen thưởng" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Tiền mặt & Cúp pha lê', value: 'Tiền mặt & Cúp pha lê' },
                  { label: 'Chuyến du lịch nghỉ dưỡng 5 sao', value: 'Chuyến du lịch nghỉ dưỡng 5 sao' },
                  { label: 'Cổ phần thưởng ESOP', value: 'Cổ phần thưởng ESOP' },
                  { label: 'Bằng khen Ban Giám Đốc', value: 'Bằng khen Ban Giám Đốc' },
                ]}
              />
            </Form.Item>
            <Form.Item name="rewardValue" label="Giá trị phần thưởng (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={1} />
            </Form.Item>
          </div>

          <Form.Item name="achievementSummary" label="Tóm tắt thành tích đóng góp nổi bật">
            <Input.TextArea rows={2} maxLength={4000} placeholder="Mô tả chi tiết những thành tích và đóng góp mang lại giá trị cao cho công ty..." />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {editingReward ? 'Lưu thay đổi' : 'Lập quyết định chờ duyệt'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Quyết Định & Bằng Khen */}
      <Drawer
        title="Hồ Sơ Quyết Định Vinh Danh &amp; Bằng Khen Danh Dự"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedReward && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#FFFBEB', padding: 18, borderRadius: 8, border: '1px solid #FCD34D', textAlign: 'center' }}>
              <TrophyFilled style={{ fontSize: 36, color: '#D97706' }} />
              <div style={{ fontSize: 13, color: '#B45309', fontWeight: 800, marginTop: 6 }}>{selectedReward.decisionNo}</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: '#78350F', marginTop: 4 }}>
                {selectedReward.title}
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A', marginTop: 6 }}>
                Vinh danh: <span style={{ color: '#009688' }}>{selectedReward.employeeName}</span> ({selectedReward.department})
              </div>
            </div>

            {/* Reward Information */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Chi Tiết Phần Thưởng &amp; Chế Độ:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Hình thức khen thưởng:</span>
                  <strong>{selectedReward.rewardType}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Giá trị quy đổi giải thưởng:</span>
                  <strong style={{ color: '#16A34A', fontSize: 14 }}>
                    +{Number(selectedReward.rewardValue).toLocaleString('vi-VN')} ₫
                  </strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Người phê duyệt nội bộ:</span>
                  <strong>{selectedReward.approvedBy || selectedReward.signerName || selectedReward.signer || 'Chưa có dữ liệu phê duyệt'}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Trạng thái trao giải:</span>
                  <Tag color={isRewardAwarded(selectedReward.status) ? 'success' : canAwardReward(selectedReward.status) ? 'processing' : 'warning'}>{selectedReward.status}</Tag>
                </div>
                {selectedReward.approvedAt && <div>Phê duyệt: {new Date(selectedReward.approvedAt).toLocaleString('vi-VN')}</div>}
                {selectedReward.awardedAt && <div>Trao thưởng: {new Date(selectedReward.awardedAt).toLocaleString('vi-VN')} · {selectedReward.awardedBy}</div>}
                <div style={{ color: '#64748B', fontSize: 11.5 }}>Trạng thái ký quyết định ghi nhận phê duyệt nội bộ trên hệ thống.</div>
              </div>
            </div>

            {/* Achievement */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>
                Thành Tích Đóng Góp Nổi Bật:
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', lineHeight: 1.5 }}>
                {selectedReward.achievementSummary}
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8 }}>
              <Button
                icon={<PrinterOutlined />}
                style={{ flex: 1 }}
                onClick={() => exportCertificate(selectedReward)}
              >
                In Bằng Khen (PDF)
              </Button>
              {selectedReward.status === 'Chờ duyệt' && <Button disabled={!!busyRecord || saving} onClick={() => openReward(selectedReward)}>Sửa dự thảo</Button>}
              {selectedReward.status === 'Chờ duyệt' && <Button type="primary" disabled={!!busyRecord} loading={busyRecord === selectedReward.key} onClick={() => void handleApproveDecision(selectedReward)}>Phê duyệt nội bộ</Button>}
              {canAwardReward(selectedReward.status) && (
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                  disabled={!!busyRecord}
                  loading={busyRecord === selectedReward.key}
                  onClick={() => void handleConfirmAward(selectedReward)}
                >
                  Xác Nhận Đã Trao Thưởng
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
