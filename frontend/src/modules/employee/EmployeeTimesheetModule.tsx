import React, { useState, useEffect } from 'react';
import {
  ClockCircleOutlined,
  CheckCircleOutlined,
  LogoutOutlined,
  CalendarOutlined,
  DownloadOutlined,
  EnvironmentOutlined,
  FormOutlined,
  EyeOutlined,
  SearchOutlined,
  PrinterOutlined,
  SafetyCertificateOutlined,
  InfoCircleOutlined,
  WarningOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer } from '../../custom-ui';
import { dataService } from '../../services/dataService';

export const EmployeeTimesheetModule: React.FC = () => {
  const [data, setData] = useState<any[]>([]);
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString('vi-VN'));
  const [filterTab, setFilterTab] = useState<'all' | 'ontime' | 'late' | 'ot'>('all');
  const [searchText, setSearchText] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [form] = Form.useForm();

  const loadData = () => {
    setData(dataService.getEmployeeTimesheets());
  };

  useEffect(() => {
    loadData();
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('vi-VN'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCheckin = () => {
    dataService.addEmployeeCheckin('in');
    message.success('Check-in chấm công vào ca thành công (Vị trí: Keangnam Landmark 72)!');
    loadData();
  };

  const handleCheckout = () => {
    dataService.addEmployeeCheckin('out');
    message.success('Check-out chấm công ra ca thành công!');
    loadData();
  };

  const handleExplain = (values: any) => {
    message.success(`Đã gửi đơn giải trình chấm công ngày ${values.date} thành công!`);
    setModalOpen(false);
    form.resetFields();
  };

  const filteredData = data.filter((item) => {
    let matchTab = true;
    if (filterTab === 'ontime') matchTab = (item.status || '').includes('Đúng giờ');
    else if (filterTab === 'late') matchTab = (item.status || '').includes('Đi muộn') || (item.status || '').includes('Chưa quẹt');
    else if (filterTab === 'ot') matchTab = (item.duration || '').includes('OT') || (item.note || '').toLowerCase().includes('ot');

    const matchSearch =
      (item.date || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.status || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (item.note || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const columns = [
    {
      title: 'Ngày làm việc',
      dataIndex: 'date',
      key: 'date',
      render: (d: string) => <span style={{ fontWeight: 600, color: '#212121' }}>{d}</span>,
    },
    {
      title: 'Giờ vào (Check-in)',
      dataIndex: 'checkIn',
      key: 'checkIn',
      render: (t: string) => (
        <span style={{ color: t !== 'Chưa quẹt' ? '#2E7D32' : '#D32F2F', fontWeight: 600 }}>
          {t}
        </span>
      ),
    },
    {
      title: 'Giờ ra (Check-out)',
      dataIndex: 'checkOut',
      key: 'checkOut',
      render: (t: string) => (
        <span style={{ color: t !== 'Chưa quẹt' ? '#1565C0' : '#757575', fontWeight: 600 }}>
          {t}
        </span>
      ),
    },
    {
      title: 'Thời lượng làm việc',
      dataIndex: 'duration',
      key: 'duration',
      render: (d: string) => <span style={{ fontWeight: 600, color: '#0F172A' }}>{d}</span>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const isGood = status.includes('Đúng giờ');
        return (
          <Tag color={isGood ? 'success' : 'warning'}>
            {status}
          </Tag>
        );
      },
    },
    {
      title: 'Ghi chú / Ca làm',
      dataIndex: 'note',
      key: 'note',
      render: (n: string) => <span style={{ color: '#64748B', fontSize: 12.5 }}>{n}</span>,
    },
    {
      title: 'Thao tác',
      key: 'action',
      width: 100,
      render: (_: any, record: any) => (
        <Button
          size="small"
          icon={<EyeOutlined />}
          onClick={() => {
            setSelectedRecord(record);
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
      {/* Real-time Check-in Clock Action Bar */}
      <div
        style={{
          background: '#FFFFFF',
          border: '1px solid #E0E0E0',
          borderRadius: 8,
          padding: '16px 10px',
          marginBottom: 16,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: '#E0F2F1',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#009688',
              fontSize: 20,
            }}
          >
            <ClockCircleOutlined />
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#212121' }}>{currentTime}</div>
            <div style={{ fontSize: 12, color: '#757575', display: 'flex', alignItems: 'center', gap: 4 }}>
              <EnvironmentOutlined style={{ color: '#009688' }} /> Địa điểm: Trụ sở Keangnam Landmark 72 (Geofence Verified)
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button
            type="primary"
            icon={<CheckCircleOutlined />}
            onClick={handleCheckin}
            style={{ backgroundColor: '#009688', borderColor: '#009688' }}
          >
            Check-in Vào ca
          </Button>
          <Button
            icon={<LogoutOutlined />}
            onClick={handleCheckout}
            style={{ borderColor: '#1565C0', color: '#1565C0' }}
          >
            Check-out Ra ca
          </Button>
          <Button
            icon={<FormOutlined />}
            onClick={() => {
              form.setFieldsValue({ date: new Date().toISOString().substring(0, 10), reason: 'Quên quẹt thẻ vào ca' });
              setModalOpen(true);
            }}
          >
            Giải trình công
          </Button>
          <Button icon={<PrinterOutlined />} onClick={() => message.success('Đã in phiếu chấm công tháng (A4)')}>
            In Phiếu (A4)
          </Button>
          <Button icon={<DownloadOutlined />} onClick={() => message.success('Đã xuất bảng chấm công cá nhân ra Excel')}>
            Xuất Excel
          </Button>
        </div>
      </div>

      {/* 4 KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 16 }}>
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: '#757575', fontWeight: 500 }}>Số ngày làm việc thực tế</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#009688', marginTop: 4 }}>
            {data.length} / 22 ngày
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Đạt tiến độ công tháng</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: '#757575', fontWeight: 500 }}>Tỷ lệ đi làm đúng giờ</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#2E7D32', marginTop: 4 }}>
            98.5%
          </div>
          <div style={{ fontSize: 11.5, color: '#2E7D32', marginTop: 2 }}>Tuân thủ nội quy xuất sắc</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: '#757575', fontWeight: 500 }}>Giờ làm thêm OT lũy kế</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#1565C0', marginTop: 4 }}>
            7.5 Giờ
          </div>
          <div style={{ fontSize: 11.5, color: '#1565C0', marginTop: 2 }}>Hệ số lương OT 150% - 200%</div>
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12, color: '#757575', fontWeight: 500 }}>Định mức công tiêu chuẩn</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: '#7C3AED', marginTop: 4 }}>
            22 Công
          </div>
          <div style={{ fontSize: 11.5, color: '#7C3AED', marginTop: 2 }}>Nghỉ thứ 7 &amp; Chủ nhật</div>
        </div>
      </div>

      {/* Sub-tabs and Search Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả các ca' },
            { key: 'ontime', label: 'Đúng giờ', icon: <CheckCircleOutlined style={{ color: '#10B981' }} /> },
            { key: 'late', label: 'Muộn / Chưa quẹt', icon: <WarningOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'ot', label: 'Có giờ OT', icon: <ThunderboltOutlined style={{ color: '#F59E0B' }} /> },
          ].map((tab) => (
            <Button icon={tab.icon}
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

        <div style={{ display: 'flex', gap: 8 }}>
          <Input
            prefix={<SearchOutlined style={{ color: '#94A3B8' }} />}
            placeholder="Tìm theo ngày, trạng thái..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 220 }}
            allowClear
          />
        </div>
      </div>

      {/* History Table */}
      <div className="transparent-table-card" style={{ width: '100%' }}>
        <KTable
          dataSource={filteredData}
          columns={columns}
          rowKey="key"
          pagination={{ pageSize: 10 }}
        />
      </div>

      {/* DRAWER: Chi tiết chấm công ngày */}
      <Drawer
        title="Nhật Ký Chấm Công &amp; Dữ Liệu Quẹt Thẻ"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={460}
      >
        {selectedRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 14, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#0F172A' }}>Ngày: {selectedRecord.date}</div>
              <div style={{ fontSize: 13, color: '#64748B', marginTop: 4 }}>
                Trạng thái: <Tag color={selectedRecord.status.includes('Đúng giờ') ? 'success' : 'warning'}>{selectedRecord.status}</Tag>
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontWeight: 600, color: '#0F172A', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                <SafetyCertificateOutlined style={{ color: '#009688' }} /> Dữ liệu quẹt thẻ thực tế
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: '#F1F5F9', padding: 10, borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#64748B' }}>Giờ vào (Check-in)</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#16A34A', marginTop: 2 }}>{selectedRecord.checkIn}</div>
                </div>
                <div style={{ background: '#F1F5F9', padding: 10, borderRadius: 6 }}>
                  <div style={{ fontSize: 11, color: '#64748B' }}>Giờ ra (Check-out)</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1E40AF', marginTop: 2 }}>{selectedRecord.checkOut}</div>
                </div>
              </div>
              <div style={{ marginTop: 12, fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div><ClockCircleOutlined style={{ color: '#0284C7', marginRight: 6 }} />Tổng thời lượng: <strong>{selectedRecord.duration}</strong></div>
                <div><EnvironmentOutlined style={{ color: '#EF4444', marginRight: 6 }} />Máy quẹt thẻ: <strong>Máy khuôn mặt Tầng 18 Keangnam</strong></div>
                <div><GlobalOutlined style={{ color: '#16A34A', marginRight: 6 }} />Xác thực Geofence: <strong style={{ color: '#16A34A' }}>Hợp lệ (Bán kính 25m)</strong></div>
                <div><EditOutlined style={{ color: '#6366F1', marginRight: 6 }} />Ghi chú ca: <strong>{selectedRecord.note}</strong></div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <Button
                type="primary"
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => {
                  setDrawerOpen(false);
                  form.setFieldsValue({ date: selectedRecord.date, reason: 'Quên quẹt thẻ' });
                  setModalOpen(true);
                }}
              >
                Gửi giải trình ngày này
              </Button>
              <Button style={{ flex: 1 }} onClick={() => message.success(`Đã sao chép log quẹt thẻ ngày ${selectedRecord.date}`)}>
                Sao chép Log
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Modal Giải trình chấm công */}
      <Modal
        title="Gửi Đơn Giải Trình Chấm Công / Bổ Sung Giờ Quẹt Thẻ"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        okText="Gửi đơn giải trình"
        cancelText="Hủy"
      >
        <Form form={form} layout="vertical" onFinish={handleExplain}>
          <Form.Item name="date" label="Ngày làm việc cần giải trình" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="reason" label="Lý do giải trình" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Quên quẹt thẻ vào ca', value: 'Quên quẹt thẻ vào ca' },
                { label: 'Quên quẹt thẻ ra ca', value: 'Quên quẹt thẻ ra ca' },
                { label: 'Máy chấm công bảo trì / lỗi kết nối', value: 'Máy chấm công lỗi' },
                { label: 'Đi công tác ngoài hiện trường', value: 'Công tác ngoài hiện trường' },
                { label: 'Lý do khác', value: 'Lý do khác' },
              ]}
            />
          </Form.Item>
          <Form.Item name="note" label="Ghi chú chi tiết & Minh chứng">
            <Input.TextArea rows={3} placeholder="Mô tả cụ thể thời gian vào/ra thực tế, người xác nhận..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

