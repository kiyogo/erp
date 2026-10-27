import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  SendOutlined,
  RollbackOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  UserOutlined,
  LaptopOutlined,
  FileDoneOutlined,
  ExclamationCircleOutlined,
  FormOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Alert } from '../../custom-ui';

export interface AllocationItem {
  key: string;
  ticketCode: string;
  type: 'Cấp phát' | 'Thu hồi';
  assetCode: string;
  assetName: string;
  category: string;
  serialNo: string;
  employeeCode: string;
  employeeName: string;
  department: string;
  position: string;
  handoverPerson: string;
  allocatedDate: string;
  expectedReturnDate: string;
  purpose: 'Cấp phát chính thức cho nhân viên mới' | 'Cấp phát theo dự án ngắn hạn' | 'Thay thế thiết bị bảo hành' | 'Thu hồi do nhân viên nghỉ việc' | 'Thu hồi định kỳ nâng cấp' | 'Thu hồi do chuyển đổi vị trí';
  condition: string;
  accessories: string;
  compensationAmount: number;
  signedByReceiver: boolean;
  signedAt?: string;
  signedByName?: string;
  signedByAccount?: string;
  receivedAt?: string;
  receivedByAccount?: string;
  status: 'Đã bàn giao hoàn tất' | 'Chờ nhân viên ký xác nhận' | 'Đã thu hồi về kho' | 'Chờ thẩm định đền bù';
  notes: string;
}

