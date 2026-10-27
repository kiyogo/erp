import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CompassOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  DollarOutlined,
  EnvironmentOutlined,
  CalendarOutlined,
  SendOutlined,
  AuditOutlined,
  EyeOutlined,
  PrinterOutlined,
  TeamOutlined,
  CreditCardOutlined,
  ClockCircleOutlined,
  RocketOutlined,
  HomeOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer } from '../../custom-ui';
import { employeesApi, filesApi, type EnterpriseEmployee } from '../../api/endpoints';
import { useAuth } from '../../context/AuthContext';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { travelDateRangeDays, travelEmployeeSnapshot, travelExportRows, travelLocalDate, travelMoney, travelSettlementStatus } from './businessTravelRules';

export interface EnterpriseTravelRequest {
  key: string;
  travelCode: string;
  employeeName: string;
  empCode: string;
  department: string;
  position: string;
  destination: string;
  tripType: 'Nội địa' | 'Quốc tế';
  startDate: string;
  endDate: string;
  daysCount: number;
  purpose: string;
  flightTicket: string;
  hotelName: string;
  budgetEstimated: number;
  advanceAmount: number;
  actualExpense: number;
  settlementStatus: 'Đã quyết toán xong' | 'Chờ nộp hóa đơn đỏ' | 'Chưa quyết toán';
  approver: string;
  status: 'Đã duyệt công tác' | 'Đang diễn ra' | 'Chờ lãnh đạo duyệt' | 'Từ chối';
  employeeId?: string;
  requester?: string;
  requesterId?: string;
  approvedBy?: string;
  approvedById?: string;
  approvedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  invoiceReference?: string;
  invoiceFileId?: string;
  invoiceFileName?: string;
  settlementNote?: string;
  settlementRecordedBy?: string;
  settlementRecordedAt?: string;
  settledBy?: string;
  settledAt?: string;
}

const INITIAL_TRAVELS: EnterpriseTravelRequest[] = [];

