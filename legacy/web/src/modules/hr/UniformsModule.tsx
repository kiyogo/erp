import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  SkinOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  CheckOutlined,
  CalendarOutlined,
  UserOutlined,
  InboxOutlined,
  UploadOutlined,
  DeleteOutlined,
  PaperClipOutlined,
  FileTextOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';
import { collectionsApi, employeesApi, EnterpriseEmployee } from '../../api/endpoints';
import { dataService } from '../../services/dataService';

export interface EnterpriseUniformItem {
  key: string;
  code: string;
  employeeName: string;
  empCode: string;
  department: string;
  itemType: string;
  size: 'S' | 'M' | 'L' | 'XL' | 'XXL';
  quantity: number;
  requestDate: string;
  deliveryDate?: string;
  receiverSign?: string;
  note?: string;
  batchName?: string;
  batchPeriod?: string;
  status: 'Đã bàn giao' | 'Chờ cấp phát' | 'Chưa thực hiện';
}

export interface ParticipatingEmployee {
  id: string;
  empCode: string;
  name: string;
  department: string;
  position?: string;
  size: 'S' | 'M' | 'L' | 'XL' | 'XXL';
  quantity: number;
}

export interface AttachedDocument {
  id: string;
  name: string;
  size: string;
  uploadedAt: string;
}

const SAMPLE_EMPLOYEES: EnterpriseEmployee[] = [
  {
    key: 'emp-uni-1',
    id: 'emp-uni-1',
    employeeCode: 'NV000001',
    code: 'NV000001',
    name: 'Nguyễn Văn An',
    fullName: 'Nguyễn Văn An',
    department: 'Phòng Ban Kỹ Thuật',
    position: 'Kỹ sư phần mềm',
    email: 'an.nguyen@company.com',
    phone: '0901234567',
    joinDate: '2026-01-15',
    status: 'Chính thức',
    role: 'USER',
    isActive: true,
  },
  {
    key: 'emp-uni-2',
    id: 'emp-uni-2',
    employeeCode: 'NV000002',
    code: 'NV000002',
    name: 'Trần Thị Bích',
    fullName: 'Trần Thị Bích',
    department: 'Phòng Kinh Doanh',
    position: 'Chuyên viên tư vấn',
    email: 'bich.tran@company.com',
    phone: '0902345678',
    joinDate: '2026-02-01',
    status: 'Chính thức',
    role: 'USER',
    isActive: true,
  },
  {
    key: 'emp-uni-3',
    id: 'emp-uni-3',
    employeeCode: 'NV000003',
    code: 'NV000003',
    name: 'Lê Hoàng Nam',
    fullName: 'Lê Hoàng Nam',
    department: 'Ban Giám Đốc',
    position: 'Trưởng phòng',
    email: 'nam.le@company.com',
    phone: '0903456789',
    joinDate: '2025-11-10',
    status: 'Chính thức',
    role: 'USER',
    isActive: true,
  },
];

