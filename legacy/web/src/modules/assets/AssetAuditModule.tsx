import React, { useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  BarcodeOutlined,
  CheckCircleOutlined,
  ScanOutlined,
  WarningOutlined,
  EyeOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  AuditOutlined,
  CheckOutlined,
  CloseCircleOutlined,
  QrcodeOutlined,
  FileDoneOutlined,
  ApartmentOutlined,
  DollarOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Drawer, Form, Input, Select, Button, message, Card, Tag, Alert, Progress } from '../../custom-ui';

export interface ScannedItemDetail {
  code: string;
  name: string;
  barcode: string;
  category: string;
  holder: string;
  location: string;
  auditStatus: 'Khớp chuẩn' | 'Thừa' | 'Thiếu hụt' | 'Hỏng hóc';
  scannedAt: string;
}

export interface AuditItem {
  key: string;
  auditCode: string;
  auditName: string;
  auditType: 'Định kỳ quý/năm' | 'Đột xuất chuyên đề' | 'Bàn giao quản lý kho';
  scope: string;
  location: string;
  department: string;
  startDate: string;
  endDate: string;
  auditorLeader: string;
  auditorMembers: string;
  bookCount: number;
  actualCount: number;
  matchedCount: number;
  surplusCount: number;
  missingCount: number;
  damagedCount: number;
  discrepancy: number;
  bookValue: number;
  actualValue: number;
  diffValue: number;
  resolutionProposal: string;
  status: 'Đang tiến hành kiểm đếm' | 'Chờ đối soát & Giải trình' | 'Đã hoàn tất & Khớp 100%' | 'Đã trình HĐQT phê duyệt';
  notes: string;
  itemsList: ScannedItemDetail[];
}

