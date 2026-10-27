import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  ToolOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  WarningOutlined,
  DollarOutlined,
  UserOutlined,
  AuditOutlined,
  CheckOutlined,
  AlertOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Alert, Progress } from '../../custom-ui';

export interface RepairItem {
  key: string;
  repairCode: string;
  assetCode: string;
  assetName: string;
  category: string;
  serialNo: string;
  requester: string;
  department: string;
  severity: 'Khẩn cấp (P1)' | 'Cao (P2)' | 'Trung bình (P3)' | 'Thấp';
  repairUnit: 'Nội bộ IT Cty' | 'Trung tâm bảo hành chính hãng' | 'Đơn vị dịch vụ ngoài';
  vendor: string;
  vendorContact: string;
  issueDescription: string;
  rootCause: string;
  solution: string;
  replacedParts: string;
  estimatedCost: number;
  actualCost: number;
  costBearing: 'Bảo hành miễn phí hãng' | 'Công ty chi trả' | 'Bảo hiểm chi trả' | 'Cá nhân bồi thường';
  startDate: string;
  expectedEndDate: string;
  completedDate?: string;
  warrantyAfterRepair: string;
  status: 'Chờ duyệt báo giá' | 'Đang sửa chữa tại hãng' | 'Chờ linh kiện thay thế' | 'Đã sửa xong & Bàn giao' | 'Không thể sửa chữa';
  approver: string;
  approvedAt?: string;
  notes: string;
}

