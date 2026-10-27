import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  SwapOutlined,
  CheckCircleOutlined,
  CarOutlined,
  ClockCircleOutlined,
  EyeOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  EnvironmentOutlined,
  UserOutlined,
  CheckOutlined,
  CloseOutlined,
  InboxOutlined,
  ArrowRightOutlined,
  SendOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Alert, Steps } from '../../custom-ui';
import { collectionsApi } from '../../api/endpoints';
import { downloadFile, generateValidPdfBlob, generateValidXlsxBlob } from '../../utils/fileExporter';

export interface TransferItem {
  key: string;
  transferCode: string;
  assetCode: string;
  assetName: string;
  category: string;
  serialNo: string;
  originalPrice: number;
  netBookValue: number;
  fromLocation: string;
  fromDepartment: string;
  fromCustodian: string;
  toLocation: string;
  toDepartment: string;
  toCustodian: string;
  carrierName: string;
  trackingCode: string;
  shippingCost: number;
  transferDate: string;
  expectedDeliveryDate: string;
  receivedDate?: string;
  reason: string;
  approver: string;
  approvedAt?: string;
  status: 'Chờ phê duyệt' | 'Đang vận chuyển' | 'Đã điều chuyển hoàn tất' | 'Từ chối điều chuyển';
  condition: string;
  receiveCondition?: string;
  notes: string;
}

const INITIAL_TRANSFERS: TransferItem[] = [];