export const UniformsModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseUniformItem[]>([]);
  const [employees, setEmployees] = useState<EnterpriseEmployee[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modal Thêm đợt cấp phát
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  // Các trường thông tin chung của đợt cấp phát
  const [batchName, setBatchName] = useState('');
  const [batchPeriod, setBatchPeriod] = useState('Kỳ 1');
  const [batchItemType, setBatchItemType] = useState('Áo Polo Doanh Nghiệp KIYOVN');
  const [batchDepartment, setBatchDepartment] = useState('Tất cả đơn vị');
  const [batchYear, setBatchYear] = useState('2026');
  const [batchStatus, setBatchStatus] = useState('Chưa thực hiện');

  // Khối Nhân viên tham gia
  const [participatingEmployees, setParticipatingEmployees] = useState<ParticipatingEmployee[]>([]);

  // Khối Tài liệu đính kèm
  const [attachments, setAttachments] = useState<AttachedDocument[]>([]);

  // Modal chọn nhân viên tham gia
  const [employeePickerOpen, setEmployeePickerOpen] = useState(false);
  const [selectedPickerKeys, setSelectedPickerKeys] = useState<string[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerDept, setPickerDept] = useState('');

  // Drawer xem chi tiết
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedUniform, setSelectedUniform] = useState<EnterpriseUniformItem | null>(null);

  const loadData = async () => {
    try {
      const [res, orgUnits, empRes] = await Promise.all([
        collectionsApi.get<EnterpriseUniformItem>('hr_uniforms', { limit: 500 }),
        dataService.fetchOrgUnitsList(),
        employeesApi.getAll().catch(() => ({ data: [] })),
      ]);
      const list = res.data?.data || [];
      setData(list.map((item: any) => ({ ...item, key: item.id || item.key })));
      setDeptOptions(orgUnits.map((u) => ({ label: u, value: u })));

      const loadedEmps = (empRes.data && empRes.data.length > 0) ? empRes.data : SAMPLE_EMPLOYEES;
      setEmployees(loadedEmps);
    } catch {
      setData([]);
      setEmployees(SAMPLE_EMPLOYEES);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const totalQuantity = data.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const deliveredCount = data.filter((d) => d.status === 'Đã bàn giao').length;
  const pendingCount = data.filter((d) => d.status === 'Chờ cấp phát' || d.status === 'Chưa thực hiện').length;

  const handleOpenCreateModal = () => {
    setBatchName(`Cấp phát đồng phục đợt ${batchPeriod} năm 2026`);
    setBatchPeriod('Kỳ 1');
    setBatchItemType('Áo Polo Doanh Nghiệp KIYOVN');
    setBatchDepartment('Tất cả đơn vị');
    setBatchYear('2026');
    setBatchStatus('Chưa thực hiện');
    setParticipatingEmployees([]);
    setAttachments([]);
    setModalOpen(true);
  };

  const handleSaveBatch = async () => {
    if (!batchName.trim()) {
      message.warning('Vui lòng nhập tên đợt cấp phát.');
      return;
    }

    setSaving(true);
    try {
      const newItems: EnterpriseUniformItem[] = [];

      if (participatingEmployees.length > 0) {
        for (const emp of participatingEmployees) {
          const id = `uni-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          const item: EnterpriseUniformItem = {
            key: id,
            code: `DP-2026/${String(data.length + newItems.length + 1).padStart(3, '0')}`,
            employeeName: emp.name,
            empCode: emp.empCode,
            department: emp.department,
            itemType: batchItemType,
            size: emp.size,
            quantity: emp.quantity,
            requestDate: new Date().toISOString().substring(0, 10),
            deliveryDate: new Date(Date.now() + 7 * 86400000).toISOString().substring(0, 10),
            status: batchStatus === 'Đã hoàn thành' ? 'Đã bàn giao' : 'Chờ cấp phát',
            batchName: batchName.trim(),
            batchPeriod,
            note: `Đợt cấp phát: ${batchName.trim()} (${batchPeriod} - Năm ${batchYear})`,
          };
          await collectionsApi.create('hr_uniforms', item, id);
          newItems.push(item);
        }
      } else {
        const id = `uni-batch-${Date.now()}`;
        const batchHeader: EnterpriseUniformItem = {
          key: id,
          code: `DP-BATCH/${String(data.length + 1).padStart(3, '0')}`,
          employeeName: `Đợt cấp: ${batchName.trim()}`,
          empCode: 'BATCH-ALL',
          department: batchDepartment,
          itemType: batchItemType,
          size: 'L',
          quantity: 0,
          requestDate: new Date().toISOString().substring(0, 10),
          status: 'Chờ cấp phát',
          batchName: batchName.trim(),
          batchPeriod,
          note: `Đợt cấp phát: ${batchName.trim()} (${batchPeriod} - Năm ${batchYear})`,
        };
        await collectionsApi.create('hr_uniforms', batchHeader, id);
        newItems.push(batchHeader);
      }

      message.success(`Đã lưu đợt cấp phát "${batchName}" thành công.`);
      setModalOpen(false);
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu đợt cấp phát đồng phục.');
    } finally {
      setSaving(false);
    }
  };

  const handleBatchAddEmployees = () => {
    const pool = employees.length > 0 ? employees : SAMPLE_EMPLOYEES;
    const candidates = batchDepartment === 'Tất cả đơn vị'
      ? pool
      : pool.filter(e => (e.department || '').toLowerCase() === batchDepartment.toLowerCase());

    const existingIds = new Set(participatingEmployees.map(e => e.id));
    const toAdd = candidates.filter(e => !existingIds.has(e.id || e.userId || e.employeeCode || e.code || ''));

    if (toAdd.length === 0) {
      message.info('Tất cả nhân sự trong đơn vị này đã có trong danh sách tham gia.');
      return;
    }

    const mapped: ParticipatingEmployee[] = toAdd.map(e => ({
      id: e.id || e.userId || e.employeeCode || e.code || `emp-${Date.now()}-${Math.random()}`,
      empCode: e.employeeCode || e.code || 'NV-NEW',
      name: e.name || (e as any).fullName || 'Nhân viên',
      department: e.department || batchDepartment,
      position: e.position,
      size: 'L',
      quantity: 2,
    }));

    setParticipatingEmployees(prev => [...prev, ...mapped]);
    message.success(`Đã thêm hàng loạt ${mapped.length} nhân viên vào đợt cấp phát.`);
  };

  const handleImportExcel = () => {
    const pool = employees.length > 0 ? employees : SAMPLE_EMPLOYEES;
    const existingIds = new Set(participatingEmployees.map(e => e.id));
    const sampleImport = pool.slice(0, 3).filter(e => !existingIds.has(e.id || e.userId || e.employeeCode || e.code || ''));

    if (sampleImport.length === 0) {
      message.info('Tất cả nhân sự mẫu đã được nạp vào danh sách.');
      return;
    }

    const mapped: ParticipatingEmployee[] = sampleImport.map((e, idx) => ({
      id: e.id || e.userId || e.employeeCode || e.code || `emp-import-${idx}`,
      empCode: e.employeeCode || e.code || `NV00000${idx + 1}`,
      name: e.name || (e as any).fullName || 'Nhân viên nhập khẩu',
      department: e.department || 'Phòng Ban Kỹ Thuật',
      position: e.position,
      size: idx % 2 === 0 ? 'XL' : 'M',
      quantity: 2,
    }));

    setParticipatingEmployees(prev => [...prev, ...mapped]);
    message.success(`Đã nhập khẩu thành công ${mapped.length} nhân viên từ tệp mẫu.`);
  };

  const handleUploadAttachment = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg';
    input.onchange = (e: any) => {
      const file = e.target.files?.[0];
      if (file) {
        const newDoc: AttachedDocument = {
          id: `att-${Date.now()}`,
          name: file.name,
          size: `${(file.size / 1024).toFixed(1)} KB`,
          uploadedAt: new Date().toLocaleDateString('vi-VN'),
        };
        setAttachments(prev => [...prev, newDoc]);
        message.success(`Đã đính kèm tệp: ${file.name}`);
      }
    };
    input.click();
  };

  const removeAttachment = (id: string) => {
    setAttachments(prev => prev.filter(a => a.id !== id));
  };

  const removeParticipatingEmployee = (id: string) => {
    setParticipatingEmployees(prev => prev.filter(e => e.id !== id));
  };

  const updateEmployeeSize = (id: string, size: 'S' | 'M' | 'L' | 'XL' | 'XXL') => {
    setParticipatingEmployees(prev => prev.map(e => e.id === id ? { ...e, size } : e));
  };

  const updateEmployeeQuantity = (id: string, quantity: number) => {
    setParticipatingEmployees(prev => prev.map(e => e.id === id ? { ...e, quantity } : e));
  };

  const confirmSelectEmployees = () => {
    const pool = employees.length > 0 ? employees : SAMPLE_EMPLOYEES;
    const selected = pool.filter(e => {
      const k = e.id || e.userId || e.employeeCode || e.code || '';
      return selectedPickerKeys.includes(k) || selectedPickerKeys.includes(e.key || '');
    });

    const existingIds = new Set(participatingEmployees.map(e => e.id));
    const toAdd = selected.filter(e => !existingIds.has(e.id || e.userId || e.employeeCode || e.code || ''));

    const mapped: ParticipatingEmployee[] = toAdd.map(e => ({
      id: e.id || e.userId || e.employeeCode || e.code || `emp-${Date.now()}-${Math.random()}`,
      empCode: e.employeeCode || e.code || 'NV',
      name: e.name || (e as any).fullName || 'Nhân viên',
      department: e.department || 'Văn phòng',
      position: e.position,
      size: 'L',
      quantity: 2,
    }));

    setParticipatingEmployees(prev => [...prev, ...mapped]);
    setEmployeePickerOpen(false);
    setSelectedPickerKeys([]);
    if (mapped.length > 0) {
      message.success(`Đã thêm ${mapped.length} nhân viên vào đợt cấp phát.`);
    }
  };

  const handleHandover = async (record: EnterpriseUniformItem) => {
    try {
      await collectionsApi.update('hr_uniforms', record.key, {
        status: 'Đã bàn giao',
        deliveryDate: new Date().toISOString().substring(0, 10),
        receiverSign: `Xác nhận nhận đủ ${record.quantity} bộ trang phục`,
      });
      message.success(`Đã xác nhận bàn giao đồng phục cho ${record.employeeName}`);
      await loadData();
    } catch {
      message.error('Không thể cập nhật trạng thái bàn giao.');
    }
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.itemType || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.batchName || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const filteredPickerEmployees = (employees.length > 0 ? employees : SAMPLE_EMPLOYEES).filter(e => {
    const name = (e.name || (e as any).fullName || '').toLowerCase();
    const code = (e.employeeCode || e.code || '').toLowerCase();
    const matchSearch = !pickerSearch.trim() || name.includes(pickerSearch.toLowerCase()) || code.includes(pickerSearch.toLowerCase());
    const matchDept = !pickerDept || (e.department || '').toLowerCase() === pickerDept.toLowerCase();
    return matchSearch && matchDept;
  });

  const columns = [
    {
      title: 'Mã phiếu',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (code: string) => <span style={{ fontWeight: 700, color: '#009688' }}>{code}</span>,
    },
    {
      title: 'Nhân sự tiếp nhận & Đợt cấp',
      key: 'employeeName',
      render: (_: any, record: EnterpriseUniformItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#2563EB' }}>
            Mã: <code>{record.empCode}</code> · {record.department}
          </div>
          {record.batchName && (
            <div style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
              Đợt: <strong>{record.batchName}</strong> ({record.batchPeriod || 'Kỳ 1'})
            </div>
          )}
        </div>
      ),
    },
    {
      title: 'Loại trang phục',
      dataIndex: 'itemType',
      key: 'itemType',
      render: (item: string) => (
        <span style={{ fontWeight: 600, color: '#0F172A', display: 'flex', alignItems: 'center', gap: 6 }}>
          <SkinOutlined style={{ color: '#009688', fontSize: 15 }} />
          {item}
        </span>
      ),
    },
    {
      title: 'Kích cỡ & Số lượng',
      key: 'size',
      width: 160,
      render: (_: any, record: EnterpriseUniformItem) => (
        <div>
          <Tag color="geekblue" style={{ fontWeight: 700 }}>Size {record.size}</Tag>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A', marginLeft: 4 }}>
            {record.quantity} Bộ
          </span>
        </div>
      ),
    },
    {
      title: 'Ngày yêu cầu & Bàn giao',
      key: 'dates',
      width: 180,
      render: (_: any, record: EnterpriseUniformItem) => (
        <div>
          <div style={{ fontSize: 12, color: '#0F172A', fontWeight: 600 }}>
            <CalendarOutlined /> {record.requestDate}
          </div>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            Hẹn giao: {record.deliveryDate || 'Đang may đo'}
          </div>
        </div>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (status: string) => (
        <Tag color={status === 'Đã bàn giao' ? 'success' : status === 'Chờ cấp phát' ? 'warning' : 'default'}>
          {status}
        </Tag>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 150,
      render: (_: any, record: EnterpriseUniformItem) => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            icon={<EyeOutlined />}
            onClick={() => {
              setSelectedUniform(record);
              setDrawerOpen(true);
            }}
          >
            Chi tiết
          </Button>
          {record.status === 'Chờ cấp phát' && (
            <Button
              size="small"
              type="primary"
              icon={<CheckOutlined />}
              onClick={() => handleHandover(record)}
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
            >
              Giao đồ
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng trang phục đăng ký cấp phát</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalQuantity} Bộ trang phục
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Định mức 2 bộ/nhân viên/năm</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã bàn giao cho nhân viên</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {deliveredCount} Phiếu ({Math.round((deliveredCount / (data.length || 1)) * 100)}%)
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Có ký nhận trực tiếp tại kho Hành chính</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đang chờ bàn giao / May đo</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingCount} Phiếu cấp
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Dự kiến giao đúng theo kế hoạch đợt</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tồn kho đồng phục dự phòng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            120 Chiếc
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Luôn sẵn sàng cấp phát cho nhân sự mới</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phiếu' },
            { key: 'Đã bàn giao', label: 'Đã bàn giao', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Chờ cấp phát', label: 'Chờ cấp phát', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
              style={{
                height: 32,
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
            placeholder="Tìm theo tên nhân viên, phòng ban, đợt cấp phát..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280, height: 32 }}
            allowClear
          />

          <Button
            icon={<DownloadOutlined />}
            onClick={() => message.success('Đã xuất danh sách cấp phát đồng phục')}
            style={{ height: 32 }}
          >
            Xuất Excel
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreateModal}
            style={{ backgroundColor: '#009688', borderColor: '#009688', height: 32 }}
          >
            Thêm đợt cấp phát
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL GIAO DIỆN CHÍNH: Thêm đợt cấp phát đồng phục */}
      <Modal
        title="Thêm đợt cấp phát"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={1080}
        style={{ top: 25, maxWidth: '96vw' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* KHỐI 1: THÔNG TIN CHUNG VỀ ĐỢT CẤP PHÁT */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
            {/* Tên đợt cấp phát */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Tên đợt cấp phát <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Input
                placeholder="Nhập tên đợt cấp phát..."
                value={batchName}
                onChange={e => setBatchName(e.target.value)}
                style={{ height: 32 }}
              />
            </div>

            {/* Kỳ */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Kỳ <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Select
                value={batchPeriod}
                onChange={val => setBatchPeriod(val)}
                style={{ width: '100%', height: 32 }}
                options={[
                  { label: 'Kỳ 1', value: 'Kỳ 1' },
                  { label: 'Kỳ 2', value: 'Kỳ 2' },
                  { label: 'Tháng 10/2026', value: 'Tháng 10/2026' },
                  { label: 'Quý 4/2026', value: 'Quý 4/2026' },
                  { label: 'Đợt tân tuyển hội nhập', value: 'Đợt tân tuyển hội nhập' },
                ]}
              />
            </div>

            {/* Đồng phục cấp phát */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Đồng phục cấp phát <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Select
                value={batchItemType}
                onChange={val => setBatchItemType(val)}
                style={{ width: '100%', height: 32 }}
                options={[
                  { label: 'Áo Polo Doanh Nghiệp KIYOVN', value: 'Áo Polo Doanh Nghiệp KIYOVN' },
                  { label: 'Áo Sơ Mi & Vest Đồng Phục Công Sở Cao Cấp', value: 'Áo Sơ Mi & Vest Đồng Phục' },
                  { label: 'Áo Hoodie & Polo Kỹ Thuật', value: 'Áo Hoodie & Polo Kỹ Thuật' },
                  { label: 'Thẻ tên & Dây đeo nhận diện', value: 'Thẻ tên & Dây đeo nhận diện' },
                ]}
              />
            </div>

            {/* Đơn vị áp dụng */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Đơn vị áp dụng <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Select
                value={batchDepartment}
                onChange={val => setBatchDepartment(val)}
                style={{ width: '100%', height: 32 }}
                options={[
                  { label: 'Tất cả đơn vị', value: 'Tất cả đơn vị' },
                  ...deptOptions,
                ]}
              />
            </div>

            {/* Năm */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Năm <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Input
                value={batchYear}
                onChange={e => setBatchYear(e.target.value)}
                placeholder="2026"
                style={{ height: 32 }}
              />
            </div>

            {/* Trạng thái */}
            <div>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                Trạng thái <span style={{ color: '#EF4444' }}>*</span>
              </label>
              <Select
                value={batchStatus}
                onChange={val => setBatchStatus(val)}
                style={{ width: '100%', height: 32 }}
                options={[
                  { label: 'Chưa thực hiện', value: 'Chưa thực hiện' },
                  { label: 'Đang cấp phát', value: 'Đang cấp phát' },
                  { label: 'Đã hoàn thành', value: 'Đã hoàn thành' },
                ]}
              />
            </div>
          </div>

          {/* KHỐI 2: NHÂN VIÊN THAM GIA */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>
                Nhân viên tham gia {participatingEmployees.length > 0 && `(${participatingEmployees.length})`}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Button
                  icon={<PlusOutlined />}
                  onClick={() => {
                    setSelectedPickerKeys([]);
                    setEmployeePickerOpen(true);
                  }}
                  style={{ color: '#009688', borderColor: '#009688', height: 32 }}
                >
                  Thêm
                </Button>
                <Button
                  icon={<UploadOutlined />}
                  onClick={handleImportExcel}
                  style={{ height: 32 }}
                >
                  Nhập khẩu
                </Button>
                <Button
                  icon={<UsergroupAddOutlined />}
                  onClick={handleBatchAddEmployees}
                  style={{ height: 32 }}
                >
                  Thêm hàng loạt
                </Button>
              </div>
            </div>

            {/* Nội dung danh sách nhân viên tham gia */}
            {participatingEmployees.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 0', color: '#94A3B8' }}>
                <div style={{ width: 68, height: 68, borderRadius: '50%', background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                  <SearchOutlined style={{ fontSize: 30, color: '#009688' }} />
                </div>
                <div style={{ fontSize: 13, color: '#64748B' }}>Chưa có dữ liệu</div>
              </div>
            ) : (
              <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left', color: '#475569' }}>
                      <th style={{ padding: '8px 12px', width: 45, textAlign: 'center' }}>STT</th>
                      <th style={{ padding: '8px 12px', width: 120 }}>Mã NV</th>
                      <th style={{ padding: '8px 12px', width: 180 }}>Họ và tên</th>
                      <th style={{ padding: '8px 12px' }}>Đơn vị</th>
                      <th style={{ padding: '8px 12px', width: 100 }}>Kích cỡ</th>
                      <th style={{ padding: '8px 12px', width: 90 }}>Số lượng</th>
                      <th style={{ padding: '8px 12px', width: 48, textAlign: 'center' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {participatingEmployees.map((emp, idx) => (
                      <tr key={emp.id} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '8px 12px', color: '#64748B', textAlign: 'center' }}>{idx + 1}</td>
                        <td style={{ padding: '8px 12px', color: '#009688' }}>{emp.empCode}</td>
                        <td style={{ padding: '8px 12px', color: '#0F172A' }}>{emp.name}</td>
                        <td style={{ padding: '8px 12px', color: '#64748B' }}>{emp.department}</td>
                        <td style={{ padding: '8px 12px' }}>
                          <Select
                            value={emp.size}
                            onChange={val => updateEmployeeSize(emp.id, val)}
                            options={[
                              { label: 'S', value: 'S' },
                              { label: 'M', value: 'M' },
                              { label: 'L', value: 'L' },
                              { label: 'XL', value: 'XL' },
                              { label: 'XXL', value: 'XXL' },
                            ]}
                            style={{ width: 85, height: 32 }}
                          />
                        </td>
                        <td style={{ padding: '8px 12px' }}>
                          <Input
                            type="number"
                            min={1}
                            max={10}
                            value={emp.quantity}
                            onChange={e => updateEmployeeQuantity(emp.id, Number(e.target.value) || 1)}
                            style={{ width: 65, height: 32 }}
                          />
                        </td>
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          <Button
                            type="text"
                            danger
                            icon={<DeleteOutlined style={{ fontSize: 16, color: '#EF4444' }} />}
                            onClick={() => removeParticipatingEmployee(emp.id)}
                            title="Xóa nhân viên"
                            aria-label="Xóa"
                            style={{
                              width: 32,
                              height: 32,
                              minWidth: 32,
                              padding: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: 'none',
                              background: 'transparent',
                              color: '#EF4444',
                              cursor: 'pointer',
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* KHỐI 3: TÀI LIỆU ĐÍNH KÈM */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: '#0F172A' }}>
                Tài liệu đính kèm {attachments.length > 0 && `(${attachments.length})`}
              </div>
              <Button
                icon={<PlusOutlined />}
                onClick={handleUploadAttachment}
                style={{ color: '#009688', borderColor: '#009688', height: 32 }}
              >
                Thêm
              </Button>
            </div>

            {/* Nội dung danh sách tài liệu */}
            {attachments.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px 0', color: '#94A3B8' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#E0F2F1', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                  <PaperClipOutlined style={{ fontSize: 24, color: '#009688' }} />
                </div>
                <div style={{ fontSize: 13, color: '#64748B' }}>Chưa có dữ liệu</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {attachments.map(att => (
                  <div key={att.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', background: '#F8FAFC', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: 13 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FileTextOutlined style={{ color: '#009688' }} />
                      <span style={{ color: '#0F172A' }}>{att.name}</span>
                      <span style={{ color: '#94A3B8', fontSize: 12 }}>({att.size})</span>
                    </div>
                    <Button
                      type="text"
                      danger
                      icon={<DeleteOutlined style={{ fontSize: 16, color: '#EF4444' }} />}
                      onClick={() => removeAttachment(att.id)}
                      title="Xóa tài liệu"
                      aria-label="Xóa tài liệu"
                      style={{
                        width: 32,
                        height: 32,
                        minWidth: 32,
                        padding: 0,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: 'none',
                        background: 'transparent',
                        color: '#EF4444',
                        cursor: 'pointer',
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* CHÂN DIALOG (FOOTER) */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 6 }}>
            <Button onClick={() => setModalOpen(false)} style={{ height: 32 }}>
              Hủy
            </Button>
            <Button
              type="primary"
              onClick={handleSaveBatch}
              loading={saving}
              style={{ backgroundColor: '#009688', borderColor: '#009688', height: 32 }}
            >
              Lưu
            </Button>
          </div>
        </div>
      </Modal>

      {/* MODAL PHỤ: Chọn nhân viên tham gia */}
      <Modal
        title="Chọn nhân viên tham gia đợt cấp phát"
        open={employeePickerOpen}
        onCancel={() => setEmployeePickerOpen(false)}
        footer={null}
        width={840}
        style={{ top: 40, maxWidth: '95vw' }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <Input
              prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
              placeholder="Tìm kiếm nhân viên..."
              value={pickerSearch}
              onChange={e => setPickerSearch(e.target.value)}
              style={{ flex: 1, minWidth: 200, height: 32 }}
              allowClear
            />
            <Select
              placeholder="Tất cả đơn vị"
              value={pickerDept || undefined}
              onChange={val => setPickerDept(val || '')}
              allowClear
              style={{ width: 200, height: 32 }}
              options={[{ label: 'Tất cả đơn vị', value: '' }, ...deptOptions]}
            />
          </div>

          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            <KTable
              dataSource={filteredPickerEmployees}
              rowKey={(r: any) => r.id || r.userId || r.employeeCode || r.code}
              pagination={{ pageSize: 20 }}
              rowSelection={{
                selectedRowKeys: selectedPickerKeys,
                onChange: (keys: any) => setSelectedPickerKeys(keys),
                columnWidth: 36,
              }}
              onRow={(record: any) => {
                const key = record.id || record.userId || record.employeeCode || record.code;
                return {
                  onClick: (e: React.MouseEvent) => {
                    if ((e.target as HTMLElement).closest('.ant-table-selection-column')) return;
                    setSelectedPickerKeys(prev =>
                      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
                    );
                  },
                  style: { cursor: 'pointer' },
                };
              }}
              columns={[
                {
                  title: 'Mã NV',
                  dataIndex: 'employeeCode',
                  key: 'code',
                  width: 120,
                  render: (_: any, r: any) => <strong style={{ color: '#009688' }}>{r.employeeCode || r.code}</strong>,
                },
                {
                  title: 'Họ và tên',
                  dataIndex: 'name',
                  key: 'name',
                  render: (_: any, r: any) => <span style={{ fontWeight: 600 }}>{r.name || r.fullName}</span>,
                },
                {
                  title: 'Phòng ban',
                  dataIndex: 'department',
                  key: 'department',
                  render: (_: any, r: any) => r.department || '-',
                },
                {
                  title: 'Chức danh',
                  dataIndex: 'position',
                  key: 'position',
                  render: (_: any, r: any) => r.position || '-',
                },
              ]}
              enableFloatingActionBar={false}
              enableColumnResizing={false}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 6 }}>
            <div style={{ fontSize: 13, color: '#64748B' }}>
              Đã chọn: <strong>{selectedPickerKeys.length}</strong> nhân sự
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button onClick={() => setEmployeePickerOpen(false)} style={{ height: 32 }}>Hủy</Button>
              <Button
                type="primary"
                onClick={confirmSelectEmployees}
                disabled={selectedPickerKeys.length === 0}
                style={{ backgroundColor: '#009688', borderColor: '#009688', height: 32 }}
              >
                Xác nhận
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* DRAWER: Chi Tiết Phiếu Bàn Giao */}
      <Drawer
        title="Chi Tiết Phiếu Cấp Đồng Phục & Biên Bản Bàn Giao"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={540}
      >
        {selectedUniform && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedUniform.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedUniform.employeeName}
                  </div>
                </div>
                <Tag color={selectedUniform.status === 'Đã bàn giao' ? 'success' : selectedUniform.status === 'Chờ cấp phát' ? 'warning' : 'default'}>
                  {selectedUniform.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Phòng ban: <strong>{selectedUniform.department}</strong> · Mã: <code>{selectedUniform.empCode}</code>
              </div>
              {selectedUniform.batchName && (
                <div style={{ fontSize: 12, color: '#009688', marginTop: 4, fontWeight: 600 }}>
                  Đợt cấp phát: {selectedUniform.batchName} ({selectedUniform.batchPeriod || 'Kỳ 1'})
                </div>
              )}
            </div>

            {/* Item Details */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>
                Thông Tin Trang Phục Đăng Ký:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Loại trang phục:</span>
                  <strong>{selectedUniform.itemType}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Kích cỡ:</span>
                  <Tag color="geekblue" style={{ fontWeight: 700 }}>Size {selectedUniform.size}</Tag>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số lượng định mức:</span>
                  <strong>{selectedUniform.quantity} Bộ</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Ngày lập phiếu yêu cầu:</span>
                  <strong>{selectedUniform.requestDate}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Ngày bàn giao thực tế:</span>
                  <strong>{selectedUniform.deliveryDate || 'Chờ nhận tại kho'}</strong>
                </div>
              </div>
            </div>

            {/* Handover Signature */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F0FDF4' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 4 }}>
                Xác Nhận Của Người Nhận:
              </div>
              <div style={{ fontSize: 12.5, color: '#15803D', fontStyle: 'italic' }}>
                "{selectedUniform.receiverSign || 'Chưa ký nhận bàn giao đồ'}"
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
