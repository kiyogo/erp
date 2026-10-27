import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  DollarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SwapOutlined,
  EyeOutlined,
  FileDoneOutlined,
  AuditOutlined,
  PrinterOutlined,
  UserOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip, Alert } from '../../custom-ui';
import { collectionsApi } from '../../api/endpoints';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';
import { advanceStatus, calculateAdvanceSettlement } from './advanceCalculations';

export interface EnterpriseAdvanceItem {
  key: string;
  code: string;
  employeeName: string;
  empCode: string;
  department: string;
  purpose: string;
  advanceType: 'Công tác phí' | 'Mua vật tư / Thiết bị' | 'Tiếp khách đối tác' | 'Hành chính sự vụ';
  advancedAmount: number;
  issuedAmount?: number;
  issuedAt?: string;
  disbursementReference?: string;
  spentAmount: number;
  balance: number; // Chênh lệch (dương: hoàn trả lại công ty, âm: công ty thanh toán bù)
  requestDate: string;
  settleDeadline: string;
  approver: string;
  invoicesSummary?: string;
  balanceReconciled?: boolean;
  settledAt?: string;
  status: 'Chờ cấp tạm ứng' | 'Đã hoàn ứng' | 'Đã quyết toán nội bộ' | 'Chờ thanh quyết toán' | 'Quá hạn quyết toán';
}

const INITIAL_ADVANCES: EnterpriseAdvanceItem[] = [];

