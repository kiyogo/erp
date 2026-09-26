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
  status: 'Đã bàn giao hoàn tất' | 'Chờ nhân viên ký xác nhận' | 'Đã thu hồi về kho' | 'Chờ thẩm định đền bù';
  notes: string;
}

import { useEffect } from 'react';
import { collectionsApi } from '../../api/endpoints';
import { dataService } from '../../services/dataService';

export const AssetAllocationModule: React.FC = () => {
  const [data, setData] = useState<AllocationItem[]>([]);
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
  const [pinInput, setPinInput] = useState('');

  const [form] = Form.useForm();

  const loadData = async () => {
    try {
      const [res, orgUnits, positions] = await Promise.all([
        collectionsApi.get<AllocationItem>('asset_allocations', { limit: 500 }),
        dataService.fetchOrgUnitsList(),
        dataService.fetchDropdownOptions('positions'),
      ]);
      const list = res.data?.data || [];
      setData(list.map((item: any) => ({ ...item, key: item.id || item.key })));
      setDeptOptions(orgUnits.map((u) => ({ label: u, value: u })));
      setPosOptions(positions.filter((p) => p.isActive !== false).map((p) => ({ label: p.name, value: p.name })));
    } catch {
      setData([]);
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

  const handleOpenCreate = () => {
    form.resetFields();
    form.setFieldsValue({
      ticketCode: `CP-2026-0${data.length + 85}`,
      type: 'Cấp phát',
      allocatedDate: new Date().toISOString().substring(0, 10),
      expectedReturnDate: 'Vô thời hạn (Theo HĐLĐ)',
      purpose: 'Cấp phát chính thức cho nhân viên mới',
      condition: 'Mới 100%, hoạt động ổn định',
      accessories: 'Củ sạc chính hãng, Dây nguồn, Cặp/Balo bảo vệ',
      handoverPerson: 'Lê Hoàng Yến (HR Manager)',
      department: 'Phòng Ban Kỹ Thuật',
      compensationAmount: 0,
    });
    setModalOpen(true);
  };

  const handleCreate = async (values: any) => {
    const isAllocate = values.type === 'Cấp phát';
    const id = `alloc-${Date.now()}`;
    const newItem: AllocationItem = {
      ...values,
      key: id,
      compensationAmount: Number(values.compensationAmount) || 0,
      signedByReceiver: !isAllocate,
      status: isAllocate ? 'Chờ nhân viên ký xác nhận' : 'Đã thu hồi về kho',
    };
    try {
      await collectionsApi.create('asset_allocations', newItem, id);
      message.success(`Đã lập biên bản ${values.type}: ${values.ticketCode} cho ${values.employeeName}`);
      setModalOpen(false);
      form.resetFields();
      await loadData();
    } catch (error: any) {
      message.error(error?.response?.data?.message || 'Không thể tạo biên bản cấp phát.');
    }
  };

  const handleOpenSignModal = (record: AllocationItem) => {
    setSignTarget(record);
    setPinInput('');
    setSignModalOpen(true);
  };

  const handleConfirmSign = async () => {
    if (!pinInput || pinInput.length < 4) {
      message.error('Vui lòng nhập mã PIN xác thực chữ ký số (tối thiểu 4 số)');
      return;
    }

    if (signTarget) {
      const nowStr = new Date().toISOString().replace('T', ' ').substring(0, 16);
      try {
        await collectionsApi.update('asset_allocations', signTarget.key, {
          signedByReceiver: true,
          signedAt: nowStr,
          status: 'Đã bàn giao hoàn tất',
        });
        message.success(`Xác thực ký số thành công! Biên bản ${signTarget.ticketCode} đã có hiệu lực.`);
        setSignModalOpen(false);
        await loadData();
      } catch {
        message.error('Không thể xác nhận chữ ký số.');
      }
    }
  };

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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chờ ký nhận điện tử</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#D97706', marginTop: 4 }}>
            {pendingSignCount} phiếu chờ ký
          </div>
          <div style={{ fontSize: 11.5, color: '#D97706', marginTop: 2 }}>
            {pendingSignCount > 0 ? 'Cần nhắc nhân sự ký xác nhận' : 'Tất cả đã hoàn tất ký nhận'}
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
              { label: 'Chờ nhân viên ký xác nhận', value: 'Chờ nhân viên ký xác nhận' },
              { label: 'Đã thu hồi về kho', value: 'Đã thu hồi về kho' },
            ]}
          />
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất sổ theo dõi cấp phát tài sản (Excel)')}>
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
              title: 'Trạng thái & Chữ ký',
              key: 'status',
              render: (_: any, r: AllocationItem) => {
                let col = 'success';
                if (r.status.includes('Chờ')) col = 'warning';
                if (r.status.includes('thu hồi')) col = 'processing';
                return (
                  <div>
                    <Tag color={col}>{r.status}</Tag>
                    <div style={{ fontSize: 11, color: r.signedByReceiver ? '#16A34A' : '#D97706', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                      {r.signedByReceiver ? <CheckCircleOutlined /> : <ClockCircleOutlined />}
                      {r.signedByReceiver ? `Đã ký (${r.signedAt})` : 'Chưa ký số'}
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
                  {!r.signedByReceiver && (
                    <Button
                      size="small"
                      type="primary"
                      icon={<SafetyCertificateOutlined />}
                      onClick={() => handleOpenSignModal(r)}
                      style={{ backgroundColor: '#009688', borderColor: '#009688' }}
                      title="Ký nhận bàn giao điện tử"
                    >
                      Ký số
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
            <Form.Item name="assetCode" label="Mã tài sản" rules={[{ required: true, message: 'Nhập mã TS' }]}>
              <Input placeholder="Ví dụ: TS-IT-005" />
            </Form.Item>
            <Form.Item name="assetName" label="Tên tài sản / Thiết bị" rules={[{ required: true, message: 'Nhập tên tài sản' }]}>
              <Input placeholder="Ví dụ: Laptop Dell Precision 5680" />
            </Form.Item>
            <Form.Item name="serialNo" label="Số Serial / Service Tag" rules={[{ required: true, message: 'Nhập số Serial' }]}>
              <Input placeholder="Ví dụ: 8H7K2X3" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Nhân viên nhận / bàn giao" rules={[{ required: true, message: 'Nhập tên nhân viên' }]}>
              <Input placeholder="Ví dụ: Nguyễn Văn Minh" />
            </Form.Item>
            <Form.Item name="position" label="Chức vụ" initialValue="Chuyên Viên">
              {posOptions.length > 0 ? (
                <Select options={posOptions} placeholder="Chọn chức vụ..." />
              ) : (
                <Input placeholder="Ví dụ: Senior DevOps" />
              )}
            </Form.Item>
            <Form.Item name="department" label="Phòng ban" rules={[{ required: true }]}>
              <Select
                options={deptOptions.length > 0 ? deptOptions : [
                  { label: 'Ban Giám Đốc', value: 'Ban Giám Đốc' },
                ]}
                placeholder="Chọn phòng ban..."
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="handoverPerson" label="Cán bộ bàn giao (HR/IT)" rules={[{ required: true }]}>
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
            <Form.Item name="compensationAmount" label="Số tiền bồi thường (nếu có lỗi hư hỏng)" initialValue={0}>
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
                <strong style={{ color: '#009688' }}>BÊN GIAO (ĐẠI DIỆN CTY):</strong>
                <div style={{ marginTop: 4 }}>Ông/Bà: <strong>{detailItem.handoverPerson}</strong></div>
                <div style={{ color: '#64748B' }}>Đơn vị: Phòng Nhân Sự &amp; IT</div>
              </div>
              <div>
                <strong style={{ color: '#2563EB' }}>BÊN NHẬN (CÁN BỘ SỬ DỤNG):</strong>
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
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748B' }}>ĐẠI DIỆN BÊN GIAO</div>
                <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#16A34A', fontWeight: 700, fontSize: 13 }}>
                  <CheckCircleOutlined /> ĐÃ KÝ DUYỆT
                </div>
                <div style={{ fontWeight: 700, fontSize: 12 }}>{detailItem.handoverPerson}</div>
              </div>

              <div style={{ border: '1px solid #CBD5E1', borderRadius: 8, padding: 12, textAlign: 'center', background: '#FAFAFA' }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, color: '#64748B' }}>NGƯỜI NHẬN TÀI SẢN</div>
                <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {detailItem.signedByReceiver ? (
                    <div style={{ color: '#009688', fontWeight: 700, fontSize: 12 }}>
                      <SafetyCertificateOutlined style={{ fontSize: 18 }} />
                      <div>ĐÃ KÝ SỐ ĐIỆN TỬ</div>
                      <div style={{ fontSize: 9.5, color: '#64748B' }}>{detailItem.signedAt}</div>
                    </div>
                  ) : (
                    <span style={{ color: '#D97706', fontSize: 12, fontWeight: 600 }}>Chờ ký xác nhận...</span>
                  )}
                </div>
                <div style={{ fontWeight: 700, fontSize: 12 }}>{detailItem.employeeName}</div>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <Button
                icon={<PrinterOutlined />}
                onClick={() => message.success(`Đã xuất biên bản ${detailItem.ticketCode} (PDF)`)}
                style={{ flex: 1 }}
              >
                In biên bản (PDF)
              </Button>
              {!detailItem.signedByReceiver && (
                <Button
                  type="primary"
                  icon={<SafetyCertificateOutlined />}
                  onClick={() => handleOpenSignModal(detailItem)}
                  style={{ backgroundColor: '#009688', borderColor: '#009688', flex: 1 }}
                >
                  Ký nhận ngay
                </Button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      {/* MODAL: Ký nhận điện tử biên bản bàn giao */}
      <Modal
        title="Xác Thực Ký Nhận Điện Tử Bàn Giao Thiết Bị"
        open={signModalOpen}
        onCancel={() => setSignModalOpen(false)}
        footer={null}
        width={440}
      >
        {signTarget && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 10 }}>
            <Alert
              message="Xác nhận nhận tài sản"
              description={`Bạn đang xác nhận đã tiếp nhận thiết bị "${signTarget.assetName}" (Mã: ${signTarget.assetCode}) với đầy đủ phụ kiện đi kèm theo biên bản ${signTarget.ticketCode}.`}
              type="info"
              showIcon
            />

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#0F172A', display: 'block', marginBottom: 6 }}>
                Nhập mã PIN cá nhân để ký số biên bản:
              </label>
              <Input.Password
                placeholder="Nhập mã PIN (Ví dụ: 123456)"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
                maxLength={6}
                style={{ fontSize: 16, letterSpacing: 2 }}
              />
              <span style={{ fontSize: 11.5, color: '#64748B', marginTop: 4, display: 'block' }}>
                * Chữ ký điện tử có giá trị pháp lý tương đương chữ ký tay theo Luật Giao dịch điện tử.
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
                Xác nhận ký số
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

