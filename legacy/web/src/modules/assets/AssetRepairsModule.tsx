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
  severity: 'Khẩn cấp (P1)' | 'Cao (P2)' | 'Trung bình (P3)' | 'Thấp (P4)';
  repairUnit: 'Nội bộ IT Cty' | 'Trung tâm bảo hành chính hãng' | 'Đơn vị dịch vụ ngoài (3rd Party)';
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
import { collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';

export const AssetRepairsModule: React.FC = () => {
  const [data, setData] = useState<RepairItem[]>([]);
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
  const [actualCostInput, setActualCostInput] = useState<number>(0);
  const [completeNotes, setCompleteNotes] = useState('Đã kiểm tra kỹ thuật test 24h, thiết bị hoạt động hoàn hảo, nghiệm thu đạt chuẩn.');

  const [form] = Form.useForm();

  const loadData = async () => {
    try {
      const [res, orgUnits] = await Promise.all([
        collectionsApi.get<RepairItem>('asset_repairs', { limit: 500 }),
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
  const totalRepairs = data.length;
  const totalActualSpend = data.reduce((sum, item) => sum + (item.actualCost || 0), 0);
  const inProgressCount = data.filter((d) => d.status === 'Đang sửa chữa tại hãng' || d.status === 'Chờ linh kiện thay thế').length;
  const pendingQuoteCount = data.filter((d) => d.status === 'Chờ duyệt báo giá').length;
  const fixedCount = data.filter((d) => d.status === 'Đã sửa xong & Bàn giao').length;

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      repairCode: `SC-2026-0${data.length + 18}`,
      severity: 'Cao (P2)',
      repairUnit: 'Trung tâm bảo hành chính hãng',
      vendor: 'Trung Tâm Dịch Vụ Ủy Quyền',
      costBearing: 'Công ty chi trả',
      startDate: new Date().toISOString().substring(0, 10),
      expectedEndDate: new Date(Date.now() + 7 * 86400000).toISOString().substring(0, 10),
      estimatedCost: 2000000,
      department: 'Phòng Ban Kỹ Thuật',
      warrantyAfterRepair: '6 tháng bảo hành linh kiện',
      approver: 'Trần Tuấn Anh (CTO)',
    });
    setModalOpen(true);
  };

  const handleCreate = async (values: any) => {
    const id = `repair-${Date.now()}`;
    const newItem: RepairItem = {
      ...values,
      key: id,
      estimatedCost: Number(values.estimatedCost) || 0,
      actualCost: 0,
      status: 'Chờ duyệt báo giá',
    };
    try {
      await collectionsApi.create('asset_repairs', newItem, id);
      message.success(`Đã lập phiếu báo hỏng sửa chữa: ${values.repairCode} cho tài sản ${values.assetName}`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tạo phiếu sửa chữa.');
    }
  };

  const handleApproveQuote = async (record: RepairItem) => {
    const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
    try {
      await collectionsApi.update('asset_repairs', record.key, {
        status: 'Đang sửa chữa tại hãng',
        approvedAt: nowStr,
      });
      message.success(`Đã phê duyệt báo giá sửa chữa ${record.repairCode} số tiền ${record.estimatedCost.toLocaleString('vi-VN')} ₫`);
      await loadData();
    } catch {
      message.error('Không thể duyệt báo giá.');
    }
  };

  const handleOpenCompleteModal = (record: RepairItem) => {
    setCompleteTarget(record);
    setActualCostInput(record.estimatedCost || 0);
    setCompleteNotes('Đã kiểm tra kỹ thuật test 24h, thiết bị hoạt động hoàn hảo, nghiệm thu đạt chuẩn bàn giao.');
    setCompleteModalOpen(true);
  };

  const handleConfirmComplete = async () => {
    if (completeTarget) {
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
      try {
        await collectionsApi.update('asset_repairs', completeTarget.key, {
          status: 'Đã sửa xong & Bàn giao',
          actualCost: actualCostInput,
          completedDate: nowStr,
          notes: `${completeTarget.notes || ''} [Nghiệm thu: ${completeNotes}]`,
        });
        message.success(`Đã nghiệm thu sửa chữa và bàn giao lại tài sản ${completeTarget.assetCode} cho nhân sự!`);
        setCompleteModalOpen(false);
        await loadData();
      } catch {
        message.error('Không thể nghiệm thu sửa chữa.');
      }
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

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* KPI Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: 16 }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chi phí sửa chữa đã thanh toán</div>
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
            100% đạt chuẩn SLA
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Khắc phục triệt để lỗi kỹ thuật</div>
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
              { label: 'Đã sửa xong & Bàn giao', value: 'Đã sửa xong & Bàn giao' },
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
              { label: 'Thấp (P4)', value: 'Thấp (P4)' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo chi phí sửa chữa tài sản (Excel)')}>
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
                  <div style={{ fontSize: 12, color: '#64748B' }}>Dự toán: {r.estimatedCost.toLocaleString('vi-VN')} ₫</div>
                  <strong style={{ color: '#16A34A', fontSize: 13 }}>
                    Thực tế: {r.actualCost > 0 ? `${r.actualCost.toLocaleString('vi-VN')} ₫` : '0 ₫ (Bảo hành)'}
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
              width: 160,
              render: (_: any, r: RepairItem) => (
                <div style={{ display: 'flex', gap: 6 }}>
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
                      onClick={() => handleOpenCompleteModal(r)}
                      style={{ backgroundColor: '#16A34A', borderColor: '#16A34A' }}
                      title="Nghiệm thu & bàn giao"
                    >
                      Nghiệm thu
                    </Button>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="repairCode" label="Mã phiếu sửa" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: SC-2026-020" />
            </Form.Item>
            <Form.Item name="severity" label="Mức độ nghiêm trọng" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Khẩn cấp (P1) - Dừng hệ thống', value: 'Khẩn cấp (P1)' },
                  { label: 'Cao (P2) - Ảnh hưởng lớn', value: 'Cao (P2)' },
                  { label: 'Trung bình (P3) - Lỗi cục bộ', value: 'Trung bình (P3)' },
                  { label: 'Thấp (P4) - Sự cố nhỏ', value: 'Thấp (P4)' },
                ]}
              />
            </Form.Item>
            <Form.Item name="repairUnit" label="Hình thức sửa chữa" rules={[{ required: true }]}>
              <Select
                options={[
                  { label: 'Trung tâm bảo hành chính hãng', value: 'Trung tâm bảo hành chính hãng' },
                  { label: 'Nội bộ IT Cty khắc phục', value: 'Nội bộ IT Cty' },
                  { label: 'Đơn vị dịch vụ ngoài (3rd Party)', value: 'Đơn vị dịch vụ ngoài (3rd Party)' },
                ]}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 12 }}>
            <Form.Item name="assetCode" label="Mã tài sản" rules={[{ required: true, message: 'Nhập mã TS' }]}>
              <Input placeholder="Ví dụ: TS-IT-002" />
            </Form.Item>
            <Form.Item name="assetName" label="Tên tài sản cần sửa" rules={[{ required: true, message: 'Nhập tên tài sản' }]}>
              <Input placeholder="Ví dụ: Laptop Dell Precision 5680" />
            </Form.Item>
            <Form.Item name="serialNo" label="Số Serial / Tag" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: 8H7K2X3" />
            </Form.Item>
          </div>

          <Form.Item name="issueDescription" label="Mô tả hiện tượng hư hỏng / Sự cố chi tiết" rules={[{ required: true, message: 'Nhập mô tả lỗi' }]}>
            <Input.TextArea rows={2} placeholder="Mô tả cụ thể: sọc màn hình, máy không lên nguồn, liệt phím, pin phồng..." />
          </Form.Item>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="rootCause" label="Nguyên nhân sơ bộ">
              <Input placeholder="Ví dụ: Chai pin theo thời gian, va đập hoặc ẩm mạch..." />
            </Form.Item>
            <Form.Item name="solution" label="Phương án khắc phục dự kiến">
              <Input placeholder="Ví dụ: Thay Pin Zin, Ép cáp màn hình, Thay bàn phím..." />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', gap: 12 }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr 1fr', gap: 12 }}>
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

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="requester" label="Người báo hỏng" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Hoàng Quốc Dũng" />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban" rules={[{ required: true }]}>
              <Select
                options={deptOptions.length > 0 ? deptOptions : [
                  { label: 'Ban Giám Đốc', value: 'Ban Giám Đốc' },
                ]}
                placeholder="Chọn phòng ban..."
              />
            </Form.Item>
            <Form.Item name="approver" label="Cán bộ duyệt chi" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Trần Tuấn Anh (CTO)" />
            </Form.Item>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy bỏ</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
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
                  <div style={{ fontWeight: 700, color: '#0F172A' }}>{detailItem.estimatedCost.toLocaleString('vi-VN')} ₫</div>
                </div>
                <div>
                  <span style={{ color: '#64748B' }}>Thực tế thanh toán:</span>
                  <div style={{ fontWeight: 700, color: '#16A34A' }}>{detailItem.actualCost.toLocaleString('vi-VN')} ₫</div>
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
                onClick={() => message.success(`Đã xuất phiếu sửa chữa ${detailItem.repairCode} (PDF)`)}
                style={{ flex: 1 }}
              >
                In phiếu sửa (PDF)
              </Button>
              {detailItem.status === 'Chờ duyệt báo giá' && (
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={() => handleApproveQuote(detailItem)}
                  style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
                >
                  Duyệt báo giá
                </Button>
              )}
              {detailItem.status === 'Đang sửa chữa tại hãng' && (
                <Button
                  type="primary"
                  icon={<SafetyCertificateOutlined />}
                  onClick={() => handleOpenCompleteModal(detailItem)}
                  style={{ backgroundColor: '#16A34A', borderColor: '#16A34A', flex: 1 }}
                >
                  Nghiệm thu bàn giao
                </Button>
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
              message="Xác nhận hoàn thành sửa chữa"
              description={`Xác nhận tài sản "${completeTarget.assetName}" (Mã: ${completeTarget.assetCode}) đã được đơn vị "${completeTarget.vendor}" sửa chữa xong và kiểm thử hoạt động bình thường.`}
              type="success"
              showIcon
            />

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 6 }}>
                Chi phí thực tế thanh toán quyết toán (VNĐ):
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
                * Dự toán ban đầu: {completeTarget.estimatedCost.toLocaleString('vi-VN')} ₫ (Nhập 0 đ nếu bảo hành miễn phí)
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