export const AdvancesModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseAdvanceItem[]>(INITIAL_ADVANCES);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    void loadData();
  }, []);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();
  const [settlementModalOpen, setSettlementModalOpen] = useState(false);
  const [settlementForm] = Form.useForm();
  const [issueModalOpen, setIssueModalOpen] = useState(false);
  const [issueForm] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAdvance, setSelectedAdvance] = useState<EnterpriseAdvanceItem | null>(null);

  const localDate = new Date().toLocaleDateString('sv-SE');
  const statusOf = (record: EnterpriseAdvanceItem) => advanceStatus(record.status, record.settleDeadline, localDate);
  const totalAdvanced = data.reduce((sum, item) => sum + (Number(item.issuedAmount) || 0), 0);
  const totalSettled = data.filter((d) => statusOf(d) === 'Đã hoàn ứng' || statusOf(d) === 'Đã quyết toán nội bộ').reduce((sum, item) => sum + (Number(item.spentAmount) || 0), 0);
  const totalPending = data.filter((item) => statusOf(item) === 'Chờ thanh quyết toán' || statusOf(item) === 'Quá hạn quyết toán').reduce((sum, item) => sum + (Number(item.balance) || 0), 0);
  const overdueCount = data.filter((d) => statusOf(d) === 'Quá hạn quyết toán').length;

  const loadData = async () => {
    try {
      const [res, units] = await Promise.all([
        collectionsApi.get<EnterpriseAdvanceItem>('finance_advances', { limit: 500 }),
        dataService.fetchOrgUnitsList(),
      ]);
      setData((res.data?.data || []).map((item: any) => ({
        ...item,
        key: item.id || item.key,
        advancedAmount: Number(item.advancedAmount) || 0,
        issuedAmount: Number(item.issuedAmount ?? (item.status === 'Chờ cấp tạm ứng' ? 0 : item.advancedAmount)) || 0,
        spentAmount: Number(item.spentAmount) || 0,
        balance: Number(item.balance ?? (item.status === 'Chờ cấp tạm ứng' ? 0 : item.advancedAmount)) || 0,
        status: item.status || 'Chờ thanh quyết toán',
      })));
      setDepartmentOptions(units.map((unit) => ({ label: unit, value: unit })));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải danh sách tạm ứng.');
    }
  };

  const handleCreate = async (values: any) => {
    const adv = Number(values.advancedAmount);
    if (!Number.isFinite(adv) || adv <= 0) {
      message.error('Số tiền tạm ứng phải lớn hơn 0.');
      return;
    }
    if (data.some((item) => item.code.trim().toLowerCase() === String(values.code).trim().toLowerCase())) {
      message.error('Mã phiếu tạm ứng đã tồn tại.');
      return;
    }
    const requestDate = new Date().toLocaleDateString('sv-SE');
    if (String(values.settleDeadline) < requestDate) {
      message.error('Hạn quyết toán phải từ hôm nay trở đi.');
      return;
    }
    const newItem: EnterpriseAdvanceItem = {
      ...values,
      key: `advance-${crypto.randomUUID()}`,
      advancedAmount: adv,
      spentAmount: 0,
      issuedAmount: 0,
      balance: 0,
      requestDate,
      approver: '',
      invoicesSummary: '',
      status: 'Chờ cấp tạm ứng',
    };
    setSaving(true);
    try {
      await collectionsApi.create('finance_advances', newItem, newItem.key);
      await loadData();
      await dataService.refreshGenericData('finance_advances');
      message.success(`Đã lưu phiếu tạm ứng ${newItem.code}.`);
      setModalOpen(false);
      form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu phiếu tạm ứng.');
    } finally {
      setSaving(false);
    }
  };

  const handleRecordDisbursement = async (values: any) => {
    if (!selectedAdvance || saving) return;
    const issuedAmount = Number(values.issuedAmount);
    if (!Number.isFinite(issuedAmount) || issuedAmount <= 0 || issuedAmount > Number(selectedAdvance.advancedAmount)) {
      message.error('Số tiền cấp phải lớn hơn 0 và không vượt số tiền đề nghị.');
      return;
    }
    if (values.disbursementConfirmed !== 'yes' || !String(values.disbursementReference || '').trim()) {
      message.error('Xác nhận đã giao tiền thực tế và nhập mã tham chiếu trước khi lưu.');
      return;
    }
    const updated: EnterpriseAdvanceItem = {
      ...selectedAdvance,
      issuedAmount,
      issuedAt: new Date().toLocaleDateString('sv-SE'),
      disbursementReference: String(values.disbursementReference).trim(),
      balance: issuedAmount - Number(selectedAdvance.spentAmount || 0),
      status: 'Chờ thanh quyết toán',
    };
    setSaving(true);
    try {
      await collectionsApi.update('finance_advances', selectedAdvance.key, updated);
      setSelectedAdvance(updated);
      setIssueModalOpen(false);
      await loadData();
      await dataService.refreshGenericData('finance_advances');
      message.success(`Đã lưu thông tin cấp tiền cho phiếu ${selectedAdvance.code}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu thông tin cấp tiền.');
    } finally {
      setSaving(false);
    }
  };

  const handleSettle = async (values: any) => {
    if (!selectedAdvance || saving) return;
    const spentAmount = Number(values.spentAmount);
    if (!Number.isFinite(spentAmount) || spentAmount < 0) {
      message.error('Số thực chi phải là số tiền từ 0 trở lên.');
      return;
    }
    const issuedAmount = Number(selectedAdvance.issuedAmount || 0);
    const balanceReconciled = values.balanceReconciled === 'yes';
    let settlement: ReturnType<typeof calculateAdvanceSettlement>;
    try {
      settlement = calculateAdvanceSettlement(issuedAmount, spentAmount, balanceReconciled);
    } catch (error: any) {
      message.error(error?.message || 'Số liệu quyết toán không hợp lệ.');
      return;
    }
    const updated: EnterpriseAdvanceItem = {
      ...selectedAdvance,
      spentAmount,
      balance: settlement.balance,
      invoicesSummary: String(values.invoicesSummary || '').trim(),
      balanceReconciled,
      settledAt: settlement.status === 'Đã quyết toán nội bộ' ? new Date().toLocaleDateString('sv-SE') : undefined,
      status: settlement.status,
    };
    setSaving(true);
    try {
      await collectionsApi.update('finance_advances', selectedAdvance.key, updated);
      setSelectedAdvance(updated);
      setSettlementModalOpen(false);
      await loadData();
      await dataService.refreshGenericData('finance_advances');
      message.success(`Đã lưu số liệu quyết toán phiếu ${selectedAdvance.code}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu quyết toán tạm ứng.');
    } finally {
      setSaving(false);
    }
  };

  const filteredData = data.filter((item) => {
    const currentStatus = statusOf(item);
    const matchStatus = statusFilter === 'all' || (statusFilter === 'settled' ? currentStatus === 'Đã hoàn ứng' || currentStatus === 'Đã quyết toán nội bộ' : currentStatus === statusFilter);
    const matchSearch =
      (item.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.purpose || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã phiếu & Thời gian',
      key: 'code',
      render: (_: any, record: EnterpriseAdvanceItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#009688', fontSize: 13.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <DollarOutlined /> {record.code}
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', fontWeight: 600, marginTop: 2 }}>
            {record.advanceType}
          </div>
        </div>
      ),
    },
    {
      title: 'Nhân viên & Phòng ban',
      key: 'employeeName',
      render: (_: any, record: EnterpriseAdvanceItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#64748B' }}>
            Mã: <code>{record.empCode}</code> · {record.department}
          </div>
        </div>
      ),
    },
    {
      title: 'Mục đích tạm ứng',
      dataIndex: 'purpose',
      key: 'purpose',
      render: (p: string) => <span style={{ color: '#334155', fontSize: 12.5 }}>{p}</span>,
    },
    {
      title: 'Số tiền tạm ứng',
      dataIndex: 'advancedAmount',
      key: 'advancedAmount',
      width: 160,
      render: (val: number, record: EnterpriseAdvanceItem) => (
        <div>
          <div style={{ fontWeight: 800, color: '#1E40AF', fontSize: 13.5 }}>Đề nghị: {Number(val).toLocaleString('vi-VN')} ₫</div>
          <div style={{ color: '#64748B', fontSize: 11.5 }}>Đã cấp: {Number(record.issuedAmount || 0).toLocaleString('vi-VN')} ₫</div>
        </div>
      ),
    },
    {
      title: 'Đã quyết toán / Hoàn quỹ',
      key: 'spentAmount',
      width: 180,
      render: (_: any, record: EnterpriseAdvanceItem) => (
        <div>
          <div style={{ color: '#16A34A', fontWeight: 600 }}>Thực chi: {record.spentAmount.toLocaleString('vi-VN')} ₫</div>
          <div style={{ fontSize: 11.5, color: record.balance > 0 ? '#D97706' : '#64748B' }}>
            Còn nợ: {record.balance.toLocaleString('vi-VN')} ₫
          </div>
        </div>
      ),
    },
    {
      title: 'Hạn hoàn ứng',
      dataIndex: 'settleDeadline',
      key: 'settleDeadline',
      width: 130,
      render: (d: string, record: EnterpriseAdvanceItem) => (
        <span style={{ color: record.status === 'Quá hạn quyết toán' ? '#DC2626' : '#334155', fontWeight: record.status === 'Quá hạn quyết toán' ? 700 : 500 }}>
          {d}
        </span>
      ),
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      width: 160,
      render: (_status: string, record: EnterpriseAdvanceItem) => {
        const status = statusOf(record);
        let color = 'default';
        if (status === 'Đã hoàn ứng' || status === 'Đã quyết toán nội bộ') color = 'success';
        if (status === 'Chờ thanh quyết toán') color = 'warning';
        if (status === 'Quá hạn quyết toán') color = 'error';
        return <Tag color={color}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseAdvanceItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedAdvance(record);
            setDrawerOpen(true);
          }}
        >
          Chứng từ
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng tiền đã xác nhận cấp</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            {totalAdvanced.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Tổng số phiếu: {data.length}</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Thực chi đã quyết toán nội bộ</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalSettled.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đã ghi nhận quyết toán nội bộ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Công nợ tạm ứng đang theo dõi</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {totalPending.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>Thời hạn nộp chứng từ quyết toán: 15 ngày</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tạm ứng quá hạn thanh quyết toán</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: overdueCount > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {overdueCount} Khoản quá hạn
          </div>
          <div style={{ fontSize: 11.5, color: overdueCount > 0 ? '#DC2626' : '#16A34A', marginTop: 2 }}>Tính theo hạn ghi trên phiếu tạm ứng</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả phiếu tạm ứng' },
            { key: 'Chờ cấp tạm ứng', label: 'Chờ cấp tiền', icon: <ClockCircleOutlined style={{ color: '#64748B' }} /> },
            { key: 'Chờ thanh quyết toán', label: 'Chờ quyết toán', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'settled', label: 'Đã quyết toán', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Quá hạn quyết toán', label: 'Quá hạn hoàn ứng', icon: <WarningOutlined style={{ color: '#F59E0B' }} /> },
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
            placeholder="Tìm theo mã phiếu, tên nhân viên, lý do..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => {
            const rows = [
              ['Mã phiếu', 'Ngày lập', 'Hạn quyết toán', 'Nhân viên', 'Mã nhân viên', 'Phòng ban', 'Loại', 'Mục đích', 'Tạm ứng', 'Thực chi', 'Chênh lệch', 'Trạng thái', 'Chứng từ'],
              ...filteredData.map((item) => [item.code, item.requestDate, item.settleDeadline, item.employeeName, item.empCode, item.department, item.advanceType, item.purpose, item.advancedAmount, item.spentAmount, item.balance, statusOf(item), item.invoicesSummary || '']),
            ];
            downloadFile('so_tam_ung.xlsx', generateValidXlsxBlob(rows));
            message.success(`Đã xuất ${filteredData.length} phiếu tạm ứng.`);
          }}>
            Xuất Sổ Tạm Ứng
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập phiếu tạm ứng mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Lập phiếu đề nghị tạm ứng mới */}
      <Modal
        title="Lập Phiếu Đề Nghị Tạm Ứng Tiền Mặt / Chuyển Khoản (TK 141)"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="code" label="Mã phiếu tạm ứng" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="advanceType" label="Loại hình tạm ứng" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Công tác phí', value: 'Công tác phí' },
                  { label: 'Mua vật tư / Thiết bị', value: 'Mua vật tư / Thiết bị' },
                  { label: 'Tiếp khách đối tác', value: 'Tiếp khách đối tác' },
                  { label: 'Hành chính sự vụ', value: 'Hành chính sự vụ' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Họ tên nhân viên tạm ứng" rules={[{ required: true }]}>
              <Input placeholder="Nhập tên nhân viên" />
            </Form.Item>
            <Form.Item name="empCode" label="Mã nhân viên" rules={[{ required: true }]}><Input placeholder="Nhập mã đã cấp" /></Form.Item>
            <Form.Item name="department" label="Phòng ban" rules={[{ required: true, message: 'Vui lòng chọn phòng ban' }]}>
              <Select
                placeholder="Chọn phòng ban..."
                options={departmentOptions}
              />
            </Form.Item>
          </div>

          <Form.Item name="purpose" label="Mục đích tạm ứng chi tiết" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="Chi tiết lý do tạm ứng và nội dung công việc thực hiện..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="advancedAmount" label="Số tiền tạm ứng (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={1000000} />
            </Form.Item>
            <Form.Item name="settleDeadline" label="Hạn hoàn ứng / Nộp hóa đơn" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" disabled={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              {saving ? 'Đang lưu...' : 'Lưu phiếu tạm ứng'}
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Bảng Quyết Toán & Hóa Đơn Kèm Theo */}
      <Drawer
        title="Bảng Quyết Toán Tạm Ứng &amp; Chứng Từ Thanh Toán"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedAdvance && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedAdvance.code}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedAdvance.employeeName}
                  </div>
                </div>
                <Tag color={statusOf(selectedAdvance) === 'Đã hoàn ứng' || statusOf(selectedAdvance) === 'Đã quyết toán nội bộ' ? 'success' : statusOf(selectedAdvance) === 'Quá hạn quyết toán' ? 'error' : 'warning'}>
                  {statusOf(selectedAdvance)}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedAdvance.department} (Mã: {selectedAdvance.empCode}) · Hạn quyết toán: {selectedAdvance.settleDeadline}
              </div>
            </div>

            {/* Advance numbers summary */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Đối Chiếu Số Liệu Tạm Ứng (TK 141):
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số tiền đã cấp:</span>
                  <strong style={{ color: '#1E40AF', fontSize: 14 }}>{Number(selectedAdvance.issuedAmount || 0).toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Số tiền đề nghị:</span>
                  <strong style={{ color: '#334155', fontSize: 14 }}>{Number(selectedAdvance.advancedAmount).toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Thực chi theo hóa đơn:</span>
                  <strong style={{ color: '#16A34A', fontSize: 14 }}>{selectedAdvance.spentAmount.toLocaleString('vi-VN')} ₫</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 8 }}>
                  <span style={{ color: '#0F172A', fontWeight: 700 }}>Chênh lệch thừa/thiếu:</span>
                  <strong style={{ color: selectedAdvance.balance > 0 ? '#D97706' : '#16A34A', fontSize: 15 }}>
                    {selectedAdvance.balance > 0
                      ? `Nhân viên cần hoàn: ${selectedAdvance.balance.toLocaleString('vi-VN')} ₫`
                      : selectedAdvance.balance < 0
                        ? `Công ty cần thanh toán thêm: ${Math.abs(selectedAdvance.balance).toLocaleString('vi-VN')} ₫`
                        : 'Không còn chênh lệch'}
                  </strong>
                </div>
              </div>
            </div>

            {/* Invoices breakdown */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                <AuditOutlined /> Bảng Kê / Tham Chiếu Chứng Từ:
              </div>
              <div style={{ fontSize: 12.5, color: '#334155', fontStyle: 'italic', background: '#FFFFFF', padding: '10px 12px', borderRadius: 4, border: '1px solid #E2E8F0' }}>
                {selectedAdvance.invoicesSummary || 'Chưa ghi nhận bảng kê hoặc số chứng từ.'}
              </div>
            </div>

            <Alert message="Màn hình lưu số liệu quyết toán nội bộ; chưa thực hiện chuyển tiền hoặc thu tiền qua ngân hàng/quỹ." type="info" showIcon />

            <div style={{ display: 'flex', gap: 10 }}>
              {statusOf(selectedAdvance) === 'Chờ cấp tạm ứng' && (
                <Button
                  type="primary"
                  style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                  onClick={() => {
                    issueForm.setFieldsValue({ issuedAmount: selectedAdvance.advancedAmount, disbursementReference: '', disbursementConfirmed: 'no' });
                    setIssueModalOpen(true);
                  }}
                >
                  Ghi nhận cấp tiền
                </Button>
              )}
              {(statusOf(selectedAdvance) === 'Chờ thanh quyết toán' || statusOf(selectedAdvance) === 'Quá hạn quyết toán') && (
                <Button
                  type="primary"
                  style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                  onClick={() => {
                    settlementForm.setFieldsValue({ spentAmount: selectedAdvance.spentAmount || 0, invoicesSummary: selectedAdvance.invoicesSummary || '', balanceReconciled: 'no' });
                    setSettlementModalOpen(true);
                  }}
                >
                  Ghi nhận quyết toán
                </Button>
              )}
              <Button
                icon={<PrinterOutlined />}
                onClick={() => downloadFile(`quyet_toan_${selectedAdvance.code}.pdf`, generateValidPdfBlob(`QUYET TOAN TAM UNG ${selectedAdvance.code}`, `${selectedAdvance.employeeName} | ${selectedAdvance.department} | Han ${selectedAdvance.settleDeadline}`, [
                  `Muc dich: ${selectedAdvance.purpose}`,
                  `Tien de nghi: ${Number(selectedAdvance.advancedAmount).toLocaleString('vi-VN')} VND`,
                  `Tien da cap: ${Number(selectedAdvance.issuedAmount || 0).toLocaleString('vi-VN')} VND`,
                  `Thuc chi: ${Number(selectedAdvance.spentAmount).toLocaleString('vi-VN')} VND`,
                  `Chenh lech: ${Number(selectedAdvance.balance).toLocaleString('vi-VN')} VND`,
                  `Trang thai: ${statusOf(selectedAdvance)}`,
                  `Bang ke/tham chieu: ${selectedAdvance.invoicesSummary || 'Chua ghi nhan'}`,
                  'Ban in phuc vu doi chieu noi bo; khong xac nhan giao dich tien mat/ngan hang.',
                ]))}
              >
                Tải phiếu quyết toán PDF
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      <Modal title="Ghi nhận đã cấp tạm ứng" open={issueModalOpen} onCancel={() => setIssueModalOpen(false)} footer={null} width={540}>
        <Form form={issueForm} layout="vertical" onFinish={handleRecordDisbursement} style={{ marginTop: 14 }}>
          <Form.Item name="issuedAmount" label="Số tiền đã cấp thực tế (VNĐ)" rules={[{ required: true }]}><Input type="number" min={1} step={1} /></Form.Item>
          <Form.Item name="disbursementReference" label="Mã phiếu chi hoặc tham chiếu giao dịch" rules={[{ required: true }]}><Input /></Form.Item>
          <Alert message="Chỉ lưu khi tiền đã được giao/chuyển thực tế. Thao tác này ghi nhận sổ nội bộ, không tự gửi lệnh ngân hàng." type="info" showIcon />
          <Form.Item name="disbursementConfirmed" label="Đã giao/chuyển tiền thực tế?" rules={[{ required: true }]}>
            <Select options={[{ label: 'Chưa giao tiền', value: 'no' }, { label: 'Đã giao/chuyển tiền', value: 'yes' }]} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setIssueModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" disabled={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>{saving ? 'Đang lưu...' : 'Lưu xác nhận'}</Button>
          </div>
        </Form>
      </Modal>

      <Modal title="Ghi nhận quyết toán nội bộ" open={settlementModalOpen} onCancel={() => setSettlementModalOpen(false)} footer={null} width={560}>
        <Form form={settlementForm} layout="vertical" onFinish={handleSettle} style={{ marginTop: 14 }}>
          <Form.Item name="spentAmount" label="Tổng thực chi theo chứng từ (VNĐ)" rules={[{ required: true }]}>
            <Input type="number" min={0} step={1} />
          </Form.Item>
          <Form.Item name="invoicesSummary" label="Bảng kê hoặc số tham chiếu chứng từ" rules={[{ required: true, message: 'Nhập bảng kê hoặc tham chiếu chứng từ.' }]}>
            <Input.TextArea rows={3} placeholder="Ghi các khoản chi và số tham chiếu chứng từ đã đối chiếu" />
          </Form.Item>
          <Form.Item name="balanceReconciled" label="Chênh lệch tiền đã thực sự hoàn trả/chi bổ sung?" rules={[{ required: true }]}>
            <Select options={[{ label: 'Chưa, còn chờ xử lý tiền', value: 'no' }, { label: 'Có, đã đối chiếu giao nhận tiền', value: 'yes' }]} />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={() => setSettlementModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" disabled={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>{saving ? 'Đang lưu...' : 'Lưu quyết toán'}</Button>
          </div>
        </Form>
      </Modal>
    </div>
  );
};