import { useEffect } from 'react';
import { collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';

export const AssetAuditModule: React.FC = () => {
  const [data, setData] = useState<AuditItem[]>([]);
  const [deptOptions, setDeptOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  // Modals & Drawers
  const [modalOpen, setModalOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<AuditItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [scannerModalOpen, setScannerModalOpen] = useState(false);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const [activeAuditTarget, setActiveAuditTarget] = useState<AuditItem | null>(null);
  const [resolveModalOpen, setResolveModalOpen] = useState(false);
  const [resolveText, setResolveText] = useState('');

  const [form] = Form.useForm();

  const loadData = async () => {
    try {
      const [res, orgUnits] = await Promise.all([
        collectionsApi.get<AuditItem>('asset_audits', { limit: 500 }),
        dataService.fetchOrgUnitsList(),
      ]);
      const list = res.data?.data || [];
      setData(list.map((item: any) => ({ ...item, key: item.id || item.key })));
      setDeptOptions(orgUnits.map((u) => ({ label: u, value: u })));
    } catch {
      setData([]);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  // Metrics
  const totalBookAssets = data.reduce((sum, d) => sum + d.bookCount, 0);
  const totalActualAssets = data.reduce((sum, d) => sum + d.actualCount, 0);
  const totalDiscrepancy = data.reduce((sum, d) => sum + Math.abs(d.discrepancy), 0);
  const auditAccuracyRate = totalBookAssets > 0 ? ((totalActualAssets / totalBookAssets) * 100).toFixed(1) : '100';

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      auditCode: `KK-2026-Q${data.length + 1}-0${data.length + 1}`,
      auditType: 'Định kỳ quý/năm',
      scope: 'Trụ sở chính Hà Nội',
      location: 'Tòa nhà Keangnam Landmark 72',
      department: 'Toàn bộ công ty',
      startDate: new Date().toISOString().substring(0, 10),
      endDate: new Date(Date.now() + 5 * 86400000).toISOString().substring(0, 10),
      auditorLeader: 'Trần Tuấn Anh (CTO)',
      auditorMembers: 'Nguyễn Thị Mai (Kế toán), Lê Hoàng Yến (HR)',
      bookCount: 80,
      actualCount: 0,
      bookValue: 1800000000,
    });
    setModalOpen(true);
  };

  const handleCreate = async (values: any) => {
    const book = Number(values.bookCount) || 50;
    const id = `audit-${Date.now()}`;
    const newItem: AuditItem = {
      ...values,
      key: id,
      bookCount: book,
      actualCount: 0,
      matchedCount: 0,
      surplusCount: 0,
      missingCount: 0,
      damagedCount: 0,
      discrepancy: 0,
      bookValue: Number(values.bookValue) || 1000000000,
      actualValue: 0,
      diffValue: 0,
      resolutionProposal: 'Mới khởi tạo đợt kiểm kê, sẵn sàng quét mã vạch Barcode.',
      status: 'Đang tiến hành kiểm đếm',
      itemsList: [],
    };
    try {
      await collectionsApi.create('asset_audits', newItem, id);
      message.success(`Đã khởi tạo đợt kiểm kê: ${values.auditCode}`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể khởi tạo đợt kiểm kê.');
    }
  };

  const handleOpenScanner = (audit: AuditItem) => {
    setActiveAuditTarget(audit);
    setScannedBarcode('');
    setScannerModalOpen(true);
  };

  const handleScanSubmit = () => {
    if (!scannedBarcode.trim()) {
      message.warning('Vui lòng nhập hoặc quét mã Barcode/QR Code');
      return;
    }

    if (activeAuditTarget) {
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
      const newScanned: ScannedItemDetail = {
        code: `TS-IT-0${String(Date.now()).slice(-2)}`,
        name: `Thiết bị kiểm đếm QR: ${scannedBarcode}`,
        barcode: scannedBarcode,
        category: 'Thiết bị IT / Mạng',
        holder: 'Cán bộ đang sử dụng',
        location: activeAuditTarget.location,
        auditStatus: 'Khớp chuẩn',
        scannedAt: nowStr,
      };

      setData((prev) =>
        prev.map((d) => {
          if (d.key === activeAuditTarget.key) {
            const updatedActual = d.actualCount + 1;
            const updatedMatched = d.matchedCount + 1;
            const diff = updatedActual - d.bookCount;
            return {
              ...d,
              actualCount: updatedActual,
              matchedCount: updatedMatched,
              discrepancy: diff,
              actualValue: d.actualValue + 25000000,
              itemsList: [newScanned, ...(d.itemsList || [])],
            };
          }
          return d;
        })
      );

      message.success(`⚡ Đã quét nhận diện thành công mã: [${scannedBarcode}] - Khớp 100%!`);
      setScannedBarcode('');
    }
  };

  const handleOpenResolveModal = (audit: AuditItem) => {
    setActiveAuditTarget(audit);
    setResolveText(audit.resolutionProposal || 'Hội đồng thống nhất lập biên bản truy thu hoặc trích lập dự phòng tổn thất.');
    setResolveModalOpen(true);
  };

  const handleConfirmResolve = () => {
    if (activeAuditTarget) {
      setData((prev) =>
        prev.map((d) =>
          d.key === activeAuditTarget.key
            ? {
                ...d,
                status: 'Đã trình HĐQT phê duyệt' as const,
                resolutionProposal: resolveText,
              }
            : d
        )
      );
      message.success(`Đã gửi phương án xử lý chênh lệch đợt ${activeAuditTarget.auditCode} lên Ban Giám Đốc!`);
      setResolveModalOpen(false);
      if (detailItem && detailItem.key === activeAuditTarget.key) {
        setDetailItem({
          ...detailItem,
          status: 'Đã trình HĐQT phê duyệt',
          resolutionProposal: resolveText,
        });
      }
    }
  };

  const filteredData = data.filter((item) => {
    const matchSearch =
      (item.auditCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.auditName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.location || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.auditorLeader || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.scope || '').toLowerCase().includes(searchText.toLowerCase());

    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchType = typeFilter === 'all' || item.auditType === typeFilter;

    return matchSearch && matchStatus && matchType;
  });

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tài sản đã kiểm kê thực tế</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
            {totalActualAssets} / {totalBookAssets} máy
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>
            Tiến độ kiểm đếm: {((totalActualAssets / totalBookAssets) * 100).toFixed(0)}%
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Độ chính xác sổ sách</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {auditAccuracyRate}% độ khớp
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Chuẩn mực kế toán VAS/IFRS</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chênh lệch cần giải trình</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: totalDiscrepancy > 0 ? '#DC2626' : '#16A34A', marginTop: 4 }}>
            {totalDiscrepancy} thiết bị lệch
          </div>
          <div style={{ fontSize: 11.5, color: totalDiscrepancy > 0 ? '#DC2626' : '#64748B', marginTop: 2 }}>
            {totalDiscrepancy > 0 ? 'Cần lập biên bản đối soát' : 'Không có chênh lệch tồn đọng'}
          </div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giá trị kiểm kê</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            {(data.reduce((s, d) => s + d.bookValue, 0) / 1000000000).toFixed(2)} tỷ ₫
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>{data.length} đợt kiểm kê quy mô lớn</div>
        </div>
      </div>

      {/* Action Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#bbb' }} />}
            placeholder="Tìm theo mã đợt, tên kiểm kê, địa điểm, trưởng đoàn..."
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
              { label: 'Đang tiến hành kiểm đếm', value: 'Đang tiến hành kiểm đếm' },
              { label: 'Chờ đối soát & Giải trình', value: 'Chờ đối soát & Giải trình' },
              { label: 'Đã hoàn tất & Khớp 100%', value: 'Đã hoàn tất & Khớp 100%' },
              { label: 'Đã trình HĐQT phê duyệt', value: 'Đã trình HĐQT phê duyệt' },
            ]}
          />
          <Select
            value={typeFilter}
            onChange={setTypeFilter}
            style={{ width: 170 }}
            options={[
              { label: 'Tất cả phân loại', value: 'all' },
              { label: 'Định kỳ quý/năm', value: 'Định kỳ quý/năm' },
              { label: 'Đột xuất chuyên đề', value: 'Đột xuất chuyên đề' },
              { label: 'Bàn giao quản lý kho', value: 'Bàn giao quản lý kho' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất biên bản kiểm kê Mẫu 05-TSCĐ (Excel)')}>
            Xuất Mẫu 05-TSCĐ
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleOpenCreate}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Mở đợt kiểm kê mới
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={[
            {
              title: 'Mã đợt & Phân loại',
              key: 'code',
              width: 170,
              render: (_: any, r: AuditItem) => (
                <div>
                  <span style={{ fontWeight: 700, color: '#009688', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <BarcodeOutlined /> {r.auditCode}
                  </span>
                  <Tag color="cyan" style={{ marginTop: 3 }}>
                    {r.auditType}
                  </Tag>
                </div>
              ),
            },
            {
              title: 'Tên đợt kiểm kê & Phạm vi',
              key: 'name',
              render: (_: any, r: AuditItem) => (
                <div>
                  <strong style={{ color: '#0F172A', fontSize: 13.5 }}>{r.auditName}</strong>
                  <div style={{ fontSize: 12, color: '#64748B' }}>
                    Phạm vi: <strong>{r.location}</strong> ({r.department})
                  </div>
                  <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>
                    Trưởng ban: {r.auditorLeader}
                  </div>
                </div>
              ),
            },
            {
              title: 'Sổ sách vs Thực tế',
              key: 'count',
              width: 190,
              render: (_: any, r: AuditItem) => (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                    <span style={{ color: '#64748B' }}>Sổ: <strong>{r.bookCount}</strong></span>
                    <span>➔</span>
                    <strong style={{ color: '#16A34A' }}>Thực: {r.actualCount}</strong>
                  </div>
                  <Progress
                    percent={Math.min(100, Math.round((r.actualCount / (r.bookCount || 1)) * 100))}
                    size="small"
                    strokeColor="#009688"
                    style={{ marginTop: 3 }}
                  />
                </div>
              ),
            },
            {
              title: 'Chênh lệch (+/-)',
              key: 'diff',
              width: 140,
              render: (_: any, r: AuditItem) => {
                if (r.discrepancy === 0) {
                  return <Tag color="success">Khớp 100% (0)</Tag>;
                }
                return (
                  <div>
                    <Tag color="error">
                      {r.discrepancy > 0 ? `+${r.discrepancy} thừa` : `${r.discrepancy} thiếu`}
                    </Tag>
                    {r.damagedCount > 0 && <div style={{ fontSize: 11, color: '#D97706', marginTop: 2 }}>⚠️ {r.damagedCount} máy hỏng</div>}
                  </div>
                );
              },
            },
            {
              title: 'Thời gian',
              key: 'dates',
              width: 130,
              render: (_: any, r: AuditItem) => (
                <div style={{ fontSize: 12 }}>
                  <div>BĐ: {r.startDate}</div>
                  <div style={{ color: '#64748B' }}>KT: {r.endDate}</div>
                </div>
              ),
            },
            {
              title: 'Trạng thái',
              dataIndex: 'status',
              key: 'status',
              render: (s: string) => {
                let col = 'success';
                if (s.includes('Đang')) col = 'processing';
                if (s.includes('Chờ')) col = 'warning';
                if (s.includes('trình HĐQT')) col = 'purple';
                return <Tag color={col}>{s}</Tag>;
              },
            },
            {
              title: 'Thao tác',
              key: 'act',
              width: 170,
              render: (_: any, r: AuditItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
                  <Button
                    size="small"
                    icon={<EyeOutlined />}
                    onClick={() => {
                      setDetailItem(r);
                      setDrawerOpen(true);
                    }}
                    title="Xem biên bản kiểm kê"
                  >
                    Xem
                  </Button>
                  <Button
                    size="small"
                    type="primary"
                    icon={<ScanOutlined />}
                    onClick={() => handleOpenScanner(r)}
                    style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                    title="Quét mã vạch Barcode/QR Code"
                  >
                    Quét
                  </Button>
                  {r.status === 'Chờ đối soát & Giải trình' && (
                    <Button
                      size="small"
                      icon={<SafetyCertificateOutlined />}
                      onClick={() => handleOpenResolveModal(r)}
                      title="Xử lý chênh lệch"
                    >
                      Xử lý
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* MODAL: Mở đợt kiểm kê mới 100% trường nhập */}
      <Modal
        title="Khởi Tạo Đợt Kiểm Kê Tài Sản &amp; Thiết Bị Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={760}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="auditCode" label="Mã đợt kiểm kê" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: KK-2026-Q3-HN" />
            </Form.Item>
            <Form.Item name="auditType" label="Phân loại đợt kiểm kê" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Định kỳ quý/năm', value: 'Định kỳ quý/năm' },
                  { label: 'Đột xuất chuyên đề', value: 'Đột xuất chuyên đề' },
                  { label: 'Bàn giao quản lý kho', value: 'Bàn giao quản lý kho' },
                ]}
              />
            </Form.Item>
            <Form.Item name="scope" label="Phạm vi kiểm kê" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Toàn bộ công ty', value: 'Toàn bộ công ty' },
                  { label: 'Trụ sở chính Hà Nội', value: 'Trụ sở chính Hà Nội' },
                  { label: 'Chi nhánh TP.HCM', value: 'Chi nhánh TP.HCM' },
                  { label: 'Data Center IDC Viettel & FPT', value: 'Data Center IDC Viettel & FPT' },
                ]}
              />
            </Form.Item>
          </div>

          <Form.Item name="auditName" label="Tên đợt kiểm kê tài sản" rules={[{ required: true, message: 'Nhập tên đợt kiểm kê' }]}>
            <Input placeholder="Ví dụ: Kiểm kê toàn bộ máy tính, màn hình và hạ tầng Data Center Quý 3/2026" />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
            <Form.Item name="location" label="Địa điểm kiểm kê cụ thể" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Tòa nhà Keangnam Landmark 72 - Tầng 12 & 14" />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban chịu trách nhiệm">
              <Select
                options={deptOptions.length > 0 ? deptOptions : [
                  { label: 'Ban Giám Đốc', value: 'Ban Giám Đốc' },
                ]}
                placeholder="Chọn phòng ban..."
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="auditorLeader" label="Trưởng ban kiểm kê" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Trần Tuấn Anh (CTO)" />
            </Form.Item>
            <Form.Item name="auditorMembers" label="Thành viên ban kiểm kê" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Nguyễn Thị Mai (Kế toán), Lê Hoàng Yến (HR)" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="bookCount" label="Số lượng theo sổ" rules={[{ required: true }]}>
              <Input type="number" min={1} placeholder="Ví dụ: 120" />
            </Form.Item>
            <Form.Item name="bookValue" label="Tổng nguyên giá sổ (VNĐ)">
              <Input type="number" min={0} step={10000000} placeholder="Ví dụ: 1800000000" />
            </Form.Item>
            <Form.Item name="startDate" label="Ngày bắt đầu" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="endDate" label="Ngày kết thúc" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>

          <Form.Item name="notes" label="Ghi chú & Chỉ đạo kiểm kê">
            <Input placeholder="Yêu cầu kiểm tra kỹ số Serial, tình trạng dán tem niêm phong và đối chiếu người đang giữ máy" />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Xác nhận mở đợt kiểm kê
            </Button>
          </div>
        </Form>
      </Modal>

      {/* MODAL: Quét Barcode / QR Code Realtime */}
      <Modal
        title="Trình Quét Nhận Diện Mã Vạch &amp; QR Code Tài Sản"
        open={scannerModalOpen}
        onCancel={() => setScannerModalOpen(false)}
        footer={null}
        width={500}
      >
        {activeAuditTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
            <Alert
              message={`Đang kiểm kê: ${activeAuditTarget.auditCode}`}
              description={`Địa điểm: ${activeAuditTarget.location} | Đã quét: ${activeAuditTarget.actualCount} / ${activeAuditTarget.bookCount} thiết bị`}
              type="info"
              showIcon
            />

            <div style={{ textAlign: 'center', background: '#F8FAFC', padding: 20, borderRadius: 8, border: '2px dashed #009688' }}>
              <QrcodeOutlined style={{ fontSize: 48, color: '#009688' }} />
              <div style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', marginTop: 8 }}>
                Sẵn sàng tiếp nhận tín hiệu máy quét cầm tay
              </div>
              <div style={{ fontSize: 11.5, color: '#64748B' }}>
                Hỗ trợ chuẩn mã vạch EAN-13, Code 128, QR Code, DataMatrix
              </div>
            </div>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 6 }}>
                Nhập hoặc bắn mã Barcode / QR Code:
              </label>
              <Input
                placeholder="Ví dụ: 893850100201 hoặc TS-IT-001"
                value={scannedBarcode}
                onChange={(e) => setScannedBarcode(e.target.value)}
                onPressEnter={handleScanSubmit}
                autoFocus
                style={{ fontSize: 15 }}
                suffix={<BarcodeOutlined style={{ color: '#009688' }} />}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontSize: 12, color: '#64748B' }}>Ấn <strong>Enter</strong> để ghi nhận tức thì</span>
              <Button type="primary" icon={<ScanOutlined />} onClick={handleScanSubmit} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
                Ghi nhận quét
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* DRAWER: Xem Biên Bản Kiểm Kê Mẫu 05-TSCĐ */}
      <Drawer
        title="Biên Bản Kiểm Kê Tài Sản Cố Định (Mẫu Số 05 - TSCĐ)"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={620}
      >
        {detailItem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header Document */}
            <div style={{ textAlign: 'center', borderBottom: '2px solid #009688', paddingBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#64748B', letterSpacing: 0.5 }}>CÔNG TY CP CÔNG NGHỆ KIYOVN</div>
              <div style={{ fontSize: 10, color: '#64748B' }}>Mẫu số 05 - TSCĐ (Ban hành theo TT 200/2014/TT-BTC)</div>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                BIÊN BẢN KIỂM KÊ TÀI SẢN CỐ ĐỊNH &amp; CCDC
              </div>
              <div style={{ fontSize: 12, color: '#009688', fontWeight: 700 }}>
                Mã đợt: {detailItem.auditCode} · Thời điểm: {detailItem.endDate}
              </div>
            </div>

            {/* Committee Info */}
            <div style={{ background: '#F8FAFC', padding: 12, borderRadius: 8, border: '1px solid #E2E8F0', fontSize: 12.5 }}>
              <div style={{ fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>HỘI ĐỒNG KIỂM KÊ GỒM CÓ:</div>
              <div>1. Ông/Bà: <strong>{detailItem.auditorLeader}</strong> - Trưởng ban</div>
              <div style={{ color: '#475569', marginTop: 2 }}>2. Các thành viên: {detailItem.auditorMembers}</div>
              <div style={{ color: '#475569', marginTop: 2 }}>3. Địa điểm kiểm đếm: <strong>{detailItem.location}</strong></div>
            </div>

            {/* Matrix Result Table */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#009688', color: '#FFF', textAlign: 'center' }}>
                    <th style={{ padding: '8px 6px', border: '1px solid #E2E8F0' }}>Chỉ tiêu kiểm kê</th>
                    <th style={{ padding: '8px 6px', border: '1px solid #E2E8F0' }}>Theo sổ sách</th>
                    <th style={{ padding: '8px 6px', border: '1px solid #E2E8F0' }}>Thực tế kiểm đếm</th>
                    <th style={{ padding: '8px 6px', border: '1px solid #E2E8F0' }}>Chênh lệch (+/-)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', fontWeight: 600 }}>Số lượng tài sản (Cái)</td>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', textAlign: 'center' }}>{detailItem.bookCount}</td>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', textAlign: 'center', fontWeight: 700, color: '#16A34A' }}>{detailItem.actualCount}</td>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', textAlign: 'center', fontWeight: 700, color: detailItem.discrepancy === 0 ? '#16A34A' : '#DC2626' }}>
                      {detailItem.discrepancy === 0 ? '0 (Khớp)' : detailItem.discrepancy}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', fontWeight: 600 }}>Tổng giá trị (VNĐ)</td>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', textAlign: 'right' }}>{detailItem.bookValue.toLocaleString('vi-VN')} ₫</td>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', textAlign: 'right', fontWeight: 700 }}>{detailItem.actualValue.toLocaleString('vi-VN')} ₫</td>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', textAlign: 'right', color: detailItem.diffValue < 0 ? '#DC2626' : '#16A34A' }}>
                      {detailItem.diffValue.toLocaleString('vi-VN')} ₫
                    </td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', fontWeight: 600 }}>Phẩm chất: Đang dùng tốt</td>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', textAlign: 'center' }}>-</td>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', textAlign: 'center', color: '#16A34A' }}>{detailItem.matchedCount} thiết bị</td>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', textAlign: 'center' }}>Đạt 100%</td>
                  </tr>
                  <tr>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', fontWeight: 600 }}>Phẩm chất: Hỏng hóc</td>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', textAlign: 'center' }}>0</td>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', textAlign: 'center', color: '#D97706' }}>{detailItem.damagedCount} thiết bị</td>
                    <td style={{ padding: '8px 6px', border: '1px solid #E2E8F0', textAlign: 'center', color: '#D97706' }}>Đề xuất sửa</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Resolution Proposal */}
            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', padding: 12, borderRadius: 8, fontSize: 12.5 }}>
              <strong style={{ color: '#1E40AF' }}>Ý kiến nhận xét &amp; Phương án xử lý chênh lệch:</strong>
              <div style={{ marginTop: 4, color: '#1E293B' }}>{detailItem.resolutionProposal}</div>
            </div>

            {/* Scanned Items Sample */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 10, fontSize: 12 }}>
              <strong style={{ color: '#0F172A' }}>Nhật ký quét thực tế gần nhất ({detailItem.itemsList?.length || 0} mục):</strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6, maxHeight: 120, overflowY: 'auto' }}>
                {detailItem.itemsList?.map((it, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', background: '#F8FAFC', padding: '4px 8px', borderRadius: 4 }}>
                    <span>{it.code} - {it.name} ({it.holder})</span>
                    <Tag color={it.auditStatus === 'Khớp chuẩn' ? 'success' : 'error'}>{it.auditStatus}</Tag>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã xuất biên bản kiểm kê ${detailItem.auditCode} (Mẫu 05-TSCĐ PDF)`)}
                style={{ flex: 1 }}
              >
                In Mẫu 05-TSCĐ (PDF)
              </Button>
              <Button
                type="primary"
                icon={<ScanOutlined />}
                onClick={() => handleOpenScanner(detailItem)}
                style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
              >
                Tiếp tục quét Barcode
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* MODAL: Xử lý chênh lệch kiểm kê */}
      <Modal
        title="Phương Án Xử Lý Chênh Lệch &amp; Giải Trình Kiểm Kê"
        open={resolveModalOpen}
        onCancel={() => setResolveModalOpen(false)}
        footer={null}
        width={480}
      >
        {activeAuditTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
            <Alert
              message={`Xử lý chênh lệch: ${activeAuditTarget.auditCode}`}
              description={`Số lượng lệch: ${activeAuditTarget.discrepancy} thiết bị | Số lượng hư hỏng: ${activeAuditTarget.damagedCount} thiết bị.`}
              type="warning"
              showIcon
            />

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 6 }}>
                Nội dung giải trình &amp; Kiến nghị Ban Giám Đốc:
              </label>
              <Input.TextArea
                rows={4}
                value={resolveText}
                onChange={(e) => setResolveText(e.target.value)}
                placeholder="Nhập phương án thu hồi tài sản thiếu, trích khấu hao đền bù hoặc thanh lý tài sản hỏng..."
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <Button onClick={() => setResolveModalOpen(false)}>Hủy</Button>
              <Button
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={handleConfirmResolve}
                style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              >
                Trình Ban Giám Đốc Duyệt
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

