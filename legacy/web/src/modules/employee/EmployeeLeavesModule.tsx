import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  DownloadOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  SearchOutlined,
  PrinterOutlined,
  EyeOutlined,
  FileDoneOutlined,
  UserOutlined,
  ReloadOutlined,
  SmileOutlined,
  MedicineBoxOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';
import { dataService } from '../../services/dataService';

export const EmployeeLeavesModule: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'annual' | 'sick' | 'pending'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedLeave, setSelectedLeave] = useState<any | null>(null);
  const [form] = Form.useForm();

  const loadData = () => {
    setData(dataService.getEmployeeLeaves());
  };

  useEffect(() => {
    loadData();
    const unsub = dataService.subscribe(() => {
      loadData();
    });
    return unsub;
  }, []);

  const handleCreate = (values: any) => {
    let empName = 'Nhân sự';
    let empCode = 'KY-001';
    let empDept = 'Phòng Kỹ Thuật';
    try {
      const rawUser = localStorage.getItem('minepanel_user');
      if (rawUser) {
        const parsed = JSON.parse(rawUser);
        empName = parsed.fullName || parsed.name || empName;
        empCode = parsed.code || parsed.employeeCode || empCode;
        empDept = parsed.department || empDept;
      }
    } catch {}

    dataService.addEmployeeLeave({
      ...values,
      employeeName: empName,
      empCode,
      department: empDept,
      days: Number(values.days) || 1,
      approver: 'Ban Lãnh Đạo',
    });
    message.success('Đã gửi đơn xin nghỉ phép thành công! Vui lòng chờ phê duyệt.');
    setModalOpen(false);
    form.resetFields();
    loadData();
  };

  const usedDays = data
    .filter((d) => d.status === 'Đã duyệt' || d.status === 'Đã phê duyệt')
    .reduce((acc, d) => acc + (Number(d.days) || Number(d.daysCount) || 0), 0);
  const totalQuota = 12;
  const remainingDays = Math.max(0, totalQuota - usedDays);
  const pendingCount = data.filter((d) => d.status === 'Đang xử lý' || d.status === 'Chờ duyệt' || d.status === 'Chờ phê duyệt').length;

  const filteredData = data.filter((d) => {
    const lType = (d.type || d.leaveType || '').toLowerCase();
    let matchTab = true;
    if (filterTab === 'annual') {
      matchTab = lType.includes('phép năm');
    } else if (filterTab === 'sick') {
      matchTab = lType.includes('ốm');
    } else if (filterTab === 'pending') {
      matchTab = d.status === 'Đang xử lý' || d.status === 'Chờ duyệt' || d.status === 'Chờ phê duyệt';
    }

    const matchSearch =
      lType.includes(searchText.toLowerCase()) ||
      (d.reason || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (d.code || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const columns = [
    {
      title: 'Mã đơn nghỉ',
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (c: string) => (
        <span style={{ fontWeight: 700, color: '#009688', fontFamily: 'monospace' }}>
          {c}
        </span>
      ),
    },
    {
      title: 'Loại nghỉ phép',
      key: 'type',
      render: (_: any, record: any) => (
        <span style={{ fontWeight: 600, color: '#0F172A', fontSize: 13.5 }}>
          {record.type || record.leaveType || 'Nghỉ phép năm'}
        </span>
      ),
    },
    {
      title: 'Thời gian nghỉ',
      key: 'period',
      width: 210,
      render: (_: any, record: any) => (
        <span style={{ color: '#64748B', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <CalendarOutlined style={{ color: '#009688' }} /> {record.fromDate || record.startDate} ➔ {record.toDate || record.endDate}
        </span>
      ),
    },
    {
      title: 'Số ngày',
      key: 'days',
      width: 110,
      render: (_: any, record: any) => (
        <span style={{ fontWeight: 700, color: '#009688', fontSize: 13.5 }}>
          {record.days || record.daysCount || 1} ngày
        </span>
      ),
    },
    {
      title: 'Lý do xin nghỉ',
      dataIndex: 'reason',
      key: 'reason',
      render: (r: string) => <span style={{ color: '#475569', fontSize: 12.5 }}>{r}</span>,
    },
    {
      title: 'Người duyệt',
      dataIndex: 'approver',
      key: 'approver',
      width: 170,
      render: (a: string) => <span style={{ color: '#1E40AF', fontWeight: 500, fontSize: 12.5 }}>{a || 'Ban Lãnh Đạo'}</span>,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 130,
      render: (_: any, record: any) => {
        const status = record.status || 'Chờ duyệt';
        let tagColor: any = 'warning';
        if (status === 'Đã duyệt' || status === 'Đã phê duyệt') tagColor = 'success';
        if (status === 'Từ chối') tagColor = 'error';
        return <Tag color={tagColor}>{status}</Tag>;
      },
    },
    {
      title: 'Thao tác',
      key: 'actions',
      width: 110,
      render: (_: any, record: any) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedLeave(record);
            setDrawerOpen(true);
          }}
        >
          Chi tiết
        </Button>
      ),
    },
  ];

  return (
    <div style={{ padding: '16px 10px', width: '100%', boxSizing: 'border-box' }}>
      {/* 4 KPI Metric Cards Top Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng quỹ phép năm 2026</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalQuota} Ngày
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Phép hưởng nguyên lương tiêu chuẩn</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Số ngày phép đã sử dụng</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#EA580C', marginTop: 4 }}>
            {usedDays} Ngày
          </div>
          <div style={{ fontSize: 11.5, color: '#EA580C', marginTop: 2 }}>Đã được Ban Giám Đốc phê duyệt</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Số ngày phép còn lại</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#16A34A', marginTop: 4 }}>
            {remainingDays} Ngày
          </div>
          <div style={{ fontSize: 11.5, color: '#16A34A', marginTop: 2 }}>Khả dụng xin nghỉ trước 31/12/2026</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hồ sơ chờ phê duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#7C3AED', marginTop: 4 }}>
            {pendingCount} Đơn
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Xử lý trong vòng 24 giờ làm việc</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả đơn xin nghỉ' },
            { key: 'annual', label: 'Nghỉ phép năm', icon: <SmileOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'sick', label: 'Nghỉ ốm BHXH', icon: <MedicineBoxOutlined style={{ color: '#EF4444' }} /> },
            { key: 'pending', label: 'Đang chờ duyệt', icon: <ClockCircleOutlined style={{ color: '#F59E0B' }} /> },
          ].map((tab) => (
            <Button
              key={tab.key}
              size="small"
              onClick={() => setFilterTab(tab.key as any)}
              style={{
                backgroundColor: filterTab === tab.key ? '#E0F2F1' : '#FFFFFF',
                borderColor: filterTab === tab.key ? '#009688' : '#CBD5E1',
                color: filterTab === tab.key ? '#00796B' : '#475569',
                fontWeight: filterTab === tab.key ? 700 : 500,
              }}
            >
              {tab.label}
            </Button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo loại phép, lý do..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />

          <Button icon={<ReloadOutlined />} onClick={loadData}>
            Làm mới
          </Button>

          <Button
            icon={<PrinterOutlined />}
            onClick={() => message.success('Đã in lịch sử nghỉ phép cá nhân (A4)')}
          >
            In Lịch Sử (A4)
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
            Tạo đơn xin nghỉ
          </Button>
        </div>
      </div>

      {/* Leaves History Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={columns}
          rowKey="key"
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* Create Leave Modal */}
      <Modal
        title="Tạo Đơn Xin Nghỉ Phép Mới"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={540}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <Form.Item name="type" label="Loại nghỉ phép" rules={[{ required: true, message: 'Vui lòng chọn loại nghỉ phép' }]}>
            <Select
              options={[
                { label: 'Nghỉ phép năm hưởng nguyên lương', value: 'Nghỉ phép năm' },
                { label: 'Nghỉ ốm đau có giấy chứng nhận y tế', value: 'Nghỉ ốm BHXH' },
                { label: 'Nghỉ việc riêng hưởng nguyên lương (Hiếu, Hỷ)', value: 'Nghỉ việc riêng có lương' },
                { label: 'Nghỉ không hưởng lương', value: 'Nghỉ không lương' },
                { label: 'Nghỉ chế độ thai sản / Khám thai', value: 'Nghỉ thai sản' },
              ]}
            />
          </Form.Item>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Form.Item name="fromDate" label="Từ ngày" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item name="toDate" label="Đến ngày" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item name="days" label="Số ngày nghỉ" rules={[{ required: true }]}>
            <Input type="number" min="0.5" step="0.5" placeholder="Ví dụ: 1 hoặc 2" />
          </Form.Item>
          <Form.Item name="reason" label="Lý do xin nghỉ" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="Mô tả ngắn gọn lý do xin nghỉ..." />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Gửi đơn phê duyệt
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi tiết đơn xin nghỉ */}
      <Drawer
        title="Chi Tiết Đơn Nghỉ Phép"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
      >
        {selectedLeave && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ ĐƠN: {selectedLeave.code}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                {selectedLeave.type}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Thời gian: <strong>{selectedLeave.fromDate} ➔ {selectedLeave.toDate}</strong> ({selectedLeave.days} ngày)
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Tin Phê Duyệt &amp; Quản Lý:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Người phê duyệt:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedLeave.approver}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Trạng thái:</span>
                  <Tag color={selectedLeave.status === 'Đã duyệt' ? 'success' : 'warning'}>
                    {selectedLeave.status || 'Chờ duyệt'}
                  </Tag>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Lý do cụ thể:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedLeave.reason}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => message.success(`Đang in đơn xin nghỉ phép ${selectedLeave.code} ra bản giấy A4...`)}
              >
                In Đơn Nghỉ Phép (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
