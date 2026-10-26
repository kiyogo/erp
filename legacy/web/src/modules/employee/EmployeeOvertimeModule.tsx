import React, { useState, useEffect } from 'react';
import {
  PlusOutlined,
  DownloadOutlined,
  ThunderboltOutlined,
  SearchOutlined,
  PrinterOutlined,
  EyeOutlined,
  DollarOutlined,
  CalendarOutlined,
  ReloadOutlined,
  ClockCircleOutlined,
  TrophyOutlined,
} from '@ant-design/icons';
import { KTable } from '../../components/KTable';
import { Modal, Form, Input, Select, Button, message, Tag, Drawer, Card, Tooltip } from '../../custom-ui';
import { dataService } from '../../services/dataService';
import { useAuth } from '../../context/AuthContext';
import { downloadFile, generateValidPdfBlob } from '../../utils/fileExporter';
import { attendanceNumber, dateRangeDays, timeRangeDetails } from '../attendance/attendanceRules';

export const EmployeeOvertimeModule: React.FC = () => {
  const { user } = useAuth();
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState<any[]>([]);
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'weekday' | 'weekend' | 'holiday'>('all');

  const [modalOpen, setModalOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedOT, setSelectedOT] = useState<any | null>(null);
  const [form] = Form.useForm();

  const loadData = () => {
    setData(dataService.getEmployeeOvertime().filter((item) => item.employeeId === user?.id || (!!user?.employeeCode && (item.empCode === user.employeeCode || item.employeeCode === user.employeeCode))));
  };

  useEffect(() => {
    void dataService.refreshGenericData('attendance_overtime').catch(() => message.error('Không thể tải đăng ký làm thêm từ máy chủ.'));
    loadData();
    const unsub = dataService.subscribe(() => {
      loadData();
    });
    return unsub;
  }, [user?.id]);

  const handleCreate = async (values: any) => {
    if (saving) return;
    setSaving(true);
    try {
      dateRangeDays(values.date, values.date);
      const hours = attendanceNumber(values.hours, 'Số giờ làm thêm', 0.5, 12);
      if (Math.abs(timeRangeDetails(values.timeRange).hours - hours) > 0.001) throw new Error('Số giờ làm thêm phải khớp với khung giờ đăng ký.');
      await dataService.addEmployeeOvertime({ ...values, employeeId: user?.id, hours, requestedMultiplier: Number(values.multiplier), baseHourlyRate: 0 });
      message.success('Đã đăng ký làm thêm giờ (OT) thành công! Vui lòng chờ phê duyệt.');
      setModalOpen(false); form.resetFields();
    } catch (error: any) { message.error(error?.response?.data?.message || error.message || 'Không thể gửi đăng ký làm thêm giờ.'); }
    finally { setSaving(false); }
  };

  const totalHours = data
    .filter((d) => d.status === 'Đã duyệt' || d.status === 'Đã duyệt OT')
    .reduce((acc, d) => acc + Number(d.hours ?? d.totalHours ?? 0), 0);

  const displayedMultiplier = (record: any) => ['Đã duyệt', 'Đã duyệt OT'].includes(record.status) ? record.multiplier : record.requestedMultiplier ?? record.multiplier;

  const filteredData = data.filter((d) => {
    let matchTab = true;
    if (filterTab === 'weekday') {
      matchTab = (displayedMultiplier(d) || '').toString().includes('150') || displayedMultiplier(d) === 1.5;
    } else if (filterTab === 'weekend') {
      matchTab = (displayedMultiplier(d) || '').toString().includes('200') || displayedMultiplier(d) === 2.0;
    } else if (filterTab === 'holiday') {
      matchTab = (displayedMultiplier(d) || '').toString().includes('300') || displayedMultiplier(d) === 3.0;
    }

    const matchSearch =
      (d.code || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (d.reason || '').toLowerCase().includes(searchText.toLowerCase()) ||
      (d.project || '').toLowerCase().includes(searchText.toLowerCase());

    return matchTab && matchSearch;
  });

  const columns = [
    {
      title: 'Mã đăng ký',
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
      title: 'Ngày làm thêm',
      key: 'date',
      width: 130,
      render: (_: any, record: any) => <span style={{ fontWeight: 600, color: '#0F172A' }}>{record.date || record.otDate}</span>,
    },
    {
      title: 'Khung giờ & Số tiếng',
      key: 'time',
      width: 200,
      render: (_: any, record: any) => (
        <span style={{ color: '#64748B', fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 }}>
          <CalendarOutlined style={{ color: '#009688' }} />
          {record.timeRange ? record.timeRange : `${record.fromTime || '18:00'} ➔ ${record.toTime || '21:30'}`} (<strong>{record.hours || record.totalHours || 0}h</strong>)
        </span>
      ),
    },
    {
      title: 'Hệ số tính lương',
      key: 'multiplier',
      width: 170,
      render: (_: any, record: any) => {
        const multiplier = displayedMultiplier(record);
        const mult = multiplier ? (typeof multiplier === 'number' ? `${multiplier * 100}%` : multiplier) : 'Chưa xác định';
        return (
          <Tag color={mult.includes('300') ? 'red' : mult.includes('200') ? 'orange' : 'blue'}>
            {mult}
          </Tag>
        );
      },
    },
    {
      title: 'Dự án / Hạng mục',
      dataIndex: 'project',
      key: 'project',
      render: (p: string) => <span style={{ fontWeight: 600, color: '#1E40AF', fontSize: 13 }}>{p || 'Dự án trọng điểm'}</span>,
    },
    {
      title: 'Lý do & Nội dung OT',
      dataIndex: 'reason',
      key: 'reason',
      render: (r: string) => <span style={{ color: '#475569', fontSize: 12.5 }}>{r}</span>,
    },
    {
      title: 'Người duyệt',
      dataIndex: 'approver',
      key: 'approver',
      width: 160,
      render: (a: string) => <span style={{ color: '#009688', fontWeight: 500, fontSize: 12.5 }}>{a || 'Ban Lãnh Đạo'}</span>,
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 140,
      render: (_: any, record: any) => {
        const status = record.status || 'Chờ duyệt';
        const isApproved = status === 'Đã duyệt' || status === 'Đã duyệt OT';
        const isRejected = status === 'Từ chối';
        return (
          <Tag color={isApproved ? 'success' : isRejected ? 'error' : 'warning'}>
            {isApproved ? 'Đã duyệt OT' : isRejected ? 'Từ chối' : 'Chờ phê duyệt'}
          </Tag>
        );
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
            setSelectedOT(record);
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
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Tổng giờ OT đã được phê duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#009688', marginTop: 4 }}>
            {totalHours} Giờ
          </div>
          <div style={{ fontSize: 11.5, color: '#009688', marginTop: 2 }}>Số giờ được lãnh đạo phê duyệt trên hệ thống</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hệ số làm thêm ngày thường</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#1E40AF', marginTop: 4 }}>
            150% (x1.5)
          </div>
          <div style={{ fontSize: 11.5, color: '#1E40AF', marginTop: 2 }}>Áp dụng ngoài giờ hành chính</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hệ số ngày nghỉ cuối tuần</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#EA580C', marginTop: 4 }}>
            200% (x2.0)
          </div>
          <div style={{ fontSize: 11.5, color: '#EA580C', marginTop: 2 }}>Thứ Bảy &amp; Chủ Nhật theo phê duyệt</div>
        </div>

        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 8, padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: '#64748B', fontWeight: 500 }}>Hệ số ngày Lễ, Tết hưởng lương</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#DC2626', marginTop: 4 }}>
            300% (x3.0)
          </div>
          <div style={{ fontSize: 11.5, color: '#DC2626', marginTop: 2 }}>Phụ cấp đặc thù ca trực hệ thống</div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { key: 'all', label: 'Tất cả đăng ký' },
            { key: 'weekday', label: 'Ngày thường (150%)', icon: <ClockCircleOutlined style={{ color: '#6366F1' }} /> },
            { key: 'weekend', label: 'Cuối tuần (200%)', icon: <ThunderboltOutlined style={{ color: '#F59E0B' }} /> },
            { key: 'holiday', label: 'Ngày Lễ Tết (300%)', icon: <TrophyOutlined style={{ color: '#F59E0B' }} /> },
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
            placeholder="Tìm theo mã đăng ký, dự án, lý do..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 260 }}
            allowClear
          />

          <Button icon={<ReloadOutlined />} onClick={() => dataService.refreshGenericData('attendance_overtime').catch(() => message.error('Không thể tải lại đăng ký làm thêm.'))}>
            Làm mới
          </Button>

          <Button
            icon={<PrinterOutlined />}
            onClick={() => downloadFile('Lich_su_OT.pdf', generateValidPdfBlob('Lịch sử làm thêm giờ', user?.name || '', filteredData.map((item) => `${item.code}: ${item.date || item.otDate}, ${item.timeRange}, ${item.hours ?? item.totalHours} giờ, ${item.status}; ${item.reason}`)))}
          >
            In Phiếu OT (A4)
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
            Đăng ký làm thêm (OT)
          </Button>
        </div>
      </div>

      {/* OT History Table */}
      <div className="transparent-table-card">
        <KTable
          dataSource={filteredData}
          columns={columns}
          rowKey="key"
          pagination={{ pageSize: 8 }}
        />
      </div>

      {/* Create Modal */}
      <Modal
        title="Đăng Ký Làm Thêm Giờ (Overtime - OT)"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        footer={null}
        width={540}
      >
        <Form form={form} layout="vertical" onFinish={handleCreate} style={{ marginTop: 14 }}>
          <Form.Item name="date" label="Ngày làm thêm giờ" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
          <Form.Item name="timeRange" label="Khung giờ làm thêm (HH:mm - HH:mm)" rules={[{ required: true }]}><Input placeholder="18:00 - 20:00" /></Form.Item>
          <Form.Item name="hours" label="Số giờ làm thêm dự kiến (tiếng)" rules={[{ required: true }]}>
            <Input type="number" min="0.5" step="0.5" placeholder="Ví dụ: 2.5 hoặc 4" />
          </Form.Item>
          <Form.Item name="multiplier" label="Loại ngày làm thêm & Hệ số tính lương" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Làm thêm ngày thường (150% lương)', value: 1.5 },
                { label: 'Làm thêm ngày nghỉ hàng tuần / Thứ 7 & CN (200% lương)', value: 2 },
                { label: 'Làm thêm ngày Lễ, Tết có hưởng lương (300% lương)', value: 3 },
              ]}
            />
          </Form.Item>
          <Form.Item name="project" label="Dự án / Hạng mục phát triển" rules={[{ required: true }]}>
            <Input placeholder="Ví dụ: Triển khai Core Banking Q3/2026..." />
          </Form.Item>
          <Form.Item name="reason" label="Nội dung công việc & Mục tiêu OT" rules={[{ required: true }]}>
            <Input.TextArea rows={3} placeholder="Mô tả công việc cần xử lý gấp trong ca OT..." />
          </Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
            <Button onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button type="primary" htmlType="submit" loading={saving} style={{ backgroundColor: '#009688', borderColor: '#009688' }}>
              Gửi đăng ký OT
            </Button>
          </div>
        </Form>
      </Modal>

      {/* DRAWER: Chi tiết làm thêm giờ */}
      <Drawer
        title="Chi Tiết Ca Làm Thêm Giờ (OT)"
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={520}
      >
        {selectedOT && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#F8FAFC', padding: 16, borderRadius: 8, border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: 13, color: '#009688', fontWeight: 800 }}>MÃ PHIẾU: {selectedOT.code}</div>
              <div style={{ fontSize: 17, fontWeight: 800, color: '#0F172A', marginTop: 4 }}>
                Dự án: {selectedOT.project}
              </div>
              <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                Thời gian: <strong>{selectedOT.date || selectedOT.otDate}</strong> · Số giờ: <strong>{selectedOT.hours ?? selectedOT.totalHours} giờ</strong> (Hệ số đề nghị / phê duyệt: {displayedMultiplier(selectedOT)})
              </div>
            </div>

            <div style={{ border: '1px solid #E2E8F0', borderRadius: 8, padding: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 10 }}>
                Thông Tin Phê Duyệt &amp; Thù Lao:
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Người duyệt ca:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedOT.approver}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Trạng thái:</span>
                  <Tag color={selectedOT.status === 'Đã duyệt' ? 'success' : 'warning'}>
                    {selectedOT.status || 'Chờ duyệt'}
                  </Tag>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#64748B' }}>Nội dung chi tiết:</span>
                  <span style={{ fontWeight: 600, color: '#0F172A' }}>{selectedOT.reason}</span>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <Button
                type="primary"
                icon={<PrinterOutlined />}
                style={{ flex: 1, backgroundColor: '#009688', borderColor: '#009688' }}
                onClick={() => downloadFile(`Dang_ky_OT_${selectedOT.code}.pdf`, generateValidPdfBlob('Đăng ký làm thêm giờ', `${user?.name || ''} - ${selectedOT.code}`, [`Ngày OT: ${selectedOT.date || selectedOT.otDate}`, `Khung giờ: ${selectedOT.timeRange}`, `Số giờ: ${selectedOT.hours ?? selectedOT.totalHours}`, `Hệ số: ${selectedOT.multiplier}`, `Dự án: ${selectedOT.project}`, `Lý do: ${selectedOT.reason}`, `Trạng thái: ${selectedOT.status}`]))}
              >
                In Phiếu OT (A4)
              </Button>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
};