import { useEffect } from 'react';
import { collectionsApi, employeesApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { buildAllocationAssetUpdate, findAssetByCode } from './assetOperations';
import { findAllocationQuotaRule, type AssetSystemRule } from './assetSystemRules';

export const AssetAllocationModule: React.FC = () => {
  const [data, setData] = useState<AllocationItem[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [systemRules, setSystemRules] = useState<AssetSystemRule[]>([]);
  const [quotaEmployee, setQuotaEmployee] = useState<any>(null);
  const [quotaAssetCode, setQuotaAssetCode] = useState('');
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [posOptions, setPosOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Modals & Drawers state
  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<AllocationItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [signTarget, setSignTarget] = useState<AllocationItem | null>(null);
  const [receiverNameInput, setReceiverNameInput] = useState('');
  const [saving, setSaving] = useState(false);

  const [form] = Form.useForm();

  const loadData = async () => {
    try {
      const [res, orgUnits, positions, assetRes, employeeRes, systemConfigRes] = await Promise.all([
        collectionsApi.get<AllocationItem>('asset_allocations', { limit: 500 }),
        dataService.fetchOrgUnitsList(),
        dataService.fetchDropdownOptions('positions'),
        collectionsApi.get<any>('asset_items', { limit: 500 }),
        employeesApi.getAll(),
        collectionsApi.get<AssetSystemRule>('asset_systems', { limit: 500 }),
      ]);
      const list = res.data?.data || [];
      setData(list.map((item: any) => ({ ...item, key: item.id || item.key })));
      setAssets(assetRes.data?.data || []);
      setEmployees((employeeRes.data?.data || []).filter((employee: any) => employee.status !== 'Đã nghỉ việc'));
      setSystemRules(systemConfigRes.data?.data || []);
      setDeptOptions(orgUnits.map((u) => ({ label: u, value: u })));
      setPosOptions(positions.filter((p) => p.isActive !== false).map((p) => ({ label: p.name, value: p.name })));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải danh sách cấp phát/thu hồi.');
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Metrics
  const totalTickets = data.length;
  const inUseAllocations = data.filter((d) => d.type === 'Cấp phát' && d.status === 'Đã bàn giao hoàn tất').length;
  const pendingSignCount = data.filter((d) => d.status === 'Chờ nhân viên ký xác nhận').length;
  const returnedCount = data.filter((d) => d.type === 'Thu hồi' && d.status === 'Đã thu hồi về kho').length;
  const allocationQuota = findAllocationQuotaRule(systemRules, String(quotaEmployee?.position || ''), String(quotaEmployee?.department || ''));
  const quotaAsset = assets.find((asset) => String(asset.code || asset.assetCode) === quotaAssetCode);
  const quotaOverLimit = Boolean(allocationQuota?.budgetLimit && quotaAsset && Number(quotaAsset.originalPrice) > Number(allocationQuota.budgetLimit));

  const handleOpenCreate = () => {
    form.resetFields();
    setQuotaEmployee(null);
    setQuotaAssetCode('');
    const today = new Date().toISOString().substring(0, 10);
    form.setFieldsValue({
      ticketCode: `CP-${today.replace(/-/g, '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      type: 'Cấp phát',
      allocatedDate: today,
      expectedReturnDate: '',
      purpose: 'Cấp phát chính thức cho nhân viên mới',
      condition: '',
      accessories: '',
      handoverPerson: '',
      department: undefined,
      compensationAmount: 0,
    });
    setModalOpen(true);
  };

  const currentActor = () => {
    try {
      const user = JSON.parse(localStorage.getItem('minepanel_user') || 'null');
      return String(user?.name || user?.fullName || user?.email || 'Tài khoản hiện tại');
    } catch { return 'Tài khoản hiện tại'; }
  };

  const handleCreate = async (values: any) => {
    if (saving) return;
    const isAllocate = values.type === 'Cấp phát';
    if (data.some((item) => item.ticketCode.trim().toLocaleLowerCase() === String(values.ticketCode).trim().toLocaleLowerCase())) {
      message.error('Mã biên bản đã tồn tại.');
      return;
    }
    if (!String(values.condition || '').trim()) {
      message.error('Nhập tình trạng tài sản thực tế trước khi lập biên bản.');
      return;
    }
    const compensationAmount = Number(values.compensationAmount || 0);
    if (!Number.isFinite(compensationAmount) || compensationAmount < 0) {
      message.error('Số tiền bồi thường phải là số không âm.');
      return;
    }
    setSaving(true);
    let oldAsset: any = null;
    let assetUpdated = false;
    try {
      const assetsResponse = await collectionsApi.get<any>('asset_items', { limit: 500 });
      oldAsset = findAssetByCode(assetsResponse.data?.data || [], String(values.assetCode || ''));
      const employee = employees.find((item) => String(item.code || item.employeeCode) === String(values.employeeCode));
      if (!employee) throw new Error('Chọn nhân viên còn đang làm việc trong danh sách nhân sự.');
      if (isAllocate && oldAsset.status !== 'Trong kho') {
        throw new Error('Chỉ cấp phát tài sản đang ở kho; hãy kiểm tra trạng thái hoặc hoàn tất thu hồi trước.');
      }
      const key = `allocation-${crypto.randomUUID()}`;
      const newItem: AllocationItem = {
        ...values,
        key,
        assetCode: String(oldAsset.code || oldAsset.assetCode),
        assetName: String(oldAsset.name || oldAsset.assetName || ''),
        category: String(oldAsset.category || ''),
        serialNo: String(oldAsset.serialNo || oldAsset.serialNumber || values.serialNo || ''),
        employeeCode: String(employee.code || employee.employeeCode),
        employeeName: String(employee.name || employee.fullName || '').trim(),
        department: String(employee.department || values.department || ''),
        position: String(employee.position || values.position || ''),
        compensationAmount,
        signedByReceiver: false,
        receivedAt: isAllocate ? undefined : new Date().toLocaleString('sv-SE'),
        receivedByAccount: isAllocate ? undefined : currentActor(),
        status: isAllocate ? 'Chờ nhân viên ký xác nhận' : 'Đã thu hồi về kho',
      };
      if (!isAllocate) {
        const updatedAsset = buildAllocationAssetUpdate(oldAsset, 'Thu hồi', newItem.employeeName, newItem.department, currentActor(), newItem.allocatedDate, newItem.ticketCode, newItem.condition);
        await collectionsApi.update('asset_items', String(oldAsset.key || oldAsset.id), updatedAsset);
        assetUpdated = true;
      }
      await collectionsApi.create('asset_allocations', newItem, key);
      await Promise.allSettled([dataService.refreshGenericData('asset_allocations'), ...(assetUpdated ? [dataService.refreshGenericData('asset_items')] : [])]);
      message.success(isAllocate
        ? `Đã lập biên bản ${newItem.ticketCode}; chờ người nhận xác nhận trước khi cập nhật tài sản.`
        : `Đã lưu biên bản thu hồi ${newItem.ticketCode} và cập nhật danh mục tài sản.`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      let rollbackFailed = false;
      if (assetUpdated && oldAsset) {
        try { await collectionsApi.update('asset_items', String(oldAsset.key || oldAsset.id), oldAsset); }
        catch { rollbackFailed = true; }
      }
      message.error(rollbackFailed
        ? 'Không lưu được biên bản và cũng chưa thể hoàn tác thay đổi tài sản; hãy đối chiếu danh mục tài sản.'
        : error?.response?.data?.message || error?.message || 'Không thể tạo biên bản cấp phát/thu hồi.');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenSignModal = (record: AllocationItem) => {
    setSignTarget(record);
    setReceiverNameInput('');
    setSignModalOpen(true);
  };

  const handleConfirmSign = async () => {
    if (!signTarget || saving || signTarget.type !== 'Cấp phát' || signTarget.signedByReceiver) return;
    if (receiverNameInput.trim().toLocaleLowerCase() !== signTarget.employeeName.trim().toLocaleLowerCase()) {
      message.error('Tên xác nhận phải khớp với người nhận ghi trên biên bản.');
      return;
    }
    setSaving(true);
    const nowStr = new Date().toLocaleString('sv-SE');
    let oldAsset: any = null;
    let assetUpdated = false;
    try {
      const assetsResponse = await collectionsApi.get<any>('asset_items', { limit: 500 });
      oldAsset = findAssetByCode(assetsResponse.data?.data || [], signTarget.assetCode);
      const updatedAsset = buildAllocationAssetUpdate(oldAsset, 'Cấp phát', signTarget.employeeName, signTarget.department, currentActor(), nowStr, signTarget.ticketCode, signTarget.condition);
      await collectionsApi.update('asset_items', String(oldAsset.key || oldAsset.id), updatedAsset);
      assetUpdated = true;
      await collectionsApi.update('asset_allocations', signTarget.key, {
        signedByReceiver: true,
        signedByName: receiverNameInput.trim(),
        signedByAccount: currentActor(),
        signedAt: nowStr,
        status: 'Đã bàn giao hoàn tất',
      });
      await Promise.allSettled([dataService.refreshGenericData('asset_allocations'), dataService.refreshGenericData('asset_items')]);
      message.success(`Đã lưu xác nhận bàn giao ${signTarget.ticketCode} và cập nhật người giữ tài sản.`);
      setSignModalOpen(false);
      setDrawerOpen(false);
      await loadData();
    } catch (error: any) {
      let rollbackFailed = false;
      if (assetUpdated && oldAsset) {
        try { await collectionsApi.update('asset_items', String(oldAsset.key || oldAsset.id), oldAsset); }
        catch { rollbackFailed = true; }
      }
      message.error(rollbackFailed
        ? 'Không lưu được xác nhận và chưa thể hoàn tác danh mục tài sản; hãy đối chiếu hồ sơ tài sản và biên bản.'
        : error?.response?.data?.message || error?.message || 'Không thể lưu xác nhận bàn giao.');
    } finally {
      setSaving(false);
    }
  };

  const exportRegister = () => downloadFile('So_theo_doi_cap_phat_thu_hoi.xlsx', generateValidXlsxBlob([
    ['Mã biên bản', 'Loại', 'Mã tài sản', 'Tài sản', 'Serial', 'Mã nhân viên', 'Nhân viên', 'Phòng ban', 'Chức vụ', 'Người bàn giao', 'Ngày', 'Hạn trả', 'Mục đích', 'Tình trạng', 'Phụ kiện', 'Bồi thường', 'Trạng thái', 'Đã xác nhận', 'Thời điểm xác nhận', 'Ghi chú'],
    ...filteredData.map((item) => [item.ticketCode, item.type, item.assetCode, item.assetName, item.serialNo, item.employeeCode, item.employeeName, item.department, item.position, item.handoverPerson, item.allocatedDate, item.expectedReturnDate, item.purpose, item.condition, item.accessories, item.compensationAmount, item.status, item.type === 'Thu hồi' ? 'Đã nhập kho' : item.signedByName || (item.signedByReceiver ? 'Đã xác nhận' : 'Chưa xác nhận'), item.type === 'Thu hồi' ? item.receivedAt || '' : item.signedAt || '', item.notes]),
  ]));

  const printAllocation = (item: AllocationItem) => downloadFile(`${item.ticketCode.replace(/[^a-z0-9_-]/gi, '_')}_Bien_ban.pdf`, generateValidPdfBlob(`BIEN BAN ${item.type.toLocaleUpperCase()} TAI SAN`, `${item.ticketCode} | ${item.assetCode} - ${item.assetName}`, [
    `Nhan vien: ${item.employeeName} (${item.employeeCode || 'Chua co ma'})`, `Phong ban / chuc vu: ${item.department} / ${item.position || ''}`,
    `Nguoi ban giao: ${item.handoverPerson}`, `Ngay: ${item.allocatedDate} | Han tra: ${item.expectedReturnDate || 'Khong dat han'}`,
    `Muc dich: ${item.purpose}`, `Serial: ${item.serialNo}`, `Tinh trang: ${item.condition}`, `Phu kien: ${item.accessories || 'Khong ghi nhan'}`,
    `Boi thuong: ${item.compensationAmount || 0} VND`, `Trang thai: ${item.status}`,
    `Xac nhan: ${item.type === 'Thu hồi' ? `Da nhap kho boi ${item.receivedByAccount || 'chua ghi nhan'} luc ${item.receivedAt || ''}` : item.signedByReceiver ? `${item.signedByName || item.employeeName} luc ${item.signedAt || ''}` : 'Chua xac nhan'}`,
    `Tai khoan ghi nhan: ${item.type === 'Thu hồi' ? item.receivedByAccount || 'Chua ghi nhan' : item.signedByAccount || 'Chua ghi nhan'}`, `Ghi chu: ${item.notes || ''}`,
    'Xac nhan noi bo; khong phai chu ky so duoc chung thu so xac thuc.',
  ]));

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.ticketCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assetCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assetName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.serialNo || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase());

    const matchType = typeFilter === 'all' || item.type === typeFilter;
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;

    return matchSearch && matchType && matchStatus;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng biên bản luân chuyển</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalTickets} biên bản
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Cấp phát &amp; thu hồi thiết bị</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đang cấp phát có hiệu lực</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {inUseAllocations} tài sản
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đang phục vụ công việc hàng ngày</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chờ người nhận xác nhận</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingSignCount} phiếu chờ xác nhận
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>
            {pendingSignCount > 0 ? 'Cần người nhận xác nhận biên bản' : 'Không còn biên bản chờ xác nhận'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã thu hồi về kho</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {returnedCount} thiết bị
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Đã kiểm tra kỹ thuật &amp; nhập kho</div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã phiếu, mã TS, Serial, người nhận, phòng ban..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 340, borderRadius: 6 }}
            allowClear
          />
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            style={{ width: 170 }}
            options={[
              { label: 'Tất cả loại nghiệp vụ', value: 'all' },
              { label: '📤 Cấp phát thiết bị', value: 'Cấp phát' },
              { label: '📥 Thu hồi tài sản', value: 'Thu hồi' },
            ]}
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 190 }}
            options={[
              { label: 'Tất cả trạng thái', value: 'all' },
              { label: 'Đã bàn giao hoàn tất', value: 'Đã bàn giao hoàn tất' },
              { label: 'Chờ nhân viên xác nhận', value: 'Chờ nhân viên ký xác nhận' },
              { label: 'Đã thu hồi về kho', value: 'Đã thu hồi về kho' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={exportRegister}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập phiếu Cấp phát / Thu hồi
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={[
            {
              title: 'Mã biên bản & Loại',
              key: 'ticket',
              width: 170,
              render: (_: any, r: AllocationItem) => (
                <div>
                  <span style={{ fontWeight: 700, color: r.type === 'Cấp phát' ? '#009688' : '#2563EB', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {r.type === 'Cấp phát' ? <SendOutlined /> : <RollbackOutlined />} {r.ticketCode}
                  </span>
                  <Tag color={r.type === 'Cấp phát' ? 'cyan' : 'blue'} style={{ marginTop: 3 }}>
                    {r.type}
                  </Tag>
                </div>
              ),
            },
            {
              title: 'Thiết bị & Số Serial',
              key: 'asset',
              render: (_: any, r: AllocationItem) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.assetName}</strong>
                  <div style={{ fontSize: 12, color: '#64748B' }}>
                    Mã TS: <strong style={{ color: '#009688' }}>{r.assetCode}</strong> · Serial: <code>{r.serialNo}</code>
                  </div>
                </div>
              ),
            },
            {
              title: 'Cán bộ nhận / bàn giao',
              key: 'emp',
              render: (_: any, r: AllocationItem) => (
                <div>
                  <strong style={{ color: '#1E293B', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <UserOutlined style={{ color: '#64748B', fontSize: 12 }} /> {r.employeeName}
                  </strong>
                  <div style={{ fontSize: 11.5, color: '#64748B' }}>{r.position} · {r.department}</div>
                </div>
              ),
            },
            {
              title: 'Ngày thực hiện',
              dataIndex: 'allocatedDate',
              key: 'allocatedDate',
              width: 120,
              render: (d: string) => <span style={{ fontWeight: 500 }}>{d}</span>,
            },
            {
              title: 'Tình trạng thiết bị',
              dataIndex: 'condition',
              key: 'condition',
              render: (c: string) => <span style={{ fontSize: 12, color: '#475569' }}>{c}</span>,
            },
            {
              title: 'Trạng thái xác nhận',
              key: 'status',
              render: (_: any, r: AllocationItem) => {
                let col = 'success';
                if (r.status.includes('Chờ')) col = 'warning';
                if (r.status.includes('thu hồi')) col = 'processing';
                return (
                  <div>
                    <Tag color={col}>{r.status}</Tag>
                    <div style={{ fontSize: 11, color: r.signedByReceiver ? '#16A34A' : '#D97706', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                    {r.type === 'Thu hồi' || r.signedByReceiver ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
                    {r.type === 'Thu hồi'
                      ? `Đã nhập kho (${r.receivedAt || 'thời điểm chưa lưu'})`
                      : r.signedByReceiver ? `Đã xác nhận (${r.signedAt})` : 'Chưa xác nhận'}
                    </div>
                  </div>
                );
              },
            },
            {
              title: 'Thao tác',
              key: 'act',
              width: 150,
              render: (_: any, r: AllocationItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setDrawerOpen(true);
                    }}
                    title="Xem biên bản bàn giao"
                  >
                    Xem
                  </Button>
                  {r.type === 'Cấp phát' && !r.signedByReceiver && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<SafetyCertificateOutlined />}
                      onClick={() => handleOpenSignModal(r)}
                      style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                      title="Xác nhận bàn giao"
                    >
                      Xác nhận
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Lập phiếu Cấp phát / Thu hồi 100% trường nhập */}
      <Modal
        title="Lập Biên Bản Cấp Phát Hoặc Thu Hồi Tài Sản"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={740}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="ticketCode" label="Mã biên bản" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: CP-2026-088" />
            </Form.Item>
            <Form.Item name="type" label="Loại nghiệp vụ" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: '📤 Cấp phát cho nhân viên', value: 'Cấp phát' },
                  { label: '📥 Thu hồi về kho công ty', value: 'Thu hồi' },
                ]}
              />
            </Form.Item>
            <Form.Item name="purpose" label="Mục đích thực hiện" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Cấp phát chính thức nhân viên mới', value: 'Cấp phát chính thức cho nhân viên mới' },
                  { label: 'Cấp phát dự án ngắn hạn', value: 'Cấp phát theo dự án ngắn hạn' },
                  { label: 'Đổi máy thay thế bảo hành', value: 'Thay thế thiết bị bảo hành' },
                  { label: 'Thu hồi do nhân viên nghỉ việc', value: 'Thu hồi do nhân viên nghỉ việc' },
                  { label: 'Thu hồi định kỳ nâng cấp', value: 'Thu hồi định kỳ nâng cấp' },
                  { label: 'Thu hồi chuyển vị trí công tác', value: 'Thu hồi do chuyển đổi vị trí' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 12 }}>
            <Form.Item name="assetCode" label="Tài sản trong danh mục" rules={[{ required: true, message: 'Chọn tài sản trong danh mục' }]}>
              <Select
                showSearch
                placeholder="Chọn mã tài sản..."
                options={assets.map((asset) => ({ label: `${asset.code || asset.assetCode} — ${asset.name || asset.assetName} (${asset.status || 'Chưa rõ trạng thái'})`, value: asset.code || asset.assetCode }))}
                onChange={(code: string) => {
                  const asset = assets.find((item) => String(item.code || item.assetCode) === String(code));
                  setQuotaAssetCode(String(code || ''));
                  form.setFieldsValue({ assetName: asset?.name || asset?.assetName || '', serialNo: asset?.serialNo || asset?.serialNumber || '' });
                }}
              />
            </Form.Item>
            <Form.Item name="assetName" label="Tên tài sản / Thiết bị">
              <Input disabled placeholder="Tự lấy từ danh mục tài sản" />
            </Form.Item>
            <Form.Item name="serialNo" label="Số Serial / Service Tag">
              <Input disabled placeholder="Tự lấy từ danh mục tài sản" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeCode" label="Nhân viên nhận / bàn giao" rules={[{ required: true, message: 'Chọn nhân viên' }]}>
              <Select
                showSearch
                placeholder="Chọn nhân viên đang làm việc..."
                options={employees.map((employee) => ({ label: `${employee.code || employee.employeeCode} — ${employee.name || employee.fullName}`, value: employee.code || employee.employeeCode }))}
                onChange={(code: string) => {
                  const employee = employees.find((item) => String(item.code || item.employeeCode) === String(code));
                  setQuotaEmployee(employee || null);
                  form.setFieldsValue({ employeeName: employee?.name || employee?.fullName || '', department: employee?.department || undefined, position: employee?.position || undefined });
                }}
              />
            </Form.Item>
            <Form.Item name="position" label="Chức vụ">
              {posOptions.length > 0 ? (
                <Select options={posOptions} placeholder="Chọn chức vụ..." />
              ) : (
                <Input placeholder="Ví dụ: Senior DevOps" />
              )}
            </Form.Item>
            <Form.Item name="department" label="Phòng ban" rules={[{ required: true }]}>
              <Select
                options={deptOptions}
                placeholder="Chọn phòng ban..."
              />
            </Form.Item>
          </div>

          {allocationQuota && (
            <Alert
              type={quotaOverLimit ? 'warning' : 'info'}
              showIcon
              message={`Định mức áp dụng cho ${allocationQuota.allocatedRole}`}
              description={`Gói tiêu chuẩn: ${allocationQuota.standardPackage || 'Chưa cấu hình'} · Hạn mức: ${Number(allocationQuota.budgetLimit || 0) > 0 ? `${Number(allocationQuota.budgetLimit).toLocaleString('vi-VN')} ₫` : 'Không giới hạn'}${quotaOverLimit ? ' · Giá gốc tài sản vượt hạn mức, cần đối chiếu ngoại lệ trước khi bàn giao.' : ''}`}
              style={{ marginBottom: 12 }}
            />
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="handoverPerson" label="Cán bộ bàn giao" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Lê Hoàng Yến (HR)" />
            </Form.Item>
            <Form.Item name="allocatedDate" label="Ngày bàn giao / thu hồi" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="expectedReturnDate" label="Hạn trả dự kiến">
              <Input placeholder="Vô thời hạn hoặc ngày cụ thể" />
            </Form.Item>
          </div>

          <Form.Item name="condition" label="Tình trạng kỹ thuật & Ngoại quan" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Mới 100%, nguyên hộp seal, màn hình sắc nét không trầy xước" />
          </Form.Item>

          <Form.Item name="accessories" label="Danh sách phụ kiện kèm theo">
            <Input placeholder="Ví dụ: Củ sạc 140W Type-C, Túi chống sốc, Chuột Bluetooth, Cáp chuyển đổi..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: 12 }}>
            <Form.Item name="compensationAmount" label="Số tiền bồi thường" initialValue={0}>
              <Input type="number" min={0} step={100000} placeholder="0 đ nếu nguyên vẹn" />
            </Form.Item>
            <Form.Item name="notes" label="Ghi chú điều kiện sử dụng">
              <Input placeholder="Nhân viên có trách nhiệm bảo quản tài sản theo quy chế nội bộ" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận lập biên bản
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Xem Biên Bản Bàn Giao Chi Tiết */}
      <Drawer
        title="Biên Bản Bàn Giao &amp; Nghiệm Thu Tài Sản"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={560}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Document */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #009688', paddingBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', letterSpacing: 0.5 }}>CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM</div>
              <div style={{ fontSize: 10, color: '#64748B', marginBottom: 6 }}>Độc lập - Tự do - Hạnh phúc</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', textTransform: 'uppercase' }}>
                BIÊN BẢN {detailItem.type.toUpperCase()} TRANG THIẾT BỊ LÀM VIỆC
              </div>
              <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 700, marginTop: 2 }}>
                Số: {detailItem.ticketCode} / BB-KIYOVN
              </div>
            </div>

            {/* Parties Info */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
              <div>
                <strong style={{ color: '#009688' }}>BÊN GIAO:</strong>
                <div style={{ marginTop: 4 }}>Ông/Bà: <strong>{detailItem.handoverPerson}</strong></div>
                <div style={{ color: '#64748B' }}>Đơn vị: Phòng Nhân Sự &amp; IT</div>
              </div>
              <div>
                <strong style={{ color: '#2563EB' }}>BÊN NHẬN:</strong>
                <div style={{ marginTop: 4 }}>Ông/Bà: <strong>{detailItem.employeeName}</strong></div>
                <div style={{ color: '#64748B' }}>Vị trí: {detailItem.position} - {detailItem.department}</div>
              </div>
            </div>

            {/* Equipment Spec Table */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 12, fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Chi tiết tài sản bàn giao:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tên thiết bị:</span>
                  <strong>{detailItem.assetName}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Mã tài sản:</span>
                  <span style={{ color: '#009688', fontWeight: 700 }}>{detailItem.assetCode}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số Serial:</span>
                  <code>{detailItem.serialNo}</code>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Ngày bàn giao:</span>
                  <span>{detailItem.allocatedDate}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Hạn trả dự kiến:</span>
                  <span>{detailItem.expectedReturnDate}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Tình trạng:</span>
                  <span>{detailItem.condition}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Phụ kiện đi kèm:</span>
                  <span>{detailItem.accessories}</span>
                </div>
              </div>
            </div>

            {/* Terms */}
            <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', padding: 10, borderRadius: 6, fontSize: 11.5, color: '#92400E' }}>
              <strong>Cam kết trách nhiệm:</strong> Bên nhận cam kết sử dụng thiết bị đúng mục đích công việc, bảo quản tài sản cẩn thận. Nếu xảy ra hư hỏng hoặc mất mát do lỗi chủ quan sẽ bồi thường theo Quy chế quản lý tài sản của Công ty.
            </div>

            {/* Signature Blocks */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 6 }}>
              <div style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: 12, textAlign: 'center', background: '#FAFAFA' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748B' }}>NGƯỜI BÀN GIAO</div>
                <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontWeight: 600, fontSize: 12 }}>
                  Chưa có chữ ký được xác thực
                </div>
                <div style={{ fontWeight: 700, fontSize: 12 }}>{detailItem.handoverPerson}</div>
              </div>

              <div style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: 12, textAlign: 'center', background: '#FAFAFA' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748B' }}>{detailItem.type === 'Thu hồi' ? 'NGƯỜI NHẬN TẠI KHO' : 'NGƯỜI NHẬN TÀI SẢN'}</div>
                <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {detailItem.type === 'Thu hồi' ? (
                    <div style={{ color: '#2563EB', fontWeight: 700, fontSize: 12 }}>
                      <CheckCircleOutlined style={{ fontSize: 18 }} />
                      <div>ĐÃ NHẬP KHO</div>
                      <div style={{ fontSize: 9.5, color: '#64748B' }}>{detailItem.receivedByAccount || 'Chưa ghi nhận tài khoản'}</div>
                      <div style={{ fontSize: 9.5, color: '#64748B' }}>{detailItem.receivedAt || ''}</div>
                    </div>
                  ) : detailItem.signedByReceiver ? (
                    <div style={{ color: '#009688', fontWeight: 700, fontSize: 12 }}>
                      <SafetyCertificateOutlined style={{ fontSize: 18 }} />
                      <div>ĐÃ XÁC NHẬN</div>
                      <div style={{ fontSize: 9.5, color: '#64748B' }}>{detailItem.signedByName || detailItem.employeeName}</div>
                      <div style={{ fontSize: 9.5, color: '#64748B' }}>{detailItem.signedAt}</div>
                    </div>
                  ) : (
                    <span style={{ color: '#D97706', fontSize: 12, fontWeight: 600 }}>Chờ người nhận xác nhận...</span>
                  )}
                </div>
                <div style={{ fontWeight: 700, fontSize: 12 }}>{detailItem.employeeName}</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => printAllocation(detailItem)}
                style={{ flex: 1 }}
              >
                In biên bản (PDF)
              </Button>
              {detailItem.type === 'Cấp phát' && !detailItem.signedByReceiver && (
                <Button
                  type="primary"
                  icon={<SafetyCertificateOutlined />}
                  onClick={() => handleOpenSignModal(detailItem)}
                  style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
                >
                  Xác nhận nhận tài sản
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* MODAL: Xác nhận bàn giao biên bản */}
      <Modal
        title="Xác Nhận Nhận Bàn Giao Thiết Bị"
        open={signModalOpen}
        onCancel={() => setSignModalOpen(false)}
        footer={null}
        width={440}
      >
        {signTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
            <Alert
              message="Xác nhận nhận tài sản"
              description={`Xác nhận đã tiếp nhận tài sản ${signTarget.assetCode} - ${signTarget.assetName} theo tình trạng ghi tại biên bản ${signTarget.ticketCode}: ${signTarget.condition}.`}
              type="info"
              showIcon
            />

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 6 }}>
                Nhập lại họ tên người nhận để xác nhận:
              </label>
              <Input
                placeholder={signTarget.employeeName}
                value={receiverNameInput}
                onChange={(e) => setReceiverNameInput(e.target.value)}
              />
              <span style={{ fontSize: 11.5, color: '#64748B', marginTop: 4, display: 'block' }}>
                Hệ thống ghi tên xác nhận, tài khoản đăng nhập và thời điểm; thao tác này không tạo chữ ký số CA.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
              <Button onClick={() => setSignModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                onClick={handleConfirmSign}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Xác nhận bàn giao
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