export const AssetTransferModule: React.FC = () => {
  const [data, setData] = useState<TransferItem[]>(INITIAL_TRANSFERS);

  useEffect(() => {
    void loadData();
  }, []);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');

  // Modals & Drawers state
  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<TransferItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [receiveModalOpen, setReceiveModalOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<TransferItem | null>(null);
  const [receiveConditionText, setReceiveConditionText] = useState('');
  const [saving, setSaving] = useState(false);

  const [form] = Form.useForm();

  const loadData = async () => {
    try {
      const response = await collectionsApi.get<TransferItem>('asset_transfers', { limit: 500 });
      setData((response.data?.data || []).map((item: any) => ({ ...item, key: item.id || item.key })));
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tải danh sách điều chuyển tài sản.');
    }
  };

  // Metrics
  const totalTransfers = data.length;
  const inTransitCount = data.filter((d) => d.status === 'Đang vận chuyển').length;
  const pendingApprovalCount = data.filter((d) => d.status === 'Chờ phê duyệt').length;
  const completedCount = data.filter((d) => d.status === 'Đã điều chuyển hoàn tất').length;

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      transferDate: new Date().toLocaleDateString('sv-SE'),
      shippingCost: 0,
    });
    setModalOpen(true);
  };

  const handleCreate = async (values: any) => {
    if (data.some((item) => item.transferCode.trim().toLowerCase() === String(values.transferCode).trim().toLowerCase())) {
      message.error('Mã lệnh điều chuyển đã tồn tại.');
      return;
    }
    const cost = Number(values.shippingCost || 0);
    if (!Number.isFinite(cost) || cost < 0 || String(values.expectedDeliveryDate) < String(values.transferDate)) {
      message.error('Cước vận chuyển phải không âm và ngày nhận dự kiến không sớm hơn ngày gửi.');
      return;
    }
    setSaving(true);
    try {
      const assets = await collectionsApi.get<any>('asset_items', { limit: 500 });
      const asset = (assets.data?.data || []).find((item: any) => String(item.code || item.assetCode).trim().toLowerCase() === String(values.assetCode).trim().toLowerCase());
      if (!asset) {
        message.error('Mã tài sản không có trong danh mục tài sản đang lưu.');
        return;
      }
      if (asset.status === 'Đã thanh lý') {
        message.error('Không thể điều chuyển tài sản đã thanh lý.');
        return;
      }
    const newItem: TransferItem = {
      ...values,
      key: `transfer-${crypto.randomUUID()}`,
      assetCode: asset.code || asset.assetCode,
      assetName: asset.name || asset.assetName || values.assetName,
      category: asset.category || '',
      originalPrice: Number(asset.originalPrice) || 0,
      netBookValue: Number(asset.netBookValue) || 0,
      serialNo: String(values.serialNo || ''),
      shippingCost: cost,
      approver: '',
      approvedAt: undefined,
      receivedDate: undefined,
      receiveCondition: undefined,
      status: 'Chờ phê duyệt',
    };
      await collectionsApi.create('asset_transfers', newItem, newItem.key);
      setData((current) => [newItem, ...current]);
      await dataService.refreshGenericData('asset_transfers').catch(() => []);
    message.success(`Đã lập lệnh điều chuyển tài sản: ${values.transferCode}`);
    setModalOpen(false);
    form.resetFields();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể lưu lệnh điều chuyển tài sản.');
    } finally {
      setSaving(false);
    }
  };

  const currentActor = () => {
    try {
      const user = JSON.parse(localStorage.getItem('minepanel_user') || 'null');
      return user?.name || user?.fullName || user?.email || 'Người dùng hiện tại';
    } catch { return 'Người dùng hiện tại'; }
  };

  const handleTransition = async (record: TransferItem, status: TransferItem['status']) => {
    if (saving || record.status === 'Đã điều chuyển hoàn tất' || record.status === 'Từ chối điều chuyển') return;
    const updated: TransferItem = {
      ...record,
      status,
      ...(status === 'Đang vận chuyển' ? { approver: currentActor(), approvedAt: new Date().toLocaleString('sv-SE') } : {}),
    };
    setSaving(true);
    try {
      await collectionsApi.update('asset_transfers', record.key, updated);
      setData((current) => current.map((item) => item.key === record.key ? updated : item));
      setDetailItem((current) => current?.key === record.key ? updated : current);
      await dataService.refreshGenericData('asset_transfers').catch(() => []);
      message.success(status === 'Đang vận chuyển' ? `Đã lưu phê duyệt lệnh ${record.transferCode}.` : `Đã lưu từ chối lệnh ${record.transferCode}.`);
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể cập nhật trạng thái điều chuyển.');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = (record: TransferItem) => handleTransition(record, 'Đang vận chuyển');
  const handleReject = (record: TransferItem) => handleTransition(record, 'Từ chối điều chuyển');

  const handleOpenReceiveModal = (record: TransferItem) => {
    setReceiveTarget(record);
    setReceiveConditionText('');
    setReceiveModalOpen(true);
  };

  const handleConfirmReceive = async () => {
    if (!receiveTarget || saving) return;
    if (receiveTarget.status !== 'Đang vận chuyển') {
      message.error('Chỉ xác nhận nhận tài sản sau khi lệnh đã được duyệt gửi.');
      return;
    }
    if (!receiveConditionText.trim()) {
      message.error('Nhập tình trạng tài sản thực tế khi nhận.');
      return;
    }
    setSaving(true);
    let oldAsset: any = null;
    let assetUpdated = false;
    try {
      const assets = await collectionsApi.get<any>('asset_items', { limit: 500 });
      oldAsset = (assets.data?.data || []).find((item: any) => String(item.code || item.assetCode).trim().toLowerCase() === receiveTarget.assetCode.trim().toLowerCase());
      if (!oldAsset) throw new Error('Không tìm thấy tài sản gốc để cập nhật vị trí và người quản lý.');
      const receivedDate = new Date().toLocaleString('sv-SE');
      const actor = currentActor();
      const updatedAsset = {
        ...oldAsset,
        location: receiveTarget.toLocation,
        department: receiveTarget.toDepartment,
        assignedTo: receiveTarget.toCustodian,
        history: [
          ...(Array.isArray(oldAsset.history) ? oldAsset.history : []),
          { key: `transfer-${crypto.randomUUID()}`, date: receivedDate, action: 'Điều chuyển tài sản', actor, note: `Phiếu ${receiveTarget.transferCode}; ${receiveTarget.fromLocation} → ${receiveTarget.toLocation}; tình trạng nhận: ${receiveConditionText.trim()}` },
        ],
      };
      await collectionsApi.update('asset_items', String(oldAsset.key || oldAsset.id), updatedAsset);
      assetUpdated = true;
      const updatedTransfer: TransferItem = {
        ...receiveTarget,
        status: 'Đã điều chuyển hoàn tất',
        receivedDate,
        receiveCondition: receiveConditionText.trim(),
      };
      await collectionsApi.update('asset_transfers', receiveTarget.key, updatedTransfer);
      setData((current) => current.map((item) => item.key === receiveTarget.key ? updatedTransfer : item));
      setDetailItem((current) => current?.key === receiveTarget.key ? updatedTransfer : current);
      await Promise.allSettled([dataService.refreshGenericData('asset_transfers'), dataService.refreshGenericData('asset_items')]);
      message.success(`Đã lưu nghiệm thu và cập nhật vị trí tài sản ${receiveTarget.assetCode}.`);
      setReceiveModalOpen(false);
    } catch (error: any) {
      let rollbackFailed = false;
      if (assetUpdated && oldAsset) {
        try { await collectionsApi.update('asset_items', String(oldAsset.key || oldAsset.id), oldAsset); }
        catch { rollbackFailed = true; }
      }
      message.error(rollbackFailed
        ? 'Nghiệm thu gặp lỗi và chưa thể hoàn tác vị trí tài sản. Hãy đối chiếu hồ sơ tài sản và phiếu điều chuyển.'
        : error?.response?.data?.message || error?.message || 'Không thể lưu nghiệm thu điều chuyển.');
    } finally {
      setSaving(false);
    }
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.transferCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assetCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.assetName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.fromLocation || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.toLocation || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.toCustodian || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.trackingCode || '').toLowerCase().includes(searchText.toLowerCase());

    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchLocation =
      locationFilter === 'all' ||
      item.fromLocation.includes(locationFilter) ||
      item.toLocation.includes(locationFilter);

    return matchSearch && matchStatus && matchLocation;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng số lệnh điều chuyển</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalTransfers} lệnh
          </div>
          <div style={{ fontSize: 11.5, color: '#64748B', marginTop: 2 }}>Luân chuyển giữa các chi nhánh</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đang trên đường vận chuyển</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {inTransitCount} lô hàng
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Đang giao liên tỉnh / chuyển phát</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chờ lãnh đạo phê duyệt</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingApprovalCount} lệnh chờ duyệt
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>
            {pendingApprovalCount > 0 ? 'Cần xem xét duyệt xuất kho' : 'Không có lệnh tồn đọng'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã hoàn tất điều chuyển</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {completedCount} tài sản
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Đã nghiệm thu tại nơi đến</div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã điều chuyển, mã TS, địa điểm gửi / nhận, vận đơn..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 340, borderRadius: 6 }}
            allowClear
          />
          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            style={{ width: 180 }}
            options={[
              { label: 'Tất cả trạng thái', value: 'all' },
              { label: 'Chờ phê duyệt', value: 'Chờ phê duyệt' },
              { label: 'Đang vận chuyển', value: 'Đang vận chuyển' },
              { label: 'Đã điều chuyển hoàn tất', value: 'Đã điều chuyển hoàn tất' },
            ]}
          />
          <Select
            value={locationFilter}
            onChange={setLocationFilter}
            style={{ width: 170 }}
            options={[
              { label: 'Tất cả địa điểm', value: 'all' },
              { label: 'Hà Nội', value: 'Hà Nội' },
              { label: 'TP.HCM', value: 'TP.HCM' },
              { label: 'Đà Nẵng', value: 'Đà Nẵng' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={() => {
            const rows = [
              ['Mã lệnh', 'Mã tài sản', 'Tên tài sản', 'Số serial', 'Từ vị trí', 'Đến vị trí', 'Phòng ban gửi', 'Phòng ban nhận', 'Người bàn giao', 'Người nhận', 'Ngày gửi', 'Ngày dự kiến nhận', 'Ngày nhận', 'Cước vận chuyển', 'Trạng thái'],
              ...filteredData.map((item) => [item.transferCode, item.assetCode, item.assetName, item.serialNo, item.fromLocation, item.toLocation, item.fromDepartment, item.toDepartment, item.fromCustodian, item.toCustodian, item.transferDate, item.expectedDeliveryDate, item.receivedDate || '', item.shippingCost, item.status]),
            ];
            downloadFile('so_lenh_dieu_chuyen.xlsx', generateValidXlsxBlob(rows));
            message.success(`Đã xuất ${filteredData.length} lệnh điều chuyển.`);
          }}>
            Xuất Excel
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Lập lệnh điều chuyển mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={[
            {
              title: 'Mã điều chuyển & Vận đơn',
              key: 'code',
              width: 170,
              render: (_: any, r: TransferItem) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <SwapOutlined /> {r.transferCode}
                  </span>
                  <div style={{ fontSize: 11, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <CarOutlined /> {r.trackingCode}
                  </div>
                </div>
              ),
            },
            {
              title: 'Tài sản & Số Serial',
              key: 'asset',
              render: (_: any, r: TransferItem) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.assetName}</strong>
                  <div style={{ fontSize: 12, color: '#64748B' }}>
                    Mã TS: <strong style={{ color: '#009688' }}>{r.assetCode}</strong> · Serial: <code>{r.serialNo}</code>
                  </div>
                </div>
              ),
            },
            {
              title: 'Lộ trình điều chuyển',
              key: 'route',
              render: (_: any, r: TransferItem) => (
                <div>
                  <div style={{ fontSize: 12, color: '#DC2626', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <EnvironmentOutlined /> Từ: <strong>{r.fromLocation}</strong> ({r.fromCustodian})
                  </div>
                  <div style={{ fontSize: 12, color: '#16A34A', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <ArrowRightOutlined /> Đến: <strong>{r.toLocation}</strong> ({r.toCustodian})
                  </div>
                </div>
              ),
            },
            {
              title: 'Thời gian & Cước phí',
              key: 'time',
              render: (_: any, r: TransferItem) => (
                <div>
                  <div style={{ fontSize: 12, color: '#1E293B' }}>Gửi: {r.transferDate}</div>
                  <div style={{ fontSize: 11.5, color: '#64748B' }}>Dự kiến: {r.expectedDeliveryDate}</div>
                  <div style={{ fontSize: 11, color: '#2563EB', fontWeight: 600 }}>Cước: {r.shippingCost.toLocaleString('vi-VN')} ₫</div>
                </div>
              ),
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              render: (s: string) => {
                let col = 'success';
                if (s === 'Đang vận chuyển') col = 'processing';
                if (s === 'Chờ phê duyệt') col = 'warning';
                if (s === 'Từ chối điều chuyển') col = 'error';
                return <Tag color={col}>{s}</Tag>;
              },
            },
            {
              title: 'Thao tác',
              key: 'act',
              width: 170,
              render: (_: any, r: TransferItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setDrawerOpen(true);
                    }}
                    title="Xem chi tiết lệnh điều chuyển"
                  >
                    Xem
                  </Button>
                  {r.status === 'Chờ phê duyệt' && (
                    <>
                      <Button
                        size="small"
                        type="primary"
                        icon={<CheckOutlined />}
                        onClick={() => handleApprove(r)}
                        style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }}
                        title="Phê duyệt điều chuyển"
                      >
                        Duyệt
                      </Button>
                      <Button
                        size="small"
                        danger
                        icon={<CloseOutlined />}
                        onClick={() => handleReject(r)}
                        title="Từ chối điều chuyển"
                      >
                        Từ chối
                      </Button>
                    </>
                  )}
                  {r.status === 'Đang vận chuyển' && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<SafetyCertificateOutlined />}
                      onClick={() => handleOpenReceiveModal(r)}
                      style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }}
                      title="Tiếp nhận & nghiệm thu"
                    >
                      Tiếp nhận
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Lập lệnh điều chuyển 100% trường nhập */}
      <Modal
        title="Lập Lệnh Điều Chuyển Tài Sản Giữa Các Chi Nhánh"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="transferCode" label="Mã lệnh điều chuyển" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: DC-2026-008" />
            </Form.Item>
            <Form.Item name="assetCode" label="Mã tài sản" rules={[{ required: true, message: 'Nhập mã TS' }]}>
              <Input placeholder="Ví dụ: TS-SRV-002" />
            </Form.Item>
            <Form.Item name="serialNo" label="Số Serial / Tag" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: 8H7K2X3" />
            </Form.Item>
          </div>

          <Form.Item name="assetName" label="Tên tài sản điều chuyển" rules={[{ required: true, message: 'Nhập tên tài sản' }]}>
            <Input placeholder="Ví dụ: Switch Core Cisco Catalyst 9300 48 Port" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: '#FEF2F2', padding: 12, borderRadius: 8, border: '1px solid #FECACA' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#991B1B', marginBottom: 8 }}>ĐƠN VỊ XUẤT ĐI:</div>
              <Form.Item name="fromLocation" label="Địa điểm gửi" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: 'Trụ sở chính Hà Nội', value: 'Trụ sở chính Hà Nội (Keangnam Landmark)' },
                    { label: 'IDC Viettel Duy Tân Hà Nội', value: 'IDC Viettel Duy Tân Hà Nội' },
                    { label: 'Chi nhánh TP.HCM', value: 'Chi nhánh TP.HCM (Tòa nhà Bitexco)' },
                    { label: 'IDC FPT Tân Thuận Q7', value: 'IDC FPT Tân Thuận Q7' },
                    { label: 'Chi nhánh Đà Nẵng', value: 'Chi nhánh Đà Nẵng (Bạch Đằng Complex)' },
                  ]}
                />
              </Form.Item>
            <Form.Item name="fromDepartment" label="Phòng ban gửi" rules={[{ required: true }]}>
                <Input placeholder="Ví dụ: Khối Vận Hành & Hạ Tầng" />
              </Form.Item>
              <Form.Item name="fromCustodian" label="Người bàn giao gửi đi" rules={[{ required: true }]}>
                <Input placeholder="Ví dụ: Đặng Đình Long" />
              </Form.Item>
            </div>

            <div style={{ background: '#F0FDF4', padding: 12, borderRadius: 8, border: '1px solid #BBF7D0' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#166534', marginBottom: 8 }}>ĐƠN VỊ TIẾP NHẬN:</div>
              <Form.Item name="toLocation" label="Địa điểm nhận" rules={[{ required: true }]}>
                <Select
                  options={[
                    { label: 'Chi nhánh TP.HCM', value: 'Chi nhánh TP.HCM (Tòa nhà Bitexco)' },
                    { label: 'IDC FPT Tân Thuận Q7', value: 'IDC FPT Tân Thuận Q7' },
                    { label: 'Chi nhánh Đà Nẵng', value: 'Chi nhánh Đà Nẵng (Bạch Đằng Complex)' },
                    { label: 'Trụ sở chính Hà Nội', value: 'Trụ sở chính Hà Nội (Keangnam Landmark)' },
                    { label: 'IDC Viettel Duy Tân Hà Nội', value: 'IDC Viettel Duy Tân Hà Nội' },
                  ]}
                />
              </Form.Item>
            <Form.Item name="toDepartment" label="Phòng ban nhận" rules={[{ required: true }]}>
                <Input placeholder="Ví dụ: Khối Kinh Doanh TP.HCM" />
              </Form.Item>
              <Form.Item name="toCustodian" label="Người phụ trách tiếp nhận" rules={[{ required: true }]}>
                <Input placeholder="Ví dụ: Nguyễn Văn Tuấn" />
              </Form.Item>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12, marginTop: 12 }}>
            <Form.Item name="carrierName" label="Đơn vị vận chuyển" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Viettel Post Hỏa Tốc / Xe chuyên dụng Cty" />
            </Form.Item>
            <Form.Item name="trackingCode" label="Mã vận đơn / Biển số xe">
              <Input placeholder="Ví dụ: VTP-889123" />
            </Form.Item>
            <Form.Item name="shippingCost" label="Cước phí vận chuyển (VNĐ)">
              <Input type="number" min={0} step={100000} placeholder="Ví dụ: 850000" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="transferDate" label="Ngày bắt đầu gửi" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="expectedDeliveryDate" label="Ngày dự kiến đến nơi" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <Form.Item name="reason" label="Mục đích & Lý do điều chuyển" rules={[{ required: true, message: 'Nhập lý do điều chuyển' }]}>
            <Input placeholder="Ví dụ: Tăng cường hạ tầng phục vụ dự án Core Gateway phía Nam" />
          </Form.Item>

          <Form.Item name="condition" label="Hiện trạng kỹ thuật đóng gói xuất kho">
            <Input placeholder="Ví dụ: Mới 100%, đóng thùng gỗ xốp bảo vệ chống va đập" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận lập lệnh điều chuyển
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi Tiết Lệnh Điều Chuyển & Lộ Trình Vận Chuyển */}
      <Drawer
        title="Lệnh Điều Chuyển Tài Sản &amp; Lộ Trình Vận Tải"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Document */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #009688', paddingBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', letterSpacing: 0.5 }}>CÔNG TY CP CÔNG NGHỆ KIYOVN</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginTop: 2 }}>
                LỆNH ĐIỀU CHUYỂN TÀI SẢN NỘI BỘ
              </div>
              <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>
                Mã số: {detailItem.transferCode} · Ngày lập: {detailItem.transferDate}
              </div>
            </div>

            {/* Stepper Process Timeline */}
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 12 }}>Tiến Trình Điều Chuyển Thực Tế:</div>
              <Steps
                direction="vertical"
                size="small"
                current={
                  detailItem.status === 'Chờ phê duyệt'
                    ? 0
                    : detailItem.status === 'Đang vận chuyển'
                    ? 1
                    : 2
                }
                items={[
                  {
                    title: 'Lập lệnh & Duyệt xuất kho',
                    description: detailItem.approvedAt
                      ? `Đã duyệt bởi ${detailItem.approver} vào ${detailItem.approvedAt}`
                      : 'Chờ phê duyệt',
                  },
                  {
                    title: 'Đang vận chuyển liên tỉnh',
                    description: `${detailItem.carrierName} · Vận đơn: ${detailItem.trackingCode} (Dự kiến đến: ${detailItem.expectedDeliveryDate})`,
                  },
                  {
                    title: 'Tiếp nhận & Nghiệm thu tại điểm đến',
                    description: detailItem.receivedDate
                      ? `Đã tiếp nhận bởi ${detailItem.toCustodian} vào ${detailItem.receivedDate}`
                      : `Chờ cán bộ ${detailItem.toCustodian} xác nhận nhận hàng`,
                  },
                ]}
              />
            </div>

            {/* Equipment Spec Table */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 8 }}>Thông tin tài sản điều chuyển:</div>
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
                  <span style={{ color: '#64748B' }}>Nguyên giá / Còn lại:</span>
                  <span>{detailItem.originalPrice.toLocaleString('vi-VN')} ₫ / <strong style={{ color: '#16A34A' }}>{detailItem.netBookValue.toLocaleString('vi-VN')} ₫</strong></span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Hiện trạng đóng gói:</span>
                  <span>{detailItem.condition}</span>
                </div>
                {detailItem.receiveCondition && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16A34A' }}>
                    <span>Hiện trạng khi nhận:</span>
                    <strong>{detailItem.receiveCondition}</strong>
                  </div>
                )}
              </div>
            </div>

            {/* Locations Breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12 }}>
              <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', padding: 10, borderRadius: 6 }}>
                <strong style={{ color: '#991B1B' }}>ĐIỂM ĐI:</strong>
                <div>{detailItem.fromLocation}</div>
                <div style={{ color: '#64748B' }}>{detailItem.fromDepartment}</div>
                <div>Phụ trách: <strong>{detailItem.fromCustodian}</strong></div>
              </div>
              <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', padding: 10, borderRadius: 6 }}>
                <strong style={{ color: '#166534' }}>ĐIỂM ĐẾN:</strong>
                <div>{detailItem.toLocation}</div>
                <div style={{ color: '#64748B' }}>{detailItem.toDepartment}</div>
                <div>Phụ trách: <strong>{detailItem.toCustodian}</strong></div>
              </div>
            </div>

            {/* Reason */}
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: 10, borderRadius: 6, fontSize: 12 }}>
              <strong style={{ color: '#1E40AF' }}>Mục đích điều chuyển: </strong>
              <span>{detailItem.reason}</span>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => downloadFile(`lenh_dieu_chuyen_${detailItem.transferCode}.pdf`, generateValidPdfBlob(`LENH DIEU CHUYEN ${detailItem.transferCode}`, `${detailItem.assetCode} | ${detailItem.assetName}`, [
                  `Tu: ${detailItem.fromLocation} / ${detailItem.fromDepartment} / ${detailItem.fromCustodian}`,
                  `Den: ${detailItem.toLocation} / ${detailItem.toDepartment} / ${detailItem.toCustodian}`,
                  `Don vi van chuyen: ${detailItem.carrierName} | Van don: ${detailItem.trackingCode}`,
                  `Ngay gui: ${detailItem.transferDate} | Du kien: ${detailItem.expectedDeliveryDate} | Da nhan: ${detailItem.receivedDate || 'Chua nhan'}`,
                  `Gia tri tai san: ${detailItem.originalPrice.toLocaleString('vi-VN')} VND | Gia tri con lai: ${detailItem.netBookValue.toLocaleString('vi-VN')} VND`,
                  `Cuoc van chuyen: ${detailItem.shippingCost.toLocaleString('vi-VN')} VND`,
                  `Ly do: ${detailItem.reason}`,
                  `Tinh trang khi gui: ${detailItem.condition || 'Chua ghi nhan'}`,
                  `Tinh trang khi nhan: ${detailItem.receiveCondition || 'Chua nhan'}`,
                  `Trang thai: ${detailItem.status} | Nguoi duyet: ${detailItem.approver || 'Chua duyet'}`,
                ]))}
                style={{ flex: 1 }}
              >
                In lệnh điều chuyển
              </Button>
              {detailItem.status === 'Chờ phê duyệt' && (
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={() => handleApprove(detailItem)}
                  style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
                >
                  Duyệt lệnh xuất kho
                </Button>
              )}
              {detailItem.status === 'Đang vận chuyển' && (
                <Button
                  type="primary"
                  icon={<SafetyCertificateOutlined />}
                  onClick={() => handleOpenReceiveModal(detailItem)}
                  style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', flex: 1 }}
                >
                  Xác nhận tiếp nhận
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* MODAL: Nghiệm thu tiếp nhận tài sản tại nơi đến */}
      <Modal
        title="Biên Bản Nghiệm Thu &amp; Tiếp Nhận Tài Sản Điều Chuyển"
        open={receiveModalOpen}
        onCancel={() => setReceiveModalOpen(false)}
        footer={null}
        width={460}
      >
        {receiveTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
            <Alert
              message="Xác nhận tiếp nhận tài sản đến đích"
              description={`Xác nhận lô hàng "${receiveTarget.assetName}" (Vận đơn: ${receiveTarget.trackingCode}) đã được giao an toàn đến ${receiveTarget.toLocation}.`}
              type="success"
              showIcon
            />

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 6 }}>
                Đánh giá tình trạng ngoại quan &amp; kỹ thuật khi nhận:
              </label>
              <Input.TextArea
                rows={3}
                value={receiveConditionText}
                onChange={(e) => setReceiveConditionText(e.target.value)}
                placeholder="Nhập tình trạng máy khi mở niêm phong kiểm tra..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <Button onClick={() => setReceiveModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleConfirmReceive}
                style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }}
              >
                Xác nhận nghiệm thu
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