import { useEffect } from 'react';
import { assetRepairsApi, collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';

export const AssetRepairsModule: React.FC = () => {
  const [data, setData] = useState<RepairItem[]>([]);
  const [assets, setAssets] = useState<any[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  // Modals & Drawers state
  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<RepairItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<RepairItem | null>(null);
  const [actualCostInput, setActualCostInput] = useState<number | ''>('');
  const [completeNotes, setCompleteNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const loadData = async () => {
    try {
      const [res, orgUnits, assetRes] = await Promise.all([
        collectionsApi.get<RepairItem>('asset_repairs', { limit: 500 }),
        dataService.fetchOrgUnitsList(),
        collectionsApi.get<any>('asset_items', { limit: 500 }),
      ]);
      const list = res.data?.data || [];
      setData(list.map((item: any) => ({ ...item, key: item.key })));
      setAssets(assetRes.data?.data || []);
      setDeptOptions(orgUnits.map((u) => ({ label: u, value: u })));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải danh sách phiếu sửa chữa.');
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Metrics
  const totalRepairs = data.length;
  const totalActualSpend = data.reduce((sum, item) => sum + (item.actualCost || 0), 0);
  const inProgressCount = data.filter((d) => d.status === 'Đang sửa chữa tại hãng' || d.status === 'Chờ linh kiện thay thế').length;
  const pendingQuoteCount = data.filter((d) => d.status === 'Chờ duyệt báo giá').length;
  const fixedCount = data.filter((d) => d.status === 'Đã sửa xong & Bàn giao').length;
  const closedCount = data.filter((d) => d.status === 'Đã sửa xong & Bàn giao' || d.status === 'Không thể sửa chữa').length;
  const completionRate = closedCount ? Math.round((fixedCount / closedCount) * 100) : null;

  const handleOpenCreate = () => {
    form.resetFields();
    const today = new Date().toISOString().substring(0, 10);
    form.setFieldsValue({
      repairCode: `SC-${today.replace(/-/g, '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      severity: 'Cao (P2)',
      repairUnit: 'Trung tâm bảo hành chính hãng',
      vendor: '',
      costBearing: 'Công ty chi trả',
      startDate: today,
      expectedEndDate: '',
      estimatedCost: undefined,
      department: undefined,
      warrantyAfterRepair: '',
      approver: '',
    });
    setModalOpen(true);
  };

  const handleCreate = async (values: any) => {
    if (saving) return;
    if (data.some((item) => item.repairCode.trim().toLocaleLowerCase() === String(values.repairCode).trim().toLocaleLowerCase())) {
      message.error('Mã phiếu sửa đã tồn tại.');
      return;
    }
    const estimatedCost = Number(values.estimatedCost);
    if (!Number.isSafeInteger(estimatedCost) || estimatedCost < 0 || estimatedCost > 1_000_000_000_000 || String(values.expectedEndDate) < String(values.startDate)) {
      message.error('Dự toán phải là số nguyên không âm hợp lệ và ngày dự kiến không sớm hơn ngày gửi sửa.');
      return;
    }
    setSaving(true);
    try {
      const saved = (await assetRepairsApi.create({ ...values, estimatedCost })).data.record as RepairItem;
      await Promise.allSettled([dataService.refreshGenericData('asset_repairs'), dataService.refreshGenericData('asset_items')]);
      message.success(`Đã lưu phiếu ${saved.repairCode} và chuyển tài sản sang trạng thái sửa chữa.`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể tạo phiếu sửa chữa.');
    } finally {
      setSaving(false);
    }
  };

  const handleApproveQuote = async (record: RepairItem) => {
    if (saving || record.status !== 'Chờ duyệt báo giá') return;
    setSaving(true);
    try {
      const approved = (await assetRepairsApi.transition(record.key, 'approve')).data.record as RepairItem;
      setData((current) => current.map((item) => item.key === approved.key ? approved : item));
      setDetailItem((current) => current?.key === approved.key ? approved : current);
      await dataService.refreshGenericData('asset_repairs').catch(() => []);
      message.success(`Đã lưu phê duyệt báo giá ${record.repairCode} bởi ${approved.approver}.`);
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể duyệt báo giá.');
    } finally {
      setSaving(false);
    }
  };

  const handleRepairStatusUpdate = async (record: RepairItem, nextStatus: 'Đang sửa chữa tại hãng' | 'Chờ linh kiện thay thế' | 'Không thể sửa chữa') => {
    if (saving) return;
    const validSource = nextStatus === 'Chờ linh kiện thay thế'
      ? record.status === 'Đang sửa chữa tại hãng'
      : nextStatus === 'Đang sửa chữa tại hãng'
        ? record.status === 'Chờ linh kiện thay thế'
        : record.status === 'Đang sửa chữa tại hãng' || record.status === 'Chờ linh kiện thay thế';
    if (!validSource) return;

    setSaving(true);
    try {
      const updated = (await assetRepairsApi.transition(record.key, 'transition', { status: nextStatus })).data.record as RepairItem;
      setData((current) => current.map((item) => item.key === updated.key ? updated : item));
      setDetailItem((current) => current?.key === updated.key ? updated : current);
      await Promise.allSettled([dataService.refreshGenericData('asset_repairs'), dataService.refreshGenericData('asset_items')]);
      message.success(`Đã lưu trạng thái ${nextStatus} cho phiếu ${record.repairCode}.`);
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể cập nhật trạng thái sửa chữa.');
    } finally {
      setSaving(false);
    }
  };

  const confirmUnrepairable = (record: RepairItem) => Modal.confirm({
    title: 'Xác nhận tài sản không thể sửa?',
    content: `Phiếu ${record.repairCode} sẽ đóng và tài sản ${record.assetCode} được chuyển sang trạng thái chờ thanh lý.`,
    okText: 'Xác nhận không thể sửa',
    cancelText: 'Hủy',
    onOk: () => handleRepairStatusUpdate(record, 'Không thể sửa chữa'),
  });

  const handleOpenCompleteModal = (record: RepairItem) => {
    setCompleteTarget(record);
    setActualCostInput('');
    setCompleteNotes('');
    setCompleteModalOpen(true);
  };

  const handleConfirmComplete = async () => {
    if (!completeTarget || saving || completeTarget.status !== 'Đang sửa chữa tại hãng') return;
    const actualCost = Number(actualCostInput);
    if (actualCostInput === '' || !Number.isSafeInteger(actualCost) || actualCost < 0 || actualCost > 1_000_000_000_000 || !completeNotes.trim()) {
      message.error('Nhập chi phí thực tế là số nguyên không âm hợp lệ và kết quả nghiệm thu.');
      return;
    }
    setSaving(true);
    try {
      const completed = (await assetRepairsApi.transition(completeTarget.key, 'complete', {
        actualCost,
        completionNotes: completeNotes.trim(),
      })).data.record as RepairItem;
      setData((current) => current.map((item) => item.key === completed.key ? completed : item));
      setDetailItem((current) => current?.key === completed.key ? completed : current);
      await Promise.allSettled([dataService.refreshGenericData('asset_repairs'), dataService.refreshGenericData('asset_items')]);
      message.success(`Đã lưu nghiệm thu ${completeTarget.repairCode} và trả trạng thái tài sản về sử dụng/kho.`);
      setCompleteModalOpen(false);
      setDrawerOpen(false);
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || error?.message || 'Không thể nghiệm thu sửa chữa.');
    } finally {
      setSaving(false);
    }
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.repairCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assetCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assetName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.vendor || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.requester || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.issueDescription || '').toLowerCase().includes(searchText.toLowerCase());

    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSeverity = severityFilter === 'all' || item.severity === severityFilter;

    return matchSearch && matchStatus && matchSeverity;
  });

  const exportRegister = () => downloadFile('So_theo_doi_sua_chua_tai_san.xlsx', generateValidXlsxBlob([
    ['Mã phiếu', 'Mã tài sản', 'Tài sản', 'Serial', 'Mức độ', 'Người báo', 'Phòng ban', 'Đơn vị sửa', 'Liên hệ', 'Mô tả sự cố', 'Nguyên nhân', 'Phương án', 'Linh kiện', 'Dự toán', 'Thực tế', 'Nguồn chi trả', 'Ngày gửi', 'Hẹn xong', 'Ngày bàn giao', 'Bảo hành sau sửa', 'Người duyệt', 'Ngày duyệt', 'Trạng thái', 'Ghi chú'],
    ...filteredData.map((item) => [item.repairCode, item.assetCode, item.assetName, item.serialNo, item.severity, item.requester, item.department, item.vendor, item.vendorContact, item.issueDescription, item.rootCause, item.solution, item.replacedParts, item.estimatedCost, item.actualCost, item.costBearing, item.startDate, item.expectedEndDate, item.completedDate || '', item.warrantyAfterRepair, item.approver, item.approvedAt || '', item.status, item.notes]),
  ]));

  const printRepair = (item: RepairItem) => downloadFile(`${item.repairCode.replace(/[^a-z0-9_-]/gi, '_')}_Phieu_sua_chua.pdf`, generateValidPdfBlob('PHIEU BAO HONG VA SUA CHUA TAI SAN', `${item.repairCode} | ${item.assetCode} - ${item.assetName}`, [
    `Serial: ${item.serialNo}`, `Muc do: ${item.severity}`, `Nguoi bao: ${item.requester} | Phong ban: ${item.department}`,
    `Don vi sua: ${item.vendor} | Lien he: ${item.vendorContact || 'Chua ghi nhan'}`, `Hien tuong: ${item.issueDescription}`,
    `Nguyen nhan: ${item.rootCause || 'Chua ghi nhan'}`, `Phuong an: ${item.solution || 'Chua ghi nhan'}`, `Linh kien thay: ${item.replacedParts || 'Chua ghi nhan'}`,
    `Du toan: ${item.estimatedCost} VND | Thuc te: ${item.actualCost} VND | Nguon: ${item.costBearing}`,
    `Ngay gui: ${item.startDate} | Hen hoan thanh: ${item.expectedEndDate} | Ngay ban giao: ${item.completedDate || 'Chua hoan tat'}`,
    `Bao hanh sau sua: ${item.warrantyAfterRepair || 'Chua ghi nhan'}`, `Nguoi duyet: ${item.approver || 'Chua duyet'} | ${item.approvedAt || ''}`,
    `Trang thai: ${item.status}`, `Ghi chu / nghiem thu: ${item.notes || 'Chua ghi nhan'}`,
  ]));

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chi phí sửa chữa thực tế đã ghi nhận</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalActualSpend.toLocaleString('vi-VN')} ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>{fixedCount} lượt sửa đã quyết toán</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đang sửa chữa tại hãng</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {inProgressCount} thiết bị
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Đang thay thế linh kiện / bảo hành</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chờ duyệt báo giá dự toán</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingQuoteCount} phiếu chờ duyệt
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>
            {pendingQuoteCount > 0 ? 'Cần lãnh đạo phê duyệt ngân sách' : 'Tất cả báo giá đã duyệt'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tỷ lệ nghiệm thu thành công</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {completionRate === null ? 'Chưa có dữ liệu' : `${completionRate}% đã sửa xong`}
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>{fixedCount} hoàn tất / {closedCount} phiếu đã đóng</div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã phiếu sửa, mã TS, người báo hỏng, sự cố, trung tâm sửa..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 340, borderRadius: 6 }}
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 190 }}
            options={[
              { label: 'Tất cả trạng thái', value: 'all' },
              { label: 'Chờ duyệt báo giá', value: 'Chờ duyệt báo giá' },
              { label: 'Đang sửa chữa tại hãng', value: 'Đang sửa chữa tại hãng' },
              { label: 'Chờ linh kiện thay thế', value: 'Chờ linh kiện thay thế' },
              { label: 'Đã sửa xong & Bàn giao', value: 'Đã sửa xong & Bàn giao' },
              { label: 'Không thể sửa chữa', value: 'Không thể sửa chữa' },
            ]}
          />
          <Select
            value={severityFilter}
            onChange={setSeverityFilter}
            style={{ width: 170 }}
            options={[
              { label: 'Tất cả mức độ sự cố', value: 'all' },
              { label: 'Khẩn cấp (P1)', value: 'Khẩn cấp (P1)' },
              { label: 'Cao (P2)', value: 'Cao (P2)' },
              { label: 'Trung bình (P3)', value: 'Trung bình (P3)' },
              { label: 'Thấp', value: 'Thấp' },
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
            Lập phiếu báo hỏng &amp; sửa chữa
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={[
            {
              title: 'Mã phiếu & Mức độ',
              key: 'code',
              width: 170,
              render: (_: any, r: RepairItem) => {
                let sevCol = 'blue';
                if (r.severity.includes('P1')) sevCol = 'red';
                if (r.severity.includes('P2')) sevCol = 'orange';
                return (
                  <div>
                    <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <ToolOutlined /> {r.repairCode}
                    </span>
                    <Tag color={sevCol} style={{ marginTop: 3 }}>
                      {r.severity}
                    </Tag>
                  </div>
                );
              },
            },
            {
              title: 'Tài sản & Sự cố hư hỏng',
              key: 'asset',
              render: (_: any, r: RepairItem) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.assetName}</strong>
                  <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600 }}>Mã: {r.assetCode} · SN: {r.serialNo}</div>
                  <div style={{ fontSize: 12, color: '#DC2626', marginTop: 2 }}>⚠️ {r.issueDescription}</div>
                </div>
              ),
            },
            {
              title: 'Người báo hỏng & Đơn vị sửa',
              key: 'vendor',
              render: (_: any, r: RepairItem) => (
                <div>
                  <div style={{ fontWeight: 600, color: '#1E293B' }}>
                    <UserOutlined style={{ fontSize: 11, color: '#64748B' }} /> {r.requester} ({r.department})
                  </div>
                  <div style={{ fontSize: 12, color: '#2563EB', marginTop: 2 }}>{r.vendor}</div>
                </div>
              ),
            },
            {
              title: 'Dự toán / Thực tế',
              key: 'cost',
              render: (_: any, r: RepairItem) => (
                <div>
                  <div style={{ fontSize: 12, color: '#64748B' }}>Dự toán: {Number(r.estimatedCost || 0).toLocaleString('vi-VN')} ₫</div>
                  <strong style={{ color: '#16A34A', fontSize: 13 }}>
                    Thực tế: {Number(r.actualCost || 0).toLocaleString('vi-VN')} ₫
                  </strong>
                  <div style={{ fontSize: 11, color: '#64748B' }}>Nguồn: {r.costBearing}</div>
                </div>
              ),
            },
            {
              title: 'Thời gian thực hiện',
              key: 'dates',
              render: (_: any, r: RepairItem) => (
                <div style={{ fontSize: 12 }}>
                  <div>Gửi: {r.startDate}</div>
                  <div style={{ color: '#64748B' }}>Hẹn: {r.expectedEndDate}</div>
                  {r.completedDate && <div style={{ color: '#16A34A', fontWeight: 600 }}>Xong: {r.completedDate}</div>}
                </div>
              ),
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              render: (s: string) => {
                let col = 'success';
                if (s.includes('Đang sửa')) col = 'processing';
                if (s.includes('Chờ')) col = 'warning';
                if (s.includes('Không thể')) col = 'error';
                return <Tag color={col}>{s}</Tag>;
              },
            },
            {
              title: 'Thao tác',
              key: 'act',
              width: 250,
              render: (_: any, r: RepairItem) => (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setDrawerOpen(true);
                    }}
                    title="Xem chi tiết hồ sơ sửa chữa"
                  >
                    Xem
                  </Button>
                  {r.status === 'Chờ duyệt báo giá' && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<CheckOutlined />}
                      disabled={saving}
                      onClick={() => handleApproveQuote(r)}
                      style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                      title="Duyệt báo giá"
                    >
                      Duyệt
                    </Button>
                  )}
                  {r.status === 'Đang sửa chữa tại hãng' && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<SafetyCertificateOutlined />}
                      disabled={saving}
                      onClick={() => handleOpenCompleteModal(r)}
                      style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }}
                      title="Nghiệm thu & bàn giao"
                    >
                      Nghiệm thu
                    </Button>
                  )}
                  {r.status === 'Đang sửa chữa tại hãng' && (
                    <>
                      <Button size="small" disabled={saving} onClick={() => handleRepairStatusUpdate(r, 'Chờ linh kiện thay thế')} title="Tạm dừng chờ linh kiện">Chờ linh kiện</Button>
                      <Button size="small" danger disabled={saving} onClick={() => confirmUnrepairable(r)} title="Đóng phiếu và chuyển chờ thanh lý">Không thể sửa</Button>
                    </>
                  )}
                  {r.status === 'Chờ linh kiện thay thế' && (
                    <>
                      <Button size="small" type="primary" disabled={saving} onClick={() => handleRepairStatusUpdate(r, 'Đang sửa chữa tại hãng')}>Tiếp tục sửa</Button>
                      <Button size="small" danger disabled={saving} onClick={() => confirmUnrepairable(r)}>Không thể sửa</Button>
                    </>
                  )}
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Lập phiếu báo hỏng sửa chữa 100% trường nhập */}
      <Modal
        title="Lập Phiếu Báo Hỏng &amp; Yêu Cầu Sửa Chữa Thiết Bị"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Form.Item name="repairCode" label="Mã phiếu sửa" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: SC-2026-020" />
            </Form.Item>
            <Form.Item name="severity" label="Mức độ nghiêm trọng" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Khẩn cấp (P1) - Dừng hệ thống', value: 'Khẩn cấp (P1)' },
                  { label: 'Cao (P2) - Ảnh hưởng lớn', value: 'Cao (P2)' },
                  { label: 'Trung bình (P3) - Lỗi cục bộ', value: 'Trung bình (P3)' },
              { label: 'Thấp - Sự cố nhỏ', value: 'Thấp' },
                ]}
              />
            </Form.Item>
            <Form.Item name="repairUnit" label="Hình thức sửa chữa" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Trung tâm bảo hành chính hãng', value: 'Trung tâm bảo hành chính hãng' },
                  { label: 'Nội bộ IT Cty khắc phục', value: 'Nội bộ IT Cty' },
                  { label: 'Đơn vị dịch vụ ngoài', value: 'Đơn vị dịch vụ ngoài' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 14 }}>
            <Form.Item name="assetCode" label="Tài sản trong danh mục" rules={[{ required: true, message: 'Chọn tài sản trong danh mục' }]}>
              <Select
                showSearch
                placeholder="Chọn mã tài sản..."
                options={assets.map((asset) => ({ label: `${asset.code || asset.assetCode} — ${asset.name || asset.assetName} (${asset.status || 'Chưa rõ trạng thái'})`, value: asset.code || asset.assetCode }))}
                onChange={(code: string) => {
                  const asset = assets.find((item) => String(item.code || item.assetCode) === String(code));
                  form.setFieldsValue({ assetName: asset?.name || asset?.assetName || '', serialNo: asset?.serialNo || asset?.serialNumber || '' });
                }}
              />
            </Form.Item>
            <Form.Item name="assetName" label="Tên tài sản cần sửa">
              <Input disabled placeholder="Tự lấy từ danh mục tài sản" />
            </Form.Item>
            <Form.Item name="serialNo" label="Số Serial / Tag">
              <Input disabled placeholder="Tự lấy từ danh mục tài sản" />
            </Form.Item>
          </div>

          <Form.Item name="issueDescription" label="Mô tả hiện tượng hư hỏng / Sự cố chi tiết" rules={[{ required: true, message: 'Nhập mô tả lỗi' }]}>
            <Input.TextArea rows={2} placeholder="Mô tả cụ thể: sọc màn hình, máy không lên nguồn, liệt phím, pin phồng..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Form.Item name="rootCause" label="Nguyên nhân sơ bộ">
              <Input placeholder="Ví dụ: Chai pin theo thời gian, va đập hoặc ẩm mạch..." />
            </Form.Item>
            <Form.Item name="solution" label="Phương án khắc phục dự kiến">
              <Input placeholder="Ví dụ: Thay Pin Zin, Ép cáp màn hình, Thay bàn phím..." />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 14 }}>
            <Form.Item name="vendor" label="Đơn vị / Trung tâm sửa chữa" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Dell Care Service Center" />
            </Form.Item>
            <Form.Item name="vendorContact" label="Hotline / Người phụ trách">
              <Input placeholder="Ví dụ: 0988.123.456" />
            </Form.Item>
            <Form.Item name="costBearing" label="Nguồn kinh phí chi trả" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Công ty chi trả', value: 'Công ty chi trả' },
                  { label: 'Bảo hành miễn phí hãng', value: 'Bảo hành miễn phí hãng' },
                  { label: 'Bảo hiểm chi trả', value: 'Bảo hiểm chi trả' },
                  { label: 'Cá nhân bồi thường', value: 'Cá nhân bồi thường' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 14 }}>
            <Form.Item name="estimatedCost" label="Dự toán kinh phí sửa (VNĐ)" rules={[{ required: true }]}>
              <Input type="number" min={0} step={100000} placeholder="Ví dụ: 2500000" />
            </Form.Item>
            <Form.Item name="startDate" label="Ngày gửi máy" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="expectedEndDate" label="Ngày dự kiến hoàn thành" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Form.Item name="requester" label="Người báo hỏng" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Hoàng Quốc Dũng" />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban" rules={[{ required: true }]}>
              <Select
                options={deptOptions}
                placeholder="Chọn phòng ban..."
              />
            </Form.Item>
            <Form.Item name="approver" label="Người phê duyệt">
              <Input disabled placeholder="Ghi nhận tài khoản khi duyệt báo giá" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" disabled={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận gửi phiếu sửa chữa
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Xem Hồ Sơ Sửa Chữa Chi Tiết */}
      <Drawer
        title="Hồ Sơ Sửa Chữa &amp; Khắc Phục Sự Cố Kỹ Thuật"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header */}
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>{detailItem.repairCode}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A', marginTop: 2 }}>{detailItem.assetName}</div>
                </div>
                <Tag color={detailItem.severity.includes('P1') ? 'error' : 'orange'}>{detailItem.severity}</Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Mã TS: <strong>{detailItem.assetCode}</strong> · Serial: <code>{detailItem.serialNo}</code>
              </div>
            </div>

            {/* Problem & Solution */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Chi tiết sự cố &amp; Phương án:</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>
                  <span style={{ color: '#DC2626', fontWeight: 600 }}>Hiện tượng hỏng: </span>
                  <span>{detailItem.issueDescription}</span>
                </div>
                {detailItem.rootCause && (
                  <div>
                    <span style={{ color: '#64748B', fontWeight: 600 }}>Nguyên nhân: </span>
                    <span>{detailItem.rootCause}</span>
                  </div>
                )}
                {detailItem.solution && (
                  <div>
                    <span style={{ color: '#16A34A', fontWeight: 600 }}>Giải pháp kỹ thuật: </span>
                    <span>{detailItem.solution}</span>
                  </div>
                )}
                {detailItem.replacedParts && (
                  <div>
                    <span style={{ color: '#2563EB', fontWeight: 600 }}>Linh kiện thay thế: </span>
                    <span>{detailItem.replacedParts}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Financials */}
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: 14, borderRadius: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1E40AF', marginBottom: 8 }}>Dự Toán Kinh Phí &amp; Thanh Toán</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5 }}>
                <div>
                  <span style={{ color: '#64748B' }}>Dự toán ban đầu:</span>
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{Number(detailItem.estimatedCost || 0).toLocaleString('vi-VN')} ₫</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Thực tế thanh toán:</span>
                  <div style={{ fontWeight: 700, color: '#16A34A' }}>{Number(detailItem.actualCost || 0).toLocaleString('vi-VN')} ₫</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Nguồn chi trả:</span>
                  <strong style={{ color: '#2563EB' }}>{detailItem.costBearing}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Bảo hành sau sửa:</span>
                  <strong>{detailItem.warrantyAfterRepair}</strong>
                </div>
              </div>
            </div>

            {/* Vendor & Timings */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Đơn vị sửa chữa:</span>
                <strong>{detailItem.vendor}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Liên hệ kỹ thuật:</span>
                <span>{detailItem.vendorContact}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Ngày gửi máy:</span>
                <span>{detailItem.startDate}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: '#64748B' }}>Hẹn hoàn thành:</span>
                <span>{detailItem.expectedEndDate}</span>
              </div>
              {detailItem.completedDate && (
                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16A34A', fontWeight: 600 }}>
                  <span>Thực tế bàn giao:</span>
                  <span>{detailItem.completedDate}</span>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => printRepair(detailItem)}
                style={{ flex: 1 }}
              >
                In phiếu sửa (PDF)
              </Button>
              {detailItem.status === 'Chờ duyệt báo giá' && (
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  disabled={saving}
                  onClick={() => handleApproveQuote(detailItem)}
                  style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
                >
                  Duyệt báo giá
                </Button>
              )}
              {detailItem.status === 'Đang sửa chữa tại hãng' && (
                <>
                  <Button
                    type="primary"
                    icon={<SafetyCertificateOutlined />}
                    disabled={saving}
                    onClick={() => handleOpenCompleteModal(detailItem)}
                    style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', flex: 1 }}
                  >
                    Nghiệm thu bàn giao
                  </Button>
                  <Button disabled={saving} onClick={() => handleRepairStatusUpdate(detailItem, 'Chờ linh kiện thay thế')}>Chờ linh kiện</Button>
                  <Button danger disabled={saving} onClick={() => confirmUnrepairable(detailItem)}>Không thể sửa</Button>
                </>
              )}
              {detailItem.status === 'Chờ linh kiện thay thế' && (
                <>
                  <Button type="primary" disabled={saving} onClick={() => handleRepairStatusUpdate(detailItem, 'Đang sửa chữa tại hãng')}>Tiếp tục sửa</Button>
                  <Button danger disabled={saving} onClick={() => confirmUnrepairable(detailItem)}>Không thể sửa</Button>
                </>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* MODAL: Nghiệm thu hoàn thành sửa chữa */}
      <Modal
        title="Biên Bản Nghiệm Thu Kỹ Thuật Sau Sửa Chữa"
        open={completeModalOpen}
        onCancel={() => setCompleteModalOpen(false)}
        footer={null}
        width={480}
      >
        {completeTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
            <Alert
              message="Ghi nhận nghiệm thu sửa chữa"
              description={`Nhập chi phí và kết quả kiểm tra thực tế của tài sản ${completeTarget.assetCode} - ${completeTarget.assetName}.`}
              type="success"
              showIcon
            />

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 6 }}>
                Chi phí sửa chữa thực tế (VNĐ):
              </label>
              <Input
                type="number"
                min={0}
                step={100000}
                value={actualCostInput}
                onChange={(e) => setActualCostInput(Number(e.target.value))}
                style={{ fontSize: 15, fontWeight: 700, color: '#16A34A' }}
              />
              <span style={{ fontSize: 11.5, color: '#64748B', marginTop: 4, display: 'block' }}>
                * Dự toán ban đầu: {Number(completeTarget.estimatedCost || 0).toLocaleString('vi-VN')} ₫
              </span>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 6 }}>
                Đánh giá chất lượng sau sửa chữa &amp; Bàn giao:
              </label>
              <Input.TextArea
                rows={3}
                value={completeNotes}
                onChange={(e) => setCompleteNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <Button onClick={() => setCompleteModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                disabled={saving}
                onClick={handleConfirmComplete}
                style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }}
              >
                Xác nhận nghiệm thu &amp; Bàn giao
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

