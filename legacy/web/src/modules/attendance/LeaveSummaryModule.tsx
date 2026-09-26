import { dataService } from '../../services/dataService';
import React, { useEffect, useState } from 'react';
import {
  PlusOutlined,
  SearchOutlined,
  DownloadOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  EyeOutlined,
  EditOutlined,
  DollarOutlined,
  PieChartOutlined,
  UserOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip, Progress } from '../../custom-ui';

export interface EnterpriseLeaveSummaryItem {
  key: string;
  employeeCode: string;
  employeeName: string;
  position: string;
  department: string;
  standardQuota: number;
  seniorityQuota: number;
  carriedOver: number;
  totalEntitled: number;
  usedLeaves: number;
  remainingLeaves: number;
  leaveUsagePct: number;
  status: 'Còn nhiều phép' | 'Sắp hết phép' | 'Đã hết phép';
}

const INITIAL_LEAVES_SUMMARY: EnterpriseLeaveSummaryItem[] = [];

export const LeaveSummaryModule: React.FC = () => {
  const [data, setData] = useState<EnterpriseLeaveSummaryItem[]>(INITIAL_LEAVES_SUMMARY);
  const [departmentOptions, setDepartmentOptions] = useState<{ label: string; value: string }[]>([]);

  useEffect(() => {
    const list = dataService.getGenericData('attendance_leave_summary');
    setData(Array.isArray(list) ? list : []);
    dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    const unsub = dataService.subscribe(() => {
      const updated = dataService.getGenericData('attendance_leave_summary');
      setData(Array.isArray(updated) ? updated : []);
      dataService.fetchOrgUnitsList().then((units) => setDepartmentOptions(units.map((u) => ({ label: u, value: u }))));
    });
    return unsub;
  }, []);

  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedSummary, setSelectedSummary] = useState<EnterpriseLeaveSummaryItem | null>(null);

  const totalEntitledAll = data.reduce((sum, item) => sum + item.totalEntitled, 0);
  const totalUsed = data.reduce((sum, item) => sum + item.usedLeaves, 0);
  const totalRemaining = data.reduce((sum, item) => sum + item.remainingLeaves, 0);

  const handleCreate = (values: any) => {
    const std = Number(values.standardQuota) || 12;
    const sen = Number(values.seniorityQuota) || 0;
    const car = Number(values.carriedOver) || 0;
    const used = Number(values.usedLeaves) || 0;
    const total = std + sen + car;
    const rem = Math.max(0, total - used);
    const pct = Math.round((used / total) * 100);

    let st: 'Còn nhiều phép' | 'Sắp hết phép' | 'Đã hết phép' = 'Còn nhiều phép';
    if (rem === 0) st = 'Đã hết phép';
    else if (rem <= 3) st = 'Sắp hết phép';

    const newItem: EnterpriseLeaveSummaryItem = {
      ...values,
      key: String(Date.now()),
      standardQuota: std,
      seniorityQuota: sen,
      carriedOver: car,
      totalEntitled: total,
      usedLeaves: used,
      remainingLeaves: rem,
      leaveUsagePct: pct,
      status: st,
    };
    const nextItems = [newItem, ...data]; setData(nextItems); dataService.saveGenericData('attendance_leave_summary', nextItems);
    message.success(`Đã cập nhật quỹ phép năm cho: ${values.employeeName}`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    const matchStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchSearch =
      (item.employeeCode || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.employeeName || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.department || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.position || '').toLowerCase().includes(searchText.toLowerCase());

    return matchStatus && matchSearch;
  });

  const columns = [
    {
      title: 'Mã & Họ tên nhân sự',
      key: 'employeeName',
      render: (_: any, record: EnterpriseLeaveSummaryItem) => (
        <div>
          <div style={{ fontWeight: 700, color: '#0F172A', fontSize: 13.5 }}>{record.employeeName}</div>
          <div style={{ fontSize: 11.5, color: '#009688', fontWeight: 600, marginTop: 2 }}>
            Mã: <code>{record.employeeCode}</code> · {record.position}
          </div>
        </div>
      ),
    },
    {
      title: 'Khối phòng ban',
      dataIndex: 'department',
      key: 'department',
      width: 200,
      render: (dept: string) => <span style={{ color: '#475569', fontSize: 12.5 }}>{dept}</span>,
    },
    {
      title: 'Phép chuẩn + Thâm niên',
      key: 'quota',
      width: 180,
      render: (_: any, record: EnterpriseLeaveSummaryItem) => (
        <div style={{ fontSize: 12 }}>
          <strong>{record.standardQuota}</strong> ngày chuẩn + <span style={{ color: '#009688', fontWeight: 600 }}>{record.seniorityQuota} ngày thâm niên</span>
        </div>
      ),
    },
    {
      title: 'Chuyển từ năm trước',
      dataIndex: 'carriedOver',
      key: 'carriedOver',
      width: 150,
      render: (d: number) => <span style={{ color: '#64748B', fontWeight: 600 }}>+{d} ngày tồn cũ</span>,
    },
    {
      title: 'Tổng quỹ phép',
      dataIndex: 'totalEntitled',
      key: 'totalEntitled',
      width: 140,
      render: (d: number) => <span style={{ fontWeight: 800, color: '#2563EB', fontSize: 13.5 }}>{d} ngày</span>,
    },
    {
      title: 'Đã nghỉ / Tỷ lệ',
      key: 'used',
      width: 150,
      render: (_: any, record: EnterpriseLeaveSummaryItem) => (
        <div>
          <span style={{ fontWeight: 700, color: '#DC2626' }}>{record.usedLeaves} ngày</span>
          <div style={{ fontSize: 11, color: '#64748B' }}>Đã dùng {record.leaveUsagePct}%</div>
        </div>
      ),
    },
    {
      title: 'Phép còn lại khả dụng',
      dataIndex: 'remainingLeaves',
      key: 'remainingLeaves',
      width: 160,
      render: (d: number, record: EnterpriseLeaveSummaryItem) => (
        <div>
          <div style={{ fontWeight: 800, color: d > 3 ? '#16A34A' : '#D97706', fontSize: 14 }}>
            {d} Ngày phép
          </div>
          <Tag color={d > 3 ? 'success' : d > 0 ? 'warning' : 'error'}>{record.status}</Tag>
        </div>
      ),
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: EnterpriseLeaveSummaryItem) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedSummary(record);
            setDrawerOpen(true);
          }}
        >
          Sổ phép
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng quỹ phép năm toàn công ty</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalEntitledAll} Ngày phép
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Bao gồm 12 ngày chuẩn + Phép thâm niên</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Đã sử dụng nghỉ trong năm</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            {totalUsed} Ngày phép ({Math.round((totalUsed / totalEntitledAll) * 100)}%)
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Được hạch toán chi trả 100% lương đầy đủ</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Quỹ phép khả dụng còn lại</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {totalRemaining} Ngày phép
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Có thể sử dụng đến hết 31/12/2026</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Chính sách phép thâm niên</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#2563EB', marginTop: 4 }}>
            +1 Ngày / 5 Năm
          </div>
          <div style={{ fontSize: 11.5, color: '#2563EB', marginTop: 2 }}>Tự động cộng dồn theo thâm niên cống hiến</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả nhân sự' },
            { key: 'Còn nhiều phép', label: 'Còn nhiều phép (>3)', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'Sắp hết phép', label: 'Sắp hết phép (≤3)', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'Đã hết phép', label: 'Đã hết phép (0)', icon: <CloseCircleOutlined style={{ color: '#EF4444' }} /> },
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
            placeholder="Tìm theo mã NV, họ tên, phòng ban..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 280 }}
            allowClear
          />

          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất báo cáo tổng hợp quỹ phép năm')}>
            Xuất Báo Cáo
          </Button>

          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              form.setFieldsValue({
                employeeCode: `KY-0${data.length + 10}`,
                department: 'Phòng Ban Kỹ Thuật',
                standardQuota: 12,
                seniorityQuota: 0,
                carriedOver: 0,
                usedLeaves: 0,
              });
              setModalOpen(true);
            }}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Điều chỉnh quỹ phép
          </Button>
        </div>
      </div>

      {/* Main Table */}
      <div className="transparent-table-card">
        <KTable dataSource={filteredData} columns={columns} pagination={{ pageSize: 8 }} />
      </div>

      {/* MODAL: Điều chỉnh quỹ phép */}
      <Modal
        title="Điều Chỉnh Hạn Mức Quỹ Phép Năm &amp; Thâm Niên"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={640}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeCode" label="Mã nhân viên" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="department" label="Phòng ban trực thuộc" rules={[{ required: true, message: 'Vui lòng chọn phòng ban' }]}>
              <Select
                placeholder="Chọn phòng ban trực thuộc..."
                options={departmentOptions}
              />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="employeeName" label="Họ tên nhân sự" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Hoàng Văn Thắng" />
            </Form.Item>
            <Form.Item name="position" label="Chức danh" rules={[{ required: true }]}>
              <Input placeholder="Ví dụ: Senior DevOps" />
            </Form.Item>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Form.Item name="standardQuota" label="Phép chuẩn năm" rules={[{ required: true }]}>
              <Input type="number" min={12} max={18} />
            </Form.Item>
            <Form.Item name="seniorityQuota" label="Phép thâm niên">
              <Input type="number" min={0} max={5} />
            </Form.Item>
            <Form.Item name="carriedOver" label="Tồn năm trước">
              <Input type="number" min={0} max={10} />
            </Form.Item>
          </div>

          <Form.Item name="usedLeaves" label="Số ngày phép đã sử dụng trong năm">
            <Input type="number" min={0} max={25} />
          </Form.Item>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Lưu &amp; Cập nhật quỹ phép
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Sổ Theo Dõi Quỹ Phép Cá Nhân */}
      <Drawer
        title="Sổ Theo Dõi Quỹ Phép Năm &amp; Lịch Sử Nghỉ Phép"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={580}
      >
        {selectedSummary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>{selectedSummary.employeeCode}</div>
                  <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                    {selectedSummary.employeeName}
                  </div>
                </div>
                <Tag color={selectedSummary.remainingLeaves > 3 ? 'success' : 'warning'}>
                  {selectedSummary.status}
                </Tag>
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                {selectedSummary.position} · {selectedSummary.department}
              </div>
            </div>

            {/* Leave Balance Overview */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Cơ Cấu Hạn Mức Phép Năm 2026:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12.5 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Phép năm theo luật quy định:</span>
                  <strong>{selectedSummary.standardQuota} Ngày</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Cộng thưởng phép thâm niên:</span>
                  <strong style={{ color: '#009688' }}>+{selectedSummary.seniorityQuota} Ngày</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Phép năm 2025 chuyển tiếp:</span>
                  <strong style={{ color: '#2563EB' }}>+{selectedSummary.carriedOver} Ngày</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #E2E8F0', paddingTop: 6 }}>
                  <span style={{ color: '#0F172A', fontWeight: 700 }}>Tổng quỹ phép được hưởng:</span>
                  <strong style={{ color: '#2563EB', fontSize: 13.5 }}>{selectedSummary.totalEntitled} Ngày phép</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#DC2626' }}>Đã nghỉ phép trong năm:</span>
                  <strong style={{ color: '#DC2626' }}>- {selectedSummary.usedLeaves} Ngày ({selectedSummary.leaveUsagePct}%)</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', background: '#F0FDF4', padding: '8px 10px', borderRadius: 6 }}>
                  <span style={{ color: '#166534', fontWeight: 700 }}>Quỹ phép còn lại khả dụng:</span>
                  <strong style={{ color: '#16A34A', fontSize: 15 }}>{selectedSummary.remainingLeaves} Ngày phép</strong>
                </div>
              </div>
            </div>

            {/* Compensation Policy */}
            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14, background: '#F8FAFC' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 6 }}>
                Chính Sách Thanh Toán Phép Tồn Cuối Năm:
              </div>
              <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.6 }}>
                Theo Quy chế nội bộ KIYO, trường hợp đến 31/12/2026 nhân sự không sử dụng hết phép năm sẽ được chi trả bằng tiền mặt theo công thức: <code>(Lương đóng BHXH / 22) × Số ngày phép còn lại</code> vào kỳ lương Tháng 01/2027.
              </div>
            </div>

            <Button
              type="primary"
              style={{ backgroundColor: '#009688', borderColor: '#009688' }}
              onClick={() => {
                message.success(`Đã in sổ theo dõi phép năm cho ${selectedSummary.employeeName}`);
                setDrawerOpen(false);
              }}
            >
              In Sổ Phép Năm Cá Nhân (PDF)
            </Button>
          </div>
        )}
      </Drawer>
    </div>
  );
};