export const BusinessTravelModule: React.FC = () => {
  const { user } = useAuth();
  const [data, setData] = useState<EnterpriseTravelRequest[]>(INITIAL_TRAVELS);
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actingKey, setActingKey] = useState('');
  const [employeesUnavailable, setEmployeesUnavailable] = useState(false);

  useEffect(() => {
    const list = dataService.getGenericData('business_travels');
    setData(Array.isArray(list) ? list : []);
    let mounted = true;
    setLoading(true);
    void Promise.all([dataService.refreshGenericData('business_travels'), employeesApi.getAll()])
      .then(([travels, employeeResponse]) => {
        if (!mounted) return;
        setData(Array.isArray(travels) ? travels : []);
        setEmployees(employeeResponse.data.data.filter((employee) => employee.isActive !== false && employee.status !== 'Đã nghỉ việc'));
        setEmployeesUnavailable(false);
      })
      .catch((error: any) => {
        if (!mounted) return;
        setEmployeesUnavailable(true);
        message.error(error?.response?.data?.message || 'Không tải được danh sách công tác hoặc nhân viên.');
      })
      .finally(() => { if (mounted) setLoading(false); });
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('business_travels');
      if (mounted) setData(Array.isArray(updated) ? updated : []);
    });
    return () => { mounted = false; unsub(); };
  }, []);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [settlementForm] = Form.useForm();
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [settlingTravel, setSettlingTravel] = useState<EnterpriseTravelRequest | null>(null);
  const [settlementSaving, setSettlementSaving] = useState(false);
  const [invoiceFile, setInvoiceFile] = useState<File | null>(null);
  const [rejectingTravel, setRejectingTravel] = useState<EnterpriseTravelRequest | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedTravel, setSelectedTravel] = useState<EnterpriseTravelRequest | null>(null);

  const totalBudget = data
    .filter((d) => d.status === 'Đã duyệt công tác' || d.status === 'Đang diễn ra')
    .reduce((sum, item) => sum + (Number(item.budgetEstimated) || 0), 0);

  const travelStatus = (travel: EnterpriseTravelRequest) => {
    if (travel.status !== 'Đã duyệt công tác') return travel.status;
    const today = travelLocalDate();
    return travel.startDate <= today && today <= travel.endDate ? 'Đang diễn ra' : travel.status;
  };
  const pendingCount = data.filter((d) => d.status === 'Chờ lãnh đạo duyệt').length;
  const ongoingCount = data.filter((d) => travelStatus(d) === 'Đang diễn ra').length;

  const handleCreate = async (values: any) => {
    if (saving) return;
    if (!user) { message.error('Không xác định được tài khoản đang đăng nhập.'); return; }
    setSaving(true);
    try {
      const employee = travelEmployeeSnapshot(employees, String(values.employeeId || ''));
      const daysCount = travelDateRangeDays(String(values.startDate || ''), String(values.endDate || ''));
      const budgetEstimated = travelMoney(values.budgetEstimated, 'Dự toán');
      const advanceAmount = travelMoney(values.advanceAmount ?? '0', 'Số tiền tạm ứng');
      if (advanceAmount > budgetEstimated) throw new Error('Số tiền tạm ứng không được vượt dự toán.');
      const travelCode = String(values.travelCode || '').trim();
      if (!travelCode) throw new Error('Mã đề xuất không hợp lệ.');
      if (data.some((item) => String(item.travelCode).toLowerCase() === travelCode.toLowerCase())) throw new Error('Mã đề xuất đã tồn tại.');
      const newTravel = await dataService.createGenericRecord('business_travels', {
        ...employee,
        key: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        travelCode,
        tripType: values.tripType,
        destination: String(values.destination || '').trim(),
        startDate: values.startDate,
        endDate: values.endDate,
        daysCount,
        purpose: String(values.purpose || '').trim(),
        flightTicket: String(values.flightTicket || '').trim(),
        hotelName: String(values.hotelName || '').trim(),
        budgetEstimated,
        advanceAmount,
        actualExpense: 0,
        settlementStatus: 'Chưa quyết toán',
        approver: '',
        requester: user.name || user.email,
        requesterId: user.id,
        requestedAt: new Date().toISOString(),
        status: 'Chờ lãnh đạo duyệt',
      }) as EnterpriseTravelRequest;
      setSelectedTravel(newTravel);
      message.success(`Đã lưu đề xuất công tác ${travelCode} lên máy chủ.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không lưu được đề xuất công tác.');
    } finally { setSaving(false); }
  };

  const handleAction = async (record: EnterpriseTravelRequest, newStatus: 'Đã duyệt công tác' | 'Từ chối', reason = '') => {
    if (!user || record.status !== 'Chờ lãnh đạo duyệt' || actingKey) return;
    if (newStatus === 'Từ chối' && !reason.trim()) { message.error('Vui lòng ghi lý do từ chối.'); return; }
    setActingKey(record.key);
    try {
      const saved = await dataService.updateGenericRecord('business_travels', {
        key: record.key,
        status: newStatus,
        rejectionReason: newStatus === 'Từ chối' ? reason.trim() : '',
      }) as EnterpriseTravelRequest;
      setSelectedTravel((current) => current?.key === record.key ? saved : current);
      message.success(newStatus === 'Đã duyệt công tác' ? `Đã lưu quyết định duyệt ${record.travelCode} của ${user.name || user.email}.` : `Đã lưu quyết định từ chối ${record.travelCode}.`);
      setRejectingTravel(null);
      setRejectionReason('');
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không lưu được quyết định duyệt lên máy chủ.');
    } finally { setActingKey(''); }
  };

  const openSettlement = (record: EnterpriseTravelRequest) => {
    setSettlingTravel(record);
    setInvoiceFile(null);
    settlementForm.setFieldsValue({ actualExpense: Number(record.actualExpense) || undefined, invoiceReference: record.invoiceReference || '', settlementNote: record.settlementNote || '' });
    setSettlementOpen(true);
  };

  const handleSettlement = async (values: any) => {
    if (!settlingTravel || !user || settlementSaving) return;
    setSettlementSaving(true);
    try {
      const actualExpense = travelMoney(values.actualExpense, 'Chi phí thực tế');
      if (actualExpense <= 0) throw new Error('Chi phí thực tế phải lớn hơn 0.');
      const invoiceReference = String(values.invoiceReference || '').trim();
      let uploadedFileId = '';
      let uploadedFileName = '';
      if (invoiceFile) {
        const rootResponse = await filesApi.list(null);
        const rootId = rootResponse.data.context.parentId || undefined;
        const directory = (await filesApi.list(rootId)).data.data.find((entry) => entry.type === 'dir' && entry.name === 'Chứng từ công tác');
        const folderId = directory?.id || directory?.key || (await filesApi.createFolder('Chứng từ công tác', rootId, 'business_travel')).data.file.id;
        const uploaded = (await filesApi.upload(invoiceFile, invoiceFile.name, folderId, 'business_travel')).data.file;
        uploadedFileId = uploaded.id || uploaded.key;
        uploadedFileName = uploaded.name;
      }
      const hasInvoiceFile = Boolean(uploadedFileId || settlingTravel.invoiceFileId);
      const settlementStatus = travelSettlementStatus(actualExpense, invoiceReference, hasInvoiceFile);
      let saved: EnterpriseTravelRequest;
      try {
        saved = await dataService.updateGenericRecord('business_travels', {
          key: settlingTravel.key,
          actualExpense,
          invoiceReference,
          invoiceFileId: uploadedFileId || settlingTravel.invoiceFileId || '',
          invoiceFileName: uploadedFileName || settlingTravel.invoiceFileName || '',
          settlementNote: String(values.settlementNote || '').trim(),
        }) as EnterpriseTravelRequest;
      } catch (error) {
        if (uploadedFileId) await filesApi.remove(uploadedFileId).catch(() => {});
        throw error;
      }
      setSelectedTravel(saved);
      message.success(settlementStatus === 'Đã quyết toán xong' ? 'Đã lưu quyết toán nội bộ và mã tham chiếu chứng từ.' : 'Đã lưu chi phí thực tế; hồ sơ đang chờ tham chiếu hóa đơn.');
      setSettlementOpen(false);
      setSettlingTravel(null);
      setInvoiceFile(null);
      settlementForm.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không lưu được quyết toán.');
    } finally { setSettlementSaving(false); }
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || travelStatus(item) === statusFilter;
    const matchSearch =
      (item.travelCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.destination || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.purpose || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const exportRegister = () => {
    if (!filteredData.length) { message.warning('Không có chuyến công tác phù hợp để xuất.'); return; }
    downloadFile('Danh_sach_cong_tac.xlsx', generateValidXlsxBlob(travelExportRows(filteredData.map((item) => ({ ...item, status: travelStatus(item) })) as Array<Record<string, any>>)));
  };

  const printTravelOrder = (record: EnterpriseTravelRequest) => downloadFile(
    `${String(record.travelCode || 'lenh_cong_tac').replace(/[^a-z0-9_-]/gi, '_')}.pdf`,
    generateValidPdfBlob(record.status === 'Đã duyệt công tác' ? 'LENH DIEU DONG CONG TAC' : 'PHIEU DE XUAT CONG TAC', `${record.travelCode} | ${record.employeeName}`, [
      `Nhan vien: ${record.employeeName} (${record.empCode})`, `Phong ban / chuc danh: ${record.department} | ${record.position}`,
      `Dia diem: ${record.destination}`, `Thoi gian: ${record.startDate} den ${record.endDate} (${record.daysCount} ngay)`,
      `Muc dich: ${record.purpose}`, `Phuong tien: ${record.flightTicket || 'Chua ghi nhan'}`, `Khach san: ${record.hotelName || 'Chua ghi nhan'}`,
      `Du toan: ${Number(record.budgetEstimated || 0).toLocaleString('vi-VN')} VND`, `Tam ung de xuat: ${Number(record.advanceAmount || 0).toLocaleString('vi-VN')} VND`,
      `Trang thai: ${travelStatus(record)}`, `Nguoi tao: ${record.requester || 'Chua ghi nhan'}`, `Nguoi duyet: ${record.approver || 'Chua duyet'}`,
      'Lenh cong tac noi bo. Phieu nay khong xac nhan dat ve, chuyen tien hoac chu ky so CA.',
    ]),
  );

  const columns = [
    {
      title: 'Mã & Chuyến đi',
      key: 'code',
      width: 160,
      render: (_: any, record: EnterpriseTravelRequest) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
            <CompassOutlined /> {record.travelCode}
          </div>
          <div style={{ marginTop: 2 }}>
            <Tag color={record.tripType === 'Quốc tế' ? 'purple' : 'blue'} style={{ margin: 0, fontSize: 10.5 }}>
              {record.tripType}
            </Tag>
          </div>
        </div>
      ),
    },
    {
      title: 'Nhân sự đi công tác',
      key: 'employee',
      width: 200,
      render: (_: any, record: EnterpriseTravelRequest) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>{record.position}</div>
          <div style={{ fontSize: 11, color: '#2563EB', marginTop: 1 }}>{record.department}</div>
        </div>
      ),
    },
    {
      title: 'Địa điểm & Thời gian',
      key: 'destination',
      render: (_: any, record: EnterpriseTravelRequest) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>
            <EnvironmentOutlined style={{ color: '#DC2626', marginRight: 4 }} />
            {record.destination}
          </div>
          <div style={{ fontSize: 12, color: '#334155', marginTop: 2 }}>{record.purpose}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 3 }}>
            <CalendarOutlined /> {record.startDate} ➔ {record.endDate} ({record.daysCount} ngày) · {record.hotelName}
          </div>
        </div>
      ),
    },
    {
      title: 'Dự toán / Tạm ứng',
      key: 'financial',
      width: 170,
      render: (_: any, r: EnterpriseTravelRequest) => (
        <div>
          <div>
            Dự toán: <strong style={{ color: '#16A34A' }}>{r.budgetEstimated.toLocaleString('vi-VN')} ₫</strong>
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>
            Tạm ứng: <span style={{ color: '#2563EB', fontWeight: 600 }}>{r.advanceAmount.toLocaleString('vi-VN')} ₫</span>
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 150,
      render: (_: string, record: EnterpriseTravelRequest) => {
        const status = travelStatus(record);
        let color = 'default';
        if (status === 'Đã duyệt công tác') color = 'success';
        if (status === 'Đang diễn ra') color = 'processing';
        if (status === 'Chờ lãnh đạo duyệt') color = 'warning';
        if (status === 'Từ chối') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 190,
      render: (_: any, record: EnterpriseTravelRequest) => (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {user?.role === 'ADMIN' && record.status === 'Chờ lãnh đạo duyệt' && (
            <>
              <Button
                size="small"
                type="primary"
                icon={<CheckCircleOutlined />}
                loading={actingKey === record.key}
                disabled={Boolean(actingKey)}
                onClick={() => void handleAction(record, 'Đã duyệt công tác')}
                style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', fontSize: 11.5, padding: '0 6px' }}
              >
                Duyệt
              </Button>
              <Button
                size="small"
                danger
                icon={<CloseCircleOutlined />}
                loading={actingKey === record.key}
                disabled={Boolean(actingKey)}
                onClick={() => { setRejectingTravel(record); setRejectionReason(''); }}
                style={{ fontSize: 11.5, padding: '0 6px' }}
              >
                Từ chối
              </Button>
            </>
          )}
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedTravel(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng kinh phí công tác phí duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalBudget.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Tổng dự toán của các chuyến đã duyệt</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chuyến công tác đang diễn ra</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {ongoingCount} chuyến trong thời gian công tác
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Theo lịch trình đã được duyệt</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đề xuất chờ phê duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingCount} đề xuất mới
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Chờ tài khoản có quyền duyệt xử lý</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đề xuất trong danh sách</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>{data.length}</div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Dữ liệu hồ sơ công tác đã lưu</div>
        </div>
      </div>

      {/* Toolbar & Filter Tabs */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả chuyến đi' },
            { key: 'Đang diễn ra', label: 'Đang diễn ra', icon: <RocketOutlined style={{ color: '#6366F1' }} /> },
            { key: 'Đã duyệt công tác', label: 'Đã duyệt' },
            { key: 'Chờ lãnh đạo duyệt', label: 'Chờ duyệt' },
            { key: 'Từ chối', label: 'Từ chối' },
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo mã, tên nhân sự, địa điểm, mục đích..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={exportRegister} disabled={!filteredData.length}>
            Xuất Lịch Trình
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                travelCode: `CT-${new Date().getFullYear()}-${globalThis.crypto?.randomUUID?.().slice(0, 8).toUpperCase() || Math.random().toString(36).slice(2, 10).toUpperCase()}`,
                tripType: 'Nội địa',
                employeeId: user?.role === 'ADMIN' ? '' : user?.id,
                startDate: travelLocalDate(),
                endDate: travelLocalDate(),
                budgetEstimated: '',
                advanceAmount: 0,
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập đề xuất công tác
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
            <KTable dataSource={filteredData} columns={columns} loading={loading} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Lập đề xuất công tác mới */}
      <Modal
        title="Lập đề xuất công tác và dự trù chi phí"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={680}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="travelCode" label="Mã đề xuất" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="tripType" label="Loại chuyến đi" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Nội địa', value: 'Nội địa' },
                  { label: 'Quốc tế', value: 'Quốc tế' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeId" label="Cán bộ công tác" rules={[{ required: true }]}>
              <Select showSearch disabled={employeesUnavailable || employees.length === 0} placeholder="Chọn nhân viên đang làm việc" options={employees.filter((employee) => user?.role === 'ADMIN' || String(employee.key || employee.id) === user?.id).map((employee) => ({ value: employee.key || employee.id, label: `${employee.fullName || employee.name} · ${employee.employeeCode || employee.code} · ${employee.department}` }))} />
            </Form.Item>
            <div style={{ alignSelf: 'center', fontSize: 12, color: employeesUnavailable ? '#B91C1C' : '#64748B' }}>
              {employeesUnavailable ? 'Không tải được dữ liệu nhân viên.' : 'Tên, mã, phòng ban và chức danh lấy từ hồ sơ nhân sự.'}
            </div>
          </div>

          <Form.Item name="destination" label="Địa điểm đến & Đối tác làm việc" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: TP. Hồ Chí Minh - Làm việc với Ngân hàng ACB" />
          </Form.Item>

          <Form.Item name="purpose" label="Mục đích công tác chi tiết" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Nội dung và kết quả dự kiến đạt được..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="flightTicket" label="Thông tin vé máy bay / Tàu xe">
              <Input placeholder="Ví dụ: Vietnam Airlines VN215 khứ hồi" />
            </Form.Item>
            <Form.Item name="hotelName" label="Khách sạn lưu trú">
              <Input placeholder="Ví dụ: Khách sạn Novotel Saigon Centre" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="startDate" label="Ngày bắt đầu" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="endDate" label="Ngày kết thúc" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="budgetEstimated" label="Dự toán tổng (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" step={1000000} />
            </Form.Item>
            <Form.Item name="advanceAmount" label="Số tiền tạm ứng">
              <Input type="number" step={1000000} />
            </Form.Item>
          </div>

          <div style={{ fontSize: 12, color: '#64748B', marginTop: 2 }}>
            Số ngày tự tính theo ngày bắt đầu/kết thúc. Dự toán và tạm ứng là thông tin đề xuất, chưa tạo lệnh chi hoặc giao dịch ngân hàng.
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} disabled={saving || employeesUnavailable || employees.length === 0} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Gửi đề xuất duyệt
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Chuyến Công Tác & Quyết Toán */}
      <Drawer
        title="Hồ Sơ Chuyến Công Tác &amp; Quyết Toán Tài Chính"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={640}
      >
        {selectedTravel && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Box */}
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedTravel.travelCode}</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedTravel.destination}
                  </div>
                </div>
                <Tag color={travelStatus(selectedTravel) === 'Đã duyệt công tác' ? 'success' : travelStatus(selectedTravel) === 'Từ chối' ? 'error' : travelStatus(selectedTravel) === 'Chờ lãnh đạo duyệt' ? 'warning' : 'processing'}>
                  {travelStatus(selectedTravel)}
                </Tag>
              </div>

              <div style={{ fontSize: 12.5, color: '#334155', marginTop: 8 }}>
                Mục đích: <strong>{selectedTravel.purpose}</strong>
              </div>
            </div>

            {/* Travel Info Grid */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <TeamOutlined style={{ color: '#009688' }} /> Nhân Sự &amp; Lịch Trình Chuyến Đi:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Cán bộ đi công tác:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>
                    {selectedTravel.employeeName} ({selectedTravel.empCode})
                  </div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Chức danh / Phòng ban:</span>
                  <div style={{ fontWeight: 700, color: '#2563EB' }}>
                    {selectedTravel.position} · {selectedTravel.department}
                  </div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Thời gian:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>
                    {selectedTravel.startDate} ➔ {selectedTravel.endDate} ({selectedTravel.daysCount} ngày)
                  </div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Người xử lý:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedTravel.approver}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Người lập:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{selectedTravel.requester || 'Chưa ghi nhận'}</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Thời điểm xử lý:</span>
                    <div style={{ fontWeight: 700, color: '#0F172A' }}>{(selectedTravel.approvedAt || selectedTravel.rejectedAt) ? new Date(selectedTravel.approvedAt || selectedTravel.rejectedAt!).toLocaleString('vi-VN') : 'Chưa xử lý'}</div>
                </div>
              </div>
              {selectedTravel.rejectionReason && <div style={{ color: '#B91C1C', fontSize: 12.5, marginTop: 10 }}>Lý do từ chối: {selectedTravel.rejectionReason}</div>}
            </div>

            {/* Logistics & Bookings */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <CompassOutlined style={{ color: '#2563EB' }} /> Thông Tin Phương Tiện &amp; Lưu Trú:
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><SendOutlined style={{ color: '#0284C7', marginRight: 6 }} />Vé máy bay: <strong>{selectedTravel.flightTicket}</strong></div>
                <div><HomeOutlined style={{ color: '#F59E0B', marginRight: 6 }} />Khách sạn: <strong>{selectedTravel.hotelName}</strong></div>
              </div>
            </div>

            {/* Financial Breakdown */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                <DollarOutlined /> Quyết Toán Tài Chính &amp; Hoàn Ứng Công Tác Phí:
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, fontSize: 12.5 }}>
                <div>
                    <span style={{ color: '#15803D' }}>Dự toán:</span>
                  <div style={{ fontWeight: 800, color: '#166534', fontSize: 13.5 }}>
                    {(Number(selectedTravel.budgetEstimated) || 0).toLocaleString('vi-VN')} ₫
                  </div>
                </div>
                <div>
                    <span style={{ color: '#15803D' }}>Tạm ứng đề xuất:</span>
                  <div style={{ fontWeight: 800, color: '#2563EB', fontSize: 13.5 }}>
                    {(Number(selectedTravel.advanceAmount) || 0).toLocaleString('vi-VN')} ₫
                  </div>
                </div>
                <div>
                  <span style={{ color: '#15803D' }}>Chi phí thực tế:</span>
                  <div style={{ fontWeight: 800, color: '#DC2626', fontSize: 13.5 }}>
                    {Number(selectedTravel.actualExpense) > 0 ? `${Number(selectedTravel.actualExpense).toLocaleString('vi-VN')} ₫` : 'Chưa ghi nhận'}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <Tag color={selectedTravel.settlementStatus === 'Đã quyết toán xong' ? 'success' : selectedTravel.settlementStatus === 'Chờ nộp hóa đơn đỏ' ? 'warning' : 'default'}>{selectedTravel.settlementStatus || 'Chưa quyết toán'}</Tag>
                {selectedTravel.invoiceReference && <span style={{ fontSize: 12 }}>Mã chứng từ: <strong>{selectedTravel.invoiceReference}</strong></span>}
                {user?.role === 'ADMIN' && selectedTravel.invoiceFileId && <Button size="small" onClick={async () => {
                  try { const file = await filesApi.download(selectedTravel.invoiceFileId!); downloadFile(selectedTravel.invoiceFileName || 'chung_tu_cong_tac', file.data); }
                  catch (error: any) { message.error(error?.response?.data?.message || 'Không tải được tệp chứng từ.'); }
                }}>Tải {selectedTravel.invoiceFileName || 'chứng từ'}</Button>}
              </div>
              {selectedTravel.settlementRecordedAt && <div style={{ color: '#64748B', fontSize: 12, marginTop: 6 }}>Cập nhật bởi {selectedTravel.settlementRecordedBy || '—'} lúc {new Date(selectedTravel.settlementRecordedAt).toLocaleString('vi-VN')}{selectedTravel.settlementNote ? ` · ${selectedTravel.settlementNote}` : ''}</div>}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => printTravelOrder(selectedTravel)}
                style={{ flex: 1 }}
              >
                In Lệnh Điều Động (PDF)
              </Button>
              {user?.role === 'ADMIN' && <Button
                type="primary"
                icon={<CreditCardOutlined />}
                disabled={selectedTravel.status !== 'Đã duyệt công tác' || selectedTravel.settlementStatus === 'Đã quyết toán xong'}
                onClick={() => openSettlement(selectedTravel)}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Ghi quyết toán nội bộ
              </Button>}
            </div>
            <div style={{ color: '#64748B', fontSize: 11.5 }}>Quyết toán này lưu chi phí và chứng từ nội bộ; chưa ghi Sổ Cái, thu/hoàn tiền hoặc xác nhận giao dịch ngân hàng.</div>
          </div>
        )}
      </Drawer>

      <Modal title={`Ghi quyết toán ${settlingTravel?.travelCode || ''}`} open={settlementOpen} onCancel={() => { if (!settlementSaving) { setSettlementOpen(false); setInvoiceFile(null); } }} footer={null} width={560}>
        <Form form={settlementForm} layout="vertical" onFinish={handleSettlement} style={{ marginTop: 14 }}>
          <Form.Item name="actualExpense" label="Chi phí thực tế (VNĐ)" rules={[{ required: true }]}>
            <Input type="number" min={1} step={1} />
          </Form.Item>
          <Form.Item name="invoiceReference" label="Mã tham chiếu hóa đơn/chứng từ">
            <Input maxLength={120} placeholder="Nhập số hóa đơn hoặc mã chứng từ" />
          </Form.Item>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Tệp chứng từ (PDF/JPG/PNG, tối đa 20 MB)</label>
            <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" disabled={settlementSaving} onChange={(event) => {
              const file = event.target.files?.[0] || null;
              if (!file) { setInvoiceFile(null); return; }
              if (file.size > 20 * 1024 * 1024) { message.error('Tệp chứng từ phải nhỏ hơn 20 MB.'); event.target.value = ''; setInvoiceFile(null); return; }
              if (!/\.(pdf|jpe?g|png|webp)$/i.test(file.name)) { message.error('Chỉ nhận tệp PDF, JPG, PNG hoặc WEBP.'); event.target.value = ''; setInvoiceFile(null); return; }
              setInvoiceFile(file);
            }} />
            {invoiceFile && <div style={{ fontSize: 12, color: '#475569', marginTop: 5 }}>Tệp mới: {invoiceFile.name}</div>}
            {!invoiceFile && settlingTravel?.invoiceFileName && <div style={{ fontSize: 12, color: '#475569', marginTop: 5 }}>Đã lưu: {settlingTravel.invoiceFileName} (để trống nếu giữ tệp hiện tại)</div>}
          </div>
          <Form.Item name="settlementNote" label="Ghi chú quyết toán"><Input.TextArea rows={3} maxLength={1000} /></Form.Item>
          <div style={{ fontSize: 12, color: '#64748B' }}>Có thể lưu chi phí trước, hồ sơ sẽ chờ hóa đơn cho đến khi thêm mã tham chiếu hoặc tệp chứng từ. Thao tác không tạo bút toán hay lệnh chuyển tiền.</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setSettlementOpen(false)} disabled={settlementSaving}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={settlementSaving} disabled={settlementSaving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>Lưu quyết toán</Button>
          </div>
        </Form>
      </Modal>

      <Modal title={`Từ chối đề xuất ${rejectingTravel?.travelCode || ''}`} open={Boolean(rejectingTravel)} onCancel={() => { if (!actingKey) { setRejectingTravel(null); setRejectionReason(''); } }} footer={null} width={500}>
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>Ghi lý do để lưu cùng quyết định từ chối.</div>
          <Input.TextArea rows={4} maxLength={1000} value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
            <Button onClick={() => setRejectingTravel(null)} disabled={Boolean(actingKey)}>Hủy</Button>
            <Button danger loading={Boolean(actingKey)} disabled={!rejectionReason.trim() || Boolean(actingKey)} onClick={() => rejectingTravel && void handleAction(rejectingTravel, 'Từ chối', rejectionReason)}>Lưu quyết định từ chối</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};

